// Verdict strings are the primary trust signal agents read from this service.
// Order of checks matters: it follows the spec in CLAUDE.md exactly.
function calculateVerdict({ hasBonds, activeStake, slashCount, totalSlashed }) {
  if (!hasBonds) {
    return 'NO_STAKE — this agent has not staked anything';
  }
  if (activeStake >= 1000 && slashCount === 0) {
    return 'HIGH_CREDIBILITY';
  }
  if (activeStake >= 100 && slashCount === 0) {
    return 'MODERATE_CREDIBILITY';
  }
  if (activeStake > 0 && slashCount === 0) {
    return 'LOW_CREDIBILITY';
  }
  if (activeStake >= 500 && slashCount >= 1 && totalSlashed < activeStake * 0.3) {
    return 'MODERATE_RISK — has been slashed but maintains significant stake';
  }
  if (activeStake > 0 && slashCount >= 1) {
    return 'LOW_CREDIBILITY — has been slashed, reduced trust';
  }
  return 'UNTRUSTWORTHY — all stake has been slashed away';
}

// Aggregates everything the verdict and the /stake, /history, /leaderboard
// responses need for one agent. active_stake counts what is still at risk:
// active bond amounts minus slashes already taken out of them.
function getAgentStats(db, agentId) {
  const bonds = db.prepare('SELECT * FROM bonds WHERE agent_id = ?').all(agentId);

  if (bonds.length === 0) {
    return {
      hasBonds: false,
      totalStaked: 0,
      activeStake: 0,
      totalSlashed: 0,
      slashCount: 0,
      stakingSince: null
    };
  }

  const slashTotals = db.prepare(`
    SELECT COALESCE(SUM(s.amount), 0) AS total, COUNT(s.id) AS cnt
    FROM slashes s
    JOIN bonds b ON s.bond_id = b.id
    WHERE b.agent_id = ?
  `).get(agentId);

  const activeSlashed = db.prepare(`
    SELECT COALESCE(SUM(s.amount), 0) AS total
    FROM slashes s
    JOIN bonds b ON s.bond_id = b.id
    WHERE b.agent_id = ? AND b.active = 1
  `).get(agentId);

  const totalStaked = bonds.reduce((sum, b) => sum + b.amount, 0);
  const activeBondAmount = bonds
    .filter((b) => b.active === 1)
    .reduce((sum, b) => sum + b.amount, 0);
  const activeStake = Math.max(activeBondAmount - activeSlashed.total, 0);
  const stakingSince = bonds
    .map((b) => b.created_at)
    .sort()[0];

  return {
    hasBonds: true,
    totalStaked,
    activeStake,
    totalSlashed: slashTotals.total,
    slashCount: slashTotals.cnt,
    stakingSince
  };
}

module.exports = { calculateVerdict, getAgentStats };
