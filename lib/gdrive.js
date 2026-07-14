/**
 * Google Drive 存储客户端
 * 使用 OAuth2 用户授权认证（文件存在用户自己的 Google Drive 中）
 *
 * 需要配置:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REFRESH_TOKEN
 * - GOOGLE_ROOT_FOLDER_ID（可选，默认为 root）
 *
 * 获取 refresh_token 方法:
 *   node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>
 */
const { google } = require('googleapis');

// ===========================================
// OAuth2 认证
// ===========================================

let _auth = null;
let _drive = null;

function getDrive() {
  if (_drive) return _drive;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      '未找到 Google OAuth2 凭据！请配置:\n' +
      '  GOOGLE_CLIENT_ID\n' +
      '  GOOGLE_CLIENT_SECRET\n' +
      '  GOOGLE_REFRESH_TOKEN\n' +
      '获取方法: node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>'
    );
  }

  _auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  _auth.setCredentials({
    refresh_token: refreshToken,
  });

  _drive = google.drive({ version: 'v3', auth: _auth });
  console.log('✅ 使用 OAuth2 用户授权加载凭据');
  return _drive;
}

/**
 * 重置缓存的 OAuth2 客户端（用于 token 失效后重试）
 */
function resetAuth() {
  _auth = null;
  _drive = null;
}

/**
 * 检查错误是否为 refresh_token 失效（invalid_grant）
 * Google 在 access_token 过期时自动用 refresh_token 换取新 token，
 * 如果 refresh_token 本身失效（过期/被撤销/改了密码等），会抛出 invalid_grant。
 */
function isInvalidGrantError(err) {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('invalid_grant') || msg.includes('invalid token') || msg.includes('token has been expired');
}

/**
 * 带 auth 重置重试的 API 调用包装器
 *
 * 当 access_token 过期后 googleapis 会自动用 refresh_token 换取新 token。
 * 如果缓存的 auth 客户端处于异常状态（例如上一次自动刷新的 access_token
 * 已过期且 googleapis 内部缓存了错误的 token），重置 auth 后重新创建
 * OAuth2 客户端可以让下一次 API 调用重新走 token 刷新流程。
 *
 * 注意：如果 refresh_token 本身已失效（invalid_grant），重置也无法解决，
 * 需要用户重新运行 google-auth.js 获取新的 refresh_token。
 */
async function withRetry(fn) {
  try {
    return await fn(getDrive());
  } catch (err) {
    // 如果是 refresh_token 失效，给出明确的中文错误提示
    if (isInvalidGrantError(err)) {
      console.error('❌ Google Drive 授权已失效（invalid_grant）');
      console.error('   请重新获取 refresh_token:');
      console.error('   1. 运行: node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>');
      console.error('   2. 在浏览器中授权');
      console.error('   3. 将新的 GOOGLE_REFRESH_TOKEN 更新到环境变量中');
      console.error('   常见原因: 应用处于测试状态(7天过期)、撤销了授权、修改了 Google 密码');
      throw new Error(
        'Google Drive 授权已失效，请重新获取 refresh_token（运行 node scripts/google-auth.js）'
      );
    }
    // 其他错误：重置 auth 后重试一次（可能是 access_token 缓存过期）
    resetAuth();
    return await fn(getDrive());
  }
}

// 根文件夹 ID（默认为用户 Drive 根目录）
const ROOT_FOLDER_ID = process.env.GOOGLE_ROOT_FOLDER_ID || 'root';

/**
 * 列出指定文件夹下的文件和文件夹（自动分页，获取全部）
 * @param {string} folderId - Google Drive 文件夹 ID（空字符串表示根目录）
 * @returns {{ folders: Array, files: Array }}
 */
async function listItems(folderId) {
  const parentId = folderId || ROOT_FOLDER_ID;

  return withRetry(async (drive) => {
    let allFiles = [];
    let pageToken = null;

    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id,name,mimeType,size,modifiedTime)',
        orderBy: 'folder,name',
        pageSize: 200,
        pageToken,
      });
      allFiles = allFiles.concat(res.data.files || []);
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    const folders = [];
    const files = [];

    for (const f of allFiles) {
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
  });
}

/**
 * 上传文件流到 Google Drive（服务器中转，避免 CORS 问题）
 * @param {stream.Readable} fileStream - 文件可读流（直接用 req）
 * @param {string} fileName - 文件名
 * @param {string} folderId - 目标文件夹 ID
 * @param {string} contentType - 文件 MIME 类型
 * @returns {Promise<{ id: string, name: string }>}
 */
async function uploadFile(fileStream, fileName, folderId, contentType) {
  const parentId = folderId || ROOT_FOLDER_ID;

  return withRetry(async (drive) => {
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId],
      },
      media: {
        mimeType: contentType || 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id,name',
    });

    return { id: res.data.id, name: res.data.name };
  });
}

/**
 * 下载文件流（服务器中转，避免 CORS 问题）
 * @param {string} fileId - Google Drive 文件 ID
 * @param {object} res - Express response 对象，用于 pipe 输出
 * @param {string} fileName - 文件名（用于 Content-Disposition）
 */
async function downloadFile(fileId, res, fileName) {
  const drive = getDrive();

  // 先获取文件元数据（必须串行：流创建后需立即挂载 error handler，
  // 否则流在 error handler 挂载前出错会导致 uncaughtException 崩溃进程）
  const fileMeta = await drive.files.get({
    fileId,
    fields: 'name,mimeType,size',
  });

  const name = fileName || fileMeta.data.name || 'download';
  const mimeType = fileMeta.data.mimeType || 'application/octet-stream';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  if (fileMeta.data.size) {
    res.setHeader('Content-Length', fileMeta.data.size);
  }
  // 立即刷新响应头，让浏览器尽早弹出下载对话框并显示进度条
  res.flushHeaders();

  // 获取文件内容流（创建后立即挂载 error handler，避免竞态条件）
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  // 客户端断开连接时（取消下载、关闭页面等）销毁上游流，避免浪费带宽
  res.on('close', () => {
    if (response.data.destroy) response.data.destroy();
  });

  // 处理下载流传输中的错误，避免客户端收到截断文件
  response.data.on('error', (err) => {
    console.error('下载流错误:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '下载失败: ' + err.message });
    } else {
      res.end();
    }
  });

  response.data.pipe(res);
}

/**
 * 删除文件或文件夹
 * @param {string} fileId - Google Drive 文件 ID
 */
async function deleteItem(fileId) {
  return withRetry(async (drive) => {
    await drive.files.delete({ fileId });
  });
}

/**
 * 创建文件夹
 * @param {string} name - 文件夹名称
 * @param {string} parentId - 父文件夹 ID
 * @returns {Promise<{ id: string, name: string }>}
 */
async function createFolder(name, parentId) {
  const pid = parentId || ROOT_FOLDER_ID;

  return withRetry(async (drive) => {
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pid],
      },
      fields: 'id,name',
    });

    return { id: res.data.id, name: res.data.name };
  });
}

/**
 * 重命名文件或文件夹
 * @param {string} fileId - Google Drive 文件 ID
 * @param {string} newName - 新名称
 */
async function renameItem(fileId, newName) {
  return withRetry(async (drive) => {
    await drive.files.update({
      fileId,
      requestBody: { name: newName },
    });
  });
}

/**
 * 移动文件或文件夹到另一个文件夹
 * @param {string} fileId - 要移动的文件/文件夹 ID
 * @param {string} targetFolderId - 目标文件夹 ID（空字符串表示根目录）
 * @returns {Promise<{ id: string }>}
 */
async function moveItem(fileId, targetFolderId) {
  const targetParent = targetFolderId || ROOT_FOLDER_ID;

  return withRetry(async (drive) => {
    // 获取当前父文件夹
    const file = await drive.files.get({
      fileId,
      fields: 'parents',
    });

    const previousParents = (file.data.parents || []).join(',');

    await drive.files.update({
      fileId,
      addParents: targetParent,
      removeParents: previousParents || undefined,
      fields: 'id, parents',
    });

    return { id: fileId };
  });
}

/**
 * 获取存储使用量
 * @returns {Promise<{ totalSize: number, limit: number }>}
 */
async function getStorageUsage() {
  return withRetry(async (drive) => {
    const res = await drive.about.get({
      fields: 'storageQuota',
    });

    const quota = res.data.storageQuota || {};
    const limit = parseInt(quota.limit || '0');

    return {
      totalSize: parseInt(quota.usage || '0'),
      limit: limit > 0 ? limit : 15 * 1024 * 1024 * 1024,
    };
  });
}

module.exports = {
  listItems,
  uploadFile,
  downloadFile,
  deleteItem,
  createFolder,
  renameItem,
  moveItem,
  getStorageUsage,
  resetAuth,
  ROOT_FOLDER_ID,
};
