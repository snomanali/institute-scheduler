// src/modules/reports/report.queries.js
// Pure data-fetching — no formatting, no HTTP. Used by all exporters.

const { query } = require('../../config/database');

const reportQueries = {

  // ── Teacher Workload ─────────────────────────────────────
  async teacherWorkload({ from, to, teacherId }) {
    const params = [from, to];
    let teacherFilter = '';
    if (teacherId) { params.push(teacherId); teacherFilter = `AND t.id = $${params.length}`; }

    const rows = await query(`
      SELECT
        t.id                                                          AS teacher_id,
        u.full_name                                                   AS teacher_name,
        u.email                                                       AS teacher_email,
        t.employee_code,
        t.max_hours_per_day,
        COUNT(c.id) FILTER (WHERE c.status != 'cancelled')           AS total_classes,
        COUNT(c.id) FILTER (WHERE c.status = 'completed')            AS completed_classes,
        COUNT(c.id) FILTER (WHERE c.status = 'cancelled')            AS cancelled_classes,
        COUNT(c.id) FILTER (WHERE c.status = 'scheduled')            AS upcoming_classes,
        COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status = 'completed'), 0)                  AS completed_minutes,
        COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0)                 AS scheduled_minutes,
        ROUND(COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status = 'completed'), 0) / 60.0, 2)      AS completed_hours,
        ROUND(COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0) / 60.0, 2)     AS scheduled_hours,
        -- subjects taught
        COALESCE(
          STRING_AGG(DISTINCT s.name, ', ') FILTER (WHERE s.id IS NOT NULL), ''
        )                                                             AS subjects_taught,
        -- daily breakdown
        JSONB_AGG(
          DISTINCT JSONB_BUILD_OBJECT(
            'date',     c.scheduled_date,
            'classes',  0,
            'minutes',  0
          )
        ) FILTER (WHERE c.id IS NOT NULL)                            AS daily_raw
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN classes c ON c.teacher_id = t.id
        AND c.scheduled_date BETWEEN $1 AND $2
      LEFT JOIN subjects s ON s.id = c.subject_id
      WHERE t.is_active = TRUE ${teacherFilter}
      GROUP BY t.id, u.full_name, u.email, t.employee_code, t.max_hours_per_day
      ORDER BY u.full_name
    `, params);

    // Per-day detail per teacher
    const daily = await query(`
      SELECT
        t.id AS teacher_id,
        c.scheduled_date,
        COUNT(*) FILTER (WHERE c.status != 'cancelled')        AS classes,
        COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0)           AS minutes,
        ROUND(COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0) / 60.0, 2) AS hours,
        t.max_hours_per_day,
        CASE WHEN COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0) / 60.0
          >= t.max_hours_per_day THEN true ELSE false END       AS overloaded
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN classes c ON c.teacher_id = t.id
        AND c.scheduled_date BETWEEN $1 AND $2
      WHERE t.is_active = TRUE ${teacherFilter}
      GROUP BY t.id, c.scheduled_date, t.max_hours_per_day
      HAVING c.scheduled_date IS NOT NULL
      ORDER BY t.id, c.scheduled_date
    `, params);

    return { summary: rows.rows, daily: daily.rows };
  },

  // ── Student Attendance ───────────────────────────────────
  async studentAttendance({ from, to, studentId, courseId, teacherId }) {
    const params = [from, to];
    const filters = [];
    if (studentId)  { params.push(studentId);  filters.push(`a.student_id = $${params.length}`); }
    if (courseId)   { params.push(courseId);    filters.push(`c.course_id  = $${params.length}`); }
    if (teacherId)  { params.push(teacherId);   filters.push(`c.teacher_id = $${params.length}`); }
    const where = filters.length ? 'AND ' + filters.join(' AND ') : '';

    // Per-student summary
    const summary = await query(`
      SELECT
        st.id                                                           AS student_id,
        u.full_name                                                     AS student_name,
        u.email                                                         AS student_email,
        st.student_code,
        COUNT(a.id)                                                     AS total_classes,
        COUNT(a.id) FILTER (WHERE a.status = 'present')                AS present,
        COUNT(a.id) FILTER (WHERE a.status = 'late')                   AS late,
        COUNT(a.id) FILTER (WHERE a.status = 'absent')                 AS absent,
        COUNT(a.id) FILTER (WHERE a.status = 'excused')                AS excused,
        COUNT(a.id) FILTER (WHERE a.status = 'technical_issue')        AS technical_issue,
        ROUND(
          COUNT(a.id) FILTER (WHERE a.status IN ('present','late'))
          * 100.0 / NULLIF(COUNT(a.id), 0), 1
        )                                                               AS attendance_pct,
        COALESCE(AVG(a.late_minutes) FILTER (WHERE a.status = 'late'), 0)::INTEGER AS avg_late_minutes
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN attendance a ON a.student_id = st.id
      LEFT JOIN classes c ON c.id = a.class_id
        AND c.scheduled_date BETWEEN $1 AND $2
      WHERE st.is_active = TRUE ${where}
      GROUP BY st.id, u.full_name, u.email, st.student_code
      ORDER BY u.full_name
    `, params);

    // Detailed records
    const detail = await query(`
      SELECT
        u.full_name                 AS student_name,
        c.scheduled_date,
        c.start_time,
        c.end_time,
        s.name                      AS subject,
        COALESCE(co.name, '')       AS course,
        u_t.full_name               AS teacher,
        a.status,
        a.late_minutes,
        a.remarks,
        a.marked_at
      FROM attendance a
      JOIN students st ON st.id = a.student_id
      JOIN users u ON u.id = st.user_id
      JOIN classes c ON c.id = a.class_id
      JOIN subjects s ON s.id = c.subject_id
      JOIN teachers t ON t.id = c.teacher_id
      JOIN users u_t ON u_t.id = t.user_id
      LEFT JOIN courses co ON co.id = c.course_id
      WHERE c.scheduled_date BETWEEN $1 AND $2 ${where}
      ORDER BY u.full_name, c.scheduled_date, c.start_time
    `, params);

    return { summary: summary.rows, detail: detail.rows };
  },

  // ── Schedule Utilisation ─────────────────────────────────
  async scheduleUtilisation({ from, to }) {
    const result = await query(`
      SELECT
        c.scheduled_date                                              AS date,
        TO_CHAR(c.scheduled_date, 'Day')                             AS day_name,
        COUNT(*) FILTER (WHERE c.status != 'cancelled')              AS scheduled,
        COUNT(*) FILTER (WHERE c.status = 'completed')               AS completed,
        COUNT(*) FILTER (WHERE c.status = 'cancelled')               AS cancelled,
        COUNT(*) FILTER (WHERE c.status = 'rescheduled')             AS rescheduled,
        COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0)                 AS total_minutes,
        ROUND(COALESCE(SUM(c.duration_minutes)
          FILTER (WHERE c.status != 'cancelled'), 0) / 60.0, 2)     AS total_hours,
        COUNT(DISTINCT c.teacher_id)
          FILTER (WHERE c.status != 'cancelled')                     AS teachers_active,
        COUNT(DISTINCT cs.student_id)
          FILTER (WHERE c.status != 'cancelled')                     AS students_in_classes
      FROM classes c
      LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE c.scheduled_date BETWEEN $1 AND $2
      GROUP BY c.scheduled_date
      ORDER BY c.scheduled_date
    `, [from, to]);

    const totals = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'cancelled')  AS total_scheduled,
        COUNT(*) FILTER (WHERE status = 'completed')   AS total_completed,
        COUNT(*) FILTER (WHERE status = 'cancelled')   AS total_cancelled,
        ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0
          / NULLIF(COUNT(*) FILTER (WHERE status != 'cancelled'), 0), 1) AS completion_rate,
        ROUND(SUM(duration_minutes)
          FILTER (WHERE status != 'cancelled') / 60.0, 1)             AS total_hours
      FROM classes WHERE scheduled_date BETWEEN $1 AND $2
    `, [from, to]);

    return { daily: result.rows, totals: totals.rows[0] };
  },

  // ── Cancelled / Rescheduled ──────────────────────────────
  async cancelledClasses({ from, to, teacherId }) {
    const params = [from, to];
    let filter = '';
    if (teacherId) { params.push(teacherId); filter = `AND c.teacher_id = $${params.length}`; }

    const result = await query(`
      SELECT
        c.id, c.scheduled_date, c.start_time, c.end_time,
        c.status, c.cancelled_reason,
        s.name                    AS subject,
        COALESCE(co.name, '')     AS course,
        u_t.full_name             AS teacher,
        t.employee_code,
        COUNT(cs.student_id)      AS student_count,
        c.updated_at              AS status_changed_at
      FROM classes c
      JOIN subjects s ON s.id = c.subject_id
      JOIN teachers t ON t.id = c.teacher_id
      JOIN users u_t ON u_t.id = t.user_id
      LEFT JOIN courses co ON co.id = c.course_id
      LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE c.scheduled_date BETWEEN $1 AND $2
        AND c.status IN ('cancelled','rescheduled') ${filter}
      GROUP BY c.id, s.name, co.name, u_t.full_name, t.employee_code
      ORDER BY c.scheduled_date DESC
    `, params);

    return result.rows;
  },

  // ── Leave Report ─────────────────────────────────────────
  async leaveReport({ from, to, teacherId }) {
    const params = [from, to];
    let filter = '';
    if (teacherId) { params.push(teacherId); filter = `AND t.id = $${params.length}`; }

    const result = await query(`
      SELECT
        u.full_name           AS teacher_name,
        t.employee_code,
        lr.leave_type,
        lr.start_date,
        lr.end_date,
        (lr.end_date - lr.start_date + 1)  AS days_taken,
        lr.reason,
        lr.status,
        lr.review_notes,
        u_r.full_name         AS reviewed_by,
        lr.reviewed_at,
        -- classes affected
        (SELECT COUNT(*) FROM classes c
         WHERE c.teacher_id = t.id
           AND c.status = 'cancelled'
           AND c.cancelled_reason ILIKE '%leave%'
           AND c.scheduled_date BETWEEN lr.start_date AND lr.end_date
        ) AS classes_affected
      FROM leave_requests lr
      JOIN teachers t ON t.id = lr.teacher_id
      JOIN users u ON u.id = t.user_id
      LEFT JOIN users u_r ON u_r.id = lr.reviewed_by
      WHERE (lr.start_date BETWEEN $1 AND $2 OR lr.end_date BETWEEN $1 AND $2)
        ${filter}
      ORDER BY lr.start_date DESC
    `, params);

    // Summary per teacher
    const summary = await query(`
      SELECT
        u.full_name     AS teacher_name,
        t.employee_code,
        COUNT(lr.id)    AS total_requests,
        COUNT(lr.id) FILTER (WHERE lr.status = 'approved')  AS approved,
        COUNT(lr.id) FILTER (WHERE lr.status = 'rejected')  AS rejected,
        COUNT(lr.id) FILTER (WHERE lr.status = 'pending')   AS pending,
        SUM(lr.end_date - lr.start_date + 1)
          FILTER (WHERE lr.status = 'approved')             AS total_days_taken
      FROM leave_requests lr
      JOIN teachers t ON t.id = lr.teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE (lr.start_date BETWEEN $1 AND $2 OR lr.end_date BETWEEN $1 AND $2)
        ${filter}
      GROUP BY u.full_name, t.employee_code
      ORDER BY u.full_name
    `, params);

    return { records: result.rows, summary: summary.rows };
  },

  // ── Course Progress ──────────────────────────────────────
  async courseProgress({ from, to, courseId }) {
    const params = [from, to];
    let filter = '';
    if (courseId) { params.push(courseId); filter = `AND c.course_id = $${params.length}`; }

    const result = await query(`
      SELECT
        co.id, co.name AS course_name, co.code AS course_code,
        co.total_sessions AS planned_sessions,
        COUNT(c.id) FILTER (WHERE c.status = 'completed')     AS completed_sessions,
        COUNT(c.id) FILTER (WHERE c.status != 'cancelled')    AS scheduled_sessions,
        COUNT(c.id) FILTER (WHERE c.status = 'cancelled')     AS cancelled_sessions,
        ROUND(
          COUNT(c.id) FILTER (WHERE c.status = 'completed')
          * 100.0 / NULLIF(co.total_sessions, 0), 1
        )                                                      AS completion_pct,
        COUNT(DISTINCT ce.student_id)                          AS enrolled_students,
        COALESCE(STRING_AGG(DISTINCT u.full_name, ', '), '')   AS teachers
      FROM courses co
      LEFT JOIN classes c ON c.course_id = co.id
        AND c.scheduled_date BETWEEN $1 AND $2
      LEFT JOIN teachers t ON t.id = c.teacher_id
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN course_enrollments ce ON ce.course_id = co.id AND ce.is_active = TRUE
      WHERE co.is_active = TRUE ${filter}
      GROUP BY co.id, co.name, co.code, co.total_sessions
      ORDER BY co.name
    `, params);

    return result.rows;
  },
};

module.exports = reportQueries;
