// src/modules/courses/course.service.js
const { query } = require('../../config/database');

const courseService = {

  async getAll({ isActive } = {}) {
    let sql = `
      SELECT c.*, 
        COALESCE(
          JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', s.id, 'name', s.name, 'code', s.code))
          FILTER (WHERE s.id IS NOT NULL), '[]'
        ) AS subjects,
        COUNT(DISTINCT ce.student_id) FILTER (WHERE ce.is_active = TRUE) AS enrolled_students
      FROM courses c
      LEFT JOIN course_subjects cs ON cs.course_id = c.id
      LEFT JOIN subjects s ON s.id = cs.subject_id
      LEFT JOIN course_enrollments ce ON ce.course_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (isActive !== undefined) { params.push(isActive); sql += ` AND c.is_active = $1`; }
    sql += ' GROUP BY c.id ORDER BY c.name';
    return (await query(sql, params)).rows;
  },

  async getById(id) {
    const result = await query(`
      SELECT c.*,
        COALESCE(
          JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', s.id, 'name', s.name))
          FILTER (WHERE s.id IS NOT NULL), '[]'
        ) AS subjects
      FROM courses c
      LEFT JOIN course_subjects cs ON cs.course_id = c.id
      LEFT JOIN subjects s ON s.id = cs.subject_id
      WHERE c.id = $1 GROUP BY c.id
    `, [id]);
    if (!result.rows.length) { const e = new Error('Course not found.'); e.statusCode = 404; throw e; }
    return result.rows[0];
  },

  async create({ name, code, description, totalSessions, durationWeeks, subjectIds = [] }) {
    const client = require('../../config/database').getClient
      ? await require('../../config/database').getClient() : null;
    
    const result = await query(
      `INSERT INTO courses (name, code, description, total_sessions, duration_weeks)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, code || null, description || null, totalSessions || null, durationWeeks || null]
    );
    const course = result.rows[0];

    for (const sid of subjectIds) {
      await query('INSERT INTO course_subjects (course_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [course.id, sid]);
    }
    return course;
  },

  async update(id, data) {
    const { name, description, totalSessions, durationWeeks, isActive } = data;
    const result = await query(`
      UPDATE courses SET
        name           = COALESCE($1, name),
        description    = COALESCE($2, description),
        total_sessions = COALESCE($3, total_sessions),
        duration_weeks = COALESCE($4, duration_weeks),
        is_active      = COALESCE($5, is_active)
      WHERE id = $6 RETURNING *
    `, [name, description, totalSessions, durationWeeks, isActive, id]);
    if (!result.rows.length) { const e = new Error('Course not found.'); e.statusCode = 404; throw e; }
    return result.rows[0];
  },

  // ── Subjects ────────────────────────────────────────────
  async getAllSubjects() {
    return (await query('SELECT * FROM subjects WHERE is_active = TRUE ORDER BY name')).rows;
  },

  async createSubject({ name, code, description }) {
    const result = await query(
      'INSERT INTO subjects (name, code, description) VALUES ($1,$2,$3) RETURNING *',
      [name, code || null, description || null]
    );
    return result.rows[0];
  },

  async progress(courseId, from, to) {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE c.status = 'completed') AS completed_sessions,
        COUNT(*) FILTER (WHERE c.status != 'cancelled') AS scheduled_sessions,
        COUNT(*) FILTER (WHERE c.status = 'cancelled') AS cancelled_sessions,
        co.total_sessions AS planned_sessions,
        ROUND(
          COUNT(*) FILTER (WHERE c.status = 'completed') * 100.0
          / NULLIF(co.total_sessions, 0), 1
        ) AS completion_pct
      FROM classes c
      JOIN courses co ON co.id = c.course_id
      WHERE c.course_id = $1
        AND ($2::date IS NULL OR c.scheduled_date >= $2::date)
        AND ($3::date IS NULL OR c.scheduled_date <= $3::date)
      GROUP BY co.total_sessions
    `, [courseId, from || null, to || null]);
    return result.rows[0] || { completed_sessions: 0, scheduled_sessions: 0 };
  },
};

module.exports = courseService;
