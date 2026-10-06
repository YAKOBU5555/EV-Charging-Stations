/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const User = require('../models/User');
const ChargingStation = require('../models/ChargingStation');
const Charger = require('../models/Charger');
const ChargerTelemetry = require('../models/ChargerTelemetry');
const Alert = require('../models/Alert');
const ChargingSession = require('../models/ChargingSession');
const Maintenance = require('../models/Maintenance');
const SystemConfiguration = require('../models/SystemConfiguration');

const rand = (min, max) => +(Math.random() * (max - min) + min).toFixed(2);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysAhead = (d) => new Date(Date.now() + d * 86400000);

const STATIONS = [
  { stationId: 'STN-HYD-01', name: 'Hitec City Hub', location: 'Madhapur, Hyderabad', address: 'Cyber Towers Road, Madhapur, Hyderabad 500081', latitude: 17.4483, longitude: 78.3915 },
  { stationId: 'STN-HYD-02', name: 'Gachibowli Expressway Point', location: 'Gachibowli, Hyderabad', address: 'ORR Service Road, Gachibowli, Hyderabad 500032', latitude: 17.4401, longitude: 78.3489 },
  { stationId: 'STN-BLR-01', name: 'Whitefield Fast Charge', location: 'Whitefield, Bengaluru', address: 'ITPL Main Road, Whitefield, Bengaluru 560066', latitude: 12.9698, longitude: 77.7500 },
  { stationId: 'STN-PNQ-01', name: 'Hinjewadi Phase 2', location: 'Hinjewadi, Pune', address: 'Rajiv Gandhi Infotech Park, Pune 411057', latitude: 18.5908, longitude: 73.7381 },
  { stationId: 'STN-DEL-01', name: 'Dwarka Sector 21 Plaza', location: 'Dwarka, New Delhi', address: 'Sector 21 Metro Station, New Delhi 110077', latitude: 28.5523, longitude: 77.0586 },
  { stationId: 'STN-MUM-01', name: 'BKC Charging Court', location: 'Bandra Kurla Complex, Mumbai', address: 'G Block, BKC, Mumbai 400051', latitude: 19.0662, longitude: 72.8697 }
];

const CONNECTORS = [
  { connectorType: 'CCS2', chargingStandard: 'DC Fast', maxPower: 60, maxCurrent: 150 },
  { connectorType: 'CCS2', chargingStandard: 'Ultra Fast DC', maxPower: 150, maxCurrent: 250 },
  { connectorType: 'CHAdeMO', chargingStandard: 'DC Fast', maxPower: 50, maxCurrent: 125 },
  { connectorType: 'Type2', chargingStandard: 'AC Level 2', maxPower: 22, maxCurrent: 32 },
  { connectorType: 'Bharat AC-001', chargingStandard: 'AC Level 1', maxPower: 10, maxCurrent: 15 }
];

const STATUSES = ['Available', 'Charging', 'Charging', 'Idle', 'Available', 'Offline', 'Fault', 'Maintenance'];

async function run() {
  await connectDatabase();
  console.log('Clearing existing collections...');
  await Promise.all([
    User.deleteMany({}), ChargingStation.deleteMany({}), Charger.deleteMany({}),
    ChargerTelemetry.deleteMany({}), Alert.deleteMany({}), ChargingSession.deleteMany({}),
    Maintenance.deleteMany({}), SystemConfiguration.deleteMany({})
  ]);

  await SystemConfiguration.create({ key: 'default' });

  // --- Stations ------------------------------------------------------------
  const stations = [];
  for (const base of STATIONS) {
    stations.push(await ChargingStation.create({
      ...base,
      installationDate: daysAgo(rand(200, 900)),
      lastMaintenanceDate: daysAgo(rand(10, 80)),
      nextMaintenanceDate: daysAhead(rand(3, 60)),
      totalEnergyDelivered: rand(12000, 90000)
    }));
  }

  // --- Chargers ------------------------------------------------------------
  const chargers = [];
  for (const station of stations) {
    const count = Math.floor(rand(3, 6.99));
    for (let i = 1; i <= count; i += 1) {
      const spec = pick(CONNECTORS);
      const status = pick(STATUSES);
      const charging = status === 'Charging';
      const voltage = status === 'Offline' ? 0 : rand(385, 448);
      const current = charging ? rand(40, spec.maxCurrent) : 0;

      chargers.push(await Charger.create({
        chargerId: `${station.stationId}-C${String(i).padStart(2, '0')}`,
        station: station._id,
        ...spec,
        voltage,
        current,
        power: charging ? +((voltage * current) / 1000).toFixed(2) : 0,
        temperature: status === 'Fault' ? rand(76, 88) : rand(24, 58),
        status,
        errorCode: status === 'Fault' ? pick(['E-OVERHEAT', 'E-HARDWARE', 'E-GROUND-FAULT']) : 'NONE',
        healthScore: status === 'Fault' ? Math.round(rand(20, 45)) : status === 'Offline' ? Math.round(rand(0, 35)) : Math.round(rand(72, 100)),
        healthStatus: status === 'Fault' ? 'Critical' : status === 'Offline' ? 'Critical' : 'Healthy',
        firmwareVersion: pick(['1.4.2', '2.0.1', '2.3.0', '3.1.5']),
        lastHeartbeat: status === 'Offline' ? daysAgo(0.02) : new Date(),
        lastMaintenanceDate: daysAgo(rand(15, 120)),
        nextMaintenanceDate: daysAhead(rand(-5, 90)),
        totalEnergyDelivered: rand(500, 9000),
        totalSessions: Math.round(rand(20, 400)),
        faultCount: Math.round(rand(0, 12))
      }));
    }
    await ChargingStation.updateOne({ _id: station._id }, { chargerCount: count });
  }
  console.log(`Created ${stations.length} stations and ${chargers.length} chargers`);

  // --- Users ---------------------------------------------------------------
  const people = [
    { name: 'Asha Rao', email: 'admin@evmonitor.com', role: 'admin', password: 'Admin@12345' },
    { name: 'Vikram Shetty', email: 'operator@evmonitor.com', role: 'operator', password: 'Operator@123', assignedStations: [stations[0]._id, stations[1]._id] },
    { name: 'Neha Iyer', email: 'viewer@evmonitor.com', role: 'viewer', password: 'Viewer@12345' }
  ];
  for (const person of people) {
    const user = new User({ ...person, passwordHash: 'placeholder' });
    await user.setPassword(person.password);
    await user.save();
  }
  console.log('Created 3 users (admin / operator / viewer)');

  // --- Sessions ------------------------------------------------------------
  const sessions = [];
  for (let day = 13; day >= 0; day -= 1) {
    const perDay = Math.floor(rand(6, 18));
    for (let i = 0; i < perDay; i += 1) {
      const charger = pick(chargers);
      const start = new Date(daysAgo(day).setHours(Math.floor(rand(6, 22)), Math.floor(rand(0, 59))));
      const durationMin = Math.round(rand(18, 130));
      const end = new Date(start.getTime() + durationMin * 60000);
      const initial = rand(100, 2000);
      const energy = +(charger.maxPower * (durationMin / 60) * rand(0.45, 0.9)).toFixed(2);

      sessions.push({
        sessionId: `SES-${day}-${i}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        station: charger.station,
        charger: charger._id,
        vehicleId: `${pick(['TS', 'KA', 'MH', 'DL'])}-${Math.floor(rand(10, 99))}-EV-${Math.floor(rand(1000, 9999))}`,
        startTime: start,
        endTime: end,
        durationMinutes: durationMin,
        initialEnergy: initial,
        finalEnergy: +(initial + energy).toFixed(2),
        energyConsumed: energy,
        chargingPower: +rand(7, charger.maxPower).toFixed(2),
        status: Math.random() < 0.05 ? 'Failed' : 'Completed'
      });
    }
  }
  // A few sessions still running right now.
  chargers.filter((c) => c.status === 'Charging').forEach((charger, i) => {
    const start = new Date(Date.now() - rand(5, 55) * 60000);
    sessions.push({
      sessionId: `SES-LIVE-${i}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      station: charger.station, charger: charger._id,
      vehicleId: `TS-09-EV-${Math.floor(rand(1000, 9999))}`,
      startTime: start, initialEnergy: 500, finalEnergy: 500 + rand(2, 40),
      chargingPower: charger.power, status: 'Active'
    });
  });
  await ChargingSession.insertMany(sessions);
  console.log(`Created ${sessions.length} charging sessions`);

  // --- Telemetry -----------------------------------------------------------
  const telemetry = [];
  for (const charger of chargers) {
    for (let i = 60; i >= 0; i -= 1) {
      const charging = charger.status === 'Charging' && i < 30;
      const voltage = charger.status === 'Offline' && i < 10 ? 0 : rand(385, 448);
      const current = charging ? rand(30, charger.maxCurrent) : 0;
      telemetry.push({
        charger: charger._id, station: charger.station,
        voltage, current,
        power: +((voltage * current) / 1000).toFixed(2),
        temperature: rand(24, charger.status === 'Fault' ? 86 : 62),
        energyConsumed: charging ? rand(0.05, 0.9) : 0,
        status: charger.status,
        errorCode: charger.errorCode,
        connectorStatus: charging ? 'Connected' : 'Disconnected',
        healthScore: charger.healthScore,
        healthStatus: charger.healthStatus,
        simulated: true,
        recordedAt: new Date(Date.now() - i * 5 * 60000)
      });
    }
  }
  await ChargerTelemetry.insertMany(telemetry);
  console.log(`Created ${telemetry.length} telemetry records`);

  // --- Alerts --------------------------------------------------------------
  const alertSeeds = [];
  chargers.forEach((charger, index) => {
    if (charger.status === 'Fault') {
      alertSeeds.push({ type: 'HARDWARE_FAULT', severity: 'Critical', message: `${charger.chargerId} reported ${charger.errorCode}`, charger, status: 'Active' });
    }
    if (charger.status === 'Offline') {
      alertSeeds.push({ type: 'CHARGER_OFFLINE', severity: 'Critical', message: `${charger.chargerId} has gone offline`, charger, status: 'Active' });
    }
    if (index % 4 === 0) {
      alertSeeds.push({ type: 'HIGH_TEMPERATURE', severity: 'Warning', message: `${charger.chargerId} exceeded 62\u00B0C during a session`, charger, status: pick(['Resolved', 'Acknowledged']), value: rand(62, 74) });
    }
    if (index % 7 === 0) {
      alertSeeds.push({ type: 'MAINTENANCE_DUE', severity: 'Information', message: `${charger.chargerId} is due for its quarterly inspection`, charger, status: 'Active' });
    }
  });

  await Alert.insertMany(alertSeeds.map((a, i) => ({
    alertId: `ALT-SEED-${String(i).padStart(4, '0')}`,
    station: a.charger.station,
    charger: a.charger._id,
    type: a.type, severity: a.severity, message: a.message, value: a.value,
    status: a.status,
    acknowledgedAt: a.status !== 'Active' ? daysAgo(rand(0.1, 5)) : undefined,
    resolvedAt: a.status === 'Resolved' ? daysAgo(rand(0.1, 3)) : undefined,
    createdAt: daysAgo(rand(0.1, 12))
  })));
  console.log(`Created ${alertSeeds.length} alerts`);

  // --- Maintenance ---------------------------------------------------------
  const technicians = ['R. Krishnan', 'S. Fernandes', 'A. Deshmukh', 'M. Banerjee'];
  const maintenance = [];
  stations.forEach((station, i) => {
    const stationChargers = chargers.filter((c) => String(c.station) === String(station._id));
    maintenance.push({
      maintenanceId: `MNT-${String(i * 3 + 1).padStart(4, '0')}`,
      station: station._id, charger: stationChargers[0]?._id,
      type: 'Preventive', description: 'Quarterly connector and cable inspection',
      technician: pick(technicians), scheduledDate: daysAhead(rand(2, 20)), status: 'Scheduled'
    });
    maintenance.push({
      maintenanceId: `MNT-${String(i * 3 + 2).padStart(4, '0')}`,
      station: station._id, charger: stationChargers[1]?._id,
      type: 'Corrective', description: 'Replace cooling fan reported by thermal alert',
      technician: pick(technicians), scheduledDate: daysAgo(rand(2, 9)), status: 'In Progress',
      notes: 'Spare fan ordered, awaiting delivery'
    });
    maintenance.push({
      maintenanceId: `MNT-${String(i * 3 + 3).padStart(4, '0')}`,
      station: station._id, charger: stationChargers[2]?._id,
      type: 'Firmware Upgrade', description: 'Upgrade charge controller firmware to 3.1.5',
      technician: pick(technicians), scheduledDate: daysAgo(rand(15, 45)),
      completionDate: daysAgo(rand(10, 14)), status: 'Completed', notes: 'Completed without downtime'
    });
  });
  await Maintenance.insertMany(maintenance);
  console.log(`Created ${maintenance.length} maintenance records`);

  console.log('\nSeed complete. Sign in with:');
  console.log('  admin@evmonitor.com    / Admin@12345');
  console.log('  operator@evmonitor.com / Operator@123');
  console.log('  viewer@evmonitor.com   / Viewer@12345');

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
