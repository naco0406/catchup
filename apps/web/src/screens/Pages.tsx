import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, Dataset } from '../data/types';
import { canUndo, snoozedIds, type Entry, type State } from '../state/store';
import { altOptions, turnsOf } from '../data';
import { I, Mascot, SourceIcon } from '../components/icons';

const hhmm = (ms: number, lang: string) => new Date(ms).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US', { hour: 'numeric', minute: '2-digit' });

export function Top({ title, left, onMenu, children, page }: { title: string; left?: string; onMenu: () => void; children?: React.ReactNode; page?: boolean }) {
  const { t } = useTranslation();
  const inner = <>
    <button type="button" className="cu-ib menu" onClick={onMenu} aria-label={t('side.menu')}><I.list aria-hidden /></button>
    <h1>{title}</h1>{left && <span className="left">{left}</span>}<span className="sp" />{children}
  </>;
  // 목록 화면의 위 막대는 목록 칸(760)과 같은 폭에 맞춰요
  return page ? <div className="cu-top page-top"><div className="in">{inner}</div></div> : <div className="cu-top">{inner}</div>;
}

/** 빈 화면 — 캐릭터와 한 줄 */
export function Empty({ text, face = 'done' }: { text: string; face?: 'basic' | 'thinking' | 'done' }) {
  return <div className="empty"><span className="cu-mascot md"><Mascot face={face} /></span><p>{text}</p></div>;
}

/** 처음 — 무엇을 맡길지 고르기 */
export function First({ s, onConnect, onStart }: { s: State; onConnect: (id: string) => void; onStart: () => void }) {
  const { t } = useTranslation();
  const rows: { id: 'gmail' | 'calendar' | 'slack' | 'agents' | 'kakao'; icon: React.ReactNode; action: string }[] = [
    { id: 'gmail', icon: <I.mail aria-hidden />, action: t('first.connect') },
    { id: 'calendar', icon: <I.calendar aria-hidden />, action: t('first.connect') },
    { id: 'slack', icon: <I.slack aria-hidden />, action: t('first.connect') },
    { id: 'agents', icon: <I.terminal aria-hidden />, action: t('first.connect') },
    { id: 'kakao', icon: <I.chat aria-hidden />, action: t('first.addChannel') },
  ];
  return (
    <div className="scroll"><div className="center-page">
      <span className="cu-mascot lg"><Mascot face="basic" /></span>
      <h1 className="cu-big" style={{ marginTop: 20 }}>{t('first.title')}</h1>
      <p className="cu-sub">{t('first.sub')}</p>
      <div className="cu-connect">
        {rows.map(r => {
          const [name, sub] = t(`first.rows.${r.id}`, { returnObjects: true }) as [string, string];
          return (
            <div className="cu-row" key={r.id}><span className="cu-tile">{r.icon}</span><div><div className="t">{name}</div><div className="s">{sub}</div></div>
              {s.connected[r.id] ? <span className="e ok"><I.check aria-hidden />{t('first.connected')}</span>
                : <button type="button" className="cu-btn" onClick={() => onConnect(r.id)}>{r.action}</button>}</div>
          );
        })}
      </div>
      <p className="cu-promise"><I.shield aria-hidden /><span>{t('first.promise')}</span></p>
      <button type="button" className="cu-btn primary lg" style={{ marginTop: 24 }} onClick={onStart}>{t('first.start')}</button>
    </div></div>
  );
}

/** 다 봤어요 — 끝과 그동안 비서가 한 일 */
export function Done({ s, ds, onMenu, onNav, onMore, onUndoAuto }: { s: State; ds: Dataset; onMenu: () => void; onNav: (r: 'fyi' | 'snoozed') => void; onMore: () => void; onUndoAuto: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const decided = s.log.filter(e => e.kind === 'decided' && !e.undone).length + s.pending.length;
  const snoozed = snoozedIds(s).length;
  const secs = s.firstPickAt && s.lastPickAt ? Math.max(1, Math.round((s.lastPickAt - s.firstPickAt) / 1000)) : 0;
  const time = i18n.language === 'ko' ? `${Math.floor(secs / 60) ? `${Math.floor(secs / 60)}분 ` : ''}${secs % 60}초` : `${Math.floor(secs / 60) ? `${Math.floor(secs / 60)}m ` : ''}${secs % 60}s`;
  const fyiLeft = ds.fyi.filter(f => !s.deck.includes(`p-${f.id}`)).length;
  return (
    <>
      <Top title={t('nav.catchup')} left={snoozed ? t('top.doneSplit', { decided, snoozed }) : t('top.allDone', { total: s.deck.length })} onMenu={onMenu} />
      <div className="scroll"><div className="done-wrap">
        <div className="cu-done-head">
          <span className="cu-mascot md"><Mascot face="done" /></span>
          <div><p className="cu-big">{t('done.title')}</p><p className="cu-sub">{decided === 0 ? t('done.subSnoozedOnly', { snoozed }) : t(snoozed ? 'done.sub' : 'done.subNone', { decided, time, snoozed })}<br />{t('done.sub2')}</p></div>
        </div>
        {ds.autoDone.length > 0 && <div className="cu-h"><b>{t('done.auto')}</b><span>{ds.autoDone.length}</span><span className="sp" /></div>}
        {ds.autoDone.map(a => (
          <div className="cu-row" key={a.id}><span className="cu-tile"><SourceIcon source={a.source} /></span><div><div className="t">{a.title}</div><div className="s">{a.sub}</div></div>
            <span className="acts"><button type="button" className="cu-link" onClick={() => onUndoAuto(a.id)} disabled={s.autoUndone.includes(a.id)}>{s.autoUndone.includes(a.id) ? t('log.undone') : t('log.undo')}</button></span></div>
        ))}
        {(fyiLeft > 0 || snoozed > 0) && <div className="cu-h"><b>{t('done.left')}</b></div>}
        {fyiLeft > 0 && <div className="cu-row"><span className="cu-tile"><I.listChecks aria-hidden /></span><div><div className="t">{t('done.fyi', { count: fyiLeft })}</div><div className="s">{ds.today.length ? t('done.fyiSub') : ds.fyi.map(f => f.title).join(' · ')}</div></div><button type="button" className="cu-btn" onClick={() => onNav('fyi')}>{t('done.skim')}</button></div>}
        {snoozed > 0 && <div className="cu-row"><span className="cu-tile"><I.clock aria-hidden /></span><div><div className="t">{t('done.snoozed', { n: snoozed })}</div><div className="s">{t('done.snoozedSub')}</div></div><button type="button" className="cu-btn" onClick={() => onNav('snoozed')}>{t('done.view')}</button></div>}
        {!s.moreAdded && <div style={{ marginTop: 24 }}><button type="button" className="cu-btn" onClick={onMore}>{t('done.more')}</button></div>}
      </div></div>
    </>
  );
}

/** 알려만 드려요 */
/** 미뤄 둔 것 */
export function Snoozed({ s, getCard, onMenu, onBack }: { s: State; getCard: (id: string) => Card | undefined; onMenu: () => void; onBack: (id: string) => void }) {
  const { t } = useTranslation();
  const ids = snoozedIds(s);
  return (
    <>
      <Top page title={t('snoozed.title')} left={ids.length ? t('snoozed.sub', { count: ids.length }) : undefined} onMenu={onMenu} />
      <div className="cu-page"><div className="cu-page-in">
        {ids.length === 0 && <Empty text={t('snoozed.empty')} />}
        {ids.map(id => { const c = getCard(id); if (!c) return null; return (
          <div className="cu-row" key={id}><span className="cu-tile"><SourceIcon source={c.source} /></span><div><div className="t">{c.question}</div><div className="s">{c.who} · {t('snoozed.at')}</div></div>
            <button type="button" className="cu-btn" onClick={() => onBack(id)}>{t('snoozed.back')}</button></div>
        ); })}
      </div></div>
    </>
  );
}

/** 처리 기록 — 내가 정한 것과 비서가 한 것을 시간순으로 */
export function Activity({ s, ds, getCard, onMenu, onUndo, onUndoPending, onUndoAuto, onRoutine }: {
  s: State; ds: Dataset; getCard: (id: string) => Card | undefined; onMenu: () => void; onUndo: (id: string) => void; onUndoPending: (cardId: string) => void; onUndoAuto: (id: string) => void; onRoutine: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'mine' | 'auto'>('all');
  const line = (e: Entry) => {
    const c = getCard(e.cardId);
    if (e.kind === 'read') { // 읽은 소식 — 예시 자료에서는 알려만 목록에서, 실제 모드에서는 서버가 준 기록에서 찾아요
      const f = ds.fyi.find(x => x.id === e.cardId), q = f?.title ?? c?.question, source = f?.source ?? c?.source;
      return q && source ? { title: t('log.read', { q }), sub: t('log.subRead'), source } : null;
    }
    if (!c) return null;
    if (e.kind !== 'decided') return { title: t(e.kind === 'snoozed' ? 'log.snoozed' : 'log.handed', { q: c.question }), sub: t(e.kind === 'snoozed' ? 'log.subSnoozed' : 'log.subHanded'), source: c.source };
    const turns = turnsOf(s.progress[e.cardId]);
    const alt = e.alt && turns.length ? altOptions(c, t, turns) : null;
    const o = (alt?.options ?? c.options)[e.pick ?? 0];
    const rec = alt?.recommended ?? c.recommended;
    return { title: o?.done ?? '', sub: [t('log.byMe'), e.alt ? t('log.inWords') : e.pick === rec ? t('log.suggested') : null, e.edited ? t('log.edited') : null].filter(Boolean).join(' · '), source: c.source };
  };
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  type Row = { key: string; at: number; mine: boolean; node: React.ReactNode };
  const rows: Row[] = [];
  for (const p of s.pending) {
    // 10초 대기 중인 답들 — 아직 나가지 않았어요
    const l = p.line ?? line({ id: 'pending', cardId: p.cardId, kind: 'decided', pick: p.pick, alt: p.alt, at: p.at, edited: p.edited });
    if (l) rows.push({ key: `pending-${p.cardId}`, at: p.at, mine: true, node: (
      <div className="cu-row" key={`pending-${p.cardId}`}><span className="cu-tile"><SourceIcon source={l.source} /></span><div><div className="t">{l.title}</div><div className="s">{p.line?.sub ?? [t('log.pending'), p.edited ? t('log.edited') : null].filter(Boolean).join(' · ')}</div></div>
        <span className="e"><span>{hhmm(p.at, i18n.language)}</span><button type="button" className="cu-link" onClick={() => onUndoPending(p.cardId)}>{t('log.undo')}</button></span></div>) });
  }
  for (const e of s.log) {
    const l = e.line ?? line(e); if (!l) continue;
    rows.push({ key: e.id, at: e.at, mine: true, node: (
      <div className="cu-row" key={e.id}><span className="cu-tile"><SourceIcon source={l.source} /></span><div><div className="t">{l.title}</div><div className="s">{l.sub}</div></div>
        <span className="e"><span>{hhmm(e.at, i18n.language)}</span>{e.undone ? <span>{t('log.undone')}</span> : canUndo(s, e) && <button type="button" className="cu-link" onClick={() => onUndo(e.id)}>{t('log.undo')}</button>}</span></div>) });
  }
  for (const a of ds.autoDone) {
    rows.push({ key: a.id, at: midnight.getTime() + a.min * 60_000, mine: false, node: (
      <div className="cu-row" key={a.id}><span className="cu-tile"><SourceIcon source={a.source} /></span><div><div className="t">{a.title}</div><div className="s">{a.sub}</div></div>
        <span className="e"><span>{a.time}</span><button type="button" className="cu-link" disabled={s.autoUndone.includes(a.id)} onClick={() => onUndoAuto(a.id)}>{s.autoUndone.includes(a.id) ? t('log.undone') : t('log.undo')}</button></span></div>) });
  }
  rows.sort((a, b) => b.at - a.at);
  const nMine = rows.filter(r => r.mine).length, nAuto = rows.length - nMine;
  const shown = rows.filter(r => filter === 'all' || (filter === 'mine') === r.mine);
  const tab = (f: 'all' | 'mine' | 'auto', label: string, n?: number) => (
    <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}{n ? <span className="n">{n}</span> : null}</button>
  );
  return (
    <>
      <Top page title={t('log.title')} left={t('log.count', { n: rows.length })} onMenu={onMenu}>
        <span className="cu-seg log-seg" role="group" aria-label={t('log.title')}>
          {tab('all', t('log.all'))}{tab('mine', t('log.mine'), nMine)}{tab('auto', t('log.auto'), nAuto)}
        </span>
      </Top>
      <div className="cu-page"><div className="cu-page-in">
        <div className="cu-h"><b>{t('log.today')}</b></div>
        {shown.map(r => r.node)}
        {shown.length === 0 && <Empty text={t('log.empty')} face="basic" />}
        {ds.routines.length > 0 && <div className="cu-h" style={{ marginTop: 28 }}><b>{t('log.routines')}</b><span>{t('log.routinesSub')}</span></div>}
        {ds.routines.map(r => (
          <div className="cu-row" key={r.id}><span className="cu-tile">{r.icon === 'calendar' ? <I.calendarCheck aria-hidden /> : r.icon === 'terminal' ? <I.terminal aria-hidden /> : r.icon === 'archive' ? <I.archive aria-hidden /> : <I.money aria-hidden />}</span>
            <div><div className="t">{r.title}</div><div className="s">{r.sub}</div></div>
            {r.locked ? <span className="e lockd"><I.lock aria-hidden /></span>
              : <button type="button" role="switch" aria-checked={s.routines[r.id]} aria-label={r.title} className={`cu-switch${s.routines[r.id] ? '' : ' off'}`} onClick={() => onRoutine(r.id)} />}</div>
        ))}
      </div></div>
    </>
  );
}
