import { expect, test, type Page } from '@playwright/test';

// 소개 페이지: 두 언어가 따로 구워지고, 스크립트 없이도 다 보이고, 넘치지 않고, 그림이 모두 실려요
const noOverflow = async (page: Page) => {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(extra).toBeLessThanOrEqual(0);
};

test('영어 페이지: 첫 화면, 실제 앱을 품은 칸, 한국어로 가는 링크', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle('CatchUp: only the decisions, as cards');
  await expect(page.locator('h1')).toHaveText('It reads everything. You answer the cards.');
  await expect(page.locator('#proto')).toHaveAttribute('src', /lang=en&start=1&embed=1/);
  await expect(page.locator('a[data-lang="ko"]').first()).toHaveAttribute('href', '/ko/');
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('한국어 페이지는 처음부터 한국어로 구워져요', async ({ page }) => {
  await page.goto('/ko/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page).toHaveTitle('CatchUp: 정할 것만 카드로');
  await expect(page.locator('#proto')).toHaveAttribute('src', /lang=ko/);
  await expect(page.locator('#cards-title')).toHaveText('어디서 왔든 같은 카드예요');
  await noOverflow(page);
});

test('?lang=ko 로 열면 한국어 페이지로 가고, 고른 언어를 기억해요', async ({ page }) => {
  await page.goto('/?lang=ko');
  await expect(page).toHaveURL(/\/ko\/$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/ko\/$/);
  await page.locator('.pill a[data-lang="en"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5183\/$/);
  await page.goto('/ko/');
  await expect(page).toHaveURL(/\/ko\/$/);
});

test('모든 그림이 실려요', async ({ page }) => {
  await page.goto('/');
  for (const img of await page.locator('img').filter({ visible: true }).all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
});

test.describe('스크립트 없이', () => {
  test.use({ javaScriptEnabled: false });
  test('글과 카드 그림이 다 보여요', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.moment')).toHaveCount(6);
    await expect(page.locator('#fails h3')).toHaveText('Failures come back as questions');
    await expect(page.locator('#faq details')).toHaveCount(5);
  });
});
