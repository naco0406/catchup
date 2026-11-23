# EC2로 옮기기(3.5단계)

로컬에서 쓰던 이미지를 그대로 올려요. 이 폴더는 로컬 구성(`infra/local/compose.yaml`) 위에 얹는 것만 담아요.

**지금 상태(2026-11-23):** AWS 자원은 아직 하나도 만들지 않았어요. 소유자가 구성안과 내려받기(Caddy · AWS CLI)를 승인했고, 남은 것은 AWS CLI 로그인(소유자가 직접)과 만들기 직전의 값 확인이에요.

- EC2 구성을 로컬에서 HTTPS로 띄워(`try-local.sh`) 실제 서버 화면 시험 79개가 모두 통과했어요. 쿠키는 Secure · HttpOnly · SameSite=Strict, 보안 정책 위반 0, 밖에 열린 포트는 앞단의 80 · 443뿐이었어요.
- AWS 쪽(`stack.yaml` · `aws.sh` · `host.sh`)은 문법만 봤어요. **한 번도 돌려 보지 못했어요.**

## 구성안

| 무엇 | 안 | 왜 |
|---|---|---|
| 지역 | 서울(ap-northeast-2) | 가까워서 빨라요. 값은 버지니아보다 조금 비싸요 |
| 인스턴스 | t4g.medium(ARM · 2 vCPU · 4GB) 한 대, CPU 크레딧은 표준(다 써도 값이 더 붙지 않아요) | 이미지가 arm64예요(고정한 Codex 묶음이 arm64). 로컬 VM이 4GB로 돌았어요. 코딩 세션 셋이 동시에 빌드하면 모자랄 수 있어요 → 그때 t4g.large(8GB) |
| 디스크 | gp3 30GB, 암호화 켬 | Codex가 대화 내용을 평문 로그로 남겨요. 디스크째 암호화해요 |
| 주소 | 고정 IP 하나 + 이름 하나(예: `app.catchup.naco.im`) | 소개 페이지(`catchup.naco.im`)는 그대로 Cloudflare에 둬요. DNS는 Cloudflare에서 A 레코드 하나(프록시 끔) |
| 여는 문 | 80 · 443만 | 인증서는 앞단(Caddy)이 알아서 받아요. 관리 접속은 22번을 열지 않고 Session Manager로 |
| 열쇠 | 바깥 열쇠 · DB 비밀번호를 Parameter Store(SecureString)에 | 인스턴스 역할만 읽어요. 값은 화면 · 저장소 · 이미지에 남기지 않아요 |
| 백업 | 매일 `infra/ops/pg.sh dump` → S3(비공개 · 암호화 · 30일 보관) | 바깥 열쇠는 Parameter Store에 따로 있어서, 백업 파일만으로는 잠근 값을 열 수 없어요 |
| 로그인 | 지금처럼 한 번 쓰는 코드를 서버에서 받아요 | 메일로 코드를 보내려면 발송 서비스 신청이 필요해요(Q11 보류) |

비용은 한 달 35~40달러쯤으로 봐요: 인스턴스 30달러쯤, 고정 IP 3.65달러, 디스크 3달러쯤, 백업 버킷은 몇 센트. **값은 AWS 가격표에서 다시 확인해야 해요**(찾아본 곳마다 서울 값이 달랐어요). 자원을 만들기 전에 정확한 값을 읽어서 알려 드려요.

## 만든 것

| 파일 | 내용 | 확인 |
|---|---|---|
| `infra/ops/pg.sh` | 백업 · 복구. 빈 DB에만 되살려요 | `node services/api/tests/backup.mjs` 통과 |
| `compose.yaml` | 포트 닫기 · HTTPS 쿠키 · 서비스 주소 · 앞단(web) | 로컬에서 HTTPS로 띄워 화면 시험 79개 통과 |
| `Caddyfile` · `tls-*.caddy` | 인증서 · 보안 머리말 · `/v1`만 서버로 · 웹 앱. 없는 길은 404 | 위와 같아요. 진짜 인증서 받기는 EC2에서 |
| `infra/docker/web.Dockerfile` | 앞단 이미지(Caddy 2.11.9를 지문으로 고정 + 구운 웹 앱) | 위와 같아요 |
| `try-local.sh` | 이 구성을 `https://localhost:8443`에 따로 띄워 봐요. `run`으로 시험을 그쪽에 돌려요 | 썼어요 |
| `stack.yaml` | AWS 자원: 인스턴스(디스크 암호화 · 크레딧 표준) · 고정 IP · 방화벽(80 · 443) · 역할 · 백업 버킷(30일) · 이미지 저장소 | **돌려 보지 못했어요** |
| `aws.sh` | Mac에서: 값 읽기 · 스택 확인 · 만들기 · 이미지 올려 띄우기 · 서버 명령 · 지우기 | **돌려 보지 못했어요** |
| `host.sh` | 서버에서: 비밀값 만들기와 읽기(Parameter Store) · 이미지 받기 · 띄우기 · 백업을 버킷으로 · 복구 | **돌려 보지 못했어요** |
| `apps/web/public/manifest.webmanifest` · `icon-*.png` | 홈 화면에 추가(아이폰 웹 푸시의 조건) | 설치 정보가 읽히는 것까지. 알림은 진짜 인증서가 있어야 확인돼요 |

## 올리는 순서

```bash
zsh infra/ec2/aws.sh who
```

```bash
zsh infra/ec2/aws.sh price
```

```bash
zsh infra/ec2/aws.sh check
```

`create`는 돈이 드는 자원을 만들어요. 값을 보고 소유자가 승인한 뒤에만 돌려요.

```bash
zsh infra/ec2/aws.sh create app.catchup.naco.im
```

고정 IP를 Cloudflare DNS에 A 레코드로 넣은 뒤(프록시 끔) 올려요.

```bash
zsh infra/ec2/aws.sh ship
```

로그인 코드는 화면에 찍히니 소유자가 직접 받아요.

```bash
zsh infra/ec2/aws.sh run ops login-code <이메일>
```

## 아직 없는 것

- AWS에서 실제로 돌려 보기: 스택 만들기, 이미지 올리기, 띄우기, 진짜 인증서.
- 2 · 3단계 끝 기준을 EC2에서 다시 돌리기, 측정, 아이폰 웹 푸시 확인, 복구 연습(버킷의 백업으로).
- Codex 로그 · 세션 기록의 보관 기간.
- 메일로 로그인 코드 보내기(발송 서비스 신청이 필요해요, Q11 보류).

## 복구 순서(새 서버에서)

1. 같은 바깥 열쇠(`CATCHUP_MASTER_KEY`)로 환경 파일을 만들어요. 열쇠가 다르면 Codex 로그인과 알림 구독을 다시 해야 해요.
2. Postgres만 띄워요(빈 볼륨).
3. `CATCHUP_PG="docker compose … exec -T postgres" sh infra/ops/pg.sh restore <파일>`
4. 나머지를 띄워요. `migrate`는 할 일이 없고 앱 역할의 비밀번호만 넣어요.

진행 중이던 코딩 세션의 작업 폴더는 백업에 없어요. 되살린 뒤 그 세션은 실패로 끝나요.
