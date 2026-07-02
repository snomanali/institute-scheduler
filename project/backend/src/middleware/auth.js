// src/middleware/auth.js
const jwt    = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verify JWT and attach user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided.' });
    }

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB (catches deactivated accounts)
    const result = await query(
      'SELECT id, email, role, full_name, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Restrict to specific roles
 * Usage: authorize('admin') or authorize('admin', 'teacher')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.',
    });
  }
  next();
};

module.exports = { authenticate, authorize };
