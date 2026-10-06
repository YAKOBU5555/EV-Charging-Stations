const ChargingSession = require('../models/ChargingSession');
const Charger = require('../models/Charger');
const { ok, created, ApiError } = require('../utils/apiResponse');
const { chargerStationScope } = require('../middleware/roleMiddleware');
const socket = require('../sockets/monitoringSocket');

async function list(req, res, next) {
  try {
    const filter = { ...chargerStationScope(req.user) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.station) filter.station = req.query.station;
    if (req.query.charger) filter.charger = req.query.charger;
    if (req.query.from || req.query.to) {
      filter.startTime = {};
      if (req.query.from) filter.startTime.$gte = new Date(req.query.from);
      if (req.query.to) filter.startTime.$lte = new Date(req.query.to);
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [sessions, total] = await Promise.all([
      ChargingSession.find(filter)
        .populate('station', 'stationId name')
        .populate('charger', 'chargerId connectorType')
        .sort({ startTime: -1 }).limit(limit).lean(),
      ChargingSession.countDocuments(filter)
    ]);
    return ok(res, { sessions, total });
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const session = await ChargingSession.findById(req.params.id)
      .populate('station', 'stationId name location')
      .populate('charger', 'chargerId connectorType maxPower');
    if (!session) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
    return ok(res, { session });
  } catch (err) { next(err); }
}

/** POST /api/sessions — start a session manually (operators and admins). */
async function start(req, res, next) {
  try {
    const charger = await Charger.findById(req.body.charger);
    if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');
    if (['Offline', 'Fault', 'Maintenance'].includes(charger.status)) {
      throw new ApiError(409, `Charger is ${charger.status.toLowerCase()} and cannot start a session`, 'CHARGER_UNAVAILABLE');
    }
    const existing = await ChargingSession.findOne({ charger: charger._id, status: 'Active' });
    if (existing) throw new ApiError(409, 'This charger already has an active session', 'SESSION_ACTIVE');

    const session = await ChargingSession.create({
      sessionId: `SES-${Date.now().toString(36).toUpperCase()}`,
      station: charger.station,
      charger: charger._id,
      vehicleId: req.body.vehicleId,
      driverId: req.body.driverId,
      startTime: new Date(),
      initialEnergy: charger.totalEnergyDelivered,
      finalEnergy: charger.totalEnergyDelivered,
      chargingPower: charger.power,
      status: 'Active'
    });
    socket.emit('session:started', { sessionId: session.sessionId, chargerId: charger.chargerId });
    return created(res, { session }, 'Session started');
  } catch (err) { next(err); }
}

/** PUT /api/sessions/:id/stop */
async function stop(req, res, next) {
  try {
    const session = await ChargingSession.findById(req.params.id);
    if (!session) throw new ApiError(404, 'Session not found', 'SESSION_NOT_FOUND');
    if (session.status !== 'Active') throw new ApiError(400, 'This session has already ended', 'SESSION_NOT_ACTIVE');

    const charger = await Charger.findById(session.charger);
    session.endTime = new Date();
    session.finalEnergy = charger ? charger.totalEnergyDelivered : session.finalEnergy;
    session.status = req.body.status || 'Completed';
    await session.save();
    socket.emit('session:ended', { sessionId: session.sessionId, status: session.status });
    return ok(res, { session }, 'Session ended');
  } catch (err) { next(err); }
}

module.exports = { list, detail, start, stop };
