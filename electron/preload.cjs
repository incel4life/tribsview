const { contextBridge, ipcRenderer } = require('electron');

if (document.body) {
  document.body.classList.add('electron');
} else {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('electron');
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDev: process.env.NODE_ENV !== 'production',
  isElectron: true,

  // ── Window controls ──────────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized));
  },

  // ── yt-dlp ───────────────────────────────────────────────────────────────
  ytdlpInfo: (url) => ipcRenderer.invoke('ytdlp:info', url),

  ytdlpDownload: (url) => ipcRenderer.invoke('ytdlp:download', url),

  // Subscribe to live download-progress events pushed by the main process.
  // Returns an unsubscribe function — call it when the download finishes.
  onYtdlpProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ytdlp:progress', handler);
    return () => ipcRenderer.removeListener('ytdlp:progress', handler);
  },

  // ── Auto-updater ─────────────────────────────────────────────────────────
  updater: {
    check: () => ipcRenderer.send('updater:check'),
    install: () => ipcRenderer.send('updater:install'),
    onChecking:     (cb) => { ipcRenderer.on('updater:checking',     (_, d) => cb(d)); },
    onAvailable:    (cb) => { ipcRenderer.on('updater:available',    (_, d) => cb(d)); },
    onNotAvailable: (cb) => { ipcRenderer.on('updater:not-available',(_, d) => cb(d)); },
    onProgress:     (cb) => { ipcRenderer.on('updater:progress',     (_, d) => cb(d)); },
    onDownloaded:   (cb) => { ipcRenderer.on('updater:downloaded',   (_, d) => cb(d)); },
    onError:        (cb) => { ipcRenderer.on('updater:error',        (_, d) => cb(d)); },
  },
});

console.log('tribsview preload loaded');
