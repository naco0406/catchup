-- 기억 정리 일꾼(design.md 17장 제안 3, 'dreaming').
-- 기억은 덧붙이기만 하는 기록에서 뷰로 읽어 내요(0008). 정리 일꾼은 새 기억을 짓지 않고, 있는 기억에 표시만 붙여요.
-- - 합침(merge): 같은 종류 · 같은 대상 · 같은 글이 여럿이면 가장 최근 것만 남기고 나머지는 뷰에서 빼요
-- - 확인 필요(check): 오래 다시 확인되지 않은 내 선호. 빼지 않고 표시만 해요
-- 정리마다 줄이 남고, 내가 되돌릴 수 있어요(undone_at). 되돌린 정리는 다시 하지 않아요. 모델은 쓰지 않아요.

CREATE TABLE catchup.memory_tidy (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  action     text NOT NULL CHECK (action IN ('merge', 'check')),
  key        text NOT NULL CHECK (length(key) <= 80),          -- 정리한 기억
  into_key   text CHECK (length(into_key) <= 80),              -- 합침: 남긴 기억
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at  timestamptz,
  PRIMARY KEY (cell, id),
  CHECK ((action = 'merge') = (into_key IS NOT NULL))
);
CREATE UNIQUE INDEX memory_tidy_once ON catchup.memory_tidy (cell, key, action);
CREATE INDEX memory_tidy_live ON catchup.memory_tidy (cell, key) WHERE undone_at IS NULL;

-- 칸마다 마지막으로 정리한 때(하루에 한 번)
CREATE TABLE catchup.memory_tidy_runs (
  cell   uuid PRIMARY KEY REFERENCES catchup.cells,
  ran_at timestamptz NOT NULL
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['memory_tidy', 'memory_tidy_runs'] LOOP
    EXECUTE format('ALTER TABLE catchup.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE catchup.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_cell ON catchup.%I USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON catchup.memory_tidy, catchup.memory_tidy_runs TO catchup_app;

-- 지운 것과 합친 것을 빼고, 고친 글을 얹은 기억. 확인 필요 표시와 합쳐 받은 수도 같이 읽어요
CREATE OR REPLACE VIEW catchup.memories WITH (security_invoker = true) AS
  SELECT f.*, e.text AS fixed,
         EXISTS (SELECT 1 FROM catchup.memory_tidy t WHERE t.cell = f.cell AND t.key = f.key AND t.action = 'check' AND t.undone_at IS NULL) AS needs_check,
         (SELECT count(*) FROM catchup.memory_tidy t WHERE t.cell = f.cell AND t.into_key = f.key AND t.action = 'merge' AND t.undone_at IS NULL)::int AS merged
  FROM catchup.memory_facts f
  LEFT JOIN catchup.memory_edits e ON e.cell = f.cell AND e.key = f.key
  WHERE e.state IS DISTINCT FROM 'forgotten'
    AND NOT EXISTS (SELECT 1 FROM catchup.memory_tidy t WHERE t.cell = f.cell AND t.key = f.key AND t.action = 'merge' AND t.undone_at IS NULL);

-- 정리할 칸은 따로 골라요. 일꾼의 일(cells_with_work)에 섞으면 답한 칸이 10초를 기다리지 않고 보여요(schema.sh)
CREATE FUNCTION front.cells_to_tidy(p_limit int) RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT z.cell FROM catchup.cells z LEFT JOIN catchup.memory_tidy_runs t ON t.cell = z.cell
  WHERE z.state = 'active' AND (t.ran_at IS NULL OR t.ran_at <= now() - interval '1 day')
    AND (EXISTS (SELECT 1 FROM catchup.memory_notes n WHERE n.cell = z.cell)
      OR EXISTS (SELECT 1 FROM catchup.card_answers a WHERE a.cell = z.cell)
      OR EXISTS (SELECT 1 FROM catchup.card_turns s WHERE s.cell = z.cell))
  ORDER BY t.ran_at NULLS FIRST LIMIT least(p_limit, 500)
$$;
REVOKE ALL ON FUNCTION front.cells_to_tidy(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.cells_to_tidy(int) TO catchup_app;
