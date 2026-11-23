// 홈 화면 아이콘(PNG)을 로고에서 구워요 — 아이폰은 홈 화면에 추가한 웹 앱에만 알림을 줘요.
// 쓰는 법: node apps/web/scripts/app-icons.mjs   (바탕 · 여백은 디자인 시스템의 캔버스 색과 로고 그대로)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const mark = readFileSync(`${here}/public/mark.svg`, 'utf8').replace(/<title>.*?<\/title>/, '');
const browser = await chromium.launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  // 가운데 64% — 안드로이드의 둥근 틀(maskable)에 잘리지 않는 안전 구역 안이에요
  await page.setContent(`<body style="margin:0;display:grid;place-items:center;height:100vh;background:#FAFAF9"><div style="width:64%;height:64%">${mark.replace('width="64" height="64"', 'width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: `${here}/public/icon-${size}.png` });
  await page.close();
}
await browser.close();
