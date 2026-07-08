const express = require('express');
const crypto = require('crypto');
const { getBondById, getSlashesByBondId, addSlash, deactivateBond } = require('../db/init');
const { error } = require('../utils/errors');

const router = express.Router();

// POST /slash — penalize a bond for misbehavior. Slashed credits are destroyed.
router.post('/slash', (req, res) => {
  try {
    const body = req.body || {};
    const bondId = body.bond_id;
    const slashedBy = body.slashed_by;
    const amount = body.amount;
    const reason = body.reason;
    const proof = body.proof === undefined ? '' : body.proof;

    if (typeof bondId !== 'string' || bondId.trim() === '') {
      return error(res, 400, 'bond_id is required and must be a non-empty string');
    }
    if (typeof slashedBy !== 'string' || slashedBy.trim() === '') {
      return error(res, 400, 'slashed_by is required and must be a non-empty string (your agent_id)');
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
    if (typeof reason !== 'string' || reason.trim() === '') {
      return error(res, 400, 'reason is required and must be a non-empty string explaining what the agent did wrong');
    }
    if (typeof proof !== 'string') {
      return error(res, 400, 'proof must be a string if provided');
    }

    const bond = getBondById(bondId);

    if (!bond) {
      return error(res, 404, `No bond found with bond_id "${bondId}". Check the bond_id and try again.`);
    }
    if (bond.active === 0) {
      return error(res, 403, 'This bond is already fully slashed and deactivated.');
    }

    const slashedSoFar = getSlashesByBondId(bondId).reduce((sum, s) => sum + s.amount, 0);
    const remaining = bond.amount - slashedSoFar;

    if (amount > remaining) {
      return error(
        res,
        400,
        `Requested slash amount ${amount} exceeds remaining stake of ${remaining} on this bond.`
      );
    }

    const slashId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    addSlash({
      id: slashId,
      bond_id: bondId,
      slashed_by: slashedBy,
      amount,
      reason,
      proof,
      created_at: createdAt
    });

    const bondRemaining = remaining - amount;
    let bondDeactivated = false;
    if (bondRemaining <= 0) {
      deactivateBond(bondId);
      bondDeactivated = true;
    }

    return res.status(201).json({
      ok: true,
      slash_id: slashId,
      bond_id: bondId,
      slashed_amount: amount,
      bond_remaining: bondRemaining,
      bond_deactivated: bondDeactivated,
      message: "Slash recorded. The staked agent's credibility is now reduced."
    });
  } catch (err) {
    return error(res, 500, 'Internal server error. Please try again.');
  }
});

module.exports = router;
