const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// BOND_DB_PATH lets tests point at a throwaway database file.
const DB_PATH = process.env.BOND_DB_PATH || path.join(__dirname, 'bond.db');

let db = null;

function initDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bonds (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS slashes (
      id TEXT PRIMARY KEY,
      bond_id TEXT NOT NULL,
      slashed_by TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0),
      reason TEXT NOT NULL,
      proof TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (bond_id) REFERENCES bonds(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bonds_agent_id ON bonds(agent_id);
    CREATE INDEX IF NOT EXISTS idx_slashes_bond_id ON slashes(bond_id);
  `);

  return db;
}

function getDb() {
  return initDb();
}

module.exports = { initDb, getDb, DB_PATH };
