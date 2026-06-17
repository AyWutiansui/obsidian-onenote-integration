# 本地 OneNote 模式使用指南

## 概述

本地模式允许你直接连接到已安装的 OneNote 桌面应用程序，**无需 Azure AD 配置**。这是最简单、最推荐的使用方式。

## 系统要求

- **操作系统**: Windows 10/11 或 macOS
- **OneNote**: Microsoft OneNote 桌面应用（已安装并登录）
- **Obsidian**: 最新版本

## 快速开始（3步）

### 步骤 1: 确保 OneNote 正在运行

在打开 Obsidian 之前，请确保：
1. OneNote 桌面应用已安装
2. OneNote 正在运行
3. 你已经登录到 Microsoft 账户
4. 你的笔记本已经同步完成

### 步骤 2: 启用本地模式

1. 打开 Obsidian
2. 进入 **设置** > **社区插件** > **OneNote Integration**
3. 在 "Connection Mode" 下拉框中选择 **"Local OneNote App (No Azure required)"**
4. 关闭设置

### 步骤 3: 使用插件

#### 方法 A: 侧边栏浏览
1. 点击左侧边栏的 **书本图标**
2. 点击 **Load Notebooks** 按钮
3. 选择笔记本 > 分区 > 页面
4. 页面会显示在视图中

#### 方法 B: 在笔记中嵌入
1. 将光标放在想要插入的位置
2. 按 `Ctrl+P` 打开命令面板
3. 输入 `OneNote: Insert OneNote embed block`
4. 在生成的代码块中选择要嵌入的页面

## 工作原理

本地模式通过以下方式与 OneNote 交互：

### Windows
- 使用 **COM 自动化** (OneNote.Application)
- 通过 PowerShell 执行 OneNote API 调用
- 获取笔记本层级结构和页面内容

### macOS
- 使用 **AppleScript**
- 与 Microsoft OneNote.app 交互
- 获取笔记本和页面信息

## 故障排除

### 问题: "OneNote application not found"

**解决方案:**
1. 确保 OneNote 已安装
2. 启动 OneNote 应用程序
3. 等待笔记本完全加载
4. 重试检测

### 问题: "No notebooks found"

**解决方案:**
1. 确认 OneNote 中有笔记本
2. 等待 OneNote 完成云同步
3. 重启 OneNote
4. 点击 "Retry Detection"

### 问题: 页面内容为空

**原因:** 某些 OneNote 页面可能无法正确导出为 HTML

**解决方案:**
1. 点击 "Open in OneNote" 按钮在原生应用中打开
2. 尝试其他页面

### 问题: PowerShell/AppleScript 执行失败

**Windows:**
1. 确保 PowerShell 可用
2. 检查执行策略: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

**macOS:**
1. 确保 AppleScript 权限已授予
2. 检查系统偏好设置 > 安全性与隐私 > 隐私 > 自动化

## 功能对比

| 功能 | 本地模式 | 云模式 (Azure) |
|------|---------|---------------|
| 配置复杂度 | 简单（无需配置） | 复杂（需要 Azure AD） |
| 认证要求 | 无需认证 | OAuth 2.0 |
| 浏览笔记本 | 支持 | 支持 |
| 查看页面 | 支持 | 支持 |
| 编辑页面 | 需在 OneNote 中编辑 | 支持嵌入编辑 |
| 离线访问 | 部分支持 | 不支持 |
| 跨平台 | Windows/Mac | 所有平台 |

## 常见问题

### Q: 本地模式和云模式有什么区别？

A:
- **本地模式**: 直接连接 OneNote 桌面应用，无需配置，适合个人使用
- **云模式**: 通过 Microsoft Graph API 连接，需要 Azure 配置，适合企业集成

### Q: 我可以在没有网络的情况下使用吗？

A: 可以，本地模式可以访问已同步到本地的笔记内容。

### Q: 为什么有些页面无法显示？

A: 某些 OneNote 页面包含复杂的内容（如嵌入文件），可能无法正确转换为 HTML。

### Q: 如何刷新笔记本列表？

A: 在侧边栏点击 "Load Notebooks" 按钮重新加载。

### Q: 可以同时使用两种模式吗？

A: 可以在设置中切换模式，但不能同时使用。

## 技术细节

### COM API 调用示例 (Windows)

```powershell
$oneNote = New-Object -ComObject OneNote.Application
$xml = ""
$oneNote.GetHierarchy("", 0, [ref]$xml)
```

### AppleScript 调用示例 (macOS)

```applescript
tell application "Microsoft OneNote"
    set notebookList to {}
    repeat with nb in notebooks
        set end of notebookList to name of nb
    end repeat
end tell
```

## 下一步

1. 确保 OneNote 正在运行
2. 在 Obsidian 中启用本地模式
3. 浏览你的笔记本
4. 在笔记中嵌入 OneNote 页面

享受无缝的 OneNote 集成体验！
