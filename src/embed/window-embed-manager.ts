import { spawn, ChildProcess } from 'child_process';

/**
 * WindowEmbedManager — TypeScript interface to win-embed-overlay.exe.
 *
 * Spawns win-embed-overlay.exe as a long-running child process with piped stdin/stdout.
 * Uses an owned-popup overlay window strategy for proper z-order management:
 * - Creates a borderless WS_POPUP overlay owned by Obsidian's main window
 * - Reparents OneNote into the overlay
 * - Windows DWM automatically handles z-order so overlay appears below Obsidian modals
 *
 * The protocol:
 *   stdout: "OK:<hwnd>" (initial success), "ERR:<msg>" (failure),
 *           "REPARENT_OK", "REPARENT_ERR", "DETACH_OK", "DETACH_ERR"
 *   stdin:  "x,y,w,h\n" (reposition), "REPARENT\n" or "REPARENT <hostHwnd>\n",
 *           "DETACH\n", "EXIT\n"
 */
export class WindowEmbedManager {
  private _pluginDir: string;
  private _child: ChildProcess | null = null;
  private _stdoutBuffer: string = '';
  private _pendingReparentResolve: (() => void) | null = null;
  private _pendingReparentReject: ((err: Error) => void) | null = null;
  private _running: boolean = false;

  constructor(pluginDir: string) {
    this._pluginDir = pluginDir;
  }

  /** Get path to win-embed-overlay.exe */
  private getExePath(): string {
    return this._pluginDir + '/win-embed-overlay.exe';
  }

  /**
   * Embed a window by HWND. Spawns win-embed-overlay.exe embed <hwnd> [obsHwnd].
   * Creates an owned-popup overlay window for proper z-order management.
   * Resolves with the HWND string on success, rejects on ERR or timeout.
   * 
   * @param hwnd - Target window to embed (OneNote)
   * @param obsHwnd - Optional Obsidian window handle for z-order reference
   */
  async embedWindow(hwnd: string, obsHwnd?: string): Promise<string> {
    // Stop any existing process first
    this.stop();

    const exePath = this.getExePath();
    const args = obsHwnd ? ['embed', hwnd, obsHwnd] : ['embed', hwnd];

    return new Promise<string>((resolve, reject) => {
      const child = spawn(exePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this._child = child;
      this._stdoutBuffer = '';
      this._pendingReparentResolve = null;
      this._pendingReparentReject = null;
      this._running = true;
      let settled = false;

      child.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (!msg) return;
        const lower = msg.toLowerCase();
        if (lower.includes('error') || lower.includes('fail') || lower.includes('err:')) {
          console.error('[WinEmbed] stderr:', msg);
        }
      });

      child.stdout?.on('data', (data: Buffer) => {
        this._stdoutBuffer += data.toString('utf-8');

        let newlineIndex = this._stdoutBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const rawLine = this._stdoutBuffer.slice(0, newlineIndex);
          this._stdoutBuffer = this._stdoutBuffer.slice(newlineIndex + 1);

          const line = rawLine.trim();
          if (!line) {
            newlineIndex = this._stdoutBuffer.indexOf('\n');
            continue;
          }

          if (!settled) {
            settled = true;
            if (line.startsWith('OK:')) {
              resolve(line.substring(3));
            } else if (line.startsWith('ERR:')) {
              this._running = false;
              this._child = null;
              reject(new Error(line.substring(4)));
            } else {
              this._running = false;
              this._child = null;
              reject(new Error('Unexpected embed output: ' + line));
            }
          } else if (line === 'REPARENT_OK') {
            this._pendingReparentResolve?.();
            this._pendingReparentResolve = null;
            this._pendingReparentReject = null;
          } else if (line === 'REPARENT_ERR') {
            this._pendingReparentReject?.(new Error('Reparent failed'));
            this._pendingReparentResolve = null;
            this._pendingReparentReject = null;
          } else if (line === 'DETACH_OK') {
            // Detach completed successfully
          } else if (line === 'DETACH_ERR') {
            console.warn('[WinEmbed] Detach reported error');
          }

          newlineIndex = this._stdoutBuffer.indexOf('\n');
        }
      });

      child.on('exit', (code: number | null) => {
        this._child = null;
        this._running = false;
        if (this._pendingReparentReject) {
          this._pendingReparentReject(new Error(`Embed process exited before reparent completed (code ${code})`));
          this._pendingReparentResolve = null;
          this._pendingReparentReject = null;
        }
        if (!settled) {
          settled = true;
          reject(new Error('Embed process exited'));
        }
      });

      child.on('error', (err: Error) => {
        console.error('[WinEmbed] process error:', err);
        this._child = null;
        this._running = false;
        if (this._pendingReparentReject) {
          this._pendingReparentReject(err);
          this._pendingReparentResolve = null;
          this._pendingReparentReject = null;
        }
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      // Timeout after 10 seconds
      window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.stop();
          reject(new Error('Embed timed out after 10s'));
        }
      }, 10000);
    });
  }

  /**
   * Reparent the embedded window into the host (Obsidian).
   * Sends REPARENT via stdin. If hostHwnd is provided, reparents into that specific window.
   */
  async reparent(hostHwnd?: string): Promise<void> {
    if (!this._child?.stdin?.writable) {
      throw new Error('Embed process not running');
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this._pendingReparentResolve = null;
        this._pendingReparentReject = null;
        reject(new Error('Reparent timed out after 5s'));
      }, 5000);

      this._pendingReparentResolve = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      this._pendingReparentReject = (err: Error) => {
        window.clearTimeout(timeout);
        reject(err);
      };

      try {
        const cmd = hostHwnd ? `REPARENT ${hostHwnd}\n` : 'REPARENT\n';
        this._child!.stdin!.write(cmd);
      } catch (error) {
        window.clearTimeout(timeout);
        this._pendingReparentResolve = null;
        this._pendingReparentReject = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Reposition the embedded window to screen-absolute coordinates.
   * Writes "x,y,w,h\n" to stdin (< 0.1ms, no spawn overhead).
   */
  async reposition(x: number, y: number, w: number, h: number): Promise<void> {
    if (!this._child?.stdin?.writable) return;
    try {
      this._child.stdin.write(
        `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}\n`
      );
    } catch {
      // Process may have exited — ignore
    }
  }

  /**
   * Detach the embedded window (restore original styles).
   * Sends DETACH command to restore window styles, then EXIT to terminate
   * the win-embed.exe helper process.
   * 
   * NOTE: This does NOT close OneNote application. OneNote continues running
   * with its window restored as a normal top-level window.
   */
  async detach(): Promise<void> {
    if (!this._child) {
      return;
    }

    const child = this._child;

    return new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        console.warn('[WinEmbed] detach timed out, force killing');
        try { child.kill(); } catch {
          // ignore kill failures during timeout cleanup
        }
        this._child = null;
        this._running = false;
        resolve();
      }, 3000);

      child.on('exit', () => {
        window.clearTimeout(timeout);
        this._child = null;
        this._running = false;
        resolve();
      });

      try {
        // First send DETACH to restore window styles
        child.stdin?.write('DETACH\n');
        // Then send EXIT to terminate the process
        window.setTimeout(() => {
          try {
            child.stdin?.write('EXIT\n');
            child.stdin?.end();
          } catch {
            // ignore EXIT write failures during shutdown
          }
        }, 200);
      } catch (error) {
        console.error('[WinEmbed] detach write error:', error);
        window.clearTimeout(timeout);
        try { child.kill(); } catch {
          // ignore kill failures during error cleanup
        }
        this._child = null;
        this._running = false;
        resolve();
      }
    });
  }

  /** Check if the embed process is still running. */
  isRunning(): boolean {
    return this._running && this._child !== null;
  }

  /** Force stop the embed process without waiting for cleanup. */
  stop(): void {
    if (this._child) {
      const child = this._child;
      
      // Only reject if there's a pending promise AND we haven't settled yet
      if (this._pendingReparentReject && this._pendingReparentResolve) {
        this._pendingReparentReject(new Error('Embed process stopped'));
      }
      this._pendingReparentResolve = null;
      this._pendingReparentReject = null;
      
      try {
        child.stdin?.write('EXIT\n');
        child.stdin?.end();
      } catch {
        // ignore EXIT write failures during stop
      }
      
      // Give it a moment to clean up, then force kill
      window.setTimeout(() => {
        try { 
          if (!child.killed) child.kill(); 
        } catch {
          // ignore kill failures during stop
        }
      }, 500);
      
      this._child = null;
    }
    this._stdoutBuffer = '';
    this._running = false;
  }
}
