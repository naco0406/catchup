#!/usr/bin/env node
// 지금 화면을 찍어요. 쓰는 법(레포 뿌리에서):
//   source docs/design/simple-ui/env.sh && node docs/design/simple-ui/harness/shoot.mjs [example|out|in] [장 이름,…]
// 먼저 개발 서버 둘이 떠 있어야 해요: 예시 모드 5180(pnpm --dir apps/web dev) · 실제 모드 5181(dev:live, 로컬 서버 필요).
// 실제 모드 계정은 shots-…@example.test 로 새로 만들어요. 로그인 쿠키는 레포 밖(TMP)에 둬요.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const out = path.resolve(here, '../shots');
const tmp = process.env.SHOOT_TMP ?? path.join(os.tmpdir(), 'catchup-simple-ui');
fs.mkdirSync(tmp, { recursive: true });
const S = process.env.S;
if (!S) { console.error('먼저 source docs/design/simple-ui/env.sh'); process.exit(2); }

// 스킬의 capture.mjs 를 두 군데만 고쳐 써요: 실제 모드는 SSE 가 늘 열려 있어 networkidle 이 오지 않고, 아이폰 장은 터치 기기로 띄워요
const src = fs.readFileSync(path.join(S, 'capture.mjs'), 'utf8')
  .replace("from './_pw.mjs'", `from '${pathToFileURL(path.join(S, '_pw.mjs')).href}'`)
  .replace("from './_anchor.mjs'", `from '${pathToFileURL(path.join(S, '_anchor.mjs')).href}'`)
  .replace("waitUntil: 'networkidle'", "waitUntil: cfg.waitUntil ?? 'networkidle'")
  .replace("locale: cfg.locale ?? 'ko-KR'", "hasTouch: !!shot.touch, isMobile: !!shot.touch, locale: cfg.locale ?? 'ko-KR'");
const capture = path.join(tmp, 'capture.patched.mjs');
fs.writeFileSync(capture, src);

const WIDE = [1440, 900], PAD = [1194, 834], PHONE = [390, 844];
const press = (k, wait = 500) => ({ press: k, wait });
const go = hash => ({ eval: `location.hash = '#/${hash}'`, wait: 500 });
const ex = (lang, hash = '') => `/?lang=${lang}&start=1${hash ? '#/' + hash : ''}`;

// ── 예시 모드(5180) ──
const example = {
  baseUrl: 'http://127.0.0.1:5180', viewport: WIDE, scale: 2, waitFor: 'css=.cu-main',
  shots: [
    { name: 'first-wide', path: '/?lang=en', waitFor: 'css=.cu-connect', displayScale: 0.5,
      pins: [{ n: 6, loc: 'css=.cu-promise', at: 'left' }] },
    { name: 'first-phone', path: '/?lang=en', waitFor: 'css=.cu-connect', viewport: PHONE, touch: true },
    { name: 'deck-wide', path: ex('en'), waitFor: 'css=[data-card]', settle: 1200,
      displayScale: 0.5, pins: [{ n: 1, loc: 'css=.cu-side', at: 'right' }, { n: 2, loc: 'css=.cu-steps', at: 'right' }, { n: 3, loc: 'css=.cu-top .tools', at: 'bottom' },
        { n: 4, loc: 'css=[data-card] .cu-prev', at: 'right' }, { n: 5, loc: 'css=.cu-acts .act-r', at: 'right' }],
      probe: { '사이드바': 'css=.cu-side', '사이드바 줄': 'css=.cu-nav >> nth=1', '사이드바 줄(선택)': 'css=.cu-nav.on', '위 막대': 'css=.cu-top', '카드': 'css=[data-card]', '질문': 'css=[data-card] .cu-ask', '추천 답': 'css=[data-card] .cu-opt.rec', '답': 'css=[data-card] .cu-opt >> nth=1', '아래 단추': 'css=.cu-acts .cu-btn >> nth=0', '덱': 'css=.cu-deck', '단계': 'css=.cu-step >> nth=0' } },
    { name: 'deck-pad', path: ex('en'), waitFor: 'css=[data-card]', viewport: PAD, settle: 1200, touch: true, displayScale: 0.5, pins: [{ n: 8, loc: 'css=.cu-side .proto', at: 'right' }] },
    { name: 'deck-phone', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, settle: 4000, touch: true,   // 처음 한 번 살짝 밀어 보이는 움직임이 끝난 뒤에 찍어요
      probe: { '위 막대': 'css=.cu-top', '카드': 'css=[data-card]', '도크': 'css=.phone-dock', '아래 단추': 'css=.cu-pacts button >> nth=0', '입력창': 'css=.phone-dock .cu-composer' } },
    // 둘째 카드(답의 이름이 길어 두 줄이 돼요) — 답 줄이 여러 줄일 때의 모습
    { name: 'deck-phone-c02', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 3500 }, press('1'), { wait: 14000 }] },
    { name: 'deck-toast-wide', path: ex('en'), waitFor: 'css=[data-card]', actions: [{ wait: 900 }, press('1', 900)] },
    { name: 'deck-toast-phone', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, { click: 'css=[data-card] button.cu-opt.rec', wait: 900 }] },
    { name: 'deck-risky-wide', path: ex('en'), waitFor: 'css=[data-card]', displayScale: 0.5, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('1'), { wait: 10800 }, press('2', 600)], pins: [{ n: 7, loc: 'css=[data-card] .cu-foot', at: 'right' }] },
    { name: 'deck-risky-pad', path: ex('en'), waitFor: 'css=[data-card]', viewport: PAD, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('1'), { wait: 10800 }, press('2', 600)] },
    { name: 'deck-risky-phone', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('1'), { wait: 10800 }] },
    { name: 'list-wide', path: ex('en'), waitFor: 'css=[data-card]', actions: [{ wait: 900 }, press('s', 600), { click: 'css=.cu-top .tools button >> nth=-1', wait: 5600 }] },
    { name: 'fyi-wide', path: ex('en', 'fyi'), waitFor: 'css=[data-fyi]', settle: 1200 },
    { name: 'fyi-phone', path: ex('en', 'fyi'), waitFor: 'css=[data-fyi]', viewport: PHONE, touch: true, settle: 1200 },
    { name: 'snoozed-wide', path: ex('en'), waitFor: 'css=[data-card]', actions: [{ wait: 900 }, press('s', 700), press('s', 700), go('snoozed'), { wait: 5200 }] },
    { name: 'activity-wide', path: ex('en'), waitFor: 'css=[data-card]', actions: [{ wait: 900 }, press('1'), press('1'), press('s', 700), go('activity'), { wait: 10500 }] },
    { name: 'memory-wide', path: ex('en'), waitFor: 'css=[data-card]', actions: [{ wait: 900 }, press('1'), press('1'), press('1'), go('memory'), { wait: 10500 }],
      displayScale: 0.5, pins: [{ n: 6, loc: 'css=.memory .cu-foot', at: 'left' }] },
    { name: 'memory-phone', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), go('memory'), { wait: 10500 }] },
    { name: 'done-pad', path: ex('en'), waitFor: 'css=[data-card]', viewport: PAD, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('s', 700), press('1'), press('1'), press('1'), press('1'), { wait: 10800 }] },
    { name: 'done-wide', path: ex('en'), waitFor: 'css=[data-card]', actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('s', 700), press('1'), press('1'), press('1'), press('1'), { wait: 10800 }] },
    { name: 'done-phone', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('s', 700), press('1'), press('1'), press('1'), press('1'), { wait: 10800 }] },
    { name: 'drawer-phone', path: ex('en'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, { click: 'css=.cu-top .menu', wait: 700 }] },
    { name: 'drawer-pad-portrait', path: ex('en'), waitFor: 'css=[data-card]', viewport: [834, 1194], touch: true, actions: [{ wait: 900 }, { click: 'css=.cu-top .menu', wait: 700 }] },
    // 한국어 — 깨지는 곳 확인용
    { name: 'ko-deck-wide', path: ex('ko'), waitFor: 'css=[data-card]', settle: 1200 },
    { name: 'ko-deck-phone', path: ex('ko'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, settle: 1200 },
    { name: 'ko-first-phone', path: '/?lang=ko', waitFor: 'css=.cu-connect', viewport: PHONE, touch: true },
    { name: 'ko-memory-phone', path: ex('ko'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, press('1'), press('1'), go('memory'), { wait: 10500 }] },
    { name: 'ko-done-phone', path: ex('ko'), waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, press('1'), press('1'), press('1'), press('s', 700), press('1'), press('1'), press('1'), press('1'), { wait: 10800 }] },
    { name: 'ko-fyi-phone', path: ex('ko', 'fyi'), waitFor: 'css=[data-fyi]', viewport: PHONE, touch: true, settle: 1200 },
  ],
};

// ── 실제 모드(5181) ──
const live = (shots, cookies) => ({ baseUrl: 'http://127.0.0.1:5181', viewport: WIDE, scale: 2, waitUntil: 'load', waitFor: 'css=.cu-main', ...(cookies ? { cookies } : {}), shots });
const liveOut = live([
  { name: 'login-wide', path: '/?lang=en', waitFor: 'css=.login' },
  { name: 'login-phone', path: '/?lang=en', waitFor: 'css=.login', viewport: PHONE, touch: true },
  { name: 'ko-login-phone', path: '/?lang=ko', waitFor: 'css=.login', viewport: PHONE, touch: true },
]);
const liveIn = cookies => live([
  { name: 'live-deck-wide', path: '/?lang=en', waitFor: 'css=[data-card]', settle: 1500 },
  { name: 'live-deck-pad', path: '/?lang=en', waitFor: 'css=[data-card]', viewport: PAD, touch: true, settle: 1500 },
  { name: 'live-deck-phone', path: '/?lang=en', waitFor: 'css=[data-card]', viewport: PHONE, touch: true, settle: 1500 },
  { name: 'live-drawer-phone', path: '/?lang=en', waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, { click: 'css=.cu-top .menu', wait: 700 }] },
  { name: 'talk-sheet-wide', path: '/?lang=en', waitFor: 'css=[data-card]', actions: [{ wait: 900 }, { click: 'css=[data-talk-open]', wait: 900 }],
    displayScale: 0.5, pins: [{ n: 6, loc: 'css=.talk-sheet .talk-empty .cu-sub', at: 'left' }] },
  { name: 'talk-sheet-phone', path: '/?lang=en', waitFor: 'css=[data-card]', viewport: PHONE, touch: true, actions: [{ wait: 900 }, { click: 'css=[data-talk-open]', wait: 900 }] },
  { name: 'assistant-wide', path: '/?lang=en#/assistant', waitFor: 'css=.talk-dock', settle: 1200,
    displayScale: 0.5, pins: [{ n: 6, loc: 'css=.talk-dock .cu-foot', at: 'left' }] },
  { name: 'assistant-pad', path: '/?lang=en#/assistant', waitFor: 'css=.talk-dock', viewport: PAD, settle: 1200 },
  { name: 'connections-pad', path: '/?lang=en#/connections', waitFor: 'css=.conn', viewport: PAD, settle: 1500 },
  { name: 'assistant-phone', path: '/?lang=en#/assistant', waitFor: 'css=.talk-dock', viewport: PHONE, touch: true, settle: 1200 },
  { name: 'ko-assistant-phone', path: '/?lang=ko#/assistant', waitFor: 'css=.talk-dock', viewport: PHONE, touch: true, settle: 1200 },
  { name: 'sessions-wide', path: '/?lang=en#/sessions', waitFor: 'css=.cu-page', settle: 1500 },
  { name: 'sessions-phone', path: '/?lang=en#/sessions', waitFor: 'css=.cu-page', viewport: PHONE, touch: true, settle: 1500 },
  { name: 'connections-wide', path: '/?lang=en#/connections', waitFor: 'css=.conn', settle: 1500,
    displayScale: 0.5, pins: [{ n: 6, loc: 'css=.conn-note >> nth=0', at: 'left' }] },
  { name: 'connections-phone', path: '/?lang=en#/connections', waitFor: 'css=.conn', viewport: PHONE, touch: true, settle: 1500 },
  { name: 'ko-connections-phone', path: '/?lang=ko#/connections', waitFor: 'css=.conn', viewport: PHONE, touch: true, settle: 1500 },
  { name: 'live-memory-wide', path: '/?lang=en#/memory', waitFor: 'css=.memory', settle: 1200 },
  { name: 'live-fyi-wide', path: '/?lang=en#/fyi', waitFor: 'css=.cu-main', settle: 1500 },
], cookies);

// ── 실제 모드 계정: 만들고 · 카드를 넣고 · 로그인해 쿠키를 받아요 ──
function local(args, input = '') {
  const r = spawnSync('zsh', ['infra/local/local.sh', ...args], { cwd: root, input, encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr.slice(-600)}`);
  return r.stdout.trim();
}
const opt = (label, detail, effect, risk = 'low') => ({ label, detail, done: `${label}`, risk, effect });
const card = (source, question, body, options, extra = {}) => ({ dedupe_key: randomUUID(), kind: 'reply', source, source_ref: randomUUID(), source_version: '1', question, body, options, reply_path: 'send', ...extra });
const SEED = [
  card({ type: 'gmail', from: 'Seoyeon Park', org: 'Hanbit Design · Gmail · 8:12 AM' }, 'Rebrand quote: go with plan A or plan B?',
    { due: 'Reply by 6 PM today', summary: [{ strong: 'A: $11,200 · 6 weeks', text: ' — logo and 5 detail screens, 2 rounds of edits' }, { strong: 'B: $8,700 · 4 weeks', text: ' — logo and 3 detail screens, 1 round of edits' }, { text: 'The budget set in October is $9,800. Launch is Jan 12.', dim: true }], evidence: ['3 emails', 'quote_hanbit_v2.pdf', 'Q4 budget'] },
    [opt('Go with plan B', 'Fits the budget and leaves two weeks before launch', { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we’d like to go ahead with plan B. Send over the contract draft and I’ll review it this week.' }),
      opt('Go with plan A', '$1,400 over budget', { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we’d like to go ahead with plan A.' }, 'money'),
      opt('Ask if plan A can fit $9,800', 'You’ll get a new card when they reply', { kind: 'send', to: 'Seoyeon', text: 'Hi Seoyeon, we like plan A, but our budget is $9,800. Could you trim the scope to fit?' })],
    { waiting: true }),
  card({ type: 'slack', from: 'Dohyun Lee', org: '#design · Slack · 8:40 AM' }, 'Onboarding mockups: which direction?',
    { due: 'This morning', summary: [{ text: 'Dohyun posted two mockups and asked for a pick this morning.' }], evidence: ['4 messages', '2 mockups'] },
    [opt('Go with mockup 2', 'Cuts the flow to three steps', { kind: 'send', to: 'Dohyun', text: 'Dohyun, let’s go with mockup 2. I like the shorter flow.' }), opt('Go with mockup 1', 'Closer to the current screen', { kind: 'send', to: 'Dohyun', text: 'Dohyun, let’s go with mockup 1.' })],
    { waiting: true }),
  card({ type: 'codex', from: 'Codex', org: 'shop repo · Add a column to orders' }, 'Run this command on the production database?',
    { due: 'Changes production data', context: { kind: 'command', cmd: '$ pnpm db:migrate --env production' }, summary: [{ text: 'Adds a “retry count” column to the orders table. Nothing is deleted.' }, { text: 'A rollback script is included. It hasn’t run on staging yet.', dim: true }] },
    [opt('Decline', 'Codex skips this step and carries on', { kind: 'none' }), opt('Allow just this once', 'Runs on production now', { kind: 'none' }, 'production')],
    { risk: 'production' }),
  { ...card({ type: 'slack', from: 'Slack', org: '#product' }, '#product — December launch is set for Dec 9', {}, []), kind: 'fyi', reply_path: 'none' },
  { ...card({ type: 'github', from: 'GitHub', org: 'shop' }, '3 PRs merged, and the nightly deploy went fine', {}, []), kind: 'fyi', reply_path: 'none' },
];
async function account() {
  const file = path.join(tmp, 'live-account-en.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const email = `shots-simple-en-${Date.now().toString(36)}@example.test`;
  local(['ops', 'provision', email, 'en']);   // 계정 언어도 영어로 — 서버가 만드는 글이 영어로 와요
  local(['ops', 'seed', email], JSON.stringify(SEED));
  const code = local(['ops', 'login-code', email]);
  const r = await fetch('http://127.0.0.1:4320/v1/auth/session', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5181' }, body: JSON.stringify({ email, code, label: 'shots' }) });
  if (r.status !== 204) throw new Error(`로그인 ${r.status}`);
  const [name, ...rest] = r.headers.get('set-cookie').split(';')[0].split('=');
  const acc = { email, cookies: [{ name, value: rest.join('='), httpOnly: true, sameSite: 'Strict' }] };
  fs.writeFileSync(file, JSON.stringify(acc));
  return acc;
}

const [which = 'example', only] = process.argv.slice(2);
const cfg = which === 'example' ? example : which === 'out' ? liveOut : liveIn((await account()).cookies);
const file = path.join(tmp, `shots-${which}.json`);
fs.writeFileSync(file, JSON.stringify(cfg));
const r = spawnSync('node', [capture, file, out], { cwd: root, stdio: 'inherit', env: { ...process.env, ...(only ? { ONLY: only } : {}) } });
// 장마다 보고서가 덮이지 않게 모드별로 남겨요
if (fs.existsSync(path.join(out, 'capture-report.json'))) fs.renameSync(path.join(out, 'capture-report.json'), path.join(out, `capture-report-${which}.json`));
process.exit(r.status ?? 1);
