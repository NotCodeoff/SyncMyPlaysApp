const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { fork, spawn } = require('child_process');

let backendProcess = null;
let backendServer = null;
let mainWindow = null;

// Ensure only a single instance of the app runs
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance is already running; exit this one immediately
  app.quit();
} else {
  // Focus the existing window when a second instance is launched
  app.on('second-instance', (_event, _argv, _workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Sensitive data patterns to mask
const SENSITIVE_PATTERNS = [
  // Tokens and credentials
  /(access_token|refresh_token|mediaUserToken|developerToken|client_secret|client_id)["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
  /(Bearer|Token|Authorization)["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
  /(password|secret|key|credential)["\s]*[:=]["\s]*([^"'\s,}]+)/gi,
  // File paths that might reveal system structure
  /([A-Za-z]:\\[^"'\s,}]+|\\[^"'\s,}]+)/g,
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
          // For patterns with capture groups, mask the sensitive part
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

// Enhanced logging function with security sanitization
function logToFile(level, message, data = null) {
  const timestamp = new Date().toISOString();
  
  // Sanitize the message and data
  const sanitizedMessage = sanitizeData(message);
  const sanitizedData = data ? sanitizeData(data) : null;
  
  const logEntry = {
    timestamp,
    level,
    message: sanitizedMessage,
    data: sanitizedData
  };
  
  // Console output (sanitized)
  if (level === 'ERROR') {
    console.error(`[${timestamp}] [${level}] ${sanitizedMessage}`, sanitizedData || '');
  } else {
    console.log(`[${timestamp}] [${level}] ${sanitizedMessage}`, sanitizedData || '');
  }
  
  // File output (sanitized)
  try {
    const logsDir = app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'logs')
      : path.join(__dirname, '../logs');
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const logFile = path.join(logsDir, 'main-process.log');
    const logLine = `[${timestamp}] [${level}] ${sanitizedMessage}${sanitizedData ? ' ' + JSON.stringify(sanitizedData) : ''}\n`;
    
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

function startBackend() {
  const isDev = !app.isPackaged;
  
  if (isDev) {
    // In development, use the working backend from Backup 5
    const backendEntry = path.join(__dirname, '../backend/index.js');
    logToFile('INFO', 'Starting working backend from:', backendEntry);
    
    backendProcess = fork(backendEntry, [], {
      cwd: path.dirname(path.dirname(backendEntry)), // Set cwd to backend directory
      env: { ...process.env, NODE_ENV: 'development' }
    });

    backendProcess.on('error', (err) => {
      logToFile('ERROR', 'Failed to start working backend process:', err);
    });

    backendProcess.on('exit', (code, signal) => {
      logToFile('INFO', `Working backend process exited with code ${code} and signal ${signal}`);
    });
  } else {
    // In production, run the compiled backend executable
    logToFile('INFO', 'Starting compiled backend executable...');
    
    try {
      // Set up environment for backend
      process.env.NODE_ENV = 'production';
      
      // Determine the correct executable name based on platform
      const platform = process.platform;
      let executableName = 'server';
      
      if (platform === 'win32') {
        executableName = 'server.exe';
      }
      
      // Path to the compiled backend executable in unpacked resources
      const backendExecutable = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-backend', executableName);
      const backendDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-backend');
      
      logToFile('INFO', 'Backend executable path:', backendExecutable);
      logToFile('INFO', 'Backend working directory:', backendDir);
      
      // Check if backend executable exists
      if (!fs.existsSync(backendExecutable)) {
        logToFile('ERROR', 'Backend executable not found at:', backendExecutable);
        console.error('Backend executable not found at:', backendExecutable);
        
        // List contents of the directory to debug
        try {
          const dirContents = fs.readdirSync(backendDir);
          logToFile('INFO', 'Contents of backend directory:', dirContents);
          console.log('Contents of backend directory:', dirContents);
        } catch (dirError) {
          logToFile('ERROR', 'Could not read backend directory:', dirError.message);
          console.error('Could not read backend directory:', dirError.message);
        }
        
        throw new Error('Backend executable not found');
      }
      
      logToFile('INFO', 'Backend executable found and verified');
      console.log('Backend executable found and verified');
      
      // Spawn the compiled backend executable directly
      backendProcess = spawn(backendExecutable, [], {
        cwd: backendDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        env: { ...process.env, NODE_ENV: 'production' }
      });
      
      backendProcess.stdout.on('data', (data) => {
        logToFile('BACKEND', data.toString());
        console.log('BACKEND:', data.toString()); // Also log to console for debugging
      });
      
      backendProcess.stderr.on('data', (data) => {
        logToFile('BACKEND_ERROR', data.toString());
        console.error('BACKEND_ERROR:', data.toString()); // Also log to console for debugging
      });
      
      backendProcess.on('close', (code) => {
        logToFile('INFO', 'Backend process exited with code:', code);
        console.log('Backend process exited with code:', code);
      });
      
      backendProcess.on('error', (error) => {
        logToFile('ERROR', 'Backend process error:', error.message);
        console.error('Backend process error:', error.message);
      });
      
      logToFile('INFO', 'Backend started successfully with PID:', backendProcess.pid);
      console.log('Backend started successfully with PID:', backendProcess.pid);
      
      // Wait a moment for backend to fully initialize
      setTimeout(() => {
        logToFile('INFO', 'Backend initialization complete, ready for frontend connections');
        console.log('Backend initialization complete, ready for frontend connections');
      }, 2000);
      
    } catch (error) {
      logToFile('ERROR', 'Failed to start backend:', error.message);
      logToFile('ERROR', 'Stack trace:', error.stack);
      console.error('Failed to start backend:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  const htmlPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
    : path.join(__dirname, '../dist/index.html');
  
  let preloadPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'app.asar', 'src', 'preload.js')
    : path.join(__dirname, 'preload.js');
  
  logToFile('INFO', 'Loading HTML file from:', htmlPath);
  logToFile('INFO', 'Preload script path:', preloadPath);
  
  // Check if preload script exists and find fallback if needed
  if (app.isPackaged && !fs.existsSync(preloadPath)) {
    logToFile('ERROR', 'Preload script not found at:', preloadPath);
    console.error('Preload script not found at:', preloadPath);
    
    // Try alternative path as fallback
    const fallbackPreloadPath = path.join(process.resourcesPath, 'app.asar', 'src', 'preload.js');
    if (fs.existsSync(fallbackPreloadPath)) {
      logToFile('INFO', 'Using fallback preload script path:', fallbackPreloadPath);
      preloadPath = fallbackPreloadPath;
    } else {
      logToFile('ERROR', 'Fallback preload script also not found at:', fallbackPreloadPath);
      console.error('Fallback preload script also not found at:', fallbackPreloadPath);
      // Use the original path anyway - let Electron handle the error gracefully
    }
  } else {
    logToFile('INFO', 'Preload script found and verified');
    console.log('Preload script found and verified');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'SyncMyPlays',
    icon: app.isPackaged 
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'icon.ico')
      : path.join(__dirname, '../build/icon.ico'),
    frame: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  mainWindow.loadFile(htmlPath)
    .then(() => {
      logToFile('INFO', 'HTML file loaded successfully');
    })
    .catch((error) => {
      logToFile('ERROR', 'Failed to load HTML file:', error);
    });

  mainWindow.setMenuBarVisibility(false);

  // Add error handling for window events
  mainWindow.on('closed', () => {
    logToFile('INFO', 'Main window closed');
  });

  mainWindow.on('unresponsive', () => {
    logToFile('INFO', 'Main window became unresponsive');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logToFile('ERROR', 'Failed to load URL:', validatedURL, 'Error:', errorDescription);
  });

  mainWindow.webContents.on('crashed', (event, killed) => {
    logToFile('ERROR', 'Web contents crashed, killed:', killed);
  });

  // DevTools disabled - console will not open automatically

  // Disable DevTools in production
  if (process.env.NODE_ENV === 'production') {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
        event.preventDefault();
      }
      if ((input.control || input.meta) && input.key.toLowerCase() === 'f12') {
        event.preventDefault();
      }
    });
  }
}

// IPC handlers for custom title bar controls
ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('enter-fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(true);
});

ipcMain.handle('exit-fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(false);
});

function verifyAsarIntegrity() {
  try {
    const asarPath = path.join(process.resourcesPath, 'app.asar');
    const hashFilePath = path.join(process.resourcesPath, 'app.asar.sha256');
    if (!fs.existsSync(asarPath) || !fs.existsSync(hashFilePath)) return;
    const expectedHash = fs.readFileSync(hashFilePath, 'utf8').trim();
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(asarPath);
    hash.update(data);
    const actualHash = hash.digest('hex');
    if (expectedHash !== actualHash) {
      logToFile('ERROR', 'Integrity Check Failed: The application files have been tampered with or corrupted. Please reinstall SyncMyPlays.');
      // Removed error dialog - app will continue running
    }
  } catch (e) {
    // Fail open if any error (for dev convenience)
  }
}

// Call before verifyAsarIntegrity and app startup
(async () => {
  verifyAsarIntegrity();
})();

app.whenReady().then(() => {
  logToFile('INFO', 'Electron app is ready, starting backend...');
  startBackend();
      // Get backend port from environment or use default (backend uses port 8000)
      const backendPort = process.env.PORT || process.env.BACKEND_PORT || 8000;
      
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https://*.mzstatic.com https://*.scdn.co https://*.spotifycdn.com https://*.spotifycdn.com https://*.blobstore.apple.com",
              `connect-src 'self' http://127.0.0.1:${backendPort} ws://127.0.0.1:${backendPort}`
        ].join('; ')
      }
    });
  });

  createWindow();
});

// IPC handler for opening URLs in the default browser
ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

// IPC handler for creating Apple Music webview
ipcMain.handle('open-apple-music-webview', (event, url) => {
  return new Promise((resolve, reject) => {
    const webviewWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Apple Music Authentication',
      parent: mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      }
    });

    webviewWindow.loadURL(url);

    // Handle successful authentication
    webviewWindow.webContents.on('did-navigate', (event, navigationUrl) => {
      // Check if we're on a success page or if we can extract the token
      if (navigationUrl.includes('music.apple.com') && navigationUrl.includes('success')) {
        // Try to extract cookies or tokens
        webviewWindow.webContents.session.cookies.get({ url: 'https://music.apple.com' })
          .then(cookies => {
            const mediaUserToken = cookies.find(cookie => cookie.name === 'media-user-token');
            if (mediaUserToken) {
              resolve({ success: true, token: mediaUserToken.value });
              webviewWindow.close();
            }
          })
          .catch(err => {
            console.error('Error getting cookies:', err);
          });
      }
    });

    // Handle window close
    webviewWindow.on('closed', () => {
      resolve({ success: false, cancelled: true });
    });

    // Handle errors
    webviewWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      reject(new Error(`Failed to load: ${errorDescription}`));
    });
  });
});

app.on('window-all-closed', () => {
  logToFile('INFO', 'All windows closed');
  if (process.platform !== 'darwin') {
    logToFile('INFO', 'Quitting app (non-macOS)');
    app.quit();
  }
});

app.on('before-quit', () => {
  logToFile('INFO', 'App before-quit event triggered');
  stopBackend();
});

app.on('quit', () => {
  logToFile('INFO', 'App quit event triggered');
  stopBackend();
});

process.on('exit', () => {
  logToFile('INFO', 'Process exit event triggered');
  stopBackend();
});

process.on('SIGINT', () => {
  logToFile('INFO', 'Process SIGINT event triggered');
  stopBackend();
  process.exit();
});

process.on('SIGTERM', () => {
  logToFile('INFO', 'Process SIGTERM event triggered');
  stopBackend();
  process.exit();
});

app.on('activate', () => {
  logToFile('INFO', 'App activate event triggered');
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 