// src/modules/classes/class.service.js
const { query, getClient }  = require('../../config/database');
const conflictEngine        = require('./conflict.engine');
const { addDays, parseISO, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = require('date-fns');

// ── Helpers ────────────────────────────────────────────────

const DAY_MAP = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };

function computeEndTime(startTime, durationMinutes) {
  const [h, m] = startTime.split(':').map(Number);
  const total  = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

// Generate all dates for a recurrence rule
function expandRecurrence({ frequency, daysOfWeek = [], startDate, endDate, totalSessions }) {
  const dates  = [];
  const start  = parseISO(startDate);
  const end    = endDate ? parseISO(endDate) : addDays(start, 365); // safety cap
  let   cursor = start;
  const dayNums = daysOfWeek.map(d => DAY_MAP[d.toLowerCase()]);

  while (cursor <= end && (!totalSessions || dates.length < totalSessions)) {
    if (frequency === 'daily') {
      dates.push(format(cursor, 'yyyy-MM-dd'));
      cursor = addDays(cursor, 1);
    } else if (frequency === 'weekly') {
      if (!dayNums.length || dayNums.includes(cursor.getDay())) {
        dates.push(format(cursor, 'yyyy-MM-dd'));
      }
      cursor = addDays(cursor, 1);
    } else if (frequency === 'monthly') {
      dates.push(format(cursor, 'yyyy-MM-dd'));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    }
    if (dates.length > 500) break; // hard cap
  }
  return dates;
}

// ── Service ────────────────────────────────────────────────

const classService = {

  // ── Get classes (admin — filtered) ────────────────────
  async getAll({ date, from, to, teacherId, courseId, status, view } = {}) {
    let rangeFrom = from, rangeTo = to;

    if (view && date) {
      const d = parseISO(date);
      if (view === 'day')   { rangeFrom = rangeTo = date; }
      if (view === 'week')  { rangeFrom = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                               rangeTo   = format(endOfWeek(d,   { weekStartsOn: 1 }), 'yyyy-MM-dd'); }
      if (view === 'month') { rangeFrom = format(startOfMonth(d), 'yyyy-MM-dd');
                               rangeTo   = format(endOfMonth(d),  'yyyy-MM-dd'); }
    } else if (date) {
      rangeFrom = rangeTo = date;
    }

    let sql = `
      SELECT
        c.id, c.title, c.scheduled_date, c.start_time, c.end_time,
        c.duration_minutes, c.platform, c.meeting_link, c.status,
        c.is_recurring, c.notes, c.cancelled_reason,
        -- teacher
        JSONB_BUILD_OBJECT(
          'id', t.id, 'name', u_t.full_name, 'email', u_t.email
        ) AS teacher,
        -- subject
        JSONB_BUILD_OBJECT('id', s.id, 'name', s.name, 'code', s.code) AS subject,
        -- course
        CASE WHEN co.id IS NOT NULL
          THEN JSONB_BUILD_OBJECT('id', co.id, 'name', co.name)
          ELSE NULL
        END AS course,
        -- students
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', st.id, 'name', u_s.full_name
            )
          ) FILTER (WHERE st.id IS NOT NULL), '[]'
        ) AS students,
        COUNT(DISTINCT cs2.student_id) AS student_count
      FROM classes c
      JOIN teachers t  ON t.id  = c.teacher_id
      JOIN users u_t   ON u_t.id = t.user_id
      JOIN subjects s  ON s.id  = c.subject_id
      LEFT JOIN courses co ON co.id = c.course_id
      LEFT JOIN class_students cs2 ON cs2.class_id = c.id
      LEFT JOIN students st  ON st.id = cs2.student_id
      LEFT JOIN users u_s    ON u_s.id = st.user_id
      WHERE 1=1
    `;
    const params = [];

    if (rangeFrom) { params.push(rangeFrom); sql += ` AND c.scheduled_date >= $${params.length}`; }
    if (rangeTo)   { params.push(rangeTo);   sql += ` AND c.scheduled_date <= $${params.length}`; }
    if (teacherId) { params.push(teacherId); sql += ` AND c.teacher_id = $${params.length}`; }
    if (courseId)  { params.push(courseId);  sql += ` AND c.course_id = $${params.length}`; }
    if (status)    { params.push(status);    sql += ` AND c.status = $${params.length}`; }

    sql += ' GROUP BY c.id, t.id, u_t.id, s.id, co.id ORDER BY c.scheduled_date, c.start_time';
    return (await query(sql, params)).rows;
  },

  // ── Get single class ───────────────────────────────────
  async getById(id) {
    const result = await this.getAll({});
    // reuse same query with id filter
    const r = await query(`
      SELECT c.*, 
        JSONB_BUILD_OBJECT('id', t.id, 'name', u_t.full_name) AS teacher,
        JSONB_BUILD_OBJECT('id', s.id, 'name', s.name)        AS subject,
        COALESCE(
          JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('id', st.id, 'name', u_s.full_name, 'status', a.status))
          FILTER (WHERE st.id IS NOT NULL), '[]'
        ) AS students
      FROM classes c
      JOIN teachers t ON t.id = c.teacher_id JOIN users u_t ON u_t.id = t.user_id
      JOIN subjects s ON s.id = c.subject_id
      LEFT JOIN class_students cs ON cs.class_id = c.id
      LEFT JOIN students st ON st.id = cs.student_id
      LEFT JOIN users u_s ON u_s.id = st.user_id
      LEFT JOIN attendance a ON a.class_id = c.id AND a.student_id = st.id
      WHERE c.id = $1
      GROUP BY c.id, t.id, u_t.id, s.id
    `, [id]);
    if (!r.rows.length) { const e = new Error('Class not found.'); e.statusCode = 404; throw e; }
    return r.rows[0];
  },

  // ── Create single or recurring classes ────────────────
  async create({
    teacherId, subjectId, courseId, title,
    scheduledDate, startTime, durationMinutes,
    platform, meetingLink, meetingId,
    studentIds = [], groupId,
    notes, recurrence,
    createdBy,
  }) {
    const endTime = computeEndTime(startTime, durationMinutes);

    // Resolve students from group if groupId given
    let allStudentIds = [...studentIds];
    if (groupId) {
      const gm = await query('SELECT student_id FROM student_group_members WHERE group_id = $1', [groupId]);
      allStudentIds = [...new Set([...allStudentIds, ...gm.rows.map(r => r.student_id)])];
    }

    // Expand dates (single or recurring)
    let dates = [scheduledDate];
    let recurrenceRuleId = null;

    if (recurrence) {
      const rec = await query(`
        INSERT INTO recurrence_rules (frequency, days_of_week, start_date, end_date, total_sessions)
        VALUES ($1, $2, $3, $4, $5) RETURNING id
      `, [
        recurrence.frequency,
        recurrence.daysOfWeek || null,
        recurrence.startDate  || scheduledDate,
        recurrence.endDate    || null,
        recurrence.totalSessions || null,
      ]);
      recurrenceRuleId = rec.rows[0].id;
      dates = expandRecurrence({ ...recurrence, startDate: recurrence.startDate || scheduledDate });
    }

    // Check conflicts for ALL dates before creating anything
    const allConflicts = [];
    for (const date of dates) {
      const check = await conflictEngine.check({
        teacherId, subjectId, date, startTime, durationMinutes,
        studentIds: allStudentIds,
      });
      if (!check.valid) {
        allConflicts.push({ date, conflicts: check.conflicts });
      }
    }

    if (allConflicts.length) {
      const err = new Error('Scheduling conflict detected.');
      err.statusCode = 409;
      err.conflicts  = allConflicts;
      throw err;
    }

    // All clear — insert all classes in a transaction
    const client = await getClient();
    const created = [];
    try {
      await client.query('BEGIN');

      for (const date of dates) {
        const r = await client.query(`
          INSERT INTO classes (
            teacher_id, subject_id, course_id, title,
            scheduled_date, start_time, end_time, duration_minutes,
            platform, meeting_link, meeting_id,
            is_recurring, recurrence_rule_id, notes, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING id
        `, [
          teacherId, subjectId, courseId || null, title || null,
          date, startTime, endTime, durationMinutes,
          platform, meetingLink || null, meetingId || null,
          !!recurrence, recurrenceRuleId, notes || null, createdBy,
        ]);
        const classId = r.rows[0].id;

        // Assign students
        for (const sid of allStudentIds) {
          await client.query(
            'INSERT INTO class_students (class_id, student_id, group_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [classId, sid, groupId || null]
          );
        }

        created.push(classId);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { created: created.length, classIds: created };
  },

  // ── Update / Reschedule ────────────────────────────────
  async update(id, updates, updatedBy) {
    const existing = await this.getById(id);

    const newDate     = updates.scheduledDate  || existing.scheduled_date;
    const newStart    = updates.startTime      || existing.start_time;
    const newDuration = updates.durationMinutes|| existing.duration_minutes;
    const newTeacher  = updates.teacherId      || existing.teacher.id;
    const newSubject  = updates.subjectId      || existing.subject.id;
    const newEnd      = computeEndTime(newStart, newDuration);

    const studentIds = existing.students.map(s => s.id);

    // Conflict check excluding this class
    const check = await conflictEngine.check({
      teacherId:       newTeacher,
      subjectId:       newSubject,
      date:            newDate,
      startTime:       newStart,
      durationMinutes: newDuration,
      studentIds,
      excludeClassId:  id,
    });

    if (!check.valid) {
      const err = new Error('Scheduling conflict detected.');
      err.statusCode = 409;
      err.conflicts  = check.conflicts;
      throw err;
    }

    const result = await query(`
      UPDATE classes SET
        teacher_id       = COALESCE($1, teacher_id),
        subject_id       = COALESCE($2, subject_id),
        scheduled_date   = COALESCE($3, scheduled_date),
        start_time       = COALESCE($4, start_time),
        end_time         = $5,
        duration_minutes = COALESCE($6, duration_minutes),
        platform         = COALESCE($7, platform),
        meeting_link     = COALESCE($8, meeting_link),
        notes            = COALESCE($9, notes),
        status           = COALESCE($10, status)
      WHERE id = $11 RETURNING *
    `, [
      updates.teacherId || null,
      updates.subjectId || null,
      updates.scheduledDate || null,
      updates.startTime || null,
      newEnd,
      updates.durationMinutes || null,
      updates.platform || null,
      updates.meetingLink || null,
      updates.notes || null,
      updates.status || null,
      id,
    ]);

    return result.rows[0];
  },

  // ── Cancel ─────────────────────────────────────────────
  async cancel(id, reason) {
    const result = await query(`
      UPDATE classes SET status = 'cancelled', cancelled_reason = $1
      WHERE id = $2 AND status != 'cancelled'
      RETURNING *
    `, [reason, id]);
    if (!result.rows.length) { const e = new Error('Class not found or already cancelled.'); e.statusCode = 404; throw e; }
    return result.rows[0];
  },

  // ── Teacher: my schedule ───────────────────────────────
  async getMySchedule(teacherId, date) {
    return this.getAll({ date, teacherId });
  },

  async getMyWeek(teacherId, date) {
    return this.getAll({ view: 'week', date, teacherId });
  },

  // ── Update class status (ongoing, completed) ───────────
  async updateStatus(id, status) {
    const valid = ['scheduled','ongoing','completed','cancelled'];
    if (!valid.includes(status)) {
      const e = new Error('Invalid status.'); e.statusCode = 400; throw e;
    }
    const result = await query(
      'UPDATE classes SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  },
};

module.exports = classService;
