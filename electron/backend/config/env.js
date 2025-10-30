/**
 * Environment Configuration Loader
 * Loads and validates environment variables
 */

require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Keys
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  },
  apple: {
    developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN || '',
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || '',
  },
  
  // Rate Limiting
  apiRateLimitMs: parseInt(process.env.API_RATE_LIMIT_MS || '25', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logFilePath: process.env.LOG_FILE_PATH || 'logs/',
  
  // Frontend
  frontendPort: parseInt(process.env.FRONTEND_PORT || '8080', 10),
  websocketPort: parseInt(process.env.WEBSOCKET_PORT || '3001', 10),
  
  // Parallel Processing
  maxParallelRequests: parseInt(process.env.MAX_PARALLEL_REQUESTS || '10', 10),
  batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
  
  // Matching
  matchThreshold: parseInt(process.env.MATCH_THRESHOLD || '60', 10),
  highConfidenceThreshold: parseInt(process.env.HIGH_CONFIDENCE_THRESHOLD || '85', 10),
};

// Validation
function validateConfig() {
  const errors = [];
  
  if (config.port < 1024 || config.port > 65535) {
    errors.push('PORT must be between 1024 and 65535');
  }
  
  if (config.apiRateLimitMs < 0) {
    errors.push('API_RATE_LIMIT_MS must be non-negative');
  }
  
  if (config.maxRetries < 0) {
    errors.push('MAX_RETRIES must be non-negative');
  }
  
  if (config.maxParallelRequests < 1) {
    errors.push('MAX_PARALLEL_REQUESTS must be at least 1');
  }
  
  if (config.batchSize < 1) {
    errors.push('BATCH_SIZE must be at least 1');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on load
validateConfig();

module.exports = config;

