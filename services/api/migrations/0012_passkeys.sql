-- 3.5단계: 패스키(WebAuthn) 로그인 — 코드를 서버에서 받지 않고 얼굴 · 지문으로 들어와요.
-- 열쇠는 공개 열쇠만 둬요(비밀 열쇠는 사용자의 기기 · 키체인에 있어요). 앱 역할은 표를 직접 읽지 못하고 좁은 문으로만 다녀요.

CREATE TABLE front.passkeys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell         uuid NOT NULL REFERENCES catchup.cells,
  credential   bytea NOT NULL UNIQUE CHECK (length(credential) BETWEEN 1 AND 1023),
  public_key   bytea NOT NULL CHECK (length(public_key) = 65),   -- P-256 점(04 || x || y)
  sign_count   bigint NOT NULL DEFAULT 0,
  label        text NOT NULL CHECK (length(label) <= 120),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX passkeys_cell ON front.passkeys (cell);

-- 서버가 낸 물음. 한 번만, 5분 안에. 지문(hash)만 둬요
CREATE TABLE front.passkey_challenges (
  hash       bytea PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('register', 'login')),
  cell       uuid REFERENCES catchup.cells,   -- 등록은 그 칸의 것만
  expires_at timestamptz NOT NULL,
  CHECK ((kind = 'register') = (cell IS NOT NULL))
);
CREATE INDEX passkey_challenges_expiry ON front.passkey_challenges (expires_at);

CREATE FUNCTION front.passkey_ask(p_hash bytea, p_kind text, p_cell uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  DELETE FROM front.passkey_challenges WHERE expires_at <= now();
  -- 로그인 물음은 누구나 받을 수 있어요. 쌓이지 않게 가장 오래된 것부터 버려요
  DELETE FROM front.passkey_challenges WHERE hash IN (
    SELECT hash FROM front.passkey_challenges ORDER BY expires_at DESC OFFSET 2000);
  INSERT INTO front.passkey_challenges (hash, kind, cell, expires_at) VALUES (p_hash, p_kind, p_cell, now() + interval '5 minutes');
END $$;

-- 물음을 써 버려요. 있었고 때가 안 지났으면 참
CREATE FUNCTION front.passkey_answer(p_hash bytea, p_kind text, p_cell uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH used AS (
    DELETE FROM front.passkey_challenges
    WHERE hash = p_hash AND kind = p_kind AND cell IS NOT DISTINCT FROM p_cell AND expires_at > now() RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM used)
$$;

-- 열쇠 더하기. 한 칸에 10개까지, 한 열쇠는 한 칸에만. 못 넣었으면 NULL
CREATE FUNCTION front.passkey_add(p_cell uuid, p_credential bytea, p_key bytea, p_count bigint, p_label text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE made uuid;
BEGIN
  PERFORM 1 FROM catchup.cells WHERE cell = p_cell FOR UPDATE;
  IF (SELECT count(*) FROM front.passkeys WHERE cell = p_cell) >= 10 THEN RETURN NULL; END IF;
  INSERT INTO front.passkeys (cell, credential, public_key, sign_count, label)
    VALUES (p_cell, p_credential, p_key, p_count, p_label) ON CONFLICT (credential) DO NOTHING RETURNING id INTO made;
  RETURN made;
END $$;

CREATE FUNCTION front.passkey_list(p_cell uuid)
RETURNS TABLE (id uuid, label text, created_at timestamptz, last_used_at timestamptz, credential bytea)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT p.id, p.label, p.created_at, p.last_used_at, p.credential FROM front.passkeys p WHERE p.cell = p_cell ORDER BY p.created_at, p.id
$$;

CREATE FUNCTION front.passkey_remove(p_cell uuid, p_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH gone AS (DELETE FROM front.passkeys WHERE cell = p_cell AND id = p_id RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM gone)
$$;

-- 로그인하려는 열쇠 찾기(멈춘 칸의 열쇠는 없는 것으로 쳐요)
CREATE FUNCTION front.passkey_find(p_credential bytea) RETURNS TABLE (id uuid, public_key bytea, sign_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT p.id, p.public_key, p.sign_count FROM front.passkeys p JOIN catchup.cells c ON c.cell = p.cell
  WHERE p.credential = p_credential AND c.state = 'active'
$$;

-- 서명을 확인한 뒤에만 불러요. 쓴 횟수가 뒤로 갔으면(베낀 열쇠) 들이지 않아요. 기기 세션은 코드 로그인과 같아요
CREATE FUNCTION front.passkey_login(p_id uuid, p_count bigint, p_token_hash bytea, p_label text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE home uuid;
BEGIN
  UPDATE front.passkeys SET sign_count = p_count, last_used_at = now()
    WHERE id = p_id AND ((sign_count = 0 AND p_count = 0) OR p_count > sign_count) RETURNING cell INTO home;
  IF home IS NULL THEN RETURN NULL; END IF;
  INSERT INTO front.devices (cell, token_hash, label, expires_at) VALUES (home, p_token_hash, p_label, now() + interval '90 days');
  RETURN home;
END $$;

-- 패스키에 붙일 이름(키체인에 보이는 계정 이름)
CREATE FUNCTION front.email_of(p_cell uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT email FROM front.accounts WHERE cell = p_cell
$$;

REVOKE ALL ON FUNCTION front.passkey_ask(bytea, text, uuid), front.passkey_answer(bytea, text, uuid),
  front.passkey_add(uuid, bytea, bytea, bigint, text), front.passkey_list(uuid), front.passkey_remove(uuid, uuid),
  front.passkey_find(bytea), front.passkey_login(uuid, bigint, bytea, text), front.email_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.passkey_ask(bytea, text, uuid), front.passkey_answer(bytea, text, uuid),
  front.passkey_add(uuid, bytea, bytea, bigint, text), front.passkey_list(uuid), front.passkey_remove(uuid, uuid),
  front.passkey_find(bytea), front.passkey_login(uuid, bigint, bytea, text), front.email_of(uuid) TO catchup_app;
