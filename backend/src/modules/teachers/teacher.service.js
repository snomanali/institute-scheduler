// src/modules/teachers/teacher.service.js
const { query, getClient } = require('../../config/database');

const teacherService = {

  // ── List all teachers ────────────────────────────────────
  async getAll({ subjectId, isActive } = {}) {
    let sql = `
      SELECT
        t.id, t.employee_code, t.max_hours_per_day, t.weekly_off_day,
        t.buffer_minutes, t.joining_date, t.is_active,
        u.full_name, u.email, u.phone, u.avatar_url,
        -- expertise as JSON array
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'subjectId', s.id, 'subjectName', s.name,
              'subjectCode', s.code, 'proficiency', te.proficiency
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS expertise,
        -- today's scheduled hours
        COALESCE((
          SELECT SUM(c.duration_minutes)
          FROM classes c
          WHERE c.teacher_id = t.id
            AND c.scheduled_date = CURRENT_DATE
            AND c.status != 'cancelled'
        ), 0) / 60.0 AS hours_today
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN teacher_expertise te ON te.teacher_id = t.id
      LEFT JOIN subjects s ON s.id = te.subject_id
      WHERE 1=1
    `;
    const params = [];

    if (isActive !== undefined) {
      params.push(isActive);
      sql += ` AND t.is_active = $${params.length}`;
    }
    if (subjectId) {
      params.push(subjectId);
      sql += ` AND te.subject_id = $${params.length}`;
    }

    sql += ' GROUP BY t.id, u.id ORDER BY u.full_name';
    const result = await query(sql, params);
    return result.rows;
  },

  // ── Get single teacher ───────────────────────────────────
  async getById(id) {
    const result = await query(`
      SELECT
        t.*, u.full_name, u.email, u.phone, u.avatar_url,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'subjectId', s.id, 'subjectName', s.name,
              'subjectCode', s.code, 'proficiency', te.proficiency
            )
          ) FILTER (WHERE s.id IS NOT NULL), '[]'
        ) AS expertise
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN teacher_expertise te ON te.teacher_id = t.id
      LEFT JOIN subjects s ON s.id = te.subject_id
      WHERE t.id = $1
      GROUP BY t.id, u.id
    `, [id]);

    if (!result.rows.length) {
      const err = new Error('Teacher not found.'); err.statusCode = 404; throw err;
    }
    return result.rows[0];
  },

  // ── Update teacher settings ──────────────────────────────
  async update(id, { maxHoursPerDay, weeklyOffDay, bufferMinutes, joiningDate, bio }) {
    const fields = [], params = [];

    if (maxHoursPerDay !== undefined) {
      if (maxHoursPerDay > 12) {
        const e = new Error('Max hours per day cannot exceed 12.'); e.statusCode = 400; throw e;
      }
      params.push(maxHoursPerDay); fields.push(`max_hours_per_day = $${params.length}`);
    }
    if (weeklyOffDay) { params.push(weeklyOffDay); fields.push(`weekly_off_day = $${params.length}`); }
    if (bufferMinutes !== undefined) { params.push(bufferMinutes); fields.push(`buffer_minutes = $${params.length}`); }
    if (joiningDate) { params.push(joiningDate); fields.push(`joining_date = $${params.length}`); }
    if (bio !== undefined) { params.push(bio); fields.push(`bio = $${params.length}`); }

    if (!fields.length) { const e = new Error('No fields to update.'); e.statusCode = 400; throw e; }

    params.push(id);
    const result = await query(
      `UPDATE teachers SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) { const e = new Error('Teacher not found.'); e.statusCode = 404; throw e; }
    return result.rows[0];
  },

  // ── Update user profile fields ───────────────────────────
  async updateProfile(teacherId, { fullName, phone }) {
    const t = await query('SELECT user_id FROM teachers WHERE id = $1', [teacherId]);
    if (!t.rows.length) { const e = new Error('Teacher not found.'); e.statusCode = 404; throw e; }

    const result = await query(
      `UPDATE users SET full_name = COALESCE($1, full_name),
                        phone     = COALESCE($2, phone)
       WHERE id = $3 RETURNING full_name, phone`,
      [fullName || null, phone || null, t.rows[0].user_id]
    );
    return result.rows[0];
  },

  // ── Deactivate teacher ───────────────────────────────────
  async deactivate(id) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE teachers SET is_active = FALSE WHERE id = $1', [id]);
      const t = await client.query('SELECT user_id FROM teachers WHERE id = $1', [id]);
      await client.query('UPDATE users SET is_active = FALSE WHERE id = $1', [t.rows[0].user_id]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  // ── Add subject expertise ────────────────────────────────
  async addExpertise(teacherId, subjectId, proficiency = 'primary') {
    // verify teacher and subject exist
    const t = await query('SELECT id FROM teachers WHERE id = $1', [teacherId]);
    if (!t.rows.length) { const e = new Error('Teacher not found.'); e.statusCode = 404; throw e; }
    const s = await query('SELECT id FROM subjects WHERE id = $1', [subjectId]);
    if (!s.rows.length) { const e = new Error('Subject not found.'); e.statusCode = 404; throw e; }

    const result = await query(`
      INSERT INTO teacher_expertise (teacher_id, subject_id, proficiency)
      VALUES ($1, $2, $3)
      ON CONFLICT (teacher_id, subject_id)
      DO UPDATE SET proficiency = EXCLUDED.proficiency
      RETURNING *
    `, [teacherId, subjectId, proficiency]);
    return result.rows[0];
  },

  // ── Remove subject expertise ─────────────────────────────
  async removeExpertise(teacherId, subjectId) {
    await query(
      'DELETE FROM teacher_expertise WHERE teacher_id = $1 AND subject_id = $2',
      [teacherId, subjectId]
    );
  },

  // ── Workload report for a teacher ────────────────────────
  async getWorkload(teacherId, from, to) {
    const result = await query(`
      SELECT
        c.scheduled_date,
        COUNT(*) FILTER (WHERE c.status != 'cancelled')          AS total_classes,
        COUNT(*) FILTER (WHERE c.status = 'completed')           AS completed,
        COUNT(*) FILTER (WHERE c.status = 'cancelled')           AS cancelled,
        COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0) / 60.0      AS hours_scheduled,
        COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status = 'completed'), 0) / 60.0       AS hours_completed,
        t.max_hours_per_day                                       AS daily_limit
      FROM classes c
      JOIN teachers t ON t.id = c.teacher_id
      WHERE c.teacher_id = $1
        AND c.scheduled_date BETWEEN $2 AND $3
      GROUP BY c.scheduled_date, t.max_hours_per_day
      ORDER BY c.scheduled_date
    `, [teacherId, from, to]);

    const summary = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'cancelled') AS total_classes,
        COALESCE(SUM(duration_minutes) FILTER (WHERE status != 'cancelled'), 0) / 60.0 AS total_hours,
        COUNT(*) FILTER (WHERE status = 'completed')  AS completed_classes,
        COUNT(*) FILTER (WHERE status = 'cancelled')  AS cancelled_classes
      FROM classes
      WHERE teacher_id = $1 AND scheduled_date BETWEEN $2 AND $3
    `, [teacherId, from, to]);

    return { daily: result.rows, summary: summary.rows[0] };
  },

  // ── Get available teachers for a time slot ───────────────
  async getAvailable(date, startTime, endTime, subjectId) {
    const result = await query(`
      SELECT
        t.id, t.weekly_off_day, t.max_hours_per_day, t.buffer_minutes,
        u.full_name, u.email,
        check_teacher_conflict(t.id, $1::date, $2::time, $3::time) AS has_conflict,
        get_teacher_daily_hours(t.id, $1::date) AS hours_today
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      JOIN teacher_expertise te ON te.teacher_id = t.id
      WHERE te.subject_id = $4
        AND t.is_active = TRUE
        AND LOWER(t.weekly_off_day::text) != LOWER(TO_CHAR($1::date, 'day')::text)
        AND NOT EXISTS (
          SELECT 1 FROM leave_requests lr
          WHERE lr.teacher_id = t.id
            AND lr.status = 'approved'
            AND $1::date BETWEEN lr.start_date AND lr.end_date
        )
    `, [date, startTime, endTime, subjectId]);

    return result.rows.filter(t => !t.has_conflict);
  },
};

module.exports = teacherService;
