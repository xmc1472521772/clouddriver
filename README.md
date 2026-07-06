# ☁️ 个人云网盘

一个简单、美观的私人云存储网站，基于 **Google Drive API**（15GB 免费存储，**无需绑定信用卡**）+ Express.js 构建。

## ✨ 功能特性

- 🔐 **密码登录** — JWT 认证，仅你一人可访问
- 📁 **文件管理** — 上传、下载、删除、重命名、新建文件夹
- 📂 **文件夹导航** — 多层级文件夹，面包屑导航
- 🖱️ **右键菜单** — 快速下载、重命名、删除
- 📤 **拖拽上传** — 支持拖拽文件到浏览器上传，带实时进度条
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
| 认证 | JWT | — |

文件上传使用**可恢复上传会话**直连 Google Drive，不经过服务器中转，支持大文件。

---

## 🚀 快速开始（5 步完成部署）

### 第 1 步：创建 Google Cloud 项目并启用 Drive API

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，登录你的 Google 账号
2. 点击顶部的项目选择器 → **新建项目**
   - 项目名称：`my-clouddrive`（自定义）
   - 点击 **创建**
3. 在左侧菜单选择 **API 和服务** → **已启用的 API**
4. 点击 **+ 启用 API**，搜索 `Google Drive API`，点击 **启用**

### 第 2 步：创建 Service Account（服务账号）

1. 在左侧菜单选择 **API 和服务** → **凭据**
2. 点击 **+ 创建凭据** → **服务账号**
3. 填写服务账号名称：`clouddrive-bot`，点击 **创建并继续**
4. 跳过"授予访问权限"和"授予用户访问权限"，直接点击 **完成**
5. 在服务账号列表中，点击刚创建的服务账号
6. 进入 **密钥** 标签页 → **添加密钥** → **创建新密钥**
7. 密钥类型选择 **JSON**，点击 **创建**
8. 浏览器会自动下载一个 JSON 文件，**请妥善保管此文件**

> ⚠️ 此 JSON 文件包含你的私钥，相当于密码，切勿公开分享或提交到 Git。

### 第 3 步：将 JSON 密钥文件转为 base64（推荐方式）

将下载的 JSON 密钥文件**整体 base64 编码**，这样可以完全避免换行符问题（部署到 Render.com 等平台时最可靠）。

**生成 base64 字符串：**

```bash
# Mac / Linux:
base64 -i your-key-file.json | tr -d '\n'

# Windows (PowerShell):
[Convert]::ToBase64String([IO.File]::ReadAllBytes("your-key-file.json"))

# 或者用 Node.js (所有平台通用):
node -e "console.log(require('fs').readFileSync('your-key-file.json').toString('base64'))"
```

将输出的 base64 字符串保存好，后面配置环境变量时填入 `GOOGLE_CREDENTIALS_BASE64`。

> 💡 base64 方式不需要手动提取 `client_email` 和 `private_key`，整个文件编码后即可使用，最省心。
>
> 如果不想用 base64，也可以在 `.env` 中分别配置 `GOOGLE_CLIENT_EMAIL` 和 `GOOGLE_PRIVATE_KEY`（从 JSON 密钥文件中复制对应字段值）。

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
      编辑 `.env` 文件（推荐使用 base64 方式）：
   ```env
   PORT=3000
   AUTH_PASSWORD=你的登录密码
   JWT_SECRET=随便一串随机字符

   # 方式 1（推荐）: base64 编码的整个 JSON 密钥文件
   GOOGLE_CREDENTIALS_BASE64=第3步生成的base64字符串

   # 留空使用根目录
   GOOGLE_ROOT_FOLDER_ID=
   ```

   > 💡 如果不想用 base64，也可以使用方式 3 分别配置：
   > ```env
   > GOOGLE_CLIENT_EMAIL=从JSON密钥文件复制的client_email
   > GOOGLE_PRIVATE_KEY=从JSON密钥文件复制的private_key
   > ```

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

5. 在 **Environment** 中添加环境变量（**推荐使用 base64 方式**）：
   - `AUTH_PASSWORD` — 你的登录密码
   - `JWT_SECRET` — JWT 密钥
   - `GOOGLE_CREDENTIALS_BASE64` — 第 3 步生成的 base64 字符串（**推荐！最可靠**）
   - `GOOGLE_ROOT_FOLDER_ID` — 留空即可

   > ⚠️ **强烈建议使用 `GOOGLE_CREDENTIALS_BASE64`**，而不是分开配置 `GOOGLE_PRIVATE_KEY`。
   > 因为 Render.com 等平台处理环境变量中的换行符 `\n` 时容易出错，导致私钥解析失败
   > （报错 `DECODER routines::unsupported`）。base64 编码完全避免这个问题。

6. 点击 **Create Web Service**，等待部署完成

7. 部署成功后，Render 会给你一个公网地址，如 `https://clouddriver.onrender.com`

8. 访问该地址，输入密码登录，开始使用！🌐

9. **如果遇到问题**，可以访问调试接口检查凭据配置：
   ```
   https://你的域名/api/debug/credentials
   ```
   （需要先登录获取 token，在请求头中携带 `Authorization: Bearer <token>`）

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
│   ├── gdrive.js          # Google Drive 存储客户端
│   └── auth.js            # JWT 认证中间件
└── public/
    ├── index.html         # 主页面（登录 + 文件管理）
    ├── css/
    │   └── style.css      # 样式表
    └── js/
        └── app.js         # 前端逻辑
```

## 🔒 安全说明

- 密码通过环境变量配置，不硬编码在代码中
- JWT Token 有效期 7 天，过期需重新登录
- 文件上传使用可恢复上传会话 URL（有效期 1 小时）
- Service Account 私钥仅存储在服务器端，不暴露给前端
- 下载 URL 中的 access token 有效期 1 小时，且需先通过 JWT 认证才能获取

## 💡 常见问题

**Q: 上传文件报错 `DECODER routines::unsupported` 怎么办？**
A: 这是 `GOOGLE_PRIVATE_KEY` 环境变量的换行符 `\n` 在部署平台上没有正确处理导致的。解决方案：**使用 `GOOGLE_CREDENTIALS_BASE64` 代替分开配置**。将整个 JSON 密钥文件 base64 编码后设置为环境变量，代码会自动解析，完全避免换行符问题。

**Q: 如何检查凭据是否配置正确？**
A: 登录后访问 `/api/debug/credentials` 接口，它会显示私钥的格式信息（不暴露密钥内容），帮助你诊断问题。

**Q: 为什么用 Google Drive API 而不是 Cloudflare R2？**
A: Google Drive API 提供 15GB 免费存储且**无需绑定信用卡**，只需一个 Google 账号即可使用。Cloudflare R2 虽然也有 10GB 免费额度，但需要绑定信用卡。

**Q: 文件上传有大小限制吗？**
A: 单个文件最大 5TB（Google Drive 限制），总存储 15GB 免费额度。

**Q: Service Account 的 15GB 和我个人的 Google Drive 共享吗？**
A: 不共享。Service Account 有自己独立的 15GB Drive 存储，与你的个人 Google Drive 互不影响。

**Q: Render 免费版会休眠怎么办？**
A: 15 分钟无访问会休眠，下次访问自动唤醒（约 30 秒）。如需常驻可使用 [UptimeRobot](https://uptimerobot.com) 定时 ping（免费）。

**Q: 数据安全吗？**
A: 文件存储在 Google Drive（Service Account 的独立空间），可靠性高。建议妥善保管 JSON 密钥文件。

**Q: 如何查看 Service Account Drive 中的文件？**
A: 可以在 Google Cloud Console 中使用 [Drive API Explorer](https://developers.google.com/drive/api/v3/reference/files/list) 查看文件列表，或通过本项目的 Web 界面管理。

**Q: 15GB 不够用怎么办？**
A: 可以创建多个 Google Cloud 项目，每个项目都有独立的 15GB 额度。或升级到 Google One 付费计划。

## 📝 License

MIT
