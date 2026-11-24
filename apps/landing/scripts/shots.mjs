// 소개 페이지의 그림을 실제 앱에서 찍어요. 손으로 그린 화면은 쓰지 않아요.
// 쓰는 법: apps/web 개발 서버를 띄우고(pnpm dev, 5180) → pnpm --filter @catchup/landing shots
// 다른 주소: CATCHUP_APP=http://127.0.0.1:5180/ pnpm --filter @catchup/landing shots
// 결과: src/shots/<en|ko>/<이름>.webp 와 sizes.json(그림 자리를 미리 잡는 CSS 크기)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.CATCHUP_APP ?? 'http://127.0.0.1:5180/';
const SAY = { en: 'I have a wedding on Saturday', ko: '토요일은 결혼식이 있어' };

// 덱의 처음 일곱 장은 c01~c07 이에요. S(미루기)로 한 장씩 넘겨서 원하는 카드를 앞에 세워요
const CARDS = [
  { name: 'cal', skip: 2, id: 'c03' },
  { name: 'code', skip: 1, id: 'c02' },
  { name: 'risk', skip: 4, id: 'c05' },
  { name: 'words', skip: 3, id: 'c04', say: true },
  { name: 'fail', skip: 6, id: 'c07' },
];

const browser = await chromium.launch();

async function open(lang, hash, viewport, scale = 2) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale, reducedMotion: 'reduce', locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
  await page.goto(`${APP}?lang=${lang}&start=1&reset=1${hash}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page;
}

// 브라우저의 canvas 인코더로 PNG 를 WebP 로(따로 깔 도구 없이)
async function webp(page, png) {
  const b64 = await page.evaluate(async src => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.9).split(',')[1];
  }, png.toString('base64'));
  return Buffer.from(b64, 'base64');
}

async function shoot(page, locator, file, sizes, name) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${name}: 찍을 곳이 화면에 없어요`);
  sizes[name] = [Math.round(box.width), Math.round(box.height)];
  fs.writeFileSync(file, await webp(page, await locator.screenshot({ omitBackground: true, animations: 'disabled' })));
}

for (const lang of ['en', 'ko']) {
  const out = path.join(here, '..', 'src', 'shots', lang);
  fs.mkdirSync(out, { recursive: true });
  const sizes = {};

  // 휴대폰에서 보일 그림은 휴대폰 화면째로 찍어요(넓게 찍은 카드를 줄이면 글자가 너무 작아져요). 이름 끝에 -m
  const phoneShot = async (page, name) => {
    await page.mouse.move(0, 0);
    sizes[name] = [390, 844];
    fs.writeFileSync(path.join(out, `${name}.webp`), await webp(page, await page.screenshot({ animations: 'disabled' })));
  };
  for (const [c, phone] of CARDS.flatMap(c => [[c, false], [c, true]])) {
    const page = await open(lang, '#/catchup', phone ? { width: 390, height: 844 } : { width: 1100, height: 1300 });
    for (let i = 0; i < c.skip; i++) { await page.keyboard.press('s'); await page.waitForTimeout(450); }
    // 미룬 알림이 남지 않게 다시 읽어요(미룬 카드는 저장돼 있어서 원하는 카드가 앞에 그대로 있어요)
    await page.reload({ waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
    const card = page.locator(`.cu-card[data-card="${c.id}"]`);
    await card.waitFor();
    if (c.say) {
      const input = (phone ? page : card).locator('.cu-composer input').filter({ visible: true }).first();   // 휴대폰에서는 입력창이 카드 밖 아래에 붙어요
      await input.fill(SAY[lang]);
      await input.press('Enter');
      await page.waitForTimeout(1200);
    }
    if (phone) await phoneShot(page, `${c.name}-m`);
    else { await page.mouse.move(0, 0); await shoot(page, card, path.join(out, `${c.name}.webp`), sizes, c.name); }
    await page.close();
  }

  // 알아 두세요: 화면 제목, 덱의 첫 장, 아래 단추 줄까지(덱이 작은 카드라 화면째로)
  {
    const page = await open(lang, '#/fyi', { width: 860, height: 340 });
    const main = page.locator('main.cu-main');
    await page.locator('.cu-deck .cu-card').first().waitFor();
    await shoot(page, main, path.join(out, 'fyi.webp'), sizes, 'fyi');
    await page.close();
    const small = await open(lang, '#/fyi', { width: 390, height: 844 });
    await small.locator('.cu-deck .cu-card').first().waitFor();
    await phoneShot(small, 'fyi-m');
    await small.close();
  }

  // 처리 기록: 본문 칸
  {
    const page = await open(lang, '#/activity', { width: 960, height: 620 });
    const main = page.locator('main.cu-main');
    await main.waitFor();
    await page.addStyleTag({ content: 'main.cu-main{background:var(--cu-bg-canvas)}' });
    await shoot(page, main, path.join(out, 'log.webp'), sizes, 'log');
    await page.close();
    const small = await open(lang, '#/activity', { width: 390, height: 844 });
    await small.locator('main.cu-main').waitFor();
    await phoneShot(small, 'log-m');
    await small.close();
  }

  // 휴대폰 화면 한 장: 아침의 첫 카드
  {
    const page = await open(lang, '#/catchup', { width: 390, height: 844 }, 3);
    await page.locator('.cu-card[data-card="c01"]').waitFor();
    const png = await page.screenshot({ animations: 'disabled' });
    sizes.phone = [390, 844];
    fs.writeFileSync(path.join(out, 'phone.webp'), await webp(page, png));
    await page.close();
  }

  fs.writeFileSync(path.join(out, 'sizes.json'), JSON.stringify(sizes, null, 2) + '\n');
  console.log(`✓ ${lang}: ${Object.keys(sizes).length}장`);
}

await browser.close();
