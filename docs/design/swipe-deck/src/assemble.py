#!/usr/bin/env python3
"""밀기 시안 보드를 조립해요: src/board.tpl.html → ../board.html
  /*@kit*/        디자인 시스템(tokens.css · components.css) + 기기 틀 크기 + swipe-kit.css(이 시안이 더하는 상태)
  <!--@sprite-->  로고 스프라이트
  <!--@s 이름-->   screens.py 의 화면 한 장 · <!--@pad--> 아이패드 가로
  <!--@demo-->    src/demo.html(직접 밀어 보는 칸)
굽기는 ../build.sh 가 해요."""
import os, pathlib, re, sys
HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[3]
DS = ROOT / "packages/design-system"
sys.path.insert(0, str(HERE))
import screens

tpl = (HERE / "board.tpl.html").read_text()
kit = "\n".join(p.read_text() for p in (DS / "tokens.css", DS / "components.css", ROOT / "docs/design/decision-inbox/src/board-kit.css", HERE / "swipe-kit.css"))
tpl = tpl.replace("/*@kit*/", kit).replace("<!--@sprite-->", (DS / "brand" / "sprite.svg").read_text().strip())
# <!--@phone 이름--> 핀 여백이 있는 틀 · <!--@film 이름--> 흐름 장의 작은 틀
tpl = re.sub(r"<!--@phone ([\w-]+)-->", lambda m: f'<div class="bd-frame sw-gut" id="f-{m.group(1)}"><div class="bd-screen">{screens.device(m.group(1))}</div></div>', tpl)
tpl = re.sub(r"<!--@film ([\w-]+)-->", lambda m: f'<div class="bd-frame sw-gut film"><div class="bd-screen">{screens.device(m.group(1), False)}</div></div>', tpl)
tpl = tpl.replace("<!--@pad-->", screens.pad())
for _ in range(2):
    tpl = re.sub(r"<!--@(learn-take|learn-skip|refs|refs-swipe)-->", lambda m: (HERE / f"{m.group(1)}.html").read_text().rstrip(), tpl)
dev, js = screens.demo()
tpl = tpl.replace("<!--@demo-device-->", dev)
(HERE / "demo.gen.js").write_text(js)   # 핀을 놓은 뒤 build.sh 가 넣어요(place_pins 가 마지막 스크립트를 지워요)
tpl = tpl.replace('<div class="bd-frame pad" id="f-pad"><div class="bd-screen">', '<div class="bd-frame pad" id="f-pad"><div class="bd-screen cu-root">')
left = re.findall(r"<!--@[^>]*-->", tpl)
assert not left, left
tpl = tpl.replace("/*__BOARD_CSS__*/", (pathlib.Path(os.environ["SK"]) / "assets/board.css").read_text())
(HERE.parent / "board.html").write_text(tpl)
print("✓ board.html")
