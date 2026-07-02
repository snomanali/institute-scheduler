// src/modules/classes/class.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl   = require('./class.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

const adminOnly   = [authenticate, authorize('admin')];
const teacherAuth = [authenticate, authorize('admin','teacher')];

const createValidators = [
  body('teacherId').isUUID().withMessage('Valid teacherId required.'),
  body('subjectId').isUUID().withMessage('Valid subjectId required.'),
  body('scheduledDate').isDate().withMessage('Valid scheduledDate (YYYY-MM-DD) required.'),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime must be HH:MM.'),
  body('durationMinutes').isInt({ min: 15, max: 240 }).withMessage('durationMinutes must be 15–240.'),
  body('platform').isIn(['skype','google_meet','microsoft_teams','moodle','custom']).withMessage('Invalid platform.'),
];

// Admin
router.get('/',             ...adminOnly,   ctrl.getAll);
router.post('/',            ...adminOnly,   createValidators, validate, ctrl.create);
router.get('/:id',          ...teacherAuth, ctrl.getById);
router.put('/:id',          ...adminOnly,   ctrl.update);
router.delete('/:id',       ...adminOnly,   [body('reason').notEmpty()], validate, ctrl.cancel);
router.patch('/:id/status', ...teacherAuth, ctrl.updateStatus);

// Teacher — my schedule
router.get('/my/today', ...teacherAuth, ctrl.getMyToday);
router.get('/my/week',  ...teacherAuth, ctrl.getMyWeek);

module.exports = router;
