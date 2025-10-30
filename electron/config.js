const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

// Default configuration
const DEFAULT_CONFIG = {
  APP_VERSION: '1.0.0',
  UPDATE_URLS: {
    versionCheck: process.env.UPDATE_VERSION_URL || 'https://example.com/version_status.txt',
    downloadUrl: process.env.UPDATE_DOWNLOAD_URL || 'https://example.com/syncmyplays.exe'
  },
  KILL_SWITCH_URL: process.env.KILL_SWITCH_URL || 'https://example.com/kill_switch.txt',
  VERSION_URL: process.env.VERSION_URL || 'https://example.com/version_status.txt',
  // Music service configurations
  APPLE_MUSIC: {
    clientId: process.env.APPLE_MUSIC_CLIENT_ID || '',
    clientSecret: process.env.APPLE_MUSIC_CLIENT_SECRET || '',
    redirectUri: process.env.APPLE_MUSIC_REDIRECT_URI || 'http://localhost:8000/auth/apple/callback'
  },
  SPOTIFY: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8000/auth/spotify/callback'
  },
  // Backend configuration
  BACKEND: {
    port: process.env.BACKEND_PORT || 8000,
    host: process.env.BACKEND_HOST || '127.0.0.1'
  },
  // Security settings
  SECURITY: {
    enableKillSwitch: process.env.ENABLE_KILL_SWITCH !== 'false',
    enableUpdateCheck: process.env.ENABLE_UPDATE_CHECK !== 'false',
    requireAdmin: process.env.REQUIRE_ADMIN !== 'false'
  }
};

// Configuration file paths
const CONFIG_PATHS = {
  development: path.join(__dirname, '../config.json'),
  production: path.join(process.resourcesPath, 'app.asar.unpacked', 'config.json'),
  fallback: path.join(__dirname, 'config.json')
};

// Get the appropriate config file path
function getConfigPath() {
  if (process.env.NODE_ENV === 'development') {
    return CONFIG_PATHS.development;
  } else if (process.resourcesPath) {
    return CONFIG_PATHS.production;
  } else {
    return CONFIG_PATHS.fallback;
  }
}

// Load configuration from file
function loadConfig() {
  try {
    const configPath = getConfigPath();
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const userConfig = JSON.parse(configData);
      
      // Merge user config with defaults
      return mergeConfig(DEFAULT_CONFIG, userConfig);
    } else {
      console.log('Config file not found, using defaults');
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error('Error loading config:', error.message);
    return DEFAULT_CONFIG;
  }
}

// Save configuration to file
function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    
    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Sanitize config before saving
    const sanitizedConfig = sanitizeConfig(config);
    
    fs.writeFileSync(configPath, JSON.stringify(sanitizedConfig, null, 2));
    console.log('Config saved successfully');
    return { success: true };
  } catch (error) {
    console.error('Error saving config:', error.message);
    return { success: false, error: error.message };
  }
}

// Merge two configuration objects
function mergeConfig(defaultConfig, userConfig) {
  const merged = { ...defaultConfig };
  
  for (const [key, value] of Object.entries(userConfig)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      merged[key] = mergeConfig(merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  }
  
  return merged;
}

// Sanitize configuration to remove sensitive data
function sanitizeConfig(config) {
  const sanitized = { ...config };
  
  // Remove or mask sensitive fields
  if (sanitized.APPLE_MUSIC) {
    if (sanitized.APPLE_MUSIC.clientSecret) {
      sanitized.APPLE_MUSIC.clientSecret = '***MASKED***';
    }
  }
  
  if (sanitized.SPOTIFY) {
    if (sanitized.SPOTIFY.clientSecret) {
      sanitized.SPOTIFY.clientSecret = '***MASKED***';
    }
  }
  
  return sanitized;
}

// Validate configuration
function validateConfig(config) {
  const errors = [];
  
  // Validate required fields
  if (!config.APP_VERSION) {
    errors.push('APP_VERSION is required');
  }
  
  if (!config.UPDATE_URLS || !config.UPDATE_URLS.versionCheck) {
    errors.push('UPDATE_URLS.versionCheck is required');
  }
  
  if (!config.UPDATE_URLS || !config.UPDATE_URLS.downloadUrl) {
    errors.push('UPDATE_URLS.downloadUrl is required');
  }
  
  // Validate URLs
  try {
    new URL(config.UPDATE_URLS.versionCheck);
  } catch {
    errors.push('UPDATE_URLS.versionCheck must be a valid URL');
  }
  
  try {
    new URL(config.UPDATE_URLS.downloadUrl);
  } catch {
    errors.push('UPDATE_URLS.downloadUrl must be a valid URL');
  }
  
  // Validate backend configuration
  if (config.BACKEND) {
    const port = parseInt(config.BACKEND.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('BACKEND.port must be a valid port number (1-65535)');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Get configuration value by path
function getConfigValue(config, path) {
  const keys = path.split('.');
  let value = config;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  
  return value;
}

// Set configuration value by path
function setConfigValue(config, path, value) {
  const keys = path.split('.');
  let current = config;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

// Load and validate configuration
const config = loadConfig();
const validation = validateConfig(config);

if (!validation.valid) {
  console.warn('Configuration validation failed:', validation.errors);
  console.warn('Using default configuration');
}

module.exports = {
  ...config,
  // Utility functions
  saveConfig,
  loadConfig,
  validateConfig,
  getConfigValue,
  setConfigValue,
  sanitizeConfig
};
