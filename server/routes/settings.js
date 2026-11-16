import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// Lấy trạng thái cài đặt & API Key & mục tiêu tháng
router.get('/', async (req, res) => {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const goalRow = await db.prepare("SELECT value FROM settings WHERE key = 'monthly_budget_goal'").get();
    const hasKey = Boolean(row && row.value);
    const maskedKey = hasKey ? row.value.slice(0, 6) + '...' + row.value.slice(-4) : '';
    const parsedGoal = Number(goalRow?.value);
    const monthlyBudgetGoal = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : 5000000;
    res.json({ hasGeminiKey: hasKey, maskedKey, monthlyBudgetGoal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cập nhật mục tiêu / hạn mức chi tiêu tháng
router.post('/budget-goal', async (req, res) => {
  try {
    const raw = req.body?.monthlyBudgetGoal ?? req.body?.goal;
    const parsedGoal = Number(raw);
    if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
      return res.status(400).json({ error: 'Mục tiêu chi tiêu tháng phải là số dương hợp lệ.' });
    }
    const cleanGoal = Math.round(parsedGoal);
    await db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('monthly_budget_goal', ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(cleanGoal));
    res.json({ success: true, monthlyBudgetGoal: cleanGoal, message: 'Đã lưu mục tiêu chi tiêu tháng!' });
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

