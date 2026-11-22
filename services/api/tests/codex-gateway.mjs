// LLM 창구를 실제 Codex 0.163.0 + 가짜 모델로. 계정 · 토큰은 쓰지 않아요.
// 제품에 시험용 구멍을 두지 않으려고, 바이너리 자리에 '가짜 모델로 돌리는 겉싸개'를 넣은 시험 컨테이너를 잠깐 띄워요.
// 쓰는 법: node services/api/tests/codex-gateway.mjs   (먼저 zsh infra/local/local.sh up)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const secrets = Object.fromEntries(readFileSync(`${root}/.local/secrets/compose.env`, 'utf8').trim().split('\n').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
let failed = 0;
const ok = (cond, name, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
// 가짜 모델 서버가 같은 프로세스라서 동기로 기다리면 안 돼요
const run = (cmd, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd: root, env });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  child.on('close', code => (code ? reject(new Error(err.slice(-600))) : resolve(out.trim())));
});
const local = (...args) => run('zsh', ['infra/local/local.sh', ...args]);
const sql = q => local('compose', 'exec', '-T', 'postgres', 'psql', '-X', '-U', 'catchup_owner', '-d', 'catchup', '-Atc', q);

let next = { text: 'ok' }, seen = [];
const model = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    if (!req.url.includes('/responses')) { res.writeHead(404); return res.end(); }
    try { seen.push(JSON.parse(body)); } catch { seen.push({}); }
    if (next.status) { res.writeHead(next.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify(next.body)); }
    const id = `resp_${seen.length}`;
    const item = next.call && seen.length === 1
      ? next.call.js
        ? { type: 'custom_tool_call', id: 'ctc', call_id: 'c1', name: 'exec', input: next.call.js }
        : { type: 'function_call', id: 'fc', call_id: 'c1', name: next.call.name, arguments: JSON.stringify(next.call.args) }
      : { type: 'message', id: 'm', role: 'assistant', content: [{ type: 'output_text', text: next.text ?? 'fin' }] };
    const events = [{ type: 'response.created', response: { id } }, { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    res.end();
  });
});
await new Promise(r => model.listen(0, '127.0.0.1', r));

const PORT = 14330, name = `catchup-gateway-test-${process.pid}`, secret = randomBytes(32).toString('hex');
const fake = `http://192.168.5.2:${model.address().port}/v1`;   // Colima 에서 본 이 Mac 의 127.0.0.1
const wrapper = [
  '#!/bin/sh',
  `exec /opt/codex/bin/codex-app-server "$@" -c 'model_provider="fake"' -c 'model="code-mode-test"' -c 'model_catalog_json="/tmp/code-mode-model.json"' -c 'model_providers.fake.name="fake"' \\`,
  `  -c 'model_providers.fake.base_url="${fake}"' -c 'model_providers.fake.wire_api="responses"' -c 'model_providers.fake.requires_openai_auth=false' \\`,
  "  -c 'model_providers.fake.supports_websockets=false' -c 'model_providers.fake.request_max_retries=0' -c 'model_providers.fake.stream_max_retries=0'",
].join('\n');
const dockerEnv = {
  ...process.env, DOCKER_HOST: `unix://${root}/.local/colima/default/docker.sock`, DOCKER_CONFIG: `${root}/.local/docker`,
  CATCHUP_DB_APP_PASSWORD: secrets.CATCHUP_DB_APP_PASSWORD, CATCHUP_MASTER_KEY: secrets.CATCHUP_MASTER_KEY, CATCHUP_GATEWAY_SECRET: secret, WRAPPER: wrapper,
};
const docker = (...args) => run('docker', args, dockerEnv);

let mine;
await local('compose', 'stop', 'agent'); // 에이전트 일꾼은 한 벌만
try {
  await docker('create', '--name', name, '--network', 'catchup_default', '-v', 'catchup_codehost-sock:/run/codehost:ro', '-e', 'CATCHUP_CODE_HOST=/run/codehost/code.sock', '-p', `127.0.0.1:${PORT}:4330`, '--cap-drop', 'ALL',
    '-e', 'WRAPPER', '-e', 'CATCHUP_DB_APP_PASSWORD', '-e', 'CATCHUP_MASTER_KEY', '-e', 'CATCHUP_GATEWAY_SECRET',
    '-e', 'CATCHUP_DB_HOST=postgres', '-e', 'CATCHUP_BIND=0.0.0.0:4330', '-e', 'CATCHUP_CODEX_BIN=/tmp/codex-fake',
    '-e', 'CATCHUP_CODEX_VOLATILE=/var/tmp/run', '-e', 'CATCHUP_CODEX_DURABLE=/var/tmp/data',
    '--entrypoint', '/bin/sh', 'catchup-agent:local', '-c', 'printf "%s\\n" "$WRAPPER" > /tmp/codex-fake && chmod 700 /tmp/codex-fake && exec catchup-api agent');
  await docker('cp', `${root}/services/api/tests/code-mode-model.json`, `${name}:/tmp/code-mode-model.json`);
  await docker('start', name);
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 100 && !(await fetch(`${base}/health/live`).then(r => r.ok, () => false)); i++) await sleep(200);

  const stamp = Date.now();
  const cell = await local('ops', 'provision', `gateway-${stamp}@example.test`);
  const other = await local('ops', 'provision', `gateway-other-${stamp}@example.test`);
  mine = cell;
  const signIn = () => sql(`INSERT INTO catchup.codex_logins (cell, state) VALUES ('${cell}', 'in') ON CONFLICT (cell) DO UPDATE SET state = 'in'`);
  await signIn();
  const ask = async (body, as = cell, key = secret, path = 'responses') => {
    const r = await fetch(`${base}/v1/${path}`, {
      method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${key}`, 'x-catchup-cell': as, 'content-type': 'application/json' },
      body: body && JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, json: {} }; }
  };

  ok((await ask({ input: '안녕' }, cell, 'wrong')).status === 401, '비밀이 틀리면 막아요');
  ok((await ask({ input: '안녕' }, other)).json.error === 'signed_out', '다른 칸의 로그인을 빌려 쓰지 못해요');

  next = { text: '네, 반가워요' }; seen = [];
  let t = performance.now();
  let r = await ask({ input: '안녕', instructions: '짧게 답해요' });
  const cold = Math.round(performance.now() - t);
  ok(r.json.output?.[0].content[0].text === '네, 반가워요', '짧은 질문에 답을 받아요', r.json.error ?? `${cold}ms`);
  const tools = (seen[0]?.tools ?? []).map(x => x.name ?? x.type);
  // code mode 는 도구를 JS 의 tools.* 로 줘요. exec 안에 실행 · 파일 · 웹이 없어야
  // exec 의 안내글에는 예로 tools.exec_command 가 적혀 있어요. 실제로 내준 도구(이름 · 선언)만 봐요
  const nested = JSON.stringify([seen[0]?.tools ?? [], seen[0]?.input ?? []]);
  const given = nested.match(/"name":"(spawn_agent|send_message|shell|apply_patch|view_image|write_stdin|exec_command|web_search)"|(?:^|[^.\w])(exec_command|write_stdin|apply_patch|view_image|web__run)\((?:args|input|value)/);
  ok(seen.length > 0 && !given, '모델에게 실행 · 파일 · 웹 · 하위 에이전트 도구가 없어요', given?.[0] ?? JSON.stringify(tools));

  const schema = { type: 'object', additionalProperties: false, properties: { card: { type: 'boolean' } }, required: ['card'] };
  next = { text: '{"card":true}' }; seen = []; t = performance.now();
  r = await ask({ input: '카드여야 하나요', text: { format: { type: 'json_schema', name: 'triage', schema } } });
  const warm = Math.round(performance.now() - t);
  ok(r.status === 200 && JSON.stringify(seen[0]?.text ?? {}).includes('card'), '답 모양(JSON Schema)이 전해져요', `${warm}ms`);

  for (const [label, call] of [
    ['JS 안의 셸', { js: 'text(await tools.exec_command({cmd:"id"}))' }],
    ['JS', { js: 'text(String(1 + 1))' }],
    ['셸', { name: 'exec_command', args: { cmd: 'cat /var/tmp/run/*/auth.json' } }],
    ['파일 보기', { name: 'view_image', args: { path: '/etc/passwd' } }],
    ['질문', { name: 'request_user_input', args: { questions: [{ id: 'q', header: 'q', question: 'q?', options: [{ label: 'a', description: 'a' }, { label: 'b', description: 'b' }] }] } }],
  ]) {
    next = { call, text: '도구 뒤에 쓴 답' }; seen = [];
    r = await ask({ input: '도구를 써 봐요' });
    ok(r.json.error === 'tool_use_blocked', `도구(${label})를 쓰려 하면 멈춰요`, r.json.error ?? '');
  }

  const stream = async input => {
    const r = await fetch(`${base}/v1/responses`, {
      method: 'POST', headers: { authorization: `Bearer ${secret}`, 'x-catchup-cell': cell, 'content-type': 'application/json' },
      body: JSON.stringify({ input, stream: true }), signal: AbortSignal.timeout(60_000),
    });
    const events = [...(await r.text()).matchAll(/^data: ?(\{.*\})$/gm)].map(m => JSON.parse(m[1]));
    return { type: r.headers.get('content-type') ?? '', events };
  };
  next = { text: '흘려 주는 답' }; seen = [];
  let s = await stream('흘려 줘요');
  ok(s.type.startsWith('text/event-stream') && s.events.filter(e => e.type === 'response.output_text.delta').map(e => e.delta).join('') === '흘려 주는 답'
    && s.events.at(-1)?.type === 'response.completed', '글자를 흘려요(stream)', JSON.stringify(s.events).slice(0, 200));
  next = { call: { name: 'exec_command', args: { cmd: 'id' } }, text: '도구 뒤' }; seen = [];
  s = await stream('흘리다 도구');
  ok(s.events.at(-1)?.type === 'response.failed' && s.events.at(-1).response.error.code === 'tool_use_blocked', '흘리는 중에도 도구를 쓰면 멈춰요');

  ok((await ask({ input: 'x', tools: [{ type: 'function', name: 'f' }] })).json.error === 'unsupported', '도구를 건네받지 않아요');
  ok((await ask(undefined, cell, secret, 'models')).json.object === 'list', '모델 목록');

  next = { status: 429, body: { error: { type: 'usage_limit_reached', message: 'limit', plan_type: 'plus', resets_at: Math.floor(Date.now() / 1000) + 3600 } } }; seen = [];
  r = await ask({ input: '한도' });
  ok(r.json.error === 'limit_reached', '한도가 차면 그렇다고', r.json.error ?? '');
  ok((await sql(`SELECT count(*) FROM catchup.decision_cards WHERE cell = '${cell}' AND dedupe_key LIKE 'codex:limit:%'`)) === '1', '한도 카드가 그 칸에');

  next = { status: 401, body: { error: { message: 'unauthorized', type: 'invalid_request_error', code: 'token_invalidated' } } }; seen = [];
  r = await ask({ input: '풀림' });
  ok(r.json.error === 'signed_out', '로그인이 풀리면 그렇다고', r.json.error ?? '');
  ok((await sql(`SELECT count(*) FROM catchup.decision_cards WHERE cell = '${cell}' AND dedupe_key LIKE 'codex:expired:%'`)) === '1', '풀림 카드가 그 칸에');
  ok((await sql(`SELECT count(*) FROM catchup.decision_cards WHERE cell = '${other}'`)) === '0', '다른 칸은 그대로');

  const memory = await docker('stats', '--no-stream', '--format', '{{.MemUsage}}', name);
  console.log('MEASURE', JSON.stringify({ cold_ms: cold, warm_ms: warm, memory }));
} catch (error) {
  failed++;
  console.log('ERR', String(error).slice(0, 600));
} finally {
  await docker('rm', '-f', name).catch(() => undefined);
  // 가짜 '로그인됨'이 진짜 에이전트에게 넘어가지 않게(이 시험이 만든 칸만)
  if (mine) {
    await sql(`UPDATE catchup.codex_logins SET state = 'none' WHERE cell = '${mine}' AND auth IS NULL`).catch(error => {
      failed++;
      console.log('ERR cleanup', String(error).slice(0, 200));
    });
  }
  await local('compose', 'start', 'agent');
  model.close();
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
