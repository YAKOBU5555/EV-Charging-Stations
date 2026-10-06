const Maintenance = require('../models/Maintenance');
const Charger = require('../models/Charger');
const ChargingStation = require('../models/ChargingStation');
const { ok, created, ApiError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.station) filter.station = req.query.station;
    if (req.query.charger) filter.charger = req.query.charger;

    const records = await Maintenance.find(filter)
      .populate('station', 'stationId name')
      .populate('charger', 'chargerId')
      .sort({ scheduledDate: 1 }).lean();

    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86400000);
    return ok(res, {
      maintenance: records,
      buckets: {
        upcoming: records.filter((r) => r.status === 'Scheduled' && new Date(r.scheduledDate) >= now && new Date(r.scheduledDate) <= soon),
        overdue: records.filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled' && new Date(r.scheduledDate) < now),
        completed: records.filter((r) => r.status === 'Completed')
      }
    });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const station = await ChargingStation.findById(req.body.station);
    if (!station) throw new ApiError(404, 'Station not found', 'STATION_NOT_FOUND');

    const record = await Maintenance.create({
      maintenanceId: `MNT-${Date.now().toString(36).toUpperCase()}`,
      ...req.body
    });
    if (record.charger) {
      await Charger.updateOne({ _id: record.charger }, { nextMaintenanceDate: record.scheduledDate });
    } else {
      await ChargingStation.updateOne({ _id: station._id }, { nextMaintenanceDate: record.scheduledDate });
    }
    logger.info('Maintenance scheduled', { maintenanceId: record.maintenanceId, by: req.user._id.toString() });
    return created(res, { maintenance: record }, 'Maintenance scheduled');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const record = await Maintenance.findById(req.params.id);
    if (!record) throw new ApiError(404, 'Maintenance record not found', 'MAINTENANCE_NOT_FOUND');

    Object.assign(record, req.body);
    if (record.status === 'Completed' && !record.completionDate) record.completionDate = new Date();
    await record.save();

    // Completing maintenance resets the charger's maintenance clock.
    if (record.status === 'Completed' && record.charger) {
      await Charger.updateOne({ _id: record.charger }, {
        lastMaintenanceDate: record.completionDate,
        nextMaintenanceDate: new Date(record.completionDate.getTime() + 90 * 86400000),
        status: 'Available',
        errorCode: 'NONE'
      });
    }
    logger.info('Maintenance updated', { maintenanceId: record.maintenanceId, status: record.status });
    return ok(res, { maintenance: record }, 'Maintenance updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const record = await Maintenance.findByIdAndDelete(req.params.id);
    if (!record) throw new ApiError(404, 'Maintenance record not found', 'MAINTENANCE_NOT_FOUND');
    return ok(res, {}, 'Maintenance record deleted');
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
