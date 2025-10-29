const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Invokes the 'open-external' IPC channel to open a URL in the default browser.
   * @param {string} url The URL to open.
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /**
   * Opens Apple Music authentication in a webview window
   * @param {string} url The Apple Music URL to open
   * @returns {Promise<{success: boolean, token?: string, cancelled?: boolean}>}
   */
  openAppleMusicWebview: (url) => ipcRenderer.invoke('open-apple-music-webview', url),

  // Window controls used by custom title bar
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  enterFullscreen: () => ipcRenderer.invoke('enter-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('exit-fullscreen'),
});
