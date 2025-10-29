#!/usr/bin/env node
/**
 * Final cleanup of all remaining console statements
 */

const fs = require('fs');
const path = require('path');

const backendFile = path.join(__dirname, '..', 'backend', 'index.js');
let content = fs.readFileSync(backendFile, 'utf8');

console.log('🧹 Final console cleanup...\n');

// Replace all remaining console statements
const replacements = [
  // console.error -> logger.error
  { from: /console\.error\(/g, to: 'logger.error(' },
  // console.warn -> logger.warn
  { from: /console\.warn\(/g, to: 'logger.warn(' },
  // console.log -> logger.info (for informational messages)
  { from: /console\.log\(/g, to: 'logger.info(' },
  // console.info -> logger.info
  { from: /console\.info\(/g, to: 'logger.info(' },
  // console.debug -> logger.debug
  { from: /console\.debug\(/g, to: 'logger.debug(' },
];

let totalChanges = 0;
replacements.forEach(({ from, to }) => {
  const matches = content.match(from);
  if (matches) {
    content = content.replace(from, to);
    totalChanges += matches.length;
    console.log(`✓ Replaced ${matches.length} ${from.source} calls`);
  }
});

// Remove emoji prefixes from logger calls
const emojiCleanup = [
  { from: /logger\.(info|error|warn|debug)\('📋\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('📝\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('⚡\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('⏭️\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('🔄\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('🎯\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('📊\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('🍎\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('⚠️\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\('🔧\s*/g, to: "logger.$1('" },
  { from: /logger\.(info|error|warn|debug)\(`📋\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`📝\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`⚡\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`⏭️\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`🔄\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`🎯\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`📊\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`🍎\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`⚠️\s*/g, to: "logger.$1(`" },
  { from: /logger\.(info|error|warn|debug)\(`🔧\s*/g, to: "logger.$1(`" },
];

let emojiChanges = 0;
emojiCleanup.forEach(({ from, to }) => {
  const matches = content.match(from);
  if (matches) {
    content = content.replace(from, to);
    emojiChanges += matches.length;
  }
});

if (emojiChanges > 0) {
  console.log(`✓ Cleaned ${emojiChanges} emoji prefixes`);
}

// Write the updated file
fs.writeFileSync(backendFile, content, 'utf8');

console.log(`\n✅ Cleanup complete! Made ${totalChanges + emojiChanges} changes.`);

