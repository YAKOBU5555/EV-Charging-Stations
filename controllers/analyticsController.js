const ChargingSession = require('../models/ChargingSession');
const ChargerTelemetry = require('../models/ChargerTelemetry');
const Alert = require('../models/Alert');
const Charger = require('../models/Charger');
const ChargingStation = require('../models/ChargingStation');
const { ok } = require('../utils/apiResponse');

/** Resolve the requested window, defaulting to the last 14 days. */
function dateRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 14 * 86400000);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

const GROUPINGS = {
  day: '%Y-%m-%d',
  week: '%Y-W%V',
  month: '%Y-%m'
};

/** GET /api/analytics/energy?groupBy=day|week|month */
async function energy(req, res, next) {
  try {
    const { from, to } = dateRange(req.query);
    const format = GROUPINGS[req.query.groupBy] || GROUPINGS.day;

    const series = await ChargingSession.aggregate([
      { $match: { startTime: { $gte: from, $lte: to } } },
      { $group: {
        _id: { $dateToString: { format, date: '$startTime' } },
        energy: { $sum: '$energyConsumed' },
        sessions: { $sum: 1 },
        avgDuration: { $avg: '$durationMinutes' }
      } },
      { $sort: { _id: 1 } }
    ]);

    return ok(res, {
      range: { from, to },
      series: series.map((s) => ({
        period: s._id,
        energy: +s.energy.toFixed(2),
        sessions: s.sessions,
        avgDuration: Math.round(s.avgDuration || 0)
      }))
    });
  } catch (err) { next(err); }
}

/** GET /api/analytics/utilization */
async function utilization(req, res, next) {
  try {
    const { from, to } = dateRange(req.query);
    const windowHours = Math.max(1, (to - from) / 3600000);

    const perCharger = await ChargingSession.aggregate([
      { $match: { startTime: { $gte: from, $lte: to } } },
      { $group: { _id: '$charger', minutes: { $sum: '$durationMinutes' }, sessions: { $sum: 1 }, energy: { $sum: '$energyConsumed' } } }
    ]);

    const chargers = await Charger.find({}).populate('station', 'stationId name').lean();
    const byId = Object.fromEntries(perCharger.map((p) => [p._id.toString(), p]));

    const telemetryAvg = await ChargerTelemetry.aggregate([
      { $match: { recordedAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$charger', avgTemp: { $avg: '$temperature' }, avgPower: { $avg: '$power' },
        offlineReadings: { $sum: { $cond: [{ $eq: ['$status', 'Offline'] }, 1, 0] } }, readings: { $sum: 1 } } }
    ]);
    const telemetryById = Object.fromEntries(telemetryAvg.map((t) => [t._id.toString(), t]));

    const rows = chargers.map((c) => {
      const usage = byId[c._id.toString()] || { minutes: 0, sessions: 0, energy: 0 };
      const t = telemetryById[c._id.toString()];
      const downtimeRatio = t && t.readings ? t.offlineReadings / t.readings : 0;
      return {
        chargerId: c.chargerId,
        station: c.station?.name || '—',
        utilisation: +Math.min(100, (usage.minutes / 60 / windowHours) * 100).toFixed(1),
        sessions: usage.sessions,
        energy: +usage.energy.toFixed(2),
        uptime: +((1 - downtimeRatio) * 100).toFixed(1),
        downtime: +(downtimeRatio * 100).toFixed(1),
        avgTemperature: t ? +t.avgTemp.toFixed(1) : null,
        avgPower: t ? +t.avgPower.toFixed(1) : null,
        healthScore: c.healthScore
      };
    }).sort((a, b) => b.utilisation - a.utilisation);

    return ok(res, { range: { from, to }, chargers: rows });
  } catch (err) { next(err); }
}

/** GET /api/analytics/faults */
async function faults(req, res, next) {
  try {
    const { from, to } = dateRange(req.query);
    const [byType, bySeverity, trend] = await Promise.all([
      Alert.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Alert.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      Alert.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    return ok(res, {
      range: { from, to },
      byType: byType.map((r) => ({ type: r._id, count: r.count })),
      bySeverity: bySeverity.map((r) => ({ severity: r._id, count: r.count })),
      trend: trend.map((r) => ({ period: r._id, count: r.count }))
    });
  } catch (err) { next(err); }
}

/** GET /api/analytics/stations */
async function stations(req, res, next) {
  try {
    const { from, to } = dateRange(req.query);
    const stationDocs = await ChargingStation.find({}).lean();

    const [sessionStats, alertStats] = await Promise.all([
      ChargingSession.aggregate([
        { $match: { startTime: { $gte: from, $lte: to } } },
        { $group: { _id: '$station', sessions: { $sum: 1 }, energy: { $sum: '$energyConsumed' }, avgDuration: { $avg: '$durationMinutes' } } }
      ]),
      Alert.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$station', faults: { $sum: 1 } } }
      ])
    ]);

    const sessionById = Object.fromEntries(sessionStats.map((s) => [String(s._id), s]));
    const alertById = Object.fromEntries(alertStats.map((a) => [String(a._id), a]));

    return ok(res, {
      range: { from, to },
      stations: stationDocs.map((s) => {
        const key = s._id.toString();
        return {
          stationId: s.stationId,
          name: s.name,
          healthScore: s.healthScore,
          status: s.status,
          energyDelivered: +((sessionById[key]?.energy) || 0).toFixed(2),
          sessions: sessionById[key]?.sessions || 0,
          avgDuration: Math.round(sessionById[key]?.avgDuration || 0),
          faults: alertById[key]?.faults || 0,
          uptime: s.status === 'Offline' ? 0 : s.healthScore
        };
      })
    });
  } catch (err) { next(err); }
}

module.exports = { energy, utilization, faults, stations };
