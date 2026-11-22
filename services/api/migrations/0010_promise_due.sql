-- 3.6단계: 약속한 날이 오면 카드로 올리기 · 비서에게 말로 카드 가리키기

-- 올린 때(올리지 않기로 한 것도 여기에 적어요 — 되돌린 답 · 지운 약속)
ALTER TABLE catchup.memory_promises ADD COLUMN raised_at timestamptz;
GRANT UPDATE (raised_at) ON catchup.memory_promises TO catchup_app;
CREATE INDEX memory_promises_due ON catchup.memory_promises (cell, due) WHERE raised_at IS NULL AND due IS NOT NULL;

-- 비서에게 한 말이 가리킨 카드. 내가 눌러야(accepted_at) 그 말이 카드의 답으로 가요
ALTER TABLE catchup.assistant_messages ADD COLUMN card uuid;
ALTER TABLE catchup.assistant_messages ADD COLUMN accepted_at timestamptz;
ALTER TABLE catchup.assistant_messages DROP CONSTRAINT assistant_messages_intent_check;
ALTER TABLE catchup.assistant_messages ADD CONSTRAINT assistant_messages_intent_check
  CHECK (intent IN ('remember', 'ask', 'task', 'card', 'unclear'));

-- 일꾼이 볼 칸에 '날이 된 약속'을 더해요(그 칸의 시간대로 오늘)
CREATE OR REPLACE FUNCTION front.cells_with_work(p_limit int) RETURNS TABLE (cell uuid)
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
    UNION ALL
    SELECT m.cell, m.created_at FROM catchup.memory_promises m JOIN catchup.cells z ON z.cell = m.cell
      WHERE m.raised_at IS NULL AND m.due IS NOT NULL AND m.due <= (now() AT TIME ZONE z.time_zone)::date
  ) w JOIN catchup.cells c ON c.cell = w.cell AND c.state = 'active'
  GROUP BY w.cell ORDER BY min(w.at) LIMIT least(p_limit, 500)
$$;
