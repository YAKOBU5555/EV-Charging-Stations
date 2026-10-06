const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');

/** Builds the Express app. Kept separate from server.js so tests can import it. */
function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({
    // The dashboard loads Bootstrap, Chart.js, Leaflet and Socket.IO from CDNs.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://unpkg.com', "'unsafe-inline'"],
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://unpkg.com', "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:']
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  const origin = (process.env.CORS_ORIGIN || '*') === '*' ? true : process.env.CORS_ORIGIN.split(',');
  app.use(cors({ origin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, skip: () => process.env.NODE_ENV === 'test' }));

  app.get('/api/health', (req, res) => res.json({ success: true, message: 'Service is up', data: { uptime: process.uptime() } }));

  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/users', require('./routes/userRoutes'));
  app.use('/api/stations', require('./routes/stationRoutes'));
  app.use('/api/chargers', require('./routes/chargerRoutes'));
  app.use('/api/monitoring', require('./routes/monitoringRoutes'));
  app.use('/api/alerts', require('./routes/alertRoutes'));
  app.use('/api/sessions', require('./routes/sessionRoutes'));
  app.use('/api/analytics', require('./routes/analyticsRoutes'));
  app.use('/api/maintenance', require('./routes/maintenanceRoutes'));

  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
