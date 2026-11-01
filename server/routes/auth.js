import { Router } from 'express';
import { APP_PIN, AUTH_TOKEN } from '../middlewares/auth.js';
import { TURSO_URL } from '../db.js';

const router = Router();

// Xác thực mã PIN bảo mật
router.post('/auth/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập mã PIN' });
  }

  if (pin === APP_PIN) {
    return res.json({
      success: true,
      token: AUTH_TOKEN,
      message: 'Xác thực mã PIN thành công'
    });
  }

  return res.status(401).json({ success: false, error: 'Mã PIN không chính xác' });
});

// Kiểm tra trạng thái đăng nhập
router.get('/auth/check', (req, res) => {
  const token = req.headers['x-pin-token'] || 
                (req.headers.authorization && req.headers.authorization.replace('Bearer ', '')) ||
                req.query.token;
  const isUnlocked = (token === AUTH_TOKEN || token === APP_PIN);
  res.json({ requiresPin: true, isUnlocked });
});

// Health check endpoint (Kiểm tra trạng thái kết nối Cloud Database)
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: TURSO_URL ? 'TURSO_CLOUD' : 'LOCAL_SQLITE',
    databaseHost: TURSO_URL || 'local',
    uptime: process.uptime()
  });
});

export default router;
