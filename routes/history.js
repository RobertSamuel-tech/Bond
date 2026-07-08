const express = require('express');
const { getBondsByAgent, getSlashesByBondId } = require('../db/init');
const { error } = require('../utils/errors');
const { getAgentStats } = require('../utils/verdict');

const router = express.Router();

// GET /history with no agent_id — tell the agent exactly how to call it
router.get('/history', (req, res) => {
  return error(res, 400, 'agent_id is required in the URL path. Call GET /history/{agent_id}.');
});

// GET /history/:agent_id — full stake and slash history for an agent
router.get('/history/:agent_id', (req, res) => {
  try {
    const agentId = req.params.agent_id;
    if (typeof agentId !== 'string' || agentId.trim() === '') {
      return error(res, 400, 'agent_id is required in the URL path. Call GET /history/{agent_id}.');
    }

    const bonds = getBondsByAgent(agentId)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const slashes = bonds
      .flatMap((bond) => getSlashesByBondId(bond.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const stats = getAgentStats(agentId);

    return res.status(200).json({
      ok: true,
      agent_id: agentId,
      stakes: bonds.map((b) => ({
        bond_id: b.id,
        amount: b.amount,
        reason: b.reason,
        date: b.created_at,
        active: b.active === 1
      })),
      slashes_received: slashes.map((s) => ({
        slash_id: s.id,
        bond_id: s.bond_id,
        amount: s.amount,
        reason: s.reason,
        proof: s.proof,
        by: s.slashed_by,
        date: s.created_at
      })),
      summary: {
        total_ever_staked: stats.totalStaked,
        currently_active: stats.activeStake,
        total_lost_to_slashes: stats.totalSlashed,
        slash_incidents: stats.slashCount
      }
    });
  } catch (err) {
    return error(res, 500, 'Internal server error. Please try again.');
  }
});

module.exports = router;
