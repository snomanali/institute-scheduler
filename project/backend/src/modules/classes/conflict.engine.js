// src/modules/classes/conflict.engine.js
// ─────────────────────────────────────────────────────────────
//  Conflict Engine
//  Checks ALL business rules before a class is created/updated
//  Returns: { valid: bool, conflicts: [{ type, detail }] }
// ─────────────────────────────────────────────────────────────
const { query } = require('../../config/database');
const { format, parseISO, addMinutes } = require('date-fns');

const conflictEngine = {

  /**
   * Main entry point — runs all checks
   * @param {object} params
   * @param {string} params.teacherId
   * @param {string} params.subjectId
   * @param {string} params.date          YYYY-MM-DD
   * @param {string} params.startTime     HH:MM
   * @param {number} params.durationMinutes
   * @param {string[]} params.studentIds  optional
   * @param {string}  params.excludeClassId  when updating
   */
  async check({ teacherId, subjectId, date, startTime, durationMinutes, studentIds = [], excludeClassId = null }) {
    const conflicts = [];

    // compute end time
    const [h, m]  = startTime.split(':').map(Number);
    const startDt = new Date(`${date}T${startTime}:00`);
    const endDt   = addMinutes(startDt, durationMinutes);
    const endTime = `${String(endDt.getHours()).padStart(2,'0')}:${String(endDt.getMinutes()).padStart(2,'0')}`;

    // Run all checks in parallel
    await Promise.all([
      this._checkPastDate(date, startTime, conflicts),
      this._checkWeeklyOff(teacherId, date, conflicts),
      this._checkTeacherLeave(teacherId, date, conflicts),
      this._checkTeacherOverlap(teacherId, date, startTime, endTime, excludeClassId, conflicts),
      this._checkDailyHoursLimit(teacherId, date, durationMinutes, excludeClassId, conflicts),
      this._checkSubjectExpertise(teacherId, subjectId, conflicts),
      this._checkStudentOverlap(studentIds, date, startTime, endTime, excludeClassId, conflicts),
    ]);

    return { valid: conflicts.length === 0, conflicts };
  },

  // ── Individual checks ──────────────────────────────────

  async _checkPastDate(date, startTime, conflicts) {
    const classDateTime = new Date(`${date}T${startTime}:00`);
    if (classDateTime < new Date()) {
      conflicts.push({
        type:   'past_date',
        detail: `Cannot schedule a class in the past (${date} ${startTime}).`,
      });
    }
  },

  async _checkWeeklyOff(teacherId, date, conflicts) {
    const result = await query(
      'SELECT weekly_off_day FROM teachers WHERE id = $1',
      [teacherId]
    );
    if (!result.rows.length) return;

    const offDay    = result.rows[0].weekly_off_day;                     // e.g. 'friday'
    const dayOfWeek = format(parseISO(date), 'EEEE').toLowerCase();      // e.g. 'friday'

    if (dayOfWeek === offDay) {
      conflicts.push({
        type:   'weekly_off',
        detail: `${date} is this teacher's weekly off day (${offDay}).`,
      });
    }
  },

  async _checkTeacherLeave(teacherId, date, conflicts) {
    const result = await query(`
      SELECT id, leave_type, start_date, end_date
      FROM leave_requests
      WHERE teacher_id = $1
        AND status = 'approved'
        AND $2::date BETWEEN start_date AND end_date
    `, [teacherId, date]);

    if (result.rows.length) {
      const lr = result.rows[0];
      conflicts.push({
        type:   'teacher_on_leave',
        detail: `Teacher is on approved ${lr.leave_type} leave (${lr.start_date} – ${lr.end_date}).`,
      });
    }
  },

  async _checkTeacherOverlap(teacherId, date, startTime, endTime, excludeClassId, conflicts) {
    // Uses the DB function but also retrieves detail for the message
    const result = await query(`
      SELECT id, start_time, end_time, duration_minutes,
             (SELECT name FROM subjects WHERE id = c.subject_id) AS subject_name
      FROM classes c
      WHERE teacher_id = $1
        AND scheduled_date = $2
        AND status NOT IN ('cancelled', 'rescheduled')
        AND ($3 IS NULL OR id != $3::uuid)
        AND (
          $4::time < (end_time + (
            (SELECT buffer_minutes FROM teachers WHERE id = $1)::text || ' minutes'
          )::interval)
          AND
          $5::time > (start_time - (
            (SELECT buffer_minutes FROM teachers WHERE id = $1)::text || ' minutes'
          )::interval)
        )
    `, [teacherId, date, excludeClassId, startTime, endTime]);

    for (const cls of result.rows) {
      conflicts.push({
        type:   'teacher_overlap',
        detail: `Teacher has a ${cls.subject_name} class from ${cls.start_time}–${cls.end_time} (including buffer time).`,
      });
    }
  },

  async _checkDailyHoursLimit(teacherId, date, newDurationMinutes, excludeClassId, conflicts) {
    const result = await query(`
      SELECT
        COALESCE(SUM(c.duration_minutes), 0) AS scheduled_minutes,
        t.max_hours_per_day
      FROM teachers t
      LEFT JOIN classes c ON c.teacher_id = t.id
        AND c.scheduled_date = $2
        AND c.status NOT IN ('cancelled','rescheduled')
        AND ($3 IS NULL OR c.id != $3::uuid)
      WHERE t.id = $1
      GROUP BY t.max_hours_per_day
    `, [teacherId, date, excludeClassId]);

    if (!result.rows.length) return;

    const { scheduled_minutes, max_hours_per_day } = result.rows[0];
    const maxMinutes   = max_hours_per_day * 60;
    const totalMinutes = parseInt(scheduled_minutes) + newDurationMinutes;

    if (totalMinutes > maxMinutes) {
      const scheduledHrs = (parseInt(scheduled_minutes) / 60).toFixed(1);
      const addingHrs    = (newDurationMinutes / 60).toFixed(1);
      conflicts.push({
        type:   'daily_limit_exceeded',
        detail: `Teacher has ${scheduledHrs}h scheduled. Adding ${addingHrs}h would exceed the ${max_hours_per_day}h daily limit.`,
      });
    }
  },

  async _checkSubjectExpertise(teacherId, subjectId, conflicts) {
    const result = await query(`
      SELECT proficiency FROM teacher_expertise
      WHERE teacher_id = $1 AND subject_id = $2
    `, [teacherId, subjectId]);

    if (!result.rows.length) {
      const sub = await query('SELECT name FROM subjects WHERE id = $1', [subjectId]);
      const subjectName = sub.rows[0]?.name || subjectId;
      conflicts.push({
        type:   'no_expertise',
        detail: `Teacher does not have expertise in "${subjectName}".`,
      });
    }
  },

  async _checkStudentOverlap(studentIds, date, startTime, endTime, excludeClassId, conflicts) {
    if (!studentIds.length) return;

    const result = await query(`
      SELECT
        cs.student_id,
        u.full_name,
        c.start_time, c.end_time
      FROM class_students cs
      JOIN classes c ON c.id = cs.class_id
      JOIN students st ON st.id = cs.student_id
      JOIN users u ON u.id = st.user_id
      WHERE cs.student_id = ANY($1::uuid[])
        AND c.scheduled_date = $2
        AND c.status NOT IN ('cancelled','rescheduled')
        AND ($3 IS NULL OR c.id != $3::uuid)
        AND $4::time < c.end_time
        AND $5::time > c.start_time
    `, [studentIds, date, excludeClassId, startTime, endTime]);

    for (const row of result.rows) {
      conflicts.push({
        type:   'student_overlap',
        detail: `Student "${row.full_name}" already has a class from ${row.start_time}–${row.end_time}.`,
      });
    }
  },
};

module.exports = conflictEngine;
