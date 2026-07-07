/**
 * 个人云网盘 - 前端应用
 * 基于 Google Drive API
 */

// ===========================================
// 全局状态
// ===========================================
const state = {
  token: localStorage.getItem('clouddrive_token') || '',
  currentFolderId: '',                                    // 当前文件夹 ID（空 = 根目录）
  folderStack: [{ id: '', name: '全部文件' }],           // 面包屑导航栈
  items: { folders: [], files: [] },
  contextItem: null,                                      // 右键菜单操作目标
};

// ===========================================
// API 请求封装
// ===========================================
async function api(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(url, { ...options, headers });

  // 登录接口的 401 是密码错误，不应该触发登出逻辑
  const isLoginRequest = url === '/api/login';
  if (res.status === 401 && !isLoginRequest) {
    logout();
    throw new Error('登录已过期，请重新登录');
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

// ===========================================
// 工具函数
// ===========================================

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 2592000000) return Math.floor(diff / 86400000) + ' 天前';

  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getFileIcon(ext) {
  const iconMap = {
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', webp: '🖼️', svg: '🖼️',
    mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬', wmv: '🎬', flv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵', m4a: '🎵',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
    js: '📜', ts: '📜', html: '📜', css: '📜', json: '📜', py: '📜', java: '📜', cpp: '📜', c: '📜', go: '📜', rs: '📜',
    zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
    txt: '📄', md: '📄', log: '📄',
    exe: '⚙️', dmg: '⚙️', apk: '⚙️',
  };
  return iconMap[ext] || '📄';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ===========================================
// 认证
// ===========================================

function showLoginPage() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('appPage').style.display = 'none';
}

function showAppPage() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';
  loadFiles();
  loadStorageUsage();
}

function logout() {
  state.token = '';
  localStorage.removeItem('clouddrive_token');
  showLoginPage();
}

async function checkAuth() {
  if (!state.token) {
    showLoginPage();
    return;
  }
  try {
    await api('/api/auth/check');
    showAppPage();
  } catch {
    showLoginPage();
  }
}

// 登录表单提交
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('passwordInput').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = '登录中...';

  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    state.token = data.token;
    localStorage.setItem('clouddrive_token', data.token);
    document.getElementById('passwordInput').value = '';
    showAppPage();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '登 录';
  }
});

document.getElementById('logoutBtn').addEventListener('click', logout);

// ===========================================
// 文件列表
// ===========================================

let _isLoadingFiles = false;   // 防止并发加载
let _loadRequestId = 0;        // 请求 ID，忽略过期响应

async function loadFiles(folderId) {
  if (folderId !== undefined) {
    state.currentFolderId = folderId;
  }

  // 生成唯一请求 ID，用于忽略过期响应
  const requestId = ++_loadRequestId;
  _isLoadingFiles = true;
  showFileListLoading();

  try {
    const data = await api(`/api/files?folderId=${encodeURIComponent(state.currentFolderId)}`);
    // 如果在等待期间用户又点了其他文件夹，忽略这个过期的响应
    if (requestId !== _loadRequestId) return;
    state.items = data;
    renderFileList();
    renderBreadcrumb();
  } catch (err) {
    if (requestId !== _loadRequestId) return;
    showToast('加载文件失败: ' + err.message, 'error');
  } finally {
    if (requestId === _loadRequestId) {
      _isLoadingFiles = false;
      hideFileListLoading();
    }
  }
}

function showFileListLoading() {
  const listEl = document.getElementById('fileList');
  const emptyEl = document.getElementById('emptyState');
  emptyEl.style.display = 'none';
  listEl.innerHTML = '<div class="file-list-loading"><div class="file-list-spinner"></div>加载中...</div>';
}

function hideFileListLoading() {
  // renderFileList() 会替换 innerHTML，无需额外处理
}

function renderFileList() {
  const listEl = document.getElementById('fileList');
  const emptyEl = document.getElementById('emptyState');
  const countEl = document.getElementById('fileCount');

  const { folders, files } = state.items;

  // 搜索过滤
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filteredFolders = searchTerm
    ? folders.filter((f) => f.name.toLowerCase().includes(searchTerm))
    : folders;
  const filteredFiles = searchTerm
    ? files.filter((f) => f.name.toLowerCase().includes(searchTerm))
    : files;

  const totalFiltered = filteredFolders.length + filteredFiles.length;

  if (totalFiltered === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    if (searchTerm) {
      emptyEl.querySelector('.empty-icon').textContent = '🔍';
      emptyEl.querySelector('p').textContent = '没有找到匹配的文件';
      emptyEl.querySelector('.empty-hint').textContent = '试试其他关键词';
    } else {
      emptyEl.querySelector('.empty-icon').textContent = '📂';
      emptyEl.querySelector('p').textContent = '这个文件夹是空的';
      emptyEl.querySelector('.empty-hint').textContent = '拖拽文件到此处或点击上传按钮';
    }
  } else {
    emptyEl.style.display = 'none';

    let html = '';

    // 文件夹
    for (const folder of filteredFolders) {
      html += `
        <div class="file-item" data-type="folder" data-id="${escapeAttr(folder.id)}" data-name="${escapeHtml(folder.name)}">
          <span class="file-icon">📁</span>
          <div class="file-info">
            <div class="file-name">${escapeHtml(folder.name)}</div>
            <div class="file-meta">文件夹</div>
          </div>
          <div class="file-actions">
            <button class="file-action-btn" onclick="event.stopPropagation(); openMoveModal('${escapeAttr(folder.id)}', '${escapeAttr(folder.name)}', true)" title="移动">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>
            </button>
            <button class="file-action-btn" onclick="event.stopPropagation(); openRenameModal('${escapeAttr(folder.id)}', '${escapeAttr(folder.name)}', true)" title="重命名">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="file-action-btn danger" onclick="event.stopPropagation(); deleteItem('${escapeAttr(folder.id)}', '${escapeAttr(folder.name)}')" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }

    // 文件
    for (const file of filteredFiles) {
      const icon = getFileIcon(file.ext);
      html += `
        <div class="file-item" data-type="file" data-id="${escapeAttr(file.id)}" data-name="${escapeHtml(file.name)}">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-meta">${formatSize(file.size)} · ${formatDate(file.lastModified)}</div>
          </div>
          <div class="file-actions">
            <button class="file-action-btn" onclick="event.stopPropagation(); downloadFile('${escapeAttr(file.id)}', '${escapeAttr(file.name)}')" title="下载">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="file-action-btn" onclick="event.stopPropagation(); openMoveModal('${escapeAttr(file.id)}', '${escapeAttr(file.name)}', false)" title="移动">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>
            </button>
            <button class="file-action-btn" onclick="event.stopPropagation(); openRenameModal('${escapeAttr(file.id)}', '${escapeAttr(file.name)}', false)" title="重命名">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="file-action-btn danger" onclick="event.stopPropagation(); deleteItem('${escapeAttr(file.id)}', '${escapeAttr(file.name)}')" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    // 绑定点击事件
    listEl.querySelectorAll('.file-item').forEach((item) => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        const id = item.dataset.id;
        const name = item.dataset.name;
        if (type === 'folder') {
          // 防止加载中重复点击导致面包屑重复
          if (_isLoadingFiles) return;
          // 进入文件夹
          state.folderStack.push({ id, name });
          loadFiles(id);
        }
      });

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, item.dataset.type, item.dataset.id, item.dataset.name);
      });
    });
  }

  // 更新文件计数
  const totalCount = folders.length + files.length;
  countEl.textContent = totalCount > 0 ? `${totalCount} 个项目` : '';
}

// ===========================================
// 面包屑导航
// ===========================================

function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  let html = '';

  for (let i = 0; i < state.folderStack.length; i++) {
    const item = state.folderStack[i];
    const isLast = i === state.folderStack.length - 1;

    if (i > 0) {
      html += `<span class="breadcrumb-sep">›</span>`;
    }
    html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" data-index="${i}">${escapeHtml(item.name)}</span>`;
  }

  el.innerHTML = html;

  // 动态更新浏览器标题
  const currentName = state.folderStack[state.folderStack.length - 1].name;
  document.title = currentName === '全部文件' ? '我的云盘' : `${currentName} - 我的云盘`;

  el.querySelectorAll('.breadcrumb-item').forEach((item) => {
    if (!item.classList.contains('active')) {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        state.folderStack = state.folderStack.slice(0, index + 1);
        loadFiles(state.folderStack[state.folderStack.length - 1].id);
      });
    }
  });
}

// ===========================================
// 文件上传（通过服务器中转到 Google Drive）
// ===========================================

async function uploadFile(file) {
  const progressList = document.getElementById('uploadProgressList');

  // 创建进度条 UI
  const progressEl = document.createElement('div');
  progressEl.className = 'upload-item';
  progressEl.innerHTML = `
    <div class="upload-item-header">
      <span class="upload-item-name">${escapeHtml(file.name)}</span>
      <span class="upload-item-status">准备中...</span>
    </div>
    <div class="upload-progress-bar">
      <div class="upload-progress-fill" style="width:0%"></div>
    </div>
  `;
  progressList.appendChild(progressEl);

  const statusEl = progressEl.querySelector('.upload-item-status');
  const fillEl = progressEl.querySelector('.upload-progress-fill');

  try {
    // 直接 POST 文件到服务器，服务器中转到 Google Drive
    statusEl.textContent = '上传中...';
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `/api/files/upload?fileName=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || 'application/octet-stream')}&folderId=${encodeURIComponent(state.currentFolderId)}`;
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          fillEl.style.width = percent + '%';
          statusEl.textContent = `${percent}%`;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let msg = `上传失败 (${xhr.status})`;
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('网络错误')));
      xhr.send(file);
    });

    // 上传成功
    statusEl.textContent = '✓ 完成';
    statusEl.classList.add('success');
    fillEl.classList.add('success');
    fillEl.style.width = '100%';

    // 刷新文件列表和存储信息
    loadFiles();
    loadStorageUsage();

    // 3秒后移除进度条
    setTimeout(() => {
      progressEl.style.opacity = '0';
      progressEl.style.transition = 'opacity 0.3s';
      setTimeout(() => progressEl.remove(), 300);
    }, 3000);

  } catch (err) {
    statusEl.textContent = '✗ 失败';
    statusEl.classList.add('error');
    fillEl.classList.add('error');
    fillEl.style.width = '100%';
    showToast(`上传 ${file.name} 失败: ${err.message}`, 'error');

    setTimeout(() => {
      progressEl.style.opacity = '0';
      progressEl.style.transition = 'opacity 0.3s';
      setTimeout(() => progressEl.remove(), 300);
    }, 5000);
  }
}

// 文件选择器
document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  files.forEach(uploadFile);
  e.target.value = '';
});

// 拖拽上传
const dropZone = document.getElementById('dropZone');

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (eventName === 'dragleave' && e.target !== dropZone) return;
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files);
  files.forEach(uploadFile);
});

// ===========================================
// 文件下载
// ===========================================

async function downloadFile(fileId, fileName) {
  try {
    showToast('正在下载...', 'info');
    // 通过服务器中转下载，避免 CORS 问题
    const url = `/api/files/download?fileId=${encodeURIComponent(fileId)}&fileName=${encodeURIComponent(fileName || '')}`;
    const a = document.createElement('a');
    a.href = url + '&token=' + encodeURIComponent(state.token);
    a.download = fileName || '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    showToast('下载失败: ' + err.message, 'error');
  }
}

// ===========================================
// 删除文件
// ===========================================

async function deleteItem(fileId, name) {
  if (!confirm(`确定要删除「${name}」吗？`)) {
    return;
  }

  try {
    await api(`/api/files?fileId=${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    showToast(`已删除: ${name}`, 'success');
    loadFiles();
    loadStorageUsage();
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

// ===========================================
// 新建文件夹
// ===========================================

document.getElementById('newFolderBtn').addEventListener('click', () => {
  document.getElementById('folderModal').style.display = 'flex';
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderNameInput').focus();
});

function closeFolderModal() {
  document.getElementById('folderModal').style.display = 'none';
}

document.getElementById('confirmFolderBtn').addEventListener('click', async () => {
  const name = document.getElementById('folderNameInput').value.trim();
  if (!name) {
    showToast('请输入文件夹名称', 'error');
    return;
  }

  try {
    await api('/api/folders', {
      method: 'POST',
      body: JSON.stringify({ folderName: name, parentId: state.currentFolderId }),
    });
    showToast('文件夹创建成功', 'success');
    closeFolderModal();
    loadFiles();
  } catch (err) {
    showToast('创建失败: ' + err.message, 'error');
  }
});

document.getElementById('folderNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('confirmFolderBtn').click();
});

// ===========================================
// 重命名
// ===========================================

let renameTarget = null;

function openRenameModal(fileId, name, isFolder) {
  renameTarget = { fileId, isFolder };
  document.getElementById('renameModal').style.display = 'flex';
  const input = document.getElementById('renameInput');

  // 如果是文件，选中文件名（不含扩展名）方便编辑
  if (!isFolder && name.includes('.')) {
    const lastDot = name.lastIndexOf('.');
    input.value = name.substring(0, lastDot);
  } else {
    input.value = name;
  }
  input.focus();
  input.select();
}

function closeRenameModal() {
  document.getElementById('renameModal').style.display = 'none';
  renameTarget = null;
}

document.getElementById('confirmRenameBtn').addEventListener('click', async () => {
  if (!renameTarget) return;

  const newName = document.getElementById('renameInput').value.trim();
  if (!newName) {
    showToast('请输入新名称', 'error');
    return;
  }

  // 如果是文件且用户没输入扩展名，保留原扩展名
  let finalName = newName;
  if (!renameTarget.isFolder) {
    // 获取原文件名（从 DOM 中找）
    const item = document.querySelector(`[data-id="${renameTarget.fileId}"]`);
    if (item) {
      const oldName = item.dataset.name;
      if (oldName.includes('.')) {
        const oldExt = oldName.substring(oldName.lastIndexOf('.'));
        if (!newName.toLowerCase().endsWith(oldExt.toLowerCase())) {
          finalName = newName + oldExt;
        }
      }
    }
  }

  try {
    await api('/api/files/rename', {
      method: 'PATCH',
      body: JSON.stringify({ fileId: renameTarget.fileId, newName: finalName }),
    });
    showToast('重命名成功', 'success');
    closeRenameModal();
    loadFiles();
  } catch (err) {
    showToast('重命名失败: ' + err.message, 'error');
  }
});

document.getElementById('renameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('confirmRenameBtn').click();
});

// ===========================================
// 移动文件
// ===========================================

let moveTarget = null;  // { fileId, isFolder, fileName }
let moveState = {
  currentFolderId: '',           // 当前浏览的文件夹 ID
  folderStack: [{ id: '', name: '全部文件' }],  // 导航栈
};

function openMoveModal(fileId, name, isFolder) {
  moveTarget = { fileId, isFolder, fileName: name };
  // 重置到根目录
  moveState.currentFolderId = '';
  moveState.folderStack = [{ id: '', name: '全部文件' }];
  document.getElementById('moveModal').style.display = 'flex';
  loadMoveFolders('');
}

function closeMoveModal() {
  document.getElementById('moveModal').style.display = 'none';
  moveTarget = null;
}

// 加载移动弹窗中的文件夹列表
async function loadMoveFolders(folderId) {
  const listEl = document.getElementById('moveFolderList');
  listEl.innerHTML = '<div class="move-loading">加载中...</div>';

  try {
    const data = await api(`/api/files?folderId=${encodeURIComponent(folderId)}`);
    renderMoveFolders(data.folders || []);
    renderMoveBreadcrumb();
  } catch (err) {
    listEl.innerHTML = `<div class="move-empty">加载失败: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMoveFolders(folders) {
  const listEl = document.getElementById('moveFolderList');

  if (folders.length === 0) {
    listEl.innerHTML = '<div class="move-empty">此文件夹中没有子文件夹</div>';
    return;
  }

  let html = '';
  for (const folder of folders) {
    // 不能移动到自身（如果是文件夹）
    const isSelf = moveTarget && moveTarget.isFolder && folder.id === moveTarget.fileId;
    if (isSelf) continue;  // 跳过自身

    html += `
      <div class="move-folder-item" data-id="${escapeAttr(folder.id)}" data-name="${escapeAttr(folder.name)}">
        <span class="move-folder-icon">📁</span>
        <span class="move-folder-name">${escapeHtml(folder.name)}</span>
        <span class="move-folder-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    `;
  }

  if (!html) {
    listEl.innerHTML = '<div class="move-empty">此文件夹中没有子文件夹</div>';
    return;
  }

  listEl.innerHTML = html;

  // 绑定点击事件 — 双击进入文件夹，单击选中
  listEl.querySelectorAll('.move-folder-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const name = item.dataset.name;
      // 进入该文件夹
      moveState.currentFolderId = id;
      moveState.folderStack.push({ id, name });
      loadMoveFolders(id);
    });
  });
}

function renderMoveBreadcrumb() {
  const el = document.getElementById('moveBreadcrumb');
  let html = '';

  for (let i = 0; i < moveState.folderStack.length; i++) {
    const item = moveState.folderStack[i];
    const isLast = i === moveState.folderStack.length - 1;

    if (i > 0) {
      html += '<span class="move-breadcrumb-sep">›</span>';
    }
    html += `<span class="move-breadcrumb-item ${isLast ? 'current' : ''}" data-index="${i}">${escapeHtml(item.name)}</span>`;
  }

  el.innerHTML = html;

  el.querySelectorAll('.move-breadcrumb-item').forEach((item) => {
    if (!item.classList.contains('current')) {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        moveState.folderStack = moveState.folderStack.slice(0, index + 1);
        moveState.currentFolderId = moveState.folderStack[moveState.folderStack.length - 1].id;
        loadMoveFolders(moveState.currentFolderId);
      });
    }
  });
}

document.getElementById('confirmMoveBtn').addEventListener('click', async () => {
  if (!moveTarget) return;

  const targetFolderId = moveState.currentFolderId;
  const btn = document.getElementById('confirmMoveBtn');

  // 检查是否移动到当前所在文件夹（无需移动）
  if (targetFolderId === state.currentFolderId) {
    showToast('文件已在此文件夹中', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '移动中...';

  try {
    await api('/api/files/move', {
      method: 'POST',
      body: JSON.stringify({
        fileId: moveTarget.fileId,
        targetFolderId: targetFolderId,
      }),
    });
    showToast(`已移动「${moveTarget.fileName}」`, 'success');
    closeMoveModal();
    loadFiles();
  } catch (err) {
    showToast('移动失败: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '移动到此处';
  }
});

// ===========================================
// 右键菜单
// ===========================================

function showContextMenu(e, type, id, name) {
  const menu = document.getElementById('contextMenu');
  state.contextItem = { type, id, name };

  // 显示/隐藏下载选项（仅文件可下载）
  document.getElementById('ctxDownload').style.display = type === 'file' ? 'flex' : 'none';

  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
}

document.addEventListener('click', () => {
  document.getElementById('contextMenu').style.display = 'none';
});

document.getElementById('ctxDownload').addEventListener('click', () => {
  if (state.contextItem) downloadFile(state.contextItem.id, state.contextItem.name);
});

document.getElementById('ctxMove').addEventListener('click', () => {
  if (state.contextItem) {
    openMoveModal(state.contextItem.id, state.contextItem.name, state.contextItem.type === 'folder');
  }
});

document.getElementById('ctxRename').addEventListener('click', () => {
  if (state.contextItem) {
    openRenameModal(state.contextItem.id, state.contextItem.name, state.contextItem.type === 'folder');
  }
});

document.getElementById('ctxDelete').addEventListener('click', () => {
  if (state.contextItem) {
    deleteItem(state.contextItem.id, state.contextItem.name);
  }
});

// ===========================================
// 存储使用量
// ===========================================

async function loadStorageUsage() {
  try {
    const data = await api('/api/storage/usage');
    const percent = (data.totalSize / data.limit) * 100;

    document.getElementById('storageBar').style.width = Math.min(percent, 100) + '%';
    document.getElementById('storageText').textContent =
      `${formatSize(data.totalSize)} / ${formatSize(data.limit)}`;

    // 存储超过 80% 时变色
    const bar = document.getElementById('storageBar');
    if (percent > 90) {
      bar.style.background = 'var(--danger)';
    } else if (percent > 80) {
      bar.style.background = '#f59e0b';
    }
  } catch (err) {
    console.error('获取存储使用量失败:', err);
  }
}

// ===========================================
// 搜索
// ===========================================

let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    renderFileList();
  }, 200);
});

// ===========================================
// 键盘快捷键
// ===========================================

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeFolderModal();
    closeRenameModal();
    closeMoveModal();
    document.getElementById('contextMenu').style.display = 'none';
  }
});

// 点击弹窗背景关闭
document.getElementById('folderModal').addEventListener('click', (e) => {
  if (e.target.id === 'folderModal') closeFolderModal();
});
document.getElementById('renameModal').addEventListener('click', (e) => {
  if (e.target.id === 'renameModal') closeRenameModal();
});
document.getElementById('moveModal').addEventListener('click', (e) => {
  if (e.target.id === 'moveModal') closeMoveModal();
});

// ===========================================
// 初始化
// ===========================================

checkAuth();
