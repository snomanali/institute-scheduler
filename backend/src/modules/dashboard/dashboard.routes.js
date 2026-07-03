// src/modules/dashboard/dashboard.routes.js
const router = require('express').Router();
const svc    = require('./dashboard.service');
const { authenticate, authorize } = require('../../middleware/auth');

const adminOnly = [authenticate, authorize('admin')];

router.get('/overview',     ...adminOnly, async (req, res, next) => {
  try { res.json({ success: true, data: await svc.getOverview() }); } catch(e){next(e);}
});
router.get('/calendar',     ...adminOnly, async (req, res, next) => {
  try {
    const { view = 'week', date = new Date().toISOString().split('T')[0] } = req.query;
    res.json({ success: true, data: await svc.getCalendar(view, date) });
  } catch(e){next(e);}
});
router.get('/availability', ...adminOnly, async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.json({ success: true, data: await svc.getTeacherAvailability(date) });
  } catch(e){next(e);}
});

module.exports = router;
