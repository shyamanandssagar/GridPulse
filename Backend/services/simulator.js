// simulator.js
// Fake-grid driver. setInterval -> tick(): read meters, make up plausible
// numbers, save them, run anomaly checks, push to socket rooms.
// One timer, all meters in a single pass, writes batched into one insertMany.

const Meter = require('../models/Meter');
const Feeder = require('../models/Feeder');
const Reading = require('../models/Reading');
const { detectAnomalies } = require('./anomalyDetector');
const { classifyHour } = require('./tariffEngine');

let timer = null;

// 24 values, one per hour, avg ~1.0. low overnight, morning bump, evening peak.
// index with new Date().getHours().
const dailyCurve = [
  0.55, 0.50, 0.48, 0.46, 0.48, 0.55, // 00-05
  0.75, 1.05, 1.20, 1.10, 0.95, 0.90, // 06-11
  0.95, 0.95, 0.90, 0.95, 1.05, 1.30, // 12-17
  1.55, 1.65, 1.50, 1.25, 0.95, 0.70, // 18-23
];

// +/- jitter so no two ticks match. pct=0.05 -> [0.95, 1.05].
const noise = (pct) => 1 + (Math.random() * 2 - 1) * pct;

function generateReading(meter, faultedFeederIds, intervalMs) {
  // dark if its feeder is in the faulted set (set is built once per tick and
  // already includes feeders that are down because of a faulted parent).
  const isOffline = faultedFeederIds.has(String(meter.feeder));  //Is this meter connected to a failed feeder?
  if (isOffline) {
    // zero everything. _offline tells the rest of the pipeline to skip this one.
    return {
      meter: meter._id,
      timestamp: new Date(),
      voltage: 0,
      current: 0,
      powerKW: 0,
      powerFactor: 0,
      frequency: 0,
      phaseImbalance: 0,
      _offline: true,
    };
  }

  // interpolate between base and peak load using this hour's multiplier.
  // the -0.5 keeps quiet hours near base and lets the evening push toward peak.
  const hour = new Date().getHours();
  const demandMultiplier = dailyCurve[hour];
  const targetLoad =   //The amount of power the simulator WANTS the meter to consume at that moment.
  //
    (meter.baseLoadKW + (meter.peakLoadKW - meter.baseLoadKW) * (demandMultiplier - 0.5)) *
    noise(Number(process.env.SIM_NOISE) || 0.05);

   // The simulator is saying:“At this time of day, this house/factory/shop is probably consuming around some specific value kW gotten from meter. ”


  const powerKW = Math.max(0.05, targetLoad); // floor so it never hits 0 online   Otherwise:anomaly detector may think power outage.



  // 230V nominal + small noise. ~2% of ticks force a sag/swell so the detector
  // has something to catch.
  let voltage = 230 * noise(0.015);
  if (Math.random() < 0.02) voltage *= Math.random() < 0.5 ? 0.85 : 1.12;  //Without this:anomaly detector never gets triggered.  Voltage Sag,Voltage Swell



  // pf 0.85-0.97, current from P = V*I*pf
  const powerFactor = 0.85 + Math.random() * 0.12;
  const current = (powerKW * 1000) / (voltage * powerFactor);
  const frequency = 50 * noise(0.001); // freq barely moves, tiny wobble

  // 3ph imbalance only. mostly <3%, ~3% of the time inject a real one (8-15%).
  let phaseImbalance = 0;  //All three phases should carry almost equal load.


  if (meter.phases === 3) {
    phaseImbalance = Math.random() < 0.03 ? 8 + Math.random() * 7 : Math.random() * 3;  //it directly generates a realistic imbalance percentage value rather than calculating
  }

  // tampering: factor < 1 means the meter under-reports. powerKW is what the
  // grid actually delivers, reportedKW is what gets billed. the gap is the loss
  // lossAnalyzer looks for.
  const factor = meter.tamperingFactor != null ? meter.tamperingFactor : 1;
  const reportedKW = powerKW * factor;
  const reportedCurrent = (reportedKW * 1000) / (voltage * powerFactor);
  const kWhDelta = (reportedKW * intervalMs) / 3_600_000; // kW over the interval -> kWh  //how many units were consumed during THIS simulation interval
  const slot = classifyHour(new Date().getHours()); // peak / normal / offpeak

  return {
    meter: meter._id,
    timestamp: new Date(),
    voltage: round(voltage, 1),
    current: round(reportedCurrent, 2),
    powerKW: round(reportedKW, 3),
    powerFactor: round(powerFactor, 3),
    frequency: round(frequency, 2),
    phaseImbalance: round(phaseImbalance, 2),
    _kWhDelta: kWhDelta,
    _slot: slot,
    _actualKW: round(powerKW, 3), // debug only, not saved
  };
}

const round = (n, d) => Number(n.toFixed(d));

// which feeders are down. a feeder is down if it OR any ancestor is faulted.
// returns a Set of id strings for O(1) lookup in generateReading.
async function computeFaultedFeederSet() {
  const feeders = await Feeder.find({}, '_id parent status').lean();
  const byId = new Map(feeders.map((f) => [String(f._id), f]));
  const faulted = new Set();

  for (const f of feeders) {
    // walk up to the root, stop if we hit a faulted node
    let cur = f;
    while (cur) {
      if (cur.status === 'faulted') {
        faulted.add(String(f._id));
        break;
      }
      cur = cur.parent ? byId.get(String(cur.parent)) : null;
    }
  }
  return faulted;
}

async function tick(io) {
  const intervalMs = Number(process.env.SIM_INTERVAL_MS) || 1000;

  const meters = await Meter.find({}).lean();
  if (!meters.length) return; // nothing seeded, bail

  // build all readings off one snapshot of the faulted set
  const faultedSet = await computeFaultedFeederSet();
  const readings = meters.map((m) => generateReading(m, faultedSet, intervalMs));

  // strip the private _fields then bulk insert. ordered:false so one bad doc
  // doesn't abort the batch, and we swallow errors (a missed write shouldn't
  // kill the tick).
  const docs = readings.map(({ _kWhDelta, _offline, _slot, _actualKW, ...r }) => r);
  await Reading.insertMany(docs, { ordered: false }).catch(() => {});

  // one bulkWrite per meter: set status + lastSeen, and for online meters bump
  // lifetime kWh + the matching TOU bucket so tariffEngine has its per-slot totals.
  const ops = readings.map((r) => {
    const inc = {};
    if (!r._offline) {
      inc.cumulativeKWh = r._kWhDelta;
      inc[`tariffSlots.${r._slot}`] = r._kWhDelta;
    }
    return {
      updateOne: {
        filter: { _id: r.meter },
        update: {
          $set: {
            status: r._offline ? 'offline' : 'online',
            lastSeenAt: r.timestamp,
          },
          ...(Object.keys(inc).length ? { $inc: inc } : {}),
        },
      },
    };
  });
  if (ops.length) await Meter.bulkWrite(ops, { ordered: false }).catch(() => {});

  // detectAnomalies skips offline readings itself
  const newAnomalies = await detectAnomalies(readings, meters);

  // socket push
  // detail views subscribe per meter
  for (const r of readings) {
    io.to(`meter:${r.meter}`).emit('reading', cleanReading(r));
  }
  // dashboard just needs the totals
  const totalLoadKW = readings.reduce((s, r) => s + (r.powerKW || 0), 0);
  const onlineCount = readings.filter((r) => !r._offline).length;
  io.emit('grid:tick', {
    timestamp: new Date(),
    totalLoadKW: round(totalLoadKW, 2),
    meters: readings.length,
    online: onlineCount,
    offline: readings.length - onlineCount,
  });
  if (newAnomalies.length) io.emit('anomaly:new', newAnomalies); // only if there's something new
}

// strip _fields for the socket payload, expose _offline as plain `offline`
function cleanReading(r) {
  const { _kWhDelta, _offline, _slot, _actualKW, ...rest } = r;
  return { ...rest, offline: !!_offline };
}

function startSimulator(io) {
  const intervalMs = Number(process.env.SIM_INTERVAL_MS) || 1000;
  if (timer) clearInterval(timer); // don't double up
  timer = setInterval(() => {
    // never let a thrown tick kill the interval
    tick(io).catch((err) => console.error('Simulator tick error:', err.message));
  }, intervalMs);
  console.log(` Simulator running every ${intervalMs} ms`);
}

function stopSimulator() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startSimulator, stopSimulator };
