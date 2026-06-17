import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Helper: create a mock ChildProcess with piped stdin/stdout/stderr.
 */
function createMockChild() {
  const child = new EventEmitter() as any;
  child.stdin = new EventEmitter() as any;
  child.stdin.writable = true;
  child.stdin.write = vi.fn();
  child.stdin.end = vi.fn();
  child.stdout = new EventEmitter() as any;
  child.stderr = new EventEmitter() as any;
  child.kill = vi.fn();
  return child;
}

const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

import { WindowEmbedManager } from '../../src/embed/window-embed-manager';

describe('WindowEmbedManager', () => {
  let manager: WindowEmbedManager;
  let mockChild: any;

  beforeEach(() => {
    manager = new WindowEmbedManager('/fake/plugin/dir');
    mockChild = createMockChild();
    mockSpawn.mockReturnValue(mockChild);
  });

  afterEach(() => {
    manager.stop();
    vi.restoreAllMocks();
    mockSpawn.mockReset();
  });

  it('embedWindow resolves when stdout emits OK:<hwnd>', async () => {
    const promise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    const hwnd = await promise;
    expect(hwnd).toBe('12345');
    expect(manager.isRunning()).toBe(true);
  });

  it('embedWindow rejects when stdout emits ERR:<msg>', async () => {
    const promise = manager.embedWindow('99999');
    mockChild.stdout.emit('data', Buffer.from('ERR:window not found\n'));
    await expect(promise).rejects.toThrow('window not found');
    expect(manager.isRunning()).toBe(false);
  });

  it('embedWindow rejects on process exit before settlement', async () => {
    const promise = manager.embedWindow('11111');
    mockChild.emit('exit', 1);
    await expect(promise).rejects.toThrow('Embed process exited');
    expect(manager.isRunning()).toBe(false);
  });

  it('reposition writes "x,y,w,h\\n" to stdin', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    await manager.reposition(100, 200, 800, 600);
    expect(mockChild.stdin.write).toHaveBeenCalledWith('100,200,800,600\n');
  });

  it('reposition rounds floating point coordinates to integers', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    await manager.reposition(100.7, 200.3, 800.9, 600.1);
    expect(mockChild.stdin.write).toHaveBeenCalledWith('101,200,801,600\n');
  });

  it('reparent writes "REPARENT\\n" to stdin and resolves on REPARENT_OK', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    const reparentPromise = manager.reparent();
    mockChild.stdout.emit('data', Buffer.from('REPARENT_OK\n'));
    await expect(reparentPromise).resolves.toBeUndefined();
    expect(mockChild.stdin.write).toHaveBeenCalledWith('REPARENT\n');
  });

  it('reparent writes "REPARENT <hostHwnd>\\n" when hostHwnd is provided', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    const reparentPromise = manager.reparent('67890');
    mockChild.stdout.emit('data', Buffer.from('REPARENT_OK\n'));
    await expect(reparentPromise).resolves.toBeUndefined();
    expect(mockChild.stdin.write).toHaveBeenCalledWith('REPARENT 67890\n');
  });

  it('reparent rejects on REPARENT_ERR', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    const reparentPromise = manager.reparent();
    mockChild.stdout.emit('data', Buffer.from('REPARENT_ERR\n'));
    await expect(reparentPromise).rejects.toThrow('Reparent failed');
  });

  it('detach writes "DETACH\\n" then "EXIT\\n" to stdin', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    const detachPromise = manager.detach();
    
    // Should send DETACH first, then EXIT after a short delay
    expect(mockChild.stdin.write).toHaveBeenCalledWith('DETACH\n');
    
    // Simulate process exit to complete detach
    mockChild.emit('exit', 0);
    await detachPromise;
    expect(manager.isRunning()).toBe(false);
  });

  it('stop force kills the process', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    expect(manager.isRunning()).toBe(true);
    manager.stop();
    expect(manager.isRunning()).toBe(false);
    expect(mockChild.stdin.write).toHaveBeenCalledWith('EXIT\n');
  });

  it('isRunning returns false before embed', () => {
    expect(manager.isRunning()).toBe(false);
  });

  it('isRunning returns true after successful embed', async () => {
    const promise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await promise;
    expect(manager.isRunning()).toBe(true);
  });

  it('embedWindow rejects on unexpected output', async () => {
    const promise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('GARBAGE\n'));
    await expect(promise).rejects.toThrow('Unexpected embed output');
  });

  it('reparent rejects if process is not running', async () => {
    await expect(manager.reparent()).rejects.toThrow('Embed process not running');
  });

  it('reposition is a no-op if process is not running', async () => {
    await manager.reposition(100, 200, 800, 600);
  });

  it('detach is a no-op if no child process exists', async () => {
    await manager.detach();
  });

  it('handles partial stdout lines correctly (buffered)', async () => {
    const promise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:'));
    mockChild.stdout.emit('data', Buffer.from('12345\n'));
    const hwnd = await promise;
    expect(hwnd).toBe('12345');
  });

  it('embedWindow spawns with correct exe path and args', async () => {
    const promise = manager.embedWindow('54321');
    mockChild.stdout.emit('data', Buffer.from('OK:54321\n'));
    await promise;

    expect(mockSpawn).toHaveBeenCalledWith(
      '/fake/plugin/dir/win-embed-overlay.exe',
      ['embed', '54321'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    );
  });

  it('stop cleans up pending reparent', async () => {
    const embedPromise = manager.embedWindow('12345');
    mockChild.stdout.emit('data', Buffer.from('OK:12345\n'));
    await embedPromise;

    const reparentPromise = manager.reparent();
    manager.stop();
    await expect(reparentPromise).rejects.toThrow('Embed process stopped');
  });
});
