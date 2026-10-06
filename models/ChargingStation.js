const mongoose = require('mongoose');

const STATION_STATUSES = ['Operational', 'Partial', 'Offline', 'Maintenance'];

const stationSchema = new mongoose.Schema({
  stationId: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  address: { type: String, trim: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  chargerCount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: STATION_STATUSES, default: 'Operational', index: true },
  installationDate: { type: Date, default: Date.now },
  lastMaintenanceDate: { type: Date },
  nextMaintenanceDate: { type: Date },
  totalEnergyDelivered: { type: Number, default: 0 },   // kWh
  currentPowerConsumption: { type: Number, default: 0 }, // kW
  healthScore: { type: Number, default: 100, min: 0, max: 100 },
  healthStatus: { type: String, default: 'Healthy' }
}, { timestamps: true });

stationSchema.index({ name: 'text', location: 'text', address: 'text' });

module.exports = mongoose.model('ChargingStation', stationSchema);
module.exports.STATION_STATUSES = STATION_STATUSES;
