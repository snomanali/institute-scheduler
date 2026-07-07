// src/modules/auth/auth.service.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query, getClient } = require('../../config/database');
const logger = require('../../config/logger');

// ── Token helpers ─────────────────────────────────────────────

const generateAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

// ── Auth service ──────────────────────────────────────────────

const authService = {

  /**
   * Login with email + password
   * Returns { user, accessToken, refreshToken }
   */
  async login(email, password) {
    // 1. Find user
    const result = await query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.full_name, u.is_active,
              u.phone, u.avatar_url
       FROM users u
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!result.rows.length) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    const user = result.rows[0];

    if (!user.is_active) {
      const err = new Error('Your account has been deactivated. Contact the administrator.');
      err.statusCode = 403;
      throw err;
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const err = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    // 3. Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 4. Get role-specific profile ID
    let profileId = null;
    if (user.role === 'teacher') {
      const t = await query('SELECT id FROM teachers WHERE user_id = $1', [user.id]);
      profileId = t.rows[0]?.id || null;
    } else if (user.role === 'student') {
      const s = await query('SELECT id FROM students WHERE user_id = $1', [user.id]);
      profileId = s.rows[0]?.id || null;
    }

    // 5. Generate tokens
    const accessToken  = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info(`Login: ${user.email} [${user.role}]`);

    return {
      user: {
        id:        user.id,
        email:     user.email,
        role:      user.role,
        fullName:  user.full_name,
        phone:     user.phone,
        avatarUrl: user.avatar_url,
        profileId,
      },
      accessToken,
      refreshToken,
    };
  },

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      const err = new Error('Invalid or expired refresh token.');
      err.statusCode = 401;
      throw err;
    }

    const result = await query(
      'SELECT id, email, role, full_name, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows.length || !result.rows[0].is_active) {
      const err = new Error('User not found or deactivated.');
      err.statusCode = 401;
      throw err;
    }

    const user        = result.rows[0];
    const accessToken = generateAccessToken(user);

    return { accessToken };
  },

  /**
   * Change password (authenticated user)
   */
  async changePassword(userId, currentPassword, newPassword) {
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows.length) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      const err = new Error('Current password is incorrect.');
      err.statusCode = 400;
      throw err;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

    logger.info(`Password changed for user: ${userId}`);
  },

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const result = await query(
      `SELECT id, email, role, full_name, phone, avatar_url, last_login_at, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!result.rows.length) {
      const err = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }
    return result.rows[0];
  },

  /**
   * Admin: create a new user (teacher or student)
   */
  async createUser({ email, password, role, fullName, phone }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Check email uniqueness
      const exists = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase().trim()]
      );
      if (exists.rows.length) {
        const err = new Error('Email address is already registered.');
        err.statusCode = 409;
        throw err;
      }

      const hash = await bcrypt.hash(password, 12);

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, role, full_name, phone`,
        [email.toLowerCase().trim(), hash, role, fullName, phone || null]
      );
      const user = userResult.rows[0];

      // Create role profile
      if (role === 'teacher') {
        await client.query(
          'INSERT INTO teachers (user_id) VALUES ($1)',
          [user.id]
        );
      } else if (role === 'student') {
        await client.query(
          'INSERT INTO students (user_id) VALUES ($1)',
          [user.id]
        );
      }

      await client.query('COMMIT');
      logger.info(`User created: ${email} [${role}]`);
      return user;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = authService;
