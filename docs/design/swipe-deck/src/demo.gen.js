
(() => {
  const root = document.getElementById('sw-demo'); if (!root) return;
  const IC = {"paper-plane-tilt": "<svg class=\"ic\"><use href=\"#i-paper-plane-tilt\"/></svg>", "clock": "<svg class=\"ic\"><use href=\"#i-clock\"/></svg>", "warning": "<svg class=\"ic\"><use href=\"#i-warning\"/></svg>", "check": "<svg class=\"ic\"><use href=\"#i-check\"/></svg>"}, T = 98, W = 392, HOLD = 10;
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
