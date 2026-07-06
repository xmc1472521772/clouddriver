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
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const token = authHeader.substring(7); // 去掉 "Bearer "

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
