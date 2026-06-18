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

      // Pre-calculate container height to maintain correct aspect ratio during skeleton loading.
      // Uses container.clientWidth (stable, always visible) for width estimation.
      // Embed container will be narrower than the container by wrapper padding + embed borders.
      {
        const estimatedEmbedWidth = Math.max(200, (container.clientWidth || 800) - 34);
        const preRatio = this.plugin.settings.embedAspectRatio || 2 / 3;
        const preHeight = Math.max(400, Math.min(1200, Math.round(estimatedEmbedWidth * preRatio)));
        container.style.setProperty('height', `${preHeight + 83}px`, 'important');
      }

      // Show skeleton loading
      const loadingDiv = container.createDiv({ cls: 'onenote-skeleton' });
      loadingDiv.createDiv({ cls: 'onenote-skeleton-bar' });
      loadingDiv.createDiv({ cls: 'onenote-skeleton-bar' });
      loadingDiv.createDiv({ cls: 'onenote-skeleton-bar' });
      loadingDiv.createDiv({ cls: 'onenote-skeleton-block' });

      try {
        const { pageId, pageTitle } = parseCodeBlockSource(source);

        if (pageId) {
          // Always show a title header
          const titleBar = container.createDiv({ cls: 'onenote-page-title' });
          setIcon(titleBar, 'file-text');
          titleBar.createSpan({ text: pageTitle || 'OneNote Page' });

          // Detach/Attach button — right side of title bar, with margin to avoid Obsidian's edit block button
          const toolbarDetachBtn = titleBar.createEl('button', { cls: 'onenote-embed-toolbar-btn', attr: { 'aria-label': 'Detach window', title: 'Detach window' } });
          setIcon(toolbarDetachBtn, 'maximize-2');
          toolbarDetachBtn.style.marginLeft = 'auto';
          toolbarDetachBtn.style.marginRight = '36px';

          // Live window embed (local mode)
          let cleanupEmbed: (() => Promise<void>) | null = null;
          let currentTracker: CoordinateTracker | null = null;
          let lastFocusCheck = 0;

          // Detach any previously embedded window
          try { await localService.detachOneNoteWindow(); } catch {}
          const embedSessionId = localService.beginEmbedSession();
          let currentSessionId: number = embedSessionId;

          loadingDiv.remove();

          // Create embed wrapper (padding around the live embed area)
          const embedWrapper = container.createDiv({ cls: 'onenote-embed-wrapper' });

          // Create embed container
          const embedContainer = embedWrapper.createDiv({ cls: 'onenote-embed-live' });

          // Resize handle
          const resizeHandle = container.createDiv({ cls: 'onenote-resize-handle' });

          // Detached placeholder (hidden initially)
          const detachedPlaceholder = container.createDiv({ cls: 'onenote-embed-detached' });
          detachedPlaceholder.style.display = 'none';
          const detachIcon = detachedPlaceholder.createSpan();
          setIcon(detachIcon, 'monitor-off');
          detachedPlaceholder.createSpan({ text: 'OneNote window detached' });

          let isAttached = true;
          let isTransitioning = false;

          // Calculate non-embed overhead for height tracking.
          // Wrapper padding + embed border + title bar + resize handle
          const wrapperStyle = getComputedStyle(embedWrapper);
          const wrapperPadTop = parseFloat(wrapperStyle.paddingTop) || 0;
          const wrapperPadBot = parseFloat(wrapperStyle.paddingBottom) || 0;
          const wrapperPadLeft = parseFloat(wrapperStyle.paddingLeft) || 0;
          const wrapperPadRight = parseFloat(wrapperStyle.paddingRight) || 0;
          const titleHeight = titleBar.offsetHeight;
          const resizeHeight = resizeHandle.offsetHeight + 8; // height + margin
          const embedBorderStyle = getComputedStyle(embedContainer);
          const embedBorderTop = parseInt(embedBorderStyle.borderTopWidth) || 0;
          const embedBorderBottom = parseInt(embedBorderStyle.borderBottomWidth) || 0;
          const embedBorderLeft = parseInt(embedBorderStyle.borderLeftWidth) || 0;
          const embedBorderRight = parseInt(embedBorderStyle.borderRightWidth) || 0;
          const overhead = Math.round(titleHeight + wrapperPadTop + wrapperPadBot + resizeHeight
            + embedBorderTop + embedBorderBottom);

          // Calculate embed width from container.clientWidth (stable, always visible).
          // embedContainer is narrower than container by wrapper padding + embed borders.
          // This MUST match CoordinateTracker's innerCssWidth calculation to avoid height mismatch.
          const actualWidth = Math.max(200,
            container.clientWidth - wrapperPadLeft - wrapperPadRight - embedBorderLeft - embedBorderRight);
          const aspectRatio = this.plugin.settings.embedAspectRatio || 2 / 3;
          let embedHeight = Math.max(400, Math.min(1200, Math.round(actualWidth * aspectRatio)));
          embedContainer.style.height = `${embedHeight}px`;
          container.style.height = `${embedHeight + overhead}px`;

          // Window resize handler — recalculates embed height when container width changes.
          // The CoordinateTracker reads this height for native window sizing, so it must stay current.
          const onWindowResize = () => {
            const newWidth = Math.max(200,
              container.clientWidth - wrapperPadLeft - wrapperPadRight - embedBorderLeft - embedBorderRight);
            const newHeight = Math.max(400, Math.min(1200, Math.round(newWidth * aspectRatio)));
            if (newHeight !== embedHeight) {
              embedHeight = newHeight;
              embedContainer.style.height = `${embedHeight}px`;
              container.style.height = `${embedHeight + overhead}px`;
              if (currentTracker) currentTracker.forceUpdate();
            }
          };
          window.addEventListener('resize', onWindowResize);

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

              // Focus watchdog: if the overlay reposition stole focus from the
              // Obsidian editor, restore it. Throttled to once per 500ms to avoid
              // overhead on every scroll/reposition event.
              const now = Date.now();
              if (now - lastFocusCheck > 500 && !document.hasFocus()) {
                lastFocusCheck = now;
                requestAnimationFrame(() => {
                  const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                  if (activeView?.editor) {
                    (activeView.editor as any).focus?.();
                  }
                });
              }
            }, aspectRatio, container, overhead);
            currentTracker = tracker;

            // Force position updates for the first 2 seconds — OneNote may
            // override our SetWindowPos during startup (first launch).
            for (const delay of [200, 500, 1000, 1500, 2000]) {
              setTimeout(() => tracker.forceUpdate(), delay);
            }

            cleanupEmbed = async () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              window.removeEventListener('resize', onWindowResize);
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
            // Dispose tracker and listeners first
            window.removeEventListener('resize', onWindowResize);
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

            // Hide embed wrapper, show detached placeholder
            embedWrapper.style.display = 'none';
            detachedPlaceholder.style.display = '';

            // Recalculate container height without embed
            container.style.height = '';

            // Update UI
            toolbarDetachBtn.setAttribute('title', 'Attach window');
            setIcon(toolbarDetachBtn, 'minimize-2');
            isAttached = false;
          };

          const doAttach = async () => {
            // Show wrapper first so layout is correct
            detachedPlaceholder.style.display = 'none';
            embedWrapper.style.display = '';

            // Recalculate embedHeight from container.clientWidth (stable, always visible).
            // This avoids relying on embedContainer.clientWidth which may return 0
            // immediately after unhiding the wrapper.
            const currentWidth = Math.max(200,
              container.clientWidth - wrapperPadLeft - wrapperPadRight - embedBorderLeft - embedBorderRight);
            embedHeight = Math.max(400, Math.min(1200, Math.round(currentWidth * aspectRatio)));

            // Set heights (using recalculated value)
            embedContainer.style.height = `${embedHeight}px`;
            container.style.height = `${embedHeight + overhead}px`;

            // Show embedding status indicator
            embedContainer.empty();
            const statusDiv = embedContainer.createDiv({ cls: 'onenote-embed-status' });
            statusDiv.textContent = 'Embedding OneNote window...';

            try {
              // Ensure clean state before re-attaching
              if (localService.isActiveEmbedSession(currentSessionId)) {
                localService.endEmbedSession(currentSessionId);
              }

              // Start new embed session
              const newSessionId = localService.beginEmbedSession();
              currentSessionId = newSessionId;

              // Embed OneNote window: skip stabilization for fast reattach (~1.1s saved).
              // COM navigation still runs to ensure OneNote is on the correct page.
              // If OneNote isn't running, the COM call triggers startup — cold-start
              // fallback waits 20s then retries with full stabilization.
              let hwnd: string;
              try {
                hwnd = await localService.embedOneNoteWindow(pageId, true);
              } catch (firstError: any) {
                console.warn('[OneNote Embed] Fast embed failed, cold start retry:', firstError.message);
                statusDiv.textContent = 'Starting OneNote... (this may take a moment)';
                try { this.openInOneNoteLocal(pageId); } catch {}
                await new Promise(r => setTimeout(r, 20000));
                statusDiv.textContent = 'Embedding OneNote window...';
                hwnd = await localService.embedOneNoteWindow(pageId, false);
              }

              // Success — clear status
              statusDiv.remove();

              // Show embed wrapper, hide detached placeholder
              embedWrapper.style.display = '';
              detachedPlaceholder.style.display = 'none';

              // Position tracking version doesn't need reparenting
              // Create new coordinate tracker
              const tracker = new CoordinateTracker(embedContainer, (x, y, w, h) => {
                if (!localService.isActiveEmbedSession(newSessionId)) return;
                localService.repositionOneNoteWindow(x, y, w, h);
              }, aspectRatio, container, overhead);
              currentTracker = tracker;

              // Set up cleanup for this attachment
              cleanupEmbed = async () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                window.removeEventListener('resize', onWindowResize);
                await doDetach();
                cleanupEmbed = null;
                cleanupChild.setCleanup(() => {});
              };
              cleanupChild.setCleanup(cleanupEmbed);

              // Show embed container with calculated height
              embedContainer.style.height = `${embedHeight}px`;
              container.style.height = `${embedHeight + overhead}px`;

              // Update UI
              toolbarDetachBtn.setAttribute('title', 'Detach window');
              setIcon(toolbarDetachBtn, 'maximize-2');
              isAttached = true;
              new Notice('OneNote window re-attached');
            } catch (error: any) {
              console.error('[OneNote Embed] Re-attach failed:', error);
              statusDiv.empty();
              const errIcon = statusDiv.createSpan({ cls: 'onenote-item-icon' });
              setIcon(errIcon, 'alert-circle');
              statusDiv.createSpan({ text: `Failed to re-attach: ${error.message}` });
              statusDiv.addClass('onenote-embed-status--error');
            }
          };

          // Wire toolbar detach button
          toolbarDetachBtn.addEventListener('click', async () => {
            if (isTransitioning) return;
            isTransitioning = true;
            try {
              if (isAttached) {
                await doDetach();
                new Notice('OneNote window detached');
              } else {
                await doAttach();
              }
            } finally {
              isTransitioning = false;
            }
          });

          // Resize handle drag logic
          let isResizing = false;
          let startY = 0;
          let startHeight = 0;

          resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
            if (!isAttached) return;
            isResizing = true;
            startY = e.clientY;
            startHeight = embedContainer.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
          });

          const onMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const delta = e.clientY - startY;
            const newHeight = Math.max(200, Math.min(1600, startHeight + delta));
            embedContainer.style.height = `${newHeight}px`;
            container.style.height = `${newHeight + overhead}px`;
          };

          const onMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Save new height for this session
            embedHeight = embedContainer.offsetHeight;
            if (currentTracker) currentTracker.forceUpdate();
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
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
