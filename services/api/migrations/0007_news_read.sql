-- 알려만 드려요(kind = 'fyi')를 읽음으로 — 밀어서 넘기면 덱에서 빠지고, 되돌리면 다시 열려요(Q7 · docs/design/swipe-deck).
-- 결정이 필요한 카드는 읽음이 될 수 없어요.
ALTER TABLE catchup.decision_cards DROP CONSTRAINT decision_cards_state_check;
ALTER TABLE catchup.decision_cards ADD CONSTRAINT decision_cards_state_check
  CHECK (state IN ('open', 'answered', 'snoozed', 'handed_off', 'expired', 'read'));
ALTER TABLE catchup.decision_cards ADD CONSTRAINT decision_cards_read_is_news CHECK (state <> 'read' OR kind = 'fyi');

ALTER TABLE catchup.card_answers DROP CONSTRAINT card_answers_kind_check;
ALTER TABLE catchup.card_answers ADD CONSTRAINT card_answers_kind_check CHECK (kind IN ('option', 'snooze', 'handoff', 'read'));
