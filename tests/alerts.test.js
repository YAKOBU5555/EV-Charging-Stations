const { startTestDatabase, stopTestDatabase, clearCollections } = require('./setup');
const { app, request, tokenFor, makeStation, makeCharger } = require('./helpers');
const Alert = require('../models/Alert');
const ChargingSession = require('../models/ChargingSession');
const telemetryService = require('../services/telemetryService');

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearCollections);

describe('Alert generation and session flow', () => {
  test('an overheating reading raises a critical alert', async () => {
    const station = await makeStation();
    const charger = await makeCharger(station);

    await telemetryService.ingest(charger, {
      voltage: 420, current: 100, power: 42, temperature: 88, status: 'Fault', errorCode: 'E-OVERHEAT'
    }, { simulated: true });

    const alerts = await Alert.find({ charger: charger._id });
    const types = alerts.map((a) => a.type);
    expect(types).toContain('HIGH_TEMPERATURE');
    expect(alerts.find((a) => a.type === 'HIGH_TEMPERATURE').severity).toBe('Critical');
  });

  test('identical alerts are not duplicated while still open', async () => {
    const station = await makeStation();
    const charger = await makeCharger(station);
    const reading = { voltage: 420, current: 100, power: 42, temperature: 88, status: 'Fault', errorCode: 'NONE' };

    await telemetryService.ingest(charger, reading, { simulated: true });
    await telemetryService.ingest(charger, reading, { simulated: true });

    expect(await Alert.countDocuments({ charger: charger._id, type: 'HIGH_TEMPERATURE' })).toBe(1);
  });

  test('an operator can acknowledge an alert', async () => {
    const { token } = await tokenFor('operator');
    const station = await makeStation();
    const charger = await makeCharger(station);
    const alert = await Alert.create({
      alertId: 'ALT-TEST-1', station: station._id, charger: charger._id,
      type: 'HIGH_TEMPERATURE', severity: 'Warning', message: 'Too warm'
    });

    const res = await request(app).put(`/api/alerts/${alert._id}/acknowledge`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.alert.status).toBe('Acknowledged');
  });

  test('a viewer cannot acknowledge alerts', async () => {
    const { token } = await tokenFor('viewer');
    const station = await makeStation();
    const alert = await Alert.create({
      alertId: 'ALT-TEST-2', station: station._id, type: 'MAINTENANCE_DUE', severity: 'Information', message: 'Due soon'
    });
    const res = await request(app).put(`/api/alerts/${alert._id}/acknowledge`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('starting a session on a faulted charger is refused', async () => {
    const { token } = await tokenFor('admin');
    const station = await makeStation();
    const charger = await makeCharger(station, { status: 'Fault' });

    const res = await request(app).post('/api/sessions').set('Authorization', `Bearer ${token}`)
      .send({ charger: charger._id, vehicleId: 'TS-09-EV-1234' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CHARGER_UNAVAILABLE');
  });

  test('a session can be started and stopped', async () => {
    const { token } = await tokenFor('admin');
    const auth = { Authorization: `Bearer ${token}` };
    const station = await makeStation();
    const charger = await makeCharger(station, { status: 'Available' });

    const start = await request(app).post('/api/sessions').set(auth)
      .send({ charger: charger._id, vehicleId: 'TS-09-EV-4321' });
    expect(start.status).toBe(201);

    const stop = await request(app).put(`/api/sessions/${start.body.data.session._id}/stop`).set(auth).send({});
    expect(stop.status).toBe(200);
    expect(stop.body.data.session.status).toBe('Completed');
    expect(await ChargingSession.countDocuments({ status: 'Active' })).toBe(0);
  });
});
