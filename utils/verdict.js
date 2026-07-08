const { getBondsByAgent, getSlashesByBondId } = require('../db/init');

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
function getAgentStats(agentId) {
  const bonds = getBondsByAgent(agentId);

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

  let totalSlashed = 0;
  let slashCount = 0;
  let activeSlashed = 0;
  for (const bond of bonds) {
    for (const slash of getSlashesByBondId(bond.id)) {
      totalSlashed += slash.amount;
      slashCount += 1;
      if (bond.active === 1) activeSlashed += slash.amount;
    }
  }

  const totalStaked = bonds.reduce((sum, b) => sum + b.amount, 0);
  const activeBondAmount = bonds
    .filter((b) => b.active === 1)
    .reduce((sum, b) => sum + b.amount, 0);
  const activeStake = Math.max(activeBondAmount - activeSlashed, 0);
  const stakingSince = bonds
    .map((b) => b.created_at)
    .sort()[0];

  return {
    hasBonds: true,
    totalStaked,
    activeStake,
    totalSlashed,
    slashCount,
    stakingSince
  };
}

module.exports = { calculateVerdict, getAgentStats };
