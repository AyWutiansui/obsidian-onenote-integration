# 使用说明

## 前提条件

使用本插件前，请确保：

1. OneNote 桌面版已安装并正在运行（Microsoft 365 或 Office 2016+，不支持 Windows 10 自带的 UWP 版本）
2. OneNote 中已打开至少一个笔记本
3. 插件已安装并在 Obsidian 设置中启用

## 浏览 OneNote 笔记

### 打开侧边栏

点击左侧边栏的书本图标，或使用命令面板（`Ctrl+P`）搜索 `Open OneNote view`。

### 浏览层级结构

侧边栏以三级层级展示 OneNote 内容：

1. **笔记本列表**：打开侧边栏后自动加载所有已打开的笔记本，点击 "Load Notebooks" 刷新
2. **分区列表**：点击某个笔记本后显示其下的所有分区（包括分区组内的分区）
3. **页面列表**：点击某个分区后显示其下的所有页面

每个层级都有返回按钮（如 `< Back to Notebooks`），方便在层级间导航。

### 在 OneNote 中打开

在侧边栏中，分区和页面都提供 "Open in OneNote" 按钮，点击后 OneNote 桌面应用会自动导航到对应位置。

## 在笔记中嵌入 OneNote 页面

### 方法 A：交互式页面选择器

1. 在笔记中将光标放在想插入的位置
2. 按 `Ctrl+P` 打开命令面板，输入 `Insert OneNote embed block`
3. 在生成的空代码块中，使用三级级联下拉菜单选择：笔记本 → 分区 → 页面
4. 点击 **Load Page** 按钮，OneNote 窗口将实时嵌入到笔记中

下拉菜单旁边还有一个 **Open in OneNote** 按钮，可以在不嵌入的情况下直接在 OneNote 中打开选中的页面。

### 方法 B：直接指定页面 ID

如果你已经知道页面 ID（通常是 GUID 格式），可以直接写入代码块：

````markdown
```onenote
{12345678-ABCD-1234-ABCD-1234567890AB}
我的页面标题
```
````

第一行是页面 ID，第二行是可选的标题（用于在编辑器中显示）。

### 方法 C：粘贴 OneNote URL

从 OneNote 中复制的链接也可以直接使用：

````markdown
```onenote
https://onedrive.live.com/...?id={page-id}
```
````

插件会自动从 URL 的 `id` 或 `page-id` 参数中提取页面 ID。

## 嵌入窗口操作

### 分离与附加

嵌入的 OneNote 窗口下方有一个切换按钮：

- **Detach OneNote Window**：将嵌入的窗口分离为独立的 OneNote 窗口，方便在其他位置查看
- **Attach OneNote Window**：将分离的窗口重新附加回笔记中的嵌入位置

也可以通过命令面板执行 `Detach OneNote window` 来分离当前嵌入。

### 自动遮挡

当以下情况发生时，嵌入的 OneNote 窗口会自动隐藏：

- Obsidian 命令面板（`Ctrl+P`）或其他模态框覆盖了嵌入区域
- 悬浮预览或右键菜单出现在嵌入区域上方
- 嵌入区域滚动出可视范围
- 嵌入区域超出屏幕边界或 Obsidian 窗口边界

当遮挡消除后，窗口会自动恢复显示。

### 调整嵌入高度

嵌入区域的高度由 `Embed Aspect Ratio` 设置控制（默认 0.67，即高度 = 宽度 × 0.67）。在 Obsidian 设置 → OneNote Integration 中拖动滑块调整（范围 0.3 ~ 2.0）。修改后需重新打开笔记才能生效。

## 其他命令

| 命令 | 说明 |
|------|------|
| `Quit OneNote` | 通过 COM 接口关闭 OneNote 桌面应用 |

## 设置

打开 Obsidian 设置 → OneNote Integration：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| Default Notebook | （空） | 默认打开的笔记本名称，留空则显示所有笔记本 |
| Embed Aspect Ratio | 0.67 | 嵌入区域高度/宽度比例，滑块范围 0.3 ~ 2.0 |

设置面板还会显示当前检测到的平台信息。

## 常见问题

### Q: 侧边栏显示 "OneNote application not found"

确保 OneNote 桌面版正在运行。点击侧边栏中的 "Retry Detection" 按钮重新检测。如果仍然找不到，可以尝试：

1. 运行诊断脚本：`powershell -File archive/scripts/diagnose-onenote.ps1`
2. 确认 OneNote 是桌面版（Microsoft 365），不是 UWP 版
3. 重启 OneNote 后再试

### Q: 侧边栏显示 "No notebooks found"

说明 OneNote 正在运行但没有打开任何笔记本。点击 "Open OneNote" 按钮打开 OneNote，手动打开一个笔记本后点击 "Retry" 刷新。

### Q: 嵌入的窗口位置偏移或不对齐

1. 尝试滚动一下页面，窗口会自动重新定位
2. 如果使用多显示器，切换显示器后 DPI 可能变化，需要重新打开笔记
3. 确保使用最新版本的插件

### Q: 嵌入的窗口闪烁

在嵌入区域可见时避免快速切换 Obsidian 的模态框。插件有遮挡检测，但快速切换时可能有短暂的视觉闪烁。

### Q: 手写笔记的页面显示空白或只有一个笔图标

OneNote 手写内容（InkDrawing）的二进制格式无法直接在浏览器中渲染。插件会尝试提取伴随的预览图像，但部分手写页面可能没有可用的预览，这种情况下会显示手写页面的提示标识。

## 开发调试

```bash
npm run dev    # watch 模式开发构建
npm test       # 运行测试
```

在 Obsidian 中打开开发者工具（`Ctrl+Shift+I`）查看 Console 日志。插件的调试日志以 `[OneNote]` 前缀输出。
