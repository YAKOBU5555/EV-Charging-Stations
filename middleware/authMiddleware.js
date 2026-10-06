const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/apiResponse');

/** Verifies the bearer token and attaches the live user document to req.user. */
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required', 'NO_TOKEN');

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      throw new ApiError(401, 'Session expired or token invalid', 'INVALID_TOKEN');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw new ApiError(401, 'Account no longer exists', 'USER_NOT_FOUND');
    if (!user.isActive) throw new ApiError(403, 'Account is disabled', 'USER_DISABLED');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

module.exports = { protect, signToken };
