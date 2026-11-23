import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { I, Mascot } from '../components/icons';
import { ApiError, call } from './api';
import { canPasskey, signInWithPasskey } from './passkeys';

/** 로그인 — 패스키(얼굴 · 지문)가 먼저예요. 처음이거나 패스키가 없는 기기에서는 한 번 쓰는 코드로 들어와요.
 *  코드는 서버에서만 받아요(`local.sh ops login-code` · `aws.sh run ops login-code`). */
export function Login({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState('');
  const passkey = canPasskey();
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
  const withPasskey = async () => {
    setBusy(true); setBad('');
    const how = await signInWithPasskey();
    setBusy(false);
    if (how === 'ok') onDone();
    else if (how !== 'cancelled') setBad(t('passkey.noneHere'));
  };
  return (
    <div className="scroll"><form className="center-page login" onSubmit={submit}>
      <span className="cu-mascot lg"><Mascot face="basic" /></span>
      <h1 className="cu-big">{t('live.login')}</h1>
      {passkey && <>
        <button type="button" className="cu-btn primary lg" disabled={busy} onClick={() => void withPasskey()}><I.lock aria-hidden />{t('passkey.signIn')}</button>
        <p className="login-or">{t('passkey.or')}</p>
      </>}
      <p className="cu-sub">{t('live.loginSub')}</p>
      <div className="cu-composer"><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('live.email')} aria-label={t('live.email')} /></div>
      <div className="cu-composer"><input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} placeholder={t('live.code')} aria-label={t('live.code')} /></div>
      <p className="login-bad" role="alert">{bad}</p>
      <button type="submit" className={`cu-btn lg${passkey ? '' : ' primary'}`} disabled={busy}>{t('live.signIn')}</button>
    </form></div>
  );
}
