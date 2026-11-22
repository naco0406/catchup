// 지금 밀기 화면을 찍어요(예시 자료 모드 · 진짜 터치). 쓰는 법은 ../README.md
import { test } from '../../../../apps/web/node_modules/@playwright/test/index.mjs';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { start } from '../../../../apps/web/e2e/helpers';
const OUT = path.resolve(__dirname, '../shots');
const probes: Record<string, unknown> = {};
test.afterAll(() => writeFileSync(OUT + '/probe.json', JSON.stringify(probes, null, 2)));

async function touch(page, sel, dx) {
  const b = (await page.locator('[data-card] ' + sel).boundingBox())!;
  const x = dx > 0 ? Math.max(b.x + 40, 60) : b.x + b.width - 40, y = b.y + b.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 12, y, id: 1 }] });
  await page.waitForTimeout(150);
  return () => cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
}
const rect = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: s.font, radius: s.borderRadius, transform: s.transform, shadow: s.boxShadow.slice(0, 80) }; }, sel);

for (const [dev, width, height] of [['phone', 390, 844], ['pad', 1194, 834]] as const) {
  test(dev, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, baseURL: 'http://127.0.0.1:5180' });
    const page = await ctx.newPage(); await start(page, 'ko'); await page.waitForTimeout(700);
    const shot = async (name: string, sels: Record<string, string>) => {
      await page.screenshot({ path: OUT + '/' + dev + '-' + name + '.png' });
      probes[dev + '-' + name] = Object.fromEntries(await Promise.all(Object.entries(sels).map(async ([k, s]) => [k, await rect(page, s)])));
    };
    const parts = { card: '[data-card]', rec: '[data-card] .cu-opt.rec', guide: '.swipe-guide', hint: '.swipe-under', dock: '.phone-dock', acts: '.cu-pacts, .cu-acts', ask: '[data-card] .cu-ask', prev: '[data-card] .cu-prev' };
    await shot('rest', parts);
    let end = await touch(page, '.cu-ask', 64); await shot('right-part', parts); await end(); await page.waitForTimeout(400);
    end = await touch(page, '.cu-ask', 150); await shot('right-armed', parts); await end(); await page.waitForTimeout(400);
    end = await touch(page, '.cu-ask', -150); await shot('left-armed', parts); await end(); await page.waitForTimeout(400);
    // 놓은 직후
    const cdp = await ctx.newCDPSession(page);
    const b = (await page.locator('[data-card] .cu-ask').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 40, y: b.y + 20, id: 1 }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + 40 + 220 * i / 12, y: b.y + 20, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(60); await shot('after-60ms', { card: '[data-card]', toast: '.cu-toast' });
    await page.waitForTimeout(600); await shot('after', { card: '[data-card]', toast: '.cu-toast' });
    // 위험한 카드
    for (let i = 0; i < 3; i++) { await page.locator('[data-card] button.cu-opt.rec').click(); await page.waitForTimeout(350); }
    await page.waitForTimeout(400);
    end = await touch(page, '.cu-ask', 150); await shot('risky', { ...parts, foot: '.cu-foot' }); await end();
  });
}
