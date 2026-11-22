import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from '../components/icons';
import { Empty, Top } from '../screens/Pages';
import type { components } from './api.gen';
import { ApiError, call, newKey, type ApiSession } from './api';

const ACTIVE = new Set(['queued', 'starting', 'running', 'waiting', 'blocked', 'finishing']);
const SHOWN_LINES = 400;
// 에이전트가 만든 글 — 숨은 글자는 드러내요(서버의 request::visible 과 같은 것)
const HIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u034f\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]|[\u{e0000}-\u{e007f}]/gu;
const visible = (s: string) => s.replace(HIDDEN, c => `\\u{${c.codePointAt(0)!.toString(16)}}`);

/** 코딩 세션 — 맡기기 · 상태 · 바뀐 것 */
export function Sessions({ sessions, onMenu, onCards, onConnect, refresh }: {
  sessions: ApiSession[]; onMenu: () => void; onCards: () => void; onConnect: () => void; refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [signedIn, setSignedIn] = useState<boolean>();
  const [task, setTask] = useState('');
  const [repo, setRepo] = useState('');
  const [request, setRequest] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState('');

  useEffect(() => {
    let here = true;
    call<components['schemas']['CodexStatus']>('GET', '/me/codex').then(s => { if (here) setSignedIn(s.state === 'in'); }, () => undefined);
    return () => { here = false; };
  }, [sessions]);

  const why = (e: unknown) => t([`sessions.why.${e instanceof ApiError ? e.code : 'other'}`, 'sessions.why.other']);
  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!task.trim() || busy) return;
    setBusy(true); setBad('');
    try {
      await call('POST', '/me/agent-sessions', { request_key: request, task, repo: repo.trim() || null });
      setTask(''); setRequest(newKey());
      await refresh();
    } catch (err) {
      setBad(why(err));
      if (err instanceof ApiError && err.status > 0) setRequest(newKey());
    } finally { setBusy(false); }
  };
  const stop = async (id: string) => { try { await call('DELETE', `/me/agent-sessions/${id}`); await refresh(); } catch (err) { setBad(why(err)); } };

  const active = sessions.filter(s => ACTIVE.has(s.state));
  const over = sessions.filter(s => !ACTIVE.has(s.state));
  return (
    <>
      <Top page title={t('nav.sessions')} left={active.length ? t('sessions.active', { count: active.length }) : undefined} onMenu={onMenu} />
      <div className="cu-page"><div className="cu-page-in">
        {signedIn === false ? (
          <div className="cu-row need-login">
            <span className="cu-tile"><I.plug aria-hidden /></span>
            <div><div className="t">{t('sessions.needLogin')}</div><div className="s">{t('sessions.needLoginSub')}</div></div>
            <button type="button" className="cu-btn primary" onClick={onConnect}>{t('sessions.connect')}</button>
          </div>
        ) : (
          <form className="cu-card flat new-session" onSubmit={start}>
            <h2 className="cu-ask">{t('sessions.ask')}</h2>
            <textarea className="cu-textarea" rows={3} required maxLength={20000} value={task} onChange={e => { setTask(e.target.value); setRequest(newKey()); }} placeholder={t('sessions.taskPh')} aria-label={t('sessions.task')} />
            <div className="cu-composer"><input value={repo} onChange={e => { setRepo(e.target.value); setRequest(newKey()); }} placeholder={t('sessions.repoPh')} aria-label={t('sessions.repo')} autoCapitalize="off" autoCorrect="off" spellCheck={false} /></div>
            <div className="new-session-foot">
              <button type="submit" className="cu-btn primary" disabled={busy || !signedIn || !task.trim()}>{t('sessions.start')}</button>
              <span>{t('sessions.box')}</span>
            </div>
          </form>
        )}
        {bad && <p className="login-bad" role="alert">{bad}</p>}
        {active.length > 0 && <div className="cu-h"><b>{t('sessions.now')}</b><span>{active.length}</span></div>}
        {active.map(s => <Row key={s.id} s={s} onCards={onCards} onStop={() => void stop(s.id)} />)}
        {over.length > 0 && <div className="cu-h"><b>{t('sessions.over')}</b><span>{over.length}</span></div>}
        {over.map(s => <Row key={s.id} s={s} onCards={onCards} onStop={() => void stop(s.id)} />)}
        {sessions.length === 0 && <Empty text={t('sessions.empty')} face="basic" />}
      </div></div>
    </>
  );
}

function Row({ s, onCards, onStop }: { s: ApiSession; onCards: () => void; onStop: () => void }) {
  const { t } = useTranslation();
  const [patch, setPatch] = useState<string[]>();
  const [bad, setBad] = useState(false);
  const active = ACTIVE.has(s.state);
  const path = `/v1/me/agent-sessions/${s.id}/patch`;
  const toggle = async () => {
    if (patch) { setPatch(undefined); return; }
    try {
      const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) throw new Error('patch');
      setPatch((await r.text()).replace(/\n$/, '').split('\n'));
      setBad(false);
    } catch { setBad(true); }
  };
  const state = s.cancel_wanted && active ? t('sessions.state.stopping') : t(`sessions.state.${s.state}`);
  const reason = s.state !== 'cancelled' && s.error_code ? t([`sessions.why.${s.error_code}`, 'sessions.why.other']) : null;
  const sub = [state, s.repo, reason].filter(Boolean).join(' · ');
  return (
    <div className="session" data-session={s.state}>
      <div className="cu-row">
        <span className="cu-tile"><I.code aria-hidden /></span>
        <div><div className="t">{visible(s.title)}</div><div className="s" role="status">{sub}</div></div>
        <span className="acts">
          {s.state === 'waiting' && <button type="button" className="cu-btn primary" onClick={onCards}>{t('sessions.answer')}</button>}
          {active && <button type="button" className="cu-btn" disabled={s.cancel_wanted} onClick={onStop}>{t('sessions.stop')}</button>}
          {!active && s.has_patch && <button type="button" className="cu-btn" aria-expanded={Boolean(patch)} onClick={() => void toggle()}>{t(patch ? 'sessions.hide' : 'sessions.changes')}</button>}
        </span>
      </div>
      {!active && s.summary && <p className="session-sum">{visible(s.summary)}</p>}
      {bad && <p className="login-bad" role="alert">{t('live.error')}</p>}
      {patch && (
        <div className="cu-code session-patch">
          <div className="fh"><I.branch aria-hidden /><span className="lb">{t('sessions.changes')}</span><span className="sp" /><a className="cu-link" href={path} download="changes.patch">{t('sessions.download')}</a></div>
          {patch.slice(0, SHOWN_LINES).map((line, i) => (
            <div key={i} className={`ln ${line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : ''}`}>{visible(line) || ' '}</div>
          ))}
          {patch.length > SHOWN_LINES && <div className="ln">{t('sessions.more', { n: patch.length - SHOWN_LINES })}</div>}
        </div>
      )}
    </div>
  );
}
