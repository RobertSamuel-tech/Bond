const path = require('path');
const fs = require('fs');

// BOND_DB_PATH lets tests point at a throwaway data file.
const DB_PATH = process.env.BOND_DB_PATH || path.join(__dirname, 'data.json');

const DEFAULT_DATA = { bonds: [], slashes: [] };

function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function readData() {
  initDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// bondData: { id, agent_id, amount, reason, created_at, active }
function addBond(bondData) {
  const data = readData();
  data.bonds.push(bondData);
  writeData(data);
  return bondData;
}

function getBondById(id) {
  return readData().bonds.find((b) => b.id === id) || null;
}

function getBondsByAgent(agentId) {
  return readData().bonds.filter((b) => b.agent_id === agentId);
}

// slashData: { id, bond_id, slashed_by, amount, reason, proof, created_at }
function addSlash(slashData) {
  const data = readData();
  data.slashes.push(slashData);
  writeData(data);
  return slashData;
}

function getSlashesByBondId(bondId) {
  return readData().slashes.filter((s) => s.bond_id === bondId);
}

function deactivateBond(id) {
  const data = readData();
  const bond = data.bonds.find((b) => b.id === id);
  if (!bond) return null;
  bond.active = 0;
  writeData(data);
  return bond;
}

// Distinct agent ids holding at least one active bond — the /leaderboard candidates.
function getLeaderboardData() {
  const data = readData();
  return [...new Set(data.bonds.filter((b) => b.active === 1).map((b) => b.agent_id))];
}

module.exports = {
  initDb,
  DB_PATH,
  addBond,
  getBondById,
  getBondsByAgent,
  addSlash,
  getSlashesByBondId,
  deactivateBond,
  getLeaderboardData
};
