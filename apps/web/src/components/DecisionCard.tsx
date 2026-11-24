import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card, Option, Slot } from '../data/types';
import { altOptions, reviewable, turnsOf } from '../data';
import { draftKey, type Progress } from '../state/store';
import { I, SourceIcon } from './icons';
import { CodeReview, DayStrip } from './Review';

/** 답을 어떻게 눌렀는지 — held: 위험한 답을 꾹 눌러 다 채우고 놓았어요. hint: 짧게 눌러서 안내만 띄워요. 없으면 키보드나 화면 읽기 프로그램이에요 */
export type PickHow = 'held' | 'hint';

/** <DecisionCard> — 질문 한 줄, 요약, 선택지, 고르면 일어나는 일, 다르게 답하기.
 *  밀기는 덱(useDeck)이 맡아요. 카드는 추천 답이 차오를 자리(fill)와, 미는 동안 보여 줄 글(pulling)만 알아요. */
export function DecisionCard({ card, prog, onPick, onSay, onDraft, composerRef, fill, pulling, preview }: {
  card: Card; prog?: Progress;
  onPick: (i: number, how?: PickHow) => void;
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
            <div className="cu-work first">{t('card.firstOptions', { n: card.options.length, list: card.options.map(o => o.label).join(', ') })}</div>
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
            {card.context?.kind === 'slots' && timed(card.context.slots) && <DayStrip slots={card.context.slots} />}
            {card.context?.kind === 'slots' && !timed(card.context.slots) && (
              <div className="cu-slots">{card.context.slots.map(s => <div key={s.name} className={`cu-slot${s.isNew ? ' new' : ''}`}><span className="tm">{s.time}</span><span className="nm">{s.name}</span><span className="wh">{s.who}</span></div>)}</div>
            )}
            {card.remembered?.map(text => <div className="cu-work recall" key={text}><I.history aria-hidden /><span>{t('card.recall', { text })}</span></div>)}
            {card.evidence && card.evidence.length > 0 && <div className="cu-evline"><I.clip aria-hidden /><span>{card.evidence.join(', ')}</span></div>}
          </>
        )}

        <div className="cu-opts" role="group" aria-label={t('card.options')}>
          {options.map((o, i) => <OptionRow key={`${alt ? `a${turns.length}` : 'o'}${i}`} o={o} i={i} rec={i === rec} confirm={prog?.confirm === i} onPick={onPick} fill={fill} />)}
        </div>

        <Previews key={turns.length} options={options} rec={rec} prog={prog} onDraft={onDraft} force={pulling ? rec : undefined} slots={card.context?.kind === 'slots' && timed(card.context.slots) ? card.context.slots : undefined} />
        <Composer onSay={onSay} placeholder={alt ? t('card.more') : t('card.composer')} inputRef={composerRef} />
      </div>
  );
}

/** 위험한 답을 꾹 누르는 시간. 누르자마자가 아니라 조금 뒤(PRESS_WAIT)부터 차올라요 — 읽으려고 스크롤하는 손가락에는 반응하지 않게요 */
const PRESS_MS = 1000, PRESS_WAIT = 120, PRESS_SLOP = 10;
type Press = 'idle' | 'holding' | 'full';

/** 꾹 눌러 확인하기 — 다 찬 뒤에 놓으면 run, 그 전에 떼거나 줄 밖으로 나가면 취소예요.
 *  키를 누르고 있어야만 되는 조작은 만들지 않아요(WCAG 2.1.1): 키보드와 화면 읽기 프로그램은 두 번 누르기로 가요. */
function usePress({ run, hint, twice }: { run: () => void; hint: () => void; twice: () => void }) {
  const [press, setPress] = useState<Press>('idle');
  const at = useRef<{ id: number; x: number; y: number; wait: number; done: number; full: boolean } | null>(null);
  const touched = useRef(false), held = useRef(false);
  const clear = () => { const s = at.current; if (s) { clearTimeout(s.wait); clearTimeout(s.done); } at.current = null; };
  const stop = () => { if (!at.current) return; clear(); setPress('idle'); };
  useEffect(() => clear, []);
  const handlers: ButtonHTMLAttributes<HTMLButtonElement> = {
    onPointerDown: e => {
      if (!e.isPrimary || e.button !== 0) return;
      clear(); touched.current = true; held.current = false;
      const s = { id: e.pointerId, x: e.clientX, y: e.clientY, full: false,
        wait: window.setTimeout(() => { setPress('holding'); hint(); }, PRESS_WAIT),
        done: window.setTimeout(() => { s.full = true; setPress('full'); try { navigator.vibrate?.(10); } catch { /* 진동이 없는 기기 */ } }, PRESS_MS) };
      at.current = s;
    },
    onPointerMove: e => { const s = at.current; if (s && s.id === e.pointerId && Math.hypot(e.clientX - s.x, e.clientY - s.y) > PRESS_SLOP) stop(); },
    onPointerUp: e => {
      const s = at.current; if (!s || s.id !== e.pointerId) return;
      const full = s.full; stop();
      if (full) { held.current = true; run(); }
    },
    onPointerLeave: stop, onPointerCancel: stop, onLostPointerCapture: stop,
    onContextMenu: e => e.preventDefault(), // 길게 누를 때 뜨는 메뉴
    onClick: e => {
      const byPointer = touched.current && e.detail !== 0; touched.current = false;
      if (held.current) { held.current = false; return; } // 방금 꾹 눌러서 실행했어요
      if (byPointer) hint(); else twice();
    },
  };
  return { press, handlers };
}

function OptionRow({ o, i, rec, confirm, onPick, fill }: { o: Option; i: number; rec: boolean; confirm: boolean; onPick: (i: number, how?: PickHow) => void; fill?: boolean }) {
  const { t } = useTranslation();
  const risky = Boolean(o.risk && o.risk !== 'low');
  const [tapped, setTapped] = useState(false); // 손가락이나 마우스로 눌러 본 줄 — 안내가 '꾹 누르기'로 바뀌어요
  const { press, handlers } = usePress({
    run: () => onPick(i, 'held'),
    hint: () => { setTapped(true); onPick(i, 'hint'); },
    twice: () => { setTapped(false); onPick(i); },
  });
  // 위험한 답에는 빨강(추천)을 칠하지 않아요 — 디자인 시스템 규칙 3
  const cls = ['cu-opt', rec && !risky ? 'rec' : '', confirm ? 'confirm' : ''].filter(Boolean).join(' ');
  const hint = press === 'full' ? t('card.holdFull') : press === 'holding' ? t('card.holding') : t(tapped ? 'card.holdHint' : 'card.confirmHint');
  const button = (
    <button type="button" className={cls} aria-keyshortcuts={rec && !risky ? `${i + 1} Enter` : String(i + 1)} data-opt={i}
      {...(risky ? handlers : { onClick: e => { onPick(i); e.currentTarget.blur(); } })}>
      <span className="key">{i + 1}</span>
      <span className="l">{o.label}</span>
      <span className="d">{confirm || press !== 'idle' ? <><I.warning aria-hidden />{hint}</> : o.detail}</span>
      <span className="r">
        {rec && !risky && <span className="cu-rec">{t('card.suggested')}</span>}
        {risky && <span className="risk"><I.warning aria-hidden />{t('card.riskWord')}</span>}
      </span>
    </button>
  );
  // 꾹 누르는 동안 잉크색이 왼쪽에서 차올라요. 빨강은 추천에만 써요
  if (risky) return (
    <div className="cu-fill hold" data-press={press === 'idle' ? undefined : press} style={{ '--press-ms': `${PRESS_MS - PRESS_WAIT}ms` } as CSSProperties}>
      {button}
      <div className="cu-opt held" aria-hidden>
        <span className="key"><span className="num" data-t={i + 1} /><I.check className="ck" /></span>
        <span className="l" data-t={o.label} /><span className="d" data-t={hint} />
        <span className="r" />
      </div>
    </div>
  );
  if (!fill || !rec) return button;
  // 고른 뒤의 모양을 겹쳐 두고, 민 만큼(--f)만 보여 줘요. 글자색도 그 경계에서 바뀌어요
  return (
    <div className="cu-fill">
      {button}
      <div className="cu-opt picked" aria-hidden>
        {/* 글은 CSS 로 그려요(data-t) — 같은 글이 문서에 두 번 들어가면 찾기 · 긁기 · 화면 읽기가 헷갈려요 */}
        <span className="key"><span className="num" data-t={i + 1} /><I.check className="ck" /></span>
        <span className="l" data-t={o.label} /><span className="d" data-t={o.detail} />
        <span className="r" />
      </div>
    </div>
  );
}

/** 고르면 일어나는 일 — 추천 것을 먼저 보여 주고, 다른 번호의 글도 고르기 전에 볼 수 있어요. 확인을 기다리는 답이 있으면 그 글이 보여요 */
/** 일정에 시각(분)이 다 있으면 달력 조각으로 그려요 */
const timed = (slots: Slot[]) => slots.length > 0 && slots.every(s => s.from !== undefined && s.to !== undefined);

function Previews({ options, rec, prog, onDraft, force, slots }: { options: Option[]; rec: number; /** 오른쪽으로 미는 동안에는 나갈 글을 보여요 */ force?: number; prog?: Progress; onDraft: (key: string, text: string) => void; slots?: Slot[] }) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<number>();
  useEffect(() => { if (prog?.confirm !== undefined) setChosen(prog.confirm); }, [prog?.confirm]);
  const shows = options.flatMap((o, i) => (reviewable(o) && (o.effect.kind !== 'change' && o.effect.kind !== 'none' || slots) ? [i] : []));
  if (!shows.length) return null;
  const at = (force !== undefined && shows.includes(force) ? force : chosen) ?? (shows.includes(rec) ? rec : shows[0]!);
  const key = draftKey(prog, at);
  const tabs = shows.length > 1 && (
    <span className="cu-seg pv-tabs" role="group" aria-label={t('card.previews')}>
      {shows.map(i => <button key={i} type="button" className={i === at ? 'on' : ''} aria-pressed={i === at} aria-label={t('card.previewOf', { n: i + 1 })} onClick={() => setChosen(i)}>{i + 1}</button>)}
    </span>
  );
  return <Preview key={key} o={options[at]!} draft={prog?.drafts?.[key]} onDraft={text => onDraft(key, text)} tabs={tabs} slots={slots} />;
}

function Preview({ o, draft, onDraft, tabs, slots }: { o: Option; draft?: string; onDraft: (text: string) => void; tabs: React.ReactNode; slots?: Slot[] }) {
  const { t } = useTranslation();
  const e = o.effect;
  const [editing, setEditing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { const a = area.current; a?.focus(); a?.setSelectionRange(a.value.length, a.value.length); } }, [editing]);
  // 코드 변경은 파일마다 접고 펼치는 diff, 번호 탭은 그 아래에 둬요(다른 답의 글로 돌아갈 수 있게)
  if (e.kind === 'tell' && e.code) return <><CodeReview c={e.code} />{tabs && <div className="pv-under">{tabs}</div>}</>;
  // 일정이 바뀌는 답은 고른 뒤의 달력 조각을 보여 줘요. 보낼 글이 있으면 그 아래에 이어요
  const day = o.day && slots ? <DayStrip slots={slots} change={o.day} /> : null;
  if (day && !('text' in e && e.text)) {
    return <div className="cu-prev day"><div className="h"><I.calendar aria-hidden /><span>{t('card.ifPickDay')}</span><span className="sp" /></div>{day}{tabs}</div>;
  }
  // 글이 없는 답(바꾸기 · 기록만)을 확인하는 중이면 다른 답의 글을 보여 주지 않아요
  if (!('text' in e) || !e.text) return null;
  const text = draft ?? e.text;
  const label = e.kind === 'copy' ? t('card.ifPickCopy') : t(e.kind === 'tell' ? 'card.ifPickTell' : 'card.ifPick', { to: e.to });
  return (
    <div className="cu-prev"><div className="h">{e.kind === 'copy' ? <I.copy aria-hidden /> : <I.send aria-hidden />}<span>{label}{draft !== undefined && !editing ? `, ${t('card.edited')}` : ''}</span><span className="sp" />
      <button type="button" onClick={() => setEditing(x => !x)} aria-expanded={editing}>{editing ? t('card.editDone') : t('card.edit')}</button></div>
      {editing
        ? <textarea ref={area} defaultValue={text} rows={3} aria-label={label}
            onBlur={ev => { if (ev.target.value.trim() && ev.target.value !== text) onDraft(ev.target.value); }}
            onKeyDown={ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { (ev.target as HTMLTextAreaElement).blur(); setEditing(false); } }} />
        : <p>{text}</p>}
      {day}
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
