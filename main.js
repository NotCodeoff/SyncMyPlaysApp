const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Import secure console for terminal protection
let secureConsole, secureLogger;
try {
  secureConsole = require('./src/utils/secureConsole');
  secureLogger = require('./src/utils/secureLogger');
} catch (error) {
  // Fallback to regular console if secure console not available
  secureConsole = console;
  secureLogger = {
    logStartup: () => Promise.resolve(),
    logShutdown: () => Promise.resolve(),
    logError: () => Promise.resolve()
  };
}

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'build', 'icon.ico')
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function startBackend() {
  secureConsole.log('🚀 Starting backend server...');
  
  try {
    // In production, use the compiled backend
    if (process.env.NODE_ENV === 'production' || process.pkg) {
      const backendPath = path.join(__dirname, 'dist-backend', 'server.exe');
      backendProcess = spawn(backendPath, [], {
        stdio: 'pipe',
        cwd: path.join(__dirname, 'dist-backend')
      });
    } else {
      // In development, use Node.js
      backendProcess = spawn('node', [path.join(__dirname, 'backend', 'index.js')], {
        stdio: 'pipe',
        cwd: path.join(__dirname, 'backend')
      });
    }

    backendProcess.stdout.on('data', (data) => {
      secureConsole.log(`[BACKEND] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      secureConsole.error(`[BACKEND_ERROR] ${data.toString().trim()}`);
    });

    backendProcess.on('close', (code) => {
      secureConsole.log(`[BACKEND] Process exited with code ${code}`);
    });

    secureConsole.log('✅ Backend started successfully');
  } catch (error) {
    secureConsole.error('❌ Failed to start backend:', error.message);
    secureLogger.logError(error, 'Failed to start backend');
  }
}

app.whenReady().then(() => {
  secureConsole.log('🚀 Electron app is ready');
  
  // Don't await startup logging - do it in background to not slow down startup
  secureLogger.logStartup().catch(() => {});
  
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  
  // Log shutdown in background - don't wait
  secureLogger.logShutdown('Window closed').catch(() => {});
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  
  // Log shutdown in background - don't wait
  secureLogger.logShutdown('Application quit').catch(() => {});
});
