#!/usr/bin/env node
/**
 * Test the new professional logger
 */

const logger = require('../backend/logger');

console.log('\n🧪 Testing Professional Logger\n');
console.log('=' .repeat(80));

// Test different log levels
logger.info('Application started successfully');
logger.debug('Debug information (only shown in DEBUG mode)');
logger.warn('This is a warning message');
logger.error('This is an error message');

// Test HTTP logging
logger.http('GET', '/api/playlists/spotify', 200, 45, 'abc123');
logger.http('POST', '/sync/enhanced', 500, 1234, 'def456');

// Test rate limiting
console.log('\n📊 Testing rate limiting (same message 10 times):\n');
for (let i = 0; i < 10; i++) {
  logger.warn('Spotify API rate limited, retrying after 1000ms');
}

// Test sync logging
logger.sync('sync_start', { source: 'apple', destination: 'spotify', tracks: 326 });

console.log('\n' + '='.repeat(80));
console.log('\n✅ Logger test complete!');
console.log('\n📁 Check logs/ directory for the log file');
console.log('💡 Tip: Run with LOG_LEVEL=DEBUG to see debug messages\n');

