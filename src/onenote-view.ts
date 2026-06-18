import { ItemView, WorkspaceLeaf, Notice, ButtonComponent, TextComponent } from 'obsidian';
import { ONE_NOTE_VIEW_TYPE } from './main';
import OneNoteIntegrationPlugin from './main';
import { LocalOneNoteNotebook, LocalOneNoteSection, LocalOneNotePage } from './types';

export class OneNoteEmbedView extends ItemView {
  plugin: OneNoteIntegrationPlugin;
  private currentNotebook: string | null = null;
  private currentSection: string | null = null;
  private currentPage: string | null = null;
  private currentNotebookName: string = '';
  private currentSectionName: string = '';
  private currentPageName: string = '';
  private contentDiv: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: OneNoteIntegrationPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return ONE_NOTE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'OneNote';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('onenote-view-container');

    // Create header
    const headerDiv = container.createDiv({ cls: 'onenote-header' });

    new ButtonComponent(headerDiv)
      .setButtonText('Load Notebooks')
      .onClick(async () => {
        await this.loadNotebooks(this.contentDiv!);
      });

    // Add cache refresh button to invalidate the 5-min hierarchy cache
    new ButtonComponent(headerDiv)
      .setButtonText('↻ Refresh')
      .setTooltip('Refresh notebook list (clear cache)')
      .onClick(async () => {
        const svc = this.plugin.getOneNoteLocalService();
        if (svc) {
          svc.invalidateCache();
          console.log('[OneNote] Hierarchy cache invalidated');
        }
        await this.loadNotebooks(this.contentDiv!);
      });

    const platformInfo = this.plugin.getOneNoteLocalService()?.getPlatformInfo();
    headerDiv.createSpan({
      cls: 'onenote-platform-info',
      text: `Local Mode - ${platformInfo?.platform || 'unknown'}`
    });

    // Create search bar
    const searchDiv = container.createDiv({ cls: 'onenote-search-bar' });
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    new TextComponent(searchDiv)
      .setPlaceholder('Search notebooks, sections, pages...')
      .onChange((query) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.performSearch(query, this.contentDiv!), 200);
      });

    // Create content area
    this.contentDiv = container.createDiv({ cls: 'onenote-content' });

    // Load notebooks
    await this.loadNotebooks(this.contentDiv);
  }

  /** Create a clickable list item with unified styling and accessibility. */
  private renderListItem(
    parent: HTMLElement, text: string, onClick: () => void | Promise<void>,
    childCount?: number
  ): HTMLElement {
    const item = parent.createDiv({ cls: 'onenote-list-item' });
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', text);
    item.createSpan({ text });
    if (childCount !== undefined) {
      const badge = item.createSpan({ cls: 'onenote-item-count' });
      badge.textContent = `${childCount}`;
    }
    item.addEventListener('click', onClick);
    item.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    });
    return item;
  }

  /** Show a loading spinner with message. Returns the element for later removal. */
  private showLoading(container: HTMLElement, message: string): HTMLElement {
    const loadingDiv = container.createDiv({ cls: 'onenote-loading' });
    const spinner = loadingDiv.createSpan({ cls: 'onenote-spinner' });
    spinner.textContent = '';
    loadingDiv.createSpan({ text: ` ${message}` });
    return loadingDiv;
  }

  /** Make a non-button element keyboard-accessible and screen-reader friendly. */
  private makeClickable(el: HTMLElement, onClick: () => void | Promise<void>, label?: string): void {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    });
  }

  /** Render breadcrumb navigation showing the current hierarchy path. */
  private renderBreadcrumb(container: HTMLElement): void {
    const crumb = container.createDiv({ cls: 'onenote-breadcrumb' });

    // Root: always clickable to go back to notebook list
    const root = crumb.createSpan({ cls: 'onenote-breadcrumb-item' });
    root.textContent = '📓 Notebooks';
    this.makeClickable(root, () => {
      this.currentNotebook = null;
      this.currentNotebookName = '';
      this.currentSection = null;
      this.currentSectionName = '';
      this.currentPage = null;
      this.currentPageName = '';
      this.loadNotebooks(this.contentDiv!);
    }, 'Back to Notebooks');

    if (this.currentNotebookName) {
      crumb.createSpan({ cls: 'onenote-breadcrumb-sep', text: ' › ' });
      const nb = crumb.createSpan({ cls: 'onenote-breadcrumb-item' });
      nb.textContent = this.currentNotebookName;
      this.makeClickable(nb, () => {
        if (this.currentNotebook) {
          this.currentSection = null;
          this.currentSectionName = '';
          this.currentPage = null;
          this.currentPageName = '';
          this.loadSections(this.currentNotebook, this.contentDiv!);
        }
      }, `Back to ${this.currentNotebookName}`);
    }

    if (this.currentSectionName) {
      crumb.createSpan({ cls: 'onenote-breadcrumb-sep', text: ' › ' });
      const sec = crumb.createSpan({ cls: 'onenote-breadcrumb-item' });
      sec.textContent = this.currentSectionName;
      this.makeClickable(sec, () => {
        if (this.currentSection) {
          this.currentPage = null;
          this.currentPageName = '';
          this.loadPages(this.currentSection, this.contentDiv!);
        }
      }, `Back to ${this.currentSectionName}`);
    }

    if (this.currentPageName) {
      crumb.createSpan({ cls: 'onenote-breadcrumb-sep', text: ' › ' });
      crumb.createSpan({ cls: 'onenote-breadcrumb-current', text: this.currentPageName });
    }
  }

  /** Search the hierarchy cache and render matching items. */
  private performSearch(query: string, container: HTMLElement): void {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      // Empty query: reload normal notebook view
      this.loadNotebooks(container);
      return;
    }

    container.empty();

    const service = this.plugin.getOneNoteLocalService();
    if (!service) return;

    // Access cached hierarchy via getNotebooks (returns from cache if fresh)
    service.getNotebooks().then(notebooks => {
      container.empty();
      container.createEl('h3', { text: `Search results for "${query.trim()}"` });

      let resultCount = 0;
      const resultsDiv = container.createDiv({ cls: 'onenote-search-results' });

      for (const nb of notebooks) {
        const nbMatch = nb.name.toLowerCase().includes(trimmed);

        for (const sec of (nb.sections || [])) {
          const secMatch = sec.name.toLowerCase().includes(trimmed);

          for (const page of (sec.pages || [])) {
            const pageTitle = page.title || 'Untitled Page';
            const pageMatch = pageTitle.toLowerCase().includes(trimmed);

            if (nbMatch || secMatch || pageMatch) {
              resultCount++;
              const item = resultsDiv.createDiv({ cls: 'onenote-search-result' });

              const pathSpan = item.createDiv({ cls: 'onenote-search-path' });
              pathSpan.createSpan({ text: nb.name, cls: 'onenote-search-path-nb' });
              pathSpan.createSpan({ text: ' › ', cls: 'onenote-breadcrumb-sep' });
              pathSpan.createSpan({ text: sec.name, cls: 'onenote-search-path-sec' });
              pathSpan.createSpan({ text: ' › ', cls: 'onenote-breadcrumb-sep' });

              const titleSpan = item.createSpan({ cls: 'onenote-search-title' });
              titleSpan.textContent = pageTitle;

              this.makeClickable(item, async () => {
                this.currentNotebook = nb.id;
                this.currentNotebookName = nb.name;
                this.currentSection = sec.id;
                this.currentSectionName = sec.name;
                this.currentPage = page.id;
                this.currentPageName = pageTitle;
                await this.displayPage(page, container);
              }, `Open ${pageTitle}`);
            }
          }
        }
      }

      if (resultCount === 0) {
        container.createEl('p', {
          text: 'No matching pages found.',
          cls: 'onenote-hint-text'
        });
      }
    }).catch(err => {
      container.createEl('div', {
        cls: 'onenote-error-message',
        text: `Search failed: ${err.message}`
      });
    });
  }

  async loadNotebooks(container: HTMLElement) {
    const service = this.plugin.getOneNoteLocalService();
    if (!service) {
      container.createEl('p', {
        text: 'Local OneNote service not available.'
      });
      return;
    }

    try {
      container.empty();

      // Show loading spinner
      const loadingEl = this.showLoading(container, 'Checking for OneNote application...');

      // Check OneNote availability
      const available = await service.checkOneNoteAvailability();

      // Clear loading spinner
      loadingEl.detach();

      if (!available) {
        const errorDiv = container.createDiv({ cls: 'onenote-error-message' });

        errorDiv.createEl('h4', {
          text: 'OneNote Application Not Found',
          cls: 'onenote-error-title'
        });

        errorDiv.createEl('p', {
          text: 'The plugin could not detect OneNote on your system. Please check:'
        });

        const checklist = errorDiv.createEl('ul', { cls: 'onenote-checklist' });
        checklist.createEl('li', { text: 'OneNote is installed on your computer' });
        checklist.createEl('li', { text: 'OneNote is currently running (open the application)' });
        checklist.createEl('li', { text: 'You are using OneNote Desktop (not the UWP version from Microsoft Store)' });

        errorDiv.createEl('p', {
          text: 'Note: The free "OneNote for Windows 10" may not work. Try the full OneNote desktop app.',
          cls: 'onenote-hint-text'
        });

        new ButtonComponent(errorDiv)
          .setButtonText('Retry Detection')
          .setClass('mod-cta')
          .onClick(() => {
            this.loadNotebooks(container);
          });

        errorDiv.createEl('p', { text: '' });
        new ButtonComponent(errorDiv)
          .setButtonText('Download OneNote')
          .onClick(() => {
            window.open('https://www.onenote.com/download', '_blank');
          });

        return;
      }

      container.createEl('h3', { text: 'Select a Notebook' });

      const notebooks = await service.getNotebooks();

      // Auto-navigate to default notebook if configured
      const defaultName = this.plugin.settings.defaultNotebook.trim();
      if (defaultName) {
        const match = notebooks.find(nb =>
          nb.name.toLowerCase() === defaultName.toLowerCase()
        );
        if (match) {
          this.currentNotebook = match.id;
          this.currentNotebookName = match.name;
          this.currentSection = null;
          this.currentSectionName = '';
          this.currentPage = null;
          this.currentPageName = '';
          await this.loadSections(match.id, container);
          return;
        }
      }

      if (notebooks.length === 0) {
        const errorDiv = container.createDiv({ cls: 'onenote-error-message' });

        errorDiv.createEl('h4', {
          text: 'No Notebooks Found',
          cls: 'onenote-error-title--warning'
        });

        errorDiv.createEl('p', {
          text: 'OneNote is running, but you don\'t have any notebooks yet.'
        });

        const stepsDiv = errorDiv.createDiv();
        stepsDiv.createEl('p', {
          text: 'How to create your first notebook:',
          cls: 'onenote-steps-label'
        });

        const stepsList = stepsDiv.createEl('ol', { cls: 'onenote-steps-list' });
        stepsList.createEl('li', { text: 'Open Microsoft OneNote' });
        stepsList.createEl('li', { text: 'Click File > New' });
        stepsList.createEl('li', { text: 'Choose a location (OneDrive or This PC)' });
        stepsList.createEl('li', { text: 'Enter a name and click "Create Notebook"' });

        new ButtonComponent(errorDiv)
          .setButtonText('Retry')
          .setClass('mod-cta')
          .onClick(() => {
            this.loadNotebooks(container);
          });

        errorDiv.createEl('p', { text: '' });
        new ButtonComponent(errorDiv)
          .setButtonText('Open OneNote')
          .onClick(async () => {
            await service.openOneNoteApp();
          });

        return;
      }

      const notebookList = container.createDiv({ cls: 'onenote-notebook-list' });

      for (const notebook of notebooks) {
        this.renderListItem(notebookList, notebook.name, async () => {
          this.currentNotebook = notebook.id;
          this.currentNotebookName = notebook.name;
          this.currentSection = null;
          this.currentSectionName = '';
          this.currentPage = null;
          this.currentPageName = '';
          await this.loadSections(notebook.id, container);
        }, notebook.sections?.length);
      }
    } catch (error: any) {
      container.createEl('div', {
        cls: 'onenote-error-message',
        text: `Error loading notebooks: ${error.message}`
      });
    }
  }

  async loadSections(notebookId: string, container: HTMLElement) {
    const service = this.plugin.getOneNoteLocalService();
    if (!service) return;

    try {
      container.empty();

      // Breadcrumb + loading
      this.renderBreadcrumb(container);
      const loadingEl = this.showLoading(container, 'Loading sections...');

      const sections = await service.getSections(notebookId);
      loadingEl.detach();

      if (sections.length === 0) {
        container.createEl('p', { text: 'No sections found in this notebook' });
        return;
      }

      container.createEl('h3', { text: 'Select a Section' });
      const sectionList = container.createDiv({ cls: 'onenote-section-list' });

      for (const section of sections) {
        this.renderListItem(sectionList, section.name, async () => {
          this.currentSection = section.id;
          this.currentSectionName = section.name;
          this.currentPage = null;
          this.currentPageName = '';
          await this.loadPages(section.id, container);
        }, section.pages?.length);
      }
    } catch (error: any) {
      container.createEl('div', {
        cls: 'onenote-error-message',
        text: `Error loading sections: ${error.message}`
      });
    }
  }

  async loadPages(sectionId: string, container: HTMLElement) {
    const service = this.plugin.getOneNoteLocalService();
    if (!service) return;

    try {
      container.empty();

      // Breadcrumb + loading
      this.renderBreadcrumb(container);
      const loadingEl = this.showLoading(container, 'Loading pages...');

      const pages = await service.getPages(sectionId);
      loadingEl.detach();

      if (pages.length === 0) {
        const infoDiv = container.createDiv({ cls: 'onenote-info-message' });
        infoDiv.createEl('p', { text: 'No pages found in this section.' });

        new ButtonComponent(infoDiv)
          .setButtonText('Open Section in OneNote')
          .setClass('mod-cta')
          .onClick(async () => {
            const opened = await service.openOneNoteApp();
            if (opened) new Notice('Opening OneNote...');
          });

        return;
      }

      container.createEl('h3', { text: 'Select a Page' });
      const pageList = container.createDiv({ cls: 'onenote-page-list' });

      for (const page of pages) {
        const pageItem = pageList.createDiv({ cls: 'onenote-page-item' });
        pageItem.createSpan({ text: page.title || 'Untitled Page' });

        if (page.lastModifiedTime) {
          const dateSpan = pageItem.createSpan({ cls: 'onenote-item-date' });
          try {
            const d = new Date(page.lastModifiedTime);
            dateSpan.textContent = d.toLocaleDateString(undefined, {
              month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
            });
          } catch {
            // Invalid date string, skip
          }
        }

        this.makeClickable(pageItem, async () => {
          this.currentPage = page.id;
          this.currentPageName = page.title || 'Untitled Page';
          await this.displayPage(page, container);
        }, `Open ${page.title || 'Untitled Page'}`);
      }
    } catch (error: any) {
      container.createEl('div', {
        cls: 'onenote-error-message',
        text: `Error loading pages: ${error.message}`
      });
    }
  }

  async displayPage(page: LocalOneNotePage, container: HTMLElement) {
    container.empty();

    // Breadcrumb
    this.renderBreadcrumb(container);

    const service = this.plugin.getOneNoteLocalService();

    // Action buttons row
    const actions = container.createDiv({ cls: 'onenote-page-actions' });

    if (page.id) {
      new ButtonComponent(actions)
        .setButtonText('Open in OneNote')
        .setClass('mod-cta')
        .onClick(async () => {
          await service?.openPageInOneNote(page.id);
        });
    }

    try {
      const loadingEl = this.showLoading(container, 'Loading page content...');

      const content = await service?.getPageContent(page.id);
      loadingEl.detach();

      if (content) {
        const iframeContainer = container.createDiv({ cls: 'onenote-embed-container' });
        // Wrap content in a complete HTML document for proper iframe rendering
        // Use prefers-color-scheme for theme-aware colors since srcdoc iframes
        // cannot inherit Obsidian's CSS variables directly.
        const htmlShell = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:light dark}
body{font-family:system-ui,-apple-system,sans-serif;padding:12px;margin:0;line-height:1.6;color:#1a1a1a;background:#fff}
img{max-width:100%;height:auto}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:8px}
@media(prefers-color-scheme:dark){
body{color:#e0e0e0;background:#1e1e1e}
td,th{border-color:#444}
}
</style>
</head><body>${content}</body></html>`;
        iframeContainer.createEl('iframe', {
          cls: 'onenote-iframe',
          attr: { srcdoc: htmlShell, frameborder: '0' }
        });
      } else {
        container.createEl('p', {
          text: 'Could not retrieve page content. Opening in OneNote application is recommended.'
        });
      }
    } catch (error: any) {
      container.createEl('div', {
        cls: 'onenote-error-message',
        text: `Error loading page content: ${error.message}`
      });
    }
  }

  async onClose() {
    // Nothing to clean up
  }
}
