// src/modules/courses/course.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const svc    = require('./course.service');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const adminOnly = [authenticate, authorize('admin')];

// Subjects
router.get('/subjects',  ...adminOnly, async (req, res, next) => { try { res.json({ success: true, data: await svc.getAllSubjects() }); } catch(e){next(e);} });
router.post('/subjects', ...adminOnly, [body('name').notEmpty()], validate, async (req, res, next) => { try { res.status(201).json({ success: true, data: await svc.createSubject(req.body) }); } catch(e){next(e);} });

// Courses
router.get('/',       ...adminOnly, async (req, res, next) => { try { res.json({ success: true, data: await svc.getAll({ isActive: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined }) }); } catch(e){next(e);} });
router.post('/',      ...adminOnly, [body('name').notEmpty()], validate, async (req, res, next) => { try { res.status(201).json({ success: true, data: await svc.create(req.body) }); } catch(e){next(e);} });
router.get('/:id',    ...adminOnly, async (req, res, next) => { try { res.json({ success: true, data: await svc.getById(req.params.id) }); } catch(e){next(e);} });
router.put('/:id',    ...adminOnly, async (req, res, next) => { try { res.json({ success: true, data: await svc.update(req.params.id, req.body) }); } catch(e){next(e);} });
router.get('/:id/progress', ...adminOnly, async (req, res, next) => { try { res.json({ success: true, data: await svc.progress(req.params.id, req.query.from, req.query.to) }); } catch(e){next(e);} });

module.exports = router;
