// Per-feeder energy-balance analysis (theft / non-technical-loss detection).
//
// In real distribution systems, you compare the energy *injected* at a feeder
// head with the sum of energy *measured* at customer endpoints. The gap is
// loss — some of which is technical (line + transformer losses, ~5-8%) and
// the rest is non-technical (theft, tampered meters, illegal connections).
//
// Our simulator doesn't have feeder-head meters, so we approximate the
// "expected" injection by summing every downstream meter's modelled load
// (baseLoadKW × current time-of-day demand factor). The "reported" side is
// the actual mean of recent readings. Tampered meters under-report, so the
// gap widens — and surfaces the offenders.
//
// Returned per-feeder shape:
//   {
//     feederId, feederName, meterCount,
//     expectedKW, reportedKW, lossKW, lossPct, severity,
//     suspectedMeters: [ {serial, expected, reported, deviationPct, ...} ]
//   }

const Feeder = require('../models/Feeder');
const Meter = require('../models/Meter');
const Reading = require('../models/Reading');

// Same daily curve the simulator uses (kept duplicated here to avoid a circular import)
const dailyCurve = [
  0.55, 0.50, 0.48, 0.46, 0.48, 0.55,
  0.75, 1.05, 1.20, 1.10, 0.95, 0.90,
  0.95, 0.95, 0.90, 0.95, 1.05, 1.30,
  1.55, 1.65, 1.50, 1.25, 0.95, 0.70,
];

const round = (n, d = 2) => Number((Number(n) || 0).toFixed(d));

// Severity thresholds (rough industry benchmarks; tune as needed)
//   < 8 %   → 'normal'    (technical loss only)
//   8-15 %  → 'elevated'  (worth investigating)
//   > 15 %  → 'critical'  (highly likely NTL)
function severity(lossPct) {   //percentage losses
  if (lossPct < 8) return 'normal';
  if (lossPct < 15) return 'elevated';
  return 'critical';
}

async function analyzeLosses({ windowMinutes = 30 } = {}) { //default last 30 minutes
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const hour = new Date().getHours();
  const demand = dailyCurve[hour];

  // Average reported power per meter over the window
  const recent = await Reading.aggregate([
    { $match: { timestamp: { $gte: since } } },
    { $group: { _id: '$meter', avgPowerKW: { $avg: '$powerKW' }, samples: { $sum: 1 } } },
  ]);
  const avgByMeter = new Map(recent.map((r) => [String(r._id), { avg: r.avgPowerKW, samples: r.samples }]));

  //  analyze at lateral level .smallest topology unit with attached meters
  const [laterals, allMeters] = await Promise.all([
    Feeder.find({ type: 'lateral' }).lean(),
    Meter.find({}).lean(),
  ]);

  const metersByFeeder = new Map();
  for (const m of allMeters) {
    const k = String(m.feeder);
    if (!metersByFeeder.has(k)) metersByFeeder.set(k, []);
    metersByFeeder.get(k).push(m);
  }

  const results = [];
  let totalExpected = 0;
  let totalReported = 0;
  let suspectFlagged = 0;

  for (const lateral of laterals) {
    const meters = metersByFeeder.get(String(lateral._id)) || [];
    if (!meters.length) continue;

    let expectedKW = 0;
    let reportedKW = 0;
    const suspects = [];

    for (const m of meters) {
      const expected = m.baseLoadKW * demand;
      const sample = avgByMeter.get(String(m._id));
      const reported = sample ? sample.avg : 0;
      expectedKW += expected;
      reportedKW += reported;

      // Per-meter deviation: reported much lower than expected → suspicious.
      // Skip offline meters (they correctly report 0).
      const offline = lateral.status === 'faulted';
      if (!offline && expected > 0.1) {
        const dev = (expected - reported) / expected;
        if (dev > 0.20) {
          suspects.push({
            meterId: m._id,
            serial: m.serial,
            customerName: m.customerName,
            expectedKW: round(expected),
            reportedKW: round(reported),
            deviationPct: round(dev * 100, 1),
            tamperingFactor: m.tamperingFactor,
            samples: sample?.samples || 0,
          });
        }
      }
    }

    const lossKW = Math.max(0, expectedKW - reportedKW);
    const lossPct = expectedKW > 0 ? (lossKW / expectedKW) * 100 : 0;
    const sev = severity(lossPct);

    totalExpected += expectedKW;
    totalReported += reportedKW;
    if (sev !== 'normal') suspectFlagged++;

    results.push({
      feederId: lateral._id,
      feederName: lateral.name,
      meterCount: meters.length,
      expectedKW: round(expectedKW),
      reportedKW: round(reportedKW),
      lossKW: round(lossKW),
      lossPct: round(lossPct, 1),
      severity: sev,
      suspectedMeters: suspects.sort((a, b) => b.deviationPct - a.deviationPct).slice(0, 10),
    });
  }

  results.sort((a, b) => b.lossPct - a.lossPct);

  const overallPct = totalExpected > 0 ? ((totalExpected - totalReported) / totalExpected) * 100 : 0;
  return {
    window: { minutes: windowMinutes, hourEvaluated: hour, demandFactor: demand },
    overall: {
      expectedKW: round(totalExpected),
      reportedKW: round(totalReported),
      lossKW: round(Math.max(0, totalExpected - totalReported)),
      lossPct: round(overallPct, 2),
      flaggedFeeders: suspectFlagged,
      totalFeeders: results.length,
    },
    feeders: results,
  };
}

// Demo helper — randomly tamper with a small set of meters 
// so the page has something interesting to show. Idempotent: re-running picks fresh meters.
async function injectDemoTheft({ count = 8 } = {}) {
  const meters = await Meter.find({ tamperingFactor: 1 }).lean();
  if (!meters.length) return { injected: 0 };
  const picked = [...meters].sort(() => 0.5 - Math.random()).slice(0, count);
  await Promise.all(
    picked.map((m) =>
      Meter.findByIdAndUpdate(m._id, {
        tamperingFactor: Number((0.4 + Math.random() * 0.4).toFixed(2)), // 0.40-0.80
      })
    )
  );
  return {
    injected: picked.length,
    meters: picked.map((m) => ({ id: m._id, serial: m.serial, customer: m.customerName })),
  };
}

async function clearAllTheft() {
  const r = await Meter.updateMany({}, { tamperingFactor: 1 });
  return { reset: r.modifiedCount };
}

module.exports = { analyzeLosses, injectDemoTheft, clearAllTheft };
