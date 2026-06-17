# 快速开始指南

## 项目结构

```
d:/ObsidianPlugin/
├── obsidian-onenote-integration/    # 插件源代码
│   ├── src/
│   │   ├── main.ts                  # 主入口文件
│   │   ├── onenote-service.ts       # OneNote API 服务
│   │   ├── onenote-view.ts          # 侧边栏视图
│   │   └── onenote-codeblock.ts     # 代码块渲染器
│   ├── manifest.json                # 插件配置
│   ├── styles.css                   # 样式文件
│   ├── package.json                 # 依赖配置
│   └── README.md                    # 详细文档
│
└── test-vault/                      # 测试用 Obsidian Vault
    ├── .obsidian/
    │   └── plugins/
    │       └── obsidian-onenote-integration/
    └── OneNote 集成测试.md           # 测试笔记
```

## 开发流程

### 1. 安装依赖

```bash
cd d:/ObsidianPlugin/obsidian-onenote-integration
npm install
```

### 2. 构建插件

**生产构建（一次性）：**
```bash
npm run build
```

**开发模式（自动监听变化）：**
```bash
npm run dev
```

这会自动将编译后的文件输出到 `test-vault/.obsidian/plugins/obsidian-onenote-integration/` 目录。

### 3. 打开测试 Vault

双击运行 `start-dev.bat` 或在命令行执行：

```bash
start obsidian://open?vault=test-vault
```

### 4. 启用插件

在 Obsidian 中：
1. 打开 **设置** > **社区插件**
2. 找到 **OneNote Integration**
3. 点击 **启用**

### 5. 配置 OneNote 集成

1. 在 Obsidian 设置中找到 **OneNote Integration** 插件设置
2. 输入你的 Azure AD 应用 Client ID
3. （可选）配置 Tenant ID 和 Redirect URI

### 6. 使用插件

#### 方法一：侧边栏视图
- 点击左侧边栏的书本图标
- 或使用命令面板：`OneNote: Open OneNote view`

#### 方法二：在笔记中嵌入
- 将光标放在想要插入的位置
- 使用命令面板：`OneNote: Insert OneNote embed block`
- 或者手动输入代码块：
  ````
  ```onenote
  ```
  ````

## 热重载

在开发模式下，每次保存文件后：

1. 在 Obsidian 中打开命令面板
2. 执行：`Reload app without saving`
3. 或者点击社区插件页面的刷新按钮

## Azure AD 应用注册（必需）

要使用 OneNote 功能，你需要先注册一个 Azure AD 应用：

### 快速步骤

1. 访问 [Azure Portal](https://portal.azure.com)
2. 导航到 **Azure Active Directory** > **App registrations**
3. 点击 **New registration**
4. 填写：
   - Name: `Obsidian OneNote`
   - Supported account types: `Accounts in any organizational directory and personal Microsoft accounts`
   - Redirect URI: `http://localhost`
5. 复制 **Application (client) ID**

### 添加 API 权限

1. 在应用注册页面，点击 **API permissions**
2. 点击 **Add a permission**
3. 选择 **Microsoft Graph** > **Delegated permissions**
4. 添加：
   - `Notes.Read`
   - `Notes.ReadWrite`
   - `offline_access`
5. 点击 **Grant admin consent**

### 配置到插件

1. 复制 Client ID
2. 在 Obsidian 插件设置中粘贴

## 常见问题

### 认证失败
- 检查 Client ID 是否正确
- 确认已授予 API 权限
- 检查 Redirect URI 是否匹配

### 无法加载笔记本
- 确认 OneNote 账户有可用的笔记本
- 检查网络连接
- 查看浏览器控制台获取错误信息

### 页面无法嵌入
- 某些页面可能不支持 iframe 嵌入
- 尝试使用 "Open in OneNote" 按钮

## 下一步

- 查看 [README.md](obsidian-onenote-integration/README.md) 了解更多详细信息
- 查看源代码了解实现细节
- 根据需要自定义样式和功能

祝开发愉快！
