const path = require('path');
const os = require('os');
process.env.BOND_DB_PATH = path.join(os.tmpdir(), `bond-test-slash-${process.pid}-${Date.now()}.db`);

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

async function newBond(agentId, amount) {
  const { body } = await post('/stake', { agent_id: agentId, amount });
  return body.bond_id;
}

test('POST /slash happy path partial slash returns 201', async () => {
  const bondId = await newBond('slash-victim-1', 500);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 200,
    reason: 'late delivery',
    proof: 'deadline was yesterday'
  });
  assert.strictEqual(status, 201);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(typeof body.slash_id, 'string');
  assert.strictEqual(body.bond_id, bondId);
  assert.strictEqual(body.slashed_amount, 200);
  assert.strictEqual(body.bond_remaining, 300);
  assert.strictEqual(body.bond_deactivated, false);
  assert.strictEqual(typeof body.message, 'string');
});

test('POST /slash missing bond_id returns 400', async () => {
  const { status, body } = await post('/slash', {
    slashed_by: 'slasher-1',
    amount: 100,
    reason: 'bad work'
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /bond_id/);
});

test('POST /slash missing slashed_by returns 400', async () => {
  const bondId = await newBond('slash-victim-2', 500);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    amount: 100,
    reason: 'bad work'
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /slashed_by/);
});

test('POST /slash missing reason returns 400', async () => {
  const bondId = await newBond('slash-victim-3', 500);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 100
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /reason/);
});

test('POST /slash non-numeric amount returns 400', async () => {
  const bondId = await newBond('slash-victim-4', 500);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 'abc',
    reason: 'bad work'
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /slash zero amount returns 400', async () => {
  const bondId = await newBond('slash-victim-5', 500);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 0,
    reason: 'bad work'
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /slash negative amount returns 400', async () => {
  const bondId = await newBond('slash-victim-6', 500);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: -100,
    reason: 'bad work'
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /amount/);
});

test('POST /slash unknown bond_id returns 404', async () => {
  const { status, body } = await post('/slash', {
    bond_id: 'no-such-bond',
    slashed_by: 'slasher-1',
    amount: 100,
    reason: 'bad work'
  });
  assert.strictEqual(status, 404);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /No bond found/);
});

test('POST /slash more than remaining stake returns 400 with amounts in message', async () => {
  const bondId = await newBond('slash-victim-7', 300);
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 400,
    reason: 'overreach',
    proof: 'none'
  });
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /400/);
  assert.match(body.error, /300/);
  assert.match(body.error, /exceeds remaining stake/);
});

test('POST /slash that consumes the full bond deactivates it', async () => {
  const bondId = await newBond('slash-victim-8', 500);
  await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 300,
    reason: 'first offense'
  });
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-2',
    amount: 200,
    reason: 'second offense'
  });
  assert.strictEqual(status, 201);
  assert.strictEqual(body.bond_remaining, 0);
  assert.strictEqual(body.bond_deactivated, true);
});

test('POST /slash on already deactivated bond returns 403', async () => {
  const bondId = await newBond('slash-victim-9', 100);
  await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-1',
    amount: 100,
    reason: 'wiped out'
  });
  const { status, body } = await post('/slash', {
    bond_id: bondId,
    slashed_by: 'slasher-2',
    amount: 50,
    reason: 'piling on'
  });
  assert.strictEqual(status, 403);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /already fully slashed/);
});
