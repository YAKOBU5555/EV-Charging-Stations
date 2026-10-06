const request = require('supertest');
const createApp = require('../app');
const User = require('../models/User');
const ChargingStation = require('../models/ChargingStation');
const Charger = require('../models/Charger');

const app = createApp();

async function makeUser(role = 'admin', overrides = {}) {
  const password = 'Password@123';
  const user = new User({
    name: `${role} user`,
    email: overrides.email || `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`,
    role,
    passwordHash: 'placeholder',
    ...overrides
  });
  await user.setPassword(password);
  await user.save();
  return { user, password };
}

async function tokenFor(role = 'admin', overrides = {}) {
  const { user, password } = await makeUser(role, overrides);
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password });
  return { token: res.body.data.token, user };
}

async function makeStation(overrides = {}) {
  return ChargingStation.create({
    stationId: `STN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    name: 'Test Station',
    location: 'Test City',
    latitude: 17.44,
    longitude: 78.39,
    ...overrides
  });
}

async function makeCharger(station, overrides = {}) {
  return Charger.create({
    chargerId: `CHG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    station: station._id,
    maxPower: 60,
    maxCurrent: 150,
    ...overrides
  });
}

module.exports = { app, request, makeUser, tokenFor, makeStation, makeCharger };
