#!/usr/bin/env python3
BADGE = ' badge'  # 캐치업 수만 빨간 알약으로
"""board.tpl.html → ../board.src.html.
  /*@kit*/            CatchUp 디자인 시스템(docs/design-system/tokens.css · components.css) + board-kit.css(틀 크기)
  <!--@sprite-->      로고 · 캐릭터 스프라이트(docs/design-system/brand/sprite.svg)
  <!--@inc name-->    src/name.html
  <!--@status [side]-->          아이패드 상태 막대
  <!--@side on catchup fyi later run-->  사이드바 (on: catchup|fyi|later|log, 숫자 0 이면 숨김, run: wait|go|idle)
"""
import pathlib, re
HERE = pathlib.Path(__file__).parent
DS = HERE.parents[3] / "packages/design-system"

def ic(n): return f'<svg><use href="#i-{n}"/></svg>'

def status(side=""):
    cls = "cu-status side" if side else "cu-status"
    return (f'<div class="{cls}"><span>9:41</span><span>11월 23일 (월)</span><span class="sp"></span>'
            f'{ic("wifi-high")}<span>100%</span>{ic("battery-full")}</div>')

def side(on, catchup, fyi, later, run, pin=""):
    def nav(key, icon, label, n):
        c = ' on' if key == on else ''
        num = f'<span class="n{BADGE if key == "catchup" else ""}">{n}</span>' if n not in ("0", "") else ''
        return f'<div class="cu-nav{c}">{ic(icon)}<span>{label}</span>{num}</div>'
    runs = {
        "wait": ('<span class="s wait">Claude Code · 답을 기다려요</span>', '<span class="s">Codex · 6분째 하는 중</span>'),
        "go":   ('<span class="s">Claude Code · 이어서 하는 중</span>', '<span class="s">Codex · 9분째 하는 중</span>'),
        "idle": ('<span class="s">Claude Code · PR을 올렸어요</span>', '<span class="s">Codex · 초안을 다 썼어요</span>'),
    }[run]
    srcs = [("envelope-simple", "Gmail", 41), ("slack-logo", "Slack", 63), ("chat-circle", "카카오톡 채널", 2),
            ("calendar-blank", "캘린더", 5), ("github-logo", "GitHub", 9), ("terminal-window", "Claude Code", 2), ("code", "Codex", 3)]
    out = "\n".join([
        '<aside class="cu-side">',
        f'<div class="cu-side-head"><span class="cu-logo"><svg><use href="#cu-mark"/></svg></span><span class="name">CatchUp</span><span class="cu-ib">{ic("magnifying-glass")}</span><span class="cu-ib">{ic("sidebar-simple")}</span></div>',
        nav("catchup", "cards", "캐치업", catchup), nav("fyi", "list-checks", "알려만 드려요", fyi),
        nav("later", "clock", "미뤄 둔 것", later), nav("log", "receipt", "처리 기록", ""),
        '<div class="cu-side-label">비서가 하는 일</div>',
        f'<div class="cu-run">{ic("terminal-window")}<span class="t">결제 재시도 넣기</span>{runs[0]}</div>',
        f'<div class="cu-run">{ic("code")}<span class="t">주간 보고 초안 쓰기</span>{runs[1]}</div>',
        f'<div class="cu-run">{ic("envelope-simple")}<span class="t">밤사이 메일 41통 정리</span><span class="s">8:55에 끝났어요</span></div>',
        '<div class="cu-side-label">들어오는 곳 · 밤사이</div>',
        *[f'<div class="cu-src-row">{ic(i)}<span>{n}</span><span class="n">{c}</span></div>' for i, n, c in srcs],
        '<div class="cu-me"><span class="cu-avatar">지우</span><span>한지우</span><span class="sub">설정</span></div>',
        '</aside>'])
    if pin:  # 예: runs:5 · fyi:5 · srcs:5 — 그 자리에 핀을 단다
        where, no = pin.split(":")
        mark = {"runs": '<div class="cu-side-label">비서가 하는 일', "fyi": '<span>알려만 드려요</span>', "srcs": '<div class="cu-side-label">들어오는 곳'}[where]
        tag = f' data-pin="{no}" data-pin-at="right"'
        out = out.replace(mark, mark.replace('<div class="cu-side-label"', '<div class="cu-side-label"' + tag).replace('<span>알려만', f'<span{tag}>알려만'))
    return out


def build():
    tpl = (HERE / "board.tpl.html").read_text()
    kit = "\n".join((p).read_text() for p in (DS / "tokens.css", DS / "components.css", HERE / "board-kit.css"))
    tpl = tpl.replace("/*@kit*/", kit)
    tpl = tpl.replace("<!--@sprite-->", (DS / "brand" / "sprite.svg").read_text().strip())
    for _ in range(3):
        tpl = re.sub(r"<!--@inc ([\w-]+)-->", lambda m: (HERE / f"{m.group(1)}.html").read_text().rstrip(), tpl)
    tpl = re.sub(r"<!--@status ?(\w*)-->", lambda m: status(m.group(1)), tpl)
    tpl = re.sub(r"<!--@side (\w+) (\w+) (\w+) (\w+) (\w+) ?([\w:]*)-->", lambda m: side(*m.groups()), tpl)
    tpl = tpl.replace('class="bd-screen"', 'class="bd-screen cu-root"').replace('class="bd-screen ', 'class="bd-screen cu-root ').replace("cu-root cu-root", "cu-root")
    left = re.findall(r"<!--@[^>]*-->", tpl)
    assert not left, left
    (HERE.parent / "board.src.html").write_text(tpl)
    print("✓ board.src.html")

build()
