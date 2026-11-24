-- 말로 만드는 기한 있는 감시 규칙(design.md 17장 제안 2, Q22).
-- "다음 주까지 한빛 디자인 메일은 바로 물어봐 줘" → 토마토가 규칙을 제안하고(proposed), 내가 누르면 켜져요(active).
-- 원칙 5를 지키려고 규칙은 올리는 쪽으로만 보내요: 물어봐요(ask) · 알려만 드려요(fyi). 넘기거나 알아서 하는 쪽으로는 넓힐 수 없어요.
-- 끝나는 날이 늘 있어요(최대 30일, 서버가 정해요).

CREATE TABLE catchup.watch_rules (
  cell        uuid NOT NULL REFERENCES catchup.cells,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  message     uuid,                                                       -- 이 규칙을 만든 말(assistant_messages.id)
  kind        text NOT NULL CHECK (kind IN ('from', 'words')),           -- from: 보낸 사람 이름 · 주소 · 회사 / words: 제목 · 본문의 낱말
  value       text NOT NULL CHECK (length(value) BETWEEN 2 AND 100),
  lane        text NOT NULL CHECK (lane IN ('ask', 'fyi')),
  until       timestamptz NOT NULL,
  state       text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'active', 'stopped')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  stopped_at  timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, message),
  CHECK (state <> 'active' OR started_at IS NOT NULL),
  CHECK (state <> 'stopped' OR stopped_at IS NOT NULL),
  CHECK (until <= created_at + interval '31 days')
);
CREATE INDEX watch_rules_active ON catchup.watch_rules (cell, until) WHERE state = 'active';

ALTER TABLE catchup.watch_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE catchup.watch_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY own_cell ON catchup.watch_rules USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell());
GRANT SELECT, INSERT, UPDATE ON catchup.watch_rules TO catchup_app;

-- 토마토에게 하는 말의 다섯째 갈래
ALTER TABLE catchup.assistant_messages DROP CONSTRAINT assistant_messages_intent_check;
ALTER TABLE catchup.assistant_messages ADD CONSTRAINT assistant_messages_intent_check
  CHECK (intent IN ('remember', 'ask', 'task', 'card', 'watch', 'unclear'));

-- 가른 기록에 어떤 감시 규칙이 올렸는지 남겨요
ALTER TABLE catchup.inbox_items ADD COLUMN watched uuid;
