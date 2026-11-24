import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '../clipboard';
import { I } from '../components/icons';
import { Top } from '../screens/Pages';
import type { components } from './api.gen';
import { ApiError, call } from './api';
import { addPasskey, canPasskey, type Passkey } from './passkeys';

type Status = components['schemas']['CodexStatus'];
type Limits = { primary?: { usedPercent?: number; resetsAt?: number } };

/** 연결 — Codex(ChatGPT) 로그인과, 이 계정에 들어오는 패스키.
 *  Codex 의 코드는 이 화면에만 보이고 어디에도 저장하지 않아요. 패스키는 서버에 공개 열쇠만 남아요.
 *  보안 설명은 늘 두지 않고 그 일을 하는 순간에만 보여요: 코드 옆(연결하는 중), 실패한 이유 옆, 패스키를 지운 직후의 알림. */
export function Connections({ onMenu, onSay }: { onMenu: () => void; /** 잠깐 뜨는 알림(토스트) */ onSay: (text: string) => void }) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<Status>();
  const [failed, setFailed] = useState('');
  const [copied, setCopied] = useState(false);

  const read = useCallback(async () => {
    try { setStatus(await call<Status>('GET', '/me/codex')); setFailed(''); }
    catch (e) { setFailed(t(e instanceof ApiError && e.status === 0 ? 'live.offline' : 'live.error')); }
  }, [t]);
  useEffect(() => { void read(); }, [read]);

  const waiting = status?.busy || status?.state === 'starting' || status?.state === 'waiting';
  useEffect(() => {
    const every = setInterval(() => void read(), waiting ? 1500 : 10_000);
    return () => clearInterval(every);
  }, [waiting, read]);
  useEffect(() => { setCopied(false); }, [status?.code]);
  // 코드는 15분쯤 뒤에 못 쓰게 돼요 — 문장 대신 줄어드는 숫자로 보여 줘요(이 화면이 코드를 처음 본 때부터 세요)
  const [codeAt, setCodeAt] = useState(0);
  useEffect(() => { setCodeAt(status?.code ? Date.now() : 0); }, [status?.code]);
  const minsLeft = codeAt ? Math.max(1, 15 - Math.floor((Date.now() - codeAt) / 60_000)) : 0;

  // 패스키 — 얼굴 · 지문으로 로그인. 등록은 이미 로그인한 여기서만 해요
  const [keys, setKeys] = useState<Passkey[]>();
  const [keyNote, setKeyNote] = useState('');
  const [adding, setAdding] = useState(false);
  const readKeys = useCallback(async () => { try { setKeys(await call<Passkey[]>('GET', '/me/passkeys')); } catch { /* 위의 알림이 말해요 */ } }, []);
  useEffect(() => { void readKeys(); }, [readKeys]);
  const add = async () => {
    setAdding(true); setKeyNote('');
    const made = await addPasskey();
    setAdding(false);
    if (typeof made === 'string') { if (made !== 'cancelled') setKeyNote(t(`passkey.${made}`)); return; }
    await readKeys();
  };
  const removeKey = async (id: string) => { setKeyNote(''); try { await call('DELETE', `/me/passkeys/${id}`); await readKeys(); onSay(t('passkey.removed')); } catch { setKeyNote(t('live.error')); } };
  const day = (at: string) => new Date(at).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' });

  const send = async (method: 'POST' | 'DELETE', path: string) => {
    try { await call(method, `/me/codex${path}`); await read(); } catch { setFailed(t('live.error')); }
  };

  const state = status?.state;
  const used = (status?.limits as Limits | null | undefined)?.primary;
  const resets = used?.resetsAt ? new Date(used.resetsAt * 1000).toLocaleString(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const sub = !status ? t('live.loading')
    : state === 'in' ? [t('codex.in'), status.plan, used?.usedPercent !== undefined ? t('codex.used', { n: used.usedPercent }) : null, resets ? t('codex.resets', { when: resets }) : null].filter(Boolean).join(', ')
    : state === 'waiting' ? t('codex.waiting')
    : state === 'starting' ? t('codex.starting')
    : state === 'expired' ? t('codex.expired')
    : state === 'failed' ? t([`codex.why.${status.error_code}`, 'codex.why.other'])
    : t('codex.none');

  return (
    <>
      <Top page title={t('nav.connections')} onMenu={onMenu} />
      <div className="cu-page"><div className="cu-page-in">
        <div className="cu-h"><b>{t('codex.section')}</b></div>
        <div className="cu-row conn" data-codex={state}>
          <span className="cu-tile"><I.code aria-hidden /></span>
          <div><div className="t">{t('codex.title')}</div><div className="s" role="status">{sub}</div></div>
          {!status ? null
            : state === 'in' ? <button type="button" className="cu-btn" disabled={status.busy} onClick={() => void send('DELETE', '')}>{t('codex.disconnect')}</button>
            : waiting ? <button type="button" className="cu-btn" onClick={() => void send('DELETE', '/login')}>{t('codex.cancel')}</button>
            : <button type="button" className="cu-btn primary" onClick={() => void send('POST', '/login')}>{t('codex.connect')}</button>}
        </div>
        {state === 'waiting' && status?.code && status.verification_url && (
          <div className="cu-card flat device">
            <h2 className="cu-ask">{t('codex.enter')}</h2>
            <p className="device-code" aria-label={t('codex.code')}>{status.code}</p>
            <div className="device-acts">
              <a className="cu-btn primary" href={status.verification_url} target="_blank" rel="noopener noreferrer">{t('codex.open')}</a>
              <button type="button" className="cu-btn" onClick={() => void copyText(status.code!).then(setCopied)}><I.copy aria-hidden />{t(copied ? 'codex.copied' : 'codex.copy')}</button>
              {minsLeft > 0 && <span className="cu-work device-left" role="timer"><I.clock aria-hidden /><span>{t('codex.left', { n: minsLeft })}</span></span>}
            </div>
            {/* 로그인을 맡기는 이 순간에만 필요한 말이에요 */}
            <div className="cu-foot"><I.shield aria-hidden /><span>{t('codex.only')} {t('codex.note')}</span></div>
          </div>
        )}
        {state === 'failed' && <p className="cu-sub conn-hint">{t('codex.setting')}</p>}
        {failed && <p className="login-bad" role="alert">{failed}</p>}

        <div className="cu-h passkeys-h"><b>{t('passkey.section')}</b>{keys && keys.length > 0 && <span>{keys.length}</span>}</div>
        {keys?.map(k => (
          <div className="cu-row conn" key={k.id} data-passkey>
            <span className="cu-tile"><I.lock aria-hidden /></span>
            <div><div className="t">{t('passkey.on', { label: k.label })}</div><div className="s">{t('passkey.added', { when: day(k.created_at) })}, {k.last_used_at ? t('passkey.used', { when: day(k.last_used_at) }) : t('passkey.never')}</div></div>
            <button type="button" className="cu-link" onClick={() => void removeKey(k.id)}>{t('passkey.remove')}</button>
          </div>
        ))}
        <div className="cu-row conn">
          <span className="cu-tile"><I.lock aria-hidden /></span>
          <div><div className="t">{t(keys?.length ? 'passkey.another' : 'passkey.title')}</div><div className="s">{t(canPasskey() ? 'passkey.empty' : 'passkey.unsupported')}</div></div>
          <button type="button" className={`cu-btn${keys?.length ? '' : ' primary'}`} disabled={adding || !canPasskey()} onClick={() => void add()}>{t('passkey.add')}</button>
        </div>
        {keyNote && <p className="login-bad" role="alert">{keyNote}</p>}
      </div></div>
    </>
  );
}
