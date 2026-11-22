import { expect, test, type Page } from '@playwright/test';
import { drag, start } from './helpers';

// 알려만 드려요 — 결정이 없는 소식은 오른쪽으로 밀면 읽음, 왼쪽으로 밀면 나중에(Q7 · docs/design/swipe-deck 10장)
const news = (page: Page) => page.locator('[data-fyi] .cu-ask');
const toast = (page: Page) => page.locator('.cu-toast:visible').first();
const acts = (page: Page, phone: boolean) => page.locator(phone ? '.phone-dock .cu-pacts' : '.cu-acts');
const go = (page: Page, route: string) => page.evaluate(r => { location.hash = `#/${r}`; }, route);
const FIRST = '#제품 — 12월 출시 일정이 12월 9일로 확정됐어요', SECOND = 'PR 3개가 합쳐졌고, 밤 배포는 문제없이 끝났어요';

test.beforeEach(async ({ page }) => { await start(page); await go(page, 'fyi'); await expect(news(page)).toHaveText(FIRST); });

test('읽음 단추를 누르면 다음 소식이 오고, 처리 기록에 남아요', async ({ page }, info) => {
  await acts(page, info.project.name === 'iphone').getByRole('button', { name: /읽음/ }).click();
  await expect(news(page)).toHaveText(SECOND);
  await expect(toast(page)).toContainText('읽음으로 표시했어요');
  await go(page, 'activity');
  await expect(page.getByText(`읽었어요: ${FIRST}`)).toBeVisible();
});

test('토스트에서 되돌리면 소식이 돌아와요', async ({ page }, info) => {
  await acts(page, info.project.name === 'iphone').getByRole('button', { name: /읽음/ }).click();
  await expect(news(page)).toHaveText(SECOND);
  await toast(page).getByRole('button', { name: '되돌리기' }).click();
  await expect(news(page)).toHaveText(FIRST);
});

test('나중에를 누르면 읽음으로 치지 않고 맨 뒤로 가요', async ({ page }, info) => {
  await acts(page, info.project.name === 'iphone').getByRole('button', { name: /나중에/ }).click();
  await expect(news(page)).toHaveText(SECOND);
  await go(page, 'activity');
  await expect(page.getByText(/^읽었어요/)).toHaveCount(0);
  await go(page, 'fyi');
  for (let i = 0; i < 4; i++) {
    const now = await news(page).textContent();
    await acts(page, info.project.name === 'iphone').getByRole('button', { name: /읽음/ }).click();
    await expect(news(page)).not.toHaveText(now!);
  }
  await expect(news(page)).toHaveText(FIRST); // 미뤄 둔 것이 마지막에 다시 와요
});

test('카드로 올리면 알려만에서 빠지고 캐치업 덱에 들어가요', async ({ page }, info) => {
  await acts(page, info.project.name === 'iphone').getByRole('button', { name: '카드로', exact: true }).click();
  await expect(news(page)).toHaveText(SECOND);
  await go(page, 'catchup');
  await expect(page.locator('.cu-top .left')).toContainText('8개 중');
});

test('다 읽으면 다 봤다고 알려요', async ({ page }, info) => {
  for (let i = 0; i < 5; i++) await acts(page, info.project.name === 'iphone').getByRole('button', { name: /읽음/ }).click();
  await expect(page.getByText('알려 드릴 것을 다 봤어요')).toBeVisible();
  await expect(page.locator('[data-fyi]')).toHaveCount(0);
});

test.describe('터치로', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name === 'desktop', '터치 기기'); });

  test('오른쪽으로 밀면 읽음이에요', async ({ page }) => {
    const cancel = await drag(page, '[data-fyi] .cu-ask', 200, 'hold');
    await expect(page.locator('.cu-main')).toHaveAttribute('data-armed', '');
    await expect(toast(page)).toContainText('놓으면 읽음으로 표시해요');
    await cancel!();
    await drag(page, '[data-fyi] .cu-ask', 220);
    await expect(news(page)).toHaveText(SECOND);
    await go(page, 'activity');
    await expect(page.getByText(`읽었어요: ${FIRST}`)).toBeVisible();
  });

  test('왼쪽으로 밀면 나중에예요', async ({ page }) => {
    await drag(page, '[data-fyi] .cu-ask', -220);
    await expect(news(page)).toHaveText(SECOND);
    await go(page, 'activity');
    await expect(page.getByText(/^읽었어요/)).toHaveCount(0);
  });
});

test.describe('키로', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name === 'iphone', '키보드는 아이패드 · 데스크톱'); });

  test('→ 읽음 · ← 나중에 · Z 되돌리기', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(news(page)).toHaveText(SECOND);
    await page.keyboard.press('z');
    await expect(news(page)).toHaveText(FIRST);
    await page.keyboard.press('ArrowLeft');
    await expect(news(page)).toHaveText(SECOND);
  });
});
