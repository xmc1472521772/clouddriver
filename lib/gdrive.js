/**
 * Google Drive 存储客户端
 * 使用 Service Account 认证，15GB 免费存储，无需信用卡
 *
 * 支持三种配置方式（按优先级）:
 * 1. GOOGLE_CREDENTIALS_BASE64 — 将 JSON 密钥文件整体 base64 编码（推荐，最可靠）
 * 2. GOOGLE_CREDENTIALS        — JSON 密钥文件的原始内容（字符串）
 * 3. GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY — 分开配置
 */
const { google } = require('googleapis');

// ===========================================
// 解析 Service Account 凭据
// ===========================================

function parseCredentials() {
  // 方式 1: base64 编码的 JSON 密钥文件（最可靠，无换行问题）
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    try {
      const json = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
      const creds = JSON.parse(json);
      console.log('✅ 使用 GOOGLE_CREDENTIALS_BASE64 加载凭据');
      return { clientEmail: creds.client_email, privateKey: creds.private_key };
    } catch (e) {
      console.error('❌ GOOGLE_CREDENTIALS_BASE64 解析失败:', e.message);
    }
  }

  // 方式 2: 原始 JSON 字符串
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      console.log('✅ 使用 GOOGLE_CREDENTIALS 加载凭据');
      return { clientEmail: creds.client_email, privateKey: creds.private_key };
    } catch (e) {
      console.error('❌ GOOGLE_CREDENTIALS 解析失败:', e.message);
    }
  }

  // 方式 3: 分开配置 client_email + private_key
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';

  if (clientEmail && privateKey) {
    // 清理私钥格式
    privateKey = cleanPrivateKey(privateKey);
    console.log('✅ 使用 GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY 加载凭据');
    return { clientEmail, privateKey };
  }

  return null; // 凭据未配置，返回 null（延迟报错）
}

/**
 * 清理私钥格式 — 处理各种换行符和引号问题
 */
function cleanPrivateKey(key) {
  let cleaned = key.trim();

  // 去掉外层引号（如果用户用引号包裹了整个值）
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // 将字面量 \n（反斜杠+n两个字符）转换为真正的换行符
  cleaned = cleaned.replace(/\\n/g, '\n');

  // 去掉可能的多余空白行
  cleaned = cleaned.trim();

  // 验证私钥格式
  if (!cleaned.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error('⚠️ 私钥缺少 BEGIN 标记，当前前50字符:', cleaned.substring(0, 50));
  }

  return cleaned;
}

// ===========================================
// 延迟初始化 Google Drive 客户端
// ===========================================

let _auth = null;
let _drive = null;

function getDrive() {
  if (_drive) return _drive;

  const credentials = parseCredentials();
  if (!credentials) {
    throw new Error(
      '未找到 Google 凭据！请配置以下任一方式:\n' +
      '  1. GOOGLE_CREDENTIALS_BASE64 (推荐) — 将 JSON 密钥文件 base64 编码\n' +
      '  2. GOOGLE_CREDENTIALS — JSON 密钥文件的原始内容\n' +
      '  3. GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY — 分开配置'
    );
  }

  _auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  _drive = google.drive({ version: 'v3', auth: _auth });
  return _drive;
}

function getAuth() {
  if (_auth) return _auth;
  getDrive(); // 初始化
  return _auth;
}

// 根文件夹 ID（默认为服务账号 Drive 根目录）
const ROOT_FOLDER_ID = process.env.GOOGLE_ROOT_FOLDER_ID || 'root';

/**
 * 列出指定文件夹下的文件和文件夹
 * @param {string} folderId - Google Drive 文件夹 ID（空字符串表示根目录）
 * @returns {{ folders: Array, files: Array }}
 */
async function listItems(folderId) {
  const drive = getDrive();
  const parentId = folderId || ROOT_FOLDER_ID;

  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,size,modifiedTime)',
    orderBy: 'folder,name',
    pageSize: 200,
  });

  const folders = [];
  const files = [];

  for (const f of res.data.files || []) {
    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
    const item = {
      id: f.id,
      name: f.name,
      type: isFolder ? 'folder' : 'file',
      size: parseInt(f.size || '0'),
      lastModified: f.modifiedTime,
      ext: f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '',
    };

    if (isFolder) {
      folders.push(item);
    } else {
      files.push(item);
    }
  }

  return { folders, files };
}

/**
 * 创建可恢复上传会话 URL（浏览器直传 Google，不经过服务器）
 * @param {string} fileName - 文件名
 * @param {string} folderId - 目标文件夹 ID
 * @param {string} contentType - 文件 MIME 类型
 * @returns {Promise<string>} 上传会话 URL
 */
async function getUploadUrl(fileName, folderId, contentType) {
  const auth = getAuth();
  const parentId = folderId || ROOT_FOLDER_ID;

  // 获取 Service Account 的 access token
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes.token;

  // 创建可恢复上传会话
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType || 'application/octet-stream',
      },
      body: JSON.stringify({
        name: fileName,
        parents: [parentId],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`创建上传会话失败: ${response.status} ${text}`);
  }

  const uploadUrl = response.headers.get('location');
  if (!uploadUrl) {
    throw new Error('未获取到上传 URL');
  }

  return uploadUrl;
}

/**
 * 获取文件下载 URL（带 access token，有效期 1 小时）
 * @param {string} fileId - Google Drive 文件 ID
 * @returns {Promise<string>} 下载 URL
 */
async function getDownloadUrl(fileId) {
  const auth = getAuth();
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const accessToken = tokenRes.token;

  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`;
}

/**
 * 删除文件或文件夹
 * @param {string} fileId - Google Drive 文件 ID
 */
async function deleteItem(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}

/**
 * 创建文件夹
 * @param {string} name - 文件夹名称
 * @param {string} parentId - 父文件夹 ID
 * @returns {Promise<{ id: string, name: string }>}
 */
async function createFolder(name, parentId) {
  const drive = getDrive();
  const pid = parentId || ROOT_FOLDER_ID;

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [pid],
    },
    fields: 'id,name',
  });

  return { id: res.data.id, name: res.data.name };
}

/**
 * 重命名文件或文件夹
 * @param {string} fileId - Google Drive 文件 ID
 * @param {string} newName - 新名称
 */
async function renameItem(fileId, newName) {
  const drive = getDrive();
  await drive.files.update({
    fileId,
    requestBody: { name: newName },
  });
}

/**
 * 获取存储使用量
 * @returns {Promise<{ totalSize: number, limit: number }>}
 */
async function getStorageUsage() {
  const drive = getDrive();
  const res = await drive.about.get({
    fields: 'storageQuota',
  });

  const quota = res.data.storageQuota || {};
  const limit = parseInt(quota.limit || '0');

  return {
    totalSize: parseInt(quota.usage || '0'),
    limit: limit > 0 ? limit : 15 * 1024 * 1024 * 1024, // 默认 15GB
  };
}

module.exports = {
  listItems,
  getUploadUrl,
  getDownloadUrl,
  deleteItem,
  createFolder,
  renameItem,
  getStorageUsage,
  ROOT_FOLDER_ID,
};
