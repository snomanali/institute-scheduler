// src/modules/reports/exporters/pdf.exporter.js
const PDFDocument = require('pdfkit');

// ── Design tokens ─────────────────────────────────────────
const COLORS = {
  primary:   '#1455C0',
  dark:      '#0F1923',
  mid:       '#3A4A58',
  soft:      '#6B7E8F',
  rule:      '#D4DCE3',
  page:      '#F7F9FB',
  white:     '#FFFFFF',
  green:     '#0A7A55',
  red:       '#B5261E',
  amber:     '#C47A00',
};

const FONT = {
  regular: 'Helvetica',
  bold:    'Helvetica-Bold',
};

// ── Helper: format date ───────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '—';
  return String(t).substring(0, 5);
}

// ── Base builder ──────────────────────────────────────────
function createDoc(res, filename) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

function drawHeader(doc, title, subtitle, from, to) {
  // Top bar
  doc.rect(0, 0, doc.page.width, 72).fill(COLORS.dark);

  doc.font(FONT.bold).fontSize(18).fillColor(COLORS.white)
     .text('Institute Schedule Manager', 50, 20);
  doc.font(FONT.regular).fontSize(9).fillColor('#6B8EA8')
     .text(`Generated: ${new Date().toLocaleString('en-GB')}`, 50, 44);

  // Report title block
  doc.rect(0, 72, doc.page.width, 48).fill(COLORS.primary);
  doc.font(FONT.bold).fontSize(14).fillColor(COLORS.white)
     .text(title, 50, 82);
  doc.font(FONT.regular).fontSize(9).fillColor('#A0C8FF')
     .text(`${subtitle}  ·  Period: ${fmtDate(from)} – ${fmtDate(to)}`, 50, 102);

  doc.moveDown(4);
  return doc;
}

function drawSectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.font(FONT.bold).fontSize(10).fillColor(COLORS.primary).text(text.toUpperCase());
  doc.moveDown(0.2);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
     .strokeColor(COLORS.primary).lineWidth(1).stroke();
  doc.moveDown(0.4);
}

function drawTable(doc, headers, rows, colWidths) {
  const startX   = 50;
  const rowH     = 18;
  const tableW   = colWidths.reduce((a, b) => a + b, 0);
  let   y        = doc.y;
  let   pageH    = doc.page.height - doc.page.margins.bottom;

  // Header row
  doc.rect(startX, y, tableW, rowH).fill(COLORS.dark);
  let x = startX;
  headers.forEach((h, i) => {
    doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.white)
       .text(h, x + 4, y + 5, { width: colWidths[i] - 8, ellipsis: true });
    x += colWidths[i];
  });
  y += rowH;

  // Data rows
  rows.forEach((row, ri) => {
    if (y + rowH > pageH - 20) {
      doc.addPage();
      y = 50;
      // Repeat header on new page
      doc.rect(startX, y, tableW, rowH).fill(COLORS.dark);
      let hx = startX;
      headers.forEach((h, i) => {
        doc.font(FONT.bold).fontSize(7.5).fillColor(COLORS.white)
           .text(h, hx + 4, y + 5, { width: colWidths[i] - 8 });
        hx += colWidths[i];
      });
      y += rowH;
    }

    const bg = ri % 2 === 0 ? COLORS.white : COLORS.page;
    doc.rect(startX, y, tableW, rowH).fill(bg);

    let cx = startX;
    row.forEach((cell, i) => {
      const val   = cell === null || cell === undefined ? '—' : String(cell);
      const color = val === '—' ? COLORS.soft : COLORS.mid;
      doc.font(FONT.regular).fontSize(7.5).fillColor(color)
         .text(val, cx + 4, y + 5, { width: colWidths[i] - 8, ellipsis: true });
      cx += colWidths[i];
    });

    // bottom rule
    doc.moveTo(startX, y + rowH).lineTo(startX + tableW, y + rowH)
       .strokeColor(COLORS.rule).lineWidth(0.3).stroke();
    y += rowH;
  });

  doc.y = y + 8;
}

function drawKpiRow(doc, kpis) {
  const boxW = (doc.page.width - 100) / kpis.length;
  let x = 50;
  const y = doc.y;

  kpis.forEach(({ label, value, color }) => {
    doc.rect(x, y, boxW - 6, 44).fill(COLORS.page).stroke(COLORS.rule);
    doc.font(FONT.bold).fontSize(20).fillColor(color || COLORS.primary)
       .text(String(value), x + 8, y + 6, { width: boxW - 22 });
    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.soft)
       .text(label.toUpperCase(), x + 8, y + 30, { width: boxW - 22 });
    x += boxW;
  });

  doc.y = y + 56;
}

// ── Report: Teacher Workload ──────────────────────────────
function buildTeacherWorkload(res, data, { from, to }) {
  const doc = createDoc(res, `teacher-workload-${from}-${to}.pdf`);
  drawHeader(doc, 'Teacher Workload Report', 'All Teachers', from, to);

  const { summary, daily } = data;

  // Summary KPIs
  const totalClasses   = summary.reduce((a, t) => a + parseInt(t.total_classes   || 0), 0);
  const completedTotal = summary.reduce((a, t) => a + parseInt(t.completed_classes || 0), 0);
  const cancelledTotal = summary.reduce((a, t) => a + parseInt(t.cancelled_classes || 0), 0);
  const totalHrs       = summary.reduce((a, t) => a + parseFloat(t.completed_hours || 0), 0);

  drawKpiRow(doc, [
    { label: 'Total Classes',    value: totalClasses },
    { label: 'Completed',        value: completedTotal, color: COLORS.green },
    { label: 'Cancelled',        value: cancelledTotal, color: COLORS.red },
    { label: 'Total Hours',      value: totalHrs.toFixed(1) },
    { label: 'Teachers',         value: summary.length },
  ]);

  // Per-teacher table
  drawSectionTitle(doc, 'Teacher Summary');
  drawTable(doc,
    ['Teacher', 'Code', 'Total Classes', 'Completed', 'Cancelled', 'Hours Completed', 'Hours Scheduled', 'Subjects'],
    summary.map(t => [
      t.teacher_name, t.employee_code || '—',
      t.total_classes, t.completed_classes, t.cancelled_classes,
      parseFloat(t.completed_hours).toFixed(1) + 'h',
      parseFloat(t.scheduled_hours).toFixed(1) + 'h',
      t.subjects_taught || '—',
    ]),
    [115, 55, 65, 60, 60, 75, 75, 90]
  );

  // Daily breakdown
  if (daily.length) {
    drawSectionTitle(doc, 'Daily Breakdown');
    drawTable(doc,
      ['Teacher ID', 'Date', 'Classes', 'Hours', 'Overloaded'],
      daily.map(d => [
        d.teacher_id.substring(0, 8) + '…',
        fmtDate(d.scheduled_date),
        d.classes,
        parseFloat(d.hours).toFixed(1) + 'h',
        d.overloaded ? '⚠ YES' : 'No',
      ]),
      [120, 80, 60, 60, 70]
    );
  }

  doc.end();
}

// ── Report: Student Attendance ────────────────────────────
function buildAttendanceReport(res, data, { from, to }) {
  const doc = createDoc(res, `attendance-report-${from}-${to}.pdf`);
  drawHeader(doc, 'Student Attendance Report', 'All Students', from, to);

  const { summary, detail } = data;
  const totalPresent = summary.reduce((a, s) => a + parseInt(s.present || 0), 0);
  const totalAbsent  = summary.reduce((a, s) => a + parseInt(s.absent  || 0), 0);
  const totalLate    = summary.reduce((a, s) => a + parseInt(s.late    || 0), 0);
  const avgPct       = summary.length
    ? (summary.reduce((a, s) => a + parseFloat(s.attendance_pct || 0), 0) / summary.length).toFixed(1)
    : '0';

  drawKpiRow(doc, [
    { label: 'Students',    value: summary.length },
    { label: 'Present',     value: totalPresent, color: COLORS.green },
    { label: 'Absent',      value: totalAbsent,  color: COLORS.red },
    { label: 'Late',        value: totalLate,    color: COLORS.amber },
    { label: 'Avg. %',      value: avgPct + '%'  },
  ]);

  drawSectionTitle(doc, 'Attendance Summary by Student');
  drawTable(doc,
    ['Student', 'Code', 'Total', 'Present', 'Late', 'Absent', 'Excused', 'Tech Issue', 'Att. %'],
    summary.map(s => [
      s.student_name, s.student_code || '—',
      s.total_classes, s.present, s.late, s.absent, s.excused, s.technical_issue,
      (s.attendance_pct || 0) + '%',
    ]),
    [115, 50, 42, 50, 40, 50, 50, 58, 45]
  );

  if (detail.length) {
    drawSectionTitle(doc, 'Detailed Attendance Records');
    drawTable(doc,
      ['Student', 'Date', 'Time', 'Subject', 'Course', 'Teacher', 'Status', 'Late Min'],
      detail.map(d => [
        d.student_name, fmtDate(d.scheduled_date),
        fmtTime(d.start_time), d.subject, d.course || '—', d.teacher,
        d.status.replace('_',' ').toUpperCase(),
        d.late_minutes || '—',
      ]),
      [100, 68, 42, 75, 75, 85, 65, 50]
    );
  }

  doc.end();
}

// ── Report: Leave ─────────────────────────────────────────
function buildLeaveReport(res, data, { from, to }) {
  const doc = createDoc(res, `leave-report-${from}-${to}.pdf`);
  drawHeader(doc, 'Leave Report', 'All Teachers', from, to);

  const { records, summary } = data;
  const approved = records.filter(r => r.status === 'approved').length;
  const pending  = records.filter(r => r.status === 'pending').length;
  const totalDays = records.reduce((a, r) => a + parseInt(r.days_taken || 0), 0);

  drawKpiRow(doc, [
    { label: 'Total Requests', value: records.length },
    { label: 'Approved',       value: approved, color: COLORS.green },
    { label: 'Pending',        value: pending,  color: COLORS.amber },
    { label: 'Total Days',     value: totalDays },
  ]);

  drawSectionTitle(doc, 'Leave Summary by Teacher');
  drawTable(doc,
    ['Teacher', 'Code', 'Requests', 'Approved', 'Rejected', 'Pending', 'Days Taken'],
    summary.map(s => [
      s.teacher_name, s.employee_code || '—',
      s.total_requests, s.approved, s.rejected, s.pending,
      s.total_days_taken || 0,
    ]),
    [130, 55, 65, 65, 65, 65, 70]
  );

  drawSectionTitle(doc, 'Leave Records');
  drawTable(doc,
    ['Teacher', 'Type', 'From', 'To', 'Days', 'Status', 'Classes Affected', 'Reviewed By'],
    records.map(r => [
      r.teacher_name, r.leave_type,
      fmtDate(r.start_date), fmtDate(r.end_date),
      r.days_taken, r.status.toUpperCase(),
      r.classes_affected || 0,
      r.reviewed_by || '—',
    ]),
    [100, 60, 68, 68, 35, 58, 72, 85]
  );

  doc.end();
}

// ── Report: Schedule Utilisation ─────────────────────────
function buildUtilisationReport(res, data, { from, to }) {
  const doc = createDoc(res, `utilisation-${from}-${to}.pdf`);
  drawHeader(doc, 'Schedule Utilisation Report', 'All Teachers', from, to);

  const { daily, totals } = data;

  drawKpiRow(doc, [
    { label: 'Scheduled',      value: totals.total_scheduled   || 0 },
    { label: 'Completed',      value: totals.total_completed   || 0, color: COLORS.green },
    { label: 'Cancelled',      value: totals.total_cancelled   || 0, color: COLORS.red },
    { label: 'Completion Rate',value: (totals.completion_rate  || 0) + '%' },
    { label: 'Total Hours',    value: (totals.total_hours      || 0) + 'h' },
  ]);

  drawSectionTitle(doc, 'Daily Utilisation');
  drawTable(doc,
    ['Date', 'Day', 'Scheduled', 'Completed', 'Cancelled', 'Hours', 'Teachers', 'Students'],
    daily.map(d => [
      fmtDate(d.date), d.day_name?.trim(),
      d.scheduled, d.completed, d.cancelled,
      parseFloat(d.total_hours).toFixed(1) + 'h',
      d.teachers_active, d.students_in_classes,
    ]),
    [72, 68, 65, 65, 65, 55, 60, 60]
  );

  doc.end();
}

// ── Report: Course Progress ───────────────────────────────
function buildCourseProgress(res, data, { from, to }) {
  const doc = createDoc(res, `course-progress-${from}-${to}.pdf`);
  drawHeader(doc, 'Course Progress Report', 'All Courses', from, to);

  drawSectionTitle(doc, 'Course Progress Summary');
  drawTable(doc,
    ['Course', 'Code', 'Planned', 'Completed', 'Scheduled', 'Cancelled', 'Progress %', 'Students', 'Teachers'],
    data.map(c => [
      c.course_name, c.course_code || '—',
      c.planned_sessions || '—',
      c.completed_sessions, c.scheduled_sessions, c.cancelled_sessions,
      (c.completion_pct || 0) + '%',
      c.enrolled_students,
      c.teachers || '—',
    ]),
    [110, 50, 52, 65, 65, 65, 58, 55, 90]
  );

  doc.end();
}

module.exports = {
  buildTeacherWorkload,
  buildAttendanceReport,
  buildLeaveReport,
  buildUtilisationReport,
  buildCourseProgress,
};
