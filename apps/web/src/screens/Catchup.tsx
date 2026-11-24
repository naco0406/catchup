import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, Effect, Option } from '../data/types';
import { altOptions, swipeRules, turnsOf, withDraft } from '../data';
import { draftKey, openIds, snoozedIds, stateOf, type State } from '../state/store';
import { Composer, DecisionCard, type PickHow } from '../components/DecisionCard';
import { I, SourceIcon } from '../components/icons';
import { Toast, type ToastView } from '../components/Toast';
import { MenuButton } from '../components/MenuButton';
import { useDeck, type Pull } from '../components/useDeck';
import { Empty } from './Pages';
import { snoozeWhen } from '../snooze';

const none = () => undefined;
const ICON: Record<Effect['kind'], NonNullable<ToastView['icon']>> = { send: 'send', tell: 'send', copy: 'copy', change: 'bolt', none: 'receipt' };

/** 캐치업 — 카드 한 장씩(방향 A). 위 막대에는 남은 수와 가는 막대만 있어요. 좁을 땐 아래에 단추가 붙어요.
 *  오른쪽으로 밀면 추천대로, 왼쪽으로 밀면 미루기예요. 아래 단추의 자리가 미는 방향이라, 밀지 않아도 같은 일을 눌러서 해요.
 *  ≡ 로 목록 보기(방향 B)로 바꾸면 남은 카드를 훑어보고 찾아서 먼저 정할 수 있어요. */
export function Catchup({ s, card, getCard, onPick, onSay, onDraft, onSnooze, onHandoff, onMenu, onFocus, onUnsnooze, composerRef, toast, list, setList, searchRef, leaveRef, talk }: {
  s: State; card: Card; getCard: (id: string) => Card | undefined;
  onPick: (i: number, how?: PickHow) => void; onSay: (text: string) => void; onDraft: (key: string, text: string) => void;
  onSnooze: () => void; onHandoff: () => void; onMenu: () => void;
  onFocus: (id: string) => void; onUnsnooze: (id: string) => void;
  composerRef: React.RefObject<HTMLInputElement | null>;
  /** 지금 알릴 것(기다리는 답 · 미룬 것 · 알림). 넓은 화면은 위 막대 가운데, 좁은 화면은 입력창 위 한 줄이 토스트의 자리예요 — 카드를 덮지 않아요 */
  toast: ToastView | null;
  list: boolean; setList: (v: boolean) => void; searchRef: React.RefObject<HTMLInputElement | null>;
  /** 카드가 덱에서 빠지기 직전에 App 이 불러요 — 나가는 모습을 남겨요 */
  leaveRef: React.RefObject<((dir: 1 | -1, filled?: boolean) => void) | null>;
  /** 덱에서 바로 비서에게 말하기(실제 모드에만 있어요). 시트는 App 이 띄우고, 닫히면 이 단추로 초점이 돌아와요 */
  talk?: { open: () => void; ref: React.RefObject<HTMLButtonElement | null> };
}) {
  const { t } = useTranslation();
  const total = s.deck.length;
  const doneCount = s.deck.filter(id => stateOf(s, id) !== 'open').length;
  const openCount = total - doneCount;
  // 누른 단추에 초점 테두리가 남지 않게
  const tap = (f: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); f(); };

  const prog = s.progress[card.id];
  const turns = turnsOf(prog);
  const { options, recommended } = prog?.alt && turns.length ? altOptions(card, t, turns) : card;
  const can = swipeRules(card, options, recommended);
  const best = options[recommended];
  const pickBest = () => onPick(recommended);
  const deck = useDeck({ cardId: card.id, can, onLeft: onSnooze, onRight: pickBest, rightKey: JSON.stringify([turns.length, recommended, best]) });
  leaveRef.current = deck.capture;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 카드가 바뀔 때 한 번만 정해요
  const arrive = useMemo(() => deck.arrival(card.id), [card.id]);
  // 새 카드는 늘 맨 위부터 — 앞 카드에서 내려 읽던 자리를 물려받지 않아요(모바일 검토 2026-11-24, 세 명이 따로 겪음)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [card.id, list]);
  const nextId = openIds(s).find(id => id !== card.id);
  const next = nextId ? getCard(nextId) : undefined;

  const pulled = deck.pull && pullToast(deck.pull, card, best, best && withDraft(best.effect, prog?.drafts?.[draftKey(prog, recommended)]), t);
  // 밀기가 막힌 카드에서 놓으면, 미는 동안 보이던 안내를 2초 더 남겨요 — 빨리 밀고 놓으면 아무 반응이 없는 것처럼 보였어요(모바일 검토 2026-11-24)
  const [blockedHint, setBlockedHint] = useState<ToastView | null>(null);
  const wasBlocked = useRef<ToastView | null>(null);
  useEffect(() => {
    if (deck.pull?.blocked) { wasBlocked.current = pulled ? { ...pulled, preview: false } : null; return; }
    if (deck.pull || !wasBlocked.current) return;
    setBlockedHint(wasBlocked.current); wasBlocked.current = null;
    const id = setTimeout(() => setBlockedHint(null), 2000);
    return () => clearTimeout(id);
  }, [deck.pull]); // eslint-disable-line react-hooks/exhaustive-deps -- 미는 모양이 바뀔 때만
  useEffect(() => { setBlockedHint(null); }, [card.id]);
  const say = pulled ?? blockedHint ?? toast;
  const toastEl = say && <Toast v={say} />;

  return (
    <>
      <div className="cu-top deck-top-bar">
        <span className="ttl"><MenuButton onClick={onMenu} /><h1>{t('nav.catchup')}</h1><span className="left">{list ? `${t('top.open')} ${openCount}` : t('top.left', { n: openCount })}</span></span>
        {say && !list ? <div className="top-toast" aria-live="polite">{toastEl}</div> : <span />}
        <span className="tools">
        {talk && <button ref={talk.ref} type="button" className="cu-ib" data-talk-open onClick={talk.open} aria-haspopup="dialog" aria-label={t('nav.assistant')} aria-keyshortcuts="A"><I.chat aria-hidden /></button>}
        <button type="button" className="cu-ib" onClick={() => setList(!list)} aria-pressed={list} aria-label={list ? t('top.deck') : t('top.list')}>{list ? <I.cards aria-hidden /> : <I.rows aria-hidden />}</button>
        </span>
      </div>
      {list ? <CardList s={s} getCard={getCard} searchRef={searchRef} onFocus={id => { onFocus(id); setList(false); }} onUnsnooze={id => { onUnsnooze(id); setList(false); }} /> : <>
        <div className="cu-pbar" role="img" aria-label={`${t('top.progress')}: ${t('top.left', { n: openCount })}`}>{s.deck.slice(0, 12).map(id => <i key={id} className={id === card.id ? 'on' : stateOf(s, id) !== 'open' ? 'd' : ''} />)}</div>
        <div className="scroll" ref={scrollRef}>
          <div className="cu-stage">
            <div className="cu-deck" ref={deck.deckRef} {...deck.handlers}>
              {next && <div className="deck-next" inert aria-hidden><DecisionCard key={next.id} card={next} prog={s.progress[next.id]} onPick={none} onSay={none} onDraft={none} preview /></div>}
              <div key={card.id} className={`deck-top ${arrive}`}>
                <DecisionCard card={card} prog={prog} onPick={onPick} onSay={onSay} onDraft={onDraft} composerRef={composerRef} fill={can.right} pulling={deck.pull?.side === 'right' && !deck.pull.blocked} />
              </div>
              {openCount > 1 && <div className="cu-peek p1" />}
              {openCount > 2 && <div className="cu-peek p2" />}
            </div>
            <div className="cu-acts">
              <button type="button" className="cu-btn ghost act-l" onClick={tap(onSnooze)} aria-keyshortcuts={can.left ? 'S ArrowLeft' : 'S'} title={can.left ? '← S' : 'S'}>{can.left ? <I.left aria-hidden /> : <I.clock aria-hidden />}{t('card.snooze')}</button>
              <button type="button" className="cu-btn ghost act-m" onClick={tap(onHandoff)} aria-keyshortcuts="D" title="D"><I.hand aria-hidden />{t('card.myself')}</button>
              <span className="sp" />
              {can.right && best && <button type="button" className="cu-btn ghost act-r named" onClick={tap(pickBest)} aria-keyshortcuts="ArrowRight Enter" title="→ ↵" aria-label={t('card.asSuggestedNamed', { label: best.label })}><span className="lbl">{t('card.asSuggestedNamed', { label: best.label })}</span><I.right aria-hidden /></button>}
            </div>
          </div>
        </div>
        <div className="phone-dock">
          {toastEl && <div className="dock-toast" aria-live="polite">{toastEl}</div>}
          <Composer key={card.id} onSay={onSay} placeholder={prog?.alt ? t('card.more') : t('card.composer')} />
          {/* 단추의 자리가 미는 방향이에요. 화살표가 붙은 단추는 밀어서도 돼요(넓은 화면은 키 표시 ← → 가 그 화살표예요) */}
          <div className={`cu-pacts${can.right ? '' : ' two'}`}>
            <button type="button" className="act-l" onClick={tap(onSnooze)}>{can.left ? <I.left aria-hidden /> : <I.clock aria-hidden />}<span className="t">{t('card.snooze')}</span></button>
            <button type="button" className="act-m" onClick={tap(onHandoff)}><I.hand aria-hidden /><span className="t">{t('card.myself')}</span></button>
            {/* 오른쪽은 추천 답의 이름을 말해요 — 밀거나 누르기 전에 무엇이 일어날지 보여요 */}
            {can.right && best && <button type="button" className="act-r named" onClick={tap(pickBest)} aria-label={t('card.asSuggestedNamed', { label: best.label })}><span className="lbl">{best.label}</span><I.right aria-hidden /></button>}
          </div>
        </div>
      </>}
    </>
  );
}

/** 미는 동안 토스트 자리에 미리 서는 말 — 놓으면 일어날 일과 그 내용 */
function pullToast(pull: Pull, card: Card, best: Option | undefined, effect: Effect | undefined, t: ReturnType<typeof useTranslation>['t']): ToastView {
  if (pull.blocked || !best || !effect) {
    const why = card.due?.tone === 'risk' ? `${card.due.text}. ${t('swipe.tap')}` : t('swipe.tap');
    return { text: t('swipe.blocked'), sub: why, icon: 'warning', ring: 0, preview: true };
  }
  const ring = pull.armed ? 'full' : 'pull';
  if (pull.side === 'left') return { text: t(pull.armed ? 'swipe.snoozeArmed' : 'swipe.snooze'), sub: t('snoozed.at', { when: snoozeWhen(Date.now(), t) }), icon: 'clock', ring, preview: true };
  const key = `swipe.${effect.kind}${pull.armed ? 'Armed' : ''}`;
  const to = 'to' in effect ? effect.to : '';
  const sub = 'text' in effect && effect.text ? effect.text : best.label;
  return { text: t(key, { to }), sub, icon: ICON[effect.kind], ring, preview: true };
}

/** 목록 보기 — 남은 카드와 미뤄 둔 카드를 찾아서 골라요 */
function CardList({ s, getCard, searchRef, onFocus, onUnsnooze }: { s: State; getCard: (id: string) => Card | undefined; searchRef: React.RefObject<HTMLInputElement | null>; onFocus: (id: string) => void; onUnsnooze: (id: string) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  // 키보드가 목록을 가리지 않게, 손가락 기기에서는 검색창에 저절로 커서를 두지 않아요
  useEffect(() => { if (matchMedia('(hover: hover) and (pointer: fine)').matches) searchRef.current?.focus({ preventScroll: true }); }, [searchRef]);
  const match = (c: Card) => !q.trim() || [c.question, c.who, c.meta].join(' ').toLowerCase().includes(q.trim().toLowerCase());
  const open = openIds(s).map(getCard).filter((c): c is Card => Boolean(c && match(c)));
  const snoozed = snoozedIds(s).map(getCard).filter((c): c is Card => Boolean(c && match(c)));
  return (
    <div className="cu-page"><div className="cu-page-in">
      <label className="cu-search list-search"><I.search aria-hidden /><input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t('top.searchPh')} aria-label={t('top.search')} onKeyDown={e => e.stopPropagation()} /></label>
      <div className="cu-h"><b>{t('top.open')}</b><span>{open.length}</span></div>
      {open.map(c => (
        <button type="button" className="cu-row list-row" key={c.id} onClick={() => onFocus(c.id)}>
          <span className="cu-tile"><SourceIcon source={c.source} /></span>
          <span><span className="t">{c.question}</span><span className="s">{c.who}{c.due ? `, ${c.due.text}` : ''}</span></span>
          <span className="e"><I.caret aria-hidden /></span>
        </button>
      ))}
      {snoozed.length > 0 && <div className="cu-h"><b>{t('nav.snoozed')}</b><span>{snoozed.length}</span></div>}
      {snoozed.map(c => (
        <button type="button" className="cu-row list-row" key={c.id} onClick={() => onUnsnooze(c.id)}>
          <span className="cu-tile"><SourceIcon source={c.source} /></span>
          <span><span className="t">{c.question}</span><span className="s">{c.who}, {t('snoozed.at', { when: snoozeWhen(Date.now(), t) })}</span></span>
          <span className="e"><I.caret aria-hidden /></span>
        </button>
      ))}
      {open.length + snoozed.length === 0 && <Empty text={t('top.none')} face="thinking" />}
    </div></div>
  );
}
