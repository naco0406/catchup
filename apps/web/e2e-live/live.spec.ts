import { expect, test, type Page } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hold } from '../e2e/helpers';
import { fileURLToPath } from 'node:url';
import { fakeClipboard, noOverflow } from '../e2e/helpers';

const root = fileURLToPath(new URL('../../..', import.meta.url));
function local(args: string[], input = ''): string {
  const r = spawnSync('zsh', ['infra/local/local.sh', ...args], { cwd: root, input, encoding: 'utf8', timeout: 90_000 });
  if (r.status !== 0) throw new Error(r.stderr.slice(-600));
  return r.stdout.trim();
}
const sql = (q: string) => local(['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'catchup_owner', '-d', 'catchup', '-Atc', q]);

type Effect = Record<string, unknown>;
const option = (label: string, effect: Effect, risk = 'low') => ({ label, detail: '', done: `${label} — 했어요`, risk, effect });
const card = (question: string, options: object[], extra: object = {}) => ({
  dedupe_key: randomUUID(), kind: 'reply', source: { type: 'local', from: '서연', org: '시험' }, source_ref: randomUUID(), source_version: '1',
  question, options, reply_path: 'send', ...extra,
});
const send = (text: string) => ({ kind: 'send', to: '서연', text });

/** 시험 계정으로 로그인 화면을 거쳐 들어가요 */
async function signIn(page: Page, cards: object[]) {
  const email = `e2e-${randomUUID()}@example.test`;
  const cell = local(['ops', 'provision', email, 'ko']);
  const seed = (more: object[]) => local(['ops', 'seed', email], JSON.stringify(more));
  if (cards.length) seed(cards);
  const code = local(['ops', 'login-code', email]);
  await fakeClipboard(page);
  await page.goto('/?lang=ko');
  await page.getByRole('textbox', { name: '이메일' }).fill(email);
  await page.getByRole('textbox', { name: '코드' }).fill(code);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const sent = () => sql(`SELECT coalesce(string_agg(effect->>'text', '|' ORDER BY created_at), '') FROM catchup.local_effects WHERE cell = '${cell}' AND NOT reverted`);
  return { cell, seed, sent };
}
const opt = (page: Page, i: number) => page.locator(`[data-card] button.cu-opt[data-opt="${i}"]`);
const question = (page: Page) => page.locator('[data-card] .cu-ask');
const toActivity = (page: Page) => page.evaluate(() => { location.hash = '#/activity'; });
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

test('고르고 고친 글이 그대로 실행되고 영수증이 남아요', async ({ page }) => {
  const me = await signIn(page, [card('어느 안으로 할까요?', [option('B안', send('B안으로 갈게요')), option('A안', send('A안으로 갈게요'))])]);
  await page.locator('[data-card] .cu-prev').getByRole('button', { name: '2번의 글 보기' }).click();
  await page.locator('[data-card] .cu-prev .h button').click();
  await page.locator('[data-card] .cu-prev textarea').fill('A안으로 부탁드려요');
  await opt(page, 1).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  expect(me.sent()).toBe('');
  await toActivity(page);
  await expect.poll(() => me.sent(), { timeout: 20_000 }).toBe('A안으로 부탁드려요');
  await expect(page.getByText('A안 — 했어요')).toBeVisible();
  await expect(page.locator('.cu-row').filter({ hasText: 'A안 — 했어요' }).getByRole('button', { name: '되돌리기' })).toHaveCount(0, { timeout: 15_000 });
  await noOverflow(page);
});

test('답 둘이 각자 10초를 기다리고, 새로 고쳐도 되돌릴 수 있어요', async ({ page }) => {
  const me = await signIn(page, [card('첫 카드', [option('첫 답', send('첫 글'))]), card('둘째 카드', [option('둘째 답', send('둘째 글'))])]);
  await expect(question(page)).toHaveText('첫 카드');
  await opt(page, 0).click();
  await expect(question(page)).toHaveText('둘째 카드');
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.reload();
  await toActivity(page);
  await expect(page.getByText('아직 되돌릴 수 있어요')).toHaveCount(2);
  await page.locator('.cu-row').filter({ hasText: '첫 답 — 했어요' }).getByRole('button', { name: '되돌리기' }).click();
  await expect.poll(() => me.sent(), { timeout: 20_000 }).toBe('둘째 글');
});

test('위험한 답은 꾹 눌러야 서버까지 가요', async ({ page }) => {
  const me = await signIn(page, [card('운영에 돌릴까요?', [option('거절해요', { kind: 'none' }), option('한 번 허용해요', send('허용'), 'production')], { risk: 'production' })]);
  await opt(page, 1).click();
  await expect(opt(page, 1)).toHaveClass(/confirm/);
  expect(sql(`SELECT count(*) FROM catchup.card_answers WHERE cell = '${me.cell}'`)).toBe('0');
  await hold(page, opt(page, 1));
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await expect.poll(() => sql(`SELECT count(*) FROM catchup.card_answers WHERE cell = '${me.cell}'`)).toBe('1');
});

test('복사는 바로 되고, 되돌리면 카드가 돌아와요', async ({ page }) => {
  await signIn(page, [card('엄마께 뭐라고 할까요?', [option('6시', { kind: 'copy', to: '엄마', text: '6시에 갈게요' }), option('12시', { kind: 'copy', to: '엄마', text: '12시에 갈게요' })], { reply_path: 'draft_copy' })]);
  await opt(page, 1).click();
  await expect.poll(() => copied(page)).toEqual(['12시에 갈게요']);
  await page.locator('.cu-toast:visible').getByRole('button', { name: '되돌리기' }).first().click();
  await expect(question(page)).toHaveText('엄마께 뭐라고 할까요?');
});

test('말로 답하면 서버가 만든 선택지로 그 말이 실행돼요', async ({ page }, info) => {
  const me = await signIn(page, [card('언제 만날까요?', [option('토요일', send('토요일에 봬요'))])]);
  const input = info.project.name === 'iphone' ? page.locator('.phone-dock input') : page.locator('[data-card] .cu-composer input');
  await input.fill('일요일에 봬요');
  await input.press('Enter');
  await expect(opt(page, 0)).toContainText('말씀하신 대로');
  await opt(page, 0).click();
  await expect.poll(() => me.sent(), { timeout: 20_000 }).toBe('일요일에 봬요');
});

test('새 카드는 새로 고치지 않아도 와요', async ({ page }) => {
  const me = await signIn(page, []);
  await expect(page.getByText('다 봤어요')).toBeVisible();
  me.seed([card('방금 온 카드', [option('알겠어요', { kind: 'none' })])]);
  await expect(question(page)).toHaveText('방금 온 카드', { timeout: 5_000 });
});

test('원본이 바뀌면 실행하지 않고 다시 물어요', async ({ page }) => {
  const ref = randomUUID();
  const me = await signIn(page, [card('이대로 보낼까요?', [option('보내요', send('낡은 글'))], { source_ref: ref })]);
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  sql(`INSERT INTO catchup.local_sources (cell, ref, version) VALUES ('${me.cell}', '${ref}', '2')`);
  await expect(page.getByText('그사이 원본이 바뀌어서')).toBeVisible({ timeout: 20_000 });
  expect(me.sent()).toBe('');
});

test('미룬 카드를 다시 꺼내고, 알려만을 카드로 올려요', async ({ page }, info) => {
  const news = { ...card('배포가 끝났어요', []), kind: 'fyi', reply_path: 'none' };
  await signIn(page, [card('나중에 볼 카드', [option('알겠어요', { kind: 'none' })]), news]);
  await expect(question(page)).toHaveText('나중에 볼 카드');
  if (info.project.name === 'iphone') await page.locator('.phone-dock').getByRole('button', { name: '미루기' }).click();
  else await page.locator('.cu-acts').getByRole('button', { name: /미루기/ }).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/snoozed'; });
  await page.getByRole('button', { name: '지금 보기' }).click();
  await expect(question(page)).toHaveText('나중에 볼 카드');
  await page.evaluate(() => { location.hash = '#/fyi'; });
  await page.getByRole('button', { name: '카드로', exact: true }).click();
  await expect(page.locator('.cu-row').filter({ hasText: '배포가 끝났어요' })).toHaveCount(0);
  await noOverflow(page);
});

test('로그아웃하면 카드가 남지 않아요', async ({ page }) => {
  await signIn(page, [card('내 카드', [option('알겠어요', { kind: 'none' })])]);
  await expect(question(page)).toHaveText('내 카드');
  const menu = page.locator('.cu-top .menu');
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: '로그아웃' }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'CatchUp에 로그인' })).toBeVisible();
  await expect(question(page)).toHaveCount(0);
});

// 밀기(Q7) — 진짜 터치, 진짜 서버
async function swipe(page: Page, dx: number, during?: () => Promise<void>, target = question(page)) {
  await page.waitForTimeout(350);
  const box = (await target.boundingBox())!;
  const x = dx > 0 ? Math.max(box.x + 12, 24) : box.x + box.width - 12, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', px = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y, id: 1 }] });
  await send('touchStart', x);
  for (let i = 1; i <= 10; i++) await send('touchMove', x + (dx * i) / 10);
  await during?.();
  await send('touchEnd');
}

test('오른쪽으로 밀면 추천이 서버에서 실행되고, 왼쪽으로 밀면 미뤄져요', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', '터치 기기');
  const me = await signIn(page, [card('첫 카드', [option('추천', send('추천한 글')), option('다른 답', send('다른 글'))]), card('둘째 카드', [option('알겠어요', send('보내면 안 되는 글'))])]);
  await expect(question(page)).toHaveText('첫 카드');
  await swipe(page, 220);
  await expect(question(page)).toHaveText('둘째 카드');
  await swipe(page, -220);
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await expect.poll(() => me.sent(), { timeout: 20_000 }).toBe('추천한 글');
  expect(sql(`SELECT state FROM catchup.decision_cards WHERE cell = '${me.cell}' ORDER BY question`).split('\n').sort()).toEqual(['answered', 'snoozed']);
});

test('미는 사이 추천이 바뀌면 놓아도 정해지지 않아요', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', '터치 기기');
  const me = await signIn(page, [card('바뀔 카드', [option('처음 추천', send('처음 글')), option('바뀐 추천', send('바뀐 글'))])]);
  await expect(question(page)).toHaveText('바뀔 카드');
  await swipe(page, 220, async () => {
    sql(`UPDATE catchup.decision_cards SET recommended = 1, version = version + 1 WHERE cell = '${me.cell}'`);
    me.seed([{ ...card('새 소식', []), kind: 'fyi', reply_path: 'none' }]); // 화면이 다시 읽게
    await expect(opt(page, 1)).toHaveClass(/rec/, { timeout: 8_000 });
  });
  await page.waitForTimeout(800);
  await expect(question(page)).toHaveText('바뀔 카드');
  expect(sql(`SELECT count(*) FROM catchup.card_answers WHERE cell = '${me.cell}'`)).toBe('0');
});

test('답하자마자 화면을 닫아도 그 답은 서버에 남아요', async ({ page }) => {
  const me = await signIn(page, [card('마지막 카드', [option('추천', send('닫아도 나갈 글'))])]);
  await expect(question(page)).toHaveText('마지막 카드');
  // 서버가 2초 늦게 받는 것처럼 이 시험 카드만 잠가요
  const hold = spawn('zsh', ['infra/local/local.sh', 'compose', 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'catchup_owner', '-d', 'catchup', '-Atc',
    `BEGIN; SELECT id FROM catchup.decision_cards WHERE cell = '${me.cell}' FOR UPDATE; SELECT pg_sleep(2); COMMIT;`], { cwd: root, stdio: 'ignore' });
  const released = new Promise(done => hold.on('exit', done));
  await expect.poll(() => sql("SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%" + me.cell + "%pg_sleep%' AND pid <> pg_backend_pid()")).not.toBe('0');
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.goto('about:blank');
  await released;
  await expect.poll(() => sql(`SELECT count(*) FROM catchup.card_answers WHERE cell = '${me.cell}'`), { timeout: 6_000 }).toBe('1');
});

test('알려만 드려요를 읽으면 서버에 읽음으로 남고, 되돌리면 다시 열려요', async ({ page }, info) => {
  const fyi = (title: string) => ({ ...card(title, []), kind: 'fyi', reply_path: 'none' });
  const me = await signIn(page, [fyi('첫 소식'), fyi('둘째 소식')]);
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/fyi'; });
  const news = page.locator('[data-fyi] .cu-ask');
  await expect(news).toHaveText('첫 소식');
  const state = (title: string) => sql(`SELECT state FROM catchup.decision_cards WHERE cell = '${me.cell}' AND question = '${title}'`);
  if (info.project.name === 'desktop') await page.keyboard.press('ArrowRight');
  else await swipe(page, 220, undefined, news);
  await expect(news).toHaveText('둘째 소식');
  await expect.poll(() => state('첫 소식')).toBe('read');
  expect(sql(`SELECT kind FROM catchup.card_answers WHERE cell = '${me.cell}'`)).toBe('read');
  await page.locator('.cu-toast:visible').getByRole('button', { name: '되돌리기' }).first().click();
  await expect(news).toHaveText('첫 소식');
  await expect.poll(() => state('첫 소식')).toBe('open');
  await page.reload();
  await expect(news).toHaveText('첫 소식'); // 새로 고쳐도 그대로
});

test('같은 사람의 다음 카드에 지난 결정이 붙어 오고, 지우면 다음부터 쓰지 않아요', async ({ page }) => {
  const me = await signIn(page, [card('견적은 어느 안으로 할까요?', [option('B안으로 진행해요', send('B안으로 갈게요'))])]);
  await expect(question(page)).toHaveText('견적은 어느 안으로 할까요?');
  await expect(page.locator('[data-card] .recall')).toHaveCount(0);
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  me.seed([card('계약서 초안을 확인할까요?', [option('확인해요', send('확인했어요'))])]);
  await expect(question(page)).toHaveText('계약서 초안을 확인할까요?');
  await expect(page.locator('[data-card] .recall')).toContainText('B안으로 진행해요');

  await page.evaluate(() => { location.hash = '#/memory'; });
  const known = page.locator('[data-memory]').filter({ hasText: 'B안으로 진행해요' });
  await expect(known).toBeVisible();
  // 직접 알려 주고, 고치고
  await page.getByRole('textbox', { name: '직접 알려 주기' }).fill('서연 님께는 늘 존댓말로 써 주세요');
  await page.getByRole('button', { name: '직접 알려 주기' }).click();
  const told = page.locator('[data-memory]').filter({ hasText: '늘 존댓말로' });
  await expect(told).toBeVisible();
  await told.getByRole('button', { name: '고치기' }).click();
  await page.getByRole('textbox', { name: '고치기' }).fill('서연 님께는 반말도 괜찮아요');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.locator('[data-memory]').filter({ hasText: '반말도 괜찮아요' })).toContainText('내가 고쳤어요');
  // 지우면 카드에서도 사라져요
  await known.getByRole('button', { name: '지우기' }).click();
  await expect(known).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/catchup'; });
  await page.reload();
  await expect(question(page)).toHaveText('계약서 초안을 확인할까요?');
  await expect(page.locator('[data-card] .recall')).toHaveCount(0);
  expect(sql(`SELECT state FROM catchup.memory_edits WHERE cell = '${me.cell}' AND state = 'forgotten'`)).toBe('forgotten');
});

test('비서에게 한 말은 모델이 없어도 남고, 그대로 기억해 두거나 되돌릴 수 있어요', async ({ page }) => {
  const me = await signIn(page, []);
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/assistant'; });
  await expect(page.locator('.talk-examples button')).toHaveCount(4);
  await page.getByRole('textbox', { name: '비서에게 말하기' }).fill('서연 님 메일은 세 문장 안으로 써 줘');
  await page.getByRole('button', { name: '보내기' }).click();
  const turn = page.locator('[data-talk]').filter({ hasText: '세 문장 안으로' });
  await expect(turn).toBeVisible();
  // 시험 계정은 모델에 연결돼 있지 않아요 — 실패해도 말은 남아요
  await expect(turn).toHaveAttribute('data-talk', 'failed', { timeout: 20_000 });
  await expect(turn).toContainText('Codex(ChatGPT)가 연결돼 있지 않아요');
  await noOverflow(page);
  await turn.getByRole('button', { name: '그대로 기억해 둬요' }).click();
  await expect(turn).toContainText('기억에 넣었어요');
  expect(sql(`SELECT text FROM catchup.memory_notes WHERE cell = '${me.cell}'`)).toBe('서연 님 메일은 세 문장 안으로 써 줘');

  await turn.getByRole('button', { name: '아는 것 보기' }).click();
  await expect(page.locator('[data-memory]').filter({ hasText: '세 문장 안으로' })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/assistant'; });
  await page.locator('[data-talk]').getByRole('button', { name: '되돌리기' }).click();
  await expect(page.locator('[data-talk]')).toContainText('기억에서 지웠어요');
  await page.evaluate(() => { location.hash = '#/memory'; });
  await expect(page.getByText('아직 아는 것이 없어요')).toBeVisible();
  expect(sql(`SELECT count(*) FROM catchup.agent_sessions WHERE cell = '${me.cell}'`)).toBe('0');
});

test('내가 보낸 글의 약속이 맨 위 칸에 보이고, 같은 사람의 다음 카드에 붙어요', async ({ page }) => {
  const me = await signIn(page, [card('견적서는 언제 주실 수 있나요?', [option('금요일까지 보내요', send('금요일까지 견적서 보내 드릴게요'))])]);
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  // 약속을 뽑는 것은 모델이라(시험 계정은 연결돼 있지 않아요) 뽑힌 결과를 넣어요
  sql(`INSERT INTO catchup.memory_promises (cell, answer, text, due) SELECT cell, id, '견적서 보내기', '2026-11-27' FROM catchup.card_answers WHERE cell = '${me.cell}'`);
  me.seed([card('계약서도 같이 주실 수 있나요?', [option('같이 보내요', send('같이 보낼게요'))])]);
  await expect(question(page)).toHaveText('계약서도 같이 주실 수 있나요?');
  await expect(page.locator('[data-card] .recall').filter({ hasText: '견적서 보내기' })).toContainText('11월 27일까지');
  await page.evaluate(() => { location.hash = '#/memory'; });
  await expect(page.locator('section').first()).toHaveAttribute('data-kind', 'promise');
  await expect(page.locator('[data-kind="promise"] [data-memory]')).toContainText('약속했어요: “견적서 보내기”, 11월 27일까지');
  await noOverflow(page);
});

test('비서에게 말한 카드는 눌러야 그 말이 전해지고, 답은 카드에서 골라요', async ({ page }) => {
  const me = await signIn(page, [card('리뷰는 몇 시에 할까요?', [option('11시로 해요', send('11시에 해요'))]), card('견적은 어느 안으로 할까요?', [option('A안으로 진행해요', send('A안으로 갈게요'))])]);
  await expect(question(page)).toHaveText('리뷰는 몇 시에 할까요?');
  // 갈래를 고르는 것은 모델이라(시험 계정은 연결돼 있지 않아요) 고른 결과를 넣어요
  sql(`INSERT INTO catchup.assistant_messages (cell, request_key, said, state, intent, reply, card, answered_at) SELECT cell, gen_random_uuid(), '견적은 B안으로 한다고 해 줘', 'done', 'card', '이 카드에 그렇게 답할까요?', id, now() FROM catchup.decision_cards WHERE cell = '${me.cell}' AND question = '견적은 어느 안으로 할까요?'`);
  await page.evaluate(() => { location.hash = '#/assistant'; });
  const turn = page.locator('[data-talk][data-intent="card"]');
  await expect(turn).toContainText('견적은 어느 안으로 할까요?');
  await noOverflow(page);
  await turn.getByRole('button', { name: '이 말로 답해요' }).click();
  // 그 카드가 맨 앞으로 오고, 내 말이 '말씀하신 대로'로 서요. 아직 아무것도 나가지 않았어요
  await expect(question(page)).toHaveText('견적은 어느 안으로 할까요?');
  await expect(page.locator('[data-card] .cu-said')).toHaveText('견적은 B안으로 한다고 해 줘');
  expect(await me.sent()).toBe('');
  await opt(page, 0).click();
  await expect.poll(me.sent, { timeout: 20_000 }).toBe('견적은 B안으로 한다고 해 줘');
});

test('덱에서 바로 비서에게 말하면 보고 있던 카드가 같이 가고, 카드에는 아무 일도 없어요', async ({ page }) => {
  const me = await signIn(page, [card('계약서는 어느 안 기준인가요?', [option('B안 기준이에요', send('B안 기준이에요'))])]);
  await expect(question(page)).toHaveText('계약서는 어느 안 기준인가요?');
  await page.locator('[data-talk-open]').click();
  const sheet = page.getByRole('dialog', { name: '비서에게 말하기' });
  // 지금 보는 카드를 알려 주고, 입력창에 바로 쓸 수 있어요
  await expect(sheet.locator('.talk-seen')).toContainText('서연');
  await expect(sheet.locator('.talk-seen')).toContainText('계약서는 어느 안 기준인가요?');
  await expect(sheet.getByRole('textbox')).toBeFocused();
  await noOverflow(page);
  const box = await sheet.boundingBox();
  const view = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(view.width);
  expect(box!.y).toBeGreaterThanOrEqual(0);

  await sheet.getByRole('textbox').fill('이 분께는 늘 세 문장 안으로 써 줘');
  await sheet.getByRole('button', { name: '보내기' }).click();
  const turn = sheet.locator('[data-talk]');
  // 시험 계정은 모델에 연결돼 있지 않아요 — 말과 보고 있던 카드는 남아요
  await expect(turn).toHaveAttribute('data-talk', 'failed', { timeout: 20_000 });
  expect(sql(`SELECT d.question FROM catchup.assistant_messages m JOIN catchup.decision_cards d ON d.cell = m.cell AND d.id = m.seen_card WHERE m.cell = '${me.cell}'`)).toBe('계약서는 어느 안 기준인가요?');
  await turn.getByRole('button', { name: '그대로 기억해 둬요' }).click();
  await expect(turn).toContainText('서연에 대한 것으로 기억했어요');
  expect(sql(`SELECT subject || '|' || text FROM catchup.memory_notes WHERE cell = '${me.cell}'`)).toBe('서연|이 분께는 늘 세 문장 안으로 써 줘');
  await noOverflow(page);

  // Esc 로 닫으면 덱 그대로예요. 카드에는 말이 가지 않았고, 아무것도 나가지 않았어요
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-talk-open]')).toBeFocused();
  await expect(question(page)).toHaveText('계약서는 어느 안 기준인가요?');
  await expect(page.locator('[data-card] .cu-said')).toHaveCount(0);
  expect(await me.sent()).toBe('');
  // A 로 다시 열면 방금 주고받은 것이 그대로 있어요. 열려 있는 동안 덱의 단축키는 쉬어요
  await page.keyboard.press('a');
  await expect(sheet.locator('[data-talk]')).toContainText('세 문장 안으로');
  await sheet.getByRole('button', { name: '닫기' }).focus();
  await page.keyboard.press('1');
  await page.keyboard.press('ArrowRight');
  await expect(question(page)).toHaveText('계약서는 어느 안 기준인가요?');
  await sheet.getByRole('button', { name: '주고받은 것 모두 보기' }).click();
  await expect(page.locator('.talk [data-talk]')).toContainText('세 문장 안으로');
  await expect(sheet).toHaveCount(0);
});

test('약속한 날이 되면 카드로 올라오고, 아무것도 보내지 않아요', async ({ page }) => {
  const me = await signIn(page, [card('견적서는 언제 주실 수 있나요?', [option('오늘 보내요', send('오늘까지 견적서 보내 드릴게요'))])]);
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  sql(`INSERT INTO catchup.memory_promises (cell, answer, text, due) SELECT cell, id, '견적서 보내기', current_date - 1 FROM catchup.card_answers WHERE cell = '${me.cell}'`);
  await expect(question(page)).toContainText('‘견적서 보내기’', { timeout: 20_000 });
  await expect(question(page)).toContainText('하기로 한 약속이에요. 했나요?');
  await noOverflow(page);
  await opt(page, 0).click();
  await expect(page.getByText('다 봤어요')).toBeVisible();
  await page.waitForTimeout(11_000);
  expect(await me.sent()).toBe('오늘까지 견적서 보내 드릴게요');
  expect(sql(`SELECT count(*) FROM catchup.decision_cards WHERE cell = '${me.cell}' AND dedupe_key LIKE 'promise:%'`)).toBe('1');
});

// 패스키는 https 나 localhost 에서만 돼요(IP 주소에는 묶을 수 없어요). 로컬에서는 localhost 로 열어요
test.describe('패스키', () => {
  test.use({ baseURL: process.env.CATCHUP_WEB ?? 'http://localhost:5181' });

  test('패스키를 등록하면 코드 없이 로그인하고, 지우면 그 열쇠로는 못 들어와요', async ({ page }) => {
    // 브라우저의 가짜 인증 장치 — 얼굴 · 지문 확인을 늘 통과시켜요
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const count = (cell: string) => sql(`SELECT count(*) FROM front.passkeys WHERE cell = '${cell}'`);

    // 등록한 패스키가 없을 때 눌러도 들어가지지 않아요
    await page.goto('/?lang=ko');
    await expect(page.getByRole('button', { name: '패스키로 로그인' })).toBeVisible();
    await noOverflow(page);

    const me = await signIn(page, [card('패스키로 들어와도 보이나요?', [option('네', send('네'))])]);
    await expect(question(page)).toHaveText('패스키로 들어와도 보이나요?');
    await page.evaluate(() => { location.hash = '#/connections'; });
    await expect(page.getByText('얼굴 · 지문으로 로그인해요')).toBeVisible();
    await page.getByRole('button', { name: '패스키 추가' }).click();
    const row = page.locator('[data-passkey]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('아직 쓰지 않았어요');
    expect(count(me.cell)).toBe('1');
    await noOverflow(page);
    // 같은 기기에 두 번 만들지 않아요
    await page.getByRole('button', { name: '패스키 추가' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '이미 등록돼 있어요' })).toBeVisible();
    expect(count(me.cell)).toBe('1');

    // 로그아웃한 것처럼 쿠키를 지우고 — 이메일도 코드도 없이 들어와요
    await page.context().clearCookies();
    await page.reload();
    await expect(page.getByRole('textbox', { name: '코드' })).toBeVisible();
    await page.getByRole('button', { name: '패스키로 로그인' }).click();
    // 새로 고쳐도 보던 화면(연결)으로 돌아와요
    await expect(row).toContainText('마지막 사용');
    await page.evaluate(() => { location.hash = '#/catchup'; });
    await expect(question(page)).toHaveText('패스키로 들어와도 보이나요?');
    await page.evaluate(() => { location.hash = '#/connections'; });

    // 지우면 그 열쇠로는 못 들어와요
    await row.getByRole('button', { name: '지우기' }).click();
    await expect(row).toHaveCount(0);
    expect(count(me.cell)).toBe('0');
    await page.context().clearCookies();
    await page.reload();
    await page.getByRole('button', { name: '패스키로 로그인' }).click();
    await expect(page.getByRole('alert')).toContainText('패스키를 찾지 못했어요');
    await expect(page.getByRole('textbox', { name: '코드' })).toBeVisible();
  });
});
