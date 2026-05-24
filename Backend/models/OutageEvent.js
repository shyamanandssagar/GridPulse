const mongoose = require('mongoose');

// An OutageEvent records a discrete fault on a feeder. We use these to compute
// reliability indices (SAIFI, SAIDI, CAIDI, ASAI, ENS) over a time window.
//
// affectedMeters and affectedLoadKW are snapshotted at the time of the event so
// that even if the network changes later, historical indices remain stable.
const outageSchema = new mongoose.Schema(
  {
    feeder: { type: mongoose.Schema.Types.ObjectId, ref: 'Feeder', required: true },
    feederName: String,
    startedAt: { type: Date, required: true },
    restoredAt: Date,                       // null while ongoing
    durationHours: { type: Number, default: 0 },
    affectedMeters: { type: Number, default: 0 },
    affectedLoadKW: { type: Number, default: 0 },
    cause: { type: String, default: 'simulated_fault' },
  },
  { timestamps: true }
);

outageSchema.index({ startedAt: -1 });

module.exports = mongoose.model('OutageEvent', outageSchema);
