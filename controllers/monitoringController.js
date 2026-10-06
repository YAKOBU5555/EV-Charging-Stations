const Charger = require('../models/Charger');
const ChargingStation = require('../models/ChargingStation');
const SystemConfiguration = require('../models/SystemConfiguration');
const { getConfig, invalidateConfigCache } = require('../models/SystemConfiguration');
const healthMonitoring = require('../services/healthMonitoringService');
const telemetryService = require('../services/telemetryService');
const simulator = require('../services/simulatorService');
const { calculateHealth } = require('../utils/healthCalculator');
const { stationScope, chargerStationScope } = require('../middleware/roleMiddleware');
const { ok, ApiError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/** GET /api/monitoring/overview */
async function overview(req, res, next) {
  try {
    const stats = await healthMonitoring.buildOverview(stationScope(req.user));
    return ok(res, { stats, simulator: simulator.status() });
  } catch (err) { next(err); }
}

/** GET /api/monitoring/chargers/:id */
async function chargerHealth(req, res, next) {
  try {
    const charger = await Charger.findById(req.params.id).lean();
    if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');

    const config = await getConfig();
    const health = calculateHealth(charger, charger, config);
    const telemetry = await telemetryService.history(charger._id, { limit: req.query.limit || 60 });
    return ok(res, { charger, health, telemetry: telemetry.reverse() });
  } catch (err) { next(err); }
}

/** GET /api/monitoring/stations/:id */
async function stationHealth(req, res, next) {
  try {
    const station = await ChargingStation.findById(req.params.id).lean();
    if (!station) throw new ApiError(404, 'Station not found', 'STATION_NOT_FOUND');
    const chargers = await Charger.find({ station: station._id }).lean();
    return ok(res, {
      station,
      chargers,
      summary: {
        total: chargers.length,
        available: chargers.filter((c) => c.status === 'Available').length,
        charging: chargers.filter((c) => c.status === 'Charging').length,
        faulty: chargers.filter((c) => c.status === 'Fault').length,
        offline: chargers.filter((c) => c.status === 'Offline').length
      }
    });
  } catch (err) { next(err); }
}

/** GET /api/monitoring/map — lightweight payload for the Leaflet view. */
async function mapData(req, res, next) {
  try {
    const stations = await ChargingStation.find(stationScope(req.user))
      .select('stationId name location latitude longitude healthScore healthStatus status updatedAt').lean();

    const counts = await Charger.aggregate([
      { $match: { station: { $in: stations.map((s) => s._id) } } },
      { $group: { _id: { station: '$station', status: '$status' }, count: { $sum: 1 } } }
    ]);

    const byStation = {};
    counts.forEach((c) => {
      const key = c._id.station.toString();
      byStation[key] = byStation[key] || { total: 0 };
      byStation[key][c._id.status] = c.count;
      byStation[key].total += c.count;
    });

    return ok(res, { stations: stations.map((s) => ({ ...s, chargerStats: byStation[s._id.toString()] || { total: 0 } })) });
  } catch (err) { next(err); }
}

/** POST /api/monitoring/telemetry — endpoint real hardware would post to. */
async function ingestTelemetry(req, res, next) {
  try {
    const { chargerId } = req.body;
    const scope = chargerStationScope(req.user);
    const charger = await Charger.findOne({ chargerId: String(chargerId).toUpperCase(), ...scope });
    if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');

    const { telemetry, health, alerts } = await telemetryService.ingest(charger, req.body, { simulated: false });
    return ok(res, { telemetry, health, alertsRaised: alerts.length }, 'Telemetry recorded');
  } catch (err) { next(err); }
}

/** GET/PUT /api/monitoring/config */
async function getConfiguration(req, res, next) {
  try {
    return ok(res, { config: await getConfig({ fresh: true }) });
  } catch (err) { next(err); }
}

async function updateConfiguration(req, res, next) {
  try {
    const config = await SystemConfiguration.findOneAndUpdate(
      { key: 'default' },
      { $set: req.body },
      { new: true, upsert: true, runValidators: true }
    );
    invalidateConfigCache();
    logger.info('System configuration updated', { by: req.user._id.toString() });
    return ok(res, { config }, 'Configuration saved');
  } catch (err) { next(err); }
}

/** Simulator control: GET status, POST start, POST stop. */
async function simulatorStatus(req, res) {
  return ok(res, { simulator: simulator.status() });
}

async function simulatorStart(req, res, next) {
  try {
    const state = await simulator.start(req.body || {});
    await SystemConfiguration.updateOne({ key: 'default' }, { $set: { 'simulator.enabled': true } }, { upsert: true });
    invalidateConfigCache();
    return ok(res, { simulator: state }, 'Simulator started');
  } catch (err) { next(err); }
}

async function simulatorStop(req, res, next) {
  try {
    const state = simulator.stop();
    await SystemConfiguration.updateOne({ key: 'default' }, { $set: { 'simulator.enabled': false } }, { upsert: true });
    invalidateConfigCache();
    return ok(res, { simulator: state }, 'Simulator stopped');
  } catch (err) { next(err); }
}

module.exports = {
  overview, chargerHealth, stationHealth, mapData, ingestTelemetry,
  getConfiguration, updateConfiguration, simulatorStatus, simulatorStart, simulatorStop
};
