import { ItemView, WorkspaceLeaf, Notice, ButtonComponent } from 'obsidian';
import { ONE_NOTE_VIEW_TYPE } from './main';
import OneNoteIntegrationPlugin from './main';
import { LocalOneNoteNotebook, LocalOneNoteSection, LocalOneNotePage } from './types';

export class OneNoteEmbedView extends ItemView {
  plugin: OneNoteIntegrationPlugin;
  private currentNotebook: string | null = null;
  private currentSection: string | null = null;
  private currentPage: string | null = null;

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

    const refreshButton = new ButtonComponent(headerDiv)
      .setButtonText('Load Notebooks')
      .onClick(async () => {
        await this.loadNotebooks(container);
      });

    const platformInfo = this.plugin.getOneNoteLocalService()?.getPlatformInfo();
    headerDiv.createSpan({
      text: ` (Local Mode - ${platformInfo?.platform || 'unknown'})`
    });

    // Create content area
    const contentDiv = container.createDiv({ cls: 'onenote-content' });

    // Load notebooks
    await this.loadNotebooks(contentDiv);
  }

  /** Create a clickable list item with unified styling. */
  private renderListItem(
    parent: HTMLElement, text: string, onClick: () => void | Promise<void>
  ): HTMLElement {
    const item = parent.createDiv({ cls: 'onenote-list-item' });
    item.createSpan({ text });
    item.addEventListener('click', onClick);
    return item;
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

      // Show loading message
      const loadingDiv = container.createDiv({ cls: 'onenote-loading' });
      loadingDiv.textContent = 'Checking for OneNote application...';

      // Check OneNote availability
      const available = await service.checkOneNoteAvailability();

      // Clear loading message
      container.empty();

      if (!available) {
        const errorDiv = container.createDiv({ cls: 'onenote-error-message' });
        errorDiv.style.padding = '15px';

        errorDiv.createEl('h4', {
          text: 'OneNote Application Not Found',
          attr: { style: 'margin-top: 0; color: var(--text-error);' }
        });

        errorDiv.createEl('p', {
          text: 'The plugin could not detect OneNote on your system. Please check:'
        });

        const checklist = errorDiv.createEl('ul');
        checklist.style.marginLeft = '20px';
        checklist.createEl('li', { text: 'OneNote is installed on your computer' });
        checklist.createEl('li', { text: 'OneNote is currently running (open the application)' });
        checklist.createEl('li', { text: 'You are using OneNote Desktop (not the UWP version from Microsoft Store)' });

        errorDiv.createEl('p', {
          text: 'Note: The free "OneNote for Windows 10" may not work. Try the full OneNote desktop app.',
          attr: { style: 'font-style: italic; margin-top: 10px;' }
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

      if (notebooks.length === 0) {
        const errorDiv = container.createDiv({ cls: 'onenote-error-message' });
        errorDiv.style.padding = '20px';
        errorDiv.style.borderRadius = '6px';

        errorDiv.createEl('h4', {
          text: 'No Notebooks Found',
          attr: { style: 'margin-top: 0; color: var(--text-warning);' }
        });

        errorDiv.createEl('p', {
          text: 'OneNote is running, but you don\'t have any notebooks yet.'
        });

        const stepsDiv = errorDiv.createDiv();
        stepsDiv.createEl('p', {
          text: 'How to create your first notebook:',
          attr: { style: 'font-weight: bold; margin-bottom: 10px;' }
        });

        const stepsList = stepsDiv.createEl('ol');
        stepsList.style.marginLeft = '20px';
        stepsList.style.lineHeight = '1.8';
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
          await this.loadSections(notebook.id, container);
        });
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

      new ButtonComponent(container)
        .setButtonText('< Back to Notebooks')
        .onClick(() => {
          this.loadNotebooks(container);
        });

      container.createEl('h3', { text: 'Select a Section' });

      const sections = await service.getSections(notebookId);

      if (sections.length === 0) {
        container.createEl('p', { text: 'No sections found in this notebook' });
        return;
      }

      const sectionList = container.createDiv({ cls: 'onenote-section-list' });

      for (const section of sections) {
        this.renderListItem(sectionList, section.name, async () => {
          this.currentSection = section.id;
          await this.loadPages(section.id, container);
        });
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

      new ButtonComponent(container)
        .setButtonText('< Back to Sections')
        .onClick(() => {
          if (this.currentNotebook) {
            this.loadSections(this.currentNotebook, container);
          }
        });

      container.createEl('h3', { text: 'Select a Page' });

      const pages = await service.getPages(sectionId);

      if (pages.length === 0) {
        const infoDiv = container.createDiv({ cls: 'onenote-info-message' });
        infoDiv.style.padding = '15px';
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

      const pageList = container.createDiv({ cls: 'onenote-page-list' });

      for (const page of pages) {
        const pageItem = pageList.createDiv({ cls: 'onenote-page-item' });
        pageItem.createSpan({ text: page.title || 'Untitled Page' });

        pageItem.addEventListener('click', async () => {
          this.currentPage = page.id;
          await this.displayPage(page, container);
        });
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

    new ButtonComponent(container)
      .setButtonText('< Back to Pages')
      .onClick(() => {
        if (this.currentSection) {
          this.loadPages(this.currentSection, container);
        }
      });

    const service = this.plugin.getOneNoteLocalService();

    if (page.id) {
      new ButtonComponent(container)
        .setButtonText('Open in OneNote')
        .onClick(async () => {
          await service?.openPageInOneNote(page.id);
        });
    }

    try {
      const content = await service?.getPageContent(page.id);
      if (content) {
        const iframeContainer = container.createDiv({ cls: 'onenote-embed-container' });
        iframeContainer.createEl('iframe', {
          cls: 'onenote-iframe',
          attr: { srcdoc: content, frameborder: '0' }
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
