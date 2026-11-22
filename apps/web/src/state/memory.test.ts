import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { datasets, getCard } from '../data';
import { initial, reduce, type State } from './store';
import { memoriesOf, recallFor } from './memory';
import { ko } from '../locales/ko';

const ds = datasets.ko;
// 화면의 i18n 은 브라우저(location)가 있어야 해서, 시험에서는 문구만 따로 올려요
const i18n = createInstance();
void i18n.init({ resources: { ko: { translation: ko } }, lng: 'ko', interpolation: { escapeValue: false } });
const t = i18n.getFixedT('ko');
const card = (id: string) => getCard(ds, t, id);
const run = (s: State, ...as: Parameters<typeof reduce>[1][]) => as.reduce(reduce, s);
const all = ds.cards.map(c => c.id);

describe('예시 모드의 기억', () => {
  it('답하면 그 사람과 정한 것으로 남고, 같은 사람의 다음 카드에 붙어요', () => {
    const s = run(initial(all), { type: 'pick', cardId: 'c06', pick: 0, risky: false, now: 1 });
    const m = memoriesOf(s, card, t);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ key: 'answer:c06', kind: 'person', subject: '이도현' });
    expect(m[0]!.text).toContain('오전 11시로 해요');
    expect(recallFor(m, card('c11')!)).toEqual([m[0]!.text]);
    expect(recallFor(m, card('c06')!)).toEqual([]); // 자기 카드의 것은 빼요
    expect(recallFor(m, card('c01')!)).toEqual([]); // 다른 사람
  });
  it('되돌리면 기억에서도 빠져요', () => {
    const s = run(initial(all), { type: 'pick', cardId: 'c06', pick: 0, risky: false, now: 1 }, { type: 'undo' });
    expect(memoriesOf(s, card, t)).toEqual([]);
  });
  it('코딩 에이전트에게 답한 것은 프로젝트의 기억이에요', () => {
    const s = run(initial(all), { type: 'pick', cardId: 'c02', pick: 0, risky: false, now: 1 }, { type: 'commit', now: 20_000 });
    expect(memoriesOf(s, card, t)[0]).toMatchObject({ kind: 'project', subject: 'Claude Code' });
    expect(recallFor(memoriesOf(s, card, t), card('c13')!)).toHaveLength(1);
  });
  it('내 말 · 고친 초안 · 알려 준 것은 선호로 남고, 지우거나 고칠 수 있어요', () => {
    let s = run(initial(all), { type: 'say', cardId: 'c01', text: '다음 주로 미뤄 주세요' }, { type: 'tell', text: '메일은 세 문장 안으로', now: 5 }, { type: 'tell', text: '  ', now: 6 });
    let m = memoriesOf(s, card, t);
    expect(m.map(x => x.kind)).toEqual(['preference', 'preference']);
    expect(m[0]!.text).toBe('메일은 세 문장 안으로');
    s = run(s, { type: 'fix', key: m[0]!.key, text: '메일은 두 문장 안으로' }, { type: 'forget', key: m[1]!.key });
    m = memoriesOf(s, card, t);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ text: '메일은 두 문장 안으로', edited: true });
  });
  it('처음부터 다시 하면 기억도 비워요', () => {
    const s = run(initial(all), { type: 'tell', text: '기억해 주세요', now: 1 }, { type: 'reset', today: all });
    expect(memoriesOf(s, card, t)).toEqual([]);
  });
});
