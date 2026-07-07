// src/modules/reports/report.service.js
const queries  = require('./report.queries');
const pdfExp   = require('./exporters/pdf.exporter');
const xlsxExp  = require('./exporters/excel.exporter');
const csvExp   = require('./exporters/csv.exporter');

// Map report type → { query fn, pdf fn, xlsx fn, csv fn }
const REPORT_MAP = {
  'teacher-workload': {
    query: (p) => queries.teacherWorkload(p),
    pdf:   pdfExp.buildTeacherWorkload,
    xlsx:  xlsxExp.buildTeacherWorkload,
    csv:   csvExp.buildTeacherWorkload,
  },
  'attendance': {
    query: (p) => queries.studentAttendance(p),
    pdf:   pdfExp.buildAttendanceReport,
    xlsx:  xlsxExp.buildAttendanceReport,
    csv:   csvExp.buildAttendanceReport,
  },
  'leave': {
    query: (p) => queries.leaveReport(p),
    pdf:   pdfExp.buildLeaveReport,
    xlsx:  xlsxExp.buildLeaveReport,
    csv:   csvExp.buildLeaveReport,
  },
  'utilisation': {
    query: (p) => queries.scheduleUtilisation(p),
    pdf:   pdfExp.buildUtilisationReport,
    xlsx:  xlsxExp.buildUtilisationReport,
    csv:   csvExp.buildUtilisationReport,
  },
  'course-progress': {
    query: (p) => queries.courseProgress(p),
    pdf:   pdfExp.buildCourseProgress,
    xlsx:  xlsxExp.buildCourseProgress,
    csv:   csvExp.buildCourseProgress,
  },
};

const reportService = {

  /**
   * Generate and stream a report
   * @param {string} reportType  - one of the REPORT_MAP keys
   * @param {string} format      - json | pdf | xlsx | csv
   * @param {object} params      - { from, to, teacherId, studentId, ... }
   * @param {object} res         - Express response (for streaming)
   */
  async generate(reportType, format, params, res) {
    const def = REPORT_MAP[reportType];
    if (!def) {
      const e = new Error(`Unknown report type: ${reportType}`);
      e.statusCode = 400; throw e;
    }

    // Validate required params
    if (!params.from || !params.to) {
      const e = new Error('from and to dates are required.');
      e.statusCode = 400; throw e;
    }

    // Fetch data
    const data = await def.query(params);

    // Stream in requested format
    const period = { from: params.from, to: params.to };

    if (format === 'pdf') {
      def.pdf(res, data, period);
      return; // streaming — response already handled
    }

    if (format === 'xlsx' || format === 'excel') {
      await def.xlsx(res, data, period);
      return;
    }

    if (format === 'csv') {
      def.csv(res, data, period);
      return;
    }

    // Default: JSON
    res.json({ success: true, reportType, params, data });
  },
};

module.exports = reportService;
