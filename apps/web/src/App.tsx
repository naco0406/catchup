import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { altOptions, swipeRules, turnsOf, undoableAfterRun, withDraft } from './data';
import type { Card, Effect } from './data/types';
import { draftKey, HOLD_MS, openIds, snoozedIds, stateOf } from './state/store';
import { useBackend } from './backend';
import { Login } from './live/Login';
import { Connections } from './live/Connections';
import { Sessions } from './live/Sessions';
import { Memory } from './live/Memory';
import { Assistant } from './live/Assistant';
import { TalkSheet } from './live/TalkSheet';
import { MemoryView } from './screens/Memory';
import { turnOnNotifications } from './live/notifications';
import { copyText } from './clipboard';
import { Sidebar, type Route } from './components/Sidebar';
import { Sprite } from './components/icons';
import { Toast, type ToastView } from './components/Toast';
import { Catchup } from './screens/Catchup';
import { Activity, Done, First, Snoozed } from './screens/Pages';
import { FyiDeck } from './screens/FyiDeck';

const RUNS: Record<Exclude<Effect['kind'], 'copy'>, string> = { send: 'toast.runsSend', tell: 'toast.runsTell', change: 'toast.runsDo', none: 'toast.runsNone' };
/** 미룬 뒤 되돌릴 수 있는 시간 */
const SNOOZE_UNDO_MS = 5_000;
const ROUTES: Route[] = ['catchup', 'fyi', 'snoozed', 'activity', 'connections', 'sessions', 'memory', 'assistant'];

const routeOf = (): Route => { const r = location.hash.replace('#/', '') as Route; return ROUTES.includes(r) ? r : 'catchup'; };

export function App() {
  const { t, i18n } = useTranslation();
  const backend = useBackend();
  const { live, s, ds, act, getCard } = backend;
  const [route, setRoute] = useState<Route>(routeOf);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const composerRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [list, setList] = useState(false);
  const sRef = useRef(s); sRef.current = s;
  /** 방금 미룬 카드 — 5초 동안 토스트에서 되돌릴 수 있어요 */
  const [snoozed, setSnoozed] = useState<{ id: string; at: number } | null>(null);
  /** 카드가 덱에서 빠지기 직전에 불러요 — 덱이 나가는 모습을 남겨요(Catchup 이 채워요) */
  /** 알려만 드려요에서 '나중에'로 넘긴 것 — 앱을 연 동안만 기억해요 */
  const [fyiLater, setFyiLater] = useState<string[]>([]);
  const leaveRef = useRef<((dir: 1 | -1, filled?: boolean) => void) | null>(null);
  /** 덱에서 비서에게 말하는 시트(실제 모드) · 이번에 덱에서 한 말들 — 닫았다 열어도 보여요 */
  const [talk, setTalk] = useState(false);
  const [talkMine, setTalkMine] = useState<string[]>([]);
  const talkBtn = useRef<HTMLButtonElement | null>(null);
  const closeTalk = useCallback(() => { setTalk(false); setTimeout(() => talkBtn.current?.focus(), 0); }, []);

  const open = openIds(s);
  const card = open.length ? getCard(open[0]!) : undefined;

  useEffect(() => { const f = () => { setRoute(routeOf()); setTalk(false); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const nav = (r: Route) => { location.hash = `#/${r}`; setRoute(r); setDrawer(false); setTalk(false); };

  // 서랍은 Esc 로 닫아요 · 언어를 바꾸면 떠 있던 토스트를 지워요(예전 언어로 남지 않게)
  useEffect(() => {
    if (!drawer) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [drawer]);
  useEffect(() => { setToast(null); }, [i18n.language]);

  const say = useCallback((text: string) => { const n = Date.now(); setToast({ text, n }); setTimeout(() => setToast(x => (x?.n === n ? null : x)), 2800); }, []);

  useEffect(() => { if (backend.error) say(backend.error.text); }, [backend.error, say]);

  // 답마다 10초 — 가장 이른 것의 때에 맞춰 실행해요
  useEffect(() => {
    if (!s.pending.length) return;
    setNow(Date.now());
    const due = Math.min(...s.pending.map(p => p.at + HOLD_MS));
    const tick = setInterval(() => setNow(Date.now()), 250);
    const done = setTimeout(() => act({ type: 'commit', now: Math.max(Date.now(), due) }), Math.max(0, due - Date.now()));
    return () => { clearInterval(tick); clearTimeout(done); };
  }, [s.pending, act]);

  const optsOf = useCallback((c: Card) => {
    const p = s.progress[c.id]; const turns = turnsOf(p);
    return p?.alt && turns.length ? altOptions(c, t, turns) : { options: c.options, recommended: c.recommended };
  }, [s.progress, t]);

  const pick = useCallback((i: number) => {
    if (!card) return;
    const { options, recommended } = optsOf(card); const o = options[i]; if (!o) return;
    const risky = Boolean(o.risk && o.risk !== 'low'), prog = sRef.current.progress[card.id];
    const effect = withDraft(o.effect, prog?.drafts?.[draftKey(prog, i)]);
    if (!risky || prog?.confirm === i) leaveRef.current?.(1, i === recommended); // 위험한 답의 첫 번째 누르기는 카드가 그대로예요
    act({ type: 'pick', cardId: card.id, pick: i, risky, undoable: undoableAfterRun(o.effect), now: Date.now() });
    if (effect.kind !== 'copy' || (risky && prog?.confirm !== i)) return;
    // 복사는 밖으로 나가는 일이 아니라서 기다리지 않아요. 누르는 순간이 아니면 Safari 가 막기도 해요
    void copyText(effect.text).then(ok => { if (!ok) { act({ type: 'undo', cardId: card.id }); say(t('toast.copyFailed')); } });
  }, [card, optsOf, act, say, t]);
  const snooze = useCallback(() => {
    if (!card) return;
    leaveRef.current?.(-1);
    const at = Date.now();
    act({ type: 'snooze', cardId: card.id, now: at });
    setSnoozed({ id: card.id, at });
    setTimeout(() => setSnoozed(x => (x?.at === at ? null : x)), SNOOZE_UNDO_MS);
  }, [card, act]);
  const handoff = useCallback(() => { if (card) { leaveRef.current?.(-1); act({ type: 'handoff', cardId: card.id, now: Date.now() }); say(t('toast.handed')); } }, [card, act, say, t]);
  const latestAt = s.pending.at(-1)?.at ?? 0;
  /** 방금 미룬 것이 가장 최근 일이면 그것부터 되돌려요 */
  const snoozedNow = snoozed && snoozed.at >= latestAt && stateOf(s, snoozed.id) === 'snoozed' ? snoozed : null;
  const undo = useCallback((cardId?: string) => {
    if (!cardId && snoozedNow) { act({ type: 'unsnooze', cardId: snoozedNow.id }); setSnoozed(null); say(t('toast.undone')); return; }
    if (s.pending.length) { act({ type: 'undo', cardId }); say(t('toast.undone')); }
  }, [s.pending, snoozedNow, act, say, t]);

  // 키보드 — 1~4 · ↵ · → 추천대로 · ← 미루기 · S · D · Z · /
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !s.started || route !== 'catchup' || !card || list || drawer || talk) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      // 누르고 있으면 다음 카드까지 정해지니까 한 번만 받아요
      if (e.repeat && /^([1-5sdz]|enter|arrowleft|arrowright)$/.test(k)) { e.preventDefault(); return; }
      if (k === 'arrowleft' || k === 'arrowright') {
        const { options, recommended } = optsOf(card), can = swipeRules(card, options, recommended);
        if (k === 'arrowright' && can.right) { e.preventDefault(); pick(recommended); }
        else if (k === 'arrowleft' && can.left) { e.preventDefault(); snooze(); }
      }
      else if (/^[1-5]$/.test(k)) { e.preventDefault(); pick(Number(k) - 1); }
      else if (k === 'enter' && !(e.target as HTMLElement).closest('button, a, summary')) { e.preventDefault(); pick(optsOf(card).recommended); }
      else if (k === 's') snooze();
      else if (k === 'd') handoff();
      else if (k === 'z') undo();
      else if (k === '/') { e.preventDefault(); composerRef.current?.focus(); }
      else if (k === 'a' && live && !e.repeat) { e.preventDefault(); setTalk(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [s.started, route, card, pick, optsOf, snooze, handoff, undo, list, drawer, talk, live]);

  const counts = useMemo(() => ({ open: open.length, fyi: ds.fyi.filter(f => stateOf(s, f.id) === 'open' && !s.deck.includes(`p-${f.id}`)).length, snoozed: snoozedIds(s).length }), [open.length, ds, s]);
  const more = () => act({ type: 'more', ids: ds.cards.map(c => c.id).filter(id => !ds.today.includes(id)) });
  const reset = () => { act({ type: 'reset', today: ds.today }); nav('catchup'); };
  const search = () => { nav('catchup'); setList(true); setTimeout(() => searchRef.current?.focus(), 0); };
  const sideProps = { ds, route, counts, onNav: (r: Route) => { setList(false); nav(r); }, onMore: () => { more(); nav('catchup'); }, onReset: reset, onSearch: search, moreAdded: s.moreAdded,
    account: live ? { logout: backend.logout, notify: () => void turnOnNotifications().then(ok => say(t(ok ? 'live.notifyOn' : 'live.notifyFailed'))) } : undefined };
  const menu = () => setDrawer(true);

  // 고른 바로 그 순간엔 now 가 아직 예전 값이라 11이 나올 수 있어요 — 10을 넘지 않게 잘라요
  const latest = s.pending.at(-1);
  const left = latest ? Math.min(HOLD_MS / 1000, Math.max(1, Math.ceil((latest.at + HOLD_MS - now) / 1000))) : 0;
  // 기다리는 동안의 말은 고른 선택지의 실행 종류에서 나와요
  const latestCard = latest ? getCard(latest.cardId) : undefined;
  const latestEffect = latest && latestCard ? optsOf(latestCard).options[latest.pick]?.effect : undefined;
  const waiting = !latestEffect ? '' : latestEffect.kind === 'copy' ? t('toast.copied', { to: t(`src.${latestCard!.source}`) }) : t(RUNS[latestEffect.kind], { s: left });
  const latestOption = latest && latestCard ? optsOf(latestCard).options[latest.pick] : undefined;
  // 토스트 한 장: 방금 미룬 것 → 기다리는 답(남은 초를 고리로) → 알림 → 서버에 다시 잇는 중
  const view: ToastView | null = snoozedNow ? { text: t('toast.snoozed'), sub: t('toast.snoozedUndo'), icon: 'clock', undo: () => undo() }
    : latest ? { text: waiting, sub: latestOption?.label, undo: () => undo(), ...(latestEffect?.kind === 'copy' ? { icon: 'check' as const } : { count: left, ring: left / (HOLD_MS / 1000) }) }
    : toast ? { text: toast.text }
    : backend.offline ? { text: t('live.reconnecting') } : null;
  // 덱이 있는 화면(캐치업 · 알려만 드려요)은 토스트의 제자리가 덱 안에 있어요
  const onDeck = s.started && ((route === 'catchup' && Boolean(card)) || route === 'fyi');

  if (backend.auth !== 'in') {
    return (
      <div className="shell">
        <Sprite />
        <main className="cu-main">{backend.auth === 'out' ? <Login onDone={() => void backend.refresh()} /> : <div className="center-page"><p className="cu-sub" role="status">{t(backend.offline ? 'live.reconnecting' : 'live.loading')}</p></div>}</main>
      </div>
    );
  }

  const talkOpen = talk && live && route === 'catchup';
  let main: React.ReactNode;
  if (!s.started) main = <First s={s} onConnect={id => act({ type: 'connect', id })} onStart={() => { act({ type: 'start' }); nav('catchup'); }} />;
  else if (live && route === 'connections') main = <Connections onMenu={menu} />;
  else if (live && route === 'assistant') main = <Assistant onMenu={menu} onNav={nav} />;
  else if (live && route === 'memory') main = <Memory onMenu={menu} />;
  else if (route === 'memory') main = <MemoryView items={backend.memories} onMenu={menu} onTell={text => act({ type: 'tell', text, now: Date.now() })} onEdit={(key, text) => act({ type: 'fix', key, text })} onForget={key => act({ type: 'forget', key })} />;
  else if (live && route === 'sessions') main = <Sessions sessions={backend.sessions} onMenu={menu} refresh={backend.refresh} onConnect={() => nav('connections')} onCards={() => nav('catchup')} />;
  else if (route === 'fyi') main = <FyiDeck s={s} ds={ds} onMenu={menu} onPromote={id => act({ type: 'promote', fyiId: id })} onRead={id => act({ type: 'read', fyiId: id, now: Date.now() })} onUnread={id => act({ type: 'unread', fyiId: id })} toast={view} later={fyiLater} setLater={setFyiLater} />;
  else if (route === 'snoozed') main = <Snoozed s={s} getCard={getCard} onMenu={menu} onBack={id => { act({ type: 'unsnooze', cardId: id }); nav('catchup'); }} />;
  else if (route === 'activity') main = <Activity s={s} ds={ds} getCard={getCard} onMenu={menu} onUndo={id => act({ type: 'undoEntry', entryId: id })} onUndoPending={undo} onUndoAuto={id => act({ type: 'undoAuto', id })} onRoutine={id => act({ type: 'routine', id })} />;
  else if (card) main = <Catchup s={s} card={card} getCard={getCard} onPick={pick} onSay={text => act({ type: 'say', cardId: card.id, text })} onDraft={(key, text) => act({ type: 'draft', cardId: card.id, key, text })}
    onFocus={id => act({ type: 'focus', cardId: id })} onUnsnooze={id => act({ type: 'unsnooze', cardId: id })} list={list} setList={setList} searchRef={searchRef}
    onSnooze={snooze} onHandoff={handoff} onUndo={() => undo()} onMenu={menu} composerRef={composerRef} toast={view} leaveRef={leaveRef}
    talk={live ? { open: () => setTalk(true), ref: talkBtn } : undefined} />;
  else main = <Done s={s} ds={ds} onMenu={menu} onNav={nav} onMore={more} onUndoAuto={id => act({ type: 'undoAuto', id })} />;

  return (
    <div className="shell">
      <Sprite />
      {s.started && <Sidebar {...sideProps} inert={talkOpen} />}
      <main className="cu-main" inert={talkOpen}>{main}</main>
      {/* 덱 위의 시트 — 목록 보기에서는 '보고 있는 카드'가 없어요 */}
      {talkOpen && <TalkSheet card={list ? undefined : card} mine={talkMine} onSaid={id => setTalkMine(ids => [...ids, id])} onClose={closeTalk} onNav={nav} />}
      {drawer && <><div className="drawer-bg" onClick={() => setDrawer(false)} /><Sidebar {...sideProps} drawer onClose={() => setDrawer(false)} /></>}
      {/* 덱에서는 토스트가 덱 안의 제자리에 서요(Catchup). 다른 화면에서는 아래 가운데예요 */}
      {!onDeck && <div className="toasts" aria-live="polite">{view && <Toast key={toast && !latest && !snoozedNow ? toast.n : 'now'} v={view} />}</div>}
    </div>
  );
}
