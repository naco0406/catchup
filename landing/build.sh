#!/bin/zsh
# 소개 페이지를 한 파일로 구워요(영어 기본 + 한국어). 쓰는 법: zsh landing/build.sh
set -e
L="${0:A:h}"
source "$L/../docs/design/decision-inbox/env.sh"
# 1) 화면 그림 — 한국어 · 영어 화면 조각을 디자인 시스템으로 그려 WebP 로 찍어요
cd "$L/screens"
python3 build_screens.py
for l in ko en; do node "$S/icons.mjs" screens-$l.html --from "$ICONS" >/dev/null; node shoot.mjs $l ../img/$l; done
# 2) 페이지
cd "$L"
python3 build.py
node "$S/icons.mjs" landing.html --from "$ICONS"
python3 build.py --inline
# 배포용: dist/index.html (wrangler.jsonc 가 이 폴더를 올려요)
mkdir -p dist && cp catchup-landing.html dist/index.html
# 3) 프로토타입 — 같은 주소의 /app/ 에 올려요. 소개 페이지의 'Try it' 이 이걸 품어요
(cd "$L/.." && CATCHUP_BASE=/app/ pnpm --filter @catchup/web exec vite build --outDir "$L/dist/app" --emptyOutDir >/dev/null)
echo "✓ dist/app (프로토타입)"
