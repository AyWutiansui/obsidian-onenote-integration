// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateChromeOffset, CoordinateTracker } from '../../src/embed/coordinate-tracker';

// jsdom does not implement ResizeObserver — provide a minimal mock
class MockResizeObserver {
  private _callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this._callback = callback;
  }
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

describe('calculateChromeOffset', () => {
  beforeEach(() => {
    // Reset window properties — default to windowed mode
    Object.defineProperty(window, 'screenX', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'screenY', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, writable: true, configurable: true });
    Object.defineProperty(window, 'outerWidth', { value: 1200, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1180, writable: true, configurable: true });
  });

  it('returns offset based on screenX/Y and chrome height for windowed mode', () => {
    Object.defineProperty(window, 'screenX', { value: 100, writable: true, configurable: true });
    Object.defineProperty(window, 'screenY', { value: 50, writable: true, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, writable: true, configurable: true });
    Object.defineProperty(window, 'outerWidth', { value: 1200, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1180, writable: true, configurable: true });

    const offset = calculateChromeOffset();
    expect(offset.x).toBe(100);
    // y = screenY + (outerHeight - innerHeight) = 50 + 100 = 150
    expect(offset.y).toBe(150);
  });

  it('returns availLeft/availTop for maximized window', () => {
    // Maximized: outerHeight === innerHeight AND outerWidth === innerWidth
    Object.defineProperty(window, 'outerHeight', { value: 1080, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true, configurable: true });
    Object.defineProperty(window, 'outerWidth', { value: 1920, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true, configurable: true });
    Object.defineProperty(window, 'screen', {
      value: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080 },
      writable: true, configurable: true,
    });

    const offset = calculateChromeOffset();
    expect(offset.x).toBe(0);
    expect(offset.y).toBe(0);
  });

  it('handles zero outerHeight/innerHeight difference as maximized', () => {
    Object.defineProperty(window, 'outerHeight', { value: 600, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });
    Object.defineProperty(window, 'outerWidth', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'screen', {
      value: { availLeft: 0, availTop: 0, availWidth: 800, availHeight: 600 },
      writable: true, configurable: true,
    });

    const offset = calculateChromeOffset();
    expect(offset.x).toBe(0);
    expect(offset.y).toBe(0);
  });
});

describe('CoordinateTracker', () => {
  let container: HTMLElement;
  let callback: ReturnType<typeof vi.fn>;
  let scrollListeners: Array<() => void>;

  beforeEach(() => {
    scrollListeners = [];
    const originalAddEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, handler: any, options?: any) => {
      if (type === 'scroll') {
        scrollListeners.push(handler);
      }
      return originalAddEventListener(type, handler, options);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type: string, handler: any, options?: any) => {
      if (type === 'scroll') {
        const idx = scrollListeners.indexOf(handler);
        if (idx >= 0) scrollListeners.splice(idx, 1);
      }
      // Don't actually remove — we're just tracking
    });

    // Set up window dimensions — windowed mode (not maximized)
    Object.defineProperty(window, 'screenX', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'screenY', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true, configurable: true });
    Object.defineProperty(window, 'outerWidth', { value: 1020, writable: true, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true, configurable: true });
    Object.defineProperty(window, 'screen', {
      value: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080 },
      writable: true, configurable: true,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    callback = vi.fn();

    // Mock getBoundingClientRect to return predictable values
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 400,
      height: 300,
      right: 500,
      bottom: 500,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('calls callback with correct coordinates on creation', () => {
    const tracker = new CoordinateTracker(container, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    // x = rect.left + offset.x = 100 + 0 = 100
    // y = rect.top + offset.y = 200 + (800-700) = 300
    // w = 400, h = rendered container height = 300
    expect(callback).toHaveBeenCalledWith(100, 300, 400, 300);

    tracker.dispose();
  });

  it('sends sentinel (-10000,-10000,1,1) when container is off-screen', () => {
    // Make getBoundingClientRect return off-screen coordinates
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: -500,
      top: -500,
      width: 100,
      height: 100,
      right: -400,
      bottom: -400,
      x: -500,
      y: -500,
      toJSON: () => ({}),
    });

    const tracker = new CoordinateTracker(container, callback);

    expect(callback).toHaveBeenCalledWith(-10000, -10000, 1, 1);

    tracker.dispose();
  });

  it('update does nothing after dispose', () => {
    const tracker = new CoordinateTracker(container, callback);
    const callCount = callback.mock.calls.length;

    tracker.dispose();
    tracker.update();

    // No additional calls after dispose
    expect(callback).toHaveBeenCalledTimes(callCount);
  });

  it('update does nothing if container is disconnected from DOM', () => {
    const tracker = new CoordinateTracker(container, callback);
    const callCount = callback.mock.calls.length;

    // Remove from DOM
    document.body.removeChild(container);
    tracker.update();

    // No additional calls
    expect(callback).toHaveBeenCalledTimes(callCount);

    // Re-add for cleanup
    document.body.appendChild(container);
    tracker.dispose();
  });

  it('dispose removes scroll event listener', () => {
    const tracker = new CoordinateTracker(container, callback);

    tracker.dispose();

    expect(window.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true
    );
  });

  it('dispose is idempotent', () => {
    const tracker = new CoordinateTracker(container, callback);

    tracker.dispose();
    tracker.dispose();
    tracker.dispose();

    // removeEventListener should only be called once
    const removeCalls = vi.mocked(window.removeEventListener).mock.calls.filter(
      (call) => call[0] === 'scroll'
    );
    expect(removeCalls.length).toBe(1);
  });

  it('rounds coordinates to integers', () => {
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 100.7,
      top: 200.3,
      width: 400.9,
      height: 300.1,
      right: 501.6,
      bottom: 500.4,
      x: 100.7,
      y: 200.3,
      toJSON: () => ({}),
    });

    const tracker = new CoordinateTracker(container, callback);

    expect(callback).toHaveBeenCalledWith(101, 300, 401, 300);

    tracker.dispose();
  });

  it('multiplies by devicePixelRatio for physical pixels (DPR=1.5)', () => {
    // Simulate 150% display scaling
    Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, writable: true, configurable: true });
    // Screen boundaries in CSS pixels (code multiplies by DPR to get physical)
    Object.defineProperty(window, 'screen', {
      value: { availLeft: 0, availTop: 0, availWidth: 1024, availHeight: 700 },
      writable: true, configurable: true,
    });

    const tracker = new CoordinateTracker(container, callback);

    // rect: left=100, top=200, width=400 → physical: 150, 300, 600
    // embedHeightCss = rendered container height = 300
    // embedHeight = round(300 * 1.5) = 450
    // offset.y = round((screenY + chromeH) * dpr) = round((0 + 100) * 1.5) = 150
    // y = physTop + offset.y = 300 + 150 = 450
    // screen bottom = 0 + 700*1.5 = 1050, oneNoteBottom = 450+450 = 900 ≤ 1050 ✓
    expect(callback).toHaveBeenCalledWith(150, 450, 600, 450);

    tracker.dispose();
  });

  it('multiplies by devicePixelRatio for physical pixels (DPR=2)', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true, configurable: true });
    // Screen boundaries in CSS pixels
    Object.defineProperty(window, 'screen', {
      value: { availLeft: 0, availTop: 0, availWidth: 1024, availHeight: 700 },
      writable: true, configurable: true,
    });

    const tracker = new CoordinateTracker(container, callback);

    // rect: left=100, top=200, width=400 → physical: 200, 400, 800
    // embedHeightCss = rendered container height = 300
    // embedHeight = round(300 * 2) = 600
    // offset.y = round((screenY + chromeH) * dpr) = round((0 + 100) * 2) = 200
    // y = physTop + offset.y = 400 + 200 = 600
    // screen bottom = 0 + 700*2 = 1400, oneNoteBottom = 600+600 = 1200 ≤ 1400 ✓
    expect(callback).toHaveBeenCalledWith(200, 600, 800, 600);

    tracker.dispose();
  });

  it('triggers update when devicePixelRatio changes', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true, configurable: true });
    // Screen boundaries in CSS pixels
    Object.defineProperty(window, 'screen', {
      value: { availLeft: 0, availTop: 0, availWidth: 1024, availHeight: 700 },
      writable: true, configurable: true,
    });

    const tracker = new CoordinateTracker(container, callback);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(100, 300, 400, 300);

    // Simulate DPR change (window moved to different monitor)
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true, configurable: true });
    tracker.update();

    // Should fire again with new physical pixel values (including offset recalculation)
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(200, 600, 800, 600);

    tracker.dispose();
  });
});
