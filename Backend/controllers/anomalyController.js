const asyncHandler = require('express-async-handler');
const Anomaly = require('../models/Anomaly');

// GET /api/anomalies?acknowledged=false&limit=100&severity=critical
const listAnomalies = asyncHandler(async (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 100);
  const q = {};
  if (req.query.acknowledged != null) q.acknowledged = req.query.acknowledged === 'true';
  if (req.query.severity) q.severity = req.query.severity;
  if (req.query.meter) q.meter = req.query.meter;

  const anomalies = await Anomaly.find(q)
    .populate('meter', 'serial customerName')
    .populate('feeder', 'name type')
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
  res.json(anomalies);
});

// PATCH /api/anomalies/:id/ack
const acknowledge = asyncHandler(async (req, res) => {
  const a = await Anomaly.findByIdAndUpdate(
    req.params.id,
    { acknowledged: true },
    { new: true }
  );
  if (!a) {
    res.status(404);
    throw new Error('Anomaly not found');
  }
  res.json(a);
});

// GET /api/anomalies/stats — counts by type & severity (last 24h)
const getStats = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const stats = await Anomaly.aggregate([
    { $match: { timestamp: { $gte: since } } },
    { $group: { _id: { type: '$type', severity: '$severity' }, count: { $sum: 1 } } },
  ]);
  res.json(stats);
});

module.exports = { listAnomalies, acknowledge, getStats };
