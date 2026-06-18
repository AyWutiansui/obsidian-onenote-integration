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
      // Debug logging (conditional, uses console.debug instead of sync file I/O)
      if ((window as any).__ONENOTE_DEBUG__) {
        console.debug('[OneNote Embed] renderCodeBlock called, source:', source.substring(0, 100));
      }

      const container = el.createDiv({ cls: 'onenote-embed-container' });
      const cleanupChild = new OneNoteEmbedCleanupChild(container);
      ctx.addChild(cleanupChild);
      container.style.setProperty('max-height', 'none', 'important');  // Override Obsidian's code block max-height

      const localService = this.plugin.getOneNoteLocalService();

      if (!localService) {
        const errDiv = container.createDiv({ cls: 'onenote-error-message' });
        const iconEl = errDiv.createSpan({ cls: 'onenote-item-icon' });
        setIcon(iconEl, 'alert-triangle');
        errDiv.createSpan({ text: 'Local OneNote service not available. Please make sure OneNote is installed.' });
        return;
      }

      // Show loading
      const loadingDiv = container.createDiv({ cls: 'onenote-loading' });
      const spinner = loadingDiv.createSpan({ cls: 'onenote-spinner' });
      spinner.textContent = '';
      loadingDiv.createSpan({ text: ' Loading OneNote content...' });

      try {
        const { pageId, pageTitle } = parseCodeBlockSource(source);

        if (pageId) {
          // Always show a title header
          const titleBar = container.createDiv({ cls: 'onenote-page-title' });
          setIcon(titleBar, 'file-text');
          titleBar.createSpan({ text: pageTitle || 'OneNote Page' });

          // Live window embed (local mode)
          let cleanupEmbed: (() => Promise<void>) | null = null;
          let currentTracker: CoordinateTracker | null = null;

          // Detach any previously embedded window
          try { await localService.detachOneNoteWindow(); } catch {}
          const embedSessionId = localService.beginEmbedSession();
          let currentSessionId: number = embedSessionId;

          loadingDiv.remove();

          // Create embed container
          const embedContainer = container.createDiv({ cls: 'onenote-embed-live' });

          // Calculate height based on embedContainer's actual width (accounts for container padding)
          const actualWidth = embedContainer.clientWidth || el.clientWidth || 800;
          const aspectRatio = this.plugin.settings.embedAspectRatio || 2 / 3;
          const embedHeight = Math.max(400, Math.min(1200, Math.round(actualWidth * aspectRatio)));
          embedContainer.style.height = `${embedHeight}px`;

          // Detach/Attach toggle button — created early so we can measure overhead
          const btnContainer = container.createDiv({ cls: 'onenote-embed-actions' });

          let isAttached = true;
          let isTransitioning = false;

          const actionBtn = btnContainer.createEl('button', {
            text: 'Detach OneNote Window',
            cls: 'mod-cta'
          });

          // Calculate non-embed overhead explicitly from child elements.
          // We cannot use container.offsetHeight - embedContainer.offsetHeight because
          // Obsidian's CSS max-height may still constrain the container before we set its height.
          const titleHeight = titleBar.offsetHeight;
          const titleMarginBottom = parseInt(getComputedStyle(titleBar).marginBottom) || 0;
          const btnHeight = btnContainer.offsetHeight;
          const btnMarginTop = parseInt(getComputedStyle(btnContainer).marginTop) || 0;
          const embedBorderTop = parseInt(getComputedStyle(embedContainer).borderTopWidth) || 0;
          const embedBorderBottom = parseInt(getComputedStyle(embedContainer).borderBottomWidth) || 0;
          // Container padding (16px top + 16px bottom) + border (1px top + 1px bottom)
          const containerPadding = 32;
          const containerBorder = 2;
          const overhead = titleHeight + titleMarginBottom + btnMarginTop + btnHeight
            + embedBorderTop + embedBorderBottom + containerPadding + containerBorder;
          container.style.height = `${embedHeight + overhead}px`;

          const statusDiv = embedContainer.createDiv({ cls: 'onenote-embed-status' });
          statusDiv.textContent = 'Embedding OneNote window...';

          try {
            if ((window as any).__ONENOTE_DEBUG__) {
              console.debug(`[OneNote Embed] Attempting embed, pageId: ${pageId}`);
            }
            const hwnd = await localService.embedOneNoteWindow(pageId);
            if ((window as any).__ONENOTE_DEBUG__) {
              console.debug(`[OneNote Embed] Embed SUCCESS, hwnd: ${hwnd}`);
            }
            statusDiv.remove();

            // Position tracking version doesn't need reparenting - window is moved directly via SetWindowPos
            // Track position via CoordinateTracker (handles chrome offset,
            // viewport checks, sentinel coordinates, scroll/resize listeners)
            const tracker = new CoordinateTracker(embedContainer, (x, y, w, h) => {
              if (!localService.isActiveEmbedSession(embedSessionId)) return;
              localService.repositionOneNoteWindow(x, y, w, h);
            }, aspectRatio, container, overhead);
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
            console.warn(`[OneNote Embed] Embed FAILED: ${msg}`);
            localService.endEmbedSession(embedSessionId);
            statusDiv.empty();
            const errIcon = statusDiv.createSpan({ cls: 'onenote-item-icon' });
            setIcon(errIcon, 'alert-circle');
            if (msg.includes('COM') || msg.includes('OneNote') || msg.includes('not found')) {
              statusDiv.createSpan({ text: 'OneNote is not running. Please open OneNote first, then reload this note.' });
            } else {
              statusDiv.createSpan({ text: `Failed to embed OneNote: ${msg}` });
            }
            statusDiv.addClass('onenote-embed-status--error');
          }
          
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
            container.style.height = `${overhead}px`;
            
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

              // Position tracking version doesn't need reparenting
              // Create new coordinate tracker
              const tracker = new CoordinateTracker(embedContainer, (x, y, w, h) => {
                if (!localService.isActiveEmbedSession(newSessionId)) return;
                localService.repositionOneNoteWindow(x, y, w, h);
              }, aspectRatio, container, overhead);
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
              container.style.height = `${embedHeight + overhead}px`;
              
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
            if (isTransitioning) return;
            isTransitioning = true;
            actionBtn.disabled = true;
            try {
              if (isAttached) {
                await doDetach();
                new Notice('OneNote window detached');
              } else {
                await doAttach();
              }
            } finally {
              isTransitioning = false;
              actionBtn.disabled = false;
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
      });
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
    const header = container.createDiv({ cls: 'onenote-page-selector-header' });

    setIcon(header, 'book-open');
    header.createSpan({ text: 'Select a OneNote page to embed:' });

    const controlsContainer = container.createDiv({ cls: 'onenote-page-selector-controls' });

    // --- Notebook dropdown ---
    const notebookLabel = controlsContainer.createEl('label', { cls: 'onenote-page-selector-label', attr: { for: 'onenote-nb-select' } });
    const nbIcon = notebookLabel.createSpan({ cls: 'onenote-item-icon' });
    setIcon(nbIcon, 'book');
    notebookLabel.createSpan({ text: 'Notebook' });
    const notebookSelect = controlsContainer.createEl('select', { cls: 'onenote-page-selector-select', attr: { id: 'onenote-nb-select' } });
    notebookSelect.createEl('option', { text: 'Loading notebooks...', value: '' });

    // --- Section dropdown ---
    const sectionLabel = controlsContainer.createEl('label', { cls: 'onenote-page-selector-label', attr: { for: 'onenote-sec-select' } });
    const secIcon = sectionLabel.createSpan({ cls: 'onenote-item-icon' });
    setIcon(secIcon, 'folder');
    sectionLabel.createSpan({ text: 'Section' });
    const sectionSelect = controlsContainer.createEl('select', { cls: 'onenote-page-selector-select', attr: { id: 'onenote-sec-select' } });
    sectionSelect.disabled = true;
    sectionSelect.createEl('option', { text: 'Select a notebook first', value: '' });

    // --- Page dropdown (lazy — loads when section is selected) ---
    const pageLabel = controlsContainer.createEl('label', { cls: 'onenote-page-selector-label', attr: { for: 'onenote-page-select' } });
    const pgIcon = pageLabel.createSpan({ cls: 'onenote-item-icon' });
    setIcon(pgIcon, 'file-text');
    pageLabel.createSpan({ text: 'Page' });
    const pageSelect = controlsContainer.createEl('select', { cls: 'onenote-page-selector-select', attr: { id: 'onenote-page-select' } });
    pageSelect.disabled = true;
    pageSelect.createEl('option', { text: 'Select a section first', value: '' });

    let notebooks: any[] = [];

    // Phase 1: Fast shallow fetch — notebooks + sections only (no pages)
    try {
      notebooks = await localService.getNotebooks();
      notebookSelect.empty();
      notebookSelect.createEl('option', { text: 'Select a notebook...', value: '' });
      for (const nb of notebooks) {
        notebookSelect.createEl('option', { text: nb.name, value: nb.id });
      }
      if (notebooks.length === 1) {
        notebookSelect.value = notebooks[0].id;
        notebookSelect.dispatchEvent(new Event('change'));
      }
    } catch (error: any) {
      notebookSelect.empty();
      notebookSelect.createEl('option', { text: 'Error loading notebooks', value: '' });
    }

    // Notebook change → populate sections (instant from cache)
    notebookSelect.addEventListener('change', () => {
      const nbId = notebookSelect.value;
      sectionSelect.empty();
      pageSelect.empty();
      pageSelect.createEl('option', { text: 'Select a section first', value: '' });
      pageSelect.disabled = true;

      if (!nbId) {
        sectionSelect.createEl('option', { text: 'Select a notebook first', value: '' });
        sectionSelect.disabled = true;
        return;
      }

      const nb = notebooks.find((n: any) => n.id === nbId);
      const sections = nb?.sections || [];

      if (sections.length === 0) {
        sectionSelect.createEl('option', { text: 'No sections in this notebook', value: '' });
        sectionSelect.disabled = true;
        return;
      }

      sectionSelect.disabled = false;
      sectionSelect.createEl('option', { text: 'Select a section...', value: '' });
      for (const sec of sections) {
        sectionSelect.createEl('option', { text: sec.name, value: sec.id });
      }
    });

    // Section change → lazy load pages (one fast PowerShell call for this section only)
    sectionSelect.addEventListener('change', async () => {
      const secId = sectionSelect.value;
      pageSelect.empty();

      if (!secId) {
        pageSelect.createEl('option', { text: 'Select a section first', value: '' });
        pageSelect.disabled = true;
        return;
      }

      pageSelect.disabled = true;
      pageSelect.createEl('option', { text: 'Loading pages...', value: '' });

      try {
        const pages = await localService.getPages(secId);
        pageSelect.empty();

        if (pages.length === 0) {
          pageSelect.createEl('option', { text: 'No pages in this section', value: '' });
          return;
        }

        pageSelect.createEl('option', { text: 'Select a page...', value: '' });
        for (const page of pages) {
          pageSelect.createEl('option', { text: page.title, value: page.id });
        }
        pageSelect.disabled = false;
      } catch (err: any) {
        pageSelect.empty();
        pageSelect.createEl('option', { text: `Error: ${err.message}`, value: '' });
      }
    });

    // --- Buttons ---
    const buttonContainer = controlsContainer.createDiv({ cls: 'onenote-page-selector-buttons' });

    const loadButton = buttonContainer.createEl('button', {
      text: 'Load Page',
      cls: 'mod-cta'
    });

    const openButton = buttonContainer.createEl('button', {
      text: 'Open in OneNote'
    });

    loadButton.addEventListener('click', async () => {
      const pageId = pageSelect.value;
      if (pageId) {
        loadButton.disabled = true;
        loadButton.textContent = 'Loading...';
        try {
          const pageTitle = pageSelect.options[pageSelect.selectedIndex]?.text || '';
          await this.replaceCodeBlockContent(pageId, pageTitle, el, ctx, source);
        } finally {
          loadButton.disabled = false;
          loadButton.textContent = 'Load Page';
        }
      } else {
        new Notice('Please select a page');
      }
    });

    openButton.addEventListener('click', async () => {
      const pageId = pageSelect.value;
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
