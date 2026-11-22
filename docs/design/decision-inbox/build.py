#!/usr/bin/env python3
"""결정함 시안 보드 — board.src.html + 보드 틀 CSS → board.html.
  굽기:  source env.sh && python3 build.py && node "$S/icons.mjs" board.html --from "$ICONS" \
         && node "$S/place_pins.mjs" board.html && node "$S/check_board.mjs" board.html --terms terms.txt
  묶기:  python3 "$S/bundle.py" board.html decision-inbox.html
  (경로는 docs/design/decision-inbox 기준, 스킬 경로는 env.sh 의 $SK)
"""
import os, pathlib

HERE = pathlib.Path(__file__).parent
SKILL = pathlib.Path(os.environ["SK"])

src = (HERE / "board.src.html").read_text()
(HERE / "board.html").write_text(src.replace("/*__BOARD_CSS__*/", (SKILL / "assets/board.css").read_text()))
print("✓ board.html")
