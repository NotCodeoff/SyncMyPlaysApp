/**
 * Professional Logging Utility
 * Replaces console.log with structured logging
 */

const winston = require('winston');
const path = require('path');
const config = require('../config/env');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define level based on environment
const level = () => {
  const env = config.nodeEnv || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : config.logLevel;
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston about our colors
winston.addColors(colors);

// Define format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Sanitize sensitive data
const sanitize = (obj) => {
  if (typeof obj === 'string') {
    return obj
      .replace(/(token|key|secret|password|authorization|bearer)[=:]\s*[^\s&]+/gi, '$1=***REDACTED***')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***EMAIL_REDACTED***');
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (/token|key|secret|password|auth/i.test(key)) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'object') {
        sanitized[key] = sanitize(value);
      } else if (typeof value === 'string') {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  
  return obj;
};

// Sanitize format
const sanitizeFormat = winston.format((info) => {
  if (info.message && typeof info.message === 'object') {
    info.message = JSON.stringify(sanitize(info.message));
  } else if (typeof info.message === 'string') {
    info.message = sanitize(info.message);
  }
  return info;
})();

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console(),
  // File transport for errors
  new winston.transports.File({
    filename: path.join(config.logFilePath, 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(config.logFilePath, 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: winston.format.combine(
    sanitizeFormat,
    format
  ),
  transports,
});

// Export convenience methods
module.exports = {
  error: (message, meta = {}) => logger.error(message, sanitize(meta)),
  warn: (message, meta = {}) => logger.warn(message, sanitize(meta)),
  info: (message, meta = {}) => logger.info(message, sanitize(meta)),
  http: (message, meta = {}) => logger.http(message, sanitize(meta)),
  debug: (message, meta = {}) => logger.debug(message, sanitize(meta)),
  logger, // Export the logger instance for advanced usage
};

