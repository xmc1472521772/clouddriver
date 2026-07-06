/**
 * JWT 认证中间件
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme123';

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
 * 验证密码
 */
function verifyPassword(password) {
  return password === AUTH_PASSWORD;
}

module.exports = {
  requireAuth,
  generateToken,
  verifyPassword,
};
