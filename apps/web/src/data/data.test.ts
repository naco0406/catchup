import { describe, expect, it } from 'vitest';
import { en } from './cards.en';
import { ko } from './cards.ko';
import { altOptions, evidenceIcon, swipeRules } from './index';

// 예시 자료도 설계 원칙을 지켜요(design.md 2장)
describe.each([['en', en], ['ko', ko]] as const)('%s 예시 카드', (_, ds) => {
  it('추천은 맨 위 하나예요', () => {
    for (const c of ds.cards) {
      expect(c.recommended, c.id).toBe(0);
      if (c.followUp) expect(c.followUp.recommended, c.id).toBe(0);
    }
  });
  it('선택지는 2~4개예요', () => {
    for (const c of ds.cards) expect(c.options.length, c.id).toBeGreaterThanOrEqual(2), expect(c.options.length, c.id).toBeLessThanOrEqual(4);
  });
  it('보여 줄 글은 선택지마다 다르고 비어 있지 않아요', () => {
    for (const c of ds.cards) for (const list of [c.options, c.followUp?.options ?? []]) {
      const texts = list.flatMap(o => (o.effect.kind === 'send' || o.effect.kind === 'copy' ? [o.effect.text] : []));
      for (const x of texts) expect(x.trim(), c.id).not.toBe('');
      expect(new Set(texts).size, c.id).toBe(texts.length);
    }
  });
  it('답의 이름은 아이폰의 알약 한 줄에 들어오는 길이예요', () => {
    // 폭 375 에서 알약 안의 글 칸은 249 — 영어는 32자쯤, 한국어는 21자쯤(docs/design/simple-ui 6장)
    const max = ds === en ? 32 : 21;
    for (const c of ds.cards) for (const o of [...c.options, ...(c.followUp?.options ?? [])]) expect([...o.label].length, `${c.id} ${o.label}`).toBeLessThanOrEqual(max);
  });
  it('추천은 위험한 답이 아니에요', () => {
    for (const c of ds.cards) expect(c.options[c.recommended]?.risk ?? 'low', c.id).toBe('low');
  });
});

it('두 언어의 카드는 같은 id · 같은 선택지 수 · 같은 위험이에요', () => {
  expect(en.cards.map(c => c.id)).toEqual(ko.cards.map(c => c.id));
  en.cards.forEach((c, i) => {
    const k = ko.cards[i]!;
    expect(k.options.map(o => o.risk ?? 'low'), c.id).toEqual(c.options.map(o => o.risk ?? 'low'));
    expect(Boolean(k.followUp), c.id).toBe(Boolean(c.followUp));
    expect(k.context?.kind, c.id).toBe(c.context?.kind);
    expect(k.options.map(o => o.effect.kind), c.id).toEqual(c.options.map(o => o.effect.kind));
  });
  expect(en.today).toEqual(ko.today);
});

describe('말로 답한 뒤 · 근거 아이콘', () => {
  const t = ((k: string, o?: { text?: string }) => (o?.text ? `${k}:${o.text}` : k)) as unknown as Parameters<typeof altOptions>[1];
  it('두 번째 말부터는 말한 대로가 맨 위에 와요', () => {
    const c = en.cards.find(x => x.id === 'c04')!;
    const one = altOptions(c, t, ['a wedding on Saturday']);
    expect(one.options).toBe(c.followUp!.options);
    expect(one.exchanges).toHaveLength(1);
    const two = altOptions(c, t, ['a wedding on Saturday', 'later please']);
    expect(two.exchanges.map(x => x.said)).toEqual(['a wedding on Saturday', 'later please']);
    expect(two.options[0]?.detail).toBe('“later please”');
    expect(two.options[0]?.effect).toMatchObject({ kind: 'copy', text: 'later please' });
  });
  it('근거 알약은 글자로 아이콘을 골라요', () => {
    expect(evidenceIcon('quote_hanbit_v2.pdf')).toBe('pdf');
    expect(evidenceIcon('메일 3통')).toBe('mail');
    expect(evidenceIcon('Q4 budget')).toBe('money');
    expect(evidenceIcon('테스트 38개 통과')).toBe('tests');
    expect(evidenceIcon('시안 3개')).toBe('image');
    expect(evidenceIcon('글 14개')).toBe('chat');
    expect(evidenceIcon('실패 기록 11번')).toBe('warning');
    expect(evidenceIcon('2 files')).toBe('file');
  });
});

describe('밀기 규칙(Q7)', () => {
  const card = ko.cards.find(c => c.due?.tone !== 'risk')!;
  const best = card.options[0]!;

  it('보통 카드는 양쪽으로 밀려요', () => {
    expect(swipeRules(card, [best], 0)).toEqual({ left: true, right: true });
  });
  it('추천만 위험하면 미루기만 돼요', () => {
    expect(swipeRules(card, [{ ...best, risk: 'money' }], 0)).toEqual({ left: true, right: false });
  });
  it('추천이 없으면 오른쪽으로 정해지지 않아요', () => {
    expect(swipeRules(card, [best], 3)).toEqual({ left: true, right: false });
  });
  it('위험한 카드는 어느 쪽도 안 돼요', () => {
    expect(swipeRules({ ...card, due: { text: '위험', tone: 'risk' } }, [best], 0)).toEqual({ left: false, right: false });
  });
});
