// src/modules/students/student.service.js
const { query, getClient } = require('../../config/database');

const studentService = {

  async getAll({ courseId, isActive, groupId } = {}) {
    let sql = `
      SELECT
        s.id, s.student_code, s.date_of_birth, s.guardian_name,
        s.guardian_phone, s.is_active, s.enrolled_at,
        u.full_name, u.email, u.phone,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'courseId', c.id, 'courseName', c.name,
              'courseCode', c.code, 'isActive', ce.is_active
            )
          ) FILTER (WHERE c.id IS NOT NULL), '[]'
        ) AS enrollments
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN course_enrollments ce ON ce.student_id = s.id
      LEFT JOIN courses c ON c.id = ce.course_id
      WHERE 1=1
    `;
    const params = [];

    if (isActive !== undefined) {
      params.push(isActive); sql += ` AND s.is_active = $${params.length}`;
    }
    if (courseId) {
      params.push(courseId); sql += ` AND ce.course_id = $${params.length}`;
    }
    if (groupId) {
      params.push(groupId);
      sql += ` AND EXISTS (
        SELECT 1 FROM student_group_members sgm
        WHERE sgm.student_id = s.id AND sgm.group_id = $${params.length}
      )`;
    }

    sql += ' GROUP BY s.id, u.id ORDER BY u.full_name';
    const result = await query(sql, params);
    return result.rows;
  },

  async getById(id) {
    const result = await query(`
      SELECT s.*, u.full_name, u.email, u.phone,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'courseId', c.id, 'courseName', c.name, 'enrolledAt', ce.enrolled_at
            )
          ) FILTER (WHERE c.id IS NOT NULL), '[]'
        ) AS enrollments
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN course_enrollments ce ON ce.student_id = s.id AND ce.is_active = TRUE
      LEFT JOIN courses c ON c.id = ce.course_id
      WHERE s.id = $1
      GROUP BY s.id, u.id
    `, [id]);

    if (!result.rows.length) {
      const e = new Error('Student not found.'); e.statusCode = 404; throw e;
    }
    return result.rows[0];
  },

  async update(id, { guardianName, guardianPhone, dateOfBirth, notes }) {
    const result = await query(`
      UPDATE students
      SET guardian_name  = COALESCE($1, guardian_name),
          guardian_phone = COALESCE($2, guardian_phone),
          date_of_birth  = COALESCE($3, date_of_birth),
          notes          = COALESCE($4, notes)
      WHERE id = $5 RETURNING *
    `, [guardianName, guardianPhone, dateOfBirth, notes, id]);

    if (!result.rows.length) { const e = new Error('Student not found.'); e.statusCode = 404; throw e; }
    return result.rows[0];
  },

  async enroll(studentId, courseId) {
    // check both exist
    const s = await query('SELECT id FROM students WHERE id = $1', [studentId]);
    if (!s.rows.length) { const e = new Error('Student not found.'); e.statusCode = 404; throw e; }
    const c = await query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!c.rows.length) { const e = new Error('Course not found.'); e.statusCode = 404; throw e; }

    const result = await query(`
      INSERT INTO course_enrollments (student_id, course_id)
      VALUES ($1, $2)
      ON CONFLICT (student_id, course_id)
      DO UPDATE SET is_active = TRUE, enrolled_at = CURRENT_DATE
      RETURNING *
    `, [studentId, courseId]);
    return result.rows[0];
  },

  async unenroll(studentId, courseId) {
    await query(
      `UPDATE course_enrollments SET is_active = FALSE
       WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId]
    );
  },

  // ── Groups ─────────────────────────────────────────────
  async getGroups() {
    const result = await query(`
      SELECT sg.*, c.name AS course_name,
        COUNT(sgm.student_id) AS member_count
      FROM student_groups sg
      LEFT JOIN courses c ON c.id = sg.course_id
      LEFT JOIN student_group_members sgm ON sgm.group_id = sg.id
      GROUP BY sg.id, c.name
      ORDER BY sg.name
    `);
    return result.rows;
  },

  async createGroup({ name, description, courseId }) {
    const result = await query(`
      INSERT INTO student_groups (name, description, course_id)
      VALUES ($1, $2, $3) RETURNING *
    `, [name, description || null, courseId || null]);
    return result.rows[0];
  },

  async addToGroup(groupId, studentIds) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      for (const sid of studentIds) {
        await client.query(
          `INSERT INTO student_group_members (group_id, student_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [groupId, sid]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  async removeFromGroup(groupId, studentId) {
    await query(
      'DELETE FROM student_group_members WHERE group_id = $1 AND student_id = $2',
      [groupId, studentId]
    );
  },

  async getAttendanceSummary(studentId, from, to) {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE a.status = 'present')         AS present,
        COUNT(*) FILTER (WHERE a.status = 'late')            AS late,
        COUNT(*) FILTER (WHERE a.status = 'absent')          AS absent,
        COUNT(*) FILTER (WHERE a.status = 'excused')         AS excused,
        COUNT(*) FILTER (WHERE a.status = 'technical_issue') AS technical_issue,
        COUNT(*)                                              AS total,
        ROUND(
          COUNT(*) FILTER (WHERE a.status IN ('present','late')) * 100.0
          / NULLIF(COUNT(*), 0), 1
        ) AS attendance_pct
      FROM attendance a
      JOIN classes c ON c.id = a.class_id
      WHERE a.student_id = $1
        AND c.scheduled_date BETWEEN $2 AND $3
    `, [studentId, from, to]);
    return result.rows[0];
  },
};

module.exports = studentService;
