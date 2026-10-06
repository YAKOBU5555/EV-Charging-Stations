const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

/** Spin up an in-memory MongoDB so tests never touch a real database. */
async function startTestDatabase() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_jest_only';
  process.env.BCRYPT_SALT_ROUNDS = '4';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function stopTestDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
}

async function clearCollections() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

module.exports = { startTestDatabase, stopTestDatabase, clearCollections };
