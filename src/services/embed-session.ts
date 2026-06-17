/**
 * Manages embed session lifecycle for OneNote window embedding.
 * Only one embed session can be active at a time; stale sessions
 * from previously rendered embeds are automatically superseded.
 */
export class EmbedSessionManager {
  private _embedSessionCounter: number = 0;
  private _activeEmbedSessionId: number = 0;

  beginEmbedSession(): number {
    this._activeEmbedSessionId = ++this._embedSessionCounter;
    return this._activeEmbedSessionId;
  }

  isActiveEmbedSession(sessionId: number): boolean {
    return sessionId !== 0 && sessionId === this._activeEmbedSessionId;
  }

  endEmbedSession(sessionId: number): void {
    if (this._activeEmbedSessionId === sessionId) {
      this._activeEmbedSessionId = 0;
    }
  }

  reset(): void {
    this._activeEmbedSessionId = 0;
  }
}
