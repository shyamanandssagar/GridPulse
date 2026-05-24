const mongoose = require('mongoose');

// One sample emitted by a meter. For a real production system this would live
// in a time-series collection / InfluxDB. For demo purposes, a regular collection
// with TTL keeps things simple while still being correct.
const readingSchema = new mongoose.Schema(
  {
    meter: { type: mongoose.Schema.Types.ObjectId, ref: 'Meter', required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    voltage: Number,        // volts (per phase A; for 3ph we record balance separately)
    current: Number,        // amps
    powerKW: Number,        // instantaneous active power
    powerFactor: Number,    // 0-1
    frequency: Number,      // Hz, ~50 in IN
    phaseImbalance: Number, // % deviation across 3 phases (0 for single-phase)
  },
  { timestamps: false }
);

readingSchema.index({ meter: 1, timestamp: -1 });
// Keep raw readings 7 days; aggregations live elsewhere.
readingSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model('Reading', readingSchema);
