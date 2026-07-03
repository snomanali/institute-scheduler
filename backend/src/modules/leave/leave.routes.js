// src/modules/leave/leave.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const svc    = require('./leave.service');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

const adminOnly   = [authenticate, authorize('admin')];
const teacherAuth = [authenticate, authorize('admin','teacher')];

const requestValidators = [
  body('leaveType').isIn(['annual','sick','emergency','personal']),
  body('startDate').isDate(),
  body('endDate').isDate(),
  body('reason').trim().notEmpty().withMessage('Reason is required.'),
];

// Teacher
router.post('/request', ...teacherAuth, requestValidators, validate, async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await svc.request(req.user.id, req.body) }); } catch(e){next(e);}
});
router.get('/my',       ...teacherAuth, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getMine(req.user.id) }); } catch(e){next(e);}
});

// Admin
router.get('/',                      ...adminOnly, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getAll(req.query) }); } catch(e){next(e);}
});
router.get('/:id/impact',            ...adminOnly, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getImpact(req.params.id) }); } catch(e){next(e);}
});
router.put('/:id/review',            ...adminOnly,
  [body('status').isIn(['approved','rejected'])], validate,
  async (req, res, next) => {
    try { res.json({ success: true, data: await svc.review(req.params.id, req.body, req.user.id) }); } catch(e){next(e);}
  }
);
router.post('/emergency',            ...adminOnly,
  [body('teacherId').isUUID(), body('date').isDate(), body('reason').notEmpty()], validate,
  async (req, res, next) => {
    try { res.json({ success: true, data: await svc.markEmergency(req.body.teacherId, req.body.date, req.body.reason, req.user.id) }); } catch(e){next(e);}
  }
);

module.exports = router;
