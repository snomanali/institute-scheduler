// src/modules/auth/auth.controller.js
const authService = require('./auth.service');

const authController = {

  // POST /api/v1/auth/login
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const data = await authService.login(email, password);
      res.json({ success: true, message: 'Login successful.', data });
    } catch (err) { next(err); }
  },

  // POST /api/v1/auth/refresh
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const data = await authService.refreshToken(refreshToken);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  // GET /api/v1/auth/me
  async getProfile(req, res, next) {
    try {
      const data = await authService.getProfile(req.user.id);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  },

  // PUT /api/v1/auth/change-password
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);
      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) { next(err); }
  },

  // POST /api/v1/auth/users  (admin only)
  async createUser(req, res, next) {
    try {
      const user = await authService.createUser(req.body);
      res.status(201).json({ success: true, message: 'User created successfully.', data: user });
    } catch (err) { next(err); }
  },

  // POST /api/v1/auth/logout
  async logout(req, res) {
    // Stateless JWT — client drops the token
    // If you implement a token blacklist/refresh table, revoke here
    res.json({ success: true, message: 'Logged out successfully.' });
  },
};

module.exports = authController;
