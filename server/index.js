import express from 'express';
import cors from 'cors';
import { db, initDatabase } from './db.js';
import { parseBankNotification, matchSuggestedCategory } from './parser.js';
import { parseTransactionWithGemini } from './gemini.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Khởi tạo Database
initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Lưu trữ các kết nối Server-Sent Events (SSE) để đẩy realtime lên Web
const sseClients = new Set();

function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// SSE Endpoint cho Web Dashboard
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 1. Thống kê tổng quan (Stats)
app.get('/api/stats', (req, res) => {
  try {
    const totalBalanceRow = db.prepare('SELECT SUM(balance) as total FROM accounts').get();
    const pendingCountRow = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING'").get();

    // Loại trừ chuyển tiền nội bộ (Rút tiền vào Ví) khỏi tổng chi tiêu để không bị tính trùng
    const monthlyExpenseRow = db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE type = 'EXPENSE' AND status != 'IGNORED' AND (category_id != 'cat_transfer_cash' OR category_id IS NULL)
    `).get();

    const monthlyIncomeRow = db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE type = 'INCOME' AND status != 'IGNORED'
    `).get();

    // Khoản tiền đang cho vay (Loans given)
    const totalLoansRow = db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE category_id = 'cat_loan' AND status != 'IGNORED'
    `).get();

    // Khoản tiền nợ đã thu hồi (Debt collected)
    const totalDebtCollectedRow = db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE category_id = 'cat_debt_collect' AND status != 'IGNORED'
    `).get();

    // Thống kê chi tiêu theo từng danh mục
    const categoryStats = db.prepare(`
      SELECT 
        c.id, c.name, c.color, c.icon,
        COALESCE(SUM(t.amount), 0) as total_amount,
        COUNT(t.id) as tx_count
      FROM categories c
      LEFT JOIN transactions t ON c.id = t.category_id AND t.type = 'EXPENSE' AND t.status = 'CONFIRMED'
      WHERE c.type = 'EXPENSE'
      GROUP BY c.id
      ORDER BY total_amount DESC
    `).all();

    res.json({
      totalBalance: totalBalanceRow?.total || 0,
      totalExpense: monthlyExpenseRow?.total || 0,
      totalIncome: monthlyIncomeRow?.total || 0,
      pendingCount: pendingCountRow?.count || 0,
      totalLoans: totalLoansRow?.total || 0,
      totalDebtCollected: totalDebtCollectedRow?.total || 0,
      categories: categoryStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Danh sách giao dịch (Transactions)
app.get('/api/transactions', (req, res) => {
  try {
    const { status, type, search } = req.query;
    let query = `
      SELECT 
        t.*,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color,
        a.name as account_name,
        a.bank_code,
        a.color as account_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'ALL') {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (type && type !== 'ALL') {
      query += ' AND t.type = ?';
      params.push(type);
    }
    if (search) {
      query += ' AND (t.description LIKE ? OR t.raw_content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY t.created_at DESC LIMIT 100';

    const transactions = db.prepare(query).all(...params);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Phân loại giao dịch (Categorize Transaction)
app.patch('/api/transactions/:id/categorize', (req, res) => {
  try {
    const { id } = req.params;
    let { category_id, description } = req.body;

    const existingTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existingTx) {
      return res.status(404).json({ error: 'Giao dịch không tồn tại' });
    }

    // Nếu chọn danh mục "Rút tiền vào Ví (ATM)" và trước đó chưa phải
    if (category_id === 'cat_transfer_cash' && existingTx.category_id !== 'cat_transfer_cash') {
      let cashAcc = db.prepare("SELECT id FROM accounts WHERE id = 'acc_cash'").get();
      if (!cashAcc) {
        db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
      }
      db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = 'acc_cash'").run(existingTx.amount);
      const updatedCash = db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      broadcastEvent('ACCOUNT_UPDATED', updatedCash);

      if (!description || !description.trim()) {
        description = 'Rút tiền vào Ví Tiền Mặt';
      }
    }

    const stmt = description
      ? db.prepare(`
          UPDATE transactions 
          SET category_id = ?, description = ?, status = 'CONFIRMED', confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `)
      : db.prepare(`
          UPDATE transactions 
          SET category_id = ?, status = 'CONFIRMED', confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `);
    
    stmt.run(category_id, ...(description ? [description, id] : [id]));

    // Lấy thông tin giao dịch cập nhật
    const updatedTx = db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(id);

    broadcastEvent('TRANSACTION_UPDATED', updatedTx);

    res.json({ success: true, transaction: updatedTx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Bỏ qua giao dịch (Ignore)
app.patch('/api/transactions/:id/ignore', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`
      UPDATE transactions 
      SET status = 'IGNORED', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(id);

    broadcastEvent('TRANSACTION_IGNORED', { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint Xóa toàn bộ dữ liệu mẫu, thiết lập tài khoản thật
app.post('/api/reset-data', (req, res) => {
  try {
    const { initialBalance = 0, accountName = 'Agribank Plus', bankCode = 'AGRI' } = req.body;

    db.exec(`
      DELETE FROM transactions;
      DELETE FROM notification_logs;
      DELETE FROM accounts;
    `);

    db.prepare(`
      INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
      VALUES ('acc_primary', ?, ?, '****8888', ?, 'VND', 'landmark', '#059669')
    `).run(accountName, bankCode, parseFloat(initialBalance) || 0);

    db.prepare(`
      INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
      VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')
    `).run();

    broadcastEvent('DATA_RESET', { message: 'Database reset' });

    res.json({
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu mẫu và khởi tạo ví tài khoản của bạn!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint phân loại nhanh giao dịch mới nhất (Dành riêng cho Hộp thoại nổi MacroDroid / Notification Action Buttons)
app.post('/api/webhook/quick-categorize', (req, res) => {
  try {
    const { category_id, category_name } = req.body;
    
    // Tìm giao dịch PENDING gần nhất
    const pendingTx = db.prepare(`
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
      const cat = db.prepare(`
        SELECT id FROM categories 
        WHERE LOWER(name) LIKE LOWER(?) 
        LIMIT 1
      `).get(`%${category_name}%`);
      if (cat) targetCatId = cat.id;
    }

    if (!targetCatId) {
      targetCatId = 'cat_food';
    }

    db.prepare(`
      UPDATE transactions 
      SET category_id = ?, status = 'CONFIRMED', confirmed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(targetCatId, pendingTx.id);

    const updatedTx = db.prepare(`
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

// 5. WEBHOOK NHẬN BIẾN ĐỘNG TỪ ĐIỆN THOẠI (MacroDroid / Tasker / Android Agent)
app.post('/api/webhook/bank-notification', (req, res) => {
  try {
    const { content, title = '', timestamp, source = 'BANK_NOTIFICATION', appName = '', app_name = '' } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Nội dung thông báo (content) là bắt buộc' });
    }

    const effectiveTitle = title || appName || app_name || '';

    // 1. Phân tích nội dung qua Parser
    const parsed = parseBankNotification(content, effectiveTitle);
    const txId = 'tx_' + crypto.randomUUID().slice(0, 8);

    // 2. Tìm tài khoản tương ứng theo bankCode
    let account = db.prepare('SELECT id FROM accounts WHERE bank_code = ?').get(parsed.bankCode);
    if (!account) {
      if (parsed.bankCode === 'AGRI') {
        db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_agri', 'Agribank Plus', 'AGRI', '****8888', 0, 'VND', 'landmark', '#059669')
        `).run();
        account = { id: 'acc_agri' };
      } else {
        account = db.prepare('SELECT id FROM accounts LIMIT 1').get();
      }
    }

    // 3. Tìm quy tắc tự động
    const rules = db.prepare('SELECT * FROM auto_rules').all();
    const suggested = matchSuggestedCategory(parsed.description, rules);

    let categoryId = null;
    let status = 'PENDING';

    if (suggested && suggested.isAutoApply) {
      categoryId = suggested.categoryId;
      status = 'CONFIRMED';
    }

    const now = new Date();
    const curDay = String(now.getDate()).padStart(2, '0');
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curYear = String(now.getFullYear());
    const curHour = String(now.getHours()).padStart(2, '0');
    const curMin = String(now.getMinutes()).padStart(2, '0');

    let txTime = timestamp;
    if (txTime && typeof txTime === 'string') {
      txTime = txTime
        .replace(/\{day_of_month\}|\[day_of_month\]/gi, curDay)
        .replace(/\{day\}|\[day\]/gi, curDay)
        .replace(/\{month\}|\[month\]/gi, curMonth)
        .replace(/\{year\}|\[year\]/gi, curYear)
        .replace(/\{hour\}|\[hour\]/gi, curHour)
        .replace(/\{minute\}|\[minute\]/gi, curMin)
        .replace(/tháng\s+/gi, '')
        .trim();

      if (txTime.includes('{') || txTime.includes('[')) {
        txTime = `${curHour}:${curMin} ${curDay}/${curMonth}/${curYear}`;
      }
    } else {
      txTime = `${curHour}:${curMin} ${curDay}/${curMonth}/${curYear}`;
    }

    // 4. Lưu giao dịch vào DB
    db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      account?.id || 'acc_vcb',
      categoryId,
      parsed.amount,
      parsed.type,
      parsed.description,
      parsed.rawContent,
      parsed.bankName,
      status,
      source,
      txTime,
      status === 'CONFIRMED' ? txTime : null
    );

    // 5. Cập nhật số dư tài khoản
    const targetAccountId = account?.id || 'acc_primary';
    if (parsed.balance !== null && parsed.balance !== undefined && !isNaN(parsed.balance)) {
      db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(parsed.balance, targetAccountId);
    } else if (parsed.type === 'EXPENSE') {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, targetAccountId);
    } else {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, targetAccountId);
    }

    const newTx = db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(txId);

    // 6. Danh sách nút bấm nhanh cho thông báo tương tác (Quick Actions)
    const quickCategories = db.prepare(`
      SELECT id, name, icon, color FROM categories 
      WHERE type = ? AND is_quick_action = 1 
      ORDER BY sort_order ASC LIMIT 4
    `).all(parsed.type);

    // Gửi realtime prompt tới tất cả client (Web + Điện thoại)
    broadcastEvent('NEW_TRANSACTION_PROMPT', {
      transaction: newTx,
      suggestedCategoryId: suggested?.categoryId || null,
      quickActions: quickCategories
    });

    res.json({
      success: true,
      transactionId: txId,
      parsed,
      status,
      quickActions: quickCategories,
      message: status === 'PENDING' ? 'Giao dịch đã được lưu và đang chờ bạn phân loại' : 'Đã tự động phân loại'
    });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. API Giả lập thông báo ngân hàng (Dành cho việc test nhanh trên Web)
app.post('/api/simulate/notification', (req, res) => {
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

  // Gọi trực tiếp logic webhook
  const parsed = parseBankNotification(simulatedRaw);
  const txId = 'tx_' + crypto.randomUUID().slice(0, 8);
  const account = db.prepare('SELECT id FROM accounts WHERE bank_code = ?').get(bank) || db.prepare('SELECT id FROM accounts LIMIT 1').get();

  const rules = db.prepare('SELECT * FROM auto_rules').all();
  const suggested = matchSuggestedCategory(desc, rules);

  const txTime = now.toISOString().replace('T', ' ').slice(0, 19);

  db.prepare(`
    INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'PENDING', 'BANK_NOTIFICATION', ?)
  `).run(
    txId,
    account?.id || 'acc_vcb',
    parsed.amount,
    parsed.type,
    parsed.description,
    simulatedRaw,
    parsed.bankName,
    txTime
  );

  const newTx = db.prepare(`
    SELECT t.*, a.name as account_name, a.bank_code
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.id = ?
  `).get(txId);

  const quickCategories = db.prepare(`
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

// 7. Danh mục (Categories)
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { name, type = 'EXPENSE', icon = 'Tag', color = '#10b981', is_quick_action = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const id = 'cat_' + Date.now();
    db.prepare(`
      INSERT INTO categories (id, name, type, icon, color, is_quick_action, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 99)
    `).run(id, name, type, icon, color, is_quick_action ? 1 : 0);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Tài khoản (Accounts)
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY balance DESC').all();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Điều chỉnh số dư / Kiểm kê Ví (Reconciliation)
app.post('/api/accounts/:id/adjust-balance', (req, res) => {
  try {
    const { id } = req.params;
    const { actualBalance, reason = 'Kiểm kê số dư' } = req.body;
    const targetBalance = parseFloat(actualBalance);
    if (isNaN(targetBalance) || targetBalance < 0) {
      return res.status(400).json({ error: 'Số tiền thực tế không hợp lệ' });
    }

    let account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) {
      if (id === 'acc_cash') {
        db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
        account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
      } else {
        return res.status(404).json({ error: 'Tài khoản không tồn tại' });
      }
    }

    const diff = targetBalance - account.balance;
    const now = new Date();
    const curDay = String(now.getDate()).padStart(2, '0');
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curYear = String(now.getFullYear());
    const curHour = String(now.getHours()).padStart(2, '0');
    const curMin = String(now.getMinutes()).padStart(2, '0');
    const txTime = `${curHour}:${curMin} ${curDay}/${curMonth}/${curYear}`;

    db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(targetBalance, id);

    let createdTx = null;
    if (Math.abs(diff) >= 1) {
      const txId = 'tx_' + crypto.randomUUID().slice(0, 8);
      const type = diff > 0 ? 'INCOME' : 'EXPENSE';
      const catId = diff > 0 ? 'cat_other_income' : 'cat_other_expense';
      const formattedDiff = new Intl.NumberFormat('vi-VN').format(Math.abs(diff)) + ' ₫';
      const desc = diff > 0 
        ? `${reason} (Dôi dư +${formattedDiff})`
        : `${reason} (Hụt tiền -${formattedDiff})`;

      db.prepare(`
        INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
      `).run(
        txId,
        id,
        catId,
        Math.abs(diff),
        type,
        desc,
        `Kiểm kê số dư: ${new Intl.NumberFormat('vi-VN').format(account.balance)} -> ${new Intl.NumberFormat('vi-VN').format(targetBalance)} ₫`,
        account.name,
        txTime,
        txTime
      );

      createdTx = db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.id = ?
      `).get(txId);

      broadcastEvent('TRANSACTION_CREATED', createdTx);
    }

    const updatedAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    broadcastEvent('ACCOUNT_UPDATED', updatedAccount);

    res.json({
      success: true,
      account: updatedAccount,
      difference: diff,
      transaction: createdTx,
      message: `Đã cập nhật số dư ${updatedAccount.name} thành ${new Intl.NumberFormat('vi-VN').format(targetBalance)} ₫`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Quy tắc tự động (Auto Rules)
app.get('/api/rules', (req, res) => {
  try {
    const rules = db.prepare(`
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

app.post('/api/rules', (req, res) => {
  try {
    const { keyword, category_id, is_auto_apply = 0 } = req.body;
    if (!keyword || !category_id) {
      return res.status(400).json({ error: 'Keyword và category_id là bắt buộc' });
    }
    const ruleId = 'rule_' + Date.now();
    db.prepare('INSERT INTO auto_rules (id, keyword, category_id, is_auto_apply) VALUES (?, ?, ?, ?)').run(
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

// 10. Cài đặt hệ thống & API Key
app.get('/api/settings', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const hasKey = Boolean(row && row.value);
    const maskedKey = hasKey ? row.value.slice(0, 6) + '...' + row.value.slice(-4) : '';
    res.json({ hasGeminiKey: hasKey, maskedKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/gemini-key', (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim()) {
      db.prepare("DELETE FROM settings WHERE key = 'gemini_api_key'").run();
      return res.json({ success: true, hasGeminiKey: false, message: 'Đã xóa API Key' });
    }
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES ('gemini_api_key', ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(apiKey.trim());
    res.json({ success: true, hasGeminiKey: true, message: 'Đã lưu Google AI Studio API Key thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Phân tích chi tiêu thông minh bằng Gemini Flash
app.post('/api/ai/parse-transaction', async (req, res) => {
  try {
    const { text, autoSave = true, forceCash = false } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung chi tiêu' });
    }
    const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const apiKey = keyRow?.value || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Chưa cấu hình API Key. Vui lòng bấm vào nút thiết lập API Key của Google AI Studio (miễn phí).' });
    }

    const categories = db.prepare('SELECT id, name, type FROM categories').all();
    const parsed = await parseTransactionWithGemini(text, categories, apiKey, { forceCash });

    if (autoSave) {
      const txId = 'tx_' + crypto.randomUUID().slice(0, 8);
      const now = new Date();
      const curDay = String(now.getDate()).padStart(2, '0');
      const curMonth = String(now.getMonth() + 1).padStart(2, '0');
      const curYear = String(now.getFullYear());
      const curHour = String(now.getHours()).padStart(2, '0');
      const curMin = String(now.getMinutes()).padStart(2, '0');
      const txTime = `${curHour}:${curMin} ${curDay}/${curMonth}/${curYear}`;

      // Đảm bảo có cả tài khoản ngân hàng và ví tiền mặt
      let bankAcc = db.prepare("SELECT * FROM accounts WHERE id != 'acc_cash' LIMIT 1").get();
      if (!bankAcc) {
        db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_primary', 'Agribank Plus', 'AGRI', '****8888', 0, 'VND', 'landmark', '#059669')").run();
        bankAcc = db.prepare("SELECT * FROM accounts WHERE id = 'acc_primary'").get();
      }

      let cashAcc = db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      if (!cashAcc) {
        db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
        cashAcc = db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      }

      // TRƯỜNG HỢP 1: Rút tiền mặt (Bank -> Cash)
      if (parsed.wallet === 'TRANSFER_TO_CASH' || parsed.categoryId === 'cat_transfer_cash') {
        const sourceAcc = bankAcc;
        // Trừ tài khoản ngân hàng
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, sourceAcc.id);
        // Cộng vào ví tiền mặt
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, cashAcc.id);

        db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, 'cat_transfer_cash', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'GEMINI_AI', ?, ?)
        `).run(
          txId,
          sourceAcc.id,
          parsed.amount,
          parsed.description || 'Rút tiền mặt vào Ví',
          text,
          sourceAcc.name,
          txTime,
          txTime
        );

        broadcastEvent('ACCOUNT_UPDATED', db.prepare('SELECT * FROM accounts WHERE id = ?').get(sourceAcc.id));
        broadcastEvent('ACCOUNT_UPDATED', db.prepare('SELECT * FROM accounts WHERE id = ?').get(cashAcc.id));
      } else {
        // TRƯỜNG HỢP 2: Chi tiêu hoặc Thu nhập thông thường
        const targetAcc = (parsed.wallet === 'CASH') ? cashAcc : bankAcc;

        db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'GEMINI_AI', ?, ?)
        `).run(
          txId,
          targetAcc.id,
          parsed.categoryId,
          parsed.amount,
          parsed.type,
          parsed.description,
          text,
          parsed.bankName || targetAcc.name,
          txTime,
          txTime
        );

        if (parsed.type === 'EXPENSE') {
          db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, targetAcc.id);
        } else {
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, targetAcc.id);
        }

        broadcastEvent('ACCOUNT_UPDATED', db.prepare('SELECT * FROM accounts WHERE id = ?').get(targetAcc.id));
      }

      const createdTx = db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.id = ?
      `).get(txId);

      broadcastEvent('TRANSACTION_CREATED', createdTx);

      return res.json({
        success: true,
        parsed,
        transaction: createdTx,
        message: `Đã phân loại: ${createdTx.category_name} (${parsed.reasoning})`
      });
    }

    res.json({ success: true, parsed });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Phục vụ giao diện web tĩnh từ thư mục dist (dành cho môi trường Production như Render)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
