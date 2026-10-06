const mongoose = require('mongoose');

const SESSION_STATUSES = ['Active', 'Completed', 'Failed', 'Interrupted'];

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation', required: true, index: true },
  charger: { type: mongoose.Schema.Types.ObjectId, ref: 'Charger', required: true, index: true },
  vehicleId: { type: String, required: true },
  driverId: { type: String },
  startTime: { type: Date, required: true, default: Date.now, index: true },
  endTime: { type: Date },
  durationMinutes: { type: Number, default: 0 },
  initialEnergy: { type: Number, default: 0 },
  finalEnergy: { type: Number, default: 0 },
  energyConsumed: { type: Number, default: 0 },
  chargingPower: { type: Number, default: 0 },
  status: { type: String, enum: SESSION_STATUSES, default: 'Active', index: true }
}, { timestamps: true });

// Keep derived fields consistent no matter which code path closes the session.
sessionSchema.pre('save', function normalise(next) {
  if (this.endTime && this.startTime) {
    this.durationMinutes = Math.max(0, Math.round((this.endTime - this.startTime) / 60000));
  }
  this.energyConsumed = Math.max(0, +(this.finalEnergy - this.initialEnergy).toFixed(3));
  next();
});

module.exports = mongoose.model('ChargingSession', sessionSchema);
module.exports.SESSION_STATUSES = SESSION_STATUSES;
