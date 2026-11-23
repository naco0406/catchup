-- 4단계: 가르기 — 들어온 것 한 건씩을 물어봐요(카드) · 알려만 드려요 · 넘겨요로 나눠요(design.md 6장).
-- 원문은 가를 때까지만 둬요. 가른 뒤에는 짧은 발췌와 가른 결과만 남아요(Q20 의 첫 답: 요약과 발췌만).

CREATE TABLE catchup.inbox_items (
  cell        uuid NOT NULL REFERENCES catchup.cells,
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  connector   text NOT NULL CHECK (length(connector) BETWEEN 1 AND 40),   -- local(예시 메일) · gmail …
  ref         text NOT NULL CHECK (length(ref) BETWEEN 1 AND 300),        -- 그 커넥터의 글 하나
  thread      text NOT NULL CHECK (length(thread) BETWEEN 1 AND 300),     -- 같은 대화
  sender      text NOT NULL CHECK (length(sender) <= 200),
  org         text NOT NULL DEFAULT '' CHECK (length(org) <= 200),
  direct      boolean NOT NULL DEFAULT true,    -- 나에게 직접 온 글(참조 · 단체가 아님)
  list        boolean NOT NULL DEFAULT false,   -- 단체로 보낸 글(뉴스레터 · 광고 — 수신 거부 머리말)
  subject     text NOT NULL DEFAULT '' CHECK (length(subject) <= 500),
  text        text CHECK (length(text) <= 20000),                         -- 가른 뒤에는 비워요
  excerpt     text NOT NULL DEFAULT '' CHECK (length(excerpt) <= 600),
  received_at timestamptz NOT NULL DEFAULT now(),
  state       text NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'sorted')),
  tries       int NOT NULL DEFAULT 0,
  lane        text CHECK (lane IN ('ask', 'fyi', 'skip')),
  reason      text CHECK (length(reason) <= 300),
  sorted_by   text CHECK (sorted_by IN ('rule', 'model', 'plain')),       -- plain: 모델 없이 있는 그대로 올린 것
  card        uuid,
  corrected   text CHECK (corrected IN ('ask')),                          -- 내가 고친 갈래(넘긴 것을 카드로)
  sorted_at   timestamptz,
  PRIMARY KEY (cell, id),
  UNIQUE (cell, connector, ref),
  CHECK ((state = 'new') = (text IS NOT NULL)),
  CHECK ((state = 'sorted') = (lane IS NOT NULL AND sorted_by IS NOT NULL AND sorted_at IS NOT NULL))
);
CREATE INDEX inbox_items_new ON catchup.inbox_items (cell, received_at) WHERE state = 'new';
CREATE INDEX inbox_items_recent ON catchup.inbox_items (cell, sorted_at DESC) WHERE state = 'sorted';
CREATE INDEX inbox_items_thread ON catchup.inbox_items (cell, connector, thread);

ALTER TABLE catchup.inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catchup.inbox_items FORCE ROW LEVEL SECURITY;
CREATE POLICY own_cell ON catchup.inbox_items USING (cell = catchup.current_cell()) WITH CHECK (cell = catchup.current_cell());
GRANT SELECT, INSERT, UPDATE ON catchup.inbox_items TO catchup_app;

-- 에이전트 일꾼이 볼 칸: 가를 글이 있고 모델에 로그인된 칸
CREATE FUNCTION front.cells_with_inbox() RETURNS TABLE (cell uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT i.cell FROM catchup.inbox_items i
  JOIN catchup.cells c ON c.cell = i.cell AND c.state = 'active'
  JOIN catchup.codex_logins l ON l.cell = i.cell AND l.state = 'in'
  WHERE i.state = 'new' GROUP BY i.cell ORDER BY min(i.received_at) LIMIT 500
$$;
REVOKE ALL ON FUNCTION front.cells_with_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION front.cells_with_inbox() TO catchup_app;

-- 가를 때 넣은 맥락 꾸러미도 남겨요
ALTER TABLE catchup.context_packs DROP CONSTRAINT context_packs_purpose_check;
ALTER TABLE catchup.context_packs ADD CONSTRAINT context_packs_purpose_check CHECK (purpose IN ('draft', 'session', 'ask', 'sort'));
