const fs = require('fs');
const path = require('path');
const util = require('util');

/**
 * Professional Logging System for SyncMyPlays
 * 
 * Features:
 * - Clean, consistent formatting
 * - Log levels with colors (for dev) and plain text (for production)
 * - Rate limiting for repeated messages
 * - File rotation
 * - Memory-safe (no emoji encoding issues)
 * - Production-ready output
 */

class Logger {
  constructor(options = {}) {
    this.logLevel = process.env.LOG_LEVEL || options.logLevel || 'INFO';
    this.enableFileLogging = options.enableFileLogging !== false;
    this.enableConsole = options.enableConsole !== false;
    this.logDir = options.logDir || path.resolve(__dirname, '..', 'logs');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.appName = options.appName || 'SyncMyPlays';
    
    // Log levels
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    // Rate limiting for repeated messages
    this.messageCache = new Map();
    this.rateLimitWindow = 5000; // 5 seconds
    this.maxRepeats = 3;
    
    // Current log file
    this.currentLogFile = null;
    this.fileStream = null;
    
    // Initialize
    this.init();
  }
  
  init() {
    if (this.enableFileLogging && !process.pkg) {
      try {
        // Create logs directory
        fs.mkdirSync(this.logDir, { recursive: true });
        
        // Create new log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const sessionId = Math.random().toString(36).substring(2, 8);
        this.currentLogFile = `${this.appName}-${timestamp}-${sessionId}.log`;
        const logPath = path.join(this.logDir, this.currentLogFile);
        
        this.fileStream = fs.createWriteStream(logPath, { flags: 'a' });
        
        // Clean up old logs
        this.cleanupOldLogs();
        
        // Log startup
        this.writeToFile(`${'='.repeat(80)}\n`);
        this.writeToFile(`${this.appName} Backend Started\n`);
        this.writeToFile(`Timestamp: ${new Date().toISOString()}\n`);
        this.writeToFile(`Process ID: ${process.pid}\n`);
        this.writeToFile(`Node Version: ${process.version}\n`);
        this.writeToFile(`Log Level: ${this.logLevel}\n`);
        this.writeToFile(`${'='.repeat(80)}\n\n`);
        
      } catch (error) {
        console.error('[Logger] Failed to initialize file logging:', error.message);
        this.enableFileLogging = false;
      }
    }
  }
  
  cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith(this.appName) && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
      
      // Keep only the most recent files
      if (files.length > this.maxFiles) {
        files.slice(this.maxFiles).forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // Ignore errors
          }
        });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }
  
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.padEnd(5)}]`;
    
    let formattedMessage = `${prefix} ${message}`;
    
    if (data !== null && data !== undefined) {
      if (typeof data === 'object') {
        try {
          formattedMessage += ` ${JSON.stringify(data)}`;
        } catch (e) {
          formattedMessage += ` [Object]`;
        }
      } else {
        formattedMessage += ` ${data}`;
      }
    }
    
    return formattedMessage;
  }
  
  isRateLimited(message) {
    const now = Date.now();
    const cached = this.messageCache.get(message);
    
    if (!cached) {
      this.messageCache.set(message, { count: 1, firstSeen: now, lastSeen: now });
      return false;
    }
    
    // Reset if outside window
    if (now - cached.firstSeen > this.rateLimitWindow) {
      this.messageCache.set(message, { count: 1, firstSeen: now, lastSeen: now });
      return false;
    }
    
    // Increment count
    cached.count++;
    cached.lastSeen = now;
    
    // Rate limit if too many repeats
    if (cached.count > this.maxRepeats) {
      return true;
    }
    
    return false;
  }
  
  getRepeatCount(message) {
    const cached = this.messageCache.get(message);
    return cached ? cached.count : 0;
  }
  
  writeToFile(text) {
    if (this.fileStream && this.enableFileLogging) {
      try {
        this.fileStream.write(text);
      } catch (error) {
        // Silently fail
      }
    }
  }
  
  writeToConsole(level, formattedMessage) {
    if (!this.enableConsole) return;
    
    // Use appropriate console method
    switch (level) {
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }
  
  log(level, message, data = null) {
    if (!this.shouldLog(level)) return;
    
    // Check rate limiting
    const messageKey = `${level}:${message}`;
    if (this.isRateLimited(messageKey)) {
      return;
    }
    
    // Format message
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Check if we should add repeat count
    const repeatCount = this.getRepeatCount(messageKey);
    let finalMessage = formattedMessage;
    if (repeatCount === this.maxRepeats) {
      finalMessage += ` (repeated ${repeatCount}x, suppressing further)`;
    }
    
    // Write to console
    this.writeToConsole(level, finalMessage);
    
    // Write to file
    this.writeToFile(finalMessage + '\n');
  }
  
  error(message, data = null) {
    this.log('ERROR', message, data);
  }
  
  warn(message, data = null) {
    this.log('WARN', message, data);
  }
  
  info(message, data = null) {
    this.log('INFO', message, data);
  }
  
  debug(message, data = null) {
    this.log('DEBUG', message, data);
  }
  
  // HTTP request logging
  http(method, path, statusCode, duration, requestId = null) {
    const id = requestId ? `[${requestId}]` : '';
    const status = statusCode >= 400 ? 'ERROR' : 'INFO';
    this.log(status, `${id} ${method} ${path} -> ${statusCode} (${duration}ms)`);
  }
  
  // Sync operation logging
  sync(operation, details) {
    this.info(`SYNC: ${operation}`, details);
  }
  
  // Clean shutdown
  close() {
    if (this.fileStream) {
      this.writeToFile(`\n${'='.repeat(80)}\n`);
      this.writeToFile(`${this.appName} Backend Stopped\n`);
      this.writeToFile(`Timestamp: ${new Date().toISOString()}\n`);
      this.writeToFile(`${'='.repeat(80)}\n`);
      
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

// Create singleton instance
const logger = new Logger({
  logLevel: process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG',
  appName: 'SyncMyPlays'
});

// Handle process termination
process.on('exit', () => logger.close());
process.on('SIGINT', () => {
  logger.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.close();
  process.exit(0);
});

module.exports = logger;

