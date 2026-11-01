import crypto from 'node:crypto';

export const APP_PIN = process.env.APP_PIN || '014205';
export const AUTH_TOKEN = crypto.createHmac('sha256', APP_PIN).update('smartspend_vault_secret_salt').digest('hex');

/**
 * Middleware bảo vệ API bằng mã PIN
 */
export function requirePinAuth(req, res, next) {
  // Miễn trừ các route công khai: auth, health check, webhook nhận thông báo từ MacroDroid, notification báo cáo ngày, web push
  if (
    req.path.startsWith('/api/auth') ||
    req.path === '/api/health' ||
    req.path.startsWith('/api/webhook') ||
    req.path.startsWith('/api/ai/daily-report/notification') ||
    req.path.startsWith('/api/notifications') ||
    !req.path.startsWith('/api')
  ) {
    return next();
  }

  const token = req.headers['x-pin-token'] || 
                (req.headers.authorization && req.headers.authorization.replace('Bearer ', '')) ||
                req.query.token;

  if (token === AUTH_TOKEN || token === APP_PIN) {
    return next();
  }

  return res.status(401).json({ error: 'Yêu cầu mã PIN bảo mật để truy cập dữ liệu' });
}

