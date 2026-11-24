import { expect, test, type Page } from '@playwright/test';
import { drag, start } from './helpers';

// Q7(2026-11-22 고침): 오른쪽 = 추천대로 · 처리됨, 왼쪽 = 미루기. 진짜 터치(CDP)로 봐요 —
// 선택지 위에서 밀기 시작해도, 브라우저가 터치를 가져가도(취소) 엉뚱한 답이 나가면 안 돼요.
const card = (page: Page) => page.locator('[data-card]');
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

const root = (page: Page) => page.locator('.cu-main');
const toast = (page: Page) => page.locator('.cu-toast:visible').first();
const cssVar = (page: Page, sel: string, name: string) => page.locator(sel).first().evaluate((e, n) => Number(getComputedStyle(e).getPropertyValue(n)), name);

async function at(page: Page, id: string) {
  while ((await card(page).getAttribute('data-card')) !== id) {
    const now = await card(page).getAttribute('data-card');
    await page.locator('[data-card] button.cu-opt.rec').click();
    await expect(card(page)).not.toHaveAttribute('data-card', now!);
  }
}
async function activity(page: Page) { await page.evaluate(() => { location.hash = '#/activity'; }); }
async function untouched(page: Page, id = 'c01') {
  await page.waitForTimeout(500);
  await expect(card(page)).toHaveAttribute('data-card', id);
  await activity(page);
  await expect(page.getByText('아직 되돌릴 수 있어요')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => { await start(page); });

test.describe('터치로 밀기', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name === 'desktop', '터치 기기'); });

  test('오른쪽으로 밀면 추천대로 정해지고 바로 덱에서 빠져요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 220);
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await activity(page);
    await expect(page.getByText('박서연 님께 A안을 예산에 맞출 수 있는지 여쭤봤어요')).toBeVisible();
    await expect(page.getByText('아직 되돌릴 수 있어요')).toHaveCount(1);
  });

  test('잘못 밀어도 되돌리면 카드가 돌아와요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 220);
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await page.locator('.cu-toast:visible').getByRole('button', { name: '되돌리기' }).first().click();
    await expect(card(page)).toHaveAttribute('data-card', 'c01');
  });

  test('다른 선택지 위에서 밀기 시작해도 추천대로예요', async ({ page }) => {
    await at(page, 'c04');
    await drag(page, '[data-card] button.cu-opt[data-opt="2"]', 220);
    await expect(card(page)).toHaveAttribute('data-card', 'c05');
    expect((await copied(page))).toHaveLength(1);
    expect((await copied(page))[0]).toContain('6시');
  });

  test('선택지 위에서 왼쪽으로 밀면 고르지 않고 미뤄요', async ({ page }) => {
    await drag(page, '[data-card] button.cu-opt[data-opt="2"]', -220);
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await activity(page);
    await expect(page.getByText(/^미뤘어요: 리브랜딩/)).toBeVisible();
    await expect(page.getByText('아직 되돌릴 수 있어요')).toHaveCount(0);
  });

  test('미는 동안 추천 답 줄이 차오르고, 놓으면 일어날 일이 토스트 자리에 서요', async ({ page }) => {
    await page.locator('[data-card] .cu-prev').getByRole('button', { name: '2번의 글 보기' }).click();
    const cancel = await drag(page, '[data-card] .cu-ask', 200, 'hold');
    await expect(root(page)).toHaveAttribute('data-pull', 'right');
    await expect(root(page)).toHaveAttribute('data-armed', '');
    await expect(toast(page)).toContainText('놓으면 박서연에게 보내요');
    await expect(toast(page)).toContainText('서연 님, A안이 마음에 드는데'); // 나갈 글의 첫머리(추천은 돈이 걸리면 되묻기, 2026-11-23)
    await expect(page.locator('[data-card] .cu-fill .cu-opt.picked')).toBeVisible();
    expect(await cssVar(page, '[data-card]', '--f')).toBe(1);
    await expect(page.locator('[data-card] .cu-prev p')).toContainText('A안이 마음에 드는데'); // 보여 준 글 = 나가는 글
    await cancel!();
    await expect(root(page)).not.toHaveAttribute('data-pull', /.+/);
  });

  test('덜 밀었을 때는 얼마나 남았는지 보여요', async ({ page }) => {
    const cancel = await drag(page, '[data-card] .cu-ask', 50, 'hold', 0, { pause: 100 });
    await expect(root(page)).toHaveAttribute('data-pull', 'right');
    await expect(root(page)).not.toHaveAttribute('data-armed', '');
    await expect(toast(page)).toContainText('박서연에게 답장을 보내요');
    const p = await cssVar(page, '.cu-main', '--p');
    expect(p).toBeGreaterThan(0.2); expect(p).toBeLessThan(0.8);
    await cancel!();
  });

  test('미는 동안 다음 카드가 뒤에 보이고, 누를 수는 없어요', async ({ page }) => {
    await expect(page.locator('.deck-next')).toHaveAttribute('inert', '');
    const cancel = await drag(page, '[data-card] .cu-ask', 200, 'hold');
    await expect(page.locator('.deck-next')).toContainText('결제 재시도를 어디에서');
    await cancel!();
  });

  test('놓으면 카드가 나가는 모습이 남고, 다음 카드는 제자리에 있어요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 220);
    await expect(page.locator('.deck-ghost')).toHaveCount(1);
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await expect(page.locator('.card-enter [data-card]')).toHaveCount(0); // 뒤에 있던 카드라 다시 떠오르지 않아요
    await expect(page.locator('.deck-ghost')).toHaveCount(0);
  });

  test('짧아도 빠르게 튕기면 넘어가요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 60, 'release', 0, { steps: 3 }); // 60을 세 걸음에 — 손가락으로 튕기는 속도
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
  });

  test('문턱을 넘었다가 도로 당겨 놓으면 아무 일도 없어요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 200, 'release', 0, { back: 30, pause: 150 });
    await untouched(page);
  });

  test('위험한 카드는 조금 따라오다 버티고, 이유를 말해요', async ({ page }) => {
    await at(page, 'c05');
    const cancel = await drag(page, '[data-card] .cu-ask', 200, 'hold');
    await expect(root(page)).toHaveAttribute('data-pull', 'blocked');
    await expect(toast(page)).toContainText('밀어서 정할 수 없어요');
    const moved = await page.locator('[data-card]').evaluate(e => new DOMMatrix(getComputedStyle(e).transform).m41);
    expect(moved).toBeGreaterThan(4); expect(moved).toBeLessThanOrEqual(24);
    await cancel!();
    await expect(card(page)).toHaveAttribute('data-card', 'c05');
  });

  test('미룬 뒤 토스트에서 되돌리면 카드가 돌아와요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', -220);
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await toast(page).getByRole('button', { name: '되돌리기' }).click();
    await expect(card(page)).toHaveAttribute('data-card', 'c01');
  });

  test('조금 밀다 놓으면 아무 일도 없어요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 60, 'release', 0, { pause: 150 }); // 멈췄다 놓기
    await untouched(page);
  });

  test('밀다가 터치가 취소되면 아무 일도 없어요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 220, 'cancel');
    await untouched(page);
  });

  test('위아래로 읽는 동안에는 밀리지 않아요', async ({ page }) => {
    await drag(page, '[data-card] .cu-ask', 40, 'release', 160);
    await untouched(page);
  });

  test('고친 초안 그대로 나가요', async ({ page }) => {
    await at(page, 'c04');
    await page.locator('[data-card] .cu-prev .h button').click();
    await page.locator('[data-card] .cu-prev textarea').fill('엄마, 6시 반에 갈게요!');
    await page.locator('[data-card] .cu-prev .h button').click();
    await drag(page, '[data-card] .cu-ask', 220);
    await expect.poll(() => copied(page)).toEqual(['엄마, 6시 반에 갈게요!']);
  });

  for (const dx of [220, -220]) {
    test(`위험한 카드는 ${dx > 0 ? '오른쪽' : '왼쪽'}으로도 안 밀려요`, async ({ page }) => {
      await at(page, 'c05');
      await drag(page, '[data-card] .cu-ask', dx);
      await page.waitForTimeout(500);
      await expect(card(page)).toHaveAttribute('data-card', 'c05');
    });
  }

  test('카드 안에 안내 글이 없고, 처음 한 번만 카드가 살짝 다녀와요', async ({ page }) => {
    await expect(page.locator('[data-card] .swipe-guide')).toHaveCount(0);
    const nudged = () => expect.poll(() => cssVar(page, '.cu-main', '--p'), { timeout: 3000, intervals: [40] }).toBeGreaterThan(0.1);
    await nudged();
    await drag(page, '[data-card] .cu-ask', 220);
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await page.reload();
    await expect(card(page)).toBeVisible();
    await expect(nudged()).rejects.toThrow();
  });
});

test.describe('키로 밀기', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name === 'iphone', '키보드는 아이패드 · 데스크톱'); });

  test('→ 추천대로 · ← 미루기', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await page.keyboard.press('ArrowLeft');
    await expect(card(page)).toHaveAttribute('data-card', 'c03');
  });

  test('키를 누르고 있어도 한 장만 정해져요', async ({ page }) => {
    for (const key of ['ArrowRight', 'Enter']) {
      const before = (await card(page).getAttribute('data-card'))!;
      await page.keyboard.down(key);
      await expect(card(page)).not.toHaveAttribute('data-card', before);
      const next = (await card(page).getAttribute('data-card'))!;
      for (let i = 0; i < 3; i++) await page.keyboard.down(key); // 누르고 있기(repeat)
      await page.keyboard.up(key);
      await page.waitForTimeout(250);
      await expect(card(page)).toHaveAttribute('data-card', next);
    }
  });

  test('위험한 카드는 화살표로 안 넘어가요', async ({ page }) => {
    await at(page, 'c05');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await expect(card(page)).toHaveAttribute('data-card', 'c05');
  });
});

test.describe('단추의 자리가 방향이에요', () => {
  const acts = (page: Page, phone: boolean) => page.locator(phone ? '.phone-dock .cu-pacts' : '.cu-acts');

  test('왼쪽은 미루기, 오른쪽은 추천대로', async ({ page }, info) => {
    const a = acts(page, info.project.name === 'iphone');
    const names = await a.getByRole('button').allInnerTexts();
    expect(names[0]).toContain('미루기'); expect(names.at(-1)).toContain('되물어요'); // 오른쪽 단추는 추천 답의 이름을 말해요
    await a.getByRole('button', { name: /^추천:/ }).click();
    await expect(card(page)).toHaveAttribute('data-card', 'c02');
    await activity(page);
    await expect(page.getByText('박서연 님께 A안을 예산에 맞출 수 있는지 여쭤봤어요')).toBeVisible();
  });

  test('위험한 카드에는 추천대로 단추가 없어요', async ({ page }, info) => {
    await at(page, 'c05');
    const a = acts(page, info.project.name === 'iphone');
    await expect(a.getByRole('button', { name: /미루기/ })).toBeVisible();
    await expect(a.getByRole('button', { name: /^추천:/ })).toHaveCount(0);
  });
});
