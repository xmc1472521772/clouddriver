/**
 * Google Drive 存储客户端
 * 使用 Service Account 认证，15GB 免费存储，无需信用卡
 */
const { google } = require('googleapis');

// ===========================================
// Service Account 认证
// ===========================================
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// 根文件夹 ID（默认为服务账号 Drive 根目录）
// 可通过环境变量指定一个专用文件夹 ID
const ROOT_FOLDER_ID = process.env.GOOGLE_ROOT_FOLDER_ID || 'root';

/**
 * 列出指定文件夹下的文件和文件夹
 * @param {string} folderId - Google Drive 文件夹 ID（空字符串表示根目录）
 * @returns {{ folders: Array, files: Array }}
 */
async function listItems(folderId) {
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
  await drive.files.delete({ fileId });
}

/**
 * 创建文件夹
 * @param {string} name - 文件夹名称
 * @param {string} parentId - 父文件夹 ID
 * @returns {Promise<{ id: string, name: string }>}
 */
async function createFolder(name, parentId) {
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
