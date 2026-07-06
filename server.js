/**
 * 个人云网盘 - Express 服务器
 * 基于 Google Drive API（15GB 免费，无需信用卡）
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const { requireAuth, generateToken, verifyPassword } = require('./lib/auth');
const gdrive = require('./lib/gdrive');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===========================================
// 认证路由
// ===========================================

app.post('/api/login', (req, res) => {
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
  try {
    const fileName = req.query.fileName;
    const folderId = req.query.folderId || '';
    const contentType = req.query.contentType || 'application/octet-stream';

    if (!fileName) {
      return res.status(400).json({ error: '缺少文件名' });
    }

    // 将请求流直接 pipe 到 Google Drive
    const result = await gdrive.uploadFile(
      req,
      decodeURIComponent(fileName),
      folderId,
      decodeURIComponent(contentType)
    );

    res.json({ message: '上传成功', id: result.id, name: result.name });
  } catch (err) {
    console.error('上传失败:', err);
    res.status(500).json({ error: '上传失败: ' + err.message });
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

// 调试端点 — 检查 Google 凭据配置是否正确（不暴露敏感信息）
app.get('/api/debug/credentials', requireAuth, (req, res) => {
  const result = {
    hasCredentialsBase64: !!process.env.GOOGLE_CREDENTIALS_BASE64,
    hasCredentialsJson: !!process.env.GOOGLE_CREDENTIALS,
    hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
    privateKeyLength: 0,
    privateKeyBegins: false,
    privateKeyEnds: false,
    privateKeyHasNewlines: false,
  };

  let key = '';
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    try {
      const json = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
      const creds = JSON.parse(json);
      key = creds.private_key || '';
      result.method = 'GOOGLE_CREDENTIALS_BASE64';
    } catch (e) {
      result.error = 'GOOGLE_CREDENTIALS_BASE64 解析失败: ' + e.message;
    }
  } else if (process.env.GOOGLE_CREDENTIALS) {
    try {
      const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      key = creds.private_key || '';
      result.method = 'GOOGLE_CREDENTIALS';
    } catch (e) {
      result.error = 'GOOGLE_CREDENTIALS 解析失败: ' + e.message;
    }
  } else {
    key = process.env.GOOGLE_PRIVATE_KEY || '';
    result.method = 'GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY';
  }

  // 清理后检查
  key = key.replace(/\\n/g, '\n').trim();
  result.privateKeyLength = key.length;
  result.privateKeyBegins = key.includes('-----BEGIN PRIVATE KEY-----');
  result.privateKeyEnds = key.includes('-----END PRIVATE KEY-----');
  result.privateKeyHasNewlines = key.includes('\n');
  result.privateKeyFirst30 = key.substring(0, 30);
  result.privateKeyLast30 = key.substring(key.length - 30);

  res.json(result);
});

// SPA 回退 - 所有非 API 路由返回 index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n🚀 个人云网盘已启动!`);
  console.log(`   本地访问: http://localhost:${PORT}`);
  console.log(`   存储后端: Google Drive API (15GB 免费)\n`);
});
