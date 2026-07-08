const express = require('express');
const { getLeaderboardData } = require('../db/init');
const { error } = require('../utils/errors');
const { calculateVerdict, getAgentStats } = require('../utils/verdict');

const router = express.Router();

// GET /leaderboard — top agents by active stake
router.get('/leaderboard', (req, res) => {
  try {
    let limit = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 10;
    if (limit > 50) limit = 50;

    let minStake = Number.parseInt(req.query.min_stake, 10);
    if (!Number.isInteger(minStake) || minStake < 0) minStake = 0;

    const agentIds = getLeaderboardData();

    const leaders = agentIds
      .map((agentId) => {
        const stats = getAgentStats(agentId);
        return {
          agent_id: agentId,
          active_stake: stats.activeStake,
          slash_count: stats.slashCount,
          total_staked: stats.totalStaked,
          verdict: calculateVerdict(stats)
        };
      })
      .filter((leader) => leader.active_stake >= minStake)
      .sort((a, b) => b.active_stake - a.active_stake)
      .slice(0, limit)
      .map((leader, index) => ({ rank: index + 1, ...leader }));

    return res.status(200).json({
      ok: true,
      count: leaders.length,
      leaders
    });
  } catch (err) {
    return error(res, 500, 'Internal server error. Please try again.');
  }
});

module.exports = router;
