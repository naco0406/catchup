-- 3.6단계: 비서에게 말하기(명령이 들어오는 셋째 길) · 약속의 기억(design.md 3-1장).
-- 말은 먼저 받아 두고, 모델은 갈래(기억해 · 물어봐 · 일 맡겨)와 답만 정해요. 실행은 서버가 정해진 일만 해요.

CREATE TABLE catchup.assistant_messages (
  cell        uuid NOT NULL REFERENCES catchup.cells,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL,
  said        text NOT NULL CHECK (length(said) BETWEEN 1 AND 2000),
  state       text NOT NULL DEFAULT 'thinking' CHECK (state IN ('thinking', 'done', 'failed')),
  intent      text CHECK (intent IN ('remember', 'ask', 'task', 'unclear')),
  reply       text,
  task        text,              -- 맡길 일의 제안. 내가 누르기 전에는 세션이 없어요
  repo        text,
  note        uuid,              -- 이 말로 생긴 기억(memory_notes.id)
  session     uuid,              -- 이 말로 맡긴 세션
  error_code  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, request_key),
  CHECK ((state = 'thinking') = (answered_at IS NULL))
);
CREATE INDEX assistant_messages_recent ON catchup.assistant_messages (cell, created_at);
CREATE INDEX assistant_messages_thinking ON catchup.assistant_messages (cell, created_at) WHERE state = 'thinking';

-- 약속: 내가 보낸 글에서만 뽑아요. 답 하나는 한 번만 살펴요
CREATE TABLE catchup.memory_promises (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  answer     uuid NOT NULL,
  text       text NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  due        date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, id),
  FOREIGN KEY (cell, answer) REFERENCES catchup.card_answers (cell, id)
);
CREATE INDEX memory_promises_answer ON catchup.memory_promises (cell, answer);

CREATE TABLE catchup.promise_scans (
  cell       uuid NOT NULL REFERENCES catchup.cells,
  answer     uuid NOT NULL,
  state      text NOT NULL CHECK (state IN ('none', 'found', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cell, answer),
  FOREIGN KEY (cell, answer) REFERENCES catchup.card_answers (cell, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistant_messages', 'memory_promises', 'promise_scans'] LOOP
    EXECUTE format('ALTER TABLE catchup.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE catchup.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own_cell ON catchup.%I USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON catchup.assistant_messages TO catchup_app;
GRANT SELECT, INSERT ON catchup.memory_promises, catchup.promise_scans TO catchup_app;

ALTER TABLE catchup.context_packs DROP CONSTRAINT context_packs_purpose_check;
ALTER TABLE catchup.context_packs ADD CONSTRAINT context_packs_purpose_check CHECK (purpose IN ('draft', 'session', 'ask'));

-- 살필 답: 사람에게 나간 글(보내기 · 복사)이고, 하루 안의 것이고, 아직 안 살핀 것
CREATE VIEW catchup.promise_candidates WITH (security_invoker = true) AS
  SELECT r.cell, r.answer, r.effect->>'to' AS recipient, r.effect->>'text' AS text, r.finished_at
  FROM catchup.action_receipts r
  WHERE r.state = 'succeeded' AND r.effect->>'kind' IN ('send', 'copy') AND COALESCE(r.effect->>'text', '') <> ''
    AND r.finished_at > now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM catchup.promise_scans s WHERE s.cell = r.cell AND s.answer = r.answer);
GRANT SELECT ON catchup.promise_candidates TO catchup_app;

-- 에이전트 일꾼이 볼 칸: 생각 중인 말이 있거나, 살필 답이 있고 모델에 로그인된 칸
CREATE FUNCTION front.cells_with_talk() RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT m.cell FROM catchup.assistant_messages m JOIN catchup.cells c ON c.cell = m.cell AND c.state = 'active'
  WHERE m.state = 'thinking' GROUP BY m.cell
  UNION
  SELECT r.cell FROM catchup.action_receipts r
  JOIN catchup.cells c ON c.cell = r.cell AND c.state = 'active'
  JOIN catchup.codex_logins l ON l.cell = r.cell AND l.state = 'in'
  WHERE r.state = 'succeeded' AND r.effect->>'kind' IN ('send', 'copy') AND r.finished_at > now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM catchup.promise_scans s WHERE s.cell = r.cell AND s.answer = r.answer)
  GROUP BY r.cell
  LIMIT 500
$$;
REVOKE ALL ON FUNCTION front.cells_with_talk() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.cells_with_talk() TO catchup_app;
CREATE INDEX action_receipts_recent_done ON catchup.action_receipts (cell, finished_at) WHERE state = 'succeeded';

-- 기억의 재료에 약속을 더해요. 답을 되돌리면(kept 에서 빠지면) 약속도 같이 빠져요
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
  SELECT n.cell, 'note:' || n.id, 'preference', '', 'told', n.text, NULL, NULL, NULL, n.created_at
  FROM catchup.memory_notes n
  UNION ALL
  SELECT p.cell, 'promise:' || p.id, 'promise', c.subject, 'promised', p.text, to_char(p.due, 'YYYY-MM-DD'), k.card, NULL, p.created_at
  FROM catchup.memory_promises p
  JOIN kept k ON k.cell = p.cell AND k.id = p.answer
  JOIN cards c ON c.cell = k.cell AND c.id = k.card;
