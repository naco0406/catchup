-- 3.6단계: 이어지는 비서의 기억(design.md 3-1장).
-- 기억은 베껴 두지 않고 이미 남긴 것(내 답 · 고친 초안 · 내 말 · 끝난 세션)에서 읽어 내요.
-- 그래서 되돌린 답은 저절로 빠지고, 서버를 다시 띄워도 그대로예요.
-- 따로 두는 것은 셋: 내가 직접 알려 준 것, 내가 고치거나 지운 것, 모델을 부를 때 넣은 맥락 꾸러미의 기록.

CREATE TABLE catchup.memory_notes (
  cell        uuid NOT NULL REFERENCES catchup.cells,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL,
  text        text NOT NULL CHECK (length(text) BETWEEN 1 AND 600),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id),
  UNIQUE (cell, request_key)
);

-- key 는 기억이 나온 곳이에요: answer:<id> · draft:<id> · said:<card>:<seq> · session:<id> · note:<id>
CREATE TABLE catchup.memory_edits (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  key        text NOT NULL CHECK (length(key) <= 80),
  state      text NOT NULL CHECK (state IN ('edited', 'forgotten')),
  text       text CHECK (length(text) BETWEEN 1 AND 600),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, key),
  CHECK ((state = 'edited') = (text IS NOT NULL))
);

CREATE TABLE catchup.context_packs (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  purpose    text NOT NULL CHECK (purpose IN ('draft', 'session')),
  subject    text NOT NULL,
  keys       text[] NOT NULL,
  bytes      int NOT NULL CHECK (bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id)
);
CREATE INDEX context_packs_recent ON catchup.context_packs (cell, created_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['memory_notes', 'memory_edits', 'context_packs'] LOOP
    EXECUTE format('ALTER TABLE catchup.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE catchup.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_cell ON catchup.%I USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT ON catchup.memory_notes, catchup.context_packs TO catchup_app;
GRANT SELECT, INSERT, UPDATE ON catchup.memory_edits TO catchup_app;

-- 기억의 재료. 부르는 사람의 권한으로 읽어요(security_invoker) — 줄 단위 권한이 그대로 걸려요.
-- kind: person(사람과 정한 것) · project(코딩 에이전트 · 저장소) · preference(내 말 · 내가 고친 것 · 내가 알려 준 것)
-- 밖에서 온 글(카드의 질문)은 person · project 의 기록으로만 남아요. preference 는 내 것만이에요.
CREATE VIEW catchup.memory_facts WITH (security_invoker = true) AS
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
  SELECT n.cell, 'note:' || n.id, 'preference', '', 'told', n.text, NULL, NULL, NULL, n.created_at
  FROM catchup.memory_notes n;

-- 지운 것을 빼고, 고친 글을 얹은 기억
CREATE VIEW catchup.memories WITH (security_invoker = true) AS
  SELECT f.*, e.text AS fixed
  FROM catchup.memory_facts f
  LEFT JOIN catchup.memory_edits e ON e.cell = f.cell AND e.key = f.key
  WHERE e.state IS DISTINCT FROM 'forgotten';
GRANT SELECT ON catchup.memory_facts, catchup.memories TO catchup_app;
