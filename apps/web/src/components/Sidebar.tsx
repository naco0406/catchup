import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Dataset } from '../data/types';
import { I, Mark, SourceIcon } from './icons';
import { canNotify } from '../live/notifications';

export type Route = 'catchup' | 'fyi' | 'snoozed' | 'activity' | 'connections' | 'sessions' | 'memory' | 'assistant';

/** <Sidebar> — 넓은 화면에선 늘 보이고, 좁은 화면에선 서랍이에요 */
export function Sidebar({ ds, route, counts, onNav, onMore, onReset, onSearch, moreAdded, account, drawer, onClose, inert }: {
  ds: Dataset; route: Route; counts: { open: number; fyi: number; snoozed: number };
  onNav: (r: Route) => void; onMore: () => void; onReset: () => void; onSearch: () => void; moreAdded: boolean; account?: { logout: () => void; notify: () => void }; drawer?: boolean; onClose?: () => void;
  /** 위에 시트가 떠 있는 동안 */
  inert?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  // 서랍이 열리면 초점을 안으로 옮겨요
  useEffect(() => { if (drawer) closeRef.current?.focus(); }, [drawer]);
  const nav = (r: Route, Icon: typeof I.cards, label: string, n?: number, badge?: boolean) => (
    <button type="button" className={`cu-nav${route === r ? ' on' : ''}`} onClick={() => onNav(r)} aria-current={route === r ? 'page' : undefined}>
      <Icon aria-hidden /><span>{label}</span>{n ? <span className={`n${badge ? ' badge' : ''}`}>{n}</span> : null}
    </button>
  );
  return (
    <aside className={`cu-side${drawer ? ' drawer' : ''}`} aria-label={t('side.menu')} inert={inert}>
      <div className="cu-side-head">
        <span className="cu-logo"><Mark /></span><span className="name">CatchUp</span>
        {drawer ? <button ref={closeRef} type="button" className="cu-ib" onClick={onClose} aria-label={t('side.close')}><I.close aria-hidden /></button>
          : <button type="button" className="cu-ib" onClick={onSearch} aria-label={t('top.search')}><I.search aria-hidden /></button>}
      </div>
      {nav('catchup', I.cards, t('nav.catchup'), counts.open, true)}
      {nav('fyi', I.listChecks, t('nav.fyi'), counts.fyi)}
      {nav('snoozed', I.clock, t('nav.snoozed'), counts.snoozed)}
      {nav('activity', I.receipt, t('nav.activity'))}
      {account && nav('assistant', I.chat, t('nav.assistant'))}
      {nav('memory', I.brain, t('nav.memory'))}
      {account && nav('sessions', I.terminal, t('nav.sessions'))}
      {account && nav('connections', I.plug, t('nav.connections'))}

      {ds.runs.length > 0 && <div className="cu-side-label">{t('side.working')}</div>}
      {ds.runs.map(r => (
        <div className="cu-run" key={r.id ?? r.title}>{r.agent === 'Codex' ? <I.code aria-hidden /> : r.agent === 'Claude Code' ? <I.terminal aria-hidden /> : <I.mail aria-hidden />}
          <span className="t">{r.title}</span><span className={`s${r.waiting ? ' wait' : ''}`}>{r.agent} · {r.status}</span></div>
      ))}
      {ds.sources.length > 0 && <div className="cu-side-label">{t(account ? 'live.incoming' : 'side.incoming')}</div>}
      {ds.sources.map(s => <div className="cu-src-row" key={s.source}><SourceIcon source={s.source} /><span>{s.name}</span><span className="n">{s.count}</span></div>)}

      <div className="side-foot">
        {account && <div className="account">
          {canNotify() && <button type="button" className="cu-btn ghost" onClick={account.notify}>{t('live.notify')}</button>}
          <button type="button" className="cu-btn ghost" onClick={account.logout}>{t('live.signOut')}</button>
        </div>}
        {!account && <div className="proto">
          <b>{t('proto.label')}</b>
          <span>{t('proto.note')}</span>
          <div className="row">
            {!moreAdded && <button type="button" className="cu-btn" onClick={onMore}>{t('proto.more')}</button>}
            <button type="button" className={`cu-btn${moreAdded ? '' : ' ghost'}`} onClick={onReset}>{t('proto.reset')}</button>
          </div>
        </div>}
        <div className="seg-lang" role="group" aria-label={t('lang.label')}>
          <span className="cu-seg">
            {(['en', 'ko'] as const).map(l => <button key={l} type="button" className={i18n.language === l ? 'on' : ''} aria-pressed={i18n.language === l} onClick={() => void i18n.changeLanguage(l)}>{l === 'en' ? 'English' : '한국어'}</button>)}
          </span>
        </div>
        {!account && <div className="cu-me"><span className="cu-avatar">{t('side.initials')}</span><span>{t('side.user')}</span></div>}
      </div>
    </aside>
  );
}
