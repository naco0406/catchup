#!/bin/bash
# EC2 호스트에서 도는 쪽(3.5단계). Mac 에서는 infra/ec2/aws.sh 가 이걸 불러요(22번 포트 없이, Systems Manager 로).
# 쓰는 법: bash /opt/catchup/infra/ec2/host.sh pull <판> | up | status | ops … | backup | restore <s3 열쇠>
# 비밀값은 Parameter Store 에만 있고, 뜰 때 /run(메모리)으로 읽어요. 화면에 찍지 않아요.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# shellcheck disable=SC1091
set -a; source /etc/catchup.env; set +a
export AWS_DEFAULT_REGION="$CATCHUP_REGION"
RUN=/run/catchup
ENV_FILE="$RUN/compose.env"
COMPOSE="docker compose -p catchup --env-file $ENV_FILE -f $ROOT/infra/local/compose.yaml -f $ROOT/infra/ec2/compose.yaml"
dc() { $COMPOSE "$@"; }
SERVICES="postgres api worker agent codehost sandbox-1 sandbox-2 sandbox-3 web"

# 없는 비밀값만 만들어 넣어요(있는 것은 덮어쓰지 않아요). 값은 명령 줄에 싣지 않고 메모리 파일로 넘겨요
make_secret() {
  local name="$CATCHUP_PARAMS/$1" tmp="$RUN/new-secret"
  aws ssm get-parameter --name "$name" --query Parameter.Name --output text > /dev/null 2>&1 && return 0
  ( umask 077; shift; "$@" | tr -d '\n' > "$tmp" )
  aws ssm put-parameter --name "$name" --type SecureString --value "file://$tmp" --no-overwrite > /dev/null
  rm -f "$tmp"
}
vapid_key() { openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -outform DER | od -An -tx1 | tr -d ' \n'; }

secrets() {
  install -d -m 0700 "$RUN"
  make_secret CATCHUP_DB_OWNER_PASSWORD openssl rand -hex 24
  make_secret CATCHUP_DB_APP_PASSWORD openssl rand -hex 24
  make_secret CATCHUP_MASTER_KEY openssl rand -hex 32
  make_secret CATCHUP_GATEWAY_SECRET openssl rand -hex 32
  make_secret CATCHUP_VAPID_KEY vapid_key
  ( umask 077
    aws ssm get-parameters-by-path --path "$CATCHUP_PARAMS" --with-decryption --query 'Parameters[].[Name,Value]' --output text \
      | while IFS=$'\t' read -r name value; do printf '%s=%s\n' "${name##*/}" "$value"; done > "$ENV_FILE.new" )
  [ "$(wc -l < "$ENV_FILE.new")" -ge 5 ] || { echo "비밀값을 다 읽지 못했어요" >&2; exit 1; }
  mv "$ENV_FILE.new" "$ENV_FILE"
}

case "${1:-}" in
  pull)
    tag=${2:?판이 필요해요}
    aws ecr get-login-password | docker login --username AWS --password-stdin "${CATCHUP_REPO%%/*}" > /dev/null
    for image in api agent sandbox codehost web; do
      docker pull --quiet "$CATCHUP_REPO:$image-$tag"
      docker tag "$CATCHUP_REPO:$image-$tag" "catchup-$image:local"
    done
    echo "$tag" > /opt/catchup/RELEASE
    ;;
  up)
    secrets
    dc up -d --wait --no-build $SERVICES
    docker image prune -f > /dev/null
    ;;
  status)
    cat /opt/catchup/RELEASE 2> /dev/null || true
    [ -f "$ENV_FILE" ] || secrets
    dc ps --format 'table {{.Service}}\t{{.Status}}'
    df -h / | tail -1
    free -m | sed -n 2p
    ;;
  ops)
    shift
    [ -f "$ENV_FILE" ] || secrets
    dc run --rm --no-deps -T ops "$@"
    ;;
  backup)
    [ -f "$ENV_FILE" ] || secrets
    file="/var/backups/catchup/catchup-$(date -u +%Y%m%dT%H%M%SZ).dump"
    CATCHUP_PG="$COMPOSE exec -T postgres" sh "$ROOT/infra/ops/pg.sh" dump "$file"
    aws s3 cp --only-show-errors "$file" "s3://$CATCHUP_BUCKET/backups/"
    # 호스트에는 사흘 치만. 버킷은 30일 뒤에 스스로 지워요
    find /var/backups/catchup -name 'catchup-*.dump' -mtime +3 -delete
    echo "backups/$(basename "$file") $(stat -c %s "$file")"
    ;;
  restore)
    # 빈 Postgres 에만 되살려요(infra/ops/pg.sh 가 막아요). 순서는 infra/ec2/README.md 의 '복구 순서'
    key=${2:?버킷 안의 열쇠가 필요해요(예: backups/catchup-….dump)}
    [ -f "$ENV_FILE" ] || secrets
    file="/var/backups/catchup/restore-$$.dump"
    aws s3 cp --only-show-errors "s3://$CATCHUP_BUCKET/$key" "$file"
    dc up -d --wait --no-build postgres
    CATCHUP_PG="$COMPOSE exec -T postgres" sh "$ROOT/infra/ops/pg.sh" restore "$file"
    rm -f "$file"
    ;;
  *)
    echo "쓰는 법: host.sh pull <판> | up | status | ops … | backup | restore <s3 열쇠>" >&2
    exit 2
    ;;
esac
