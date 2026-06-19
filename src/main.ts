import { Plugin, WorkspaceLeaf, Editor, Notice, PluginSettingTab, App, Setting } from 'obsidian';
import { OneNoteLocalService } from './local-onenote-service';
import { OneNoteEmbedView } from './onenote-view';
import { OneNoteCodeBlockRenderer } from './onenote-codeblock';
import { ensureExeFiles } from './exe-downloader';

export interface OneNotePluginSettings {
  defaultNotebook: string;
  embedAspectRatio: number;
}

const DEFAULT_SETTINGS: OneNotePluginSettings = {
  defaultNotebook: '',
  embedAspectRatio: 0.67,
};

export const ONE_NOTE_VIEW_TYPE = 'onenote-embed-view';

export default class OneNoteIntegrationPlugin extends Plugin {
  settings!: OneNotePluginSettings;
  localOneNoteService: OneNoteLocalService | null = null;
  private statusBarEl: HTMLElement | null = null;

  async onload() {
    console.log('Loading OneNote Integration plugin');

    await this.loadSettings();

    // Status bar item
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText('OneNote: checking...');
    this.statusBarEl.setAttribute('aria-label', 'OneNote connection status');
    this.updateOneNoteStatus();

    // Register view type
    this.registerView(
      ONE_NOTE_VIEW_TYPE,
      (leaf) => new OneNoteEmbedView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon('book-open', 'Open OneNote', () => {
      this.openOneNoteView();
    });

    // Add command to open OneNote view
    this.addCommand({
      id: 'open-onenote-view',
      name: 'Open OneNote view',
      callback: () => {
        this.openOneNoteView();
      }
    });

    // Add command to insert OneNote embed
    this.addCommand({
      id: 'insert-onenote-embed',
      name: 'Insert OneNote embed block',
      editorCallback: (editor: Editor) => {
        this.insertOneNoteEmbed(editor);
      }
    });

    // Add command to detach the embedded OneNote window
    this.addCommand({
      id: 'detach-onenote-window',
      name: 'Detach OneNote window',
      callback: async () => {
        if (this.localOneNoteService) {
          await this.localOneNoteService.detachOneNoteWindow();
          new Notice('OneNote window detached');
        }
      }
    });

    // Add command to quit OneNote entirely
    this.addCommand({
      id: 'quit-onenote',
      name: 'Quit OneNote',
      callback: async () => {
        if (this.localOneNoteService) {
          await this.localOneNoteService.quitOneNote();
          new Notice('OneNote closed');
        }
      }
    });

    // Add settings tab
    this.addSettingTab(new OneNoteSettingTab(this.app, this));

    // Initialize local OneNote service
    this.localOneNoteService = new OneNoteLocalService();
    const pluginDir = (this.app.vault.adapter as any).basePath + '/' + this.manifest.dir;
    this.localOneNoteService.setPluginDir(pluginDir);

    // Auto-download helper executables if missing (non-blocking)
    ensureExeFiles(pluginDir, this.manifest.version).then(result => {
      if (result === 'downloaded') {
        console.log('[OneNote] Executables downloaded, reloading plugin...');
        const plugins = (this.app as any).plugins;
        plugins.disablePlugin(this.manifest.id).then(() => {
          plugins.enablePlugin(this.manifest.id);
        });
      }
    }).catch(e => {
      console.error('[OneNote] exe check failed:', e);
    });

    // Register code block renderer
    this.registerMarkdownCodeBlockProcessor('onenote', (source, el, ctx) => {
      const renderer = new OneNoteCodeBlockRenderer(this);
      renderer.renderCodeBlock(source, el, ctx);
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(ONE_NOTE_VIEW_TYPE);
    this.statusBarEl = null;
    // Release embedded OneNote window on plugin unload
    if (this.localOneNoteService) {
      // Try async detach, but force kill if it doesn't complete quickly
      this.localOneNoteService.detachOneNoteWindow().catch(() => {});
      // Sync fallback: force stop after 100ms if detach hasn't completed
      setTimeout(() => {
        try {
          this.localOneNoteService?.forceStopEmbedManager();
        } catch {}
      }, 100);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Only initialize local service if it hasn't been created yet
    // (recreating it here would destroy active embed sessions and caches)
    if (!this.localOneNoteService) {
      this.localOneNoteService = new OneNoteLocalService();
      this.localOneNoteService.setPluginDir(
        (this.app.vault.adapter as any).basePath + '/' + this.manifest.dir
      );
    }
  }

  getOneNoteLocalService(): OneNoteLocalService | null {
    return this.localOneNoteService;
  }

  async openOneNoteView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(ONE_NOTE_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({
        type: ONE_NOTE_VIEW_TYPE,
        active: true
      });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  insertOneNoteEmbed(editor: Editor) {
    const cursor = editor.getCursor();
    const embedBlock = `\`\`\`onenote\n\`\`\`\n`;
    editor.replaceRange(embedBlock, cursor);
    editor.setCursor(cursor.line + 1, 0);
  }

  async updateOneNoteStatus() {
    if (!this.statusBarEl) return;
    try {
      const available = await this.localOneNoteService?.checkOneNoteAvailability();
      if (available) {
        this.statusBarEl.setText('OneNote: connected');
      } else {
        this.statusBarEl.setText('OneNote: not found');
      }
    } catch {
      this.statusBarEl.setText('OneNote: error');
    }
  }
}

class OneNoteSettingTab extends PluginSettingTab {
  plugin: OneNoteIntegrationPlugin;

  constructor(app: App, plugin: OneNoteIntegrationPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'OneNote Integration Settings' });

    // Local mode settings
    containerEl.createEl('h3', { text: 'Local OneNote Settings' });

    containerEl.createEl('p', {
      text: 'This plugin connects directly to your installed OneNote desktop application. No Azure configuration needed.'
    });

    const platformInfo = this.plugin.getOneNoteLocalService()?.getPlatformInfo();
    if (platformInfo) {
      containerEl.createEl('p', {
        text: `Detected platform: ${platformInfo.platform}`
      });
    }

    containerEl.createEl('p', {
      text: 'Requirements: OneNote desktop app must be running to access notebooks.'
    });

    new Setting(containerEl)
      .setName('Default Notebook')
      .setDesc('Automatically open this notebook when the OneNote sidebar loads. Enter the exact notebook name.')
      .addText(text => text
        .setPlaceholder('Notebook name')
        .setValue(this.plugin.settings.defaultNotebook)
        .onChange(async (value) => {
          this.plugin.settings.defaultNotebook = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Embed Aspect Ratio')
      .setDesc('Height-to-width ratio for embedded OneNote blocks (e.g. 0.67 = 2:3). Reload note to apply.')
      .addSlider(slider => slider
        .setLimits(0.3, 2.0, 0.01)
        .setValue(this.plugin.settings.embedAspectRatio)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.embedAspectRatio = value;
          await this.plugin.saveSettings();
        }));
  }
}
