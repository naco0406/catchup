import { expect, type Page } from '@playwright/test';

/** 시험이 이 Mac 의 실제 클립보드를 건드리지 않게 — 복사한 글은 window.copied 에 모여요 */
export async function fakeClipboard(page: Page, works = true) {
  await page.addInitScript(ok => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    document.execCommand = () => false;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => { if (!ok) throw new Error('blocked'); w.copied.push(t); } } });
  }, works);
}

export async function start(page: Page, lang: 'ko' | 'en' = 'ko', clipboard = true) {
  await fakeClipboard(page, clipboard);
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
      if (s.display === 'none' || !e.getClientRects().length || e.closest('.cu-seg, .cu-steps, .deck-ghost')) continue; // 나가는 카드의 본은 잠깐 화면 밖으로 날아가요(스크롤 칸이 잘라요)
      const r = e.getBoundingClientRect();
      if (r.right > cw + 1 && !e.closest('.drawer')) out.push(`${e.className || e.tagName} right=${Math.round(r.right)}`);
      if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && (s.overflow === 'hidden' || s.overflowX === 'hidden') && s.textOverflow !== 'ellipsis') out.push(`clipped ${e.className}: ${e.textContent?.slice(0, 30)}`);
    }
    return out.slice(0, 10);
  });
  expect(bad, bad.join('\n')).toEqual([]);
}

export type Path = { pause?: number; back?: number; steps?: number };
/** 진짜 터치로 끌어요. steps: 적을수록 빨라요(기본 10). pause: 놓기 전에 멈춘 시간(ms) — 멈췄다 놓으면 튕긴 것이 아니에요. back: 끝까지 갔다가 이 거리로 도로 당겨요 */
export async function drag(page: Page, selector: string, dx: number, end: 'release' | 'cancel' | 'hold' = 'release', dy = 0, path: Path = {}) {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350); // 떠오르는 움직임이 끝난 다음
  const box = (await target.boundingBox())!;
  const width = page.viewportSize()!.width;
  const x = dx > 0 ? Math.max(box.x + 12, 24) : Math.min(box.x + box.width - 12, width - 24);
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', cx = 0, cy = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: cx, y: cy, id: 1 }] });
  await send('touchStart', x, y);
  const n = path.steps ?? 10;
  for (let i = 1; i <= n; i++) await send('touchMove', x + (dx * i) / n, y + (dy * i) / n);
  if (path.back !== undefined) for (let i = 1; i <= 10; i++) await send('touchMove', x + dx + ((path.back - dx) * i) / 10, y + dy);
  if (path.pause) await page.waitForTimeout(path.pause);
  if (end === 'hold') return () => send('touchCancel');
  await send(end === 'cancel' ? 'touchCancel' : 'touchEnd');
  return undefined;
}
