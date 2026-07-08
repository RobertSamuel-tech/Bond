const path = require('path');
const os = require('os');
process.env.BOND_DB_PATH = path.join(os.tmpdir(), `bond-test-verify-${process.pid}-${Date.now()}.db`);

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const app = require('../server');
const { getDb } = require('../db/init');

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

test('GET /verify/:bond_id returns the documented SHA-256 hash', async () => {
  const stake = await post('/stake', { agent_id: 'verify-agent', amount: 500 });
  const bondId = stake.body.bond_id;

  const { status, body } = await get(`/verify/${bondId}`);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.bond_id, bondId);
  assert.strictEqual(body.agent_id, 'verify-agent');
  assert.strictEqual(body.active, true);
  assert.match(body.hash, /^[0-9a-f]{64}$/);
  assert.strictEqual(typeof body.message, 'string');

  const bond = getDb().prepare('SELECT * FROM bonds WHERE id = ?').get(bondId);
  const expected = crypto
    .createHash('sha256')
    .update(`${bond.id}:${bond.agent_id}:${bond.amount}:${bond.created_at}`)
    .digest('hex');
  assert.strictEqual(body.hash, expected);
});

test('GET /verify/:bond_id hash is stable across calls', async () => {
  const stake = await post('/stake', { agent_id: 'verify-agent-2', amount: 250 });
  const first = await get(`/verify/${stake.body.bond_id}`);
  const second = await get(`/verify/${stake.body.bond_id}`);
  assert.strictEqual(first.body.hash, second.body.hash);
});

test('GET /verify/:bond_id shows active false after full slash', async () => {
  const stake = await post('/stake', { agent_id: 'verify-agent-3', amount: 100 });
  await post('/slash', {
    bond_id: stake.body.bond_id,
    slashed_by: 'watchdog',
    amount: 100,
    reason: 'wiped'
  });
  const { status, body } = await get(`/verify/${stake.body.bond_id}`);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.active, false);
});

test('GET /verify/:bond_id unknown bond returns 404', async () => {
  const { status, body } = await get('/verify/not-a-real-bond');
  assert.strictEqual(status, 404);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /No bond found/);
});

test('GET /verify without bond_id returns 400', async () => {
  const { status, body } = await get('/verify');
  assert.strictEqual(status, 400);
  assert.strictEqual(body.ok, false);
  assert.match(body.error, /bond_id/);
});
