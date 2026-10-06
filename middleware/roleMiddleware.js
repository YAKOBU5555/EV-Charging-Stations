const { ApiError } = require('../utils/apiResponse');

/** Allow only the listed roles. Use after protect(). */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required', 'NO_TOKEN'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Your role cannot perform this action', 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Operators only see the stations assigned to them. Returns a Mongo filter
 * fragment that callers merge into their query.
 */
function stationScope(user) {
  if (user.role === 'operator' && user.assignedStations?.length) {
    return { _id: { $in: user.assignedStations } };
  }
  return {};
}

function chargerStationScope(user) {
  if (user.role === 'operator' && user.assignedStations?.length) {
    return { station: { $in: user.assignedStations } };
  }
  return {};
}

module.exports = { authorize, stationScope, chargerStationScope };
