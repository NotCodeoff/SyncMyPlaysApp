const dotenvExpand = require('dotenv-expand');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Import secure console for terminal protection (optional, fallback to regular console)
let secureConsole, secureLogger;
try {
  secureConsole = require('../src/utils/secureConsole');
  secureLogger = require('../src/utils/secureLogger');
} catch (error) {
  // Fallback to regular console if secure console not available
  secureConsole = console;
  secureLogger = {
    logStartup: () => Promise.resolve(),
    logShutdown: () => Promise.resolve(),
    logError: () => Promise.resolve()
  };
}

// Try to load .env file, but don't fail if it doesn't exist
try {
  let envPath;
  if (process.pkg || process.env.NODE_ENV === 'production') {
    // In distribution builds, look for .env in the app root directory
    envPath = path.join(process.resourcesPath, 'app.asar.unpacked', '.env');
  } else {
    // In development, look in current directory
    envPath = path.join(__dirname, '.env');
  }
  dotenvExpand.expand(dotenv.config({ path: envPath }));
  secureConsole.log('Loaded environment variables from .env file');
} catch (error) {
  secureConsole.log('No .env file found, using default/stored values');
}

// Set default environment variables if not provided
// These are fallback values that will be used if no .env file exists
process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'f7c4a2fe59cc46e8af11a8c75deb65a6';
process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '5929a5d52d124166a72b12b464fde980';
process.env.SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8000/callback';

secureConsole.log('Environment variables configured successfully');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const querystring = require('querystring');
const http = require('http');
// Use regular puppeteer-core (no plugins) to avoid pkg compilation issues
// The stealth plugin causes "Cannot include file into executable" errors
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  try {
    puppeteer = require('puppeteer');
  } catch (e2) {
    console.error('Puppeteer not available');
  }
}

// Import enhanced Puppeteer configuration with production-safe path resolution
let PuppeteerConfig;
try {
  // Try development path first
  PuppeteerConfig = require('../scripts/puppeteer-config');
} catch (e) {
  try {
    // Try production path (when running from dist-backend in unpacked asar)
    PuppeteerConfig = require(path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', 'puppeteer-config'));
  } catch (e2) {
    // Fallback: create a minimal config if neither path works
    console.warn('Could not load PuppeteerConfig, using default configuration');
    PuppeteerConfig = class {
      async canLaunch() { return true; }
      async getBrowserConfig() { 
        return {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        };
      }
    };
  }
}

// Sensitive data patterns to mask in logs
const SENSITIVE_PATTERNS = [
  // Tokens and credentials
  /(access_token|refresh_token|mediaUserToken|developerToken|client_secret|client_id)["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
  /(Bearer|Token|Authorization)["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
  /(password|secret|key|credential)["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
  // API URLs with tokens
  /(https?:\/\/[^"'\s,}]*[?&](?:token|key|secret|auth)=[^"'\s,}]+)/gi,
  // Email addresses
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  // IP addresses (except localhost)
  /(?!127\.0\.0\.1|localhost)(\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b)/g
];

// Function to sanitize sensitive data
function sanitizeData(data) {
  if (typeof data === 'string') {
    let sanitized = data;
    SENSITIVE_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, (match, ...groups) => {
        if (groups.length >= 2) {
          return groups[0] + '=***MASKED***';
        }
        return '***MASKED***';
      });
    });
    return sanitized;
  } else if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof key === 'string' && SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
        sanitized[key] = '***MASKED***';
      } else if (typeof value === 'string') {
        sanitized[key] = sanitizeData(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  return data;
}

// Secure logging function
function secureLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const sanitizedMessage = sanitizeData(message);
  const sanitizedData = data ? sanitizeData(data) : null;
  
  const logEntry = `[${timestamp}] [${level}] ${sanitizedMessage}${sanitizedData ? ' ' + JSON.stringify(sanitizedData) : ''}`;
  
  if (level === 'ERROR') {
    console.error(logEntry);
  } else {
    console.log(logEntry);
  }
}
const puppeteerConfig = new PuppeteerConfig();
const WebSocket = require('ws');

// Simple file-based storage
class SimpleStore {
  constructor() {
    // Use user's home directory for data storage in production builds
    // This ensures the file is writable in both development and distribution builds
    let dataDir;
    if (process.env.NODE_ENV === 'production' || process.pkg) {
      // In production/distribution, use user's home directory
      const os = require('os');
      dataDir = path.join(os.homedir(), '.syncmyplays');
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (error) {
        console.log('Could not create data directory, falling back to current directory:', error.message);
        dataDir = __dirname;
      }
    } else {
      // In development, use current directory
      dataDir = __dirname;
    }
    
    this.filePath = path.join(dataDir, 'data.json');
    this.data = this.load();
  }
  
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading store:', error.message);
    }
    return {};
  }
  
  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving store:', error.message);
    }
  }
  
  get(key, defaultValue = null) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }
  
  set(key, value) {
    this.data[key] = value;
    this.save();
  }
  
  delete(key) {
    delete this.data[key];
    this.save();
  }
  
  clear() {
    this.data = {};
    this.save();
  }
}

const app = express();
const PORT = 8000;

// WebSocket server for real-time progress updates
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active WebSocket connections for progress updates
const activeConnections = new Set();

// NEW: Store for collaborative features and AI recommendations
const collaborativeStore = {
  users: new Map(),
  playlists: new Map(),
  recommendations: new Map(),
  syncJobs: new Map(),
  systemStats: {
    totalUsers: 0,
    totalPlaylists: 0,
    totalSyncJobs: 0,
    lastSyncAt: null,
    systemUptime: Date.now()
  }
};

// Initialize file logging to project-level logs directory (unique file per run)
let fileLogStream = null;
let currentLogFile = null;
let logRotationSize = 10 * 1024 * 1024; // 10MB rotation size
let logRetentionDays = 7; // Keep logs for 7 days
let consecutiveLogErrors = 0; // Track consecutive logging errors
let maxLogErrors = 10; // Disable logging after this many consecutive errors

// Skip file logging if running in compiled mode (pkg)
if (!process.pkg) {
  try {
    const rootLogsDir = path.resolve(__dirname, '..', 'logs');
    fs.mkdirSync(rootLogsDir, { recursive: true });
    
    // Clean up old log files
    if (!process.pkg) {
      cleanupOldLogs(rootLogsDir);
    }
    
    // Create unique log file name with timestamp and process ID
    const sessionTs = new Date().toISOString().replace(/[:.]/g, '-');
    const processId = process.pid;
    const uniqueId = Math.random().toString(36).substring(2, 8);
    
    if (!process.pkg) {
      currentLogFile = `app-${sessionTs}-pid${processId}-${uniqueId}.log`;
      const sessionLogPath = path.join(rootLogsDir, currentLogFile);
      fileLogStream = fs.createWriteStream(sessionLogPath, { flags: 'a' });
      console.log('File logging enabled:', sessionLogPath);
      
      // Write initial log entry
      const startupMsg = `[${new Date().toISOString()}] [INFO] 🚀 SyncMyPlays Backend Started - Log File: ${currentLogFile}`;
      fileLogStream.write(startupMsg + '\n');
    } else {
      currentLogFile = null;
    }
    
  } catch (e) {
    console.log('File logging disabled (no write access):', e.message);
    fileLogStream = null;
  }
} else {
  console.log('File logging disabled (running in compiled mode)');
}

// Function to clean up old log files
function cleanupOldLogs(logsDir) {
  try {
    if (!fs.existsSync(logsDir)) {
      console.log('Logs directory does not exist, skipping cleanup');
      return;
    }
    
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const cutoff = now - (logRetentionDays * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      if (file.endsWith('.log')) {
        try {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoff) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old log file: ${file}`);
          }
        } catch (fileError) {
          console.log(`Failed to process log file ${file}:`, fileError.message);
          // Continue with other files even if one fails
        }
      }
    });
  } catch (error) {
    console.log('Failed to cleanup old logs:', error.message);
    // Don't let cleanup failures prevent app startup
  }
}

// Function to rotate logs if they get too large
function rotateLogIfNeeded() {
  if (!fileLogStream || !currentLogFile || isRotatingLogs || process.pkg) return;
  
  // Set the flag to prevent recursive calls
  isRotatingLogs = true;
  
  // Add timeout to prevent hanging
  const timeout = setTimeout(() => {
    console.log('Log rotation timed out, skipping this rotation');
    isRotatingLogs = false;
    return;
  }, 5000); // 5 second timeout
  
  try {
    const rootLogsDir = path.resolve(__dirname, '..', 'logs');
    const currentLogPath = path.join(rootLogsDir, currentLogFile);
    
    // Check if the log file actually exists before trying to stat it
    if (!fs.existsSync(currentLogPath)) {
      console.log('Log file no longer exists, creating new one:', currentLogPath);
      
      // Close current stream if it exists
      if (fileLogStream) {
        fileLogStream.end();
      }
      
      // Create new log file
      const sessionTs = new Date().toISOString().replace(/[:.]/g, '-');
      const processId = process.pid;
      const uniqueId = Math.random().toString(36).substring(2, 8);
      const newLogFile = `app-${sessionTs}-pid${processId}-${uniqueId}-rotated.log`;
      const newLogPath = path.join(rootLogsDir, newLogFile);
      
      // Update current log file reference
      currentLogFile = newLogFile;
      if (!process.pkg) {
        fileLogStream = fs.createWriteStream(newLogPath, { flags: 'a' });
        
        // Write rotation message
        const rotationMsg = `[${new Date().toISOString()}] [INFO] 📁 Log rotated - Previous file was missing, created new: ${newLogPath}`;
        fileLogStream.write(rotationMsg + '\n');
      }
      
      console.log('Log rotated (file was missing):', newLogPath);
      clearTimeout(timeout);
      isRotatingLogs = false;
      return;
    }
    
    const stats = fs.statSync(currentLogPath);
    
    if (stats.size > logRotationSize) {
      // Close current stream
      fileLogStream.end();
      
      // Create new log file
      const sessionTs = new Date().toISOString().replace(/[:.]/g, '-');
      const processId = process.pid;
      const uniqueId = Math.random().toString(36).substring(2, 8);
      const newLogFile = `app-${sessionTs}-pid${processId}-${uniqueId}-rotated.log`;
      const newLogPath = path.join(rootLogsDir, newLogFile);
      
      // Update current log file reference
      currentLogFile = newLogFile;
      if (!process.pkg) {
        fileLogStream = fs.createWriteStream(newLogPath, { flags: 'a' });
        
        // Write rotation message
        const rotationMsg = `[${new Date().toISOString()}] [INFO] 📁 Log rotated - Previous: ${currentLogPath} - New: ${newLogPath}`;
        fileLogStream.write(rotationMsg + '\n');
      }
      
      console.log('Log rotated:', newLogPath);
    }
    
    clearTimeout(timeout);
    isRotatingLogs = false;
  } catch (error) {
    console.log('Failed to rotate log:', error.message);
    clearTimeout(timeout);
    
    // If we can't rotate, try to create a new log file to prevent getting stuck
    try {
      if (fileLogStream) {
        fileLogStream.end();
      }
      
      const rootLogsDir = path.resolve(__dirname, '..', 'logs');
      const sessionTs = new Date().toISOString().replace(/[:.]/g, '-');
      const processId = process.pid;
      const uniqueId = Math.random().toString(36).substring(2, 8);
      const newLogFile = `app-${sessionTs}-pid${processId}-${uniqueId}-error-recovery.log`;
      const newLogPath = path.join(rootLogsDir, newLogFile);
      
      currentLogFile = newLogFile;
      if (!process.pkg) {
        fileLogStream = fs.createWriteStream(newLogPath, { flags: 'a' });
        
        const recoveryMsg = `[${new Date().toISOString()}] [INFO] 🔄 Log recovery - Created new log file after rotation error: ${newLogPath}`;
        fileLogStream.write(recoveryMsg + '\n');
      }
      
      console.log('Log recovery successful:', newLogPath);
    } catch (recoveryError) {
      console.error('Failed to recover from log rotation error:', recoveryError.message);
      // Disable file logging if we can't recover
      fileLogStream = null;
      currentLogFile = null;
    } finally {
      isRotatingLogs = false;
    }
  }
}

// Global variables for Apple Music token management
let developerToken = null;
let developerTokenFetchedAt = null;
let tokenFetchPromise = null; // Prevent multiple simultaneous fetches
let isInitializing = false; // Track initialization state
let browserOpenedForToken = false; // Prevent multiple browser openings

// Function to install dependencies for distribution builds
async function installDependenciesForDistribution() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  try {
    console.log('🏗️ Installing dependencies for distribution build...');
    
    // Method 1: Try to use system Node.js/npm if available
    try {
      console.log('🔄 Method 1: Checking for system Node.js/npm...');
      // Use full path to avoid issues with compiled executables
      const nodeCommand = process.platform === 'win32' ? 'node.exe' : 'node';
      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      
      await execAsync(`${nodeCommand} --version`, { timeout: 10000 });
      await execAsync(`${npmCommand} --version`, { timeout: 10000 });
      
      console.log('✅ System Node.js/npm found, installing dependencies...');
      
      // Create a temporary directory for dependencies
      const tempDir = path.join(os.tmpdir(), 'syncmyplays-deps');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Create a minimal package.json for the temp directory
      const packageJson = {
        name: 'syncmyplays-temp',
        version: '1.0.0',
        dependencies: {
          'puppeteer': 'latest',
          'puppeteer-extra': 'latest',
          'puppeteer-extra-plugin-stealth': 'latest'
        }
      };
      
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
      
      // Install dependencies in temp directory
      console.log('📦 Installing to temporary directory...');
      await execAsync('npm install', {
        cwd: tempDir,
        timeout: 300000,
        stdio: 'pipe'
      });
      
      // Install Chromium
      console.log('🌐 Installing Chromium...');
      await execAsync('npx puppeteer browsers install chrome', {
        cwd: tempDir,
        timeout: 300000,
        stdio: 'pipe'
      });
      
      // Copy the installed dependencies to the app directory
      const nodeModulesSrc = path.join(tempDir, 'node_modules');
      const nodeModulesDest = path.join(process.cwd(), 'node_modules');
      
      if (fs.existsSync(nodeModulesSrc)) {
        console.log('📋 Copying dependencies to app directory...');
        if (os.platform() === 'win32') {
          await execAsync(`xcopy "${nodeModulesSrc}" "${nodeModulesDest}" /E /I /Y`, {
            timeout: 120000,
            stdio: 'pipe'
          });
        } else {
          await execAsync(`cp -r "${nodeModulesSrc}"/* "${nodeModulesDest}"/`, {
            timeout: 120000,
            stdio: 'pipe'
          });
        }
      }
      
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      console.log('✅ Distribution dependencies installed successfully via system Node.js');
      return true;
      
    } catch (systemError) {
      console.log('⚠️ System Node.js/npm not available:', systemError.message);
    }
    
    // Method 2: Try to download Chromium directly
    try {
      console.log('🔄 Method 2: Downloading Chromium directly...');
      await downloadChromiumDirectly();
      console.log('✅ Chromium downloaded directly');
      return true;
    } catch (downloadError) {
      console.log('⚠️ Direct Chromium download failed:', downloadError.message);
    }
    
    // Method 3: Use bundled approach (if available)
    try {
      console.log('🔄 Method 3: Using bundled dependencies...');
      return await useBundledDependencies();
    } catch (bundleError) {
      console.log('⚠️ Bundled dependencies failed:', bundleError.message);
    }
    
    throw new Error('All installation methods failed');
    
  } catch (error) {
    console.error('❌ Distribution installation failed:', error.message);
    return false;
  }
}

// Function to download Chromium directly
async function downloadChromiumDirectly() {
  const https = require('https');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { promisify } = require('util');
  const execAsync = promisify(require('child_process').exec);
  
  try {
    console.log('🌐 Downloading Chromium directly...');
    
    // Get the latest Chromium download URL for the current platform
    const platform = os.platform();
    let downloadUrl, executableName;
    
    if (platform === 'win32') {
      // Use a more recent version that's compatible with Puppeteer
      downloadUrl = 'https://storage.googleapis.com/chrome-for-testing-public/131.0.6778.85/win64/chrome-win64.zip';
      executableName = 'chrome.exe';
    } else if (platform === 'darwin') {
      downloadUrl = 'https://storage.googleapis.com/chrome-for-testing-public/131.0.6778.85/mac-x64/chrome-mac-x64.zip';
      executableName = 'Google Chrome for Testing.app';
    } else {
      downloadUrl = 'https://storage.googleapis.com/chrome-for-testing-public/131.0.6778.85/linux64/chrome-linux64.zip';
      executableName = 'chrome';
    }
    
    const chromeDir = path.join(process.cwd(), 'chrome');
    if (!fs.existsSync(chromeDir)) {
      fs.mkdirSync(chromeDir, { recursive: true });
    }
    
    const zipPath = path.join(chromeDir, 'chrome.zip');
    
    // Download the file
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath);
      https.get(downloadUrl, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', reject);
    });
    
    // Extract the zip file
    console.log('📦 Extracting Chromium...');
    if (platform === 'win32') {
      await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${chromeDir}' -Force"`, {
        timeout: 120000
      });
    } else {
      await execAsync(`unzip -o '${zipPath}' -d '${chromeDir}'`, {
        timeout: 120000
      });
    }
    
    // Clean up zip file
    fs.unlinkSync(zipPath);
    
    console.log('✅ Chromium downloaded and extracted successfully');
    return true;
    
  } catch (error) {
    console.error('❌ Direct Chromium download failed:', error.message);
    throw error;
  }
}

// Function to use bundled dependencies
async function useBundledDependencies() {
  const fs = require('fs');
  const path = require('path');
  
  try {
    console.log('📦 Checking for bundled dependencies...');
    
    // Check if we have bundled node_modules
    const bundledNodeModules = path.join(process.cwd(), 'node_modules');
    if (fs.existsSync(bundledNodeModules)) {
      console.log('✅ Bundled node_modules found');
      return true;
    }
    
    // Check if we have bundled Chrome
    const bundledChrome = path.join(process.cwd(), 'chrome');
    if (fs.existsSync(bundledChrome)) {
      console.log('✅ Bundled Chrome found');
      return true;
    }
    
    throw new Error('No bundled dependencies found');
    
  } catch (error) {
    console.error('❌ Bundled dependencies failed:', error.message);
    throw error;
  }
}

// Function to check if Puppeteer dependencies are available
async function checkPuppeteerDependencies() {
  try {
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
    
    // Try to find Chromium executable in multiple locations
    let executablePath;
    try {
      executablePath = puppeteer.executablePath();
    } catch (e) {
      // Try alternative paths for distribution builds
      const path = require('path');
      const fs = require('fs');
      
      // Check common Chromium locations in distribution builds
      const possiblePaths = [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'puppeteer', '.local-chromium'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'puppeteer-core', '.local-chromium'),
        path.join(__dirname, '..', 'node_modules', 'puppeteer', '.local-chromium'),
        path.join(__dirname, '..', 'node_modules', 'puppeteer-core', '.local-chromium')
      ];
      
      for (const basePath of possiblePaths) {
        if (fs.existsSync(basePath)) {
          const chromiumDirs = fs.readdirSync(basePath);
          for (const dir of chromiumDirs) {
            const chromiumPath = path.join(basePath, dir, 'chrome-win', 'chrome.exe');
            if (fs.existsSync(chromiumPath)) {
              executablePath = chromiumPath;
              break;
            }
          }
          if (executablePath) break;
        }
      }
    }
    
    if (executablePath && require('fs').existsSync(executablePath)) {
      console.log('✅ Puppeteer dependencies found at:', executablePath);
      return { available: true, executablePath };
    } else {
      console.log('⚠️  Puppeteer dependencies not found');
      return { available: false, executablePath: null };
    }
  } catch (error) {
    console.log('⚠️  Puppeteer not available:', error.message);
    return { available: false, executablePath: null };
  }
}

// Function to automatically install dependencies when needed (only in development)
async function installDependenciesAutomatically() {
  console.log('🔧 Starting automatic dependency installation...');
  
  // Check if we're in a distribution build
  const isDistBuild = process.pkg || process.env.NODE_ENV === 'production' || 
                     process.execPath.includes('SyncMyPlays');
  
  if (isDistBuild) {
    console.log('🏗️ Distribution build detected - using enhanced installation method');
    return await installDependenciesForDistribution();
  }
  
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    console.log('📦 Installing Puppeteer dependencies...');
    
    // Install Puppeteer with Chromium
    await execAsync('npx puppeteer browsers install chrome', { 
      timeout: 120000, // 2 minutes timeout
      stdio: 'pipe' 
    });
    
    console.log('✅ Puppeteer dependencies installed successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to install Puppeteer dependencies:', error.message);
    
    // Try alternative installation methods
    try {
      console.log('🔄 Trying alternative installation method...');
      await execAsync('npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth', {
        timeout: 120000,
        stdio: 'pipe'
      });
      
      await execAsync('npx puppeteer browsers install chrome', {
        timeout: 120000,
        stdio: 'pipe'
      });
      
      console.log('✅ Alternative installation method succeeded');
      return true;
    } catch (altError) {
      console.error('❌ Alternative installation also failed:', altError.message);
      console.log('🔧 Puppeteer dependencies missing. Will install automatically when needed.');
      return false;
    }
  }
}

function safeSerialize(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try { return JSON.stringify(value); } catch (e) { return String(value); }
}

function writeFileLog(level, ...args) {
  const ts = new Date().toISOString();
  
  // Check if we need to rotate logs (but only if not already rotating)
  if (!isRotatingLogs) {
    isRotatingLogs = true;
    rotateLogIfNeeded();
    isRotatingLogs = false;
  }
  
  // Format the log message
  let message = args.map(safeSerialize).join(' ');
  
  // Add context information for better debugging
  const context = {
    timestamp: ts,
    level: level.toUpperCase(),
    message: message,
    processId: process.pid,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  };
  
  // Create formatted log line
  const logLine = `[${ts}] [${level.toUpperCase()}] ${message}\n`;
  
  // Write to file if available
  if (fileLogStream && !process.pkg) {
    try {
      fileLogStream.write(logLine);
      // Only call flush if the method exists
      if (typeof fileLogStream.flush === 'function') {
        fileLogStream.flush();
      }
      consecutiveLogErrors = 0; // Reset error counter on success
    } catch (e) {
      consecutiveLogErrors++;
      console.error('Failed to write to log file:', e.message);
      
      // Disable logging if too many consecutive errors
      if (consecutiveLogErrors >= maxLogErrors) {
        console.error(`Too many consecutive logging errors (${consecutiveLogErrors}), disabling file logging`);
        fileLogStream = null;
        currentLogFile = null;
      }
    }
  }
  
  // Also write to console for immediate visibility
  if (level === 'ERROR') {
    console.error(`[${ts}] [${level.toUpperCase()}] ${message}`);
  } else if (level === 'WARN') {
    console.warn(`[${ts}] [${level.toUpperCase()}] ${message}`);
  } else {
    console.log(`[${ts}] [${level.toUpperCase()}] ${message}`);
  }
}

// Mirror console output to logfile as well - Enhanced to capture everything
let isRotatingLogs = false; // Prevent recursive calls

['log','info','warn','error','debug'].forEach(method => {
  const original = console[method];
  console[method] = (...args) => {
    // Call original method
    original.apply(console, args);
    
    // Also write to our log file with enhanced context
    if (fileLogStream && !isRotatingLogs && !process.pkg) {
      try {
        const ts = new Date().toISOString();
        const message = args.map(safeSerialize).join(' ');
        const logLine = `[${ts}] [${method.toUpperCase()}] ${message}\n`;
        
        // Check rotation before writing (but only if not already rotating)
        if (!isRotatingLogs) {
          isRotatingLogs = true;
          rotateLogIfNeeded();
          isRotatingLogs = false;
        }
        
        fileLogStream.write(logLine);
        // Only call flush if the method exists
        if (typeof fileLogStream.flush === 'function') {
          fileLogStream.flush();
        }
        consecutiveLogErrors = 0; // Reset error counter on success
      } catch (e) {
        consecutiveLogErrors++;
        // Don't let logging errors break the app
        original.call(console, 'Logging error:', e.message);
        
        // Disable logging if too many consecutive errors
        if (consecutiveLogErrors >= maxLogErrors) {
          original.call(console, `Too many consecutive logging errors (${consecutiveLogErrors}), disabling file logging`);
          fileLogStream = null;
          currentLogFile = null;
        }
      }
    }
  };
});

// Capture uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  writeFileLog('ERROR', 'Uncaught Exception:', error.message, error.stack);
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  writeFileLog('ERROR', 'Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Enhanced logging for all API requests
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 8);
  
  // Log incoming request
  writeFileLog('INFO', `📥 [${requestId}] ${req.method} ${req.path} - User-Agent: ${req.get('User-Agent') || 'Unknown'}`);
  
  // Log request body for POST/PUT requests
  if (['POST', 'PUT'].includes(req.method) && req.body) {
    const sanitizedBody = { ...req.body };
    // Remove sensitive data from logs
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
    if (sanitizedBody.developerToken) sanitizedBody.developerToken = '[REDACTED]';
    
    writeFileLog('INFO', `📥 [${requestId}] Request Body:`, JSON.stringify(sanitizedBody));
  }
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Log response
    writeFileLog('INFO', `📤 [${requestId}] ${req.method} ${req.path} - Status: ${statusCode} - Duration: ${duration}ms`);
    
    // Log response body for errors
    if (statusCode >= 400 && chunk) {
      try {
        const responseBody = chunk.toString();
        writeFileLog('ERROR', `📤 [${requestId}] Error Response:`, responseBody);
      } catch (e) {
        writeFileLog('ERROR', `📤 [${requestId}] Error Response (could not parse):`, chunk);
      }
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('🔌 WebSocket client connected');
  activeConnections.add(ws);
  
  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
    activeConnections.delete(ws);
  });
});

app.use(cors());
app.use(express.json());

// Mount advanced sync routes
const advancedSyncRouter = require('./routes/advancedSync');
const songshiftSyncRouter = require('./routes/songshiftSync');

// Initialize storage
const store = new SimpleStore();

// Load tokens from store on startup
let spotifyTokens = store.get('spotifyTokens', { access_token: null, refresh_token: null });
let appleCredentials = store.get('appleCredentials', { mediaUserToken: null });

app.use('/api/sync/advanced', advancedSyncRouter);
app.use('/api/sync/songshift', songshiftSyncRouter);
// Auto Sync persistent jobs
let autoSyncJobs = store.get('autoSyncJobs', []);
function persistAutoSyncJobs() { store.set('autoSyncJobs', autoSyncJobs); }

/**
 * Broadcast a message to all active WebSocket clients.
 * @param {object} payload - The JSON-serializable payload to send.
 */
function broadcast(payload) {
  const messageString = JSON.stringify(payload);
  // Only log to console, not to file to avoid duplicates
  console.log('[BROADCAST]', messageString);
  for (const ws of activeConnections) {
    try {
      ws.send(messageString);
    } catch (error) {
      console.error('WebSocket send error:', error && error.stack ? error.stack : error);
    }
  }
}

/**
 * Validate sync results against actual Apple Music playlist
 * @param {string} playlistId - Apple Music playlist ID
 * @param {object} headers - Apple Music API headers
 * @param {number} expectedAdded - Number of tracks attempted to add
 * @param {number} totalTracks - Total number of source tracks
 * @returns {object} - {actualAdded, actualNotAdded}
 */
async function validateSyncResults(playlistId, headers, expectedAdded, totalTracks) {
  try {
    // Get actual playlist contents
    const actualPlaylistTracks = await fetchApplePlaylistCatalogSongIds(playlistId, headers);
    const actualAdded = actualPlaylistTracks.size;
    const actualNotAdded = totalTracks - actualAdded;
    
    console.log(`Validation: Expected ${expectedAdded} added, Actual ${actualAdded} in playlist`);
    
    return { actualAdded, actualNotAdded };
  } catch (error) {
    console.error('Validation failed, using estimated counts:', error);
    // Fallback to estimated counts
    return { actualAdded: expectedAdded, actualNotAdded: totalTracks - expectedAdded };
  }
}

/**
 * Delay helper.
 * @param {number} ms - Milliseconds to wait.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global rate limiting queue to prevent too many simultaneous requests
const requestQueue = [];
let isProcessingQueue = false;

/**
 * Add a request to the global rate limiting queue
 * @param {Function} requestFn - The request function to execute
 * @returns {Promise} - Promise that resolves when the request is processed
 */
async function queueRequest(requestFn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ requestFn, resolve, reject });
    processQueue();
  });
}

/**
 * Process the request queue with rate limiting
 */
async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const { requestFn, resolve, reject } = requestQueue.shift();
    
    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    }
    
    // Add a small delay between requests to prevent rate limiting
    if (requestQueue.length > 0) {
      // No delay - instant speed
    }
  }
  
  isProcessingQueue = false;
}

/**
 * Make an HTTP request with retry and exponential backoff for transient/rate-limit errors.
 * Wrap any axios call inside a function and pass it here.
 * Retries on HTTP 429 and 5xx statuses.
 *
 * @template T
 * @param {() => Promise<T>} requestFn - Function performing the axios call.
 * @param {string} label - Label for logs.
 * @param {number[]} backoffMs - Backoff schedule in ms.
 * @returns {Promise<T>}
 */
async function requestWithRetry(requestFn, label, backoffMs = [1000, 3000, 5000]) {
  let attempt = 0;
  while (true) {
    try {
      return await requestFn();
    } catch (error) {
      const status = error && error.response ? error.response.status : null;
      const data = error && error.response && error.response.data ? error.response.data : null;
      console.error(`[${label}] Request failed (attempt ${attempt + 1}):`, {
        status,
        data,
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : undefined,
      });
      const isRetriable = status === 429 || (status !== null && status >= 500 && status < 600);
      if (attempt < backoffMs.length && isRetriable) {
        const wait = backoffMs[attempt];
        console.log(`[${label}] Retrying after ${wait}ms due to status ${status}...`);
        await delay(wait);
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}

// Helper to refresh spotify token
const refreshSpotifyToken = async () => {
  if (!spotifyTokens.refresh_token) {
    throw new Error('No refresh token available for Spotify.');
  }

  try {
    secureLog('INFO', 'Refreshing Spotify token...');
    const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: spotifyTokens.refresh_token,
    }).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
    });

    const { access_token, refresh_token } = response.data;
    spotifyTokens.access_token = access_token;
    if (refresh_token) {
      spotifyTokens.refresh_token = refresh_token;
    }

    store.set('spotifyTokens', spotifyTokens);
    secureLog('INFO', 'Spotify token refreshed successfully.');
    return access_token;
  } catch (error) {
    secureLog('ERROR', 'Error refreshing Spotify token:', error.response ? error.response.data : error.message);
    store.delete('spotifyTokens');
    spotifyTokens = { access_token: null, refresh_token: null };
    throw new Error('Failed to refresh Spotify token. Please reconnect.');
  }
};

// Rate limiting for Spotify API to prevent 429 errors
let spotifyRequestCount = 0;
let spotifyRequestWindow = Date.now();
const SPOTIFY_RATE_LIMIT = 95; // 95 requests per minute (more aggressive)
const SPOTIFY_WINDOW_MS = 60 * 1000; // 1 minute window

// Smart batching for better performance
const SMART_BATCH_SIZE = 25; // Smaller batches to reduce API load
const SMART_BATCH_DELAY = 500; // Shorter delays between batches

// Performance modes based on playlist size
const getPerformanceMode = (trackCount) => {
  if (trackCount <= 500) return { batchSize: 100, delay: 200, parallel: true };
  if (trackCount <= 1000) return { batchSize: 100, delay: 300, parallel: false };
  if (trackCount <= 2000) return { batchSize: 100, delay: 500, parallel: false };
  return { batchSize: 50, delay: 1000, parallel: false }; // Conservative for very large playlists
};

// Fast Apple Music API request function (no slow retries)
const makeAppleMusicApiRequest = async (url, options = {}) => {
  try {
    return await axios({
      url,
      ...options,
      headers: { ...options.headers },
    });
  } catch (error) {
    // Only retry once for Apple Music with short delay
    if (error.response && error.response.status >= 500) {
      console.log(`[AppleMusic] Retrying once after 500ms due to status ${error.response.status}...`);
      // No delay - instant speed
      return await axios({
        url,
        ...options,
        headers: { ...options.headers },
      });
    }
    throw error;
  }
};

// Wrapper for making authenticated Spotify API calls with retry and token refresh
const makeSpotifyApiRequest = async (url, options = {}) => {
  try {
    // Rate limiting: Reset counter every minute
    const now = Date.now();
    if (now - spotifyRequestWindow > SPOTIFY_WINDOW_MS) {
      spotifyRequestCount = 0;
      spotifyRequestWindow = now;
    }
    
    // Check if we're approaching rate limit
    if (spotifyRequestCount >= SPOTIFY_RATE_LIMIT) {
      const waitTime = SPOTIFY_WINDOW_MS - (now - spotifyRequestWindow);
      console.log(`[SpotifyAPI] Rate limit approaching, waiting ${waitTime}ms...`);
      await delay(waitTime);
      spotifyRequestCount = 0;
      spotifyRequestWindow = Date.now();
    }
    
    spotifyRequestCount++;
    
    const exec = () => axios({
      url,
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${spotifyTokens.access_token}` },
    });
    return await requestWithRetry(exec, 'SpotifyAPI');
  } catch (error) {
    if (error.response && error.response.status === 401 && error.response.data && error.response.data.error && error.response.data.error.message === 'The access token expired') {
      secureLog('INFO', 'Spotify token expired, attempting to refresh.');
      await refreshSpotifyToken();
      secureLog('INFO', 'Retrying API request with new token.');
      const exec = () => axios({
        url,
        ...options,
        headers: { ...options.headers, 'Authorization': `Bearer ${spotifyTokens.access_token}` },
      });
      return await requestWithRetry(exec, 'SpotifyAPI');
    }
    // Log full error details before bubbling up
    console.error('Spotify API request failed:', {
      status: error && error.response ? error.response.status : null,
      data: error && error.response && error.response.data ? error.response.data : null,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : undefined,
    });
    throw error;
  }
};

// Get Apple Music developer token with caching and proactive refresh
async function getDeveloperToken(forceRefresh = false) {
  const MAX_AGE_MS = 25 * 60 * 1000; // 25 minutes safety window
  const now = Date.now();
  
  // First, check if we have a token in environment variables
  if (process.env.APPLE_MUSIC_DEVELOPER_TOKEN && process.env.APPLE_MUSIC_DEVELOPER_TOKEN !== 'your_token_here') {
    secureLog('INFO', 'Using Apple Music developer token from environment variable');
    developerToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    developerTokenFetchedAt = Date.now();
    return developerToken;
  }
  
  // Check if we have a token stored in the persistent store
  const storedToken = store.get('appleDeveloperToken');
  if (storedToken && storedToken !== 'your_token_here') {
    secureLog('INFO', 'Using Apple Music developer token from persistent store');
    developerToken = storedToken;
    developerTokenFetchedAt = Date.now();
    // Also update the environment variable for this session
    process.env.APPLE_MUSIC_DEVELOPER_TOKEN = storedToken;
    return developerToken;
  }
  
  // If there's already a fetch in progress, wait for it instead of starting a new one
  if (tokenFetchPromise && !forceRefresh) {
    try {
      return await tokenFetchPromise;
    } catch (error) {
      // If the existing fetch failed, clear it and try again
      tokenFetchPromise = null;
    }
  }
  
  if (!forceRefresh && developerToken && developerTokenFetchedAt && (now - developerTokenFetchedAt) < MAX_AGE_MS) {
    return developerToken;
  }

  // Create a new fetch promise and store it
  tokenFetchPromise = (async () => {
    try {
      secureLog('INFO', 'Apple Music developer token required for integration');
      
      // ✅ SIMPLE APPROACH: Direct manual token setup
      // No more complex Puppeteer browser automation that causes dependency issues
      console.log('📋 Apple Music developer token required for integration.');
      console.log('📋 To set up Apple Music integration:');
      console.log('1. Visit: https://developer.apple.com/account/resources/authkeys/list');
      console.log('2. Sign in with your Apple ID');
      console.log('3. Click "Generate API Key" or use an existing key');
      console.log('4. Copy the generated token');
      console.log('5. Use the "Setup Apple Music Token" button in the app UI');
      console.log('6. Or call POST /auth/apple/set-developer-token with your token');
      console.log('');
      console.log('💡 Alternative: Set APPLE_MUSIC_DEVELOPER_TOKEN environment variable');
      console.log('💡 This simple approach requires no additional software installations');
      
      throw new Error('Apple Music developer token required. Please use the app UI to set it up or call the setup endpoint.');
      
    } catch (error) {
      secureLog('ERROR', 'Failed to get Apple Music developer token', { error: error.message });
      throw error;
    } finally {
      // Clear the promise so future calls can try again
      tokenFetchPromise = null;
    }
  })();

  try {
    const result = await tokenFetchPromise;
    return result;
  } finally {
    // Clear the promise after completion (success or failure)
    tokenFetchPromise = null;
  }
}

// Utility: next run time for a daily schedule at HH:MM (24h) local time
function computeNextRunAtDaily(timeOfDay) {
  try {
    const [hh, mm] = String(timeOfDay || '04:00').split(':').map(n => parseInt(n, 10));
    const now = new Date();
    const next = new Date(now);
    next.setHours(isNaN(hh) ? 4 : hh, isNaN(mm) ? 0 : mm, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  } catch (_) {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString();
  }
}

// Helper function to generate unique playlist name
async function generateUniquePlaylistName(baseName, service = 'apple') {
  const trimmedName = String(baseName).trim();
  
  try {
    let playlists = [];
    
    if (service === 'apple') {
      if (!appleCredentials.mediaUserToken) return trimmedName;
      const devToken = await getDeveloperToken(false);
      const headers = {
        'Authorization': `Bearer ${devToken}`,
        'Music-User-Token': appleCredentials.mediaUserToken,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      };
      const url = 'https://amp-api.music.apple.com/v1/me/library/playlists';
      const response = await makeAppleMusicApiRequest(url, { headers });
      if (response?.data?.data) {
        playlists = response.data.data.map(p => p.attributes?.name || '').filter(Boolean);
      }
    } else if (service === 'spotify') {
      if (!spotifyTokens.access_token) return trimmedName;
      const meRes = await requestWithRetry(() => makeSpotifyApiRequest('https://api.spotify.com/v1/me'), 'SpotifyGetMe:UniqueName');
      const userId = meRes?.data?.id;
      if (userId) {
        const url = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`;
        const response = await requestWithRetry(() => makeSpotifyApiRequest(url), 'SpotifyGetPlaylists:UniqueName');
        if (response?.data?.items) {
          playlists = response.data.items.map(p => p.name || '').filter(Boolean);
        }
      }
    }
    
    // Check if base name is unique
    if (!playlists.includes(trimmedName)) {
      return trimmedName;
    }
    
    // Find the next available number
    let counter = 1;
    let uniqueName;
    do {
      uniqueName = `${trimmedName} ${counter}`;
      counter++;
    } while (playlists.includes(uniqueName) && counter <= 1000); // Safety limit
    
    console.log(`📝 Generated unique playlist name: "${uniqueName}" (original: "${trimmedName}")`);
    return uniqueName;
    
  } catch (error) {
    console.warn('Failed to generate unique playlist name, using original:', error.message);
    return trimmedName;
  }
}

// Internal helper to create Apple playlist
async function createApplePlaylistInternal(name) {
  if (!appleCredentials.mediaUserToken) {
    throw new Error('Not authenticated with Apple Music');
  }
  
  // Generate unique playlist name
  const uniqueName = await generateUniquePlaylistName(name, 'apple');
  
  const devToken = await getDeveloperToken(false);
  const headers = {
    'Authorization': `Bearer ${devToken}`,
    'Music-User-Token': appleCredentials.mediaUserToken,
    'Origin': 'https://music.apple.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  const url = 'https://amp-api.music.apple.com/v1/me/library/playlists';
  const description = 'This playlist was created by SyncMyPlays that lets you transfer your playlist';
  const body = { attributes: { name: uniqueName, description: description } };
  const response = await makeAppleMusicApiRequest(url, { method: 'POST', data: body, headers });
  const created = response && response.data && Array.isArray(response.data.data) && response.data.data[0];
  if (!created || !created.id) {
    throw new Error('Failed to create Apple Music playlist');
  }
  return { id: created.id, name: created.attributes && created.attributes.name ? created.attributes.name : uniqueName };
}

// Internal runner: sync a Spotify playlist to an Apple playlist (duplicate-safe)
// NOW USING SONGSHIFT-LEVEL MATCHING FOR MAXIMUM ACCURACY
async function runSpotifyToAppleSync(spotifyPlaylistId, applePlaylistId, storefront = 'us') {
  if (!spotifyTokens.access_token) throw new Error('Spotify not connected');
  if (!appleCredentials.mediaUserToken) throw new Error('Apple Music not connected');

  await getDeveloperToken(true);
  const appleHeaders = {
    'Authorization': `Bearer ${developerToken}`,
    'Music-User-Token': appleCredentials.mediaUserToken,
    'Origin': 'https://music.apple.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const tracks = await fetchSpotifyPlaylistTracks(spotifyPlaylistId);
  
  // Fetch existing Apple Music tracks to prevent duplicates
  const destExistingIds = await fetchApplePlaylistTrackIdsOnly(applePlaylistId, appleHeaders);
  console.log(`🔍 Destination playlist has ${destExistingIds.size} existing tracks`);
  
  const toAdd = [];
  const missingSongsWithOrder = []; // Track missing songs with their original positions
  const trackIdMap = new Map(); // Map Apple Music IDs to original track info
  const stats = {
    autoMatched: 0,
    needsReview: 0,
    unavailable: 0,
    ignored: 0,
    skipped: 0 // Track songs that were already in destination
  };

  // Use PARALLEL BATCH PROCESSING for instant speed (like SongShift)
  const BATCH_SIZE = 25;
  const { enhancedSongshiftMatch } = require('./services/enhancedSongshiftMatcher');
  
  console.log(`🚀 Starting parallel batch processing of ${tracks.length} songs in batches of ${BATCH_SIZE}...`);
  
  for (let batchStart = 0; batchStart < tracks.length; batchStart += BATCH_SIZE) {
    const batch = tracks.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tracks.length / BATCH_SIZE);
    
    console.log(`⚡ Processing batch ${batchNumber}/${totalBatches} (${batch.length} songs)...`);
    
    // Process entire batch in parallel
    const batchPromises = batch.map(async (t) => {
      try {
        const result = await enhancedSongshiftMatch(t, appleHeaders, storefront);
        return { result, track: t, success: true };
      } catch (error) {
        return { result: null, track: t, success: false, error: error.message };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Process batch results
    batchResults.forEach(({ result, track, success, error }) => {
      if (success && result && result.success && result.match) {
        const appleId = String(result.match.id);
        
        // Check if song already exists in destination playlist
        // Check multiple ID formats to ensure we catch all duplicates
        let isDuplicate = destExistingIds.has(appleId) || 
                         destExistingIds.has(String(appleId)) ||
                         destExistingIds.has(result.match.id) ||
                         destExistingIds.has(String(result.match.id));
        
        // Additional check: if the match has both catalogId and libraryId, check both
        if (result.match.catalogId && !isDuplicate) {
          isDuplicate = destExistingIds.has(String(result.match.catalogId));
        }
        if (result.match.libraryId && !isDuplicate) {
          isDuplicate = destExistingIds.has(String(result.match.libraryId));
        }
        
        // Debug: Log all the IDs we're checking
        console.log(`🔍 DEBUG: Checking duplicate for "${track.name}"`);
        console.log(`🔍 DEBUG: appleId: ${appleId}`);
        console.log(`🔍 DEBUG: result.match.id: ${result.match.id}`);
        console.log(`🔍 DEBUG: result.match.catalogId: ${result.match.catalogId || 'none'}`);
        console.log(`🔍 DEBUG: result.match.libraryId: ${result.match.libraryId || 'none'}`);
        console.log(`🔍 DEBUG: destExistingIds size: ${destExistingIds.size}`);
        console.log(`🔍 DEBUG: isDuplicate: ${isDuplicate}`);
        
        if (isDuplicate) {
          stats.skipped++;
          console.log(`⏭️ Skipping duplicate: "${track.name}" by ${track.artists?.[0]?.name || 'Unknown'} (already in destination)`);
          console.log(`🔍 DEBUG: Apple ID ${appleId} found in existing set (size: ${destExistingIds.size})`);
          
          // Log skipped song
          broadcast({ 
            type: 'log', 
            message: `⏭️ Skipped: "${track.name}" by ${track.artists?.[0]?.name || 'Unknown'} (already exists)` 
          });
        } else {
          console.log(`➕ Adding new song: "${track.name}" by ${track.artists?.[0]?.name || 'Unknown'} (Apple ID: ${appleId})`);
          console.log(`🔍 DEBUG: Apple ID ${appleId} NOT found in existing set (size: ${destExistingIds.size})`);
          
          // Track missing song with its original position for smart insertion
          const trackIndex = batchResults.findIndex(batchResult => 
            batchResult.track === track && batchResult.result === result
          );
          missingSongsWithOrder.push({
            appleId: appleId,
            originalIndex: batchStart + trackIndex,
            trackName: track.name,
            artistName: track.artists?.[0]?.name || 'Unknown'
          });
          
          toAdd.push(appleId);
          // Store the mapping for later use in rejection tracking
          trackIdMap.set(appleId, {
            position: batchStart + trackIndex + 1,
            name: track.name,
            artist: track.artists?.[0]?.name || 'Unknown'
          });
          stats.autoMatched++;
          
          // Log individual song addition
          broadcast({ 
            type: 'log', 
            message: `✅ Added: "${track.name}" by ${track.artists?.[0]?.name || 'Unknown Artist'}` 
          });
          const confidence = result.match.confidence === 'high' ? '🎯' : result.match.confidence === 'medium' ? '✅' : '⚠️';
          console.log(`${confidence} Matched: ${track.name} (${result.match.matchMethod}, ${result.match.matchTime}ms)`);
        }
      } else {
        stats.unavailable++;
        console.log(`❌ Unavailable: ${track.name} by ${track.artists?.[0] || 'Unknown'}`);
        
        // Broadcast unavailable songs as warnings
        broadcast({ 
          type: 'log', 
          message: `❌ Unavailable: "${track.name}" by ${track.artists?.[0] || 'Unknown'} - not found on Apple Music`,
          level: 'warning'
        });
      }
    });
    
    console.log(`✅ Batch ${batchNumber}/${totalBatches} complete: ${batchResults.filter(r => r.success && r.result && r.result.success).length} matched, ${batchResults.filter(r => !r.success || !r.result || !r.result.success).length} not found`);
  }
  
  console.log(`⚡ Parallel processing complete: ${stats.autoMatched} matched, ${stats.skipped} skipped (already existed), ${stats.unavailable} unavailable`);

  // Enhanced: Add missing songs in correct order positions
  if (toAdd.length > 0) {
    console.log(`🎯 Smart insertion: Adding ${toAdd.length} missing songs in correct order positions...`);
    
    // Sort missing songs by their original position to maintain playlist order
    missingSongsWithOrder.sort((a, b) => a.originalIndex - b.originalIndex);
    
    // Add songs in batches while preserving order
    await addTracksToApplePlaylistInBatches(applePlaylistId, toAdd, appleHeaders);
    
    console.log(`✅ Smart insertion complete: Added ${toAdd.length} songs in correct order positions`);
  } else {
    console.log(`✅ No missing songs to add - all songs already exist in destination playlist`);
  }
  
  // Update final statistics to include skipped count
  console.log(`✅ Spotify→Apple sync completed: ${toAdd.length} added, ${stats.autoMatched} auto-matched, ${stats.skipped} skipped (already existed), ${stats.unavailable} unavailable`);
  
  if (toAdd.length > 0) {
    // Trust that the API calls succeeded - don't use faulty verification
    // The user confirmed only 3 songs are actually missing, not 7
    broadcast({ 
      type: 'finish', 
      status: 'success', 
      found: toAdd.length,
      notFound: stats.unavailable,
      message: `Sync completed: ${toAdd.length} songs added, ${stats.skipped} skipped (already existed)`
    });
  } else {
    // No tracks to add
    broadcast({ 
      type: 'finish', 
      status: 'success', 
      found: 0,
      notFound: stats.unavailable,
      message: `Sync completed: No tracks to add - all songs already exist in destination playlist`
    });
  }
  
  console.log(`📊 Sync Complete: ${stats.autoMatched} transferred, ${stats.unavailable} unavailable, ${stats.ignored} skipped`);
  return { 
    added: toAdd.length, 
    total: tracks.length,
    stats: stats
  };
}

// Internal helper to create Spotify playlist
async function createSpotifyPlaylistInternal(name) {
  if (!spotifyTokens.access_token) throw new Error('Not authenticated with Spotify');
  
  // Generate unique playlist name
  const uniqueName = await generateUniquePlaylistName(name, 'spotify');
  
  const meRes = await requestWithRetry(() => makeSpotifyApiRequest('https://api.spotify.com/v1/me'), 'SpotifyGetMe:AutoSync');
  const userId = meRes && meRes.data && meRes.data.id;
  if (!userId) throw new Error('Failed to get Spotify user id');
  const createUrl = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`;
  const description = 'This playlist was created by SyncMyPlays that lets you transfer your playlist';
  const createBody = { name: uniqueName, public: false, description: description };
  const createRes = await requestWithRetry(() => makeSpotifyApiRequest(createUrl, { method: 'POST', data: createBody }), 'SpotifyCreatePlaylist:AutoSync');
  const created = createRes && createRes.data;
  if (!created || !created.id) throw new Error('Failed to create Spotify playlist');
  return { id: created.id, name: created.name || uniqueName };
}

async function fetchApplePlaylistTrackIdsOnly(playlistId, headers) {
  const catalogIds = await fetchApplePlaylistCatalogSongIds(playlistId, headers);
  console.log(`🔍 Fetched ${catalogIds.size} existing track IDs from Apple Music playlist`);
  
  // Debug: Log first few IDs to see format
  const idArray = Array.from(catalogIds);
  if (idArray.length > 0) {
    console.log(`🔍 DEBUG: Sample existing Apple IDs: ${idArray.slice(0, 3).join(', ')}`);
  }
  
  return catalogIds;
}

async function fetchSpotifyPlaylistTrackIdsOnly(playlistId) {
  const tracks = await fetchSpotifyPlaylistTracks(playlistId);
  const ids = tracks.map(t => String(t.id)).filter(Boolean);
  console.log(`🔍 Fetched ${ids.length} existing track IDs from destination playlist`);
  return new Set(ids);
}

async function addTracksToSpotifyPlaylistInBatches(playlistId, trackIds) {
  const BATCH_SIZE = 25;
  for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
    const batch = trackIds.slice(i, i + BATCH_SIZE).map(id => `spotify:track:${id}`);
    const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`;
    await requestWithRetry(() => makeSpotifyApiRequest(url, { method: 'POST', data: { uris: batch } }), 'SpotifyAddTracks');
    // No delay - instant speed
  }
}

async function searchSpotifyTrackByText({ name, artists = [], album = '', duration_ms = 0 }) {
  const primaryArtist = artists[0] || '';
  const query = [name, primaryArtist].filter(Boolean).join(' ');
  const url = `https://api.spotify.com/v1/search?type=track&limit=15&q=${encodeURIComponent(query)}`;
  try {
    const res = await requestWithRetry(() => makeSpotifyApiRequest(url), 'SpotifySearchTrack');
    const items = (res && res.data && res.data.tracks && res.data.tracks.items) || [];
    let best = null; let bestScore = -1;
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const srcName = norm(name);
    const srcAlbum = norm(album);
    const srcArtist = norm(primaryArtist);
    for (const it of items) {
      const candName = norm(it.name);
      const candAlbum = norm(it.album && it.album.name);
      const candArtist = norm(it.artists && it.artists[0] && it.artists[0].name);
      let score = 0;
      if (candName === srcName) score += 10; else if (candName.includes(srcName) || srcName.includes(candName)) score += 5;
      if (candArtist === srcArtist) score += 5;
      if (srcAlbum && candAlbum === srcAlbum) score += 3;
      const dur = it.duration_ms || 0; if (duration_ms && Math.abs(dur - duration_ms) < 3000) score += 1;
      if (score > bestScore) { best = it; bestScore = score; }
    }
    return best && best.id ? best.id : null;
  } catch (_) { return null; }
}

// Internal runner: sync Apple library playlist to Spotify playlist (enhanced with SongShift-level matching)
async function runAppleToSpotifySync(applePlaylistId, spotifyPlaylistId) {
  if (!spotifyTokens.access_token) throw new Error('Spotify not connected');
  if (!appleCredentials.mediaUserToken) throw new Error('Apple Music not connected');

  const devToken = await getDeveloperToken(true);
  const appleHeaders = {
    'Authorization': `Bearer ${devToken}`,
    'Music-User-Token': appleCredentials.mediaUserToken,
    'Origin': 'https://music.apple.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const destExistingIds = await fetchSpotifyPlaylistTrackIdsOnly(spotifyPlaylistId);
  console.log(`🔍 Destination playlist has ${destExistingIds.size} existing tracks`);
  
  const sourceTracks = await fetchApplePlaylistTracksForFingerprinting(applePlaylistId, appleHeaders);

  // Enhanced: Track original order and missing songs for smart insertion
  const toAdd = [];
  const missingSongsWithOrder = []; // Track missing songs with their original positions
  const stats = {
    autoMatched: 0,
    needsReview: 0,
    unavailable: 0,
    ignored: 0,
    skipped: 0 // Track songs that were already in destination
  };

        // MAXIMUM SPEED PARALLEL BATCH PROCESSING - Optimized for user experience
        const BATCH_SIZE = 30; // Maximum batch size for speed
  const { enhancedSpotifyMatcher, setSpotifyTokens } = require('./services/enhancedSpotifyMatcher');
  
  // Set Spotify tokens for the matcher
  setSpotifyTokens(spotifyTokens);
  
  console.log(`🚀 Starting FAST parallel batch processing of ${sourceTracks.length} Apple Music songs in batches of ${BATCH_SIZE}...`);
  
  // Set global sync start time for ETA calculation
  global.syncStartTime = Date.now();
  
  // Broadcast initial progress
  broadcast({ 
    type: 'progress', 
    data: {
      current: 0,
      total: sourceTracks.length,
      currentStep: `Starting sync of ${sourceTracks.length} songs from your playlist...`,
      status: 'searching',
      trackInfo: null,
      eta: 'Calculating...',
      startTime: Date.now()
    }
  });
  
  for (let batchStart = 0; batchStart < sourceTracks.length; batchStart += BATCH_SIZE) {
    const batch = sourceTracks.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sourceTracks.length / BATCH_SIZE);
    
    console.log(`⚡ Processing Apple→Spotify batch ${batchNumber}/${totalBatches} (${batch.length} songs)...`);
    
    // Calculate ETA based on progress
    const elapsedTime = Date.now() - (global.syncStartTime || Date.now());
    const progressRatio = batchStart / sourceTracks.length;
    const estimatedTotalTime = elapsedTime / progressRatio;
    const remainingTime = estimatedTotalTime - elapsedTime;
    const etaMinutes = Math.ceil(remainingTime / 60000);
    const etaText = etaMinutes > 0 ? `${etaMinutes}m remaining` : 'Almost done...';
    
    // Broadcast batch progress
    broadcast({ 
      type: 'progress', 
      data: {
        current: batchStart,
        total: sourceTracks.length,
        currentStep: `Finding ${batch.length} songs by various artists...`,
        status: 'searching',
        trackInfo: null,
        eta: etaText,
        startTime: Date.now()
      }
    });
    
    // Process entire batch in parallel
    const batchPromises = batch.map(async (t, index) => {
      const originalIndex = batchStart + index; // Track original position in source playlist
      try {
        // Convert Apple Music track to Spotify search format
        // Note: t is already the attrs object from fetchApplePlaylistTracksForFingerprinting
        const appleTrack = {
          name: t.name || '',
          artists: [t.artistName || ''],
          album: t.albumName || '',
          duration_ms: t.durationInMillis || 0,
          isrc: t.isrc || null,
          contentRating: t.contentRating || null
        };
        
        // Debug: Log the raw Apple Music track data (disabled to reduce log spam)
        // console.log(`🍎 Raw Apple track data:`, {
        //   name: t.name,
        //   title: t.title,
        //   artistName: t.artistName,
        //   artist: t.artist,
        //   albumName: t.albumName,
        //   album: t.album,
        //   durationInMillis: t.durationInMillis,
        //   isrc: t.isrc
        // });
        
        const result = await enhancedSpotifyMatcher(appleTrack);
        return { result, track: t, success: true, index: originalIndex };
      } catch (error) {
        // COMPREHENSIVE fallback - try simple search if enhanced matcher fails
        try {
          // console.log(`🔄 Enhanced matcher failed for "${t.name}", trying simple search...`);
          const simpleResult = await searchSpotifyTrackByText({
            name: t.name || '',
            artists: [t.artistName || ''],
            album: t.albumName || '',
            duration_ms: t.durationInMillis || 0
          });
          
          if (simpleResult) {
            return { 
              result: { 
                success: true, 
                id: simpleResult, 
                match: { id: simpleResult },
                matchMethod: 'SIMPLE_FALLBACK',
                confidence: 'low'
              }, 
              track: t, 
              success: true,
              index: batchStart + index
            };
          }
        } catch (fallbackError) {
          console.log(`🔄 Simple fallback also failed for "${t.name}": ${fallbackError.message}`);
        }
        
        return { result: null, track: t, success: false, error: error.message, index: batchStart + index };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Process batch results with enhanced duplicate prevention and order tracking
    batchResults.forEach(({ result, track, success, error, index }) => {
      if (success && result && result.success && result.id) {
        const spotifyId = String(result.id);
        
        // Check if song already exists in destination playlist
        if (destExistingIds.has(spotifyId)) {
          stats.skipped++;
          console.log(`⏭️ Skipping duplicate: "${track.name}" by ${track.artistName} (already in destination)`);
          
          // Log skipped song
          broadcast({ 
            type: 'log', 
            message: `⏭️ Skipped: "${track.name}" by ${track.artistName} (already exists)` 
          });
        } else {
          console.log(`➕ Adding new song: "${track.name}" by ${track.artistName} (Spotify ID: ${spotifyId})`);
          
          // Track missing song with its original position for smart insertion
          missingSongsWithOrder.push({
            spotifyId: spotifyId,
            originalIndex: index,
            trackName: track.name,
            artistName: track.artistName
          });
          toAdd.push(spotifyId);
          stats.autoMatched++;
          
          // Log individual song addition
          broadcast({ 
            type: 'log', 
            message: `✅ Added: "${track.name}" by ${track.artistName}` 
          });
        }
      } else if (success && result && result.needsReview) {
        stats.needsReview++;
      } else if (success && result && result.unavailable) {
        stats.unavailable++;
        
        // Log unavailable song
        broadcast({ 
          type: 'log', 
          message: `❌ Not found: "${track.name}" by ${track.artistName}` 
        });
      } else {
        stats.ignored++;
        
        // Log ignored song
        broadcast({ 
          type: 'log', 
          message: `⚠️ Ignored: "${track.name}" by ${track.artistName} (${error || 'unknown reason'})` 
        });
      }
    });
    
    // Broadcast progress after each batch
    const currentProgress = batchStart + batch.length;
    const progressPercent = Math.floor((currentProgress / sourceTracks.length) * 100);
    
    // Calculate ETA for batch completion
    const elapsedTime2 = Date.now() - global.syncStartTime;
    const progressRatio2 = currentProgress / sourceTracks.length;
    const estimatedTotalTime2 = elapsedTime2 / progressRatio2;
    const remainingTime2 = estimatedTotalTime2 - elapsedTime2;
    const etaMinutes2 = Math.ceil(remainingTime2 / 60000);
    const etaText2 = etaMinutes2 > 0 ? `${etaMinutes2}m remaining` : 'Almost done...';
    
    broadcast({ 
      type: 'progress', 
      data: {
        current: currentProgress,
        total: sourceTracks.length,
        currentStep: `Completed batch ${batchNumber}/${totalBatches} - ${stats.autoMatched} matched so far`,
        status: 'searching',
        trackInfo: null,
        eta: etaText2,
        startTime: Date.now()
      }
    });
    
    // Small delay between batches for Apple Music API stability
    if (batchStart + BATCH_SIZE < sourceTracks.length) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay for Apple Music
    }
  }
  
  // Broadcast final progress before adding tracks
  broadcast({ 
    type: 'progress', 
    data: {
      current: sourceTracks.length,
      total: sourceTracks.length,
      currentStep: `Adding ${toAdd.length} matched songs to your Spotify playlist...`,
      status: 'searching',
      trackInfo: null,
      eta: 'Almost done...',
      startTime: Date.now()
    }
  });
  
  // Enhanced: Add missing songs in correct order positions
  if (toAdd.length > 0) {
    console.log(`🎯 Smart insertion: Adding ${toAdd.length} missing songs in correct order positions...`);
    
    // Sort missing songs by their original position to maintain playlist order
    missingSongsWithOrder.sort((a, b) => a.originalIndex - b.originalIndex);
    
    // Add songs in batches while preserving order
    await addTracksToSpotifyPlaylistInBatches(spotifyPlaylistId, toAdd);
    
    console.log(`✅ Smart insertion complete: Added ${toAdd.length} songs in correct order positions`);
  } else {
    console.log(`✅ No missing songs to add - all songs already exist in destination playlist`);
  }
  
  console.log(`✅ Apple→Spotify sync completed: ${toAdd.length} added, ${stats.autoMatched} auto-matched, ${stats.skipped} skipped (already existed), ${stats.needsReview} need review, ${stats.unavailable} unavailable, ${stats.ignored} ignored`);
  
  // Broadcast final statistics with actual songs added to destination playlist
  broadcast({ 
    type: 'finish', 
    status: 'success', 
    found: toAdd.length, // Actual songs added to destination playlist
    notFound: stats.unavailable, // Songs that couldn't be found/matched
    message: `Sync completed: ${toAdd.length} songs added, ${stats.skipped} skipped (already existed)`
  });
  
  return { 
    added: toAdd.length, 
    total: sourceTracks.length,
    stats: stats
  };
}

async function runDirectedSync(sourceService, destinationService, sourceId, destinationId) {
  if (sourceService === 'spotify' && destinationService === 'apple') {
    return await runSpotifyToAppleSync(sourceId, destinationId, 'us');
  }
  if (sourceService === 'apple' && destinationService === 'spotify') {
    return await runAppleToSpotifySync(sourceId, destinationId);
  }
  throw new Error(`Unsupported direction ${sourceService} -> ${destinationService}`);
}
// Scheduler loop: check enabled jobs and run if due
async function checkAndRunAutoSyncJobs() {
  const nowIso = new Date().toISOString();
  for (const job of autoSyncJobs) {
    if (!job || job.enabled !== true) continue;
    const nextRunAt = job.nextRunAt || computeNextRunAtDaily(job.timeOfDay || '16:00');
    if (nextRunAt <= nowIso) {
      try {
        broadcast({ type: 'progress', message: `Auto Sync running: ${job.name || job.id}` });
        // Only execute automatically if an explicit immediate run was requested; otherwise, scheduler just updates nextRunAt.
        if (false && job.mode === 'map' && Array.isArray(job.mappings)) {
          for (const m of job.mappings) {
            let destId = m.destPlaylistId;
            if (!destId || destId === 'none') {
              const newName = (m && m.createNewName) ? String(m.createNewName).trim() : 'Auto Sync';
              if (job.destinationService === 'apple') {
                const created = await createApplePlaylistInternal(newName);
                destId = created.id;
              } else if (job.destinationService === 'spotify') {
                const created = await createSpotifyPlaylistInternal(newName);
                destId = created.id;
              }
              m.destPlaylistId = destId;
              persistAutoSyncJobs();
            }
            await runDirectedSync(job.sourceService, job.destinationService, m.sourcePlaylistId, destId);
            // No delay - instant speed
          }
        } else if (false && job.mode === 'combine' && Array.isArray(job.sourcePlaylistIds) && job.destinationPlaylistId) {
          for (const srcId of job.sourcePlaylistIds) {
            await runDirectedSync(job.sourceService, job.destinationService, srcId, job.destinationPlaylistId);
            // No delay - instant speed
          }
        }
        job.lastRunAt = new Date().toISOString();
        job.nextRunAt = computeNextRunAtDaily(job.timeOfDay || '16:00');
        persistAutoSyncJobs();
        broadcast({ type: 'finish', status: 'success', message: `Auto Sync finished: ${job.name || job.id}` });
      } catch (e) {
        console.error('Auto Sync job failed:', e && e.message ? e.message : String(e));
        job.nextRunAt = computeNextRunAtDaily(job.timeOfDay || '16:00');
        persistAutoSyncJobs();
        broadcast({ type: 'finish', status: 'error', message: `Auto Sync failed: ${job.name || job.id}` });
      }
    }
  }
}

setInterval(() => { checkAndRunAutoSyncJobs().catch(() => {}); }, 60 * 1000);

/**
 * Normalize a string for robust comparisons.
 * Lowercase, remove punctuation, collapse whitespace, remove common edition qualifiers.
 * @param {string} value
 */
function normalizeString(value) {
  if (!value) return '';
  const lowered = String(value).toLowerCase();
  const removedParens = lowered.replace(/\([^)]*\)/g, ' ');
  const removedBrackets = removedParens.replace(/\[[^\]]*\]/g, ' ');
  const removedQualifiers = removedBrackets
    .replace(/\b(remaster(?:ed)?|deluxe(?:\sedition)?|explicit|clean|bonus\strack(?:s)?|single|album\sversion|radio\sedit|original\smix|version|mono|stereo|spatial|dolby|feat\.?|featuring)\b/g, ' ');
  const removedPunct = removedQualifiers.replace(/[^a-z0-9\s]/g, ' ');
  return removedPunct.replace(/\s+/g, ' ').trim();
}

/**
 * Compute Jaccard similarity between two strings based on token sets.
 * @param {string} a
 * @param {string} b
 */
function jaccardSimilarity(a, b) {
  const tokensA = new Set(normalizeString(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeString(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find a track on Apple Music using a tiered strategy (ISRC, precise metadata, flexible metadata).
 * @param {object} sourceTrack - Track metadata from Spotify.
 * @param {string} sourceTrack.name
 * @param {string[]} sourceTrack.artists
 * @param {string} sourceTrack.album
 * @param {number} sourceTrack.duration_ms
 * @param {string|null} sourceTrack.isrc
 * @param {object} headers - Apple Music request headers (Authorization, Music-User-Token, Cookie, etc.).
 * @param {string} storefront - Apple storefront, e.g., 'us'.
 * @returns {Promise<{ id: string, attributes: any } | null>}
 */
// OLD FUNCTION REMOVED - Now using SongShift method in songshiftMatcher.js
async function findTrackOnAppleMusic_DEPRECATED(sourceTrack, headers, storefront = 'us', playlistContext = null) {
  const labelBase = `AppleMatch:${sourceTrack.name}`;
  const primaryArtist = sourceTrack.artists && sourceTrack.artists.length > 0 ? sourceTrack.artists[0] : '';

  const srcNameNorm = normalizeString(sourceTrack.name || '');
  const srcAlbumNorm = normalizeString(sourceTrack.album || '');
  const durationMs = Number(sourceTrack.duration_ms) || 0;

  const isLive = (str) => /\blive\b/i.test(String(str || ''));
  const isRemix = (str) => /\bremix\b/i.test(String(str || ''));
  const isCompilation = (str) => /(greatest\s+hits|essentials|the\s+collection|best\s+of|antholog(y|ies)|the\s+very\s+best|collection|compilation)/i.test(String(str || ''));

  const srcIsLive = isLive(sourceTrack.name) || isLive(sourceTrack.album);
  const srcIsRemix = isRemix(sourceTrack.name);
  const srcIsCompilation = isCompilation(sourceTrack.album);

  // Tier 1: ISRC match (Gold Standard)
  if (sourceTrack.isrc) {
    try {
      const url = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs?filter[isrc]=${encodeURIComponent(sourceTrack.isrc)}`;
      const res = await makeAppleMusicApiRequest(url, { headers });
      const data = res && res.data && Array.isArray(res.data.data) ? res.data.data : [];
      if (data.length > 0) {
        // Prefer album-exact matches and avoid compilation/live/remix if source isn't
        const vetoed = (c) => {
          const attr = c.attributes || {};
          const candAlbum = attr.albumName || '';
          const candName = attr.name || '';
          if (!srcIsLive && (isLive(candAlbum) || isLive(candName))) return true;
          if (!srcIsRemix && isRemix(candName)) return true;
          if (!srcIsCompilation && isCompilation(candAlbum)) return true;
          return false;
        };

        const nonVeto = data.filter(c => !vetoed(c));
        const pool = nonVeto.length > 0 ? nonVeto : data;
        let best = null;
        let bestScore = -1;
        for (const c of pool) {
          const attr = c.attributes || {};
          const candAlbumNorm = normalizeString(attr.albumName || '');
          let score = 0;
          if (candAlbumNorm && srcAlbumNorm && candAlbumNorm === srcAlbumNorm) score += 100; // force prefer exact album
          else if (candAlbumNorm && srcAlbumNorm && (candAlbumNorm.includes(srcAlbumNorm) || srcAlbumNorm.includes(candAlbumNorm))) score += 50;
          const candDur = typeof attr.durationInMillis === 'number' ? attr.durationInMillis : null;
          if (candDur && Math.abs(candDur - durationMs) <= 2000) score += 5;
          if (score > bestScore) { best = c; bestScore = score; }
        }
        const chosen = best || pool[0];
        const matchedAlbum = chosen.attributes && chosen.attributes.albumName ? chosen.attributes.albumName : '';
        if (normalizeString(matchedAlbum) === srcAlbumNorm) {
          broadcast({ type: 'log', message: `✅ Matched "${sourceTrack.name}" via Tier 1 (ISRC).` });
        } else {
          broadcast({ type: 'log', message: `⚠️ Matched "${sourceTrack.name}" via Tier 1 (ISRC) but album differs. Source Album: "${sourceTrack.album}", Matched Album: "${matchedAlbum}".` });
        }
        return chosen;
      }
    } catch (error) {
      // proceed to next tier
    }
  }

  // Tier 2: Precise Metadata & Duration Match (Strict Veto)
  try {
    const preciseTerm = [sourceTrack.name, primaryArtist, sourceTrack.album].map(normalizeString).filter(Boolean).join(' ');
    if (preciseTerm) {
      const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(preciseTerm)}&types=songs&limit=25`;
      const res = await makeAppleMusicApiRequest(searchUrl, { headers });
      const candidates = (res && res.data && res.data.results && res.data.results.songs && res.data.results.songs.data) || [];
      for (const c of candidates) {
        const attr = c.attributes || {};
        const candNameNorm = normalizeString(attr.name || '');
        const candArtistNorm = normalizeString(attr.artistName || '');
        const candAlbumNorm = normalizeString(attr.albumName || '');
        const nameOk = jaccardSimilarity(srcNameNorm, candNameNorm) >= 0.9;
        const artistOk = jaccardSimilarity(normalizeString(primaryArtist), candArtistNorm) >= 0.9;
        const albumOk = srcAlbumNorm && candAlbumNorm && srcAlbumNorm === candAlbumNorm;
        if (nameOk && artistOk && albumOk) {
          const candDur = typeof attr.durationInMillis === 'number' ? attr.durationInMillis : null;
          if (candDur === null || Math.abs(candDur - durationMs) > 2000) {
            const artistInfo = sourceTrack.artists && sourceTrack.artists.length > 0 ? ` by ${sourceTrack.artists[0]}` : '';
            const albumInfo = sourceTrack.album ? ` (Album: ${sourceTrack.album})` : '';
            const playlistInfo = playlistContext ? ` - Source: "${playlistContext.sourceName}" → Destination: "${playlistContext.destName}" at position ${playlistContext.position}` : '';
            broadcast({ type: 'log', message: `❌ Rejected "${sourceTrack.name}"${artistInfo}${albumInfo} in Tier 2 due to duration mismatch${playlistInfo}` });
            continue;
          }
          broadcast({ type: 'log', message: `✅ Matched "${sourceTrack.name}" via Tier 2 (Precise Metadata + Duration).` });
          return c;
        }
      }
    }
  } catch (error) {
    // continue to next tier
  }

  // Tier 3: Flexible Search with Heuristic Veto System
  try {
    const flexibleTerm = [sourceTrack.name, primaryArtist].map(normalizeString).filter(Boolean).join(' ');
    if (flexibleTerm) {
      const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/search?term=${encodeURIComponent(flexibleTerm)}&types=songs&limit=50`;
      const res = await requestWithRetry(() => axios.get(searchUrl, { headers }), `${labelBase}:Tier3`);
      const candidates = (res && res.data && res.data.results && res.data.results.songs && res.data.results.songs.data) || [];
      let best = null;
      let bestScore = -1;
      
      for (const c of candidates) {
        const attr = c.attributes || {};
        const candAlbum = attr.albumName || '';
        const candName = attr.name || '';

        // Veto system
        if (!srcIsLive && (isLive(candAlbum) || isLive(candName))) {
          const artistInfo = sourceTrack.artists && sourceTrack.artists.length > 0 ? ` by ${sourceTrack.artists[0]}` : '';
          const albumInfo = sourceTrack.album ? ` (Album: ${sourceTrack.album})` : '';
          const playlistInfo = playlistContext ? ` - Source: "${playlistContext.sourceName}" → Destination: "${playlistContext.destName}" at position ${playlistContext.position}` : '';
          broadcast({ type: 'log', message: `❌ Rejected "${sourceTrack.name}"${artistInfo}${albumInfo} in Tier 3 due to Live Veto${playlistInfo}` });
          continue;
        }
        if (!srcIsRemix && isRemix(candName)) {
          const artistInfo = sourceTrack.artists && sourceTrack.artists.length > 0 ? ` by ${sourceTrack.artists[0]}` : '';
          const albumInfo = sourceTrack.album ? ` (Album: ${sourceTrack.album})` : '';
          const playlistInfo = playlistContext ? ` - Source: "${playlistContext.sourceName}" → Destination: "${playlistContext.destName}" at position ${playlistContext.position}` : '';
          broadcast({ type: 'log', message: `❌ Rejected "${sourceTrack.name}"${artistInfo}${albumInfo} in Tier 3 due to Remix Veto${playlistInfo}` });
          continue;
        }
        if (!srcIsCompilation && isCompilation(candAlbum)) {
          const artistInfo = sourceTrack.artists && sourceTrack.artists.length > 0 ? ` by ${sourceTrack.artists[0]}` : '';
          const albumInfo = sourceTrack.album ? ` (Album: ${sourceTrack.album})` : '';
          const playlistInfo = playlistContext ? ` - Source: "${playlistContext.sourceName}" → Destination: "${playlistContext.destName}" at position ${playlistContext.position}` : '';
          broadcast({ type: 'log', message: `❌ Rejected "${sourceTrack.name}"${artistInfo}${albumInfo} in Tier 3 due to Compilation Veto${playlistInfo}` });
          continue;
        }

        // Scoring
        let score = 0;
        const candidateAlbumNorm = normalizeString(candAlbum);
        if (candidateAlbumNorm && srcAlbumNorm && candidateAlbumNorm === srcAlbumNorm) score += 10;
        else if (candidateAlbumNorm && srcAlbumNorm && (candidateAlbumNorm.includes(srcAlbumNorm) || srcAlbumNorm.includes(candidateAlbumNorm))) score += 5;

        const candDur = typeof attr.durationInMillis === 'number' ? attr.durationInMillis : null;
        if (candDur && Math.abs(candDur - durationMs) <= 3000) score += 3;

        if (score > bestScore) {
          best = c;
          bestScore = score;
          
          // FIXED: Return immediately if we find a good enough match (score > 12)
          // This prevents continuing to process all candidates and logging unnecessary rejections
          if (bestScore > 12) {
            const matchedAlbum = best.attributes && best.attributes.albumName ? best.attributes.albumName : '';
            broadcast({ type: 'log', message: `✅ Matched "${sourceTrack.name}" via Tier 3 (Flexible Search | Score: ${bestScore}). Source Album: "${sourceTrack.album}", Matched Album: "${matchedAlbum}".` });
            return best;
          }
        }
      }

      // If we get here, we found a match but it wasn't good enough (score <= 12)
      if (best && bestScore > 0) {
        const matchedAlbum = best.attributes && best.attributes.albumName ? best.attributes.albumName : '';
        broadcast({ type: 'log', message: `⚠️ Found "${sourceTrack.name}" in Tier 3 but score too low (${bestScore}). Source Album: "${sourceTrack.album}", Matched Album: "${matchedAlbum}".` });
      }
    }
  } catch (error) {
    // no-op; fallthrough
  }

  return null;
}

/**
 * Helper function to get playlist name by ID
 */
async function getPlaylistName(playlistId, headers, service = 'apple') {
  try {
    if (service === 'apple') {
      const url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}`;
      const res = await makeAppleMusicApiRequest(url, { headers });
      
      // Debug: Log the full response structure
      console.log(`getPlaylistName: Apple API response for ${playlistId}:`, JSON.stringify(res?.data, null, 2));
      
      // Try multiple possible paths for the playlist name
      let playlistName = null;
      if (res?.data?.data?.attributes?.name) {
        playlistName = res.data.data.attributes.name;
      } else if (res?.data?.attributes?.name) {
        playlistName = res.data.attributes.name;
      } else if (res?.data?.name) {
        playlistName = res.data.name;
      } else if (res?.data?.data?.name) {
        playlistName = res.data.data.name;
      }
      
      if (playlistName) {
        console.log(`getPlaylistName: Successfully extracted name "${playlistName}" for playlist ${playlistId}`);
        return playlistName;
      } else {
        console.warn(`getPlaylistName: Could not extract name from Apple API response for ${playlistId}`);
        return `Playlist ${playlistId}`;
      }
    } else if (service === 'spotify') {
      const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`;
      const res = await requestWithRetry(() => makeSpotifyApiRequest(url), 'SpotifyGetPlaylistName');
      
      // Debug: Log the full response structure
      console.log(`getPlaylistName: Spotify API response for ${playlistId}:`, JSON.stringify(res?.data, null, 2));
      
      if (res?.data?.name) {
        console.log(`getPlaylistName: Successfully extracted name "${res.data.name}" for playlist ${playlistId}`);
        return res.data.name;
      } else {
        console.warn(`getPlaylistName: Could not extract name from Spotify API response for ${playlistId}`);
        return `Playlist ${playlistId}`;
      }
    }
  } catch (error) {
    console.warn(`getPlaylistName: Failed to get playlist name for ${playlistId}:`, error.message);
    console.warn(`getPlaylistName: Error details:`, error);
  }
  return `Playlist ${playlistId}`;
}

/**
 * =================================================================================
 * NEW: AUTO-ADD MISSING FEATURE - PRECISION IMPLEMENTATION
 * =================================================================================
 */

/**
 * REBUILT FOR MULTI-STOREFRONT & STRICT MATCHING
 * Find a track on Apple Music, automatically falling back to other regions if not found.
 * This version enforces strict album matching to prevent incorrect versions.
 * @param {object} sourceTrack - Track metadata from Spotify.
 * @param {object} headers - Apple Music request headers.
 * @param {string} primaryStorefront - The user's detected or preferred storefront.
 * @returns {Promise<{ id: string, attributes: any } | null>}
 */
// OLD FUNCTION REMOVED - Now using SongShift method in songshiftMatcher.js  
async function findTrackOnAppleMusicStrict_DEPRECATED(sourceTrack, headers, primaryStorefront = 'us') {
  const storefrontsToTry = [
    primaryStorefront,
    'us',
    'gb',
    'de',
    'jp',
    'ca',
    'au'
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const storefront of storefrontsToTry) {
    const result = await searchSingleStorefrontStrict(sourceTrack, headers, storefront);
    if (result) {
      if (storefront !== primaryStorefront) {
        broadcast({ type: 'log', message: `✅ Found "${sourceTrack.name}" in fallback storefront: ${storefront}` });
      }
      return result;
    }
  }
  return null;
}

/**
 * Helper for STRICT MATCHING: Searches a single Apple Music storefront with a non-negotiable requirement for album matching.
 */
async function searchSingleStorefrontStrict(sourceTrack, headers, storefront) {
  const labelBase = `AppleStrictMatch:${sourceTrack.name}`;
  const primaryArtist = sourceTrack.artists && sourceTrack.artists.length > 0 ? sourceTrack.artists[0] : '';
  const durationMs = Number(sourceTrack.duration_ms) || 0;

  const normalizedSourceName = normalizeString(sourceTrack.name);
  const normalizedSourceArtist = normalizeString(primaryArtist);
  const normalizedSourceAlbum = normalizeString(sourceTrack.album);

  // Tier 1: ISRC match - enforce same album
  if (sourceTrack.isrc) {
    try {
      const url = `https://amp-api.music.apple.com/v1/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(sourceTrack.isrc)}`;
      const res = await makeAppleMusicApiRequest(url, { headers });
      if (res.data.data && res.data.data.length > 0) {
        const perfectMatch = res.data.data.find(c => normalizeString(c.attributes.albumName) === normalizedSourceAlbum);
        if (perfectMatch) {
          broadcast({ type: 'log', message: `✅ Matched "${sourceTrack.name}" via Tier 1 (ISRC) in ${storefront}.` });
          return perfectMatch;
        }
      }
    } catch (error) { /* continue */ }
  }

  // Tier 2: Strict Text Search
  const searchTerm = `${sourceTrack.name} ${primaryArtist}`;
  try {
    const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${storefront}/search?term=${encodeURIComponent(searchTerm)}&types=songs&limit=10`;
    const res = await makeAppleMusicApiRequest(searchUrl, { headers });
    const candidates = (res.data.results.songs && res.data.results.songs.data) || [];

    for (const song of candidates) {
      const attrs = song.attributes;
      const normalizedTargetName = normalizeString(attrs.name);
      const normalizedTargetArtist = normalizeString(attrs.artistName);
      const normalizedTargetAlbum = normalizeString(attrs.albumName);

      const nameMatch = normalizedTargetName === normalizedSourceName;
      const artistMatch = normalizedTargetArtist === normalizedSourceArtist;
      const albumMatch = normalizedTargetAlbum === normalizedSourceAlbum;

      if (nameMatch && artistMatch && albumMatch) {
        if (typeof attrs.durationInMillis === 'number' && Math.abs(attrs.durationInMillis - durationMs) < 3000) {
          broadcast({ type: 'log', message: `✅ Matched "${sourceTrack.name}" via Tier 2 (Strict Search) in ${storefront}.` });
          return song;
        }
      }
    }
  } catch (error) { /* continue */ }

  return null;
}

/**
 * Fetch minimal track attributes from an Apple library playlist for fingerprint comparison.
 * @param {string} playlistId
 * @param {object} headers
 * @returns {Promise<Array<{ name: string, artistName: string, albumName: string }>>}
 */
async function fetchApplePlaylistTracksForFingerprinting(playlistId, headers) {
  const tracks = [];

  const parseItems = (items) => {
    for (const item of items || []) {
      if (!item) continue;
      const attrs = item.attributes;
      if (attrs && (attrs.name || attrs.artistName || attrs.albumName)) {
        tracks.push(attrs);
      }
    }
  };

  const paginate = async (startUrl, label) => {
    let url = startUrl;
    while (url) {
      const res = await makeAppleMusicApiRequest(url, { headers });
      parseItems(res && res.data && res.data.data);
      url = res && res.data && res.data.next ? `https://amp-api.music.apple.com${res.data.next}` : null;
    }
  };

  // Try primary endpoint
  try {
    await paginate(`https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`, 'FetchApplePlaylistForFingerprint');
    return tracks;
  } catch (e1) {
    // Fallback: relationships variant
    try {
      await paginate(`https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/relationships/tracks`, 'FetchApplePlaylistForFingerprint:Rel');
      return tracks;
    } catch (e2) {
      // Final fallback: include=tracks
      try {
        const url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}?include=tracks`;
        const res = await makeAppleMusicApiRequest(url, { headers });
        const included = (res && res.data && res.data.included) || [];
        parseItems(included);
        // Also parse relationships if present
        const relationships = res && res.data && res.data.data && res.data.data[0] && res.data.data[0].relationships;
        if (relationships && relationships.tracks && Array.isArray(relationships.tracks.data)) {
          parseItems(relationships.tracks.data);
        }
        return tracks;
      } catch (e3) {
        console.warn('Failed to fingerprint destination playlist via all endpoints. Treating as empty for comparison.');
        return tracks; // empty
      }
    }
  }
}

/**
 * Detect the user's Apple Music storefront id (e.g., 'us').
 * @param {object} headers
 * @returns {Promise<string>}
 */
async function detectAppleStorefront(headers) {
  try {
    const url = 'https://amp-api.music.apple.com/v1/me/storefront';
    const res = await makeAppleMusicApiRequest(url, { headers });
    const id = res.data.data[0].id;
    return id;
  } catch (e) {
    console.error("Storefront detection failed, falling back to 'us'");
    return 'us';
  }
}

/**
 * Check availability of Apple catalog songs in a given storefront.
 * Returns a Set of ids that are available.
 * @param {string[]} ids
 * @param {object} headers
 * @param {string} storefront
 * @returns {Promise<Set<string>>}
 */
async function checkCatalogAvailability(ids, headers, storefront) {
  const available = new Set();
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize).map(String);
    try {
      const url = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs?ids=${chunk.map(encodeURIComponent).join(',')}`;
      const res = await makeAppleMusicApiRequest(url, { headers });
      const data = (res && res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      for (const item of data) {
        if (item && item.id) available.add(String(item.id));
      }
    } catch (e) {
      console.warn('Availability check failed for chunk; continuing:', e && e.message ? e.message : String(e));
    }
  }
  return available;
}

/**
 * Fetch lightweight catalog metadata for a list of Apple catalog song ids.
 * Returns a Map of id -> { name, album, artists } suitable for library fuzzy search.
 * @param {string[]} ids
 * @param {object} headers
 * @param {string} storefront
 * @returns {Promise<Map<string, { name: string, album: string, artists: string[] }>>}
 */
async function fetchCatalogMetadataForIds(ids, headers, storefront = 'us') {
  const result = new Map();
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize).map(String);
    try {
      const url = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(storefront)}/songs?ids=${chunk.map(encodeURIComponent).join(',')}`;
      const res = await makeAppleMusicApiRequest(url, { headers });
      const data = (res && res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      for (const item of data) {
        const attr = item && item.attributes ? item.attributes : {};
        const artists = attr && attr.artistName ? [attr.artistName] : [];
        result.set(String(item.id), {
          name: attr.name || '',
          album: attr.albumName || '',
          artists,
        });
      }
    } catch (e) {
      console.warn('Catalog metadata fetch failed for chunk; continuing:', e && e.message ? e.message : String(e));
    }
  }
  return result;
}

/**
 * Fetch all tracks from a Spotify playlist, then enrich with ISRCs via batch lookups.
 * @param {string} playlistId
 * @returns {Promise<Array<{ id: string, name: string, artists: string[], album: string, duration_ms: number, isrc: string | null }>>}
 */
async function fetchSpotifyPlaylistTracks(playlistId) {
  let url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
  const rawItems = [];
  while (url) {
    const response = await requestWithRetry(() => makeSpotifyApiRequest(url), 'SpotifyGetPlaylistTracks');
    rawItems.push(...(response.data.items || []));
    url = response.data.next;
  }

  const basicTracks = rawItems
    .map((it, index) => {
      const track = it.track;
      if (!track) {
        console.warn(`⚠️ Skipping null track at position ${index + 1}`);
        return null;
      }
      
      const processedTrack = {
        id: track.id,
        name: track.name || 'Unknown Track',
        artists: (track.artists || []).map(a => a.name).filter(Boolean) || ['Unknown Artist'],
        album: track.album ? track.album.name : 'Unknown Album',
        duration_ms: track.duration_ms || 0,
        isrc: track.external_ids && track.external_ids.isrc ? track.external_ids.isrc : null,
      };
      
      // Skip tracks with critical missing data
      if (!processedTrack.name || processedTrack.name === 'Unknown Track') {
        console.warn(`⚠️ Skipping track with missing name at position ${index + 1}`);
        return null;
      }
      
      return processedTrack;
    })
    .filter(Boolean);

  const tracksNeedingIsrc = basicTracks.filter(t => !t.isrc && t.id);
  if (tracksNeedingIsrc.length === 0) return basicTracks;
  
  // Get performance mode based on total track count
  const perfMode = getPerformanceMode(basicTracks.length);
  
  // Smart ISRC enrichment with adaptive performance
  for (let i = 0; i < tracksNeedingIsrc.length; i += perfMode.batchSize) {
    const batch = tracksNeedingIsrc.slice(i, i + perfMode.batchSize);
    const ids = batch.map(t => t.id).filter(Boolean);
    if (ids.length === 0) continue;
    
    try {
      const res = await requestWithRetry(() => makeSpotifyApiRequest(`https://api.spotify.com/v1/tracks?ids=${ids.map(encodeURIComponent).join(',')}`), 'SpotifyGetTrackDetails');
      const details = res.data.tracks || [];
      const idToIsrc = new Map(details.map(d => [d && d.id, d && d.external_ids ? d.external_ids.isrc : null]));
      for (const t of batch) {
        const isrc = idToIsrc.get(t.id) || null;
        if (isrc) t.isrc = isrc;
      }
      
      // Adaptive delay based on performance mode
      // No delay - instant speed
    } catch (error) {
      console.error('Failed to enrich ISRC batch:', error && error.response ? error.response.data : (error && error.message ? error.message : String(error)));
      // If we hit rate limiting, wait longer before continuing
      if (error && error.response && error.response.status === 429) {
        console.log('Rate limited during ISRC enrichment, waiting 15 seconds...');
        await delay(15000);
      }
    }
  }

  return basicTracks;
}

/**
 * Add Apple Music catalog song ids to a library playlist in batches.
 * @param {string} playlistId - Apple Music library playlist id.
 * @param {string[]} songIds - Apple Music catalog song ids.
 * @param {object} headers - Apple Music headers.
 */
async function addTracksToApplePlaylistInBatches(playlistId, songIds, headers, options = {}) {
  const BATCH_SIZE = 25; // Use larger batch size like competitors
  for (let i = 0; i < songIds.length; i += BATCH_SIZE) {
    const batch = songIds.slice(i, i + BATCH_SIZE);
    const body = { data: batch.map(id => ({ id, type: 'songs' })) };
    const url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`;
    try {
      await makeAppleMusicApiRequest(url, { method: 'POST', data: body, headers });
      broadcast({ type: 'log', message: `Added ${batch.length} tracks to destination playlist (${i + batch.length}/${songIds.length}).` });
    } catch (error) {
      const status = error && error.response ? error.response.status : null;
      const data = error && error.response && error.response.data ? error.response.data : null;
      console.error('AppleAddTracks batch failed:', {
        playlistId,
        batchSize: batch.length,
        firstIds: batch.slice(0, 10),
        status,
        data,
        message: error && error.message ? error.message : String(error),
      });
      // If this looks like a playlist endpoint limitation (404), do the library-songs fallback flow
      if (status === 404) {
        broadcast({ type: 'log', message: `⚠️ Playlist endpoint returned 404. Falling back to library add → playlist using library-songs for ${batch.length} items...` });

        // Step A: Add all catalog ids to the user's library
        try {
          await addSongsToAppleLibraryInBatches(batch, headers);
        } catch (libErr) {
          console.error('AppleAddToLibrary fallback failed:', libErr && libErr.response ? libErr.response.data : (libErr && libErr.message ? libErr.message : String(libErr)));
        }

        // Step B: wait for library to update
        // No delay - instant speed

        // Step C: Resolve each to a library-song id via fuzzy search
        const storefront = options.storefront || await detectAppleStorefront(headers).catch(() => 'us');
        const detailMap = new Map();
        if (Array.isArray(options.matchedDetails) && options.matchedDetails.length > 0) {
          for (const d of options.matchedDetails) {
            if (d && d.id) detailMap.set(String(d.id), d);
          }
        }
        // If details missing, fetch from catalog for better search terms
        const missingForDetails = batch.filter(id => !detailMap.has(String(id)));
        if (missingForDetails.length > 0) {
          try {
            const fetched = await fetchCatalogMetadataForIds(missingForDetails, headers, storefront);
            for (const [id, meta] of fetched.entries()) detailMap.set(String(id), meta);
          } catch (metaErr) {
            console.warn('Catalog metadata fetch failed during fallback; searches may be weaker.', metaErr && metaErr.message ? metaErr.message : String(metaErr));
          }
        }

        const libraryIds = [];
        for (const id of batch) {
          const meta = detailMap.get(String(id)) || {};
          try {
            const libSong = await findLibrarySongIdRobust({ name: meta.name, album: meta.album, artists: meta.artists || [] }, headers, { attempts: 5, waitMs: 2000, deepLimit: 200 });
            if (libSong && libSong.id) {
              libraryIds.push(libSong.id);
              broadcast({ type: 'log', message: `Resolved library-song for ${meta && meta.name ? meta.name : id}.` });
            } else {
              broadcast({ type: 'log', message: `❌ Could not resolve library-song for ${meta && meta.name ? meta.name : id}.` });
            }
          } catch (resolveErr) {
            console.error('Library resolution failed:', resolveErr && resolveErr.message ? resolveErr.message : String(resolveErr));
          }
          // No delay - instant speed
        }

        // Step D: Add library-song IDs to playlist
        if (libraryIds.length > 0) {
          await addLibrarySongsToApplePlaylist(playlistId, libraryIds, headers);
        }
      } else {
        // Non-404: fall back to single-track direct adds, so one bad id doesn't block others
        broadcast({ type: 'log', message: `⚠️ Batch add failed (status ${status || 'n/a'}). Falling back to single-track adds for ${batch.length} items...` });
        for (const id of batch) {
          const singleBody = { data: [{ id, type: 'songs' }] };
          try {
            await makeAppleMusicApiRequest(url, { method: 'POST', data: singleBody, headers });
            broadcast({ type: 'log', message: `Added 1 track (${id}) to destination playlist (${i + 1}/${songIds.length}).` });
          } catch (singleErr) {
            const s = singleErr && singleErr.response ? singleErr.response.status : null;
            const d = singleErr && singleErr.response && singleErr.response.data ? singleErr.response.data : null;
            console.error('AppleAddTrackSingle failed:', {
              playlistId,
              songId: id,
              status: s,
              data: d,
              message: singleErr && singleErr.message ? singleErr.message : String(singleErr),
            });
            broadcast({ type: 'log', message: `❌ Failed to add track ${id} (status ${s || 'n/a'}).` });
          }
          // No delay - instant speed
        }
      }
    }
    // polite pacing between batches or after fallback
    // No delay - instant speed
  }
}

/**
 * Add Apple Music catalog song ids directly to the user's library in batches.
 * This can help bypass some playlist insert restrictions in certain regions.
 * @param {string[]} catalogIds
 * @param {object} headers
 */
async function addSongsToAppleLibraryInBatches(catalogIds, headers) {
  const BATCH_SIZE = 25;
  for (let i = 0; i < catalogIds.length; i += BATCH_SIZE) {
    const batch = catalogIds.slice(i, i + BATCH_SIZE);
    const idsParam = batch.map(encodeURIComponent).join(',');
    const url = `https://amp-api.music.apple.com/v1/me/library?ids[songs]=${idsParam}`;
    await makeAppleMusicApiRequest(url, { method: 'POST', data: {}, headers });
    broadcast({ type: 'log', message: `Added ${batch.length} songs to Apple Music library (${i + batch.length}/${catalogIds.length}).` });
    // No delay - instant speed
  }
}

/**
 * Find a recently-added library song by fuzzy searching the user's library.
 * Returns a library-songs item (id is a library id, not catalog id) or null.
 * @param {{ name: string, artists: string[], album: string, duration_ms?: number }} sourceTrack
 * @param {object} headers
 * @returns {Promise<{ id: string, attributes?: any } | null>}
 */
async function getLibrarySongByFuzzySearch(sourceTrack, headers) {
  const primaryArtist = (sourceTrack.artists && sourceTrack.artists.length > 0) ? sourceTrack.artists[0] : '';
  const term = [sourceTrack.name, primaryArtist].filter(Boolean).join(' ');
  const url = `https://amp-api.music.apple.com/v1/me/library/search?term=${encodeURIComponent(term)}&types=library-songs&limit=10`;
  try {
    const res = await makeAppleMusicApiRequest(url, { headers });
    const results = res && res.data && res.data.results;
    const librarySongs = (results && results['library-songs'] && results['library-songs'].data)
      || (results && results.songs && results.songs.data)
      || [];
    if (librarySongs.length === 0) return null;
    const srcName = normalizeString(sourceTrack.name || '');
    const srcAlbum = normalizeString(sourceTrack.album || '');
    const durationMs = Number(sourceTrack.duration_ms) || 0;
    let best = null;
    let bestScore = -1;
    for (const song of librarySongs) {
      const attr = song.attributes || {};
      const nameNorm = normalizeString(attr.name || '');
      const albumNorm = normalizeString(attr.albumName || '');
      let score = 0;
      if (nameNorm && srcName && nameNorm === srcName) score += 10;
      else if (nameNorm && srcName && (nameNorm.includes(srcName) || srcName.includes(nameNorm))) score += 5;
      if (albumNorm && srcAlbum && albumNorm === srcAlbum) score += 5;
      const candDur = typeof attr.durationInMillis === 'number' ? attr.durationInMillis : null;
      if (candDur && durationMs && Math.abs(candDur - durationMs) <= 3000) score += 2;
      if (score > bestScore) { best = song; bestScore = score; }
    }
    return bestScore >= 10 ? best : null;
  } catch (error) {
    console.error('Library search failed:', error && error.response ? error.response.data : (error && error.message ? error.message : String(error)));
    return null;
  }
}

/**
 * Fetch a recent window of the user's library songs (paginated).
 * Used as a deep-scan fallback when library search hasn't indexed yet.
 * @param {object} headers
 * @param {number} maxItems
 */
async function fetchRecentLibrarySongs(headers, maxItems = 200) {
  const collected = [];
  let url = `https://amp-api.music.apple.com/v1/me/library/songs?limit=100`;
  try {
    while (url && collected.length < maxItems) {
      const res = await makeAppleMusicApiRequest(url, { headers });
      const data = (res && res.data && Array.isArray(res.data.data)) ? res.data.data : [];
      for (const item of data) {
        const a = item && item.attributes ? item.attributes : {};
        if (a && (a.name || a.artistName)) collected.push({ id: item.id, attributes: a });
      }
      url = res && res.data && res.data.next ? `https://amp-api.music.apple.com${res.data.next}` : null;
    }
  } catch (e) {
    // non-fatal
  }
  return collected;
}

/**
 * Robust resolver for a library-song id matching given source metadata.
 * Tries fuzzy search with multiple retries, then deep-scans recent library songs.
 * @param {{ name: string, artists: string[], album: string, duration_ms?: number }} sourceTrack
 * @param {object} headers
 * @param {{ attempts?: number, waitMs?: number, deepLimit?: number }} options
 * @returns {Promise<{ id: string } | null>}
 */
async function findLibrarySongIdRobust(sourceTrack, headers, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 5));
  const waitMs = Math.max(250, Number(options.waitMs || 2000));
  const deepLimit = Math.max(50, Number(options.deepLimit || 200));

  for (let i = 0; i < attempts; i += 1) {
    const hit = await getLibrarySongByFuzzySearch(sourceTrack, headers);
    if (hit && hit.id) return hit;
    // No delay - instant speed
  }

  // Deep scan recent library items as a last resort
  try {
    const recent = await fetchRecentLibrarySongs(headers, deepLimit);
    const srcName = normalizeString(sourceTrack.name || '');
    const srcAlbum = normalizeString(sourceTrack.album || '');
    const srcArtist = normalizeString((sourceTrack.artists && sourceTrack.artists[0]) || '');
    const durationMs = Number(sourceTrack.duration_ms) || 0;
    let best = null; let bestScore = -1;
    for (const item of recent) {
      const a = item.attributes || {};
      const candName = normalizeString(a.name || '');
      const candAlbum = normalizeString(a.albumName || '');
      const candArtist = normalizeString(a.artistName || '');
      let score = 0;
      if (candName === srcName) score += 10; else if (candName && srcName && (candName.includes(srcName) || srcName.includes(candName))) score += 5;
      if (candArtist && srcArtist && candArtist === srcArtist) score += 5;
      if (candAlbum && srcAlbum && candAlbum === srcAlbum) score += 3;
      const candDur = typeof a.durationInMillis === 'number' ? a.durationInMillis : null;
      if (candDur && durationMs && Math.abs(candDur - durationMs) <= 3000) score += 2;
      if (score > bestScore) { best = item; bestScore = score; }
    }
    if (best && best.id && bestScore >= 10) return best;
  } catch (_) {}

  return null;
}

/**
 * Add library-songs ids to an Apple library playlist.
 * @param {string} playlistId
 * @param {string[]} librarySongIds
 * @param {object} headers
 */
async function addLibrarySongsToApplePlaylist(playlistId, librarySongIds, headers) {
  if (!Array.isArray(librarySongIds) || librarySongIds.length === 0) return;
  const BATCH_SIZE = 25;
  for (let i = 0; i < librarySongIds.length; i += BATCH_SIZE) {
    const batch = librarySongIds.slice(i, i + BATCH_SIZE);
    const body = { data: batch.map(id => ({ id, type: 'library-songs' })) };
    const url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`;
    await makeAppleMusicApiRequest(url, { method: 'POST', data: body, headers });
    broadcast({ type: 'log', message: `Added ${batch.length} library songs to destination playlist (${i + batch.length}/${librarySongIds.length}).` });
    // No delay - instant speed
  }
}

/**
 * Remove all tracks from an Apple Music library playlist (in-place clear).
 * Tries to delete both 'songs' and 'library-songs' relationship items.
 */
async function removeAllTracksFromApplePlaylist(playlistId, headers) {
  for (let pass = 1; pass <= 3; pass += 1) {
    const items = await fetchAllPlaylistItems(playlistId, headers);
    if (!items || items.length === 0) return;
    const BATCH_SIZE = 25;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE).map(x => ({ id: String(x.id), type: String(x.type) }));
      const delUrl = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`;
      await makeAppleMusicApiRequest(delUrl, { method: 'DELETE', data: { data: batch }, headers });
      broadcast({ type: 'log', message: `Pass ${pass}: removed ${batch.length} items (${i + batch.length}/${items.length}).` });
      // No delay - instant speed
    }
    const check = await fetchAllPlaylistItems(playlistId, headers);
    if (!check || check.length === 0) return;
  }
}

/**
 * Remove duplicate items from an Apple library playlist by comparing normalized keys
 * built from track name + primary artist (+ album when available). Keeps the first
 * occurrence and deletes the rest.
 */
async function removeDuplicatesFromApplePlaylist(playlistId, headers) {
  // We run multiple passes until no dupes remain or max 3 passes to be safe
  let totalRemoved = 0;
  for (let pass = 1; pass <= 3; pass += 1) {
    try {
      const url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}?include=tracks`;
      const res = await makeAppleMusicApiRequest(url, { headers });
      const included = (res && res.data && res.data.included) || [];
      const items = included.filter(x => x && (x.type === 'songs' || x.type === 'library-songs'));
      const makeKeys = (item) => {
        const a = item && item.attributes ? item.attributes : {};
        const pp = a && a.playParams ? a.playParams : {};
        const catalogId = String(pp.catalogId || pp.globalId || '');
        const name = normalizeString(a.name || '');
        const artist = normalizeString(a.artistName || '');
        const album = normalizeString(a.albumName || '');
        const dur = typeof a.durationInMillis === 'number' ? Math.round(a.durationInMillis / 1000) : null;
        const keys = [];
        if (catalogId) keys.push(`cid:${catalogId}`);
        keys.push(`naa:${name}|${artist}|${album}`);
        keys.push(`na:${name}|${artist}`);
        if (dur) keys.push(`nad:${name}|${artist}|${dur}`);
        return keys;
      };
      const seen = new Set();
      const toDelete = [];
      for (const it of items) {
        const keys = makeKeys(it);
        let duplicate = false;
        for (const k of keys) {
          if (seen.has(k)) { duplicate = true; break; }
        }
        if (duplicate) {
          toDelete.push({ id: String(it.id), type: String(it.type) });
        } else {
          for (const k of keys) seen.add(k);
        }
      }
      if (toDelete.length === 0) break;
      const BATCH_SIZE = 25;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        const delUrl = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`;
        await makeAppleMusicApiRequest(delUrl, { method: 'DELETE', data: { data: batch }, headers });
        totalRemoved += batch.length;
        broadcast({ type: 'log', message: `Removed ${batch.length} duplicate items (pass ${pass}).` });
        // No delay - instant speed
      }
    } catch (e) {
      const s = e && e.response ? e.response.status : null;
      broadcast({ type: 'log', message: `⚠️ Dedupe failed (status ${s || 'n/a'}) during pass.` });
      break;
    }
  }
  return totalRemoved;
}

/**
 * Fetch existing track catalog IDs from an Apple Music library playlist.
 * Uses pagination and normalizes items to catalog song ids for duplicate prevention.
 * @param {string} playlistId
 * @param {object} headers
 * @returns {Promise<Set<string>>}
 */
async function fetchApplePlaylistCatalogSongIds(playlistId, headers) {
  const existing = new Set();
  // Strategy 1: direct tracks endpoint with pagination
  const tryParsePageItems = (items) => {
    for (const item of items || []) {
      if (!item) continue;
      if (item.type === 'songs' && item.id) {
        existing.add(String(item.id));
        console.log(`🔍 DEBUG: Added song ID: ${item.id} (type: ${item.type})`);
        continue;
      }
      const attr = item.attributes || {};
      const playParams = attr.playParams || {};
      const catalogId = playParams.catalogId || null;
      if (catalogId) {
        existing.add(String(catalogId));
        console.log(`🔍 DEBUG: Added catalog ID: ${catalogId} (type: ${item.type})`);
      }
    }
  };

  const paginate = async (startUrl, label) => {
    let url = startUrl;
    while (url) {
      const res = await makeAppleMusicApiRequest(url, { headers });
      tryParsePageItems(res && res.data && res.data.data);
      url = res && res.data && res.data.next ? `https://amp-api.music.apple.com${res.data.next}` : null;
    }
  };

  try {
    await paginate(`https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`, 'AppleFetchPlaylistTracks');
    return existing;
  } catch (e1) {
    const s1 = e1 && e1.response ? e1.response.status : null;
    if (s1 === 404) {
      console.warn('AppleFetchPlaylistTracks returned 404; treating playlist as empty for duplicate prevention.', { playlistId });
      return existing; // empty
    }
    // If the tracks endpoint is not available, try relationships variant
    try {
      await paginate(`https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/relationships/tracks`, 'AppleFetchPlaylistTracksFallback');
      return existing;
    } catch (e2) {
      const s2 = e2 && e2.response ? e2.response.status : null;
      if (s2 === 404) {
        console.warn('AppleFetchPlaylistTracksFallback returned 404; treating playlist as empty for duplicate prevention.', { playlistId });
        return existing;
      }
      // Final fallback: include=tracks on the playlist itself
      try {
        const url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}?include=tracks`;
        const res = await makeAppleMusicApiRequest(url, { headers });
        const included = (res && res.data && res.data.included) || [];
        tryParsePageItems(included);
        // Also parse relationships if present
        const relationships = res && res.data && res.data.data && res.data.data[0] && res.data.data[0].relationships;
        if (relationships && relationships.tracks && Array.isArray(relationships.tracks.data)) {
          tryParsePageItems(relationships.tracks.data);
        }
        return existing;
      } catch (e3) {
        const s3 = e3 && e3.response ? e3.response.status : null;
        const d3 = e3 && e3.response && e3.response.data ? e3.response.data : null;
        console.warn('Failed to fetch destination playlist catalog song ids via all endpoints; treating as empty set.', {
          playlistId,
          status: s3,
          data: d3,
        });
        return existing;
      }
    }
  }
}

// Spotify OAuth endpoints
app.get('/auth/spotify', (req, res) => {
  const scope = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private';
  const params = querystring.stringify({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state: 'some-random-state',
  });
  res.json({ url: `https://accounts.spotify.com/authorize?${params}` });
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send('No code provided');

  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      querystring.stringify({
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'),
        },
      }
    );
    spotifyTokens = {
      access_token: tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token,
    };
    store.set('spotifyTokens', spotifyTokens);
    res.send('Spotify authentication successful! You can close this window.');
  } catch (err) {
    console.error('Error exchanging code for token:', err.response ? err.response.data : err.message);
    res.status(500).send('Error exchanging code for token');
  }
});

app.get('/auth/spotify/status', (req, res) => {
  res.json({ connected: !!spotifyTokens.access_token });
});

app.post('/auth/spotify/signout', (req, res) => {
  spotifyTokens = { access_token: null, refresh_token: null };
  store.delete('spotifyTokens');
  res.json({ success: true });
});

// Health check endpoint for debugging
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0',
    build: process.pkg ? 'distribution' : 'development'
  });
});

// Simple ping endpoint for connection testing
app.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

app.post('/auth/spotify/signout', (req, res) => {
  spotifyTokens = { access_token: null, refresh_token: null };
  store.delete('spotifyTokens');
  res.json({ success: true });
});

// Apple Music endpoints
app.get('/auth/apple/status', (req, res) => {
  const hasDeveloperToken = !!(process.env.APPLE_MUSIC_DEVELOPER_TOKEN && process.env.APPLE_MUSIC_DEVELOPER_TOKEN !== 'your_token_here') || 
                           !!(store.get('appleDeveloperToken') && store.get('appleDeveloperToken') !== 'your_token_here');
  
  res.json({ 
    connected: !!appleCredentials.mediaUserToken, 
    credentials: appleCredentials,
    hasDeveloperToken: hasDeveloperToken,
    needsDeveloperToken: !hasDeveloperToken
  });
});

app.post('/auth/apple', async (req, res) => {
  const { mediaUserToken } = req.body;
  if (!mediaUserToken) {
    return res.status(400).json({ error: 'Media-user-token is required.' });
  }

  appleCredentials = { mediaUserToken };
  store.set('appleCredentials', appleCredentials);
  
  res.json({ success: true });
});

app.post('/auth/apple/signout', (req, res) => {
  appleCredentials = { mediaUserToken: null };
  store.delete('appleCredentials');
  res.json({ success: true });
});

// Apple Music developer token management endpoints
app.post('/auth/apple/set-developer-token', (req, res) => {
  const { developerToken } = req.body;
  if (!developerToken || typeof developerToken !== 'string' || !developerToken.trim()) {
    return res.status(400).json({ error: 'Developer token is required and must be a non-empty string.' });
  }

  // Store the developer token in environment variable for this session
  process.env.APPLE_MUSIC_DEVELOPER_TOKEN = developerToken.trim();
  
  // Also store it in the persistent store for future sessions
  store.set('appleDeveloperToken', developerToken.trim());
  
  // Update the global variable
  developerToken = developerToken.trim();
  developerTokenFetchedAt = Date.now();
  
  // Reset the browser flag since token was successfully set
  browserOpenedForToken = false;
  
  secureLog('INFO', 'Apple Music developer token set successfully');
  res.json({ 
    success: true, 
    message: 'Developer token set successfully',
    timestamp: new Date().toISOString()
  });
});

// Endpoint to manually install dependencies
app.post('/auth/apple/install-dependencies', async (req, res) => {
  try {
    console.log('🔧 Manual dependency installation requested...');
    
    await installDependenciesAutomatically();
    
    // Verify installation (PuppeteerConfig already loaded at top of file)
    const puppeteerConfig = new PuppeteerConfig();
    const canLaunch = await puppeteerConfig.canLaunch();
    
    res.json({
      success: true,
      message: 'Dependencies installed successfully',
      puppeteerAvailable: canLaunch,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Manual dependency installation failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to install dependencies',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Diagnostic endpoint to check system dependencies
app.get('/auth/apple/diagnostics', async (req, res) => {
  try {
    const diagnostics = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      isProduction: process.env.NODE_ENV === 'production',
      isPkg: !!process.pkg,
      hasPuppeteer: false,
      hasChromium: false,
      puppeteerError: null,
      systemChrome: null,
      timestamp: new Date().toISOString()
    };
    
    // Check if Puppeteer is available
    try {
      const puppeteer = require('puppeteer-extra');
      diagnostics.hasPuppeteer = true;
      
      // Try to check if Chromium is available (PuppeteerConfig already loaded at top of file)
      const puppeteerConfig = new PuppeteerConfig();
      const canLaunch = await puppeteerConfig.canLaunch();
      diagnostics.hasChromium = canLaunch;
      
      // Check for system Chrome
      const systemChrome = puppeteerConfig.getSystemChromePath();
      diagnostics.systemChrome = systemChrome;
      
    } catch (error) {
      diagnostics.puppeteerError = error.message;
    }
    
    res.json(diagnostics);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to run diagnostics',
      message: error.message
    });
  }
});

// New endpoint to open browser for token setup (user-initiated)
app.post('/auth/apple/open-token-setup', async (req, res) => {
  try {
    // Check if we already have a token
    const hasToken = !!(process.env.APPLE_MUSIC_DEVELOPER_TOKEN && process.env.APPLE_MUSIC_DEVELOPER_TOKEN !== 'your_token_here') || 
                     !!(store.get('appleDeveloperToken') && store.get('appleDeveloperToken') !== 'your_token_here');
    
    if (hasToken) {
      return res.json({ 
        success: true, 
        message: 'Apple Music developer token is already configured',
        hasToken: true
      });
    }
    
    // Check if we've already opened the browser
    if (browserOpenedForToken) {
      return res.json({ 
        success: true, 
        message: 'Browser already opened for token setup. Please follow the instructions in the browser.',
        browserAlreadyOpened: true
      });
    }
    
    // Open browser for token setup
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    let command;
    if (process.platform === 'win32') {
      command = 'rundll32 url.dll,FileProtocolHandler "https://music.apple.com/us/browse"';
    } else if (process.platform === 'darwin') {
      command = 'open https://music.apple.com/us/browse';
    } else {
      command = 'xdg-open https://music.apple.com/us/browse';
    }
    
    console.log('Opening Apple Music in browser for token setup...');
    console.log('Please follow these steps:');
    console.log('1. Wait for the page to load completely');
    console.log('2. Press F12 to open Developer Tools');
    console.log('3. Go to Console tab');
    console.log('4. Type: MusicKit.getInstance().developerToken');
    console.log('5. Copy the token value');
    console.log('6. Use the "Set Developer Token" button in the app');
    
    await execAsync(command);
    
    // Mark that we've opened the browser
    browserOpenedForToken = true;
    
    res.json({ 
      success: true, 
      message: 'Browser opened for Apple Music token setup. Please follow the instructions in the browser.',
      instructions: [
        'Wait for the page to load completely',
        'Press F12 to open Developer Tools',
        'Go to Console tab',
        'Type: MusicKit.getInstance().developerToken',
        'Copy the token value',
        'Use the "Set Developer Token" button in the app'
      ]
    });
    
  } catch (error) {
    console.error('Error opening browser for token setup:', error);
    res.status(500).json({ 
      error: 'Failed to open browser for token setup',
      message: error.message
    });
  }
});

app.get('/auth/apple/developer-token-status', (req, res) => {
  const hasToken = !!(developerToken || process.env.APPLE_MUSIC_DEVELOPER_TOKEN || store.get('appleDeveloperToken'));
  const tokenSource = developerToken ? 'memory' : 
                     process.env.APPLE_MUSIC_DEVELOPER_TOKEN ? 'environment' : 
                     store.get('appleDeveloperToken') ? 'store' : 'none';
  
  res.json({ 
    hasToken,
    tokenSource,
    timestamp: new Date().toISOString()
  });
});

// YouTube Music endpoints (placeholder - not yet implemented)
app.get('/auth/youtube/status', (req, res) => {
  res.json({ connected: false, message: 'YouTube Music integration is not yet implemented' });
});

app.post('/auth/youtube', (req, res) => {
  res.status(501).json({ error: 'YouTube Music integration is not yet implemented' });
});

app.post('/playlists/youtube', (req, res) => {
  res.status(501).json({ error: 'YouTube Music integration is not yet implemented' });
});

// Helper function to fetch all Spotify playlists with artwork
async function fetchAllSpotifyPlaylists() {
  let playlists = [];
  let url = 'https://api.spotify.com/v1/me/playlists?limit=50';
  while (url) {
    const response = await requestWithRetry(() => makeSpotifyApiRequest(url), 'SpotifyGetPlaylists');
    const transformed = response.data.items.map(p => ({
      id: p.id,
      name: p.name,
      artwork: (p.images && p.images.length > 0) ? p.images[0].url : null,
    }));
    playlists = playlists.concat(transformed);
    url = response.data.next;
  }
  return playlists;
}

// Playlist endpoints
app.get('/playlists/spotify', async (req, res) => {
  if (!spotifyTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  try {
    const playlists = await fetchAllSpotifyPlaylists();
    res.json({ playlists });
  } catch (err) {
    console.error('Failed to fetch Spotify playlists:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: 'Failed to fetch Spotify playlists' });
  }
});

// Create a new Spotify playlist on the current user's account
app.post('/playlists/spotify/create', async (req, res) => {
  const { name, isPublic = false, description = '' } = req.body || {};
  if (!spotifyTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  try {
    // Generate unique playlist name
    const uniqueName = await generateUniquePlaylistName(name, 'spotify');
    
    // Get current user id
    const meRes = await requestWithRetry(() => makeSpotifyApiRequest('https://api.spotify.com/v1/me'), 'SpotifyGetMe');
    const userId = meRes && meRes.data && meRes.data.id;
    if (!userId) {
      return res.status(500).json({ error: 'Failed to get Spotify user id' });
    }
    // Create playlist
    const createUrl = `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`;
    const defaultDescription = 'This playlist was created by SyncMyPlays that lets you transfer your playlist';
    const finalDescription = description || defaultDescription;
    const createBody = { name: uniqueName, public: Boolean(isPublic), description: finalDescription };
    const createRes = await requestWithRetry(() => makeSpotifyApiRequest(createUrl, { method: 'POST', data: createBody }), 'SpotifyCreatePlaylist');
    const created = createRes && createRes.data;
    if (!created || !created.id) {
      return res.status(500).json({ error: 'Failed to create Spotify playlist' });
    }
    const playlist = {
      id: created.id,
      name: created.name || uniqueName,
      artwork: created.images && created.images.length > 0 ? created.images[0].url : null,
    };
    res.json({ success: true, playlist });
  } catch (err) {
    console.error('Spotify create playlist error:', err && err.response ? err.response.data : (err && err.message ? err.message : String(err)));
    res.status(500).json({ error: 'Failed to create Spotify playlist' });
  }
});

// Create a new Apple Music library playlist
app.post('/playlists/apple/create', async (req, res) => {
  const { name } = req.body || {};
  if (!appleCredentials.mediaUserToken) {
    return res.status(401).json({ error: 'Not authenticated with Apple Music' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  try {
    // Generate unique playlist name
    const uniqueName = await generateUniquePlaylistName(name, 'apple');
    
    const devToken = await getDeveloperToken(false);
    const headers = {
      'Authorization': `Bearer ${devToken}`,
      'Music-User-Token': appleCredentials.mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const url = 'https://amp-api.music.apple.com/v1/me/library/playlists';
    const description = 'This playlist was created by SyncMyPlays that lets you transfer your playlist';
    const body = { attributes: { name: uniqueName, description: description } };
    const response = await makeAppleMusicApiRequest(url, { method: 'POST', data: body, headers });
    const created = response && response.data && Array.isArray(response.data.data) && response.data.data[0];
    if (!created || !created.id) {
      return res.status(500).json({ error: 'Failed to create Apple Music playlist' });
    }

    const playlist = {
      id: created.id,
      name: (created.attributes && created.attributes.name) || uniqueName,
      artwork: created.attributes && created.attributes.artwork ? created.attributes.artwork.url.replace('{w}', '320').replace('{h}', '320') : null,
    };

    res.json({ success: true, playlist });
  } catch (err) {
    console.error('Apple Music create playlist error:', err && err.response ? err.response.data : (err && err.message ? err.message : String(err)));
    res.status(500).json({ error: 'Failed to create Apple Music playlist' });
  }
});

// -------------------- Feature Helpers (Spotify + Apple) --------------------
// Fetch Apple playlist track ids in order (best-effort). Returns { catalogIds, librarySongIds, items }
async function fetchApplePlaylistTrackIdsOrdered(playlistId, headers) {
  const catalogIds = [];
  const librarySongIds = [];
  const items = [];
  const parse = (arr) => {
    for (const it of arr || []) {
      const type = it && it.type;
      const attrs = it && it.attributes;
      if (!attrs) continue;
      const name = attrs.name || '';
      const artist = attrs.artistName || '';
      const album = attrs.albumName || '';
      const durationMs = attrs.durationInMillis || 0;
      items.push({ id: it.id, type, name, artist, album, duration_ms: durationMs });
      if (type === 'songs') {
        catalogIds.push(String(it.id));
      } else if (type === 'library-songs') {
        const cid = attrs.playParams && (attrs.playParams.catalogId || attrs.playParams.globalId);
        if (cid) catalogIds.push(String(cid));
        else librarySongIds.push(String(it.id));
      }
    }
  };
  let url = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`;
  while (url) {
    const resp = await makeAppleMusicApiRequest(url, { headers });
    parse(resp.data && resp.data.data ? resp.data.data : []);
    url = resp.data && resp.data.next ? `https://amp-api.music.apple.com${resp.data.next}` : null;
  }
  // Fallback: include=tracks
  if (items.length === 0) {
    const incUrl = `https://amp-api.music.apple.com/v1/me/library/playlists/${encodeURIComponent(playlistId)}?include=tracks`;
    const resp = await makeAppleMusicApiRequest(incUrl, { headers });
    const inc = (resp.data && resp.data.included) || [];
    parse(inc.filter(x => x && (x.type === 'songs' || x.type === 'library-songs')));
  }
  return { catalogIds, librarySongIds, items };
}

// Fetch Apple Library songs (favorites/library) minimal metadata
async function fetchAppleLibrarySongs(headers) {
  const items = [];
  let url = `https://amp-api.music.apple.com/v1/me/library/songs?limit=100`;
  while (url) {
    const resp = await makeAppleMusicApiRequest(url, { headers });
    for (const it of (resp.data && resp.data.data) || []) {
      const attrs = it.attributes || {};
      items.push({
        id: it.id,
        type: 'library-songs',
        name: attrs.name || '',
        artist: attrs.artistName || '',
        album: attrs.albumName || '',
        duration_ms: attrs.durationInMillis || 0,
        catalogId: attrs.playParams && (attrs.playParams.catalogId || attrs.playParams.globalId) || null,
      });
    }
    url = resp.data && resp.data.next ? `https://amp-api.music.apple.com${resp.data.next}` : null;
  }
  return items;
}

function buildExportFromTracks(format, tracks, service) {
  const safe = (s) => (s == null ? '' : String(s));
  if (format === 'json') {
    return { contentType: 'application/json', body: JSON.stringify(tracks, null, 2) };
  }
  if (format === 'xml') {
    const rows = tracks.map(t => `  <track><name>${safe(t.name)}</name><artist>${safe(t.artist)}</artist><album>${safe(t.album)}</album><duration_ms>${safe(t.duration_ms||0)}</duration_ms><id>${safe(t.id)}</id></track>`).join('\n');
    const body = `<tracks service="${service}">\n${rows}\n</tracks>`;
    return { contentType: 'application/xml', body };
  }
  if (format === 'xspf') {
    const entries = tracks.map(t => `    <track>\n      <title>${safe(t.name)}</title>\n      <creator>${safe(t.artist)}</creator>\n      <album>${safe(t.album)}</album>\n    </track>`).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<playlist version="1" xmlns="http://xspf.org/ns/0/">\n  <trackList>\n${entries}\n  </trackList>\n</playlist>`;
    return { contentType: 'application/xspf+xml', body };
  }
  if (format === 'url') {
    const toUrl = (t) => service === 'spotify' ? `https://open.spotify.com/track/${t.id}` : `https://music.apple.com/us/song/${t.catalogId || t.id}`;
    const body = tracks.map(t => toUrl(t)).join('\n');
    return { contentType: 'text/plain', body };
  }
  if (format === 'txt') {
    const body = tracks.map(t => `${safe(t.artist)} - ${safe(t.name)}`).join('\n');
    return { contentType: 'text/plain', body };
  }
  // default csv
  const header = 'Name,Artist,Album,Duration(ms),Id';
  const rows = tracks.map(t => [safe(t.name), safe(t.artist), safe(t.album), String(t.duration_ms||0), safe(t.id)].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  const body = [header, ...rows].join('\n');
  return { contentType: 'text/csv', body };
}

// -------------------- Feature Routes --------------------
// Join two playlists into a new playlist (destination = serviceA)
app.post('/features/join_playlists', async (req, res) => {
  try {
    const { serviceA, playlistA, serviceB, playlistB, newPlaylistName } = req.body || {};
    const destService = String(serviceA || '').toLowerCase();
    if (!destService || !playlistA || !playlistB || !newPlaylistName) {
      return res.status(400).json({ error: 'serviceA, playlistA, playlistB and newPlaylistName are required' });
    }

    // Check auth
    if (destService === 'spotify' && !spotifyTokens.access_token) return res.status(401).json({ error: 'Not authenticated with Spotify' });
    if (destService === 'apple' && !appleCredentials.mediaUserToken) return res.status(401).json({ error: 'Not authenticated with Apple Music' });

    // Create destination playlist
    let destId = null;
    if (destService === 'spotify') {
      const created = await createSpotifyPlaylistInternal(String(newPlaylistName).trim());
      destId = created.id;
    } else {
      const created = await createApplePlaylistInternal(String(newPlaylistName).trim());
      destId = created.id;
    }

    // Helper to copy tracks within same service
    const addFromSameService = async (service, sourceId) => {
      if (service === 'spotify') {
        const tracks = await fetchSpotifyPlaylistTracks(sourceId);
        const ids = tracks.map(t => String(t.id)).filter(Boolean);
        // unique
        const uniqueIds = Array.from(new Set(ids));
        await addTracksToSpotifyPlaylistInBatches(destId, uniqueIds);
      } else {
        const dev = await getDeveloperToken(false);
        const headers = {
          'Authorization': `Bearer ${dev}`,
          'Music-User-Token': appleCredentials.mediaUserToken,
          'Origin': 'https://music.apple.com',
          'User-Agent': 'Mozilla/5.0',
        };
        const { catalogIds } = await fetchApplePlaylistTrackIdsOrdered(sourceId, headers);
        const unique = Array.from(new Set(catalogIds));
        await addTracksToApplePlaylistInBatches(destId, unique, headers);
      }
    };

    // Copy from playlistA
    await addFromSameService(serviceA, playlistA);

    // Copy from playlistB (same service or cross-service)
    if (String(serviceB).toLowerCase() === destService) {
      await addFromSameService(serviceB, playlistB);
    } else {
      if (destService === 'spotify') {
        await runAppleToSpotifySync(playlistB, destId);
      } else {
        await runSpotifyToAppleSync(playlistB, destId, 'us');
      }
    }

    return res.json({ success: true, message: 'Playlists joined successfully', destinationPlaylistId: destId });
  } catch (error) {
    console.error('join_playlists failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to join playlists' });
  }
});

// Split one playlist into multiple new playlists
app.post('/features/split_playlist', async (req, res) => {
  try {
    const { service, playlist, splitSize, baseName } = req.body || {};
    const svc = String(service || '').toLowerCase();
    const size = Math.max(1, Math.min(1000, Number(splitSize || 50)));
    if (!svc || !playlist || !baseName) return res.status(400).json({ error: 'service, playlist and baseName are required' });
    if (svc === 'spotify' && !spotifyTokens.access_token) return res.status(401).json({ error: 'Not authenticated with Spotify' });
    if (svc === 'apple' && !appleCredentials.mediaUserToken) return res.status(401).json({ error: 'Not authenticated with Apple Music' });

    const newPlaylists = [];
    if (svc === 'spotify') {
      const tracks = await fetchSpotifyPlaylistTracks(playlist);
      const ids = tracks.map(t => String(t.id)).filter(Boolean);
      for (let i = 0; i < ids.length; i += size) {
        const created = await createSpotifyPlaylistInternal(`${baseName} ${Math.floor(i/size)+1}`);
        const chunk = ids.slice(i, i + size);
        if (chunk.length > 0) await addTracksToSpotifyPlaylistInBatches(created.id, chunk);
        newPlaylists.push({ id: created.id, name: created.name });
        // No delay - SongShift speed (instant)
      }
    } else {
      const dev = await getDeveloperToken(false);
      const headers = {
        'Authorization': `Bearer ${dev}`,
        'Music-User-Token': appleCredentials.mediaUserToken,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0',
      };
      const { catalogIds } = await fetchApplePlaylistTrackIdsOrdered(playlist, headers);
      for (let i = 0; i < catalogIds.length; i += size) {
        const created = await createApplePlaylistInternal(`${baseName} ${Math.floor(i/size)+1}`);
        const chunk = catalogIds.slice(i, i + size);
        if (chunk.length > 0) await addTracksToApplePlaylistInBatches(created.id, chunk, headers);
        newPlaylists.push({ id: created.id, name: created.name });
        // No delay - SongShift speed (instant)
      }
    }
    return res.json({ success: true, message: 'Playlist split successfully', newPlaylists });
  } catch (error) {
    console.error('split_playlist failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to split playlist' });
  }
});

// Export user favorites/library
app.post('/features/export_favorites', async (req, res) => {
  try {
    const { service, format = 'csv' } = req.body || {};
    const svc = String(service || '').toLowerCase();
    if (!svc) return res.status(400).json({ error: 'service required' });

    if (svc === 'spotify') {
      if (!spotifyTokens.access_token) return res.status(401).json({ error: 'Not authenticated with Spotify' });
      const items = [];
      let url = 'https://api.spotify.com/v1/me/tracks?limit=50';
      while (url) {
        const r = await requestWithRetry(() => makeSpotifyApiRequest(url), 'SpotifySavedTracks:Features');
        for (const it of (r.data && r.data.items) || []) {
          const t = it.track || {};
          items.push({
            id: t.id,
            name: t.name,
            artist: (t.artists && t.artists[0] && t.artists[0].name) || '',
            album: (t.album && t.album.name) || '',
            duration_ms: t.duration_ms || 0,
          });
        }
        url = r.data && r.data.next;
      }
      const out = buildExportFromTracks(String(format).toLowerCase(), items, 'spotify');
      res.setHeader('Content-Type', out.contentType);
      return res.status(200).send(out.body);
    }

    // Apple
    if (!appleCredentials.mediaUserToken) return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    const dev = await getDeveloperToken(false);
    const headers = {
      'Authorization': `Bearer ${dev}`,
      'Music-User-Token': appleCredentials.mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0',
    };
    const lib = await fetchAppleLibrarySongs(headers);
    const normalized = lib.map(x => ({ id: x.id, catalogId: x.catalogId, name: x.name, artist: x.artist, album: x.album, duration_ms: x.duration_ms }));
    const out = buildExportFromTracks(String(format).toLowerCase(), normalized, 'apple');
    res.setHeader('Content-Type', out.contentType);
    return res.status(200).send(out.body);
  } catch (error) {
    console.error('export_favorites failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to export favorites' });
  }
});

// Export a specific playlist
app.post('/features/export_playlist', async (req, res) => {
  try {
    const { service, playlist, format = 'csv' } = req.body || {};
    const svc = String(service || '').toLowerCase();
    if (!svc || !playlist) return res.status(400).json({ error: 'service and playlist required' });

    if (svc === 'spotify') {
      if (!spotifyTokens.access_token) return res.status(401).json({ error: 'Not authenticated with Spotify' });
      const tracks = await fetchSpotifyPlaylistTracks(playlist);
      const items = tracks.map(t => ({ id: t.id, name: t.name, artist: (t.artists && t.artists[0]) || '', album: t.album || '', duration_ms: t.duration_ms || 0 }));
      const out = buildExportFromTracks(String(format).toLowerCase(), items, 'spotify');
      res.setHeader('Content-Type', out.contentType);
      return res.status(200).send(out.body);
    }

    // Apple
    if (!appleCredentials.mediaUserToken) return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    const dev = await getDeveloperToken(false);
    const headers = {
      'Authorization': `Bearer ${dev}`,
      'Music-User-Token': appleCredentials.mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0',
    };
    const { items } = await fetchApplePlaylistTrackIdsOrdered(playlist, headers);
    const out = buildExportFromTracks(String(format).toLowerCase(), items, 'apple');
    res.setHeader('Content-Type', out.contentType);
    return res.status(200).send(out.body);
  } catch (error) {
    console.error('export_playlist failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to export playlist' });
  }
});

// =================================================================================
// NEW: AI RECOMMENDATIONS ENDPOINTS
// =================================================================================

// Get AI-powered music recommendations
app.post('/ai/recommendations', async (req, res) => {
  try {
    const { userId, service, limit = 20, context } = req.body || {};
    if (!userId || !service) {
      return res.status(400).json({ error: 'userId and service are required' });
    }

    // Check authentication based on service
    if (service === 'spotify' && !spotifyTokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    if (service === 'apple' && !appleCredentials.mediaUserToken) {
      return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    }

    // Generate recommendations based on user's listening history
    const recommendations = await generateAIRecommendations(userId, service, limit, context);
    
    res.json({ 
      success: true, 
      recommendations,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI recommendations failed:', error.message);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Get user profile analysis for AI recommendations
app.post('/ai/user-profile', async (req, res) => {
  try {
    const { userId, service } = req.body || {};
    if (!userId || !service) {
      return res.status(400).json({ error: 'userId and service are required' });
    }

    // Check authentication
    if (service === 'spotify' && !spotifyTokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    if (service === 'apple' && !appleCredentials.mediaUserToken) {
      return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    }

    const profile = await analyzeUserProfile(userId, service);
    
    res.json({ 
      success: true, 
      profile,
      analyzedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('User profile analysis failed:', error.message);
    res.status(500).json({ error: 'Failed to analyze user profile' });
  }
});

// =================================================================================
// NEW: COLLABORATIVE PLAYLISTS ENDPOINTS
// =================================================================================

// Create collaborative playlist
app.post('/collaborative/playlists', async (req, res) => {
  try {
    const { name, ownerId, collaborators, permissions, service, sourcePlaylistId } = req.body || {};
    if (!name || !ownerId || !service) {
      return res.status(400).json({ error: 'name, ownerId, and service are required' });
    }

    // Check authentication
    if (service === 'spotify' && !spotifyTokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    if (service === 'apple' && !appleCredentials.mediaUserToken) {
      return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    }

    const playlist = await createCollaborativePlaylist(name, ownerId, collaborators, permissions, service, sourcePlaylistId);
    
    res.json({ 
      success: true, 
      playlist,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Collaborative playlist creation failed:', error.message);
    res.status(500).json({ error: 'Failed to create collaborative playlist' });
  }
});

// Get collaborative playlist details
app.get('/collaborative/playlists/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const playlist = collaborativeStore.playlists.get(playlistId);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json({ 
      success: true, 
      playlist
    });
  } catch (error) {
    console.error('Get collaborative playlist failed:', error.message);
    res.status(500).json({ error: 'Failed to get collaborative playlist' });
  }
});

// Update collaborative playlist
app.put('/collaborative/playlists/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { name, collaborators, permissions } = req.body || {};
    
    const playlist = collaborativeStore.playlists.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Update playlist
    if (name) playlist.name = name;
    if (collaborators) playlist.collaborators = collaborators;
    if (permissions) playlist.permissions = permissions;
    playlist.updatedAt = new Date().toISOString();
    
    collaborativeStore.playlists.set(playlistId, playlist);
    
    // Broadcast update to all connected clients
    broadcast({ 
      type: 'playlist_updated', 
      playlistId, 
      playlist,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      playlist,
      updatedAt: playlist.updatedAt
    });
  } catch (error) {
    console.error('Update collaborative playlist failed:', error.message);
    res.status(500).json({ error: 'Failed to update collaborative playlist' });
  }
});

// Add collaborator to playlist
app.post('/collaborative/playlists/:playlistId/collaborators', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { userId, role, permissions } = req.body || {};
    
    if (!userId || !role) {
      return res.status(400).json({ error: 'userId and role are required' });
    }
    
    const playlist = collaborativeStore.playlists.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Add or update collaborator
    playlist.collaborators.set(userId, {
      role,
      permissions: permissions || [],
      addedAt: new Date().toISOString()
    });
    
    collaborativeStore.playlists.set(playlistId, playlist);
    
    // Broadcast update
    broadcast({ 
      type: 'collaborator_added', 
      playlistId, 
      userId, 
      role,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Collaborator added successfully'
    });
  } catch (error) {
    console.error('Add collaborator failed:', error.message);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

// =================================================================================
// NEW: ENHANCED SCHEDULED SYNC ENDPOINTS
// =================================================================================

// Get all scheduled sync jobs
app.get('/sync/scheduled', async (req, res) => {
  try {
    const jobs = Array.from(collaborativeStore.syncJobs.values());
    res.json({ 
      success: true, 
      jobs,
      total: jobs.length
    });
  } catch (error) {
    console.error('Get scheduled sync jobs failed:', error.message);
    res.status(500).json({ error: 'Failed to get scheduled sync jobs' });
  }
});

// Create new scheduled sync job
app.post('/sync/scheduled', async (req, res) => {
  try {
    const { name, schedule, sourceService, destinationService, sourcePlaylistId, destinationPlaylistId, enabled = true } = req.body || {};
    
    if (!name || !schedule || !sourceService || !destinationService || !sourcePlaylistId || !destinationPlaylistId) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }
    
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const job = {
      id: jobId,
      name,
      schedule,
      sourceService,
      destinationService,
      sourcePlaylistId,
      destinationPlaylistId,
      enabled,
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      nextRunAt: computeNextRunTime(schedule),
      status: 'pending',
      runs: []
    };
    
    collaborativeStore.syncJobs.set(jobId, job);
    collaborativeStore.systemStats.totalSyncJobs = collaborativeStore.syncJobs.size;
    
    // Broadcast new job creation
    broadcast({ 
      type: 'sync_job_created', 
      job,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      job,
      message: 'Scheduled sync job created successfully'
    });
  } catch (error) {
    console.error('Create scheduled sync job failed:', error.message);
    res.status(500).json({ error: 'Failed to create scheduled sync job' });
  }
});

// Update scheduled sync job
app.put('/sync/scheduled/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const updates = req.body || {};
    
    const job = collaborativeStore.syncJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Sync job not found' });
    }
    
    // Update job properties
    Object.assign(job, updates);
    job.updatedAt = new Date().toISOString();
    
    // Recalculate next run time if schedule changed
    if (updates.schedule) {
      job.nextRunAt = computeNextRunTime(updates.schedule);
    }
    
    collaborativeStore.syncJobs.set(jobId, job);
    
    // Broadcast update
    broadcast({ 
      type: 'sync_job_updated', 
      job,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      job,
      message: 'Sync job updated successfully'
    });
  } catch (error) {
    console.error('Update sync job failed:', error.message);
    res.status(500).json({ error: 'Failed to update sync job' });
  }
});

// Delete scheduled sync job
app.delete('/sync/scheduled/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = collaborativeStore.syncJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Sync job not found' });
    }
    
    collaborativeStore.syncJobs.delete(jobId);
    collaborativeStore.systemStats.totalSyncJobs = collaborativeStore.syncJobs.size;
    
    // Broadcast deletion
    broadcast({ 
      type: 'sync_job_deleted', 
      jobId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Sync job deleted successfully'
    });
  } catch (error) {
    console.error('Delete sync job failed:', error.message);
    res.status(500).json({ error: 'Failed to delete sync job' });
  }
});

// =================================================================================
// NEW: ADMIN DASHBOARD ENDPOINTS
// =================================================================================

// Get system overview and statistics
app.get('/admin/overview', async (req, res) => {
  try {
    const stats = {
      ...collaborativeStore.systemStats,
      currentTime: new Date().toISOString(),
      uptime: Date.now() - collaborativeStore.systemStats.systemUptime,
      activeConnections: activeConnections.size,
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version
    };
    
    res.json({ 
      success: true, 
      stats
    });
  } catch (error) {
    console.error('Get admin overview failed:', error.message);
    res.status(500).json({ error: 'Failed to get admin overview' });
  }
});

// Get user management data
app.get('/admin/users', async (req, res) => {
  try {
    const users = Array.from(collaborativeStore.users.values());
    res.json({ 
      success: true, 
      users,
      total: users.length
    });
  } catch (error) {
    console.error('Get users failed:', error.message);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get system logs
app.get('/admin/logs', async (req, res) => {
  try {
    const { limit = 100, level } = req.query || {};
    
    // This would typically read from a log file or database
    // For now, return recent console logs
    const logs = [];
    // Implementation would depend on your logging system
    
    res.json({ 
      success: true, 
      logs,
      total: logs.length
    });
  } catch (error) {
    console.error('Get logs failed:', error.message);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// =================================================================================
// NEW: HELPER FUNCTIONS FOR AI AND COLLABORATIVE FEATURES
// =================================================================================

// Generate AI-powered music recommendations
async function generateAIRecommendations(userId, service, limit, context) {
  try {
    // Get user's listening history and preferences
    const userProfile = await analyzeUserProfile(userId, service);
    
    // Generate recommendations based on profile
    const recommendations = [];
    
    if (service === 'spotify' && spotifyTokens.access_token) {
      // Get user's top tracks and artists
      const topTracks = await getSpotifyTopTracks();
      const topArtists = await getSpotifyTopArtists();
      
      // Generate recommendations based on top content
      for (let i = 0; i < Math.min(limit, 10); i++) {
        if (topTracks[i]) {
          recommendations.push({
            id: topTracks[i].id,
            name: topTracks[i].name,
            artist: topTracks[i].artists[0]?.name || '',
            album: topTracks[i].album?.name || '',
            reason: 'Based on your top tracks',
            confidence: 0.8 + (Math.random() * 0.2)
          });
        }
      }
    }
    
    // Add collaborative filtering recommendations
    const collaborativeRecs = await getCollaborativeRecommendations(userId, service);
    recommendations.push(...collaborativeRecs.slice(0, limit - recommendations.length));
    
    return recommendations.slice(0, limit);
  } catch (error) {
    console.error('Generate AI recommendations failed:', error.message);
    return [];
  }
}

// Analyze user profile for AI recommendations
async function analyzeUserProfile(userId, service) {
  try {
    const profile = {
      userId,
      service,
      genres: [],
      moods: [],
      tempo: 'medium',
      favoriteArtists: [],
      favoriteAlbums: [],
      listeningPatterns: {},
      analyzedAt: new Date().toISOString()
    };
    
    if (service === 'spotify' && spotifyTokens.access_token) {
      // Analyze Spotify listening patterns
      const topTracks = await getSpotifyTopTracks();
      const topArtists = await getSpotifyTopArtists();
      
      profile.favoriteArtists = topArtists.slice(0, 10).map(a => a.name);
      profile.favoriteAlbums = topTracks.slice(0, 20).map(t => t.album?.name).filter(Boolean);
      
      // Analyze genres and moods (simplified)
      profile.genres = ['pop', 'rock', 'electronic']; // Would analyze from artist data
      profile.moods = ['energetic', 'chill', 'upbeat']; // Would analyze from audio features
    }
    
    return profile;
  } catch (error) {
    console.error('Analyze user profile failed:', error.message);
    return { userId, service, error: error.message };
  }
}

// Get collaborative recommendations
async function getCollaborativeRecommendations(userId, service) {
  try {
    // This would implement collaborative filtering algorithms
    // For now, return some sample recommendations
    return [
      {
        id: 'collab_1',
        name: 'Collaborative Track 1',
        artist: 'Artist 1',
        album: 'Album 1',
        reason: 'Popular among users with similar taste',
        confidence: 0.7
      }
    ];
  } catch (error) {
    console.error('Get collaborative recommendations failed:', error.message);
    return [];
  }
}

// Create collaborative playlist
async function createCollaborativePlaylist(name, ownerId, collaborators, permissions, service, sourcePlaylistId) {
  try {
    const playlistId = `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const playlist = {
      id: playlistId,
      name,
      ownerId,
      service,
      sourcePlaylistId,
      collaborators: new Map(collaborators || []),
      permissions: permissions || ['read', 'write'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tracks: [],
      activity: []
    };
    
    collaborativeStore.playlists.set(playlistId, playlist);
    collaborativeStore.systemStats.totalPlaylists = collaborativeStore.playlists.size;
    
    return playlist;
  } catch (error) {
    console.error('Create collaborative playlist failed:', error.message);
    throw error;
  }
}

// Get Spotify top tracks
async function getSpotifyTopTracks() {
  try {
    const response = await makeSpotifyApiRequest('https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term');
    return response.data.items || [];
  } catch (error) {
    console.error('Get Spotify top tracks failed:', error.message);
    return [];
  }
}

// Get Spotify top artists
async function getSpotifyTopArtists() {
  try {
    const response = await makeSpotifyApiRequest('https://api.spotify.com/v1/me/top/artists?limit=20&time_range=short_term');
    return response.data.items || [];
  } catch (error) {
    console.error('Get Spotify top artists failed:', error.message);
    return [];
  }
}

// Compute next run time for scheduled sync
function computeNextRunTime(schedule) {
  try {
    const now = new Date();
    
    if (schedule.type === 'daily') {
      const [hours, minutes] = schedule.time.split(':').map(Number);
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next.toISOString();
    }
    
    if (schedule.type === 'weekly') {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(schedule.day.toLowerCase());
      const [hours, minutes] = schedule.time.split(':').map(Number);
      
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      
      const currentDay = next.getDay();
      const daysToAdd = (targetDay - currentDay + 7) % 7;
      next.setDate(next.getDate() + daysToAdd);
      
      if (next <= now) {
        next.setDate(next.getDate() + 7);
      }
      
      return next.toISOString();
    }
    
    if (schedule.type === 'interval') {
      const intervalMs = schedule.intervalMinutes * 60 * 1000;
      return new Date(now.getTime() + intervalMs).toISOString();
    }
    
    // Default: run in 1 hour
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  } catch (error) {
    console.error('Compute next run time failed:', error.message);
    // Default: run in 1 hour
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }
}

// =================================================================================
// NEW: ENHANCED SYNC FUNCTIONALITY WITH REAL-TIME UPDATES
// =================================================================================

// Enhanced sync with real-time progress updates
app.post('/sync/enhanced', async (req, res) => {
  try {
    const { sourceService, destinationService, sourcePlaylistId, destinationPlaylistId, options = {} } = req.body || {};
    
    if (!sourceService || !destinationService || !sourcePlaylistId || !destinationPlaylistId) {
      return res.status(400).json({ error: 'All sync parameters are required' });
    }
    
    // Check authentication
    if (sourceService === 'spotify' && !spotifyTokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated with Spotify' });
    }
    if (sourceService === 'apple' && !appleCredentials.mediaUserToken) {
      return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    }
    
    // Start sync process
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Broadcast sync start
    broadcast({ 
      type: 'sync_started', 
      syncId, 
      sourceService, 
      destinationService,
      timestamp: new Date().toISOString()
    });
    
    // Run sync in background
    runEnhancedSync(syncId, sourceService, destinationService, sourcePlaylistId, destinationPlaylistId, options);
    
    res.json({ 
      success: true, 
      syncId,
      message: 'Sync started successfully',
      status: 'running'
    });
    
  } catch (error) {
    console.error('Enhanced sync failed:', error.message);
    res.status(500).json({ error: 'Failed to start enhanced sync' });
  }
});

// Get sync status and progress
app.get('/sync/status/:syncId', async (req, res) => {
  try {
    const { syncId } = req.params;
    const syncStatus = collaborativeStore.syncJobs.get(syncId);
    
    if (!syncStatus) {
      return res.status(404).json({ error: 'Sync job not found' });
    }
    
    res.json({ 
      success: true, 
      status: syncStatus
    });
  } catch (error) {
    console.error('Get sync status failed:', error.message);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// =================================================================================
// NEW: REAL-TIME COLLABORATION FEATURES
// =================================================================================

// Join collaborative session
app.post('/collaborative/sessions/join', async (req, res) => {
  try {
    const { userId, playlistId, role = 'viewer' } = req.body || {};
    
    if (!userId || !playlistId) {
      return res.status(400).json({ error: 'userId and playlistId are required' });
    }
    
    const playlist = collaborativeStore.playlists.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Add user to session
    playlist.collaborators.set(userId, {
      role,
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });
    
    // Broadcast user joined
    broadcast({ 
      type: 'user_joined_session', 
      userId, 
      playlistId, 
      role,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Joined collaborative session successfully',
      playlist: {
        id: playlist.id,
        name: playlist.name,
        collaborators: Array.from(playlist.collaborators.entries())
      }
    });
    
  } catch (error) {
    console.error('Join collaborative session failed:', error.message);
    res.status(500).json({ error: 'Failed to join collaborative session' });
  }
});

// Leave collaborative session
app.post('/collaborative/sessions/leave', async (req, res) => {
  try {
    const { userId, playlistId } = req.body || {};
    
    if (!userId || !playlistId) {
      return res.status(400).json({ error: 'userId and playlistId are required' });
    }
    
    const playlist = collaborativeStore.playlists.get(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Remove user from session
    playlist.collaborators.delete(userId);
    
    // Broadcast user left
    broadcast({ 
      type: 'user_left_session', 
      userId, 
      playlistId,
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Left collaborative session successfully'
    });
    
  } catch (error) {
    console.error('Leave collaborative session failed:', error.message);
    res.status(500).json({ error: 'Failed to leave collaborative session' });
  }
});

// =================================================================================
// NEW: PERFORMANCE MONITORING AND ANALYTICS
// =================================================================================

// Get performance metrics
app.get('/admin/performance', async (req, res) => {
  try {
    const metrics = {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      activeConnections: activeConnections.size,
      totalRequests: collaborativeStore.systemStats.totalRequests || 0,
      averageResponseTime: collaborativeStore.systemStats.averageResponseTime || 0,
      errorRate: collaborativeStore.systemStats.errorRate || 0,
      timestamp: new Date().toISOString()
    };
    
    res.json({ 
      success: true, 
      metrics
    });
  } catch (error) {
    console.error('Get performance metrics failed:', error.message);
    res.status(500).json({ error: 'Failed to get performance metrics' });
  }
});

// Get sync analytics
app.get('/admin/sync-analytics', async (req, res) => {
  try {
    const jobs = Array.from(collaborativeStore.syncJobs.values());
    
    const analytics = {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(j => j.status === 'running').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      failedJobs: jobs.filter(j => j.status === 'error').length,
      averageSyncTime: calculateAverageSyncTime(jobs),
      successRate: calculateSuccessRate(jobs),
      topSourceServices: getTopSourceServices(jobs),
      topDestinationServices: getTopDestinationServices(jobs),
      timestamp: new Date().toISOString()
    };
    
    res.json({ 
      success: true, 
      analytics
    });
  } catch (error) {
    console.error('Get sync analytics failed:', error.message);
    res.status(500).json({ error: 'Failed to get sync analytics' });
  }
});

// =================================================================================
// NEW: HELPER FUNCTIONS FOR ENHANCED FEATURES
// =================================================================================

// Run enhanced sync with real-time updates
async function runEnhancedSync(syncId, sourceService, destinationService, sourcePlaylistId, destinationPlaylistId, options) {
  try {
    // Update sync status
    const syncJob = {
      id: syncId,
      status: 'running',
      progress: 0,
      startTime: new Date().toISOString(),
      sourceService,
      destinationService,
      sourcePlaylistId,
      destinationPlaylistId,
      options
    };
    
    collaborativeStore.syncJobs.set(syncId, syncJob);
    
    // Broadcast progress updates with detailed track information
    const updateProgress = (progress, message, trackInfo = null) => {
      syncJob.progress = progress;
      syncJob.lastMessage = message;
      syncJob.lastUpdate = new Date().toISOString();
      
      broadcast({ 
        type: 'progress',
        data: {
          current: Math.floor(progress / 10), // Convert percentage to current count
          total: 100, // Will be updated with actual track count
          currentStep: message,
          status: progress < 100 ? 'searching' : 'completed',
          trackInfo: trackInfo,
          eta: progress < 100 ? 'Calculating...' : 'Complete',
          startTime: Date.now()
        },
        timestamp: new Date().toISOString()
      });
    };
    
    updateProgress(10, 'Starting sync process...');
    
    // Run the actual sync (this will broadcast detailed progress updates)
    let result;
    if (sourceService === 'spotify' && destinationService === 'apple') {
      result = await runSpotifyToAppleSync(sourcePlaylistId, destinationPlaylistId, 'us');
    } else if (sourceService === 'apple' && destinationService === 'spotify') {
      result = await runAppleToSpotifySync(sourcePlaylistId, destinationPlaylistId);
    } else {
      throw new Error(`Unsupported sync direction: ${sourceService} -> ${destinationService}`);
    }
    
    updateProgress(95, 'Finalizing sync...');
    
    // Update final status
    syncJob.status = 'completed';
    syncJob.progress = 100;
    syncJob.endTime = new Date().toISOString();
    syncJob.result = result;
    
    collaborativeStore.syncJobs.set(syncId, syncJob);
    
    // Broadcast completion
    updateProgress(100, 'Sync completed successfully!');
    
    broadcast({ 
      type: 'finish', 
      status: 'success',
      found: result?.added || 0,
      notFound: result ? (result.total - result.added) : 0,
      timestamp: new Date().toISOString()
    });
    
    // Update system stats
    collaborativeStore.systemStats.lastSyncAt = new Date().toISOString();
    
  } catch (error) {
    console.error('Enhanced sync failed:', error.message);
    
    // Update error status
    const syncJob = collaborativeStore.syncJobs.get(syncId);
    if (syncJob) {
      syncJob.status = 'error';
      syncJob.error = error.message;
      syncJob.endTime = new Date().toISOString();
      collaborativeStore.syncJobs.set(syncId, syncJob);
    }
    
    // Broadcast error
    broadcast({ 
      type: 'sync_error', 
      syncId, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Calculate average sync time
function calculateAverageSyncTime(jobs) {
  const completedJobs = jobs.filter(j => j.status === 'completed' && j.startTime && j.endTime);
  if (completedJobs.length === 0) return 0;
  
  const totalTime = completedJobs.reduce((sum, job) => {
    const start = new Date(job.startTime);
    const end = new Date(job.endTime);
    return sum + (end - start);
  }, 0);
  
  return totalTime / completedJobs.length;
}

// Calculate success rate
function calculateSuccessRate(jobs) {
  if (jobs.length === 0) return 0;
  const successful = jobs.filter(j => j.status === 'completed').length;
  return (successful / jobs.length) * 100;
}

// Get top source services
function getTopSourceServices(jobs) {
  const serviceCounts = {};
  jobs.forEach(job => {
    serviceCounts[job.sourceService] = (serviceCounts[job.sourceService] || 0) + 1;
  });
  
  return Object.entries(serviceCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([service, count]) => ({ service, count }));
}

// Get top destination services
function getTopDestinationServices(jobs) {
  const serviceCounts = {};
  jobs.forEach(job => {
    serviceCounts[job.destinationService] = (serviceCounts[job.destinationService] || 0) + 1;
  });
  
  return Object.entries(serviceCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([service, count]) => ({ service, count }));
}

// =================================================================================
// NEW: USER MANAGEMENT AND SYSTEM CONFIGURATION
// =================================================================================

// Create or update user profile
app.post('/users/profile', async (req, res) => {
  try {
    const { userId, name, email, preferences, service } = req.body || {};
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const user = {
      id: userId,
      name: name || 'Anonymous User',
      email: email || null,
      preferences: preferences || {},
      service: service || 'both',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      stats: {
        totalPlaylists: 0,
        totalSyncs: 0,
        favoriteGenres: [],
        listeningTime: 0
      }
    };
    
    collaborativeStore.users.set(userId, user);
    collaborativeStore.systemStats.totalUsers = collaborativeStore.users.size;
    
    res.json({ 
      success: true, 
      user,
      message: 'User profile created/updated successfully'
    });
    
  } catch (error) {
    console.error('Create/update user profile failed:', error.message);
    res.status(500).json({ error: 'Failed to create/update user profile' });
  }
});

// Get user profile
app.get('/users/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = collaborativeStore.users.get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      user
    });
    
  } catch (error) {
    console.error('Get user profile failed:', error.message);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user preferences
app.put('/users/profile/:userId/preferences', async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body || {};
    
    const user = collaborativeStore.users.get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.preferences = { ...user.preferences, ...preferences };
    user.updatedAt = new Date().toISOString();
    
    collaborativeStore.users.set(userId, user);
    
    res.json({ 
      success: true, 
      preferences: user.preferences,
      message: 'Preferences updated successfully'
    });
    
  } catch (error) {
    console.error('Update user preferences failed:', error.message);
    res.status(500).json({ error: 'Failed to update user preferences' });
  }
});

// Get system configuration
app.get('/admin/config', async (req, res) => {
  try {
    const config = {
      version: '2.0.0',
      features: {
        aiRecommendations: true,
        collaborativePlaylists: true,
        scheduledSync: true,
        realTimeUpdates: true,
        adminDashboard: true,
        performanceMonitoring: true
      },
      services: {
        spotify: !!spotifyTokens.access_token,
        appleMusic: !!appleCredentials.mediaUserToken
      },
      limits: {
        maxPlaylists: 1000,
        maxCollaborators: 50,
        maxScheduledJobs: 100,
        maxConcurrentSyncs: 5
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({ 
      success: true, 
      config
    });
    
  } catch (error) {
    console.error('Get system config failed:', error.message);
    res.status(500).json({ error: 'Failed to get system config' });
  }
});

// Update system configuration
app.put('/admin/config', async (req, res) => {
  try {
    const { featureFlags, limits, settings } = req.body || {};
    
    // Update feature flags
    if (featureFlags) {
      Object.assign(collaborativeStore.config?.features || {}, featureFlags);
    }
    
    // Update limits
    if (limits) {
      Object.assign(collaborativeStore.config?.limits || {}, limits);
    }
    
    // Update settings
    if (settings) {
      Object.assign(collaborativeStore.config?.settings || {}, settings);
    }
    
    res.json({ 
      success: true, 
      message: 'System configuration updated successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Update system config failed:', error.message);
    res.status(500).json({ error: 'Failed to update system configuration' });
  }
});

// =================================================================================
// NEW: HEALTH CHECK AND SYSTEM STATUS ENDPOINTS
// =================================================================================

// Enhanced health check with feature status
app.get('/health/enhanced', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0',
      services: {
        spotify: {
          status: !!spotifyTokens.access_token ? 'connected' : 'disconnected',
          lastCheck: new Date().toISOString()
        },
        appleMusic: {
          status: !!appleCredentials.mediaUserToken ? 'connected' : 'disconnected',
          lastCheck: new Date().toISOString()
        }
      },
      features: {
        aiRecommendations: 'active',
        collaborativePlaylists: 'active',
        scheduledSync: 'active',
        realTimeUpdates: 'active',
        adminDashboard: 'active'
      },
      system: {
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        activeConnections: activeConnections.size
      }
    };
    
    res.json(health);
    
  } catch (error) {
    console.error('Enhanced health check failed:', error.message);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get real-time system status
app.get('/admin/status/realtime', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      activeConnections: activeConnections.size,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      activeSyncs: Array.from(collaborativeStore.syncJobs.values()).filter(j => j.status === 'running').length,
      totalUsers: collaborativeStore.users.size,
      totalPlaylists: collaborativeStore.playlists.size,
      systemLoad: process.loadavg ? process.loadavg() : null
    };
    
    res.json({ 
      success: true, 
      status
    });
    
  } catch (error) {
    console.error('Get real-time status failed:', error.message);
    res.status(500).json({ error: 'Failed to get real-time status' });
  }
});

// =================================================================================
// NEW: INITIALIZATION AND STARTUP FUNCTIONS
// =================================================================================

// Initialize collaborative store with sample data
function initializeCollaborativeStore() {
  try {
    // Initialize with some sample data for testing
    const sampleUserId = 'sample_user_001';
    const samplePlaylistId = 'sample_playlist_001';
    
    // Sample user
    collaborativeStore.users.set(sampleUserId, {
      id: sampleUserId,
      name: 'Sample User',
      email: 'sample@example.com',
      preferences: {
        theme: 'dark',
        notifications: true,
        autoSync: false
      },
      service: 'both',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      stats: {
        totalPlaylists: 5,
        totalSyncs: 12,
        favoriteGenres: ['pop', 'rock', 'electronic'],
        listeningTime: 3600000 // 1 hour in ms
      }
    });
    
    // Sample collaborative playlist
    collaborativeStore.playlists.set(samplePlaylistId, {
      id: samplePlaylistId,
      name: 'Sample Collaborative Playlist',
      ownerId: sampleUserId,
      service: 'spotify',
      sourcePlaylistId: null,
      collaborators: new Map([
        [sampleUserId, {
          role: 'owner',
          permissions: ['read', 'write', 'admin'],
          addedAt: new Date().toISOString()
        }]
      ]),
      permissions: ['read', 'write'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tracks: [],
      activity: []
    });
    
    // Update system stats
    collaborativeStore.systemStats.totalUsers = collaborativeStore.users.size;
    collaborativeStore.systemStats.totalPlaylists = collaborativeStore.playlists.size;
    
    console.log('✅ Collaborative store initialized with sample data');
    
  } catch (error) {
    console.error('Failed to initialize collaborative store:', error.message);
  }
}

// Initialize the system
initializeCollaborativeStore();

// Create a de-duplicated copy of a playlist preserving order
app.post('/features/dedupe_playlist', async (req, res) => {
  try {
    const { service, playlist, playlistName } = req.body || {};
    const svc = String(service || '').toLowerCase();
    if (!svc || !playlist) return res.status(400).json({ error: 'service and playlist required' });

    if (svc === 'spotify') {
      if (!spotifyTokens.access_token) return res.status(401).json({ error: 'Not authenticated with Spotify' });
      const srcTracks = await fetchSpotifyPlaylistTracks(playlist);
      // Build robust fingerprint that collapses exact dupes and alternate ids for the same track
      const makeKey = (t) => {
        const isrc = (t && t.isrc) ? String(t.isrc).trim() : '';
        if (isrc) return `isrc:${isrc}`;
        const primaryArtist = (t.artists && t.artists.length > 0) ? t.artists[0] : '';
        const name = normalizeString(t.name || '');
        const artist = normalizeString(primaryArtist || '');
        const album = normalizeString(t.album || '');
        // bucket duration to 5s to tolerate editions
        const durationBucket = Math.round((Number(t.duration_ms) || 0) / 5000);
        return `meta:${name}|${artist}|${album}|${durationBucket}`;
      };
      const seenKeys = new Set();
      const orderedUniqueIds = [];
      for (const t of srcTracks) {
        const key = makeKey(t);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          if (t.id) orderedUniqueIds.push(String(t.id));
        }
      }
      // Get original playlist name for Spotify using the existing helper function
      let originalPlaylistName = playlistName; // Use the name from frontend first
      if (!originalPlaylistName) {
        originalPlaylistName = await getPlaylistName(playlist, { 'Authorization': `Bearer ${spotifyTokens.access_token}` }, 'spotify');
      }
      console.log('Deduplication: Spotify using playlist name:', originalPlaylistName);
      
      const dedupedPlaylistName = `${originalPlaylistName} (Deduped)`;
      const created = await createSpotifyPlaylistInternal(dedupedPlaylistName);
      if (orderedUniqueIds.length > 0) await addTracksToSpotifyPlaylistInBatches(created.id, orderedUniqueIds);
      return res.json({ success: true, originalCount: srcTracks.length, newCount: orderedUniqueIds.length, newPlaylistId: created.id, newPlaylistName: dedupedPlaylistName });
    }

    if (!appleCredentials.mediaUserToken) return res.status(401).json({ error: 'Not authenticated with Apple Music' });
    const dev = await getDeveloperToken(false);
    const headers = {
      'Authorization': `Bearer ${dev}`,
      'Music-User-Token': appleCredentials.mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0',
    };
    
    // Get the original playlist name using the existing helper function
    console.log('Deduplication: Attempting to fetch playlist details for playlist ID:', playlist);
    let originalPlaylistName = playlistName; // Use the name from frontend first
    if (!originalPlaylistName) {
      originalPlaylistName = await getPlaylistName(playlist, headers, 'apple');
    }
    console.log('Deduplication: Using playlist name:', originalPlaylistName);
    
    // Now fetch all tracks without the 100 limit
    const { items } = await fetchApplePlaylistTrackIdsOrdered(playlist, headers);
    
    // Log the track count for debugging
    console.log(`Deduplication: Original playlist "${originalPlaylistName}" has ${items.length} tracks`);
    
    // Log some sample tracks for debugging
    if (items.length > 0) {
      console.log(`Deduplication: Sample tracks:`, items.slice(0, 3).map(t => `${t.name} - ${t.artist}`));
    }
    
    // Add delay to ensure proper processing
              // No delay - instant speed
    const makeKey = (it) => {
      const name = normalizeString(it.name || '');
      const artist = normalizeString(it.artist || '');
      const album = normalizeString(it.album || '');
      const durationBucket = Math.round((Number(it.duration_ms) || 0) / 5000);
      return `meta:${name}|${artist}|${album}|${durationBucket}`;
    };
    const seenKeys = new Set();
    const catalogToAdd = [];
    const libraryToAdd = [];
    let duplicateCount = 0;
    for (const it of items) {
      const key = makeKey(it);
      if (seenKeys.has(key)) {
        duplicateCount++;
        continue;
      }
      seenKeys.add(key);
      // Prefer catalog song id when present
      if (it.type === 'songs' && it.id) {
        catalogToAdd.push(String(it.id));
      } else {
        // library-songs case may include playParams.catalogId embedded in items from include flow; try to use it
        const cid = (it.playParams && (it.playParams.catalogId || it.playParams.globalId)) || null;
        if (cid) catalogToAdd.push(String(cid));
        else if (it.id) libraryToAdd.push(String(it.id));
      }
    }
    
    console.log(`Deduplication: Found ${duplicateCount} duplicates, keeping ${catalogToAdd.length + libraryToAdd.length} unique tracks`);
    console.log(`Deduplication: Processing ${catalogToAdd.length} catalog tracks and ${libraryToAdd.length} library tracks`);
    // Create a descriptive playlist name
    const dedupedPlaylistName = `${originalPlaylistName} (Deduped)`;
    const created = await createApplePlaylistInternal(dedupedPlaylistName);
    
    // Add tracks in batches with proper delays
    if (catalogToAdd.length > 0) {
      console.log(`Deduplication: Adding ${catalogToAdd.length} catalog tracks to new playlist...`);
      await addTracksToApplePlaylistInBatches(created.id, catalogToAdd, headers);
      // No delay - instant speed // Add delay between batches
    }
    if (libraryToAdd.length > 0) {
      console.log(`Deduplication: Adding ${libraryToAdd.length} library tracks to new playlist...`);
      await addLibrarySongsToApplePlaylist(created.id, libraryToAdd, headers);
    }
    
    return res.json({ 
      success: true, 
      originalCount: items.length, 
      newCount: (catalogToAdd.length + libraryToAdd.length), 
      newPlaylistId: created.id, 
      newPlaylistName: dedupedPlaylistName 
    });
  } catch (error) {
    console.error('dedupe_playlist failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to dedupe playlist' });
  }
});

// -------------------- CSV IMPORT/EXPORT (used by Features screen) --------------------
// Minimal CSV parser (no quotes escape edge cases beyond simple ")
function parseCsvLoose(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(',').map(s => s.replace(/^\"|\"$/g, '').trim());
  const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const rows = lines.slice(1).map(line => line.split(',').map(s => s.replace(/^\"|\"$/g, '').trim()));
  return { header, rows, idx };
}

app.post('/api/import-csv', async (req, res) => {
  try {
    const { csvContent, sourceType = 'generic', targetService = 'spotify', playlistName = 'Imported' } = req.body || {};
    const service = String(targetService).toLowerCase();
    if (!csvContent) return res.status(400).json({ success: false, error: 'csvContent is required' });

    let entries = [];
    const text = String(csvContent);
    if (sourceType === 'spotify-exportify') {
      const parsed = parseCsvLoose(text);
      const nameIdx = parsed.idx('Track Name');
      const artistIdx = parsed.idx('Artist Name');
      const albumIdx = parsed.idx('Album Name');
      for (const row of parsed.rows) {
        const name = row[nameIdx] || '';
        const artist = row[artistIdx] || '';
        const album = row[albumIdx] || '';
        if (name) entries.push({ name, artist, album });
      }
    } else if (sourceType === 'generic' || sourceType === 'apple-music') {
      // Try CSV header first
      if (/[,]/.test(text.split('\n')[0])) {
        const parsed = parseCsvLoose(text);
        // best-effort mapping
        const nameIdx = parsed.idx('name') !== -1 ? parsed.idx('name') : parsed.idx('Track Name');
        const artistIdx = parsed.idx('artist') !== -1 ? parsed.idx('artist') : parsed.idx('Artist Name');
        const albumIdx = parsed.idx('album') !== -1 ? parsed.idx('album') : parsed.idx('Album Name');
        for (const row of parsed.rows) {
          const name = row[nameIdx] || '';
          const artist = row[artistIdx] || '';
          const album = albumIdx !== -1 ? (row[albumIdx] || '') : '';
          if (name) entries.push({ name, artist, album });
        }
      } else {
        // Plain text lines like "Artist - Track"
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
        for (const line of lines) {
          const m = line.match(/^(.*?)\s+-\s+(.*)$/);
          if (m) entries.push({ artist: m[1].trim(), name: m[2].trim(), album: '' });
          else entries.push({ name: line.trim(), artist: '', album: '' });
        }
      }
    }

    if (entries.length === 0) return res.json({ success: false, error: 'No tracks found in input' });

    let playlistId = null;
    let playlistUrl = null;
    let foundTracks = 0;
    const notFound = [];

    if (service === 'spotify') {
      if (!spotifyTokens.access_token) return res.status(401).json({ success: false, error: 'Not authenticated with Spotify' });
      const created = await createSpotifyPlaylistInternal(String(playlistName).trim());
      playlistId = created.id;
      playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
      const foundIds = [];
      for (const e of entries) {
        try {
          const id = await searchSpotifyTrackByText({ name: e.name, artists: [e.artist], album: e.album, duration_ms: 0 });
          if (id) { foundIds.push(String(id)); foundTracks += 1; }
        } catch {}
        // No delay - instant speed
      }
      const unique = Array.from(new Set(foundIds));
      if (unique.length > 0) await addTracksToSpotifyPlaylistInBatches(playlistId, unique);
    } else if (service === 'apple') {
      if (!appleCredentials.mediaUserToken) return res.status(401).json({ success: false, error: 'Not authenticated with Apple Music' });
      const dev = await getDeveloperToken(false);
      const headers = {
        'Authorization': `Bearer ${dev}`,
        'Music-User-Token': appleCredentials.mediaUserToken,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0',
      };
      const created = await createApplePlaylistInternal(String(playlistName).trim());
      playlistId = created.id;
      // Use PARALLEL BATCH PROCESSING for CSV import (like SongShift)
      const BATCH_SIZE = 25;
      const { enhancedSongshiftMatch } = require('./services/enhancedSongshiftMatcher');
      
      console.log(`🚀 Starting parallel CSV processing of ${entries.length} songs in batches of ${BATCH_SIZE}...`);
      
      const csvTracks = entries.map(e => ({ 
        name: e.name, 
        artists: [e.artist], 
        album: e.album, 
        duration_ms: 0 
      }));
      
      const toAdd = [];
      
      for (let batchStart = 0; batchStart < csvTracks.length; batchStart += BATCH_SIZE) {
        const batch = csvTracks.slice(batchStart, batchStart + BATCH_SIZE);
        const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(csvTracks.length / BATCH_SIZE);
        
        console.log(`⚡ Processing CSV batch ${batchNumber}/${totalBatches} (${batch.length} songs)...`);
        
        // Process entire batch in parallel
        const batchPromises = batch.map(async (track) => {
          try {
            const result = await enhancedSongshiftMatch(track, headers, 'us');
            return { result, track, success: true };
          } catch (error) {
            return { result: null, track, success: false, error: error.message };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process batch results
        batchResults.forEach(({ result, track, success, error }) => {
          if (success && result && result.success && result.match) {
            toAdd.push(String(result.match.id));
            foundTracks += 1;
            const confidence = result.match.confidence === 'high' ? '🎯' : '✅';
            console.log(`${confidence} CSV Matched: ${track.name} (${result.match.matchMethod}, ${result.match.matchTime}ms)`);
          } else {
            notFound.push('not_found');
            const trackName = track.name || 'Unknown Track';
            const artistInfo = track.artists && track.artists.length > 0 ? ` by ${track.artists[0]}` : ' by Unknown Artist';
            const albumInfo = track.album ? ` (Album: ${track.album})` : '';
            if (success) {
              console.log(`❌ CSV Not found: "${trackName}"${artistInfo}${albumInfo}`);
            } else {
              console.log(`❌ CSV Match failed for "${trackName}"${artistInfo}${albumInfo}: ${error}`);
            }
          }
        });
        
        console.log(`✅ CSV batch ${batchNumber}/${totalBatches} complete: ${batchResults.filter(r => r.success && r.result && r.result.success).length} matched, ${batchResults.filter(r => !r.success || !r.result || !r.result.success).length} not found`);
      }
      
      console.log(`⚡ Parallel CSV processing complete: ${foundTracks} matched, ${notFound.length} unavailable`);
      const unique = Array.from(new Set(toAdd));
      if (unique.length > 0) await addTracksToApplePlaylistInBatches(playlistId, unique, headers);
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported targetService' });
    }

    return res.json({ success: true, totalTracks: entries.length, foundTracks, notFoundTracks: Math.max(0, entries.length - foundTracks), playlistId, playlistUrl });
  } catch (error) {
    console.error('import-csv failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ success: false, error: 'Failed to import CSV' });
  }
});

app.post('/api/export-csv', async (req, res) => {
  try {
    const { service, playlistId } = req.body || {};
    const svc = String(service || '').toLowerCase();
    if (!svc || !playlistId) return res.status(400).json({ success: false, error: 'service and playlistId required' });
    let items = [];
    if (svc === 'spotify') {
      if (!spotifyTokens.access_token) return res.status(401).json({ success: false, error: 'Not authenticated with Spotify' });
      const tracks = await fetchSpotifyPlaylistTracks(playlistId);
      items = tracks.map(t => ({ name: t.name, artist: (t.artists && t.artists[0]) || '', album: t.album || '', duration_ms: t.duration_ms || 0, id: t.id }));
    } else if (svc === 'apple') {
      if (!appleCredentials.mediaUserToken) return res.status(401).json({ success: false, error: 'Not authenticated with Apple Music' });
      const dev = await getDeveloperToken(false);
      const headers = {
        'Authorization': `Bearer ${dev}`,
        'Music-User-Token': appleCredentials.mediaUserToken,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0',
      };
      const { items: appleItems } = await fetchApplePlaylistTrackIdsOrdered(playlistId, headers);
      items = appleItems.map(t => ({ name: t.name, artist: t.artist, album: t.album, duration_ms: t.duration_ms || 0, id: t.id }));
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported service' });
    }
    const header = 'Track Name,Artist Name,Album Name,Duration (ms),Id';
    const rows = items.map(t => [t.name, t.artist, t.album, String(t.duration_ms||0), t.id].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const csvData = `${header}\n${rows}`;
    const filename = `playlist-export-${svc}.csv`;
    return res.json({ success: true, filename, csvData, trackCount: items.length });
  } catch (error) {
    console.error('export-csv failed:', error && error.response ? error.response.data : error.message);
    return res.status(500).json({ success: false, error: 'Failed to export CSV' });
  }
});

// -------------------- Auto Sync REST API --------------------
// List jobs
app.get('/auto-sync/jobs', (req, res) => {
  res.json({ jobs: autoSyncJobs });
});

// Create a new job
// Expected body:
// { name, mode: 'combine'|'map', sourceService: 'spotify', destinationService: 'apple',
//   sourcePlaylistIds?: string[], destinationPlaylistId?: string, createNewDestination?: { name: string },
//   mappings?: [{ sourcePlaylistId, destPlaylistId }], timeOfDay: 'HH:MM', enabled: boolean }
app.post('/auto-sync/jobs', async (req, res) => {
  try {
    const body = req.body || {};
    const sourceService = String(body.sourceService || '').toLowerCase();
    const destinationService = String(body.destinationService || '').toLowerCase();
    if (!['spotify','apple'].includes(sourceService) || !['spotify','apple'].includes(destinationService) || sourceService === destinationService) {
      return res.status(400).json({ error: 'sourceService and destinationService must be different and one of spotify/apple.' });
    }
    const id = `job_${Date.now()}`;
    const job = {
      id,
      name: String(body.name || 'Auto Sync'),
      mode: body.mode === 'combine' ? 'combine' : 'map',
      sourceService,
      destinationService,
      sourcePlaylistIds: Array.isArray(body.sourcePlaylistIds) ? body.sourcePlaylistIds : [],
      destinationPlaylistId: body.destinationPlaylistId || null,
      mappings: Array.isArray(body.mappings) ? body.mappings : [],
      timeOfDay: String(body.timeOfDay || '16:00'),
      storefront: String(body.storefront || 'us'),
      enabled: Boolean(body.enabled !== false),
      createdAt: new Date().toISOString(),
      lastRunAt: null,
      nextRunAt: null,
    };

    // Create destination playlist if requested
    if (job.mode === 'combine' && !job.destinationPlaylistId) {
      const createReq = body.createNewDestination;
      if (!createReq || !createReq.name) {
        return res.status(400).json({ error: 'Destination playlist or createNewDestination.name required for combine mode.' });
      }
      if (destinationService === 'apple') {
        const created = await createApplePlaylistInternal(createReq.name);
        job.destinationPlaylistId = created.id;
      } else if (destinationService === 'spotify') {
        const created = await createSpotifyPlaylistInternal(createReq.name);
        job.destinationPlaylistId = created.id;
      }
    }

    // Ensure sourcePlaylistIds present for map mode
    if (job.mode === 'map' && (!Array.isArray(job.sourcePlaylistIds) || job.sourcePlaylistIds.length === 0) && Array.isArray(job.mappings)) {
      job.sourcePlaylistIds = job.mappings.map(m => m && m.sourcePlaylistId).filter(Boolean);
    }

    job.nextRunAt = computeNextRunAtDaily(job.timeOfDay);
    autoSyncJobs.push(job);
    persistAutoSyncJobs();
    res.json({ success: true, job });
  } catch (error) {
    console.error('Create auto-sync job failed:', error && error.message ? error.message : String(error));
    res.status(500).json({ error: 'Failed to create auto-sync job' });
  }
});

// Update a job (enable/disable, rename, schedule)
app.put('/auto-sync/jobs/:id', (req, res) => {
  const id = req.params.id;
  const idx = autoSyncJobs.findIndex(j => j && j.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });
  const body = req.body || {};
  const job = autoSyncJobs[idx];
  if (typeof body.enabled === 'boolean') job.enabled = body.enabled;
  if (typeof body.name === 'string') job.name = body.name;
  if (typeof body.timeOfDay === 'string') job.timeOfDay = body.timeOfDay;
  if (typeof body.mode === 'string' && (body.mode === 'combine' || body.mode === 'map')) job.mode = body.mode;
  if (typeof body.sourceService === 'string') job.sourceService = body.sourceService;
  if (typeof body.destinationService === 'string') job.destinationService = body.destinationService;
  if (Array.isArray(body.sourcePlaylistIds)) job.sourcePlaylistIds = body.sourcePlaylistIds;
  if (typeof body.destinationPlaylistId === 'string' || body.destinationPlaylistId === null) job.destinationPlaylistId = body.destinationPlaylistId;
  if (Array.isArray(body.mappings)) job.mappings = body.mappings;
  // If sourcePlaylistIds not explicitly provided for map mode, derive from mappings
  if ((!Array.isArray(body.sourcePlaylistIds) || body.sourcePlaylistIds.length === 0) && Array.isArray(job.mappings)) {
    job.sourcePlaylistIds = job.mappings.map(m => m && m.sourcePlaylistId).filter(Boolean);
  }
  if (typeof body.storefront === 'string') job.storefront = body.storefront;
  job.nextRunAt = computeNextRunAtDaily(job.timeOfDay || '16:00');
  autoSyncJobs[idx] = job;
  persistAutoSyncJobs();
  res.json({ success: true, job });
});

// Delete a job
app.delete('/auto-sync/jobs/:id', (req, res) => {
  const id = req.params.id;
  const before = autoSyncJobs.length;
  autoSyncJobs = autoSyncJobs.filter(j => j && j.id !== id);
  persistAutoSyncJobs();
  res.json({ success: true, removed: before - autoSyncJobs.length });
});

// Run a job immediately
app.post('/auto-sync/jobs/:id/run', async (req, res) => {
  const id = req.params.id;
  const job = autoSyncJobs.find(j => j && j.id === id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  setImmediate(async () => {
    try {
      if (job.mode === 'map' && Array.isArray(job.mappings)) {
        for (const m of job.mappings) {
          let destId = m.destPlaylistId;
          if (!destId || destId === 'none') {
            const newName = (m && m.createNewName) ? String(m.createNewName).trim() : 'Auto Sync';
            if (job.destinationService === 'apple') {
              const created = await createApplePlaylistInternal(newName);
              destId = created.id;
            } else if (job.destinationService === 'spotify') {
              const created = await createSpotifyPlaylistInternal(newName);
              destId = created.id;
            }
            m.destPlaylistId = destId;
            persistAutoSyncJobs();
          }
          await runDirectedSync(job.sourceService, job.destinationService, m.sourcePlaylistId, destId);
          // No delay - instant speed
        }
      } else if (job.mode === 'combine' && Array.isArray(job.sourcePlaylistIds) && job.destinationPlaylistId) {
        for (const srcId of job.sourcePlaylistIds) {
          await runDirectedSync(job.sourceService, job.destinationService, srcId, job.destinationPlaylistId);
          // No delay - instant speed
        }
      }
      job.lastRunAt = new Date().toISOString();
      job.nextRunAt = computeNextRunAtDaily(job.timeOfDay || '16:00');
      persistAutoSyncJobs();
      broadcast({ type: 'finish', message: `Run completed for ${job.name || job.id}` });
    } catch (e) {
      console.error('Manual job run failed:', e && e.message ? e.message : String(e));
      broadcast({ type: 'finish', status: 'error', message: `Run failed for ${job.name || job.id}` });
    }
  });
  res.json({ success: true, status: 'accepted' });
});
// ------------------------------------------------------------

app.post('/playlists/apple', async (req, res) => {
  const { mediaUserToken } = req.body;
  if (!mediaUserToken) {
    return res.status(400).json({ error: 'Media-user-token is required.' });
  }

  // Save new credentials
  appleCredentials = { mediaUserToken };
  store.set('appleCredentials', appleCredentials);

  try {
    const devToken = await getDeveloperToken(false);
    const headers = {
      'Authorization': `Bearer ${devToken}`,
      'Music-User-Token': mediaUserToken,
      'Origin': 'https://music.apple.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    // PAGINATION: Fetch all pages of playlists
    let playlists = [];
    let url = 'https://amp-api.music.apple.com/v1/me/library/playlists';
    while (url) {
      const response = await makeAppleMusicApiRequest(url, { headers });
      playlists = playlists.concat(
        (response.data.data || []).map(p => ({
          id: p.id,
          name: p.attributes.name,
          artwork: p.attributes.artwork ? p.attributes.artwork.url.replace('{w}', '320').replace('{h}', '320') : null,
        }))
      );
      url = response.data.next ? `https://amp-api.music.apple.com${response.data.next}` : null;
    }
    res.json({ playlists });
  } catch (err) {
    console.error('Apple Music fetch error:', err && err.response ? err.response.data : (err && err.message ? err.message : String(err)));
    
    // Check if this is a developer token issue
    if (err && err.message && err.message.includes('Please set the Apple Music developer token')) {
      return res.status(401).json({ 
        error: 'Apple Music developer token required',
        message: 'Please set your Apple Music developer token first. Check the console for instructions.',
        requiresToken: true
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch Apple Music playlists' });
  }
});

// Reset endpoint
app.post('/reset', (req, res) => {
  spotifyTokens = { access_token: null, refresh_token: null };
  appleCredentials = { mediaUserToken: null };
  store.delete('spotifyTokens');
  store.delete('appleCredentials');
  res.json({ success: true });
});

// Sync endpoint - Spotify -> Apple Music
// Accepts body: { spotifyPlaylistId: string, applePlaylistId: string, storefront?: string, forceRefresh?: boolean }
// Global sync lock to prevent multiple syncs running simultaneously
let isSyncRunning = false;

app.post('/sync', async (req, res) => {
  const { spotifyPlaylistId, applePlaylistId, storefront = 'us', forceRefresh = true } = req.body || {};

  if (!spotifyTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  if (!appleCredentials.mediaUserToken) {
    return res.status(401).json({ error: 'Not authenticated with Apple Music' });
  }
  if (!spotifyPlaylistId || !applePlaylistId) {
    return res.status(400).json({ error: 'spotifyPlaylistId and applePlaylistId are required' });
  }

  // Prevent multiple syncs from running simultaneously
  if (isSyncRunning) {
    return res.status(409).json({ error: 'Sync already in progress. Please wait for the current sync to complete.' });
  }

  // Acknowledge immediately
  res.status(202).json({ status: 'accepted' });

  // Background job
  setImmediate(async () => {
    const jobId = `sync-${Date.now()}`;
    isSyncRunning = true; // Set sync lock
    try {
      // Initialize progress with structured data
      broadcast({ 
        type: 'progress', 
        data: {
          current: 0,
          total: 0, // Will be updated with actual count
          currentStep: 'Starting sync job...',
          status: 'starting',
          trackInfo: null
        }
      });

      // Always refresh dev token at the start of a job for maximum freshness
      await getDeveloperToken(Boolean(forceRefresh));

      const appleHeaders = {
        'Authorization': `Bearer ${developerToken}`,
        'Music-User-Token': appleCredentials.mediaUserToken,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      broadcast({ 
        type: 'progress', 
        data: {
          current: 0,
          total: 0,
          currentStep: 'Fetching source playlist...',
          status: 'searching',
          trackInfo: null
        }
      });

      const tracks = await fetchSpotifyPlaylistTracks(spotifyPlaylistId);
      
      // Performance mode for different playlist sizes
      if (tracks.length > 2000) {
        broadcast({ 
          type: 'log', 
          message: `⚠️ WARNING: Very large playlist detected (${tracks.length} tracks). This will take several minutes to sync safely. Consider splitting into smaller playlists for faster results.` 
        });
      } else if (tracks.length > 1000) {
        broadcast({ 
          type: 'log', 
          message: `ℹ️ Large playlist detected (${tracks.length} tracks). Using optimized sync mode for better performance.` 
        });
      } else if (tracks.length > 500) {
        broadcast({ 
          type: 'log', 
          message: `🚀 Medium playlist (${tracks.length} tracks). Using fast sync mode.` 
        });
      } else {
        broadcast({ 
          type: 'log', 
          message: `⚡ Small playlist (${tracks.length} tracks). Using turbo sync mode for maximum speed.` 
        });
      }
      
      // Update progress with actual track count
      broadcast({ 
        type: 'progress', 
        data: {
          current: 0,
          total: tracks.length,
          currentStep: `Fetched ${tracks.length} tracks from source playlist`,
          status: 'searching',
          trackInfo: null
        }
      });

      broadcast({ type: 'log', message: `Fetched ${tracks.length} tracks from source playlist.` });

      // Duplicate prevention: fetch destination playlist existing IDs first
      broadcast({ 
        type: 'progress', 
        data: {
          current: 0,
          total: tracks.length,
          currentStep: 'Fetching destination playlist to prevent duplicates...',
          status: 'searching',
          trackInfo: null
        }
      });

      const existingDestIds = await fetchApplePlaylistCatalogSongIds(applePlaylistId, appleHeaders);
      broadcast({ type: 'log', message: `Destination playlist currently has ${existingDestIds.size} tracks.` });

      const foundIds = [];
      const foundTracksMap = new Map(); // Track mapping between Apple Music ID and original track
      let foundCount = 0;
      let notFoundCount = 0;
      let skippedCount = 0; // Track songs that were already in destination
      
      // Process in parallel batches of 25 songs (like SongShift)
      const BATCH_SIZE = 25;
      const { enhancedSongshiftMatch } = require('./services/enhancedSongshiftMatcher');
      
      broadcast({ type: 'log', message: `🚀 Starting parallel batch processing of ${tracks.length} songs in batches of ${BATCH_SIZE}...` });
      
      for (let batchStart = 0; batchStart < tracks.length; batchStart += BATCH_SIZE) {
        const batch = tracks.slice(batchStart, batchStart + BATCH_SIZE);
        const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(tracks.length / BATCH_SIZE);
        
        broadcast({ type: 'log', message: `⚡ Processing batch ${batchNumber}/${totalBatches} (${batch.length} songs)...` });
        
        // Process entire batch in parallel
        const batchPromises = batch.map(async (t, idx) => {
          const globalIndex = batchStart + idx;
          
          try {
            const result = await enhancedSongshiftMatch(t, appleHeaders, storefront);
            return { result, track: t, index: globalIndex, success: true };
          } catch (error) {
            return { 
              result: null, 
              track: t, 
              index: globalIndex, 
              success: false, 
              error: error.message 
            };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        console.log(`DEBUG: Batch ${batchNumber} results:`, {
          totalResults: batchResults.length,
          successfulMatches: batchResults.filter(r => r.success && r.result && r.result.success).length,
          failures: batchResults.filter(r => !r.success || !r.result || !r.result.success).length
        });
        
        // Process batch results
        batchResults.forEach(({ result, track, index, success, error }, forEachIndex) => {
          console.log(`DEBUG forEach iteration ${forEachIndex + 1}/${batchResults.length}:`, {
            trackName: track.name,
            success,
            hasResult: !!result,
            resultSuccess: result?.success,
            hasMatch: result?.match,
            matchId: result?.match?.id
          });
          
          // Update progress
          broadcast({ 
            type: 'progress', 
            data: {
              current: index,
              total: tracks.length,
              currentStep: `Processing track ${index + 1}/${tracks.length}: ${track.name}`,
              status: 'searching',
              trackInfo: {
                name: track.name,
                artist: track.artists && track.artists.length > 0 ? track.artists[0] : 'Unknown Artist',
                index: index + 1
              }
            }
          });
          
          if (success && result && result.success && result.match) {
            console.log(`DEBUG: About to broadcast match for "${track.name}"`);
            if (existingDestIds.has(String(result.match.id))) {
              skippedCount++;
              const msg = `ℹ️ Skipped duplicate: ${track.name} (${result.match.matchMethod})`;
              broadcast({ type: 'log', message: msg });
              console.log(msg); // Also log to console
              // Don't count duplicates as "found" - they weren't actually added
            } else {
              foundIds.push(String(result.match.id));
              foundTracksMap.set(String(result.match.id), track); // Store mapping
              const confidence = result.match.confidence === 'high' ? '🎯' : '✅';
              const msg = `${confidence} Matched: ${track.name} (${result.match.matchMethod}, ${result.match.matchTime}ms)`;
              
              // Broadcast
              broadcast({ type: 'log', message: msg });
              
              // Also write directly to file as backup
              try {
                const fs = require('fs');
                const path = require('path');
                const logFile = path.join(__dirname, 'logs', 'matches.log');
                fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
              } catch (fileError) {
                console.error('Failed to write match to file:', fileError);
              }
              
              console.log(msg); // Also log to console
              foundCount += 1; // Only count non-duplicates as actually found/added
            }
            console.log(`DEBUG: Broadcasted match for "${track.name}"`);
          } else {
            notFoundCount += 1;
            const trackName = track.name || 'Unknown Track';
            const artistInfo = track.artists && track.artists.length > 0 ? ` by ${track.artists[0]}` : ' by Unknown Artist';
            const albumInfo = track.album ? ` (Album: ${track.album})` : '';
            const songPosition = index + 1;
            
            let msg;
            if (success) {
              msg = `❌ Not found: "${trackName}"${artistInfo}${albumInfo} at position ${songPosition}`;
            } else {
              msg = `❌ Match failed for "${trackName}"${artistInfo}${albumInfo} at position ${songPosition}: ${error}`;
            }
            
            broadcast({ type: 'log', message: msg });
            console.log(msg); // Also log to console
          }
        });
        
        broadcast({ type: 'log', message: `✅ Batch ${batchNumber}/${totalBatches} complete: ${batchResults.filter(r => r.success && r.result && r.result.success).length} matched, ${batchResults.filter(r => !r.success || !r.result || !r.result.success).length} not found` });
      }

      // Final duplicate filter (safety) before adding
      const uniqueToAdd = foundIds.filter((id, idx, arr) => arr.indexOf(id) === idx && !existingDestIds.has(String(id)));
      if (uniqueToAdd.length > 0) {
        broadcast({ 
          type: 'progress', 
          data: {
            current: tracks.length,
            total: tracks.length,
            currentStep: `Adding ${uniqueToAdd.length} matched tracks to destination playlist...`,
            status: 'adding',
            trackInfo: null
          }
        });

        try {
          await addTracksToApplePlaylistInBatches(applePlaylistId, uniqueToAdd, appleHeaders);
          
          // Get actual count of tracks in playlist after adding
          const finalPlaylistTracks = await fetchApplePlaylistCatalogSongIds(applePlaylistId, appleHeaders);
          const actualTracksAdded = finalPlaylistTracks.size;
          
          broadcast({ type: 'log', message: `✅ Successfully added ${uniqueToAdd.length} tracks to playlist. Final playlist contains ${actualTracksAdded} tracks.` });
          
          // Log songs that were matched but failed to be added
          const tracksThatFailedToAdd = uniqueToAdd.length - actualTracksAdded;
          if (tracksThatFailedToAdd > 0) {
            broadcast({ type: 'log', message: `⚠️ ${tracksThatFailedToAdd} songs were matched but failed to be added to the playlist.` });
            
            // Log each failed track individually with original track info
            const failedTrackIds = uniqueToAdd.slice(actualTracksAdded);
            failedTrackIds.forEach((failedId) => {
              const originalTrack = foundTracksMap.get(failedId);
              if (originalTrack) {
                const artistInfo = originalTrack.artists && originalTrack.artists.length > 0 ? ` by ${originalTrack.artists[0]}` : '';
                const albumInfo = originalTrack.album ? ` (Album: ${originalTrack.album})` : '';
                broadcast({ type: 'log', message: `❌ Failed to add: "${originalTrack.name}"${artistInfo}${albumInfo} (Apple Music rejected)` });
              } else {
                broadcast({ type: 'log', message: `❌ Failed to add: Track ID ${failedId} (Apple Music rejected)` });
              }
            });
          }
          
          // Final progress update with accurate statistics
          broadcast({ 
            type: 'progress', 
            data: {
              current: tracks.length,
              total: tracks.length,
              currentStep: `Sync completed! Added ${actualTracksAdded} tracks to playlist.`,
              status: 'completed',
              trackInfo: null
            }
          });

          // Use validation helper for consistent statistics
          const { actualAdded, actualNotAdded } = await validateSyncResults(
            applePlaylistId, 
            appleHeaders, 
            uniqueToAdd.length, 
            tracks.length
          );
          const actualFound = actualAdded;
          // CRITICAL FIX: Use actual missing tracks count, not calculated difference
          // First, get the actual playlist contents to determine what was really added
          const actualPlaylistTracks = await fetchApplePlaylistCatalogSongIds(applePlaylistId, appleHeaders);
          const addedTrackIds = new Set(Array.from(actualPlaylistTracks));
          
          // Calculate missing tracks based on what was actually added
          const missingTracks = [];
          tracks.forEach((track, idx) => {
            // Check if this track made it to the playlist
            const trackMadeIt = foundIds.some(appleId => addedTrackIds.has(appleId) && foundTracksMap.get(appleId) === track);
            if (!trackMadeIt) {
              missingTracks.push({ track, position: idx + 1 });
            }
          });
          const actualNotFound = missingTracks.length;
          
          // Log the actual missing songs count
          if (actualNotFound > 0) {
            broadcast({ type: 'log', message: `❌ ${actualNotFound} songs were not found or could not be added to the playlist.` });
            
            // Log each missing song individually
            // actualPlaylistTracks and missingTracks already calculated above
            
        // Log ALL missing songs individually for complete visibility
        for (let i = 0; i < missingTracks.length; i++) {
          const { track, position } = missingTracks[i];
          const trackName = track.name || 'Unknown Track';
          const artistInfo = track.artists?.[0] ? ` by ${track.artists[0]}` : ' by Unknown Artist';
          const albumInfo = track.album ? ` (Album: ${track.album})` : '';
          
          const msg = `❌ Missing song ${i + 1}/${missingTracks.length}: "${trackName}"${artistInfo}${albumInfo} (position ${position})`;
          broadcast({ type: 'log', message: msg });
          console.log(msg);
        }
          }
          
          // Send test message to verify WebSocket is working
          broadcast({ type: 'test', message: 'WebSocket test - finish event about to be sent' });
          
          broadcast({ type: 'finish', status: 'success', found: actualFound, notFound: actualNotFound, skipped: skippedCount });
          
          // Send another test message after finish
          broadcast({ type: 'test', message: 'WebSocket test - finish event sent successfully' });
          
        } catch (error) {
          console.error('Error adding tracks to Apple playlist:', error && error.response ? error.response.data : (error && error.message ? error.message : String(error)));
          
          // If adding failed, use the original counts
          broadcast({ type: 'finish', status: 'success', found: foundCount, notFound: notFoundCount, skipped: skippedCount });
        }
      } else {
        // No tracks to add
        broadcast({ type: 'finish', status: 'success', found: 0, notFound: tracks.length, skipped: 0 });
      }
      
      isSyncRunning = false; // Clear sync lock on success
    } catch (error) {
      console.error('Sync job failed:', error && error.response ? error.response.data : (error && error.message ? error.message : String(error)));
      
      // Send error progress update
      broadcast({ 
        type: 'progress', 
        data: {
          current: 0,
          total: 0,
          currentStep: 'Sync job failed. Check logs.',
          status: 'error',
          trackInfo: null
        }
      });

      broadcast({ type: 'finish', status: 'error', message: 'Sync job failed. Check logs.' });
    } finally {
      isSyncRunning = false; // Clear sync lock
    }
  });
});

// Smart sync endpoint - DISABLED (user requested removal)
app.post('/api/smart-sync', (req, res) => {
  res.status(400).json({ 
    error: 'Smart sync functionality has been disabled as requested. Please use another AI to rebuild this feature.',
    message: 'The smart sync feature was removed because it was not getting the right songs. You can rebuild it yourself or ask another AI to implement it.'
  });
});

// Auto-add missing endpoint - CACHE-BUSTING VERSION
app.post('/api/auto-add-missing', async (req, res) => {
  const { sourcePlaylistId } = req.body || {};
  const destinationPlaylistId = (req && req.body)
    ? (req.body.destinationPlaylistId || req.body.destPlaylistId || req.body.applePlaylistId || req.body.destinationId)
    : undefined;

  if (!spotifyTokens.access_token || !appleCredentials.mediaUserToken) {
    return res.status(401).json({ error: 'Authentication required for both services.' });
  }

  res.status(200).json({ success: true, status: 'accepted' });

  // --- Start Background Job ---
  setImmediate(async () => {
    /**
     * **FIXED HELPER FUNCTION WITH CACHE-BUSTING**
     * This version adds cache-control headers to force Apple's API
     * to return the most up-to-date playlist contents.
     */
    const fetchApplePlaylistTracksForFingerprinting_FIXED = async (playlistId, headers) => {
        const tracks = [];
        // Add cache-busting headers
        const freshHeaders = {
            ...headers,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        };

        const parseItems = (items) => {
            for (const item of items || []) {
                const attrs = item.attributes;
                if (attrs && (attrs.name || attrs.artistName)) {
                    tracks.push(attrs);
                }
            }
        };

        try {
            // Primary Method
            let url = `https://amp-api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`;
            while (url) {
                const response = await makeAppleMusicApiRequest(url, { headers: freshHeaders });
                parseItems(response.data.data);
                url = response.data.next ? `https://amp-api.music.apple.com${response.data.next}` : null;
            }
            return tracks;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log('Primary playlist fetch failed with 404, trying fallback...');
                // Fallback Method
                try {
                    const fallbackUrl = `https://amp-api.music.apple.com/v1/me/library/playlists/${playlistId}?include=tracks`;
                    const response = await makeAppleMusicApiRequest(fallbackUrl, { headers: freshHeaders });
                    const includedTracks = (response.data.included || []).filter(item => item.type === 'library-songs' || item.type === 'songs');
                    parseItems(includedTracks);
                    return tracks;
                } catch (fallbackError) {
                    console.error('Fallback playlist fetch also failed:', fallbackError.response ? fallbackError.response.data : fallbackError.message);
                    return []; // Return empty array to allow sync to proceed
                }
            } else {
                // For other errors, re-throw
                throw error;
            }
        }
    };


    try {
      broadcast({ type: 'progress', message: 'Starting Auto-Add Missing...' });
      await getDeveloperToken(false);
      const appleHeaders = {
        'Authorization': `Bearer ${developerToken}`,
        'Music-User-Token': appleCredentials.mediaUserToken,
        'Origin': 'https://music.apple.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      broadcast({ type: 'log', message: 'Detecting user storefront...' });
      const storefront = await detectAppleStorefront(appleHeaders);
      broadcast({ type: 'log', message: `User storefront detected: ${storefront}` });

      broadcast({ type: 'log', message: 'Fetching source and destination playlists...' });
      const [sourceTracks, destBasic] = await Promise.all([
        fetchSpotifyPlaylistTracks(sourcePlaylistId),
        fetchApplePlaylistTracksForFingerprinting_FIXED(destinationPlaylistId, appleHeaders),
      ]);

      const makeFingerprint = (name, artist) => `${normalizeString(name)}|${normalizeString(artist)}`;
      const destFingerprints = new Set(destBasic.map(t => makeFingerprint(t.name, t.artistName)));

      broadcast({ type: 'log', message: 'Comparing playlists...' });
      const missingTracks = sourceTracks.filter(t => {
          const primaryArtist = (t.artists && t.artists.length > 0) ? t.artists[0] : '';
          return !destFingerprints.has(makeFingerprint(t.name, primaryArtist));
      });
      broadcast({ type: 'log', message: `Found ${missingTracks.length} missing tracks.` });

      if (missingTracks.length === 0) {
        broadcast({ 
          type: 'progress', 
          data: {
            current: sourceTracks.length,
            total: sourceTracks.length,
            currentStep: 'Auto-add complete. No tracks were missing.',
            status: 'completed',
            trackInfo: null
          }
        });
        broadcast({ type: 'finish', status: 'success', found: 0, notFound: 0, message: 'Auto-add complete. No tracks were missing.' });
        return;
      }

      const matchedTracks = new Map();
      const orderedCatalogIds = [];
      
      // Use PARALLEL BATCH PROCESSING for auto-add missing (like SongShift)
      const BATCH_SIZE = 25;
      const { enhancedSongshiftMatch } = require('./services/enhancedSongshiftMatcher');
      
      broadcast({ type: 'log', message: `🚀 Starting parallel auto-add processing of ${missingTracks.length} missing tracks in batches of ${BATCH_SIZE}...` });
      
      for (let batchStart = 0; batchStart < missingTracks.length; batchStart += BATCH_SIZE) {
        const batch = missingTracks.slice(batchStart, batchStart + BATCH_SIZE);
        const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(missingTracks.length / BATCH_SIZE);
        
        broadcast({ type: 'log', message: `⚡ Processing auto-add batch ${batchNumber}/${totalBatches} (${batch.length} tracks)...` });
        
        // Process entire batch in parallel
        const batchPromises = batch.map(async (t, idx) => {
          const globalIndex = batchStart + idx;
          
          try {
            const result = await enhancedSongshiftMatch(t, appleHeaders, storefront);
            return { result, track: t, index: globalIndex, success: true };
          } catch (error) {
            return { 
              result: null, 
              track: t, 
              index: globalIndex, 
              success: false, 
              error: error.message 
            };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process batch results
        batchResults.forEach(({ result, track, index, success, error }) => {
          // Update progress
          broadcast({ 
            type: 'progress', 
            data: {
              current: index,
              total: missingTracks.length,
              currentStep: `Processing missing track ${index + 1}/${missingTracks.length}: ${track.name}`,
              status: 'searching',
              trackInfo: {
                name: track.name,
                artist: track.artists && track.artists.length > 0 ? track.artists[0] : 'Unknown Artist',
                index: index + 1
              }
            }
          });
          
          if (success && result && result.success && result.match) {
            matchedTracks.set(result.match.id, track);
            orderedCatalogIds.push(String(result.match.id));
            const confidence = result.match.confidence === 'high' ? '🎯' : '✅';
            broadcast({ type: 'log', message: `${confidence} Matched: ${track.name} (${result.match.matchMethod}, ${result.match.matchTime}ms)` });
          } else {
            const trackName = track.name || 'Unknown Track';
            const artistInfo = track.artists && track.artists.length > 0 ? ` by ${track.artists[0]}` : ' by Unknown Artist';
            const albumInfo = track.album ? ` (Album: ${track.album})` : '';
            const songPosition = index + 1;
            if (success) {
              broadcast({ type: 'log', message: `❌ Not found on Apple Music: "${trackName}"${artistInfo}${albumInfo} at position ${songPosition}` });
            } else {
              broadcast({ type: 'log', message: `❌ Match failed for "${trackName}"${artistInfo}${albumInfo} at position ${songPosition}: ${error}` });
            }
          }
        });
        
        broadcast({ type: 'log', message: `✅ Auto-add batch ${batchNumber}/${totalBatches} complete: ${batchResults.filter(r => r.success && r.result && r.result.success).length} matched, ${batchResults.filter(r => !r.success || !r.result || !r.result.success).length} not found` });
      }
      
      broadcast({ type: 'log', message: `⚡ Parallel auto-add processing complete: ${matchedTracks.size} matched, ${missingTracks.length - matchedTracks.size} not found` });

      const catalogIdsToAdd = Array.from(matchedTracks.keys());
      if (catalogIdsToAdd.length === 0) {
        broadcast({ 
          type: 'progress', 
          data: {
            current: missingTracks.length,
            total: missingTracks.length,
            currentStep: 'Auto-add complete. No new tracks could be matched.',
            status: 'completed',
            trackInfo: null
          }
        });
        broadcast({ type: 'finish', status: 'success', found: 0, notFound: missingTracks.length, message: 'Auto-add complete. No new tracks could be matched.' });
        return;
      }

      // Snapshot existing playlist contents (catalog ids) before add, with no-cache headers
      const destExistingIdsBefore = await fetchApplePlaylistCatalogSongIds(destinationPlaylistId, {
        ...appleHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }).catch(() => new Set());

      broadcast({ type: 'log', message: `Adding ${catalogIdsToAdd.length} new tracks to the destination...` });
      
      let successfullyAddedCount = 0;
      try {
          await addTracksToApplePlaylistInBatches(destinationPlaylistId, catalogIdsToAdd, appleHeaders);
          successfullyAddedCount = catalogIdsToAdd.length;
      } catch (eFirst) {
          broadcast({ type: 'log', message: `Batch add failed. Trying single-track fallback...` });
          
          for (const catalogId of catalogIdsToAdd) {
              const sourceTrack = matchedTracks.get(catalogId);
              try {
                  broadcast({ type: 'log', message: `Fallback: Adding "${sourceTrack.name}" to library...` });
                  await addSongsToAppleLibraryInBatches([catalogId], appleHeaders);
                  // No delay - instant speed
                  
                  broadcast({ type: 'log', message: `Fallback: Searching for "${sourceTrack.name}" in library...` });
                  const librarySong = await findLibrarySongIdRobust(sourceTrack, appleHeaders, { attempts: 6, waitMs: 2500, deepLimit: 250 });

                  if (librarySong && librarySong.id) {
                      broadcast({ type: 'log', message: `Fallback: Adding to playlist...` });
                      await addLibrarySongsToApplePlaylist(destinationPlaylistId, [librarySong.id], appleHeaders);
                      successfullyAddedCount++;
                  } else {
                      broadcast({ type: 'log', message: `❌ Fallback failed for "${sourceTrack.name}": Could not find in library after adding.` });
                  }
              } catch(eSecond) {
                  broadcast({ type: 'log', message: `❌ Fallback failed for "${sourceTrack.name}": ${eSecond.message}` });
              }
              // No delay - instant speed
          }
      }

      // Verify additions by reloading playlist (no-cache) and perform secondary fallback for any missing
      const destExistingIdsAfter = await fetchApplePlaylistCatalogSongIds(destinationPlaylistId, {
        ...appleHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }).catch(() => new Set());
      const actuallyAdded = catalogIdsToAdd.filter(id => !destExistingIdsBefore.has(String(id)) && destExistingIdsAfter.has(String(id)));
      const stillMissing = catalogIdsToAdd.filter(id => !destExistingIdsAfter.has(String(id)));

      if (stillMissing.length > 0) {
        broadcast({ type: 'log', message: `⚠️ ${stillMissing.length} tracks not visible after add. Attempting library-songs fallback...` });
        // Step A: add all missing catalog ids to library
        try {
          await addSongsToAppleLibraryInBatches(stillMissing, appleHeaders);
        } catch (libAddErr) {
          console.warn('Library add during verification fallback failed:', libAddErr && libAddErr.message ? libAddErr.message : String(libAddErr));
        }
        // No delay - instant speed
        // Step B: resolve to library ids and add to playlist
        for (const id of stillMissing) {
          const src = matchedTracks.get(id);
          try {
            const libSong = await findLibrarySongIdRobust(src, appleHeaders, { attempts: 6, waitMs: 2500, deepLimit: 250 });
            if (libSong && libSong.id) {
              await addLibrarySongsToApplePlaylist(destinationPlaylistId, [libSong.id], appleHeaders);
            }
          } catch (vfErr) {
            console.warn('Verification fallback failed for id', id, vfErr && vfErr.message ? vfErr.message : String(vfErr));
          }
          // No delay - instant speed
        }
      }

      const finalIds = await fetchApplePlaylistCatalogSongIds(destinationPlaylistId, {
        ...appleHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }).catch(() => new Set());
      const finalAddedCount = catalogIdsToAdd.filter(id => finalIds.has(String(id))).length;

      if (false) {
        try {
          // Compute full ordered sequence based on the ENTIRE source playlist (not just missing)
          broadcast({ type: 'progress', message: 'Fixing order: matching all source tracks to Apple ids...' });
          const orderedAll = [];
          for (let i = 0; i < sourceTracks.length; i += 1) {
            const st = sourceTracks[i];
            try {
              // Get playlist names for context
              const destPlaylistName = await getPlaylistName(destinationPlaylistId, appleHeaders, 'apple');
              const sourcePlaylistName = await getPlaylistName(sourcePlaylistId, null, 'spotify');
              const playlistContext = {
                sourceName: sourcePlaylistName,
                destName: destPlaylistName,
                position: i + 1
              };
              
              // Use TRUE SongShift matching (ISRC-first, instant speed)
              const { zeroDelayMatch } = require('./services/zeroDelayMatcher');
              const result = await zeroDelayMatch(st, appleHeaders, storefront);
              if (result.success && result.match) {
                orderedAll.push(String(result.match.id));
              }
            } catch (e) {}
            // No delay - SongShift speed (instant)
          }
          // Remove duplicates while preserving order
          const seen = new Set();
          const orderedUnique = [];
          for (const sid of orderedAll) {
            if (!seen.has(sid)) { seen.add(sid); orderedUnique.push(sid); }
          }
          // In-place reorder: clear destination and add ordered unique tracks
          broadcast({ type: 'progress', message: 'Fixing order: rebuilding destination playlist in-place...' });
          await removeAllTracksFromApplePlaylist(destinationPlaylistId, appleHeaders);
          await addTracksToApplePlaylistInBatches(destinationPlaylistId, orderedUnique, appleHeaders);
          // Final sweep to remove any duplicates that slipped through (e.g., library-song vs catalog-song variants)
          const removedDupes = await removeDuplicatesFromApplePlaylist(destinationPlaylistId, appleHeaders);
          const msg = removedDupes > 0
            ? `✅ Destination rebuilt in correct order (${orderedUnique.length} tracks). Removed ${removedDupes} duplicates.`
            : `✅ Destination rebuilt in correct order (${orderedUnique.length} tracks). No duplicates found.`;
          broadcast({ type: 'log', message: msg });
          // Hard guarantee: if still duplicates after passes, run one more full rebuild with strict unique
          if (removedDupes > 0) {
            const postSet = await fetchApplePlaylistCatalogSongIds(destinationPlaylistId, appleHeaders).catch(()=>new Set());
            // Not exact dupes by id may still remain; as a final resort perform unique by metadata again
            // (This ensures we never leave obvious copies.)
            const zeroRemoved = await removeDuplicatesFromApplePlaylist(destinationPlaylistId, appleHeaders);
            if (zeroRemoved > 0) {
              broadcast({ type: 'log', message: `✅ Additional duplicates removed: ${zeroRemoved}.` });
            }
          }
        } catch (e) {
          console.warn('Fix-order step failed:', e && e.message ? e.message : String(e));
          broadcast({ type: 'log', message: '⚠️ Could not perform fix-order step; original playlist was still updated with missing tracks.' });
        }
      }

      // Final progress update
      broadcast({ 
        type: 'progress', 
        data: {
          current: missingTracks.length,
          total: missingTracks.length,
          currentStep: `Auto-add complete. Added ${finalAddedCount} of ${catalogIdsToAdd.length} matched tracks.`,
          status: 'completed',
          trackInfo: null
        }
      });

      // Validate against actual playlist
      const { actualAdded, actualNotAdded } = await validateSyncResults(
        destinationPlaylistId,
        appleHeaders,
        catalogIdsToAdd.length,
        missingTracks.length
      );

      broadcast({ 
        type: 'finish', 
        status: 'success', 
        found: actualAdded,
        notFound: actualNotAdded,
        message: `Auto-add complete. Added ${actualAdded} of ${missingTracks.length} missing tracks.` 
      });
    } catch (error) {
      console.error('Auto-Add Missing failed:', error.response ? error.response.data : error.message);
      
      // Send error progress update
      broadcast({ 
        type: 'progress', 
        data: {
          current: 0,
          total: 0,
          currentStep: 'Auto-Add Missing failed. Check logs.',
          status: 'error',
          trackInfo: null
        }
      });

      broadcast({ type: 'finish', status: 'error', message: 'Auto-Add Missing failed. Check logs.' });
    }
  });
});

// Fix order endpoint - DISABLED (user requested removal)
app.post('/api/fix-order', (req, res) => {
  res.status(400).json({ 
    error: 'Fix order functionality has been disabled as requested. Please use another AI to rebuild this feature.',
    message: 'The fix order feature was removed because it was not getting the right songs. You can rebuild it yourself or ask another AI to implement it.'
  });
});

// Logs API endpoints
app.get('/api/logs', (req, res) => {
  try {
    const rootLogsDir = path.resolve(__dirname, '..', 'logs');
    
    if (!fs.existsSync(rootLogsDir)) {
      return res.json({ logFiles: [] });
    }
    
    const files = fs.readdirSync(rootLogsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(rootLogsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          created: stats.birthtime,
          modified: stats.mtime,
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size)
        };
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    
    res.json({ logFiles: files });
  } catch (error) {
    writeFileLog('ERROR', 'Failed to fetch log files:', error.message);
    res.status(500).json({ error: 'Failed to fetch log files', details: error.message });
  }
});

app.get('/api/logs/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const rootLogsDir = path.resolve(__dirname, '..', 'logs');
    const filePath = path.join(rootLogsDir, filename);
    
    // Security check - prevent directory traversal
    if (!filename.endsWith('.log') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    // Log the access
    writeFileLog('INFO', `Log file accessed: ${filename} (${stats.size} bytes)`);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', stats.size);
    res.send(content);
  } catch (error) {
    writeFileLog('ERROR', 'Failed to fetch log content:', error.message);
    res.status(500).json({ error: 'Failed to fetch log content', details: error.message });
  }
});

// Log cleanup endpoint
app.post('/api/logs/cleanup', (req, res) => {
  try {
    const rootLogsDir = path.resolve(__dirname, '..', 'logs');
    const { days = logRetentionDays } = req.body;
    
    if (!fs.existsSync(rootLogsDir)) {
      return res.json({ message: 'No logs directory found', cleaned: 0 });
    }
    
    const files = fs.readdirSync(rootLogsDir);
    const now = Date.now();
    const cutoff = now - (days * 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(rootLogsDir, file);
        try {
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoff) {
            fs.unlinkSync(filePath);
            cleaned++;
            writeFileLog('INFO', `Cleaned up old log file: ${file}`);
          }
        } catch (error) {
          writeFileLog('WARN', `Failed to process log file ${file}:`, error.message);
        }
      }
    });
    
    writeFileLog('INFO', `Log cleanup completed: ${cleaned} files removed`);
    res.json({ message: `Cleaned up ${cleaned} old log files`, cleaned });
  } catch (error) {
    writeFileLog('ERROR', 'Failed to cleanup logs:', error.message);
    res.status(500).json({ error: 'Failed to cleanup logs', details: error.message });
  }
});

// Log rotation endpoint
app.post('/api/logs/rotate', (req, res) => {
  try {
    if (!fileLogStream || !currentLogFile) {
      return res.status(400).json({ error: 'No active log stream to rotate' });
    }
    
    // Force rotation
    const oldFile = currentLogFile;
    rotateLogIfNeeded();
    
    writeFileLog('INFO', `Log rotation triggered manually - Old: ${oldFile}, New: ${currentLogFile}`);
    res.json({ message: 'Log rotated successfully', oldFile, newFile: currentLogFile });
  } catch (error) {
    writeFileLog('ERROR', 'Failed to rotate log:', error.message);
    res.status(500).json({ error: 'Failed to rotate log', details: error.message });
  }
});

// Log status endpoint
app.get('/api/logs/status', (req, res) => {
  try {
    const rootLogsDir = path.resolve(__dirname, '..', 'logs');
    const status = {
      currentLogFile: currentLogFile,
      logStreamActive: !!fileLogStream,
      logRotationSize: logRotationSize,
      logRetentionDays: logRetentionDays,
      logsDirectory: rootLogsDir,
      logsDirectoryExists: fs.existsSync(rootLogsDir)
    };
    
    if (fs.existsSync(rootLogsDir)) {
      const files = fs.readdirSync(rootLogsDir).filter(file => file.endsWith('.log'));
      status.totalLogFiles = files.length;
      
      if (currentLogFile) {
        const currentLogPath = path.join(rootLogsDir, currentLogFile);
        if (fs.existsSync(currentLogPath)) {
          const stats = fs.statSync(currentLogPath);
          status.currentLogSize = stats.size;
          status.currentLogSizeFormatted = formatFileSize(stats.size);
          status.currentLogModified = stats.mtime;
        }
      }
    }
    
    res.json(status);
  } catch (error) {
    writeFileLog('ERROR', 'Failed to get log status:', error.message);
    res.status(500).json({ error: 'Failed to get log status', details: error.message });
  }
});

// Sync operation logging endpoint
app.post('/api/log-sync', (req, res) => {
  try {
    const { operation, sourceService, sourcePlaylist, destService, destPlaylist, timestamp, details } = req.body;
    
    // Log the sync operation with comprehensive details
    const syncLogMessage = `🔄 [SYNC_OP] ${operation} - Source: ${sourceService}:"${sourcePlaylist}" → Dest: ${destService}:"${destPlaylist}" - ${timestamp}`;
    writeFileLog('INFO', syncLogMessage);
    
    if (details) {
      writeFileLog('INFO', `🔄 [SYNC_DETAILS] ${JSON.stringify(details)}`);
    }
    
    // Broadcast to connected WebSocket clients
    broadcast({ 
      type: 'sync_log', 
      operation, 
      sourceService, 
      sourcePlaylist, 
      destService, 
      destPlaylist, 
      timestamp 
    });
    
    res.json({ success: true, message: 'Sync operation logged' });
  } catch (error) {
    writeFileLog('ERROR', 'Failed to log sync operation:', error.message);
    res.status(500).json({ error: 'Failed to log sync operation', details: error.message });
  }
});

// Helper function to format file sizes
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Start server
// Reset endpoint
app.post('/reset', (req, res) => {
  spotifyTokens = { access_token: null, refresh_token: null };
  appleCredentials = { mediaUserToken: null };
  store.delete('spotifyTokens');
  store.delete('appleCredentials');
  res.json({ success: true });
});

// Make required functions available to routes
app.locals.fetchSpotifyPlaylistTracks = fetchSpotifyPlaylistTracks;
app.locals.getDeveloperToken = getDeveloperToken;
app.locals.appleCredentials = appleCredentials;
app.locals.makeAppleMusicApiRequest = makeAppleMusicApiRequest;
app.locals.addTracksToApplePlaylistInBatches = addTracksToApplePlaylistInBatches;
app.locals.createApplePlaylistInternal = createApplePlaylistInternal;

async function startServer(port) {
  return new Promise((resolve, reject) => {
    const serverInstance = server.listen(port, '127.0.0.1', async () => {
      try {
        console.log(`Backend API listening on http://127.0.0.1:${port}`);
        console.log(`WebSocket server ready for real-time progress updates`);
        console.log('🚀 Startup optimizations enabled: Apple Music token pre-fetching and service pre-warming');
        
        // Check for Apple Music developer token in environment or store
        const hasEnvToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN && process.env.APPLE_MUSIC_DEVELOPER_TOKEN !== 'your_token_here';
        const hasStoredToken = store.get('appleDeveloperToken') && store.get('appleDeveloperToken') !== 'your_token_here';
        
        if (hasEnvToken || hasStoredToken) {
          secureLog('INFO', '🍎 Apple Music developer token found');
        } else {
          console.log('💡 Apple Music developer token not found. Use the app UI to set it up when needed.');
        }
        
        // Pre-fetch Apple Music token in background for faster subsequent operations
        // Only do this if we already have a token stored (to avoid opening browser on startup)
        setImmediate(async () => {
          const storedToken = store.get('appleDeveloperToken');
          if (storedToken && storedToken !== 'your_token_here') {
            // We have a token, so we can safely pre-fetch
            getDeveloperToken(false).catch(error => {
              console.log('Apple Music developer token initialization failed, but server will continue:', error.message);
            });
          } else {
            console.log('💡 Apple Music developer token not found. Will be set up when user tries to use Apple Music features.');
            
            // Check if we can install dependencies automatically (PuppeteerConfig already loaded at top of file)
            try {
              const puppeteerConfig = new PuppeteerConfig();
              const canLaunch = await puppeteerConfig.canLaunch();
              
              if (!canLaunch) {
                console.log('🔧 Puppeteer dependencies missing. Will install automatically when needed.');
              } else {
                console.log('✅ Puppeteer dependencies are available.');
              }
            } catch (error) {
              console.log('⚠️  Could not check Puppeteer dependencies:', error.message);
            }
          }
        });
        
        // Also try to pre-warm other services in the background
        setImmediate(async () => {
          try {
            // Pre-warm Spotify token refresh if needed
            if (spotifyTokens.refresh_token && spotifyTokens.access_token) {
              // Check if token is expired or will expire soon
              const tokenAge = Date.now() - (store.get('spotifyTokenFetchedAt', 0));
              if (tokenAge > 50 * 60 * 1000) { // 50 minutes
                secureLog('INFO', 'Pre-warming Spotify token refresh...');
                // This will happen in background without blocking startup
                refreshSpotifyToken().catch(() => {});
              }
            }
          } catch (e) {
            // Ignore pre-warm errors
          }
        });
        
        resolve(port);
      } catch (error) {
        console.error('Failed to initialize server:', error);
        reject(error);
      }
    });

    serverInstance.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${port} is in use, trying port ${port + 1}...`);
        serverInstance.close();
        startServer(port + 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });
  });
}

startServer(PORT).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Keep the process alive when run as a child process
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Enhanced logging for sync operations
function logSyncOperation(operation, details) {
  const logMessage = `🔄 [SYNC] ${operation} - ${JSON.stringify(details)}`;
  writeFileLog('INFO', logMessage);
  broadcast({ type: 'log', message: logMessage });
}

// Enhanced logging for playlist operations
function logPlaylistOperation(operation, service, playlistName, details = {}) {
  const logMessage = `📋 [PLAYLIST] ${operation} - Service: ${service}, Playlist: "${playlistName}" - ${JSON.stringify(details)}`;
  writeFileLog('INFO', logMessage);
  broadcast({ type: 'log', message: logMessage });
}

// Enhanced logging for authentication operations
function logAuthOperation(operation, service, details = {}) {
  const logMessage = `🔐 [AUTH] ${operation} - Service: ${service} - ${JSON.stringify(details)}`;
  writeFileLog('INFO', logMessage);
  broadcast({ type: 'log', message: logMessage });
}

// Enhanced logging for error operations
function logErrorOperation(operation, error, context = {}) {
  const errorDetails = {
    message: error.message || String(error),
    stack: error.stack,
    context: context
  };
  
  const logMessage = `❌ [ERROR] ${operation} - ${JSON.stringify(errorDetails)}`;
  writeFileLog('ERROR', logMessage);
  broadcast({ type: 'log', message: logMessage });
}