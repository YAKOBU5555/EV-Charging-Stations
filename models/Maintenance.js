const mongoose = require('mongoose');

const MAINTENANCE_TYPES = ['Preventive', 'Corrective', 'Inspection', 'Firmware Upgrade', 'Calibration'];
const MAINTENANCE_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];

const maintenanceSchema = new mongoose.Schema({
  maintenanceId: { type: String, required: true, unique: true, index: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation', required: true, index: true },
  charger: { type: mongoose.Schema.Types.ObjectId, ref: 'Charger', index: true },
  type: { type: String, enum: MAINTENANCE_TYPES, default: 'Preventive' },
  description: { type: String, required: true },
  technician: { type: String, required: true },
  scheduledDate: { type: Date, required: true, index: true },
  completionDate: { type: Date },
  status: { type: String, enum: MAINTENANCE_STATUSES, default: 'Scheduled', index: true },
  notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
Object.assign(module.exports, { MAINTENANCE_TYPES, MAINTENANCE_STATUSES });
