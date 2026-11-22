#!/bin/zsh
# 2단계 완료 기준 시험. 이번에 만든 시험 DB(이름 머리가 같은 것)만 치워요.
# 쓰는 법: zsh services/api/tests/run.sh [cargo test 에 넘길 인자]
set -euo pipefail
ROOT="${0:A:h:h:h:h}"
set -a; source "$ROOT/.local/secrets/compose.env"; set +a
export CATCHUP_TEST_PREFIX="catchup_t$$x$(date +%s)"
pg() { zsh "$ROOT/infra/local/local.sh" compose exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U catchup_owner -d postgres "$@" < /dev/null; }
cleanup() {
  for name in ${(f)"$(pg -Atc "SELECT datname FROM pg_database WHERE starts_with(datname, '${CATCHUP_TEST_PREFIX}_')")"}; do
    [[ "$name" == ${CATCHUP_TEST_PREFIX}_* ]] && pg -c "DROP DATABASE $name WITH (FORCE)"
  done
}
trap cleanup EXIT
zsh "$ROOT/infra/local/cargo.sh" test -p catchup-api --locked --test stage2 "$@" -- --test-threads=4
