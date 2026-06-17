# OneNote 本地模式故障排除指南

## 问题: "OneNote application not found"

这个错误表示插件无法检测到你的 OneNote 应用程序。以下是详细的解决方案。

## 可能的原因和解决方案

### 1. OneNote 未安装

**检查方法:**
- 在开始菜单搜索 "OneNote"
- 如果找不到，说明未安装

**解决方案:**
下载并安装 OneNote: https://www.onenote.com/download

---

### 2. OneNote 未运行

**检查方法:**
- 查看任务栏是否有 OneNote 图标
- 打开任务管理器，检查是否有 `ONENOTE.EXE` 进程

**解决方案:**
1. 启动 OneNote 应用程序
2. 等待完全加载（看到所有笔记本）
3. 在 Obsidian 中点击 "Retry Detection"

---

### 3. 使用了错误版本的 OneNote

**重要:** 本插件需要 **OneNote 桌面版**（以前称为 OneNote 2016/2019/2021）。

**不支持的版本:**
- ❌ OneNote for Windows 10 (UWP 应用，从 Microsoft Store 下载)
- ❌ OneNote Online (网页版)

**支持的版本:**
- ✅ OneNote (包含在 Office/Microsoft 365 中)
- ✅ OneNote 2016/2019/2021
- ✅ OneNote for Mac

**如何检查版本:**
1. 打开 OneNote
2. 点击 **文件** > **账户**
3. 查看版本信息
4. 应该看到类似 "Microsoft 365" 或 "Office 2019" 的字样

**解决方案:**
如果你使用的是 OneNote for Windows 10:
1. 卸载 OneNote for Windows 10
2. 从 https://www.onenote.com/download 下载完整版 OneNote
3. 安装并登录

---

### 4. OneNote 安装位置非标准

插件会在以下位置查找 OneNote:
```
C:\Program Files\Microsoft Office\root\Office16\ONENOTE.EXE
C:\Program Files (x86)\Microsoft Office\root\Office16\ONENOTE.EXE
C:\Program Files\Microsoft Office\Office16\ONENOTE.EXE
C:\Program Files (x86)\Microsoft Office\Office16\ONENOTE.EXE
C:\Program Files\Microsoft Office\Office15\ONENOTE.EXE
C:\Program Files (x86)\Microsoft Office\Office15\ONENOTE.EXE
```

**如果你的 OneNote 安装在其他位置:**

**临时解决方案:**
将 OneNote 添加到系统 PATH:
1. 找到 OneNote.exe 的位置
2. 右键点击 "此电脑" > "属性" > "高级系统设置"
3. 点击 "环境变量"
4. 在 "系统变量" 中找到 "Path"
5. 点击 "编辑" > "新建"
6. 添加 OneNote 所在文件夹的路径
7. 重启 Obsidian

---

### 5. PowerShell 执行策略限制

**检查方法:**
1. 打开 PowerShell
2. 输入: `Get-ExecutionPolicy`
3. 如果显示 "Restricted"，则无法执行脚本

**解决方案:**
以管理员身份运行 PowerShell:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### 6. COM 组件注册问题

**症状:**
- OneNote 可以正常打开
- 但插件仍然报错

**解决方案:**
重新注册 OneNote COM 组件:

1. 关闭 OneNote
2. 以管理员身份打开命令提示符
3. 运行以下命令（根据你的 Office 版本和路径调整）:

```cmd
cd C:\Program Files\Microsoft Office\root\Office16
onenote.exe /regserver
```

4. 重新启动 OneNote
5. 在 Obsidian 中重试

---

## 调试步骤

### 步骤 1: 验证 OneNote 是否正在运行

打开任务管理器 (Ctrl+Shift+Esc)，在 "详细信息" 标签页查找 `ONENOTE.EXE`。

### 步骤 2: 检查控制台日志

在 Obsidian 中:
1. 按 `Ctrl+Shift+I` 打开开发者工具
2. 切换到 "Console" 标签
3. 点击 "Load Notebooks"
4. 查看输出的日志信息

你应该看到类似这样的输出:
```
Checking OneNote availability on Windows...
Checking registry for OneNote...
OneNote found in registry
```

或者:
```
Checking OneNote availability on Windows...
OneNote not found using any detection method
```

### 步骤 3: 手动测试 PowerShell 命令

打开 PowerShell，运行:
```powershell
$oneNote = New-Object -ComObject OneNote.Application
$xml = ""
$oneNote.GetHierarchy("", 0, [ref]$xml)
Write-Output $xml
```

如果成功，你会看到 XML 格式的笔记本列表。
如果失败，会显示错误信息。

---

## 替代方案

如果以上方法都不行，你可以:

### 选项 1: 使用云模式
1. 在插件设置中切换到 "Cloud (Microsoft Graph API)" 模式
2. 按照 Azure AD 配置指南设置
3. 通过云端访问 OneNote

### 选项 2: 手动导出笔记
1. 在 OneNote 中导出页面为 HTML
2. 将 HTML 文件复制到 Obsidian Vault
3. 直接引用 HTML 文件

---

## 常见问题

### Q: 我有 Office 365，但还是一样报错

A: 确保安装的是桌面版 OneNote，而不是 UWP 版本。从 office.com 下载安装程序重新安装。

### Q: 我可以使用 OneNote Online 吗？

A: 不可以，本地模式需要桌面应用。但你可以使用云模式来访问 OneNote Online。

### Q: 为什么需要 OneNote 正在运行？

A: COM 自动化需要一个正在运行的应用程序实例。这是技术限制。

### Q: 可以同时打开多个 OneNote 实例吗？

A: 可以，但建议只打开一个实例以避免冲突。

---

## 获取帮助

如果问题仍然存在:

1. 收集以下信息:
   - OneNote 版本
   - Windows 版本
   - 控制台日志输出
   - PowerShell 测试结果

2. 查看项目 Issues 页面

3. 提供详细的错误信息和复现步骤

---

## 总结检查清单

- [ ] OneNote 已安装（桌面版，不是 UWP）
- [ ] OneNote 正在运行
- [ ] 已登录 Microsoft 账户
- [ ] 笔记本已同步
- [ ] PowerShell 可以执行脚本
- [ ] 控制台显示正确的检测日志
- [ ] 手动 PowerShell 测试成功

完成所有检查后，应该可以正常使用本地模式了！
