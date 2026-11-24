import { expect, test, type Page } from '@playwright/test';
import { noOverflow } from '../e2e/helpers';

// 화면만: 서버 응답은 여기서 만들어요. 진짜 흐름은 services/api/tests/codex-sessions.mjs 가 봐요
type Fake = { id: string; agent: string; title: string; repo: string | null; state: string; has_patch: boolean; cancel_wanted: boolean; summary: string | null; error_code: string | null; created_at: string; updated_at: string };
const session = (over: Partial<Fake>): Fake => ({
  id: crypto.randomUUID(), agent: 'codex', title: '결제 재시도 넣기', repo: null, state: 'running', has_patch: false, cancel_wanted: false, summary: null, error_code: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
});

async function open(page: Page, sessions: Fake[], login = 'in', lang = 'ko') {
  const sent: { method: string; path: string; body: unknown }[] = [];
  await page.route('**/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      sent.push({ method: request.method(), path, body: request.postData() ? request.postDataJSON() : null });
      if (request.method() === 'POST') sessions.unshift(session({ state: 'queued', title: (request.postDataJSON() as { task: string }).task }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (path.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' });
    if (path.endsWith('/patch')) return route.fulfill({ status: 200, contentType: 'text/plain', body: '--- a/retry.ts\n+++ b/retry.ts\n-return charge(order)\n+return withRetry(order) // \u202ehidden\n' });
    const body = path.endsWith('/agent-sessions') ? sessions
      : path.endsWith('/me/codex') ? { state: login, busy: false }
      : path.endsWith('/v1/me') ? { cell: '00000000-0000-0000-0000-00000000000a', lang, time_zone: 'Asia/Seoul' }
      : path.endsWith('/activity') ? []
      : { cards: [], cursor: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/?lang=${lang}#/sessions`);
  return sent;
}

test('일을 맡기면 저장소와 함께 가고 목록에 서요', async ({ page }) => {
  const sent = await open(page, []);
  await page.getByRole('textbox', { name: '맡길 일' }).fill('테스트를 고쳐 주세요');
  await page.getByRole('textbox', { name: '저장소' }).fill('acme/shop');
  await page.getByRole('button', { name: '맡기기' }).click();
  await expect(page.locator('[data-session="queued"]')).toContainText('테스트를 고쳐 주세요');
  expect(sent[0]!.body).toMatchObject({ task: '테스트를 고쳐 주세요', repo: 'acme/shop' });
});

test('로그인 전에는 연결로 보내요', async ({ page }) => {
  await open(page, [], 'none');
  await page.getByRole('button', { name: '연결하기' }).click();
  await expect(page).toHaveURL(/#\/connections/);
});

test('기다리는 세션은 메뉴에 수로 보이고 카드로 보내요', async ({ page }) => {
  await open(page, [session({ state: 'waiting' })]);
  await page.getByRole('button', { name: '메뉴' }).first().click();
  await expect(page.locator('.cu-side.drawer').getByRole('button', { name: '코딩 세션' })).toContainText('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('.cu-side.drawer')).toHaveCount(0);
  await page.locator('[data-session="waiting"]').getByRole('button', { name: '답하기' }).click();
  await expect(page).toHaveURL(/#\/catchup/);
});

test('세션을 멈춰요', async ({ page }) => {
  const one = session({});
  const sent = await open(page, [one]);
  await page.locator('[data-session]').getByRole('button', { name: '멈추기' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ method: 'DELETE', path: `/v1/me/agent-sessions/${one.id}` });
});

test('끝난 세션의 바뀐 것을 보고, 숨은 글자는 드러나요', async ({ page }) => {
  await open(page, [session({ state: 'done', has_patch: true, summary: '재시도를 서버로 옮겼어요' })]);
  await page.getByRole('button', { name: '바뀐 것' }).click();
  await expect(page.locator('.session-patch .ln.add')).toContainText('\\u{202e}hidden');
  await expect(page.getByRole('link', { name: '내려받기' })).toHaveAttribute('href', /\/patch$/);
  await noOverflow(page);
});

for (const lang of ['ko', 'en']) {
  test(`${lang}: 모든 상태가 넘치지 않아요`, async ({ page }) => {
    const states = ['queued', 'starting', 'running', 'waiting', 'blocked', 'finishing', 'done', 'failed', 'cancelled'];
    await open(page, states.map(state => session({ state, title: 'Find the failing payment retry test and fix it without touching the checkout page', repo: 'acme-long-organization-name/shop-payments-service', has_patch: true, error_code: state === 'failed' ? 'repo_not_found_or_private' : null })), 'in', lang);
    await expect(page.locator('[data-session]')).toHaveCount(states.length);
    await noOverflow(page);
  });
}
