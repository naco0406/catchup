// 보드의 화면 틀(.bd-frame[id])을 한 장씩 PNG 로 찍어요. 핀은 숨겨요.
// 쓰는 법: PW=<playwright 폴더> node tools/frames.mjs <board.html 절대 경로> <outDir> [prefix]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);
const [,, board, out, prefix=''] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file://' + board);
await p.evaluate(() => document.fonts.ready);
await p.addStyleTag({ content: '.bd-pin,.bd-pinbox{display:none!important}' });
const ids = await p.$$eval('.bd-frame[id]', els => els.map(e => e.id));
for (const id of ids) { await p.locator('#' + id).screenshot({ path: `${out}/${prefix}${id}.png` }); }
console.log(ids.join(' '));
await b.close();
