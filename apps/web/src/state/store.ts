// 프로토타입의 상태 — 순수 함수(reduce)라서 화면 없이 시험할 수 있어요. 서버가 생기면 같은 동작을 API 가 맡아요(design.md 12장).
import type { Source } from '../data/types';

/** read: 알려만 드려요를 읽음으로 넘긴 것(결정 카드에는 없어요) */
export type CardState = 'open' | 'answered' | 'snoozed' | 'handed_off' | 'read';
export interface Progress { state: CardState; pick?: number; alt?: boolean; said?: string; confirm?: number; /** 고친 초안 — 선택지마다(draftKey) */ drafts?: Record<string, string>; /** 말로 답한 차례(앞의 말도 남겨요) */ turns?: string[] }
/** 서버가 준 기록 한 줄(실제 모드) */
export interface Line { title: string; sub: string; source: Source }
export type EntryKind = 'decided' | 'snoozed' | 'handoff' | 'read';
export interface Entry { id: string; cardId: string; kind: EntryKind; pick?: number; alt?: boolean; at: number; undone?: boolean; edited?: boolean; /** 실행한 뒤에도 되돌릴 수 있는 답 */ undoable?: boolean; receipt?: string; line?: Line }
export interface Pending { cardId: string; pick: number; alt: boolean; at: number; edited?: boolean; undoable?: boolean; receipt?: string; line?: Line }

export interface State {
  started: boolean;
  deck: string[];
  progress: Record<string, Progress>;
  /** 10초를 기다리는 답들 — 저마다 제 시간이 있어요. 맨 뒤가 가장 최근 */
  pending: Pending[];
  log: Entry[];
  routines: Record<string, boolean>;
  connected: Record<string, boolean>;
  firstPickAt?: number;
  lastPickAt?: number;
  moreAdded: boolean;
  autoUndone: string[];
  /** 비서에게 직접 알려 준 것(예시 모드의 기억) */
  notes?: { id: string; text: string; at: number }[];
  /** 지운 기억 · 고친 기억 — key 는 서버와 같은 모양(answer: · draft: · said: · note:) */
  forgotten?: string[];
  fixed?: Record<string, string>;
}

export type Action =
  | { type: 'start' }
  | { type: 'connect'; id: string }
  | { type: 'pick'; cardId: string; pick: number; risky: boolean; undoable?: boolean; now: number }
  | { type: 'commit'; now: number }
  | { type: 'undo'; cardId?: string }
  | { type: 'say'; cardId: string; text: string }
  | { type: 'draft'; cardId: string; key: string; text: string }
  | { type: 'focus'; cardId: string }
  | { type: 'snooze'; cardId: string; now: number }
  | { type: 'unsnooze'; cardId: string }
  | { type: 'handoff'; cardId: string; now: number }
  | { type: 'more'; ids: string[] }
  | { type: 'promote'; fyiId: string }
  | { type: 'read'; fyiId: string; now: number }
  | { type: 'unread'; fyiId: string }
  | { type: 'undoEntry'; entryId: string }
  | { type: 'undoAuto'; id: string }
  | { type: 'routine'; id: string }
  | { type: 'tell'; text: string; now: number }
  | { type: 'forget'; key: string }
  | { type: 'fix'; key: string; text: string }
  | { type: 'reset'; today: string[] };

/** 밖으로 나가는 일을 기다리는 시간 */
export const HOLD_MS = 10_000;

export function initial(today: string[]): State {
  return { started: false, deck: [...today], progress: {}, pending: [], log: [], routines: { r1: true, r2: true, r3: true, r4: true },
    connected: { gmail: true, calendar: true }, moreAdded: false, autoUndone: [] };
}

export const stateOf = (s: State, id: string): CardState => s.progress[id]?.state ?? 'open';
export const openIds = (s: State) => s.deck.filter(id => stateOf(s, id) === 'open');
export const snoozedIds = (s: State) => s.deck.filter(id => stateOf(s, id) === 'snoozed');

/** 처리 기록의 한 줄을 되돌릴 수 있나 — 그 뒤로 카드가 바뀌었으면(미뤘다가 다시 꺼내 답했다면) 안 돼요 */
export function canUndo(s: State, e: Entry): boolean {
  if (e.undone || (e.kind === 'decided' && !e.undoable)) return false;
  const expect: CardState = e.kind === 'decided' ? 'answered' : e.kind === 'snoozed' ? 'snoozed' : e.kind === 'read' ? 'read' : 'handed_off';
  return stateOf(s, e.cardId) === expect;
}

let seq = 0;
const nid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 초안의 열쇠 — 말을 주고받으면 선택지가 바뀌어서 차례 수를 같이 써요 */
export const draftKey = (p: Progress | undefined, pick: number) => `${p?.turns?.length ?? 0}:${pick}`;

/** 10초가 다 된 답만 실행해요. 다른 답을 하거나 새로 고쳐도 당겨지지 않아요 */
function flush(s: State, now: number): State {
  const due = s.pending.filter(p => p.at + HOLD_MS <= now);
  if (!due.length) return s;
  const entries = due.map((p): Entry => ({ id: nid(), cardId: p.cardId, kind: 'decided', pick: p.pick, alt: p.alt, at: p.at, edited: p.edited, undoable: p.undoable }));
  return { ...s, pending: s.pending.filter(p => p.at + HOLD_MS > now), log: [...entries.reverse(), ...s.log] };
}

/** 저장해 둔 상태를 읽어요 — 기다리는 답이 하나였던 예전 저장본도 읽어요 */
export function restore(raw: State | (Omit<State, 'pending'> & { pending: Pending | null }), now: number): State {
  const pending = Array.isArray(raw.pending) ? raw.pending : raw.pending ? [raw.pending] : [];
  return flush({ ...raw, pending }, now);
}

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'start': return { ...s, started: true };
    case 'connect': return { ...s, connected: { ...s.connected, [a.id]: true } };
    case 'pick': {
      const cur = s.progress[a.cardId] ?? { state: 'open' as const };
      if (cur.state !== 'open') return s;
      // 위험한 답은 두 번 눌러야 해요 — 첫 번째는 확인만 띄워요
      if (a.risky && cur.confirm !== a.pick) return { ...s, progress: { ...s.progress, [a.cardId]: { ...cur, confirm: a.pick } } };
      const t = flush(s, a.now);
      return {
        ...t,
        progress: { ...t.progress, [a.cardId]: { ...cur, state: 'answered', pick: a.pick, confirm: undefined } },
        pending: [...t.pending, { cardId: a.cardId, pick: a.pick, alt: Boolean(cur.alt), at: a.now, edited: cur.drafts?.[draftKey(cur, a.pick)] !== undefined, undoable: a.undoable }],
        firstPickAt: t.firstPickAt ?? a.now, lastPickAt: a.now,
      };
    }
    case 'commit': return flush(s, a.now);
    case 'undo': {
      const p = a.cardId ? s.pending.find(x => x.cardId === a.cardId) : s.pending.at(-1);
      if (!p) return s;
      const cur = s.progress[p.cardId];
      return { ...s, pending: s.pending.filter(x => x !== p), deck: [p.cardId, ...s.deck.filter(x => x !== p.cardId)], // 바로 다시 정할 수 있게 맨 앞으로
       
        progress: { ...s.progress, [p.cardId]: { ...cur, state: 'open', pick: undefined } } };
    }
    case 'say': {
      const text = a.text.trim();
      if (!text) return s;
      const cur = s.progress[a.cardId] ?? { state: 'open' as const };
      return { ...s, progress: { ...s.progress, [a.cardId]: { ...cur, said: text, turns: [...(cur.turns ?? (cur.said ? [cur.said] : [])), text], alt: true, confirm: undefined } } };
    }
    case 'draft': {
      const cur = s.progress[a.cardId] ?? { state: 'open' as const };
      return { ...s, progress: { ...s.progress, [a.cardId]: { ...cur, drafts: { ...cur.drafts, [a.key]: a.text } } } };
    }
    case 'focus': {
      // 목록에서 고른 카드를 덱 맨 앞으로
      if (stateOf(s, a.cardId) !== 'open') return s;
      return { ...s, deck: [a.cardId, ...s.deck.filter(x => x !== a.cardId)] };
    }
    case 'snooze': case 'handoff': {
      if (stateOf(s, a.cardId) !== 'open') return s;
      const t = flush(s, a.now);
      const state: CardState = a.type === 'snooze' ? 'snoozed' : 'handed_off';
      return { ...t, progress: { ...t.progress, [a.cardId]: { ...(t.progress[a.cardId] ?? {}), state } },
        log: [{ id: nid(), cardId: a.cardId, kind: a.type === 'snooze' ? 'snoozed' : 'handoff', at: a.now }, ...t.log] };
    }
    case 'unsnooze': {
      if (stateOf(s, a.cardId) !== 'snoozed') return s;
      // 다시 올린 카드는 덱 맨 앞으로
      return { ...s, deck: [a.cardId, ...s.deck.filter(x => x !== a.cardId)], progress: { ...s.progress, [a.cardId]: { ...s.progress[a.cardId], state: 'open' } } };
    }
    case 'more': {
      const add = a.ids.filter(id => !s.deck.includes(id));
      return { ...s, deck: [...s.deck, ...add], moreAdded: true };
    }
    case 'promote': {
      const id = `p-${a.fyiId}`;
      if (s.deck.includes(id)) return s;
      return { ...s, deck: [...s.deck, id] };
    }
    // 알려만 드려요를 읽음으로 — 결정이 없어서 덱(deck)에는 들어가지 않고, 기록에만 남아요
    case 'read': {
      if (stateOf(s, a.fyiId) !== 'open' || s.deck.includes(`p-${a.fyiId}`)) return s;
      return { ...s, progress: { ...s.progress, [a.fyiId]: { state: 'read' } }, log: [{ id: nid(), cardId: a.fyiId, kind: 'read', at: a.now }, ...s.log] };
    }
    case 'unread': {
      const e = s.log.find(x => x.kind === 'read' && x.cardId === a.fyiId && !x.undone);
      return e ? reduce(s, { type: 'undoEntry', entryId: e.id }) : s;
    }
    case 'undoEntry': {
      const e = s.log.find(x => x.id === a.entryId);
      if (!e || e.undone) return s;
      if (!canUndo(s, e)) return s;
      if (e.kind === 'read') {
        const { [e.cardId]: _read, ...progress } = s.progress;
        return { ...s, log: s.log.map(x => (x.id === e.id ? { ...x, undone: true } : x)), progress };
      }
      return { ...s, log: s.log.map(x => (x.id === e.id ? { ...x, undone: true } : x)),
        deck: [e.cardId, ...s.deck.filter(x => x !== e.cardId)],
        progress: { ...s.progress, [e.cardId]: { ...s.progress[e.cardId], state: 'open', pick: undefined } } };
    }
    case 'undoAuto': return s.autoUndone.includes(a.id) ? s : { ...s, autoUndone: [...s.autoUndone, a.id] };
    case 'routine': return a.id === 'r4' ? s : { ...s, routines: { ...s.routines, [a.id]: !s.routines[a.id] } };
    case 'tell': {
      const text = a.text.trim().slice(0, 600);
      return text ? { ...s, notes: [{ id: nid(), text, at: a.now }, ...(s.notes ?? [])] } : s;
    }
    case 'forget': return s.forgotten?.includes(a.key) ? s : { ...s, forgotten: [...(s.forgotten ?? []), a.key] };
    case 'fix': return a.text.trim() ? { ...s, fixed: { ...s.fixed, [a.key]: a.text.trim().slice(0, 600) } } : s;
    case 'reset': return { ...initial(a.today), started: true };
  }
}
