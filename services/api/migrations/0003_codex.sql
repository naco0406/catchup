-- 3단계: 칸마다 Codex 로그인 하나. 화면(API)은 바라는 일(wanted)만 적고, 로그인은 에이전트 일꾼만 쥐어요.

CREATE TABLE catchup.codex_logins (
  cell             uuid PRIMARY KEY REFERENCES catchup.cells,
  state            text NOT NULL DEFAULT 'none'
                   CHECK (state IN ('none', 'starting', 'waiting', 'in', 'expired', 'failed')),
  wanted           text CHECK (wanted IN ('login', 'cancel', 'logout')),
  code             bytea,                 -- 기기 코드(칸 키로 잠금). 기다리는 동안만
  verification_url text,
  auth             bytea,                 -- auth.json(칸 키로 잠금)
  auth_fingerprint bytea,                 -- 갱신된 것을 낡은 사본이 덮어쓰지 못하게
  plan             text,
  limits           jsonb,
  error_code       text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (state = 'waiting' OR code IS NULL)
);
ALTER TABLE catchup.codex_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE catchup.codex_logins FORCE ROW LEVEL SECURITY;
CREATE POLICY own_cell ON catchup.codex_logins USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell());
GRANT SELECT, INSERT, UPDATE ON catchup.codex_logins TO catchup_app;

-- 에이전트 일꾼도 '어느 칸인지'만 알아요. waiting 은 일꾼이 다시 켜졌을 때 끊긴 로그인을 정리하려고
CREATE FUNCTION front.cells_with_agent_work() RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT l.cell FROM catchup.codex_logins l JOIN catchup.cells c ON c.cell = l.cell AND c.state = 'active'
  WHERE l.wanted IS NOT NULL OR l.state = 'waiting' ORDER BY l.updated_at LIMIT 500
$$;
REVOKE ALL ON FUNCTION front.cells_with_agent_work() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.cells_with_agent_work() TO catchup_app;
