import { expect, test } from '@playwright/test';
import { start } from './helpers';

test('복사하지 못하면 복사했다고 하지 않고 카드를 다시 열어요', async ({ page }) => {
  await start(page, 'ko', false);
  for (const id of ['c02', 'c03', 'c04']) {
    await page.locator('[data-card] button.cu-opt.rec').click();
    await expect(page.locator('[data-card]')).toHaveAttribute('data-card', id);
  }
  await page.locator('[data-card] button.cu-opt.rec').click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c04');
  await page.goto('/#/activity');
  await expect(page.getByText('복사해 드렸어요')).toHaveCount(0);
});
