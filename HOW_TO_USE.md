# 使用说明

## 快速开始（3步）

### 步骤 1：配置 Azure AD（一次性设置）

1. 访问 [Azure Portal](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/AppRegistrations)
2. 点击 **新建注册**
3. 填写信息：
   - 名称：`Obsidian OneNote`
   - 支持的账户类型：选择最后一个选项（组织目录和个人 Microsoft 账户）
   - 重定向 URI：留空或填写 `http://localhost`
4. 点击 **注册**
5. 复制显示的 **应用程序(客户端) ID**
6. 在左侧菜单点击 **API 权限** > **添加权限** > **Microsoft Graph** > **委托的权限**
7. 勾选以下权限：
   - `Notes.Read`
   - `Notes.ReadWrite`
   - `offline_access`
8. 点击 **授予管理员同意**

### 步骤 2：配置插件

1. 打开 Obsidian
2. 进入 **设置** > **社区插件** > **OneNote Integration**
3. 粘贴你刚才复制的 **Client ID**
4. 关闭设置

### 步骤 3：使用插件

#### 方法 A：侧边栏浏览
1. 点击左侧边栏的 **书本图标**
2. 点击 **Authenticate OneNote** 按钮
3. 登录你的 Microsoft 账户
4. 浏览笔记本、分区和页面

#### 方法 B：在笔记中嵌入
1. 在任何笔记中，将光标放在想要插入的位置
2. 按 `Ctrl+P` 打开命令面板
3. 输入 `OneNote: Insert OneNote embed block`
4. 在生成的代码块中选择要嵌入的页面

## 常见问题

### Q: 如何获取 Client ID？
A: 按照"步骤 1"在 Azure Portal 创建应用注册后即可获得。

### Q: 认证失败怎么办？
A:
- 检查 Client ID 是否正确
- 确认已添加 API 权限
- 确认已点击"授予管理员同意"

### Q: 页面无法显示？
A:
- 某些 OneNote 页面不支持 iframe 嵌入
- 尝试点击"Open in OneNote"按钮在新窗口打开

### Q: Token 过期了怎么办？
A: 插件会自动提示重新认证，或者点击刷新按钮。

## 开发调试

### 启用热重载
```bash
cd obsidian-onenote-integration
npm run dev
```

然后在 Obsidian 中：
1. 打开命令面板
2. 输入 `Reload app without saving`

### 查看日志
打开浏览器开发者工具（F12），在 Console 标签页查看日志。

## 更多资源

- [README.md](README.md) - 完整文档
- [QUICKSTART.md](QUICKSTART.md) - 快速开始指南
- [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md) - 项目总结
