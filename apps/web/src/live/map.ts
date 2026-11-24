// 서버의 카드 · 처리 기록 → 화면 부품이 읽는 모양. 화면은 그리기만 해요(design.md 3장).
import type { TFunction } from 'i18next';
import type { Card, Context, Dataset, Option, Source } from '../data/types';
import { HOLD_MS, initial, type Entry, type Pending, type Progress, type State } from '../state/store';
import type { ApiActivity, ApiCard, ApiOption, ApiSession } from './api';

const SOURCES: Source[] = ['gmail', 'calendar', 'slack', 'kakao', 'github', 'claude', 'codex', 'local'];

export interface Snapshot { open: ApiCard[]; snoozed: ApiCard[]; activity: ApiActivity[]; sessions: ApiSession[]; /** 받은 때(이 기기 시계) */ at: number }
/** 이 기기에서만 아는 것 */
export interface Device {
  confirm: Record<string, number>;
  drafts: Record<string, Record<string, string>>;
  front: string[];
  /** 보내는 중인 카드 — 서버가 답하기 전에 덱에서 먼저 빠져요 */
  leaving: ReadonlySet<string>;
}
/** 카드 판이 바뀌면 고친 초안 · 확인은 버려요 */
export const localKey = (c: ApiCard) => `${c.id}:${c.version}`;

function sourceOf(raw: unknown): { type: Source; who: string; meta: string } {
  const r = (raw ?? {}) as { type?: string; from?: string; org?: string };
  const type = SOURCES.includes(r.type as Source) ? (r.type as Source) : 'local';
  return { type, who: r.from ?? r.type ?? '', meta: r.org ?? '' };
}

export const toOption = (o: ApiOption): Option => ({
  label: o.label, detail: o.detail ?? '', done: o.done, effect: o.effect as Option['effect'],
  ...(o.risk && o.risk !== 'low' ? { risk: o.risk } : {}),
});

function dueOf(c: ApiCard, t: TFunction, lang: string, now: number): Card['due'] {
  const given = (c.body as { due?: string }).due;
  if (c.risk !== 'low') return { text: given ?? t('live.risky'), tone: 'risk' };
  if (c.waiting) return { text: given ?? t('live.waiting'), tone: 'wait' };
  if (!c.due_at) return undefined;
  const due = new Date(c.due_at);
  const today = due.toDateString() === new Date(now).toDateString();
  const text = given ?? due.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', today ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' });
  return { text, tone: today || due.getTime() < now ? 'wait' : 'calm' };
}

export function toCard(c: ApiCard, t: TFunction, lang: string, now: number): Card {
  const src = sourceOf(c.source);
  const body = c.body as { summary?: ({ text: string; strong?: string; dim?: boolean } | string)[]; evidence?: ({ label: string } | string)[]; context?: Context; notice?: string };
  const summary = (body.summary ?? []).map(x => (typeof x === 'string' ? { text: x } : x));
  if (body.notice === 'source_changed') summary.unshift({ text: t('live.changed') });
  const last = c.turns.at(-1);
  return {
    id: c.id, source: src.type, who: src.who, meta: src.meta, question: c.question, summary,
    due: dueOf(c, t, lang, now), context: body.context,
    evidence: body.evidence?.map(x => (typeof x === 'string' ? x : x.label)),
    options: c.options.map(toOption), recommended: c.recommended,
    remembered: c.remembered?.map(m => m.text),
    talk: last && {
      options: (last.options ?? c.options).map(toOption),
      recommended: last.options ? last.recommended : c.recommended,
      exchanges: c.turns.map(x => ({ said: x.said, work: x.work ?? t('generic.work'), reply: x.reply ?? t('generic.reply'), icon: 'chat' as const })),
    },
  };
}

const STATUS: Record<string, string> = { waiting: 'live.running', running: 'live.running', reverting: 'live.reverting', failed: 'live.failed', unknown: 'live.unknown', stale: 'live.stale' };

export function build(snap: Snapshot, device: Device, t: TFunction, lang: string): { s: State; ds: Dataset; cards: Map<string, Card> } {
  const cards = new Map<string, Card>();
  const progress: Record<string, Progress> = {};
  const day = new Date(snap.at).toDateString();
  const today = (iso: string) => new Date(iso).toDateString() === day;

  const deciding = snap.open.filter(c => c.kind !== 'fyi');
  for (const [list, state] of [[deciding, 'open'], [snap.snoozed, 'snoozed']] as const) {
    for (const c of list) {
      cards.set(c.id, toCard(c, t, lang, snap.at));
      const said = c.turns.map(x => x.said);
      const key = localKey(c);
      progress[c.id] = {
        state: device.leaving.has(c.id) ? 'answered' : state,
        confirm: device.confirm[key], drafts: device.drafts[key],
        ...(said.length ? { turns: said, said: said.at(-1), alt: true } : {}),
      };
    }
  }

  const pending: Pending[] = [];
  const log: Entry[] = [];
  const done: string[] = [];
  const seen = new Set<string>(); // 카드마다 가장 최근 줄만 되돌릴 수 있어요
  for (const a of snap.activity) {
    const latest = !seen.has(a.card);
    seen.add(a.card);
    const src = sourceOf(a.source);
    const option = a.chosen ? toOption(a.chosen) : undefined;
    if (latest && !cards.has(a.card)) {
      cards.set(a.card, { id: a.card, source: src.type, who: src.who, meta: src.meta, question: a.question, summary: [], options: option ? [option] : [], recommended: 0 });
      // 읽은 소식은 결정이 아니라서 캐치업 덱의 '끝낸 카드'에 넣지 않아요. 되돌려 다시 열린 소식에는 상태를 달지 않아요
      if (a.kind === 'read') { if (a.card_state === 'read') progress[a.card] = { state: 'read' }; }
      else {
        progress[a.card] = { state: a.card_state === 'handed_off' ? 'handed_off' : a.card_state === 'snoozed' ? 'snoozed' : 'answered' };
        if (today(a.created_at)) done.push(a.card);
      }
    }
    const at = new Date(a.created_at).getTime();
    if (a.kind !== 'option' || !option) {
      const kind = a.kind === 'snooze' ? 'snoozed' : a.kind === 'read' ? 'read' : 'handoff';
      const still = a.card_state === (kind === 'snoozed' ? 'snoozed' : kind === 'read' ? 'read' : 'handed_off');
      if (today(a.created_at)) log.push({ id: a.id, cardId: a.card, kind, at, undone: !still || !latest });
      continue;
    }
    const state = a.receipt_state ?? '';
    if (state === 'cancelled') continue;
    const status = STATUS[state];
    const line = {
      title: status ? a.question : option.done, source: src.type,
      sub: [t('log.byMe'), status && t(status), a.turn_seq > 0 ? t('log.inWords') : null, a.edited ? t('log.edited') : null].filter(Boolean).join(', '),
    };
    const waits = state === 'waiting' && (a.remaining_ms ?? 0) > 0;
    const justCopied = state === 'succeeded' && option.effect.kind === 'copy' && latest && a.card_state === 'answered' && snap.at - at < HOLD_MS;
    if (waits || justCopied) {
      const since = waits ? snap.at + (a.remaining_ms ?? 0) - HOLD_MS : Math.min(at, snap.at);
      pending.push({ cardId: a.card, pick: 0, alt: false, at: since, edited: a.edited, receipt: a.receipt ?? undefined,
        line: { ...line, title: option.done, sub: [t('log.pending'), a.edited ? t('log.edited') : null].filter(Boolean).join(', ') } });
      continue;
    }
    if (today(a.created_at)) {
      log.push({ id: a.id, cardId: a.card, kind: 'decided', pick: 0, at, edited: a.edited, receipt: a.receipt ?? undefined, line,
        undone: state === 'reverted', undoable: latest && state === 'succeeded' && Boolean(a.undoable) });
    }
  }
  pending.sort((a, b) => a.at - b.at);

  const ids = deciding.map(c => c.id);
  const front = device.front.filter(id => ids.includes(id));
  const decided = log.filter(e => e.kind === 'decided').map(e => e.at).concat(pending.map(p => p.at));
  const sources = new Map<Source, number>();
  for (const c of snap.open) { const type = sourceOf(c.source).type; sources.set(type, (sources.get(type) ?? 0) + 1); }

  const s: State = {
    ...initial([]), started: true, moreAdded: true, routines: {}, progress, pending, log,
    deck: [...new Set([...done.reverse(), ...front, ...ids, ...snap.snoozed.map(c => c.id)])],
    firstPickAt: decided.length ? Math.min(...decided) : undefined,
    lastPickAt: decided.length ? Math.max(...decided) : undefined,
  };
  const ds: Dataset = {
    cards: [...cards.values()], today: [],
    runs: snap.sessions.filter(x => !['done', 'failed', 'cancelled'].includes(x.state))
      .map(x => ({ id: x.id, title: x.title, agent: 'Codex', status: t(`sessions.state.${x.state}`), waiting: x.state === 'waiting' || x.state === 'blocked' })),
    routines: [], autoDone: [],
    fyi: snap.open.filter(c => c.kind === 'fyi' && !device.leaving.has(c.id)).map(c => { const x = sourceOf(c.source); return { id: c.id, source: x.type, title: c.question, sub: [x.who, x.meta].filter(Boolean).join(', ') }; }),
    sources: [...sources].map(([source, count]) => ({ source, name: t(`src.${source}`), count })),
  };
  return { s, ds, cards };
}

export { snoozeUntil } from '../snooze';
