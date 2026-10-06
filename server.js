require('dotenv').config();
const http = require('http');

const createApp = require('./app');
const { connectDatabase } = require('./config/database');
const { initMonitoringSocket } = require('./sockets/monitoringSocket');
const simulator = require('./services/simulatorService');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  const origin = (process.env.CORS_ORIGIN || '*') === '*' ? true : process.env.CORS_ORIGIN.split(',');
  initMonitoringSocket(server, origin);

  server.listen(PORT, () => {
    logger.info(`EV Charging Monitoring running at http://localhost:${PORT}`);
  });

  if (String(process.env.SIMULATOR_AUTOSTART).toLowerCase() === 'true') {
    await simulator.start({ intervalMs: Number(process.env.SIMULATOR_INTERVAL_MS) });
  }

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    simulator.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
}

bootstrap().catch((err) => {
  logger.error('Startup failed', { message: err.message });
  process.exit(1);
});
