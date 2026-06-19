import { Notice, Platform } from 'obsidian';
import { exec, execFile, execSync, type ExecFileException } from 'child_process';
import * as fs from 'fs';
import { LocalOneNotePage, LocalOneNoteSection, LocalOneNoteNotebook } from './types';
import { EmbedSessionManager } from './services/embed-session';
import { WindowEmbedManager } from './embed/window-embed-manager';
import {
  parseOneNoteHierarchy,
  parseOneNoteSections,
  parseOneNotePages,
  parseOneNotePageXml,
} from './services/onenote-xml-parser';

type ExecError = Error & { code?: number | string | null };
type ElectronWindow = {
  getNativeWindowHandle(): Buffer;
};

interface ScreenWithAvail extends Screen {
  availLeft?: number;
  availTop?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error));
}

// Re-export types so existing importers (e.g. onenote-view.ts) still work
// when they import from this module.
export type { LocalOneNotePage, LocalOneNoteSection, LocalOneNoteNotebook } from './types';

export class OneNoteLocalService {
  private isWindows: boolean;
  private isMac: boolean;
  private hierarchyCache: LocalOneNoteNotebook[] | null = null;
  private _cacheTimestamp: number = 0;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private _urlCache: Map<string, string> = new Map();   // pageId → onenote:// URL
  private _pagesInFlight: Map<string, Promise<LocalOneNotePage[]>> = new Map(); // sectionId → pending fetch
  private _pluginDir: string = '';
  private _embedSession = new EmbedSessionManager();
  private _embedManager: WindowEmbedManager | null = null;

  /** Sanitize a pageId for safe interpolation inside PowerShell double-quoted strings. */
  private static sanitizeForPs(pageId: string): string {
    return pageId.replace(/["`$]/g, '');
  }

  setPluginDir(dir: string): void {
    this._pluginDir = dir;
    this._embedManager = new WindowEmbedManager(dir);
  }

  constructor() {
    this.isWindows = Platform.isWin;
    this.isMac = Platform.isMacOS;
  }

  /**
   * Allocate a new embed session and mark it as the only active owner.
   * The code block renderer uses this to ignore stale scroll/resize events
   * from previously rendered embeds.
   */
  beginEmbedSession(): number {
    return this._embedSession.beginEmbedSession();
  }

  isActiveEmbedSession(sessionId: number): boolean {
    return this._embedSession.isActiveEmbedSession(sessionId);
  }

  endEmbedSession(sessionId: number): void {
    this._embedSession.endEmbedSession(sessionId);
  }

  /**
   * Check if the hierarchy cache is still valid (not expired).
   */
  private isCacheValid(): boolean {
    return this.hierarchyCache !== null &&
           this.hierarchyCache.length > 0 &&
           (Date.now() - this._cacheTimestamp) < OneNoteLocalService.CACHE_TTL_MS;
  }

  /**
   * Invalidate the hierarchy cache, forcing a fresh fetch on next access.
   */
  invalidateCache(): void {
    this.hierarchyCache = null;
    this._cacheTimestamp = 0;
    this._urlCache.clear();
    this._pagesInFlight.clear();
  }

  /**
   * Navigate OneNote to a specific page. Uses PowerShell + GetHyperlinkToObject
   * to get the correct onenote:// URL, then opens it with ShellExecute.
   * This is more reliable than repos.exe which has COM late-binding issues.
   */
  async navigateToPage(pageId: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // PowerShell script: GetHyperlinkToObject → Start-Process
        const safeId = OneNoteLocalService.sanitizeForPs(pageId);
        const psScript =
          'try {' +
          `$oneNote = New-Object -ComObject OneNote.Application;` +
          `$url = "";` +
          `$oneNote.GetHyperlinkToObject("${safeId}", "", [ref]$url);` +
          'if ($url) { Start-Process $url; exit 0; }' +
          'else { Write-Error "GetHyperlinkToObject returned empty URL"; exit 1; }' +
          '} catch {' +
          'Write-Error $_.Exception.Message;' +
          'exit 1;' +
          '}';

        const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, {
          encoding: 'utf-8',
          timeout: 10000
        }, (error: ExecError | null) => {
          if (error) {
            console.error('[OneNote] PowerShell navigate failed:', error.message);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (error: unknown) {
        console.error('[OneNote] navigateToPage exception:', getErrorMessage(error));
        resolve(false);
      }
    });
  }

  /**
   * Get the onenote:// URL for a page. Uses cache first, falls back to
   * PowerShell + COM GetHyperlinkToObject call (lazy, one-at-a-time).
   */
  async getPageUrl(pageId: string): Promise<string> {
    // Check URL cache first
    const cached = this._urlCache.get(pageId);
    if (cached) return cached;

    // Lazy fetch via PowerShell
    return new Promise((resolve) => {
      try {
        const safeId = OneNoteLocalService.sanitizeForPs(pageId);
        const psScript =
          'try {' +
          `$oneNote = New-Object -ComObject OneNote.Application;` +
          `$url = "";` +
          `$oneNote.GetHyperlinkToObject("${safeId}", "", [ref]$url);` +
          'if ($url) { Write-Output $url; exit 0; }' +
          'else { exit 1; }' +
          '} catch {' +
          'exit 1;' +
          '}';

        const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, {
          encoding: 'utf-8',
          timeout: 10000
        }, (error: ExecError | null, stdout: string) => {
          if (error || !stdout.trim()) {
            resolve('');
            return;
          }
          const url = stdout.trim();
          this._urlCache.set(pageId, url);
          resolve(url);
        });
      } catch {
        resolve('');
      }
    });
  }

  /**
   * Check if OneNote is available on the system
   */
  async checkOneNoteAvailability(): Promise<boolean> {
    try {
      if (this.isWindows) {
        // Try to create OneNote COM object via ActiveX
        return await this.checkWindowsOneNote();
      } else if (this.isMac) {
        // On Mac, check if OneNote.app exists
        return await this.checkMacOneNote();
      }
      return false;
    } catch (error: unknown) {
      console.error('OneNote availability check failed:', getErrorMessage(error));
      return false;
    }
  }

  private async checkWindowsOneNote(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Method 1: Try to find OneNote executable in common locations
        const commonPaths = [
          'C:\\Program Files\\Microsoft Office\\root\\Office16\\ONENOTE.EXE',
          'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\ONENOTE.EXE',
          'C:\\Program Files\\Microsoft Office\\Office16\\ONENOTE.EXE',
          'C:\\Program Files (x86)\\Microsoft Office\\Office16\\ONENOTE.EXE',
          'C:\\Program Files\\Microsoft Office\\Office15\\ONENOTE.EXE',
          'C:\\Program Files (x86)\\Microsoft Office\\Office15\\ONENOTE.EXE'
        ];
        
        let found = false;
        for (const path of commonPaths) {
          try {
            execSync(`if exist "${path}" echo found`, { encoding: 'utf-8' });
            found = true;
            break;
          } catch {
            // Continue to next path
          }
        }
        
        if (found) {
          resolve(true);
          return;
        }
        
        // Method 2: Try registry lookup
        try {
          const regOutput = execSync(
            'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ONENOTE.EXE" /ve 2>nul || ' +
            'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ONENOTE.EXE" /ve 2>nul',
            { encoding: 'utf-8' }
          );
          if (regOutput.includes('ONENOTE.EXE')) {
            resolve(true);
            return;
          }
        } catch {
          // Registry check failed
        }
        
        // Method 3: Try where command
        try {
          const output = execSync('where onenote 2>nul', { encoding: 'utf-8' });
          if (output.trim() && output.toLowerCase().includes('onenote.exe')) {
            resolve(true);
            return;
          }
        } catch {
          // PATH check failed
        }
        
        resolve(false);
      } catch (error: unknown) {
        console.error('Error checking Windows OneNote:', getErrorMessage(error));
        resolve(false);
      }
    });
  }

  private async checkMacOneNote(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const result = execSync('mdfind "kMDItemCFBundleIdentifier == \'com.microsoft.onenote\'"', { encoding: 'utf-8' });
        // Check if mdfind found any results (non-empty output)
        resolve(result.trim().length > 0);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Get all notebooks from local OneNote
   */
  async getNotebooks(): Promise<LocalOneNoteNotebook[]> {
    try {
      if (this.isWindows) {
        return await this.getWindowsNotebooks();
      } else if (this.isMac) {
        return await this.getMacNotebooks();
      }
      return [];
    } catch (error: unknown) {
      console.error('Failed to get notebooks:', getErrorMessage(error));
      throw new Error(`Failed to get notebooks: ${getErrorMessage(error)}`);
    }
  }

  private async getWindowsNotebooks(): Promise<LocalOneNoteNotebook[]> {
    // Return cached data if still fresh
    if (this.isCacheValid()) {
      console.log('[OneNote] Returning cached hierarchy (age:',
                  Math.round((Date.now() - this._cacheTimestamp) / 1000), 's)');
      return this.hierarchyCache!;
    }

    return new Promise((resolve, reject) => {
      try {
        // Use hierarchy level 4 (hsPages recursive) to get complete hierarchy.
        // Level 4 is the only level that returns the full tree with notebooks,
        // sections, and pages on this OneNote version. Lower levels (1, 2) return
        // self-closing Notebook elements without section children.
        // The cascading UI ensures good perceived performance: notebooks and sections
        // populate immediately from cache; pages are filtered without extra COM calls.
        const psScript =
          'try {' +
          '$oneNote = New-Object -ComObject OneNote.Application;' +
          '$xml = "";' +
          '$oneNote.GetHierarchy("", 4, [ref]$xml);' +
          'if ([string]::IsNullOrEmpty($xml)) { Write-Error "Empty XML"; exit 1; }' +
          'Write-Output $xml;' +
          '} catch {' +
          'Write-Error $_.Exception.Message;' +
          'exit 1;' +
          '}';

        // Encode script as Base64 to avoid escaping issues
        const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

        // Execute using Base64 encoded command (-NoProfile -NonInteractive for faster startup)
        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        }, (error: ExecFileException | null, stdout: string, stderr: string) => {
          if (error) {
            console.error('PowerShell error:', error);
            console.error('stderr:', stderr);
            reject(new Error(stderr || error.message));
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            console.error('No output from PowerShell script');
            console.error('This could mean:');
            console.error('1. OneNote is not running');
            console.error('2. OneNote COM object failed to initialize');
            console.error('3. GetHierarchy returned empty data');
            reject(new Error('No data returned from OneNote. Make sure OneNote is running and has at least one notebook.'));
            return;
          }

          try {
            const notebooks = parseOneNoteHierarchy(stdout);
            // Cache the entire hierarchy (notebooks + sections + pages)
            this.hierarchyCache = notebooks;
            this._cacheTimestamp = Date.now();
            resolve(notebooks);
          } catch (parseError: unknown) {
            console.error('Parse error:', getErrorMessage(parseError));
            reject(toError(parseError));
          }
        });
      } catch (error: unknown) {
        console.error('getWindowsNotebooks error:', getErrorMessage(error));
        reject(toError(error));
      }
    });
  }

  private async getMacNotebooks(): Promise<LocalOneNoteNotebook[]> {
    return new Promise((resolve, reject) => {
      try {
        // Use AppleScript to interact with OneNote
        const script = `
          tell application "Microsoft OneNote"
            set notebookList to {}
            repeat with nb in notebooks
              set end of notebookList to name of nb
            end repeat
            return notebookList as string
          end tell
        `;

        exec(`osascript -e '${script}'`, { encoding: 'utf-8' }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }

          const notebooks: LocalOneNoteNotebook[] = stdout
            .split(',')
            .map((name: string) => ({
              id: name.trim(),
              name: name.trim()
            }))
            .filter((n: LocalOneNoteNotebook) => n.name);

          resolve(notebooks);
        });
      } catch (error: unknown) {
        reject(toError(error));
      }
    });
  }

  /**
   * Get sections from a specific notebook
   */
  async getSections(notebookId: string): Promise<LocalOneNoteSection[]> {
    try {
      if (this.isWindows) {
        return await this.getWindowsSections(notebookId);
      } else if (this.isMac) {
        return await this.getMacSections(notebookId);
      }
      return [];
    } catch (error: unknown) {
      console.error('Failed to get sections:', getErrorMessage(error));
      throw new Error(`Failed to get sections: ${getErrorMessage(error)}`);
    }
  }

  private async getWindowsSections(notebookId: string): Promise<LocalOneNoteSection[]> {
    // If we have cached hierarchy, extract sections from cache
    if (this.hierarchyCache && this.hierarchyCache.length > 0) {
      const cachedNotebook = this.hierarchyCache.find(nb => nb.id === notebookId);
      if (cachedNotebook && cachedNotebook.sections) {
        return cachedNotebook.sections;
      }
    }

    // Fallback: fetch from OneNote if cache is not available
    return new Promise((resolve, reject) => {
      try {
        // Use Base64 encoding to avoid escaping issues with notebook IDs containing special characters
        const safeId = OneNoteLocalService.sanitizeForPs(notebookId);
        const psScript =
          'try {' +
          '$oneNote = New-Object -ComObject OneNote.Application;' +
          '$xml = "";' +
          `$oneNote.GetHierarchy("${safeId}", 1, [ref]$xml);` +
          'if ([string]::IsNullOrEmpty($xml)) { Write-Error "Empty XML"; exit 1; }' +
          'Write-Output $xml;' +
          '} catch {' +
          'Write-Error $_.Exception.Message;' +
          'exit 1;' +
          '}';

        const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            console.error('PowerShell sections error:', error);
            console.error('stderr:', stderr);
            reject(new Error(stderr || error.message));
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            reject(new Error('No sections data returned from OneNote.'));
            return;
          }

          try {
            const sections = parseOneNoteSections(stdout);
            resolve(sections);
          } catch (parseError: unknown) {
            console.error('Parse sections error:', getErrorMessage(parseError));
            reject(toError(parseError));
          }
        });
      } catch (error: unknown) {
        console.error('getWindowsSections error:', getErrorMessage(error));
        reject(toError(error));
      }
    });
  }

  private async getMacSections(notebookId: string): Promise<LocalOneNoteSection[]> {
    return new Promise((resolve, reject) => {
      try {
        const script = `
          tell application "Microsoft OneNote"
            set nb to notebook "${notebookId}"
            set sectionList to {}
            repeat with s in sections of nb
              set end of sectionList to name of s
            end repeat
            return sectionList as string
          end tell
        `;

        exec(`osascript -e '${script}'`, { encoding: 'utf-8' }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }

          const sections: LocalOneNoteSection[] = stdout
            .split(',')
            .map((name: string) => ({
              id: name.trim(),
              name: name.trim(),
              notebookId: notebookId
            }))
            .filter((s: LocalOneNoteSection) => s.name);

          resolve(sections);
        });
      } catch (error: unknown) {
        reject(toError(error));
      }
    });
  }

  /**
   * Get pages from a specific section
   */
  async getPages(sectionId: string): Promise<LocalOneNotePage[]> {
    try {
      if (this.isWindows) {
        return await this.getWindowsPages(sectionId);
      } else if (this.isMac) {
        return await this.getMacPages(sectionId);
      }
      return [];
    } catch (error: unknown) {
      console.error('Failed to get pages:', getErrorMessage(error));
      throw new Error(`Failed to get pages: ${getErrorMessage(error)}`);
    }
  }

  private async getWindowsPages(sectionId: string): Promise<LocalOneNotePage[]> {
    // Check if pages are already loaded in the hierarchy cache
    if (this.hierarchyCache) {
      for (const notebook of this.hierarchyCache) {
        if (notebook.sections) {
          const targetSection = notebook.sections.find(s => s.id === sectionId);
          if (targetSection?.pages) {
            return targetSection.pages;
          }
        }
      }
    }

    // Deduplicate in-flight requests for the same section
    const inflight = this._pagesInFlight.get(sectionId);
    if (inflight) return inflight;

    const promise = this._fetchPagesForSection(sectionId);
    this._pagesInFlight.set(sectionId, promise);
    try {
      return await promise;
    } finally {
      this._pagesInFlight.delete(sectionId);
    }
  }

  /** Fetch pages for a single section via PowerShell + COM, then populate the cache. */
  private async _fetchPagesForSection(sectionId: string): Promise<LocalOneNotePage[]> {
    return new Promise((resolve, reject) => {
      try {
        // Use hierarchy level 2 (hsPages) with sectionId to get only the target section's pages
        const safeSectionId = OneNoteLocalService.sanitizeForPs(sectionId);
        const psScript =
          'try {' +
          '$oneNote = New-Object -ComObject OneNote.Application;' +
          '$xml = "";' +
          `$oneNote.GetHierarchy("${safeSectionId}", 2, [ref]$xml);` +
          'if ([string]::IsNullOrEmpty($xml)) { Write-Error "Empty XML"; exit 1; }' +
          'Write-Output $xml;' +
          '} catch {' +
          'Write-Error $_.Exception.Message;' +
          'exit 1;' +
          '}';

        const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            console.error('PowerShell pages error:', error);
            console.error('stderr:', stderr);
            reject(new Error(stderr || error.message));
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            reject(new Error('No pages data returned from OneNote.'));
            return;
          }

          try {
            const pages = parseOneNotePages(stdout);

            // Populate the hierarchy cache with loaded pages for this section,
            // so subsequent getWindowsPages() calls for the same section are instant.
            if (this.hierarchyCache) {
              for (const notebook of this.hierarchyCache) {
                if (notebook.sections) {
                  const sec = notebook.sections.find(s => s.id === sectionId);
                  if (sec) {
                    sec.pages = pages;
                    break;
                  }
                }
              }
            }

            resolve(pages);
          } catch (parseError: unknown) {
            console.error('Parse pages error:', getErrorMessage(parseError));
            reject(toError(parseError));
          }
        });
      } catch (error: unknown) {
        console.error('getWindowsPages error:', getErrorMessage(error));
        reject(toError(error));
      }
    });
  }

  private async getMacPages(sectionId: string): Promise<LocalOneNotePage[]> {
    return new Promise((resolve, reject) => {
      try {
        const script = `
          tell application "Microsoft OneNote"
            set s to section "${sectionId}"
            set pageList to {}
            repeat with p in pages of s
              set end of pageList to name of p
            end repeat
            return pageList as string
          end tell
        `;

        exec(`osascript -e '${script}'`, { encoding: 'utf-8' }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }

          const pages: LocalOneNotePage[] = stdout
            .split(',')
            .map((name: string) => ({
              id: name.trim(),
              title: name.trim(),
              sectionId: sectionId
            }))
            .filter((p: LocalOneNotePage) => p.title);

          resolve(pages);
        });
      } catch (error: unknown) {
        reject(toError(error));
      }
    });
  }

  /**
   * Get page content as HTML
   */
  async getPageContent(pageId: string): Promise<string> {
    try {
      if (this.isWindows) {
        return await this.getWindowsPageContent(pageId);
      } else if (this.isMac) {
        return await this.getMacPageContent(pageId);
      }
      return '';
    } catch (error: unknown) {
      console.error('Failed to get page content:', getErrorMessage(error));
      throw new Error(`Failed to get page content: ${getErrorMessage(error)}`);
    }
  }

  private _lastPageUrl: string = '';
  private _lastPageImage: string = '';

  getLastPageUrl(): string {
    return this._lastPageUrl;
  }

  getLastPageImage(): string {
    return this._lastPageImage;
  }

  /** Helper: get the path to the C++ helper binary. */
  private getExePath(): string {
    return this._pluginDir + '/onenote-repos.exe';
  }

  /** Check whether both helper executables exist. */
  hasExeFiles(): boolean {
    return fs.existsSync(this._pluginDir + '/onenote-repos.exe')
      && fs.existsSync(this._pluginDir + '/win-embed-overlay.exe');
  }

  /** Helper: run the C++ binary with the given subcommand and return stdout. */
  private runExe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const exePath = this.getExePath();
      try {
        execFile(exePath, args, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
          windowsHide: true
        }, (error: ExecError | null, stdout: string, stderr: string) => {
          const output = (stdout || '').trim();
          if (stderr) console.error('[OneNote C++] stderr:', stderr.trim());
          if (error) {
            console.error('[OneNote C++] exec error:', error.message, 'code:', error.code);
          }
          if (output.startsWith('ERR:')) {
            reject(new Error(output.substring(4)));
          } else if (error) {
            reject(new Error(error.message));
          } else {
            resolve(output);
          }
        });
      } catch (error: unknown) {
        console.error('[OneNote C++] spawn error:', error);
        reject(error instanceof Error ? error : new Error(getErrorMessage(error)));
      }
    });
  }

  /** Find the OneNote window HWND using repos.exe show-window command.
   *  show-window ensures the window is visible and at a valid position
   *  (handles cold start where CFrame may be at -21333,-21333 or minimized).
   *  Adaptive polling: fast 200ms intervals for quick detection when OneNote
   *  is already running, then 500ms for cold start scenarios (~14s total). */
  async findOneNoteWindowHwnd(): Promise<string> {
    const fastAttempts = 8;     // 8 × 200ms = 1.6s for quick detection
    const slowAttempts = 25;    // 25 × 500ms = 12.5s for cold start
    const maxRetries = fastAttempts + slowAttempts;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const output = await this.runExe(['show-window']);
        if (output.startsWith('OK:')) {
          return output.substring(3);
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(getErrorMessage(error));
      }
      if (attempt < maxRetries) {
        const delayMs = attempt <= fastAttempts ? 200 : 500;
        if (attempt % 5 === 0) {
          console.log(`[OneNote Embed] show-window: ${attempt} attempts so far...`);
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
      }
    }
    throw lastError ?? new Error('OneNote window not found after ' + maxRetries + ' attempts');
  }

  /**
   * Get Obsidian's main window handle for z-order reference.
   * Uses Electron's remote.getCurrentWindow() to get the native window handle.
   */
  getObsidianWindowHwnd(): string | null {
    // Try multiple strategies to get the Obsidian window handle
    const strategies: Array<() => ElectronWindow | null | undefined> = [];

    for (const getWin of strategies) {
      try {
        const win = getWin();
        if (win) {
          const hwnd = win.getNativeWindowHandle();
          if (hwnd && hwnd.length >= 4) {
            const handle = hwnd.readUInt32LE(0);
            return handle.toString();
          }
        }
      } catch {
        // Strategy not available, try next
      }
    }

    console.warn('[OneNote] Could not get Obsidian window handle');
    return null;
  }

  /**
   * Embed the OneNote window using the new win-embed.exe flow:
   *   1. Navigate OneNote to the page via COM (repos.exe navigate)
   *   2. Find the OneNote window HWND (repos.exe find-window)
   *   3. Embed that HWND (win-embed.exe embed <hwnd>)
   *
   * @param skipStabilization - Skip the 500ms post-nav pause and 3-round
   *   stabilization loop. Use for reattach where OneNote is already running —
   *   the findOneNoteWindowHwnd polling is sufficient. Saves ~1.1s.
   *
   * Returns the OneNote HWND for tracking.
   */
  async embedOneNoteWindow(pageId: string, skipStabilization: boolean = false): Promise<string> {
    if (!this._embedManager) {
      throw new Error('Plugin directory not set — call setPluginDir() first');
    }

    // Step 1: Navigate OneNote to the target page via COM.
    // If OneNote is not yet running, the COM call may fail — retry a few times
    // to give OneNote time to start up.
    let navigated = false;
    const maxNavRetries = 3;
    for (let i = 1; i <= maxNavRetries; i++) {
      navigated = await this.navigateToPage(pageId);
      if (navigated) break;
      if (i < maxNavRetries) {
        console.log(`[OneNote Embed] Navigate attempt ${i} failed, retrying in 1s...`);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1000));
      }
    }
    if (!navigated) {
      throw new Error('Failed to navigate OneNote to page — make sure OneNote is running');
    }

    if (!skipStabilization) {
      // Brief pause for OneNote to finish navigating and create its CFrame window.
      // Skipped for reattach — findOneNoteWindowHwnd polling handles the wait.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    }

    // Step 2: Find the OneNote window HWND
    let hwnd = await this.findOneNoteWindowHwnd();

    if (!skipStabilization) {
      // Step 2b: Stabilization — re-verify the window after a delay.
      // During cold start, OneNote may still be loading the page or repositioning
      // its window. We check again to confirm the window is stable before embedding.
      for (let stabAttempt = 0; stabAttempt < 3; stabAttempt++) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
        try {
          const verifyOutput = await this.runExe(['show-window']);
          if (verifyOutput.startsWith('OK:')) {
            const verifyHwnd = verifyOutput.substring(3);
            if (verifyHwnd === hwnd) {
              break;  // Same window still present — stable
            }
            hwnd = verifyHwnd;  // Window changed (rare), use new one
          }
        } catch {
          // Verification failed, proceed with original HWND
          break;
        }
      }
    }

    // Get Obsidian window handle for z-order reference
    const obsHwnd = this.getObsidianWindowHwnd();

    // Step 3: Embed the window via win-embed.exe
    const resultHwnd = await this._embedManager.embedWindow(hwnd, obsHwnd || undefined);
    return resultHwnd;
  }

  /**
   * Reparent the embedded OneNote window into Obsidian's main window.
   * Delegates to WindowEmbedManager which sends REPARENT via stdin.
   */
  async reparentOneNoteWindow(hostHwnd?: string): Promise<void> {
    if (!this._embedManager?.isRunning()) return;
    try {
      await this._embedManager.reparent(hostHwnd);
    } catch (error: unknown) {
      console.warn('[OneNote Embed] REPARENT failed:', getErrorMessage(error));
    }
  }

  /**
   * Reposition the embedded OneNote window to match a DOM container's position.
   * Delegates to WindowEmbedManager which writes coordinates to stdin.
   */
  async repositionOneNoteWindow(x: number, y: number, width: number, height: number): Promise<void> {
    if (!this._embedManager?.isRunning()) return;
    await this._embedManager.reposition(x, y, width, height);
  }

  /**
   * Detach the embedded OneNote window back to a standalone window.
   * Delegates to WindowEmbedManager which sends EXIT and waits for cleanup.
   */
  async detachOneNoteWindow(): Promise<void> {
    if (!this._embedManager?.isRunning()) return;
    await this._embedManager.detach();
    this._embedSession.reset();
  }

  /**
   * Stop the embed process immediately (force kill after graceful attempt).
   */
  private stopEmbedProcess(): void {
    if (this._embedManager) {
      this._embedManager.stop();
    }
    this._embedSession.reset();
  }

  /**
   * Force stop the embed manager (public method for plugin unload cleanup).
   */
  forceStopEmbedManager(): void {
    this.stopEmbedProcess();
  }

  /**
   * Quit OneNote application entirely using the C++ helper.
   * If a window is embedded, it will be detached first.
   */
  async quitOneNote(): Promise<void> {
    // Stop embed process first (destroys overlay, detaches OneNote)
    this.stopEmbedProcess();
    try {
      await this.runExe(['quit']);
    } catch (error: unknown) {
      console.warn('[OneNote Embed] Quit error:', getErrorMessage(error));
    }
  }

  private async getWindowsPageContent(pageId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // PowerShell: get URL + XML content
        const safeId = OneNoteLocalService.sanitizeForPs(pageId);
        const psScript =
          '$one = New-Object -ComObject OneNote.Application;' +
          '$url = "";' +
          'try {' +
          `  $one.GetHyperlinkToObject("${safeId}", "", [ref]$url);` +
          '} catch {};' +
          'Write-Output ("URL:" + $url);' +
          '$xml = "";' +
          `  $one.GetPageContent("${safeId}", [ref]$xml, 7);` +
          'Write-Output $xml';

        const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');

        exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            console.error('PowerShell error:', error);
            console.error('stderr:', stderr);
            reject(new Error(stderr || error.message));
            return;
          }

          if (!stdout || stdout.trim().length === 0) {
            reject(new Error('No content returned from OneNote.'));
            return;
          }

          // Parse: first line is "URL:<url>", rest is XML
          const firstNewline = stdout.indexOf('\n');
          const firstLine = firstNewline >= 0 ? stdout.substring(0, firstNewline).trim() : stdout.trim();
          const xmlContent = firstNewline >= 0 ? stdout.substring(firstNewline + 1) : '';

          let pageUrl = '';
          if (firstLine.startsWith('URL:')) {
            pageUrl = firstLine.substring(4).trim();
          }
          this._lastPageUrl = pageUrl;
          this._lastPageImage = '';

          if (!xmlContent || xmlContent.trim().length === 0) {
            reject(new Error('No XML content returned from OneNote.'));
            return;
          }

          const html = parseOneNotePageXml(xmlContent);
          resolve(html);
        });
      } catch (error: unknown) {
        console.error('getWindowsPageContent error:', getErrorMessage(error));
        reject(toError(error));
      }
    });
  }

  private async getMacPageContent(pageId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const script = `
          tell application "Microsoft OneNote"
            set p to page "${pageId}"
            return content of p
          end tell
        `;

        exec(`osascript -e '${script}'`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (error: ExecError | null, stdout: string, stderr: string) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }
          resolve(stdout);
        });
      } catch (error: unknown) {
        reject(toError(error));
      }
    });
  }

  /**
   * Open page in OneNote application
   */
  async openPageInOneNote(pageId: string): Promise<boolean> {
    try {
      if (this.isWindows) {
        execFile('cmd.exe', ['/c', 'start', '', `onenote:${pageId}`], {
          windowsHide: true
        });
        return true;
      } else if (this.isMac) {
        exec(`open -a "Microsoft OneNote" "onenote:${pageId}"`);
        return true;
      }
      return false;
    } catch (error: unknown) {
      console.error('Failed to open page in OneNote:', getErrorMessage(error));
      new Notice(`Failed to open OneNote: ${getErrorMessage(error)}`);
      return false;
    }
  }

  async openOneNoteApp(): Promise<boolean> {
    try {
      if (this.isWindows) {
        execFile('cmd.exe', ['/c', 'start', '', 'onenote:'], {
          windowsHide: true
        });
        return true;
      } else if (this.isMac) {
        exec('open -a "Microsoft OneNote"');
        return true;
      }
      return false;
    } catch (error: unknown) {
      console.error('Failed to open OneNote app:', getErrorMessage(error));
      new Notice(`Failed to open OneNote: ${getErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Get platform information
   */
  getPlatformInfo(): { platform: string; platformSupportsOneNote: boolean } {
    let platform = 'unknown';
    if (this.isWindows) platform = 'windows';
    else if (this.isMac) platform = 'mac';

    return {
      platform,
      // Note: This indicates platform support, not actual OneNote installation.
      // Use checkOneNoteAvailability() for actual installation check.
      platformSupportsOneNote: this.isWindows || this.isMac
    };
  }
}
