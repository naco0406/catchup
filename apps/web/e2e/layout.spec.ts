import { expect, test } from '@playwright/test';
import { noOverflow, start } from './helpers';

// 20장 모두를 두 언어로 열어 넘침을 봐요. 영어가 길어서 깨지는 곳을 잡아요(1단계 끝 기준).
for (const lang of ['ko', 'en'] as const) {
  test(`${lang}: 카드 20장과 다른 화면이 넘치지 않아요`, async ({ page }) => {
    await start(page, lang);
    await noOverflow(page);
    const more = page.getByRole('button', { name: lang === 'ko' ? '카드 더 받기' : 'Get more cards' });
    if (await more.first().isVisible()) await more.first().click();
    else { await page.getByRole('button', { name: lang === 'ko' ? '메뉴' : 'Menu' }).first().click(); await page.locator('.drawer').getByRole('button', { name: lang === 'ko' ? '설정' : 'Settings' }).click(); await noOverflow(page); await page.locator('.drawer').getByRole('button', { name: lang === 'ko' ? '카드 더 받기' : 'Get more cards' }).click(); }
    for (let i = 0; i < 20; i++) {
      const card = page.locator('[data-card]');
      if (!(await card.count())) break;
      await noOverflow(page);
      await page.locator('[data-card] button.cu-opt').first().click();
    }
    await expect(page.getByText(lang === 'ko' ? '다 봤어요' : 'All caught up')).toBeVisible();
    await noOverflow(page);
    for (const r of ['fyi', 'snoozed', 'activity']) { await page.goto(`/?lang=${lang}#/${r}`); await noOverflow(page); }
  });
}

test('처음 화면도 넘치지 않아요', async ({ page }) => {
  for (const lang of ['ko', 'en']) { await page.goto(`/?lang=${lang}`); await noOverflow(page); }
});
