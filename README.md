# ☁️ 个人云网盘

一个简单、美观的私人云存储网站，基于 **Google Drive API**（15GB 免费存储，**无需绑定信用卡**）+ Express.js 构建。

## ✨ 功能特性

- 🔐 **密码登录** — JWT 认证，登录速率限制，仅你一人可访问
- 📁 **文件管理** — 上传、下载、删除、重命名、新建文件夹
- 📂 **文件夹导航** — 多层级文件夹，面包屑导航
- 🖱️ **右键菜单** — 快速下载、重命名、删除
- 📤 **拖拽上传** — 支持拖拽文件到浏览器上传，带实时进度条和并发限制
- 🔍 **即时搜索** — 快速搜索当前文件夹内的文件
- 📊 **存储监控** — 实时显示存储使用量
- 📱 **响应式设计** — 手机、平板、电脑都能用
- 💰 **完全免费** — Google Drive (15GB) + Render.com 免费托管
- 🚫 **无需信用卡** — 只需 Google 账号

## 🛠 技术栈

| 组件 | 技术 | 免费额度 |
|------|------|----------|
| 后端 | Node.js + Express | — |
| 存储 | Google Drive API | 15GB 存储，永久免费 |
| 托管 | Render.com | 750 小时/月 |
| 前端 | 原生 HTML/CSS/JS | 无需构建 |
| 认证 | JWT + OAuth2 | — |

文件上传和下载均通过服务器中转，支持大文件流式传输。

---

## 🚀 快速开始

### 第 1 步：创建 Google Cloud 项目并启用 Drive API

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，登录你的 Google 账号
2. 点击顶部的项目选择器 → **新建项目**
   - 项目名称：`my-clouddrive`（自定义）
   - 点击 **创建**
3. 在左侧菜单选择 **API 和服务** → **已启用的 API**
4. 点击 **+ 启用 API**，搜索 `Google Drive API`，点击 **启用**

### 第 2 步：创建 OAuth2 凭据

1. 在左侧菜单选择 **API 和服务** → **凭据**
2. 点击 **+ 创建凭据** → **OAuth 客户端 ID**
   - 如果提示配置"同意屏幕"，按提示完成配置（测试模式即可）
3. 应用类型选择 **Web 应用**
4. 名称填写 `clouddrive`（自定义）
5. **已授权的重定向 URI** 填写：`http://localhost:3001/oauth2callback`
6. 点击 **创建**
7. 记下 **Client ID** 和 **Client Secret**

### 第 3 步：获取 Refresh Token

在本地运行授权脚本，获取 refresh token：

```bash
node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>
```

1. 脚本会输出一个授权链接，在浏览器中打开
2. 登录 Google 账号并授权
3. 浏览器会自动跳转回本地，终端会输出 `GOOGLE_REFRESH_TOKEN`

### 第 4 步：本地配置并测试

1. **克隆项目**
   ```bash
   git clone <你的仓库地址>
   cd clouddriver
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   ```
   编辑 `.env` 文件：
   ```env
   PORT=3000
   AUTH_PASSWORD=你的登录密码
   JWT_SECRET=随机字符串（建议至少32位）

   GOOGLE_CLIENT_ID=第2步获取的Client ID
   GOOGLE_CLIENT_SECRET=第2步获取的Client Secret
   GOOGLE_REFRESH_TOKEN=第3步获取的Refresh Token

   # 根文件夹 ID（可选，留空使用 Drive 根目录）
   GOOGLE_ROOT_FOLDER_ID=
   ```

   > ⚠️ **必须设置 `AUTH_PASSWORD` 和 `JWT_SECRET` 环境变量**，否则服务器无法启动。

4. **启动**
   ```bash
   npm start
   ```

5. 打开浏览器访问 `http://localhost:3000`，输入密码登录即可使用 🎉

### 第 5 步：部署到公网（Render.com）

1. 将代码推送到 **GitHub** 仓库
   ```bash
   git init
   git add .
   git commit -m "个人云网盘"
   git remote add origin https://github.com/你的用户名/clouddrive.git
   git push -u origin main
   ```

2. 注册 [Render.com](https://render.com) 账号（可用 GitHub 登录，**无需信用卡**）

3. 点击 **New +** → **Web Service** → 连接你的 GitHub 仓库

4. 配置：
   - **Name**: `personal-clouddrive`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`

5. 在 **Environment** 中添加环境变量：
   - `AUTH_PASSWORD` — 你的登录密码
   - `JWT_SECRET` — JWT 密钥
   - `GOOGLE_CLIENT_ID` — OAuth2 Client ID
   - `GOOGLE_CLIENT_SECRET` — OAuth2 Client Secret
   - `GOOGLE_REFRESH_TOKEN` — OAuth2 Refresh Token
   - `GOOGLE_ROOT_FOLDER_ID` — 留空即可

6. 点击 **Create Web Service**，等待部署完成

7. 部署成功后，Render 会给你一个公网地址，如 `https://clouddriver.onrender.com`

8. 访问该地址，输入密码登录，开始使用！🌐

> ⚠️ Render 免费版会在 15 分钟无访问后休眠，首次唤醒需约 30 秒。个人使用完全够用。

---

## 📁 项目结构

```
clouddriver/
├── server.js              # Express 服务器入口
├── package.json           # 依赖配置
├── render.yaml            # Render.com 部署配置
├── .env.example           # 环境变量模板
├── lib/
│   ├── gdrive.js          # Google Drive 存储客户端（OAuth2）
│   └── auth.js            # JWT 认证中间件
├── scripts/
│   └── google-auth.js     # OAuth2 授权脚本（获取 refresh token）
└── public/
    ├── index.html         # 主页面（登录 + 文件管理）
    ├── css/
    │   └── style.css      # 样式表
    └── js/
        └── app.js         # 前端逻辑
```

## 🔒 安全说明

- 密码通过环境变量配置，不硬编码在代码中
- 服务器启动时强制检查 `AUTH_PASSWORD` 和 `JWT_SECRET` 环境变量
- 密码比较使用恒定时间算法，防止时序攻击
- 登录接口有速率限制（15 分钟内最多 5 次尝试）
- JWT Token 有效期 7 天，过期需重新登录
- Token 通过 Authorization 请求头传递，不暴露在 URL 中
- OAuth2 凭据仅存储在服务器端，不暴露给前端
- 文件列表支持自动分页，可处理超过 200 个文件的目录

## 💡 常见问题

**Q: 为什么用 Google Drive API 而不是 Cloudflare R2？**
A: Google Drive API 提供 15GB 免费存储且**无需绑定信用卡**，只需一个 Google 账号即可使用。Cloudflare R2 虽然也有 10GB 免费额度，但需要绑定信用卡。

**Q: 文件上传有大小限制吗？**
A: 单个文件最大 5TB（Google Drive 限制），总存储 15GB 免费额度。服务器超时设置为 30 分钟，支持大文件传输。

**Q: 使用的是谁的 Google Drive 空间？**
A: 使用 OAuth2 用户授权方式，文件存储在你自己的 Google Drive 中，占用你账号的 15GB 免费额度。

**Q: Refresh Token 会过期吗？**
A: Google OAuth2 的 refresh token 在用户未撤销授权且未更改密码的情况下长期有效。如果 token 失效，重新运行 `scripts/google-auth.js` 获取新的即可。

**Q: Render 免费版会休眠怎么办？**
A: 15 分钟无访问会休眠，下次访问自动唤醒（约 30 秒）。如需常驻可使用 [UptimeRobot](https://uptimerobot.com) 定时 ping（免费）。

**Q: 数据安全吗？**
A: 文件存储在你的 Google Drive 中，可靠性高。建议妥善保管 OAuth2 凭据和 refresh token。

**Q: 15GB 不够用怎么办？**
A: 可以升级到 Google One 付费计划，或创建多个 Google Cloud 项目。

## 📝 License

MIT
