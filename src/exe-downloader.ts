import { Notice } from 'obsidian';
import * as fs from 'fs';
import * as https from 'https';

const GITHUB_REPO = 'AyWutiansui/obsidian-onenote-integration';
const EXE_FILES = ['onenote-repos.exe', 'win-embed-overlay.exe'];

/**
 * Ensure helper executables exist in the plugin directory.
 * If missing, downloads them from the matching GitHub release.
 * Shows progress via Obsidian Notice.
 * Returns 'existing' if files were already present, 'downloaded' if they were just downloaded, false on failure.
 */
export async function ensureExeFiles(
  pluginDir: string,
  version: string
): Promise<'existing' | 'downloaded' | false> {
  const missing = EXE_FILES.filter(
    f => !fs.existsSync(pluginDir + '/' + f)
  );

  if (missing.length === 0) return 'existing';

  console.log(`[OneNote] Missing executables: ${missing.join(', ')} — downloading from release ${version} to ${pluginDir}`);

  const notice = new Notice(`OneNote: downloading helper executables...`, 0);

  let downloaded = 0;
  for (const file of missing) {
    try {
      const url = `https://github.com/${GITHUB_REPO}/releases/download/${version}/${file}`;
      notice.setMessage(`OneNote: downloading ${file} (${downloaded + 1}/${missing.length})...`);
      await downloadFile(url, pluginDir + '/' + file, (pct) => {
        notice.setMessage(`OneNote: downloading ${file} (${downloaded + 1}/${missing.length}) — ${pct}%`);
      });
      console.log(`[OneNote] Downloaded ${file}`);
      downloaded++;
    } catch (e: any) {
      console.error(`[OneNote] Failed to download ${file}:`, e.message);
      notice.setMessage(`OneNote: failed to download ${file} — ${e.message}`);
      setTimeout(() => notice.hide(), 5000);
      return false;
    }
  }

  notice.setMessage('OneNote: helper executables ready — reloading plugin...');
  setTimeout(() => notice.hide(), 5000);
  return 'downloaded';
}

function downloadFile(
  url: string,
  dest: string,
  onProgress?: (pct: number) => void,
  totalTimeoutMs: number = 120000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      fn();
    };

    const totalTimer = setTimeout(() => {
      done(() => reject(new Error(`Download timed out (${Math.round(totalTimeoutMs / 1000)}s)`)));
    }, totalTimeoutMs);

    doRequest(url, dest, onProgress, (err) => {
      if (err) done(() => reject(err));
      else done(() => resolve());
    });
  });
}

function doRequest(
  url: string,
  dest: string,
  onProgress: ((pct: number) => void) | undefined,
  callback: (err: Error | null) => void
): void {
  console.log(`[OneNote] GET ${url}`);
  const req = https.get(url, { headers: { 'User-Agent': 'obsidian-onenote-plugin' } }, (res) => {
    console.log(`[OneNote] Response: status=${res.statusCode} location=${res.headers.location || 'none'}`);
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      doRequest(res.headers.location, dest, onProgress, callback);
      return;
    }

    if (res.statusCode !== 200) {
      console.error(`[OneNote] HTTP error: ${res.statusCode} for ${url}`);
      callback(new Error(`HTTP ${res.statusCode}`));
      return;
    }

    const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
    console.log(`[OneNote] Downloading ${totalBytes} bytes to ${dest}`);
    let receivedBytes = 0;

    const file = fs.createWriteStream(dest);
    res.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (onProgress && totalBytes > 0) {
        onProgress(Math.round((receivedBytes / totalBytes) * 100));
      }
    });

    res.pipe(file);
    file.on('finish', () => {
      console.log(`[OneNote] File written: ${dest} (${receivedBytes} bytes)`);
      file.close();
      callback(null);
    });
    file.on('error', (err) => {
      console.error(`[OneNote] File write error: ${err.message}`);
      fs.unlink(dest, () => {});
      callback(err);
    });
  });

  req.on('error', (err) => {
    console.error(`[OneNote] Request error: ${err.message} for ${url}`);
    callback(err);
  });
  req.setTimeout(30000, () => {
    console.error(`[OneNote] Socket stalled for ${url}`);
    req.destroy();
    callback(new Error('Connection stalled (no data for 30s)'));
  });
}
