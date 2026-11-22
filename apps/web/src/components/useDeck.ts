import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DOMAttributes } from 'react';
import { arm, decide, EDGE, resist, SLOP, threshold } from './swipeMath';

/** 미는 중인 쪽. blocked: 그쪽으로는 밀어서 정할 수 없어요(위험한 카드 · 위험한 추천) */
export interface Pull { side: 'left' | 'right'; armed: boolean; blocked: boolean }
type Spring = { k: number; c: number };
interface Start { x: number; y: number; id: number; key: string; dragging: boolean; px: number; t: number }
interface Ghost { node: HTMLElement; dir: 1 | -1; x: number; v: number; at: number; from: string; swiped: boolean }

const LEARNED = 'catchup-swiped';
/** 스프링 값은 디자인 토큰에서 읽어요(--cu-spring-return · --cu-spring-exit: 세기 감쇠). 못 읽으면 같은 값으로 */
function token(name: string, k: number, c: number): Spring {
  if (typeof document === 'undefined') return { k, c };
  const [a, b] = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
  return a && b ? { k: a, c: b } : { k, c };
}
const BACK = token('--cu-spring-return', 247, 26.7), OUT = token('--cu-spring-exit', 439, 41.9);
/** 처음 한 번 보여 주는 움직임은 느리게 */
const NUDGE: Spring = { k: 120, c: 22 };
const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
const calm = () => media('(prefers-reduced-motion: reduce)');
let nudged = false; // 화면을 연 동안 한 번만

/** 여기서 시작한 움직임은 밀기가 아니에요: 글 칸 · 링크 · 선택지가 아닌 단추 · 가로로 스크롤되는 칸 */
function ownsGesture(target: Element, card: Element): boolean {
  if (target.closest('input, textarea, a, button:not(.cu-opt)')) return true;
  for (let e: Element | null = target; e && e !== card; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
  }
  return false;
}

/**
 * 캐치업 덱의 밀기(Q7 · docs/design/swipe-deck). 오른쪽 = 추천대로, 왼쪽 = 미루기.
 * - 움직임은 화면(.cu-main)의 변수로만 그려요: --dx(따라간 거리) · --p(문턱까지) · --f(추천 답이 찬 만큼) · --d(다른 답이 흐려진 만큼).
 *   프레임마다 React 를 다시 그리지 않아요. 말이 바뀌는 순간(쪽 · 문턱)만 pull 로 알려요.
 * - 손을 뗀 그 순간에 실행해요. 늦추면 Safari 가 복사를 막아요. 나가는 모습은 카드를 본뜬 것(capture)이 대신 날아가요.
 * - 취소된 터치, 두 번째 손가락, 도로 당기기, 미는 사이 추천이 바뀐 경우(rightKey)에는 아무것도 하지 않아요.
 */
export function useDeck({ cardId, can, onLeft, onRight, rightKey }: {
  cardId: string; can: { left: boolean; right: boolean }; onLeft: () => void; onRight: () => void; rightKey: string;
}) {
  const deckRef = useRef<HTMLDivElement>(null);
  const live = useRef({ x: 0, v: 0, armed: false, raf: 0 });
  const start = useRef<Start | null>(null);
  const moved = useRef(false);
  const ghost = useRef<Ghost | null>(null);
  const gone = useRef<{ id: string; dir: 1 | -1 } | null>(null);
  const first = useRef(cardId);
  const [pull, setPull] = useState<Pull | null>(null);
  const opts = useRef({ cardId, can, onLeft, onRight, rightKey });
  opts.current = { cardId, can, onLeft, onRight, rightKey };

  const topCard = () => deckRef.current?.querySelector<HTMLElement>(':scope > .deck-top > .cu-card') ?? null;
  const width = () => (innerWidth < 600 ? innerWidth : deckRef.current?.clientWidth ?? 680);

  /** quiet: 처음 한 번 보여 주는 움직임 — 토스트와 문턱 없이 카드와 추천 답만 */
  const paint = useCallback((x: number, quiet = false) => {
    const root = deckRef.current?.closest<HTMLElement>('.cu-main');
    if (!root) return;
    const l = live.current, side = x > 0 ? 'right' : 'left';
    const ok = x !== 0 && (side === 'right' ? opts.current.can.right : opts.current.can.left);
    const t = threshold(innerWidth), p = ok ? Math.min(1, Math.abs(x) / t) : 0;
    const armed = ok && !quiet && arm(l.armed, x, t);
    if (armed !== l.armed && start.current) { try { navigator.vibrate?.(10); } catch { /* 진동이 없는 기기 */ } }
    l.x = x; l.armed = armed;
    root.style.setProperty('--dx', `${ok ? x : resist(x)}px`);
    root.style.setProperty('--p', String(p));
    root.style.setProperty('--f', String(side === 'right' ? p : 0));
    root.style.setProperty('--d', String(quiet ? 0 : p));
    root.toggleAttribute('data-nudge', quiet && x !== 0);
    if (x === 0 || quiet) root.removeAttribute('data-pull'); else root.setAttribute('data-pull', ok ? side : 'blocked');
    root.toggleAttribute('data-armed', armed);
    const next: Pull | null = x === 0 || quiet ? null : { side, armed, blocked: !ok };
    setPull(prev => (prev?.side === next?.side && prev?.armed === next?.armed && prev?.blocked === next?.blocked ? prev : next));
  }, []);

  /** 놓은 속도를 이어받아 to 까지 */
  const spring = useCallback((to: number, s: Spring, done?: () => void, quiet = false) => {
    const l = live.current;
    cancelAnimationFrame(l.raf);
    if (calm()) { l.v = 0; paint(to, quiet); done?.(); return; }
    let t0 = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.032, Math.max(0, t - t0) / 1000); t0 = t;
      l.v += (-s.k * (l.x - to) - s.c * l.v) * dt;
      const x = l.x + l.v * dt;
      if (Math.abs(x - to) < 0.5 && Math.abs(l.v) < 20) { l.v = 0; paint(to, quiet); done?.(); return; }
      paint(x, quiet);
      l.raf = requestAnimationFrame(step);
    };
    l.raf = requestAnimationFrame(step);
  }, [paint]);

  /** 카드가 덱에서 빠지기 직전에 불러요(답 · 미루기 · 내가 직접). 지금 모습을 본떠 두었다가, 카드가 바뀌면 그 방향으로 날려요 */
  const capture = useCallback((dir: 1 | -1, filled = false) => {
    const top = topCard();
    if (!top) return;
    const l = live.current, node = top.cloneNode(true) as HTMLElement;
    for (const a of [...node.attributes]) if (a.name.startsWith('data-')) node.removeAttribute(a.name); // 본은 카드로 세지 않아요
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('inert', '');
    node.classList.add('deck-ghost');
    if (filled) node.classList.add('filled');
    node.style.width = `${top.offsetWidth}px`;
    node.style.setProperty('--f', filled ? '1' : '0');
    node.style.setProperty('--d', filled || l.x !== 0 ? '1' : '0');
    ghost.current = { node, dir, x: l.x, v: l.v, at: performance.now(), from: opts.current.cardId, swiped: l.x !== 0 };
    gone.current = { id: opts.current.cardId, dir };
  }, []);

  /** 새 카드가 어떻게 들어오는지 — 뒤에 있다가 올라온 카드는 다시 떠오르지 않고, 되돌린 카드는 나간 쪽에서 돌아와요 */
  const arrival = (id: string): string => {
    const g = ghost.current;
    if (g && g.from !== id && performance.now() - g.at < 400) return g.swiped ? 'from-next' : 'from-under';
    if (gone.current?.id === id) return gone.current.dir > 0 ? 'back-r' : 'back-l';
    return id === first.current ? '' : 'card-enter';
  };

  useLayoutEffect(() => {
    const g = ghost.current, deck = deckRef.current;
    ghost.current = null;
    cancelAnimationFrame(live.current.raf);
    live.current.v = 0;
    paint(0);
    if (!g || !deck || g.from === cardId || performance.now() - g.at > 400) return;
    deck.append(g.node);
    if (calm()) { g.node.classList.add('fade'); setTimeout(() => g.node.remove(), 220); return; }
    const far = width() * 1.5 * g.dir, edge = width() * 1.15, born = performance.now();
    let x = g.x, v = g.dir * Math.max(Math.abs(g.v), 900), t0 = born;
    g.node.style.setProperty('--gx', `${x}px`);
    const step = (t: number) => {
      const dt = Math.min(0.032, Math.max(0, t - t0) / 1000); t0 = t;
      v += (-OUT.k * (x - far) - OUT.c * v) * dt; x += v * dt;
      g.node.style.setProperty('--gx', `${x}px`);
      if (Math.abs(x) > edge || t - born > 700) { g.node.remove(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [cardId, paint]);

  // 처음 한 번: 카드가 28만큼 다녀와요(터치 화면 · 밀기를 써 보기 전 · 움직임 줄이기가 꺼져 있을 때)
  useEffect(() => {
    if (nudged || !media('(pointer: coarse)') || calm() || !opts.current.can.right) return;
    try { if (localStorage.getItem(LEARNED) === '1') return; } catch { return; }
    const timer = setTimeout(() => {
      if (nudged || start.current || live.current.x !== 0) return;
      nudged = true;
      spring(28, NUDGE, () => spring(0, BACK, undefined, true), true);
    }, 600);
    return () => clearTimeout(timer);
  }, [cardId, spring]);

  const handlers: DOMAttributes<HTMLDivElement> = {
    onPointerDown: e => {
      moved.current = false;
      if (!e.isPrimary) { if (start.current?.dragging) spring(0, BACK); start.current = null; return; } // 두 번째 손가락
      const card = topCard();
      if (e.pointerType === 'mouse' || e.clientX < EDGE || !card?.contains(e.target as Node) || ownsGesture(e.target as Element, card)) return;
      cancelAnimationFrame(live.current.raf); // 돌아오던 카드를 다시 잡을 수 있어요
      start.current = { x: e.clientX - live.current.x, y: e.clientY, id: e.pointerId, key: opts.current.rightKey, dragging: live.current.x !== 0, px: e.clientX, t: e.timeStamp };
      live.current.v = 0;
    },
    onPointerMove: e => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const x = e.clientX - s.x, y = e.clientY - s.y;
      if (!s.dragging) {
        if (Math.abs(y) > SLOP && Math.abs(y) >= Math.abs(x)) { start.current = null; return; } // 위아래로 읽는 중
        if (Math.abs(x) < SLOP) return;
        s.dragging = true;
        s.x += Math.sign(x) * SLOP; // 밀기로 바뀌는 순간 카드가 튀지 않게
        const typing = document.activeElement;
        if (typing instanceof HTMLTextAreaElement || typing instanceof HTMLInputElement) typing.blur(); // 고치던 초안을 먼저 담아요
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 터치 */ }
      }
      moved.current = true;
      const dt = Math.max(1, e.timeStamp - s.t);
      live.current.v = 0.6 * live.current.v + 0.4 * ((e.clientX - s.px) / dt) * 1000;
      s.px = e.clientX; s.t = e.timeStamp;
      paint(e.clientX - s.x);
    },
    onPointerUp: e => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      start.current = null;
      if (!s.dragging) return;
      const l = live.current, o = opts.current;
      if (e.timeStamp - s.t > 80) l.v = 0; // 멈췄다 놓으면 튕긴 것이 아니에요
      const to = decide({ x: l.x, v: l.v, armed: l.armed, width: width() });
      const act = to === 'right' ? (o.can.right && s.key === o.rightKey ? o.onRight : undefined) : to === 'left' ? (o.can.left ? o.onLeft : undefined) : undefined;
      if (!act) { spring(0, BACK); return; }
      try { localStorage.setItem(LEARNED, '1'); } catch { /* 저장소가 막혀 있으면 이 화면에서만 */ }
      nudged = true;
      act();
      l.v = 0;
      paint(0);
    },
    onPointerCancel: () => { if (start.current?.dragging) spring(0, BACK); start.current = null; },
    // 밀고 놓은 자리의 단추가 눌리지 않게
    onClickCapture: e => {
      if (!moved.current || e.detail === 0) return;
      moved.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return { deckRef, handlers, pull, capture, arrival };
}
