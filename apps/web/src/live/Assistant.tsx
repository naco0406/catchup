import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { I } from '../components/icons';
import { Top } from '../screens/Pages';
import type { components } from './api.gen';
import { ApiError, call, newKey } from './api';

type Msg = components['schemas']['Message'];
const WHY = new Set(['signed_out', 'limit_reached', 'still_thinking', 'card_not_open']);

/** 비서에게 말하기(3.6단계) — 명령이 들어오는 셋째 길이에요.
 *  말은 네 갈래로만 받아요: 기억해(내 말 그대로 남겨요) · 물어봐(답만 해요) · 일 맡겨(제안까지만, 눌러야 시작해요) ·
 *  카드(그 카드를 찾아 주고, 눌러야 내 말이 그 카드의 '말로 답하기'로 가요).
 *  보내기 · 결제처럼 밖으로 나가는 일은 여기서 하지 않고 카드로 여쭤봐요. */
export function Assistant({ onMenu, onNav }: { onMenu: () => void; onNav: (r: 'memory' | 'sessions' | 'connections' | 'catchup') => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Msg[]>();
  const [text, setText] = useState('');
  const [request, setRequest] = useState(newKey);
  const [bad, setBad] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const why = useCallback((e: unknown) => t(e instanceof ApiError && e.status === 0 ? 'live.offline' : `assistant.why.${e instanceof ApiError && WHY.has(e.code) ? e.code : 'other'}`), [t]);
  const read = useCallback(async () => {
    try { setItems(await call<Msg[]>('GET', '/me/assistant')); } catch (e) { setBad(why(e)); }
  }, [why]);
  useEffect(() => { void read(); }, [read]);
  // 답은 뒤따라와요 — 생각 중인 말이 있는 동안만 다시 읽어요
  const thinking = Boolean(items?.some(m => m.state === 'thinking'));
  useEffect(() => { if (!thinking) return; const id = setInterval(() => void read(), 1000); return () => clearInterval(id); }, [thinking, read]);
  const last = items?.at(-1);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [items?.length, last?.state]);

  const put = (m: Msg) => setItems(list => [...(list ?? []).filter(x => x.id !== m.id), m].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  const send = async (words: string) => {
    const said = words.trim();
    if (!said) return;
    setBad('');
    try { put(await call<Msg>('POST', '/me/assistant', { request_key: request, text: said })); setText(''); setRequest(newKey()); }
    catch (e) { setBad(why(e)); if (e instanceof ApiError && e.status > 0) setRequest(newKey()); }
  };
  const act = async (work: () => Promise<Msg | void>) => {
    setBad('');
    try { const m = await work(); if (m) put(m); else await read(); } catch (e) { setBad(why(e)); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(text); };
  const examples = t('assistant.examples', { returnObjects: true }) as string[];

  return (
    <>
      <Top page title={t('nav.assistant')} onMenu={onMenu} />
      <div className="cu-page talk"><div className="cu-page-in">
        {items?.length === 0 && (
          <div className="talk-empty">
            <p className="cu-sub">{t('assistant.empty')}</p>
            <div className="talk-examples">{examples.map(x => <button type="button" key={x} className="cu-chip line" onClick={() => setText(x)}>{x}</button>)}</div>
          </div>
        )}
        {items?.map(m => (
          <div className="talk-turn" key={m.id} data-talk={m.state} data-intent={m.intent ?? undefined}>
            <div className="cu-said">{m.said}</div>
            {m.state === 'thinking' && <div className="cu-work" role="status"><I.chat aria-hidden /><span>{t('assistant.thinking')}</span></div>}
            {m.state === 'failed' && <>
              <div className="cu-work"><I.warning aria-hidden /><span>{t('assistant.failed')} · {t(`assistant.why.${WHY.has(m.error_code ?? '') ? m.error_code : 'other'}`)}</span></div>
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
              <div className="cu-work"><I.terminal aria-hidden /><span>{t('assistant.proposal')} · {m.repo ?? t('assistant.noRepo')}</span></div>
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
        ))}
        <div ref={end} />
      </div></div>
      <div className="talk-dock"><div className="cu-page-in">
        {bad && <p className="cu-fail" role="alert">{bad}</p>}
        <form className={`cu-composer${text.trim() ? ' typed' : ''}`} onSubmit={submit}>
          <input value={text} onChange={e => { setText(e.target.value); setRequest(newKey()); }} maxLength={2000} placeholder={t('assistant.ph')} aria-label={t('nav.assistant')} onKeyDown={e => e.stopPropagation()} autoFocus />
          <button type="submit" className={`cu-send${text.trim() ? ' go' : ''}`} aria-label={t('assistant.send')} disabled={!text.trim()}><I.up aria-hidden /></button>
        </form>
        <div className="cu-foot"><I.shield aria-hidden /><span>{t('assistant.promise')}</span></div>
      </div></div>
    </>
  );
}
