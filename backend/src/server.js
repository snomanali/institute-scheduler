// src/server.js
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const logger       = require('./config/logger');

const authRoutes         = require('./modules/auth/auth.routes');
const teacherRoutes      = require('./modules/teachers/teacher.routes');
const studentRoutes      = require('./modules/students/student.routes');
const courseRoutes       = require('./modules/courses/course.routes');
const classRoutes        = require('./modules/classes/class.routes');
const attendanceRoutes   = require('./modules/attendance/attendance.routes');
const leaveRoutes        = require('./modules/leave/leave.routes');
const reportRoutes       = require('./modules/reports/report.routes');
const dashboardRoutes    = require('./modules/dashboard/dashboard.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');

const { errorHandler } = require('./middleware/errorHandler');
const { notFound }     = require('./middleware/notFound');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 200 }));

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: m => logger.http(m.trim()) } }));
}

// ── Health check — FIRST, always responds ─────────────────
app.get('/health', async (req, res) => {
  let dbOk = false;
  try { const { pool } = require('./config/database'); await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.status(200).json({ status: 'ok', database: dbOk ? 'connected' : 'disconnected', port: PORT });
});

// ── Serve frontend UI ─────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── API Routes ────────────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/teachers`,      teacherRoutes);
app.use(`${API}/students`,      studentRoutes);
app.use(`${API}/courses`,       courseRoutes);
app.use(`${API}/classes`,       classRoutes);
app.use(`${API}/attendance`,    attendanceRoutes);
app.use(`${API}/leave`,         leaveRoutes);
app.use(`${API}/reports`,       reportRoutes);
app.use(`${API}/dashboard`,     dashboardRoutes);
app.use(`${API}/notifications`, notificationRoutes);

// ── SPA fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server on port ${PORT} [${process.env.NODE_ENV||'development'}]`);
});

module.exports = app;
