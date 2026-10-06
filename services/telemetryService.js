const ChargerTelemetry = require('../models/ChargerTelemetry');
const Charger = require('../models/Charger');
const healthMonitoring = require('./healthMonitoringService');
const socket = require('../sockets/monitoringSocket');
const { ApiError } = require('../utils/apiResponse');

/**
 * Single entry point for every reading, whether it comes from real hardware
 * (POST /api/monitoring/telemetry) or from the simulator:
 * store -> evaluate health -> alert -> broadcast.
 */
async function ingest(chargerRef, reading, { simulated = false } = {}) {
  const charger = typeof chargerRef === 'string'
    ? await Charger.findOne({ chargerId: chargerRef.toUpperCase() })
    : chargerRef;
  if (!charger) throw new ApiError(404, 'Charger not found', 'CHARGER_NOT_FOUND');

  const normalised = {
    voltage: Number(reading.voltage) || 0,
    current: Number(reading.current) || 0,
    power: Number(reading.power) || 0,
    temperature: Number(reading.temperature) || 0,
    energyConsumed: Number(reading.energyConsumed) || 0,
    status: reading.status || charger.status,
    errorCode: reading.errorCode || 'NONE',
    connectorStatus: reading.connectorStatus || (reading.status === 'Charging' ? 'Connected' : 'Disconnected'),
    lastHeartbeat: reading.lastHeartbeat ? new Date(reading.lastHeartbeat) : new Date()
  };

  const { health, alerts } = await healthMonitoring.evaluateCharger(charger, normalised);

  const telemetry = await ChargerTelemetry.create({
    ...normalised,
    charger: charger._id,
    station: charger.station,
    healthScore: health.score,
    healthStatus: health.status,
    simulated,
    recordedAt: new Date()
  });

  if (normalised.energyConsumed) {
    await Charger.updateOne({ _id: charger._id }, { $inc: { totalEnergyDelivered: normalised.energyConsumed } });
  }

  const station = await healthMonitoring.refreshStationHealth(charger.station);

  const payload = {
    chargerId: charger.chargerId,
    _id: charger._id,
    station: station ? { _id: station._id, stationId: station.stationId, healthScore: station.healthScore, healthStatus: station.healthStatus, status: station.status } : null,
    status: charger.status,
    healthScore: health.score,
    healthStatus: health.status,
    reasons: health.reasons,
    voltage: normalised.voltage,
    current: normalised.current,
    power: normalised.power,
    temperature: normalised.temperature,
    errorCode: normalised.errorCode,
    simulated,
    updatedAt: telemetry.recordedAt
  };

  socket.emit('charger:update', payload);
  if (station) socket.emit('station:update', payload.station);
  socket.emit('stats:refresh', { at: telemetry.recordedAt });

  return { telemetry, health, alerts, charger };
}

async function history(chargerId, { limit = 100, from, to } = {}) {
  const filter = { charger: chargerId };
  if (from || to) {
    filter.recordedAt = {};
    if (from) filter.recordedAt.$gte = new Date(from);
    if (to) filter.recordedAt.$lte = new Date(to);
  }
  return ChargerTelemetry.find(filter).sort({ recordedAt: -1 }).limit(Math.min(Number(limit) || 100, 1000)).lean();
}

module.exports = { ingest, history };
