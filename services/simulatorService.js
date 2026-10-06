const Charger = require('../models/Charger');
const ChargingSession = require('../models/ChargingSession');
const { getConfig } = require('../models/SystemConfiguration');
const telemetryService = require('./telemetryService');
const healthMonitoring = require('./healthMonitoringService');
const socket = require('../sockets/monitoringSocket');
const logger = require('../utils/logger');

/**
 * Generates realistic charger readings when no hardware is connected. Every
 * reading it produces is tagged simulated: true so the UI can label the data.
 */
let timer = null;
let sweepTimer = null;
let startedAt = null;
let ticks = 0;

const FAULTS = [
  { errorCode: 'E-OVERHEAT', status: 'Fault', temperature: () => rand(78, 92) },
  { errorCode: 'E-OVER-CURRENT', status: 'Fault', current: () => rand(255, 300) },
  { errorCode: 'E-UNDER-VOLTAGE', status: 'Fault', voltage: () => rand(300, 372) },
  { errorCode: 'E-COMM-LOST', status: 'Offline' },
  { errorCode: 'E-HARDWARE', status: 'Fault' },
  { errorCode: 'E-GROUND-FAULT', status: 'Fault' }
];

const rand = (min, max) => +(Math.random() * (max - min) + min).toFixed(2);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Build one plausible reading for a charger in its current state. */
function buildReading(charger, faultProbability) {
  const injectFault = Math.random() < faultProbability;

  if (charger.status === 'Maintenance') {
    return { voltage: 0, current: 0, power: 0, temperature: rand(24, 32), status: 'Maintenance', errorCode: 'NONE' };
  }

  if (injectFault) {
    const fault = pick(FAULTS);
    return {
      voltage: fault.voltage ? fault.voltage() : rand(380, 450),
      current: fault.current ? fault.current() : rand(0, 120),
      power: rand(5, charger.maxPower),
      temperature: fault.temperature ? fault.temperature() : rand(45, 70),
      status: fault.status,
      errorCode: fault.errorCode,
      energyConsumed: 0
    };
  }

  // Recovering chargers come back to Available before they charge again.
  let status = charger.status;
  if (['Fault', 'Offline'].includes(charger.status)) {
    status = Math.random() < 0.4 ? 'Available' : charger.status;
  } else {
    const roll = Math.random();
    if (charger.status === 'Charging') status = roll < 0.8 ? 'Charging' : 'Available';
    else status = roll < 0.45 ? 'Charging' : (roll < 0.8 ? 'Available' : 'Idle');
  }

  if (status === 'Charging') {
    const power = rand(Math.min(7, charger.maxPower), charger.maxPower);
    const voltage = rand(390, 445);
    return {
      voltage,
      current: +Math.min(charger.maxCurrent, (power * 1000) / voltage).toFixed(2),
      power,
      temperature: rand(35, 62),
      status,
      errorCode: 'NONE',
      energyConsumed: +(power * (getIntervalSeconds() / 3600)).toFixed(3)
    };
  }

  return {
    voltage: rand(395, 440), current: 0, power: 0, temperature: rand(24, 40),
    status, errorCode: 'NONE', energyConsumed: 0
  };
}

let intervalMs = 5000;
const getIntervalSeconds = () => intervalMs / 1000;

/** Open a session when a charger starts charging, close it when it stops. */
async function reconcileSession(charger, reading) {
  const open = await ChargingSession.findOne({ charger: charger._id, status: 'Active' });

  if (reading.status === 'Charging' && !open) {
    const session = await ChargingSession.create({
      sessionId: `SES-${Date.now().toString(36).toUpperCase()}`,
      station: charger.station,
      charger: charger._id,
      vehicleId: `EV-${Math.floor(1000 + Math.random() * 9000)}`,
      startTime: new Date(),
      initialEnergy: charger.totalEnergyDelivered,
      finalEnergy: charger.totalEnergyDelivered,
      chargingPower: reading.power,
      status: 'Active'
    });
    socket.emit('session:started', { sessionId: session.sessionId, chargerId: charger.chargerId });
    return;
  }

  if (open && reading.status !== 'Charging') {
    open.endTime = new Date();
    open.finalEnergy = charger.totalEnergyDelivered + (reading.energyConsumed || 0);
    open.chargingPower = reading.power || open.chargingPower;
    open.status = ['Fault', 'Offline'].includes(reading.status) ? 'Interrupted' : 'Completed';
    await open.save();
    await Charger.updateOne({ _id: charger._id }, { $inc: { totalSessions: 1 } });
    socket.emit('session:ended', { sessionId: open.sessionId, chargerId: charger.chargerId, status: open.status });
  }
}

async function tick() {
  try {
    const config = await getConfig();
    const faultProbability = config.simulator.faultProbability ?? 0.05;
    const chargers = await Charger.find({});
    ticks += 1;

    for (const charger of chargers) {
      const reading = buildReading(charger, faultProbability);
      await reconcileSession(charger, reading);
      await telemetryService.ingest(charger, reading, { simulated: true });
    }
    socket.emit('simulator:tick', { at: new Date(), chargers: chargers.length, ticks });
  } catch (err) {
    logger.error('Simulator tick failed', { message: err.message });
  }
}

function isRunning() {
  return timer !== null;
}

async function start(options = {}) {
  if (timer) return status();
  const config = await getConfig();
  intervalMs = Number(options.intervalMs) || config.simulator.intervalMs || Number(process.env.SIMULATOR_INTERVAL_MS) || 5000;

  timer = setInterval(tick, intervalMs);
  sweepTimer = setInterval(() => healthMonitoring.sweepStaleChargers().catch(() => {}), Math.max(intervalMs * 4, 30000));
  startedAt = new Date();
  logger.info(`Telemetry simulator started (every ${intervalMs}ms)`);
  socket.emit('simulator:state', status());
  tick();
  return status();
}

function stop() {
  if (timer) clearInterval(timer);
  if (sweepTimer) clearInterval(sweepTimer);
  timer = null; sweepTimer = null; startedAt = null;
  logger.info('Telemetry simulator stopped');
  socket.emit('simulator:state', status());
  return status();
}

function status() {
  return { running: isRunning(), startedAt, intervalMs, ticks };
}

module.exports = { start, stop, status, isRunning, tick, buildReading };
