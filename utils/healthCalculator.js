/**
 * Charger health scoring.
 *
 * The score is a weighted sum of six components, each scored 0-1, then
 * normalised to 0-100. Thresholds and weights come from the SystemConfiguration
 * document so an administrator can retune scoring without a code change.
 */

const HEALTH_CLASSES = [
  { min: 90, status: 'Healthy' },
  { min: 70, status: 'Warning' },
  { min: 40, status: 'Degraded' },
  { min: 0, status: 'Critical' }
];

/** Score a value that should stay below a warning/critical ceiling. */
function scoreCeiling(value, warning, critical) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0.5;
  if (value < warning) return 1;
  if (value >= critical) return 0;
  return 1 - (value - warning) / (critical - warning);
}

/** Score a value that should stay inside a [min, max] band. */
function scoreBand(value, min, max, tolerance) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0.5;
  if (value >= min && value <= max) return 1;
  const distance = value < min ? min - value : value - max;
  if (distance >= tolerance) return 0;
  return 1 - distance / tolerance;
}

/**
 * @param {object} telemetry  Latest telemetry-like object.
 * @param {object} charger    Charger document (status, errorCode, maintenance dates).
 * @param {object} config     SystemConfiguration document.
 * @returns {{score:number,status:string,components:object,reasons:string[]}}
 */
function calculateHealth(telemetry = {}, charger = {}, config) {
  const t = config.thresholds;
  const w = config.healthWeights;
  const now = Date.now();
  const reasons = [];

  // --- Communication -------------------------------------------------------
  const lastHeartbeat = telemetry.lastHeartbeat || charger.lastHeartbeat;
  const silenceMs = lastHeartbeat ? now - new Date(lastHeartbeat).getTime() : Infinity;
  let communication = 1;
  if (silenceMs > t.heartbeat.offlineMs) {
    communication = 0;
    reasons.push('No heartbeat received within the offline timeout');
  } else if (silenceMs > t.heartbeat.warningMs) {
    communication = 0.5;
    reasons.push('Heartbeat delayed');
  }

  // --- Temperature ---------------------------------------------------------
  const temperature = scoreCeiling(telemetry.temperature, t.temperature.warning, t.temperature.critical);
  if (temperature < 1) reasons.push(`Temperature ${telemetry.temperature}\u00B0C above normal range`);

  // --- Voltage -------------------------------------------------------------
  const voltage = scoreBand(telemetry.voltage, t.voltage.min, t.voltage.max, t.voltage.tolerance);
  if (voltage < 1) reasons.push(`Voltage ${telemetry.voltage} V outside configured limits`);

  // --- Current -------------------------------------------------------------
  const maxCurrent = charger.maxCurrent || t.current.max;
  const current = scoreCeiling(telemetry.current, maxCurrent * 0.9, maxCurrent * 1.1);
  if (current < 1) reasons.push(`Current ${telemetry.current} A above configured limits`);

  // --- Error status --------------------------------------------------------
  const code = telemetry.errorCode || charger.errorCode || 'NONE';
  const errorStatus = code === 'NONE' ? 1 : (config.criticalErrorCodes.includes(code) ? 0 : 0.4);
  if (errorStatus < 1) reasons.push(`Error code reported: ${code}`);

  // --- Maintenance ---------------------------------------------------------
  let maintenance = 1;
  if (charger.nextMaintenanceDate) {
    const daysUntil = (new Date(charger.nextMaintenanceDate).getTime() - now) / 86400000;
    if (daysUntil < 0) {
      maintenance = 0;
      reasons.push('Maintenance is overdue');
    } else if (daysUntil < t.maintenance.reminderDays) {
      maintenance = 0.6;
      reasons.push('Maintenance due soon');
    }
  }

  const components = { communication, temperature, voltage, current, errorStatus, maintenance };
  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const weighted = Object.entries(components)
    .reduce((sum, [key, value]) => sum + value * (w[key] || 0), 0);

  let score = Math.round((weighted / totalWeight) * 100);
  // A charger we cannot talk to is never better than Critical, whatever the rest says.
  if (communication === 0) score = Math.min(score, 35);
  score = Math.max(0, Math.min(100, score));

  return { score, status: classify(score), components, reasons };
}

function classify(score) {
  return (HEALTH_CLASSES.find((c) => score >= c.min) || HEALTH_CLASSES[HEALTH_CLASSES.length - 1]).status;
}

module.exports = { calculateHealth, classify, scoreCeiling, scoreBand, HEALTH_CLASSES };
