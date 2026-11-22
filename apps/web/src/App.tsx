import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { altOptions, datasets, getCard as findCard, turnsOf } from './data';
import type { Card, Lang } from './data/types';
import { HOLD_MS, initial, openIds, reduce, snoozedIds, type Action, type State } from './state/store';
import { Sidebar, type Route } from './components/Sidebar';
import { Sprite } from './components/icons';
import { Catchup } from './screens/Catchup';
import { Activity, Done, First, Fyi, Snoozed } from './screens/Pages';

const KEY = 'catchup-proto-v1';
const ROUTES: Route[] = ['catchup', 'fyi', 'snoozed', 'activity'];

/** 주소로 여는 방법 — 소개 페이지가 프로토타입을 품을 때 써요. ?start=1 처음 화면을 건너뛰어요 · ?reset=1 처음부터 다시 */
function fromUrl(s: State, today: string[]): State {
  const q = new URLSearchParams(location.search);
  let out = s;
  if (q.get('reset') === '1') out = reduce(out, { type: 'reset', today });
  if (q.get('start') === '1' && !out.started) out = reduce(out, { type: 'start' });
  if (q.has('reset') || q.has('start')) { q.delete('reset'); q.delete('start'); history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}${location.hash}`); }
  return out;
}

function load(today: string[]): State {
  // 기다리던 답이 있었다면(새로 고침 · 창 닫기) 그대로 실행된 것으로 남겨요 — 답이 사라지지 않게
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as State; if (Array.isArray(s.deck) && s.progress) return reduce(s, { type: 'commit' }); } } catch { /* 처음부터 */ }
  return initial(today);
}
const routeOf = (): Route => { const r = location.hash.replace('#/', '') as Route; return ROUTES.includes(r) ? r : 'catchup'; };

export function App() {
  const { t, i18n } = useTranslation();
  const ds = datasets[(i18n.language as Lang) in datasets ? (i18n.language as Lang) : 'en'];
  const [s, dispatch] = useReducer(reduce, ds.today, today => fromUrl(load(today), today));
  const [route, setRoute] = useState<Route>(routeOf);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const composerRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [list, setList] = useState(false);
  const sRef = useRef(s); sRef.current = s;

  const getCard = useCallback((id: string) => findCard(ds, t, id), [ds, t]);
  const open = openIds(s);
  const card = open.length ? getCard(open[0]!) : undefined;

  // 저장 — 막혀 있으면 이 화면에서만 기억해요
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ } }, [s]);
  useEffect(() => { const f = () => setRoute(routeOf()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const nav = (r: Route) => { location.hash = `#/${r}`; setRoute(r); setDrawer(false); };

  // 서랍은 Esc 로 닫아요 · 언어를 바꾸면 떠 있던 토스트를 지워요(예전 언어로 남지 않게)
  useEffect(() => {
    if (!drawer) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [drawer]);
  useEffect(() => { setToast(null); }, [i18n.language]);

  const say = useCallback((text: string) => { const n = Date.now(); setToast({ text, n }); setTimeout(() => setToast(x => (x?.n === n ? null : x)), 2800); }, []);

  // 10초 기다렸다가 실행 — 그사이 되돌릴 수 있어요
  useEffect(() => {
    if (!s.pending) return;
    const p = s.pending;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const done = setTimeout(() => {
      const c = getCard(p.cardId);
      if (c?.effect?.kind === 'reply' && c.effect.copy && !p.alt) {
        // 고친 초안이 있으면 그 글을 복사해요
        void navigator.clipboard?.writeText(sRef.current.progress[p.cardId]?.draft ?? c.effect.text).catch(() => undefined);
        say(t('toast.copied', { to: t(`src.${c.source}`) }));
      }
      dispatch({ type: 'commit' });
    }, Math.max(0, p.at + HOLD_MS - Date.now()));
    return () => { clearInterval(tick); clearTimeout(done); };
  }, [s.pending, getCard, say, t]);

  const optsOf = useCallback((c: Card) => {
    const p = s.progress[c.id]; const turns = turnsOf(p);
    return p?.alt && turns.length ? altOptions(c, t, turns) : { options: c.options, recommended: c.recommended };
  }, [s.progress, t]);

  const act = useCallback((a: Action) => dispatch(a), []);
  const pick = useCallback((i: number) => {
    if (!card) return;
    const { options } = optsOf(card); const o = options[i]; if (!o) return;
    act({ type: 'pick', cardId: card.id, pick: i, risky: Boolean(o.risk && o.risk !== 'low'), now: Date.now() });
  }, [card, optsOf, act]);
  const snooze = useCallback(() => { if (card) { act({ type: 'snooze', cardId: card.id, now: Date.now() }); say(t('toast.snoozed')); } }, [card, act, say, t]);
  const handoff = useCallback(() => { if (card) { act({ type: 'handoff', cardId: card.id, now: Date.now() }); say(t('toast.handed')); } }, [card, act, say, t]);
  const undo = useCallback(() => { if (s.pending) { act({ type: 'undo' }); say(t('toast.undone')); } }, [s.pending, act, say, t]);

  // 키보드 — 1~4 · ↵ · S · D · Z · /
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !s.started || route !== 'catchup' || !card || list || drawer) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (/^[1-4]$/.test(k)) { e.preventDefault(); pick(Number(k) - 1); }
      else if (k === 'enter' && !(e.target as HTMLElement).closest('button, a, summary')) { e.preventDefault(); pick(optsOf(card).recommended); }
      else if (k === 's') snooze();
      else if (k === 'd') handoff();
      else if (k === 'z') undo();
      else if (k === '/') { e.preventDefault(); composerRef.current?.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [s.started, route, card, pick, optsOf, snooze, handoff, undo, list, drawer]);

  const counts = useMemo(() => ({ open: open.length, fyi: ds.fyi.filter(f => !s.deck.includes(`p-${f.id}`)).length, snoozed: snoozedIds(s).length }), [open.length, ds, s]);
  const more = () => act({ type: 'more', ids: ds.cards.map(c => c.id).filter(id => !ds.today.includes(id)) });
  const reset = () => { act({ type: 'reset', today: ds.today }); nav('catchup'); };
  const search = () => { nav('catchup'); setList(true); setTimeout(() => searchRef.current?.focus(), 0); };
  const sideProps = { ds, route, counts, onNav: (r: Route) => { setList(false); nav(r); }, onMore: () => { more(); nav('catchup'); }, onReset: reset, onSearch: search, moreAdded: s.moreAdded };
  const menu = () => setDrawer(true);

  // 고른 바로 그 순간엔 now 가 아직 예전 값이라 11이 나올 수 있어요 — 10을 넘지 않게 잘라요
  const left = s.pending ? Math.min(HOLD_MS / 1000, Math.max(1, Math.ceil((s.pending.at + HOLD_MS - now) / 1000))) : 0;
  // 기다리는 동안 무엇이 일어나는지 — 보내기 · 복사 · 그 밖의 실행
  const pendingCard = s.pending ? getCard(s.pending.cardId) : undefined;
  const verb = pendingCard?.effect?.kind === 'reply' ? (pendingCard.effect.copy ? 'toast.runsCopy' : 'toast.runsSend') : 'toast.runsDo';
  const toastEl = s.pending ? <div className="cu-toast" role="status"><span>{t(verb, { s: left })}</span><button type="button" className="u" onClick={undo}>{t('top.undo')}</button></div>
    : toast ? <div className="cu-toast" role="status" key={toast.n}><span>{toast.text}</span></div> : null;

  let main: React.ReactNode;
  if (!s.started) main = <First s={s} onConnect={id => act({ type: 'connect', id })} onStart={() => { act({ type: 'start' }); nav('catchup'); }} />;
  else if (route === 'fyi') main = <Fyi s={s} ds={ds} onMenu={menu} onPromote={id => act({ type: 'promote', fyiId: id })} />;
  else if (route === 'snoozed') main = <Snoozed s={s} getCard={getCard} onMenu={menu} onBack={id => { act({ type: 'unsnooze', cardId: id }); nav('catchup'); }} />;
  else if (route === 'activity') main = <Activity s={s} ds={ds} getCard={getCard} onMenu={menu} onUndo={id => act({ type: 'undoEntry', entryId: id })} onUndoPending={undo} onUndoAuto={id => act({ type: 'undoAuto', id })} onRoutine={id => act({ type: 'routine', id })} />;
  else if (card) main = <Catchup s={s} card={card} getCard={getCard} onPick={pick} onSay={text => act({ type: 'say', cardId: card.id, text })} onDraft={text => act({ type: 'draft', cardId: card.id, text })}
    onFocus={id => act({ type: 'focus', cardId: id })} onUnsnooze={id => act({ type: 'unsnooze', cardId: id })} list={list} setList={setList} searchRef={searchRef}
    onSnooze={snooze} onHandoff={handoff} onAuto={() => say(t('card.autoToast'))} onUndo={undo} onMenu={menu} composerRef={composerRef} toast={toastEl} />;
  else main = <Done s={s} ds={ds} onMenu={menu} onNav={nav} onMore={more} onUndoAuto={id => act({ type: 'undoAuto', id })} />;

  return (
    <div className="shell">
      <Sprite />
      {s.started && <Sidebar {...sideProps} />}
      <main className="cu-main">{main}</main>
      {drawer && <><div className="drawer-bg" onClick={() => setDrawer(false)} /><Sidebar {...sideProps} drawer onClose={() => setDrawer(false)} /></>}
      <div className={`toasts${s.started && route === 'catchup' && card ? ' on-deck' : ''}`} aria-live="polite">{toastEl}</div>
    </div>
  );
}
