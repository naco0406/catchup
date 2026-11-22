#!/usr/bin/env python3
"""CatchUp 로고 · 비서 캐릭터 SVG 를 만든다. 값은 ../tokens.css 의 브랜드 색과 같아요.
  python3 build_brand.py  →  mark.svg · mark-small.svg · wordmark.svg · mascot-*.svg
"""
import math, pathlib
HERE = pathlib.Path(__file__).parent
TOMATO, SHADE, LEAF, INK, CHEEK = "#E5391F", "#C92A12", "#2E7D3A", "#1C1A18", "#FF9A86"

def leaf(cx, cy, ang, length, width):
    a = math.radians(ang); ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
    tx, ty = cx + ux * length, cy + uy * length
    m = lambda s: (cx + ux * length * .45 + px * width * s, cy + uy * length * .45 + py * width * s)
    (ax, ay), (bx, by) = m(1), m(-1)
    return f"M{cx:.1f} {cy:.1f}Q{ax:.1f} {ay:.1f} {tx:.1f} {ty:.1f}Q{bx:.1f} {by:.1f} {cx:.1f} {cy:.1f}z"

def tomato(s, face="", small=False):
    """s: 크기 배율(64 기준). 몸통 · 그늘 · 빛 · 꼭지."""
    k = lambda v: f"{v * s:.1f}"
    body = (f"M{k(32)} {k(17)}c{k(11.5)}-{k(2.4)} {k(26)} {k(4.2)} {k(26)} {k(20.4)}"
            f"C{k(58)} {k(51.6)} {k(46.6)} {k(60)} {k(32)} {k(60)}S{k(6)} {k(51.6)} {k(6)} {k(37.4)}"
            f"C{k(6)} {k(21.2)} {k(20.5)} {k(14.6)} {k(32)} {k(17)}z")
    cx, cy = 32 * s, 19.5 * s
    L, W = (12 * s, 4.2 * s) if not small else (13 * s, 5.2 * s)
    angs = [196, 152, 90, 28, -16] if not small else [190, 130, 50, -10]
    leaves = "".join(f'<path d="{leaf(cx, cy, a, L * (0.72 if a == 90 else 1), W)}" fill="{LEAF}"/>' for a in angs)
    stem = f'<rect x="{k(30.2)}" y="{k(9)}" width="{k(3.6)}" height="{k(10)}" rx="{k(1.8)}" fill="{LEAF}"/>'
    gid = f"g{int(s*10)}{'s' if small else ''}"
    fill = TOMATO if small else f"url(#{gid})"
    out = ["" if small else f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2=".35" y2="1"><stop offset=".35" stop-color="{TOMATO}"/><stop offset="1" stop-color="{SHADE}"/></linearGradient></defs>',
           f'<path d="{body}" fill="{fill}"/>']
    if not small:
        out.append(f'<path d="M{k(14)} {k(35)}c{k(.6)}-{k(5.4)} {k(3.6)}-{k(9.2)} {k(8)}-{k(11)}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="{k(3.4)}" stroke-linecap="round"/>')
    out += [stem, leaves, face]
    return "\n  ".join(x for x in out if x)

def svg(vb, title, inner, w=None, h=None):
    w = w or vb[2]; h = h or vb[3]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(map(str, vb))}" width="{w}" height="{h}">\n  <title>{title}</title>\n  {inner}\n</svg>\n'

(HERE / "mark.svg").write_text(svg((0, 0, 64, 64), "CatchUp", tomato(1)))
(HERE / "mark-small.svg").write_text(svg((0, 0, 64, 64), "CatchUp", tomato(1, small=True)))
(HERE / "wordmark.svg").write_text(svg((0, 0, 260, 64), "CatchUp", tomato(1) +
    f'\n  <text x="74" y="45" font-family="Pretendard Variable, Pretendard, -apple-system, sans-serif" font-size="34" font-weight="750" letter-spacing="-1.2" fill="{INK}">CatchUp</text>'))

S = 2.5  # 캐릭터는 160 칸
e = lambda x, y, rx=5.5, ry=7.5: f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{INK}"/>'
line = lambda d, w=4.5: f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
cheeks = f'<ellipse cx="45" cy="110" rx="9" ry="6" fill="{CHEEK}" opacity=".8"/><ellipse cx="115" cy="110" rx="9" ry="6" fill="{CHEEK}" opacity=".8"/>'
FACES = {
    "basic":    ("기본",        e(62, 96) + e(98, 96) + line("M72 111c4.5 5 11.5 5 16 0") + cheeks),
    "thinking": ("생각하는 중", e(65, 92) + e(101, 92) + line("M75 113h10") + cheeks),
    "done":     ("다 봤어요",   line("M55 97c3-6 11-6 14 0M91 97c3-6 11-6 14 0") + f'<path d="M69 108c5.5 9.5 16.5 9.5 22 0z" fill="{INK}"/>' + cheeks),
    "worried":  ("걱정돼요",    e(62, 98, 5, 6.5) + e(98, 98, 5, 6.5) + line("M54 85l12-4M106 85l-12-4", 4) + line("M72 116c4.5-4.5 11.5-4.5 16 0") + cheeks),
}
for key, (name, face) in FACES.items():
    (HERE / f"mascot-{key}.svg").write_text(svg((0, 0, 160, 160), f"CatchUp 비서 — {name}", tomato(S, face)))
# 화면용 스프라이트 — <svg><use href="#cu-mark"/></svg> 로 써요
def sym(id_, vb, inner):
    inner = inner.replace('id="g', f'id="{id_}-g').replace('url(#g', f'url(#{id_}-g')  # 그러데이션 id 가 겹치지 않게
    return f'<symbol id="{id_}" viewBox="{vb}">{inner}</symbol>'
syms = [sym("cu-mark", "0 0 64 64", tomato(1)), sym("cu-mark-small", "0 0 64 64", tomato(1, small=True))]
syms += [sym(f"cu-mascot-{k}", "0 0 160 160", tomato(S, f)) for k, (_, f) in FACES.items()]
(HERE / "sprite.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">' + "".join(syms) + "</svg>\n")
print("✓ brand svgs · sprite.svg")
