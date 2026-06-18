# Obsidian OneNote Integration Plugin

这个 Obsidian 插件允许你在 Obsidian 中直接嵌入和浏览 OneNote 笔记，通过本地 OneNote 桌面应用的 COM 接口实现实时窗口嵌入，无需任何云服务或 Azure 配置。

## 功能

- **实时窗口嵌入**：将 OneNote 桌面窗口直接嵌入 Obsidian 笔记中，非截图、非 iframe，而是真正的 OneNote 窗口
- **侧边栏浏览**：在 Obsidian 侧边栏中浏览笔记本、分区和页面的完整层级结构
- **交互式页面选择器**：空代码块中提供三级级联下拉菜单（笔记本 → 分区 → 页面），快速选择要嵌入的页面
- **分离/附加切换**：嵌入的 OneNote 窗口可以随时分离为独立窗口，或重新附加回笔记
- **手写内容支持**：自动检测手写笔记页面，提取 InkDrawing/InkPicture 的预览图像
- **富内容解析**：支持将 OneNote XML 转换为 HTML，包括文本、表格、图片和手写墨迹
- **智能遮挡检测**：当 Obsidian 模态框、命令面板或悬浮预览覆盖嵌入区域时，自动隐藏 OneNote 窗口
- **DPI 感知**：完整支持高 DPI 显示器和多显示器环境下的坐标追踪
- **层级缓存**：5 分钟 TTL 缓存，避免频繁调用 COM 接口，提升响应速度
- **macOS 基础支持**：通过 AppleScript 提供基本的 OneNote 操作（macOS 功能较有限）

## 系统要求

- **Windows**：OneNote 桌面版（Microsoft 365 或 Office 2016+），PowerShell 可用
- **macOS**：OneNote for Mac（基础支持）
- **Obsidian** v1.0.0 或更高版本
- 使用插件前需确保 OneNote 桌面应用正在运行

## 快速开始

### 步骤 1：确保 OneNote 正在运行

打开 OneNote 桌面版并登录你的账户，确保至少有一个笔记本已打开。

### 步骤 2：安装并启用插件

将插件文件复制到 Obsidian vault 的 `.obsidian/plugins/obsidian-onenote-integration/` 目录下，然后在 Obsidian 设置中启用 "OneNote Integration" 插件。

### 步骤 3：浏览 OneNote 内容

点击左侧边栏的书本图标（或使用命令面板 `Open OneNote view`），即可浏览笔记本、分区和页面。

### 步骤 4：在笔记中嵌入 OneNote 页面

将光标放在想要插入的位置，使用命令面板执行 `Insert OneNote embed block`，或者手动创建一个 `onenote` 代码块：

````markdown
```onenote
```
````

在空代码块中会显示交互式页面选择器，选择笔记本、分区和页面后点击 "Load Page"，OneNote 窗口将实时嵌入到笔记中。

### 直接指定页面

如果你已经知道页面 ID，可以直接写入代码块：

````markdown
```onenote
{12345678-ABCD-1234-ABCD-1234567890AB}
我的页面标题
```
````

也支持粘贴 OneNote URL（自动提取 `id` 或 `page-id` 参数）：

````markdown
```onenote
https://onedrive.live.com/...?id={page-id}
```
````

## 命令

| 命令 | 说明 |
|------|------|
| `Open OneNote view` | 打开侧边栏面板，浏览笔记本层级 |
| `Insert OneNote embed block` | 在光标位置插入 onenote 代码块 |
| `Detach OneNote window` | 将当前嵌入的 OneNote 窗口分离为独立窗口 |
| `Quit OneNote` | 关闭 OneNote 桌面应用 |

## 设置

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| Default Notebook | （空） | 默认打开的笔记本名称 |
| Embed Aspect Ratio | 0.67 | 嵌入区域的高度/宽度比例（0.3 ~ 2.0），修改后需重新打开笔记生效 |

## 技术架构

### 本地 COM 模式

插件通过 Windows COM 接口直接与 OneNote 桌面应用通信，核心操作（导航、获取页面内容、查询层级结构）通过 PowerShell 脚本和 C++ 原生程序执行。macOS 上通过 AppleScript 提供基础支持。

### 实时窗口嵌入

嵌入功能并非使用 iframe 或截图，而是通过 C++ 原生 overlay 窗口将 OneNote 的实际窗口重新定位到 Obsidian 笔记中的代码块位置：

1. **`win-embed-overlay.exe`**：创建一个无边框的 WS_POPUP overlay 窗口，通过 DWM 合成与 Obsidian 窗口正确叠加。接收 stdin 命令（坐标更新、分离、退出）实现实时控制。
2. **`CoordinateTracker`**：追踪代码块 DOM 元素的屏幕绝对坐标，综合 ResizeObserver、滚动监听、MutationObserver 和 rAF 轮询四种策略，确保嵌入窗口始终与代码块位置同步。
3. **遮挡与边界检测**：当嵌入区域被 Obsidian 的模态框、命令面板等遮挡，或滚动出可视区域/屏幕边界时，自动隐藏 OneNote 窗口。

### C++ 辅助程序

| 程序 | 用途 |
|------|------|
| `onenote-repos.exe` | COM 操作：导航到页面、获取 URL、查找/显示窗口、退出 OneNote |
| `win-embed-overlay.exe` | 窗口嵌入：创建 overlay、reparent/position-only 模式、stdin 命令循环 |

两个程序均编译为独立的单文件 exe，无外部运行时依赖。

## 项目结构

```
obsidian-onenote-integration/
├── src/
│   ├── main.ts                        # 插件入口，注册命令和设置
│   ├── local-onenote-service.ts       # 本地 COM/AppleScript 服务
│   ├── onenote-view.ts                # 侧边栏层级浏览视图
│   ├── onenote-codeblock.ts           # onenote 代码块处理器
│   ├── embed/
│   │   ├── window-embed-manager.ts    # 窗口嵌入管理（子进程通信）
│   │   └── coordinate-tracker.ts      # DOM 坐标追踪与遮挡检测
│   ├── services/
│   │   ├── onenote-xml-parser.ts      # OneNote XML → HTML 解析
│   │   └── embed-session.ts           # 嵌入会话管理（单实例）
│   ├── utils/
│   │   └── parse-codeblock-source.ts  # 代码块内容解析
│   └── types.ts                       # 类型定义
├── repos.c                            # onenote-repos.exe 源码
├── win-embed-overlay.c                # win-embed-overlay.exe 源码
├── manifest.json                      # Obsidian 插件清单
├── styles.css                         # 样式
├── package.json                       # 依赖与脚本
├── tsconfig.json                      # TypeScript 配置
├── esbuild.config.mjs                 # 构建配置
└── archive/
    └── scripts/
        └── diagnose-onenote.ps1       # OneNote 诊断脚本
```

## 开发

### 前置要求

- Node.js v16+
- Visual Studio Build Tools（编译 C++ 辅助程序，需 `vcvarsall x64`）

### 安装与构建

```bash
cd obsidian-onenote-integration
npm install
npm run build      # TypeScript 检查 + esbuild 生产构建 + 复制文件到测试 vault
npm run dev        # watch 模式开发
npm test           # 运行测试（vitest）
```

### 编译 C++ 辅助程序

```cmd
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cl /O2 /EHsc repos.c user32.lib ole32.lib oleaut32.lib /Fe:onenote-repos.exe
cl /O2 /EHsc win-embed-overlay.c user32.lib psapi.lib dwmapi.lib shcore.lib /Fe:win-embed-overlay.exe
```

### 技术栈

- **TypeScript** — 插件主体
- **C** — 原生窗口操作辅助程序
- **PowerShell** — COM 接口调用
- **esbuild** — 快速构建（CJS, browser target）
- **vitest** — 单元测试
- **Obsidian Plugin API** — 插件框架
- **Windows COM / DWM** — 窗口嵌入与合成

## 故障排除

### "OneNote application not found"

1. 确保 OneNote 桌面版正在运行（不是 Windows 10 自带的 UWP 版本）
2. 运行诊断脚本：`powershell -File archive/scripts/diagnose-onenote.ps1`
3. 检查 OneNote 是否已正确安装

### "No notebooks found"

1. 在 OneNote 中打开至少一个笔记本
2. 等待 OneNote 完全加载后再使用插件
3. 尝试在 OneNote 中手动打开笔记本后再刷新

### 嵌入窗口位置不对或闪烁

1. 确保使用最新版本的插件（已包含 rAF 节流和 DPI 修复）
2. 避免在嵌入区域显示时打开 Obsidian 命令面板或模态框（遮挡检测会自动处理，但快速切换时可能有短暂闪烁）
3. 如果使用多显示器，切换显示器后可能需要重新打开笔记以重新校准 DPI

### 嵌入高度不正确

调整设置中的 `Embed Aspect Ratio` 值（默认 0.67），修改后需重新打开笔记才能生效。

## 已知限制

- **架构性延迟**：GPU compositor 与 native 窗口移动之间存在约 1 帧（~16ms@60fps）的固有延迟，这是 Windows DWM 架构限制，无法消除
- **macOS 功能有限**：macOS 上仅支持基本的 OneNote 操作，不支持实时窗口嵌入
- **手写笔记渲染**：OneNote 手写内容（InkDrawing）的 ISF 二进制格式无法在浏览器中渲染，插件尝试提取伴随的预览图像，但不保证所有手写内容都有可用的预览
- **单实例嵌入**：同时只能有一个活跃的嵌入会话

## 致谢

[LINUX DO — 中文开发者社区](https://linux.do/)

## 许可证

MIT License
