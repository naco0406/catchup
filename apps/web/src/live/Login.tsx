import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Mascot } from '../components/icons';
import { ApiError, call } from './api';

/** 로그인 — 로컬에서는 한 번 쓰는 코드(`local.sh ops login-code`) */
export function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setBad('');
    try {
      await call('POST', '/auth/session', { email, code, label: navigator.platform || 'web' });
      onDone();
    } catch (err) {
      setBad(err instanceof ApiError && err.status === 401 ? t('live.badCode') : t('live.offline'));
    } finally { setBusy(false); }
  };
  return (
    <div className="scroll"><form className="center-page login" onSubmit={submit}>
      <span className="cu-mascot lg"><Mascot face="basic" /></span>
      <h1 className="cu-big">{t('live.login')}</h1>
      <p className="cu-sub">{t('live.loginSub')}</p>
      <div className="cu-composer"><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('live.email')} aria-label={t('live.email')} /></div>
      <div className="cu-composer"><input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} placeholder={t('live.code')} aria-label={t('live.code')} /></div>
      <p className="login-bad" role="alert">{bad}</p>
      <button type="submit" className="cu-btn primary lg" disabled={busy}>{t('live.signIn')}</button>
    </form></div>
  );
}
