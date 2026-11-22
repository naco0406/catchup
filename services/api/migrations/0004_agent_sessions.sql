-- 3단계: 코딩 세션과, 에이전트가 사람을 기다리는 요청. 요청과 카드는 같은 거래로 남아요.
-- app-server 는 다시 켜지면 다시 묻지 않아요(실측) — 그래서 이 표가 원본이에요.

CREATE TABLE catchup.agent_sessions (
  cell          uuid NOT NULL REFERENCES catchup.cells,
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  request_key   uuid NOT NULL,
  agent         text NOT NULL DEFAULT 'codex' CHECK (agent IN ('codex')),
  title         text NOT NULL,
  task          text NOT NULL,
  repo          text,                  -- owner/name. 없으면 빈 작업 폴더
  state         text NOT NULL DEFAULT 'queued'
                CHECK (state IN ('queued', 'starting', 'running', 'waiting', 'blocked', 'finishing', 'done', 'failed', 'cancelled')),
  outcome       text CHECK (outcome IN ('done', 'failed', 'cancelled')),
  cancel_wanted boolean NOT NULL DEFAULT false,
  slot          int CHECK (slot > 0),
  thread_id     text,
  turn_id       text,
  boot          uuid,                  -- 이 차례를 쥔 app-server 한 번
  resumes       int NOT NULL DEFAULT 0,
  summary       text,
  patch         text,
  error_code    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, request_key),
  CHECK ((state IN ('done', 'failed', 'cancelled')) = (finished_at IS NOT NULL)),
  CHECK (state <> 'finishing' OR outcome IS NOT NULL)
);
CREATE INDEX agent_sessions_thread ON catchup.agent_sessions (cell, thread_id);
-- 한 자리에 세션 하나(칸을 넘어서도)
CREATE UNIQUE INDEX agent_sessions_one_per_slot ON catchup.agent_sessions (slot)
  WHERE state NOT IN ('done', 'failed', 'cancelled');

CREATE TABLE catchup.agent_requests (
  cell         uuid NOT NULL,
  id           uuid NOT NULL,
  session      uuid NOT NULL,
  boot         uuid NOT NULL,
  rpc_id       jsonb NOT NULL,         -- app-server 의 요청 번호. boot 안에서만 뜻이 있어요
  kind         text NOT NULL CHECK (kind IN ('command', 'file_change', 'question')),
  question_id  text NOT NULL DEFAULT '',
  params       jsonb NOT NULL,
  card         uuid NOT NULL,
  answer       jsonb,
  answered_by  uuid,                   -- 영수증 id(멱등 열쇠)
  state        text NOT NULL DEFAULT 'waiting'
               CHECK (state IN ('waiting', 'answered', 'delivered', 'preapproved', 'closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  answered_at  timestamptz,
  delivered_at timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, boot, rpc_id, question_id),
  FOREIGN KEY (cell, session) REFERENCES catchup.agent_sessions (cell, id),
  FOREIGN KEY (cell, card) REFERENCES catchup.decision_cards (cell, id),
  CHECK (state NOT IN ('answered', 'delivered', 'preapproved') OR answer IS NOT NULL)
);
CREATE INDEX agent_requests_session ON catchup.agent_requests (cell, session, state);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_sessions', 'agent_requests'] LOOP
    EXECUTE format('ALTER TABLE catchup.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE catchup.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_cell ON catchup.%I USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON catchup.agent_sessions, catchup.agent_requests TO catchup_app;

CREATE FUNCTION front.cells_with_sessions() RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT s.cell FROM catchup.agent_sessions s JOIN catchup.cells c ON c.cell = s.cell AND c.state = 'active'
  WHERE s.state NOT IN ('done', 'failed', 'cancelled')
  GROUP BY s.cell ORDER BY min(s.created_at) LIMIT 500
$$;
REVOKE ALL ON FUNCTION front.cells_with_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.cells_with_sessions() TO catchup_app;
