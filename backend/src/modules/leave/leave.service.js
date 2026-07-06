// src/modules/leave/leave.service.js
const { query, getClient } = require('../../config/database');
const logger = require('../../config/logger');

const leaveService = {

  // ── Teacher: submit leave request ─────────────────────
  async request(userId, { leaveType, startDate, endDate, reason, attachmentUrl }) {
    const t = await query('SELECT id FROM teachers WHERE user_id = $1', [userId]);
    if (!t.rows.length) { const e = new Error('Teacher profile not found.'); e.statusCode = 404; throw e; }
    const teacherId = t.rows[0].id;

    // Check for overlapping approved/pending leave
    const overlap = await query(`
      SELECT id FROM leave_requests
      WHERE teacher_id = $1
        AND status IN ('pending','approved')
        AND NOT (end_date < $2::date OR start_date > $3::date)
    `, [teacherId, startDate, endDate]);

    if (overlap.rows.length) {
      const e = new Error('You already have a leave request overlapping these dates.');
      e.statusCode = 409; throw e;
    }

    const result = await query(`
      INSERT INTO leave_requests
        (teacher_id, leave_type, start_date, end_date, reason, attachment_url)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [teacherId, leaveType, startDate, endDate, reason, attachmentUrl || null]);

    return result.rows[0];
  },

  // ── Teacher: view own requests ─────────────────────────
  async getMine(userId) {
    const t = await query('SELECT id FROM teachers WHERE user_id = $1', [userId]);
    if (!t.rows.length) return [];

    const result = await query(`
      SELECT lr.*,
        u.full_name AS reviewed_by_name
      FROM leave_requests lr
      LEFT JOIN users u ON u.id = lr.reviewed_by
      WHERE lr.teacher_id = $1
      ORDER BY lr.created_at DESC
    `, [t.rows[0].id]);
    return result.rows;
  },

  // ── Admin: list all requests ───────────────────────────
  async getAll({ status, teacherId } = {}) {
    let sql = `
      SELECT lr.*,
        u_t.full_name AS teacher_name,
        u_r.full_name AS reviewed_by_name,
        -- count affected classes
        (SELECT COUNT(*) FROM classes c
         WHERE c.teacher_id = lr.teacher_id
           AND c.status NOT IN ('cancelled','completed')
           AND c.scheduled_date BETWEEN lr.start_date AND lr.end_date
        ) AS affected_classes
      FROM leave_requests lr
      JOIN teachers t ON t.id = lr.teacher_id
      JOIN users u_t ON u_t.id = t.user_id
      LEFT JOIN users u_r ON u_r.id = lr.reviewed_by
      WHERE 1=1
    `;
    const params = [];

    if (status)    { params.push(status);    sql += ` AND lr.status = $${params.length}`; }
    if (teacherId) { params.push(teacherId); sql += ` AND lr.teacher_id = $${params.length}`; }

    sql += ' ORDER BY lr.created_at DESC';
    return (await query(sql, params)).rows;
  },

  // ── Admin: approve or reject ───────────────────────────
  async review(leaveId, { status, reviewNotes }, reviewedBy) {
    if (!['approved','rejected'].includes(status)) {
      const e = new Error('Status must be approved or rejected.'); e.statusCode = 400; throw e;
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        UPDATE leave_requests
        SET status       = $1,
            review_notes = $2,
            reviewed_by  = $3,
            reviewed_at  = NOW()
        WHERE id = $4 AND status = 'pending'
        RETURNING *
      `, [status, reviewNotes || null, reviewedBy, leaveId]);

      if (!result.rows.length) {
        const e = new Error('Leave request not found or already reviewed.'); e.statusCode = 404; throw e;
      }

      const leave = result.rows[0];
      let affectedClasses = [];

      // On approval — flag all affected classes
      if (status === 'approved') {
        const affected = await client.query(`
          UPDATE classes
          SET status = 'cancelled',
              cancelled_reason = 'Teacher on approved leave'
          WHERE teacher_id = $1
            AND scheduled_date BETWEEN $2 AND $3
            AND status NOT IN ('cancelled','completed')
          RETURNING id, scheduled_date, start_time, subject_id
        `, [leave.teacher_id, leave.start_date, leave.end_date]);

        affectedClasses = affected.rows;
        logger.info(`Leave approved: ${affectedClasses.length} classes cancelled for teacher ${leave.teacher_id}`);
      }

      await client.query('COMMIT');
      return { leave, affectedClasses };

    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  // ── Admin: mark emergency absence ─────────────────────
  async markEmergency(teacherId, date, reason, markedBy) {
    const t = await query('SELECT id FROM teachers WHERE id = $1', [teacherId]);
    if (!t.rows.length) { const e = new Error('Teacher not found.'); e.statusCode = 404; throw e; }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Create an approved leave for that single day
      const lr = await client.query(`
        INSERT INTO leave_requests
          (teacher_id, leave_type, start_date, end_date, reason, status, reviewed_by, reviewed_at)
        VALUES ($1, 'emergency', $2, $2, $3, 'approved', $4, NOW())
        RETURNING *
      `, [teacherId, date, reason, markedBy]);

      // Cancel that day's classes
      const affected = await client.query(`
        UPDATE classes
        SET status = 'cancelled', cancelled_reason = 'Emergency absence: ' || $1
        WHERE teacher_id = $2
          AND scheduled_date = $3
          AND status NOT IN ('cancelled','completed')
        RETURNING id, scheduled_date, start_time
      `, [reason, teacherId, date]);

      await client.query('COMMIT');
      return { leaveRequest: lr.rows[0], cancelledClasses: affected.rows };

    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },

  // ── Get impact preview (before approving) ─────────────
  async getImpact(leaveId) {
    const lr = await query('SELECT * FROM leave_requests WHERE id = $1', [leaveId]);
    if (!lr.rows.length) { const e = new Error('Leave not found.'); e.statusCode = 404; throw e; }
    const { teacher_id, start_date, end_date } = lr.rows[0];

    const classes = await query(`
      SELECT c.id, c.scheduled_date, c.start_time, c.end_time,
             s.name AS subject, u.full_name AS teacher_name,
             COUNT(cs.student_id) AS student_count
      FROM classes c
      JOIN subjects s ON s.id = c.subject_id
      JOIN teachers t ON t.id = c.teacher_id
      JOIN users u ON u.id = t.user_id
      LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE c.teacher_id = $1
        AND c.scheduled_date BETWEEN $2 AND $3
        AND c.status NOT IN ('cancelled','completed')
      GROUP BY c.id, s.name, u.full_name
      ORDER BY c.scheduled_date, c.start_time
    `, [teacher_id, start_date, end_date]);

    return { totalAffected: classes.rows.length, classes: classes.rows };
  },
};

module.exports = leaveService;
