-- 3.6단계: 덱에서 비서에게 말하기 — 말할 때 보고 있던 카드를 같이 남겨요.
-- '이 사람' · '이 카드' 같은 말을 그 카드로 풀고, 그 사람에 대한 기억은 그 사람의 것으로만 둬요.

-- 말할 때 화면에 있던 카드(없으면 NULL). 가리키기만 해요 — 이것만으로는 카드에 아무 일도 일어나지 않아요
ALTER TABLE catchup.assistant_messages ADD COLUMN seen_card uuid;

-- 알려 준 것이 누구 · 어느 일에 대한 것인지. 비어 있으면 두루 쓰는 것이에요
ALTER TABLE catchup.memory_notes ADD COLUMN subject text NOT NULL DEFAULT '' CHECK (char_length(subject) <= 200);

-- 기억의 재료: 알려 준 것에 사람 · 일을 붙여요(나머지는 0009 와 같아요)
CREATE OR REPLACE VIEW catchup.memory_facts WITH (security_invoker = true) AS
  WITH cards AS (
    SELECT d.cell, d.id, d.question,
           d.source->>'type' IN ('codex', 'claude') AS coding,
           COALESCE(NULLIF(CASE WHEN d.source->>'type' IN ('codex', 'claude') THEN d.source->>'org' ELSE d.source->>'from' END, ''), '') AS subject
    FROM catchup.decision_cards d
  ), kept AS (
    SELECT a.cell, a.id, a.card, a.chosen->>'label' AS label, a.draft, a.created_at
    FROM catchup.card_answers a
    JOIN catchup.action_receipts r ON r.cell = a.cell AND r.answer = a.id
    WHERE a.kind = 'option' AND r.state NOT IN ('cancelled', 'reverting', 'reverted')
  )
  SELECT k.cell, 'answer:' || k.id AS key, CASE WHEN c.coding THEN 'project' ELSE 'person' END AS kind, c.subject,
         'decided' AS what, c.question AS a, k.label AS b, k.card, NULL::uuid AS session, k.created_at AS at
  FROM kept k JOIN cards c ON c.cell = k.cell AND c.id = k.card
  UNION ALL
  SELECT k.cell, 'draft:' || k.id, 'preference', c.subject, 'edited', k.draft, NULL, k.card, NULL, k.created_at
  FROM kept k JOIN cards c ON c.cell = k.cell AND c.id = k.card WHERE k.draft IS NOT NULL
  UNION ALL
  SELECT t.cell, 'said:' || t.card || ':' || t.seq, 'preference', c.subject, 'said', t.said, NULL, t.card, NULL, t.created_at
  FROM catchup.card_turns t JOIN cards c ON c.cell = t.cell AND c.id = t.card
  UNION ALL
  SELECT s.cell, 'session:' || s.id, 'project', COALESCE(NULLIF(s.repo, ''), s.title), 'session', s.title, s.summary, NULL, s.id, s.finished_at
  FROM catchup.agent_sessions s WHERE s.state = 'done'
  UNION ALL
  SELECT n.cell, 'note:' || n.id, 'preference', n.subject, 'told', n.text, NULL, NULL, NULL, n.created_at
  FROM catchup.memory_notes n
  UNION ALL
  SELECT p.cell, 'promise:' || p.id, 'promise', c.subject, 'promised', p.text, to_char(p.due, 'YYYY-MM-DD'), k.card, NULL, p.created_at
  FROM catchup.memory_promises p
  JOIN kept k ON k.cell = p.cell AND k.id = p.answer
  JOIN cards c ON c.cell = k.cell AND c.id = k.card;
