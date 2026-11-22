import { expect, test } from '@playwright/test';
import { currentCard, noOverflow, start } from './helpers';

test('키보드 없이 카드 7장을 끝까지 넘겨요(누르기만)', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', '터치 기기 기준');
  await start(page);
  for (let i = 0; i < 7; i++) {
    const before = await currentCard(page);
    await page.locator('[data-card] button.cu-opt.rec').first().click();
    if (i < 6) await expect.poll(() => currentCard(page)).not.toBe(before);
  }
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await noOverflow(page);
});

test('키보드 1~4 · ↵ · S · D 만으로 끝까지 넘겨요', async ({ page }, info) => {
  test.skip(info.project.name === 'iphone', '블루투스 키보드는 아이패드 · 데스크톱');
  await start(page);
  for (const k of ['Enter', '2', 's', 'd', 'Enter', '1', 'Enter']) {
    const before = await currentCard(page);
    await page.keyboard.press(k);
    if (before !== 'c07' || k !== 'Enter') await expect.poll(() => currentCard(page)).not.toBe(before);
  }
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await expect(page.getByText('미뤄 둔 것 1개')).toBeVisible();
});

test('10초 안에 되돌리면 아무것도 나가지 않아요 · 지나면 처리 기록에 남아요', async ({ page }) => {
  await page.clock.install();
  await start(page);
  const first = await currentCard(page);
  await page.locator('[data-card] button.cu-opt.rec').click();
  await expect.poll(() => currentCard(page)).not.toBe(first);
  await page.getByRole('button', { name: '되돌리기' }).first().click();
  await expect.poll(() => currentCard(page)).toBe(first);
  await page.locator('[data-card] button.cu-opt.rec').click();
  await page.clock.fastForward(11_000);
  await page.goto('/#/activity');
  await expect(page.getByText('박서연 님께 B안으로 진행한다고 답장했어요')).toBeVisible();
  await expect(page.getByText('박서연 님께 B안으로 진행한다고 답장했어요')).toHaveCount(1);
});

test('위험한 답은 두 번 눌러야 정해져요', async ({ page }) => {
  await start(page);
  for (let i = 0; i < 4; i++) await page.locator('[data-card] button.cu-opt.rec').click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c05');
  const risky = page.locator('[data-card] button.cu-opt[data-opt="1"]');
  await risky.click();
  await expect(risky).toHaveClass(/confirm/);
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c05');
  await risky.click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c06');
});

test('말로 답하면 선택지를 다시 만들어 와요', async ({ page }, info) => {
  await start(page);
  for (let i = 0; i < 3; i++) await page.locator('[data-card] button.cu-opt.rec').click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c04');
  const input = info.project.name === 'iphone' ? page.locator('.phone-dock input') : page.locator('[data-card] .cu-composer input');
  await input.fill('토요일은 결혼식이 있어. 일요일 점심으로 여쭤봐 줘');
  await input.press('Enter');
  await expect(page.getByText('일요일 12시 30분이 어떤지 여쭤봐요')).toBeVisible();
  await expect(page.locator('[data-card] .cu-said')).toHaveText('토요일은 결혼식이 있어. 일요일 점심으로 여쭤봐 줘');
});

test('새로 고침해도 기다리던 답이 사라지지 않아요', async ({ page }) => {
  await start(page);
  await page.locator('[data-card] button.cu-opt.rec').click();
  await page.reload();
  await page.goto('/#/activity');
  await expect(page.getByText('박서연 님께 B안으로 진행한다고 답장했어요')).toBeVisible();
});

test('아이폰: 왼쪽으로 밀면 미뤄요 · 위험한 카드는 밀리지 않아요', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', '터치 밀기');
  await start(page);
  const swipe = async () => {
    const box = (await page.locator('[data-card]').boundingBox())!;
    const y = box.y + 60, x0 = box.x + box.width - 30;
    await page.locator('[data-card]').dispatchEvent('pointerdown', { pointerType: 'touch', clientX: x0, clientY: y, pointerId: 7, isPrimary: true });
    for (let d = 20; d <= 220; d += 20) await page.locator('[data-card]').dispatchEvent('pointermove', { pointerType: 'touch', clientX: x0 - d, clientY: y + 2, pointerId: 7, isPrimary: true });
    await page.locator('[data-card]').dispatchEvent('pointerup', { pointerType: 'touch', clientX: x0 - 220, clientY: y, pointerId: 7, isPrimary: true });
  };
  await swipe();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c02');
  for (let i = 0; i < 3; i++) await page.locator('[data-card] button.cu-opt.rec').click();
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c05');
  await swipe();
  await page.waitForTimeout(400);
  await expect(page.locator('[data-card]')).toHaveAttribute('data-card', 'c05');
});
