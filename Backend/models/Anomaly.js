const mongoose = require('mongoose');

//Each document represents:  One abnormal event detected in the grid.


const anomalySchema = new mongoose.Schema(
  {
    meter: { type: mongoose.Schema.Types.ObjectId, ref: 'Meter' },
    feeder: { type: mongoose.Schema.Types.ObjectId, ref: 'Feeder' },
    type: {
      type: String,
      enum: ['overvoltage', 'undervoltage', 'current_spike', 'phase_imbalance', 'outage'],
      required: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    value: Number,           // the measured value that triggered the alert
    threshold: Number,       // configured threshold
    message: String,
    acknowledged: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

anomalySchema.index({ acknowledged: 1, timestamp: -1 });

module.exports = mongoose.model('Anomaly', anomalySchema);
