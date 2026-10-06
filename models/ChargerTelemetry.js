const mongoose = require('mongoose');

/** Append-only time-series of raw charger readings. */
const telemetrySchema = new mongoose.Schema({
  charger: { type: mongoose.Schema.Types.ObjectId, ref: 'Charger', required: true, index: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation', required: true, index: true },
  voltage: { type: Number, required: true },
  current: { type: Number, required: true },
  power: { type: Number, required: true },
  temperature: { type: Number, required: true },
  energyConsumed: { type: Number, default: 0 },
  status: { type: String, required: true },
  errorCode: { type: String, default: 'NONE' },
  connectorStatus: { type: String, default: 'Disconnected' },
  healthScore: { type: Number, default: 100 },
  healthStatus: { type: String, default: 'Healthy' },
  simulated: { type: Boolean, default: false },
  lastHeartbeat: { type: Date, default: Date.now },
  recordedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

telemetrySchema.index({ charger: 1, recordedAt: -1 });

module.exports = mongoose.model('ChargerTelemetry', telemetrySchema);
