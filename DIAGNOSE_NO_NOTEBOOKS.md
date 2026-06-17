# 诊断 "No data returned from OneNote" 错误

## 问题描述

插件显示错误：`Failed to get notebooks: Error: No data returned from OneNote`

这表示 PowerShell 脚本执行了，但没有从 OneNote COM API 获取到数据。

## 可能的原因

1. **OneNote 未运行** - COM API 需要 OneNote 应用程序正在运行
2. **OneNote 版本不支持** - 使用的是 OneNote for Windows 10 (UWP) 而不是桌面版
3. **没有笔记本** - OneNote 中没有任何笔记本
4. **COM 组件问题** - OneNote COM 组件未正确注册
5. **权限问题** - PowerShell 无法访问 COM 对象

## 诊断步骤

### 步骤 1: 确认 OneNote 正在运行

1. 打开任务管理器 (Ctrl+Shift+Esc)
2. 在"进程"标签页查找 "Microsoft OneNote" 或 "ONENOTE.EXE"
3. 如果没有找到，启动 OneNote 桌面应用

### 步骤 2: 确认 OneNote 版本

**重要**: 必须使用 OneNote 桌面版（以前叫 OneNote 2016/2019/2021），不是 UWP 版本。

**检查方法**:
1. 打开 OneNote
2. 点击 **文件** > **账户**
3. 查看产品信息：
   - ✅ 正确: "Microsoft 365" 或 "Office 2019/2021"
   - ❌ 错误: "OneNote for Windows 10"

### 步骤 3: 手动测试 PowerShell 命令

以管理员身份打开 PowerShell，运行以下命令：

```powershell
# 创建 COM 对象
$oneNote = New-Object -ComObject OneNote.Application

# 获取笔记本列表
$xml = ""
$oneNote.GetHierarchy("", 0, [ref]$xml)

# 显示 XML
Write-Host "XML Length: $($xml.Length)"
$xml | Out-File "$env:TEMP\onenote-test.xml" -Encoding UTF8

# 在记事本中打开 XML
notepad "$env:TEMP\onenote-test.xml"
```

**预期结果**:
- 应该看到 `XML Length: XXXX` (大于 0)
- XML 文件应该包含 `<one:Notebook` 元素

**如果失败**:
- 检查错误消息
- 确认 OneNote 正在运行
- 尝试重启 OneNote

### 步骤 4: 检查 OneNote 是否有笔记本

1. 打开 OneNote
2. 确认左侧显示至少一个笔记本
3. 如果没有，点击 **文件** > **新建** 创建一个

### 步骤 5: 重新注册 OneNote COM 组件

如果以上步骤都失败，尝试重新注册 COM 组件：

1. 关闭 OneNote
2. 以管理员身份打开命令提示符
3. 运行以下命令（根据 Office 安装路径调整）：

```cmd
cd C:\Program Files\Microsoft Office\root\Office16
onenote.exe /regserver
```

4. 重新启动 OneNote
5. 再次测试

### 步骤 6: 检查 Obsidian 控制台日志

1. 在 Obsidian 中按 `Ctrl+Shift+I` 打开开发者工具
2. 切换到 "Console" 标签
3. 点击 "Load Notebooks" 按钮
4. 查看输出的调试信息

你应该看到类似：
```
Executing PowerShell script to get notebooks...
PowerShell execution completed
stdout length: XXXX
stdout preview: <?xml version="1.0"...
Parsing XML output...
Parsed X notebooks
```

如果 `stdout length` 是 0，说明 PowerShell 没有返回数据。

## 解决方案

### 方案 1: 确保 OneNote 完全启动

1. 完全关闭 OneNote（包括系统托盘）
2. 重新启动 OneNote
3. 等待所有笔记本加载完成
4. 在 Obsidian 中重试

### 方案 2: 使用云模式

如果本地模式无法工作，可以切换到云模式：

1. 打开 Obsidian 设置
2. 进入 OneNote Integration
3. 将 Connection Mode 改为 "Cloud (Microsoft Graph API)"
4. 按照 Azure AD 配置指南设置

### 方案 3: 检查防火墙/杀毒软件

某些安全软件可能阻止 COM 访问：

1. 临时禁用杀毒软件
2. 测试是否正常工作
3. 如果解决了，将 OneNote 和 PowerShell 添加到白名单

### 方案 4: 更新 Office

确保 Office 是最新版本：

1. 打开任何 Office 应用
2. 点击 **文件** > **账户** > **更新选项**
3. 点击 **立即更新**

## 常见错误消息

### "Class not registered"

**原因**: OneNote COM 组件未注册

**解决**:
```cmd
cd C:\Program Files\Microsoft Office\root\Office16
onenote.exe /regserver
```

### "Access is denied"

**原因**: 权限问题

**解决**:
- 以管理员身份运行 PowerShell 测试
- 检查用户账户控制 (UAC) 设置

### "RPC_E_SERVERFAULT"

**原因**: OneNote 内部错误

**解决**:
- 重启 OneNote
- 重启计算机

## 收集诊断信息

如果问题仍然存在，请收集以下信息以便进一步帮助：

1. **OneNote 版本**:
   - 打开 OneNote > 文件 > 账户 > 关于 OneNote

2. **Windows 版本**:
   - 运行 `winver`

3. **PowerShell 测试结果**:
   - 运行步骤 3 中的 PowerShell 命令
   - 保存输出和错误消息

4. **XML 文件**:
   - `%TEMP%\onenote-test.xml`

5. **Obsidian 控制台日志**:
   - 复制完整的错误输出

## 验证清单

在报告问题之前，请确认：

- [ ] OneNote 桌面版已安装（不是 UWP 版本）
- [ ] OneNote 正在运行
- [ ] OneNote 中至少有一个笔记本
- [ ] 手动 PowerShell 测试成功
- [ ] XML 文件包含 `<one:Notebook` 元素
- [ ] 已尝试重启 OneNote
- [ ] 已尝试重新注册 COM 组件

---

**最后更新**: 2026-06-16
