#!/usr/bin/env node
/**
 * Migrate backend/index.js to use the new professional logger
 */

const fs = require('fs');
const path = require('path');

const backendFile = path.join(__dirname, '..', 'backend', 'index.js');
let content = fs.readFileSync(backendFile, 'utf8');
let changes = 0;

console.log('🔧 Migrating to new logging system...\n');

// 1. Remove old logging functions
const functionsToRemove = [
  { name: 'cleanupOldLogs', start: 'function cleanupOldLogs(', end: '\n}\n\n// Function to rotate' },
  { name: 'rotateLogIfNeeded', start: '// Function to rotate logs if they get too large\nfunction rotateLogIfNeeded(', end: '\n}\n\nfunction safeSerialize' },
  { name: 'safeSerialize', start: 'function safeSerialize(', end: '\n}\n\nfunction writeFileLog' },
  { name: 'writeFileLog', start: 'function writeFileLog(', end: '\n}\n\n// Mirror console' }
];

functionsToRemove.forEach(({ name, start, end }) => {
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end, startIdx);
  
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + content.substring(endIdx);
    console.log(`✓ Removed old ${name} function`);
    changes++;
  }
});

// 2. Remove console override system
const consoleOverrideStart = content.indexOf("// Mirror console output to logfile");
const consoleOverrideEnd = content.indexOf("// Capture uncaught exceptions");

if (consoleOverrideStart !== -1 && consoleOverrideEnd !== -1) {
  content = content.substring(0, consoleOverrideStart) + 
           "// Console logging is now handled by logger.js\n\n" +
           content.substring(consoleOverrideEnd);
  console.log('✓ Removed console override system');
  changes++;
}

// 3. Replace writeFileLog calls
const replacements = [
  // writeFileLog calls
  { from: /writeFileLog\('ERROR',\s*/g, to: 'logger.error(' },
  { from: /writeFileLog\('WARN',\s*/g, to: 'logger.warn(' },
  { from: /writeFileLog\('INFO',\s*/g, to: 'logger.info(' },
  { from: /writeFileLog\('DEBUG',\s*/g, to: 'logger.debug(' },
  
  // Remove emoji prefixes in logger calls
  { from: /logger\.(info|error|warn|debug)\(`📥\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`📤\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`🚀\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`✅\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`❌\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`🔍\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`➕\s*/g, to: 'logger.$1(`' },
  { from: /logger\.(info|error|warn|debug)\(`⚠️\s*/g, to: 'logger.$1(`' },
  
  // Replace standalone console.log with emojis
  { from: /console\.log\('📥\s*/g, to: "logger.info('" },
  { from: /console\.log\('📤\s*/g, to: "logger.info('" },
  { from: /console\.log\('🚀\s*/g, to: "logger.info('" },
  { from: /console\.log\('✅\s*/g, to: "logger.info('" },
  { from: /console\.log\('❌\s*/g, to: "logger.error('" },
  { from: /console\.log\('🔍\s*/g, to: "logger.debug('" },
  { from: /console\.log\('➕\s*/g, to: "logger.info('" },
  { from: /console\.log\('⚠️\s*/g, to: "logger.warn('" },
  { from: /console\.log\(`📥\s*/g, to: "logger.info(`" },
  { from: /console\.log\(`📤\s*/g, to: "logger.info(`" },
  { from: /console\.log\(`🚀\s*/g, to: "logger.info(`" },
  { from: /console\.log\(`✅\s*/g, to: "logger.info(`" },
  { from: /console\.log\(`❌\s*/g, to: "logger.error(`" },
  { from: /console\.log\(`🔍\s*/g, to: "logger.debug(`" },
  { from: /console\.log\(`➕\s*/g, to: "logger.info(`" },
  { from: /console\.log\(`⚠️\s*/g, to: "logger.warn(`" },
  
  // Replace console.error with emojis
  { from: /console\.error\('❌\s*/g, to: "logger.error('" },
  { from: /console\.error\(`❌\s*/g, to: "logger.error(`" },
];

replacements.forEach(({ from, to }) => {
  const matches = content.match(from);
  if (matches) {
    content = content.replace(from, to);
    changes += matches.length;
  }
});

console.log(`✓ Replaced ${changes} logging calls`);

// 4. Update API request logging middleware
const oldMiddleware = content.indexOf("// Enhanced logging for all API requests");
const middlewareEnd = content.indexOf("// WebSocket connection handler", oldMiddleware);

if (oldMiddleware !== -1 && middlewareEnd !== -1) {
  const newMiddleware = `// Professional API request logging
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 8);
  
  // Log incoming request (only for non-health checks)
  if (req.path !== '/health') {
    logger.debug(\`[\${requestId}] \${req.method} \${req.path}\`);
  }
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Log response (skip health checks and successful requests under 1s)
    if (req.path !== '/health' && (statusCode >= 400 || duration > 1000)) {
      logger.http(req.method, req.path, statusCode, duration, requestId);
    }
    
    // Log error responses
    if (statusCode >= 400 && chunk) {
      try {
        const responseBody = chunk.toString();
        if (responseBody.length < 500) {
          logger.error(\`[\${requestId}] Error: \${responseBody}\`);
        } else {
          logger.error(\`[\${requestId}] Error response (truncated)\`);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

`;
  
  content = content.substring(0, oldMiddleware) + newMiddleware + content.substring(middlewareEnd);
  console.log('✓ Updated API request logging middleware');
  changes++;
}

// 5. Write the updated file
fs.writeFileSync(backendFile, content, 'utf8');

console.log(`\n✅ Migration complete! Made ${changes} changes.`);
console.log('\nNext steps:');
console.log('1. Review backend/index.js');
console.log('2. Test the application');
console.log('3. Check logs in logs/ directory');

