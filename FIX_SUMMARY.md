# OneNote 代码块嵌入功能修复总结

## 问题描述

` ```onenote ` 代码块无法正常 embed OneNote 页面内容。

## 根本原因

1. **违反 Obsidian 渲染机制**: 原代码在 Markdown post processor 中尝试动态修改容器内容
2. **用户交互后清空容器**: 当用户选择页面并点击"Load Page"按钮时,使用 `container.empty()` 清空容器然后创建 iframe,这在 Obsidian 的渲染流程中是不允许的
3. **缺少 MarkdownView 导入**: 需要访问编辑器来更新源代码块

## 修复方案

### 1. 修改渲染逻辑 (`onenote-codeblock.ts`)

**关键改进**:
- 当用户提供页面ID时,立即渲染内容(不延迟到用户交互)
- 当没有页面ID时,显示选择器UI
- 用户选择页面后,**更新 Markdown 源代码**而不是直接修改 DOM
- 添加正确的样式和视觉反馈

**具体变更**:
```typescript
// 旧代码: 直接修改容器(错误)
container.empty();
const iframe = container.createEl('iframe', {...});

// 新代码: 更新 Markdown 源(正确)
const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
if (activeView) {
  const editor = activeView.editor;
  // 找到代码块并更新其内容
  newLines[codeBlockStart + 1] = pageId;
  editor.setValue(newLines.join('\n'));
}
```

### 2. 添加缺失的方法 (`onenote-service.ts`)

添加了 `openInOneNote` 方法:
```typescript
async openInOneNote(pageId: string): Promise<void> {
  const page = await this.getPage(pageId);

  // 优先使用客户端 URL
  if (page.links?.oneNoteClientUrl?.href) {
    window.open(page.links.oneNoteClientUrl.href, '_blank');
    return;
  }

  // 回退到网页 URL
  if (page.links?.oneNoteWebUrl?.href) {
    window.open(page.links.oneNoteWebUrl.href, '_blank');
  }

  throw new Error('No URL available to open the page');
}
```

### 3. 改进 UI/UX

- 添加图标和更好的视觉层次
- 提供"Load Page"和"Open in OneNote"两个按钮
- 使用 Obsidian 主题变量保持一致的外观
- 添加加载状态和错误提示

## 工作流程

### 初次插入代码块

1. 用户执行命令 "Insert OneNote embed block"
2. 在光标位置插入空代码块:
   ```
   ```onenote
   ```
   ```
3. Obsidian 自动渲染代码块,显示页面选择器

### 选择并加载页面

1. 用户从下拉列表选择一个页面
2. 点击"Load Page"按钮
3. 插件找到当前代码块的边界
4. 将页面ID插入代码块内容:
   ```
   ```onenote
   page-id-here
   ```
   ```
5. Obsidian 检测到内容变化,重新渲染代码块
6. 新的渲染流程检测到页面ID,立即获取并显示内容

## 测试步骤

1. 确保 OneNote 正在运行
2. 在 Obsidian 中启用此插件
3. 创建或打开一个笔记
4. 执行命令 "Insert OneNote embed block"
5. 应该看到页面选择器界面
6. 选择一个页面并点击"Load Page"
7. 代码块应该更新并显示嵌入的 OneNote 内容

## 技术细节

### Obsidian Markdown Post Processor 限制

- Post processor 是**同步执行**的
- 不应该在用户交互后**直接修改**容器DOM
- 如果需要更新显示,应该**修改源文件**让 Obsidian 重新渲染

### 为什么原来的方法不行

```typescript
// 这是错误的做法!
loadButton.addEventListener('click', async () => {
  container.empty();  // ❌ 不允许清空容器
  const iframe = container.createEl('iframe', {...});  // ❌ 不允许创建新元素
});
```

### 正确的做法

```typescript
// 这是正确的做法!
loadButton.addEventListener('click', async () => {
  // 1. 找到源代码块位置
  const codeBlockStart = findCodeBlockStart(editor, cursor);
  const codeBlockEnd = findCodeBlockEnd(editor, cursor);

  // 2. 更新源代码
  const lines = editor.getValue().split('\n');
  lines[codeBlockStart + 1] = pageId;
  editor.setValue(lines.join('\n'));

  // 3. Obsidian 会自动重新渲染
});
```

## 相关文件

- `src/onenote-codeblock.ts` - 代码块渲染逻辑
- `src/onenote-service.ts` - Cloud API 服务(添加了 openInOneNote 方法)
- `src/local-onenote-service.ts` - 本地 OneNote 服务(已有 openPageInOneNote)
- `src/main.ts` - 插件主文件和设置
