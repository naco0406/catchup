// 3단계 끝 기준: 실제 API · 일꾼 · Codex 0.163.0 · 샌드박스 + 가짜 모델. 카드에는 사람처럼 HTTP 로 답해요(10초 포함).
// 모델은 지금 진짜 모델과 같은 도구 모양(code_mode_only, code-mode-model.json)으로 흉내 내요. --classic 이면 옛 모양.
// 쓰는 법: node services/api/tests/codex-sessions.mjs [--only 이름] [--wait-minutes 61] [--classic]
//   --wait-minutes: '한 시간 뒤에 답해도 이어져요'만 그 시간만큼 진짜로 기다려서 시험해요
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const only = arg('only'), waitMinutes = Number(arg('wait-minutes') ?? 0);
const secrets = Object.fromEntries(readFileSync(`${root}/.local/secrets/compose.env`, 'utf8').trim().split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const classic = process.argv.includes('--classic');
let failed = 0;
const ok = (cond, name, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const run = (cmd, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  child.on('close', code => (code ? reject(new Error(err.slice(-600))) : resolve(out.trim())));
});
const local = (...args) => run('zsh', ['infra/local/local.sh', ...args]);
const sql = q => local('compose', 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-U', 'catchup_owner', '-d', 'catchup', '-Atc', q);
const q = s => `'${String(s).replaceAll("'", "''")}'`;

// ─── 가짜 모델: 과제 글의 CASE:이름 으로 각본을 골라요
const exec = cmd => ({ name: 'exec_command', args: { cmd, yield_time_ms: 15000 } });
const questions = (...list) => ({ name: 'request_user_input', args: { questions: list } });
const choice = (id, question, a, b) => ({ id, header: id, question, options: [{ label: a, description: '첫째' }, { label: b, description: '둘째' }] });
const ONCE = 'echo RAN >> runs.txt; cat runs.txt';
const script = {
  approve: c => [exec('echo approved > approved.txt; cat approved.txt')][c.n],
  question: c => [questions(choice('where', '어디에서 다시 시도할까요?', '화면', '서버 (Recommended)'), choice('times', '몇 번 할까요?', '세 번 (Recommended)', '다섯 번')), exec('echo answered > answered.txt')][c.n],
  decline: c => [exec('touch declined.txt')][c.n],
  words: c => [exec('touch words.txt')][c.n],
  risky: c => [exec('rm -rf build')][c.n],
  hidden: c => [exec('echo safe \u202egnp.txt')][c.n],
  patch: c => [!classic ? { js: 'text(JSON.stringify(await tools.apply_patch("*** Begin Patch\\n*** Add File: /workspace/patched.txt\\n+PATCHED\\n*** End Patch")))' } : exec("apply_patch <<'EOF'\n*** Begin Patch\n*** Add File: patched.txt\n+PATCHED\n*** End Patch\nEOF")][c.n],
  restart: c => (c.outputs.some(o => /^RAN$/m.test(o)) ? undefined : exec(ONCE)),
  swap: c => (c.text.includes('The app restarted') ? (c.outputs.some(o => o.includes('OTHER')) || c.n >= 2 ? undefined : exec('echo OTHER > other.txt; cat other.txt')) : exec('echo ORIGINAL > original.txt')),
  again: c => (c.outputs.some(o => /^AGAIN$/m.test(o)) || c.n >= 3 ? undefined : exec('echo AGAIN > again.txt; cat again.txt')),
  boxkill: c => (c.outputs.some(o => /^BOX$/m.test(o)) || c.n >= 4 ? undefined : exec('echo BOX > box.txt; cat box.txt')),
  qrestart: c => (c.text.includes('The user answered') ? (c.outputs.some(o => /^AFTER$/m.test(o)) ? undefined : exec('echo AFTER > after.txt; cat after.txt')) : questions(choice('keep', '이어서 할까요?', '이어서 해요', '그만해요'))),
  expired: c => (expired.has(c.key) ? { status: 401 } : undefined),
  handoff: c => [exec('touch handoff.txt')][c.n],
  cancel: c => [exec('touch cancel.txt')][c.n],
  queue: c => [exec('touch queue.txt')][c.n],
  escape: c => [exec(`echo ${Buffer.from(ESCAPE.replace('__PORT__', String(model.address().port))).toString('base64')} | base64 -d | python3`)][c.n],
  leftover: c => [exec('echo LEFTOVER > leftover.txt; cat leftover.txt')][c.n],
  clean: c => [exec('ls -A; echo LISTED > listed.txt')][c.n],
  full: c => [exec('for i in 1 2 3; do fallocate -l 400M big$i; done; sleep 12; echo SURVI""VED')][c.n],
  draft: () => ({ say: JSON.stringify({ reply: '일요일로 다듬었어요', to: 'attacker', options: [{ label: '일요일을 여쭤봐요', detail: '부드럽게', text: '일요일은 어떠세요?', to: 'attacker' }] }) }),
  away: c => [exec('echo AWAY > away.txt; cat away.txt')][c.n],
  hostkill: c => (c.outputs.some(o => /^HOST$/m.test(o)) || c.n >= 4 ? undefined : exec('echo HOST > host.txt; cat host.txt')),
  jsbox: c => [{ js: `const r = {};
for (const g of ['process', 'require', 'fetch', 'Deno', 'Bun', 'WebSocket', 'XMLHttpRequest']) r[g] = typeof globalThis[g];
for (const m of ['node:fs', 'fs', '/etc/passwd', 'file:///etc/passwd']) { try { await import(m); r[m] = 'loaded' } catch { r[m] = 'blocked' } }
text('JSBOX ' + JSON.stringify(r) + ' END')` }][c.n],
  asyncend: c => (c.text.includes('The user answered') ? undefined : [{ name: 'request_user_input_async', args: { questions: [{ title: '어느 색으로 할까요?', options: ['빨강', '파랑'] }] } }][c.n]),
  asynclive: c => [{ name: 'request_user_input_async', args: { questions: [{ title: '어느 색으로 할까요?', options: ['빨강', '파랑'] }] } }, exec('echo LIVE > live.txt')][c.n],
  hour: c => [exec('echo HOUR > hour.txt; cat hour.txt')][c.n],
};
const ESCAPE = `import os,socket,glob,subprocess
R=lambda k,v: print('R '+k+'='+str(v))
def fails(f):
    try: f(); return False
    except OSError: return True
R('uid',os.getuid())
R('groups',','.join(map(str,os.getgroups())) or '-')
R('cwd',os.getcwd())
bad=('CATCHUP','CANARY','PASSWORD','MASTER','SECRET','TOKEN','OPENAI')
R('env_secret',sorted(k for k,v in os.environ.items() if any(b in (k+v).upper() for b in bad)))
auth=[]
for d,_,fs in os.walk('/'):
    if d.startswith(('/proc','/sys')): continue
    if 'auth.json' in fs: auth.append(d)
R('auth_files',auth)
R('login_dirs',[d for d in ('/run/codex','/data/codex','/var/tmp/run','/var/tmp/data','/Users') if os.path.exists(d)])
R('nics',sorted(n for _,n in socket.if_nameindex()))
got=[]
for h,p in (('1.1.1.1',443),('postgres',5432),('agent',4330),('api',4320),('192.168.5.2',__PORT__),('169.254.169.254',80),('8.8.8.8',53)):
    try: socket.create_connection((h,p),2); got.append(h)
    except OSError: pass
R('reached',got)
lane=[]
for line in open('/proc/net/tcp').read().splitlines()[1:]:
    if line.split()[3]=='0A': lane.append(line.split()[1])
R('listening',lane)
R('docker',os.path.exists('/var/run/docker.sock'))
R('state_blocked',fails(lambda: open('/state/owner.json').read()) and fails(lambda: open('/state/x','w')))
R('sock_blocked',fails(lambda: socket.socket(socket.AF_UNIX).connect('/sock/exec.sock')))
readable=[]
for p in glob.glob('/proc/[0-9]*'):
    try:
        if os.stat(p).st_uid==0: open(p+'/environ','rb').read(); readable.append(p)
    except OSError: pass
R('root_env_readable',readable)
st=dict(l.split(':',1) for l in open('/proc/self/status').read().splitlines() if ':' in l)
R('caps',int(st['CapEff'],16)+int(st['CapPrm'],16))
R('nnp',st['NoNewPrivs'].strip())
R('suid',subprocess.run('find / -xdev -type f -perm /6000 2>/dev/null',shell=True,capture_output=True,text=True).stdout.split())
R('readonly',all(fails(lambda p=p: open(p,'w')) for p in ('/usr/local/sbin/x','/opt/codex/x','/etc/x')))
open('/tmp/a.c','w').write('int main(){return 0;}')
R('builds',subprocess.run('gcc /tmp/a.c -o /tmp/a && /tmp/a && git --version',shell=True,capture_output=True).returncode==0)`;
const expired = new Set();
const agents = new Set();
const heard = new Map();
const calls = new Map();
let offered = '';
const model = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    if (!req.url.includes('/responses')) { res.writeHead(404); return res.end(); }
    agents.add(`${req.headers['user-agent'] ?? ''} ${req.headers.originator ?? ''}`);
    let j = {}; try { j = JSON.parse(body); } catch { /* 빈 요청 */ }
    const input = j.input ?? [];
    const texts = input.filter(i => i.type === 'message' && i.role === 'user').map(i => (i.content ?? []).map(x => x.text ?? '').join(' '));
    const text = texts.join('\n');
    const allOutputs = input.filter(i => i.type?.endsWith('_call_output'))
      .map(i => (typeof i.output === 'string' ? i.output : Array.isArray(i.output) ? i.output.map(x => x.text ?? '').join('\n') : JSON.stringify(i.output)));
    // 'Script running' 은 끝난 걸음이 아니에요 — 모델은 wait 로 결과를 받아요
    const running = allOutputs.at(-1)?.match(/Script running with cell ID (\w+)/)?.[1];
    const outputs = allOutputs.filter(o => !/Script running with cell ID/.test(o));
    const [, name, key] = text.match(/CASE:([a-z]+):([0-9a-f]+)/) ?? [];
    if (key) {
      heard.set(key, { text, outputs });
      calls.set(key, (calls.get(key) ?? 0) + 1);
      offered ||= body;
    }
    let step = key && running ? { name: 'wait', args: { cell_id: running, yield_time_ms: 10000 } } : script[name]?.({ n: outputs.length, outputs, text, key });
    if (!classic && step?.name === 'exec_command') {
      step = { js: `const r = await tools.exec_command(${JSON.stringify({ workdir: '/workspace', ...step.args })}); text(r.output)` };
    }
    if (step?.status) { res.writeHead(step.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'unauthorized', code: 'token_invalidated' } })); }
    const uid = randomBytes(5).toString('hex');
    const item = step?.js
      ? { type: 'custom_tool_call', id: `ctc_${uid}`, call_id: `call_${uid}`, name: 'exec', input: step.js }
      : step?.say
      ? { type: 'message', id: `msg_${uid}`, role: 'assistant', content: [{ type: 'output_text', text: step.say }] }
      : step
      ? { type: 'function_call', id: `fc_${uid}`, call_id: `call_${uid}`, name: step.name, arguments: JSON.stringify(step.args) }
      : { type: 'message', id: `msg_${uid}`, role: 'assistant', content: [{ type: 'output_text', text: `끝냈어요 (${name ?? '-'})` }] };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const e of [{ type: 'response.created', response: { id: `resp_${uid}` } }, { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: `resp_${uid}`, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }]) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    res.end();
  });
});
await new Promise(r => model.listen(0, '127.0.0.1', r));

const name = `catchup-agent-test-${process.pid}`;
const wrapper = [
  '#!/bin/sh',
  `exec /opt/codex/bin/codex-app-server "$@" -c 'model_provider="fake"' ${classic ? `-c 'model="gpt-5.4"'` : `-c 'model="code-mode-test"' -c 'model_catalog_json="/var/tmp/code-mode-model.json"'`} -c 'model_providers.fake.name="fake"' \\`,
  `  -c 'model_providers.fake.base_url="http://192.168.5.2:${model.address().port}/v1"' -c 'model_providers.fake.wire_api="responses"' -c 'model_providers.fake.requires_openai_auth=false' \\`,
  "  -c 'model_providers.fake.supports_websockets=false' -c 'model_providers.fake.request_max_retries=0' -c 'model_providers.fake.stream_max_retries=0'",
].join('\n');
const dockerEnv = {
  ...process.env, DOCKER_HOST: `unix://${root}/.local/colima/default/docker.sock`, DOCKER_CONFIG: `${root}/.local/docker`,
  CATCHUP_DB_APP_PASSWORD: secrets.CATCHUP_DB_APP_PASSWORD, CATCHUP_MASTER_KEY: secrets.CATCHUP_MASTER_KEY, CATCHUP_GATEWAY_SECRET: randomBytes(32).toString('hex'), WRAPPER: wrapper,
};
const docker = (...args) => run('docker', args, dockerEnv);

const API = 'http://127.0.0.1:4320', TERMINAL = ['done', 'failed', 'cancelled'];
async function person(label) {
  const email = `session-${label}-${randomUUID()}@example.test`;
  const cell = await local('ops', 'provision', email);
  const code = await local('ops', 'login-code', email);
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:5181' };
  const login = await fetch(`${API}/v1/auth/session`, { method: 'POST', headers, body: JSON.stringify({ email, code }) });
  headers.cookie = login.headers.get('set-cookie').split(';')[0];
  const call = async (method, path, body) => {
    const r = await fetch(`${API}/v1/me${path}`, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, json, text, type: r.headers.get('content-type') };
  };
  const until = async (fn, ms = 60_000) => {
    const end = Date.now() + ms;
    do { const got = await fn(); if (got) return got; await sleep(300); } while (Date.now() < end);
    return undefined;
  };
  const cards = async (kind = 'decide') => ((await call('GET', '/cards')).json?.cards ?? []).filter(c => (kind === 'fyi' ? c.kind === 'fyi' : c.kind !== 'fyi'));
  const me = {
    cell, call, until, cards,
    signIn: () => sql(`INSERT INTO catchup.codex_logins (cell, state) VALUES (${q(cell)}, 'in') ON CONFLICT (cell) DO UPDATE SET state = 'in'`),
    start: async which => {
      const key = randomBytes(6).toString('hex');
      const r = await call('POST', '/agent-sessions', { request_key: randomUUID(), task: `CASE:${which}:${key} 시험 과제` });
      if (r.status !== 200) throw new Error(`start ${which}: ${r.status} ${r.text}`);
      return { id: r.json.id, key };
    },
    session: async id => (await call('GET', '/agent-sessions')).json.find(s => s.id === id),
    state: (id, states, ms) => until(async () => { const s = await me.session(id); return s && states.includes(s.state) && s; }, ms),
    card: ms => until(async () => (await cards())[0], ms),
    pick: async (card, match, extra = {}) => {
      const option = typeof match === 'number' ? match : card.options.findIndex(o => match(o.effect, o));
      const r = await call('POST', `/cards/${card.id}/answer`, { request_key: randomUUID(), version: card.version, turn_seq: card.turns.at(-1)?.seq ?? 0, option, surface: 'web', ...extra });
      return r;
    },
    ended: id => me.state(id, TERMINAL, 90_000),
    patch: async id => (await call('GET', `/agent-sessions/${id}/patch`)),
    requests: id => sql(`SELECT count(*) FROM catchup.agent_requests WHERE session = ${q(id)}`).then(Number),
  };
  await me.signIn();
  return me;
}
const decides = d => e => e.reply?.decision === d;
const restartAgent = async () => { await docker('kill', '-s', 'KILL', name); await docker('start', name); };
const measure = {};

const cases = {
  async approve() {
    const me = await person('approve'), other = await person('other');
    const t0 = Date.now();
    const s = await me.start('approve');
    const card = await me.card();
    measure.start_to_card_ms = Date.now() - t0;
    ok(card?.kind === 'approve' && card.waiting === true && card.body.context.cmd.includes('echo approved > approved.txt'), '승인 요청이 명령 그대로 카드로', `${measure.start_to_card_ms}ms`);
    if (!card) return;
    ok((await me.session(s.id)).state === 'waiting', '세션은 답을 기다림');
    ok((await other.cards()).length === 0 && (await other.call('GET', '/agent-sessions')).json.length === 0, '다른 칸에는 카드도 세션도 안 보여요');
    ok((await other.call('DELETE', `/agent-sessions/${s.id}`)).status === 404, '다른 칸의 세션은 못 멈춰요');
    const t1 = Date.now();
    ok((await me.pick(card, decides('accept'))).status === 200, '웹에서 허용');
    const end = await me.ended(s.id);
    measure.answer_to_done_ms = Date.now() - t1;
    ok(end?.state === 'done', '승인한 명령이 실행되고 끝나요', end?.error_code ?? `${measure.answer_to_done_ms}ms`);
    ok(measure.answer_to_done_ms >= 9500, '10초 안에는 되돌릴 수 있었어요');
    const patch = await me.patch(s.id);
    ok(/\+approved/.test(patch.text) && patch.type.startsWith('text/plain'), '바뀐 것이 patch 로 남아요');
    ok((await other.patch(s.id)).status === 404, '다른 칸은 patch 를 못 받아요');
    ok(end?.summary?.includes('끝냈어요') && (await me.cards('fyi')).length === 1, '끝나면 알려만으로');
    const log = (await me.call('GET', '/activity')).json[0];
    ok(log.receipt_state === 'succeeded' && log.undoable === false, '전한 답에는 되돌리기가 없어요');
  },
  async question() {
    const me = await person('question');
    const s = await me.start('question');
    const two = await me.until(async () => { const c = await me.cards(); return c.length === 2 && c; });
    ok(Boolean(two), '질문 두 개가 카드 두 장');
    if (!two) return;
    const where = two.find(c => c.question.includes('어디')), times = two.find(c => c.question.includes('몇 번'));
    ok(where.options[0].label === '서버', '에이전트의 추천이 맨 위');
    await me.pick(where, 0); await me.pick(times, 1);
    const next = await me.card(45_000);
    ok(next?.kind === 'approve', '답하면 세션이 이어져서 다음 명령을 물어요');
    if (next) await me.pick(next, decides('accept'));
    ok((await me.ended(s.id))?.state === 'done', '이어진 명령까지 끝나요');
    const got = heard.get(s.key)?.outputs.join(' ') ?? '';
    ok(got.includes('서버 (Recommended)') && got.includes('다섯 번'), '고른 답 그대로 돌아가요', got.slice(0, 160));
  },
  async decline() {
    const me = await person('decline');
    const s = await me.start('decline');
    const card = await me.card();
    if (!card) return ok(false, '거절: 카드 없음');
    await me.pick(card, decides('decline'));
    ok((await me.ended(s.id))?.state === 'done', '거절해도 세션은 이어져요');
    ok(!(await me.patch(s.id)).text.includes('declined.txt'), '거절한 명령은 실행 안 돼요');
  },
  async words() {
    const me = await person('words');
    const s = await me.start('words');
    const card = await me.card();
    if (!card) return ok(false, '말: 카드 없음');
    const said = (await me.call('POST', `/cards/${card.id}/turns`, { request_key: randomUUID(), text: '스테이징부터 해 주세요' })).json;
    await me.pick(said, 0);
    ok((await me.ended(s.id))?.state === 'done', '말로 답해도 이어져요');
    ok(!(await me.patch(s.id)).text.includes('words.txt'), '말은 승인이 되지 않아요');
  },
  async risky() {
    const me = await person('risky');
    const s = await me.start('risky');
    const card = await me.card();
    if (!card) return ok(false, '위험: 카드 없음');
    ok(card.risk !== 'low' && card.options[0].effect.reply.decision === 'decline', '위험한 명령은 추천이 거절');
    ok((await me.pick(card, decides('accept'))).status === 428, '한 번 더 확인 없이는 안 돼요');
    ok((await me.pick(card, decides('accept'), { confirmed: true })).status === 200, '확인하면 돼요');
    ok((await me.ended(s.id))?.state === 'done', '확인한 위험한 명령까지 끝나요');
  },
  async hidden() {
    const me = await person('hidden');
    const s = await me.start('hidden');
    const card = await me.card();
    ok(card?.body.context.cmd.includes('\\u{202e}') && card.risk !== 'low', '숨은 글자는 드러내고 위험으로', JSON.stringify(card?.body.context.cmd ?? ''));
    if (card) { await me.pick(card, decides('decline')); await me.ended(s.id); }
  },
  async patch() {
    const me = await person('patch');
    const s = await me.start('patch');
    const card = await me.card();
    const code = card?.options.find(o => o.effect.reply?.decision === 'accept')?.effect.code;
    ok(code?.lines.some(l => l.s.includes('PATCHED')) || card?.body.context?.cmd?.includes('PATCHED'), '바뀔 내용을 보고 정해요', JSON.stringify(card?.body ?? '').slice(0, 200));
    if (!card) return;
    await me.pick(card, decides('accept'), { confirmed: true });
    ok((await me.ended(s.id))?.state === 'done' && (await me.patch(s.id)).text.includes('+PATCHED'), '파일 고치기가 patch 로 남아요');
  },
  async restart() {
    const me = await person('restart');
    const s = await me.start('restart');
    const card = await me.card();
    if (!card) return ok(false, '재시작: 카드 없음');
    await restartAgent(); await sleep(3000);
    const still = await me.cards();
    ok(still.length === 1 && still[0].id === card.id, '기다리다 죽었다 떠도 카드는 그대로 한 장');
    await me.pick(card, decides('accept'));
    const end = await me.ended(s.id);
    ok(end?.state === 'done', '늦은 승인으로 이어져요', end?.error_code ?? (await me.session(s.id)).state);
    ok(await me.requests(s.id) === 1, '같은 카드가 두 번 안 생겨요', String(await me.requests(s.id)));
    ok(((await me.patch(s.id)).text.match(/^\+RAN$/gm) ?? []).length === 1, '명령은 정확히 한 번');
  },
  async swap() {
    const me = await person('swap');
    const s = await me.start('swap');
    const first = await me.card();
    if (!first) return ok(false, '바꿔치기: 카드 없음');
    await restartAgent(); await sleep(2000);
    await me.pick(first, decides('accept'));
    const second = await me.until(async () => (await me.cards()).find(c => c.id !== first.id), 45_000);
    ok(second?.body.context?.cmd.includes('OTHER'), '재시작 뒤 다른 명령은 다시 물어요');
    if (second) await me.pick(second, decides('decline'));
    await me.ended(s.id);
    ok(!(await me.patch(s.id)).text.includes('+OTHER'), '앞 승인으로 다른 명령이 실행되지 않아요');
  },
  async qrestart() {
    const me = await person('qrestart');
    const s = await me.start('qrestart');
    const card = await me.card();
    if (!card) return ok(false, '질문 재시작: 카드 없음');
    await restartAgent(); await sleep(2000);
    await me.pick(card, 0);
    const next = await me.until(async () => (await me.cards()).find(c => c.id !== card.id), 45_000);
    if (next) await me.pick(next, decides('accept'));
    ok((await me.ended(s.id))?.state === 'done' && (await me.patch(s.id)).text.includes('+AFTER'), '질문 중에 죽어도 답으로 이어져요');
  },
  async boxkill() {
    const me = await person('boxkill');
    const s = await me.start('boxkill');
    const card = await me.card();
    if (!card) return ok(false, '샌드박스: 카드 없음');
    const slot = await sql(`SELECT slot FROM catchup.agent_sessions WHERE id = ${q(s.id)}`);
    await docker('kill', '-s', 'KILL', `catchup-sandbox-${slot}-1`); await docker('start', `catchup-sandbox-${slot}-1`); await sleep(2000);
    const still = await me.cards();
    ok(still.length === 1 && still[0].id === card.id, '샌드박스가 죽었다 떠도 카드는 그대로');
    await me.pick(card, decides('accept'));
    // 끊긴 연결로 실행이 실패하면 에이전트가 다시 부탁하고, 승인은 다시 물어요(저절로 두 번 실행되지 않게)
    for (let i = 0; i < 3; i++) {
      const next = await me.until(async () => {
        if (TERMINAL.includes((await me.session(s.id)).state)) return 'end';
        return (await me.cards()).find(c => c.kind === 'approve');
      }, 45_000);
      console.log('  after sandbox restart:', next === 'end' ? 'ended' : next ? 'asked again' : 'nothing', JSON.stringify(heard.get(s.key)?.outputs ?? []).slice(0, 500));
      if (!next || next === 'end') break;
      await me.pick(next, decides('accept'));
    }
    const end = await me.ended(s.id);
    ok(end?.state === 'done', '샌드박스가 죽었다 떠도 세션이 끝까지', end?.error_code ?? (await me.session(s.id)).state);
    ok((await me.patch(s.id)).text.includes('+BOX'), '다시 뜬 샌드박스에서 실행돼요');
  },
  async again() {
    const me = await person('again');
    const approveUntilDone = async id => {
      const seen = new Set();
      for (let i = 0; i < 5; i++) {
        const next = await me.until(async () => {
          if (TERMINAL.includes((await me.session(id)).state)) return 'end';
          return (await me.cards()).find(c => c.kind === 'approve' && !seen.has(c.id));
        }, 45_000);
        if (!next || next === 'end') break;
        seen.add(next.id);
        await me.pick(next, decides('accept'));
      }
      return me.ended(id);
    };
    for (const nth of ['첫', '두', '세']) {
      const s = await me.start('again');
      const end = await approveUntilDone(s.id);
      ok(end?.state === 'done' && (await me.patch(s.id)).text.includes('+AGAIN'), `같은 사람의 ${nth} 번째 세션도 실행돼요`);
      await sleep(2500);
    }
    const both = [await me.start('again'), await me.start('again')];
    const seen = new Set();
    await me.until(async () => {
      for (const c of await me.cards()) if (c.kind === 'approve' && !seen.has(c.id)) { seen.add(c.id); await me.pick(c, decides('accept')); }
      return (await Promise.all(both.map(b => me.session(b.id)))).every(x => TERMINAL.includes(x.state));
    }, 90_000);
    for (const [i, b] of both.entries()) ok((await me.patch(b.id)).text.includes('+AGAIN'), `같은 사람의 동시 세션 ${i + 1}도 실행돼요`);
  },
  async escape() {
    const me = await person('escape');
    const s = await me.start('escape');
    const card = await me.card();
    if (!card) return ok(false, '탈출: 카드 없음');
    await me.pick(card, decides('accept'), { confirmed: true });
    await me.ended(s.id);
    const out = heard.get(s.key)?.outputs.join('\n') ?? '';
    const got = Object.fromEntries([...out.matchAll(/^R (\w+)=(.*)$/gm)].map(m => [m[1], m[2]]));
    for (const [key, want, label] of [
      ['uid', '10002', '명령은 uid 10002'], ['groups', /^(-|10002)$/, '다른 무리에 안 들어 있어요'], ['cwd', '/workspace', '작업 폴더에서'],
      ['env_secret', '[]', '환경에 비밀이 없어요'], ['auth_files', '[]', '어디에도 auth.json 이 없어요'], ['login_dirs', '[]', '로그인 쪽 · Mac 폴더가 없어요'],
      ['nics', /^\['lo'(, '(tunl0|sit0|ip6tnl0|gre0|gretap0|erspan0|ip_vti0|ip6_vti0|ip6gre0)')*\]$/, '망 장치는 lo 뿐'],
      ['reached', '[]', '인터넷 · DB · 창구 · Mac · 메타데이터에 못 닿아요'], ['listening', '[]', '실행 통로가 샌드박스에 안 열려 있어요'],
      ['docker', 'False', 'Docker 소켓이 없어요'], ['state_blocked', 'True', '자리 상태를 못 읽고 못 고쳐요'], ['sock_blocked', 'True', '감독 소켓에 명령을 못 보내요'],
      ['root_env_readable', '[]', '감독의 환경을 못 읽어요'], ['caps', '0', '능력이 0'], ['nnp', '1', '권한을 못 올려요'], ['suid', '[]', 'setuid 파일이 없어요'],
      ['readonly', 'True', '바탕 파일은 못 고쳐요'], ['builds', 'True', '일은 할 수 있어요(git · gcc · python)'],
    ]) {
      const good = typeof want === 'string' ? got[key] === want : want.test(got[key] ?? '');
      ok(good, `탈출: ${label}`, good ? '' : String(got[key]));
    }
  },
  async leftover() {
    const a = await person('left-a'), b = await person('left-b');
    const first = await a.start('leftover');
    const card = await a.card();
    if (!card) return ok(false, '남은 파일: 카드 없음');
    const slot = await sql(`SELECT slot FROM catchup.agent_sessions WHERE id = ${q(first.id)}`);
    const py = "import socket,sys;s=socket.socket(socket.AF_UNIX);s.settimeout(8);s.connect(sys.argv[1]);s.sendall((sys.argv[2]+'\\n').encode());print(s.makefile().readline())";
    const seat = async hello => JSON.parse(await docker('run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--user', '10001:10001', '-v', `catchup_sandbox${slot}-sock:/s:ro`,
      '--entrypoint', 'python3', 'catchup-sandbox:local', '-c', py, '/s/exec.sock', JSON.stringify(hello)));
    const status = await seat({ op: 'status' });
    const sameCell = { cell: a.cell, session: randomUUID() }, otherCell = { cell: b.cell, session: randomUUID() };
    ok(status.owner?.session === first.id, '자리의 주인은 그 세션');
    ok(!(await seat({ op: 'claim', ...otherCell })).ok, '남의 자리는 못 잡아요');
    ok(!(await seat({ op: 'release', ...otherCell })).ok, '남의 자리는 못 비워요');
    ok(!(await seat({ op: 'attach', owner: otherCell, seat: status.seat })).ok, '다른 칸은 못 붙어요');
    ok(!(await seat({ op: 'attach', owner: sameCell, seat: status.seat })).ok, '같은 칸의 다른 세션도 못 붙어요');
    ok(!(await seat({ op: 'attach', owner: status.owner, seat: randomUUID() })).ok, '지난 세대로는 못 붙어요');
    ok(!(await seat({ op: 'export', ...otherCell })).ok, '남의 작업은 못 꺼내요');
    await a.pick(card, decides('accept'));
    await a.ended(first.id);
    const freed = await a.until(async () => { try { const now = await seat({ op: 'status' }); return !now.owner && now; } catch { return false; } }, 20_000);
    ok(Boolean(freed), '끝나면 빈 자리로 돌아와요');
    const files = await docker('run', '--rm', '--network', 'none', '-v', `catchup_sandbox${slot}-work:/w:ro`, '--entrypoint', '/bin/sh', 'catchup-sandbox:local', '-c', 'find /w -mindepth 1 | head -5');
    ok(files === '', '앞 세션의 파일이 하나도 안 남아요', files.slice(0, 120));
    const second = await b.start('clean');
    const next = await b.card();
    if (next) await b.pick(next, decides('accept'));
    await b.ended(second.id);
    ok(!(heard.get(second.key)?.outputs.join(' ') ?? '').includes('leftover.txt'), '다음 사람에게 앞 사람의 파일이 안 보여요');
  },
  async full() {
    const me = await person('full');
    const s = await me.start('full');
    const card = await me.card();
    if (!card) return ok(false, '넘침: 카드 없음');
    await me.pick(card, decides('accept'));
    const end = await me.ended(s.id);
    ok(end?.state === 'failed' && end.error_code === 'workspace_full', '작업 폴더가 1GB 를 넘으면 멈추고 알려요', end?.error_code ?? '');
    ok(!(heard.get(s.key)?.outputs.join(' ') ?? '').includes('SURVIVED'), '넘친 명령은 살아남지 못해요');
    ok((await me.cards()).some(c => c.kind === 'failed'), '실패 카드가 올라와요');
  },
  async archive() {
    // 저장소 넣기 · 결과 꺼내기. tar 는 여기서 만들어요(밖에서 받지 않아요)
    const py = `import io,tarfile,socket,json,sys,uuid,time
def greet(h):
    s=socket.socket(socket.AF_UNIX); s.settimeout(30); s.connect('/s/exec.sock'); f=s.makefile('rb'); s.sendall((json.dumps(h)+'\\n').encode()); return s,f,json.loads(f.readline())
o={'cell':str(uuid.uuid4()),'session':str(uuid.uuid4())}
b=io.BytesIO()
with tarfile.open(fileobj=b,mode='w:gz') as t:
    def add(name,body=b'',link=None):
        i=tarfile.TarInfo(name)
        if link: i.type=tarfile.SYMTYPE; i.linkname=link; t.addfile(i)
        else: i.size=len(body); t.addfile(i,io.BytesIO(body))
    add('top/README.md',b'hello\\n')
    add('top/../../../tmp/escaped',b'x')
    add('top/link',link='/state')
raw=b.getvalue()
print('claim',greet({'op':'claim',**o})[2]['ok'])
s,f,r=greet({'op':'import','owner':o,'bytes':len(raw)})
s.sendall(raw); print('import',json.loads(f.readline())['ok'])
s,f,r=greet({'op':'export',**o}); print('export',r['ok'],len(f.read()))
print('release',greet({'op':'release',**o})[2]['ok'])`;
    let out = '';
    try { out = await docker('run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--user', '10001:10001', '-v', 'catchup_sandbox3-sock:/s:ro', '--entrypoint', 'python3', 'catchup-sandbox:local', '-c', py); }
    catch (error) { out = String(error); }
    // '..' 가 든 tar 는 통째로 거절되거나 안전하게 벗겨져요. 어느 쪽이든 밖에는 안 써져요
    ok(/claim True/.test(out) && /release True/.test(out), '저장소 자리를 잡고 비워요', out.slice(0, 300).replaceAll('\n', ' · '));
    const escaped = await docker('exec', 'catchup-sandbox-3-1', '/bin/sh', '-c', 'test -e /tmp/escaped && echo ESCAPED || echo clean').catch(() => 'clean');
    ok(escaped === 'clean', 'tar 로 작업 폴더 밖에 못 써요');
    await sleep(2500);
    const good = py.replace("    add('top/../../../tmp/escaped',b'x')\n", '');
    out = await docker('run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--user', '10001:10001', '-v', 'catchup_sandbox3-sock:/s:ro', '--entrypoint', 'python3', 'catchup-sandbox:local', '-c', good).catch(String);
    ok(/import True/.test(out), '저장소 tar 가 작업 폴더로 들어가요', out.slice(0, 300).replaceAll('\n', ' · '));
    ok(/export True 0/.test(out), '넣자마자는 바뀐 것이 0');
    await sleep(2500);
  },
  async repo() {
    const me = await person('repo');
    const r = await me.call('POST', '/agent-sessions', { request_key: randomUUID(), task: 'CASE:approve:0000', repo: `octocat/no-such-repository-${randomBytes(8).toString('hex')}` });
    const end = await me.ended(r.json.id);
    ok(end?.state === 'failed' && end.error_code === 'repo_not_found_or_private', '없는 · 비공개 저장소는 이유와 함께 실패 카드', end?.error_code ?? '');
    ok((await me.cards()).some(c => c.kind === 'failed'), '저장소 실패가 카드로');
    const bad = await me.call('POST', '/agent-sessions', { request_key: randomUUID(), task: 'x', repo: 'https://evil.example/a/b' });
    ok(bad.status === 422, 'GitHub 밖의 주소는 안 받아요');
  },
  async draft() {
    const me = await person('draft');
    const key = randomBytes(6).toString('hex');
    const email = (await sql(`SELECT email FROM front.accounts WHERE cell = ${q(me.cell)}`));
    const card = JSON.stringify([{
      dedupe_key: key, kind: 'reply', source: { type: 'local', from: '서연' }, source_ref: key, source_version: '1', question: '언제 만날까요?',
      options: [{ label: '토요일', done: '답했어요', effect: { kind: 'send', to: '서연', text: '토요일에 봬요' } }], reply_path: 'send',
    }]);
    await new Promise((resolve, reject) => {
      const child = spawn('zsh', ['infra/local/local.sh', 'ops', 'seed', email], { cwd: root, stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('close', code => (code ? reject(new Error('seed')) : resolve())); child.stdin.end(card);
    });
    const open = await me.card();
    if (!open) return ok(false, '다듬기: 카드 없음');
    const said = (await me.call('POST', `/cards/${open.id}/turns`, { request_key: randomUUID(), text: `일요일로요 CASE:draft:${key}` })).json;
    ok(said.turns[0].options[0].effect.text.startsWith('일요일로요'), "말하자마자 '말씀하신 대로'가 서요");
    const better = await me.until(async () => { const c = (await me.cards())[0]; return c?.turns[0]?.reply && c; }, 45_000);
    ok(better?.turns[0].options[0].label === '일요일을 여쭤봐요', '비서가 다듬은 선택지가 뒤따라와요');
    ok(better?.turns[0].options[0].effect.to === '서연', '모델은 받는 사람을 못 바꿔요');
    ok((await me.pick(said, 0)).status === 409, '앞 선택지를 보고 누른 답은 새 글로 안 나가요');
    if (better) ok((await me.pick(better, 0)).status === 200, '다듬은 글로 답할 수 있어요');
  },
  async backoff() {
    const me = await person('backoff');
    const s = await me.start('boxkill');
    const card = await me.card();
    if (!card) return ok(false, '재시도: 카드 없음');
    const box = `catchup-sandbox-${await sql(`SELECT slot FROM catchup.agent_sessions WHERE id = ${q(s.id)}`)}-1`;
    await docker('stop', '-t', '2', box);
    await sleep(15_000);
    // docker logs 는 컨테이너의 stderr 를 stderr 로 줘요
    const logged = await run('/bin/sh', ['-c', 'docker logs "$0" 2>&1', name], dockerEnv);
    const tries = logged.split('\n').filter(l => l.includes(s.id) && l.includes('session step failed')).length;
    await docker('start', box);
    ok(tries >= 2 && tries <= 6, '안 닿는 곳을 0.5초마다 두드리지 않아요(15초에 몇 번)', String(tries));
    await me.pick(card, decides('accept'));
    const seen = new Set([card.id]);
    await me.until(async () => {
      if (TERMINAL.includes((await me.session(s.id)).state)) return true;
      for (const c of await me.cards()) if (c.kind === 'approve' && !seen.has(c.id)) { seen.add(c.id); await me.pick(c, decides('accept')); }
      return false;
    }, 100_000);
    ok((await me.session(s.id)).state === 'done', '다시 닿으면 이어져서 끝나요');
  },
  async away() {
    const me = await person('away');
    const s = await me.start('away');
    const card = await me.card();
    if (!card) return ok(false, '자리 비움: 카드 없음');
    await sleep(40_000);
    ok(calls.get(s.key) === 1, '사람을 기다리는 40초 동안 모델을 안 불러요(한도)', String(calls.get(s.key)));
    await me.pick(card, decides('accept'));
    ok((await me.ended(s.id))?.state === 'done' && (await me.patch(s.id)).text.includes('+AWAY'), '늦게 답해도 wait 로 결과를 받아 끝나요');
  },
  async jsbox() {
    if (classic) return;
    const me = await person('jsbox');
    const s = await me.start('jsbox');
    await me.ended(s.id);
    const out = heard.get(s.key)?.outputs.join(' ') ?? '';
    const got = JSON.parse(out.match(/JSBOX (\{.*?\}) END/)?.[1] ?? '{}');
    ok(['process', 'require', 'fetch', 'Deno', 'Bun', 'WebSocket', 'XMLHttpRequest'].every(g => got[g] === 'undefined'), '모델의 JS 에 프로세스 · 망 API 가 없어요', out.slice(0, 260));
    ok(['node:fs', 'fs', '/etc/passwd', 'file:///etc/passwd'].every(m => got[m] === 'blocked'), '모델의 JS 가 파일 · 모듈을 못 불러요');
    const h = JSON.parse(await docker('inspect', 'catchup-codehost-1'))[0];
    ok(h.HostConfig.NetworkMode === 'none' && h.HostConfig.ReadonlyRootfs === true, 'JS 실행기 컨테이너: 망 없음 · 읽기 전용');
    ok(h.Mounts.length === 1 && h.Mounts[0].Destination === '/sock', 'JS 실행기에는 소켓 말고 붙은 것이 없어요(작업 · 로그인)');
    ok(!h.Config.Env.some(e => /PASSWORD|MASTER|SECRET|VAPID|TOKEN/.test(e)), 'JS 실행기에 비밀이 없어요');
    const found = await docker('run', '--rm', '--network', 'none', '--entrypoint', '/bin/sh', 'catchup-agent:local', '-c', 'find / -xdev -name "*code-mode-host*" 2>/dev/null; true');
    ok(found === '', '로그인 쪽 이미지에는 JS 실행기 파일이 없어요', found);
    const uids = await docker('exec', 'catchup-codehost-1', '/bin/sh', '-c', 'for p in /proc/[0-9]*; do [ "$(readlink $p/exe 2>/dev/null)" = /opt/codex/bin/codex-code-mode-host ] || grep -aq "^/opt/codex/bin/codex-code-mode-host" $p/cmdline 2>/dev/null && stat -c %u $p; done; true').catch(() => '');
    const list = uids.split('\n').filter(u => /^\d+$/.test(u));
    ok(list.length > 0 && new Set(list).size === list.length && list.every(u => Number(u) >= 20001), '실행기는 연결(칸)마다 다른 uid', list.join(','));
    ok(/(^|[^.\w])exec_command\((args|input)/.test(offered), '세션에는 실행 도구가 JS 안에 보여요');
    const bad = offered.match(/"name":"(spawn_agent|send_message|followup_task|web_search|image_gen)"|image_gen__imagegen\(|web__run\(/);
    ok(offered.includes('"name":"exec"') && !bad, '하위 에이전트 · 웹 · 그림 도구가 안 나가요', bad?.[0] ?? '');
  },
  async hostkill() {
    if (classic) return;
    const me = await person('hostkill');
    const s = await me.start('hostkill');
    const card = await me.card();
    if (!card) return ok(false, '실행기: 카드 없음');
    await docker('kill', '-s', 'KILL', 'catchup-codehost-1'); await docker('start', 'catchup-codehost-1'); await sleep(2000);
    await me.pick(card, decides('accept'));
    const seen = new Set([card.id]);
    await me.until(async () => {
      if (TERMINAL.includes((await me.session(s.id)).state)) return true;
      for (const c of await me.cards()) if (c.kind === 'approve' && !seen.has(c.id)) { seen.add(c.id); await me.pick(c, decides('accept')); }
      return false;
    }, 100_000);
    const end = await me.ended(s.id);
    ok(end?.state === 'done', 'JS 실행기가 죽었다 떠도 세션이 끝나요', end?.error_code ?? (await me.session(s.id)).state);
    ok((await me.patch(s.id)).text.includes('+HOST'), '다시 뜬 실행기로 실행돼요', JSON.stringify(heard.get(s.key)?.outputs ?? []).slice(0, 300));
  },
  async asyncend() {
    if (classic) return;
    const me = await person('asyncend');
    const s = await me.start('asyncend');
    const card = await me.card();
    ok(card?.kind === 'choose' && card.question.includes('어느 색'), '비동기 질문도 카드로 올라와요');
    if (!card) return;
    await sleep(3000);
    ok((await me.session(s.id)).state === 'waiting', '물어 놓고 차례가 끝나도 세션은 답을 기다려요', (await me.session(s.id)).state);
    await me.pick(card, 1);
    ok((await me.ended(s.id))?.state === 'done', '비동기 질문에 답하면 이어져서 끝나요');
    ok(heard.get(s.key).text.includes('The user answered \"파랑\"'), '고른 답이 그대로 전해져요');
  },
  async asynclive() {
    if (classic) return;
    const me = await person('asynclive');
    const s = await me.start('asynclive');
    const two = await me.until(async () => { const c = await me.cards(); return c.length === 2 && c; });
    ok(Boolean(two), '비동기 질문과 승인이 함께 올라와요');
    if (!two) return;
    await me.pick(two.find(c => c.kind === 'choose'), 0);
    await me.pick(two.find(c => c.kind === 'approve'), decides('accept'));
    ok((await me.ended(s.id))?.state === 'done' && (await me.patch(s.id)).text.includes('+LIVE'), '도는 중에 답해도 세션이 끝까지');
    ok(heard.get(s.key).text.includes('The user answered \"빨강\"'), '도는 차례에 답이 끼어들어요');
  },
  async expired() {
    const me = await person('expired');
    const key = randomBytes(6).toString('hex');
    expired.add(key);
    const r = await me.call('POST', '/agent-sessions', { request_key: randomUUID(), task: `CASE:expired:${key}` });
    ok(Boolean(await me.state(r.json.id, ['blocked'])), '로그인이 풀리면 세션은 멈춰서 기다려요');
    ok((await me.cards()).some(c => c.kind === 'failed'), '풀림 카드가 올라와요');
    expired.delete(key); await me.signIn();
    ok((await me.ended(r.json.id))?.state === 'done', '다시 로그인하면 이어져요');
  },
  async handoff() {
    const me = await person('handoff');
    const s = await me.start('handoff');
    const card = await me.card();
    if (!card) return ok(false, '내가 직접: 카드 없음');
    await me.call('POST', `/cards/${card.id}/handoff`, { request_key: randomUUID(), version: card.version, surface: 'web' });
    ok((await me.ended(s.id))?.state === 'done' && !(await me.patch(s.id)).text.includes('handoff.txt'), "'내가 직접'은 실행 없이 이어져요");
  },
  async cancel() {
    const me = await person('cancel');
    const s = await me.start('cancel');
    const card = await me.card();
    await me.call('DELETE', `/agent-sessions/${s.id}`);
    ok((await me.ended(s.id))?.state === 'cancelled', '세션을 멈출 수 있어요');
    ok(card && (await me.cards()).length === 0, '멈추면 묻던 카드도 닫혀요');
  },
  async queue() {
    const people = [await person('q1'), await person('q2'), await person('q3'), await person('q4')];
    const started = [];
    for (const p of people.slice(0, 3)) { started.push(await p.start('queue')); await p.card(); }
    const last = await people[3].start('queue');
    await sleep(3000);
    ok((await people[3].session(last.id)).state === 'queued', '자리가 다 차면 줄에서 기다려요');
    await people[0].call('DELETE', `/agent-sessions/${started[0].id}`);
    ok(Boolean(await people[3].state(last.id, ['waiting'], 45_000)), '자리가 비면 다음 세션이 시작돼요');
    for (const [i, p] of [[1, people[1]], [2, people[2]]]) await p.call('DELETE', `/agent-sessions/${started[i].id}`);
    await people[3].call('DELETE', `/agent-sessions/${last.id}`);
    for (const [i, p] of [[1, people[1]], [2, people[2]]]) await p.ended(started[i].id);
    await people[3].ended(last.id);
  },
};
async function hour() {
  const me = await person('hour');
  const s = await me.start('hour');
  const card = await me.card();
  if (!card) return ok(false, '한 시간: 카드 없음');
  console.log(`waiting ${waitMinutes} minutes since ${new Date().toISOString()}`);
  await sleep(waitMinutes * 60_000);
  const still = await me.cards();
  ok(still.length === 1 && still[0].id === card.id, `${waitMinutes}분 뒤에도 카드는 그대로`);
  ok(calls.get(s.key) === 1, '기다리는 동안 모델을 부르지 않아요(한도)', String(calls.get(s.key)));
  await me.pick(card, decides('accept'));
  ok((await me.ended(s.id))?.state === 'done' && (await me.patch(s.id)).text.includes('+HOUR'), `${waitMinutes}분 뒤에 답해도 세션이 이어져요`);
}

// 이 시험이 만든 계정(session-…@example.test)만
const MINE = "SELECT cell FROM front.accounts WHERE email LIKE 'session-%@example.test'";
async function sweep() {
  await sql(`UPDATE catchup.agent_sessions SET cancel_wanted = true WHERE state NOT IN ('done', 'failed', 'cancelled') AND cell IN (${MINE})`);
  let left = '1';
  for (let i = 0; i < 60 && left !== '0'; i++) {
    await sleep(500);
    left = await sql(`SELECT count(*) FROM catchup.agent_sessions WHERE state NOT IN ('done', 'failed', 'cancelled') AND cell IN (${MINE})`);
  }
  // 가짜 '로그인됨'이 진짜 에이전트에게 넘어가지 않게
  await sql(`UPDATE catchup.codex_logins SET state = 'none' WHERE auth IS NULL AND state <> 'none' AND cell IN (${MINE})`);
  return left;
}
await local('compose', 'stop', 'agent'); // 에이전트 일꾼은 한 벌만
try {
  await docker('create', '--name', name, '--network', 'catchup_default', '-v', 'catchup_codehost-sock:/run/codehost:ro', '-e', 'CATCHUP_CODE_HOST=/run/codehost/code.sock', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    ...[1, 2, 3].flatMap(n => ['-v', `catchup_sandbox${n}-sock:/run/sandbox/${n}:ro`]),
    '-e', 'WRAPPER', '-e', 'CATCHUP_DB_APP_PASSWORD', '-e', 'CATCHUP_MASTER_KEY', '-e', 'CATCHUP_GATEWAY_SECRET',
    '-e', 'CATCHUP_DB_HOST=postgres', '-e', 'CATCHUP_BIND=0.0.0.0:4330', '-e', 'CATCHUP_CODEX_BIN=/var/tmp/codex-fake',
    '-e', 'CATCHUP_CODEX_VOLATILE=/var/tmp/run', '-e', 'CATCHUP_CODEX_DURABLE=/var/tmp/data',
    '-e', 'CATCHUP_SANDBOXES=/run/sandbox/1/exec.sock,/run/sandbox/2/exec.sock,/run/sandbox/3/exec.sock',
    '--entrypoint', '/bin/sh', 'catchup-agent:local', '-c', 'printf "%s\\n" "$WRAPPER" > /var/tmp/codex-fake && chmod 700 /var/tmp/codex-fake && exec catchup-api agent');
  await docker('cp', `${root}/services/api/tests/code-mode-model.json`, `${name}:/var/tmp/code-mode-model.json`);
  await docker('start', name);
  await sleep(2000);
  if ((await sweep()) !== '0') throw new Error('earlier test sessions did not finish');
  for (const [label, fn] of waitMinutes ? [['hour', hour]] : Object.entries(cases)) {
    if (!waitMinutes && only && !only.split(',').includes(label)) continue;
    console.log(`## ${label}`);
    try { await fn(); } catch (error) { failed++; console.log('ERR', String(error).slice(0, 400)); }
  }
  if (agents.size) ok(![...agents].some(a => /catch.?up/i.test(a)), '모델 쪽으로 프로젝트 이름이 안 나가요', [...agents][0].slice(0, 120));
  ok((await sweep()) === '0', '시험이 남긴 세션이 없어요');
  const memory = (await docker('stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}}')).split('\n').filter(l => /sandbox|agent/.test(l));
  console.log('MEASURE', JSON.stringify({ ...measure, memory }));
} catch (error) {
  failed++; console.log('ERR', String(error).slice(0, 600));
} finally {
  const logs = await docker('logs', '--tail', '400', name).catch(() => '');
  if (failed) console.log('--- agent log\n' + logs.split('\n').filter(l => /WARN|ERROR/.test(l)).slice(-25).map(l => l.slice(0, 300)).join('\n'));
  await docker('rm', '-f', name).catch(() => undefined);
  await local('compose', 'start', 'agent');
  model.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
