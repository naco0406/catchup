import { describe, expect, it } from 'vitest';
import { canUndo, initial, openIds, reduce, restore, snoozedIds, type State } from './store';

const today = ['c01', 'c02', 'c03'];
const run = (s: State, ...as: Parameters<typeof reduce>[1][]) => as.reduce(reduce, s);

describe('덱', () => {
  it('답하면 다음 카드가 맨 앞에 와요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 });
    expect(openIds(s)).toEqual(['c02', 'c03']);
    expect(s.pending.at(-1)?.cardId).toBe('c01');
    expect(s.log).toHaveLength(0); // 10초 동안은 아직 실행 전
  });
  it('10초 안에 되돌리면 아무것도 남지 않고 카드가 돌아와요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 }, { type: 'undo' });
    expect(openIds(s)).toEqual(today);
    expect(s.pending).toEqual([]);
    expect(s.log).toHaveLength(0);
  });
  it('실행되면 처리 기록에 한 번만 남아요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 2, risky: false, now: 1 }, { type: 'commit', now: 20_000 }, { type: 'commit', now: 20_000 });
    expect(s.log).toHaveLength(1);
    expect(s.log[0]).toMatchObject({ cardId: 'c01', kind: 'decided', pick: 2 });
  });
  it('다음 카드에 답해도 앞 답은 제 10초를 다 기다려요', () => {
    const two = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1000 }, { type: 'pick', cardId: 'c02', pick: 1, risky: false, now: 4000 });
    expect(two.log).toHaveLength(0);
    expect(two.pending.map(p => p.cardId)).toEqual(['c01', 'c02']);
    expect(reduce(two, { type: 'commit', now: 10_999 }).log).toHaveLength(0);
    const first = reduce(two, { type: 'commit', now: 11_000 });
    expect(first.log.map(e => e.cardId)).toEqual(['c01']);
    expect(first.pending.map(p => p.cardId)).toEqual(['c02']);
  });
  it('미루기 · 내가 직접도 앞 답을 당기지 않아요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 }, { type: 'snooze', cardId: 'c02', now: 2 }, { type: 'handoff', cardId: 'c03', now: 3 });
    expect(s.pending).toHaveLength(1);
    expect(s.log.map(e => e.kind)).toEqual(['handoff', 'snoozed']);
  });
  it('기다리는 답 가운데 하나만 되돌릴 수 있어요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 }, { type: 'pick', cardId: 'c02', pick: 0, risky: false, now: 2 }, { type: 'undo', cardId: 'c01' });
    expect(s.pending.map(p => p.cardId)).toEqual(['c02']);
    expect(openIds(s)[0]).toBe('c01');
  });
  it('다시 읽으면 지난 것만 실행되고, 예전 저장본도 읽어요', () => {
    const p = { cardId: 'c01', pick: 0, alt: false, at: 1000 };
    expect(restore({ ...initial(today), pending: p }, 5000).pending).toEqual([p]);
    expect(restore({ ...initial(today), pending: p }, 11_000).log).toHaveLength(1);
    expect(restore({ ...initial(today), pending: null }, 5000).pending).toEqual([]);
  });
  it('보낸 답은 기록에서 되돌릴 수 없어요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, undoable: false, now: 1 }, { type: 'commit', now: 20_000 });
    expect(canUndo(s, s.log[0]!)).toBe(false);
    expect(reduce(s, { type: 'undoEntry', entryId: s.log[0]!.id })).toBe(s);
  });
  it('같은 카드에 두 번 답해도 한 번만 실행돼요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 }, { type: 'pick', cardId: 'c01', pick: 1, risky: false, now: 2 }, { type: 'commit', now: 20_000 });
    expect(s.log).toHaveLength(1);
    expect(s.log[0]?.pick).toBe(0);
  });
});

describe('위험한 답', () => {
  it('첫 번째 누름은 확인만 띄우고, 두 번째에 정해져요', () => {
    let s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 1, risky: true, now: 1 });
    expect(openIds(s)).toContain('c01');
    expect(s.progress.c01?.confirm).toBe(1);
    s = reduce(s, { type: 'pick', cardId: 'c01', pick: 1, risky: true, now: 2 });
    expect(openIds(s)).not.toContain('c01');
  });
  it('꾹 눌러 확인한 답은 한 번에 정해져요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 1, risky: true, confirmed: true, now: 1 });
    expect(openIds(s)).not.toContain('c01');
  });
  it('다른 답을 누르면 확인이 그 답으로 옮겨 가요', () => {
    const s = run(initial(today), { type: 'pick', cardId: 'c01', pick: 1, risky: true, now: 1 }, { type: 'pick', cardId: 'c01', pick: 2, risky: true, now: 2 });
    expect(s.progress.c01?.confirm).toBe(2);
    expect(openIds(s)).toContain('c01');
  });
});

describe('미루기 · 내가 직접 · 말로 답하기', () => {
  it('미룬 카드는 목록에 있고, 지금 보기로 맨 앞에 돌아와요', () => {
    let s = run(initial(today), { type: 'snooze', cardId: 'c01', now: 1 });
    expect(snoozedIds(s)).toEqual(['c01']);
    s = reduce(s, { type: 'unsnooze', cardId: 'c01' });
    expect(openIds(s)[0]).toBe('c01');
  });
  it('내가 직접 할 카드는 덱에서 빠지고 기록에 남아요', () => {
    const s = run(initial(today), { type: 'handoff', cardId: 'c02', now: 1 });
    expect(openIds(s)).toEqual(['c01', 'c03']);
    expect(s.log[0]).toMatchObject({ kind: 'handoff', cardId: 'c02' });
  });
  it('말로 답하면 새 선택지로 바뀌고, 그 뒤에 고른 답은 새 선택지 기준이에요', () => {
    const s = run(initial(today), { type: 'say', cardId: 'c01', text: '  토요일은 결혼식이 있어 ' }, { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 }, { type: 'commit', now: 20_000 });
    expect(s.progress.c01?.said).toBe('토요일은 결혼식이 있어');
    expect(s.log[0]).toMatchObject({ alt: true, pick: 0 });
  });
  it('빈 말은 무시해요', () => {
    const s = reduce(initial(today), { type: 'say', cardId: 'c01', text: '   ' });
    expect(s.progress.c01).toBeUndefined();
  });
});

describe('그 밖', () => {
  it('처리 기록에서 되돌리면 카드가 맨 앞에 다시 열려요', () => {
    let s = run(initial(today), { type: 'pick', cardId: 'c02', pick: 0, risky: false, undoable: true, now: 1 }, { type: 'commit', now: 20_000 });
    s = reduce(s, { type: 'undoEntry', entryId: s.log[0]!.id });
    expect(openIds(s)[0]).toBe('c02');
    expect(s.log[0]?.undone).toBe(true);
  });
  it('카드 더 받기는 이미 있는 카드를 겹치지 않아요', () => {
    const s = run(initial(today), { type: 'more', ids: ['c03', 'c04', 'c05'] });
    expect(s.deck).toEqual(['c01', 'c02', 'c03', 'c04', 'c05']);
  });
  it('알려만을 카드로 올리면 덱 끝에 한 번만 붙어요', () => {
    const s = run(initial(today), { type: 'promote', fyiId: 'f01' }, { type: 'promote', fyiId: 'f01' });
    expect(s.deck.filter(x => x === 'p-f01')).toHaveLength(1);
  });
  it('돈 규칙은 끌 수 없어요', () => {
    const s = run(initial(today), { type: 'routine', id: 'r4' }, { type: 'routine', id: 'r1' });
    expect(s.routines.r4).toBe(true);
    expect(s.routines.r1).toBe(false);
  });
});

describe('고치기 · 목록에서 고르기', () => {
  it('고친 초안은 카드에 남고, 그 답은 처리 기록에 고쳤다고 남아요', () => {
    const s = run(initial(today), { type: 'draft', cardId: 'c01', key: '0:0', text: '서연 님, B안으로 가요.' }, { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 1 }, { type: 'commit', now: 20_000 });
    expect(s.progress.c01?.drafts?.['0:0']).toBe('서연 님, B안으로 가요.');
    expect(s.log[0]?.edited).toBe(true);
  });
  it('목록에서 고른 카드가 덱 맨 앞으로 와요 · 이미 정한 카드는 그대로예요', () => {
    let s = reduce(initial(today), { type: 'focus', cardId: 'c03' });
    expect(openIds(s)[0]).toBe('c03');
    s = run(s, { type: 'pick', cardId: 'c03', pick: 0, risky: false, now: 1 }, { type: 'focus', cardId: 'c03' });
    expect(s.deck[0]).toBe('c03');
    expect(openIds(s)[0]).toBe('c01');
  });
});

it('말로 두 번 답하면 두 말이 모두 남아요', () => {
  const s = run(initial(today), { type: 'say', cardId: 'c04', text: '토요일은 결혼식이 있어' }, { type: 'say', cardId: 'c04', text: '좀 더 늦게요' });
  expect(s.progress.c04?.turns).toEqual(['토요일은 결혼식이 있어', '좀 더 늦게요']);
  expect(s.progress.c04?.said).toBe('좀 더 늦게요');
});

describe('처리 기록에서 되돌리기', () => {
  it('미룬 것도 되돌리면 카드가 맨 앞으로 와요', () => {
    const s0 = run(initial(today), { type: 'snooze', cardId: 'c01', now: 1 });
    const s = run(s0, { type: 'undoEntry', entryId: s0.log[0]!.id });
    expect(openIds(s)[0]).toBe('c01');
    expect(s.log[0]?.undone).toBe(true);
  });
  it('미뤘다가 다시 꺼내 답했으면 예전 미루기는 되돌리지 않아요', () => {
    const s0 = run(initial(today), { type: 'snooze', cardId: 'c01', now: 1 }, { type: 'unsnooze', cardId: 'c01' }, { type: 'pick', cardId: 'c01', pick: 0, risky: false, now: 2 }, { type: 'commit', now: 20_000 });
    const snoozeEntry = s0.log.find(e => e.kind === 'snoozed')!;
    expect(canUndo(s0, snoozeEntry)).toBe(false);
    expect(run(s0, { type: 'undoEntry', entryId: snoozeEntry.id })).toBe(s0);
  });
});

describe('알려만 드려요를 읽음으로', () => {
  const s0: State = { ...initial(['c01']), started: true };

  it('읽으면 기록에 남고, 캐치업 덱에는 들어가지 않아요', () => {
    const s = reduce(s0, { type: 'read', fyiId: 'f01', now: 1000 });
    expect(s.progress.f01?.state).toBe('read');
    expect(s.log[0]).toMatchObject({ kind: 'read', cardId: 'f01' });
    expect(s.deck).toEqual(['c01']);
    expect(reduce(s, { type: 'read', fyiId: 'f01', now: 2000 })).toBe(s); // 두 번 읽지 않아요
  });
  it('되돌리면 다시 안 읽은 것이 되고 기록은 되돌렸다고 남아요', () => {
    const s = reduce(reduce(s0, { type: 'read', fyiId: 'f01', now: 1000 }), { type: 'unread', fyiId: 'f01' });
    expect(s.progress.f01).toBeUndefined();
    expect(s.log[0]).toMatchObject({ kind: 'read', undone: true });
    expect(s.deck).toEqual(['c01']);
  });
  it('처리 기록에서도 되돌릴 수 있어요', () => {
    const read = reduce(s0, { type: 'read', fyiId: 'f01', now: 1000 });
    expect(canUndo(read, read.log[0]!)).toBe(true);
    const s = reduce(read, { type: 'undoEntry', entryId: read.log[0]!.id });
    expect(s.progress.f01).toBeUndefined();
    expect(s.deck).toEqual(['c01']);
  });
  it('카드로 올린 소식은 읽음으로 넘기지 않아요', () => {
    const promoted = reduce(s0, { type: 'promote', fyiId: 'f01' });
    expect(reduce(promoted, { type: 'read', fyiId: 'f01', now: 1000 })).toBe(promoted);
  });
});
