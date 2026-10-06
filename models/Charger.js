const mongoose = require('mongoose');

const CHARGER_STATUSES = ['Available', 'Charging', 'Idle', 'Offline', 'Fault', 'Maintenance'];
const HEALTH_STATUSES = ['Healthy', 'Warning', 'Degraded', 'Critical'];
const CONNECTOR_TYPES = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'GB/T', 'Bharat AC-001'];
const CHARGING_STANDARDS = ['DC Fast', 'AC Level 2', 'AC Level 1', 'Ultra Fast DC'];

const chargerSchema = new mongoose.Schema({
  chargerId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation', required: true, index: true },
  connectorType: { type: String, enum: CONNECTOR_TYPES, default: 'CCS2' },
  chargingStandard: { type: String, enum: CHARGING_STANDARDS, default: 'DC Fast' },
  maxPower: { type: Number, default: 60 },     // kW
  maxCurrent: { type: Number, default: 200 },  // A
  voltage: { type: Number, default: 0 },
  current: { type: Number, default: 0 },
  power: { type: Number, default: 0 },
  temperature: { type: Number, default: 25 },
  status: { type: String, enum: CHARGER_STATUSES, default: 'Available', index: true },
  healthStatus: { type: String, enum: HEALTH_STATUSES, default: 'Healthy', index: true },
  healthScore: { type: Number, default: 100, min: 0, max: 100 },
  errorCode: { type: String, default: 'NONE' },
  firmwareVersion: { type: String, default: '1.0.0' },
  lastHeartbeat: { type: Date, default: Date.now },
  lastMaintenanceDate: { type: Date },
  nextMaintenanceDate: { type: Date },
  totalEnergyDelivered: { type: Number, default: 0 },
  totalSessions: { type: Number, default: 0 },
  uptimeSeconds: { type: Number, default: 0 },
  downtimeSeconds: { type: Number, default: 0 },
  faultCount: { type: Number, default: 0 }
}, { timestamps: true });

chargerSchema.index({ station: 1, status: 1 });

module.exports = mongoose.model('Charger', chargerSchema);
Object.assign(module.exports, { CHARGER_STATUSES, HEALTH_STATUSES, CONNECTOR_TYPES, CHARGING_STANDARDS });
