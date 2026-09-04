const asyncHandler = require('express-async-handler');
const Feeder = require('../models/Feeder');
const Meter = require('../models/Meter');
const OutageEvent = require('../models/OutageEvent');

// GET /api/feeders — full topology
const listFeeders = asyncHandler(async (req, res) => {
  const feeders = await Feeder.find({}).lean();
  res.json(feeders);
});

// GET /api/feeders/topology — annotated with downstream meter counts
const getTopology = asyncHandler(async (req, res) => {
  const [feeders, meters] = await Promise.all([
    Feeder.find({}).lean(),
    Meter.find({}, 'feeder peakLoadKW baseLoadKW').lean(),
  ]);
  const meterByFeeder = new Map();
  for (const m of meters) {
    const k = String(m.feeder);
    if (!meterByFeeder.has(k)) meterByFeeder.set(k, []);
    meterByFeeder.get(k).push(m);
  }
  // Build downstream map (parent -> children)
  const childrenOf = new Map();
  for (const f of feeders) {
    if (f.parent) {
      const k = String(f.parent);
      if (!childrenOf.has(k)) childrenOf.set(k, []);
      childrenOf.get(k).push(f);
    }
  }

  // BFS to compute, for each node, total downstream meters and connected load
  function descendantsOf(id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      const kids = childrenOf.get(String(cur)) || [];
      for (const k of kids) {
        out.push(k);
        stack.push(k._id);
      }
    }
    return out;
  }

  const annotated = feeders.map((f) => {
    const subtree = [f, ...descendantsOf(f._id)];
    let downstreamMeters = 0;
    let downstreamLoadKW = 0;
    for (const node of subtree) {
      const ms = meterByFeeder.get(String(node._id)) || [];
      downstreamMeters += ms.length;
      downstreamLoadKW += ms.reduce((s, m) => s + (m.baseLoadKW || 0), 0);
    }
    return { ...f, downstreamMeters, downstreamLoadKW: Number(downstreamLoadKW.toFixed(2)) };
  });

  res.json(annotated);
});

// POST /api/feeders/:id/fault — trigger an outage (simulated)
const triggerFault = asyncHandler(async (req, res) => {
  const feeder = await Feeder.findById(req.params.id);
  if (!feeder) {
    res.status(404);
    throw new Error('Feeder not found');
  }
  if (feeder.status === 'faulted') {
    return res.status(400).json({ message: 'Feeder is already faulted' });
  }

  // Snapshot how many meters and how much load are downstream of this feeder
  const allFeeders = await Feeder.find({}, '_id parent').lean();
  const childrenOf = new Map();
  for (const f of allFeeders) {
    if (!f.parent) continue;
    const k = String(f.parent);
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k).push(f._id);
  }
  const subtree = [feeder._id];
  const stack = [feeder._id];
  while (stack.length) {
    const cur = stack.pop();
    const kids = childrenOf.get(String(cur)) || [];
    subtree.push(...kids);
    stack.push(...kids);
  }
  const meters = await Meter.find({ feeder: { $in: subtree } }, 'baseLoadKW').lean();
  const affectedMeters = meters.length;
  const affectedLoadKW = meters.reduce((s, m) => s + (m.baseLoadKW || 0), 0);

  feeder.status = 'faulted';
  feeder.lastFaultAt = new Date();
  await feeder.save();

  const event = await OutageEvent.create({
    feeder: feeder._id,
    feederName: feeder.name,
    startedAt: feeder.lastFaultAt,
    affectedMeters,
    affectedLoadKW,
  });

  // Notify all clients
  const io = req.app.get('io');
  io?.emit('feeder:fault', { feederId: feeder._id, name: feeder.name, event });

  res.status(201).json({ feeder, event });
});

// POST /api/feeders/:id/restore — clear an outage
const restoreFeeder = asyncHandler(async (req, res) => {
  const feeder = await Feeder.findById(req.params.id);
  if (!feeder) {
    res.status(404);
    throw new Error('Feeder not found');
  }
  if (feeder.status !== 'faulted') {
    return res.status(400).json({ message: 'Feeder is not currently faulted' });
  }

  feeder.status = 'online';
  feeder.lastRestoredAt = new Date();
  await feeder.save();

  // Close out the most recent ongoing outage event for this feeder
  const ev = await OutageEvent.findOne({ feeder: feeder._id, restoredAt: null }).sort({ startedAt: -1 });
  if (ev) {
    ev.restoredAt = feeder.lastRestoredAt;
    ev.durationHours = (ev.restoredAt - ev.startedAt) / 3_600_000;
    await ev.save();
  }

  const io = req.app.get('io');
  io?.emit('feeder:restored', { feederId: feeder._id, name: feeder.name, event: ev });

  res.json({ feeder, event: ev });
});

module.exports = { listFeeders, getTopology, triggerFault, restoreFeeder };
