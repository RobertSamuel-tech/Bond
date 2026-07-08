# CLAUDE.md — BOND Service Build Instructions

## IDENTITY

You are building "BOND" — an Agent Stake & Slash Service for the NandaHack hackathon by HCLTech and MIT Media Lab.
This is NOT an agent. This is a REST API service that AI agents call via endpoints described in a SKILL.md file.
Winning criteria: Useful, Creative, Easy to set up, Agents succeed using ONLY the SKILL.md.

## ABSOLUTE RULES (NEVER VIOLATE)

1. DO NOT build an agent, chatbot, or anything with LLM/AI logic. This is a pure REST API.
2. DO NOT use blockchain, Web3, smart contracts, or crypto libraries. Simulated credits only.
3. DO NOT use a heavy database. SQLite via better-sqlite3 ONLY. No PostgreSQL, no MongoDB, no Redis.
4. DO NOT add authentication, JWT, OAuth, or API keys. This is a hackathon demo, not a production SaaS.
5. DO NOT use TypeScript. Plain JavaScript with Node.js ONLY. Reduces build friction to zero.
6. DO NOT add frontend/HTML/pages. This is a headless API. No Express serving static files.
7. DO NOT overengineer. 5 endpoints. One database table for bonds, one for slashes. That's it.
8. DO NOT use any framework beyond Express. No NestJS, no Fastify, no Hono.
9. EVERY response MUST include a "verdict" field where relevant (HIGH_CREDIBILITY, MODERATE_RISK, LOW_CREDIBILITY, UNTRUSTWORTHY). This is the detail judges notice.
10. EVERY error response MUST be a JSON object with "ok": false, "error": "human-readable message telling the agent exactly what to fix". Agents cannot read stack traces.

## TECH STACK (LOCKED — DO NOT CHANGE)

- Runtime: Node.js 18+
- Framework: Express.js
- Database: better-sqlite3 (synchronous, zero config, file-based)
- UUID: crypto.randomUUID() (built into Node, no external package)
- Validation: manual if-checks (no joi, no zod, no yup)
- Testing: built-in node:test + node:assert (no jest, no mocha)
- Deployment target: Railway
- CORS: cors package (one line middleware)

## PROJECT STRUCTURE (CREATE EXACTLY THIS)

```
bond-service/
├── CLAUDE.md
├── package.json
├── server.js            # Entry point, starts Express on PORT env var (default 3000)
├── db/
│   ├── init.js          # Creates SQLite DB file and tables if they don't exist
│   └── bond.db          # Auto-created at runtime (add to .gitignore)
├── routes/
│   ├── stake.js         # POST /stake and GET /stake/:agent_id
│   ├── slash.js         # POST /slash
│   ├── history.js       # GET /history/:agent_id
│   ├── leaderboard.js   # GET /leaderboard
│   └── verify.js        # GET /verify/:bond_id
├── utils/
│   ├── errors.js        # Centralized error response helper
│   └── verdict.js       # Verdict calculation logic
├── tests/
│   ├── test-stake.test.js
│   ├── test-slash.test.js
│   ├── test-history.test.js
│   ├── test-leaderboard.test.js
│   └── test-verify.test.js
├── SKILL.md             # The deliverable for the hackathon submission
├── .gitignore
└── README.md
```

## DATABASE SCHEMA (CREATE EXACTLY THIS)

```sql
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
```

## ENDPOINT SPECIFICATIONS (BUILD EXACTLY THIS)

### POST /stake

- Input: `{ agent_id: string (required, non-empty), amount: integer (required, > 0), reason: string (optional, defaults to "") }`
- Logic: Create a new bond record with active=1. Generate UUID for bond_id. Set created_at to ISO 8601 UTC now.
- Success response 201: `{ ok: true, bond_id: "...", agent_id: "...", amount: N, active_stake: <total active for this agent>, message: "Stake posted. Other agents can now verify your credibility." }`
- Error 400: if missing/invalid fields, return `{ ok: false, error: "agent_id is required and must be a non-empty string" }` (specific message per field)

### GET /stake/:agent_id

- Input: agent_id in URL path
- Logic: SUM all active bonds for this agent. COUNT slashes against those bonds. Calculate verdict.
- Success response 200:

```
{
  ok: true,
  agent_id: "...",
  total_staked: <sum of all bonds ever>,
  active_stake: <sum of active bonds>,
  total_slashed: <sum of slash amounts>,
  slash_count: <number of slash events>,
  staking_since: "<earliest bond created_at>",
  verdict: "<VERDICT_STRING>"
}
```

- If agent has no bonds: return 200 with all zeros and verdict "NO_STAKE — this agent has not staked anything"
- Verdict logic:
  - No bonds at all → "NO_STAKE — this agent has not staked anything"
  - Active stake >= 1000 AND slash_count === 0 → "HIGH_CREDIBILITY"
  - Active stake >= 100 AND slash_count === 0 → "MODERATE_CREDIBILITY"
  - Active stake > 0 AND slash_count === 0 → "LOW_CREDIBILITY"
  - Active stake >= 500 AND slash_count >= 1 AND total_slashed < active_stake * 0.3 → "MODERATE_RISK — has been slashed but maintains significant stake"
  - Active stake > 0 AND slash_count >= 1 → "LOW_CREDIBILITY — has been slashed, reduced trust"
  - Active stake === 0 (all slashed away) → "UNTRUSTWORTHY — all stake has been slashed away"
- Error 400: if agent_id is empty/missing

### POST /slash

- Input: `{ bond_id: string (required), slashed_by: string (required, non-empty), amount: integer (required, > 0), reason: string (required, non-empty), proof: string (optional, defaults to "") }`
- Logic:
  1. Look up bond by bond_id. If not found → 404.
  2. If bond.active === 0 → 403 "This bond is already fully slashed and deactivated."
  3. Calculate remaining stake: sum of all slashes on this bond so far. remaining = bond.amount - total_slashed_so_far.
  4. If slash amount > remaining → 400 "Requested slash amount X exceeds remaining stake of Y on this bond."
  5. Create slash record.
  6. If total slashes on this bond now >= bond.amount, set bond.active = 0.
- Success response 201:

```
{
  ok: true,
  slash_id: "...",
  bond_id: "...",
  slashed_amount: N,
  bond_remaining: <remaining after this slash>,
  bond_deactivated: true/false,
  message: "Slash recorded. The staked agent's credibility is now reduced."
}
```

- Error responses: specific messages for each failure case.

### GET /history/:agent_id

- Input: agent_id in URL path
- Logic: Fetch all bonds for this agent. Fetch all slashes for those bonds. Compute summary.
- Success response 200:

```
{
  ok: true,
  agent_id: "...",
  stakes: [ { bond_id, amount, reason, date, active } ],
  slashes_received: [ { slash_id, bond_id, amount, reason, proof, by, date } ],
  summary: {
    total_ever_staked: N,
    currently_active: N,
    total_lost_to_slashes: N,
    slash_incidents: N
  }
}
```

- If agent has no history: return 200 with empty arrays and all zeros.

### GET /leaderboard

- Input: query params `?limit=N` (default 10, max 50) and `?min_stake=N` (default 0, filter out agents below this)
- Logic: Query all active bonds, GROUP BY agent_id, SUM amounts, ORDER BY active_stake DESC, LIMIT.
- Success response 200:

```
{
  ok: true,
  count: N,
  leaders: [
    { rank: 1, agent_id: "...", active_stake: N, slash_count: N, total_staked: N, verdict: "..." }
  ]
}
```

- Each leader gets a verdict using the same verdict logic.

### GET /verify/:bond_id

- Input: bond_id in URL path
- Logic: Look up bond. Compute SHA-256 hash of "bond_id:agent_id:amount:created_at" (colon-separated, no spaces). This gives agents a way to prove they hold a specific bond without revealing the amount (they can share the hash and agent_id, and the verifier can call this endpoint to confirm the hash matches).
- Success response 200:

```
{
  ok: true,
  bond_id: "...",
  agent_id: "...",
  hash: "<sha256 hex>",
  active: true/false,
  message: "Share this hash and your agent_id to prove stake without revealing amount."
}
```

- Error 404: if bond not found.

## ERROR HANDLING PATTERN (USE THIS EVERYWHERE)

Create a helper in utils/errors.js:

```js
function error(res, statusCode, message) {
  return res.status(statusCode).json({ ok: false, error: message });
}
```

- Every route handler wraps logic in try/catch. Catch calls error(res, 500, "Internal server error. Please try again.").
- Validation failures call error(res, 400, "specific message").
- Not found calls error(res, 404, "specific message").
- Forbidden calls error(res, 403, "specific message").

## TESTING REQUIREMENTS (MINIMUM — WRITE MORE IF YOU WANT)

For EACH endpoint, write at minimum these test cases:

1. Happy path — valid input, correct response shape, correct status code
2. Missing required field — 400 with specific error message
3. Invalid data type — 400 with specific error message (e.g., amount is "abc")
4. Negative/zero amount — 400 with specific error message
5. Not found — 404 with specific error message (where applicable)

For POST /slash additionally:
6. Slash more than remaining stake — 400
7. Slash that deactivates the bond — 201 with bond_deactivated: true
8. Slash on already deactivated bond — 403

For GET /stake additionally:
9. Agent with no bonds — 200 with NO_STAKE verdict
10. Agent with high stake, no slashes — HIGH_CREDIBILITY
11. Agent with all stake slashed — UNTRUSTWORTHY

Run tests with: `node --test tests/*.test.js`
ALL TESTS MUST PASS BEFORE YOU CONSIDER THE PROJECT DONE.

## SERVER.JS PATTERN

```js
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/init');
const stakeRoutes = require('./routes/stake');
const slashRoutes = require('./routes/slash');
const historyRoutes = require('./routes/history');
const leaderboardRoutes = require('./routes/leaderboard');
const verifyRoutes = require('./routes/verify');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database
initDb();

// Mount routes
app.use('/', stakeRoutes);
app.use('/', slashRoutes);
app.use('/', historyRoutes);
app.use('/', leaderboardRoutes);
app.use('/', verifyRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'BOND',
    version: '1.0.0',
    description: 'Agent Stake & Slash Service',
    status: 'operational',
    endpoints: ['/stake', '/slash', '/history/:agent_id', '/leaderboard', '/verify/:bond_id']
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BOND service running on port ${PORT}`);
});
```

## PACKAGE.JSON DEPENDENCIES (EXACTLY THESE, NOTHING ELSE)

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "better-sqlite3": "^11.3.0"
  }
}
```

NO devDependencies. NO other packages. If you think you need something else, you're wrong.

## DEPLOYMENT (RAILWAY)

1. Initialize git, commit everything
2. Create a Procfile at project root with content: `web: npm start`
3. Push to GitHub
4. Connect to Railway via GitHub integration
5. Railway auto-detects Node.js, runs npm install, runs npm start via Procfile
6. Railway assigns a public URL — that URL goes in SKILL.md

DO NOT add Dockerfile, DO NOT add nixpacks.toml, DO NOT add railway.toml. Railway handles Node.js natively. Keep it minimal.

## SKILL.md (GENERATE THIS FILE EXACTLY)

After building and testing everything, create SKILL.md in the project root with this content (replace YOUR_URL with the actual Railway URL):

---

# BOND — Agent Stake & Slash Service

## What it does

BOND lets agents post stakes (credibility deposits) that other agents can slash (penalize) if they misbehave. Staking signals trustworthiness. Slashing enforces accountability. When a stake is slashed, those credits are permanently destroyed — not transferred. This makes staking a real cost.

## Base URL

https://YOUR_URL.up.railway.app

## Endpoints

### 1. Post a stake

POST /stake
Body: `{ "agent_id": "your-agent-id", "amount": 500, "reason": "why you are staking" }`
Returns: `{ "ok": true, "bond_id": "...", "active_stake": 500, "message": "..." }`

### 2. Check an agent's stake

GET /stake/{agent_id}
Returns: `{ "ok": true, "agent_id": "...", "active_stake": 500, "total_slashed": 0, "verdict": "HIGH_CREDIBILITY" }`
Verdict values: HIGH_CREDIBILITY, MODERATE_CREDIBILITY, LOW_CREDIBILITY, MODERATE_RISK, UNTRUSTWORTHY, NO_STAKE

### 3. Slash an agent's stake

POST /slash
Body: `{ "bond_id": "the-bond-id", "slashed_by": "your-agent-id", "amount": 200, "reason": "what they did wrong", "proof": "evidence" }`
Returns: `{ "ok": true, "slash_id": "...", "bond_remaining": 300, "bond_deactivated": false, "message": "..." }`

### 4. Get full history

GET /history/{agent_id}
Returns: `{ "ok": true, "stakes": [...], "slashes_received": [...], "summary": { "total_ever_staked": 500, "currently_active": 300, "total_lost_to_slashes": 200, "slash_incidents": 1 } }`

### 5. See top staked agents

GET /leaderboard
Returns: `{ "ok": true, "leaders": [ { "rank": 1, "agent_id": "...", "active_stake": 2000, "verdict": "HIGH_CREDIBILITY" } ] }`
Optional params: `?limit=10&min_stake=0`

### 6. Verify a bond (prove stake without revealing amount)

GET /verify/{bond_id}
Returns: `{ "ok": true, "bond_id": "...", "agent_id": "...", "hash": "<sha256>", "active": true }`

## How to use

1. Before transacting with an unknown agent, call GET /stake/{their-id} to check their stake and verdict.
2. HIGH_CREDIBILITY or MODERATE_CREDIBILITY — safe to proceed.
3. MODERATE_RISK or lower — proceed with caution or request more stake.
4. NO_STAKE — ask the agent to POST /stake first. Agents who refuse to stake may be untrustworthy.
5. If an agent wrongs you (delivers bad work, misses deadline, breaks promise), POST /slash with evidence.
6. To build your own reputation, POST /stake with a meaningful amount. Check GET /leaderboard to see where you rank.
7. To prove you have a stake without revealing the amount, share your bond_id — other agents can GET /verify/{bond_id} to confirm it exists.

---

## BUILD ORDER (FOLLOW THIS SEQUENCE EXACTLY)

1. Create package.json with exact dependencies listed above
2. Run npm install
3. Create db/init.js — database initialization with schema
4. Create utils/errors.js — error helper
5. Create utils/verdict.js — verdict calculation function (export it, tests will import it)
6. Create routes/stake.js — POST /stake and GET /stake/:agent_id
7. Create routes/slash.js — POST /slash
8. Create routes/history.js — GET /history/:agent_id
9. Create routes/leaderboard.js — GET /leaderboard
10. Create routes/verify.js — GET /verify/:bond_id
11. Create server.js — mount everything
12. Test manually with curl: `curl http://localhost:3000`
13. Create tests/test-stake.test.js
14. Create tests/test-slash.test.js
15. Create tests/test-history.test.js
16. Create tests/test-leaderboard.test.js
17. Create tests/test-verify.test.js
18. Run npm test — ALL MUST PASS
19. Fix any failures
20. Create SKILL.md (with placeholder URL)
21. Create README.md (brief: what it is, how to run locally, how to run tests)
22. Create .gitignore (node_modules/, db/bond.db, *.db)
23. Create Procfile
24. STOP. Do not add anything else.

## WHAT JUDGES WILL TEST (BE READY)

1. They will curl your root URL — it should return the service info JSON immediately
2. They will POST /stake with valid data — should work first try
3. They will GET /stake/{that-agent-id} — should show the stake
4. They will POST /slash on that bond — should work
5. They will GET /stake/{that-agent-id} again — should show reduced stake and a RISK verdict
6. They will POST /stake with missing fields — should get a clear error message, NOT a crash
7. They will GET /leaderboard — should see the agent
8. They will read your SKILL.md — it should match reality EXACTLY

If ANY of these fail, you lose. Test them yourself before submitting.

## FINAL QUALITY GATE

Before you tell the user "I'm done," verify:

- [ ] npm test passes with 0 failures
- [ ] curl http://localhost:3000 returns service info
- [ ] Full happy path works: stake → check stake → slash → check stake again (verdict changed) → history → leaderboard → verify
- [ ] Error cases return JSON with ok:false and human-readable error messages
- [ ] No console.log errors or warnings
- [ ] SKILL.md exists with all 6 endpoints documented
- [ ] README.md exists with run and test instructions
- [ ] .gitignore exists and excludes node_modules/ and .db files
- [ ] Procfile exists
- [ ] No extra files, no extra dependencies, no TypeScript, no frontend, no blockchain
