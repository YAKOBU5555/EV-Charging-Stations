const { validationResult } = require('express-validator');
const { ApiError } = require('../utils/apiResponse');

/** Turns express-validator output into the standard error envelope. */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(new ApiError(422, 'Some fields need attention', 'VALIDATION_ERROR', details));
}

module.exports = { validate };
