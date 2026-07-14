/**
 * Google OAuth2 本地授权脚本（支持代理，适用于国内网络环境）
 *
 * 运行此脚本获取 refresh_token，然后将 refresh_token 设置到 Render.com 环境变量中。
 *
 * 使用方法:
 *   1. 在 Google Cloud Console 创建 OAuth2 凭据:
 *      - APIs & Services → Credentials → Create Credentials → OAuth client ID
 *      - Application type: Web application
 *      - Authorized redirect URIs: http://localhost:3001/oauth2callback
 *   2. 运行此脚本:
 *      node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET> [代理地址]
 *
 * 代理地址（可选，国内必须）:
 *   - Clash:  http://127.0.0.1:7890
 *   - V2Ray:  http://127.0.0.1:10809  或  socks5://127.0.0.1:10808
 *   - 其他:   http://127.0.0.1:1080   或  socks5://127.0.0.1:1080
 *
 * 也可以通过环境变量设置代理:
 *   Windows PowerShell:  $env:HTTPS_PROXY = "http://127.0.0.1:7890"
 *   Linux/Mac:           export HTTPS_PROXY=http://127.0.0.1:7890
 *
 * 示例:
 *   node scripts/google-auth.js 123456-xxx.apps.googleusercontent.com GOCSPX-xxx http://127.0.0.1:7890
 *   node scripts/google-auth.js 123456-xxx.apps.googleusercontent.com GOCSPX-xxx socks5://127.0.0.1:10808
 */

const http = require('http');
const https = require('https');
const net = require('net');
const { google } = require('googleapis');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const REDIRECT_URI = 'http://localhost:3001/oauth2callback';
const PORT = 3001;

// ===========================================
// 代理配置
// ===========================================

/**
 * 尝试连接指定端口，检测代理是否可用
 */
function checkPort(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * 自动检测常见代理端口
 */
async function autoDetectProxy() {
  const commonProxies = [
    { url: 'http://127.0.0.1:7890', name: 'Clash (HTTP)' },
    { url: 'http://127.0.0.1:10809', name: 'V2Ray (HTTP)' },
    { url: 'socks5://127.0.0.1:10808', name: 'V2Ray (SOCKS5)' },
    { url: 'http://127.0.0.1:1080', name: 'SS/SSR (HTTP)' },
    { url: 'socks5://127.0.0.1:1080', name: 'SS/SSR (SOCKS5)' },
    { url: 'http://127.0.0.1:1087', name: 'Clash (Alt HTTP)' },
    { url: 'http://127.0.0.1:8080', name: 'Generic (8080)' },
  ];

  for (const p of commonProxies) {
    const port = parseInt(p.url.match(/:(\d+)$/)[1]);
    const host = p.url.match(/\/\/([^:/]+)/)[1];
    const available = await checkPort(host, port);
    if (available) {
      console.log(`🔍 自动检测到代理: ${p.name} → ${p.url}`);
      return p.url;
    }
  }
  return null;
}

/**
 * 创建代理 Agent
 */
function createProxyAgent(proxyUrl) {
  const lower = proxyUrl.toLowerCase();

  if (lower.startsWith('socks')) {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    return new SocksProxyAgent(proxyUrl);
  } else {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  }
}

/**
 * 初始化代理
 */
async function initProxy() {
  // 优先级: 命令行参数 > 环境变量 > 自动检测
  let proxyUrl = process.argv[4] ||
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy;

  if (proxyUrl) {
    // 如果是简写（如 7890 或 127.0.0.1:7890），补全为 http://
    if (/^\d+$/.test(proxyUrl)) {
      proxyUrl = `http://127.0.0.1:${proxyUrl}`;
    } else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(proxyUrl)) {
      proxyUrl = `http://${proxyUrl}`;
    } else if (proxyUrl.startsWith('127.0.0.1:') || proxyUrl.startsWith('localhost:')) {
      proxyUrl = `http://${proxyUrl}`;
    }
    console.log(`🌐 使用指定代理: ${proxyUrl}`);
  } else {
    console.log('🔍 未指定代理，正在自动检测常见代理端口...');
    proxyUrl = await autoDetectProxy();
  }

  if (!proxyUrl) {
    console.error('\n❌ 未检测到可用代理！');
    console.error('   国内网络无法直接访问 Google，需要通过代理运行此脚本。');
    console.error('');
    console.error('   解决方法（任选其一）:');
    console.error('   1. 指定代理地址:');
    console.error('      node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET> http://127.0.0.1:7890');
    console.error('   2. 设置环境变量:');
    console.error('      PowerShell: $env:HTTPS_PROXY = "http://127.0.0.1:7890"');
    console.error('      然后运行:   node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>');
    console.error('');
    console.error('   常见代理地址:');
    console.error('      Clash:  http://127.0.0.1:7890');
    console.error('      V2Ray:  http://127.0.0.1:10809  或  socks5://127.0.0.1:10808');
    console.error('      SS/SSR: http://127.0.0.1:1080   或  socks5://127.0.0.1:1080');
    console.error('');
    process.exit(1);
  }

  try {
    const agent = createProxyAgent(proxyUrl);

    // 设置为全局 HTTPS 代理（googleapis 底层的 Axios 会使用此 agent）
    https.globalAgent = agent;

    // 同时配置 googleapis
    google.options({
      httpsAgent: agent,
      proxy: false, // 禁用 Axios 自带的 proxy 逻辑，使用我们的 agent
    });

    console.log('✅ 代理配置成功\n');
  } catch (err) {
    console.error('❌ 代理配置失败:', err.message);
    console.error('   请确保已安装依赖: npm install');
    process.exit(1);
  }
}

// ===========================================
// 主流程
// ===========================================

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('用法: node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET> [代理地址]');
    console.error('示例: node scripts/google-auth.js xxx.apps.googleusercontent.com GOCSPX-xxx http://127.0.0.1:7890');
    process.exit(1);
  }

  // 初始化代理
  await initProxy();

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  const scopes = ['https://www.googleapis.com/auth/drive'];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // 强制重新授权，确保返回 refresh_token
  });

  console.log('🔗 请在浏览器中打开以下链接进行授权:\n');
  console.log(authUrl);
  console.log('\n⏳ 等待授权回调...\n');

  // 创建本地服务器接收 OAuth2 回调
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/oauth2callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授权失败</h1><p>' + error + '</p>');
        console.error('❌ 授权失败:', error);
        server.close();
        process.exit(1);
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>缺少授权码</h1>');
        return;
      }

      try {
        console.log('🔄 正在用授权码换取 token（通过代理）...');
        // 用授权码换取 token（此时已通过全局代理连接 Google）
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.refresh_token) {
          throw new Error('未返回 refresh_token！请撤销授权后重试:\n' +
            '  访问 https://myaccount.google.com/permissions 撤销应用授权\n' +
            '  然后重新运行此脚本');
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:50px">
            <h1>✅ 授权成功！</h1>
            <p>请回到终端查看 refresh_token</p>
            <p>可以关闭此页面</p>
          </body></html>
        `);

        console.log('═══════════════════════════════════════════════════');
        console.log('✅ 授权成功！请复制以下信息:\n');
        console.log('  GOOGLE_CLIENT_ID=' + CLIENT_ID);
        console.log('  GOOGLE_CLIENT_SECRET=' + CLIENT_SECRET);
        console.log('  GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('');
        console.log('将以上三个值设置到 Render.com 的环境变量中');
        console.log('═══════════════════════════════════════════════════\n');

        server.close();
        process.exit(0);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>获取 token 失败</h1><p>' + err.message + '</p>');
        console.error('❌ 获取 token 失败:', err.message);
        if (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED')) {
          console.error('   这通常是代理不可用导致的，请检查代理是否正常运行');
        }
        server.close();
        process.exit(1);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`📡 本地回调服务器运行在 http://localhost:${PORT}`);
    console.log('   授权后浏览器会自动跳转回来\n');
  });
}

main();
