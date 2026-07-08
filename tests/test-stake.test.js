const path = require('path');
const os = require('os');
process.env.BOND_DB_PATH = path.join(os.tmpdir(), `bond-test-stake-${process.pid}-${Date.now()}.db`);

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const { calculateVerdict } = require('../utils/verdict');

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

test('POST /stake happy path returns 201 with bond_id and active_stake', async () => {
  const { status, body } = await post('/stake', {
    agent_id: 'stake-agent-1',
    amount: 500,
    reason: 'testing'
  });
  assert.strictEqual(status, 201);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(typeof body.bond_id, 'string');
  assert.ok(body.bond_id.length > 0);
  assert.strictEqual(body.agent_id, 'stake-agent-1');
  assert.strictEqual(body.amount, 500);
  assert.strictEqual(body.active_stake, 500);
  assert.strictEqual(typeof body.message, 'string');
});

test('POST /stake accumulates active_stake across bonds', async () => {
  const first = await post('/stake', { agent_id: 'stake-agent-multi', amount: 300 });
  assert.strictEqual(first.body.active_stake, 300);
  const second = await post('/stake', { agent_id: 'stake-agent-multi', amount: 200 });
  assert.strictEqual(second.status, 201);
  assert.strictEqual(second.body.active_stake, 500);
});

test('POST /stake missing agent_id returns 400 with specific message', async () => {
  const { status, body } = await post('/stake', { amount: 500 });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /agent_id/);
});

test('POST /stake empty agent_id returns 400', async () => {
  const { status, body } = await post('/stake', { agent_id: '', amount: 500 });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /agent_id/);
});

test('POST /stake missing amount returns 400', async () => {
  const { status, body } = await post('/stake', { agent_id: 'stake-agent-2' });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /stake non-numeric amount returns 400', async () => {
  const { status, body } = await post('/stake', { agent_id: 'stake-agent-2', amount: 'abc' });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /stake decimal amount returns 400', async () => {
  const { status, body } = await post('/stake', { agent_id: 'stake-agent-2', amount: 10.5 });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /stake zero amount returns 400', async () => {
  const { status, body } = await post('/stake', { agent_id: 'stake-agent-2', amount: 0 });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /stake negative amount returns 400', async () => {
  const { status, body } = await post('/stake', { agent_id: 'stake-agent-2', amount: -50 });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('GET /stake without agent_id returns 400', async () => {
  const { status, body } = await get('/stake');
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /agent_id/);
});

test('GET /stake/:agent_id for agent with no bonds returns 200 with NO_STAKE verdict', async () => {
  const { status, body } = await get('/stake/never-staked-agent');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.agent_id, 'never-staked-agent');
  assert.strictEqual(body.total_staked, 0);
  assert.strictEqual(body.active_stake, 0);
  assert.strictEqual(body.total_slashed, 0);
  assert.strictEqual(body.slash_count, 0);
  assert.match(body.verdict, /^NO_STAKE/);
});

test('GET /stake/:agent_id reflects a posted stake', async () => {
  await post('/stake', { agent_id: 'stake-agent-3', amount: 500, reason: 'visible' });
  const { status, body } = await get('/stake/stake-agent-3');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.total_staked, 500);
  assert.strictEqual(body.active_stake, 500);
  assert.strictEqual(body.total_slashed, 0);
  assert.strictEqual(body.slash_count, 0);
  assert.strictEqual(typeof body.staking_since, 'string');
  assert.strictEqual(body.verdict, 'MODERATE_CREDIBILITY');
});

test('GET /stake/:agent_id high stake with no slashes is HIGH_CREDIBILITY', async () => {
  await post('/stake', { agent_id: 'stake-agent-rich', amount: 1500 });
  const { body } = await get('/stake/stake-agent-rich');
  assert.strictEqual(body.verdict, 'HIGH_CREDIBILITY');
});

test('GET /stake/:agent_id tiny stake with no slashes is LOW_CREDIBILITY', async () => {
  await post('/stake', { agent_id: 'stake-agent-tiny', amount: 50 });
  const { body } = await get('/stake/stake-agent-tiny');
  assert.strictEqual(body.verdict, 'LOW_CREDIBILITY');
});

test('GET /stake/:agent_id fully slashed agent is UNTRUSTWORTHY', async () => {
  const stake = await post('/stake', { agent_id: 'stake-agent-doomed', amount: 400 });
  const slash = await post('/slash', {
    bond_id: stake.body.bond_id,
    slashed_by: 'enforcer',
    amount: 400,
    reason: 'total fraud',
    proof: 'receipts'
  });
  assert.strictEqual(slash.status, 201);
  assert.strictEqual(slash.body.bond_deactivated, true);
  const { body } = await get('/stake/stake-agent-doomed');
  assert.strictEqual(body.active_stake, 0);
  assert.match(body.verdict, /^UNTRUSTWORTHY/);
});

test('GET /stake/:agent_id partially slashed agent shows reduced stake and slashed verdict', async () => {
  const stake = await post('/stake', { agent_id: 'stake-agent-dinged', amount: 500 });
  await post('/slash', {
    bond_id: stake.body.bond_id,
    slashed_by: 'enforcer',
    amount: 200,
    reason: 'late delivery',
    proof: 'deadline was yesterday'
  });
  const { body } = await get('/stake/stake-agent-dinged');
  assert.strictEqual(body.active_stake, 300);
  assert.strictEqual(body.total_slashed, 200);
  assert.strictEqual(body.slash_count, 1);
  assert.match(body.verdict, /slashed/);
});

test('verdict unit: exported calculateVerdict covers every branch', () => {
  assert.match(
    calculateVerdict({ hasBonds: false, activeStake: 0, slashCount: 0, totalSlashed: 0 }),
    /^NO_STAKE/
  );
  assert.strictEqual(
    calculateVerdict({ hasBonds: true, activeStake: 1000, slashCount: 0, totalSlashed: 0 }),
    'HIGH_CREDIBILITY'
  );
  assert.strictEqual(
    calculateVerdict({ hasBonds: true, activeStake: 100, slashCount: 0, totalSlashed: 0 }),
    'MODERATE_CREDIBILITY'
  );
  assert.strictEqual(
    calculateVerdict({ hasBonds: true, activeStake: 50, slashCount: 0, totalSlashed: 0 }),
    'LOW_CREDIBILITY'
  );
  assert.match(
    calculateVerdict({ hasBonds: true, activeStake: 800, slashCount: 1, totalSlashed: 100 }),
    /^MODERATE_RISK/
  );
  assert.match(
    calculateVerdict({ hasBonds: true, activeStake: 300, slashCount: 1, totalSlashed: 200 }),
    /^LOW_CREDIBILITY — has been slashed/
  );
  assert.match(
    calculateVerdict({ hasBonds: true, activeStake: 0, slashCount: 2, totalSlashed: 500 }),
    /^UNTRUSTWORTHY/
  );
});
