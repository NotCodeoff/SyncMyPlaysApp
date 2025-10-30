const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  enterFullscreen: () => ipcRenderer.invoke('enter-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('exit-fullscreen'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Notifications
  onNotification: (callback) => {
    ipcRenderer.on('notification', (event, data) => callback(data));
  },
  
  // Remove notification listener
  removeNotificationListener: () => {
    ipcRenderer.removeAllListeners('notification');
  }
});

// Security: Prevent the renderer from accessing Node.js APIs
delete window.require;
delete window.exports;
delete window.module;

// Minimal diagnostics for secure context and origin (does not expose node APIs)
try {
  contextBridge.exposeInMainWorld('electronEnv', {
    isElectron: true,
    secureContext: window.isSecureContext,
    origin: location.origin,
  });
} catch (_) {
  // ignore
}