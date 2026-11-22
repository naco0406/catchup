#!/bin/zsh
# 진짜 Postgres 에서 칸 경계와 '한 번만'을 시험해요. 제가 만든 시험 DB 하나만 쓰고 지워요.
# 쓰는 법: zsh services/api/tests/schema.sh
set -euo pipefail
ROOT="${0:A:h:h:h:h}"
DB="catchup_schema_test_$$_$(date +%s)"
# CI 에는 Colima 가 없어서 psql 로 바로 붙어요(CATCHUP_PSQL)
pg() {
  local -a psql
  if [[ -n "${CATCHUP_PSQL:-}" ]]; then psql=(${=CATCHUP_PSQL})
  else psql=(zsh "$ROOT/infra/local/local.sh" compose exec -T postgres psql); fi
  "${psql[@]}" -X -q -v ON_ERROR_STOP=1 -U catchup_owner "$@"
}
pg -d postgres -c "CREATE DATABASE $DB"
trap 'pg -d postgres -c "DROP DATABASE $DB"' EXIT
for m in "$ROOT"/services/api/migrations/*.sql; do pg -d "$DB" < "$m"; done

pg -d "$DB" <<'SQL'
INSERT INTO catchup.cells (cell, wrapped_key) VALUES
 ('00000000-0000-0000-0000-00000000000a', '\x00'), ('00000000-0000-0000-0000-00000000000b', '\x00');
INSERT INTO front.accounts (cell, email) VALUES ('00000000-0000-0000-0000-00000000000a', 'a@example.test');
INSERT INTO front.login_codes SELECT id, '\x01', now() + interval '5 minutes', 0 FROM front.accounts;

CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO catchup_app;
CREATE FUNCTION t.ok(p boolean, name text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF p IS NOT TRUE THEN RAISE EXCEPTION '실패: %', name; END IF; RAISE NOTICE 'ok  %', name; END $$;
CREATE FUNCTION t.refuses(q text, name text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  BEGIN EXECUTE q; EXCEPTION WHEN insufficient_privilege OR unique_violation OR foreign_key_violation OR check_violation THEN RAISE NOTICE 'ok  %', name; RETURN; END;
  RAISE EXCEPTION '실패(막지 못함): %', name;
END $$;

SELECT t.ok(NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'catchup' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)), '칸의 모든 표에 FORCE RLS');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
  WHERE n.nspname = 'catchup' AND i.indisprimary AND a.attname <> 'cell'), '칸의 모든 표는 첫 열쇠가 cell');
SELECT t.ok((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname = 'catchup_app'), '앱 역할은 RLS 를 못 건너뜀');

SET ROLE catchup_app;
SELECT t.ok((SELECT count(*) = 0 FROM catchup.cells), '칸을 안 고르면 아무것도 안 보임');
SELECT t.refuses('SELECT * FROM front.accounts', '앞단의 표는 직접 못 읽음');
SELECT t.refuses('SELECT * FROM front.devices', '세션 표는 직접 못 읽음');

SET catchup.cell = '00000000-0000-0000-0000-00000000000b';
INSERT INTO catchup.decision_cards (cell, id, dedupe_key, kind, source, source_ref, source_version, question, options)
 VALUES (catchup.current_cell(), '00000000-0000-0000-0000-0000000000b1', 'k', 'choose', '{}', 'r', '1', 'q', '[]');
SELECT catchup.emit('card', NULL);

SET catchup.cell = '00000000-0000-0000-0000-00000000000a';
SELECT t.ok((SELECT count(*) = 1 FROM catchup.cells), '내 칸만 보임');
SELECT t.ok((SELECT count(*) = 0 FROM catchup.decision_cards), '남의 카드가 안 보임');
SELECT t.ok((SELECT count(*) = 0 FROM catchup.cell_events), '남의 사건이 안 보임');
WITH u AS (UPDATE catchup.decision_cards SET question = 'x' WHERE id = '00000000-0000-0000-0000-0000000000b1' RETURNING 1)
SELECT t.ok((SELECT count(*) = 0 FROM u), '남의 카드를 못 고침');
SELECT t.refuses($q$INSERT INTO catchup.decision_cards (cell, dedupe_key, kind, source, source_ref, source_version, question, options)
 VALUES ('00000000-0000-0000-0000-00000000000b', 'x', 'choose', '{}', 'r', '1', 'q', '[]')$q$, '남의 칸에 못 씀');
SELECT t.refuses($q$INSERT INTO catchup.card_answers (cell, card, request_key, request_hash, card_version, kind, surface)
 VALUES (catchup.current_cell(), '00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), '\x01', 1, 'handoff', 'web')$q$, '남의 카드에 답 못 함');

INSERT INTO catchup.decision_cards (cell, id, dedupe_key, kind, source, source_ref, source_version, question, options)
 VALUES (catchup.current_cell(), '00000000-0000-0000-0000-0000000000a1', 'k', 'choose', '{}', 'r', '1', 'q', '[]');
SELECT t.refuses($q$INSERT INTO catchup.decision_cards (cell, dedupe_key, kind, source, source_ref, source_version, question, options)
 VALUES (catchup.current_cell(), 'k', 'choose', '{}', 'r', '1', 'q', '[]')$q$, '같은 카드는 두 번 안 생김');
INSERT INTO catchup.card_answers (cell, id, card, request_key, request_hash, card_version, kind, option_index, chosen, surface) VALUES
 (catchup.current_cell(), '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '\x01', 1, 'option', 0, '{}', 'web'),
 (catchup.current_cell(), '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', '\x02', 1, 'option', 1, '{}', 'web');
SELECT t.refuses($q$INSERT INTO catchup.card_answers (cell, card, request_key, request_hash, card_version, kind, surface)
 VALUES (catchup.current_cell(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', '\x01', 1, 'handoff', 'web')$q$, '같은 요청 열쇠는 답 하나');
INSERT INTO catchup.action_receipts (cell, card, answer, effect, source_ref, source_version, run_after)
 VALUES (catchup.current_cell(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '{}', 'r', '1', now() + interval '10 seconds');
SELECT t.refuses($q$INSERT INTO catchup.action_receipts (cell, card, answer, effect, source_ref, source_version, run_after)
 VALUES (catchup.current_cell(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', '{}', 'r', '1', now())$q$, '한 카드에 실행은 하나');
SELECT t.refuses('DELETE FROM catchup.action_receipts', '영수증은 못 지움');
SELECT t.refuses('UPDATE catchup.card_answers SET draft = ''x''', '답은 고쳐 쓰지 못함');
SELECT t.ok((SELECT count(*) = 0 FROM front.cells_with_work(10)), '10초 전에는 일꾼에게 안 보임');
UPDATE catchup.action_receipts SET run_after = now();
SELECT t.ok((SELECT array_agg(cell) = ARRAY['00000000-0000-0000-0000-00000000000a'::uuid] FROM front.cells_with_work(10)), '때가 되면 그 칸만 보임');
UPDATE catchup.action_receipts SET state = 'running', lease_until = now() + interval '30 seconds';
SELECT t.ok((SELECT count(*) = 0 FROM front.cells_with_work(10)), '실행 중에는 다시 안 잡힘');
UPDATE catchup.action_receipts SET lease_until = now() - interval '1 second';
SELECT t.ok((SELECT count(*) = 1 FROM front.cells_with_work(10)), '죽은 실행은 다시 살핌');
SELECT t.ok(catchup.emit('card', NULL) = 1 AND catchup.emit('card', NULL) = 2, '사건 번호는 칸마다 따로');

SELECT t.ok(front.login('a@example.test', '\x09', '\xaa', 'test') IS NULL, '틀린 코드로 로그인 안 됨');
SELECT t.ok(front.login('a@example.test', '\x01', '\xaa', 'test') IS NOT NULL, '코드로 로그인');
SELECT t.ok(front.login('a@example.test', '\x01', '\xbb', 'test') IS NULL, '코드는 한 번만');
SELECT t.ok((SELECT cell = '00000000-0000-0000-0000-00000000000a' FROM front.resolve_session('\xaa')), '세션은 제 칸으로');
SELECT front.logout('\xaa');
SELECT t.ok((SELECT count(*) = 0 FROM front.resolve_session('\xaa')), '로그아웃하면 끝');
SQL
echo "칸 경계 시험 통과"
