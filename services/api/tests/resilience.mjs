// Postgres 강제 종료 · 칸 200개에 한꺼번에 때가 된 실행.
// 쓰는 법: node services/api/tests/resilience.mjs   (먼저 zsh infra/local/local.sh up)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const CELLS = 200;
let failed = 0;
const ok = (cond, name, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name} ${extra}`); };
const local = (args, input = '') => {
  const r = spawnSync('zsh', ['infra/local/local.sh', ...args], { cwd: root, input, encoding: 'utf8', timeout: 90_000 });
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr.slice(-600)}`);
  return r.stdout.trim();
};
const sql = q => local(['compose', 'exec', '-T', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'catchup_owner', '-d', 'catchup', '-Atc', q]);
const tag = `load${Date.now()}`;

function due(n, inSeconds) {
  // 시험 칸 n개에 카드 · 답 · 기다리는 실행을 하나씩
  sql(`CREATE TEMP TABLE t AS SELECT gen_random_uuid() cell, gen_random_uuid() card, gen_random_uuid() answer FROM generate_series(1, ${n});
    INSERT INTO catchup.cells (cell, wrapped_key) SELECT cell, '\\x00' FROM t;
    INSERT INTO catchup.decision_cards (cell, id, dedupe_key, kind, source, source_ref, source_version, question, options, state)
      SELECT cell, card, '${tag}-${inSeconds}', 'reply', '{}', '${tag}-${inSeconds}', '1', 'q', '[]', 'answered' FROM t;
    INSERT INTO catchup.card_answers (cell, id, card, request_key, request_hash, card_version, kind, option_index, chosen, surface)
      SELECT cell, answer, card, gen_random_uuid(), '\\x01', 1, 'option', 0, '{}', 'web' FROM t;
    INSERT INTO catchup.action_receipts (cell, card, answer, effect, source_ref, source_version, run_after)
      SELECT cell, card, answer, '{"kind":"send","to":"load","text":"x"}', '${tag}-${inSeconds}', '1', now() + interval '${inSeconds} seconds' FROM t;`);
}
const state = inSeconds => sql(`SELECT count(*) FILTER (WHERE r.state = 'succeeded') || ' ' ||
    (SELECT count(*) FROM catchup.local_effects e JOIN catchup.action_receipts x ON x.cell = e.cell AND x.id = e.id WHERE x.source_ref = '${tag}-${inSeconds}') || ' ' ||
    coalesce(round(extract(epoch FROM max(r.finished_at) - min(r.run_after)) * 1000), 0)
  FROM catchup.action_receipts r WHERE r.source_ref = '${tag}-${inSeconds}'`).split(' ').map(Number);

async function finished(n, key, limitMs) {
  const end = Date.now() + limitMs;
  let got;
  do { await sleep(700); got = state(key); } while (got[0] < n && Date.now() < end);
  return got;
}

due(CELLS, 3);
const [done, effects, ms] = await finished(CELLS, 3, 60_000);
ok(done === CELLS && effects === CELLS, `칸 ${CELLS}개가 모두 한 번씩`, `${done}/${effects}`);

due(20, 2);
local(['compose', 'kill', '-s', 'SIGKILL', 'postgres']);
await sleep(4000);
const down = await fetch('http://127.0.0.1:4320/health/ready', { signal: AbortSignal.timeout(9000) }).then(r => r.status, () => 0);
ok(down !== 204, 'DB 가 죽으면 준비 안 됨으로 알려요', down);
const started = performance.now();
local(['compose', 'start', 'postgres']);
let back = null;
while (back === null && performance.now() - started < 30_000) {
  if (await fetch('http://127.0.0.1:4320/health/ready', { signal: AbortSignal.timeout(9000) }).then(r => r.status === 204, () => false)) back = performance.now() - started;
  else await sleep(200);
}
ok(back !== null, 'DB 가 돌아오면 서버를 다시 켜지 않아도 돌아와요', Math.round(back));
const [done2, effects2] = await finished(20, 2, 30_000);
const resumed = performance.now() - started;
ok(done2 === 20 && effects2 === 20, 'DB 강제 종료 뒤에도 한 번씩', `${done2}/${effects2}`);

console.log('MEASURE', JSON.stringify({ cells: CELLS, all_cells_ms: ms, db_back_ms: Math.round(back), db_resumed_ms: Math.round(resumed) }));
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
