// src/modules/reports/report.routes.js
const router = require('express').Router();
const svc    = require('./report.service');
const { authenticate, authorize } = require('../../middleware/auth');

const adminOnly = [authenticate, authorize('admin')];

function handleReport(reportType) {
  return async (req, res, next) => {
    try {
      const format = (req.query.format || 'json').toLowerCase();
      const params = {
        from:      req.query.from,
        to:        req.query.to,
        teacherId: req.query.teacher_id,
        studentId: req.query.student_id,
        courseId:  req.query.course_id,
      };
      await svc.generate(reportType, format, params, res);
    } catch (e) { next(e); }
  };
}

router.get('/teacher-workload', ...adminOnly, handleReport('teacher-workload'));
router.get('/attendance',       ...adminOnly, handleReport('attendance'));
router.get('/leave',            ...adminOnly, handleReport('leave'));
router.get('/utilisation',      ...adminOnly, handleReport('utilisation'));
router.get('/course-progress',  ...adminOnly, handleReport('course-progress'));

router.get('/', ...adminOnly, (req, res) => {
  res.json({
    success: true,
    reports: [
      { type: 'teacher-workload', name: 'Teacher Workload Report',     formats: ['json','pdf','xlsx','csv'], params: ['from','to','teacher_id?'] },
      { type: 'attendance',       name: 'Student Attendance Report',   formats: ['json','pdf','xlsx','csv'], params: ['from','to','student_id?','course_id?'] },
      { type: 'leave',            name: 'Leave Report',                formats: ['json','pdf','xlsx','csv'], params: ['from','to','teacher_id?'] },
      { type: 'utilisation',      name: 'Schedule Utilisation Report', formats: ['json','pdf','xlsx','csv'], params: ['from','to'] },
      { type: 'course-progress',  name: 'Course Progress Report',      formats: ['json','pdf','xlsx','csv'], params: ['from','to','course_id?'] },
    ],
  });
});

module.exports = router;
