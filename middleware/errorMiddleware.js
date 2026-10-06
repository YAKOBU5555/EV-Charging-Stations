const logger = require('../utils/logger');

function notFound(req, res, next) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} does not exist`, error: 'ROUTE_NOT_FOUND' });
}

/** Centralised error handler. Internal details never reach the client. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let code = err.code || 'SERVER_ERROR';
  let message = err.message || 'Something went wrong on our side';

  if (err.name === 'CastError') {
    status = 400; code = 'INVALID_ID'; message = 'That identifier is not valid';
  } else if (err.code === 11000) {
    status = 409; code = 'DUPLICATE_KEY';
    message = `${Object.keys(err.keyValue || {})[0] || 'Value'} is already in use`;
  } else if (err.name === 'ValidationError') {
    status = 422; code = 'VALIDATION_ERROR'; message = 'Some fields need attention';
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, { message: err.message, stack: err.stack });
    message = 'Something went wrong on our side';
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${code}`);
  }

  const body = { success: false, message, error: code };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
