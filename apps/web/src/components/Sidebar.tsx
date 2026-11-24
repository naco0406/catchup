import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I, Mark } from './icons';
import { canNotify } from '../live/notifications';

export type Route = 'catchup' | 'fyi' | 'snoozed' | 'activity' | 'connections' | 'sessions' | 'memory' | 'assistant';

/** <Sidebar> — 메뉴예요. 기본은 숨어 있다가 메뉴 단추로 열려요(서랍). 넓은 화면에서는 압정으로 고정할 수 있어요.
 *  화면으로 가는 줄만 두 묶음으로 둬요: 카드가 가는 곳 넷, 토마토 넷. 언어 · 알림 · 로그아웃은 Settings 안에 있어요. */
export function Sidebar({ route, counts, onNav, onMore, onReset, moreAdded, account, drawer, canPin, pinned, onPin, onKeys, onClose, onLang, inert }: {
  route: Route; counts: { open: number; fyi: number; snoozed: number; sessions: number };
  onNav: (r: Route) => void; onMore: () => void; onReset: () => void; moreAdded: boolean;
  account?: { logout: () => void; notify: () => void };
  /** 가림막 위에 뜬 서랍 */
  drawer?: boolean; onClose?: () => void;
  /** 넓은 화면(1024 이상)에서만 고정할 수 있어요. 고정은 기기마다 기억해요 */
  canPin?: boolean; pinned?: boolean; onPin?: () => void;
  onKeys?: () => void; onLang: (lang: 'en' | 'ko') => void;
  /** 위에 시트가 떠 있는 동안 */
  inert?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(false);
  const headBtn = useRef<HTMLButtonElement>(null);
  // 서랍이 열리면 초점을 안으로 옮겨요
  useEffect(() => { if (drawer) headBtn.current?.focus(); }, [drawer]);
  const nav = (r: Route, Icon: typeof I.cards, label: string, n?: number, badge?: boolean) => (
    <button type="button" className={`cu-nav${route === r ? ' on' : ''}`} onClick={() => onNav(r)} aria-current={route === r ? 'page' : undefined}>
      <Icon aria-hidden /><span>{label}</span>{n ? <span className={`n${badge ? ' badge' : ''}`}>{n}</span> : null}
    </button>
  );
  return (
    <aside className={`cu-side${drawer ? ' drawer' : ''}`} aria-label={t('side.menu')} inert={inert}>
      <div className="cu-side-head">
        <span className="cu-logo"><Mark /></span><span className="name">CatchUp</span>
        {canPin
          ? <button ref={headBtn} type="button" className={`cu-ib side-pin${pinned ? ' on' : ''}`} onClick={onPin} aria-pressed={Boolean(pinned)} aria-label={t(pinned ? 'side.unpin' : 'side.pin')} aria-keyshortcuts="["><I.pin aria-hidden /></button>
          : <button ref={headBtn} type="button" className="cu-ib" onClick={onClose} aria-label={t('side.close')}><I.close aria-hidden /></button>}
      </div>
      {nav('catchup', I.cards, t('nav.catchup'), counts.open, true)}
      {nav('fyi', I.listChecks, t('nav.fyi'), counts.fyi)}
      {nav('snoozed', I.clock, t('nav.snoozed'), counts.snoozed)}
      {nav('activity', I.receipt, t('nav.activity'))}

      <div className="cu-side-label">{t('side.tomato')}</div>
      {account && nav('assistant', I.chat, t('nav.assistant'))}
      {nav('memory', I.brain, t('nav.memory'))}
      {account && nav('sessions', I.terminal, t('nav.sessions'), counts.sessions)}
      {account && nav('connections', I.plug, t('nav.connections'))}

      <div className="side-foot">
        {settings && (
          <div className="side-set" id="side-settings">
            <div className="row"><I.translate aria-hidden /><span>{t('lang.label')}</span>
              <span className="cu-seg" role="group" aria-label={t('lang.label')}>
                {(['en', 'ko'] as const).map(l => <button key={l} type="button" className={i18n.language === l ? 'on' : ''} aria-pressed={i18n.language === l} onClick={() => onLang(l)}>{l === 'en' ? 'English' : '한국어'}</button>)}
              </span>
            </div>
            {account && canNotify() && <button type="button" className="row" onClick={account.notify}><I.bell aria-hidden /><span>{t('live.notify')}</span></button>}
            {onKeys && <button type="button" className="row keys-row" onClick={onKeys}><I.keyboard aria-hidden /><span>{t('keys.title')}</span><span className="v"><span className="cu-kbd">?</span></span></button>}
            {account && <button type="button" className="row" onClick={account.logout}><I.signOut aria-hidden /><span>{t('live.signOut')}</span></button>}
            {!account && <div className="proto">
              <span>{t('proto.note')}</span>
              <div className="acts">
                {!moreAdded && <button type="button" className="cu-btn" onClick={onMore}>{t('proto.more')}</button>}
                <button type="button" className={`cu-btn${moreAdded ? '' : ' ghost'}`} onClick={onReset}>{t('proto.reset')}</button>
              </div>
            </div>}
          </div>
        )}
        <button type="button" className={`cu-nav${settings ? ' on' : ''}`} onClick={() => setSettings(x => !x)} aria-expanded={settings} aria-controls="side-settings"><I.gear aria-hidden /><span>{t('side.settings')}</span></button>
      </div>
    </aside>
  );
}
