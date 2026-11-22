#!/bin/zsh
# CatchUp 전용 로컬 환경. AI1 · ~/.colima · ~/.ssh/config · Docker 기본 컨텍스트를 건드리지 않아요.
# 쓰는 법: zsh infra/local/local.sh up | stop | status | ops … | compose …
set -euo pipefail
ROOT="${0:A:h:h:h}"
L="$ROOT/.local"
export COLIMA_HOME="$L/colima" LIMA_HOME="$L/lima" DOCKER_CONFIG="$L/docker"
export DOCKER_HOST="unix://$L/colima/default/docker.sock"
unset DOCKER_CONTEXT
ENV_FILE="$L/secrets/compose.env"
MIN_FREE_GB=8

prepare() {
  umask 077
  mkdir -p "$COLIMA_HOME" "$LIMA_HOME" "$DOCKER_CONFIG" "$L/secrets"
  [[ -f "$DOCKER_CONFIG/config.json" ]] || print '{"cliPluginsExtraDirs":["/opt/homebrew/lib/docker/cli-plugins"]}' > "$DOCKER_CONFIG/config.json"
  if [[ ! -f "$ENV_FILE" ]]; then
    {
      print "CATCHUP_DB_OWNER_PASSWORD=$(openssl rand -hex 24)"
      print "CATCHUP_DB_APP_PASSWORD=$(openssl rand -hex 24)"
      print "CATCHUP_MASTER_KEY=$(openssl rand -hex 32)"
    } > "$ENV_FILE"
  fi
  grep -q '^CATCHUP_GATEWAY_SECRET=' "$ENV_FILE" || print "CATCHUP_GATEWAY_SECRET=$(openssl rand -hex 32)" >> "$ENV_FILE"
  # 웹 푸시 서명 열쇠(P-256 PKCS#8). 값은 화면에 찍지 않아요
  if ! grep -q '^CATCHUP_VAPID_KEY=' "$ENV_FILE"; then
    local key
    key=$(openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -outform DER | od -An -tx1 | tr -d ' \n')
    print "CATCHUP_VAPID_KEY=$key" >> "$ENV_FILE"
  fi
}

check_space() {
  local free=$(( $(df -k "$ROOT" | awk 'NR==2{print $4}') / 1024 / 1024 ))
  if (( free < MIN_FREE_GB )); then
    print -u2 "디스크 여유가 ${free}GB 예요. ${MIN_FREE_GB}GB 보다 적으면 띄우지 않아요."
    return 1
  fi
}

dc() { docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/local/compose.yaml" "$@"; }

case "${1:-}" in
  up)
    prepare; check_space
    # --mount none: Mac 의 파일을 VM 에 붙이지 않아요(샌드박스가 홈 폴더를 못 읽게)
    colima status >/dev/null 2>&1 || colima start --cpus 4 --memory 4 --disk 30 --runtime docker --vm-type vz \
      --mount none --activate=false --ssh-config=false --ssh-agent=false --binfmt=false
    dc build migrate agent sandbox-1 codehost
    dc up -d --wait postgres api worker agent codehost sandbox-1 sandbox-2 sandbox-3
    ;;
  ops)
    shift; prepare; dc run --rm --no-deps -T ops "$@"
    ;;
  stop)
    colima stop   # 멈추기만 해요. VM 과 데이터는 남아요
    ;;
  status)
    colima status; dc ps
    ;;
  compose)
    shift; prepare; dc "$@"
    ;;
  *)
    print -u2 "쓰는 법: zsh infra/local/local.sh up | stop | status | ops … | compose …"; exit 2
    ;;
esac
