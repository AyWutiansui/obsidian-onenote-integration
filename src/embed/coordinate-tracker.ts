/**
 * Calculate the Electron chrome offset (title bar + toolbar height).
 * getBoundingClientRect returns viewport-relative coords; we need screen-absolute.
 * 
 * On Windows Chromium, window.screenX/Y are in CSS pixels (DIP),
 * Win32 SetWindowPos expects physical pixels — multiply by DPR.
 */
export function calculateChromeOffset(): { x: number; y: number } {
  const dpr = window.devicePixelRatio || 1;
  const screen = window.screen as any;

  // Obsidian uses a frameless window: outerHeight === innerHeight always.
  // Maximized detection relies on:
  // 1. Negative screenX/Y (Windows extended frame for maximized windows)
  // 2. Window dimensions matching screen size (fallback for edge cases)
  const availW = screen.availWidth || window.screen.width;
  const availH = screen.availHeight || window.screen.height;
  const matchesScreen = Math.abs(window.innerWidth - availW) < 10 &&
                        Math.abs(window.innerHeight - availH) < 10;
  const isMaximized = window.screenX < 0 || window.screenY < 0 || matchesScreen;

  let offsetX: number;
  let offsetY: number;

  if (isMaximized) {
    // Maximized/fullscreen: content area starts at the available screen area origin
    offsetX = Math.round((screen.availLeft ?? 0) * dpr);
    offsetY = Math.round((screen.availTop ?? 0) * dpr);
  } else {
    // Windowed mode: screenX/Y are in CSS pixels, convert to physical
    const chromeH = window.outerHeight - window.innerHeight;
    offsetX = Math.round(window.screenX * dpr);
    offsetY = Math.round((window.screenY + chromeH) * dpr);
  }

  return { x: offsetX, y: offsetY };
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
  private _scrollHandler: () => void;
  private _resizeHandler: () => void;
  private _resizeObserver: ResizeObserver;
  private _mutationObserver: MutationObserver;
  private _rafId: number | null = null;
  private _scrollAncestors: HTMLElement[] = [];
  private _lastRect: DOMRectReadOnly | null = null;
  private _lastDpr: number = 0;
  private _lastOffsetX: number = NaN;
  private _lastOffsetY: number = NaN;
  private _lastOccluded: boolean = false;
  private _disposed: boolean = false;
  private _pendingRafUpdate: boolean = false;
  private _lastOcclusionCheck: number = 0;
  private _cachedBorderLeft: number = 0;
  private _cachedBorderTop: number = 0;
  private _cachedBorderRight: number = 0;
  private _cachedBorderWidth: number = -1;  // container width when borders were last read
  private _aspectRatio: number;
  private _hostContainer: HTMLElement | null;
  private _hostExtraHeight: number;

  constructor(
    container: HTMLElement,
    callback: (x: number, y: number, w: number, h: number) => void,
    aspectRatio: number = 2 / 3,
    hostContainer: HTMLElement | null = null,
    hostExtraHeight: number = 0
  ) {
    this._container = container;
    this._callback = callback;
    this._aspectRatio = aspectRatio;
    this._hostContainer = hostContainer;
    this._hostExtraHeight = hostExtraHeight;

    this._scrollHandler = () => this.update(true);  // fromScroll: skip expensive isOccluded()
    this._resizeHandler = () => this.update();

    // Strategy 1: ResizeObserver on container
    this._resizeObserver = new ResizeObserver(() => this.update());
    this._resizeObserver.observe(container);

    // Strategy 2: Scroll listeners (all scrollable ancestors)
    window.addEventListener('scroll', this._scrollHandler, true);
    this._observeScrollAncestors(container);

    // Strategy 3: Window resize listener (catches maximize, restore, fullscreen, manual resize)
    window.addEventListener('resize', this._resizeHandler);

    // Strategy 3: MutationObserver on document body (sidebar toggles, class changes)
    // NOTE: We intentionally exclude characterData — editor text changes (keystrokes)
    // don't affect the embed container's position. ResizeObserver + scroll listeners
    // already cover layout shifts from typing. Observing characterData caused every
    // keystroke to trigger repositionOneNoteWindow, leading to focus-stealing bugs.
    this._mutationObserver = new MutationObserver((mutations) => {
      const affectsLayout = mutations.some(m =>
        m.type === 'attributes' && (
          m.attributeName === 'class' ||
          m.attributeName === 'style'
        ) ||
        m.type === 'childList'
      );
      if (affectsLayout) {
        // Debounce via RAF — coalesce rapid DOM mutations into one update per frame
        if (this._pendingRafUpdate) return;
        this._pendingRafUpdate = true;
        requestAnimationFrame(() => {
          this._pendingRafUpdate = false;
          this.update();
        });
      }
    });
    this._mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true,
      characterData: false
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

  /** Known Obsidian overlay selectors that can cover the code block. */
  private static readonly OVERLAY_SELECTORS = [
    '.modal-container',
    '.modal-bg',
    '.suggestion-container',
    '.prompt',                    // command palette
    '.popover',                   // hover preview / page preview
    '.hover-popover',
    '.menu',                      // context menus / dropdown menus
    '.workspace-leaf-resize-handle',
    '.sidebar-toggle-button',
    '.notice-container',
  ];

  /**
   * Check whether the code block is occluded by another Obsidian UI element.
   * Uses two strategies:
   *   1. Check known overlay selectors for bounding-rect overlap.
   *   2. Use elementFromPoint at the centre of the code block to catch
   *      any unexpected overlay (plugins, custom popups, etc.).
   */
  private isOccluded(rect: DOMRectReadOnly): boolean {
    // Strategy 1: known overlay elements
    for (const selector of CoordinateTracker.OVERLAY_SELECTORS) {
      const overlays = document.querySelectorAll(selector);
      for (const el of Array.from(overlays)) {
        const htmlEl = el as HTMLElement;
        // Skip hidden / zero-size elements
        if (htmlEl.offsetWidth === 0 && htmlEl.offsetHeight === 0) continue;
        const style = getComputedStyle(htmlEl);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const oRect = htmlEl.getBoundingClientRect();
        // Check bounding-rect overlap (with a small 10px inset to avoid edge cases)
        if (rect.left + 10 < oRect.right &&
            rect.right - 10 > oRect.left &&
            rect.top + 10 < oRect.bottom &&
            rect.bottom - 10 > oRect.top) {
          return true;
        }
      }
    }

    // Strategy 2: elementFromPoint at the centre of the code block
    if (typeof document.elementFromPoint === 'function') {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && !this._container.contains(topEl)) {
          // Something else is on top of the code block centre
          return true;
        }
      }
    }

    return false;
  }

  /** Force send position even if coordinates haven't changed (bypasses cache). */
  forceUpdate(): void {
    if (this._disposed || !this._container.isConnected) return;
    this._lastRect = null;  // Invalidate cache to force callback
    this.update();
  }

  /** Recalculate and report position. Only fires callback if position changed.
   *  @param fromScroll - If true, skip expensive occlusion check (throttled to every 500ms) */
  update(fromScroll: boolean = false): void {
    if (this._disposed || !this._container.isConnected) return;

    const rect = this._container.getBoundingClientRect();
    const currentDpr = window.devicePixelRatio || 1;

    // Read border widths early — needed for both sync height and native window sizing.
    // getBoundingClientRect returns border-box (outer) dimensions; native window must
    // use inner dimensions (without borders) to avoid overflow.
    if (this._cachedBorderWidth < 0 || Math.round(rect.width) !== this._cachedBorderWidth) {
      const style = getComputedStyle(this._container);
      this._cachedBorderLeft = parseFloat(style.borderLeftWidth) || 0;
      this._cachedBorderTop = parseFloat(style.borderTopWidth) || 0;
      this._cachedBorderRight = parseFloat(style.borderRightWidth) || 0;
      this._cachedBorderWidth = Math.round(rect.width);
    }
    const innerCssWidth = rect.width - this._cachedBorderLeft - this._cachedBorderRight;

    // Sync container heights on every update — fixes initial render timing
    // issue where clientWidth wasn't ready. Runs before all early-return paths.
    // Use inner width (without borders) to match native window height calculation.
    // syncedHeight = total card height (embed area + overhead for title/padding/resize)
    const syncedHeight = Math.max(400, Math.min(1200, Math.round(innerCssWidth * this._aspectRatio)));
    const embedCssHeight = Math.max(200, syncedHeight - this._hostExtraHeight);
    const heightStr = `${embedCssHeight}px`;
    if (this._container.style.height !== heightStr) {
      this._container.style.height = heightStr;
    }
    // Set outer host container height = total card height (embed + overhead)
    if (this._hostContainer) {
      const hostHeightStr = `${syncedHeight}px`;
      if (this._hostContainer.style.height !== hostHeightStr) {
        this._hostContainer.style.height = hostHeightStr;
        this._hostContainer.style.setProperty('max-height', 'none', 'important');
      }
    }

    // Recalculate chrome offset every time — handles maximize/resize/state changes
    const offset = calculateChromeOffset();

    // Throttle expensive occlusion check: skip during rapid scroll events,
    // only re-check every 500ms. The poll loop (500ms) will catch overlays anyway.
    let occluded: boolean;
    const now = Date.now();
    if (fromScroll && (now - this._lastOcclusionCheck) < 500) {
      occluded = this._lastOccluded;
    } else {
      occluded = this.isOccluded(rect);
      this._lastOcclusionCheck = now;
    }

    // Skip if nothing changed (avoid redundant updates)
    if (this._lastRect &&
        currentDpr === this._lastDpr &&
        offset.x === this._lastOffsetX &&
        offset.y === this._lastOffsetY &&
        occluded === this._lastOccluded &&
        Math.round(rect.left) === Math.round(this._lastRect.left) &&
        Math.round(rect.top) === Math.round(this._lastRect.top) &&
        Math.round(rect.width) === Math.round(this._lastRect.width) &&
        Math.round(rect.height) === Math.round(this._lastRect.height)) {
      return;
    }
    this._lastRect = rect;
    this._lastDpr = currentDpr;
    this._lastOffsetX = offset.x;
    this._lastOffsetY = offset.y;
    this._lastOccluded = occluded;

    // Hide OneNote when code block is occluded by another UI element
    if (occluded) {
      this._callback(-10000, -10000, 1, 1);
      return;
    }

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
    const borderLeft = this._cachedBorderLeft;
    const borderTop = this._cachedBorderTop;
    const borderRight = this._cachedBorderRight;

    // Calculate where OneNote window would be positioned (physical pixels)
    // Offset inward by border width, reduce width by left+right borders
    const physLeft = Math.round((rect.left + borderLeft) * currentDpr);
    const physTop = Math.round((rect.top + borderTop) * currentDpr);
    const physWidth = Math.round(innerCssWidth * currentDpr);

    // Height: match embedContainer's CSS pixel height (already reduced by overhead),
    // then convert to physical pixels for the Win32 API
    const embedHeightCss = embedCssHeight;
    const embedHeight = Math.round(embedHeightCss * currentDpr);
    const oneNoteTop = physTop + offset.y;
    const oneNoteBottom = oneNoteTop + embedHeight;

    // Check if OneNote window would overflow screen or Obsidian window boundaries
    // Screen boundaries (physical pixels)
    const screen = window.screen as any;
    const screenLeft = (screen.availLeft ?? 0) * currentDpr;
    const screenTop = (screen.availTop ?? 0) * currentDpr;
    const screenRight = screenLeft + (window.screen.availWidth || window.innerWidth) * currentDpr;
    const screenBottom = screenTop + (window.screen.availHeight || window.innerHeight) * currentDpr;

    // Obsidian window boundaries (physical pixels)
    const obsidianLeft = Math.round(window.screenX * currentDpr);
    const obsidianTop = Math.round(window.screenY * currentDpr);
    const obsidianRight = obsidianLeft + Math.round(window.outerWidth * currentDpr);
    const obsidianBottom = obsidianTop + Math.round(window.outerHeight * currentDpr);

    // Use the more restrictive boundaries (intersection of screen and Obsidian window)
    const boundLeft = Math.max(screenLeft, obsidianLeft);
    const boundTop = Math.max(screenTop, obsidianTop);
    const boundRight = Math.min(screenRight, obsidianRight);
    const boundBottom = Math.min(screenBottom, obsidianBottom);

    // Hide OneNote if it would overflow
    if (oneNoteTop < boundTop || oneNoteBottom > boundBottom ||
        physLeft + offset.x < boundLeft ||
        physLeft + offset.x + physWidth > boundRight) {
      this._callback(-10000, -10000, 1, 1);
      return;
    }

    // Safe to show OneNote (all values in physical pixels)
    const finalX = physLeft + offset.x;
    const finalY = oneNoteTop;
    this._callback(finalX, finalY, physWidth, embedHeight);
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
    window.removeEventListener('resize', this._resizeHandler);
    for (const ancestor of this._scrollAncestors) {
      ancestor.removeEventListener('scroll', this._scrollHandler, true);
    }
    this._scrollAncestors = [];
    this._resizeObserver.disconnect();
    this._mutationObserver.disconnect();
  }
}
