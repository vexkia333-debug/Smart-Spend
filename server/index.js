import express from 'express';
import cors from 'cors';
import { db, initDatabase, seedInitialTransactions, TURSO_URL } from './db.js';
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
await initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Middleware xử lý riêng cho Webhook để chống lỗi "Bad control character in string literal in JSON" (HTTP 400)
// khi MacroDroid truyền thông báo có dấu xuống dòng thô (Techcombank, Viettel Money)
app.use('/api/webhook/bank-notification', express.text({ type: '*/*' }), (req, res, next) => {
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    if (!raw) return next();

    // 1. Thử parse JSON chuẩn
    try {
      req.body = JSON.parse(raw);
      return next();
    } catch (e1) {
      // 2. Tự động sửa lỗi ký tự xuống dòng thô (\r, \n) do MacroDroid chèn trực tiếp vào chuỗi JSON
      try {
        const sanitized = raw.replace(/[\r\n]+/g, ' ');
        req.body = JSON.parse(sanitized);
        return next();
      } catch (e2) {
        // 3. Nếu vẫn không parse được (ví dụ text thuần), tự bọc vào { content: raw }
        req.body = {
          content: raw,
          source: 'BANK_NOTIFICATION'
        };
        return next();
      }
    }
  }
  next();
});

app.use(express.json());

// Cấu hình mã PIN bảo vệ hệ thống
const APP_PIN = process.env.APP_PIN || '014205';
const AUTH_TOKEN = crypto.createHmac('sha256', APP_PIN).update('smartspend_vault_secret_salt').digest('hex');

// Endpoint xác thực mã PIN
app.post('/api/auth/verify-pin', (req, res) => {
  const { pin } = req.body || {};
  if (!pin) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập mã PIN' });
  }
  if (String(pin).trim() === APP_PIN) {
    return res.json({ success: true, token: AUTH_TOKEN, message: 'Xác thực thành công' });
  }
  return res.status(401).json({ success: false, error: 'Mã PIN không chính xác' });
});

app.get('/api/auth/check', (req, res) => {
  const token = req.headers['x-pin-token'] || 
                (req.headers.authorization && req.headers.authorization.replace('Bearer ', '')) ||
                req.query.token;
  const isUnlocked = (token === AUTH_TOKEN || token === APP_PIN);
  res.json({ requiresPin: true, isUnlocked });
});

// Middleware bảo vệ API bằng mã PIN
const requirePinAuth = (req, res, next) => {
  // Miễn trừ các route công khai: auth, health check, webhook nhận thông báo từ MacroDroid
  if (
    req.path.startsWith('/api/auth') ||
    req.path === '/api/health' ||
    req.path.startsWith('/api/webhook') ||
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
};

app.use(requirePinAuth);

// Health Check Endpoint (Kiểm tra trạng thái kết nối Cloud Database)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database: TURSO_URL ? 'TURSO_CLOUD' : 'LOCAL_SQLITE',
    databaseHost: TURSO_URL || 'local',
    uptime: process.uptime()
  });
});

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
app.get('/api/stats', async (req, res) => {
  try {
    const totalBalanceRow = await db.prepare('SELECT SUM(balance) as total FROM accounts').get();
    const pendingCountRow = await db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING'").get();

    // Loại trừ chuyển tiền nội bộ (Rút tiền vào Ví) khỏi tổng chi tiêu để không bị tính trùng
    const monthlyExpenseRow = await db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE type = 'EXPENSE' AND status != 'IGNORED' AND (category_id != 'cat_transfer_cash' OR category_id IS NULL)
    `).get();

    const monthlyIncomeRow = await db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE type = 'INCOME' AND status != 'IGNORED'
    `).get();

    // Khoản tiền đang cho vay (Loans given)
    const totalLoansRow = await db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE category_id = 'cat_loan' AND status != 'IGNORED'
    `).get();

    // Khoản tiền nợ đã thu hồi (Debt collected)
    const totalDebtCollectedRow = await db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE category_id = 'cat_debt_collect' AND status != 'IGNORED'
    `).get();

    // Thống kê chi tiêu theo từng danh mục
    const categoryStats = await db.prepare(`
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
app.get('/api/transactions', async (req, res) => {
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

    const transactions = await db.prepare(query).all(...params);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Phân loại giao dịch (Categorize Transaction)
app.patch('/api/transactions/:id/categorize', async (req, res) => {
  try {
    const { id } = req.params;
    let { category_id, description, partner_account_id } = req.body;

    const existingTx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existingTx) {
      return res.status(404).json({ error: 'Giao dịch không tồn tại' });
    }

    // Nếu chọn danh mục "Rút tiền vào Ví (ATM)" và trước đó chưa phải
    if (category_id === 'cat_transfer_cash' && existingTx.category_id !== 'cat_transfer_cash') {
      let cashAcc = await db.prepare("SELECT id FROM accounts WHERE id = 'acc_cash'").get();
      if (!cashAcc) {
        await db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
      }
      await db.prepare("UPDATE accounts SET balance = balance + ? WHERE id = 'acc_cash'").run(existingTx.amount);
      const updatedCash = await db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      broadcastEvent('ACCOUNT_UPDATED', updatedCash);

      if (!description || !description.trim()) {
        description = 'Rút tiền vào Ví Tiền Mặt';
      }
    }

    // Xử lý chuyển tiền nội bộ giữa các tài khoản nếu có partner_account_id
    if (partner_account_id && partner_account_id !== existingTx.account_id) {
      const partnerAcc = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(partner_account_id);
      const curAcc = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(existingTx.account_id);

      if (partnerAcc && curAcc) {
        const partnerTxId = 'tx_' + crypto.randomUUID().slice(0, 8);
        if (existingTx.type === 'INCOME') {
          // Tiền vào tài khoản này => Trừ tiền ở tài khoản chuyển đi
          await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(existingTx.amount, partner_account_id);
          const partnerDesc = `Chuyển tiền sang ${curAcc.name}`;
          await db.prepare(`
            INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
            VALUES (?, ?, 'cat_transfer_internal', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'INTERNAL_TRANSFER', ?, datetime('now', 'localtime'))
          `).run(
            partnerTxId,
            partner_account_id,
            existingTx.amount,
            partnerDesc,
            `Chuyển tiền nội bộ sang ${curAcc.name}`,
            partnerAcc.name,
            existingTx.transaction_time || new Date().toISOString()
          );
          if (!description || !description.trim()) {
            description = `Nhận tiền từ ${partnerAcc.name}`;
          }
        } else {
          // Tiền ra khỏi tài khoản này => Cộng tiền vào tài khoản nhận
          await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(existingTx.amount, partner_account_id);
          const partnerDesc = `Nhận tiền từ ${curAcc.name}`;
          await db.prepare(`
            INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
            VALUES (?, ?, 'cat_transfer_in', ?, 'INCOME', ?, ?, ?, 'CONFIRMED', 'INTERNAL_TRANSFER', ?, datetime('now', 'localtime'))
          `).run(
            partnerTxId,
            partner_account_id,
            existingTx.amount,
            partnerDesc,
            `Nhận tiền nội bộ từ ${curAcc.name}`,
            partnerAcc.name,
            existingTx.transaction_time || new Date().toISOString()
          );
          if (!description || !description.trim()) {
            description = `Chuyển tiền sang ${partnerAcc.name}`;
          }
        }

        const updatedPartnerAcc = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(partner_account_id);
        if (updatedPartnerAcc) {
          broadcastEvent('ACCOUNT_UPDATED', updatedPartnerAcc);
        }

        const partnerTx = await db.prepare(`
          SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          LEFT JOIN accounts a ON t.account_id = a.id
          WHERE t.id = ?
        `).get(partnerTxId);
        if (partnerTx) {
          broadcastEvent('TRANSACTION_CREATED', partnerTx);
        }
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
    
    await stmt.run(category_id, ...(description ? [description, id] : [id]));

    // Lấy thông tin giao dịch cập nhật
    const updatedTx = await db.prepare(`
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
app.patch('/api/transactions/:id/ignore', async (req, res) => {
  try {
    const { id } = req.params;
    await db.prepare(`
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
app.post('/api/reset-data', async (req, res) => {
  try {
    const { initialBalance = 0, accountName = 'Agribank Plus', bankCode = 'AGRI' } = req.body;

    await db.exec(`
      DELETE FROM transactions;
      DELETE FROM notification_logs;
      DELETE FROM accounts;
    `);

    await db.prepare(`
      INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
      VALUES ('acc_primary', ?, ?, '****8888', ?, 'VND', 'landmark', '#059669')
    `).run(accountName, bankCode, parseFloat(initialBalance) || 0);

    await db.prepare(`
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

// Endpoint Xóa / Đặt lại lịch sử giao dịch (Transaction History Reset)
app.post('/api/transactions/clear', async (req, res) => {
  try {
    const { resetBalances = false, restoreDemo = false } = req.body || {};

    await db.exec(`
      DELETE FROM notification_logs;
      DELETE FROM transactions;
    `);

    if (resetBalances) {
      await db.exec(`UPDATE accounts SET balance = 0;`);
    }

    if (restoreDemo) {
      seedInitialTransactions();
    }

    broadcastEvent('TRANSACTIONS_CLEARED', { restoreDemo, resetBalances });
    broadcastEvent('DATA_RESET', { message: 'Transactions cleared' });

    res.json({
      success: true,
      message: restoreDemo
        ? 'Đã đặt lại và khôi phục dữ liệu giao dịch mẫu thành công!'
        : 'Đã xóa toàn bộ lịch sử giao dịch thành công!'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint phân loại nhanh giao dịch mới nhất (Dành riêng cho Hộp thoại nổi MacroDroid / Notification Action Buttons)
app.post('/api/webhook/quick-categorize', async (req, res) => {
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

// 5. WEBHOOK NHẬN BIẾN ĐỘNG TỪ ĐIỆN THOẠI (MacroDroid / Tasker / Android Agent)
app.post('/api/webhook/bank-notification', async (req, res) => {
  try {
    console.log('[Webhook Incoming]', JSON.stringify(req.body));
    const rawContent = req.body.content || req.body.text || req.body.body || req.body.message || req.body.notification || req.body.not_text || '';
    const rawTitle = req.body.title || req.body.appName || req.body.app_name || req.body.not_title || '';
    const { timestamp, source = 'BANK_NOTIFICATION' } = req.body;

    const content = rawContent || rawTitle;

    if (!content) {
      console.warn('[Webhook Warning] Content is empty:', req.body);
      return res.status(400).json({ error: 'Nội dung thông báo (content) là bắt buộc' });
    }

    const effectiveTitle = rawTitle;

    // 1. Phân tích nội dung qua Parser
    const parsed = parseBankNotification(content, effectiveTitle);
    const txId = 'tx_' + crypto.randomUUID().slice(0, 8);

    // Ghi nhật ký webhook vào notification_logs
    try {
      await db.prepare(`
        INSERT INTO notification_logs (id, transaction_id, title, body, actions_payload, status)
        VALUES (?, ?, ?, ?, ?, 'SENT')
      `).run(
        'log_' + crypto.randomUUID().slice(0, 8),
        txId,
        effectiveTitle || parsed.bankName,
        content,
        JSON.stringify({ bankCode: parsed.bankCode, amount: parsed.amount, type: parsed.type, balance: parsed.balance })
      );
    } catch (e) {
      console.error('Lỗi ghi notification_logs:', e.message);
    }

    // 2. Tìm tài khoản tương ứng theo bankCode
    let account = await db.prepare('SELECT id FROM accounts WHERE bank_code = ?').get(parsed.bankCode);
    if (!account) {
      if (parsed.bankCode === 'AGRI') {
        await db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_primary', 'Agribank Plus', 'AGRI', '****8888', 0, 'VND', 'landmark', '#059669')
        `).run();
        account = { id: 'acc_primary' };
      } else if (parsed.bankCode === 'TCB') {
        await db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_tcb', 'Techcombank', 'TCB', 'Tài khoản Techcombank', 0, 'VND', 'credit-card', '#dc2626')
        `).run();
        account = { id: 'acc_tcb' };
      } else if (parsed.bankCode === 'VTM') {
        await db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_vtm', 'Viettel Money', 'VTM', 'Ví Viettel Money', 0, 'VND', 'smartphone', '#e11d48')
        `).run();
        account = { id: 'acc_vtm' };
      } else {
        account = await db.prepare('SELECT id FROM accounts LIMIT 1').get();
      }
    }

    const targetAccountId = account?.id || 'acc_primary';

    // Chuẩn bị thời gian giao dịch
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

    // 3. Tự động phát hiện & khớp lệnh chuyển tiền nội bộ (Smart Internal Transfer Pairing)
    const oppositeType = parsed.type === 'INCOME' ? 'EXPENSE' : 'INCOME';
    let isInternalTransfer = false;
    let categoryId = null;
    let status = 'PENDING';
    let suggested = null;

    // Tìm giao dịch đối ứng (cùng số tiền, đối lập loại Thu/Chi, thuộc tài khoản khác của bạn, trong vòng 15 phút gần đây)
    const partnerTx = await db.prepare(`
      SELECT t.*, a.name as account_name
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.amount = ?
        AND t.type = ?
        AND t.account_id != ?
        AND (t.category_id IS NULL OR t.category_id LIKE 'cat_transfer_%' OR t.status = 'PENDING')
        AND datetime(t.created_at) >= datetime('now', '-15 minutes')
      ORDER BY t.created_at DESC
      LIMIT 1
    `).get(parsed.amount, oppositeType, targetAccountId);

    if (partnerTx) {
      isInternalTransfer = true;
      categoryId = parsed.type === 'INCOME' ? 'cat_transfer_in' : 'cat_transfer_internal';
      status = 'CONFIRMED';

      const partnerAccName = partnerTx.account_name || 'Tài khoản phụ';
      parsed.description = parsed.type === 'EXPENSE'
        ? `Chuyển tiền sang ${partnerAccName}`
        : `Nhận tiền từ ${partnerAccName}`;

      // Tự động CONFIRMED giao dịch đối tác trước đó
      const partnerCatId = partnerTx.type === 'INCOME' ? 'cat_transfer_in' : 'cat_transfer_internal';
      const curAccName = account?.name || 'Tài khoản của bạn';
      const partnerDesc = partnerTx.type === 'EXPENSE'
        ? `Chuyển tiền sang ${curAccName}`
        : `Nhận tiền từ ${curAccName}`;

      await db.prepare(`
        UPDATE transactions
        SET category_id = ?, status = 'CONFIRMED', description = ?, confirmed_at = COALESCE(confirmed_at, datetime('now', 'localtime')), updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(partnerCatId, partnerDesc, partnerTx.id);

      const updatedPartner = await db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.id = ?
      `).get(partnerTx.id);

      if (updatedPartner) {
        broadcastEvent('TRANSACTION_UPDATED', updatedPartner);
      }
    } else {
      // Nếu chưa có giao dịch đối ứng, kiểm tra xem nội dung thông báo có từ khóa chuyển sang tài khoản khác của chính mình không
      const allOtherAccounts = await db.prepare('SELECT id, name, bank_code FROM accounts WHERE id != ?').all(targetAccountId);
      const descUpper = (parsed.description || '').toUpperCase();
      const rawUpper = (content || '').toUpperCase();
      const combinedUpper = `${descUpper} ${rawUpper}`;

      const mentionedAcc = allOtherAccounts.find(a => 
        combinedUpper.includes(a.bank_code) || 
        combinedUpper.includes(a.name.toUpperCase()) ||
        (a.bank_code === 'TCB' && combinedUpper.includes('TECHCOMBANK')) ||
        (a.bank_code === 'VTM' && (combinedUpper.includes('VIETTEL') || combinedUpper.includes('VTMONEY') || combinedUpper.includes('VIETTELPAY'))) ||
        (a.bank_code === 'AGRI' && combinedUpper.includes('AGRIBANK'))
      );

      // Kiểm tra chuyển khoản từ chính chủ (VU HA KIEN)
      const isOwnerTransfer = combinedUpper.includes('VU HA KIEN') || combinedUpper.includes('KIEN VU');

      if (mentionedAcc) {
        isInternalTransfer = true;
        categoryId = parsed.type === 'INCOME' ? 'cat_transfer_in' : 'cat_transfer_internal';
        suggested = { categoryId, isAutoApply: true, keyword: mentionedAcc.name };
        status = 'CONFIRMED';
        const curAccName = account?.name || 'Tài khoản chính';
        parsed.description = parsed.type === 'EXPENSE'
          ? `Chuyển tiền sang ${mentionedAcc.name}`
          : `Nhận tiền từ ${mentionedAcc.name}`;

        // Tự động tạo đối ứng cho mentionedAcc để cả 2 tài khoản đều cập nhật chuẩn số dư
        try {
          const partnerTxId = 'tx_' + crypto.randomUUID().slice(0, 8);
          if (parsed.type === 'INCOME') {
            await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, mentionedAcc.id);
            await db.prepare(`
              INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
              VALUES (?, ?, 'cat_transfer_internal', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'INTERNAL_TRANSFER', ?, datetime('now', 'localtime'))
            `).run(
              partnerTxId,
              mentionedAcc.id,
              parsed.amount,
              `Chuyển tiền sang ${curAccName}`,
              `Tự động trừ tiền khi chuyển nội bộ sang ${curAccName}`,
              mentionedAcc.name,
              txTime
            );
          } else {
            await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, mentionedAcc.id);
            await db.prepare(`
              INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
              VALUES (?, ?, 'cat_transfer_in', ?, 'INCOME', ?, ?, ?, 'CONFIRMED', 'INTERNAL_TRANSFER', ?, datetime('now', 'localtime'))
            `).run(
              partnerTxId,
              mentionedAcc.id,
              parsed.amount,
              `Nhận tiền từ ${curAccName}`,
              `Tự động cộng tiền khi chuyển nội bộ từ ${curAccName}`,
              mentionedAcc.name,
              txTime
            );
          }
          const updatedMentioned = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(mentionedAcc.id);
          if (updatedMentioned) broadcastEvent('ACCOUNT_UPDATED', updatedMentioned);
        } catch (e) {
          console.error('Lỗi tự động tạo paired transaction cho mentionedAcc:', e.message);
        }
      } else if (isOwnerTransfer && parsed.type === 'INCOME') {
        // Tên người chuyển là chính chủ VU HA KIEN nhưng trong remark không có tên ngân hàng nguồn
        // Tự động tìm tài khoản ngân hàng nguồn:
        // 1. Tìm trong 24h gần nhất xem có tài khoản nào vừa giao dịch cùng số tiền không
        const recentReverseTx = await db.prepare(`
          SELECT t.*, a.name as account_name, a.id as acc_id
          FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          WHERE t.amount = ?
            AND t.account_id != ?
            AND t.account_id != 'acc_cash'
            AND datetime(t.created_at) >= datetime('now', '-24 hours')
          ORDER BY t.created_at DESC
          LIMIT 1
        `).get(parsed.amount, targetAccountId);

        let inferredAcc = null;
        if (recentReverseTx) {
          inferredAcc = { id: recentReverseTx.acc_id, name: recentReverseTx.account_name };
        } else {
          const otherBankAccs = allOtherAccounts.filter(a => a.id !== 'acc_cash');
          if (otherBankAccs.length === 1) {
            inferredAcc = otherBankAccs[0];
          } else {
            inferredAcc = otherBankAccs.find(a => a.bank_code === 'TCB') || otherBankAccs[0];
          }
        }

        if (inferredAcc) {
          isInternalTransfer = true;
          categoryId = 'cat_transfer_in';
          suggested = { categoryId, isAutoApply: true, keyword: inferredAcc.name };
          status = 'CONFIRMED';
          parsed.description = `Nhận tiền từ ${inferredAcc.name} (VU HA KIEN)`;

          try {
            const partnerTxId = 'tx_' + crypto.randomUUID().slice(0, 8);
            const curAccName = account?.name || 'Tài khoản chính';
            await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, inferredAcc.id);
            await db.prepare(`
              INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
              VALUES (?, ?, 'cat_transfer_internal', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'INTERNAL_TRANSFER', ?, datetime('now', 'localtime'))
            `).run(
              partnerTxId,
              inferredAcc.id,
              parsed.amount,
              `Chuyển tiền sang ${curAccName}`,
              `Tự động nhận diện chuyển tiền nội bộ từ ${inferredAcc.name} (VU HA KIEN)`,
              inferredAcc.name,
              txTime
            );
            const updatedInferred = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(inferredAcc.id);
            if (updatedInferred) broadcastEvent('ACCOUNT_UPDATED', updatedInferred);
          } catch (e) {
            console.error('Lỗi tự động tạo paired transaction cho inferredAcc:', e.message);
          }
        } else {
          categoryId = 'cat_transfer_in';
          suggested = { categoryId, isAutoApply: false, keyword: 'Chuyển tiền nội bộ' };
        }
      } else {
        // Kiểm tra Auto Rules thông thường
        const rules = await db.prepare('SELECT * FROM auto_rules').all();
        suggested = matchSuggestedCategory(parsed.description, rules);
        if (suggested && suggested.isAutoApply) {
          categoryId = suggested.categoryId;
          status = 'CONFIRMED';
        }
      }
    }

    // 4. Lưu giao dịch vào DB
    await db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      targetAccountId,
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
    if (parsed.balance !== null && parsed.balance !== undefined && !isNaN(parsed.balance)) {
      await db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(parsed.balance, targetAccountId);
    } else if (parsed.type === 'EXPENSE') {
      await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, targetAccountId);
    } else {
      await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, targetAccountId);
    }

    const updatedAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(targetAccountId);
    if (updatedAccount) {
      broadcastEvent('ACCOUNT_UPDATED', updatedAccount);
    }

    const newTx = await db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(txId);

    // 6. Gửi realtime prompt tới tất cả client (Web + Điện thoại)
    let quickCategories = [];
    if (status === 'PENDING') {
      quickCategories = await db.prepare(`
        SELECT id, name, icon, color FROM categories 
        WHERE type = ? AND is_quick_action = 1 
        ORDER BY sort_order ASC LIMIT 4
      `).all(parsed.type);

      broadcastEvent('NEW_TRANSACTION_PROMPT', {
        transaction: newTx,
        suggestedCategoryId: suggested?.categoryId || null,
        quickActions: quickCategories
      });
    } else {
      broadcastEvent('TRANSACTION_CREATED', newTx);
    }

    res.json({
      success: true,
      transactionId: txId,
      isInternalTransfer,
      parsed,
      status,
      quickActions: quickCategories,
      message: isInternalTransfer
        ? '⚡ Đã tự động khớp lệnh chuyển tiền giữa các tài khoản của bạn'
        : (status === 'PENDING' ? 'Giao dịch đã được lưu và đang chờ bạn phân loại' : 'Đã tự động phân loại')
    });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API Xem nhật ký Webhook (Hỗ trợ chẩn đoán từ xa)
app.get('/api/webhook/logs', async (req, res) => {
  try {
    const logs = await db.prepare('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 20').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. API Giả lập thông báo ngân hàng (Dành cho việc test nhanh trên Web)
app.post('/api/simulate/notification', async (req, res) => {
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

// 7. Danh mục (Categories)
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
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

// 8. Tài khoản (Accounts)
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await db.prepare('SELECT * FROM accounts ORDER BY balance DESC').all();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Điều chỉnh số dư / Kiểm kê Ví (Reconciliation)
app.post('/api/accounts/:id/adjust-balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { actualBalance, reason = 'Kiểm kê số dư' } = req.body;
    const targetBalance = parseFloat(actualBalance);
    if (isNaN(targetBalance) || targetBalance < 0) {
      return res.status(400).json({ error: 'Số tiền thực tế không hợp lệ' });
    }

    let account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) {
      if (id === 'acc_cash') {
        await db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
        account = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
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

    await db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(targetBalance, id);

    let createdTx = null;
    if (Math.abs(diff) >= 1) {
      const txId = 'tx_' + crypto.randomUUID().slice(0, 8);
      const type = diff > 0 ? 'INCOME' : 'EXPENSE';
      const catId = diff > 0 ? 'cat_other_income' : 'cat_other_expense';
      const formattedDiff = new Intl.NumberFormat('vi-VN').format(Math.abs(diff)) + ' ₫';
      const desc = diff > 0 
        ? `${reason} (Dôi dư +${formattedDiff})`
        : `${reason} (Hụt tiền -${formattedDiff})`;

      await db.prepare(`
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

      createdTx = await db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.id = ?
      `).get(txId);

      broadcastEvent('TRANSACTION_CREATED', createdTx);
    }

    const updatedAccount = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
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
app.get('/api/rules', async (req, res) => {
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

app.post('/api/rules', async (req, res) => {
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

// 10. Cài đặt hệ thống & API Key
app.get('/api/settings', async (req, res) => {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const hasKey = Boolean(row && row.value);
    const maskedKey = hasKey ? row.value.slice(0, 6) + '...' + row.value.slice(-4) : '';
    res.json({ hasGeminiKey: hasKey, maskedKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/gemini-key', async (req, res) => {
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

// 11. Phân tích chi tiêu thông minh bằng Gemini Flash
app.post('/api/ai/parse-transaction', async (req, res) => {
  try {
    const { text, autoSave = true, forceCash = false } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung chi tiêu' });
    }
    const keyRow = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const apiKey = keyRow?.value || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Chưa cấu hình API Key. Vui lòng bấm vào nút thiết lập API Key của Google AI Studio (miễn phí).' });
    }

    const categories = await db.prepare('SELECT id, name, type FROM categories').all();
    const parsed = await parseTransactionWithGemini(text, categories, apiKey, { forceCash });

    // Tự động tạo danh mục mới nếu AI phát hiện chi tiêu thuộc lĩnh vực mới
    let createdCategory = null;
    let targetCatId = parsed.categoryId;

    if (parsed.isNewCategory && parsed.newCategory?.name) {
      const catName = parsed.newCategory.name.trim();
      const existingCat = await db.prepare('SELECT * FROM categories WHERE LOWER(name) = LOWER(?)').get(catName);
      if (existingCat) {
        targetCatId = existingCat.id;
      } else {
        const newCatId = 'cat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        const catIcon = parsed.newCategory.icon || 'Tag';
        const catColor = parsed.newCategory.color || '#ec4899';

        await db.prepare(`
          INSERT INTO categories (id, name, type, icon, color, is_quick_action, sort_order)
          VALUES (?, ?, ?, ?, ?, 1, 99)
        `).run(newCatId, catName, parsed.type, catIcon, catColor);

        targetCatId = newCatId;
        createdCategory = {
          id: newCatId,
          name: catName,
          type: parsed.type,
          icon: catIcon,
          color: catColor,
          is_quick_action: 1,
          sort_order: 99
        };

        broadcastEvent('CATEGORY_CREATED', createdCategory);
      }
    }

    if (!targetCatId) {
      targetCatId = parsed.type === 'INCOME' ? 'cat_other_income' : 'cat_other_expense';
    }
    parsed.categoryId = targetCatId;

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
      let bankAcc = await db.prepare("SELECT * FROM accounts WHERE id != 'acc_cash' LIMIT 1").get();
      if (!bankAcc) {
        await db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_primary', 'Agribank Plus', 'AGRI', '****8888', 0, 'VND', 'landmark', '#059669')").run();
        bankAcc = await db.prepare("SELECT * FROM accounts WHERE id = 'acc_primary'").get();
      }

      let cashAcc = await db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      if (!cashAcc) {
        await db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
        cashAcc = await db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      }

      // TRƯỜNG HỢP 1: Chuyển tiền nội bộ giữa các tài khoản ngân hàng / ví
      if (parsed.wallet === 'INTERNAL_TRANSFER' || parsed.categoryId === 'cat_transfer_internal') {
        const allAccs = await db.prepare('SELECT * FROM accounts').all();
        let srcAcc = allAccs.find(a => parsed.sourceBank && (a.name.toLowerCase().includes(parsed.sourceBank.toLowerCase()) || a.bank_code.toLowerCase() === parsed.sourceBank.toLowerCase())) || bankAcc;
        let dstAcc = allAccs.find(a => parsed.targetBank && (a.name.toLowerCase().includes(parsed.targetBank.toLowerCase()) || a.bank_code.toLowerCase() === parsed.targetBank.toLowerCase()) && a.id !== srcAcc.id);
        
        if (!dstAcc) {
          dstAcc = allAccs.find(a => a.id !== srcAcc.id && a.id !== 'acc_cash') || allAccs.find(a => a.id !== srcAcc.id) || cashAcc;
        }

        // Trừ tài khoản nguồn
        await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, srcAcc.id);
        // Cộng tài khoản đích
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, dstAcc.id);

        const txIdOut = txId;
        const txIdIn = 'tx_' + crypto.randomUUID().slice(0, 8);

        // Giao dịch 1: Chuyển đi
        await db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, 'cat_transfer_internal', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
        `).run(txIdOut, srcAcc.id, parsed.amount, `Chuyển tiền sang ${dstAcc.name}`, text, srcAcc.name, txTime, txTime);

        // Giao dịch 2: Nhận vào
        await db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, 'cat_transfer_in', ?, 'INCOME', ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
        `).run(txIdIn, dstAcc.id, parsed.amount, `Nhận tiền từ ${srcAcc.name}`, text, dstAcc.name, txTime, txTime);

        broadcastEvent('ACCOUNT_UPDATED', await db.prepare('SELECT * FROM accounts WHERE id = ?').get(srcAcc.id));
        broadcastEvent('ACCOUNT_UPDATED', await db.prepare('SELECT * FROM accounts WHERE id = ?').get(dstAcc.id));
        broadcastEvent('TRANSACTION_CREATED', await db.prepare(`
          SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id WHERE t.id = ?
        `).get(txIdOut));
        broadcastEvent('TRANSACTION_CREATED', await db.prepare(`
          SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id WHERE t.id = ?
        `).get(txIdIn));

        return res.json({
          success: true,
          message: `⚡ Đã chuyển thành công ${new Intl.NumberFormat('vi-VN').format(parsed.amount)} ₫ từ ${srcAcc.name} sang ${dstAcc.name}`,
          parsed
        });
      }

      // TRƯỜNG HỢP 2: Rút tiền mặt (Bank -> Cash)
      if (parsed.wallet === 'TRANSFER_TO_CASH' || parsed.categoryId === 'cat_transfer_cash') {
        const sourceAcc = bankAcc;
        // Trừ tài khoản ngân hàng
        await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, sourceAcc.id);
        // Cộng vào ví tiền mặt
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, cashAcc.id);

        await db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, 'cat_transfer_cash', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
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

        broadcastEvent('ACCOUNT_UPDATED', await db.prepare('SELECT * FROM accounts WHERE id = ?').get(sourceAcc.id));
        broadcastEvent('ACCOUNT_UPDATED', await db.prepare('SELECT * FROM accounts WHERE id = ?').get(cashAcc.id));
      } else {
        // TRƯỜNG HỢP 2: Chi tiêu hoặc Thu nhập thông thường
        let targetAcc = (parsed.wallet === 'CASH') ? cashAcc : bankAcc;
        if (parsed.bankName && parsed.wallet !== 'CASH') {
          const matchedAcc = await db.prepare("SELECT * FROM accounts WHERE LOWER(name) LIKE ? OR LOWER(bank_code) = ?").get(`%${parsed.bankName.toLowerCase()}%`, parsed.bankName.toLowerCase());
          if (matchedAcc) targetAcc = matchedAcc;
        }

        await db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
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
          await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, targetAcc.id);
        } else {
          await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, targetAcc.id);
        }

        broadcastEvent('ACCOUNT_UPDATED', await db.prepare('SELECT * FROM accounts WHERE id = ?').get(targetAcc.id));
      }

      const createdTx = await db.prepare(`
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
        createdCategory,
        transaction: createdTx,
        message: createdCategory
          ? `✨ Đã tự động tạo danh mục mới "${createdCategory.name}" và ghi nhận thành công!`
          : `Đã phân loại: ${createdTx.category_name} (${parsed.reasoning})`
      });
    }

    res.json({ success: true, parsed, createdCategory });
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
