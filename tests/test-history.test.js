const path = require('path');
const os = require('os');
process.env.BOND_DB_PATH = path.join(os.tmpdir(), `bond-test-history-${process.pid}-${Date.now()}.db`);

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

test('GET /history without agent_id returns 400', async () => {
  const { status, body } = await get('/history');
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /agent_id/);
});

test('GET /history/:agent_id with no history returns 200 with empty arrays and zeroed summary', async () => {
  const { status, body } = await get('/history/ghost-agent');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.agent_id, 'ghost-agent');
  assert.deepStrictEqual(body.stakes, []);
  assert.deepStrictEqual(body.slashes_received, []);
  assert.deepStrictEqual(body.summary, {
    total_ever_staked: 0,
    currently_active: 0,
    total_lost_to_slashes: 0,
    slash_incidents: 0
  });
});

test('GET /history/:agent_id returns full stakes, slashes and summary', async () => {
  const first = await post('/stake', {
    agent_id: 'history-agent',
    amount: 500,
    reason: 'first bond'
  });
  const second = await post('/stake', {
    agent_id: 'history-agent',
    amount: 300,
    reason: 'second bond'
  });
  await post('/slash', {
    bond_id: first.body.bond_id,
    slashed_by: 'watchdog',
    amount: 200,
    reason: 'missed deadline',
    proof: 'ticket link'
  });

  const { status, body } = await get('/history/history-agent');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);

  assert.strictEqual(body.stakes.length, 2);
  const stakeIds = body.stakes.map((s) => s.bond_id).sort();
  assert.deepStrictEqual(stakeIds, [first.body.bond_id, second.body.bond_id].sort());
  const firstStake = body.stakes.find((s) => s.bond_id === first.body.bond_id);
  assert.strictEqual(firstStake.amount, 500);
  assert.strictEqual(firstStake.reason, 'first bond');
  assert.strictEqual(firstStake.active, true);
  assert.strictEqual(typeof firstStake.date, 'string');

  assert.strictEqual(body.slashes_received.length, 1);
  const slash = body.slashes_received[0];
  assert.strictEqual(slash.bond_id, first.body.bond_id);
  assert.strictEqual(slash.amount, 200);
  assert.strictEqual(slash.reason, 'missed deadline');
  assert.strictEqual(slash.proof, 'ticket link');
  assert.strictEqual(slash.by, 'watchdog');
  assert.strictEqual(typeof slash.slash_id, 'string');
  assert.strictEqual(typeof slash.date, 'string');

  assert.deepStrictEqual(body.summary, {
    total_ever_staked: 800,
    currently_active: 600,
    total_lost_to_slashes: 200,
    slash_incidents: 1
  });
});

test('GET /history/:agent_id marks fully slashed bonds inactive', async () => {
  const stake = await post('/stake', { agent_id: 'history-wipeout', amount: 100 });
  await post('/slash', {
    bond_id: stake.body.bond_id,
    slashed_by: 'watchdog',
    amount: 100,
    reason: 'total failure'
  });
  const { body } = await get('/history/history-wipeout');
  assert.strictEqual(body.stakes.length, 1);
  assert.strictEqual(body.stakes[0].active, false);
  assert.strictEqual(body.summary.currently_active, 0);
  assert.strictEqual(body.summary.total_lost_to_slashes, 100);
});
