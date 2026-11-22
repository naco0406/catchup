#!/usr/bin/env python3
"""CatchUp 디자인 시스템 보드 굽기.
  src/board.tpl.html + tokens.css + components.css + brand/sprite.svg + 보드 틀(board.css) → board.html
  전체 순서는 README.md '다시 굽기'를 봐요.
"""
import os, pathlib
HERE = pathlib.Path(__file__).parent
SKILL = pathlib.Path(os.environ["SK"])
tpl = (HERE / "src/board.tpl.html").read_text()
tpl = tpl.replace("/*__BOARD_CSS__*/", (SKILL / "assets/board.css").read_text())
PKG = HERE.parents[1] / "packages/design-system"
tpl = tpl.replace("/*@kit*/", (PKG / "tokens.css").read_text() + "\n" + (PKG / "components.css").read_text())
tpl = tpl.replace("<!--@sprite-->", (PKG / "brand/sprite.svg").read_text().strip())
(HERE / "board.html").write_text(tpl)
print("✓ board.html")
