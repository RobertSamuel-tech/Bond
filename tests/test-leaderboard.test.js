const path = require('path');
const os = require('os');
process.env.BOND_DB_PATH = path.join(os.tmpdir(), `bond-test-leaderboard-${process.pid}-${Date.now()}.db`);

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

async function post(pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

async function get(pathname) {
  const res = await fetch(`${base}${pathname}`);
  return { status: res.status, body: await res.json() };
}

test('GET /leaderboard with no stakes returns empty list', async () => {
  const { status, body } = await get('/leaderboard');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.count, 0);
  assert.deepStrictEqual(body.leaders, []);
});

test('GET /leaderboard ranks agents by active stake descending', async () => {
  await post('/stake', { agent_id: 'leader-small', amount: 100 });
  await post('/stake', { agent_id: 'leader-big', amount: 2000 });
  await post('/stake', { agent_id: 'leader-mid', amount: 700 });

  const { status, body } = await get('/leaderboard');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.count, 3);
  assert.deepStrictEqual(
    body.leaders.map((l) => l.agent_id),
    ['leader-big', 'leader-mid', 'leader-small']
  );
  assert.deepStrictEqual(
    body.leaders.map((l) => l.rank),
    [1, 2, 3]
  );
  const top = body.leaders[0];
  assert.strictEqual(top.active_stake, 2000);
  assert.strictEqual(top.total_staked, 2000);
  assert.strictEqual(top.slash_count, 0);
  assert.strictEqual(top.verdict, 'HIGH_CREDIBILITY');
});

test('GET /leaderboard respects limit param', async () => {
  const { body } = await get('/leaderboard?limit=2');
  assert.strictEqual(body.count, 2);
  assert.strictEqual(body.leaders.length, 2);
  assert.strictEqual(body.leaders[0].agent_id, 'leader-big');
});

test('GET /leaderboard caps limit at 50 and ignores invalid limit', async () => {
  const capped = await get('/leaderboard?limit=9999');
  assert.strictEqual(capped.status, 200);
  assert.strictEqual(capped.body.ok, true);
  const garbage = await get('/leaderboard?limit=abc');
  assert.strictEqual(garbage.status, 200);
  assert.strictEqual(garbage.body.ok, true);
  assert.strictEqual(garbage.body.count, 3);
});

test('GET /leaderboard respects min_stake filter', async () => {
  const { body } = await get('/leaderboard?min_stake=500');
  assert.strictEqual(body.count, 2);
  assert.deepStrictEqual(
    body.leaders.map((l) => l.agent_id),
    ['leader-big', 'leader-mid']
  );
});

test('GET /leaderboard reflects slashes in active stake and verdict', async () => {
  const stake = await post('/stake', { agent_id: 'leader-slashed', amount: 1000 });
  await post('/slash', {
    bond_id: stake.body.bond_id,
    slashed_by: 'watchdog',
    amount: 200,
    reason: 'sloppy work'
  });
  const { body } = await get('/leaderboard');
  const entry = body.leaders.find((l) => l.agent_id === 'leader-slashed');
  assert.ok(entry, 'slashed agent still appears while bond is active');
  assert.strictEqual(entry.active_stake, 800);
  assert.strictEqual(entry.slash_count, 1);
  assert.match(entry.verdict, /^MODERATE_RISK/);
});

test('GET /leaderboard excludes agents whose bonds are all deactivated', async () => {
  const stake = await post('/stake', { agent_id: 'leader-gone', amount: 100 });
  await post('/slash', {
    bond_id: stake.body.bond_id,
    slashed_by: 'watchdog',
    amount: 100,
    reason: 'fraud'
  });
  const { body } = await get('/leaderboard');
  assert.strictEqual(body.leaders.some((l) => l.agent_id === 'leader-gone'), false);
});
