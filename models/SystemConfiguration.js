const mongoose = require('mongoose');

/**
 * Single-document configuration holding every tunable threshold and health
 * weight. Nothing in the scoring path hard-codes a limit.
 */
const configSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  thresholds: {
    temperature: {
      normal: { type: Number, default: 60 },
      warning: { type: Number, default: 60 },
      critical: { type: Number, default: 75 }
    },
    voltage: {
      min: { type: Number, default: 380 },
      max: { type: Number, default: 450 },
      tolerance: { type: Number, default: 40 }
    },
    current: {
      max: { type: Number, default: 250 }
    },
    heartbeat: {
      warningMs: { type: Number, default: 30000 },
      offlineMs: { type: Number, default: 90000 }
    },
    maintenance: {
      reminderDays: { type: Number, default: 7 }
    }
  },
  healthWeights: {
    communication: { type: Number, default: 25 },
    temperature: { type: Number, default: 20 },
    voltage: { type: Number, default: 15 },
    current: { type: Number, default: 15 },
    errorStatus: { type: Number, default: 15 },
    maintenance: { type: Number, default: 10 }
  },
  criticalErrorCodes: { type: [String], default: ['E-OVERHEAT', 'E-GROUND-FAULT', 'E-EMERGENCY-STOP', 'E-HARDWARE'] },
  simulator: {
    enabled: { type: Boolean, default: false },
    intervalMs: { type: Number, default: 5000 },
    faultProbability: { type: Number, default: 0.05 }
  }
}, { timestamps: true });

const SystemConfiguration = mongoose.model('SystemConfiguration', configSchema);

let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10000;

/** Config is read on every telemetry tick, so it is cached briefly. */
async function getConfig({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  let doc = await SystemConfiguration.findOne({ key: 'default' });
  if (!doc) doc = await SystemConfiguration.create({ key: 'default' });
  cached = doc;
  cachedAt = Date.now();
  return doc;
}

function invalidateConfigCache() {
  cached = null;
}

module.exports = SystemConfiguration;
module.exports.getConfig = getConfig;
module.exports.invalidateConfigCache = invalidateConfigCache;
