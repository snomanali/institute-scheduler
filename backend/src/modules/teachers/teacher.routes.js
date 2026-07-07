// src/modules/teachers/teacher.routes.js
const router  = require('express').Router();
const { body } = require('express-validator');
const ctrl    = require('./teacher.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

const adminOnly = [authenticate, authorize('admin')];

const expertiseValidators = [
  body('subjectId').isUUID().withMessage('Valid subjectId is required.'),
  body('proficiency').optional().isIn(['primary','secondary']),
];

router.get('/',                            ...adminOnly, ctrl.getAll);
router.get('/available',                   ...adminOnly, ctrl.getAvailable);
router.get('/:id',                         ...adminOnly, ctrl.getById);
router.put('/:id',                         ...adminOnly, ctrl.update);
router.put('/:id/profile',                 ...adminOnly, ctrl.updateProfile);
router.delete('/:id',                      ...adminOnly, ctrl.deactivate);
router.post('/:id/expertise',              ...adminOnly, expertiseValidators, validate, ctrl.addExpertise);
router.delete('/:id/expertise/:subjectId', ...adminOnly, ctrl.removeExpertise);
router.get('/:id/workload',                ...adminOnly, ctrl.getWorkload);

module.exports = router;
