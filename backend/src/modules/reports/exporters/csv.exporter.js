// src/modules/reports/exporters/csv.exporter.js
// RFC 4180 compliant CSV — streams directly to response

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(t) { return t ? String(t).substring(0, 5) : ''; }

// Escape a cell value for CSV
function esc(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCSV(values) {
  return values.map(esc).join(',');
}

function sendCSV(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM for Excel compatibility
  res.write('\uFEFF');
  for (const row of rows) {
    res.write(rowToCSV(row) + '\r\n');
  }
  res.end();
}

// ── Teacher Workload CSV ──────────────────────────────────
function buildTeacherWorkload(res, data, { from, to }) {
  const rows = [
    ['Teacher Workload Report'],
    [`Period: ${fmtDate(from)} to ${fmtDate(to)}`],
    [`Generated: ${new Date().toLocaleString('en-GB')}`],
    [],
    ['Teacher Name','Employee Code','Total Classes','Completed','Cancelled',
     'Upcoming','Hours Completed','Hours Scheduled','Daily Limit (hrs)','Subjects Taught'],
    ...data.summary.map(t => [
      t.teacher_name, t.employee_code || '',
      t.total_classes, t.completed_classes, t.cancelled_classes, t.upcoming_classes,
      parseFloat(t.completed_hours).toFixed(1),
      parseFloat(t.scheduled_hours).toFixed(1),
      t.max_hours_per_day,
      t.subjects_taught || '',
    ]),
    [],
    ['DAILY BREAKDOWN'],
    ['Teacher ID','Date','Classes','Hours','Overloaded'],
    ...data.daily.map(d => [
      d.teacher_id, fmtDate(d.scheduled_date),
      d.classes, parseFloat(d.hours).toFixed(1),
      d.overloaded ? 'YES' : 'No',
    ]),
  ];
  sendCSV(res, `teacher-workload-${from}-${to}.csv`, rows);
}

// ── Attendance CSV ────────────────────────────────────────
function buildAttendanceReport(res, data, { from, to }) {
  const rows = [
    ['Student Attendance Report'],
    [`Period: ${fmtDate(from)} to ${fmtDate(to)}`],
    [`Generated: ${new Date().toLocaleString('en-GB')}`],
    [],
    ['SUMMARY'],
    ['Student Name','Student Code','Total','Present','Late','Absent','Excused',
     'Technical Issue','Attendance %','Avg Late Minutes'],
    ...data.summary.map(s => [
      s.student_name, s.student_code || '',
      s.total_classes, s.present, s.late, s.absent,
      s.excused, s.technical_issue,
      parseFloat(s.attendance_pct || 0).toFixed(1) + '%',
      s.avg_late_minutes || 0,
    ]),
    [],
    ['DETAIL RECORDS'],
    ['Student','Date','Start Time','End Time','Subject','Course','Teacher',
     'Status','Late Minutes','Remarks'],
    ...data.detail.map(d => [
      d.student_name, fmtDate(d.scheduled_date),
      fmtTime(d.start_time), fmtTime(d.end_time),
      d.subject, d.course || '', d.teacher,
      d.status?.replace('_', ' ') || '',
      d.late_minutes || '', d.remarks || '',
    ]),
  ];
  sendCSV(res, `attendance-report-${from}-${to}.csv`, rows);
}

// ── Leave CSV ─────────────────────────────────────────────
function buildLeaveReport(res, data, { from, to }) {
  const rows = [
    ['Leave Report'],
    [`Period: ${fmtDate(from)} to ${fmtDate(to)}`],
    [`Generated: ${new Date().toLocaleString('en-GB')}`],
    [],
    ['TEACHER SUMMARY'],
    ['Teacher Name','Employee Code','Total Requests','Approved','Rejected','Pending','Total Days Taken'],
    ...data.summary.map(s => [
      s.teacher_name, s.employee_code || '',
      s.total_requests, s.approved, s.rejected, s.pending,
      s.total_days_taken || 0,
    ]),
    [],
    ['LEAVE RECORDS'],
    ['Teacher','Code','Leave Type','Start Date','End Date','Days','Status',
     'Classes Affected','Reviewed By','Review Notes','Reason'],
    ...data.records.map(r => [
      r.teacher_name, r.employee_code || '',
      r.leave_type, fmtDate(r.start_date), fmtDate(r.end_date),
      r.days_taken, r.status,
      r.classes_affected || 0,
      r.reviewed_by || '', r.review_notes || '', r.reason || '',
    ]),
  ];
  sendCSV(res, `leave-report-${from}-${to}.csv`, rows);
}

// ── Schedule Utilisation CSV ──────────────────────────────
function buildUtilisationReport(res, data, { from, to }) {
  const { totals } = data;
  const rows = [
    ['Schedule Utilisation Report'],
    [`Period: ${fmtDate(from)} to ${fmtDate(to)}`],
    [`Generated: ${new Date().toLocaleString('en-GB')}`],
    [],
    ['SUMMARY'],
    ['Total Scheduled','Total Completed','Total Cancelled','Completion Rate','Total Hours'],
    [
      totals.total_scheduled, totals.total_completed, totals.total_cancelled,
      (totals.completion_rate || 0) + '%',
      parseFloat(totals.total_hours || 0).toFixed(1) + 'h',
    ],
    [],
    ['DAILY BREAKDOWN'],
    ['Date','Day','Scheduled','Completed','Cancelled','Rescheduled','Hours','Teachers Active','Students in Classes'],
    ...data.daily.map(d => [
      fmtDate(d.date), d.day_name?.trim(),
      d.scheduled, d.completed, d.cancelled, d.rescheduled,
      parseFloat(d.total_hours).toFixed(1),
      d.teachers_active, d.students_in_classes,
    ]),
  ];
  sendCSV(res, `utilisation-${from}-${to}.csv`, rows);
}

// ── Course Progress CSV ───────────────────────────────────
function buildCourseProgress(res, data, { from, to }) {
  const rows = [
    ['Course Progress Report'],
    [`Period: ${fmtDate(from)} to ${fmtDate(to)}`],
    [`Generated: ${new Date().toLocaleString('en-GB')}`],
    [],
    ['Course Name','Course Code','Planned Sessions','Completed','Scheduled',
     'Cancelled','Progress %','Enrolled Students','Teachers'],
    ...data.map(c => [
      c.course_name, c.course_code || '',
      c.planned_sessions || '', c.completed_sessions,
      c.scheduled_sessions, c.cancelled_sessions,
      parseFloat(c.completion_pct || 0).toFixed(1) + '%',
      c.enrolled_students, c.teachers || '',
    ]),
  ];
  sendCSV(res, `course-progress-${from}-${to}.csv`, rows);
}

module.exports = {
  buildTeacherWorkload,
  buildAttendanceReport,
  buildLeaveReport,
  buildUtilisationReport,
  buildCourseProgress,
};
