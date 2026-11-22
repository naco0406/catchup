import { expect, type Page } from '@playwright/test';

export async function start(page: Page, lang: 'ko' | 'en' = 'ko') {
  await page.goto(`/?lang=${lang}`);
  await page.getByRole('button', { name: lang === 'ko' ? '캐치업 시작하기' : 'Start catching up' }).click();
  await expect(page.locator('[data-card]')).toBeVisible();
}
export const currentCard = (page: Page) => page.locator('[data-card]').first().getAttribute('data-card');
/** 문서 전체와 화면 안 요소가 가로로 넘치지 않는지 */
export async function noOverflow(page: Page) {
  const bad = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > cw) out.push(`document ${document.documentElement.scrollWidth} > ${cw}`);
    for (const e of document.querySelectorAll<HTMLElement>('body *')) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || !e.getClientRects().length || e.closest('.cu-seg, .cu-steps')) continue;
      const r = e.getBoundingClientRect();
      if (r.right > cw + 1 && !e.closest('.drawer')) out.push(`${e.className || e.tagName} right=${Math.round(r.right)}`);
      if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && (s.overflow === 'hidden' || s.overflowX === 'hidden') && s.textOverflow !== 'ellipsis') out.push(`clipped ${e.className}: ${e.textContent?.slice(0, 30)}`);
    }
    return out.slice(0, 10);
  });
  expect(bad, bad.join('\n')).toEqual([]);
}
