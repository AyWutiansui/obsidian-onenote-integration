# Overlay 版本测试指南

## 最新修复 (2026-06-17)

### 问题
`SetParent` 失败 error=87，导致 OneNote 无法嵌入。

### 根本原因
跨进程 `SetParent` 时尝试修改窗口样式（添加 `WS_CHILD`）会导致失败。

### 解决方案
移除 reparent 时的样式修改，直接调用 `SetParent(targetHwnd, overlayHwnd)`。

## 测试步骤

### 1. 重启 Obsidian
由于 `win-embed-overlay.exe` 被占用，需要：
1. 完全关闭 Obsidian（确保所有进程退出）
2. 手动复制新版本：
   ```powershell
   Copy-Item -Force "D:\ObsidianPlugin\obsidian-onenote-integration\win-embed-overlay.exe" \
             "D:\ObsidianPlugin\test-vault\.obsidian\plugins\obsidian-onenote-integration\win-embed-overlay.exe"
   ```
3. 重新启动 Obsidian

### 2. 验证部署
检查插件目录中的文件时间戳应为最新：
```
D:\ObsidianPlugin\test-vault\.obsidian\plugins\obsidian-onenote-integration\win-embed-overlay.exe
```

### 3. 测试嵌入功能
1. 在 Obsidian 中打开包含 OneNote 代码块的笔记
2. 点击 "Embed OneNote Window" 按钮
3. 观察控制台输出

### 4. 预期行为

#### 成功情况
控制台应显示：
```
[WinEmbed] Spawning: .../win-embed-overlay.exe embed <hwnd>
[WinEmbed] stderr: OVERLAY: created ..., owner=...
[WinEmbed] stderr: REPARENT: target=... overlay=...
[WinEmbed] stderr: REPARENT: target visible=1 enabled=1
[WinEmbed] stderr: REPARENT: saved parent=... style=... exstyle=...
[WinEmbed] stderr: REPARENT: SetParent returned ..., lastError=0
[WinEmbed] stderr: REPARENT: SetParent succeeded
[WinEmbed] stdout: OK:<hwnd>
```

OneNote 窗口应：
- 出现在代码块位置
- 可以被 Obsidian 的模态窗口（设置、命令面板等）遮挡
- Detach 后恢复为自由窗口

#### 失败情况
如果仍然看到 `SetParent failed, error=87`，可能的原因：
1. OneNote 窗口是 Chromium/Electron GPU compositor 管理的特殊窗口
2. 需要使用不同的嵌入策略（如窗口覆盖而非 reparent）

### 5. 诊断信息

新的实现会输出详细的诊断信息：
- `target visible=? enabled=?` - OneNote 窗口的可见性和启用状态
- `saved parent=? style=? exstyle=?` - 原始父窗口和样式
- `SetParent returned ?, lastError=?` - SetParent 的返回值和错误码

### 6. 回滚方案

如果 overlay 版本不稳定，可以回滚到之前的独立窗口版本：
1. 重命名 `win-embed-overlay.exe` 为 `win-embed-overlay.exe.bak`
2. 将备份的 `win-embed.exe` 复制回来（如果有）
3. 更新 `WindowEmbedManager.ts` 中的路径

## 技术原理

### Overlay 策略
```
Obsidian Main Window (owner)
├── Owned Popup Overlay (WS_POPUP, owned by main)
│   └── OneNote (reparented as child of overlay)
└── Modals/Dialogs (Electron native windows)
```

Windows DWM 会自动将 owned popups 渲染在 owner 的模态窗口下方，这是 Windows 窗口管理的标准行为。

### 为什么不能修改样式
跨进程 `SetParent` 要求目标窗口保持其原始风格。添加 `WS_CHILD` 会导致：
- Error 87 (ERROR_INVALID_PARAMETER)
- 窗口管理器拒绝操作
- 可能导致目标应用程序无响应

## 下一步

如果测试成功，可以：
1. 删除 `win-embed.exe`（旧版本）
2. 更新文档说明 overlay 策略的优势
3. 考虑添加更多错误处理和降级策略

如果测试失败，需要：
1. 收集完整的 stderr 输出
2. 分析 OneNote 窗口的特殊性
3. 考虑其他嵌入策略（如窗口覆盖、截图同步等）
