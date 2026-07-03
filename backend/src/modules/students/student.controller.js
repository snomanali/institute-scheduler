// src/modules/students/student.controller.js
const studentService = require('./student.service');

const studentController = {
  async getAll(req, res, next) {
    try {
      const { course_id, is_active, group_id } = req.query;
      const data = await studentService.getAll({
        courseId: course_id,
        groupId:  group_id,
        isActive: is_active !== undefined ? is_active === 'true' : undefined,
      });
      res.json({ success: true, count: data.length, data });
    } catch (e) { next(e); }
  },

  async getById(req, res, next) {
    try {
      res.json({ success: true, data: await studentService.getById(req.params.id) });
    } catch (e) { next(e); }
  },

  async update(req, res, next) {
    try {
      res.json({ success: true, data: await studentService.update(req.params.id, req.body) });
    } catch (e) { next(e); }
  },

  async enroll(req, res, next) {
    try {
      const data = await studentService.enroll(req.params.id, req.body.courseId);
      res.status(201).json({ success: true, message: 'Student enrolled.', data });
    } catch (e) { next(e); }
  },

  async unenroll(req, res, next) {
    try {
      await studentService.unenroll(req.params.id, req.params.courseId);
      res.json({ success: true, message: 'Student unenrolled.' });
    } catch (e) { next(e); }
  },

  async getGroups(req, res, next) {
    try {
      res.json({ success: true, data: await studentService.getGroups() });
    } catch (e) { next(e); }
  },

  async createGroup(req, res, next) {
    try {
      const data = await studentService.createGroup(req.body);
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },

  async addToGroup(req, res, next) {
    try {
      await studentService.addToGroup(req.params.groupId, req.body.studentIds);
      res.json({ success: true, message: 'Students added to group.' });
    } catch (e) { next(e); }
  },

  async removeFromGroup(req, res, next) {
    try {
      await studentService.removeFromGroup(req.params.groupId, req.params.studentId);
      res.json({ success: true, message: 'Student removed from group.' });
    } catch (e) { next(e); }
  },

  async getAttendanceSummary(req, res, next) {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ success: false, message: 'from and to required.' });
      const data = await studentService.getAttendanceSummary(req.params.id, from, to);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
};

module.exports = studentController;
