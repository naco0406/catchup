import { useEffect, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, Option } from '../data/types';
import { altOptions, evidenceIcon, turnsOf, type EvidenceIcon } from '../data';
import type { Progress } from '../state/store';
import { I, SourceIcon } from './icons';

/** <DecisionCard> — 질문 한 줄, 요약, 선택지, 고르면 일어나는 일, 다르게 답하기 */
export function DecisionCard({ card, prog, onPick, onSay, onDraft, onSwipe, composerRef }: {
  card: Card; prog?: Progress;
  onPick: (i: number, risky: boolean) => void;
  onSay: (text: string) => void;
  onDraft: (text: string) => void;
  onSwipe?: () => void;
  composerRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const turns = turnsOf(prog);
  const alt = prog?.alt && turns.length ? altOptions(card, t, turns) : null;
  const options = alt?.options ?? card.options;
  const rec = alt?.recommended ?? card.recommended;
  // 카드가 위험하면(운영 데이터 · 돈 · 되돌릴 수 없음) 밀어서 넘길 수 없어요. 위험한 '선택지'만 있으면 그 선택지만 두 번 확인해요.
  const risky = card.due?.tone === 'risk';
  const swipe = useSwipe(risky ? undefined : onSwipe);
  const touch = useTouch();

  return (
    <div className="card-slot">
      {swipe.pull > 0 && <div className="swipe-under" style={{ opacity: Math.min(1, swipe.pull / 110) }} aria-hidden><I.clock /><span>{t('card.snooze')}</span></div>}
      <div className={`cu-card swipe ${swipe.cls}`} style={swipe.style} {...swipe.handlers} data-card={card.id}>
        <div className="cu-from">
          <span className="cu-tile"><SourceIcon source={card.source} /></span>
          <span className="who">{card.who}</span><span className="meta">{card.meta}</span><span className="sp" />
          {card.due && <span className={`cu-due ${card.due.tone === 'wait' ? '' : card.due.tone}`}>{card.due.tone === 'risk' && <I.warning aria-hidden />}{card.due.text}</span>}
        </div>
        <h2 className="cu-ask">{card.question}</h2>

        {alt ? (
          <>
            <div className="cu-work first">{t('card.firstOptions', { n: card.options.length, list: card.options.map(o => o.label).join(' · ') })}</div>
            {alt.exchanges.map((x, i) => {
              const Icon = x.icon === 'calendar' ? I.calendarCheck : x.icon === 'file' ? I.file : I.chat;
              return (
                <div className="turn" key={i}>
                  <div className="cu-said">{x.said}</div>
                  <div className="cu-work"><Icon aria-hidden /><span>{x.work}</span></div>
                  <p className="cu-reply">{x.reply}</p>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {card.effect?.kind === 'command' && <div className="cu-code"><div className="fh"><I.terminal aria-hidden /><span>{t('card.command')}</span></div><div className="ln">{card.effect.cmd}</div></div>}
            {card.summary.length > 0 && (
              <ul className="cu-sum">{card.summary.map((s, i) => <li key={i} className={s.dim ? 'dim' : undefined}>{s.strong && <b>{s.strong}</b>}{s.text}</li>)}</ul>
            )}
            {card.effect?.kind === 'slots' && (
              <div className="cu-slots">{card.effect.slots.map(s => <div key={s.name} className={`cu-slot${s.isNew ? ' new' : ''}`}><span className="tm">{s.time}</span><span className="nm">{s.name}</span><span className="wh">{s.who}</span></div>)}</div>
            )}
            {card.evidence && <div className="cu-ev">{card.evidence.map(e => { const Icon = EV[evidenceIcon(e)]; return <span key={e} className="cu-chip"><Icon aria-hidden />{e}</span>; })}</div>}
          </>
        )}

        <div className="cu-opts" role="group" aria-label={t('card.options')}>
          {options.map((o, i) => <OptionRow key={`${alt ? `a${turns.length}` : 'o'}${i}`} o={o} i={i} rec={i === rec} confirm={prog?.confirm === i} onPick={onPick} />)}
        </div>

        <Preview card={card} n={rec + 1} draft={prog?.draft} onDraft={onDraft} altText={alt?.preview} alt={Boolean(alt)} />
        <Composer onSay={onSay} placeholder={alt ? t('card.more') : t('card.composer')} inputRef={composerRef} />
        {risky && <div className="cu-foot"><I.shield aria-hidden /><span>{t(touch ? 'card.risky' : 'card.riskyNoSwipe')}</span></div>}
      </div>
    </div>
  );
}

const EV: Record<EvidenceIcon, typeof I.file> = { mail: I.mail, pdf: I.pdf, steps: I.listChecks, tests: I.checkCircle, chat: I.chat, image: I.image, money: I.money, warning: I.warning, file: I.file };

/** 터치 화면인가 — 밀기 안내는 터치에서만 말해요 */
function useTouch() {
  const [touch, setTouch] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia('(pointer: coarse)'); const f = () => setTouch(m.matches);
    m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, []);
  return touch;
}

function OptionRow({ o, i, rec, confirm, onPick }: { o: Option; i: number; rec: boolean; confirm: boolean; onPick: (i: number, risky: boolean) => void }) {
  const { t } = useTranslation();
  const risky = Boolean(o.risk && o.risk !== 'low');
  // 위험한 답에는 빨강(추천)을 칠하지 않아요 — 디자인 시스템 규칙 3
  const cls = ['cu-opt', rec && !risky ? 'rec' : '', confirm ? 'confirm' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={e => { onPick(i, risky); if (!risky) e.currentTarget.blur(); }} aria-keyshortcuts={String(i + 1)} data-opt={i}>
      <span className="key">{i + 1}</span>
      <span><span className="l">{o.label}</span><span className="d">{confirm ? <><I.warning aria-hidden />{t('card.confirmHint')}</> : o.detail}</span></span>
      <span className="r">
        {rec && !risky && <><span className="cu-rec">{t('card.suggested')}</span><span className="cu-kbd">↵</span></>}
        {risky && <span className="risk"><I.warning aria-hidden />{t('card.riskWord')}</span>}
      </span>
    </button>
  );
}

function Preview({ card, n, draft, onDraft, altText, alt }: { card: Card; n: number; draft?: string; onDraft: (text: string) => void; altText?: string; alt: boolean }) {
  const { t } = useTranslation();
  const e = card.effect;
  const [editing, setEditing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { const a = area.current; a?.focus(); a?.setSelectionRange(a.value.length, a.value.length); } }, [editing]);
  if (!e) return null;
  if (e.kind === 'reply') {
    // 말로 답한 뒤에는 그 말에 맞춘 초안을 보여 줘요(고치기는 처음 초안에만)
    if (alt) {
      if (!altText) return null;
      const label = e.copy ? t('card.ifPickCopy', { n }) : t('card.ifPick', { n, to: e.to });
      return <div className="cu-prev"><div className="h">{e.copy ? <I.copy aria-hidden /> : <I.send aria-hidden />}<span>{label}</span></div><p>{altText}</p></div>;
    }
    const text = draft ?? e.text;
    const label = e.copy ? t('card.ifPickCopy', { n }) : t('card.ifPick', { n, to: e.to });
    return (
      <div className="cu-prev"><div className="h">{e.copy ? <I.copy aria-hidden /> : <I.send aria-hidden />}<span>{label}{draft !== undefined && !editing ? ` · ${t('card.edited')}` : ''}</span><span className="sp" />
        <button type="button" onClick={() => setEditing(x => !x)} aria-expanded={editing}>{editing ? t('card.editDone') : t('card.edit')}</button></div>
        {editing
          ? <textarea ref={area} defaultValue={text} rows={3} aria-label={label}
              onBlur={ev => { if (ev.target.value.trim() && ev.target.value !== e.text) onDraft(ev.target.value); }}
              onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { (ev.target as HTMLTextAreaElement).blur(); setEditing(false); } }} />
          : <p>{text}</p>}
      </div>
    );
  }
  if (e.kind === 'code' && !alt) {
    return (
      <div className="cu-code"><div className="fh"><I.branch aria-hidden /><span className="lb">{t('card.codeIf', { n })}</span><span className="file">{e.file}</span><span className="sp" />
        <span className="st"><span className="a">+{e.add}</span><span className="m">−{e.del}</span><span>{t('card.files', { count: e.files })}</span></span></div>
        {e.lines.map((l, i) => <div key={i} className={`ln ${l.t === 'ctx' ? '' : l.t}`}>{l.s}</div>)}</div>
    );
  }
  return null;
}

type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
const SpeechRec = (globalThis as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

export function Composer({ onSay, placeholder, inputRef }: { onSay: (text: string) => void; placeholder: string; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  const submit = (e: FormEvent) => { e.preventDefault(); if (!text.trim()) return; rec.current?.stop(); onSay(text); setText(''); (e.currentTarget as HTMLFormElement).querySelector('input')?.blur(); };
  // 음성 — 브라우저의 받아쓰기(Web Speech). 없는 브라우저에서는 단추를 그리지 않아요
  const toggleMic = () => {
    if (!SpeechRec) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechRec();
    r.lang = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    r.interimResults = true;
    r.onresult = ev => setText(Array.from(ev.results).map(x => x[0]?.transcript ?? '').join(''));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  };
  return (
    <form className="cu-composer" onSubmit={submit}>
      <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} placeholder={listening ? t('card.listening') : placeholder} aria-label={placeholder}
        onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
      {SpeechRec && <button type="button" className={`cu-ib${listening ? ' listening' : ''}`} onClick={toggleMic} aria-pressed={listening} aria-label={listening ? t('card.micStop') : t('card.mic')}><I.mic aria-hidden /></button>}
      <button type="submit" className={`cu-send${text.trim() ? ' go' : ''}`} aria-label={t('card.send')} disabled={!text.trim()}><I.up aria-hidden /></button>
    </form>
  );
}

/** 왼쪽으로 밀면 미뤄요(위험한 카드는 밀리지 않아요 — Q7) */
function useSwipe(onSwipe?: () => void): { cls: string; style: React.CSSProperties; pull: number; handlers: Record<string, (e: RPointerEvent) => void> } {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'drag' | 'settle'>('idle');
  if (!onSwipe) return { cls: '', style: {}, pull: 0, handlers: {} };
  const end = () => {
    if (!start.current) return;
    start.current = null;
    if (dx < -110) { setPhase('settle'); setDx(-600); setTimeout(() => { onSwipe(); setDx(0); setPhase('idle'); }, 180); }
    else { setPhase('settle'); setDx(0); setTimeout(() => setPhase('idle'), 200); }
  };
  return {
    cls: phase === 'drag' ? 'dragging' : phase === 'settle' ? 'settle' : '',
    pull: phase === 'idle' ? 0 : -dx,
    style: dx ? { transform: `translateX(${dx}px) rotate(${dx / 60}deg)`, opacity: Math.max(0.3, 1 + dx / 500) } : {},
    handlers: {
      onPointerDown: e => { if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button, input, a')) return; start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; },
      onPointerMove: e => {
        const s = start.current; if (!s) return;
        const x = e.clientX - s.x, y = e.clientY - s.y;
        if (phase !== 'drag') { if (Math.abs(x) < 10 || Math.abs(y) > Math.abs(x)) { if (Math.abs(y) > 12) start.current = null; return; } setPhase('drag'); (e.currentTarget as HTMLElement).setPointerCapture(s.id); }
        setDx(Math.min(0, x));
      },
      onPointerUp: end, onPointerCancel: end,
    },
  };
}
