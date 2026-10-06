const { startTestDatabase, stopTestDatabase, clearCollections } = require('./setup');
const { app, request, tokenFor, makeStation, makeCharger } = require('./helpers');

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearCollections);

describe('Charger CRUD and monitoring endpoints', () => {
  test('an admin can add a charger to a station', async () => {
    const { token } = await tokenFor('admin');
    const station = await makeStation();

    const res = await request(app).post('/api/chargers').set('Authorization', `Bearer ${token}`)
      .send({ chargerId: 'CHG-001', station: station._id, connectorType: 'CCS2', maxPower: 60 });

    expect(res.status).toBe(201);
    expect(res.body.data.charger.chargerId).toBe('CHG-001');
    expect(res.body.data.charger.status).toBe('Available');
  });

  test('rejects a charger without a valid station', async () => {
    const { token } = await tokenFor('admin');
    const res = await request(app).post('/api/chargers').set('Authorization', `Bearer ${token}`)
      .send({ chargerId: 'CHG-002', station: 'not-an-id' });
    expect(res.status).toBe(422);
  });

  test('returns 404 for an unknown charger', async () => {
    const { token } = await tokenFor('viewer');
    const res = await request(app).get('/api/chargers/64b7f0000000000000000000').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CHARGER_NOT_FOUND');
  });

  test('the monitoring overview counts chargers by status', async () => {
    const { token } = await tokenFor('admin');
    const station = await makeStation();
    await makeCharger(station, { status: 'Charging' });
    await makeCharger(station, { status: 'Fault' });
    await makeCharger(station, { status: 'Available' });

    const res = await request(app).get('/api/monitoring/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stats.totalChargers).toBe(3);
    expect(res.body.data.stats.occupied).toBe(1);
    expect(res.body.data.stats.faulty).toBe(1);
  });
});
