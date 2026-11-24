import { expect, test, type Page } from '@playwright/test';
import { noOverflow } from '../e2e/helpers';

// 기억 정리 일꾼(design.md 17장 제안 3) — 화면만: 서버 응답은 여기서 만들어요. 진짜 흐름은 services/api/tests/stage2.rs 의 tidying_… 이 봐요
const at = new Date().toISOString();
const old = new Date(Date.now() - 120 * 86_400_000).toISOString();

async function open(page: Page) {
  const sent: string[] = [];
  const memories = [
    { key: 'note:short', kind: 'preference', subject: '', text: '메일은 짧게', at, edited: false, card: null, session: null, check: false, merged: 1 },
    { key: 'note:polite', kind: 'preference', subject: '', text: '존댓말로 써 줘', at: old, edited: false, card: null, session: null, check: true, merged: 0 },
  ];
  const tidied = [
    { id: crypto.randomUUID(), action: 'merge', key: 'note:short-old', into_key: 'note:short', text: '메일은  짧게.', created_at: at },
    { id: crypto.randomUUID(), action: 'check', key: 'note:polite', into_key: null, text: '존댓말로 써 줘', created_at: at },
  ];
  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/undo')) {
      sent.push(path);
      const id = path.split('/').at(-2);
      const x = tidied.find(t => t.id === id)!;
      tidied.splice(tidied.indexOf(x), 1);
      if (x.action === 'check') memories.find(m => m.key === x.key)!.check = false;
      else memories[0]!.merged = 0;
      return route.fulfill({ status: 204, body: '' });
    }
    if (path.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' });
    const body = path.endsWith('/me/memories') ? memories
      : path.endsWith('/me/tidy') ? tidied
      : path.endsWith('/me/watch') ? []
      : path.endsWith('/me/codex') ? { state: 'in', busy: false }
      : path.endsWith('/agent-sessions') || path.endsWith('/activity') || path.endsWith('/me/assistant') ? []
      : path.endsWith('/v1/me') ? { cell: '00000000-0000-0000-0000-00000000000a', lang: 'ko', time_zone: 'Asia/Seoul' }
      : { cards: [], cursor: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/?lang=ko#/memory');
  return { sent, tidied };
}

test('오래된 선호는 확인 필요로 보이고, 맞아요를 누르면 표시가 사라져요', async ({ page }) => {
  const { sent, tidied } = await open(page);
  const row = page.locator('[data-memory="note:polite"]');
  await expect(row).toContainText('아직 맞나요?');
  await expect(page.locator('[data-memory="note:short"]')).toContainText('1개 합침');
  await noOverflow(page);
  const check = tidied.find(t => t.action === 'check')!.id;
  await row.getByRole('button', { name: '맞아요' }).click();
  await expect(row).not.toContainText('아직 맞나요?');
  expect(sent).toEqual([`/v1/me/tidy/${check}/undo`]);
});

test('토마토가 합친 기억은 펼쳐서 보고 되돌릴 수 있어요', async ({ page }) => {
  const { sent, tidied } = await open(page);
  const merge = tidied.find(t => t.action === 'merge')!.id;
  const box = page.locator('[data-kind="tidied"]');
  await box.locator('summary').click();
  const row = page.locator(`[data-tidied="${merge}"]`);
  await expect(row).toContainText('같은 기억으로 합쳤어요');
  await row.getByRole('button', { name: '되돌리기' }).click();
  await expect(box).toHaveCount(0);
  expect(sent).toEqual([`/v1/me/tidy/${merge}/undo`]);
});
