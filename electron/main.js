const { app, BrowserWindow, ipcMain, dialog, shell, Menu, powerMonitor, protocol } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs-extra');
const { exec } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

// Import Secure Console and Logger
let secureConsole, secureLogger;
try {
  secureConsole = require('./secureConsole');
  secureLogger = require('./secureLogger');
} catch (error) {
  console.error('Failed to load secure logging:', error.message);
  // Create a fallback logger
  secureLogger = {
    logStartup: async () => console.log('Secure logger not available'),
    logLoginAttempt: async () => console.log('Secure logger not available'),
    logToolUsage: async () => console.log('Secure logger not available'),
    logSecurityEvent: async () => console.log('Secure logger not available'),
    logShutdown: async () => console.log('Secure logger not available'),
    logError: async () => console.log('Secure logger not available')
  };
  // Fallback to regular console if secure console not available
  secureConsole = console;
}

// Configuration
let config;
try {
  config = require('./config');
} catch (error) {
  secureConsole.error('Failed to load config file:', error.message);
  secureConsole.debug('Trying alternative config paths...');
  
  // Try alternative config paths
  const possibleConfigPaths = [
    './config',
    '../config',
    path.join(__dirname, 'config'),
    path.join(__dirname, '../config')
  ];
  
  for (const configPath of possibleConfigPaths) {
    try {
      config = require(configPath);
      secureConsole.debug('Successfully loaded config from:', configPath);
      break;
    } catch (configError) {
      secureConsole.debug('Failed to load config from:', configPath, configError.message);
    }
  }
  
  if (!config) {
    secureConsole.warn('Creating default config...');
    config = {
      APP_VERSION: '1.0.0',
      UPDATE_URLS: {
        versionCheck: process.env.UPDATE_VERSION_URL || 'https://example.com/version_status.txt',
        downloadUrl: process.env.UPDATE_DOWNLOAD_URL || 'https://example.com/syncmyplays.exe'
      }
    };
  }
}

// Global variables
let mainWindow;
let backendProcess = null;
const isDev = !app.isPackaged;
let welcomeNotificationSent = false;

// Global process tracking for cleanup
global.childProcesses = new Set();

// Override child_process.exec to track processes
const originalExec = require('child_process').exec;
require('child_process').exec = function(...args) {
  const child = originalExec.apply(this, args);
  global.childProcesses.add(child);
  
  child.on('exit', () => {
    global.childProcesses.delete(child);
  });
  
  return child;
};

// Override child_process.spawn to track processes
const originalSpawn = require('child_process').spawn;
require('child_process').spawn = function(...args) {
  const child = originalSpawn.apply(this, args);
  global.childProcesses.add(child);
  
  child.on('exit', () => {
    global.childProcesses.delete(child);
  });
  
  return child;
};

// App configuration
const APP_VERSION = config.APP_VERSION;
const APPLICATION_NAME = 'SyncMyPlays';
const APPLICATION_APP_ID = 'com.syncmyplays.app';
const KILL_SWITCH_URL = process.env.KILL_SWITCH_URL || "https://example.com/kill_switch.txt";
const VERSION_URL = process.env.VERSION_URL || "https://example.com/version_status.txt";

function resolveAppIconPath() {
  const candidatePaths = [
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'public', 'favicon.ico')
  ];

  for (const candidate of candidatePaths) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (_) {
      // ignore
    }
  }
  return undefined;
}

// Create main window
function createWindow() {
  console.log('Creating main window...');
  
  // Debug preload script path
  const preloadPath = path.join(__dirname, 'preload.js');
  secureConsole.debug('Preload script path:', preloadPath);
  secureConsole.debug('Preload script exists:', fs.existsSync(preloadPath));
  
  const iconPath = resolveAppIconPath();
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
      devTools: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hidden',
    title: APPLICATION_NAME
  };
  if (iconPath) {
    windowOptions.icon = iconPath;
  }
  mainWindow = new BrowserWindow(windowOptions);
  
  // Remove application menu to hide any Inspect options
  try {
    Menu.setApplicationMenu(null);
  } catch (_) {}

  console.log('Window created, loading app...');

  // Load the app - Always load from dist/ (works in both dev and production)
  console.log('Loading app from dist/...');

  try {
    // Try multiple paths to find index.html
    const candidatePaths = [
      path.join(app.getAppPath(), 'dist', 'index.html'),        // Production (ASAR)
      path.join(__dirname, '..', 'dist', 'index.html'),         // Development
      path.join(process.cwd(), 'dist', 'index.html'),           // Alternative dev
      path.join(__dirname, '..', '..', 'dist', 'index.html')    // From electron/ folder
    ];

    let chosenIndexPath = null;

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        chosenIndexPath = candidatePath;
        console.log('✅ Found index.html at:', candidatePath);
        break;
      }
    }

    if (chosenIndexPath) {
      if (app.isPackaged) {
        console.log('📂 Loading secure custom protocol: app://index.html');
        mainWindow.loadURL('app://index.html');
      } else {
        // Normalize for Windows and load with file:// URL in development
        const fileUrl = url.pathToFileURL(chosenIndexPath).toString();
        console.log('📂 Loading file URL (dev):', fileUrl);
        mainWindow.loadURL(fileUrl);
      }
    } else {
      console.error('❌ index.html not found at any expected locations:', candidatePaths);
      // Force a visible error page to avoid a blank window
      mainWindow.loadURL(
        'data:text/html,<html><body style="background:#1a1a1a;color:#fff;font-family:sans-serif;">' +
          '<h2>Failed to locate index.html</h2>' +
          '<p>Searched paths:</p>' +
          '<ul>' + candidatePaths.map(p => '<li>' + p + '</li>').join('') + '</ul>' +
          '<p>Please run: npm run build</p>' +
        '</body></html>'
      );
    }
  } catch (resolveError) {
    console.error('Error while resolving index.html:', resolveError);
    mainWindow.loadURL(
      'data:text/html,<html><body style="background:#1a1a1a;color:#fff;font-family:sans-serif;">' +
        '<h2>Error loading application</h2>' +
        '<p>Please check the logs for details.</p>' +
      '</body></html>'
    );
  }

  // Show window when ready - FAST
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show, displaying...');
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback: Show window after a shorter timeout for faster startup
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Fallback: Showing window after timeout');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1000);

  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load app:', errorCode, errorDescription);
    console.error('Error details:', { errorCode, errorDescription });
    
    // Show window anyway so user can see the error
    mainWindow.show();
    mainWindow.focus();
    
    // Try to load a fallback page or show error
    if (errorCode === -6) { // ERR_FILE_NOT_FOUND
      console.error('File not found error - this is likely a path resolution issue');
      // Try to load a simple error page
      mainWindow.loadURL('data:text/html,<html><body><h1>Error Loading App</h1><p>Failed to load the application. Please check the console for details.</p></body></html>');
    }
  });

  // Handle load success
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('App loaded successfully');
  });

  // Handle DOM ready
  mainWindow.webContents.on('dom-ready', () => {
    console.log('DOM ready, window should be visible now');
  });

  // Handle window focus
  mainWindow.on('focus', () => {
    console.log('Window focused');
  });

  // Handle window blur
  mainWindow.on('blur', () => {
    console.log('Window blurred');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Kill backend when window is closed
    stopBackend();
  });

  // Security: Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Security: Disable navigation
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Security: Disable new window creation
  mainWindow.webContents.on('new-window', (event) => {
    event.preventDefault();
  });

  // DevTools enabled for debugging
  // Allow Ctrl+Shift+I and F12 to open DevTools
}

// Backend management (Vitality-style: NO pkg compilation, direct fork)
function startBackend() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('🔍 [DIAGNOSTIC] BACKEND STARTUP INITIATED');
  console.log('═══════════════════════════════════════════════════════');
  
  const isDev = !app.isPackaged;
  console.log('📊 [DIAGNOSTIC] Environment:', {
    isDev,
    isPackaged: app.isPackaged,
    platform: process.platform,
    nodeVersion: process.version,
    electronVersion: process.versions.electron
  });
  
  // Dynamically choose an available backend port (avoid blocking on 8000 conflicts)
  const net = require('net');
  let backendPort = parseInt(process.env.PORT, 10);
  const candidatePorts = [];
  if (!Number.isFinite(backendPort)) backendPort = 8000;
  // Try a small range to avoid user prompts when ports are occupied
  for (let p = backendPort; p < backendPort + 16; p++) candidatePorts.push(p);

  function findFreePort(index = 0) {
    if (index >= candidatePorts.length) {
      console.error('❌ [DIAGNOSTIC] No free backend port found in candidate range');
      dialog.showErrorBox('Backend Port Error', 'No free backend port found. Please close other apps and restart.');
      return;
    }

    const portToTry = candidatePorts[index];
    const testServer = net.createServer();
    
    testServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ [DIAGNOSTIC] Port ${portToTry} in use, trying next...`);
        testServer.close();
        findFreePort(index + 1);
      } else {
        console.error('❌ [DIAGNOSTIC] Port check error:', err.message);
      testServer.close();
        findFreePort(index + 1);
      }
    });
    
    testServer.once('listening', () => {
      backendPort = portToTry;
      console.log(`✅ [DIAGNOSTIC] Selected backend port: ${backendPort}`);
      testServer.close(() => {
        setTimeout(() => {
          startBackendProcess(backendPort);
        }, 50);
      });
    });
    
    testServer.listen(portToTry, '127.0.0.1');
  }
  
  function startBackendProcess(selectedPort) {
    
    // Determine backend entry point
    let backendEntry;
    let backendCwd;
    
    if (isDev) {
      // Development: use backend from project root
      backendEntry = path.join(__dirname, '..', 'backend', 'index.js');
      backendCwd = path.join(__dirname, '..');
      console.log('🔧 [DIAGNOSTIC] DEV MODE: Backend path:', backendEntry);
      secureConsole.info('🔧 DEV MODE: Starting backend from:', backendEntry);
    } else {
    // Production: MUST use app.asar.unpacked for backend (can't fork from inside ASAR!)
    backendEntry = path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'index.js');
    backendCwd = path.join(process.resourcesPath, 'app.asar.unpacked', 'backend');
    
    // Fallback paths if unpacked structure is different
    const fallbackPaths = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'index.js'),
      path.join(process.resourcesPath, 'backend', 'index.js'),
      path.join(__dirname, '..', 'backend', 'index.js')
    ];
    
    // Try to find the backend entry point
    if (!fs.existsSync(backendEntry)) {
      secureConsole.warn('Backend not found at primary path, trying fallbacks...');
      for (const fallbackPath of fallbackPaths) {
        if (fs.existsSync(fallbackPath)) {
          backendEntry = fallbackPath;
          backendCwd = path.dirname(backendEntry);
          secureConsole.info('✅ Found backend at fallback:', backendEntry);
          break;
        }
      }
    }
    
    secureConsole.info('📦 PRODUCTION MODE: Starting backend from:', backendEntry);
  }
  
    // Verify backend exists
    console.log('🔍 [DIAGNOSTIC] Checking if backend file exists...');
    const backendExists = fs.existsSync(backendEntry);
    console.log('📁 [DIAGNOSTIC] Backend file exists:', backendExists);
    console.log('📁 [DIAGNOSTIC] Backend full path:', backendEntry);
    console.log('📁 [DIAGNOSTIC] Backend working directory:', backendCwd);
    
    if (!backendExists) {
      console.error('❌ [DIAGNOSTIC] CRITICAL: Backend entry point not found!');
      console.error('📁 [DIAGNOSTIC] Searched path:', backendEntry);
      console.error('💡 [DIAGNOSTIC] This will prevent the app from working!');
      secureConsole.error('❌ Backend entry point not found:', backendEntry);
      dialog.showErrorBox('Backend Not Found', `Backend file not found at: ${backendEntry}\n\nThe application cannot start without the backend.`);
      return;
    }
    
    console.log('✅ [DIAGNOSTIC] Backend file verified');
    secureConsole.info('✅ Backend entry point verified');
    secureConsole.info('📁 Backend working directory:', backendCwd);
    
    // Start backend using fork (works in both dev and production)
    try {
      console.log('🚀 [DIAGNOSTIC] Forking backend process...');
      backendProcess = require('child_process').fork(backendEntry, [], {
        cwd: backendCwd,
        env: { 
          ...process.env, 
          NODE_ENV: isDev ? 'development' : 'production',
          PORT: String(selectedPort)
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });
      
      console.log('✅ [DIAGNOSTIC] Backend process forked with PID:', backendProcess.pid);
      
      // Handle backend stdout
      if (backendProcess.stdout) {
        backendProcess.stdout.on('data', (data) => {
          console.log('[BACKEND]', data.toString().trim());
        });
      }
      
      // Handle backend stderr
      if (backendProcess.stderr) {
        backendProcess.stderr.on('data', (data) => {
          console.error('[BACKEND ERROR]', data.toString().trim());
        });
      }
      
      // Handle backend messages
      backendProcess.on('message', (message) => {
        console.log('📨 [DIAGNOSTIC] Backend IPC message:', message);
        secureConsole.info('📨 Backend message:', message);
      });
      
      backendProcess.on('error', (err) => {
        console.error('❌ [DIAGNOSTIC] Backend process error:', err.message);
        console.error('Stack:', err.stack);
        secureConsole.error('❌ Backend process error:', err.message);
      });
      
      backendProcess.on('exit', (code, signal) => {
        console.log(`⚠️ [DIAGNOSTIC] Backend process exited - code: ${code}, signal: ${signal}`);
        secureConsole.info(`🛑 Backend process exited with code ${code} and signal ${signal}`);
        backendProcess = null;
      });
      
      secureConsole.info('✅ Backend started successfully with PID:', backendProcess.pid);
      console.log('✅ [DIAGNOSTIC] Backend started successfully with PID:', backendProcess.pid);
      
      // Health check after 2 seconds
      setTimeout(() => {
        console.log('🔍 [DIAGNOSTIC] Performing backend health check...');
        const http = require('http');
        
        const healthReq = http.get(`http://127.0.0.1:${selectedPort}/health`, (res) => {
          console.log('✅ [DIAGNOSTIC] Backend health check PASSED - Status:', res.statusCode);
          console.log('✅ [DIAGNOSTIC] Backend is responding to HTTP requests');
        });
        
        healthReq.on('error', (err) => {
          console.error('❌ [DIAGNOSTIC] Backend health check FAILED:', err.message);
          console.error('💡 [DIAGNOSTIC] Backend may have crashed or failed to start');
          console.error('💡 [DIAGNOSTIC] Check backend logs for errors');
        });
        
        healthReq.setTimeout(5000, () => {
          console.error('❌ [DIAGNOSTIC] Backend health check TIMEOUT');
          console.error('💡 [DIAGNOSTIC] Backend is not responding within 5 seconds');
          healthReq.destroy();
        });
        
        secureConsole.info('🚀 Backend initialization complete, ready for frontend connections');
        console.log('🚀 [DIAGNOSTIC] Backend initialization complete');
      }, 2000);
      
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] CRITICAL: Failed to fork backend process');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      secureConsole.error('❌ Failed to start backend:', error.message);
      dialog.showErrorBox('Backend Start Failed', `Failed to start backend: ${error.message}`);
    }
  }
  
  // Start dynamic port selection and backend startup
  findFreePort();
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// Version parsing and comparison helpers
function parseVersionStatus(rawText) {
  try {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // If only one line, treat it as the status (active/inactive)
    if (lines.length === 1) {
      return { latestVersion: APP_VERSION, status: lines[0].toLowerCase() };
    }

    // If two or more lines, first is version, second is status
    return { latestVersion: lines[0], status: (lines[1] || 'active').toLowerCase() };
  } catch (_) {
    return { latestVersion: APP_VERSION, status: 'active' };
  }
}

function isNewerVersion(latest, current) {
  try {
    const a = String(latest).split('.').map((n) => parseInt(n, 10) || 0);
    const b = String(current).split('.').map((n) => parseInt(n, 10) || 0);
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const ai = a[i] || 0;
      const bi = b[i] || 0;
      if (ai > bi) return true;
      if (ai < bi) return false;
    }
    return false;
  } catch (_) {
    // Fallback to string compare if parsing fails
    return String(latest) !== String(current);
  }
}

// Check for updates
async function checkForUpdates() {
  try {
    const response = await axios.get(VERSION_URL, { timeout: 3000 });
    const { latestVersion, status } = parseVersionStatus((response.data || '').trim());

    if (status === 'inactive') {
      dialog.showErrorBox('Warning', 'This application is temporarily disabled. Please contact support.');
      app.quit();
      return;
    }

    if (isNewerVersion(latestVersion, APP_VERSION)) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Update Now', 'Later'],
        title: 'Update Available',
        message: `A new version (${latestVersion}) of SyncMyPlays is available.\nYou must update to continue using this tool.`,
        detail: 'Do you want to update now?'
      });

      if (result.response === 0) {
        await downloadAndApplyUpdate(latestVersion);
      } else {
        dialog.showErrorBox('Update Required', 'This version is no longer supported. Please update to continue.');
        app.quit();
      }
    }
  } catch (error) {
    console.error('Error checking for updates:', error);
  }
}

function getKillSwitchState(text) {
  const value = String(text || '').trim().toLowerCase();
  const engagedValues = new Set(['on', 'active', 'enabled', '1', 'true', 'yes']);
  const disengagedValues = new Set(['off', 'inactive', 'disabled', '0', 'false', 'no']);
  if (engagedValues.has(value)) return 'engaged';
  if (disengagedValues.has(value)) return 'disengaged';
  return 'unknown';
}

// Check kill switch
async function checkKillSwitch() {
  try {
    const response = await axios.get(KILL_SWITCH_URL, { timeout: 8000 });
    const state = getKillSwitchState(response.data);
    console.log('Kill switch state:', state, 'raw:', String(response.data).trim());

    if (state === 'engaged') {
      dialog.showErrorBox('Application Disabled', 'This application has been remotely disabled via kill switch.');
      app.quit();
    }
    // If disengaged or unknown, continue running without interruption
  } catch (error) {
    console.warn('Kill switch check failed:', error?.message || error);
    // Do not block startup or show error dialogs on verification failures
  }
}

// Download and apply update
async function downloadAndApplyUpdate(version) {
  try {
    const response = await axios.get(config.UPDATE_URLS.downloadUrl, {
      responseType: 'stream'
    });
    
    const updatePath = path.join(os.tmpdir(), 'SyncMyPlays_New.exe');
    const writer = fs.createWriteStream(updatePath);
    
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    // Apply update logic here
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update',
      message: `An update to version ${version} has been applied. Please restart the application.`
    });
    
    app.quit();
  } catch (error) {
    console.error('Error downloading update:', error);
    dialog.showErrorBox('Update Error', 'Failed to download update. Please try again later.');
  }
}

// Check admin privileges
function isAdmin() {
  try {
    require('child_process').execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Elevate privileges
function elevatePrivileges() {
  const { exec } = require('child_process');
  exec(`powershell -WindowStyle Hidden -Command "Start-Process '${process.execPath}' -Verb RunAs -ArgumentList '${process.argv.join(' ')}' -WindowStyle Hidden"`, {
    windowsHide: true,
    stdio: 'ignore'
  });
  app.quit();
}

// Send notification to renderer
function sendNotification(type, title, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notification', { type, title, message });
  }
}

// Initialize background services after UI loads
async function initializeBackgroundServices() {
  secureConsole.info('Starting background services initialization...');
  
  try {
    // Quick kill switch check (non-blocking, with timeout)
    secureConsole.debug('Checking kill switch...');
    checkKillSwitch().catch(error => {
      console.warn('Kill switch check failed:', error?.message || error);
    });
    
    // Log startup to Discord (non-blocking, delayed)
    setTimeout(async () => {
      try {
        await secureLogger.logStartup(null);
        secureConsole.info('Startup logged to secure logger');
      } catch (error) {
        console.error('Failed to log startup to secure logger:', error.message);
      }
    }, 5000); // Delay logging to not block startup
    
    // Check admin privileges in background (only in production)
    if (!isDev) {
      setTimeout(async () => {
        const adminStatus = isAdmin();
        console.log('Admin status:', adminStatus);
        
        if (!adminStatus) {
          console.log('Not running as admin, showing elevation dialog...');
          try {
            const result = await dialog.showMessageBox(mainWindow, {
              type: 'warning',
              buttons: ['Continue Anyway', 'Restart as Admin', 'Cancel'],
              title: 'Administrator Privileges Recommended',
              message: 'This application works best with administrator privileges. Some features may be limited without admin access.',
              detail: 'Would you like to continue without admin privileges, restart with elevated privileges, or cancel?'
            });
            
            if (result.response === 1) {
              console.log('User chose to restart with admin privileges');
              elevatePrivileges();
            } else if (result.response === 2) {
              console.log('User cancelled, quitting app');
              app.quit();
            }
          } catch (error) {
            console.error('Error showing admin dialog:', error);
          }
        }
      }, 2000);
    }
    
    // Check for updates in background (skip during development)
    if (!isDev) {
      setTimeout(async () => {
        console.log('Checking for updates in background...');
        try {
          await checkForUpdates();
          console.log('Update check completed');
        } catch (error) {
          console.error('Update check failed, continuing...', error);
        }
      }, 3000);
    }
    
    // Set up power monitor and window focus handlers
    try {
      powerMonitor.on('resume', () => {
        console.log('System resume detected; re-checking kill switch...');
        checkKillSwitch().catch(() => {}); // Non-blocking
      });
    } catch (e) {
      console.log('powerMonitor not available:', e?.message || e);
    }
    
    app.on('browser-window-focus', () => {
      console.log('Window focused; re-checking kill switch...');
      checkKillSwitch().catch(() => {}); // Non-blocking
    });
    
    // Send welcome notification after everything is loaded
    setTimeout(() => {
      if (!welcomeNotificationSent) {
        sendNotification('success', 'Welcome!', 'SyncMyPlays is ready to sync your music playlists.');
        welcomeNotificationSent = true;
      }
    }, 4000);
    
    console.log('Background services initialization completed');
    
  } catch (error) {
    console.error('Error during background services initialization:', error);
  }
}

// IPC Handlers
ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});

ipcMain.handle('enter-fullscreen', () => {
  mainWindow.setFullScreen(true);
});

ipcMain.handle('exit-fullscreen', () => {
  mainWindow.setFullScreen(false);
});

ipcMain.handle('get-window-bounds', () => {
  return mainWindow.getBounds();
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external link:', error);
    return { success: false, error: error.message };
  }
});

// Send notification to renderer
function sendNotification(type, title, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notification', { type, title, message });
  }
}

// Initialize background services after UI loads
async function initializeBackgroundServices() {
  secureConsole.info('Starting background services initialization...');
  
  try {
    // Kill switch disabled (was causing freezing)
    // secureConsole.debug('Checking kill switch...');
    // checkKillSwitch().catch(error => {
    //   console.warn('Kill switch check failed:', error?.message || error);
    // });
    
    // Startup logged (non-blocking)
    console.log('App startup complete');
    
    // Admin privilege checking disabled (was causing performance issues)
    // if (!isDev) {
    //   setTimeout(async () => {
    //     const adminStatus = isAdmin();
    //     console.log('Admin status:', adminStatus);
    //     
    //     if (!adminStatus) {
    //       console.log('Not running as admin, showing elevation dialog...');
    //       try {
    //         const result = await dialog.showMessageBox(mainWindow, {
    //           type: 'warning',
    //           buttons: ['Continue Anyway', 'Restart as Admin', 'Cancel'],
    //           title: 'Administrator Privileges Recommended',
    //           message: 'This application works best with administrator privileges. Some features may be limited without admin access.',
    //           detail: 'Would you like to continue without admin privileges, restart with elevated privileges, or cancel?'
    //         });
    //         
    //         if (result.response === 1) {
    //           console.log('User chose to restart with admin privileges');
    //           elevatePrivileges();
    //         } else if (result.response === 2) {
    //           console.log('User cancelled, quitting app');
    //           app.quit();
    //         }
    //       } catch (error) {
    //         console.error('Error showing admin dialog:', error);
    //       }
    //     }
    //   }, 2000);
    // }
    
    // Update checking disabled (was causing performance issues)
    // if (!isDev) {
    //   setTimeout(async () => {
    //     console.log('Checking for updates in background...');
    //     try {
    //       await checkForUpdates();
    //       console.log('Update check completed');
    //     } catch (error) {
    //       console.error('Update check failed, continuing...', error);
    //     }
    //   }, 3000);
    // }
    
    // Set up power monitor and window focus handlers
    try {
      // Power monitor kill switch checks disabled (was causing freezing)
      // powerMonitor.on('resume', () => {
      //   console.log('System resume detected; re-checking kill switch...');
      //   checkKillSwitch().catch(() => {}); // Non-blocking
      // });
    } catch (e) {
      console.log('powerMonitor not available:', e?.message || e);
    }
    
    // Kill switch checks disabled (was causing freezing on window focus)
    // app.on('browser-window-focus', () => {
    //   console.log('Window focused; re-checking kill switch...');
    //   checkKillSwitch().catch(() => {}); // Non-blocking
    // });
    
    // Send welcome notification after everything is loaded
    setTimeout(() => {
      if (!welcomeNotificationSent) {
        sendNotification('success', 'Welcome!', 'SyncMyPlays is ready to sync your music playlists.');
        welcomeNotificationSent = true;
      }
    }, 4000);
    
    console.log('Background services initialization completed');
    
  } catch (error) {
    console.error('Error during background services initialization:', error);
  }
}

// App event handlers
// Register secure custom protocol BEFORE ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

app.whenReady().then(async () => {
  console.log('App ready, starting fast initialization...');
  
  // Set app name immediately (non-blocking)
  try {
    app.setName(APPLICATION_NAME);
    if (process.platform === 'win32') {
      app.setAppUserModelId(APPLICATION_APP_ID);
    }
  } catch (e) {
    console.log('Failed to set app name or AppUserModelID:', e?.message || e);
  }
  
  // Serve static files for app:// in production
  try {
    protocol.handle('app', async (req) => {
      const requestUrl = new URL(req.url);
      let filePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const path = require('path');
      const fs = require('fs/promises');
      // Adjust base to dist next to main bundle
      const distPath = path.join(__dirname, '..', 'dist');
      const full = path.join(distPath, decodeURIComponent(filePath));
      const data = await fs.readFile(full);
      const ext = full.split('.').pop() || 'html';
      const m = {
        html:'text/html', js:'text/javascript', mjs:'text/javascript', css:'text/css', json:'application/json',
        png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml', ico:'image/x-icon', txt:'text/plain'
      };
      const mime = m[ext] || 'text/plain';
      return new Response(data, { headers: { 'Content-Type': mime } });
    });
  } catch (e) {
    console.warn('Failed to register app:// protocol handler:', e?.message || e);
  }

  // Create window IMMEDIATELY for fast startup
  console.log('Creating main window...');
  createWindow();
  
  // Start backend
  startBackend();
  
  // Start background initialization after UI is shown
  setTimeout(async () => {
    await initializeBackgroundServices();
  }, 100);
});

app.on('window-all-closed', () => {
  // Always quit the app when all windows are closed, regardless of platform
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  // Prevent the default quit behavior until cleanup is complete
  event.preventDefault();
  
  // Log application shutdown (non-blocking)
  console.log('App shutting down');
  
  // Clean up all resources before quitting
  console.log('Cleaning up resources before quit...');
  
  try {
    // Kill backend
    stopBackend();
    
    // Kill all globally tracked child processes
    if (global.childProcesses && global.childProcesses.size > 0) {
      console.log(`Killing ${global.childProcesses.size} globally tracked child processes...`);
      for (const child of global.childProcesses) {
        try {
          if (!child.killed) {
            child.kill('SIGTERM');
          }
        } catch (error) {
          console.error('Error killing global child process:', error.message);
        }
      }
      global.childProcesses.clear();
    }
    
    // Wait a bit more to ensure all processes are properly terminated
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Cleanup completed, exiting application...');
    app.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    // Force exit even if cleanup fails
    app.exit(1);
  }
});

// Handle process termination signals
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  stopBackend();
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  stopBackend();
  app.quit();
});

// Handle process exit to ensure cleanup
process.on('exit', (code) => {
  console.log(`Process exiting with code: ${code}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  
  // Log the error (non-blocking)
  console.error('Uncaught Exception:', error);
  
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Log the error (non-blocking)
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error('Unhandled Promise Rejection:', error);
  
  process.exit(1);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
