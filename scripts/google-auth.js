/**
 * Google OAuth2 本地授权脚本
 *
 * 运行此脚本获取 refresh_token，然后将 refresh_token 设置到 Render.com 环境变量中。
 *
 * 使用方法:
 *   1. 在 Google Cloud Console 创建 OAuth2 凭据:
 *      - APIs & Services → Credentials → Create Credentials → OAuth client ID
 *      - Application type: Web application
 *      - Authorized redirect URIs: http://localhost:3001/oauth2callback
 *   2. 运行此脚本:
 *      node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>
 *   3. 在浏览器中授权
 *   4. 复制输出的 REFRESH_TOKEN 到 Render.com 环境变量
 */

const http = require('http');
const { google } = require('googleapis');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const REDIRECT_URI = 'http://localhost:3001/oauth2callback';
const PORT = 3001;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('用法: node scripts/google-auth.js <CLIENT_ID> <CLIENT_SECRET>');
  console.error('请先在 Google Cloud Console 创建 OAuth2 凭据');
  process.exit(1);
}

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

console.log('\n🔗 请在浏览器中打开以下链接进行授权:\n');
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
      // 用授权码换取 token
      const { tokens } = await oauth2Client.getToken(code);

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
