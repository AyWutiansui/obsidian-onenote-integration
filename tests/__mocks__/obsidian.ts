/**
 * Mock implementation of the 'obsidian' module for unit tests.
 *
 * Provides stubs for all Obsidian APIs used by the plugin so that
 * TypeScript source files can be imported without the real Obsidian runtime.
 */

export class Notice {
  message: string;
  constructor(message: string, _timeout?: number) {
    this.message = message;
  }
}

export function setIcon(_el: HTMLElement, _icon: string): void {
  // no-op in tests
}

export class MarkdownRenderChild {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  onunload(): void {}
  load(_fn: () => unknown): void {}
  unload(): void {}
  register(_fn: () => unknown): void {}
  registerEvent(_evt: unknown): void {}
  addChild(_child: MarkdownRenderChild): void {}
}

export class Plugin {
  app: any = {};
  manifest: any = { dir: 'obsidian-onenote-integration' };
  async loadData(): Promise<any> { return {}; }
  async saveData(_data: any): Promise<void> {}
  addCommand(_cmd: any): void {}
  addRibbonIcon(_icon: string, _title: string, _cb: () => void): void {}
  registerView(_type: string, _factory: (leaf: any) => any): void {}
  addSettingTab(_tab: any): void {}
  registerMarkdownCodeBlockProcessor(_lang: string, _handler: any): void {}
}

export class ItemView {
  containerEl: any = {
    children: [null, document.createElement('div')],
  };
  getViewType(): string { return ''; }
  getDisplayText(): string { return ''; }
  getIcon(): string { return ''; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any = {
    empty(): void {},
    createEl(): HTMLElement { return document.createElement('div'); },
  };
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
  display(): void {}
}

export class Setting {
  constructor(_containerEl: any) {}
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addDropdown(_cb: (d: any) => any): this { return this; }
  addText(_cb: (t: any) => any): this { return this; }
}

export class ButtonComponent {
  private _el: HTMLElement;
  constructor(containerEl: any) {
    this._el = document.createElement('button');
    if (containerEl && containerEl.appendChild) {
      containerEl.appendChild(this._el);
    }
  }
  setButtonText(text: string): this {
    this._el.textContent = text;
    return this;
  }
  onClick(cb: () => void): this {
    this._el.addEventListener('click', cb);
    return this;
  }
  setClass(cls: string): this {
    this._el.classList.add(cls);
    return this;
  }
  setIcon(_icon: string): this { return this; }
  setTooltip(_tooltip: string): this { return this; }
}

export class Modal {
  app: any;
  contentEl: HTMLElement = document.createElement('div');
  constructor(app: any) { this.app = app; }
  open(): void {}
  close(): void {}
}

export class MarkdownView {
  previewMode: any = { rerender: () => {} };
}

export class TFile {
  path: string = '';
  basename: string = '';
  extension: string = 'md';
}

export class Editor {
  getCursor(): any { return { line: 0, ch: 0 }; }
  replaceRange(_text: string, _from: any, _to?: any): void {}
  setCursor(_line: number, _ch: number): void {}
}

export class WorkspaceLeaf {}

export class TextComponent {
  private _el: HTMLInputElement;
  constructor(containerEl: any) {
    this._el = document.createElement('input');
    if (containerEl && containerEl.appendChild) {
      containerEl.appendChild(this._el);
    }
  }
  setPlaceholder(_text: string): this { return this; }
  setValue(_value: string): this { return this; }
  onChange(_cb: (value: string) => void): this { return this; }
}
