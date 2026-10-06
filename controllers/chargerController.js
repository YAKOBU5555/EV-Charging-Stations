const Charger = require('../models/Charger');
const ChargingStation = require('../models/ChargingStation');
const ChargerTelemetry = require('../models/ChargerTelemetry');
const Alert = require('../models/Alert');
const { ok, created, ApiError } = require('../utils/apiResponse');
const { chargerStationScope } = require('../middleware/roleMiddleware');
const healthMonitoring = require('../services/healthMonitoringService');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const { station, status, healthStatus, search, limit = 200 } = req.query;
    const filter = { ...chargerStationScope(req.user) };
    if (station) filter.station = station;
    if (status) filter.status = status;
    if (healthStatus) filter.healthStatus = healthStatus;
    if (search) filter.chargerId = new RegExp(search, 'i');

    const chargers = await Charger.find(filter)
      .populate('station', 'stationId name location')
      .sort({ chargerId: 1 })
      .limit(Number(limit))
      .lean();
    return ok(res, { chargers, total: chargers.length });
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const charger = await Charger.findById(req.params.id).populate('station', 'stationId name location').lean();
    if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');

    const [telemetry, alerts] = await Promise.all([
      ChargerTelemetry.find({ charger: charger._id }).sort({ recordedAt: -1 }).limit(50).lean(),
      Alert.find({ charger: charger._id }).sort({ createdAt: -1 }).limit(10).lean()
    ]);
    return ok(res, { charger, telemetry: telemetry.reverse(), alerts });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const station = await ChargingStation.findById(req.body.station);
    if (!station) throw new ApiError(404, 'Station not found', 'STATION_NOT_FOUND');

    const charger = await Charger.create(req.body);
    await healthMonitoring.refreshStationHealth(station._id);
    logger.info('Charger created', { chargerId: charger.chargerId, by: req.user._id.toString() });
    return created(res, { charger }, 'Charger added');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const charger = await Charger.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');
    await healthMonitoring.refreshStationHealth(charger.station);
    return ok(res, { charger }, 'Charger updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const charger = await Charger.findByIdAndDelete(req.params.id);
    if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');
    await healthMonitoring.refreshStationHealth(charger.station);
    return ok(res, {}, 'Charger deleted');
  } catch (err) { next(err); }
}

module.exports = { list, detail, create, update, remove };
