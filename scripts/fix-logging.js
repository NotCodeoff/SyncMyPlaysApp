/**
 * Script to fix all logging in backend/index.js
 * Replaces emoji-based logs with professional logger
 */

const fs = require('fs');
const path = require('path');

const backendFile = path.join(__dirname, '..', 'backend', 'index.js');
let content = fs.readFileSync(backendFile, 'utf8');

console.log('Starting logging system fix...\n');

// Step 1: Add logger import at the top
if (!content.includes("const logger = require('./logger');")) {
  content = content.replace(
    /^(const .*?require\(.*?\);?\n)/m,
    "$1const logger = require('./logger');\n"
  );
  console.log('✓ Added logger import');
}

// Step 2: Replace writeFileLog calls
const writeFileLogReplacements = [
  { from: /writeFileLog\('INFO',\s*`📥\s*\[(\$\{requestId\})\]\s*(.+?)`\)/g, to: "logger.info(`[$1] $2`)" },
  { from: /writeFileLog\('INFO',\s*`📤\s*\[(\$\{requestId\})\]\s*(.+?)`\)/g, to: "logger.info(`[$1] $2`)" },
  { from: /writeFileLog\('ERROR',\s*`📤\s*\[(\$\{requestId\})\]\s*(.+?)`\)/g, to: "logger.error(`[$1] $2`)" },
  { from: /writeFileLog\('INFO',/g, to: "logger.info(" },
  { from: /writeFileLog\('ERROR',/g, to: "logger.error(" },
  { from: /writeFileLog\('WARN',/g, to: "logger.warn(" },
  { from: /writeFileLog\('DEBUG',/g, to: "logger.debug(" },
];

let replacementCount = 0;
writeFileLogReplacements.forEach(({ from, to }) => {
  const matches = content.match(from);
  if (matches) {
    content = content.replace(from, to);
    replacementCount += matches.length;
  }
});
console.log(`✓ Replaced ${replacementCount} writeFileLog calls`);

// Step 3: Replace emoji console.logs
const emojiReplacements = [
  { from: /console\.log\(`?'?🚀\s*(.+?)`?'?\)/g, to: "logger.info('$1')" },
  { from: /console\.log\(`?'?✅\s*(.+?)`?'?\)/g, to: "logger.info('$1')" },
  { from: /console\.log\(`?'?❌\s*(.+?)`?'?\)/g, to: "logger.error('$1')" },
  { from: /console\.log\(`?'?⚠️\s*(.+?)`?'?\)/g, to: "logger.warn('$1')" },
  { from: /console\.log\(`?'?🔍\s*(.+?)`?'?\)/g, to: "logger.debug('$1')" },
  { from: /console\.log\(`?'?➕\s*(.+?)`?'?\)/g, to: "logger.info('$1')" },
  { from: /console\.log\(`?'?📊\s*(.+?)`?'?\)/g, to: "logger.info('$1')" },
  { from: /console\.error\(`?'?❌\s*(.+?)`?'?\)/g, to: "logger.error('$1')" },
];

let emojiCount = 0;
emojiReplacements.forEach(({ from, to }) => {
  const matches = content.match(from);
  if (matches) {
    content = content.replace(from, to);
    emojiCount += matches.length;
  }
});
console.log(`✓ Replaced ${emojiCount} emoji-based logs`);

// Step 4: Remove old logging system (console overrides)
const consoleOverrideStart = content.indexOf("// Mirror console output to logfile");
const consoleOverrideEnd = content.indexOf("// Capture uncaught exceptions");

if (consoleOverrideStart !== -1 && consoleOverrideEnd !== -1) {
  const before = content.substring(0, consoleOverrideStart);
  const after = content.substring(consoleOverrideEnd);
  content = before + "// Professional logging system now handled by logger.js\n\n" + after;
  console.log('✓ Removed old console override system');
}

// Step 5: Remove writeFileLog function
const writeFileLogStart = content.indexOf("function writeFileLog(");
if (writeFileLogStart !== -1) {
  const writeFileLogEnd = content.indexOf("\n}\n", writeFileLogStart) + 3;
  content = content.substring(0, writeFileLogStart) + content.substring(writeFileLogEnd);
  console.log('✓ Removed old writeFileLog function');
}

// Step 6: Remove file logging initialization
const fileLogStart = content.indexOf("// Skip file logging if running in compiled mode");
const fileLogEnd = content.indexOf("// Function to clean up old log files");

if (fileLogStart !== -1 && fileLogEnd !== -1) {
  const before = content.substring(0, fileLogStart);
  const after = content.substring(fileLogEnd);
  content = before + "// File logging now handled by logger.js\n\n" + after;
  console.log('✓ Removed old file logging initialization');
}

// Write the fixed content
fs.writeFileSync(backendFile, content, 'utf8');

console.log('\n✅ Logging system fixed successfully!');
console.log('\nNext steps:');
console.log('1. Review backend/index.js for any remaining console.log statements');
console.log('2. Test the application');
console.log('3. Check logs for professional output');

