# CatchUp 서버

`docs/design/decision-inbox/plan.md` 2단계예요. Rust · axum · sqlx · Postgres. API와 일꾼은 같은 이미지의 다른 명령이에요.

## 띄우기

```bash
pnpm backend:up
```

```bash
zsh infra/local/local.sh ops provision me@example.test
```

```bash
zsh infra/local/local.sh ops login-code me@example.test
```

```bash
pnpm dev:live
```

http://127.0.0.1:5181 에서 그 이메일과 코드로 들어가요. 끌 때는 `pnpm backend:stop`(데이터는 남아요).

예시 20장이 든 데모 계정(`demo@example.test`): `pnpm backend:demo` → `zsh infra/local/local.sh ops login-code demo@example.test`

손으로 카드 넣기: `NewCard` 배열(JSON)을 `zsh infra/local/local.sh ops seed <이메일>`의 표준 입력으로 줘요. 본보기는 `tests/live.mjs`.

## Codex(3단계)

에이전트 일꾼은 `.local/codex/0.163.0-linux-arm64`에 푼 공식 묶음으로 구워요(`infra/codex/*.sha256`과 다르면 빌드가 멈춰요).
받는 곳: openai/codex `rust-v0.163.0`의 `codex-app-server-package-aarch64-unknown-linux-musl.tar.gz`
(sha256 `9749a312a24db3c8a24683785595b5e556916694a648259fc3742a118f46a28c`).

샌드박스는 `codex-aarch64-unknown-linux-musl.tar.gz`(같은 판, sha256 `a7261e65f4a96d8f4ca65a069c6cf2dc2c33defc341e48078acefda9461fffe4`)를
`.local/codex/0.163.0-linux-arm64-cli`에 풀어서 구워요.

| 파일 | 맡는 일 |
|---|---|
| `src/codex/hub.rs` · `rpc.rs` · `home.rs` · `account.rs` | 칸마다 app-server 하나, 로그인 |
| `src/codex/sandbox.rs` · `lanes.rs` | 샌드박스 한 자리와 거기로 가는 통로(세션 · 자리 세대마다) |
| `src/codex/runner.rs` · `sessions.rs` | 세션. DB가 원본이고 언제 죽어도 이어요 |
| `src/codex/request.rs` · `bridge.rs` | 승인 · 질문 ↔ 카드 |
| `src/codex/gateway.rs` · `drafts.rs` | LLM 창구, 말로 답하기 |

로그인은 웹의 '연결' 화면에서, 일 맡기기는 '코딩 세션' 화면에서 해요. 시험(`codex-sessions.mjs --wait-minutes 61`은 진짜 한 시간):

```bash
pnpm test:codex
```

## 이어지는 비서(3.6단계)

기억은 따로 베껴 두지 않고 이미 남긴 것에서 뷰(`catchup.memories`)로 읽어 내요. 모델이 쓰는 것은 약속 뽑기와 비서에게 한 말의 갈래 고르기뿐이고, 둘 다 서버가 정해진 일만 실행해요.

| 파일 | 맡는 일 |
|---|---|
| `src/memory.rs` | 기억 읽기 · 고치기 · 지우기 · 알려 주기, 모델에 넣는 맥락 꾸러미(초안 · 세션 · 묻기)와 그 기록 |
| `src/promises.rs` | 내가 보낸 글의 약속(낌새가 있을 때만 모델에 물어요), 약속한 날이 되면 카드로 올리기 |
| `src/assistant.rs` | 비서에게 말하기: 기억해 · 물어봐 · 일 맡겨 · 카드 찾기. 일과 카드는 내가 눌러야 실행돼요 |
| `src/codex/talk.rs` | 위 둘의 모델 호출(글만, 도구 없음) |

실제 모델로 재는 평가(ChatGPT 한도를 써요. 그 계정의 기억을 모두 '지움'으로 돌려요):

```bash
node services/api/tests/memory-eval.mjs
```

기억이 많을 때의 속도:

```bash
CATCHUP_MEASURE=$PWD/.local/memory-scale.txt zsh services/api/tests/run.sh memory_at_scale
```

## 시험

```bash
pnpm test:api
```

```bash
pnpm test:live
```

```bash
node services/api/tests/resilience.mjs
```

| 시험 | 보는 것 |
|---|---|
| `tests/schema.sh` | DB가 스스로 막는 것: 칸 경계(RLS) · 한 번만 · 영수증은 못 지움 |
| `tests/stage2.rs` | 2단계 끝 기준과 3.6단계(기억 · 약속 · 비서에게 말하기). 진짜 Postgres + 일부러 죽고 막히는 커넥터 |
| `tests/memory-eval.mjs` | 실제 모델로 기억이 초안 · 답 · 세션에 반영되는지(문항은 `docs/eval/memory-cases.md`) |
| `tests/live.mjs` | 실제 컨테이너를 HTTP로: 로그인 · SSE · 10초 · 강제 종료 · 측정 |
| `tests/resilience.mjs` | 칸 200개 · Postgres 강제 종료 |
| `apps/web/e2e-live` | 실제 서버에 붙은 화면(아이패드 · 아이폰 · 데스크톱) |

## 구조

| 파일 | 맡는 일 |
|---|---|
| `migrations/` | 표 · RLS · 칸을 고르기 전의 좁은 문(`front.*`) |
| `src/cards.rs` | 답 · 되돌리기 · 말로 답하기 · 미루기 |
| `src/worker.rs` | 실행 · 복구 · 낡음 · 실패 카드. 칸마다 따로 |
| `src/executor.rs` | 커넥터가 구현할 네 가지: 원본 읽기 · 실행 · 찾기 · 되돌리기 |
| `src/local.rs` | 로컬 커넥터. 밖으로 안 보내고 표에 남겨요 |
| `src/push.rs` | 웹 푸시(RFC 8291 · 8292) |
| `src/http.rs` · `src/events.rs` | API · SSE |
| `src/crypto.rs` · `src/vault.rs` | 칸 키와 잠근 값 |

## 지킬 것

- 칸의 표는 `Db::cell_tx`로만 만져요. 새 표에는 `cell` 첫 열쇠와 FORCE RLS(시험이 봐요).
- 커넥터의 멱등 열쇠는 영수증 id예요. 일어났는지 모르면 `Unknown` — 저절로 다시 하지 않아요.
- 모델을 고치면 `pnpm contracts`로 OpenAPI와 화면 타입을 다시 만들어요.
- 로그 · 오류에 비밀값 · 본문 · SQL을 싣지 않아요.
- 로그인이 있는 app-server에 로컬 실행 환경을 주지 않아요. 명령은 비밀 없는 샌드박스에서만.
- 샌드박스에 망 · 비밀값 · Docker 소켓을 주지 않아요. 바꾸면 `codex-sessions.mjs`의 탈출 시험을 다시 돌려요.
- Codex는 끊긴 실행 연결을 다시 잇지 않아요. 같은 사람으로 세션을 연달아 돌리는 시험(`again`)을 빼지 않아요.
- 밖으로 나가는 User-Agent · clientInfo에 프로젝트 · 사람의 이름을 싣지 않아요.

## 로컬과 EC2(3.5단계)의 차이

| 로컬 | EC2에서 바꿀 것 |
|---|---|
| 바깥 열쇠가 `.local/secrets` 파일 | 관리형 키 보관소 |
| 로그인 코드를 CLI로 받음 | 메일 · Google · Apple |
| `CATCHUP_INSECURE_COOKIE=1` | 빼요(HTTPS) |
| 푸시 연락처 `https://localhost` | 서비스 주소 |
