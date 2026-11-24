// 실제 컨테이너를 HTTP 로 처음부터 끝까지: 로그인 · SSE · 10초 · 한 번만 · 강제 종료 뒤 이어 가기 · 칸 경계 · 측정.
// 쓰는 법: node services/api/tests/live.mjs   (먼저 zsh infra/local/local.sh up)
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const API = 'http://127.0.0.1:4320', ORIGIN = 'http://127.0.0.1:5180';
const run = `${Date.now()}`;
let failed = 0;
const ok = (cond, name, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const local = (args, input) => {
  const r = spawnSync('zsh', ['infra/local/local.sh', ...args], { cwd: root, input: input ?? '', encoding: 'utf8', timeout: 90_000 });
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr.slice(-600)}`);
  return r.stdout.trim();
};
const sql = q => local(['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'catchup_owner', '-d', 'catchup', '-Atc', q]);

const card = (key, text = 'B안으로 진행할게요', extra = {}) => ({
  dedupe_key: key, kind: 'reply', source: { type: 'local', from: '시험' }, source_ref: key, source_version: '1', question: '어느 쪽으로 할까요?',
  options: [
    { label: '첫째', done: '첫째로 답했어요', effect: { kind: 'send', to: '시험', text } },
    { label: '둘째', done: '둘째로 답했어요', effect: { kind: 'send', to: '시험', text: `${text}(둘째)` } },
  ],
  reply_path: 'send', ...extra,
});

async function device(name) {
  const email = `${name}-${run}@example.test`;
  const cell = local(['ops', 'provision', email, 'ko']);
  const code = local(['ops', 'login-code', email]);
  const r = await fetch(`${API}/v1/auth/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email, code, label: 'live test' }) });
  if (r.status !== 204) throw new Error(`login ${r.status}`);
  const cookie = r.headers.get('set-cookie');
  const session = cookie.split(';')[0];
  const call = async (method, path, body, origin = ORIGIN) => {
    const res = await fetch(`${API}${path}`, { method, headers: { cookie: session, 'content-type': 'application/json', origin }, body: body && JSON.stringify(body) });
    const t = await res.text();
    let json; try { json = JSON.parse(t); } catch { json = null; }
    return { status: res.status, json };
  };
  return { email, cell, cookie, session, call, seed: cards => local(['ops', 'seed', email], JSON.stringify(cards)), open: async () => (await call('GET', '/v1/me/cards')).json.cards };
}
const body = (c, extra = {}) => ({ request_key: randomUUID(), version: c.version, turn_seq: 0, option: 0, surface: 'web', ...extra });
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)];

const me = await device('live'), other = await device('other');
ok(/HttpOnly/.test(me.cookie) && /SameSite=Strict/.test(me.cookie), '세션 쿠키는 HttpOnly · SameSite=Strict');
ok((await fetch(`${API}/v1/me/cards`)).status === 401, '로그인 없이는 못 봐요');
ok((await me.call('POST', `/v1/me/cards/${randomUUID()}/undo`, {}, 'https://evil.example')).status === 403, '다른 사이트에서는 못 써요');

// 언어 잇기: 화면의 언어가 계정의 언어가 돼요. 내 칸만 바뀌고, 모르는 언어는 받지 않아요
ok((await me.call('GET', '/v1/me')).json.lang === 'ko', '만든 언어 그대로');
ok((await me.call('PUT', '/v1/me', { lang: 'en' })).status === 204 && (await me.call('GET', '/v1/me')).json.lang === 'en', '언어를 바꿔요');
ok((await other.call('GET', '/v1/me')).json.lang === 'ko', '남의 언어는 그대로');
ok((await me.call('PUT', '/v1/me', { lang: 'fr' })).status === 422 && (await me.call('GET', '/v1/me')).json.lang === 'en', '모르는 언어는 안 받아요');
ok((await fetch(`${API}/v1/me`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: '{"lang":"en"}' })).status === 401, '로그인 없이는 못 바꿔요');
ok((await me.call('PUT', '/v1/me', { lang: 'ko' })).status === 204, '되돌려요');

// 답 요청의 지연
const N = 100;
me.seed(Array.from({ length: N }, (_, i) => card(`latency-${run}-${i}`)));
const open = await me.open(), answerMs = [];
ok(open.length === N, '손으로 넣은 카드가 목록에', `${open.length}`);
for (const c of open) {
  const t = performance.now();
  const r = await me.call('POST', `/v1/me/cards/${c.id}/answer`, body(c));
  answerMs.push(performance.now() - t);
  if (r.status !== 200) ok(false, '답', r.status);
}

// 10초 · 되돌리기 · 같은 요청 두 번 · 칸 경계
me.seed([card(`undo-${run}`)]);
let [c] = await me.open();
ok((await other.open()).length === 0, '다른 칸에는 안 보여요');
ok((await other.call('POST', `/v1/me/cards/${c.id}/answer`, body(c))).status === 404, '다른 칸에서 답 못 해요');
const first = body(c);
const [a, b] = await Promise.all([me.call('POST', `/v1/me/cards/${c.id}/answer`, first), me.call('POST', `/v1/me/cards/${c.id}/answer`, first)]);
ok(a.status === 200 && b.status === 200 && a.json.id === b.json.id, '같은 요청 두 번 = 영수증 하나');
ok(a.json.remaining_ms > 9000 && a.json.remaining_ms <= 10000, '10초를 기다려요', a.json.remaining_ms);
ok((await me.call('POST', `/v1/me/cards/${c.id}/undo`, { receipt: a.json.id })).status === 200, '10초 안에 되돌려요');
await sleep(11_500);
ok(sql(`SELECT count(*) FROM catchup.local_effects WHERE id = '${a.json.id}'`) === '0', '되돌린 것은 나가지 않았어요');
ok(sql(`SELECT count(*) FROM catchup.local_effects WHERE cell = '${me.cell}'`) === String(N), '나머지는 하나씩 나갔어요');

// SSE: 다른 기기의 변화가 닿는 시간(커밋 응답부터가 아니라 요청을 보낸 때부터)
const stream = await fetch(`${API}/v1/me/cards/stream`, { headers: { cookie: me.session } });
ok(stream.status === 200, 'SSE 연결');
const waiters = new Map();
const reading = (async () => {
  const dec = new TextDecoder(); let buf = '';
  try {
    for await (const chunk of stream.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const data = buf.slice(0, i).split('\n').find(l => l.startsWith('data:')); buf = buf.slice(i + 2);
        if (data) waiters.get(JSON.parse(data.slice(5)).card)?.(performance.now());
      }
    }
  } catch { /* 끝에서 닫아요 */ }
})();
me.seed(Array.from({ length: 50 }, (_, i) => card(`sse-${run}-${i}`)));
await sleep(700); waiters.clear();
const sseMs = [];
for (const x of (await me.open()).filter(x => x.version === 1)) {
  const got = new Promise(r => waiters.set(x.id, r));
  const t = performance.now();
  await me.call('POST', `/v1/me/cards/${x.id}/handoff`, { request_key: randomUUID(), version: x.version, surface: 'web' });
  const at = await Promise.race([got, sleep(3000, null)]);
  if (at === null) ok(false, 'SSE 사건을 놓침'); else sseMs.push(at - t);
  waiters.delete(x.id);
}
await stream.body.cancel().catch(() => undefined);
ok(sseMs.length === 50, 'SSE 로 변화 50개', sseMs.length);

// 강제 종료 뒤 이어 가기: 기다리는 동안 일꾼 · 서버를 죽여요
me.seed([card(`restart-${run}`)]);
c = (await me.open()).find(x => x.version === 1);
const r = (await me.call('POST', `/v1/me/cards/${c.id}/answer`, body(c))).json;
local(['compose', 'kill', '-s', 'SIGKILL', 'api', 'worker']);
await sleep(11_000);
ok(sql(`SELECT state FROM catchup.action_receipts WHERE id = '${r.id}'`) === 'waiting', '죽어 있는 동안엔 기다려요');
const restartedAt = performance.now();
local(['compose', 'start', 'api', 'worker']);
let readyMs = null, resumedMs = null;
while (performance.now() - restartedAt < 30_000 && (readyMs === null || resumedMs === null)) {
  if (readyMs === null && (await fetch(`${API}/health/ready`).then(x => x.status === 204, () => false))) readyMs = performance.now() - restartedAt;
  if (readyMs !== null) {
    const row = (await me.call('GET', '/v1/me/activity')).json?.find?.(x => x.receipt === r.id);
    if (row?.receipt_state === 'succeeded') resumedMs = performance.now() - restartedAt;
  }
  await sleep(100);
}
ok(resumedMs !== null, '다시 켜면 이어서 실행돼요', `${Math.round(resumedMs)}ms`);
await sleep(2000);
ok(sql(`SELECT count(*) FROM catchup.local_effects WHERE id = '${r.id}'`) === '1', '다시 켜도 한 번만');
ok((await me.call('POST', `/v1/me/cards/${c.id}/undo`, { receipt: r.id })).status === 409, '보낸 뒤엔 되돌리기 거절');

// 원본이 바뀌면
me.seed([card(`stale-${run}`)]);
c = (await me.open()).find(x => x.version === 1);
const s = (await me.call('POST', `/v1/me/cards/${c.id}/answer`, body(c))).json;
sql(`INSERT INTO catchup.local_sources (cell, ref, version) VALUES ('${me.cell}', 'stale-${run}', '2')`);
await sleep(11_500);
ok(sql(`SELECT count(*) FROM catchup.local_effects WHERE id = '${s.id}'`) === '0', '원본이 바뀌면 실행 안 해요');
ok((await me.open()).find(x => x.id === c.id)?.body.notice === 'source_changed', '카드가 고쳐져 다시 올라와요');

await me.call('DELETE', '/v1/auth/session');
ok((await me.call('GET', '/v1/me')).status === 401, '로그아웃');

const ms = v => Math.round(v * 10) / 10;
console.log('MEASURE', JSON.stringify({
  answer: { n: answerMs.length, p50: ms(pct(answerMs, .5)), p95: ms(pct(answerMs, .95)), max: ms(Math.max(...answerMs)) },
  sse: { n: sseMs.length, p50: ms(pct(sseMs, .5)), p95: ms(pct(sseMs, .95)), max: ms(Math.max(...sseMs)) },
  restart: { api_ready: ms(readyMs), action_resumed: ms(resumedMs) },
}));
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
