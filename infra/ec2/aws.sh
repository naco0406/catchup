#!/bin/zsh
# Mac 에서 AWS 를 다루는 쪽(3.5단계). 먼저 AWS CLI 에 직접 로그인해 두세요 — 이 스크립트는 자격 증명을 묻거나 찍지 않아요.
# 쓰는 법: zsh infra/ec2/aws.sh who | price | check | create <사이트 주소> | ship | run <host.sh 명령…> | status | destroy
#   who      어느 계정 · 지역인지(계정 번호는 끝 네 자리만)
#   price    AWS 가격표에서 읽은 한 달 값
#   check    스택 정의가 맞는지, 무엇이 생길지(아무것도 만들지 않아요)
#   create   자원을 만들어요 — **돈이 들어요**. 끝나면 DNS 에 넣을 고정 IP 를 알려 줘요
#   ship     이미지를 만들어 올리고 서버에서 띄워요
#   run      서버에서 host.sh 를 돌려요(예: run status · run backup). 로그인 코드는 직접 돌려서 받으세요: run ops login-code <이메일>
#   destroy  자원을 지워요(백업 버킷은 남아요)
set -euo pipefail
ROOT="${0:A:h:h:h}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}" AWS_PAGER=""
STACK="${CATCHUP_STACK:-catchup}"
TYPE="${CATCHUP_INSTANCE_TYPE:-t4g.medium}"
DISK_GB="${CATCHUP_DISK_GB:-30}"
LOCATION="Asia Pacific (Seoul)"   # 가격표가 쓰는 지역 이름(AWS_REGION 을 바꾸면 같이 바꿔요)

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
local_docker() { zsh "$ROOT/infra/local/local.sh" docker "$@"; }
# 가격표는 us-east-1 에서만 읽을 수 있어요
usd() { aws pricing get-products --region us-east-1 --service-code "$1" --filters "${@:2}" --max-results 1 --query 'PriceList[0]' --output text \
  | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); t=next(iter(d["terms"]["OnDemand"].values())); print(next(iter(t["priceDimensions"].values()))["pricePerUnit"]["USD"])'; }
f() { print "Type=TERM_MATCH,Field=$1,Value=$2"; }

# 서버에서 명령을 돌리고 끝날 때까지 기다려 결과를 보여 줘요
remote() {
  local id=$(out Instance) cmd
  cmd=$(aws ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript --comment "catchup" \
    --parameters "$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]], "executionTimeout": ["1800"]}))' "$1")" \
    --query Command.CommandId --output text)
  # 1초마다 물어요(기본 기다리기는 5초 간격이라 짧은 명령에 느려요). 막 보낸 명령은 잠깐 '없음'으로 나와요
  local state=Pending
  while [[ "$state" == (Pending|InProgress|Delayed) ]]; do
    sleep 1
    state=$(aws ssm get-command-invocation --command-id "$cmd" --instance-id "$id" --query Status --output text 2> /dev/null || print Pending)
  done
  aws ssm get-command-invocation --command-id "$cmd" --instance-id "$id" --query StandardOutputContent --output text
  if [[ "$state" != Success ]]; then
    aws ssm get-command-invocation --command-id "$cmd" --instance-id "$id" --query StandardErrorContent --output text >&2
    print -u2 "서버 명령이 실패했어요($state)"; return 1
  fi
}

case "${1:-}" in
  who)
    account=$(aws sts get-caller-identity --query Account --output text)   # 로그인이 없으면 여기서 멈춰요
    print "계정 …${account: -4} · 지역 $AWS_REGION"
    ;;
  price)
    hour=$(usd AmazonEC2 "$(f instanceType $TYPE)" "$(f location $LOCATION)" "$(f operatingSystem Linux)" "$(f tenancy Shared)" "$(f preInstalledSw NA)" "$(f capacitystatus Used)")
    disk=$(usd AmazonEC2 "$(f productFamily Storage)" "$(f volumeApiName gp3)" "$(f location $LOCATION)")
    ip=$(usd AmazonVPC "$(f group VPCPublicIPv4Address)" "$(f groupDescription 'Hourly charge for In-use Public IPv4 Addresses')" "$(f location $LOCATION)")
    python3 - "$TYPE" "$hour" "$DISK_GB" "$disk" "$ip" <<'PY'
import sys
kind, hour, gb, disk, ip = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
rows = [(f"인스턴스 {kind}", hour * 730), (f"디스크 gp3 {gb:.0f}GB", gb * disk), ("고정 IP", ip * 730)]
for name, usd in rows: print(f"{name:<24} {usd:6.2f} USD/월")
print(f"{'합계(세금 · 전송량 빼고)':<20} {sum(u for _, u in rows):6.2f} USD/월")
PY
    ;;
  check)
    aws cloudformation validate-template --template-body "file://$ROOT/infra/ec2/stack.yaml" --query Description --output text
    ;;
  create)
    site=${2:?사이트 주소가 필요해요(예: app.example.com)}
    aws cloudformation deploy --stack-name "$STACK" --template-file "$ROOT/infra/ec2/stack.yaml" --capabilities CAPABILITY_IAM \
      --parameter-overrides "Site=$site" "InstanceType=$TYPE" "VolumeGb=$DISK_GB" --tags Project=catchup
    print "고정 IP: $(out Address) — DNS 에 $site 의 A 레코드로 넣어 주세요(프록시 끔)"
    ;;
  ship)
    tag="${2:-$(git -C "$ROOT" rev-parse --short HEAD)}"
    repo=$(out Repo) bucket=$(out Bucket)
    (cd "$ROOT/apps/web" && pnpm -s exec vite build --mode live --outDir dist-live)
    zsh "$ROOT/infra/local/local.sh" compose build migrate agent sandbox-1 codehost
    local_docker build --quiet -t catchup-web:local -f "$ROOT/infra/docker/web.Dockerfile" "$ROOT"
    aws ecr get-login-password | local_docker login --username AWS --password-stdin "${repo%%/*}" > /dev/null
    for image in api agent sandbox codehost web; do
      # ${image} — zsh 에서 $image:l 은 '소문자로'라는 뜻이라 괄호가 필요해요
      local_docker tag "catchup-${image}:local" "${repo}:${image}-${tag}"
      local_docker push --quiet "${repo}:${image}-${tag}"
    done
    # 저장소 로그인(12시간짜리)은 올린 뒤에 지워요
    local_docker logout "${repo%%/*}" > /dev/null
    # 서버가 읽을 구성과 스크립트(비밀값은 없어요)
    bundle=$(mktemp -t catchup-release).tgz
    tar -czf "$bundle" -C "$ROOT" infra/local/compose.yaml infra/ec2/compose.yaml infra/ec2/host.sh infra/ops/pg.sh
    aws s3 cp --only-show-errors "$bundle" "s3://$bucket/releases/$tag.tgz"
    rm -f "$bundle"
    remote "set -euo pipefail; aws s3 cp --only-show-errors s3://$bucket/releases/$tag.tgz /tmp/release.tgz; tar -xzf /tmp/release.tgz -C /opt/catchup; rm /tmp/release.tgz; bash /opt/catchup/infra/ec2/host.sh pull $tag; bash /opt/catchup/infra/ec2/host.sh up; bash /opt/catchup/infra/ec2/host.sh status"
    ;;
  run)
    shift
    remote "bash /opt/catchup/infra/ec2/host.sh ${(j: :)${(q)@}}"
    ;;
  status)
    aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].[StackStatus, Outputs[?OutputKey==`Address`].OutputValue | [0]]' --output text
    remote "bash /opt/catchup/infra/ec2/host.sh status"
    ;;
  destroy)
    print -n "스택 $STACK 의 인스턴스 · 디스크 · 고정 IP · 이미지를 지워요. DB 도 같이 사라져요(백업 버킷은 남아요). 지우려면 스택 이름을 적어 주세요: "
    read answer
    [[ "$answer" == "$STACK" ]] || { print "그만둘게요"; exit 1; }
    aws cloudformation delete-stack --stack-name "$STACK"
    aws cloudformation wait stack-delete-complete --stack-name "$STACK"
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2
    ;;
esac
