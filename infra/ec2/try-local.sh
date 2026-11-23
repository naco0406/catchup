#!/bin/zsh
# EC2 구성을 로컬에서 돌려 봐요 — 같은 이미지 · 같은 앞단을 https://localhost:8443 에. 인증서는 Caddy 가 스스로 만든 것이에요.
# 쓰던 로컬 묶음(catchup)과 DB · 볼륨을 나누지 않아요(묶음 이름 catchup-ec2try). 메모리가 모자라서 그동안 쓰던 묶음은 멈춰 둬요.
# 쓰는 법: zsh infra/ec2/try-local.sh up | down | run <명령…>
#   run 은 이 묶음을 가리키게 한 채로 명령을 돌려요. 예: zsh infra/ec2/try-local.sh run pnpm --dir apps/web e2e:live
set -euo pipefail
ROOT="${0:A:h:h:h}"
PORT=8443
export CATCHUP_SITE=localhost CATCHUP_TLS_MODE=internal CATCHUP_ORIGIN="https://localhost:$PORT"
export CATCHUP_HTTP_BIND=127.0.0.1:8080 CATCHUP_HTTPS_BIND="127.0.0.1:$PORT"
TRY="-p catchup-ec2try -f $ROOT/infra/ec2/compose.yaml"
main() { zsh "$ROOT/infra/local/local.sh" "$@"; }
try() { CATCHUP_COMPOSE_EXTRA="$TRY" zsh "$ROOT/infra/local/local.sh" "$@"; }

case "${1:-}" in
  up)
    (cd "$ROOT/apps/web" && pnpm -s exec vite build --mode live --outDir dist-live)
    main compose stop
    try compose build web
    try compose up -d --wait postgres api worker agent codehost sandbox-1 sandbox-2 sandbox-3 web
    print "https://localhost:$PORT 에 떴어요. 끝나면: zsh infra/ec2/try-local.sh down"
    ;;
  down)
    try compose down --volumes
    main compose up -d --wait postgres api worker agent codehost sandbox-1 sandbox-2 sandbox-3
    ;;
  run)
    shift
    CATCHUP_COMPOSE_EXTRA="$TRY" CATCHUP_WEB="https://localhost:$PORT" "$@"
    ;;
  *)
    print -u2 "쓰는 법: zsh infra/ec2/try-local.sh up | down | run <명령…>"; exit 2
    ;;
esac
