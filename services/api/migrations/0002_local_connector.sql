-- 로컬 커넥터: 밖으로 보내는 대신 '보낸 것'을 남겨요. 손으로 넣은 카드(2단계)와 멱등 · 복구 시험에 써요.
-- 실제 커넥터(Codex 3단계 · Gmail 4단계)는 같은 Executor 를 구현해요.

CREATE TABLE catchup.local_effects (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  id         uuid NOT NULL,             -- 영수증 id = 멱등 열쇠
  effect     jsonb NOT NULL,
  reverted   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id)
);
CREATE TABLE catchup.local_sources (
  cell    uuid NOT NULL REFERENCES catchup.cells,
  ref     text NOT NULL,
  version text NOT NULL,
  PRIMARY KEY (cell, ref)
);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['local_effects', 'local_sources'] LOOP
    EXECUTE format('ALTER TABLE catchup.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE catchup.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_cell ON catchup.%I USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON catchup.local_effects, catchup.local_sources TO catchup_app;
