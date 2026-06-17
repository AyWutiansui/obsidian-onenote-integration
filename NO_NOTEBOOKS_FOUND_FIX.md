# "No notebooks found in local OneNote" 修复指南

## 问题描述

插件能够检测到 OneNote 应用程序，但无法获取笔记本列表，显示 "No notebooks found in local OneNote"。

## 可能的原因

1. **OneNote 中没有笔记本** - 首次安装 OneNote 后可能还没有创建任何笔记本
2. **COM API 返回空数据** - OneNote 可能正在同步或出现临时问题
3. **XML 解析问题** - OneNote 的 XML 格式可能与预期不同
4. **权限问题** - COM 对象可能没有正确初始化

## 已实施的修复

### 1. 改进的 XML 解析 ([local-onenote-service.ts](file:///d:/ObsidianPlugin/obsidian-onenote-integration/src/local-onenote-service.ts))

**之前的问题：**
- 单一的正则表达式模式
- 无法处理属性顺序变化
- 缺少命名空间灵活性

**现在的解决方案：**
```typescript
// 尝试三种不同的匹配模式
// Method 1: name="..." ID="..."
// Method 2: ID="..." name="..."
// Method 3: Without namespace prefix <Page> instead of <one:Page>
```

### 2. 详细的调试输出

现在插件会在控制台输出详细的调试信息：
- PowerShell 执行状态
- XML 数据长度
- 解析过程中的每个步骤
- 找到的笔记本/分区/页面数量

### 3. 增强的错误处理

- 检测空 XML 输出
- 提供具体的错误消息
- 保存 XML 到文件供检查

## 诊断步骤

### 步骤 1: 运行测试脚本

在 PowerShell 中运行：
```powershell
cd d:\ObsidianPlugin\obsidian-onenote-integration
.\test-onenote-api.ps1
```

这个脚本会：
- ✓ 测试 COM 对象创建
- ✓ 调用 GetHierarchy API
- ✓ 解析 XML 并显示笔记本
- ✓ 保存 XML 到 `%TEMP%\onenote-hierarchy.xml`

### 步骤 2: 检查 OneNote 应用

确保：
1. OneNote 正在运行
2. 你已经登录
3. 至少有一个笔记本（见下方如何创建）

### 步骤 3: 查看控制台日志

在 Obsidian 中：
1. 按 `Ctrl+Shift+I` 打开开发者工具
2. 切换到 "Console" 标签
3. 点击 "Load Notebooks"
4. 查看输出的调试信息

你应该看到类似：
```
Executing PowerShell script to get notebooks...
PowerShell execution completed
stdout length: 12345
Parsing XML output...
Parsing OneNote hierarchy XML...
XML length: 12345
Found notebook (method 1): My Notebook (ID-xxx)
Total notebooks found: 1
Parsed 1 notebooks
```

### 步骤 4: 检查 XML 文件

如果测试脚本运行成功，会生成 XML 文件：
```
%TEMP%\onenote-hierarchy.xml
```

用文本编辑器打开，查找 `<one:Notebook` 元素，确认有笔记本定义。

## 常见问题和解决方案

### Q1: OneNote 中确实有笔记本，但仍然显示 "No notebooks found"

**A:** 尝试以下操作：

1. **重启 OneNote**
   - 完全关闭 OneNote（包括系统托盘）
   - 重新启动 OneNote
   - 等待所有笔记本加载完成

2. **检查笔记本位置**
   - 打开 OneNote
   - 确认笔记本显示在左侧列表中
   - 如果没有，点击 "添加笔记本" 创建一个

3. **等待同步完成**
   - 如果笔记本存储在 OneDrive，等待同步完成
   - 查看 OneNote 底部的同步状态

### Q2: 测试脚本显示 "ERROR: XML is empty"

**A:** 这表示 COM API 没有返回数据。

**解决方案：**
1. 确保 OneNote 完全启动
2. 尝试以管理员身份运行 PowerShell
3. 重新注册 OneNote COM 组件：
   ```cmd
   cd C:\Program Files\Microsoft Office\root\Office16
   onenote.exe /regserver
   ```

### Q3: 控制台显示 "No data returned from OneNote"

**A:** PowerShell 脚本执行成功但没有输出。

**可能原因：**
- OneNote COM 组件未正确注册
- OneNote 版本不支持 COM API
- 使用了 OneNote for Windows 10（UWP）而不是桌面版

**解决方案：**
1. 确认使用的是 OneNote 桌面版
2. 检查 OneNote 版本（应该看到 "Office 2016/2019/2021" 或 "Microsoft 365"）
3. 如果是 UWP 版本，卸载并安装桌面版

### Q4: XML 解析失败

**A:** 查看控制台中的 XML preview，检查格式是否正确。

正常的 XML 应该类似：
```xml
<?xml version="1.0"?>
<one:Notebooks xmlns:one="http://schemas.microsoft.com/office/onenote/2013/one-note">
  <one:Notebook ID="{...}" name="My Notebook" ...>
    ...
  </one:Notebook>
</one:Notebooks>
```

如果格式不同，请将完整的 XML 保存并提供给开发者分析。

## 手动创建笔记本

如果 OneNote 中确实没有笔记本，需要创建一个：

1. 打开 OneNote
2. 点击 **文件** > **新建**
3. 选择存储位置（OneDrive 或本地）
4. 输入笔记本名称
5. 点击 **创建笔记本**
6. 等待笔记本创建完成

然后在 Obsidian 中点击 "Retry Detection"。

## 调试命令

### 查看控制台日志
```
Ctrl+Shift+I → Console tab
```

### 运行测试脚本
```powershell
.\test-onenote-api.ps1
```

### 检查生成的 XML
```powershell
notepad $env:TEMP\onenote-hierarchy.xml
```

### 手动测试 COM API
```powershell
$oneNote = New-Object -ComObject OneNote.Application
$xml = ""
$oneNote.GetHierarchy("", 0, [ref]$xml)
$xml | Out-File "$env:TEMP\test.xml"
```

## 验证修复

修复后，你应该能够：

1. ✅ 运行测试脚本并看到笔记本列表
2. ✅ 在 Obsidian 控制台中看到详细的调试输出
3. ✅ 点击 "Load Notebooks" 后看到笔记本列表
4. ✅ 选择笔记本后看到分区和页面

## 下一步

如果问题仍然存在：

1. 收集以下信息：
   - 测试脚本的完整输出
   - Obsidian 控制台日志
   - 生成的 XML 文件（前 500 行）
   - OneNote 版本信息

2. 查看项目 Issues 或创建新的 Issue

3. 提供详细的错误信息和复现步骤

---

**修复完成时间**: 2026-06-16
**构建状态**: ✅ 成功
**主要改进**:
- 三种 XML 解析方法
- 详细的调试输出
- 增强的错误处理
- 诊断测试脚本
