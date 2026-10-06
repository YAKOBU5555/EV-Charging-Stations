const Alert = require('../models/Alert');
const logger = require('../utils/logger');
const socket = require('../sockets/monitoringSocket');

function makeAlertId() {
  return `ALT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

/**
 * Create an alert unless an identical one is already open for the same charger.
 * De-duplication keeps a stuck sensor from flooding the alert list.
 */
async function raiseAlert({ station, charger, type, severity, message, value }) {
  const existing = await Alert.findOne({ charger, type, status: { $in: ['Active', 'Acknowledged'] } });
  if (existing) return null;

  const alert = await Alert.create({ alertId: makeAlertId(), station, charger, type, severity, message, value });
  logger.info(`Alert raised: ${type}`, { alertId: alert.alertId, severity });

  const populated = await alert.populate([
    { path: 'station', select: 'stationId name' },
    { path: 'charger', select: 'chargerId' }
  ]);
  socket.emit('alert:new', populated);
  return populated;
}

/** Auto-resolve open alerts of the given types once the condition clears. */
async function clearAlerts(chargerId, types) {
  const result = await Alert.updateMany(
    { charger: chargerId, type: { $in: types }, status: { $in: ['Active', 'Acknowledged'] } },
    { $set: { status: 'Resolved', resolvedAt: new Date() } }
  );
  if (result.modifiedCount) socket.emit('alert:resolved', { charger: chargerId, types });
  return result.modifiedCount;
}

/** Map a health evaluation onto alert conditions. */
function conditionsFromHealth(telemetry, charger, config) {
  const t = config.thresholds;
  const conditions = [];

  if (telemetry.temperature > t.temperature.critical) {
    conditions.push({ type: 'HIGH_TEMPERATURE', severity: 'Critical', value: telemetry.temperature,
      message: `${charger.chargerId} is running at ${telemetry.temperature.toFixed(1)}\u00B0C, above the critical limit` });
  } else if (telemetry.temperature > t.temperature.warning) {
    conditions.push({ type: 'HIGH_TEMPERATURE', severity: 'Warning', value: telemetry.temperature,
      message: `${charger.chargerId} is warming up: ${telemetry.temperature.toFixed(1)}\u00B0C` });
  }

  if (telemetry.voltage > t.voltage.max) {
    conditions.push({ type: 'OVER_VOLTAGE', severity: 'Critical', value: telemetry.voltage,
      message: `${charger.chargerId} voltage reached ${telemetry.voltage.toFixed(0)} V` });
  } else if (telemetry.voltage > 0 && telemetry.voltage < t.voltage.min) {
    conditions.push({ type: 'UNDER_VOLTAGE', severity: 'Warning', value: telemetry.voltage,
      message: `${charger.chargerId} voltage dropped to ${telemetry.voltage.toFixed(0)} V` });
  }

  const maxCurrent = charger.maxCurrent || t.current.max;
  if (telemetry.current > maxCurrent) {
    conditions.push({ type: 'OVER_CURRENT', severity: 'Critical', value: telemetry.current,
      message: `${charger.chargerId} is drawing ${telemetry.current.toFixed(0)} A, above its rating` });
  }

  if (telemetry.status === 'Offline') {
    conditions.push({ type: 'CHARGER_OFFLINE', severity: 'Critical',
      message: `${charger.chargerId} has gone offline` });
  }

  const silenceMs = Date.now() - new Date(telemetry.lastHeartbeat || charger.lastHeartbeat || 0).getTime();
  if (silenceMs > t.heartbeat.offlineMs) {
    conditions.push({ type: 'HEARTBEAT_LOST', severity: 'Critical',
      message: `No heartbeat from ${charger.chargerId} for ${Math.round(silenceMs / 1000)}s` });
  }

  if (telemetry.errorCode && telemetry.errorCode !== 'NONE') {
    const isEmergency = telemetry.errorCode === 'E-EMERGENCY-STOP';
    conditions.push({
      type: isEmergency ? 'EMERGENCY_STOP' : 'HARDWARE_FAULT',
      severity: config.criticalErrorCodes.includes(telemetry.errorCode) ? 'Critical' : 'Warning',
      message: `${charger.chargerId} reported ${telemetry.errorCode}`
    });
  }

  return conditions;
}

module.exports = { raiseAlert, clearAlerts, conditionsFromHealth, makeAlertId };
