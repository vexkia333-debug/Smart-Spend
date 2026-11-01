import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { parseBankNotification, matchSuggestedCategory } from '../parser.js';
import { broadcastEvent } from '../services/sse.js';
import { processIncomingWebhook } from '../services/webhookService.js';

const router = Router();

// Phân loại nhanh giao dịch PENDING gần nhất (Cho popup MacroDroid / Action Buttons)
router.post('/webhook/quick-categorize', async (req, res) => {
  try {
    const { category_id, category_name } = req.body;
    
    // Tìm giao dịch PENDING gần nhất
    const pendingTx = await db.prepare(`
      SELECT * FROM transactions 
      WHERE status = 'PENDING' 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get();

    if (!pendingTx) {
      return res.status(404).json({ error: 'Không có giao dịch nào đang chờ phân loại' });
    }

    let targetCatId = category_id;
    if (!targetCatId && category_name) {
      const cat = await db.prepare(`
        SELECT id FROM categories 
        WHERE LOWER(name) LIKE LOWER(?) 
        LIMIT 1
      `).get(`%${category_name}%`);
      if (cat) targetCatId = cat.id;
    }

    if (!targetCatId) {
      targetCatId = 'cat_food';
    }

    await db.prepare(`
      UPDATE transactions 
      SET category_id = ?, status = 'CONFIRMED', confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(targetCatId, pendingTx.id);

    const updatedTx = await db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `).get(pendingTx.id);

    broadcastEvent('TRANSACTION_UPDATED', updatedTx);

    res.json({
      success: true,
      transaction: updatedTx,
      message: `Đã cập nhật: ${updatedTx.category_name}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nhận biến động ngân hàng từ MacroDroid / Tasker
router.post([
  '/webhook/bank-notification',
  '/webhook/bank-notification/',
  '/webhook',
  '/webhook/'
], async (req, res) => {
  try {
    console.log('[Webhook Incoming]', JSON.stringify(req.body));
    const result = await processIncomingWebhook(req.body);
    res.json(result);
  } catch (err) {
    console.error('Lỗi xử lý webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

// Xem nhật ký webhook
router.get('/webhook/logs', async (req, res) => {
  try {
    const logs = await db.prepare('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 20').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Giả lập thông báo ngân hàng (Test trên Web)
router.post('/simulate/notification', async (req, res) => {
  const { bank = 'VCB', type = 'EXPENSE', amount = 85000, desc = 'QR TT Phuc Long Coffee Landmark 81' } = req.body;

  let simulatedRaw = '';
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN');

  if (bank === 'VCB') {
    simulatedRaw = `VCB: ${type === 'EXPENSE' ? '-' : '+'}${amount.toLocaleString('vi-VN')} VND luc ${dateStr}. SD: 18,365,000 VND. ND: ${desc}`;
  } else if (bank === 'TCB') {
    simulatedRaw = `Techcombank: TK 1903... ${type === 'EXPENSE' ? '-' : '+'}${amount.toLocaleString('vi-VN')}VND vao ${dateStr}. ND: ${desc}`;
  } else if (bank === 'MB') {
    simulatedRaw = `MBBank: GD ${type === 'EXPENSE' ? '-' : '+'}${amount.toLocaleString('vi-VN')}VND luc ${dateStr}. ND: ${desc}`;
  } else {
    simulatedRaw = `MoMo: Ban da ${type === 'EXPENSE' ? 'thanh toan' : 'nhan'} ${amount.toLocaleString('vi-VN')}d cho ${desc}`;
  }

  // Phân tích qua Parser & lưu giao dịch giả lập
  const parsed = parseBankNotification(simulatedRaw);
  const txId = 'tx_' + crypto.randomUUID().slice(0, 8);
  const account = (await db.prepare('SELECT id FROM accounts WHERE bank_code = ?').get(bank)) || (await db.prepare('SELECT id FROM accounts LIMIT 1').get());

  const rules = await db.prepare('SELECT * FROM auto_rules').all();
  const suggested = matchSuggestedCategory(desc, rules);

  const txTime = now.toISOString().replace('T', ' ').slice(0, 19);

  await db.prepare(`
    INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'PENDING', 'BANK_NOTIFICATION', ?)
  `).run(
    txId,
    account?.id || 'acc_primary',
    parsed.amount,
    parsed.type,
    parsed.description,
    simulatedRaw,
    parsed.bankName,
    txTime
  );

  const newTx = await db.prepare(`
    SELECT t.*, a.name as account_name, a.bank_code
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(txId);

  const quickCategories = await db.prepare(`
    SELECT id, name, icon, color FROM categories 
    WHERE type = ? AND is_quick_action = 1 
    ORDER BY sort_order ASC LIMIT 4
  `).all(parsed.type);

  broadcastEvent('NEW_TRANSACTION_PROMPT', {
    transaction: newTx,
    suggestedCategoryId: suggested?.categoryId || null,
    quickActions: quickCategories
  });

  res.json({
    success: true,
    transaction: newTx,
    quickActions: quickCategories
  });
});

export default router;

