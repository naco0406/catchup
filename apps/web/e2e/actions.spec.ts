import { expect, test, type Page } from '@playwright/test';
import { start } from './helpers';

// 고른 답 = 보여 준 글 = 실행된 일(plan.md 2단계 '먼저 고칠 것' 1~5).
// 화면이 넘어가는지가 아니라 '무엇이 실행됐는지'를 봐요.
const opt = (page: Page, i: number) => page.locator(`[data-card] button.cu-opt[data-opt="${i}"]`);
const toActivity = (page: Page) => page.evaluate(() => { location.hash = '#/activity'; });
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);
const WAITING = '아직 되돌릴 수 있어요';
const SENT = '박서연 님께 A안을 예산에 맞출 수 있는지 여쭤봤어요';
const row = (page: Page, text: string) => page.locator('.cu-row').filter({ hasText: text });

async function at(page: Page, id: string) {
  while ((await page.locator('[data-card]').getAttribute('data-card')) !== id) {
    const now = await page.locator('[data-card]').getAttribute('data-card');
    await page.locator('[data-card] button.cu-opt.rec').click();
    await expect(page.locator('[data-card]')).not.toHaveAttribute('data-card', now!);
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await start(page);
});

for (const [i, word] of [[0, /6시/], [1, /12시/], [2, /다음 주말/]] as const) {
  test(`복사 카드: ${i + 1}번을 고르면 ${i + 1}번의 글이 복사돼요`, async ({ page }) => {
    await at(page, 'c04');
    await opt(page, i).click();
    await page.clock.fastForward(11_000);
    await expect.poll(() => copied(page)).toHaveLength(1);
    expect((await copied(page))[0]).toMatch(word);
  });
}

test('말로 답해 만든 선택지도 그 글이 복사돼요', async ({ page }, info) => {
  await at(page, 'c04');
  const input = info.project.name === 'iphone' ? page.locator('.phone-dock input') : page.locator('[data-card] .cu-composer input');
  await input.fill('토요일은 결혼식이 있어');
  await input.press('Enter');
  await opt(page, 1).click();
  await page.clock.fastForward(11_000);
  await expect.poll(() => copied(page)).toHaveLength(1);
  expect((await copied(page))[0]).toMatch(/일요일.*6시/);
});

test('거절에는 실행한다고 쓰지 않아요', async ({ page }) => {
  await at(page, 'c05');
  await opt(page, 2).click();
  const toast = page.locator('.cu-toast:visible').first();
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText('실행');
});

test('다음 카드에 답해도 앞 답의 10초는 줄지 않아요', async ({ page }) => {
  await opt(page, 0).click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c02');
  await page.clock.fastForward(3_000);
  await opt(page, 0).click();
  await toActivity(page);
  await expect(page.getByText(WAITING)).toHaveCount(2);
  await expect(row(page, SENT).getByRole('button', { name: '되돌리기' })).toBeVisible();
});

test('새로 고쳐도 10초는 줄지도 늘지도 않아요', async ({ page }) => {
  await opt(page, 0).click();
  await page.clock.fastForward(3_000);
  await page.reload();
  await toActivity(page);
  await expect(page.getByText(WAITING)).toHaveCount(1);
  await page.clock.fastForward(8_000);
  await expect(page.getByText(WAITING)).toHaveCount(0);
  await expect(row(page, SENT)).toHaveCount(1);
});

test('이미 보낸 답장에는 되돌리기가 없어요', async ({ page }) => {
  await opt(page, 0).click();
  await page.clock.fastForward(11_000);
  await toActivity(page);
  await expect(row(page, SENT)).toHaveCount(1);
  await expect(row(page, SENT).getByRole('button', { name: '되돌리기' })).toHaveCount(0);
});

test('고른 번호의 글을 고르기 전에 볼 수 있고, 고친 글 그대로 복사돼요', async ({ page }) => {
  await at(page, 'c04');
  const prev = page.locator('[data-card] .cu-prev');
  await prev.getByRole('button', { name: '2번의 글 보기' }).click();
  await expect(prev.locator('p')).toContainText('12시');
  await prev.locator('.h button').click();
  await prev.locator('textarea').fill('엄마, 12시 반에 갈게요!');
  await opt(page, 1).click();
  await expect.poll(() => copied(page)).toEqual(['엄마, 12시 반에 갈게요!']); // 10초를 기다리지 않아요
});

test('위험한 답은 확인하는 동안 그 답의 글을 보여 줘요', async ({ page }) => {
  await opt(page, 2).click(); // A안(위험)은 셋째예요 — 돈이 걸린 카드는 되묻기를 추천해요
  await expect(page.locator('[data-card] .cu-prev p')).toContainText('A안으로');
});
