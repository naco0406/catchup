#!/bin/zsh
# 밀기 시안 보드를 다시 구워요. 쓰는 법: zsh docs/design/swipe-deck/build.sh
set -e
cd "${0:A:h}"
source ../decision-inbox/env.sh
python3 src/assemble.py
node "$S/icons.mjs" board.html --from "$ICONS"
node "$S/place_pins.mjs" board.html
# 밀어 보는 칸의 스크립트는 핀을 놓은 뒤에 넣어요 — place_pins 는 문서의 마지막 스크립트를 지우고, 움직인 화면을 그대로 저장해요
python3 - <<'PY'
import pathlib
b = pathlib.Path("board.html"); s = b.read_text()
assert s.count("<!--demo-js-->") == 1
b.write_text(s.replace("<!--demo-js-->", "<script>" + pathlib.Path("src/demo.gen.js").read_text() + "</script>"))
print("✓ 밀어 보는 칸")
PY
node "$S/check_board.mjs" board.html --terms ../decision-inbox/terms.txt
python3 "$S/bundle.py" board.html swipe-deck.html
