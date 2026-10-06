const mongoose = require('mongoose');

const ALERT_TYPES = [
  'HIGH_TEMPERATURE', 'OVER_VOLTAGE', 'UNDER_VOLTAGE', 'OVER_CURRENT',
  'CHARGER_OFFLINE', 'HEARTBEAT_LOST', 'HARDWARE_FAULT', 'EMERGENCY_STOP',
  'SESSION_FAILED', 'MAINTENANCE_DUE'
];
const SEVERITIES = ['Information', 'Warning', 'Critical'];
const ALERT_STATUSES = ['Active', 'Acknowledged', 'Resolved'];

const alertSchema = new mongoose.Schema({
  alertId: { type: String, required: true, unique: true, index: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation', index: true },
  charger: { type: mongoose.Schema.Types.ObjectId, ref: 'Charger', index: true },
  type: { type: String, enum: ALERT_TYPES, required: true, index: true },
  severity: { type: String, enum: SEVERITIES, default: 'Warning', index: true },
  message: { type: String, required: true },
  value: { type: Number },
  status: { type: String, enum: ALERT_STATUSES, default: 'Active', index: true },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date }
}, { timestamps: true });

alertSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
Object.assign(module.exports, { ALERT_TYPES, SEVERITIES, ALERT_STATUSES });
