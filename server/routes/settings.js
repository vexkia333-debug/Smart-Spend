import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// Lấy trạng thái cài đặt & API Key
router.get('/', async (req, res) => {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const hasKey = Boolean(row && row.value);
    const maskedKey = hasKey ? row.value.slice(0, 6) + '...' + row.value.slice(-4) : '';
    res.json({ hasGeminiKey: hasKey, maskedKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lưu Google Gemini API Key
router.post(['/gemini-key', '/api-key'], async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim()) {
      await db.prepare("DELETE FROM settings WHERE key = 'gemini_api_key'").run();
      return res.json({ success: true, hasGeminiKey: false, message: 'Đã xóa API Key' });
    }
    await db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES ('gemini_api_key', ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(apiKey.trim());
    res.json({ success: true, hasGeminiKey: true, message: 'Đã lưu Google AI Studio API Key thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

