// src/modules/teachers/teacher.controller.js
const teacherService = require('./teacher.service');

const teacherController = {
  async getAll(req, res, next) {
    try {
      const { subject_id, is_active } = req.query;
      const data = await teacherService.getAll({
        subjectId: subject_id,
        isActive:  is_active !== undefined ? is_active === 'true' : undefined,
      });
      res.json({ success: true, count: data.length, data });
    } catch (e) { next(e); }
  },

  async getById(req, res, next) {
    try {
      const data = await teacherService.getById(req.params.id);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  async update(req, res, next) {
    try {
      const data = await teacherService.update(req.params.id, req.body);
      res.json({ success: true, message: 'Teacher updated.', data });
    } catch (e) { next(e); }
  },

  async updateProfile(req, res, next) {
    try {
      const data = await teacherService.updateProfile(req.params.id, req.body);
      res.json({ success: true, message: 'Profile updated.', data });
    } catch (e) { next(e); }
  },

  async deactivate(req, res, next) {
    try {
      await teacherService.deactivate(req.params.id);
      res.json({ success: true, message: 'Teacher deactivated.' });
    } catch (e) { next(e); }
  },

  async addExpertise(req, res, next) {
    try {
      const { subjectId, proficiency } = req.body;
      const data = await teacherService.addExpertise(req.params.id, subjectId, proficiency);
      res.status(201).json({ success: true, message: 'Expertise assigned.', data });
    } catch (e) { next(e); }
  },

  async removeExpertise(req, res, next) {
    try {
      await teacherService.removeExpertise(req.params.id, req.params.subjectId);
      res.json({ success: true, message: 'Expertise removed.' });
    } catch (e) { next(e); }
  },

  async getWorkload(req, res, next) {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ success: false, message: 'from and to dates are required.' });
      }
      const data = await teacherService.getWorkload(req.params.id, from, to);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },

  async getAvailable(req, res, next) {
    try {
      const { date, start_time, end_time, subject_id } = req.query;
      if (!date || !start_time || !end_time || !subject_id) {
        return res.status(400).json({ success: false, message: 'date, start_time, end_time, subject_id are required.' });
      }
      const data = await teacherService.getAvailable(date, start_time, end_time, subject_id);
      res.json({ success: true, count: data.length, data });
    } catch (e) { next(e); }
  },
};

module.exports = teacherController;
