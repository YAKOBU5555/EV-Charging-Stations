const Charger = require('../models/Charger');
const ChargingStation = require('../models/ChargingStation');
const Alert = require('../models/Alert');
const ChargingSession = require('../models/ChargingSession');
const ChargerTelemetry = require('../models/ChargerTelemetry');
const { getConfig } = require('../models/SystemConfiguration');
const { calculateHealth } = require('../utils/healthCalculator');
const alertService = require('./alertService');
const logger = require('../utils/logger');

const ALL_CONDITION_TYPES = ['HIGH_TEMPERATURE', 'OVER_VOLTAGE', 'UNDER_VOLTAGE', 'OVER_CURRENT',
  'CHARGER_OFFLINE', 'HEARTBEAT_LOST', 'HARDWARE_FAULT', 'EMERGENCY_STOP'];

/**
 * Evaluate a reading against configuration: score health, persist the charger
 * state, raise or clear alerts. Returns the updated charger and evaluation.
 */
async function evaluateCharger(charger, reading, { persist = true } = {}) {
  const config = await getConfig();
  const health = calculateHealth(reading, charger, config);

  const previousStatus = charger.status;
  charger.voltage = reading.voltage;
  charger.current = reading.current;
  charger.power = reading.power;
  charger.temperature = reading.temperature;
  charger.errorCode = reading.errorCode || 'NONE';
  charger.status = reading.status;
  charger.healthScore = health.score;
  charger.healthStatus = health.status;
  if (reading.lastHeartbeat) charger.lastHeartbeat = reading.lastHeartbeat;
  if (reading.status === 'Fault' && previousStatus !== 'Fault') charger.faultCount += 1;

  if (persist) await charger.save();

  if (previousStatus !== charger.status) {
    logger.info(`Charger ${charger.chargerId} status ${previousStatus} -> ${charger.status}`);
  }

  const conditions = alertService.conditionsFromHealth(reading, charger, config);
  const raised = [];
  for (const condition of conditions) {
    const alert = await alertService.raiseAlert({
      station: charger.station, charger: charger._id, ...condition
    });
    if (alert) raised.push(alert);
  }

  const activeTypes = conditions.map((c) => c.type);
  const clearable = ALL_CONDITION_TYPES.filter((type) => !activeTypes.includes(type));
  if (clearable.length) await alertService.clearAlerts(charger._id, clearable);

  return { charger, health, alerts: raised };
}

/** Roll charger health up to the station that owns them. */
async function refreshStationHealth(stationId) {
  const chargers = await Charger.find({ station: stationId }).lean();
  if (!chargers.length) return null;

  const average = Math.round(chargers.reduce((s, c) => s + c.healthScore, 0) / chargers.length);
  const offline = chargers.filter((c) => c.status === 'Offline').length;
  const faulty = chargers.filter((c) => c.status === 'Fault').length;

  let status = 'Operational';
  if (offline === chargers.length) status = 'Offline';
  else if (offline || faulty) status = 'Partial';
  if (chargers.every((c) => c.status === 'Maintenance')) status = 'Maintenance';

  const healthStatus = average >= 90 ? 'Healthy' : average >= 70 ? 'Warning' : average >= 40 ? 'Degraded' : 'Critical';

  return ChargingStation.findByIdAndUpdate(stationId, {
    healthScore: average,
    healthStatus,
    status,
    chargerCount: chargers.length,
    currentPowerConsumption: +chargers.reduce((s, c) => s + (c.power || 0), 0).toFixed(2)
  }, { new: true });
}

/** Aggregate numbers behind the dashboard cards. */
async function buildOverview(stationFilter = {}) {
  const stations = await ChargingStation.find(stationFilter).select('_id healthScore totalEnergyDelivered').lean();
  const stationIds = stations.map((s) => s._id);
  const chargers = await Charger.find({ station: { $in: stationIds } }).lean();

  const countBy = (status) => chargers.filter((c) => c.status === status).length;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

  const [activeSessions, energyToday, activeAlerts] = await Promise.all([
    ChargingSession.countDocuments({ station: { $in: stationIds }, status: 'Active' }),
    ChargingSession.aggregate([
      { $match: { station: { $in: stationIds }, startTime: { $gte: startOfDay } } },
      { $group: { _id: null, energy: { $sum: '$energyConsumed' } } }
    ]),
    Alert.countDocuments({ station: { $in: stationIds }, status: 'Active' })
  ]);

  const occupied = countBy('Charging');
  const utilisation = chargers.length ? Math.round((occupied / chargers.length) * 100) : 0;
  const systemHealth = chargers.length
    ? Math.round(chargers.reduce((s, c) => s + c.healthScore, 0) / chargers.length) : 100;

  return {
    totalStations: stations.length,
    totalChargers: chargers.length,
    available: countBy('Available'),
    occupied,
    idle: countBy('Idle'),
    offline: countBy('Offline'),
    faulty: countBy('Fault'),
    maintenance: countBy('Maintenance'),
    activeSessions,
    activeAlerts,
    energyToday: +((energyToday[0]?.energy) || 0).toFixed(2),
    utilisation,
    systemHealth,
    healthBreakdown: {
      Healthy: chargers.filter((c) => c.healthStatus === 'Healthy').length,
      Warning: chargers.filter((c) => c.healthStatus === 'Warning').length,
      Degraded: chargers.filter((c) => c.healthStatus === 'Degraded').length,
      Critical: chargers.filter((c) => c.healthStatus === 'Critical').length
    }
  };
}

/**
 * Sweep for chargers that stopped reporting. Called on a timer so a silent
 * charger is noticed even though it sends nothing.
 */
async function sweepStaleChargers() {
  const config = await getConfig();
  const cutoff = new Date(Date.now() - config.thresholds.heartbeat.offlineMs);
  const stale = await Charger.find({ lastHeartbeat: { $lt: cutoff }, status: { $ne: 'Offline' } });

  for (const charger of stale) {
    charger.status = 'Offline';
    charger.power = 0;
    await charger.save();
    await alertService.raiseAlert({
      station: charger.station, charger: charger._id, type: 'HEARTBEAT_LOST', severity: 'Critical',
      message: `No heartbeat from ${charger.chargerId}; marked offline`
    });
    await ChargerTelemetry.create({
      charger: charger._id, station: charger.station, voltage: 0, current: 0, power: 0,
      temperature: charger.temperature, status: 'Offline', errorCode: 'E-COMM-LOST',
      healthScore: 0, healthStatus: 'Critical', lastHeartbeat: charger.lastHeartbeat
    });
  }
  return stale.length;
}

module.exports = { evaluateCharger, refreshStationHealth, buildOverview, sweepStaleChargers };
