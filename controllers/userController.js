const User = require('../models/User');
const { ok, created, ApiError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

async function list(req, res, next) {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) filter.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { email: new RegExp(req.query.search, 'i') }
    ];
    const users = await User.find(filter).populate('assignedStations', 'stationId name').sort({ createdAt: -1 });
    return ok(res, { users });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, email, password, role, assignedStations } = req.body;
    const user = new User({ name, email, role, assignedStations: assignedStations || [] });
    await user.setPassword(password);
    await user.save();
    logger.info('User created', { userId: user._id.toString(), role });
    return created(res, { user: user.toJSON() }, 'User created');
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { name, role, isActive, assignedStations } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');

    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (assignedStations !== undefined) user.assignedStations = assignedStations;
    await user.save();
    return ok(res, { user: user.toJSON() }, 'User updated');
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    await user.setPassword(req.body.password);
    await user.save();
    logger.info('Password reset by admin', { userId: user._id.toString(), by: req.user._id.toString() });
    return ok(res, {}, 'Password reset');
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    if (req.params.id === req.user._id.toString()) {
      throw new ApiError(400, 'You cannot delete your own account', 'SELF_DELETE');
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    return ok(res, {}, 'User deleted');
  } catch (err) { next(err); }
}

module.exports = { list, create, update, resetPassword, remove };
