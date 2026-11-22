-- CatchUp 2단계 바탕(design.md 3 · 7 · 8 · 11 · 13장).
-- 규칙: 사용자 칸의 표는 첫 열쇠가 cell 이고, 줄 단위 권한을 FORCE 로 켜요.
--       앱 역할(catchup_app)은 set_config('catchup.cell', …, true) 로 고른 한 칸만 봐요.
--       칸을 고르기 전에 필요한 일(세션 찾기 · 코드로 로그인 · 할 일이 있는 칸 찾기)만 아래 함수로 열어요.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catchup_app') THEN
    CREATE ROLE catchup_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA catchup;
CREATE SCHEMA front;   -- 공용 앞단. 앱 역할은 표를 직접 못 읽어요

CREATE FUNCTION catchup.current_cell() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('catchup.cell', true), '')::uuid $$;

CREATE TABLE catchup.cells (
  cell        uuid PRIMARY KEY,
  mode        text NOT NULL DEFAULT 'shared' CHECK (mode IN ('shared', 'dedicated')),
  state       text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused')),
  lang        text NOT NULL DEFAULT 'ko' CHECK (lang IN ('ko', 'en')),
  time_zone   text NOT NULL DEFAULT 'Asia/Seoul',
  wrapped_key bytea NOT NULL,            -- 칸 키. 바깥 열쇠로 감싸서만 둬요
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE front.accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell       uuid NOT NULL UNIQUE REFERENCES catchup.cells,
  email      text NOT NULL UNIQUE CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE front.login_codes (
  account    uuid PRIMARY KEY REFERENCES front.accounts,
  code_hash  bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  tries      int NOT NULL DEFAULT 0
);

CREATE TABLE front.devices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell       uuid NOT NULL REFERENCES catchup.cells,
  token_hash bytea NOT NULL UNIQUE,
  label      text NOT NULL CHECK (length(label) <= 120),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catchup.decision_cards (
  cell           uuid NOT NULL REFERENCES catchup.cells,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  dedupe_key     text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('reply', 'schedule', 'approve', 'choose', 'failed', 'fyi')),
  source         jsonb NOT NULL,
  source_ref     text NOT NULL,
  source_version text NOT NULL,           -- 실행 바로 앞에서 다시 견줘요
  question       text NOT NULL,
  body           jsonb NOT NULL DEFAULT '{}',  -- 요약 · 근거 · 자료. 원문은 넣지 않아요
  options        jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 0 AND 5),
  recommended    int NOT NULL DEFAULT 0,
  risk           text NOT NULL DEFAULT 'low' CHECK (risk IN ('low', 'money', 'production', 'irreversible')),
  reply_path     text NOT NULL DEFAULT 'none' CHECK (reply_path IN ('send', 'draft_copy', 'none')),
  waiting        boolean NOT NULL DEFAULT false,
  due_at         timestamptz,
  state          text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'answered', 'snoozed', 'handed_off', 'expired')),
  snooze_until   timestamptz,
  version        int NOT NULL DEFAULT 1,
  front_at       timestamptz,             -- 목록에서 고르거나 되돌려서 맨 앞으로 온 때
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id),
  UNIQUE (cell, dedupe_key),
  CHECK ((state = 'snoozed') = (snooze_until IS NOT NULL))
);
CREATE INDEX decision_cards_open ON catchup.decision_cards (cell, state, created_at);

-- 처음 선택지는 카드에 남고, 말로 주고받을 때마다 새 선택지가 차례로 쌓여요
CREATE TABLE catchup.card_turns (
  cell        uuid NOT NULL,
  card        uuid NOT NULL,
  seq         int NOT NULL CHECK (seq > 0),
  request_key uuid NOT NULL,
  said        text NOT NULL,
  work        text,
  reply       text,
  options     jsonb,
  recommended int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, card, seq),
  UNIQUE (cell, request_key),
  FOREIGN KEY (cell, card) REFERENCES catchup.decision_cards (cell, id)
);

CREATE TABLE catchup.card_answers (
  cell         uuid NOT NULL,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  card         uuid NOT NULL,
  request_key  uuid NOT NULL,             -- 같은 요청을 두 번 보내도 답은 하나
  request_hash bytea NOT NULL,            -- 같은 열쇠에 다른 내용이면 거절
  card_version int NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('option', 'snooze', 'handoff')),
  turn_seq     int NOT NULL DEFAULT 0,
  option_index int,
  chosen       jsonb,                     -- 고른 선택지 그대로(학습 · 기록)
  draft        text,
  surface      text NOT NULL CHECK (surface IN ('web', 'ipad', 'iphone', 'notification')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id),
  UNIQUE (cell, request_key),
  UNIQUE (cell, id, card),
  FOREIGN KEY (cell, card) REFERENCES catchup.decision_cards (cell, id),
  CHECK ((kind = 'option') = (option_index IS NOT NULL AND chosen IS NOT NULL))
);

CREATE TABLE catchup.action_receipts (
  cell           uuid NOT NULL,
  id             uuid NOT NULL DEFAULT gen_random_uuid(),   -- 밖으로 낼 때의 멱등 열쇠
  card           uuid NOT NULL,
  answer         uuid NOT NULL,
  effect         jsonb NOT NULL,          -- 실행할 내용의 사본. 실행할 때 모델에게 다시 묻지 않아요
  undoable       boolean NOT NULL DEFAULT false,
  source_ref     text NOT NULL,
  source_version text NOT NULL,
  state          text NOT NULL DEFAULT 'waiting'
                 CHECK (state IN ('waiting', 'running', 'succeeded', 'failed', 'stale', 'unknown', 'cancelled', 'reverting', 'reverted')),
  run_after      timestamptz NOT NULL,
  lease_until    timestamptz,
  attempts       int NOT NULL DEFAULT 0,
  reverse        jsonb,                   -- 되돌리는 데 필요한 값
  error_code     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, answer),
  FOREIGN KEY (cell, answer, card) REFERENCES catchup.card_answers (cell, id, card),
  CHECK ((state IN ('running', 'reverting')) = (lease_until IS NOT NULL))
);
-- 한 카드에 나가는 중인 실행은 하나뿐
CREATE UNIQUE INDEX action_receipts_one_active ON catchup.action_receipts (cell, card)
  WHERE state IN ('waiting', 'running', 'reverting');
CREATE INDEX action_receipts_due ON catchup.action_receipts (run_after)
  WHERE state IN ('waiting', 'running', 'reverting');

CREATE TABLE catchup.connections (
  cell            uuid NOT NULL REFERENCES catchup.cells,
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  reply_path      text NOT NULL CHECK (reply_path IN ('send', 'draft_copy', 'none')),
  scopes          text[] NOT NULL DEFAULT '{}',
  sealed          bytea,                  -- 칸 키로 암호화
  state           text NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'needs_login', 'limited', 'off')),
  last_ok_at      timestamptz,
  last_failed_at  timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, kind)
);

CREATE TABLE catchup.push_devices (
  cell          uuid NOT NULL REFERENCES catchup.cells,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  endpoint_hash bytea NOT NULL,
  sealed        bytea NOT NULL,           -- 구독 주소와 열쇠. 칸 키로 암호화
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id),
  UNIQUE (cell, endpoint_hash)
);

CREATE TABLE catchup.push_jobs (
  cell         uuid NOT NULL,
  card         uuid NOT NULL,
  card_version int NOT NULL,
  run_after    timestamptz NOT NULL DEFAULT now(),
  lease_until  timestamptz,
  attempts     int NOT NULL DEFAULT 0,
  finished_at  timestamptz,
  PRIMARY KEY (cell, card, card_version),
  FOREIGN KEY (cell, card) REFERENCES catchup.decision_cards (cell, id)
);

-- SSE 가 끊겨도 마지막 번호부터 이어 받아요. 내용은 싣지 않고 무엇이 바뀌었는지만
CREATE TABLE catchup.cell_events (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  seq        bigint NOT NULL,
  kind       text NOT NULL,
  card       uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, seq)
);

CREATE TABLE catchup.cell_event_heads (
  cell uuid PRIMARY KEY REFERENCES catchup.cells,
  seq  bigint NOT NULL
);

-- 번호는 커밋 순서대로 — 머리 줄을 잠가서 늦게 끝난 거래가 앞 번호로 끼어들지 못해요
CREATE FUNCTION catchup.emit(p_kind text, p_card uuid) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c uuid := catchup.current_cell(); n bigint;
BEGIN
  INSERT INTO catchup.cell_event_heads AS h (cell, seq) VALUES (c, 1)
    ON CONFLICT (cell) DO UPDATE SET seq = h.seq + 1 RETURNING h.seq INTO n;
  INSERT INTO catchup.cell_events (cell, seq, kind, card) VALUES (c, n, p_kind, p_card);
  PERFORM pg_notify('catchup_events', c::text);
  RETURN n;
END $$;

-- 줄 단위 권한
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'catchup' LOOP
    EXECUTE format('ALTER TABLE catchup.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE catchup.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_cell ON catchup.%I USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell())', t);
  END LOOP;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catchup FROM PUBLIC;
GRANT USAGE ON SCHEMA catchup, front TO catchup_app;
GRANT EXECUTE ON FUNCTION catchup.current_cell(), catchup.emit(text, uuid) TO catchup_app;
GRANT SELECT ON catchup.cells TO catchup_app;
GRANT SELECT, INSERT, UPDATE ON catchup.decision_cards, catchup.action_receipts, catchup.connections, catchup.push_jobs, catchup.cell_event_heads TO catchup_app;
GRANT SELECT, INSERT, UPDATE ON catchup.card_turns TO catchup_app;
GRANT SELECT, INSERT ON catchup.card_answers, catchup.cell_events TO catchup_app;   -- 답과 사건은 고쳐 쓰지 않아요
GRANT SELECT, INSERT, UPDATE, DELETE ON catchup.push_devices TO catchup_app;
GRANT DELETE ON catchup.connections TO catchup_app;

-- 칸을 고르기 전에만 쓰는 좁은 문
CREATE FUNCTION front.resolve_session(p_token_hash bytea) RETURNS TABLE (cell uuid, device uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT d.cell, d.id FROM front.devices d JOIN catchup.cells c ON c.cell = d.cell
  WHERE d.token_hash = p_token_hash AND d.revoked_at IS NULL AND d.expires_at > now() AND c.state = 'active'
$$;

CREATE FUNCTION front.login(p_email text, p_code_hash bytea, p_token_hash bytea, p_label text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE a front.accounts; l front.login_codes;
BEGIN
  SELECT * INTO a FROM front.accounts WHERE email = lower(p_email);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM front.login_codes WHERE account = a.id FOR UPDATE;
  IF NOT FOUND OR l.expires_at <= now() OR l.tries >= 5 THEN RETURN NULL; END IF;
  IF l.code_hash <> p_code_hash THEN
    UPDATE front.login_codes SET tries = tries + 1 WHERE account = a.id;
    RETURN NULL;
  END IF;
  DELETE FROM front.login_codes WHERE account = a.id;
  INSERT INTO front.devices (cell, token_hash, label, expires_at)
    VALUES (a.cell, p_token_hash, p_label, now() + interval '90 days');
  RETURN a.cell;
END $$;

CREATE FUNCTION front.logout(p_token_hash bytea) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE front.devices SET revoked_at = now() WHERE token_hash = p_token_hash AND revoked_at IS NULL
$$;

-- 일꾼은 '어느 칸에 할 일이 있는지'만 알고, 내용은 그 칸을 고른 뒤에 읽어요
CREATE FUNCTION front.cells_with_work(p_limit int) RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT w.cell FROM (
    SELECT r.cell, r.run_after AS at FROM catchup.action_receipts r
      WHERE r.state = 'waiting' AND r.run_after <= now()
    UNION ALL
    SELECT r.cell, r.lease_until FROM catchup.action_receipts r
      WHERE r.state IN ('running', 'reverting') AND r.lease_until <= now()
    UNION ALL
    SELECT p.cell, p.run_after FROM catchup.push_jobs p
      WHERE p.finished_at IS NULL AND p.run_after <= now() AND (p.lease_until IS NULL OR p.lease_until <= now())
    UNION ALL
    SELECT d.cell, d.snooze_until FROM catchup.decision_cards d
      WHERE d.state = 'snoozed' AND d.snooze_until <= now()
  ) w JOIN catchup.cells c ON c.cell = w.cell AND c.state = 'active'
  GROUP BY w.cell ORDER BY min(w.at) LIMIT least(p_limit, 500)
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA front FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA front TO catchup_app;
