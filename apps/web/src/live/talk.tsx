import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from '../components/icons';
import type { components } from './api.gen';
import { ApiError, call, newKey } from './api';

export type Msg = components['schemas']['Message'];
export type TalkNav = 'memory' | 'sessions' | 'connections' | 'catchup' | 'assistant';
const WHY = new Set(['signed_out', 'limit_reached', 'still_thinking', 'card_not_open']);

/** 비서와 주고받는 것 — 비서 화면과 덱 위의 시트가 같이 써요.
 *  말은 먼저 받아 두고 답은 뒤따라와요. 생각 중인 말이 있는 동안만 다시 읽어요. */
export function useTalk() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Msg[]>();
  const [text, setText] = useState('');
  const [request, setRequest] = useState(newKey);
  const [bad, setBad] = useState('');

  const why = useCallback((e: unknown) => t(e instanceof ApiError && e.status === 0 ? 'live.offline' : `assistant.why.${e instanceof ApiError && WHY.has(e.code) ? e.code : 'other'}`), [t]);
  const read = useCallback(async () => {
    try { setItems(await call<Msg[]>('GET', '/me/assistant')); } catch (e) { setBad(why(e)); }
  }, [why]);
  useEffect(() => { void read(); }, [read]);
  const thinking = Boolean(items?.some(m => m.state === 'thinking'));
  useEffect(() => { if (!thinking) return; const id = setInterval(() => void read(), 1000); return () => clearInterval(id); }, [thinking, read]);

  const put = (m: Msg) => setItems(list => [...(list ?? []).filter(x => x.id !== m.id), m].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  /** 쓴 말을 보내요. `card` 는 말할 때 보고 있던 카드(덱에서만)예요. 보낸 말을 돌려줘요 */
  const send = async (card?: string): Promise<Msg | undefined> => {
    const said = text.trim();
    if (!said) return undefined;
    setBad('');
    try {
      const m = await call<Msg>('POST', '/me/assistant', { request_key: request, text: said, ...(card ? { card } : {}) });
      put(m); setText(''); setRequest(newKey());
      return m;
    } catch (e) {
      setBad(why(e));
      // 서버가 거절한 요청은 같은 열쇠로 다시 보내지 않아요. 닿지 못한 것만 같은 열쇠로 다시 보내요
      if (e instanceof ApiError && e.status > 0) setRequest(newKey());
      return undefined;
    }
  };
  const act = async (work: () => Promise<Msg | void>) => {
    setBad('');
    try { const m = await work(); if (m) put(m); else await read(); } catch (e) { setBad(why(e)); }
  };
  const write = (words: string) => { setText(words); setRequest(newKey()); };
  return { items, text, write, bad, send, act };
}
export type Talk = ReturnType<typeof useTalk>;

/** 말하는 입력창 */
export function TalkForm({ talk, onSend, label, placeholder }: { talk: Talk; onSend: () => void; label: string; placeholder: string }) {
  const { t } = useTranslation();
  const typed = Boolean(talk.text.trim());
  const submit = (e: FormEvent) => { e.preventDefault(); onSend(); };
  return (
    <form className={`cu-composer${typed ? ' typed' : ''}`} onSubmit={submit}>
      <input value={talk.text} onChange={e => talk.write(e.target.value)} maxLength={2000} placeholder={placeholder} aria-label={label} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation(); }} autoFocus />
      <button type="submit" className={`cu-send${typed ? ' go' : ''}`} aria-label={t('assistant.send')} disabled={!typed}><I.up aria-hidden /></button>
    </form>
  );
}

/** 주고받은 한 번 — 내 말과, 갈래에 따른 비서의 답.
 *  기억해(되돌리기) · 물어봐(답만) · 일 맡겨(눌러야 시작) · 카드(눌러야 그 말이 카드로 가요) */
export function TalkTurn({ m, talk, onNav }: { m: Msg; talk: Talk; onNav: (r: TalkNav) => void }) {
  const { t } = useTranslation();
  const { act } = talk;
  return (
    <div className="talk-turn" data-talk={m.state} data-intent={m.intent ?? undefined}>
      <div className="cu-said">{m.said}</div>
      {m.state === 'thinking' && <div className="cu-work" role="status"><I.chat aria-hidden /><span>{t('assistant.thinking')}</span></div>}
      {m.state === 'failed' && <>
        <div className="cu-work"><I.warning aria-hidden /><span>{t('assistant.failed')}. {t(`assistant.why.${WHY.has(m.error_code ?? '') ? m.error_code : 'other'}`)}</span></div>
        <div className="talk-acts">
          <button type="button" className="cu-btn" onClick={() => void act(() => call<Msg>('POST', `/me/assistant/${m.id}/keep`))}>{t('assistant.keep')}</button>
          {m.error_code === 'signed_out' && <button type="button" className="cu-btn ghost" onClick={() => onNav('connections')}>{t('assistant.connect')}</button>}
        </div>
      </>}
      {m.state === 'done' && m.intent === 'remember' && <>
        <div className="cu-work"><I.brain aria-hidden /><span>{t(m.memory ? 'assistant.remembered' : 'assistant.forgot')}</span></div>
        {m.memory && <p className="cu-reply">{m.reply}</p>}
        {m.memory && <div className="talk-acts">
          <button type="button" className="cu-link" onClick={() => void act(() => call('DELETE', `/me/memories/${encodeURIComponent(m.memory!)}`))}>{t('assistant.undo')}</button>
          <button type="button" className="cu-link" onClick={() => onNav('memory')}>{t('assistant.seeMemory')}</button>
        </div>}
      </>}
      {m.state === 'done' && m.intent === 'task' && <>
        <div className="cu-work"><I.terminal aria-hidden /><span>{t('assistant.proposal')}: {m.repo ?? t('assistant.noRepo')}</span></div>
        <p className="cu-reply task">{m.task}</p>
        <div className="talk-acts">
          {m.session
            ? <><span className="cu-work"><I.check aria-hidden /><span>{t('assistant.started')}</span></span><button type="button" className="cu-link" onClick={() => onNav('sessions')}>{t('assistant.seeSession')}</button></>
            : <button type="button" className="cu-btn primary" onClick={() => void act(() => call<Msg>('POST', `/me/assistant/${m.id}/accept`))}>{t('assistant.start')}</button>}
        </div>
      </>}
      {m.state === 'done' && m.intent === 'card' && <>
        <div className="cu-work"><I.cards aria-hidden /><span>{t('assistant.card')}</span></div>
        <p className="cu-reply task">{m.card_question ?? t('assistant.cardGone')}</p>
        <div className="talk-acts">
          {m.accepted
            ? <><span className="cu-work"><I.check aria-hidden /><span>{t('assistant.cardSaid')}</span></span><button type="button" className="cu-link" onClick={() => onNav('catchup')}>{t('assistant.seeCard')}</button></>
            : <button type="button" className="cu-btn primary" disabled={!m.card_question} onClick={() => void act(async () => { const done = await call<Msg>('POST', `/me/assistant/${m.id}/accept`); onNav('catchup'); return done; })}>{t('assistant.cardSay')}</button>}
        </div>
      </>}
      {m.state === 'done' && (m.intent === 'ask' || m.intent === 'unclear') && <>
        <p className="cu-reply">{m.reply}</p>
        {m.intent === 'unclear' && <div className="talk-acts"><button type="button" className="cu-link" onClick={() => void act(() => call<Msg>('POST', `/me/assistant/${m.id}/keep`))}>{t('assistant.keep')}</button></div>}
      </>}
    </div>
  );
}
