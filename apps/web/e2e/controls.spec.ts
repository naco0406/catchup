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

test('메뉴는 숨어 있다가 단추로 열리고, 화면으로 가는 줄만 있어요', async ({ page }) => {
  await start(page);
  await expect(page.locator('.cu-side')).toHaveCount(0);
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  const side = page.locator('.cu-side.drawer');
  await expect(side.locator('button.cu-nav')).toHaveText(['캐치업7', '알려만 드려요5', '미뤄 둔 것', '처리 기록', '토마토가 아는 것', '설정']);
  await expect(side.getByText('예시 자료예요')).toHaveCount(0); // 안내는 설정 안에 있어요
  await side.getByRole('button', { name: '설정' }).click();
  await expect(side.getByText('예시 자료예요. 아무것도 보내지 않아요.')).toBeVisible();
  await expect(side.getByRole('button', { name: 'English' })).toBeVisible();
  await side.getByRole('button', { name: '처리 기록' }).click();
  await expect(page.locator('.cu-side')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '처리 기록' })).toBeVisible();
});

test('넓은 화면: 압정으로 고정하면 새로 고쳐도 메뉴가 남고, [ 로 여닫아요', async ({ page }, info) => {
  test.skip(info.project.name === 'iphone', '고정은 넓은 화면(1024 이상)에서만');
  await start(page);
  await page.keyboard.press('[');
  await page.getByRole('button', { name: '메뉴 펼쳐 두기' }).click();
  await expect(page.locator('.shell.pinned > .cu-side')).toBeVisible();
  await expect(page.locator('.drawer-bg')).toHaveCount(0);
  await expect(page.locator('.cu-top .menu')).toBeHidden();
  await page.reload();
  await expect(page.locator('.shell.pinned > .cu-side')).toBeVisible();
  await page.keyboard.press('['); // 고정을 풀어요
  await expect(page.locator('.cu-side')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cu-side')).toHaveCount(0);
  await page.keyboard.press('['); await expect(page.locator('.cu-side.drawer')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('.cu-side')).toHaveCount(0);
});

test('? 를 누르면 키 목록이 뜨고, Esc 로 닫혀요', async ({ page }, info) => {
  test.skip(info.project.name === 'iphone', '키보드가 있는 화면만');
  await start(page);
  await expect(page.locator('[data-card] .cu-kbd')).toHaveCount(0); // 카드 둘레에는 키 표시가 없어요
  await page.keyboard.press('?');
  const keys = page.getByRole('dialog', { name: '키' });
  await expect(keys).toContainText('답 고르기');
  await expect(keys).toContainText('메뉴');
  await page.keyboard.press('Escape');
  await expect(keys).toHaveCount(0);
});

test('아이폰: 메뉴는 서랍이고 압정이 없어요', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', '아이폰');
  await start(page);
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  await expect(page.getByRole('button', { name: '메뉴 펼쳐 두기' })).toHaveCount(0);
  await page.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.cu-side')).toHaveCount(0);
});
