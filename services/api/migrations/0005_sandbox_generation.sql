-- Codex 는 끊긴 실행 연결을 다시 잇지 않아요(실측). 그래서 자리가 다시 켜질 때마다 새 실행 환경을 등록해요.
ALTER TABLE catchup.agent_sessions ADD COLUMN sandbox_boot uuid;   -- 이 차례가 쓰는 자리의 세대
