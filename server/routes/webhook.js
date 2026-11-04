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

// Lấy lịch sử xử lý hệ thống chi tiết (System Automation & Notification Audit Logs)
router.get('/system/audit-logs', async (req, res) => {
  try {
    const notificationLogs = await db.prepare(`
      SELECT 
        nl.id as log_id,
        nl.transaction_id,
        nl.title as log_title,
        nl.body as raw_content,
        nl.actions_payload,
        nl.status as log_status,
        nl.user_action,
        nl.created_at as logged_at,
        t.description as tx_desc,
        t.amount as tx_amount,
        t.type as tx_type,
        t.category_id as tx_cat_id,
        t.account_id as tx_account_id,
        t.status as tx_status,
        t.source as tx_source,
        t.transaction_time as tx_time,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        a.name as account_name,
        a.bank_code as account_bank_code
      FROM notification_logs nl
      LEFT JOIN transactions t ON nl.transaction_id = t.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      ORDER BY nl.created_at DESC
      LIMIT 100
    `).all();

    const unloggedTxs = await db.prepare(`
      SELECT 
        t.id as tx_id,
        t.description as tx_desc,
        t.raw_content,
        t.amount as tx_amount,
        t.type as tx_type,
        t.category_id as tx_cat_id,
        t.account_id as tx_account_id,
        t.status as tx_status,
        t.source as tx_source,
        t.transaction_time as tx_time,
        t.created_at as logged_at,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        a.name as account_name,
        a.bank_code as account_bank_code
      FROM transactions t
      LEFT JOIN notification_logs nl ON t.id = nl.transaction_id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE nl.id IS NULL
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all();

    const normalizedLogs = [];
    const seenTxIds = new Set();

    for (const nl of notificationLogs) {
      let payload = {};
      try {
        if (nl.actions_payload) payload = JSON.parse(nl.actions_payload);
      } catch (e) {}

      let actionType = payload.action_type || 'NOTIFICATION';
      let actionTitle = nl.log_title || 'Thông báo hệ thống';
      let actionDetail = payload.action_detail || payload.detail || '';
      let isInternalTransfer = Boolean(payload.is_internal_transfer);

      if (nl.log_title && (nl.log_title.includes('Báo cáo') || nl.log_title.includes('Tổng kết'))) {
        actionType = 'AI_BRIEFING';
        if (!actionDetail) actionDetail = 'AI Gemini tự động rà soát dòng tiền và phát thông báo ứng dụng';
      } else if (nl.tx_cat_id === 'cat_transfer_internal' || nl.tx_cat_id === 'cat_transfer_in' || isInternalTransfer) {
        actionType = 'INTERNAL_TRANSFER';
        isInternalTransfer = true;
        if (!actionDetail) {
          actionDetail = nl.tx_type === 'EXPENSE'
            ? `Tự động nhận diện Chuyển tiền nội bộ sang ${nl.account_name || 'tài khoản khác'} (không tính vào chi tiêu)`
            : `Tự động nhận diện Nhận tiền chuyển khoản nội bộ từ tài khoản phụ (không tính vào thu nhập)`;
        }
      } else if (nl.tx_cat_id === 'cat_debt_collect' || (nl.tx_desc && /trả nợ|tra no|hoàn nợ/i.test(nl.tx_desc))) {
        actionType = 'DEBT_COLLECT';
        if (!actionDetail) actionDetail = 'Tự động nhận diện Tiền hoàn trả / Thu hồi nợ và đối soát cấn trừ công nợ';
      } else if (nl.tx_cat_id === 'cat_loan' || (nl.tx_desc && /cho vay|cho mượn|vay nợ|trả hộ/i.test(nl.tx_desc))) {
        actionType = 'LOAN_RECORD';
        if (!actionDetail) actionDetail = 'Tự động ghi nhận Khoản cho vay / Trả hộ vào Sổ theo dõi công nợ độc lập';
      } else if (nl.log_status === 'DISMISSED' || payload.reason || actionType === 'IGNORED' || actionType === 'DUPLICATE') {
        actionType = 'IGNORED';
        if (!actionDetail) actionDetail = 'Hệ thống tự động lược bỏ (Quảng cáo / Tiếp thị / Không biến động số dư)';
      } else if (nl.tx_status === 'CONFIRMED' && nl.tx_cat_id) {
        actionType = 'AUTO_CLASSIFIED';
        if (!actionDetail) actionDetail = `Tự động phân loại vào danh mục "${nl.category_name || 'Hợp lệ'}"`;
      } else {
        actionType = 'PENDING_REVIEW';
        if (!actionDetail) actionDetail = 'Đang lưu vào danh sách Cần bổ sung để người dùng xác nhận';
      }

      if (nl.transaction_id) seenTxIds.add(nl.transaction_id);

      normalizedLogs.push({
        id: nl.log_id,
        transaction_id: nl.transaction_id,
        title: actionTitle,
        raw_content: nl.raw_content,
        action_type: actionType,
        action_detail: actionDetail,
        status: nl.tx_status || nl.log_status,
        amount: nl.tx_amount || payload.amount || null,
        type: nl.tx_type || payload.type || null,
        category_name: nl.category_name,
        category_color: nl.category_color,
        category_icon: nl.category_icon,
        account_name: nl.account_name,
        created_at: nl.logged_at
      });
    }

    for (const tx of unloggedTxs) {
      if (seenTxIds.has(tx.tx_id)) continue;

      let actionType = 'AUTO_CLASSIFIED';
      let actionTitle = tx.tx_desc || 'Giao dịch';
      let actionDetail = '';

      if (tx.tx_cat_id === 'cat_transfer_internal' || tx.tx_cat_id === 'cat_transfer_in') {
        actionType = 'INTERNAL_TRANSFER';
        actionDetail = 'Tự động nhận diện chuyển tiền nội bộ giữa các tài khoản (loại khỏi chi tiêu)';
      } else if (tx.tx_cat_id === 'cat_debt_collect') {
        actionType = 'DEBT_COLLECT';
        actionDetail = 'Tự động nhận diện tiền hoàn nợ, đối soát triệt tiêu công nợ';
      } else if (tx.tx_cat_id === 'cat_loan') {
        actionType = 'LOAN_RECORD';
        actionDetail = 'Ghi nhận khoản cho vay / mượn vào Sổ theo dõi công nợ';
      } else if (tx.tx_status === 'IGNORED') {
        actionType = 'IGNORED';
        actionDetail = 'Giao dịch đã được đánh dấu lược bỏ';
      } else if (tx.tx_source === 'BANK_NOTIFICATION') {
        actionType = 'AUTO_CLASSIFIED';
        actionDetail = `Nhận từ thông báo ngân hàng và xếp vào "${tx.category_name || 'Danh mục'}"`;
      } else {
        actionType = 'AUTO_CLASSIFIED';
        actionDetail = `Nhập qua trợ lý AI và xếp vào "${tx.category_name || 'Danh mục'}"`;
      }

      normalizedLogs.push({
        id: 'audit_' + tx.tx_id,
        transaction_id: tx.tx_id,
        title: actionTitle,
        raw_content: tx.raw_content || tx.tx_desc,
        action_type: actionType,
        action_detail: actionDetail,
        status: tx.tx_status,
        amount: tx.tx_amount,
        type: tx.tx_type,
        category_name: tx.category_name,
        category_color: tx.category_color,
        category_icon: tx.category_icon,
        account_name: tx.account_name,
        created_at: tx.logged_at
      });
    }

    normalizedLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const stats = {
      total: normalizedLogs.length,
      internalTransfers: normalizedLogs.filter(l => l.action_type === 'INTERNAL_TRANSFER').length,
      debtLoans: normalizedLogs.filter(l => l.action_type === 'DEBT_COLLECT' || l.action_type === 'LOAN_RECORD').length,
      ignored: normalizedLogs.filter(l => l.action_type === 'IGNORED').length,
      autoClassified: normalizedLogs.filter(l => l.action_type === 'AUTO_CLASSIFIED').length
    };

    res.json({ logs: normalizedLogs, stats });
  } catch (err) {
    console.error('Lỗi lấy audit logs:', err);
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

