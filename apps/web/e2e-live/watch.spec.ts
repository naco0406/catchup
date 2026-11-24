import { expect, test, type Page } from '@playwright/test';
import { noOverflow } from '../e2e/helpers';

// 감시 규칙(design.md 17장 제안 2) — 화면만: 서버 응답은 여기서 만들어요. 진짜 흐름은 services/api/tests/stage2.rs 의 a_watch_rule_… 이 봐요
type Rule = { id: string; kind: string; value: string; lane: string; until: string; state: string; created_at: string };
const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
const rule = (over: Partial<Rule> = {}): Rule => ({ id: crypto.randomUUID(), kind: 'from', value: '한빛 디자인', lane: 'ask', until, state: 'proposed', created_at: new Date().toISOString(), ...over });

async function open(page: Page, hash: string, proposed: Rule, rules: Rule[]) {
  const sent: string[] = [];
  const message = {
    id: crypto.randomUUID(), said: '금요일까지 한빛 디자인에서 오는 건 바로 물어봐 줘', state: 'done', intent: 'watch',
    reply: '12월 1일까지 \'한빛 디자인\' 쪽에서 온 것은 바로 물어볼게요. 켤까요?', task: null, repo: null, memory: null, session: null,
    card: null, card_question: null, accepted: false, watch: proposed, error_code: null, created_at: new Date().toISOString(),
  };
  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/accept')) {
      sent.push(path); proposed.state = 'active'; rules.push(proposed); message.accepted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(message) });
    }
    if (request.method() === 'POST' && path.endsWith('/stop')) {
      sent.push(path); const id = path.split('/').at(-2); rules.splice(rules.findIndex(r => r.id === id), 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (path.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' });
    const body = path.endsWith('/me/assistant') ? [message]
      : path.endsWith('/me/watch') ? rules
      : path.endsWith('/me/memories') ? []
      : path.endsWith('/me/codex') ? { state: 'in', busy: false }
      : path.endsWith('/agent-sessions') || path.endsWith('/activity') ? []
      : path.endsWith('/v1/me') ? { cell: '00000000-0000-0000-0000-00000000000a', lang: 'ko', time_zone: 'Asia/Seoul' }
      : { cards: [], cursor: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/?lang=ko#/${hash}`);
  return sent;
}

test('토마토가 제안한 감시 규칙은 내가 눌러야 켜져요', async ({ page }) => {
  const proposed = rule();
  const sent = await open(page, 'assistant', proposed, []);
  const turn = page.locator('[data-intent="watch"]');
  await expect(turn).toContainText('“한빛 디자인” 쪽에서 온 것');
  expect(sent).toHaveLength(0);
  await turn.getByRole('button', { name: '켜기' }).click();
  await expect(turn).toContainText('켜져 있어요');
  expect(sent).toEqual([expect.stringMatching(/\/me\/assistant\/.+\/accept$/)]);
  await noOverflow(page);
});

test('켜진 규칙은 토마토가 아는 것에 보이고, 멈출 수 있어요', async ({ page }) => {
  const on = rule({ state: 'active' });
  const sent = await open(page, 'memory', rule(), [on]);
  const row = page.locator(`[data-watch="${on.id}"]`);
  await expect(row).toContainText('“한빛 디자인” 쪽에서 온 것');
  await expect(row).toContainText('바로 물어봐요');
  await noOverflow(page);
  await row.getByRole('button', { name: '멈추기' }).click();
  await expect(row).toHaveCount(0);
  expect(sent).toEqual([`/v1/me/watch/${on.id}/stop`]);
});
