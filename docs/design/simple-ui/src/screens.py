"""'쉽고 빠른 화면' 시안의 화면 조각을 만들어요. 제품의 기본 언어가 영어라서 화면 속 글은 영어예요.
카드 내용은 apps/web/src/data/cards.en.ts 의 예시 카드(월요일 아침)에서 가져왔고, 가운뎃점은 쉼표로 풀었어요.
넓은 화면은 아이패드 가로(1194×834), 아이폰은 390×844(상태 막대 44 포함)로 그려요."""

def ic(n, cls=""):
    return f'<svg{" class=" + chr(34) + cls + chr(34) if cls else ""}><use href="#i-{n}"/></svg>'

def pin(pins, k):
    """pins[k] = (번호,) 또는 (번호, 자리). 자리를 비우면 굽는 도구가 빈자리를 골라요."""
    if not pins or k not in pins: return ""
    p = pins[k]
    return f' data-pin="{p[0]}"' + (f' data-pin-at="{p[1]}"' if len(p) > 1 else "")

CARDS = {
    "c01": dict(icon="envelope-simple", who="Seoyeon Park", meta="Hanbit Design, 8:12 AM", due="Reply by 6 PM today",
        ask="Rebrand quote: go with plan A or plan B?",
        sum=[("A: $11,200, 6 weeks", " — logo and 5 detail screens, 2 rounds of edits", 0), ("B: $8,700, 4 weeks", " — logo and 3 detail screens, 1 round of edits", 0), ("", "The budget set in October is $9,800. Launch is Jan 12.", 1)],
        ev="3 emails, quote_hanbit_v2.pdf, Q4 budget",
        opts=[("Go with plan B", "Fits the budget and leaves two weeks before launch", 0), ("Go with plan A", "$1,400 over budget", 1), ("Ask if plan A can fit $9,800", "You’ll get a new card when they reply", 0)],
        prev=("Reply to Seoyeon", "Hi Seoyeon, we’d like to go ahead with plan B. Send over the contract draft and I’ll review it this week.")),
    "c02": dict(icon="terminal-window", who="Claude Code", meta="shop repo, Add payment retries", due="Waiting 12 min",
        ask="Where should payment retries happen?",
        sum=[("", "Making failed payments retry up to 3 times.", 0), ("", "Right now retries only exist on the checkout page, so failed subscriptions just stop.", 0)],
        ev="6 steps so far, 12 files read, 38 tests passing",
        opts=[("Retry in the payment service", "Covers subscriptions too, 4 files, about 10 min", 0), ("Retry on the checkout page only", "Smallest change, 1 file, subscriptions stay as they are", 0), ("Stop here and write up both options", "No code changes. I’ll look later.", 0)],
        code=("Code change", "services/payments/retry.ts", ["- return charge(order)", "+ return withRetry(() => charge(order), { times: 3 })"])),
    "c05": dict(icon="code", who="Codex", meta="shop repo, Add a column to orders", due="Changes production data", risk=1,
        ask="Run this command on the production database?", cmd="$ pnpm db:migrate --env production",
        sum=[("", "Adds a “retry count” column to the orders table. Nothing is deleted.", 0), ("", "A rollback script is included. It hasn’t run on staging yet.", 1)],
        ev="",
        opts=[("Run it on staging first", "You’ll be asked again before production", 0), ("Allow just this once", "Runs on production now", 1), ("Decline", "Codex skips this step and carries on", 0)]),
}

def option(i, o, rec=False, phone=True, hold=None, pins=None, rows="v2"):
    """답 한 줄. rows: 'v2' 시안(번호는 첫 두 줄 옆, 이유는 꼬리표 아래까지 온 폭, 모서리 24)
    'clamp' 한 줄로 자르기(알약 그대로) · 'label' 이름만(이유는 추천 답 아래 한 줄).
    hold: None 평소, 'hint' 짧게 누른 직후(안내만), 0~1 꾹 누르는 중(그만큼 차올라요), 1 다 찼어요(놓으면 실행)"""
    label, detail, risky = o
    r = ""
    if risky: r = f'<span class="risk">{ic("warning")}Risky</span>'
    elif rec and not phone: r = '<span class="cu-rec">Suggested</span>'
    if rows == "out":     # 알약에는 번호와 이름만(한 줄이면 반원). 이유는 알약 밖 아래에
        pill = lambda cls, key=None: f'<div class="cu-opt sk-pill{cls}"><span class="key">{key or i + 1}</span><div class="l">{label}</div><span class="r">{r}</span></div>'
        cap, capcls, attr = detail, "", (pin(pins, "rec") if rec else pin(pins, f"opt{i + 1}"))
        if hold is None or not risky: body = pill(" rec" if rec else "")
        elif hold == "hint": body, cap, capcls, attr = pill(" confirm"), f'{ic("warning")}Hold to run', " warn", pin(pins, "hold")
        else:
            full = hold >= 1
            body = f'<div class="sk-hold" style="--h:{hold}">' + pill(" confirm") + pill(" held", ic("check") if full else None) + '</div>'
            cap, capcls, attr = ("Release to run" if full else "Keep holding"), " warn", pin(pins, "hold")
        return f'<div class="sk-o1"{attr}>{body}<div class="sk-cap{capcls}">{cap}</div></div>'
    if rows == "inset":   # 번호를 작게 줄여 이름 줄 안에. 글은 왼쪽 여백 20 에서 한 덩어리로
        return (f'<div class="cu-opt sk-inset{" rec" if rec else ""}"><span class="key">{i + 1}</span><div class="l">{label}</div><span class="r">{r}</span><div class="d">{detail}</div></div>')
    if rows == "group":   # 답 셋을 한 묶음 안의 줄로
        return (f'<div class="sk-grow{" rec" if rec else ""}"><span class="key">{i + 1}</span><div class="l">{label}</div><span class="r">{r}</span><div class="d">{detail}</div></div>')
    if rows in ("clamp", "label"):   # 디자인 시스템의 지금 구조(가운데 맞춤 알약)
        d = f'<div class="d">{detail}</div>' if rows == "clamp" else ""
        out = (f'<div class="cu-opt sk-{rows}{" rec" if rec else ""}"><span class="key">{i + 1}</span><div><div class="l">{label}</div>{d}</div><span class="r">{r}</span></div>')
        return out + (f'<div class="sk-why">{detail}</div>' if rows == "label" and rec else "")
    if rows == "r24": r24 = " r24"
    else: r24 = ""
    row = lambda cls, d, attr="", key=None: (f'<div class="{cls}{r24}"{attr}><span class="key">{key or i + 1}</span><div class="l">{label}</div><span class="r">{r}</span><div class="d">{d}</div></div>')
    if hold is None or not risky:
        return row("cu-opt v2" + (" rec" if rec else ""), detail, pin(pins, "rec") if rec else pin(pins, f"opt{i + 1}"))
    hint = f'{ic("warning")}Hold to run'
    if hold == "hint":
        return row("cu-opt v2 confirm", hint, pin(pins, "hold"))
    # 꾹 누르는 중: 잉크로 칠한 줄을 겹쳐 두고 --h 만큼만 보여요(밀기의 차오르는 줄과 같은 방법, 색만 잉크)
    full = hold >= 1
    held = row("cu-opt v2 held", "Release to run" if full else "Keep holding", key=ic("check") if full else None)
    return f'<div class="sk-hold" style="--h:{hold}"{pin(pins, "hold")}>' + row("cu-opt v2 confirm", hint) + held + '</div>'

def card(cid, phone=True, cls="", pins=None, hold=None, style="", rows=None):
    """시안의 결정 카드: 근거는 글 한 줄, 추천 줄에는 낱말 하나, 나갈 글의 머리는 이름표."""
    c = CARDS[cid]
    rows = rows or ("out" if phone else "v2")   # 아이폰: 알약엔 이름만, 이유는 아래 · 넓은 화면: 지금처럼 두 줄이 알약 안에
    due = f'<span class="cu-due risk"{pin(pins, "due")}>{ic("warning")}{c["due"]}</span>' if c.get("risk") else f'<span class="cu-due">{c["due"]}</span>'
    out = [f'<div class="cu-card {"flat p " if phone else ""}{cls}"' + (f' style="{style}"' if style else "") + '>',
           f'<div class="cu-from"><span class="cu-tile">{ic(c["icon"])}</span><span class="who">{c["who"]}</span><span class="meta">{c["meta"]}</span><span class="sp"></span>{due}</div>',
           f'<h2 class="cu-ask"{pin(pins, "ask")}>{c["ask"]}</h2>']
    if c.get("cmd"):
        out.append(f'<div class="cu-code"><div class="fh">{ic("terminal-window")}<span>Command</span></div><div class="ln">{c["cmd"]}</div></div>')
    out.append('<ul class="cu-sum">' + "".join(f'<li{" class=dim" if dim else ""}>{"<b>" + s + "</b>" if s else ""}{t}</li>' for s, t, dim in c["sum"]) + '</ul>')
    if c["ev"]:
        out.append(f'<div class="sk-ev"{pin(pins, "ev")}>{ic("paperclip")}<span>{c["ev"]}</span></div>')
    out.append(f'<div class="cu-opts{" sk-group" if rows == "group" else " sk-gap" if rows == "out" else ""}">' + "".join(option(i, o, rec=(i == 0), phone=phone, hold=hold, pins=pins, rows=rows) for i, o in enumerate(c["opts"])) + '</div>')
    if c.get("prev"):
        h, t = c["prev"]
        out.append(f'<div class="cu-prev"{pin(pins, "prev")}><div class="h">{ic("paper-plane-tilt")}<span>{h}</span><span class="sp"></span>'
                   f'<span class="sk-tabs"><i class="on">1</i><i>2</i><i>3</i></span><a>Edit</a></div><p>{t}</p></div>')
    if c.get("code"):
        h, f, lines = c["code"]
        out.append(f'<div class="cu-code"><div class="fh">{ic("git-branch")}<span>{h}</span><span class="file">{f}</span><span class="sp"></span><span class="st"><span class="a">+18</span><span class="m">−2</span><span>4 files</span></span></div>'
                   + "".join(f'<div class="ln {"add" if l.startswith("+") else "del"}">{l}</div>' for l in lines) + '</div>')
    if not phone:
        out.append(f'<div class="cu-composer"{pin(pins, "composer")}><span class="sp">Answer differently</span><span class="cu-ib">{ic("microphone")}</span><span class="cu-send">{ic("arrow-up")}</span></div>')
    out.append('</div>')
    return "".join(out)

def pbar(n, total):
    return '<div class="cu-pbar">' + "".join('<i class="d"></i>' if i < n - 1 else '<i class="on"></i>' if i == n - 1 else '<i></i>' for i in range(total)) + '</div>'

def toast(count, l1, l2="", arc=.9, undo=True):
    """디자인 시스템의 <Toast>(두 줄 + 고리). 넓은 화면의 위 막대 자리에서는 한 줄만 보여요."""
    return (f'<div class="cu-toast two"><span class="cu-ring" style="--ring:{arc}"><span class="n">{count}</span></span>'
            f'<span class="tx"><span class="l1">{l1}</span>' + (f'<span class="l2">{l2}</span>' if l2 else "") + '</span>'
            + ('<span class="u">Undo</span>' if undo else "") + '</div>')

# ── 메뉴(서랍 · 고정) ──
def side(route="catchup", drawer=True, settings=False, pins=None, pinned=False, counts=("7", "5", "", "2")):
    def nav(key, icon, label, n="", badge=False):
        num = f'<span class="n{" badge" if badge else ""}">{n}</span>' if n else ""
        return f'<div class="cu-nav{" on" if route == key else ""}"{pin(pins, key)}>{ic(icon)}<span>{label}</span>{num}</div>'
    head = (f'<div class="cu-side-head"{pin(pins, "head")}><span class="cu-logo"><svg><use href="#cu-mark"/></svg></span><span class="name">CatchUp</span>'
            f'<span class="cu-ib{" sk-info on" if pinned else ""}">{ic("push-pin")}</span>'
            + (f'<span class="cu-ib">{ic("x")}</span>' if drawer else "") + '</div>')
    sets = ""
    if settings:
        sets = (f'<div class="sk-set"{pin(pins, "set")}>'
                f'<div class="row">{ic("translate")}<span>Language</span><span class="cu-seg"><span class="on">English</span><span>한국어</span></span></div>'
                f'<div class="row">{ic("bell")}<span>Notifications</span></div>'
                f'<div class="row">{ic("sign-out")}<span>Sign out</span></div></div>')
    return "".join([
        f'<aside class="cu-side sk-side{" drawer" if drawer else ""}">', head,
        nav("catchup", "cards", "Catch up", counts[0], True), nav("fyi", "list-checks", "FYI", counts[1]), nav("snoozed", "clock", "Snoozed", counts[2]), nav("activity", "receipt", "Activity"),
        f'<div class="cu-side-label"{pin(pins, "label")}>Tomato</div>',
        nav("assistant", "chat-circle", "Talk to Tomato"), nav("memory", "brain", "What Tomato knows"), nav("sessions", "terminal-window", "Coding sessions", counts[3]), nav("connections", "plugs-connected", "Connections"),
        '<div class="foot">', sets, f'<div class="cu-nav{" on" if settings else ""}"{pin(pins, "gear")}>{ic("gear-six")}<span>Settings</span></div>', '</div>',
        '</aside>'])

def menu_btn(dot=True, pins=None):
    return f'<span class="cu-ib sk-menu"{pin(pins, "menu")}>{ic("list")}' + ('<i class="dot"></i>' if dot else "") + '</span>'

# ── 넓은 화면 ──
def wide(main, drawer="", pinned="", over=""):
    return f'<div class="cu-root sk-wide">{pinned}<div class="cu-main">{main}</div>' + (f'<div class="sk-scrim"></div>{drawer}' if drawer else "") + over + '</div>'

def keys_pop(pins=None):
    """? 를 눌렀을 때의 키 목록 — 지금 앱이 받는 키(App.tsx)에 새 키 둘([ · ?)을 더한 거예요."""
    kbd = lambda *ks: '<span class="k">' + "".join(f'<span class="cu-kbd">{k}</span>' for k in ks) + '</span>'
    rows = [(("1–5",), "Pick an answer"), (("↵", "→"), "Go with suggestion"), (("←", "S"), "Snooze"), (("D",), "I’ll do it"), (("Z",), "Undo"),
            (("/",), "Answer differently"), (("A",), "Talk to Tomato"), (("[",), "Menu")]
    return (f'<div class="sk-pop" style="right:16px;bottom:16px;width:236px"><b{pin(pins, "keys")}>Keys</b><div class="sk-keys">'
            + "".join(kbd(*ks) + f'<span>{label}</span>' for ks, label in rows) + '</div></div>')

def deck_main(cid="c01", n=1, total=7, nxt="c02", toast_html="", pins=None, hold=None, dot=True, menu=True):
    c = CARDS[cid]
    top = (f'<div class="cu-top sk-top"><span class="l">{menu_btn(dot, pins) if menu else ""}<h1>Catch up</h1><span class="left"{pin(pins, "left")}>{total - n + 1} left</span></span>'
           f'<div class="sk-slot"{pin(pins, "slot")}>{toast_html}</div>'
           f'<span class="r"{pin(pins, "tools")}><span class="cu-ib">{ic("chat-circle")}</span><span class="cu-ib">{ic("rows")}</span></span></div>')
    if c.get("risk"):
        acts = f'<div class="cu-acts"><span class="cu-btn ghost">{ic("clock")}Snooze</span><span class="cu-btn ghost"{pin(pins, "acts")}>{ic("hand-tap")}I’ll do it</span></div>'
    else:
        acts = (f'<div class="cu-acts"><span class="cu-btn ghost">{ic("arrow-left")}Snooze</span><span class="cu-btn ghost">{ic("hand-tap")}I’ll do it</span>'
                f'<span class="sp"></span><span class="cu-btn ghost"{pin(pins, "right")}>Go with suggestion{ic("arrow-right")}</span></div>')
    under = card(nxt, phone=False, cls="sw-next") if nxt else ""
    peeks = '<div class="cu-peek p1"></div><div class="cu-peek p2"></div>'
    return (top + f'<div{pin(pins, "pbar")} style="width:680px;margin:0 auto">{pbar(n, total)}</div>'
            + f'<div class="cu-stage"><div class="cu-deck">{under}{card(cid, phone=False, cls="sw-top", pins=pins, hold=hold)}{peeks}</div>{acts}</div>')

def page_top(title, left="", tools="", dot=False, pins=None):
    return (f'<div class="cu-top sk-top page">{menu_btn(dot, pins)}<div class="in"><h1>{title}</h1>'
            + (f'<span class="left">{left}</span>' if left else "") + f'<span class="sp"></span>{tools}</div></div>')

def row(icon, t, s, end="", cls=""):
    return f'<div class="cu-row {cls}"><span class="cu-tile">{ic(icon)}</span><div><div class="t">{t}</div><div class="s">{s}</div></div>{end}</div>'

def assistant_main(pins=None):
    turns = "".join([
        '<div class="sk-turn"><div class="cu-said">Keep emails to Seoyeon under three sentences</div>'
        f'<div class="cu-work">{ic("brain")}<span>Saved to memory</span></div><p class="cu-reply">Emails to Seoyeon stay under three sentences.</p>'
        f'<div class="sk-acts"{pin(pins, "undo")}><span class="cu-link">Undo</span><span class="cu-link">See what Tomato knows</span></div></div>',
        '<div class="sk-turn"><div class="cu-said">Fix the failing tests in the shop repo</div>'
        f'<div class="cu-work">{ic("terminal-window")}<span>Coding session in hanbit/shop</span></div><p class="cu-reply task">Find the failing tests in the shop repo and fix them.</p>'
        f'<div class="sk-acts"><span class="cu-work" style="margin-top:0">{ic("check")}<span>Handed off</span></span><span class="cu-link">See session</span></div></div>',
        '<div class="sk-turn"><div class="cu-said">Tell Seoyeon we’re going with plan B</div>'
        f'<div class="cu-work">{ic("cards")}<span>Is this the card you mean?</span></div><p class="cu-reply task">Rebrand quote: go with plan A or plan B?</p>'
        f'<div class="sk-acts"><span class="cu-btn primary"{pin(pins, "say")}>Answer with these words</span></div></div>',
    ])
    return (page_top("Talk to Tomato", pins=pins)
            + f'<div class="cu-page sk-talk"><div class="cu-page-in">{turns}</div></div>'
            + f'<div class="sk-dock"><div class="cu-page-in"><div class="cu-composer focus"{pin(pins, "input")}><span class="sp">Remember, ask, or hand off</span><span class="cu-send">{ic("arrow-up")}</span></div></div></div>')

def connections_main(pins=None):
    body = "".join([
        '<div class="cu-h"><b>Codex</b></div>',
        row("code", "Codex (ChatGPT sign-in)", "Waiting for the code in ChatGPT", '<span class="cu-btn">Cancel</span>'),
        f'<div class="cu-card flat sk-device-card" style="width:auto"><h2 class="cu-ask">Enter this code in ChatGPT</h2><p class="sk-code">K7QD-M2XP</p>'
        f'<div class="sk-acts"><span class="cu-btn primary">Open ChatGPT</span><span class="cu-btn">{ic("copy")}Copy code</span><span class="cu-work" style="margin-top:0"{pin(pins, "left")}><span>14 min left</span></span></div>'
        f'<div class="cu-foot"{pin(pins, "only")}>{ic("shield-check")}<span>Only enter a code you got on this screen. Your sign-in is stored encrypted on this server.</span></div></div>',
        f'<div class="cu-h" style="margin-top:32px"{pin(pins, "h2")}><b>Sign-in</b><span>1</span></div>',
        row("lock-simple", "Passkey on MacBook Pro", "Added Nov 21, last used Nov 23", f'<span class="cu-link"{pin(pins, "remove")}>Remove</span>'),
        row("lock-simple", "A passkey on another device", "Sign in with your face or fingerprint", '<span class="cu-btn">Add a passkey</span>'),
    ])
    return page_top("Connections", pins=pins) + f'<div class="cu-page"><div class="cu-page-in">{body}</div></div>'

def done_main(pins=None):
    undo = '<span class="cu-link">Undo</span>'
    body = "".join([
        f'<div class="cu-done-head"><span class="cu-mascot md"><svg><use href="#cu-mascot-done"/></svg></span><div><p class="cu-big">All caught up</p><p class="cu-sub"{pin(pins, "sub")}>You decided 6 in 1m 42s and snoozed 1.</p></div></div>',
        f'<div class="cu-h"{pin(pins, "left")}><b>Still here</b></div>',
        row("list-checks", "5 FYIs", "Release date, nightly deploy, AWS estimate", '<span class="cu-btn">Skim</span>'),
        row("clock", "1 snoozed", "Back at 2 PM", '<span class="cu-btn">View</span>'),
        f'<div class="cu-h" style="margin-top:28px"{pin(pins, "auto")}><b>What Tomato handled meanwhile</b><span>3</span></div>',
        row("archive", "Archived 19 newsletters and promos", "Rule: archive newsletters unread", undo),
        row("calendar-blank", "Accepted 2 recurring team meeting invites", "Rule: you said yes the last 5 times", undo),
        row("envelope-simple", "Filed 2 receipts under “November spending”", "Coupang $29, Kakao T $9", undo),
    ])
    top = (f'<div class="cu-top sk-top"><span class="l">{menu_btn(True, pins)}<h1>Catch up</h1><span class="left">6 decided, 1 snoozed</span></span><span></span>'
           f'<span class="r"><span class="cu-ib">{ic("chat-circle")}</span></span></div>')
    return top + f'<div class="cu-page"><div class="sk-done">{body}</div></div>'

# ── 넓은 화면 장면들 ──
def wides():
    W = {}
    W["deck"] = wide(deck_main(pins={"menu": ("1", "bottom"), "left": ("2", "bottom"), "tools": ("3", "left"), "ev": ("4",), "prev": ("5", "left"), "right": ("6", "right")}))
    W["deck-plain"] = wide(deck_main())
    W["keys"] = wide(deck_main(dot=False), over=keys_pop(pins={"keys": ("1", "left")}))
    W["menu"] = wide(deck_main(dot=False), drawer=side(pins={"head": ("1", "right"), "label": ("2", "right"), "sessions": ("3", "right"), "gear": ("4", "right")}))
    W["pinned"] = wide(deck_main(menu=False), pinned=side(drawer=False, pinned=True))
    W["hold"] = wide(deck_main("c05", n=5, nxt="", hold=.62, dot=False, pins={"due": ("1",), "hold": ("2", "right"), "composer": ("3", "bottom"), "acts": ("4", "right")}))
    W["hold-plain"] = wide(deck_main("c05", n=5, nxt="", hold=.62, dot=False))
    W["toast"] = wide(deck_main("c02", n=6, nxt="", dot=False, toast_html=toast(9, "Runs in 9s"), pins={"slot": ("1", "right")}))
    W["assistant"] = wide(assistant_main(pins={"undo": ("1", "right"), "say": ("2", "right"), "input": ("3", "top")}))
    W["assistant-plain"] = wide(assistant_main())
    W["connections"] = wide(connections_main(pins={"only": ("1", "bottom"), "left": ("2", "right"), "remove": ("3", "left")}))
    W["connections-plain"] = wide(connections_main())
    W["done"] = wide(done_main(pins={"sub": ("1", "right"), "left": ("2", "left"), "menu": ("3", "bottom")}))
    W["done-plain"] = wide(done_main())
    return W

# ── 아이폰 ──
def ptop(title="Catch up", cnt="7 left", tools=("chat-circle", "rows"), dot=True, extra=""):
    return (f'<div class="cu-ptop">{menu_btn(dot)}<span class="ttl">{title}</span>' + (f'<span class="cnt">{cnt}</span>' if cnt else "") + '<span class="sp"></span>'
            + extra + "".join(f'<span class="cu-ib">{ic(t)}</span>' for t in tools) + '</div>')

def pdock(pill="", risky=False):
    acts = (f'<div class="cu-pacts sw-mirror two"><span>{ic("clock")}Snooze</span><span>{ic("hand-tap")}I’ll do it</span></div>' if risky else
            f'<div class="cu-pacts sw-mirror"><span>{ic("arrow-left")}Snooze</span><span>{ic("hand-tap")}I’ll do it</span><span>Suggested{ic("arrow-right")}</span></div>')
    return (f'<div class="cu-pdock sw-dock">{pill}<div class="cu-composer"><span class="sp">Answer differently</span><span class="cu-ib">{ic("microphone")}</span><span class="cu-send">{ic("arrow-up")}</span></div>{acts}</div>')

def pdeck(cid="c01", n=1, total=7, nxt="c02", pill="", dot=True, over="", hold=None, rows=None):
    return "".join(['<div class="cu-phone sk-phone">', ptop(cnt=f"{total - n + 1} left", dot=dot), pbar(n, total),
                    f'<div class="sw-stage">{card(nxt, cls="sw-next") if nxt else ""}{card(cid, cls="sw-top", hold=hold, rows=rows)}</div>', pdock(pill, risky=bool(CARDS[cid].get("risk"))), over, '</div>'])

def phones():
    P = {}
    P["rest"] = pdeck()
    P["menu"] = pdeck(dot=False, over='<div class="sk-scrim"></div>' + side(settings=True))
    P["rows"] = pdeck("c02", n=2, nxt="", dot=False)                    # 시안: 알약엔 이름만
    for k in ("inset", "group", "v2"):                                   # 견줘 본 모양
        P[f"rows-{k}"] = pdeck("c02", n=2, nxt="", dot=False, rows=k)
    P["hold-hint"] = pdeck("c05", n=5, nxt="", dot=False, hold="hint")
    P["hold"] = pdeck("c05", n=5, nxt="", dot=False, hold=.62)
    P["hold-full"] = pdeck("c05", n=5, nxt="", dot=False, hold=1)
    sheet = (f'<div class="sk-scrim"></div><div class="sk-sheet"><div class="hd">{ic("chat-circle")}<h2>Talk to Tomato</h2><span class="cu-ib">{ic("x")}</span></div>'
             f'<div class="cu-work">{ic("envelope-simple")}<span>Seoyeon Park, Rebrand quote: go with plan A or plan B?</span></div>'
             '<div class="sk-chips"><span class="cu-chip line">What did we settle with this person?</span><span class="cu-chip line">Keep it to three sentences for this person</span></div>'
             f'<div class="cu-composer"><span class="sp">Remember, ask, or hand off</span><span class="cu-send">{ic("arrow-up")}</span></div>'
             '<span class="cu-link">See all</span></div>')
    P["talk"] = pdeck(dot=False, over=sheet)
    mem = lambda icon, t, s: f'<div class="cu-row wrap"><span class="cu-tile">{ic(icon)}</span><div><div class="t">{t}</div><div class="s">{s}</div><div class="acts"><span class="cu-link">Edit</span><span class="cu-link">Forget</span></div></div></div>'
    P["memory"] = "".join(['<div class="cu-phone sk-phone">',
        ptop("What Tomato knows", "3", tools=(), dot=False, extra=f'<span class="cu-ib sk-info on">{ic("info")}</span>'),
        '<div class="cu-page"><div class="cu-page-in">',
        f'<div class="cu-composer" style="margin-top:4px"><span class="sp">Something to remember</span><span class="cu-send">{ic("arrow-up")}</span></div>',
        '<div class="cu-h"><b>Decisions with people</b><span>2</span></div>',
        mem("envelope-simple", "Answered “Go with plan B” to “Rebrand quote: go with plan A or plan B?”", "Seoyeon Park, Nov 23"),
        mem("envelope-simple", "Answered “Move the sync to 4:30” to “Two meetings overlap Thursday at 3. Which one moves?”", "Calendar, Nov 23"),
        '<div class="cu-h"><b>Projects</b><span>1</span></div>',
        mem("code", "Answered “Retry in the payment service” to “Where should payment retries happen?”", "Claude Code, Nov 23"),
        '</div></div>',
        '<div class="sk-pop" style="right:12px;top:52px;width:288px"><b>Where memory comes from</b>Only your answers, your edits, your own words and finished coding sessions. Forgotten items stop being used from the next card.</div>',
        '</div>'])
    return P

# 번호 핀이 설 자리 — 기기 바깥 여백에, 가리키는 것과 같은 높이로(y 는 기기 위 끝부터). (번호, y, 왼쪽|오른쪽)
ANCHORS = {
    "rest": [(1, 70, "l"), (2, 70, "r"), (3, 418, "l"), (4, 742, "r"), (5, 500, "r")],
    "menu": [(1, 320, "r"), (2, 640, "l")],
    "rows": [(1, 402, "l"), (2, 455, "r"), (3, 620, "l")],
    "talk": [(1, 620, "l"), (2, 684, "r"), (3, 556, "r")],
    "memory": [(1, 70, "r"), (2, 640, "l")],
}

def device(name, with_pins=True):
    a = "".join(f'<i class="sw-a {side_}" style="top:{y}px" data-pin="{n}" data-pin-at="center"></i>' for n, y, side_ in ANCHORS.get(name, [])) if with_pins else ""
    return ('<div class="sw-device"><div class="bd-status"><span>9:41</span><span class="island"></span><span class="bat"></span></div>'
            f'<div class="sw-view cu-root">{phones()[name]}</div></div>{a}')
