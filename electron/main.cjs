const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { YtDlp } = require('ytdlp-nodejs');
const { autoUpdater } = require('electron-updater');

const userDataPath = path.join(__dirname, '..', '.electron-cache');
app.setPath('userData', userDataPath);

// ─── Auto-updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    console.log('[updater] Skipping auto-updater in dev mode');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update…');
    send('updater:checking', null);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    send('updater:available', { version: info.version, releaseNotes: info.releaseNotes });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[updater] Up to date:', info.version);
    send('updater:not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[updater] Download progress: ${progress.percent.toFixed(1)}%`);
    send('updater:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version);
    send('updater:downloaded', { version: info.version, releaseNotes: info.releaseNotes });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
    send('updater:error', { message: err.message });
  });

  // IPC: renderer can manually trigger a check or install
  ipcMain.on('updater:check', () => autoUpdater.checkForUpdates());
  ipcMain.on('updater:install', () => autoUpdater.quitAndInstall(false, true));

  // Auto-check on startup (slight delay so the window is ready)
  setTimeout(() => autoUpdater.checkForUpdates(), 3000);
}

let mainWindow;
let server = null;

// ─── yt-dlp binary ───────────────────────────────────────────────────────────
// Downloads the yt-dlp binary from GitHub releases into userData on first run,
// then reuses it on every subsequent launch (dev and packaged alike).
const YTDLP_BINARY_NAME =
  process.platform === 'win32' ? 'yt-dlp.exe' :
    process.platform === 'darwin' ? 'yt-dlp_macos' :
      'yt-dlp';

async function ensureYtDlpBinary() {
  const binaryDir = path.join(app.getPath('userData'), 'ytdlp');
  const binaryPath = path.join(binaryDir, YTDLP_BINARY_NAME);

  if (fs.existsSync(binaryPath)) {
    console.log('[ytdlp] Binary already present:', binaryPath);
    return binaryPath;
  }

  fs.mkdirSync(binaryDir, { recursive: true });

  const downloadUrl =
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_BINARY_NAME}`;

  console.log('[ytdlp] Downloading binary from', downloadUrl);

  await new Promise((resolve, reject) => {
    const followRedirect = (url) => {
      const transport = url.startsWith('https') ? require('https') : require('http');
      transport.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          followRedirect(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`yt-dlp download failed: HTTP ${res.statusCode}`));
          return;
        }
        const out = fs.createWriteStream(binaryPath);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    followRedirect(downloadUrl);
  });

  if (process.platform !== 'win32') fs.chmodSync(binaryPath, 0o755);
  console.log('[ytdlp] Binary downloaded to', binaryPath);
  return binaryPath;
}

// ─── yt-dlp helpers ──────────────────────────────────────────────────────────
function pickThumbnail(info) {
  if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
    return [...info.thumbnails]
      .sort((a, b) => ((b.width ?? 0) * (b.height ?? 0)) - ((a.width ?? 0) * (a.height ?? 0)))[0]
      ?.url ?? null;
  }
  return info.thumbnail ?? null;
}

// ─── yt-dlp lazy instance ─────────────────────────────────────────────────────
// Handlers are registered synchronously at startup (so they always exist).
// The binary is initialised on first use — if init were awaited at startup and
// failed, the handles would never be registered → "reply was never sent".

let ytdlpInstance = null;
let ytdlpInitPromise = null;

async function getYtDlp() {
  if (ytdlpInstance) return ytdlpInstance;
  if (ytdlpInitPromise) return ytdlpInitPromise;

  ytdlpInitPromise = (async () => {
    const binaryPath = await ensureYtDlpBinary();
    console.log('[ytdlp] Creating YtDlp instance with binary:', binaryPath);
    ytdlpInstance = new YtDlp({ binaryPath });
    return ytdlpInstance;
  })().catch((err) => {
    ytdlpInitPromise = null;
    ytdlpInstance = null;
    throw err;
  });

  return ytdlpInitPromise;
}

// ─── yt-dlp IPC handlers ─────────────────────────────────────────────────────
function registerYtDlpHandlers() {
  console.log('[ytdlp] registerYtDlpHandlers() — registering ipcMain handles');

  ipcMain.handle('ytdlp:info', async (_event, url) => {
    console.log('[ytdlp:info] ▶ url:', url);
    try {
      const ytdlp = await getYtDlp();
      const info = await ytdlp.getInfoAsync(url);
      console.log('[ytdlp:info] title:', info.title, '| duration:', info.duration);
      return {
        title: info.title ?? 'Video',
        duration: info.duration ?? null,
        thumbnail: pickThumbnail(info),
        uploader: info.uploader ?? null,
        extractor: info.extractor ?? null,
      };
    } catch (err) {
      console.error('[ytdlp:info] ✗ error:', err);
      throw err;
    }
  });

  // Full download — uses getFileAsync() per ytdlp-nodejs docs.
  // Downloads the entire video into memory, returns buffer + metadata.
  // No temp files. No streaming to renderer.
  ipcMain.handle('ytdlp:download', async (event, url) => {
    console.log('[ytdlp:download] ▶ url:', url);
    const sender = event.sender;

    const sendProgress = (percentage, status) => {
      console.log(`[ytdlp:progress] ${percentage} — ${status}`);
      if (!sender.isDestroyed()) sender.send('ytdlp:progress', { percentage, status });
    };

    try {
      // 1. Init
      console.log('[ytdlp:download] step 1 — getYtDlp()');
      sendProgress('0%', 'Initialising yt-dlp…');
      const ytdlp = await getYtDlp();
      console.log('[ytdlp:download] YtDlp instance ready');

      // 2. Metadata
      console.log('[ytdlp:download] step 2 — getInfoAsync');
      sendProgress('0%', 'Fetching video info…');
      const raw = await ytdlp.getInfoAsync(url);
      console.log('[ytdlp:download] _type:', raw._type, '| title:', raw.title);
      if (raw._type === 'playlist') throw new Error('Playlists are not supported.');

      const title = raw.title ?? 'video';
      const duration = raw.duration ?? null;
      const thumbnail = pickThumbnail(raw);
      const infoExt = raw.ext ?? 'mp4';
      console.log('[ytdlp:download] title:', title, '| duration:', duration, '| ext:', infoExt);

      // 3. Download fully into a File object (getFileAsync per ytdlp-nodejs README)
      let videoFile = null;
      let usedFilter = '';

      // Try 1: mergevideo (best quality, needs ffmpeg)
      console.log('[ytdlp:download] step 3a — getFileAsync mergevideo/highest/mp4');
      sendProgress('0%', 'Starting download…');
      try {
        videoFile = await ytdlp.getFileAsync(url, {
          format: { filter: 'mergevideo', quality: 'highest', type: 'mp4' },
          onProgress: (p) => {
            const pct = p.percentage_str ?? '…';
            sendProgress(pct, `Downloading… ${pct}`);
          },
        });
        usedFilter = 'mergevideo';
        console.log('[ytdlp:download] mergevideo ✓ size:', videoFile?.size, 'name:', videoFile?.name);
      } catch (mergeErr) {
        console.warn('[ytdlp:download] mergevideo ✗:', mergeErr.message);
        videoFile = null;
      }

      // Try 2: audioandvideo fallback (single container, no ffmpeg needed)
      if (!videoFile || videoFile.size === 0) {
        console.log('[ytdlp:download] step 3b — getFileAsync audioandvideo/highest/mp4');
        sendProgress('0%', 'Retrying with fallback format…');
        try {
          videoFile = await ytdlp.getFileAsync(url, {
            format: { filter: 'audioandvideo', quality: 'highest', type: 'mp4' },
            onProgress: (p) => {
              const pct = p.percentage_str ?? '…';
              sendProgress(pct, `Downloading… ${pct}`);
            },
          });
          usedFilter = 'audioandvideo';
          console.log('[ytdlp:download] audioandvideo ✓ size:', videoFile?.size, 'name:', videoFile?.name);
        } catch (fallbackErr) {
          console.error('[ytdlp:download] audioandvideo ✗:', fallbackErr.message);
          console.error('[ytdlp:download] full error:', fallbackErr);
          throw new Error(`Download failed (mergevideo + audioandvideo both failed). Last: ${fallbackErr.message}`);
        }
      }

      if (!videoFile || videoFile.size === 0) {
        throw new Error(`getFileAsync returned an empty file (filter: ${usedFilter || 'unknown'}).`);
      }

      console.log('[ytdlp:download] filter used:', usedFilter);
      console.log('[ytdlp:download] file.name:', videoFile.name);
      console.log('[ytdlp:download] file.type:', videoFile.type);
      console.log('[ytdlp:download] file.size:', videoFile.size, 'bytes /', (videoFile.size / 1_048_576).toFixed(2), 'MB');

      // 4. Read into Buffer for IPC transfer
      console.log('[ytdlp:download] step 4 — arrayBuffer()');
      sendProgress('100%', 'Processing…');
      const arrayBuffer = await videoFile.arrayBuffer();
      const nodeBuffer = Buffer.from(arrayBuffer);
      console.log('[ytdlp:download] buffer size:', nodeBuffer.byteLength, 'bytes');

      // 5. MIME type
      const actualName = videoFile.name || `video.${infoExt}`;
      const actualExt = path.extname(actualName).replace('.', '').toLowerCase();
      const mimeType = videoFile.type || (actualExt === 'webm' ? 'video/webm' : 'video/mp4');
      console.log('[ytdlp:download] actualName:', actualName, '| mimeType:', mimeType);
      console.log('[ytdlp:download] ✓ sending to renderer');

      return {
        buffer: new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength),
        filename: actualName,
        mimeType,
        title,
        duration,
        thumbnail,
      };
    } catch (err) {
      // Must re-throw — swallowing causes "reply was never sent" in renderer
      console.error('[ytdlp:download] ✗ fatal:', err);
      throw err;
    }
  });

  console.log('[ytdlp] ✓ handles registered: ytdlp:info, ytdlp:download');
}


// ─── Static file server ──────────────────────────────────────────────────────
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function startServer(port = 0) {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const distDir = path.join(__dirname, '..', 'dist');
      const distExists = require('fs').existsSync(distDir);
      if (!distExists) console.error('[server] ERROR: dist dir not found at', distDir);

      console.log('[server]', req.method, req.url);
      const urlPath = new URL(req.url, 'http://localhost').pathname;
      const cleanPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      let filePath = path.resolve(distDir, cleanPath);

      console.log('[server] -> file:', filePath);
      if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const serveIndex = () => {
        fs.readFile(path.join(distDir, 'index.html'), (err2, content2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content2);
          }
        });
      };

      fs.readFile(filePath, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            console.log('[server] ENOENT, serving index.html');
            serveIndex();
          } else {
            res.writeHead(500);
            res.end('Server Error');
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });

    server.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`Local server running on port ${actualPort}`);
      resolve(actualPort);
    });
  });
}

function createWindow(serverUrl = null) {
  const isDev = process.env.NODE_ENV !== 'production';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: false,
    },
    titleBarStyle: 'hidden',
    frame: false,
    show: false,
    title: 'tribsview',
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadURL(serverUrl);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.insertCSS(`
      * { -webkit-user-select: none !important; user-select: none !important; }
      input, textarea, [contenteditable="true"] { -webkit-user-select: text !important; user-select: text !important; }
    `);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) {
      server.close();
      server = null;
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  const isDev = process.env.NODE_ENV !== 'production';

  registerYtDlpHandlers();
  setupAutoUpdater();

  if (!isDev) {
    const port = await startServer(0);
    createWindow(`http://localhost:${port}`);
  } else {
    createWindow();
  }

  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (server) server.close();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});