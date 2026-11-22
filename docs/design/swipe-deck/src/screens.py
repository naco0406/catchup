"""밀기 시안의 화면 조각을 만들어요. 같은 카드를 상태(--dx · --p)만 바꿔 여러 번 그려요.
카드 내용은 apps/web/src/data/cards.ko.ts 의 예시 카드 그대로예요."""

def ic(n, cls=""):
    return f'<svg{" class=" + chr(34) + cls + chr(34) if cls else ""}><use href="#i-{n}"/></svg>'

CARDS = {
    "c01": dict(icon="envelope-simple", who="박서연", meta="한빛 디자인 · Gmail · 오전 8:12", due="오늘 18시까지 답해야 해요",
        ask="리브랜딩 견적, A안과 B안 중 어느 쪽으로 할까요?",
        sum=[("A안 1,480만 원 · 6주", " — 로고와 상세 화면 5종, 수정 2번", 0), ("B안 1,150만 원 · 4주", " — 로고와 상세 화면 3종, 수정 1번", 0), ("", "10월에 정한 예산은 1,300만 원이고, 출시는 1월 12일이에요.", 1)],
        ev=[("envelope-simple", "메일 3통"), ("file-pdf", "견적서_한빛_v2.pdf"), ("currency-dollar", "4분기 예산")],
        opts=[("B안으로 진행해요", "예산 안에 들고, 출시까지 2주가 남아요", 0), ("A안으로 진행해요", "예산을 180만 원 넘어요", 1), ("A안 범위를 1,300만 원에 맞출 수 있는지 되물어요", "답이 오면 다시 카드로 올려요", 0)],
        prev=("paper-plane-tilt", "1번을 고르면 이렇게 보내요 · 박서연", "서연 님, 검토해 보니 B안으로 진행하면 좋겠습니다. 계약서 초안을 보내 주시면 이번 주 안에 확인하겠습니다.")),
    "c02": dict(icon="terminal-window", who="Claude Code", meta="shop 저장소 · 결제 재시도 넣기", due="12분째 멈춰 있어요",
        ask="결제 재시도를 어디에서 하게 할까요?",
        sum=[("", "결제가 실패하면 3번까지 다시 시도하게 만드는 중이에요.", 0), ("", "지금은 주문 화면에만 있어서, 정기 결제는 실패하면 그대로 끝나요.", 0)],
        ev=[("list-checks", "지금까지 한 일 6단계"), ("file-text", "읽은 파일 12개"), ("check-circle", "테스트 38개 통과")],
        opts=[("결제 서버에서 다시 시도해요", "정기 결제까지 한 번에 해결돼요 · 파일 4개 · 10분쯤", 0), ("주문 화면에서만 다시 시도해요", "가장 작게 바꿔요 · 파일 1개 · 정기 결제는 그대로예요", 0), ("여기서 멈추고 두 방법을 정리해 둬요", "코드는 바꾸지 않고, 내가 나중에 직접 봐요", 0)]),
    "c05": dict(icon="code", who="Codex", meta="shop 저장소 · 주문 표에 칸 추가", due="운영 데이터가 바뀌어요", risk=1,
        ask="운영 DB에 이 명령을 실행해도 될까요?", cmd="$ pnpm db:migrate --env production",
        sum=[("", "주문 표에 ‘다시 시도한 횟수’ 칸을 더해요. 지우는 것은 없어요.", 0), ("", "되돌리는 스크립트가 같이 들어 있고, 스테이징에는 아직 안 돌렸어요.", 1)],
        ev=[],
        opts=[("스테이징에서 먼저 돌려요", "잘 되면 운영은 다시 물어봐요", 0), ("이번 한 번만 허용해요", "운영에 바로 실행해요 · 한 번 더 확인해요", 1), ("거절해요", "Codex는 이 단계를 건너뛰고 나머지를 이어서 해요", 0)]),
}

def option(i, o, rec=False, phone=True, check=False, picked=False, pin=""):
    label, detail, risky = o
    cls = "cu-opt" + (" picked" if picked else " rec" if rec else "")
    key = f'<span class="num">{i + 1}</span>{ic("check", "ck")}' if picked else str(i + 1)
    r = ""
    if risky and not picked: r = f'<span class="risk">{ic("warning")}위험</span>'
    elif rec and not phone and not picked: r = '<span class="cu-rec">추천</span><span class="cu-kbd">↵</span>'
    return f'<div class="{cls}"{pin}><span class="key">{key}</span><div><div class="l">{label}</div><div class="d">{detail}</div></div><span class="r">{r}</span></div>'

def card(cid, phone=True, cls="", p=None, armed=False, pins=None, style=""):
    """p: None 이면 평소. 숫자면 추천 답이 그만큼 차올라요(오른쪽으로 미는 중)."""
    c, pins = CARDS[cid], pins or {}
    pin = lambda k: (f' data-pin="{pins[k][0]}"' + (f' data-pin-at="{pins[k][1]}"' if len(pins[k]) > 1 else "")) if k in pins else ""
    due = (f'<span class="cu-due risk">{ic("warning")}{c["due"]}</span>' if c.get("risk") else f'<span class="cu-due">{c["due"]}</span>')
    out = [f'<div class="cu-card {"flat p" if phone else ""} {cls}{" armed" if armed else ""}"' + (f' style="{style}"' if style else "") + '>',
           f'<div class="cu-from"><span class="cu-tile">{ic(c["icon"])}</span><span class="who">{c["who"]}</span><span class="meta">{c["meta"]}</span><span class="sp"></span>{due}</div>',
           f'<h2 class="cu-ask"{pin("ask")}>{c["ask"]}</h2>']
    if c.get("cmd"):
        out.append(f'<div class="cu-code"><div class="fh">{ic("terminal-window")}<span>실행하려는 명령</span></div><div class="ln">{c["cmd"]}</div></div>')
    out.append('<ul class="cu-sum">' + "".join(f'<li{" class=dim" if dim else ""}>{"<b>" + s + "</b>" if s else ""}{t}</li>' for s, t, dim in c["sum"]) + '</ul>')
    if c["ev"]:
        out.append('<div class="cu-ev">' + "".join(f'<span class="cu-chip">{ic(i)}{t}</span>' for i, t in c["ev"]) + '</div>')
    out.append('<div class="cu-opts">')
    for i, o in enumerate(c["opts"]):
        if i == 0 and p is not None:
            out.append(f'<div class="sw-fill"{pin("rec")}>' + option(i, o, rec=True, phone=phone) + option(i, o, phone=phone, picked=True, check=armed) + '</div>')
        elif i == 0:
            out.append(option(i, o, rec=True, phone=phone, pin=pin("rec")))
        else:
            out.append(option(i, o, phone=phone).replace('class="cu-opt"', 'class="cu-opt sw-dim"', 1))
    out.append('</div>')
    if not phone and c.get("prev"):
        i, h, t = c["prev"]
        out.append(f'<div class="cu-prev"{pin("prev")}><div class="h">{ic(i)}<span>{h}</span><span class="sp"></span><a>고치기</a></div><p>{t}</p></div>')
    if not phone:
        out.append(f'<div class="cu-composer"><span class="sp">다르게 답하기 — 비서에게 말로 알려 주세요</span><span class="cu-ib">{ic("microphone")}</span><span class="cu-send">{ic("arrow-up")}</span></div>')
    if c.get("risk"):
        out.append(f'<div class="cu-foot"{pin("foot")}>{ic("shield-check")}<span>이런 카드는 밀어서 정할 수 없고, 시간이 지나도 저절로 정해지지 않아요.</span></div>')
    out.append('</div>')
    return "".join(out)

def ring(icon, arc=None, full=False, n=None, r=16, size=36):
    if full: return f'<span class="sw-ring full">{ic(icon, "ic")}</span>'
    c = size / 2
    g = f'<svg class="g" viewBox="0 0 {size} {size}"><circle class="t" cx="{c}" cy="{c}" r="{r}"/>' + (f'<circle class="a" cx="{c}" cy="{c}" r="{r}" pathLength="100" stroke-dasharray="{arc} 100"/>' if arc else "") + '</svg>'
    inner = f'<span class="n">{n}</span>' if n is not None else ic(icon, "ic")
    return f'<span class="sw-ring">{g}{inner}</span>'

def pill(ringhtml, l1, l2="", undo=False, pin="", one=False):
    tx = f'<span class="tx"><span class="l1">{l1}</span>' + (f'<span class="l2">{l2}</span>' if l2 else "") + '</span>'
    return f'<div class="sw-pill{" one" if one else ""}"{pin}>{ringhtml}{tx}' + ('<span class="u">되돌리기</span>' if undo else "") + '</div>'

DRAFT = "서연 님, 검토해 보니 B안으로 진행하면 좋겠습니다. 계약서…"

def phone(cid="c01", n=1, total=7, dx=0, p=None, side="", armed=False, lift=False, nxt="c02", pillhtml="", undo_on=False,
          mirror=("", "", ""), two=False, pins=None, title="캐치업", fyi=None, labels=None, go=False):
    """아이폰 화면 한 장. side: right|left|''. mirror: 도크 단추 셋의 상태(on · on rec · off)."""
    pins = pins or {}
    pin = lambda k: (f' data-pin="{pins[k][0]}"' + (f' data-pin-at="{pins[k][1]}"' if len(pins[k]) > 1 else "")) if k in pins else ""
    bar = "".join('<i class="d"></i>' if i < n - 1 else '<i class="on"></i>' if i == n - 1 else '<i></i>' for i in range(total))
    pv = 0 if p is None else p
    top = fyi if fyi else card(cid, cls="sw-top" + (" lift" if lift else "") + (" to-left" if side == "left" else ""), p=p if side == "right" else None, armed=armed, pins=pins,
                               style=f"--f:{pv if side == 'right' else 0};--d:{pv if side else 0}")
    under = card(nxt, cls="sw-next") if nxt else ""
    labels = labels or ("미루기", "내가 직접", "추천대로")
    if two:
        acts = f'<div class="cu-pacts sw-mirror two"{pin("acts")}><span>{ic("clock")}미루기</span><span>{ic("hand-tap")}내가 직접</span></div>'
    else:
        acts = (f'<div class="cu-pacts sw-mirror"{pin("acts")}><span class="{mirror[0]}">{ic("arrow-left")}{labels[0]}</span>'
                f'<span class="{mirror[1]}">{ic("hand-tap")}{labels[1]}</span><span class="{mirror[2]}">{labels[2]}{ic("arrow-right")}</span></div>')
    return "".join([
        '<div class="cu-phone">',
        f'<div class="cu-ptop"><span class="cu-ib">{ic("list")}</span><span class="ttl">{title}</span><span class="cnt"{pin("cnt")}>{total}개 중 {n}번째</span><span class="sp"></span>'
        f'<span class="cu-ib{"" if undo_on else " off"}"{pin("undo")}>{ic("arrow-u-up-left")}</span><span class="cu-ib">{ic("rows")}</span></div>',
        f'<div class="cu-pbar">{bar}</div>',
        f'<div class="sw-stage{" go" if go else ""}" style="--dx:{dx}px;--p:{pv}">{under}{top}</div>',
        f'<div class="cu-pdock sw-dock">{pillhtml}'
        f'<div class="cu-composer"{pin("composer")}><span class="sp">다르게 답하기</span><span class="cu-ib">{ic("microphone")}</span><span class="cu-send">{ic("arrow-up")}</span></div>{acts}</div>',
        '</div>'])

def fyi_card(pins=None):
    pins = pins or {}
    pin = lambda k: (f' data-pin="{pins[k][0]}"' + (f' data-pin-at="{pins[k][1]}"' if len(pins[k]) > 1 else "")) if k in pins else ""
    return (f'<div class="cu-card flat p sw-top lift sw-fyi"><div class="cu-from"><span class="cu-tile">{ic("slack-logo")}</span><span class="who">#제품</span>'
            f'<span class="meta">Slack · 이도현 외 4명 · 글 23개를 줄였어요</span><span class="sp"></span><span class="cu-due calm">알려만 드려요</span></div>'
            f'<h2 class="cu-ask"{pin("ask")}>12월 출시 일정이 12월 9일로 확정됐어요</h2>'
            '<ul class="cu-sum"><li>QA는 12월 2일까지 끝내기로 했어요.</li><li>출시 공지 초안은 정유나 님이 12월 4일까지 써요.</li><li class="dim">내가 맡은 일은 없어요. 12월 9일 오전은 캘린더가 비어 있어요.</li></ul>'
            f'<div class="cu-ev"><span class="cu-chip">{ic("chat-circle")}글 23개</span><span class="cu-chip">{ic("calendar-blank")}12월 9일</span></div>'
            f'<span class="cu-link"{pin("promote")}>{ic("cards")}할 일이 있어요 — 카드로 올리기</span></div>')

def fyi_next():
    return (f'<div class="cu-card flat p sw-next sw-fyi"><div class="cu-from"><span class="cu-tile">{ic("github-logo")}</span><span class="who">shop</span>'
            f'<span class="meta">GitHub · 검토는 정유나 님이 했어요</span><span class="sp"></span><span class="cu-due calm">알려만 드려요</span></div>'
            '<h2 class="cu-ask">PR 3개가 합쳐졌고, 밤 배포는 문제없이 끝났어요</h2>'
            '<ul class="cu-sum"><li>결제 화면 문구, 주문 목록 속도, 로그인 오류 안내가 들어갔어요.</li><li class="dim">배포 뒤 오류 알림은 없었어요.</li></ul></div>')

# ── 화면들 ──
def screens():
    S = {}
    right = lambda icon, arc=None, full=False: ring(icon, arc=arc, full=full)
    S["rest"] = phone()
    S["nudge"] = phone(dx=28, p=.29, side="right", lift=True, mirror=("", "", "on rec"))
    S["part"] = phone(dx=64, p=.58, side="right", lift=True, pillhtml=pill(right("paper-plane-tilt", arc=58), "답장을 보내요 · 박서연", DRAFT), mirror=("", "", "on rec"))
    S["armed"] = phone(dx=150, p=1, side="right", armed=True, lift=True, pillhtml=pill(right("paper-plane-tilt", full=True), "놓으면 보내요 · 박서연", DRAFT), mirror=("off", "off", "on rec"))
    S["fly"] = phone(dx=236, p=1, side="right", armed=True, lift=True, go=True, pillhtml=pill(ring("", arc=100, n=10), "10초 뒤에 보내요", "B안으로 진행해요", undo=True), undo_on=True)
    S["after"] = phone("c02", n=2, nxt="", pillhtml=pill(ring("", arc=82, n=8), "8초 뒤에 보내요", "B안으로 진행해요", undo=True), undo_on=True)
    S["left"] = phone(dx=-150, p=1, side="left", lift=True, pillhtml=pill(right("clock", full=True), "놓으면 미뤄요", "오후 2시에 다시 올려요"), mirror=("on", "off", "off"))
    S["risky"] = phone("c05", n=5, dx=18, p=0, lift=True, nxt="", two=True, pillhtml=pill(right("warning"), "밀어서 정할 수 없어요", "운영 데이터가 바뀌어요 · 눌러서 골라 주세요"))
    fyi = phone(n=1, total=5, dx=150, p=1, side="right", title="알려만 드려요", fyi=fyi_card(), nxt="",
                pillhtml=pill(right("check", full=True), "놓으면 읽음으로 표시해요", "덱에서 빠지고 처리 기록에 남아요"), mirror=("off", "off", "on"), labels=("나중에", "카드로", "읽음"))
    S["fyi"] = fyi.replace('--dx:150px;--p:1">', '--dx:150px;--p:1">' + fyi_next(), 1)
    return S

# 번호 핀이 설 자리 — 기기 바깥 여백에, 가리키는 것과 같은 높이로(y 는 화면 위 끝부터). (번호, y, 왼쪽|오른쪽)
ANCHORS = {
    "rest": [(1, 444, "l"), (2, 794, "l"), (3, 794, "r")],
    "nudge": [(1, 482, "l"), (2, 794, "r")],
    "part": [(1, 482, "l"), (2, 150, "l"), (3, 676, "l")],
    "armed": [(1, 482, "l"), (2, 676, "l")],
    "after": [(1, 676, "l"), (2, 99, "l"), (3, 70, "r")],
    "left": [(1, 676, "r"), (2, 794, "l")],
    "risky": [(1, 676, "l"), (2, 794, "l")],
    "fyi": [(1, 676, "l"), (2, 794, "l"), (3, 452, "r")],
}

def device(name, with_pins=True):
    """기기 한 대. 번호 핀은 기기 밖 여백(.sw-a)에 서요 — 좁은 화면 안에는 핀이 설 빈자리가 없어요."""
    a = "".join(f'<i class="sw-a {side}" style="top:{y}px" data-pin="{n}" data-pin-at="center"></i>' for n, y, side in ANCHORS.get(name, [])) if with_pins else ""
    return ('<div class="sw-device"><div class="bd-status"><span>9:41</span><span class="island"></span><span class="bat"></span></div>'
            f'<div class="sw-view cu-root">{screens()[name]}</div></div>{a}')

# ── 아이패드 가로 ── 사이드바는 docs/design/decision-inbox/src/assemble.py 의 것과 같은 모양이에요
def side():
    def nav(on, icon, label, n="", badge=False):
        num = f'<span class="n{" badge" if badge else ""}">{n}</span>' if n else ""
        return f'<div class="cu-nav{" on" if on else ""}">{ic(icon)}<span>{label}</span>{num}</div>'
    srcs = [("envelope-simple", "Gmail", 41), ("slack-logo", "Slack", 63), ("chat-circle", "카카오톡 채널", 2), ("calendar-blank", "캘린더", 5), ("github-logo", "GitHub", 9), ("terminal-window", "Claude Code", 2), ("code", "Codex", 3)]
    return "\n".join([
        '<aside class="cu-side">',
        f'<div class="cu-side-head"><span class="cu-logo"><svg><use href="#cu-mark"/></svg></span><span class="name">CatchUp</span><span class="cu-ib">{ic("magnifying-glass")}</span></div>',
        nav(1, "cards", "캐치업", "7", True), nav(0, "list-checks", "알려만 드려요", "5"), nav(0, "clock", "미뤄 둔 것"), nav(0, "receipt", "처리 기록"),
        '<div class="cu-side-label">비서가 하는 일</div>',
        f'<div class="cu-run">{ic("terminal-window")}<span class="t">결제 재시도 넣기</span><span class="s wait">Claude Code · 답을 기다려요</span></div>',
        f'<div class="cu-run">{ic("code")}<span class="t">주간 보고 초안 쓰기</span><span class="s">Codex · 6분째 하는 중</span></div>',
        f'<div class="cu-run">{ic("envelope-simple")}<span class="t">밤사이 메일 41통 정리</span><span class="s">비서 · 8:55에 끝났어요</span></div>',
        '<div class="cu-side-label">들어오는 곳 · 밤사이</div>',
        *[f'<div class="cu-src-row">{ic(i)}<span>{n}</span><span class="n">{c}</span></div>' for i, n, c in srcs],
        '<div class="cu-me"><span class="cu-avatar">지우</span><span>한지우</span><span class="sub">설정</span></div>',
        '</aside>'])

def pad():
    slot = pill(ring("paper-plane-tilt", full=True), "놓으면 보내요 · 박서연", one=True, pin=' data-pin="2"')
    top = card("c01", phone=False, cls="sw-top lift", p=1, armed=True, pins={"prev": ("3",)}, style="--f:1;--d:1")
    top = top.replace('<div class="sw-fill">', '<div class="sw-fill"><i class="sw-a" style="left:80%;top:50%;z-index:5" data-pin="1" data-pin-at="center"></i>', 1)
    nxt = card("c02", phone=False, cls="sw-next")
    acts = (f'<div class="cu-acts"><span class="cu-btn ghost"><span class="cu-kbd">←</span>미루기</span>'
            f'<span class="cu-btn ghost">{ic("hand-tap")}내가 직접 할게요 <span class="cu-kbd">D</span></span><span class="sp"></span>'
            f'<span class="cu-btn ghost on rec" data-pin="4">추천대로 <span class="cu-kbd">→</span></span></div>')
    return "".join([
        f'<div class="cu-status side"><span>9:41</span><span>11월 23일 (월)</span><span class="sp"></span>{ic("wifi-high")}<span>100%</span>{ic("battery-full")}</div>',
        '<div class="cu-app">', side(), '<div class="cu-main sw-wide">',
        f'<div class="cu-top"><h1>캐치업</h1><span class="left">7개 중 1번째</span><span class="sp"></span><div class="sw-slot">{slot}</div><span class="sp"></span>'
        f'<span class="cu-ib off">{ic("arrow-u-up-left")}</span><span class="cu-ib">{ic("rows")}</span></div>',
        f'<div class="cu-stage"><div class="cu-deck" style="--dx:170px;--p:1">{nxt}{top}</div>{acts}</div>',
        '</div></div>'])


# ── 직접 밀어 보는 칸 ── 같은 CSS 를 스크립트가 움직여요(시안용. 앱 코드가 아니에요)
DEMO = [
    dict(id="c01", icon="paper-plane-tilt", go="답장을 보내요 · 박서연", arm="놓으면 보내요 · 박서연", after="초 뒤에 보내요", l2=DRAFT, done="B안으로 진행해요"),
    dict(id="c02", icon="paper-plane-tilt", go="Claude Code에게 전해요", arm="놓으면 Claude Code에게 전해요", after="초 뒤에 Claude Code에게 전해요", l2="결제 서버에서 다시 시도해요", done="결제 서버에서 다시 시도해요"),
    dict(id="c05", risky="1", l2="운영 데이터가 바뀌어요 · 눌러서 골라 주세요"),
]

def demo():
    import json
    tpls = "".join(f"<template data-meta='{json.dumps({k: v for k, v in d.items()}, ensure_ascii=False)}'>{card(d['id'], p=None if d.get('risky') else 0)}</template>" for d in DEMO)
    dev = (f'<div class="sw-device" tabindex="0" aria-label="밀어 보는 예시"><div class="bd-status"><span>9:41</span><span class="island"></span><span class="bat"></span></div><div class="sw-view cu-root"><div class="cu-phone">'
           f'<div class="cu-ptop"><span class="cu-ib">{ic("list")}</span><span class="ttl">캐치업</span><span class="cnt">7개 중 1번째</span><span class="sp"></span><span class="cu-ib off" data-undo>{ic("arrow-u-up-left")}</span><span class="cu-ib">{ic("rows")}</span></div>'
           '<div class="cu-pbar"></div><div class="sw-stage"></div>'
           '<div class="cu-pdock sw-dock"><div class="sw-pillbox"><div class="sw-pill"><span class="sw-ring"><svg class="g" viewBox="0 0 36 36"><circle class="t" cx="18" cy="18" r="16"/><circle class="a" cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="0 100"/></svg><span class="in"></span></span>'
           '<span class="tx"><span class="l1"></span><span class="l2"></span></span><button type="button" class="u" hidden>되돌리기</button></div></div>'
           f'<div class="cu-composer"><span class="sp">다르게 답하기</span><span class="cu-ib">{ic("microphone")}</span><span class="cu-send">{ic("arrow-up")}</span></div>'
           f'<div class="cu-pacts sw-mirror"><span data-act="left">{ic("arrow-left")}미루기</span><span>{ic("hand-tap")}내가 직접</span><span data-act="right">추천대로{ic("arrow-right")}</span></div></div>'
           f'</div></div></div>{tpls}')
    icons = {n: ic(n, "ic") for n in ("paper-plane-tilt", "clock", "warning", "check")}
    js = (HERE_JS.replace("__ICONS__", json.dumps(icons)))
    return dev, js

HERE_JS = r"""
(() => {
  const root = document.getElementById('sw-demo'); if (!root) return;
  const IC = __ICONS__, T = 98, W = 392, HOLD = 10;
  const $ = s => root.querySelector(s);
  const stage = $('.sw-stage'), box = $('.sw-pillbox'), pill = $('.sw-pill'), ring = $('.sw-ring'), arc = $('.sw-ring .a'), inn = $('.sw-ring .in'),
    l1 = $('.l1'), l2 = $('.l2'), undoBtn = $('.sw-pill .u'), cnt = $('.cnt'), bar = $('.cu-pbar'), acts = [...root.querySelectorAll('.cu-pacts span')], undoTop = $('[data-undo]');
  const tpls = [...root.querySelectorAll('template')], meta = tpls.map(t => JSON.parse(t.dataset.meta));
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, top, x = 0, v = 0, armed = false, g = null, raf = 0, tick = 0, last = null;
  const m = () => meta[i % meta.length];
  const make = (k, cls) => { const e = tpls[k % tpls.length].content.firstElementChild.cloneNode(true); e.classList.add(cls); return e; };
  function mount() {
    stage.classList.remove('go'); stage.replaceChildren(make(i + 1, 'sw-next'), top = make(i, 'sw-top'));
    cnt.textContent = `7개 중 ${i % 7 + 1}번째`;
    bar.innerHTML = Array.from({ length: 7 }, (_, k) => `<i class="${k < i % 7 ? 'd' : k === i % 7 ? 'on' : ''}"></i>`).join('');
    acts[0].innerHTML = m().risky ? IC.clock + '미루기' : acts[0].dataset.html; acts[2].style.visibility = m().risky ? 'hidden' : '';
    armed = false; draw(0);
  }
  function showPill(icon, a, b, opt = {}) {
    box.classList.add('show'); ring.classList.toggle('full', !!opt.full);
    inn.innerHTML = opt.n !== undefined ? `<span class="n">${opt.n}</span>` : IC[icon];
    arc.setAttribute('stroke-dasharray', `${opt.arc ?? 0} 100`); arc.style.display = opt.full ? 'none' : '';
    l1.textContent = a; l2.textContent = b; undoBtn.hidden = !opt.undo;
  }
  function draw(nx) {
    x = nx; const risky = m().risky, shown = risky ? Math.max(-24, Math.min(24, x * .2)) : x, dir = x > 0 ? 1 : -1;
    const p = risky ? 0 : Math.min(1, Math.abs(x) / T);
    const was = armed; armed = !risky && (armed ? Math.abs(x) > T - 16 : Math.abs(x) >= T);
    if (armed !== was && g) navigator.vibrate?.(10);
    stage.style.cssText = `--dx:${shown}px;--p:${p}`;
    top.style.cssText = `--f:${dir > 0 ? p : 0};--d:${p}`;
    top.classList.toggle('lift', x !== 0); top.classList.toggle('armed', armed && dir > 0); top.classList.toggle('to-left', dir < 0 && x !== 0);
    acts[0].className = !risky && dir < 0 && x ? 'on' : armed ? 'off' : ''; acts[1].className = armed ? 'off' : ''; acts[2].className = !risky && dir > 0 && x ? 'on rec' : armed ? 'off' : '';
    if (Math.abs(x) < 4) { if (!last) box.classList.remove('show'); else toast(); return; }
    if (risky) showPill('warning', '밀어서 정할 수 없어요', m().l2);
    else if (dir > 0) showPill(m().icon, armed ? m().arm : m().go, m().l2, { arc: p * 100, full: armed });
    else showPill('clock', armed ? '놓으면 미뤄요' : '미뤄 둬요', '오후 2시에 다시 올려요', { arc: p * 100, full: armed });
  }
  function toast() {
    if (!last) { box.classList.remove('show'); undoTop.classList.add('off'); return; }
    const left = Math.max(0, Math.ceil(last.until - performance.now() / 1000));
    if (!left) { last = null; clearInterval(tick); box.classList.remove('show'); undoTop.classList.add('off'); return; }
    undoTop.classList.remove('off');
    if (last.dir > 0) showPill('', `${left}${last.m.after}`, last.m.done, { arc: left / HOLD * 100, n: left, undo: true });
    else showPill('clock', '오후 2시에 다시 올려요', `${left}초 안에 되돌릴 수 있어요`, { arc: left / last.hold * 100, undo: true });
  }
  // 스프링 — 놓은 속도를 이어받아요
  function spring(to, k, c, done) {
    cancelAnimationFrame(raf); let t0 = performance.now();
    const step = t => { const dt = Math.min(.032, (t - t0) / 1000); t0 = t; v += (-k * (x - to) - c * v) * dt; const nx = x + v * dt;
      if (Math.abs(nx - to) < .5 && Math.abs(v) < 20) { v = 0; draw(to); done?.(); return; }
      draw(nx); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  function leave(dir) {
    const mm = m(), hold = dir > 0 ? HOLD : 5;
    v = dir * Math.max(Math.abs(v), 900); stage.classList.add('go');
    spring(dir * W * 1.5, 439, 41.9, () => { i++; last = { dir, m: mm, hold, until: performance.now() / 1000 + hold }; mount(); clearInterval(tick); tick = setInterval(toast, 250); toast(); });
  }
  function undo() {
    if (!last) return; const dir = last.dir; last = null; clearInterval(tick); i--; mount(); v = 0; draw(dir * W * 1.2); spring(0, 247, 26.7);
  }
  function release() {
    const s = g; g = null; stage.classList.remove('grabbing'); if (!s?.on) return;
    const proj = x + .499 * v * (v * x > 0 ? 1 : 0), fling = Math.abs(v) >= 500 && Math.abs(proj) >= W / 2 && v * x > 0, back = v * x < 0 && Math.abs(v) >= 500;
    if (!m().risky && !back && (armed || fling)) leave(x > 0 ? 1 : -1); else spring(0, 247, 26.7);
  }
  stage.addEventListener('pointerdown', e => { if (!e.isPrimary) return; cancelAnimationFrame(raf); g = { x: e.clientX - x, y: e.clientY, id: e.pointerId, on: x !== 0, px: e.clientX, t: e.timeStamp }; v = 0; });
  stage.addEventListener('pointermove', e => {
    if (!g || g.id !== e.pointerId) return; const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.on) { if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g = null; return; } if (Math.abs(dx) < 10) return; g.on = true; g.x += Math.sign(dx) * 10; stage.classList.add('grabbing'); try { stage.setPointerCapture(e.pointerId); } catch {} }
    const dt = Math.max(1, e.timeStamp - g.t); v = .6 * v + .4 * (e.clientX - g.px) / dt * 1000; g.px = e.clientX; g.t = e.timeStamp;
    draw(e.clientX - g.x);
  });
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', () => { g = null; stage.classList.remove('grabbing'); spring(0, 247, 26.7); });
  const auto = dir => { if (m().risky || g || Math.abs(x) > 1) return; v = dir * 1400; spring(dir * (T + 24), 900, 60, () => leave(dir)); };
  acts[0].dataset.html = acts[0].innerHTML;
  acts[0].addEventListener('click', () => (m().risky ? leave(-1) : auto(-1)));
  acts[2].addEventListener('click', () => auto(1));
  undoBtn.addEventListener('click', undo); undoTop.addEventListener('click', undo);
  $('.sw-device').addEventListener('keydown', e => { if (e.repeat) return; if (e.key === 'ArrowRight') { e.preventDefault(); auto(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); auto(-1); } else if (e.key.toLowerCase() === 'z') undo(); });
  mount();
})();
"""
