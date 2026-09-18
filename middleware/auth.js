const jwt = require('jsonwebtoken');
const User = require('../models/User');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    req.userRole = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

// Use after requireAuth. Blocks the request unless the logged-in user's role
// is one of the allowed roles. Re-checks against the database (not just the
// token) so a role change takes effect immediately, not only on next login.
function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId).select('role');
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to do that.' });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Could not verify permissions.' });
    }
  };
}

module.exports = { requireAuth, requireRole };
