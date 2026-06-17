import { MarkdownPostProcessorContext, Notice, setIcon, MarkdownView, TFile, MarkdownRenderChild } from 'obsidian';
import OneNoteIntegrationPlugin from './main';
import { parseCodeBlockSource } from './utils/parse-codeblock-source';
import { CoordinateTracker } from './embed/coordinate-tracker';

class OneNoteEmbedCleanupChild extends MarkdownRenderChild {
  private cleanup: (() => void | Promise<void>) | null = null;

  setCleanup(cleanup: () => void | Promise<void>): void {
    this.cleanup = cleanup;
  }

  override onunload(): void {
    if (this.cleanup) {
      void this.cleanup();
      this.cleanup = null;
    }
  }
}

export class OneNoteCodeBlockRenderer {
  private plugin: OneNoteIntegrationPlugin;

  constructor(plugin: OneNoteIntegrationPlugin) {
    this.plugin = plugin;
  }

  async renderCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    try {
      // Debug logging
      const { appendFileSync } = require('fs');
      const { join } = require('path');
      const debugLog = join(
        (this.plugin.app.vault.adapter as any).basePath,
        '.obsidian', 'plugins', 'obsidian-onenote-integration', 'debug.log'
      );
      appendFileSync(debugLog, `[${new Date().toISOString()}] renderCodeBlock called, source: ${source.substring(0, 100)}\n`);

      const container = el.createDiv({ cls: 'onenote-embed-container' });
      const cleanupChild = new OneNoteEmbedCleanupChild(container);
      ctx.addChild(cleanupChild);
      container.style.minHeight = '200px';
      container.style.padding = '16px';
      container.style.border = '1px solid var(--background-modifier-border)';
      container.style.borderRadius = '6px';
      container.style.background = 'var(--background-secondary)';

      const localService = this.plugin.getOneNoteLocalService();

      if (!localService) {
        container.createEl('p', {
          text: 'Local OneNote service not available. Please make sure OneNote is installed.'
        });
        return;
      }

      // Show loading
      const loadingDiv = container.createDiv({ cls: 'onenote-loading' });
      loadingDiv.style.textAlign = 'center';
      loadingDiv.style.padding = '20px';
      loadingDiv.style.color = 'var(--text-muted)';
      loadingDiv.textContent = 'Loading OneNote content...';

      try {
        const { pageId, pageTitle } = parseCodeBlockSource(source);

        if (pageId) {
          // Always show a title header
          const titleBar = container.createDiv({ cls: 'onenote-page-title' });
          titleBar.style.display = 'flex';
          titleBar.style.alignItems = 'center';
          titleBar.style.gap = '8px';
          titleBar.style.marginBottom = '12px';
          titleBar.style.paddingBottom = '8px';
          titleBar.style.borderBottom = '1px solid var(--background-modifier-border)';
          setIcon(titleBar, 'file-text');
          titleBar.createSpan({ text: pageTitle || 'OneNote Page' }).style.fontWeight = '600';

          // Live window embed (local mode)
          let cleanupEmbed: (() => Promise<void>) | null = null;
          let currentTracker: CoordinateTracker | null = null;

          // Detach any previously embedded window
          try { await localService.detachOneNoteWindow(); } catch {}
          const embedSessionId = localService.beginEmbedSession();
          let currentSessionId: number = embedSessionId;

          loadingDiv.remove();

          // Create embed container with OneNote-friendly aspect ratio
          // A4 paper ratio is ~1:1.414 (width:height), but for screen viewing use 16:10 or 3:2
          const containerWidth = el.clientWidth || 800;
          // Use 3:2 aspect ratio (wider than A4, better for screen) as default
          // Height = width * (2/3), clamped to reasonable bounds
          const aspectRatio = 2 / 3;
          const calculatedHeight = Math.round(containerWidth * aspectRatio);
          const minHeight = 400;
          const maxHeight = 1200;
          const embedHeight = Math.max(minHeight, Math.min(maxHeight, calculatedHeight));

          // Create embed container
          const embedContainer = container.createDiv({ cls: 'onenote-embed-live' });
          embedContainer.style.width = '100%';
          embedContainer.style.height = `${embedHeight}px`;
          embedContainer.style.border = '1px solid var(--background-modifier-border)';
          embedContainer.style.borderRadius = '4px';
          embedContainer.style.position = 'relative';
          embedContainer.style.overflow = 'hidden';
          embedContainer.style.background = 'var(--background-primary)';

          const statusDiv = embedContainer.createDiv({ cls: 'onenote-embed-status' });
          statusDiv.style.padding = '8px';
          statusDiv.style.textAlign = 'center';
          statusDiv.style.color = 'var(--text-muted)';
          statusDiv.textContent = 'Embedding OneNote window...';

          try {
            appendFileSync(debugLog, `[${new Date().toISOString()}] Attempting embed, pageId: ${pageId}\n`);
            const hwnd = await localService.embedOneNoteWindow(pageId);
            appendFileSync(debugLog, `[${new Date().toISOString()}] Embed SUCCESS, hwnd: ${hwnd}\n`);
            statusDiv.remove();

            // Position tracking version doesn't need reparenting - window is moved directly via SetWindowPos
            // Track position via CoordinateTracker (handles chrome offset,
            // viewport checks, sentinel coordinates, scroll/resize listeners)
            const tracker = new CoordinateTracker(embedContainer, (x, y, w, h) => {
              if (!localService.isActiveEmbedSession(embedSessionId)) return;
              localService.repositionOneNoteWindow(x, y, w, h);
            });
            currentTracker = tracker;

            // Force position updates for the first 2 seconds — OneNote may
            // override our SetWindowPos during startup (first launch).
            for (const delay of [200, 500, 1000, 1500, 2000]) {
              setTimeout(() => tracker.forceUpdate(), delay);
            }

            cleanupEmbed = async () => {
              await doDetach();
              cleanupEmbed = null;
              cleanupChild.setCleanup(() => {});
            };
            cleanupChild.setCleanup(cleanupEmbed);
          } catch (embedError: any) {
            const msg = embedError.message || '';
            appendFileSync(debugLog, `[${new Date().toISOString()}] Embed FAILED: ${msg}\n`);
            localService.endEmbedSession(embedSessionId);
            if (msg.includes('COM') || msg.includes('OneNote') || msg.includes('not found')) {
              statusDiv.innerHTML = '<strong>OneNote is not running.</strong><br>Please open OneNote first, then reload this note.';
            } else {
              statusDiv.textContent = `Failed to embed OneNote: ${msg}`;
            }
            statusDiv.style.color = 'var(--text-error)';
          }

          // Detach/Attach toggle button
          const btnContainer = container.createDiv({ cls: 'onenote-handwritten-actions' });
          btnContainer.style.marginTop = '8px';
          btnContainer.style.display = 'flex';
          btnContainer.style.gap = '8px';

          let isAttached = true;
          
          const actionBtn = btnContainer.createEl('button', {
            text: 'Detach OneNote Window',
            cls: 'mod-cta'
          });
          
          const doDetach = async () => {
            // Dispose tracker first
            if (currentTracker) {
              currentTracker.dispose();
              currentTracker = null;
            }
            
            // End embed session
            localService.endEmbedSession(currentSessionId);
            
            // Detach window via embed manager
            try { 
              await localService.detachOneNoteWindow(); 
            } catch (err) {
              console.warn('[OneNote] detachOneNoteWindow error:', err);
            }
            
            // Hide embed container
            embedContainer.style.height = '0px';
            embedContainer.style.overflow = 'hidden';
            
            // Update UI
            actionBtn.textContent = 'Attach OneNote Window';
            actionBtn.classList.remove('mod-cta');
            isAttached = false;
          };
          
          const doAttach = async () => {
            actionBtn.textContent = 'Attaching...';
            actionBtn.disabled = true;
            
            try {
              // Ensure clean state before re-attaching
              if (localService.isActiveEmbedSession(currentSessionId)) {
                localService.endEmbedSession(currentSessionId);
              }
              
              // Start new embed session
              const newSessionId = localService.beginEmbedSession();
              currentSessionId = newSessionId;
              
              // Embed OneNote window
              const hwnd = await localService.embedOneNoteWindow(pageId);
              console.log('[OneNote Embed] Re-attached HWND:', hwnd);
              
              // Position tracking version doesn't need reparenting
              // Create new coordinate tracker
              const tracker = new CoordinateTracker(embedContainer, (x, y, w, h) => {
                if (!localService.isActiveEmbedSession(newSessionId)) return;
                localService.repositionOneNoteWindow(x, y, w, h);
              });
              currentTracker = tracker;
              
              // Set up cleanup for this attachment
              cleanupEmbed = async () => {
                await doDetach();
                cleanupEmbed = null;
                cleanupChild.setCleanup(() => {});
              };
              cleanupChild.setCleanup(cleanupEmbed);
              
              // Show embed container with calculated height
              embedContainer.style.height = `${embedHeight}px`;
              embedContainer.style.overflow = 'hidden';
              
              // Update UI
              actionBtn.textContent = 'Detach OneNote Window';
              actionBtn.classList.add('mod-cta');
              isAttached = true;
              actionBtn.disabled = false;
              new Notice('OneNote window re-attached');
            } catch (error: any) {
              console.error('[OneNote Embed] Re-attach failed:', error);
              actionBtn.textContent = 'Attach OneNote Window';
              actionBtn.disabled = false;
              new Notice(`Failed to re-attach: ${error.message}`);
            }
          };
          
          actionBtn.addEventListener('click', async () => {
            if (isAttached) {
              await doDetach();
              new Notice('OneNote window detached');
            } else {
              await doAttach();
            }
          });
        } else {
          // No page ID - show page selector
          loadingDiv.remove();
          await this.createPageSelector(container, localService, el, ctx, source);
        }
      } catch (error: any) {
        loadingDiv.remove();
        container.createEl('div', {
          cls: 'onenote-error-message',
          text: `Error loading OneNote content: ${error.message}`
        });
      }
    } catch (fatalError: any) {
      console.error('[OneNote CodeBlock] FATAL error in renderCodeBlock:', fatalError);
      el.createEl('div', {
        cls: 'onenote-error-message',
        text: `OneNote code block error: ${fatalError.message}`
      }).style.color = 'red';
    }
  }

  /**
   * Replace the content of the ```onenote code block with a page ID.
   */
  private async replaceCodeBlockContent(
    pageId: string, pageTitle: string,
    el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string
  ): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      new Notice('Cannot find the current file.');
      return false;
    }

    const sectionInfo = ctx.getSectionInfo(el);
    const content = await this.plugin.app.vault.read(file);
    const lines = content.split('\n');

    let codeBlockStart = -1;
    let codeBlockEnd = -1;

    if (sectionInfo) {
      const { lineStart, lineEnd } = sectionInfo;

      if (lines[lineStart]?.trim() === '```onenote') {
        codeBlockStart = lineStart;
        codeBlockEnd = lineEnd;
      } else {
        for (let i = lineStart; i >= 0; i--) {
          if (lines[i]?.trim() === '```onenote') {
            codeBlockStart = i;
            break;
          }
        }
        for (let i = lineEnd; i < lines.length; i++) {
          if (lines[i]?.trim() === '```') {
            codeBlockEnd = i;
            break;
          }
        }
      }
    }

    if (codeBlockStart === -1 || codeBlockEnd === -1) {
      const currentSource = source.trim();
      const emptyBlocks: Array<{ start: number; end: number }> = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '```onenote') {
          const blockStart = i;
          let blockEnd = -1;
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() === '```') {
              blockEnd = j;
              break;
            }
          }
          if (blockEnd !== -1) {
            const innerLines = lines.slice(blockStart + 1, blockEnd);
            const innerContent = innerLines.join('\n').trim();
            emptyBlocks.push({ start: blockStart, end: blockEnd });

            if (innerContent === currentSource) {
              codeBlockStart = blockStart;
              codeBlockEnd = blockEnd;
              break;
            }
          }
        }
      }

      if (codeBlockStart === -1 && !currentSource) {
        for (const block of emptyBlocks) {
          const innerContent = lines.slice(block.start + 1, block.end).join('\n').trim();
          if (innerContent === '' || innerContent === '```') {
            codeBlockStart = block.start;
            codeBlockEnd = block.end;
            break;
          }
        }
      }
    }

    if (codeBlockStart !== -1 && codeBlockEnd !== -1) {
      const cleanId = pageId.replace(/\s+/g, '');
      const newLines = [...lines];
      const blockContent = pageTitle ? `${cleanId}\n${pageTitle}` : cleanId;
      newLines.splice(codeBlockStart + 1, codeBlockEnd - codeBlockStart - 1, blockContent);
      await this.plugin.app.vault.modify(file, newLines.join('\n'));
      new Notice('Page loaded! The code block has been updated.');
      return true;
    }

    new Notice('Could not locate the onenote code block in the file.');
    return false;
  }

  /**
   * Open a page in the OneNote desktop app.
   */
  private openInOneNoteLocal(pageId: string): void {
    const cleanId = pageId.replace(/\s+/g, '');
    const url = `onenote:${cleanId}`;
    try {
      const electron = require('electron');
      if (electron?.shell?.openExternal) {
        electron.shell.openExternal(url);
        new Notice('Opening in OneNote...');
        return;
      }
    } catch (e) {
      console.warn('electron.shell.openExternal not available, trying fallback:', e);
    }

    try {
      window.open(url, '_blank');
      new Notice('Opening in OneNote...');
    } catch (error: any) {
      try {
        const link = document.createElement('a');
        link.href = url;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        new Notice('Opening in OneNote...');
      } catch (fallbackError: any) {
        new Notice(`Failed to open OneNote: ${fallbackError.message}`);
      }
    }
  }

  private async createPageSelector(
    container: HTMLElement, localService: any,
    el: HTMLElement, ctx: MarkdownPostProcessorContext, source: string
  ) {
    const header = container.createDiv();
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '8px';
    header.style.marginBottom = '12px';

    setIcon(header, 'book-open');
    header.createSpan({ text: 'Select a OneNote page to embed (Local Mode):' });

    const controlsContainer = container.createDiv();
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.gap = '8px';

    const select = controlsContainer.createEl('select');
    select.style.width = '100%';
    select.style.padding = '8px';
    select.style.borderRadius = '4px';
    select.style.border = '1px solid var(--background-modifier-border)';
    select.style.background = 'var(--background-primary)';

    select.createEl('option', { text: 'Loading notebooks...', value: '' });

    try {
      const notebooks = await localService.getNotebooks();

      select.empty();
      select.createEl('option', { text: 'Select a page...', value: '' });

      for (const notebook of notebooks) {
        const optgroup = select.createEl('optgroup', {
          attr: { label: notebook.name }
        });

        try {
          const sections = await localService.getSections(notebook.id);
          for (const section of sections) {
            const pages = await localService.getPages(section.id);
            for (const page of pages) {
              optgroup.createEl('option', {
                text: `${notebook.name} > ${section.name} > ${page.title}`,
                value: page.id
              });
            }
          }
        } catch (err) {
          console.error('Error loading sections:', err);
        }
      }
    } catch (error: any) {
      select.empty();
      select.createEl('option', { text: 'Error loading notebooks', value: '' });
    }

    const buttonContainer = controlsContainer.createDiv();
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';

    const loadButton = buttonContainer.createEl('button', {
      text: 'Load Page',
      cls: 'mod-cta'
    });
    loadButton.style.flex = '1';

    const openButton = buttonContainer.createEl('button', {
      text: 'Open in OneNote'
    });
    openButton.style.flex = '1';

    loadButton.addEventListener('click', async () => {
      const pageId = select.value;
      if (pageId) {
        const selectedText = select.options[select.selectedIndex]?.text || '';
        await this.replaceCodeBlockContent(pageId, selectedText, el, ctx, source);
      } else {
        new Notice('Please select a page');
      }
    });

    openButton.addEventListener('click', async () => {
      const pageId = select.value;
      if (pageId) {
        try {
          const ok = await localService.navigateToPage(pageId);
          if (ok) {
            new Notice('Opening in OneNote...');
            return;
          }
        } catch (e) {
          console.warn('navigateToPage failed, falling back to protocol URL:', e);
        }
        this.openInOneNoteLocal(pageId);
      } else {
        new Notice('Please select a page');
      }
    });
  }
}
