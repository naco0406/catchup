#!/usr/bin/env python3
"""CatchUp 소개 페이지 굽기 — 영어 · 한국어가 함께 든 한 파일짜리 HTML 을 만들어요.
  1) python3 build.py          src/landing.tpl.html + 디자인 시스템 + 스프라이트 → landing.html (그림은 img/en · img/ko 를 읽어요)
  2) (build.sh) icons.mjs 가 Phosphor 아이콘을 채워요
  3) python3 build.py --inline  영어 그림은 src 에, 한국어 그림은 #shots-ko JSON 에 data URI 로 → catchup-landing.html
"""
import base64, json, pathlib, re, sys
HERE = pathlib.Path(__file__).parent
DS = HERE.parent / "packages" / "design-system"

def uri(path): return "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode()

if "--inline" in sys.argv:
    html = (HERE / "landing.html").read_text()
    html = re.sub(r'src="(img/en/[\w-]+\.webp)"', lambda m: f'src="{uri(HERE / m.group(1))}"', html)
    ids = sorted(set(re.findall(r'data-shot="([\w-]+)"', html)))
    ko = {i: uri(HERE / "img/ko" / f"{i}.webp") for i in ids}
    html = html.replace('<script id="shots-ko" type="application/json"></script>', '<script id="shots-ko" type="application/json">' + json.dumps(ko) + '</script>')
    assert '"f-catchup": "data:image/webp' in html
    (HERE / "catchup-landing.html").write_text(html)
    print(f"✓ catchup-landing.html · {len(html) // 1024} KB")
else:
    html = (HERE / "src/landing.tpl.html").read_text()
    html = html.replace("/*@ds*/", (DS / "tokens.css").read_text() + "\n" + (DS / "components.css").read_text())
    html = html.replace("<!--@sprite-->", (DS / "brand/sprite.svg").read_text().strip())
    html = html.replace("/*@shots-ko*/", "")
    sizes = json.loads((HERE / "img/en/sizes.json").read_text())
    # 그림 자리를 미리 잡아 둬요(글이 덜컥 밀리지 않게). 값은 영어 그림의 CSS 크기예요.
    html = re.sub(r'<img ([^>]*?)data-shot="([\w-]+)"', lambda m: f'<img width="{sizes[m.group(2)][0]}" height="{sizes[m.group(2)][1]}" {m.group(1)}data-shot="{m.group(2)}"', html)
    assert "/*@" not in html and "<!--@" not in html
    (HERE / "landing.html").write_text(html)
    print("✓ landing.html")
