// 백업에서 되살리기(3.5단계 끝 기준): 빈 새 Postgres 에 되살린 DB 로 열린 카드와 영수증이 그대로 보여요.
//   1) 시험 계정에 카드 둘을 넣고 하나에 답해요(영수증이 생겨요)  2) infra/ops/pg.sh 로 백업
//   3) 따로 띄운 빈 Postgres 에 되살려요  4) 표마다 줄 수와 내용이 같은지 견줘요
//   5) 되살린 DB 에 서버를 붙여 새로 로그인하고, 열린 카드 · 영수증을 원래 서버와 견줘요
// 쓰는 법: node services/api/tests/backup.mjs   (먼저 zsh infra/local/local.sh up)
// 제가 띄운 컨테이너(catchup-restore-*)와 백업 파일만 지워요. 쓰던 DB 는 읽기만 해요(시험 계정 하나가 늘어요).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const run = `${process.pid}-${Date.now()}`;
const PG = `catchup-restore-pg-${run}`, SERVER = `catchup-restore-api-${run}`, PORT = 4329;
const ORIGIN = 'http://127.0.0.1:5181';
const file = `${root}/.local/backups/test-${run}.dump`;
let failed = 0;
const ok = (cond, name, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const sh = (cmd, args, { input = '', env = {}, timeout = 180_000 } = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, input, encoding: 'utf8', timeout, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 4).join(' ')}: ${r.stderr.slice(-600)}`);
  return r.stdout.trim();
};
const local = (args, opts) => sh('zsh', ['infra/local/local.sh', ...args], opts);
const psql = ['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'catchup_owner', '-d', 'catchup', '-At'];
const live = q => local(['compose', 'exec', '-T', 'postgres', ...psql, '-c', q]);
const restored = q => local(['docker', 'exec', '-i', PG, ...psql, '-c', q]);

const card = (key, question) => ({
  dedupe_key: key, kind: 'reply', source: { type: 'local', from: '백업 시험' }, source_ref: key, source_version: '1', question,
  options: [{ label: '보내요', done: '보냈어요', effect: { kind: 'send', to: '백업 시험', text: `${question} — 네` } }], reply_path: 'send',
});
async function signIn(api, email, code) {
  const r = await fetch(`${api}/v1/auth/session`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email, code, label: 'backup test' }) });
  if (r.status !== 204) throw new Error(`login ${r.status}`);
  const session = r.headers.get('set-cookie').split(';')[0];
  return async (method, path, body) => {
    const res = await fetch(`${api}${path}`, { method, headers: { cookie: session, 'content-type': 'application/json', origin: ORIGIN }, body: body && JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
/** 화면이 보는 것: 열린 카드의 질문과, 처리 기록의 줄(무엇을 · 어떤 상태로) */
async function seen(call) {
  const cards = (await call('GET', '/v1/me/cards')).json.cards.map(c => `${c.id} ${c.question}`).sort();
  const activity = (await call('GET', '/v1/me/activity')).json;
  return { cards, activity: JSON.stringify(activity) };
}
// 표마다 줄 수와 내용의 지문. 칸 · 앞단의 모든 표와 마이그레이션 기록을 봐요
const FINGERPRINT = `SELECT string_agg(line, E'\\n' ORDER BY line) FROM (
  SELECT format('%s.%s %s', n.nspname, c.relname,
    (xpath('/row/v/text()', query_to_xml(format('SELECT count(*) || '' '' || coalesce(md5(string_agg(t::text, '''' ORDER BY t::text)), ''-'') AS v FROM %I.%I t', n.nspname, c.relname), false, true, '')))[1]::text) AS line
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r' AND (n.nspname IN ('catchup', 'front') OR c.relname = '_sqlx_migrations')) x`;
const SHAPE = `SELECT (SELECT count(*) FROM pg_policies WHERE schemaname IN ('catchup', 'front')) || ' policies, '
  || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'catchup' AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity) || ' forced, '
  || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('catchup', 'front')) || ' functions, '
  || (SELECT count(*) FROM pg_indexes WHERE schemaname IN ('catchup', 'front')) || ' indexes'`;

try {
  // 1) 있던 일
  const email = `backup-${run}@example.test`;
  local(['ops', 'provision', email]);
  local(['ops', 'seed', email], { input: JSON.stringify([card(`backup-${run}-a`, '되살린 뒤에도 영수증이 보이나요?'), card(`backup-${run}-b`, '되살린 뒤에도 열려 있나요?')]) });
  const mine = await signIn('http://127.0.0.1:4320', email, local(['ops', 'login-code', email]));
  const first = (await mine('GET', '/v1/me/cards')).json.cards.find(c => c.question.includes('영수증'));
  const answered = await mine('POST', `/v1/me/cards/${first.id}/answer`, { request_key: randomUUID(), version: first.version, turn_seq: 0, option: 0, draft: null, confirmed: false, surface: 'web' });
  ok(answered.status === 200, '카드 하나에 답했어요', answered.status);
  const cell = live(`SELECT cell FROM front.accounts WHERE email = '${email}'`);
  for (let i = 0; i < 40 && live(`SELECT state FROM catchup.action_receipts WHERE cell = '${cell}'`) !== 'succeeded'; i++) await sleep(700);
  ok(live(`SELECT state FROM catchup.action_receipts WHERE cell = '${cell}'`) === 'succeeded', '10초 뒤에 실행돼 영수증이 남았어요');
  const before = await seen(mine);
  ok(before.cards.length === 1 && before.activity.includes('보냈어요'), '백업 전: 열린 카드 하나 · 처리 기록 한 줄');

  // 2) 백업 — 다른 것이 쓰는 동안에도 한 시점의 것이에요
  mkdirSync(`${root}/.local/backups`, { recursive: true, mode: 0o700 });
  const started = Date.now();
  sh('sh', ['infra/ops/pg.sh', 'dump', file], { env: { CATCHUP_PG: 'zsh infra/local/local.sh compose exec -T postgres' } });
  const dumpMs = Date.now() - started;
  ok(statSync(file).size > 10_000 && (statSync(file).mode & 0o077) === 0, '백업 파일은 나만 읽을 수 있어요', `${Math.round(statSync(file).size / 1024)}KB · ${dumpMs}ms`);
  // 백업 뒤에 생긴 일은 백업에 없어야 해요(표를 견줄 때는 같은 시점끼리 봐요)
  const fingerprint = live(FINGERPRINT), shape = live(SHAPE);

  // 3) 빈 새 Postgres — 쓰던 것과 볼륨 · 역할을 나누지 않아요
  const image = local(['compose', 'config', '--images']).split('\n').find(l => l.startsWith('postgres:'));
  const network = local(['docker', 'inspect', '--format', '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}', local(['compose', 'ps', '-q', 'postgres'])]);
  const password = randomUUID().replaceAll('-', '');
  local(['docker', 'run', '-d', '--name', PG, '--network', network, '--memory', '512m', '--tmpfs', '/var/lib/postgresql',
    '-e', 'POSTGRES_DB=catchup', '-e', 'POSTGRES_USER=catchup_owner', '-e', `POSTGRES_PASSWORD=${password}`, image]);
  for (let i = 0; i < 60; i++) {
    const up = spawnSync('zsh', ['infra/local/local.sh', 'docker', 'exec', PG, 'psql', '-X', '-U', 'catchup_owner', '-d', 'catchup', '-h', '127.0.0.1', '-Atc', 'SELECT 1'], { cwd: root, encoding: 'utf8' });
    if (up.status === 0) break;
    await sleep(500);
  }
  ok(restored("SELECT count(*) FROM pg_roles WHERE rolname = 'catchup_app'") === '0', '새 Postgres 에는 앱 역할이 아직 없어요');
  const restoring = Date.now();
  const env = { CATCHUP_PG: `zsh infra/local/local.sh docker exec -i ${PG}` };
  sh('sh', ['infra/ops/pg.sh', 'restore', file], { env });
  const restoreMs = Date.now() - restoring;

  // 4) 같은가요
  ok(restored(FINGERPRINT) === fingerprint, '모든 표의 줄 수와 내용이 같아요', `${fingerprint.split('\n').length}개 표 · 복구 ${restoreMs}ms`);
  ok(restored(SHAPE) === shape, '줄 단위 권한 · 함수 · 색인이 같아요', shape);
  ok(restored("SELECT rolcanlogin::text || rolsuper::text || rolbypassrls::text FROM pg_roles WHERE rolname = 'catchup_app'") === 'falsefalsefalse', '앱 역할은 권한 없이 생겨요(비밀번호는 migrate 가 넣어요)');
  const again = spawnSync('sh', ['infra/ops/pg.sh', 'restore', file], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  ok(again.status !== 0 && again.stderr.includes('비어 있지 않아요'), '쓰던 DB 위에는 되살리지 않아요');

  // 5) 서버를 붙여서 — migrate 는 할 일이 없고 앱 비밀번호만 넣어요
  const owner = ['-e', `CATCHUP_DB_HOST=${PG}`, '-e', `CATCHUP_DB_OWNER_PASSWORD=${password}`];
  local(['compose', 'run', '--rm', '--no-deps', '-T', ...owner, 'migrate']);
  ok(restored(FINGERPRINT) === fingerprint, 'migrate 를 돌려도 아무것도 바뀌지 않아요');
  local(['compose', 'run', '-d', '--no-deps', '--name', SERVER, '-p', `127.0.0.1:${PORT}:4320`, '-e', `CATCHUP_DB_HOST=${PG}`, 'api', 'serve']);
  const api = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 60 && !(await fetch(`${api}/health/ready`).then(r => r.status === 204, () => false)); i++) await sleep(500);
  const code = local(['compose', 'run', '--rm', '--no-deps', '-T', ...owner, 'ops', 'login-code', email]);
  const after = await seen(await signIn(api, email, code));
  ok(JSON.stringify(after.cards) === JSON.stringify(before.cards), '되살린 DB 에서 열린 카드가 그대로 보여요', after.cards.length);
  ok(after.activity === before.activity, '되살린 DB 에서 영수증(처리 기록)이 그대로 보여요');
  // 되살린 쪽에서 로그인한 것이 쓰던 DB 에 닿지 않았어요
  ok(live(`SELECT count(*) FROM front.devices WHERE cell = '${cell}'`) === '1', '되살린 서버는 쓰던 DB 를 건드리지 않아요');
  console.log(`MEASURE ${JSON.stringify({ dump_ms: dumpMs, restore_ms: restoreMs, dump_kb: Math.round(statSync(file).size / 1024), tables: fingerprint.split('\n').length })}`);
} catch (error) {
  failed++;
  console.log(`FAIL ${String(error.message ?? error).slice(0, 600)}`);
} finally {
  for (const name of [SERVER, PG]) spawnSync('zsh', ['infra/local/local.sh', 'docker', 'rm', '-f', name], { cwd: root });
  rmSync(file, { force: true }); rmSync(`${file}.part`, { force: true });
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
