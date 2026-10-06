const Alert = require('../models/Alert');
const { ok, created, ApiError } = require('../utils/apiResponse');
const { stationScope } = require('../middleware/roleMiddleware');
const ChargingStation = require('../models/ChargingStation');
const alertService = require('../services/alertService');
const socket = require('../sockets/monitoringSocket');
const logger = require('../utils/logger');

async function scopedFilter(user, query) {
  const filter = {};
  const scope = stationScope(user);
  if (scope._id) {
    const stations = await ChargingStation.find(scope).select('_id').lean();
    filter.station = { $in: stations.map((s) => s._id) };
  }
  if (query.status) filter.status = query.status;
  if (query.severity) filter.severity = query.severity;
  if (query.type) filter.type = query.type;
  if (query.station) filter.station = query.station;
  if (query.charger) filter.charger = query.charger;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  return filter;
}

async function list(req, res, next) {
  try {
    const filter = await scopedFilter(req.user, req.query);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .populate('station', 'stationId name')
        .populate('charger', 'chargerId')
        .populate('acknowledgedBy', 'name')
        .sort({ createdAt: -1 }).limit(limit).lean(),
      Alert.countDocuments(filter)
    ]);
    return ok(res, { alerts, total });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const alert = await Alert.create({ alertId: alertService.makeAlertId(), ...req.body });
    socket.emit('alert:new', alert);
    return created(res, { alert }, 'Alert created');
  } catch (err) { next(err); }
}

async function acknowledge(req, res, next) {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) throw new ApiError(404, 'Alert not found', 'ALERT_NOT_FOUND');
    if (alert.status !== 'Active') throw new ApiError(400, 'Only active alerts can be acknowledged', 'ALERT_NOT_ACTIVE');

    alert.status = 'Acknowledged';
    alert.acknowledgedBy = req.user._id;
    alert.acknowledgedAt = new Date();
    await alert.save();
    logger.info('Alert acknowledged', { alertId: alert.alertId, by: req.user._id.toString() });
    socket.emit('alert:updated', alert);
    return ok(res, { alert }, 'Alert acknowledged');
  } catch (err) { next(err); }
}

async function resolve(req, res, next) {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) throw new ApiError(404, 'Alert not found', 'ALERT_NOT_FOUND');

    alert.status = 'Resolved';
    alert.resolvedBy = req.user._id;
    alert.resolvedAt = new Date();
    await alert.save();
    socket.emit('alert:updated', alert);
    return ok(res, { alert }, 'Alert resolved');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) throw new ApiError(404, 'Alert not found', 'ALERT_NOT_FOUND');
    if (alert.status === 'Active') {
      throw new ApiError(400, 'Resolve the alert before deleting it', 'ALERT_ACTIVE');
    }
    await alert.deleteOne();
    return ok(res, {}, 'Alert deleted');
  } catch (err) { next(err); }
}

module.exports = { list, create, acknowledge, resolve, remove };
