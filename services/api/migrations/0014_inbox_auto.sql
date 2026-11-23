-- 4단계: 자동으로 온 글(영수증 · 알림 · 발신 전용 주소)을 사람이 보낸 글과 갈라요.
-- '사람이 나에게 직접 보낸 글은 넘기지 않아요'가 자동 알림까지 알려만 드려요로 올리던 것을 고쳐요(2026-11-23 평가).
ALTER TABLE catchup.inbox_items ADD COLUMN auto boolean NOT NULL DEFAULT false;
