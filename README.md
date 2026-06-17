# Obsidian OneNote Integration Plugin

这个 Obsidian 插件允许你在 Obsidian 中嵌入和编辑 OneNote 笔记。

## 功能

- **本地模式**：直接连接 OneNote 桌面应用，无需 Azure 配置 ⭐推荐
- **云模式**：通过 Microsoft Graph API 访问（可选）
- 在侧边栏浏览 OneNote 笔记本、分区和页面
- 在 Obsidian 笔记中嵌入 OneNote 页面
- 通过 iframe 查看和编辑 OneNote 内容

## 快速开始（本地模式）

### 步骤 1: 确保 OneNote 正在运行
打开 OneNote 桌面应用并登录

### 步骤 2: 启用本地模式
在 Obsidian 设置中选择 "Local OneNote App" 模式

### 步骤 3: 开始使用
点击侧边栏书本图标浏览笔记

### 遇到问题？

**如果遇到 "OneNote application not found" 错误**:
1. **运行诊断脚本**（PowerShell）:
   ```powershell
   cd obsidian-onenote-integration
   .\diagnose-onenote.ps1
   ```

2. **如果遇到 "no notebook found"**:
   - 运行测试脚本: `.\test-onenote-api.ps1`
   - 查看详细指南: [NO_NOTEBOOKS_FOUND_FIX.md](NO_NOTEBOOKS_FOUND_FIX.md)

3. **如果遇到 "No data returned from OneNote"**:
   - 查看详细诊断: [DIAGNOSE_NO_NOTEBOOKS.md](DIAGNOSE_NO_NOTEBOOKS.md)
   - 确保 OneNote 桌面版正在运行
   - 手动测试 PowerShell COM API

4. **其他问题**:
   - 查看详细故障排除: [LOCAL_MODE_TROUBLESHOOTING.md](LOCAL_MODE_TROUBLESHOOTING.md)

5. **常见问题**:
   - 确保使用 OneNote 桌面版（不是 UWP 版本）
   - 确保 OneNote 正在运行
   - 检查 PowerShell 执行策略
   - 确保至少有一个笔记本

## 开发设置

### 前置要求

- Node.js (v16+)
- npm 或 yarn

### 安装依赖

```bash
cd obsidian-onenote-integration
npm install
```

### 开发模式

```bash
npm run dev
```

这会在 `watch` 模式下构建插件，并将输出保存到测试 Vault 的插件目录。

### 生产构建

```bash
npm run build
```

## Azure AD 应用注册设置

要使用 OneNote 集成功能，你需要在 Azure Portal 注册一个应用：

### 步骤

1. 登录 [Azure Portal](https://portal.azure.com)
2. 导航到 "Azure Active Directory" > "App registrations"
3. 点击 "New registration"
4. 填写以下信息：
   - Name: `Obsidian OneNote Integration`
   - Supported account types: `Accounts in any organizational directory and personal Microsoft accounts`
   - Redirect URI: `http://localhost` (或你自定义的 URI)

5. 注册后，复制 "Application (client) ID"

### 配置 API 权限

1. 在应用注册页面，点击 "API permissions"
2. 点击 "Add a permission"
3. 选择 "Microsoft Graph"
4. 选择 "Delegated permissions"
5. 添加以下权限：
   - `Notes.Read` - 读取 OneNote 笔记本
   - `Notes.ReadWrite` - 读写 OneNote 笔记本
   - `offline_access` - 刷新令牌（可选）

6. 点击 "Grant admin consent"（如果需要）

### 配置插件

1. 在 Obsidian 中，打开设置
2. 找到 "OneNote Integration" 插件设置
3. 输入你的 Client ID
4. （可选）修改 Tenant ID 和 Redirect URI

## 使用方法

### 浏览 OneNote 内容

1. 点击左侧边栏的 OneNote 图标（书本图标）
2. 点击 "Authenticate OneNote" 按钮进行登录
3. 选择笔记本 > 分区 > 页面
4. 页面会在 iframe 中显示

### 在笔记中嵌入 OneNote

1. 将光标放在想要插入的位置
2. 使用命令面板：`OneNote: Insert OneNote embed block`
3. 或者手动输入：
   ```onenote
   ```
4. 在代码块中选择要嵌入的页面

### 直接指定页面 ID

你也可以直接在代码块中指定页面 ID：

````
```onenote
page-id-here
```
````

或者使用 OneNote URL：

````
```onenote
https://onedrive.live.com/...?id=page-id
```
````

## 项目结构

```
obsidian-onenote-integration/
├── src/
│   ├── main.ts              # 主插件入口
│   ├── onenote-service.ts   # OneNote API 服务
│   ├── onenote-view.ts      # 侧边栏视图
│   └── onenote-codeblock.ts # 代码块渲染器
├── manifest.json            # 插件清单
├── styles.css               # 样式文件
├── package.json             # 依赖配置
├── tsconfig.json            # TypeScript 配置
└── esbuild.config.mjs       # 构建配置

test-vault/                  # 测试用 Obsidian Vault
├── .obsidian/
│   └── plugins/
│       └── obsidian-onenote-integration/
└── OneNote 集成测试.md
```

## 技术栈

- **TypeScript** - 主要开发语言
- **esbuild** - 快速构建工具
- **Microsoft Graph API** - OneNote 集成
- **OAuth 2.0** - 身份认证
- **Obsidian Plugin API** - 插件框架

## 注意事项

- OneNote 嵌入需要浏览器支持 iframe
- 某些 OneNote 页面可能因为安全策略无法嵌入
- 首次使用需要进行 OAuth 认证
- Token 有效期为 1 小时，过期后需要重新认证

## 故障排除

### 认证失败

1. 检查 Client ID 是否正确
2. 确认已授予必要的 API 权限
3. 检查 Redirect URI 是否匹配

### 无法加载笔记本

1. 确认 OneNote 账户有可用的笔记本
2. 检查网络连接
3. 查看开发者控制台获取错误信息

### 页面无法嵌入

某些页面可能不支持嵌入，可以尝试：
1. 使用 "Open in OneNote" 按钮
2. 检查页面权限设置

## 许可证

MIT License
