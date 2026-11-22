// 예시 카드 20장과 알려만을 서버에 넣을 모양(NewCard)으로. 실행은 로컬 커넥터라 밖으로 나가지 않아요.
// 쓰는 법: pnpm backend:demo  → demo@example.test
import { ko } from '../../apps/web/src/data/cards.ko.ts';

const base = { source_version: '1' };
const cards = ko.cards.map(c => ({
  ...base, dedupe_key: `demo:${c.id}`, source_ref: `demo:${c.id}`,
  kind: c.source === 'calendar' ? 'schedule' : c.source === 'codex' ? 'approve' : 'reply',
  source: { type: c.source, from: c.who, org: c.meta },
  question: c.question,
  body: { summary: c.summary, evidence: c.evidence, context: c.context, due: c.due?.text },
  options: c.options, recommended: c.recommended,
  risk: c.due?.tone === 'risk' ? (c.options.find(o => o.risk)?.risk ?? 'irreversible') : 'low',
  waiting: c.due?.tone === 'wait',
  reply_path: c.options.some(o => o.effect.kind === 'copy') ? 'draft_copy' : 'send',
}));
const news = ko.fyi.map(f => ({
  ...base, dedupe_key: `demo:${f.id}`, source_ref: `demo:${f.id}`, kind: 'fyi', reply_path: 'none',
  source: { type: f.source, from: f.sub }, question: f.title, options: [],
}));
process.stdout.write(JSON.stringify([...cards, ...news]));
