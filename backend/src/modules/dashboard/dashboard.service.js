// src/modules/dashboard/dashboard.service.js
const { query } = require('../../config/database');
const { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } = require('date-fns');

const dashboardService = {

  async getOverview() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const now   = new Date();

    const [classes, teachers, leave, conflicts, pendingAtt] = await Promise.all([

      // Today's class stats
      query(`
        SELECT
          COUNT(*)                                      AS total_today,
          COUNT(*) FILTER (WHERE status = 'ongoing')   AS ongoing_now,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_today,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_today,
          COUNT(*) FILTER (WHERE status = 'scheduled'
            AND start_time <= $2::time
            AND end_time >= $2::time)                   AS classes_now
        FROM classes WHERE scheduled_date = $1
      `, [today, format(now, 'HH:mm')]),

      // Teacher stats
      query(`
        SELECT
          COUNT(*) FILTER (WHERE t.is_active = TRUE)    AS total_active,
          -- teachers on leave today
          (SELECT COUNT(DISTINCT teacher_id) FROM leave_requests
           WHERE status = 'approved' AND $1::date BETWEEN start_date AND end_date) AS on_leave_today,
          -- overloaded (>=7.5h today)
          (SELECT COUNT(*) FROM (
            SELECT teacher_id, SUM(duration_minutes) AS mins
            FROM classes WHERE scheduled_date = $1 AND status != 'cancelled'
            GROUP BY teacher_id
            HAVING SUM(duration_minutes) >= 450
          ) ov) AS overloaded
        FROM teachers t
      `, [today]),

      // Pending leave requests
      query(`SELECT COUNT(*) AS pending_leave FROM leave_requests WHERE status = 'pending'`),

      // Active conflicts (scheduled classes on teacher's off day or leave — shouldn't exist but safety check)
      query(`
        SELECT COUNT(*) AS active_conflicts
        FROM classes c
        JOIN teachers t ON t.id = c.teacher_id
        WHERE c.status = 'scheduled'
          AND c.scheduled_date >= $1
          AND (
            LOWER(TO_CHAR(c.scheduled_date, 'day')) = LOWER(t.weekly_off_day::text)
            OR EXISTS (
              SELECT 1 FROM leave_requests lr
              WHERE lr.teacher_id = t.id AND lr.status = 'approved'
                AND c.scheduled_date BETWEEN lr.start_date AND lr.end_date
            )
          )
      `, [today]),

      // Pending attendance submissions
      query(`
        SELECT COUNT(DISTINCT c.id) AS pending_attendance
        FROM classes c
        WHERE c.status IN ('ongoing','scheduled')
          AND (c.scheduled_date < $1 OR
               (c.scheduled_date = $1 AND c.end_time < $2::time))
          AND EXISTS (
            SELECT 1 FROM class_students cs
            WHERE cs.class_id = c.id
            AND NOT EXISTS (
              SELECT 1 FROM attendance a
              WHERE a.class_id = c.id AND a.student_id = cs.student_id
            )
          )
      `, [today, format(now, 'HH:mm')]),
    ]);

    return {
      classes:           classes.rows[0],
      teachers:          teachers.rows[0],
      pendingLeave:      parseInt(leave.rows[0].pending_leave),
      activeConflicts:   parseInt(conflicts.rows[0].active_conflicts),
      pendingAttendance: parseInt(pendingAtt.rows[0].pending_attendance),
    };
  },

  async getCalendar(view, date) {
    let from, to;
    const d = parseISO(date);

    if (view === 'day') {
      from = to = date;
    } else if (view === 'week') {
      from = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      to   = format(endOfWeek(d,   { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else if (view === 'month') {
      from = format(startOfMonth(d), 'yyyy-MM-dd');
      to   = format(endOfMonth(d),   'yyyy-MM-dd');
    }

    const result = await query(`
      SELECT
        c.id, c.scheduled_date, c.start_time, c.end_time,
        c.duration_minutes, c.status, c.platform, c.meeting_link,
        s.name AS subject_name, s.code AS subject_code,
        u_t.full_name AS teacher_name, t.id AS teacher_id,
        COALESCE(co.name, '') AS course_name,
        COUNT(cs.student_id) AS student_count
      FROM classes c
      JOIN teachers t ON t.id = c.teacher_id
      JOIN users u_t ON u_t.id = t.user_id
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN courses co ON co.id = c.course_id
      LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE c.scheduled_date BETWEEN $1 AND $2
      GROUP BY c.id, s.name, s.code, u_t.full_name, t.id, co.name
      ORDER BY c.scheduled_date, c.start_time
    `, [from, to]);

    // Group by date for calendar rendering
    const byDate = {};
    for (const cls of result.rows) {
      const key = cls.scheduled_date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(cls);
    }

    return { view, from, to, totalClasses: result.rows.length, calendar: byDate };
  },

  async getTeacherAvailability(date) {
    const result = await query(`
      SELECT
        t.id, u.full_name, t.weekly_off_day,
        get_teacher_daily_hours(t.id, $1::date) AS hours_scheduled,
        t.max_hours_per_day,
        CASE
          WHEN LOWER(TO_CHAR($1::date, 'day')) = LOWER(t.weekly_off_day::text) THEN 'off_day'
          WHEN EXISTS (
            SELECT 1 FROM leave_requests lr
            WHERE lr.teacher_id = t.id AND lr.status = 'approved'
              AND $1::date BETWEEN lr.start_date AND lr.end_date
          ) THEN 'on_leave'
          WHEN get_teacher_daily_hours(t.id, $1::date) >= t.max_hours_per_day THEN 'fully_booked'
          ELSE 'available'
        END AS availability_status
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      WHERE t.is_active = TRUE
      ORDER BY u.full_name
    `, [date]);
    return result.rows;
  },
};

module.exports = dashboardService;
