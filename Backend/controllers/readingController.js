const asyncHandler = require('express-async-handler');
const Reading = require('../models/Reading');

// GET /api/readings/:meterId?limit=200
const getReadings = asyncHandler(async (req, res) => {
  const limit = Math.min(2000, Number(req.query.limit) || 200);
  const readings = await Reading.find({ meter: req.params.meterId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
  res.json(readings.reverse());
});

// GET /api/readings/:meterId/aggregate?bucket=hour&hours=24
// Returns averaged values per bucket —  for load curves.
const aggregateReadings = asyncHandler(async (req, res) => {
  const hours = Math.min(168, Number(req.query.hours) || 24);
  const bucketMs = req.query.bucket === 'minute' ? 60_000 : 3_600_000;
  const since = new Date(Date.now() - hours * 3_600_000);

  const data = await Reading.aggregate([
    { $match: { meter: new (require('mongoose').Types.ObjectId)(req.params.meterId), timestamp: { $gte: since } } },
    {
      $group: {
        _id: {
          $toDate: {
            $multiply: [{ $floor: { $divide: [{ $toLong: '$timestamp' }, bucketMs] } }, bucketMs],
          },
        },
        avgPowerKW: { $avg: '$powerKW' },
        avgVoltage: { $avg: '$voltage' },
        avgCurrent: { $avg: '$current' },
        samples: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, timestamp: '$_id', avgPowerKW: 1, avgVoltage: 1, avgCurrent: 1, samples: 1 } },
  ]);
  res.json(data);
});

module.exports = { getReadings, aggregateReadings };
