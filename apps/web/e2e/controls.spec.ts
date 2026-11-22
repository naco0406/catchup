import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('초안을 고치면 고친 글이 남고, 처리 기록에 고쳤다고 적혀요', async ({ page }) => {
  await start(page);
  await page.locator('[data-card] .cu-prev .h button').click();
  const area = page.locator('[data-card] .cu-prev textarea');
  await area.fill('서연 님, B안으로 가요. 계약서 보내 주세요.');
  await page.locator('[data-card] .cu-prev .h button').click();
  await expect(page.locator('[data-card] .cu-prev p')).toHaveText('서연 님, B안으로 가요. 계약서 보내 주세요.');
  await expect(page.locator('[data-card] .cu-prev .h')).toContainText('고쳤어요');
  await page.locator('[data-card] button.cu-opt.rec').click();
  await page.getByRole('button', { name: '되돌리기' }).first().waitFor();
  await page.goto('/?lang=ko#/activity');
  await expect(page.getByText('초안을 고쳤어요')).toBeVisible();
});

test('목록 보기에서 찾아 고른 카드가 먼저 와요', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '목록으로 보기' }).click();
  await page.getByRole('textbox', { name: '카드 찾기' }).fill('부가세');
  await expect(page.locator('.list-row')).toHaveCount(1);
  await page.locator('.list-row').click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c07');
});

test('사이드바 검색은 목록 보기의 찾기 칸으로 가요', async ({ page }, info) => {
  test.skip(info.project.name === 'iphone', '사이드바는 넓은 화면');
  await start(page);
  await page.locator('.cu-side').getByRole('button', { name: '카드 찾기' }).click();
  await expect(page.getByRole('textbox', { name: '카드 찾기' })).toBeFocused();
});
