// src/modules/attendance/attendance.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const svc    = require('./attendance.service');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { query } = require('../../config/database');

const adminOnly   = [authenticate, authorize('admin')];
const teacherAuth = [authenticate, authorize('admin','teacher')];

// Submit attendance for a class (teacher)
router.post('/class/:classId', ...teacherAuth,
  [body('*.studentId').isUUID(), body('*.status').isIn(['present','late','absent','excused','technical_issue'])],
  validate,
  async (req, res, next) => {
    try {
      const data = await svc.submit(req.params.classId, req.body, req.user.id);
      res.json({ success: true, message: 'Attendance submitted.', data });
    } catch(e) { next(e); }
  }
);

// Get attendance for a class
router.get('/class/:classId', ...teacherAuth, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getByClass(req.params.classId) }); } catch(e){next(e);}
});

// Get pending attendance (teacher's unsubmitted)
router.get('/my/pending', ...teacherAuth, async (req, res, next) => {
  try {
    const t = await query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id]);
    if (!t.rows.length) return res.status(404).json({ success: false, message: 'Teacher not found.' });
    res.json({ success: true, data: await svc.getPending(t.rows[0].id) });
  } catch(e){next(e);}
});

// Student history
router.get('/student/:studentId',          ...adminOnly, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getByStudent(req.params.studentId, req.query) }); } catch(e){next(e);}
});
router.get('/student/:studentId/summary',  ...adminOnly, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getSummary(req.params.studentId, req.query.from, req.query.to) }); } catch(e){next(e);}
});

// Admin override
router.put('/:id', ...adminOnly, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.adminUpdate(req.params.id, req.body, req.user.id) }); } catch(e){next(e);}
});

module.exports = router;
