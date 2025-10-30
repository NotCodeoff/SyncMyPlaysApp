/**
 * Migration Script: Replace console.log with proper logger
 * Usage: node scripts/migrate-to-logger.js
 */

const fs = require('fs');
const path = require('path');

// Files to migrate
const filesToMigrate = [
  'backend/services/advancedMatcher.js',
  'backend/services/universalConverter.js',
  'backend/services/enhancedSongshiftMatcher.js',
  'backend/services/songshiftMatcher.js',
  'backend/routes/advancedSync.js',
  'backend/routes/songshiftSync.js',
];

// Logger import statement
const LOGGER_IMPORT = "const logger = require('../utils/logger');";

// Mapping of console methods to logger methods
const consoleMappings = [
  {
    pattern: /console\.error\((.*)\);?/g,
    replacement: 'logger.error($1);',
  },
  {
    pattern: /console\.warn\((.*)\);?/g,
    replacement: 'logger.warn($1);',
  },
  {
    pattern: /console\.log\((.*)\);?/g,
    replacement: 'logger.info($1);',
  },
  {
    pattern: /console\.debug\((.*)\);?/g,
    replacement: 'logger.debug($1);',
  },
];

function migrateFile(filePath) {
  console.log(`\nProcessing: ${filePath}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    // Add logger import if not present
    if (!content.includes("require('../utils/logger')") && !content.includes('const logger =')) {
      // Find the first require statement
      const requireMatch = content.match(/^const .* = require\(/m);
      if (requireMatch) {
        const insertPos = content.indexOf(requireMatch[0]) + requireMatch[0].length;
        const lineEnd = content.indexOf('\n', insertPos);
        content = content.slice(0, lineEnd + 1) + LOGGER_IMPORT + '\n' + content.slice(lineEnd + 1);
        changed = true;
        console.log('  ✓ Added logger import');
      }
    }
    
    // Replace console statements
    let replacementCount = 0;
    for (const mapping of consoleMappings) {
      const matches = content.match(mapping.pattern);
      if (matches) {
        content = content.replace(mapping.pattern, mapping.replacement);
        replacementCount += matches.length;
        changed = true;
      }
    }
    
    if (replacementCount > 0) {
      console.log(`  ✓ Replaced ${replacementCount} console statements`);
    }
    
    // Write back if changed
    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`  ✓ File updated successfully`);
      return true;
    } else {
      console.log(`  - No changes needed`);
      return false;
    }
  } catch (error) {
    console.error(`  ✗ Error processing file: ${error.message}`);
    return false;
  }
}

function main() {
  console.log('🔄 Starting logger migration...\n');
  console.log('=' .repeat(60));
  
  let successCount = 0;
  let failCount = 0;
  
  for (const file of filesToMigrate) {
    const fullPath = path.join(__dirname, '..', file);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`\n⚠️  File not found: ${file}`);
      failCount++;
      continue;
    }
    
    if (migrateFile(fullPath)) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Migration Summary:');
  console.log(`  ✓ Successfully migrated: ${successCount} files`);
  console.log(`  ✗ Failed or skipped: ${failCount} files`);
  console.log(`  📝 Total processed: ${filesToMigrate.length} files`);
  console.log('\n✅ Migration complete!\n');
}

main();

