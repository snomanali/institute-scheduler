// src/modules/students/student.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const ctrl   = require('./student.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

const adminOnly = [authenticate, authorize('admin')];

router.get('/',                                      ...adminOnly, ctrl.getAll);
router.get('/groups',                                ...adminOnly, ctrl.getGroups);
router.post('/groups',                               ...adminOnly, ctrl.createGroup);
router.post('/groups/:groupId/members',              ...adminOnly, ctrl.addToGroup);
router.delete('/groups/:groupId/members/:studentId', ...adminOnly, ctrl.removeFromGroup);
router.get('/:id',                                   ...adminOnly, ctrl.getById);
router.put('/:id',                                   ...adminOnly, ctrl.update);
router.post('/:id/enroll',                           ...adminOnly, ctrl.enroll);
router.delete('/:id/enroll/:courseId',               ...adminOnly, ctrl.unenroll);
router.get('/:id/attendance',                        ...adminOnly, ctrl.getAttendanceSummary);

module.exports = router;
