# CatchUp — 시안 · 설계 · 계획

2026-11-21 · 화면 시안 v2 · 소유자 답 Q1~Q13 반영 · 구현 전

들어오는 것(메일 · 메신저 · 일정 · 코딩 에이전트)을 클라우드의 비서가 먼저 읽고, 내 결정이 필요한 것만 객관식 카드로 올리는 제품이에요. Slack의 캐치업과 Claude Code · Codex의 객관식 질문을 한 화면으로 합쳐요.
처음 이름은 '결정함(가칭)'이었어요. 폴더 이름은 링크가 깨지지 않게 그대로 뒀어요.

## 파일

| 파일 | 내용 |
|---|---|
| `decision-inbox.html` | 화면 시안 보드(한 파일로 묶은 것). 브라우저로 열어요 |
| `design.md` | 전체 설계: 바뀐 것, 구조(유저마다 개인 클라우드 서버), 커넥터 · 카카오톡, 코딩 에이전트 하네스와 계정 문제, 가르기, 카드, 실행, 모델, 데이터 · API, 위험, 열린 질문 |
| `plan.md` | 0~8단계 계획, 단계마다 끝났다고 볼 기준, 지금 시작할 신청 |
| `board.html` | 보드 원본(그림 파일을 따로 읽어요) |
| `src/` | 보드 재료: `board.tpl.html`(글), 화면 조각 `s-*.html` · `c-*.html` · `p-*.html`, `board-kit.css`(틀 크기만). 화면 모양은 `docs/design-system/`에서 와요 |
| `img/` · `.diagrams/src/` | 흐름 · 구조 도식과 그 원본 |
| `shots/` | 출발점 장에 쓴 AI1 화면 |
| `check/` | 장마다 찍은 그림과 검사 결과 |

함께 볼 것: `docs/design-system/`(디자인 시스템과 그 보드), `docs/research/connectors.md`(커넥터 조사), `docs/research/subscription-login.md`(구독 로그인 조사).

## 정한 방향

- **A · 한 장씩.** 카드가 한 장씩 올라오고, 답하면 다음 장이 와요. 카드 안에 주관식 입력창이 늘 있어요.
- **처음부터 클라우드.** 공용 앞단(로그인 · 웹훅 · 푸시) + 사람마다 '내 칸'(개인 서버 한 대 같은 경계). 코딩 에이전트도 내 칸의 샌드박스에서 돌아요.
- **순서.** 화면 프로토타입 → 클라우드 뼈대 → 코딩 에이전트 → Gmail · 캘린더 → Slack → 카카오톡 → 커넥터 넓히기.
- **카카오톡.** 대화를 읽는 공식 길이 없어요. 채널 챗봇으로 카드를 카톡에 보내고, 대화는 채널에 붙여 넣거나 내보내기 파일로 올려요. PC 카톡 원격 조작 · 비공식 클라이언트는 쓰지 않아요.

## 질문

Q1~Q13은 답을 받았어요(2026-11-21). 전체는 `design.md` 15장에 있어요.

| # | 답 |
|---|---|
| Q10 | 임시로 AI1처럼 Codex(ChatGPT) 로그인 + Codex CLI로 LLM을 불러요. 다른 사람에게 열기 전에 바꿔요 |
| Q11 | 신청은 모두 보류. 코딩 에이전트부터 |
| Q12 | 내 칸은 공용 일꾼 + 격리. 화면 문구는 한국어 · 영어. 개발 언어는 Rust 서버 + TypeScript 화면. **클라우드만 남았어요(2단계 전에)** |
| Q13 | 카카오톡은 Slack 다음. 안드로이드 동반 앱은 보류 |
| Q14 | Claude Code 인증 — 남았어요(급하지 않아요) |

## 다시 굽기

이 보드의 화면은 `docs/design-system/`의 CSS를 읽어서, 디자인 시스템 보드와 함께 다시 구워요.

```bash
zsh docs/design-system/rebake.sh
```

- 순서와 하는 일은 `docs/design-system/README.md`의 '다시 굽기'에 있어요.
- `env.sh`의 스킬 경로(`SK`)는 이 Mac의 ui-proposal-board 플러그인 위치이고, Playwright와 Phosphor 아이콘은 AI1 레포의 것을 빌려 써요. 플러그인이 다시 깔리거나 CatchUp에 의존성이 생기면 `env.sh`를 고쳐요.
- 구조도는 explainer-diagram 플러그인의 `render.cjs`로 `.diagrams/src/fig02-architecture.html`을 구운 뒤 `.diagrams/png/fig02-architecture.png`를 `img/architecture.png`로 복사해요.
