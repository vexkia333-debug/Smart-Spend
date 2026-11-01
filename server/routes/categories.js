import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// Lấy danh sách danh mục (Categories)
router.get('/', async (req, res) => {
  try {
    const categories = await db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Thêm danh mục mới
router.post('/', async (req, res) => {
  try {
    const { name, type = 'EXPENSE', icon = 'Tag', color = '#10b981', is_quick_action = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const id = 'cat_' + Date.now();
    await db.prepare(`
      INSERT INTO categories (id, name, type, icon, color, is_quick_action, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 99)
    `).run(id, name, type, icon, color, is_quick_action ? 1 : 0);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Xóa danh mục
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ?').run(id);
    await db.prepare('DELETE FROM auto_rules WHERE category_id = ?').run(id);
    await db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
