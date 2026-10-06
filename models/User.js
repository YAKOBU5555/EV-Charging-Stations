const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['admin', 'operator', 'viewer'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'viewer', index: true },
  isActive: { type: Boolean, default: true },
  assignedStations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation' }],
  lastLoginAt: { type: Date }
}, { timestamps: true });

userSchema.methods.setPassword = async function setPassword(plain) {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  this.passwordHash = await bcrypt.hash(plain, rounds);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Never leak the hash, even if a caller forgets to project it away.
userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
