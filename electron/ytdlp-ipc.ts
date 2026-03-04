import { ipcMain, app } from 'electron';
import { YtDlp, helpers } from 'ytdlp-nodejs';
import type { VideoInfo } from 'ytdlp-nodejs';
import * as fs from 'fs';
import * as path from 'path';
import type { WebContents } from 'electron';

// ─── Binary setup (lazy) ──────────────────────────────────────────────────────
//
// IMPORTANT: We do NOT await binary setup before calling ipcMain.handle().
// If ensureYtDlpBinary() throws (network error, permission issue, etc.),
// the handles would never be registered, causing "reply was never sent"
// with zero main-process logs — exactly the bug we had.
//
// Instead, ytdlp is initialised once on first use, inside the handlers.

const YTDLP_BINARY_NAME =
  process.platform === 'win32' ? 'yt-dlp.exe' :
    process.platform === 'darwin' ? 'yt-dlp_macos' :
      'yt-dlp';

let ytdlpInstance: YtDlp | null = null;
let ytdlpInitPromise: Promise<YtDlp> | null = null;

async function getYtDlp(): Promise<YtDlp> {
  // Return cached instance
  if (ytdlpInstance) return ytdlpInstance;

  // Deduplicate concurrent init calls
  if (ytdlpInitPromise) return ytdlpInitPromise;

  ytdlpInitPromise = (async () => {
    const binaryDir = path.join(app.getPath('userData'), 'ytdlp');
    const binaryPath = path.join(binaryDir, YTDLP_BINARY_NAME);

    console.log('[ytdlp] getYtDlp() — binaryDir:', binaryDir);
    console.log('[ytdlp] getYtDlp() — binaryPath:', binaryPath);
    console.log('[ytdlp] getYtDlp() — exists?', fs.existsSync(binaryPath));

    if (!fs.existsSync(binaryPath)) {
      console.log('[ytdlp] Binary not found, downloading…');
      fs.mkdirSync(binaryDir, { recursive: true });
      await helpers.downloadYtDlp(binaryDir);
      console.log('[ytdlp] Binary download complete');

      if (!fs.existsSync(binaryPath)) {
        throw new Error(`[ytdlp] Binary still missing after download: ${binaryPath}`);
      }
    }

    console.log('[ytdlp] Binary ready, creating YtDlp instance');
    ytdlpInstance = new YtDlp({ binaryPath });
    return ytdlpInstance;
  })().catch((err) => {
    // Reset so the next call can retry
    ytdlpInitPromise = null;
    ytdlpInstance = null;
    throw err;
  });

  return ytdlpInitPromise;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickThumbnail(info: VideoInfo): string | null {
  if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
    return [...info.thumbnails]
      .sort((a, b) =>
        ((b.width as number) ?? 0) * ((b.height as number) ?? 0) -
        ((a.width as number) ?? 0) * ((a.height as number) ?? 0)
      )[0]?.url ?? null;
  }
  return info.thumbnail ?? null;
}

function sendProgress(sender: WebContents, percentage: string, status: string): void {
  if (!sender.isDestroyed()) {
    console.log(`[ytdlp:progress] ${percentage} — ${status}`);
    sender.send('ytdlp:progress', { percentage, status });
  }
}

// ─── Register handlers ────────────────────────────────────────────────────────
//
// Called once at app startup. Handlers are registered synchronously here.
// Binary initialisation happens lazily inside each handler on first call.

export function registerYtDlpHandlers(): void {
  console.log('[ytdlp] registerYtDlpHandlers() called — registering ipcMain handles NOW');

  // ── ytdlp:info ──────────────────────────────────────────────────────────────
  ipcMain.handle('ytdlp:info', async (_event, url: string) => {
    console.log('[ytdlp:info] ▶ invoked, url:', url);
    try {
      const ytdlp = await getYtDlp();
      console.log('[ytdlp:info] YtDlp ready, calling getInfoAsync…');

      const raw = await ytdlp.getInfoAsync(url);
      console.log('[ytdlp:info] getInfoAsync done, _type:', raw._type);

      if (raw._type === 'playlist') throw new Error('Playlists are not supported.');

      const info = raw as VideoInfo;
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

  // ── ytdlp:download ──────────────────────────────────────────────────────────
  //
  // Downloads the video fully using getFileAsync() (per ytdlp-nodejs README).
  // Returns the complete buffer to the renderer which persists it to IndexedDB.
  // No temp files. No streaming chunks over IPC.
  //
  ipcMain.handle('ytdlp:download', async (event, url: string) => {
    console.log('[ytdlp:download] ▶ invoked —————————————————————————');
    console.log('[ytdlp:download] url:', url);

    const sender = event.sender;

    try {
      // ── 1. Init yt-dlp binary ───────────────────────────────────────────────
      console.log('[ytdlp:download] step 1 — getYtDlp()');
      sendProgress(sender, '0%', 'Initialising yt-dlp…');
      const ytdlp = await getYtDlp();
      console.log('[ytdlp:download] YtDlp instance ready');

      // ── 2. Fetch metadata ───────────────────────────────────────────────────
      console.log('[ytdlp:download] step 2 — getInfoAsync');
      sendProgress(sender, '0%', 'Fetching video info…');

      const raw = await ytdlp.getInfoAsync(url);
      console.log('[ytdlp:download] getInfoAsync done, _type:', raw._type);

      if (raw._type === 'playlist') throw new Error('Playlists are not supported.');

      const info = raw as VideoInfo;
      const title = info.title ?? 'video';
      const duration = info.duration ?? null;
      const thumbnail = pickThumbnail(info);
      const infoExt = info.ext ?? 'mp4';

      console.log('[ytdlp:download] title:', title);
      console.log('[ytdlp:download] duration:', duration, 's');
      console.log('[ytdlp:download] ext from info:', infoExt);
      console.log('[ytdlp:download] thumbnail:', thumbnail?.slice(0, 80));

      // ── 3. Download fully into File object ──────────────────────────────────
      // getFileAsync() downloads the entire video before returning.
      // Try mergevideo first (best quality, needs ffmpeg), then audioandvideo.

      let videoFile: File | null = null;
      let usedFilter = '';

      // — Try 1: mergevideo ───────────────────────────────────────────────────
      console.log('[ytdlp:download] step 3a — getFileAsync mergevideo/highest/mp4');
      sendProgress(sender, '0%', 'Starting download…');

      try {
        videoFile = await ytdlp.getFileAsync(url, {
          format: { filter: 'mergevideo', quality: 'highest', type: 'mp4' },
          onProgress: (p) => {
            const pct = (p as any).percentage_str ?? '…';
            sendProgress(sender, pct, `Downloading… ${pct}`);
          },
        });
        usedFilter = 'mergevideo';
        console.log('[ytdlp:download] mergevideo ✓ — size:', videoFile?.size, 'name:', videoFile?.name);
      } catch (mergeErr) {
        console.warn('[ytdlp:download] mergevideo ✗:', (mergeErr as Error).message);
        videoFile = null;
      }

      // — Try 2: audioandvideo fallback ───────────────────────────────────────
      if (!videoFile || videoFile.size === 0) {
        console.log('[ytdlp:download] step 3b — getFileAsync audioandvideo/highest/mp4');
        sendProgress(sender, '0%', 'Retrying with fallback format…');

        try {
          videoFile = await ytdlp.getFileAsync(url, {
            format: { filter: 'audioandvideo', quality: 'highest', type: 'mp4' },
            onProgress: (p) => {
              const pct = (p as any).percentage_str ?? '…';
              sendProgress(sender, pct, `Downloading… ${pct}`);
            },
          });
          usedFilter = 'audioandvideo';
          console.log('[ytdlp:download] audioandvideo ✓ — size:', videoFile?.size, 'name:', videoFile?.name);
        } catch (fallbackErr) {
          console.error('[ytdlp:download] audioandvideo ✗:', (fallbackErr as Error).message);
          console.error('[ytdlp:download] full fallback error:', fallbackErr);
          throw new Error(
            `Download failed with both mergevideo and audioandvideo. Last error: ${(fallbackErr as Error).message}`
          );
        }
      }

      if (!videoFile || videoFile.size === 0) {
        throw new Error(`getFileAsync returned empty file (filter: ${usedFilter || 'unknown'}).`);
      }

      console.log('[ytdlp:download] filter used:', usedFilter);
      console.log('[ytdlp:download] file.name:', videoFile.name);
      console.log('[ytdlp:download] file.type:', videoFile.type);
      console.log('[ytdlp:download] file.size:', videoFile.size, 'bytes /', (videoFile.size / 1_048_576).toFixed(2), 'MB');

      // ── 4. Read into Buffer for IPC transfer ────────────────────────────────
      console.log('[ytdlp:download] step 4 — reading arrayBuffer');
      sendProgress(sender, '100%', 'Processing…');

      const arrayBuffer = await videoFile.arrayBuffer();
      const nodeBuffer = Buffer.from(arrayBuffer);
      console.log('[ytdlp:download] buffer size:', nodeBuffer.byteLength, 'bytes');

      // ── 5. Resolve MIME type ────────────────────────────────────────────────
      const actualName = videoFile.name || `video.${infoExt}`;
      const actualExt = path.extname(actualName).replace('.', '').toLowerCase();
      const mimeType =
        videoFile.type ||
        (actualExt === 'webm' ? 'video/webm' :
          actualExt === 'mkv' ? 'video/x-matroska' :
            'video/mp4');

      console.log('[ytdlp:download] actualName:', actualName);
      console.log('[ytdlp:download] mimeType:', mimeType);
      console.log('[ytdlp:download] ✓ sending result to renderer');

      return {
        buffer: new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength),
        filename: actualName,
        mimeType,
        title,
        duration,
        thumbnail,
      };

    } catch (err) {
      // Always re-throw — if we swallow the error the Promise never resolves
      // and Electron emits "reply was never sent" in the renderer.
      console.error('[ytdlp:download] ✗ fatal error:', err);
      throw err;
    }
  });

  console.log('[ytdlp] ✓ ipcMain handles registered: ytdlp:info, ytdlp:download');
}