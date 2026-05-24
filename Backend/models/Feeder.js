const mongoose = require('mongoose');

// A Feeder is a node in the radial distribution network.
// type: 'substation' (root) | 'feeder' (main) | 'lateral' (branch)
// parent: upstream feeder. If null -> this is the substation.
const feederSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['substation', 'feeder', 'lateral'], required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Feeder', default: null },
    nominalVoltage: { type: Number, default: 230 }, // volts
    capacityKW: { type: Number, default: 100 },
    // Operational state — when faulted, all downstream meters lose power
    status: { type: String, enum: ['online', 'faulted', 'maintenance'], default: 'online' },
    lastFaultAt: Date,
    lastRestoredAt: Date,
  },
  { timestamps: true }
);

feederSchema.index({ parent: 1 });

module.exports = mongoose.model('Feeder', feederSchema);
