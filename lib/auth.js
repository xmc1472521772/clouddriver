/**
 * JWT 认证中间件
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

if (!JWT_SECRET) {
  console.error('❌ 必须设置 JWT_SECRET 环境变量！');
  process.exit(1);
}
if (!AUTH_PASSWORD) {
  console.error('❌ 必须设置 AUTH_PASSWORD 环境变量！');
  process.exit(1);
}

/**
 * 验证 JWT Token 中间件
 */
function requireAuth(req, res, next) {
  // 优先从 Authorization 请求头获取 token
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7); // 去掉 "Bearer "
  } else if (req.query && req.query.token) {
    // 也支持从 URL query 参数获取 token（用于 <a> 标签下载场景）
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/**
 * 生成 JWT Token
 */
function generateToken() {
  return jwt.sign(
    { user: 'admin', role: 'owner' },
    JWT_SECRET,
    { expiresIn: '7d' } // 7 天有效期
  );
}

/**
 * 验证密码（使用恒定时间比较，防止时序攻击）
 */
function verifyPassword(password) {
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(AUTH_PASSWORD));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  requireAuth,
  generateToken,
  verifyPassword,
};
