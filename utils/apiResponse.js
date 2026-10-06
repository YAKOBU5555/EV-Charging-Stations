/** Consistent API envelopes used by every controller. */
function ok(res, data = {}, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function created(res, data = {}, message = 'Created') {
  return ok(res, data, message, 201);
}

/** Thrown errors are normalised by middleware/errorMiddleware.js */
class ApiError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { ok, created, ApiError };
