const ChargingStation = require('../models/ChargingStation');
const Charger = require('../models/Charger');
const Alert = require('../models/Alert');
const { ok, created, ApiError } = require('../utils/apiResponse');
const { stationScope } = require('../middleware/roleMiddleware');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const filter = { ...stationScope(req.user) };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { stationId: new RegExp(search, 'i') },
        { location: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [stations, total] = await Promise.all([
      ChargingStation.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
      ChargingStation.countDocuments(filter)
    ]);

    // Attach a live charger breakdown so the map and table need only one call.
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

    return ok(res, {
      stations: stations.map((s) => ({ ...s, chargerStats: byStation[s._id.toString()] || { total: 0 } })),
      total,
      page: Number(page)
    });
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const station = await ChargingStation.findById(req.params.id).lean();
    if (!station) throw new ApiError(404, 'Station not found', 'STATION_NOT_FOUND');

    const [chargers, alerts] = await Promise.all([
      Charger.find({ station: station._id }).sort({ chargerId: 1 }).lean(),
      Alert.find({ station: station._id, status: 'Active' }).sort({ createdAt: -1 }).limit(10).lean()
    ]);
    return ok(res, { station, chargers, alerts });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const station = await ChargingStation.create(req.body);
    logger.info('Station created', { stationId: station.stationId, by: req.user._id.toString() });
    return created(res, { station }, 'Station created');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const station = await ChargingStation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!station) throw new ApiError(404, 'Station not found', 'STATION_NOT_FOUND');
    return ok(res, { station }, 'Station updated');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const station = await ChargingStation.findById(req.params.id);
    if (!station) throw new ApiError(404, 'Station not found', 'STATION_NOT_FOUND');
    await Charger.deleteMany({ station: station._id });
    await station.deleteOne();
    logger.info('Station deleted', { stationId: station.stationId, by: req.user._id.toString() });
    return ok(res, {}, 'Station and its chargers deleted');
  } catch (err) { next(err); }
}

module.exports = { list, detail, create, update, remove };
