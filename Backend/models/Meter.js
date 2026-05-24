const mongoose = require('mongoose');

// A Meter represents a customer endpoint connected to a lateral feeder.
// loadProfile sets the typical kW draw used by the simulator.
const meterSchema = new mongoose.Schema(
  {
    serial: { type: String, required: true, unique: true }, // e.g. "MTR-00123"
    customerName: String,
    feeder: { type: mongoose.Schema.Types.ObjectId, ref: 'Feeder', required: true },
    loadProfile: {
      type: String,
      enum: ['residential', 'commercial', 'industrial'],
      default: 'residential',
    },
    baseLoadKW: { type: Number, default: 1.5 },     // average draw
    peakLoadKW: { type: Number, default: 4.5 },     // peak draw
    phases: { type: Number, enum: [1, 3], default: 1 },
    // Live status (updated by simulator)
    status: { type: String, enum: ['online', 'offline'], default: 'online' },
    lastSeenAt: Date,
    cumulativeKWh: { type: Number, default: 0 },    //Total electricity consumed by this meter during current billing cycle.  since billing cycle start
    billingCycleStart: { type: Date, default: () => new Date(new Date().setDate(1)) },
    // Per Time-of-Use bucket cumulative kWh (used by tariffEngine).
    // Simulator credits each tick to peak / normal / offpeak based on hour.
    tariffSlots: {
      peak:    { type: Number, default: 0 },
      normal:  { type: Number, default: 0 },
      offpeak: { type: Number, default: 0 },
    },
    // 1.0 = honest meter. Lower values = under-reports usage (simulated theft).
    // Used by lossAnalyzer + the simulator multiplies reported powerKW by this.
    tamperingFactor: { type: Number, default: 1, min: 0.1, max: 1 },
  },
  { timestamps: true }
);

meterSchema.index({ feeder: 1 });

module.exports = mongoose.model('Meter', meterSchema);
