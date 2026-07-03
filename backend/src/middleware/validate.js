// src/middleware/validate.js
const { validationResult } = require('express-validator');

/**
 * Run express-validator checks and return 422 on failure.
 * Usage: router.post('/path', [...validators], validate, controller)
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = { validate };
