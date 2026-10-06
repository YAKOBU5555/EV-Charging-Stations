const { startTestDatabase, stopTestDatabase, clearCollections } = require('./setup');
const { app, request, makeUser, tokenFor } = require('./helpers');

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(clearCollections);

describe('Authentication', () => {
  test('signs in with valid credentials and returns a token', async () => {
    const { user, password } = await makeUser('admin');
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test('rejects a wrong password', async () => {
    const { user } = await makeUser('viewer');
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'WrongPassword1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  test('validates the request body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: '1' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('returns the current user from /me', async () => {
    const { token, user } = await tokenFor('operator');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
  });

  test('blocks unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/stations');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('NO_TOKEN');
  });
});
