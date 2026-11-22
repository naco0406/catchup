import { expect, test } from '@playwright/test';

test('?start=1 은 처음 화면을 건너뛰고, ?reset=1 은 처음부터 다시 시작해요', async ({ page }) => {
  await page.goto('/?lang=en&start=1');
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c01');
  await page.locator('[data-card] button.cu-opt.rec').click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c02');
  await page.goto('/?lang=en&reset=1&start=1');
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c01');
  expect(new URL(page.url()).searchParams.has('reset')).toBe(false);
});
