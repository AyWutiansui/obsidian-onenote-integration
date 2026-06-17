/**
 * Calculate the Electron chrome offset (title bar + toolbar height).
 * getBoundingClientRect returns viewport-relative coords; we need screen-absolute.
 * 
 * On Windows Chromium, window.screenX/Y and outerHeight are in physical pixels,
 * innerHeight is in CSS pixels. Win32 SetWindowPos expects physical pixels.
 * Electron's getContentBounds() returns physical pixels directly.
 */
export function calculateChromeOffset(): { x: number; y: number } {
  // Strategy 1: Try electron.remote (available when enableRemoteModule=true)
  try {
    const electron = require('electron');
    const win = electron.remote?.getCurrentWindow?.();
    if (win) {
      const bounds = win.getContentBounds();
      if (bounds && (bounds.x !== 0 || bounds.y !== 0)) {
        // getContentBounds() returns physical pixels — use directly
        return { x: bounds.x, y: bounds.y };
      }
    }
  } catch {
    // Electron remote not available
  }

  // Strategy 2: Try @electron/remote (newer API)
  try {
    const remote = require('@electron/remote');
    const win = remote?.getCurrentWindow?.();
    if (win) {
      const bounds = win.getContentBounds();
      if (bounds && (bounds.x !== 0 || bounds.y !== 0)) {
        return { x: bounds.x, y: bounds.y };
      }
    }
  } catch {
    // @electron/remote not available
  }

  // Strategy 3: Use window.screenX/Y + chrome height
  // outerHeight and screenX/Y are in physical pixels on Windows Chromium,
  // innerHeight is in CSS pixels. Chrome height = outerHeight - innerHeight (physical).
  const chromeH = window.outerHeight - window.innerHeight;
  return { x: window.screenX, y: window.screenY + chromeH };
}

/**
 * CoordinateTracker — Tracks a DOM element's screen-absolute position
 * and reports changes via callback. Handles scroll, resize, sidebar toggles,
 * layout shifts, and off-screen hiding.
 * 
 * Uses multiple strategies for maximum stability:
 * 1. ResizeObserver on the container
 * 2. Scroll listeners (capture phase)
 * 3. MutationObserver on document body (catches sidebar toggles, class changes)
 * 4. requestAnimationFrame polling as fallback (detects any visual change)
 */
export class CoordinateTracker {
  private _container: HTMLElement;
  private _callback: (x: number, y: number, w: number, h: number) => void;
  private _offset: { x: number; y: number };
  private _scrollHandler: () => void;
  private _resizeObserver: ResizeObserver;
  private _mutationObserver: MutationObserver;
  private _rafId: number | null = null;
  private _scrollAncestors: HTMLElement[] = [];
  private _lastRect: DOMRectReadOnly | null = null;
  private _lastDpr: number = 0;
  private _disposed: boolean = false;

  constructor(
    container: HTMLElement,
    callback: (x: number, y: number, w: number, h: number) => void
  ) {
    this._container = container;
    this._callback = callback;
    this._offset = calculateChromeOffset();

    this._scrollHandler = () => this.update();
    
    // Strategy 1: ResizeObserver on container
    this._resizeObserver = new ResizeObserver(() => this.update());
    this._resizeObserver.observe(container);

    // Strategy 2: Scroll listeners (all scrollable ancestors)
    window.addEventListener('scroll', this._scrollHandler, true);
    this._observeScrollAncestors(container);

    // Strategy 3: MutationObserver on document body (sidebar toggles, class changes)
    this._mutationObserver = new MutationObserver((mutations) => {
      // Check if any mutation might affect layout
      const affectsLayout = mutations.some(m => 
        m.type === 'attributes' && (
          m.attributeName === 'class' || 
          m.attributeName === 'style' ||
          m.attributeName === 'data-'
        ) ||
        m.type === 'childList' ||
        m.type === 'characterData'
      );
      if (affectsLayout) {
        this.update();
      }
    });
    this._mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true,
      characterData: true
    });

    // Strategy 4: rAF polling as safety net (low frequency to avoid perf issues)
    this._startPolling();

    // Initial position
    this.update();
  }

  /** Attach scroll listeners to all scrollable ancestor elements. */
  private _observeScrollAncestors(element: HTMLElement): void {
    let parent = element.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflow === 'scroll' ||
          style.overflowY === 'auto' || style.overflowY === 'scroll') {
        parent.addEventListener('scroll', this._scrollHandler, true);
        this._scrollAncestors.push(parent);
      }
      parent = parent.parentElement;
    }
  }

  /** Start low-frequency rAF polling to catch any visual changes. */
  private _startPolling(): void {
    const poll = () => {
      if (this._disposed) return;
      this.update();
      // Poll every 500ms - frequent enough to catch layout shifts, slow enough for perf
      this._rafId = window.setTimeout(poll, 500);
    };
    this._rafId = window.setTimeout(poll, 500);
  }

  /** Force send position even if coordinates haven't changed (bypasses cache). */
  forceUpdate(): void {
    if (this._disposed || !this._container.isConnected) return;
    this._lastRect = null;  // Invalidate cache to force callback
    this.update();
  }

  /** Recalculate and report position. Only fires callback if position changed. */
  update(): void {
    if (this._disposed || !this._container.isConnected) return;

    const rect = this._container.getBoundingClientRect();
    const currentDpr = window.devicePixelRatio || 1;

    // Skip if position hasn't changed (avoid redundant updates)
    // Also check DPR — it changes when window moves between monitors
    if (this._lastRect &&
        currentDpr === this._lastDpr &&
        Math.round(rect.left) === Math.round(this._lastRect.left) &&
        Math.round(rect.top) === Math.round(this._lastRect.top) &&
        Math.round(rect.width) === Math.round(this._lastRect.width) &&
        Math.round(rect.height) === Math.round(this._lastRect.height)) {
      return;
    }
    this._lastRect = rect;
    this._lastDpr = currentDpr;

    // Hide OneNote when code block is mostly out of view
    // Allow some overflow but hide when significantly off-screen
    const headerHeight = 40;  /* Minimum visible portion */
    const mostlyInViewport = 
      rect.bottom > headerHeight &&  /* At least headerHeight pixels visible from top */
      rect.top < window.innerHeight - headerHeight &&  /* At least headerHeight pixels visible from bottom */
      rect.right > 0 && 
      rect.left < window.innerWidth;

    if (!mostlyInViewport) {
      // Code block mostly off-screen - hide OneNote
      this._callback(-10000, -10000, 1, 1);
      return;
    }

    // Convert CSS pixels to physical pixels (Win32 API uses physical pixels)
    // currentDpr already defined at top of update()

    // Account for border width: getBoundingClientRect() returns outer border edge,
    // but OneNote should align to the inner content area (inside the border)
    const style = getComputedStyle(this._container);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;

    // Calculate where OneNote window would be positioned (physical pixels)
    // Offset inward by border width, reduce width by left+right borders
    const physLeft = Math.round((rect.left + borderLeft) * currentDpr);
    const physTop = Math.round((rect.top + borderTop) * currentDpr);
    const physWidth = Math.round((rect.width - borderLeft - borderRight) * currentDpr);
    const embedHeight = Math.max(400, Math.min(1200, Math.round((rect.width - borderLeft - borderRight) * (2/3) * currentDpr)));
    const oneNoteTop = physTop + this._offset.y;
    const oneNoteBottom = oneNoteTop + embedHeight;

    // Check if OneNote window would overflow screen boundaries
    // screen.availWidth/availHeight may be in CSS pixels in Chromium with DPR != 1,
    // so multiply by DPR to convert to physical pixels (matching oneNoteTop etc.)
    const screen = window.screen as any;
    const screenLeft = (screen.availLeft ?? 0) * currentDpr;
    const screenTop = (screen.availTop ?? 0) * currentDpr;
    const screenRight = screenLeft + (window.screen.availWidth || window.innerWidth) * currentDpr;
    const screenBottom = screenTop + (window.screen.availHeight || window.innerHeight) * currentDpr;

    // Hide OneNote if it would overflow above screen or below screen
    if (oneNoteTop < screenTop || oneNoteBottom > screenBottom ||
        physLeft + this._offset.x < screenLeft ||
        physLeft + this._offset.x + physWidth > screenRight) {
      console.log(`[CoordinateTracker] Hiding: OneNote would overflow (top=${oneNoteTop}, bottom=${oneNoteBottom}, screen=${screenTop}-${screenBottom})`);
      this._callback(-10000, -10000, 1, 1);
      return;
    }

    // Safe to show OneNote (all values in physical pixels)
    this._callback(
      physLeft + this._offset.x,
      oneNoteTop,
      physWidth,
      embedHeight
    );
  }

  /** Remove all listeners and stop tracking. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    if (this._rafId !== null) {
      clearTimeout(this._rafId);
      this._rafId = null;
    }

    window.removeEventListener('scroll', this._scrollHandler, true);
    for (const ancestor of this._scrollAncestors) {
      ancestor.removeEventListener('scroll', this._scrollHandler, true);
    }
    this._scrollAncestors = [];
    this._resizeObserver.disconnect();
    this._mutationObserver.disconnect();
  }
}
