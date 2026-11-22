// 진짜 OpenAI 에서 기기 코드를 받고 바로 취소해요. 로그인은 끝내지 않고, 코드는 찍지 않아요.
// 쓰는 법: node services/api/tests/codex-login.mjs   (먼저 zsh infra/local/local.sh up)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const API = 'http://127.0.0.1:4320';
let failed = 0;
const ok = (cond, name, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const run = args => spawnSync('zsh', ['infra/local/local.sh', ...args], { cwd: root, encoding: 'utf8', timeout: 90_000 });
const local = args => {
  const r = run(args);
  if (r.status !== 0) throw new Error(r.stderr.slice(-500));
  return r.stdout.trim();
};
const sql = q => local(['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'catchup_owner', '-d', 'catchup', '-Atc', q]);

async function device(name) {
  const email = `${name}-${Date.now()}@example.test`;
  const cell = local(['ops', 'provision', email]);
  const code = local(['ops', 'login-code', email]);
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:5181' };
  const r = await fetch(`${API}/v1/auth/session`, { method: 'POST', headers, body: JSON.stringify({ email, code }) });
  headers.cookie = r.headers.get('set-cookie').split(';')[0];
  const call = (method, path) => fetch(`${API}/v1/me/codex${path}`, { method, headers });
  const until = async (states, ms = 45_000) => {
    const end = Date.now() + ms;
    let s;
    do {
      const res = await call('GET', '');
      s = await res.json();
      s.cache = res.headers.get('cache-control');
      if (states.includes(s.state) && !s.busy) return s;
      await sleep(200);
    } while (Date.now() < end);
    return s;
  };
  return { cell, call, until };
}

const me = await device('codex'), other = await device('codex-other');
ok((await me.until(['none'])).state === 'none', '처음에는 로그인 안 됨');

const began = performance.now();
ok((await me.call('POST', '/login')).status === 202, '로그인 시작');
let s = await me.until(['waiting', 'failed']);
const codeMs = Math.round(performance.now() - began);
ok(s.state === 'waiting' && Boolean(s.code), '진짜 기기 코드를 받아요', s.error_code ?? `${codeMs}ms`);
ok(s.verification_url?.startsWith('https://auth.openai.com/'), '코드를 넣을 곳은 OpenAI');
ok(s.cache === 'no-store', '코드는 캐시에 안 남아요');
if (s.code) {
  ok(!local(['compose', 'logs', '--no-color', 'agent', 'api']).includes(s.code), '로그에 코드가 없어요');
  const hex = sql(`SELECT encode(code, 'hex') FROM catchup.codex_logins WHERE cell = '${me.cell}'`);
  ok(!hex.includes(Buffer.from(s.code).toString('hex')), 'DB 에는 잠근 코드만');
}
ok((await other.until(['none'])).code === null, '다른 칸에는 코드가 안 보여요');
await me.call('DELETE', '/login');
s = await me.until(['none', 'failed']);
ok(s.state === 'none' && !s.code, '취소하면 코드가 사라져요', s.error_code ?? '');

await me.call('POST', '/login');
ok((await me.until(['waiting', 'failed'])).state === 'waiting', '다시 시작할 수 있어요');
local(['compose', 'kill', '-s', 'SIGKILL', 'agent']);
local(['compose', 'start', 'agent']);
s = await me.until(['failed']);
ok(s.state === 'failed' && s.error_code === 'login_interrupted' && !s.code, '일꾼이 죽으면 낡은 코드를 보여 주지 않아요', `${s.state} ${s.error_code}`);

console.log('MEASURE', JSON.stringify({ device_code_ms: codeMs }));
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
