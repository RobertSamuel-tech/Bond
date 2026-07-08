const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/init');
const { error } = require('../utils/errors');
const { calculateVerdict, getAgentStats } = require('../utils/verdict');

const router = express.Router();

// POST /stake — post a new credibility bond
router.post('/stake', (req, res) => {
  try {
    const body = req.body || {};
    const agentId = body.agent_id;
    const amount = body.amount;
    const reason = body.reason === undefined ? '' : body.reason;

    if (typeof agentId !== 'string' || agentId.trim() === '') {
      return error(res, 400, 'agent_id is required and must be a non-empty string');
    }
    if (amount === undefined || amount === null) {
      return error(res, 400, 'amount is required and must be an integer greater than 0');
    }
    if (typeof amount !== 'number' || !Number.isInteger(amount)) {
      return error(res, 400, 'amount must be an integer (a whole number, not a string or decimal)');
    }
    if (amount <= 0) {
      return error(res, 400, 'amount must be greater than 0');
    }
    if (typeof reason !== 'string') {
      return error(res, 400, 'reason must be a string if provided');
    }

    const db = getDb();
    const bondId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    db.prepare(
      'INSERT INTO bonds (id, agent_id, amount, reason, created_at, active) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(bondId, agentId, amount, reason, createdAt);

    const stats = getAgentStats(db, agentId);

    return res.status(201).json({
      ok: true,
      bond_id: bondId,
      agent_id: agentId,
      amount,
      active_stake: stats.activeStake,
      message: 'Stake posted. Other agents can now verify your credibility.'
    });
  } catch (err) {
    return error(res, 500, 'Internal server error. Please try again.');
  }
});

// GET /stake with no agent_id — tell the agent exactly how to call it
router.get('/stake', (req, res) => {
  return error(res, 400, 'agent_id is required in the URL path. Call GET /stake/{agent_id}.');
});

// GET /stake/:agent_id — check an agent's stake and verdict
router.get('/stake/:agent_id', (req, res) => {
  try {
    const agentId = req.params.agent_id;
    if (typeof agentId !== 'string' || agentId.trim() === '') {
      return error(res, 400, 'agent_id is required in the URL path. Call GET /stake/{agent_id}.');
    }

    const db = getDb();
    const stats = getAgentStats(db, agentId);

    return res.status(200).json({
      ok: true,
      agent_id: agentId,
      total_staked: stats.totalStaked,
      active_stake: stats.activeStake,
      total_slashed: stats.totalSlashed,
      slash_count: stats.slashCount,
      staking_since: stats.stakingSince,
      verdict: calculateVerdict(stats)
    });
  } catch (err) {
    return error(res, 500, 'Internal server error. Please try again.');
  }
});

module.exports = router;
