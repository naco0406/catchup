import { expect, test, type Page } from '@playwright/test';
import { currentCard, noOverflow, start } from './helpers';

// 이어지는 비서(3.6단계) — 예시 모드에서도 답한 것이 기억으로 쌓이고, 같은 사람 · 같은 일의 다음 카드에 붙어요
const go = (page: Page, route: string) => page.evaluate(r => { location.hash = `#/${r}`; }, route);
const rows = (page: Page) => page.locator('[data-memory]');

test('알려 준 것과 답한 것이 쌓이고, 고치고 지울 수 있어요', async ({ page }) => {
  await start(page);
  await go(page, 'memory');
  await expect(page.getByText('아직 아는 것이 없어요')).toBeVisible();
  await page.getByRole('textbox', { name: '직접 알려 주기' }).fill('메일은 세 문장 안으로 써 주세요');
  await page.getByRole('button', { name: '직접 알려 주기' }).click();
  await expect(rows(page).filter({ hasText: '세 문장 안으로' })).toBeVisible();

  await go(page, 'catchup');
  const first = await page.locator('[data-card] button.cu-opt[data-opt="0"] .l').first().innerText();
  await page.locator('[data-card] button.cu-opt[data-opt="0"]').click();
  await go(page, 'memory');
  const decided = page.locator('[data-kind="person"] [data-memory]').filter({ hasText: first });
  await expect(decided).toContainText('박서연');
  await noOverflow(page);

  await rows(page).filter({ hasText: '세 문장 안으로' }).getByRole('button', { name: '고치기' }).click();
  await page.getByRole('textbox', { name: '고치기' }).fill('메일은 두 문장 안으로 써 주세요');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(rows(page).filter({ hasText: '두 문장 안으로' })).toContainText('내가 고쳤어요');
  await decided.getByRole('button', { name: '지우기' }).click();
  await expect(decided).toHaveCount(0);
  // 새로 고쳐도 그대로예요
  await page.reload();
  await expect(rows(page)).toHaveCount(1);
});

test('같은 일의 다음 카드에 지난 결정이 붙어 와요', async ({ page }) => {
  await start(page);
  await page.keyboard.press('s'); // 첫 카드는 미뤄요
  await expect.poll(() => currentCard(page)).toBe('c02');
  await expect(page.locator('[data-card] .recall')).toHaveCount(0);
  const picked = await page.locator('[data-card] button.cu-opt[data-opt="0"] .l').first().innerText();
  await page.keyboard.press('1');
  await expect.poll(() => currentCard(page)).not.toBe('c02');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('catchup-proto-v1')!); s.deck = ['c13', ...s.deck.filter((x: string) => x !== 'c13')]; localStorage.setItem('catchup-proto-v1', JSON.stringify(s)); });
  await page.reload();
  await expect.poll(() => currentCard(page)).toBe('c13');
  await expect(page.locator('[data-card] .recall')).toContainText(picked);
  await noOverflow(page);
});
