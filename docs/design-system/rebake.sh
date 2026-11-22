#!/bin/zsh
# CatchUp 디자인 시스템과 결정함 보드를 함께 다시 구워요. 쓰는 법: zsh docs/design-system/rebake.sh
set -e
DS="${0:A:h}"; DI="$DS/../design/decision-inbox"
source "$DI/env.sh"
(cd "$DS/../../packages/design-system/brand" && python3 build_brand.py)
# 1) 결정함 보드 — 화면은 이 디자인 시스템으로 그려요
cd "$DI"
python3 src/assemble.py && python3 build.py
node "$S/icons.mjs" board.html --from "$ICONS"
node "$S/place_pins.mjs" board.html
node "$S/check_board.mjs" board.html --terms terms.txt
python3 "$S/bundle.py" board.html decision-inbox.html
# 2) 전 · 후 그림 — after 는 방금 구운 결정함 보드에서 찍어요(before 는 앞선 시안 그대로 둬요)
node "$DS/tools/frames.mjs" "$DI/board.html" "$DS/shots/after"
# 3) 디자인 시스템 보드
cd "$DS"
python3 build.py
node "$S/icons.mjs" board.html --from "$ICONS"
node "$S/place_pins.mjs" board.html
node "$S/check_board.mjs" board.html --terms "$DI/terms.txt"
python3 "$S/bundle.py" board.html catchup-design-system.html
