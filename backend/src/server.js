// src/server.js
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const logger       = require('./config/logger');
const { pool }     = require('./config/database');

// ── Route imports ─────────────────────────────────────────
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
const PORT = process.env.PORT || 5000;  // Railway sets PORT automatically

// ── CORS — allow Railway domains + custom CLIENT_URL ─────
const allowedOrigins = [
  process.env.CLIENT_URL,
  /\.railway\.app$/,           // any Railway subdomain
  'http://localhost:3000',
  'http://localhost:5000',
].filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    callback(null, allowed);
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  message:  { success: false, message: 'Too many requests. Please try again later.' },
}));
app.use('/api/v1/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message:  { success: false, message: 'Too many login attempts. Please try again later.' },
}));

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── HTTP logging ──────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// ── Health check (Railway uses this) ─────────────────────
// app.get('/health', async (req, res) => {
  // try {
    // await pool.query('SELECT 1');
    // res.json({
      // status:    'ok',
      // database:  'connected',
      // env:       process.env.NODE_ENV,
      // timestamp: new Date().toISOString(),
    // });
//   } catch {
    // res.status(503).json({ status: 'error', database: 'disconnected' });
  // }
// });

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

// ── Error handling ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
