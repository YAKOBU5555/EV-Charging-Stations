const { startTestDatabase, stopTestDatabase, clearCollections } = require('./setup');
const { app, request, tokenFor, makeStation } = require('./helpers');

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearCollections);

const payload = {
  stationId: 'STN-TEST-01', name: 'Test Hub', location: 'Hyderabad',
  address: 'Somewhere', latitude: 17.44, longitude: 78.39
};

describe('Station CRUD', () => {
  test('an admin can create, read, update and delete a station', async () => {
    const { token } = await tokenFor('admin');
    const auth = { Authorization: `Bearer ${token}` };

    const create = await request(app).post('/api/stations').set(auth).send(payload);
    expect(create.status).toBe(201);
    const id = create.body.data.station._id;

    const read = await request(app).get(`/api/stations/${id}`).set(auth);
    expect(read.body.data.station.name).toBe('Test Hub');

    const update = await request(app).put(`/api/stations/${id}`).set(auth).send({ name: 'Renamed Hub' });
    expect(update.body.data.station.name).toBe('Renamed Hub');

    const remove = await request(app).delete(`/api/stations/${id}`).set(auth);
    expect(remove.status).toBe(200);

    const missing = await request(app).get(`/api/stations/${id}`).set(auth);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('STATION_NOT_FOUND');
  });

  test('a viewer cannot create a station', async () => {
    const { token } = await tokenFor('viewer');
    const res = await request(app).post('/api/stations').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  test('rejects coordinates outside valid bounds', async () => {
    const { token } = await tokenFor('admin');
    const res = await request(app).post('/api/stations').set('Authorization', `Bearer ${token}`)
      .send({ ...payload, latitude: 999 });
    expect(res.status).toBe(422);
  });

  test('an operator only sees assigned stations', async () => {
    const assigned = await makeStation({ name: 'Assigned' });
    await makeStation({ name: 'Unassigned' });
    const { token } = await tokenFor('operator', { assignedStations: [assigned._id] });

    const res = await request(app).get('/api/stations').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.stations).toHaveLength(1);
    expect(res.body.data.stations[0].name).toBe('Assigned');
  });
});
