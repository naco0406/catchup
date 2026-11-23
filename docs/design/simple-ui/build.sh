#!/bin/zsh
# '쉽고 빠른 화면' 시안 보드를 다시 구워요. 쓰는 법: zsh docs/design/simple-ui/build.sh
set -e
cd "${0:A:h}"
source ./env.sh
python3 src/assemble.py
node "$S/icons.mjs" board.html --from "$ICONS"
node "$S/place_pins.mjs" board.html
node "$S/check_board.mjs" board.html --terms terms.txt
python3 "$S/bundle.py" board.html simple-ui.html
