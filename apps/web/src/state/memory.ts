// 예시 모드(소개 페이지의 앱)의 기억 — 서버의 `catchup.memories` 뷰와 같은 규칙을 화면 쪽 상태에서 읽어 내요.
// 따로 베껴 두지 않아서, 답을 되돌리면 그 기억도 같이 빠져요.
import type { TFunction } from 'i18next';
import { altOptions, turnsOf } from '../data';
import type { Card } from '../data/types';
import { draftKey, stateOf, type State } from './store';

export type MemoryKind = 'preference' | 'person' | 'project' | 'promise';
export interface Memory { key: string; kind: MemoryKind; subject: string; text: string; at?: string | null; edited: boolean; card?: string | null }

/** 카드 한 장에 붙이는 기억의 수(서버의 ON_CARD) */
const ON_CARD = 3;
const coding = (c: Card) => c.source === 'claude' || c.source === 'codex';
const iso = (ms: number) => new Date(ms).toISOString();

export function memoriesOf(s: State, getCard: (id: string) => Card | undefined, t: TFunction): Memory[] {
  const out: (Memory & { ms: number })[] = [];
  const kept = [
    ...s.pending.map(p => ({ id: p.cardId, pick: p.pick, at: p.at })),
    ...s.log.filter(e => e.kind === 'decided' && !e.undone && e.pick !== undefined && stateOf(s, e.cardId) === 'answered').map(e => ({ id: e.cardId, pick: e.pick!, at: e.at })),
  ];
  for (const k of kept) {
    const card = getCard(k.id); if (!card) continue;
    const prog = s.progress[k.id], turns = turnsOf(prog);
    const options = prog?.alt && turns.length ? altOptions(card, t, turns).options : card.options;
    const label = options[k.pick]?.label; if (!label) continue;
    out.push({ key: `answer:${k.id}`, kind: coding(card) ? 'project' : 'person', subject: card.who, text: t('memory.text.decided', { q: card.question, a: label }), at: iso(k.at), ms: k.at, edited: false, card: k.id });
    const draft = prog?.drafts?.[draftKey(prog, k.pick)];
    if (draft) out.push({ key: `draft:${k.id}`, kind: 'preference', subject: card.who, text: t('memory.text.edited', { a: draft }), at: iso(k.at), ms: k.at, edited: false, card: k.id });
  }
  for (const [id, prog] of Object.entries(s.progress)) {
    const card = getCard(id); if (!card) continue;
    turnsOf(prog).forEach((said, i) => out.push({ key: `said:${id}:${i + 1}`, kind: 'preference', subject: card.who, text: t('memory.text.said', { a: said }), at: null, ms: 0, edited: false, card: id }));
  }
  for (const n of s.notes ?? []) out.push({ key: `note:${n.id}`, kind: 'preference', subject: '', text: n.text, at: iso(n.at), ms: n.at, edited: false });
  return out
    .filter(m => !s.forgotten?.includes(m.key))
    .map(({ ms, ...m }) => ({ ms, m: s.fixed?.[m.key] ? { ...m, text: s.fixed[m.key]!, edited: true } : m }))
    .sort((a, b) => b.ms - a.ms)
    .map(x => x.m);
}

/** 같은 사람 · 같은 일의 지난 기억(자기 카드의 것은 빼요) */
export const recallFor = (memories: Memory[], card: Card): string[] =>
  card.id.startsWith('p-') ? [] : memories.filter(m => m.subject === card.who && m.card !== card.id).slice(0, ON_CARD).map(m => m.text);
