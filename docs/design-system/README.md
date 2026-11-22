# CatchUp 디자인 시스템 v0.4

2026-11-21 · 상태: 제안 · v0.2에서 회색의 붉은 기를 뺐어요(소유자 피드백) · v0.4는 프로토타입 검수 반영(아래) · 보드: `catchup-design-system.html`(한 파일, 브라우저로 열어요)

CatchUp의 화면은 **디자인 시스템의 값과 부품으로만** 그려요. 정본 파일은 작업 공간 패키지 `packages/design-system`(`@catchup/design-system`)에 있어요 — 웹 앱(`apps/web`), 시안 보드, 소개 페이지가 모두 같은 파일을 읽어요. 이 폴더(`docs/design-system`)는 설명 문서와 보드예요.

## 디자인 언어

'CatchUp'을 소리 내면 '케챱'이에요. 그래서 토마토 케첩에서 출발했어요. 다만 하루에 몇십 번 여는 결정 화면이라, **말랑한 껍데기, 조용한 속**이 원칙이에요. 귀여움은 이름 · 로고 · 캐릭터 · 둥근 모양에서 오고, 카드 안은 조용해야 10초 안에 정할 수 있어요.

1. **둥근 것은 누를 수 있어요.** 단추 · 선택지 · 입력창 · 알약 · 번호 키 · 사이드바 줄은 끝이 반원(`--cu-r-full`)이에요. 담는 것은 카드 32 · 칸 24 · 코드 16 세 단계만 써요.
2. **고를 곳의 빨강은 한 화면에 하나예요.** 지금 카드의 추천 답, 또는 추천이 없는 화면의 주 단추예요. 그 밖의 빨강은 '지금 여기' 표시(진행 막대의 지금 칸, 사이드바의 남은 수)뿐이에요. 링크 · 되돌리기는 잉크색이에요.
3. **케첩 옆엔 머스터드와 잎.** 기다림 · 기한은 머스터드 점, 켜짐 · 연결됨 · 끝남은 토마토 꼭지의 초록이에요. 위험 · 실패는 빨강을 칠하지 않고 검붉은 글자 + 경고 아이콘으로 말해요.
4. **거의 흰 바탕 위에 흰 카드가 떠요.** 회색은 거의 무채색이고 아주 살짝만 따뜻해요(붉은 기는 빼고 노란 쪽으로 아주 조금). 빨간 느낌은 강조색에만 있어요. 선보다 그늘로 나눠요.
5. **캐릭터는 정할 것이 없을 때만 나와요.** 처음 화면, 다 봤어요, 연결이 끊겼을 때예요. 결정 카드와 실패 카드 위에는 나오지 않아요.

## 파일

| 파일 | 내용 |
|---|---|
| `packages/design-system/tokens.css` | 원료 색(`--cu-tomato-*` · `--cu-warm-*` · `--cu-mustard-*` · `--cu-leaf-*`) · 뜻 색 · 모서리 · 높이 · 간격 · 그늘 · 글자 · 움직임. 다크 짝(`[data-theme="dark"]`) |
| `packages/design-system/components.css` | 컴포넌트 34개 + 앱 상태(v0.3: 위험한 답 확인 · 실제 입력창 · 단추 · v0.4: 검수 반영). 클래스 이름 = 만들 컴포넌트 이름 |
| `packages/design-system/brand/build_brand.py` | 로고 · 캐릭터를 만드는 스크립트. 색을 바꾸면 여기서 다시 만들어요 |
| `packages/design-system/brand/mark.svg` · `mark-small.svg` · `wordmark.svg` | 로고(28px 이상 · 24px 이하 · 글자 포함) |
| `packages/design-system/brand/mascot-{basic,thinking,done,worried}.svg` | 비서 캐릭터 표정 넷 |
| `packages/design-system/brand/sprite.svg` | 화면용 묶음(`#cu-mark` · `#cu-mark-small` · `#cu-mascot-*`) |
| `src/board.tpl.html` · `build.py` | 디자인 시스템 보드의 원본과 굽기 |
| `shots/before` · `shots/after` | 앞선 시안(OpenAI 토큰)과 이 디자인 시스템의 같은 화면 |
| `tools/frames.mjs` | 보드의 화면 틀을 한 장씩 찍는 스크립트(전 · 후 그림용) |
| `check/` | 보드 검사 그림 |

## 색

대비는 흰 바탕(`#FFFFFF`) 기준이에요. 본문 글자는 모두 4.5 : 1 이상이에요.

| 뜻 | 토큰 | 값 | 대비 |
|---|---|---|---|
| 앱 바탕 | `--cu-bg-canvas` | `#FAFAF9` | — |
| 카드 · 입력창 | `--cu-bg-surface` | `#FFFFFF` | — |
| 사이드바 | `--cu-bg-sidebar` | `#F5F5F3` | — |
| 알약 · 미리보기 | `--cu-bg-soft` | `#EEEDEB` | — |
| 글자 | `--cu-fg` | `#1C1A18` | 17.4 |
| 둘째 글자 | `--cu-fg-2` | `#4C4844` | 9.1 |
| 셋째 글자 | `--cu-fg-3` | `#6D6863` | 5.5 (사이드바 위 5.05) |
| 강조 칠 | `--cu-accent` | `#D12C14` | 흰 글자 5.15 |
| 강조 글자 | `--cu-accent-text` | `#B8280F` | 6.3 |
| 추천 줄 바탕 | `--cu-accent-soft` | `#FFF3EF` | — |
| 기다림 점 · 글자 | `--cu-wait-dot` · `--cu-wait` | `#E9A10E` · `#8F5A00` | 글자 5.78 |
| 켜짐 · 연결됨 | `--cu-ok` | `#2E7D3A` | 5.11 |
| 위험 · 실패 글자 | `--cu-danger` | `#8E1F0E` | 8.9 |
| 로고 · 캐릭터 | `--cu-tomato-500` | `#E5391F` | 글자에 쓰지 않아요(흰 글자 4.25) |

다크 짝은 `tokens.css` 아래쪽에 있어요. 다크 강조 칠 `#D9361C`(흰 글자 4.67), 다크 강조 글자 `#FF7A5C`(카드 위 6.74)예요.

## 글자

Pretendard Variable 하나예요. `word-break: keep-all`로 한글은 낱말 단위로 줄을 바꾸고, 숫자는 고정폭 숫자예요. 12px 아래는 쓰지 않아요.

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--cu-t-hero` | 56/64 · 750 (좁은 화면 36/44) | 소개 페이지 첫 제목 |
| `--cu-t-section` | 40/50 · 700 (좁은 화면 28/36) | 소개 페이지 장 제목 |
| `--cu-t-display` | 32/40 · 700 | 다 봤어요 · 처음 |
| `--cu-t-question` | 24/32 · 700 | 카드 질문(아이폰은 20/28) |
| `--cu-t-title` | 18/26 · 700 | 화면 제목 · 로고 글자 |
| `--cu-t-body-strong` | 16/24 · 600 | 선택지 이름 |
| `--cu-t-body` | 16/24 · 400 | 요약 · 입력창 |
| `--cu-t-caption` · `--cu-t-label` | 14/20 · 400 · 500 | 설명 · 출처 · 단추 |
| `--cu-t-micro` | 12/16 · 600 | 번호 키 · 숫자 배지 · 추천 |

## 모양 · 높이

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--cu-r-full` | 반원 | 단추 · 선택지 · 입력창 · 알약 · 키 · 사이드바 줄 · 출처 동그라미 |
| `--cu-r-card` | 32 | 결정 카드 · 시트 · 연결 목록 상자(아이폰 카드 28) |
| `--cu-r-panel` | 24 | 미리보기 · 일정 비교 · 약속 상자 · 알림 |
| `--cu-r-inset` | 16 | 바뀔 코드 · 작은 칸 |
| `--cu-h-sm` · `md` · `lg` · `option` | 32 · 40 · 52 · 64 | 동그라미 · 단추 · 입력창 · 선택지 |

iOS에서는 같은 값을 SwiftUI의 연속 곡선(`RoundedRectangle(cornerRadius:style: .continuous)`)으로 옮겨요.

## 컴포넌트

| 컴포넌트 | 클래스 | 상태 · 모양 |
|---|---|---|
| DecisionCard | `.cu-card` (`.flat` `.p`) | 지금 카드 · 따로 보기 · 아이폰 |
| CardSource · DueTag | `.cu-from` `.cu-tile` `.cu-due` | 기한 · 위험(`.risk` + `#i-warning`) · 급하지 않음(`.calm`) |
| Summary · EvidenceChip | `.cu-sum` `.cu-chip` | 굵게 · 흐리게 / 칠 · 선 |
| OptionRow · RecommendBadge · KeyHint | `.cu-opt` `.cu-rec` `.cu-kbd` | 보통 · 추천(`.rec`) · 고름(`.picked`) · 흐림(`.dimmed`) · 잠김 |
| EffectPreview · CodeDiff · SlotCompare | `.cu-prev` `.cu-code` `.cu-slots` | 나갈 글 · 바뀔 코드 · 겹친 일정 |
| Composer · ChatBubble | `.cu-composer` `.cu-said` `.cu-work` | 빈 칸 · 쓰는 중(`.typed` + `.cu-send.go`) |
| CardDeck · CardProgress | `.cu-deck` `.cu-peek` `.cu-steps` `.cu-pbar` | 끝남 · 지금 · 남음 |
| Sidebar · SidebarItem · RunItem · SourceRow | `.cu-side` `.cu-nav` `.cu-run` `.cu-src-row` | 고름 · 보통 / 기다림 · 하는 중 |
| TopBar · IconButton | `.cu-top` `.cu-ib` | 켜짐 · 꺼짐 |
| Button · SegmentedControl · Switch | `.cu-btn` `.cu-seg` `.cu-switch` | 주 · 보조 · 투명 · 큰 / 켜짐 · 꺼짐 |
| ListRow · SectionHeader · Link | `.cu-row` `.cu-h` `.cu-link` | 되돌리기 · 실패 · 연결됨(`.e.ok`) |
| Toast | `.cu-toast` | 되돌리기 |
| EmptyState · Mascot | `.cu-center` `.cu-mascot` | 기본 · 생각 · 다 봤어요 · 걱정 |
| Logo · AppIcon · Avatar | `.cu-logo` `.cu-appicon` `.cu-avatar` | 큰 · 작은 표지 |
| LockNotification | `.cu-noti` `.cu-nacts` | iOS 시스템 모양 그대로 |

아이콘은 Phosphor(regular, `@phosphor-icons/core` 2.1.1)예요. 크기 16 · 18 · 20, 한 색이에요.

## 지킬 것

1. 값을 지어내지 않아요. 색 · 크기 · 모서리 · 그늘은 `tokens.css`의 변수만 써요. 없으면 토큰을 먼저 더하고 보드에 적어요.
2. 즉석 장식을 만들지 않아요. 한쪽 색 띠, 색 배경 줄, 그러데이션 배지는 없어요.
3. 고를 곳의 빨강은 한 화면에 하나예요. 위험한 선택지에는 칠하지 않아요.
4. 글자는 12px 이상, 대비 4.5 : 1 이상이에요.

## 열린 질문

| # | 질문 | 시안이 가정한 답 |
|---|---|---|
| Q1 | 비서 캐릭터 이름 | 이름 없이 '비서' |
| Q2 | 위험을 어떤 색으로 말할까요 | 검붉은 글자 + 경고 아이콘(칠 없음) |
| Q3 | iOS 글꼴 | 웹 · 앱 모두 Pretendard |
| Q4 | 바탕색 | 피드백대로 붉은 기를 뺀 거의 흰 바탕 `#FAFAF9` 위에 흰 카드 |

## 다시 굽기

디자인 시스템 보드와 결정함 보드를 함께 다시 구워요. 결정함 보드의 화면 그림이 이 폴더의 CSS를 읽기 때문이에요.

```bash
zsh docs/design-system/rebake.sh
```

- 순서: 로고 · 캐릭터 SVG → 결정함 보드(굽기 · 아이콘 · 핀 · 검사 · 묶기) → 전 · 후 그림(`shots/after`) → 디자인 시스템 보드(굽기 · 아이콘 · 핀 · 검사 · 묶기).
- 검사에서 경고가 나오면 멈춰요. 고치고 다시 돌려요.
- Playwright와 아이콘은 아직 AI1 레포의 것을 빌려 써요(`docs/design/decision-inbox/env.sh`). `shots/before`는 앞선 시안 그대로 두는 그림이라 다시 찍지 않아요.

## v0.4 — 프로토타입 검수 반영(2026-11-21)

- 선택지 모서리 32(카드와 같게), 설명은 두 줄까지. 휴대폰은 30.
- 위험한 선택지는 자물쇠 대신 경고 아이콘 + '위험 / Risky' 글자(`.cu-opt .r .risk`). 확인을 기다릴 때 설명에도 경고 아이콘.
- 초점 테두리는 빨강이 아니라 잉크색 2px(`:focus-visible`) — 빨강은 추천에만 써요.
- 사이드바: 캐치업 수만 빨간 알약(`.cu-nav .n.badge`), 다른 수는 회색 숫자.
- 탭(`.cu-seg`)은 `<button aria-pressed>`로 — 스페이스 · 엔터가 그대로 먹어요. 수는 `.n`.
- 바뀔 코드: 줄이 길면 접고 둘째 줄부터 들여 써요. 머리는 설명 · 파일(`.file`) · +/−(`.st`).
- 토스트: 되돌리기가 없으면 좌우 여백을 같게. 단추 · 링크는 글꼴을 물려받고, 링크도 누르는 자리 32px.

## v0.5 — 여러 줄 입력(2026-11-22)

- `<TextArea>` `.cu-textarea`: 코딩 세션에 맡길 일처럼 여러 줄을 적는 칸. 선 · 초점은 입력창과 같고 모서리는 panel(24).

## v0.6 — 밀기(2026-11-22)

시안과 근거는 `docs/design/swipe-deck/`에 있어요.

- **차오르는 추천 답** `.cu-fill`: 추천 답 줄 위에 고른 모양(`.cu-opt.picked`)을 겹쳐 두고 `--f`(0~1)만큼만 보여요. 겹친 줄의 글은 문서에 두 번 넣지 않고 `data-t`로 그려요.
- **두 줄 토스트와 고리** `.cu-toast.two` · `.cu-ring`: 미는 동안 '놓으면 일어날 일'이 미리 서고, 놓으면 그 자리에서 되돌리기가 돼요. 고리는 `--ring`(0~1), 놓아도 될 때는 `.full`.
- **방향 단추** `.act-l` · `.act-m` · `.act-r`: 왼쪽 단추 = 왼쪽 밀기(미루기), 오른쪽 단추 = 오른쪽 밀기(추천대로). 추천 답이 없는 덱(알려만 드려요)의 오른쪽 단추는 `.ink` — 빨강을 쓰지 않아요.
- **움직임의 약속**: 화면(`.cu-main`)에 `--dx` · `--p` · `--f` · `--d` 변수와 `data-pull`(left · right · blocked) · `data-armed`를 걸어요. 부품은 이 값만 읽어요.
- **스프링 토큰 둘** `--cu-spring-return` · `--cu-spring-exit`(세기 감쇠).
- **카드는 기울이지 않아요.** 글이 많은 카드라 기울면 뒤 카드와 겹쳐 난잡해요. 빨강은 추천 답 줄에만 쓰고, 토스트와 단추는 잉크색이에요.
