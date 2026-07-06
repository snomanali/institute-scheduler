// src/modules/classes/class.controller.js
const classService = require('./class.service');

const classController = {

  async getAll(req, res, next) {
    try {
      const { date, from, to, teacher_id, course_id, status, view } = req.query;
      const data = await classService.getAll({ date, from, to, teacherId: teacher_id, courseId: course_id, status, view });
      res.json({ success: true, count: data.length, data });
    } catch (e) { next(e); }
  },

  async getById(req, res, next) {
    try {
      res.json({ success: true, data: await classService.getById(req.params.id) });
    } catch (e) { next(e); }
  },

  async create(req, res, next) {
    try {
      const result = await classService.create({ ...req.body, createdBy: req.user.id });
      const msg = result.created > 1
        ? `${result.created} recurring classes created.`
        : 'Class scheduled successfully.';
      res.status(201).json({ success: true, message: msg, data: result });
    } catch (e) {
      // Return structured conflict error
      if (e.statusCode === 409 && e.conflicts) {
        return res.status(409).json({ success: false, message: e.message, conflicts: e.conflicts });
      }
      next(e);
    }
  },

  async update(req, res, next) {
    try {
      const data = await classService.update(req.params.id, req.body, req.user.id);
      res.json({ success: true, message: 'Class updated.', data });
    } catch (e) {
      if (e.statusCode === 409 && e.conflicts) {
        return res.status(409).json({ success: false, message: e.message, conflicts: e.conflicts });
      }
      next(e);
    }
  },

  async cancel(req, res, next) {
    try {
      const data = await classService.cancel(req.params.id, req.body.reason);
      res.json({ success: true, message: 'Class cancelled.', data });
    } catch (e) { next(e); }
  },

  // Teacher endpoints
  async getMyToday(req, res, next) {
    try {
      const today = new Date().toISOString().split('T')[0];
      // get teacher profile id from user id
      const { query } = require('../../config/database');
      const t = await query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id]);
      if (!t.rows.length) return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
      const data = await classService.getMySchedule(t.rows[0].id, today);
      res.json({ success: true, date: today, count: data.length, data });
    } catch (e) { next(e); }
  },

  async getMyWeek(req, res, next) {
    try {
      const { query } = require('../../config/database');
      const t = await query('SELECT id FROM teachers WHERE user_id = $1', [req.user.id]);
      if (!t.rows.length) return res.status(404).json({ success: false, message: 'Teacher profile not found.' });
      const date = req.query.date || new Date().toISOString().split('T')[0];
      const data = await classService.getMyWeek(t.rows[0].id, date);
      res.json({ success: true, count: data.length, data });
    } catch (e) { next(e); }
  },

  async updateStatus(req, res, next) {
    try {
      const data = await classService.updateStatus(req.params.id, req.body.status);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
};

module.exports = classController;
