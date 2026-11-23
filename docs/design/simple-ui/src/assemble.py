#!/usr/bin/env python3
"""'쉽고 빠른 화면' 시안 보드를 조립해요: src/board.tpl.html → ../board.html
  /*@kit*/          디자인 시스템(tokens.css · components.css) + 기기 틀 크기 + 밀기 시안의 키트 + simple-kit.css(이 시안이 더하는 것)
  <!--@sprite-->    로고 · 캐릭터 스프라이트
  <!--@w 이름-->     screens.py 의 넓은 화면 한 장(아이패드 가로 1194×834)
  <!--@p 이름-->     아이폰 한 장(핀 여백이 있는 틀) · <!--@pn 이름--> 핀 없는 것
  <!--@copy-->      src/copy.html(안내 글 표) · <!--@refs--> src/refs.html
굽기는 ../build.sh 가 해요."""
import os, pathlib, re, sys
HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[3]
DS = ROOT / "packages/design-system"
sys.path.insert(0, str(HERE))
import screens

tpl = (HERE / "board.tpl.html").read_text()
kit = "\n".join(p.read_text() for p in (DS / "tokens.css", DS / "components.css", ROOT / "docs/design/decision-inbox/src/board-kit.css",
                                         ROOT / "docs/design/swipe-deck/src/swipe-kit.css", HERE / "simple-kit.css"))
tpl = tpl.replace("/*@kit*/", kit).replace("<!--@sprite-->", (DS / "brand" / "sprite.svg").read_text().strip())
for name in ("copy", "refs"):
    tpl = tpl.replace(f"<!--@{name}-->", (HERE / f"{name}.html").read_text().rstrip())
W = screens.wides()
tpl = re.sub(r"<!--@w ([\w-]+)-->", lambda m: W[m.group(1)], tpl)
tpl = re.sub(r"<!--@p ([\w-]+)-->", lambda m: f'<div class="bd-frame sw-gut" id="f-p-{m.group(1)}"><div class="bd-screen">{screens.device(m.group(1))}</div></div>', tpl)
tpl = re.sub(r"<!--@pn ([\w-]+)-->", lambda m: f'<div class="bd-frame sw-gut film"><div class="bd-screen">{screens.device(m.group(1), False)}</div></div>', tpl)
left = re.findall(r"<!--@[^>]*-->", tpl)
assert not left, left
tpl = tpl.replace("/*__BOARD_CSS__*/", (pathlib.Path(os.environ["SK"]) / "assets/board.css").read_text())
(HERE.parent / "board.html").write_text(tpl)
print("✓ board.html")
