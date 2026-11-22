// screens-<lang>.html 의 화면 틀을 한 장씩 찍어 WebP 로 바꿔요(브라우저의 canvas 인코더 — Pillow 없이).
// 쓰는 법: PW=<playwright> node shoot.mjs <lang> <outDir>
import { createRequire } from 'module'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const { chromium } = require(process.env.PW);
const here = path.dirname(fileURLToPath(import.meta.url)); const [,, lang, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file://' + path.join(here, `screens-${lang}.html`)); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
const ids = await p.$$eval('.bd-frame[id]', els => els.map(e => e.id));
const overflow = await p.$$eval('.bd-frame[id] *', els => els.filter(e => { const s = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && (s.overflow === 'hidden' || s.textOverflow === 'ellipsis' || s.overflowX === 'hidden'); }).map(e => (e.closest('.bd-frame').id) + ':' + (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 30)).slice(0, 20));
if (overflow.length) console.log('넘침:', overflow.join('\n  '));
const sizes = {};
for (const id of ids) {
  const box = await p.locator('#' + id).boundingBox(); sizes[id] = [Math.round(box.width), Math.round(box.height)];
  const png = await p.locator('#' + id).screenshot({ omitBackground: true }); // 둥근 모서리 바깥을 투명하게
  const webp = await p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.9).split(',')[1];
  }, png.toString('base64'));
  fs.writeFileSync(path.join(out, id + '.webp'), Buffer.from(webp, 'base64'));
}
fs.writeFileSync(path.join(out, 'sizes.json'), JSON.stringify(sizes));
console.log(`✓ ${lang}: ${ids.length}장`);
await b.close();
