/**
 * 个人云网盘 - Express 服务器
 * 基于 Google Drive API（15GB 免费，无需信用卡）
 */
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { requireAuth, generateToken, verifyPassword } = require('./lib/auth');
const gdrive = require('./lib/gdrive');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
// 对非上传路由使用 JSON 解析（避免消费文件上传的请求体）
app.use((req, res, next) => {
  if (req.path === '/api/files/upload' && req.method === 'POST') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.static(path.join(__dirname, 'public')));

// ===========================================
// 健康检查端点（无需认证，供 Render.com 等平台使用）
// ===========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ===========================================
// 认证路由
// ===========================================

// 登录速率限制：15 分钟内最多 5 次尝试
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '尝试次数过多，请 15 分钟后再试' },
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: '请输入密码' });
  }

  if (!verifyPassword(password)) {
    return res.status(401).json({ error: '密码错误' });
  }

  const token = generateToken();
  res.json({ token, message: '登录成功' });
});

// 验证 Token 是否有效
app.get('/api/auth/check', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ===========================================
// 文件管理路由 (需要认证)
// ===========================================

// 列出文件和文件夹
app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const folderId = req.query.folderId || '';
    const result = await gdrive.listItems(folderId);
    res.json(result);
  } catch (err) {
    console.error('列出文件失败:', err);
    res.status(500).json({ error: '获取文件列表失败: ' + err.message });
  }
});

// 上传文件（服务器中转到 Google Drive，避免 CORS）
app.post('/api/files/upload', requireAuth, async (req, res) => {
  const fileName = req.query.fileName;
  const folderId = req.query.folderId || '';
  const contentType = req.query.contentType || 'application/octet-stream';

  if (!fileName) {
    // 消费请求体，避免 HTTP/2 协议错误
    req.resume();
    return res.status(400).json({ error: '缺少文件名' });
  }

  // 跟踪客户端是否中断
  let clientAborted = false;
  req.on('aborted', () => {
    clientAborted = true;
  });
  req.on('error', (err) => {
    console.error('请求流错误:', err.message);
    clientAborted = true;
  });

  try {
    // 将请求流直接 pipe 到 Google Drive
    const result = await gdrive.uploadFile(
      req,
      decodeURIComponent(fileName),
      folderId,
      decodeURIComponent(contentType)
    );

    if (clientAborted) return;
    res.json({ message: '上传成功', id: result.id, name: result.name });
  } catch (err) {
    console.error('上传失败:', err);
    if (clientAborted) return;
    // 消费剩余请求体，避免 HTTP/2 协议错误
    // （当 Google Drive 端出错时，客户端可能仍在发送数据，
    //   此时直接发送响应会导致 HTTP/2 PROTOCOL_ERROR）
    req.resume();
    if (!res.headersSent) {
      res.status(500).json({ error: '上传失败: ' + err.message });
    }
  }
});

// 下载文件（服务器中转流式下载，避免 CORS）
app.get('/api/files/download', requireAuth, async (req, res) => {
  try {
    const fileId = req.query.fileId;
    const fileName = req.query.fileName || '';

    if (!fileId) {
      return res.status(400).json({ error: '缺少文件ID' });
    }

    await gdrive.downloadFile(fileId, res, fileName ? decodeURIComponent(fileName) : '');
  } catch (err) {
    console.error('下载失败:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '下载失败: ' + err.message });
    }
  }
});

// 删除文件或文件夹
app.delete('/api/files', requireAuth, async (req, res) => {
  try {
    const fileId = req.query.fileId;

    if (!fileId) {
      return res.status(400).json({ error: '缺少文件ID' });
    }

    await gdrive.deleteItem(fileId);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除失败:', err);
    res.status(500).json({ error: '删除失败: ' + err.message });
  }
});

// 创建文件夹
app.post('/api/folders', requireAuth, async (req, res) => {
  try {
    const { folderName, parentId } = req.body;

    if (!folderName) {
      return res.status(400).json({ error: '缺少文件夹名称' });
    }

    const result = await gdrive.createFolder(folderName, parentId || '');
    res.json({ message: '文件夹创建成功', id: result.id, name: result.name });
  } catch (err) {
    console.error('创建文件夹失败:', err);
    res.status(500).json({ error: '创建文件夹失败: ' + err.message });
  }
});

// 重命名文件或文件夹
app.patch('/api/files/rename', requireAuth, async (req, res) => {
  try {
    const { fileId, newName } = req.body;

    if (!fileId || !newName) {
      return res.status(400).json({ error: '缺少文件ID或新名称' });
    }

    await gdrive.renameItem(fileId, newName);
    res.json({ message: '重命名成功' });
  } catch (err) {
    console.error('重命名失败:', err);
    res.status(500).json({ error: '重命名失败: ' + err.message });
  }
});

// 移动文件或文件夹
app.post('/api/files/move', requireAuth, async (req, res) => {
  try {
    const { fileId, targetFolderId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: '缺少文件ID' });
    }

    await gdrive.moveItem(fileId, targetFolderId || '');
    res.json({ message: '移动成功' });
  } catch (err) {
    console.error('移动失败:', err);
    res.status(500).json({ error: '移动失败: ' + err.message });
  }
});

// 获取存储使用量
app.get('/api/storage/usage', requireAuth, async (req, res) => {
  try {
    const usage = await gdrive.getStorageUsage();
    res.json(usage);
  } catch (err) {
    console.error('获取存储使用量失败:', err);
    res.status(500).json({ error: '获取存储使用量失败: ' + err.message });
  }
});

// 调试端点 — 检查 Google OAuth2 配置是否正确（仅非生产环境）
app.get('/api/debug/credentials', requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: '接口不存在' });
  }

  const result = {
    authMethod: 'OAuth2',
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
    rootFolderId: process.env.GOOGLE_ROOT_FOLDER_ID || '(未设置，使用 root)',
  };

  // 如果配置了 OAuth2 凭据，尝试验证是否可用
  if (result.hasClientId && result.hasClientSecret && result.hasRefreshToken) {
    try {
      const testList = await gdrive.listItems('');
      result.driveAccessible = true;
      result.rootFolderItemCount = (testList.folders?.length || 0) + (testList.files?.length || 0);
    } catch (e) {
      result.driveAccessible = false;
      result.driveError = e.message;
    }
  } else {
    result.driveAccessible = false;
    result.driveError = 'OAuth2 凭据不完整！需要配置 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN';
  }

  res.json(result);
});

// SPA 回退 - 所有非 API 路由返回 index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`\n🚀 个人云网盘已启动!`);
  console.log(`   本地访问: http://localhost:${PORT}`);
  console.log(`   存储后端: Google Drive API (15GB 免费)\n`);
});

// 超时设置，支持大文件上传/下载（30 分钟）
server.timeout = 30 * 60 * 1000;          // socket 超时 30 分钟
server.requestTimeout = 30 * 60 * 1000;    // 请求超时 30 分钟
server.keepAliveTimeout = 120000;          // 2 分钟 keep-alive
server.headersTimeout = 125000;            // 2 分钟 + 5 秒 headers 超时
