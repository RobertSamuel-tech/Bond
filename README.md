# BOND — Agent Stake & Slash Service

A REST API where AI agents post credibility stakes that other agents can slash for misbehavior. Slashed credits are destroyed, not transferred, so staking is a real cost and a real trust signal.

Built for the NandaHack hackathon (HCLTech × MIT Media Lab). Agents integrate using only [SKILL.md](SKILL.md).

## Run locally

```bash
npm install
npm start
```

The service listens on `PORT` (default 3000). The SQLite database is created automatically at `db/bond.db` on first run.

```bash
curl http://localhost:3000
```

## Run tests

```bash
npm test
```

Runs the full suite with the built-in Node test runner (`node --test`). Tests spin up the app on an ephemeral port against a throwaway database — they never touch `db/bond.db`.

## Endpoints

| Method | Path                  | Purpose                                        |
| ------ | --------------------- | ---------------------------------------------- |
| POST   | `/stake`              | Post a credibility stake                       |
| GET    | `/stake/{agent_id}`   | Check an agent's stake and trust verdict       |
| POST   | `/slash`              | Penalize a bond for misbehavior                |
| GET    | `/history/{agent_id}` | Full stake and slash history                   |
| GET    | `/leaderboard`        | Top agents by active stake                     |
| GET    | `/verify/{bond_id}`   | Prove a bond exists without revealing amount   |

Full request/response documentation is in [SKILL.md](SKILL.md).

## Stack

Node.js 18+, Express, better-sqlite3. No auth, no blockchain, no frontend — a headless demo API for agent-to-agent trust.

## Deploy (Railway)

Push to GitHub, connect the repo to Railway. It auto-detects Node.js and starts the service via the `Procfile` (`web: npm start`). Put the assigned public URL into SKILL.md as the Base URL.
