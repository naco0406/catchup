import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, Option } from '../data/types';
import { altOptions, evidenceIcon, previewable, turnsOf, type EvidenceIcon } from '../data';
import { draftKey, type Progress } from '../state/store';
import { I, SourceIcon } from './icons';

/** <DecisionCard> — 질문 한 줄, 요약, 선택지, 고르면 일어나는 일, 다르게 답하기.
 *  밀기는 덱(useDeck)이 맡아요. 카드는 추천 답이 차오를 자리(fill)와, 미는 동안 보여 줄 글(pulling)만 알아요. */
export function DecisionCard({ card, prog, onPick, onSay, onDraft, composerRef, fill, pulling, preview }: {
  card: Card; prog?: Progress;
  onPick: (i: number, risky: boolean) => void;
  onSay: (text: string) => void;
  onDraft: (key: string, text: string) => void;
  composerRef?: React.RefObject<HTMLInputElement | null>;
  /** 오른쪽으로 밀어 추천대로 정할 수 있는 카드 — 추천 답 줄이 민 만큼 차올라요 */
  fill?: boolean;
  /** 오른쪽으로 미는 중 — 다른 번호의 글을 보고 있었어도 나갈 글을 보여요 */
  pulling?: boolean;
  /** 덱에서 뒤에 깔린 다음 카드 — 보이기만 해요 */
  preview?: boolean;
}) {
  const { t } = useTranslation();
  const turns = turnsOf(prog);
  const alt = prog?.alt && turns.length ? altOptions(card, t, turns) : null;
  const options = alt?.options ?? card.options;
  const rec = alt?.recommended ?? card.recommended;
  // 카드가 위험하면(운영 데이터 · 돈 · 되돌릴 수 없음) 밀어서 정할 수 없어요. 위험한 '선택지'만 있으면 그 선택지만 두 번 확인해요.
  const risky = card.due?.tone === 'risk';
  const touch = useTouch();

  return (
      <div className="cu-card" data-card={preview ? undefined : card.id}>
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
            {card.context?.kind === 'command' && <div className="cu-code"><div className="fh"><I.terminal aria-hidden /><span>{t('card.command')}</span></div><div className="ln">{card.context.cmd}</div></div>}
            {card.summary.length > 0 && (
              <ul className="cu-sum">{card.summary.map((s, i) => <li key={i} className={s.dim ? 'dim' : undefined}>{s.strong && <b>{s.strong}</b>}{s.text}</li>)}</ul>
            )}
            {card.context?.kind === 'slots' && (
              <div className="cu-slots">{card.context.slots.map(s => <div key={s.name} className={`cu-slot${s.isNew ? ' new' : ''}`}><span className="tm">{s.time}</span><span className="nm">{s.name}</span><span className="wh">{s.who}</span></div>)}</div>
            )}
            {card.remembered?.map(text => <div className="cu-work recall" key={text}><I.history aria-hidden /><span>{t('card.recall', { text })}</span></div>)}
            {card.evidence && <div className="cu-ev">{card.evidence.map(e => { const Icon = EV[evidenceIcon(e)]; return <span key={e} className="cu-chip"><Icon aria-hidden />{e}</span>; })}</div>}
          </>
        )}

        <div className="cu-opts" role="group" aria-label={t('card.options')}>
          {options.map((o, i) => <OptionRow key={`${alt ? `a${turns.length}` : 'o'}${i}`} o={o} i={i} rec={i === rec} confirm={prog?.confirm === i} onPick={onPick} fill={fill} />)}
        </div>

        <Previews key={turns.length} options={options} rec={rec} prog={prog} onDraft={onDraft} force={pulling ? rec : undefined} />
        <Composer onSay={onSay} placeholder={alt ? t('card.more') : t('card.composer')} inputRef={composerRef} />
        {risky && <div className="cu-foot"><I.shield aria-hidden /><span>{t(touch ? 'card.risky' : 'card.riskyNoSwipe')}</span></div>}
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

function OptionRow({ o, i, rec, confirm, onPick, fill }: { o: Option; i: number; rec: boolean; confirm: boolean; onPick: (i: number, risky: boolean) => void; fill?: boolean }) {
  const { t } = useTranslation();
  const risky = Boolean(o.risk && o.risk !== 'low');
  // 위험한 답에는 빨강(추천)을 칠하지 않아요 — 디자인 시스템 규칙 3
  const cls = ['cu-opt', rec && !risky ? 'rec' : '', confirm ? 'confirm' : ''].filter(Boolean).join(' ');
  const button = (
    <button type="button" className={cls} onClick={e => { onPick(i, risky); if (!risky) e.currentTarget.blur(); }} aria-keyshortcuts={String(i + 1)} data-opt={i}>
      <span className="key">{i + 1}</span>
      <span><span className="l">{o.label}</span><span className="d">{confirm ? <><I.warning aria-hidden />{t('card.confirmHint')}</> : o.detail}</span></span>
      <span className="r">
        {rec && !risky && <><span className="cu-rec">{t('card.suggested')}</span><span className="cu-kbd">↵</span></>}
        {risky && <span className="risk"><I.warning aria-hidden />{t('card.riskWord')}</span>}
      </span>
    </button>
  );
  if (!fill || !rec || risky) return button;
  // 고른 뒤의 모양을 겹쳐 두고, 민 만큼(--f)만 보여 줘요. 글자색도 그 경계에서 바뀌어요
  return (
    <div className="cu-fill">
      {button}
      <div className="cu-opt picked" aria-hidden>
        {/* 글은 CSS 로 그려요(data-t) — 같은 글이 문서에 두 번 들어가면 찾기 · 긁기 · 화면 읽기가 헷갈려요 */}
        <span className="key"><span className="num" data-t={i + 1} /><I.check className="ck" /></span>
        <span><span className="l" data-t={o.label} /><span className="d" data-t={o.detail} /></span>
        <span className="r" />
      </div>
    </div>
  );
}

/** 고르면 일어나는 일 — 추천 것을 먼저 보여 주고, 다른 번호의 글도 고르기 전에 볼 수 있어요. 확인을 기다리는 답이 있으면 그 글이 보여요 */
function Previews({ options, rec, prog, onDraft, force }: { options: Option[]; rec: number; /** 오른쪽으로 미는 동안에는 나갈 글을 보여요 */ force?: number; prog?: Progress; onDraft: (key: string, text: string) => void }) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<number>();
  useEffect(() => { if (prog?.confirm !== undefined) setChosen(prog.confirm); }, [prog?.confirm]);
  const shows = options.flatMap((o, i) => (previewable(o.effect) ? [i] : []));
  if (!shows.length) return null;
  const at = (force !== undefined && shows.includes(force) ? force : chosen) ?? (shows.includes(rec) ? rec : shows[0]!);
  const key = draftKey(prog, at);
  const tabs = shows.length > 1 && (
    <span className="cu-seg pv-tabs" role="group" aria-label={t('card.previews')}>
      {shows.map(i => <button key={i} type="button" className={i === at ? 'on' : ''} aria-pressed={i === at} aria-label={t('card.previewOf', { n: i + 1 })} onClick={() => setChosen(i)}>{i + 1}</button>)}
    </span>
  );
  return <Preview key={key} o={options[at]!} n={at + 1} draft={prog?.drafts?.[key]} onDraft={text => onDraft(key, text)} tabs={tabs} />;
}

function Preview({ o, n, draft, onDraft, tabs }: { o: Option; n: number; draft?: string; onDraft: (text: string) => void; tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const e = o.effect;
  const [editing, setEditing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { const a = area.current; a?.focus(); a?.setSelectionRange(a.value.length, a.value.length); } }, [editing]);
  if (e.kind === 'tell' && e.code) {
    const c = e.code;
    return (
      <div className="cu-code"><div className="fh"><I.branch aria-hidden /><span className="lb">{t('card.codeIf', { n })}</span><span className="file">{c.file}</span><span className="sp" />
        <span className="st"><span className="a">+{c.add}</span><span className="m">−{c.del}</span><span>{t('card.files', { count: c.files })}</span></span></div>
        {c.lines.map((l, i) => <div key={i} className={`ln ${l.t === 'ctx' ? '' : l.t}`}>{l.s}</div>)}</div>
    );
  }
  // 글이 없는 답(바꾸기 · 기록만)을 확인하는 중이면 다른 답의 글을 보여 주지 않아요
  if (!('text' in e) || !e.text) return null;
  const text = draft ?? e.text;
  const label = e.kind === 'copy' ? t('card.ifPickCopy', { n }) : t(e.kind === 'tell' ? 'card.ifPickTell' : 'card.ifPick', { n, to: e.to });
  return (
    <div className="cu-prev"><div className="h">{e.kind === 'copy' ? <I.copy aria-hidden /> : <I.send aria-hidden />}<span>{label}{draft !== undefined && !editing ? ` · ${t('card.edited')}` : ''}</span><span className="sp" />
      <button type="button" onClick={() => setEditing(x => !x)} aria-expanded={editing}>{editing ? t('card.editDone') : t('card.edit')}</button></div>
      {editing
        ? <textarea ref={area} defaultValue={text} rows={3} aria-label={label}
            onBlur={ev => { if (ev.target.value.trim() && ev.target.value !== text) onDraft(ev.target.value); }}
            onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { (ev.target as HTMLTextAreaElement).blur(); setEditing(false); } }} />
        : <p>{text}</p>}
      {tabs}
    </div>
  );
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
