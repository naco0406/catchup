import type { Card, Dataset, FyiItem, Lang, Option } from './types';
import { en } from './cards.en';
import { ko } from './cards.ko';
import type { TFunction } from 'i18next';

export const datasets: Record<Lang, Dataset> = { en, ko };
export const allIds = en.cards.map(c => c.id);

/** '알려만'에서 카드로 올린 것 — id 는 p-<fyi id> */
function promoted(t: TFunction, f: FyiItem): Card {
  return {
    id: `p-${f.id}`, source: f.source, who: t(`src.${f.source}`), meta: t('fyi.title'),
    question: t('fyi.promoteQ'), summary: [{ strong: `${f.title}. `, text: f.sub }],
    options: [
      { label: t('fyi.promoteOk'), detail: t('fyi.promoteOkDetail'), done: t('fyi.promoteOkDone', { title: f.title }) },
      { label: t('fyi.promoteLater'), detail: t('fyi.promoteLaterDetail'), done: t('fyi.promoteLaterDone', { title: f.title }) },
    ],
    recommended: 0,
  };
}

export function getCard(ds: Dataset, t: TFunction, id: string): Card | undefined {
  if (id.startsWith('p-')) { const f = ds.fyi.find(x => x.id === id.slice(2)); return f && promoted(t, f); }
  return ds.cards.find(c => c.id === id);
}

export interface Exchange { said: string; work: string; reply: string; icon: 'calendar' | 'file' | 'chat' }
/** 말로 답한 뒤 — 주고받은 차례와 새 선택지. 첫 번째 말에는 카드에 준비된 답이, 그 뒤로는 '말씀하신 대로'가 붙어요 */
export function altOptions(card: Card, t: TFunction, turns: string[]): { options: Option[]; recommended: number; exchanges: Exchange[]; preview?: string } {
  const last = turns[turns.length - 1] ?? '';
  const exchanges: Exchange[] = turns.map((said, i) => i === 0 && card.followUp
    ? { said, work: card.followUp.work, reply: card.followUp.reply, icon: card.followUp.workIcon ?? 'file' }
    : { said, work: t('generic.work'), reply: t('generic.reply'), icon: 'chat' });
  if (turns.length === 1 && card.followUp) return { options: card.followUp.options, recommended: 0, exchanges, preview: card.followUp.preview };
  const base = card.followUp?.options ?? card.options;
  return { options: [{ label: t('generic.asSaid'), detail: `“${last}”`, done: t('generic.asSaidDone', { text: last }) }, ...base], recommended: 0, exchanges, preview: last };
}

/** 근거 알약의 아이콘 — 글자로 가려요 */
export type EvidenceIcon = 'mail' | 'pdf' | 'steps' | 'tests' | 'chat' | 'image' | 'money' | 'warning' | 'file';
export function evidenceIcon(label: string): EvidenceIcon {
  const l = label.toLowerCase();
  if (/\.pdf$/.test(l)) return 'pdf';
  if (/메일|email/.test(l)) return 'mail';
  if (/예산|budget/.test(l)) return 'money';
  if (/단계|step/.test(l)) return 'steps';
  if (/테스트|test/.test(l)) return 'tests';
  if (/시안|mockup/.test(l)) return 'image';
  if (/^글 |message/.test(l)) return 'chat';
  if (/실패|failure/.test(l)) return 'warning';
  return 'file';
}

/** 말로 답한 차례 — 예전 저장본(said 하나)도 읽어요 */
export const turnsOf = (p?: { said?: string; turns?: string[] }) => p?.turns ?? (p?.said ? [p.said] : []);
