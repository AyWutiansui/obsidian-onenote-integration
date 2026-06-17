import { describe, it, expect, beforeEach } from 'vitest';
import { EmbedSessionManager } from '../../src/services/embed-session';

describe('EmbedSessionManager', () => {
  let manager: EmbedSessionManager;

  beforeEach(() => {
    manager = new EmbedSessionManager();
  });

  // -------------------------------------------------------------------------
  // beginEmbedSession
  // -------------------------------------------------------------------------
  describe('beginEmbedSession', () => {
    it('should return incrementing IDs starting from 1', () => {
      expect(manager.beginEmbedSession()).toBe(1);
      expect(manager.beginEmbedSession()).toBe(2);
      expect(manager.beginEmbedSession()).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // isActiveEmbedSession
  // -------------------------------------------------------------------------
  describe('isActiveEmbedSession', () => {
    it('should return true only for the current active session', () => {
      const s1 = manager.beginEmbedSession();
      expect(manager.isActiveEmbedSession(s1)).toBe(true);

      const s2 = manager.beginEmbedSession();
      // s1 is no longer active
      expect(manager.isActiveEmbedSession(s1)).toBe(false);
      expect(manager.isActiveEmbedSession(s2)).toBe(true);
    });

    it('should return false for session ID 0', () => {
      manager.beginEmbedSession();
      expect(manager.isActiveEmbedSession(0)).toBe(false);
    });

    it('should return false for arbitrary non-active IDs', () => {
      manager.beginEmbedSession();
      expect(manager.isActiveEmbedSession(999)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // endEmbedSession
  // -------------------------------------------------------------------------
  describe('endEmbedSession', () => {
    it('should clear active session when ID matches', () => {
      const s1 = manager.beginEmbedSession();
      expect(manager.isActiveEmbedSession(s1)).toBe(true);

      manager.endEmbedSession(s1);
      expect(manager.isActiveEmbedSession(s1)).toBe(false);
    });

    it('should NOT clear active session when ID does not match', () => {
      const s1 = manager.beginEmbedSession();
      const s2 = manager.beginEmbedSession();

      // End the OLD session — active is s2
      manager.endEmbedSession(s1);
      expect(manager.isActiveEmbedSession(s2)).toBe(true);
    });

    it('ending a newer session should clear active state', () => {
      const s1 = manager.beginEmbedSession();
      const s2 = manager.beginEmbedSession();

      manager.endEmbedSession(s2);
      expect(manager.isActiveEmbedSession(s2)).toBe(false);
      // s1 was already superseded by s2, so still false
      expect(manager.isActiveEmbedSession(s1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------
  describe('reset', () => {
    it('should clear the active session', () => {
      const s1 = manager.beginEmbedSession();
      expect(manager.isActiveEmbedSession(s1)).toBe(true);

      manager.reset();
      expect(manager.isActiveEmbedSession(s1)).toBe(false);
    });

    it('should allow new sessions after reset', () => {
      manager.beginEmbedSession();
      manager.beginEmbedSession();
      manager.reset();

      const s3 = manager.beginEmbedSession();
      expect(manager.isActiveEmbedSession(s3)).toBe(true);
      // Counter continues incrementing (3), but functionality works
      expect(s3).toBe(3);
    });
  });
});
