const asyncHandler = require('express-async-handler');
const Meter = require('../models/Meter');
const Feeder = require('../models/Feeder');
const Reading = require('../models/Reading');
const OutageEvent = require('../models/OutageEvent');
const { computeReliabilityIndices } = require('../services/reliabilityCalculator');
const { computeBill } = require('../services/tariffEngine');
const { analyzeLosses, injectDemoTheft, clearAllTheft } = require('../services/lossAnalyzer');

// GET /api/analytics/summary — high-level grid stats for dashboard cards
const getSummary = asyncHandler(async (_req, res) => {
  const [meters, feeders, last] = await Promise.all([
    Meter.find({}, 'status cumulativeKWh').lean(),
    Feeder.find({}, 'status type').lean(),
    Reading.aggregate([
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$meter', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } },
    ]),
  ]);

  const totalMeters = meters.length;
  const onlineMeters = meters.filter((m) => m.status === 'online').length;
  const totalLoadKW = last.reduce((s, r) => s + (r.powerKW || 0), 0);
  const totalCumulativeKWh = meters.reduce((s, m) => s + (m.cumulativeKWh || 0), 0);
  const faultedFeeders = feeders.filter((f) => f.status === 'faulted').length;

  res.json({
    totalMeters,
    onlineMeters,
    offlineMeters: totalMeters - onlineMeters,
    totalLoadKW: Number(totalLoadKW.toFixed(2)),
    totalCumulativeKWh: Number(totalCumulativeKWh.toFixed(2)),
    feeders: feeders.length,
    faultedFeeders,
  });
});

// GET /api/analytics/reliability?days=30
const getReliability = asyncHandler(async (req, res) => {
  const days = Number(req.query.days) || 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3_600_000);
  const indices = await computeReliabilityIndices({ from, to });
  res.json(indices);
});

// GET /api/analytics/outages?limit=50
const getOutageHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(500, Number(req.query.limit) || 50);
  const events = await OutageEvent.find({})
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate('feeder', 'name type')
    .lean();
  res.json(events);
});

// GET /api/analytics/bills — predicted bill per meter
const getBills = asyncHandler(async (_req, res) => {
  const meters = await Meter.find({}).lean();
  const data = meters.map((m) => {
    const bill = computeBill(m);
    return {
      meterId: m._id,
      serial: m.serial,
      customerName: m.customerName,
      consumedKWh: bill.consumed.total,
      projectedKWh: bill.projected.total,
      total: bill.total,
      projectedTotal: bill.projectedTotal,
    };
  });
  res.json(data);
});

// GET /api/analytics/loss-analysis?windowMinutes=30
const getLossAnalysis = asyncHandler(async (req, res) => {
  const windowMinutes = Math.min(180, Number(req.query.windowMinutes) || 30);
  const result = await analyzeLosses({ windowMinutes });
  res.json(result);
});

// POST /api/analytics/loss-analysis/inject-demo
const postInjectTheft = asyncHandler(async (req, res) => {
  const count = Math.min(20, Number(req.body?.count) || 8);
  const result = await injectDemoTheft({ count });
  res.json(result);
});

// POST /api/analytics/loss-analysis/clear
const postClearTheft = asyncHandler(async (_req, res) => {
  const result = await clearAllTheft();
  res.json(result);
});

// GET /api/analytics/load-curve?hours=24 — total grid load over time
const getGridLoadCurve = asyncHandler(async (req, res) => {
  const hours = Math.min(168, Number(req.query.hours) || 24);
  const bucketMs = hours <= 24 ? 5 * 60_000 : 60 * 60_000; // 5-min or 1-hr buckets
  const since = new Date(Date.now() - hours * 3_600_000);

  const data = await Reading.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: {
          $toDate: {
            $multiply: [{ $floor: { $divide: [{ $toLong: '$timestamp' }, bucketMs] } }, bucketMs],
          },
        },
        totalLoadKW: { $sum: '$powerKW' },
        avgVoltage: { $avg: '$voltage' },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, timestamp: '$_id', totalLoadKW: 1, avgVoltage: 1 } },
  ]);

  res.json(data);
});

module.exports = {
  getSummary,
  getReliability,
  getOutageHistory,
  getBills,
  getGridLoadCurve,
  getLossAnalysis,
  postInjectTheft,
  postClearTheft,
};
