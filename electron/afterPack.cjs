// scripts/afterPack.js
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { flipFuses } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

exports.default = async ({ appOutDir, packager }) => {
  // ── 1. Make yt-dlp binary executable (macOS / Linux only) ────────────────
  if (process.platform !== 'win32') {
    const binaryName = process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp';

    // electron-builder unpacks to different sub-paths depending on platform
    const resourcesDir =
      packager.platform.name === 'mac'
        ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(appOutDir, 'resources');

    // Try every location ytdlp-nodejs may use across versions
    const candidates = [
      path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'ytdlp-nodejs', 'bin', binaryName),
      path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'ytdlp-nodejs', 'binaries', binaryName),
      path.join(resourcesDir, 'app.asar.unpacked', 'node_modules', 'ytdlp-nodejs', binaryName),
    ];

    let found = false;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        fs.chmodSync(c, 0o755);
        console.log(`[afterPack] chmod 755 → ${c}`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn('[afterPack] yt-dlp binary not found for chmod. Checked:\n' +
        candidates.map((c) => `  ${c}`).join('\n'));
    }
  }

  // ── 2. Electron Fuses (unchanged from original) ───────────────────────────
  const ext = { darwin: '.app', win32: '.exe', linux: '' }[process.platform];
  const appPath = path.join(appOutDir, `${packager.appInfo.productName}${ext}`);

  await flipFuses(appPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};