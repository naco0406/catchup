# CatchUp 소개 페이지

- 주소: https://catchup.naco.im (Cloudflare Workers 정적 파일, Worker 이름 `catchup-landing`)
- 한 파일: `catchup-landing.html` — 영어(기본)와 한국어가 함께 든 HTML 한 장이에요. 그림도 WebP data URI로 들어 있어요.
- 프로토타입: 같은 주소의 `/app/`에 1단계 웹 앱(`apps/web`)을 함께 올려요. 'Try it' 장이 이걸 품어요 — 넓은 화면은 아이패드 가로 크기를 폭에 맞춰(화면 높이의 78% 이하), 중간 폭은 아이폰 크기, 휴대폰은 새 탭 단추. 페이지의 언어를 따라가요(`?lang=…&start=1&embed=1`). 이 HTML을 내 컴퓨터에서 열면 배포된 `https://catchup.naco.im/app/`을 써요.
- 언어: 영어가 기본이고, 위 막대의 EN / KO로 바꿔요. `?lang=ko`로 바로 열 수 있고, 고른 언어는 그 브라우저에 기억해요.

## 파일

| 파일 | 내용 |
|---|---|
| `src/landing.tpl.html` | 페이지 원본. 영어 문구는 HTML에, 한국어는 같은 요소의 `data-ko`(그림 설명은 `data-ko-alt`)에 짝으로 있어요 |
| `screens/en/*.html` | 영어 화면 조각(시안 보드의 한국어 조각 `docs/design/decision-inbox/src/*.html`과 짝) |
| `screens/build_screens.py` · `shoot.mjs` | 두 언어의 화면 조각을 디자인 시스템으로 그려 `img/<언어>/*.webp`로 찍어요 |
| `build.py` · `build.sh` | 디자인 시스템 · 로고 스프라이트 · 아이콘 · 그림을 넣어 한 파일로 구워요 |
| `wrangler.jsonc` | 배포 설정. `dist/index.html`(소개 페이지)과 `dist/app/`(프로토타입)을 올려요 |

## 굽기 · 올리기

```bash
zsh landing/build.sh
```

```bash
cd landing && wrangler deploy
```

## 문구를 고칠 때

- 영어를 먼저 고치고, 같은 요소의 `data-ko`를 한국어로 다시 옮겨요.
- 화면 그림 속 문구는 `screens/en/*.html`(영어)과 시안 보드 조각(한국어)을 함께 고쳐요.
- 'Try it' 안의 화면은 실제 앱이라, 그 문구는 `apps/web/src/locales`와 `apps/web/src/data`에서 고쳐요.

## 확인한 것(2026-11-21)

- 폭 320 · 360 · 375 · 390 · 414 · 768 · 834 · 1024 · 1280 · 1440 × 영어 · 한국어: 가로 넘침 0, 잘린 글자 0, 12px 미만 글자 0, 위 막대 겹침 0, 콘솔 오류 0.
- 데모: 1 · 2 · 3 · ↵ 키, 누르기, 10초 세기, 되돌리기, 언어를 바꾸면 데모가 처음으로 돌아가요.
