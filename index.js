const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const { logToFile } = require('./utils/log');
const { startBackend } = require('./backend/startBackend');

let mainWindow;

function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	win.loadFile(path.join(__dirname, 'index.html'));

	win.on('closed', () => {
		mainWindow = null;
	});

	mainWindow = win;
}

app.whenReady().then(() => {
	logToFile('INFO', 'Electron app is ready, starting backend...');
	startBackend();
		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [
					"default-src 'self'",
					"script-src 'self'",
					"style-src 'self' 'unsafe-inline'",
					"img-src 'self' data: https://*.mzstatic.com https://*.scdn.co https://*.spotifycdn.com https://*.spotifycdn.com https://*.blobstore.apple.com",
							"connect-src 'self' http://127.0.0.1:8000 ws://127.0.0.1:8000"
				].join('; ')
			}
		});
	});

	createWindow();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	}
}); 