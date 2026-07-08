const express = require('express');
const crypto = require('crypto');
const { getBondById } = require('../db/init');
const { error } = require('../utils/errors');

const router = express.Router();

// GET /verify with no bond_id — tell the agent exactly how to call it
router.get('/verify', (req, res) => {
  return error(res, 400, 'bond_id is required in the URL path. Call GET /verify/{bond_id}.');
});

// GET /verify/:bond_id — deterministic hash proves a bond exists without
// the holder having to reveal the amount to the party verifying it.
router.get('/verify/:bond_id', (req, res) => {
  try {
    const bondId = req.params.bond_id;
    if (typeof bondId !== 'string' || bondId.trim() === '') {
      return error(res, 400, 'bond_id is required in the URL path. Call GET /verify/{bond_id}.');
    }

    const bond = getBondById(bondId);

    if (!bond) {
      return error(res, 404, `No bond found with bond_id "${bondId}". Check the bond_id and try again.`);
    }

    const hash = crypto
      .createHash('sha256')
      .update(`${bond.id}:${bond.agent_id}:${bond.amount}:${bond.created_at}`)
      .digest('hex');

    return res.status(200).json({
      ok: true,
      bond_id: bond.id,
      agent_id: bond.agent_id,
      hash,
      active: bond.active === 1,
      message: 'Share this hash and your agent_id to prove stake without revealing amount.'
    });
  } catch (err) {
    return error(res, 500, 'Internal server error. Please try again.');
  }
});

module.exports = router;
