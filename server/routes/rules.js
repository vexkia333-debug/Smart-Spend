import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// Lấy danh sách quy tắc tự động (Auto Rules)
router.get('/', async (req, res) => {
  try {
    const rules = await db.prepare(`
      SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM auto_rules r
      JOIN categories c ON r.category_id = c.id
      ORDER BY r.created_at DESC
    `).all();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Thêm quy tắc mới
router.post('/', async (req, res) => {
  try {
    const { keyword, category_id, is_auto_apply = 0 } = req.body;
    if (!keyword || !category_id) {
      return res.status(400).json({ error: 'Keyword và category_id là bắt buộc' });
    }
    const ruleId = 'rule_' + Date.now();
    await db.prepare('INSERT INTO auto_rules (id, keyword, category_id, is_auto_apply) VALUES (?, ?, ?, ?)').run(
      ruleId,
      keyword.toUpperCase().trim(),
      category_id,
      is_auto_apply ? 1 : 0
    );
    res.json({ success: true, ruleId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bật/tắt tự động áp dụng quy tắc
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await db.prepare('SELECT * FROM auto_rules WHERE id = ?').get(id);
    if (!rule) return res.status(404).json({ error: 'Quy tắc không tồn tại' });
    const nextVal = rule.is_auto_apply ? 0 : 1;
    await db.prepare('UPDATE auto_rules SET is_auto_apply = ? WHERE id = ?').run(nextVal, id);
    res.json({ success: true, is_auto_apply: nextVal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa quy tắc
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.prepare('DELETE FROM auto_rules WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

