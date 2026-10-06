const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io = null;

/**
 * Socket.IO channel for live monitoring. Clients authenticate with the same JWT
 * they use for the REST API; unauthenticated sockets are rejected.
 */
function initMonitoringSocket(server, corsOrigin) {
  const { Server } = require('socket.io');
  io = new Server(server, { cors: { origin: corsOrigin, credentials: true } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch (err) {
      next(new Error('Token invalid'));
    }
  });

  io.on('connection', (socket) => {
    logger.debug('Dashboard client connected', { role: socket.data.role });
    socket.join('monitoring');
    socket.on('station:subscribe', (stationId) => socket.join(`station:${stationId}`));
    socket.on('station:unsubscribe', (stationId) => socket.leave(`station:${stationId}`));
    socket.on('disconnect', () => logger.debug('Dashboard client disconnected'));
  });

  return io;
}

function emit(event, payload, room = 'monitoring') {
  if (!io) return;
  io.to(room).emit(event, payload);
}

function getIO() {
  return io;
}

module.exports = { initMonitoringSocket, emit, getIO };
