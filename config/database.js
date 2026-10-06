const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB. Retry policy is left to the process manager so a
 * misconfigured URI fails loudly instead of silently looping.
 */
async function connectDatabase(uri = process.env.MONGO_URI) {
  if (!uri) throw new Error('MONGO_URI is not defined. Copy .env.example to .env.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info(`MongoDB connected: ${mongoose.connection.name}`);
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
