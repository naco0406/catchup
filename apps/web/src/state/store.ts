// 프로토타입의 상태 — 순수 함수(reduce)라서 화면 없이 시험할 수 있어요. 서버가 생기면 같은 동작을 API 가 맡아요(design.md 12장).
export type CardState = 'open' | 'answered' | 'snoozed' | 'handed_off';
export interface Progress { state: CardState; pick?: number; alt?: boolean; said?: string; confirm?: number; draft?: string; /** 말로 답한 차례(앞의 말도 남겨요) */ turns?: string[] }
export type EntryKind = 'decided' | 'snoozed' | 'handoff';
export interface Entry { id: string; cardId: string; kind: EntryKind; pick?: number; alt?: boolean; at: number; undone?: boolean; edited?: boolean }
export interface Pending { cardId: string; pick: number; alt: boolean; at: number; edited?: boolean }

export interface State {
  started: boolean;
  deck: string[];
  progress: Record<string, Progress>;
  pending: Pending | null;
  log: Entry[];
  routines: Record<string, boolean>;
  connected: Record<string, boolean>;
  firstPickAt?: number;
  lastPickAt?: number;
  moreAdded: boolean;
  autoUndone: string[];
}

export type Action =
  | { type: 'start' }
  | { type: 'connect'; id: string }
  | { type: 'pick'; cardId: string; pick: number; risky: boolean; now: number }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'say'; cardId: string; text: string }
  | { type: 'draft'; cardId: string; text: string }
  | { type: 'focus'; cardId: string }
  | { type: 'snooze'; cardId: string; now: number }
  | { type: 'unsnooze'; cardId: string }
  | { type: 'handoff'; cardId: string; now: number }
  | { type: 'more'; ids: string[] }
  | { type: 'promote'; fyiId: string }
  | { type: 'undoEntry'; entryId: string }
  | { type: 'undoAuto'; id: string }
  | { type: 'routine'; id: string }
  | { type: 'reset'; today: string[] };

/** 밖으로 나가는 일을 기다리는 시간 */
export const HOLD_MS = 10_000;

export function initial(today: string[]): State {
  return { started: false, deck: [...today], progress: {}, pending: null, log: [], routines: { r1: true, r2: true, r3: true, r4: true },
    connected: { gmail: true, calendar: true }, moreAdded: false, autoUndone: [] };
}

export const stateOf = (s: State, id: string): CardState => s.progress[id]?.state ?? 'open';
export const openIds = (s: State) => s.deck.filter(id => stateOf(s, id) === 'open');
export const snoozedIds = (s: State) => s.deck.filter(id => stateOf(s, id) === 'snoozed');

/** 처리 기록의 한 줄을 되돌릴 수 있나 — 그 뒤로 카드가 바뀌었으면(미뤘다가 다시 꺼내 답했다면) 안 돼요 */
export function canUndo(s: State, e: Entry): boolean {
  if (e.undone) return false;
  const expect: CardState = e.kind === 'decided' ? 'answered' : e.kind === 'snoozed' ? 'snoozed' : 'handed_off';
  return stateOf(s, e.cardId) === expect;
}

let seq = 0;
const nid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

/** 기다리던 답을 실제로 실행해요(처리 기록에 남겨요) */
function flush(s: State): State {
  if (!s.pending) return s;
  const p = s.pending;
  return { ...s, pending: null, log: [{ id: nid(), cardId: p.cardId, kind: 'decided', pick: p.pick, alt: p.alt, at: p.at, edited: p.edited }, ...s.log] };
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
      const t = flush(s);
      return {
        ...t,
        progress: { ...t.progress, [a.cardId]: { ...cur, state: 'answered', pick: a.pick, confirm: undefined } },
        pending: { cardId: a.cardId, pick: a.pick, alt: Boolean(cur.alt), at: a.now, edited: cur.draft !== undefined },
        firstPickAt: t.firstPickAt ?? a.now, lastPickAt: a.now,
      };
    }
    case 'commit': return flush(s);
    case 'undo': {
      if (!s.pending) return s;
      const cur = s.progress[s.pending.cardId];
      return { ...s, pending: null, progress: { ...s.progress, [s.pending.cardId]: { ...cur, state: 'open', pick: undefined } } };
    }
    case 'say': {
      const text = a.text.trim();
      if (!text) return s;
      const cur = s.progress[a.cardId] ?? { state: 'open' as const };
      return { ...s, progress: { ...s.progress, [a.cardId]: { ...cur, said: text, turns: [...(cur.turns ?? (cur.said ? [cur.said] : [])), text], alt: true, confirm: undefined } } };
    }
    case 'draft': {
      const cur = s.progress[a.cardId] ?? { state: 'open' as const };
      return { ...s, progress: { ...s.progress, [a.cardId]: { ...cur, draft: a.text } } };
    }
    case 'focus': {
      // 목록에서 고른 카드를 덱 맨 앞으로
      if (stateOf(s, a.cardId) !== 'open') return s;
      return { ...s, deck: [a.cardId, ...s.deck.filter(x => x !== a.cardId)] };
    }
    case 'snooze': case 'handoff': {
      if (stateOf(s, a.cardId) !== 'open') return s;
      const t = flush(s);
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
    case 'undoEntry': {
      const e = s.log.find(x => x.id === a.entryId);
      if (!e || e.undone) return s;
      if (!canUndo(s, e)) return s;
      return { ...s, log: s.log.map(x => (x.id === e.id ? { ...x, undone: true } : x)),
        deck: [e.cardId, ...s.deck.filter(x => x !== e.cardId)],
        progress: { ...s.progress, [e.cardId]: { ...s.progress[e.cardId], state: 'open', pick: undefined } } };
    }
    case 'undoAuto': return s.autoUndone.includes(a.id) ? s : { ...s, autoUndone: [...s.autoUndone, a.id] };
    case 'routine': return a.id === 'r4' ? s : { ...s, routines: { ...s.routines, [a.id]: !s.routines[a.id] } };
    case 'reset': return { ...initial(a.today), started: true };
  }
}
