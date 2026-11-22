#!/usr/bin/env python3
BADGE = ' badge'  # 캐치업 수만 빨간 알약으로
"""소개 페이지에 넣을 화면 그림을 한국어 · 영어로 구워요.
  한국어 조각: docs/design/decision-inbox/src/*.html (시안 보드와 같은 것)
  영어 조각:   landing/screens/en/*.html
  → screens-ko.html · screens-en.html (화면 틀만 늘어놓은 페이지) → shoot.mjs 가 img/<lang>/<id>.webp 로 찍어요.
"""
import os, pathlib, re
HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[1]
DS = ROOT / "packages/design-system"
KO = ROOT / "docs/design/decision-inbox/src"
BOARD_CSS = pathlib.Path(os.environ["SK"]) / "assets/board.css"

T = {
  "ko": dict(date="11월 23일 (월)", nav=("캐치업", "알려만 드려요", "미뤄 둔 것", "처리 기록"), runs_label="비서가 하는 일",
             r1="결제 재시도 넣기", r2="주간 보고 초안 쓰기", r3="밤사이 메일 41통 정리", r3s="8:55에 끝났어요",
             runs={"wait": ("Claude Code · 답을 기다려요", "Codex · 6분째 하는 중"), "go": ("Claude Code · 이어서 하는 중", "Codex · 9분째 하는 중"), "idle": ("Claude Code · PR을 올렸어요", "Codex · 초안을 다 썼어요")},
             src_label="들어오는 곳 · 밤사이", kakao="카카오톡 채널", cal="캘린더", me=("지우", "한지우", "설정")),
  "en": dict(date="Mon, Nov 23", nav=("Catch up", "FYI", "Snoozed", "Activity"), runs_label="Assistant is working on",
             r1="Add payment retries", r2="Draft weekly report", r3="Sort 41 overnight emails", r3s="Done at 8:55",
             runs={"wait": ("Claude Code · Waiting on you", "Codex · Running 6 min"), "go": ("Claude Code · Continuing", "Codex · Running 9 min"), "idle": ("Claude Code · Opened a PR", "Codex · Draft ready")},
             src_label="Incoming · overnight", kakao="KakaoTalk channel", cal="Calendar", me=("JH", "Jiwoo Han", "Settings")),
}
ic = lambda n: f'<svg><use href="#i-{n}"/></svg>'

def status(t, side):
    cls = "cu-status side" if side else "cu-status"
    return f'<div class="{cls}"><span>9:41</span><span>{t["date"]}</span><span class="sp"></span>{ic("wifi-high")}<span>100%</span>{ic("battery-full")}</div>'

def sidebar(t, on, catchup, fyi, later, run):
    def nav(key, icon, label, n):
        num = f'<span class="n{BADGE if key == "catchup" else ""}">{n}</span>' if n not in ("0", "") else ""
        return f'<div class="cu-nav{" on" if key == on else ""}">{ic(icon)}<span>{label}</span>{num}</div>'
    a, b = t["runs"][run]
    wait = ' wait' if run == "wait" else ''
    srcs = [("envelope-simple", "Gmail", 41), ("slack-logo", "Slack", 63), ("chat-circle", t["kakao"], 2), ("calendar-blank", t["cal"], 5),
            ("github-logo", "GitHub", 9), ("terminal-window", "Claude Code", 2), ("code", "Codex", 3)]
    n = t["nav"]
    return "\n".join([
        '<aside class="cu-side">',
        f'<div class="cu-side-head"><span class="cu-logo"><svg><use href="#cu-mark"/></svg></span><span class="name">CatchUp</span><span class="cu-ib">{ic("magnifying-glass")}</span><span class="cu-ib">{ic("sidebar-simple")}</span></div>',
        nav("catchup", "cards", n[0], catchup), nav("fyi", "list-checks", n[1], fyi), nav("later", "clock", n[2], later), nav("log", "receipt", n[3], ""),
        f'<div class="cu-side-label">{t["runs_label"]}</div>',
        f'<div class="cu-run">{ic("terminal-window")}<span class="t">{t["r1"]}</span><span class="s{wait}">{a}</span></div>',
        f'<div class="cu-run">{ic("code")}<span class="t">{t["r2"]}</span><span class="s">{b}</span></div>',
        f'<div class="cu-run">{ic("envelope-simple")}<span class="t">{t["r3"]}</span><span class="s">{t["r3s"]}</span></div>',
        f'<div class="cu-side-label">{t["src_label"]}</div>',
        *[f'<div class="cu-src-row">{ic(i)}<span>{nm}</span><span class="n">{c}</span></div>' for i, nm, c in srcs],
        f'<div class="cu-me"><span class="cu-avatar">{t["me"][0]}</span><span>{t["me"][1]}</span><span class="sub">{t["me"][2]}</span></div>',
        '</aside>'])

FRAMES = [  # id, 조각, 틀
  ("f-catchup", "s-catchup", "pad"), ("f-code", "s-code", "pad"), ("f-log", "s-log", "pad"),
  ("f-cal", "c-cal", "card"), ("f-codex", "c-codex", "card"), ("f-other", "c-other", "card"), ("f-fyi", "c-fyi", "card"), ("f-fail", "c-fail", "card"),
  ("f-pcard", "p-card", "phone"), ("f-plock", "p-lock", "lock"),
]
def frame(kind, fid, body):
    if kind == "pad":  return f'<div class="bd-frame pad" id="{fid}"><div class="bd-screen cu-root">{body}</div></div>'
    if kind == "card": return f'<div class="bd-frame cardonly" style="width:730px" id="{fid}"><div class="bd-screen cu-root" style="width:728px;height:auto">{body}</div></div>'
    st = '<div class="bd-status"><span>9:41</span><span class="island"></span><span class="bat"></span></div>' if kind == "phone" else \
         '<div class="bd-status" style="background:#2b2927;color:#fff"><span>9:41</span><span class="island" style="background:#000"></span><span class="bat" style="box-shadow:inset 0 0 0 1.5px #fff"></span></div>'
    if kind == "phone": st = st.replace('class="bd-status"', 'class="bd-status" style="background:var(--cu-bg-canvas)"')
    return f'<div class="bd-frame phone" id="{fid}">{st}<div class="bd-screen cu-root" style="height:800px">{body}</div></div>'

for lang, t in T.items():
    src = KO if lang == "ko" else HERE / "en"
    parts = []
    for fid, name, kind in FRAMES:
        body = (src / f"{name}.html").read_text()
        body = re.sub(r"<!--@status ?(\w*)-->", lambda m: status(t, m.group(1)), body)
        body = re.sub(r"<!--@side (\w+) (\w+) (\w+) (\w+) (\w+) ?[\w:]*-->", lambda m: sidebar(t, *m.groups()), body)
        body = re.sub(r'\sdata-pin(-at)?="[^"]*"', "", body)
        assert "<!--@" not in body, (lang, name)
        parts.append(f'<div style="padding:24px">{frame(kind, fid, body)}</div>')
    css = BOARD_CSS.read_text() + (DS / "tokens.css").read_text() + (DS / "components.css").read_text() + (ROOT / "docs/design/decision-inbox/src/board-kit.css").read_text()
    html = f'''<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>{css}
/* 찍기용: 틀 바깥은 투명하게, 틀 그림자는 빼요 — 그림자는 소개 페이지가 그림 모양을 따라 그려요 */
html, body {{ background: transparent !important; }} .bd-frame {{ box-shadow: none !important; }}</style></head><body>
<!-- bd:icons --><!-- /bd:icons -->
{(DS / "brand/sprite.svg").read_text()}
{"".join(parts)}
</body></html>'''
    (HERE / f"screens-{lang}.html").write_text(html)
    print(f"✓ screens-{lang}.html")
