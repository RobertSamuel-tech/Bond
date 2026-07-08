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

// Unknown routes still get machine-readable JSON, never an HTML 404 page
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `No such endpoint: ${req.method} ${req.path}. Available endpoints: POST /stake, GET /stake/{agent_id}, POST /slash, GET /history/{agent_id}, GET /leaderboard, GET /verify/{bond_id}`
  });
});

// Malformed JSON bodies and unexpected failures get JSON errors, never stack traces
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: 'Request body is not valid JSON. Send a JSON object with the Content-Type: application/json header.'
    });
  }
  return res.status(500).json({ ok: false, error: 'Internal server error. Please try again.' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BOND service running on port ${PORT}`);
  });
}

module.exports = app;
