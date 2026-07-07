// src/modules/reports/exporters/excel.exporter.js
const ExcelJS = require('exceljs');

// ── Design tokens ─────────────────────────────────────────
const THEME = {
  headerFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1923' } },
  headerFont:   { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
  subHeaderFill:{ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1455C0' } },
  subHeaderFont:{ name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 9 },
  altRowFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FB' } },
  bodyFont:     { name: 'Calibri', size: 9 },
  bodyColor:    { argb: 'FF3A4A58' },
  borderStyle:  { style: 'thin', color: { argb: 'FFD4DCE3' } },
  greenFont:    { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0A7A55' } },
  redFont:      { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFB5261E' } },
  amberFont:    { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFC47A00' } },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(t) { return t ? String(t).substring(0, 5) : '—'; }

// ── Shared helpers ────────────────────────────────────────

function addTitleRow(ws, title, colCount) {
  const row = ws.addRow([title]);
  row.height = 28;
  ws.mergeCells(`A${row.number}:${colLetter(colCount)}${row.number}`);
  row.getCell(1).fill   = THEME.headerFill;
  row.getCell(1).font   = { ...THEME.headerFont, size: 13 };
  row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
}

function addMetaRow(ws, from, to, colCount) {
  const row = ws.addRow([`Period: ${fmtDate(from)} – ${fmtDate(to)}   |   Generated: ${new Date().toLocaleString('en-GB')}`]);
  ws.mergeCells(`A${row.number}:${colLetter(colCount)}${row.number}`);
  row.getCell(1).fill = THEME.subHeaderFill;
  row.getCell(1).font = { name: 'Calibri', size: 8, color: { argb: 'FFA0C8FF' } };
  row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.addRow([]);
}

function addHeaderRow(ws, headers) {
  const row = ws.addRow(headers);
  row.height = 18;
  row.eachCell(cell => {
    cell.fill      = THEME.subHeaderFill;
    cell.font      = THEME.subHeaderFont;
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border    = { bottom: THEME.borderStyle };
  });
  return row;
}

function addDataRow(ws, values, rowIndex, statusColIdx) {
  const row = ws.addRow(values);
  row.height = 15;
  const isAlt = rowIndex % 2 === 1;

  row.eachCell((cell, colNum) => {
    if (isAlt) cell.fill = THEME.altRowFill;
    cell.font      = { ...THEME.bodyFont, color: THEME.bodyColor };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border    = { bottom: { style: 'hair', color: { argb: 'FFE8EFF5' } } };

    // Color-code status column
    if (statusColIdx && colNum === statusColIdx) {
      const val = String(cell.value || '').toLowerCase();
      if (val === 'present' || val === 'completed' || val === 'approved') cell.font = THEME.greenFont;
      else if (val === 'absent' || val === 'cancelled' || val === 'rejected') cell.font = THEME.redFont;
      else if (val === 'late'   || val === 'pending') cell.font = THEME.amberFont;
    }
  });
}

function setColWidths(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function freezeAndFilter(ws, row) {
  ws.views = [{ state: 'frozen', ySplit: row }];
}

async function sendWorkbook(workbook, res, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

// ── Teacher Workload Excel ────────────────────────────────
async function buildTeacherWorkload(res, data, { from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Institute Schedule Manager';
  wb.created = new Date();

  // ── Sheet 1: Summary ──────────────────────────────────
  const ws1 = wb.addWorksheet('Summary', { tabColor: { argb: 'FF1455C0' } });
  const cols1 = ['Teacher Name','Emp Code','Total Classes','Completed','Cancelled','Upcoming','Hours Completed','Hours Scheduled','Daily Limit','Subjects Taught'];
  addTitleRow(ws1, 'Teacher Workload Report — Summary', cols1.length);
  addMetaRow(ws1,  from, to, cols1.length);
  addHeaderRow(ws1, cols1);
  setColWidths(ws1, [22, 10, 13, 11, 11, 11, 14, 14, 12, 40]);
  freezeAndFilter(ws1, 4);

  data.summary.forEach((t, i) => {
    addDataRow(ws1, [
      t.teacher_name, t.employee_code || '—',
      parseInt(t.total_classes), parseInt(t.completed_classes),
      parseInt(t.cancelled_classes), parseInt(t.upcoming_classes),
      parseFloat(t.completed_hours).toFixed(1),
      parseFloat(t.scheduled_hours).toFixed(1),
      t.max_hours_per_day,
      t.subjects_taught || '—',
    ], i);
  });

  // Totals row
  const totRow = ws1.addRow([
    'TOTAL', '',
    data.summary.reduce((a,t)=>a+parseInt(t.total_classes||0),0),
    data.summary.reduce((a,t)=>a+parseInt(t.completed_classes||0),0),
    data.summary.reduce((a,t)=>a+parseInt(t.cancelled_classes||0),0),
    data.summary.reduce((a,t)=>a+parseInt(t.upcoming_classes||0),0),
    data.summary.reduce((a,t)=>a+parseFloat(t.completed_hours||0),0).toFixed(1),
    data.summary.reduce((a,t)=>a+parseFloat(t.scheduled_hours||0),0).toFixed(1),
    '', '',
  ]);
  totRow.eachCell(cell => {
    cell.fill = THEME.headerFill;
    cell.font = { ...THEME.headerFont, size: 9 };
  });

  // ── Sheet 2: Daily Breakdown ──────────────────────────
  if (data.daily.length) {
    const ws2 = wb.addWorksheet('Daily Breakdown', { tabColor: { argb: 'FF0A7A55' } });
    const cols2 = ['Teacher ID','Date','Classes','Hours','Overloaded'];
    addTitleRow(ws2, 'Daily Breakdown', cols2.length);
    addMetaRow(ws2, from, to, cols2.length);
    addHeaderRow(ws2, cols2);
    setColWidths(ws2, [36, 16, 10, 10, 12]);
    freezeAndFilter(ws2, 4);

    data.daily.forEach((d, i) => {
      const row = ws2.addRow([
        d.teacher_id, fmtDate(d.scheduled_date),
        parseInt(d.classes), parseFloat(d.hours).toFixed(1),
        d.overloaded ? 'YES' : 'No',
      ]);
      row.height = 15;
      if (d.overloaded) {
        row.getCell(5).font = THEME.redFont;
        row.getCell(5).fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFDECEA' } };
      }
    });
  }

  await sendWorkbook(wb, res, `teacher-workload-${from}-${to}.xlsx`);
}

// ── Attendance Excel ──────────────────────────────────────
async function buildAttendanceReport(res, data, { from, to }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Institute Schedule Manager';

  // Sheet 1: Summary
  const ws1 = wb.addWorksheet('Summary', { tabColor: { argb: 'FF1455C0' } });
  const cols1 = ['Student Name','Student Code','Total','Present','Late','Absent','Excused','Tech Issue','Att. %','Avg Late Min'];
  addTitleRow(ws1, 'Student Attendance Report — Summary', cols1.length);
  addMetaRow(ws1, from, to, cols1.length);
  addHeaderRow(ws1, cols1);
  setColWidths(ws1, [22, 12, 8, 9, 8, 9, 9, 10, 9, 12]);
  freezeAndFilter(ws1, 4);

  data.summary.forEach((s, i) => {
    const row = ws1.addRow([
      s.student_name, s.student_code || '—',
      parseInt(s.total_classes),
      parseInt(s.present), parseInt(s.late), parseInt(s.absent),
      parseInt(s.excused), parseInt(s.technical_issue),
      parseFloat(s.attendance_pct || 0).toFixed(1) + '%',
      s.avg_late_minutes || 0,
    ]);
    row.height = 15;
    if (i % 2 === 1) row.eachCell(c => { c.fill = THEME.altRowFill; });

    // Color attendance %
    const pct = parseFloat(s.attendance_pct || 0);
    const pctCell = row.getCell(9);
    if (pct >= 80) pctCell.font = THEME.greenFont;
    else if (pct >= 60) pctCell.font = THEME.amberFont;
    else pctCell.font = THEME.redFont;
  });

  // Sheet 2: Detail
  if (data.detail.length) {
    const ws2 = wb.addWorksheet('Detail Records', { tabColor: { argb: 'FF0A7A55' } });
    const cols2 = ['Student','Date','Start','End','Subject','Course','Teacher','Status','Late Min','Remarks'];
    addTitleRow(ws2, 'Attendance Detail Records', cols2.length);
    addMetaRow(ws2, from, to, cols2.length);
    addHeaderRow(ws2, cols2);
    setColWidths(ws2, [20, 13, 8, 8, 18, 18, 18, 12, 10, 30]);
    freezeAndFilter(ws2, 4);

    data.detail.forEach((d, i) => {
      addDataRow(ws2, [
        d.student_name, fmtDate(d.scheduled_date),
        fmtTime(d.start_time), fmtTime(d.end_time),
        d.subject, d.course || '—', d.teacher,
        d.status?.replace('_',' '), d.late_minutes || '—', d.remarks || '',
      ], i, 8); // col 8 = status
    });
  }

  await sendWorkbook(wb, res, `attendance-report-${from}-${to}.xlsx`);
}

// ── Leave Excel ───────────────────────────────────────────
async function buildLeaveReport(res, data, { from, to }) {
  const wb = new ExcelJS.Workbook();

  const ws1 = wb.addWorksheet('Summary', { tabColor: { argb: 'FFC47A00' } });
  const cols1 = ['Teacher','Code','Total Requests','Approved','Rejected','Pending','Days Taken'];
  addTitleRow(ws1, 'Leave Report — Teacher Summary', cols1.length);
  addMetaRow(ws1, from, to, cols1.length);
  addHeaderRow(ws1, cols1);
  setColWidths(ws1, [22, 10, 14, 11, 11, 11, 12]);
  freezeAndFilter(ws1, 4);

  data.summary.forEach((s, i) => {
    addDataRow(ws1, [
      s.teacher_name, s.employee_code || '—',
      s.total_requests, s.approved, s.rejected, s.pending,
      s.total_days_taken || 0,
    ], i);
  });

  const ws2 = wb.addWorksheet('Leave Records', { tabColor: { argb: 'FF1455C0' } });
  const cols2 = ['Teacher','Code','Type','From','To','Days','Status','Classes Affected','Reviewed By','Notes'];
  addTitleRow(ws2, 'Leave Records', cols2.length);
  addMetaRow(ws2, from, to, cols2.length);
  addHeaderRow(ws2, cols2);
  setColWidths(ws2, [20, 10, 12, 13, 13, 7, 12, 14, 18, 30]);
  freezeAndFilter(ws2, 4);

  data.records.forEach((r, i) => {
    addDataRow(ws2, [
      r.teacher_name, r.employee_code || '—',
      r.leave_type, fmtDate(r.start_date), fmtDate(r.end_date),
      r.days_taken, r.status,
      r.classes_affected || 0,
      r.reviewed_by || '—', r.review_notes || '',
    ], i, 7); // col 7 = status
  });

  await sendWorkbook(wb, res, `leave-report-${from}-${to}.xlsx`);
}

// ── Schedule Utilisation Excel ────────────────────────────
async function buildUtilisationReport(res, data, { from, to }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Utilisation', { tabColor: { argb: 'FF1455C0' } });
  const cols = ['Date','Day','Scheduled','Completed','Cancelled','Rescheduled','Hours','Teachers Active','Students'];
  addTitleRow(ws, 'Schedule Utilisation Report', cols.length);
  addMetaRow(ws, from, to, cols.length);
  addHeaderRow(ws, cols);
  setColWidths(ws, [14, 12, 11, 11, 11, 13, 10, 14, 11]);
  freezeAndFilter(ws, 4);

  data.daily.forEach((d, i) => {
    addDataRow(ws, [
      fmtDate(d.date), d.day_name?.trim(),
      d.scheduled, d.completed, d.cancelled, d.rescheduled,
      parseFloat(d.total_hours).toFixed(1),
      d.teachers_active, d.students_in_classes,
    ], i);
  });

  // Totals
  const t = data.totals;
  const tot = ws.addRow(['TOTALS', '',
    t.total_scheduled, t.total_completed, t.total_cancelled, '',
    parseFloat(t.total_hours || 0).toFixed(1), '', '',
  ]);
  tot.eachCell(c => { c.fill = THEME.headerFill; c.font = { ...THEME.headerFont, size: 9 }; });

  await sendWorkbook(wb, res, `utilisation-${from}-${to}.xlsx`);
}

// ── Course Progress Excel ─────────────────────────────────
async function buildCourseProgress(res, data, { from, to }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Course Progress', { tabColor: { argb: 'FF0A7A55' } });
  const cols = ['Course','Code','Planned Sessions','Completed','Scheduled','Cancelled','Progress %','Enrolled Students','Teachers'];
  addTitleRow(ws, 'Course Progress Report', cols.length);
  addMetaRow(ws, from, to, cols.length);
  addHeaderRow(ws, cols);
  setColWidths(ws, [28, 12, 14, 11, 11, 11, 12, 16, 30]);
  freezeAndFilter(ws, 4);

  data.forEach((c, i) => {
    const row = ws.addRow([
      c.course_name, c.course_code || '—',
      c.planned_sessions || '—',
      c.completed_sessions, c.scheduled_sessions, c.cancelled_sessions,
      parseFloat(c.completion_pct || 0).toFixed(1) + '%',
      c.enrolled_students, c.teachers || '—',
    ]);
    row.height = 15;
    if (i % 2 === 1) row.eachCell(cell => { cell.fill = THEME.altRowFill; });
    const pct = parseFloat(c.completion_pct || 0);
    const pctCell = row.getCell(7);
    if (pct >= 75) pctCell.font = THEME.greenFont;
    else if (pct >= 40) pctCell.font = THEME.amberFont;
    else pctCell.font = THEME.redFont;
  });

  await sendWorkbook(wb, res, `course-progress-${from}-${to}.xlsx`);
}

module.exports = {
  buildTeacherWorkload,
  buildAttendanceReport,
  buildLeaveReport,
  buildUtilisationReport,
  buildCourseProgress,
};
