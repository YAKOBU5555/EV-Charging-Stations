const User = require('../models/User');
const { ok, ApiError } = require('../utils/apiResponse');
const { signToken } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

/** POST /api/auth/login */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');

    if (!user || !(await user.verifyPassword(password))) {
      logger.warn('Failed login attempt', { email });
      throw new ApiError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
    }
    if (!user.isActive) throw new ApiError(403, 'This account is disabled', 'USER_DISABLED');

    user.lastLoginAt = new Date();
    await user.save();
    logger.info('User signed in', { userId: user._id.toString(), role: user.role });

    return ok(res, { token: signToken(user), user: user.toJSON() }, 'Signed in');
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/logout — JWTs are stateless, so this just confirms intent. */
async function logout(req, res) {
  logger.info('User signed out', { userId: req.user._id.toString() });
  return ok(res, {}, 'Signed out');
}

/** GET /api/auth/me */
async function me(req, res, next) {
  try {
    const user = await req.user.populate({ path: 'assignedStations', select: 'stationId name' });
    return ok(res, { user: user.toJSON() });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/auth/password */
async function changePassword(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await user.verifyPassword(req.body.currentPassword))) {
      throw new ApiError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');
    }
    await user.setPassword(req.body.newPassword);
    await user.save();
    return ok(res, {}, 'Password updated');
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, changePassword };
