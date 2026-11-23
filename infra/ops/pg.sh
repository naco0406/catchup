#!/bin/sh
# Postgres 백업과 복구 — 로컬과 EC2(3.5단계)가 같은 것을 써요.
#   CATCHUP_PG 는 postgres 컨테이너 안에서 명령을 돌리는 머리말이에요.
#     로컬: CATCHUP_PG="zsh infra/local/local.sh compose exec -T postgres"
#     EC2 : CATCHUP_PG="docker compose … exec -T postgres"
# 쓰는 법: sh infra/ops/pg.sh dump <파일> | restore <파일>
#
# 백업에는 카드 · 답 · 기억이 그대로 들어 있어요(암호화되지 않은 파일이에요). 잠근 값(Codex 로그인 · 알림 구독)은
# 잠긴 채로 들어 있어서, 바깥 열쇠(CATCHUP_MASTER_KEY)를 따로 보관해 두지 않으면 되살려도 열 수 없어요.
set -eu
: "${CATCHUP_PG:?CATCHUP_PG 가 필요해요(파일 머리의 설명을 보세요)}"
file=${2:?파일 이름이 필요해요}

case "${1:-}" in
  dump)
    umask 077
    # 반쯤 쓴 파일이 백업처럼 남지 않게: 다 쓰고, 읽히는지 확인한 뒤에 이름을 붙여요
    $CATCHUP_PG pg_dump --username catchup_owner --dbname catchup --format custom --compress 6 > "$file.part"
    $CATCHUP_PG pg_restore --list < "$file.part" > /dev/null
    mv "$file.part" "$file"
    ;;
  restore)
    # 빈 DB 에만 되살려요. 쓰던 DB 위에 덮어쓰지 않아요
    have=$($CATCHUP_PG psql -X -Atq --username catchup_owner --dbname catchup \
      --command "SELECT count(*) FROM pg_namespace WHERE nspname IN ('catchup', 'front')" < /dev/null)
    if [ "$have" != 0 ]; then
      echo "catchup DB 가 비어 있지 않아요. 새 Postgres(빈 볼륨)에만 되살릴 수 있어요." >&2
      exit 1
    fi
    # 앱 역할은 DB 밖(클러스터)에 있어서 백업에 없어요. 비밀번호는 다음 migrate 가 넣어요
    $CATCHUP_PG psql -X -q -v ON_ERROR_STOP=1 --username catchup_owner --dbname catchup --command \
      "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catchup_app') THEN
         CREATE ROLE catchup_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END \$\$" < /dev/null
    $CATCHUP_PG pg_restore --username catchup_owner --dbname catchup --exit-on-error --single-transaction < "$file"
    ;;
  *)
    echo "쓰는 법: sh infra/ops/pg.sh dump <파일> | restore <파일>" >&2
    exit 2
    ;;
esac
