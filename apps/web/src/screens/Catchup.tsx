import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card } from '../data/types';
import { openIds, snoozedIds, stateOf, type State } from '../state/store';
import { Composer, DecisionCard } from '../components/DecisionCard';
import { I, SourceIcon } from '../components/icons';
import { Empty } from './Pages';

/** 캐치업 — 카드 한 장씩(방향 A). 넓을 땐 위에 동그라미 진행, 좁을 땐 막대 진행과 아래 단추.
 *  ≡ 로 목록 보기(방향 B)로 바꾸면 남은 카드를 훑어보고 찾아서 먼저 정할 수 있어요. */
export function Catchup({ s, card, getCard, onPick, onSay, onDraft, onSnooze, onHandoff, onAuto, onUndo, onMenu, onFocus, onUnsnooze, composerRef, toast, list, setList, searchRef }: {
  s: State; card: Card; getCard: (id: string) => Card | undefined;
  onPick: (i: number, risky: boolean) => void; onSay: (text: string) => void; onDraft: (text: string) => void;
  onSnooze: () => void; onHandoff: () => void; onAuto: () => void; onUndo: () => void; onMenu: () => void;
  onFocus: (id: string) => void; onUnsnooze: (id: string) => void;
  composerRef: React.RefObject<HTMLInputElement | null>;
  /** 넓은 화면에선 토스트가 떠 있는 동안 위 막대 가운데(진행 동그라미 자리)에 서요 — 아무것도 가리지 않게 */
  toast?: React.ReactNode;
  list: boolean; setList: (v: boolean) => void; searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const total = s.deck.length;
  const doneCount = s.deck.filter(id => stateOf(s, id) !== 'open').length;
  const openCount = total - doneCount;
  const MAX = 9;
  const shown = s.deck.slice(0, MAX);
  // 처음 뜬 카드는 움직이지 않고, 넘길 때만 떠오르게 해요
  const firstId = useRef(card.id);
  const enter = card.id !== firstId.current ? 'card-enter' : '';
  const risky = card.due?.tone === 'risk';
  // 누른 단추에 초점 테두리가 남지 않게
  const tap = (f: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); f(); };

  return (
    <>
      <div className="cu-top deck-top">
        <span className="ttl"><button type="button" className="cu-ib menu" onClick={onMenu} aria-label={t('side.menu')}><I.list aria-hidden /></button><h1>{t('nav.catchup')}</h1><span className="left">{list ? `${t('top.open')} ${openCount}` : t('top.of', { n: doneCount + 1, total })}</span></span>
        {toast ? <div className="top-toast" aria-live="polite">{toast}</div> : <div className="cu-steps" aria-label={t('top.progress')}>
          {shown.map(id => {
            const st = stateOf(s, id); const c = getCard(id);
            const cls = id === card.id ? 'on' : st === 'open' ? '' : 'done';
            return <span key={id} className={`cu-step ${cls}`}>{st === 'snoozed' ? <I.clock aria-hidden /> : st !== 'open' ? <I.check aria-hidden /> : c && <SourceIcon source={c.source} />}</span>;
          })}
          {total > MAX && <span className="more">+{total - MAX}</span>}
        </div>}
        <span className="tools">
        <button type="button" className="cu-ib" onClick={onUndo} disabled={!s.pending} aria-label={t('top.undo')} aria-keyshortcuts="Z"><I.undo aria-hidden /></button>
        <button type="button" className="cu-ib" onClick={() => setList(!list)} aria-pressed={list} aria-label={list ? t('top.deck') : t('top.list')}>{list ? <I.cards aria-hidden /> : <I.rows aria-hidden />}</button>
        </span>
      </div>
      {list ? <CardList s={s} getCard={getCard} searchRef={searchRef} onFocus={id => { onFocus(id); setList(false); }} onUnsnooze={id => { onUnsnooze(id); setList(false); }} /> : <>
        <div className="cu-pbar" aria-hidden>{s.deck.slice(0, 12).map(id => <i key={id} className={id === card.id ? 'on' : stateOf(s, id) !== 'open' ? 'd' : ''} />)}</div>
        <div className="scroll">
          <div className="cu-stage">
            <div className="cu-deck">
              <div key={card.id} className={enter}>
                <DecisionCard card={card} prog={s.progress[card.id]} onPick={onPick} onSay={onSay} onDraft={onDraft} onSwipe={onSnooze} composerRef={composerRef} />
              </div>
              {openCount > 1 && <div className="cu-peek p1" />}
              {openCount > 2 && <div className="cu-peek p2" />}
            </div>
            <div className="cu-acts">
              <button type="button" className="cu-btn ghost" onClick={tap(onSnooze)} aria-keyshortcuts="S"><I.clock aria-hidden />{t('card.snooze')} <span className="cu-kbd">S</span></button>
              <button type="button" className="cu-btn ghost" onClick={tap(onHandoff)} aria-keyshortcuts="D"><I.hand aria-hidden />{t('card.myself')} <span className="cu-kbd">D</span></button>
              <span className="sp" />
              {!risky && <button type="button" className="cu-btn ghost" onClick={tap(onAuto)}><I.bolt aria-hidden />{t('card.auto')}</button>}
            </div>
          </div>
        </div>
        <div className="phone-dock">
          <Composer key={card.id} onSay={onSay} placeholder={s.progress[card.id]?.alt ? t('card.more') : t('card.composerShort')} />
          <div className={`cu-pacts${risky ? ' two' : ''}`}>
            <button type="button" onClick={tap(onSnooze)}><I.clock aria-hidden />{t('card.snooze')}</button>
            <button type="button" onClick={tap(onHandoff)}><I.hand aria-hidden />{t('card.myselfShort')}</button>
            {!risky && <button type="button" onClick={tap(onAuto)}><I.bolt aria-hidden />{t('card.autoShort')}</button>}
          </div>
        </div>
      </>}
    </>
  );
}

/** 목록 보기 — 남은 카드와 미뤄 둔 카드를 찾아서 골라요 */
function CardList({ s, getCard, searchRef, onFocus, onUnsnooze }: { s: State; getCard: (id: string) => Card | undefined; searchRef: React.RefObject<HTMLInputElement | null>; onFocus: (id: string) => void; onUnsnooze: (id: string) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  useEffect(() => { searchRef.current?.focus({ preventScroll: true }); }, [searchRef]);
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
          <span><span className="t">{c.question}</span><span className="s">{c.who}{c.due ? ` · ${c.due.text}` : ''}</span></span>
          <span className="e"><I.caret aria-hidden /></span>
        </button>
      ))}
      {snoozed.length > 0 && <div className="cu-h"><b>{t('nav.snoozed')}</b><span>{snoozed.length}</span></div>}
      {snoozed.map(c => (
        <button type="button" className="cu-row list-row" key={c.id} onClick={() => onUnsnooze(c.id)}>
          <span className="cu-tile"><SourceIcon source={c.source} /></span>
          <span><span className="t">{c.question}</span><span className="s">{c.who} · {t('snoozed.at')}</span></span>
          <span className="e"><I.caret aria-hidden /></span>
        </button>
      ))}
      {open.length + snoozed.length === 0 && <Empty text={t('top.none')} face="thinking" />}
    </div></div>
  );
}
