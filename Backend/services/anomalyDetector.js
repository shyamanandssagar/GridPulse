// anomalyDetector.js
// Per-reading threshold checks. Fixed bands, no rolling stats or ML.

const Anomaly = require('../models/Anomaly');

const THRESHOLDS = {
  V_NOMINAL: 230,            // single phase nominal (India)
  V_SAG_PCT: 0.10,          // <90% (207V) = sag
  V_SWELL_PCT: 0.10,        // >110% (253V) = swell
  CURRENT_SPIKE_RATIO: 2.5, // > 2.5x rated current
  PHASE_IMBALANCE_PCT: 5,   // >5% imbalance
};

// sag/swell band is IEEE 1159 (+/-10%). warning vs critical split inside that
// is our own call, set at +/-15% (so <195.5V crit, 195.5-207 warn).

function evaluate(reading, meter) {
  if (reading._offline) return null; // offline handled elsewhere

  const flags = [];
  const v = reading.voltage;

  // sag
  if (v && v < THRESHOLDS.V_NOMINAL * (1 - THRESHOLDS.V_SAG_PCT)) {
    flags.push({
      type: 'undervoltage',
      severity: v < THRESHOLDS.V_NOMINAL * 0.85 ? 'critical' : 'warning',
      value: v,
      threshold: THRESHOLDS.V_NOMINAL * (1 - THRESHOLDS.V_SAG_PCT),
      message: `Voltage sag: ${v.toFixed(1)} V`,
    });
  }

  // swell
  if (v && v > THRESHOLDS.V_NOMINAL * (1 + THRESHOLDS.V_SWELL_PCT)) {
    flags.push({
      type: 'overvoltage',
      severity: v > THRESHOLDS.V_NOMINAL * 1.15 ? 'critical' : 'warning',
      value: v,
      threshold: THRESHOLDS.V_NOMINAL * (1 + THRESHOLDS.V_SWELL_PCT),
      message: `Voltage swell: ${v.toFixed(1)} V`,
    });
  }

  // current spike. rated current = peak load / nominal V. flag >2.5x, usually a short.
  const ratedCurrent = (meter.peakLoadKW * 1000) / THRESHOLDS.V_NOMINAL;
  if (reading.current && reading.current > ratedCurrent * THRESHOLDS.CURRENT_SPIKE_RATIO) {
    flags.push({
      type: 'current_spike',
      severity: 'critical',
      value: reading.current,
      threshold: ratedCurrent * THRESHOLDS.CURRENT_SPIKE_RATIO,
      message: `Current spike: ${reading.current.toFixed(1)} A`,
    });
  }

  // phase imbalance, 3ph only (1ph reads 0). >10% wrecks motors so call it critical.
  if (reading.phaseImbalance > THRESHOLDS.PHASE_IMBALANCE_PCT) {
    flags.push({
      type: 'phase_imbalance',
      severity: reading.phaseImbalance > 10 ? 'critical' : 'warning',
      value: reading.phaseImbalance,
      threshold: THRESHOLDS.PHASE_IMBALANCE_PCT,
      message: `Phase imbalance: ${reading.phaseImbalance.toFixed(1)}%`,
    });
  }

  return flags;
}

// run over a tick's readings, batch all the flags, single insert.
async function detectAnomalies(readings, meters) {
  const meterById = new Map(meters.map((m) => [String(m._id), m]));
  const docs = [];

  for (const r of readings) {
    const meter = meterById.get(String(r.meter));
    if (!meter) continue; // meter gone, skip
    const flags = evaluate(r, meter);
    if (!flags || !flags.length) continue;
    for (const f of flags) {
      docs.push({
        meter: meter._id,
        feeder: meter.feeder,
        ...f,
        timestamp: r.timestamp,
      });
    }
  }

  if (!docs.length) return [];
  // if the write fails just return the docs anyway, UI still shows the alert
  const inserted = await Anomaly.insertMany(docs, { ordered: false }).catch(() => docs);
  return inserted;
}

module.exports = { detectAnomalies, THRESHOLDS };
