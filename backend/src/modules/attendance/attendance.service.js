// src/modules/attendance/attendance.service.js
const { query, getClient } = require('../../config/database');

const attendanceService = {

  // ── Submit attendance for a class ─────────────────────
  async submit(classId, records, markedBy) {
    // Verify class exists and is completed or past start time
    const cls = await query(
      `SELECT id, status, scheduled_date, end_time FROM classes WHERE id = $1`,
      [classId]
    );
    if (!cls.rows.length) { const e = new Error('Class not found.'); e.statusCode = 404; throw e; }

    const { status, scheduled_date, end_time } = cls.rows[0];
    const classEndTime = new Date(`${scheduled_date}T${end_time}`);
    if (classEndTime > new Date() && status !== 'completed') {
      const e = new Error('Attendance can only be submitted after the class end time.');
      e.statusCode = 400; throw e;
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      const saved = [];

      for (const rec of records) {
        const { studentId, status: attStatus, lateMinutes, remarks } = rec;

        // Verify student is in this class
        const enrolled = await client.query(
          'SELECT id FROM class_students WHERE class_id = $1 AND student_id = $2',
          [classId, studentId]
        );
        if (!enrolled.rows.length) continue; // skip unenrolled students silently

        const r = await client.query(`
          INSERT INTO attendance (class_id, student_id, status, late_minutes, remarks, marked_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (class_id, student_id)
          DO UPDATE SET
            status      = EXCLUDED.status,
            late_minutes= EXCLUDED.late_minutes,
            remarks     = EXCLUDED.remarks,
            marked_by   = EXCLUDED.marked_by,
            updated_at  = NOW()
          RETURNING *
        `, [classId, studentId, attStatus, lateMinutes || null, remarks || null, markedBy]);

        saved.push(r.rows[0]);
      }

      // Auto-update class status to completed
      await client.query(
        `UPDATE classes SET status = 'completed' WHERE id = $1 AND status = 'ongoing'`,
        [classId]
      );

      await client.query('COMMIT');
      return { submitted: saved.length, records: saved };

    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  // ── Get attendance for a class ─────────────────────────
  async getByClass(classId) {
    const result = await query(`
      SELECT a.*, u.full_name AS student_name, u.email AS student_email
      FROM attendance a
      JOIN students st ON st.id = a.student_id
      JOIN users u ON u.id = st.user_id
      WHERE a.class_id = $1
      ORDER BY u.full_name
    `, [classId]);
    return result.rows;
  },

  // ── Get student attendance history ─────────────────────
  async getByStudent(studentId, { from, to, courseId } = {}) {
    let sql = `
      SELECT
        a.id, a.status, a.late_minutes, a.remarks, a.marked_at,
        c.scheduled_date, c.start_time, c.end_time, c.duration_minutes, c.platform,
        JSONB_BUILD_OBJECT('id', s.id, 'name', s.name) AS subject,
        JSONB_BUILD_OBJECT('id', co.id, 'name', co.name) AS course,
        JSONB_BUILD_OBJECT('id', t.id, 'name', u_t.full_name) AS teacher
      FROM attendance a
      JOIN classes c ON c.id = a.class_id
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN courses co ON co.id = c.course_id
      JOIN teachers t ON t.id = c.teacher_id
      JOIN users u_t ON u_t.id = t.user_id
      WHERE a.student_id = $1
    `;
    const params = [studentId];

    if (from) { params.push(from); sql += ` AND c.scheduled_date >= $${params.length}`; }
    if (to)   { params.push(to);   sql += ` AND c.scheduled_date <= $${params.length}`; }
    if (courseId) { params.push(courseId); sql += ` AND c.course_id = $${params.length}`; }

    sql += ' ORDER BY c.scheduled_date DESC, c.start_time DESC';
    return (await query(sql, params)).rows;
  },

  // ── Summary stats for a student ───────────────────────
  async getSummary(studentId, from, to) {
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
          / NULLIF(COUNT(*),0), 1
        ) AS attendance_pct
      FROM attendance a
      JOIN classes c ON c.id = a.class_id
      WHERE a.student_id = $1
        AND ($2::date IS NULL OR c.scheduled_date >= $2::date)
        AND ($3::date IS NULL OR c.scheduled_date <= $3::date)
    `, [studentId, from || null, to || null]);
    return result.rows[0];
  },

  // ── Admin: override/edit attendance ───────────────────
  async adminUpdate(attendanceId, { status, lateMinutes, remarks }, updatedBy) {
    const result = await query(`
      UPDATE attendance
      SET status       = COALESCE($1, status),
          late_minutes = COALESCE($2, late_minutes),
          remarks      = COALESCE($3, remarks),
          marked_by    = $4,
          updated_at   = NOW()
      WHERE id = $5 RETURNING *
    `, [status, lateMinutes || null, remarks || null, updatedBy, attendanceId]);
    if (!result.rows.length) { const e = new Error('Attendance record not found.'); e.statusCode = 404; throw e; }
    return result.rows[0];
  },

  // ── Pending attendance (classes ended, no attendance yet) ─
  async getPending(teacherId) {
    const result = await query(`
      SELECT c.id, c.scheduled_date, c.start_time, c.end_time,
             s.name AS subject_name, u.full_name AS teacher_name,
             COUNT(cs.student_id) AS student_count,
             COUNT(a.id) AS marked_count
      FROM classes c
      JOIN teachers t ON t.id = c.teacher_id
      JOIN users u ON u.id = t.user_id
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN class_students cs ON cs.class_id = c.id
      LEFT JOIN attendance a ON a.class_id = c.id
      WHERE c.teacher_id = $1
        AND c.status IN ('ongoing','scheduled')
        AND (c.scheduled_date < CURRENT_DATE
             OR (c.scheduled_date = CURRENT_DATE AND c.end_time < CURRENT_TIME))
      GROUP BY c.id, s.name, u.full_name
      HAVING COUNT(cs.student_id) > COUNT(a.id)
      ORDER BY c.scheduled_date DESC
    `, [teacherId]);
    return result.rows;
  },
};

module.exports = attendanceService;
