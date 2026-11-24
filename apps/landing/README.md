# CatchUp 소개 페이지 (`@catchup/landing`)

- 주소: https://catchup.naco.im (영어), https://catchup.naco.im/ko/ (한국어). Cloudflare Workers 정적 파일, Worker 이름 `catchup-landing`
- 페이지는 React로 짜고, 빌드할 때 정적 HTML로 구워요. 브라우저에는 React가 실리지 않고, 스크립트가 없어도 글과 그림이 다 보여요.
- 디자인 시스템(`@catchup/design-system`), 글꼴(`pretendard`), 아이콘(`@phosphor-icons/react`)은 웹 앱과 같은 패키지를 써요. 다른 저장소에서 빌려 오는 것은 없어요.
- 'Try it' 장은 같은 주소의 `/app/`(apps/web 을 `/app/`으로 구운 것)을 품어요. 개발 서버에서는 apps/web 개발 서버(5180)를 품어요.

## 명령

```bash
pnpm dev:landing
```

5183에서 열려요. 'Try it' 안의 앱까지 보려면 `pnpm dev`(5180)도 함께 띄워요.

```bash
pnpm build:landing
```

`dist/index.html`(영어), `dist/ko/index.html`(한국어), `dist/app/`(프로토타입)이 생겨요. `pnpm --filter @catchup/landing preview`로 5184에서 배포본처럼 볼 수 있어요.

```bash
pnpm e2e:landing
```

두 언어 페이지, 언어 옮겨 가기와 기억, 가로 넘침, 그림, 스크립트 없이 보이는지를 봐요.

```bash
pnpm --filter @catchup/landing ship
```

굽고 `wrangler deploy`까지 해요. 소유자가 올리라고 할 때만 써요.

## 파일

| 파일 | 내용 |
|---|---|
| `src/copy.ts` | 모든 글. 영어와 한국어가 같은 타입이라 한쪽에만 있는 글은 타입 검사에서 걸려요 |
| `src/Page.tsx` | 페이지 한 장(상태 없음) |
| `src/render.tsx` | 언어 하나의 `<head>` 조각과 본문을 구워요. `vite.config.ts` 가 불러요 |
| `src/main.ts` | 움직이는 것: 언어 기억, 'Try it' 크기 맞추기와 처음부터 다시, 카드 장의 지금 위치 |
| `src/landing.css` | 배치. 첫 줄에 Hallmark 도장(무엇을 바꾸고 뺐는지)이 있어요 |
| `src/shots/<en,ko>/` | 실제 앱 캡처. 넓은 화면용과 휴대폰용(`-m`), 그림 자리 크기(`sizes.json`) |
| `scripts/shots.mjs` | 캡처를 다시 찍어요 |
| `wrangler.jsonc` | 배포 설정 |

## 글이나 화면을 고칠 때

- 영어를 먼저 고치고, `src/copy.ts` 의 같은 자리에 한국어를 옮겨요.
- 그림은 손으로 그리지 않고 실제 앱에서 찍어요. 앱 화면이 바뀌면 apps/web 개발 서버를 띄우고 다시 찍어요.

```bash
pnpm shots:landing
```

- 'Try it' 안의 화면과 캡처 속 글은 실제 앱이라, `apps/web/src/locales` 와 `apps/web/src/data` 에서 고쳐요.

## 확인한 것(2026-11-24)

- Hallmark sloplint(렌더, 1280, 1440, 1920, 375, 두 언어): 옛 한 파일 페이지 FAIL 69, REFLEX 103에서 FAIL 2, REFLEX 0. 남은 FAIL 2는 iframe 포커스 검사의 거짓 양성이에요. 안의 앱에 포커스가 들어가면 iframe 자신은 `:focus`가 아니라서 틀의 `:focus-within`으로 테두리를 그리는데, 검사는 이를 다시 재지 못해요.
- e2e 10/10(375, 1440).
