import type { Card, Dataset, Effect, FyiItem, Lang, Option } from './types';
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
      { label: t('fyi.promoteOk'), detail: t('fyi.promoteOkDetail'), done: t('fyi.promoteOkDone', { title: f.title }), effect: { kind: 'none' } },
      { label: t('fyi.promoteLater'), detail: t('fyi.promoteLaterDetail'), done: t('fyi.promoteLaterDone', { title: f.title }), effect: { kind: 'none' } },
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
export function altOptions(card: Card, t: TFunction, turns: string[]): { options: Option[]; recommended: number; exchanges: Exchange[] } {
  if (card.talk) return card.talk;
  const last = turns[turns.length - 1] ?? '';
  const exchanges: Exchange[] = turns.map((said, i) => i === 0 && card.followUp
    ? { said, work: card.followUp.work, reply: card.followUp.reply, icon: card.followUp.workIcon ?? 'file' }
    : { said, work: t('generic.work'), reply: t('generic.reply'), icon: 'chat' });
  if (turns.length === 1 && card.followUp) return { options: card.followUp.options, recommended: 0, exchanges };
  const base = card.followUp?.options ?? card.options;
  const effect = asSaidEffect(base[0]!.effect, last);
  const done = t(effect.kind === 'none' ? 'generic.notedDone' : 'generic.asSaidDone', { text: last });
  return { options: [{ label: t('generic.asSaid'), detail: `“${last}”`, done, effect }, ...base], recommended: 0, exchanges };
}

/** '말씀하신 대로' — 추천과 같은 길로 그 말을 보내요. 밖의 것을 바꾸는 일은 말만으로 하지 않고 기록만 남겨요 */
function asSaidEffect(base: Effect, text: string): Effect {
  if (base.kind === 'send' || base.kind === 'copy') return { ...base, text };
  if (base.kind === 'tell') return { kind: 'tell', to: base.to, text };
  return { kind: 'none' };
}

/** 실행한 뒤에도 되돌릴 수 있나 — 보낸 글과 전한 답은 못 거둬들여요 */
export const undoableAfterRun = (e: Effect) => e.kind === 'copy' || e.kind === 'none' || (e.kind === 'change' && e.undo === true);

/** 미리 보여 줄 것이 있나 */
export const previewable = (e: Effect) => e.kind === 'send' || e.kind === 'copy' || (e.kind === 'tell' && Boolean(e.text || e.code));
/** 고르면 일어나는 일을 미리 보여 줄 수 있는 답 — 글, 코드, 또는 그날 일정의 바뀜 */
export const reviewable = (o: Option) => previewable(o.effect) || Boolean(o.day);

/** 고친 초안을 넣은, 실제로 실행할 내용 */
export const withDraft = (e: Effect, draft?: string): Effect =>
  draft && (e.kind === 'send' || e.kind === 'copy' || (e.kind === 'tell' && e.text)) ? { ...e, text: draft } : e;

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

/** 밀기 규칙(Q7): 위험한 카드는 어느 쪽으로도 안 밀리고, 위험한 추천은 밀어서 정해지지 않아요 */
export function swipeRules(card: Card, options: Option[], rec: number): { left: boolean; right: boolean } {
  const best = options[rec];
  const left = card.due?.tone !== 'risk';
  return { left, right: left && Boolean(best) && (!best?.risk || best.risk === 'low') };
}
