// src/config/logger.js
const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');

const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ filename: path.join(logDir, 'error.log'),  level: 'error' }),
    new transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ timestamp, level, message, ...meta }) => {
        const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${extra}`;
      })
    ),
  }));
}

module.exports = logger;
