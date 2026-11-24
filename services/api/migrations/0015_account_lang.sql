-- 언어 잇기(2026-11-23): 화면에서 언어를 바꾸면 계정의 언어도 바뀌어요.
-- 계정 언어(cells.lang)는 토마토가 쓰는 글(카드, 답, 초안)의 언어예요. 지금까지는 계정을 만들 때만 정해져서,
-- 화면을 영어로 바꿔도 한국어로 답했어요.
-- 1) 앱 접속(catchup_app)이 자기 칸의 lang 만 고칠 수 있게 해요. 줄 단위 권한(own_cell)이 다른 칸을 막아요.
-- 2) 제품의 기본 언어가 영어라서 새 계정의 기본값도 영어예요. 이미 있는 계정은 그대로 둬요.
GRANT UPDATE (lang) ON catchup.cells TO catchup_app;
ALTER TABLE catchup.cells ALTER COLUMN lang SET DEFAULT 'en';
