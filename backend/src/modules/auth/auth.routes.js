// src/modules/auth/auth.routes.js
const router     = require('express').Router();
const { body }   = require('express-validator');
const controller = require('./auth.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

// ── Validators ────────────────────────────────────────────────

const loginValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

const changePasswordValidators = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')
    .matches(/\d/).withMessage('New password must contain at least one number.'),
];

const createUserValidators = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('role').isIn(['admin', 'teacher', 'student']).withMessage('Role must be admin, teacher, or student.'),
  body('fullName').trim().notEmpty().withMessage('Full name is required.'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number.'),
];

const refreshValidators = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required.'),
];

// ── Routes ────────────────────────────────────────────────────

// Public
router.post('/login',    loginValidators,   validate, controller.login);
router.post('/refresh',  refreshValidators, validate, controller.refresh);

// Authenticated
router.get( '/me',               authenticate,                             controller.getProfile);
router.post('/logout',           authenticate,                             controller.logout);
router.put( '/change-password',  authenticate, changePasswordValidators, validate, controller.changePassword);

// Admin only
router.post('/users', authenticate, authorize('admin'), createUserValidators, validate, controller.createUser);

module.exports = router;
