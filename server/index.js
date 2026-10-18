import express from 'express';
import cors from 'cors';
import { db, initDatabase, seedInitialTransactions, TURSO_URL } from './db.js';
import { parseBankNotification, matchSuggestedCategory, extractTransferInfo } from './parser.js';
import { parseTransactionWithGemini, generateDailyAiReport, generateFallbackDailyReport } from './gemini.js';
import { formatDailyReportNotification, dispatchDailyReportNotification, initWebPush, sendWebPushNotificationToAll } from './notifications.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Khởi tạo Database & Web Push
await initDatabase();
await initWebPush();

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

/**
 * Trả về đối tượng Date và các thành phần thời gian chuẩn xác theo múi giờ Việt Nam (UTC+7, Asia/Ho_Chi_Minh)
 * Khắc phục hoàn toàn lỗi sai lệch 7 tiếng khi máy chủ deploy trên môi trường Cloud / Render (UTC GMT+0)
 */
export function getVietnamTimeParts(inputDate = new Date()) {
  const d = (inputDate instanceof Date) ? inputDate : new Date(inputDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  
  const vnStr = validDate.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  // vnStr format en-GB: "DD/MM/YYYY, HH:mm:ss"
  const [datePart, timePart] = vnStr.split(', ');
  const [day, month, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  return {
    day,
    month,
    year,
    hour,
    minute,
    second,
    dateStr: `${day}/${month}/${year}`,
    timeStr: `${hour}:${minute}`,
    fullStr: `${hour}:${minute} ${day}/${month}/${year}`,
    isoDate: `${year}-${month}-${day}`
  };
}

/**
 * Định dạng thời gian giao dịch chuẩn Việt Nam, hỗ trợ nhận diện ngày/giờ do người dùng gõ
 */
export function formatVietnamTxTime({ clientTime, customDate, customTime } = {}) {
  const vnNow = getVietnamTimeParts(clientTime || new Date());
  
  let d = vnNow.day;
  let m = vnNow.month;
  let y = vnNow.year;
  let hh = vnNow.hour;
  let mm = vnNow.minute;

  if (customDate && typeof customDate === 'string') {
    if (customDate.includes('-')) {
      const parts = customDate.split('-');
      if (parts.length === 3) {
        y = parts[0];
        m = parts[1].padStart(2, '0');
        d = parts[2].padStart(2, '0');
      }
    } else if (customDate.includes('/')) {
      const parts = customDate.split('/');
      if (parts.length === 3) {
        d = parts[0].padStart(2, '0');
        m = parts[1].padStart(2, '0');
        y = parts[2];
      }
    }
  }

  if (customTime && typeof customTime === 'string') {
    const parts = customTime.split(':');
    if (parts.length >= 2) {
      hh = parts[0].padStart(2, '0');
      mm = parts[1].padStart(2, '0');
    }
  }

  return `${hh}:${mm} ${d}/${m}/${y}`;
}

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

    // Bảo vệ loại danh mục: Không để giao dịch INCOME nhận danh mục EXPENSE (ví dụ cat_loan, cat_other_expense)
    if (existingTx.type === 'INCOME' && category_id) {
      const selectedCat = await db.prepare('SELECT type FROM categories WHERE id = ?').get(category_id);
      if (selectedCat && selectedCat.type === 'EXPENSE') {
        if (category_id === 'cat_loan') category_id = 'cat_debt_collect';
        else if (category_id === 'cat_other_expense') category_id = 'cat_debt_collect';
        else category_id = 'cat_debt_collect';
      }
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

// 3.1. Tách một giao dịch thành nhiều khoản (Split Transaction)
app.post('/api/transactions/:id/split', async (req, res) => {
  try {
    const { id } = req.params;
    const { splits } = req.body;

    if (!splits || !Array.isArray(splits) || splits.length < 2) {
      return res.status(400).json({ error: 'Cần ít nhất 2 phần để tách giao dịch' });
    }

    const tx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) {
      return res.status(404).json({ error: 'Giao dịch không tồn tại' });
    }

    // Phần đầu tiên cập nhật trực tiếp vào giao dịch hiện tại
    const first = splits[0];
    await db.prepare(`
      UPDATE transactions 
      SET amount = ?, category_id = ?, description = ?, status = 'CONFIRMED', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(first.amount, first.categoryId || first.category_id || tx.category_id, first.description || tx.description, id);

    const updatedFirst = await db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(id);
    broadcastEvent('TRANSACTION_UPDATED', updatedFirst);

    const createdSplits = [];
    // Các phần tiếp theo tạo giao dịch mới
    for (let i = 1; i < splits.length; i++) {
      const s = splits[i];
      const newTxId = 'tx_' + crypto.randomUUID().slice(0, 8);
      await db.prepare(`
        INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?, ?, datetime('now', 'localtime'))
      `).run(
        newTxId,
        tx.account_id,
        s.categoryId || s.category_id || 'cat_loan',
        s.amount,
        tx.type,
        s.description || 'Khoản tách',
        tx.raw_content,
        tx.bank_name,
        tx.transaction_time,
        tx.confirmed_at || tx.transaction_time,
        tx.created_at
      );

      const createdTx = await db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
        FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.id = ?
      `).get(newTxId);
      broadcastEvent('TRANSACTION_CREATED', createdTx);
      createdSplits.push(createdTx);
    }

    res.json({ success: true, updated: updatedFirst, created: createdSplits });
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

// 4.1. Chỉnh sửa thông tin giao dịch (Edit Transaction)
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, category_id, account_id, type, transaction_time } = req.body;

    const oldTx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!oldTx) {
      return res.status(404).json({ error: 'Giao dịch không tồn tại' });
    }

    const newAmount = amount !== undefined ? Math.abs(parseFloat(amount)) : oldTx.amount;
    const newType = type || oldTx.type;
    const newAccountId = account_id || oldTx.account_id;
    let newCatId = category_id !== undefined ? category_id : oldTx.category_id;
    const newDesc = description !== undefined ? description : oldTx.description;
    const newTime = transaction_time || oldTx.transaction_time;

    // Bảo vệ loại danh mục đúng chuẩn Thu/Chi
    if (newType === 'INCOME' && (newCatId === 'cat_loan' || newCatId === 'cat_other_expense')) {
      newCatId = 'cat_debt_collect';
    }

    // Hoàn trả số dư cũ cho tài khoản cũ (nếu giao dịch đã xác nhận/ảnh hưởng số dư)
    if (oldTx.status !== 'IGNORED') {
      if (oldTx.type === 'EXPENSE') {
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(oldTx.amount, oldTx.account_id);
      } else {
        await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(oldTx.amount, oldTx.account_id);
      }

      // Áp dụng số dư mới cho tài khoản mới
      if (newType === 'EXPENSE') {
        await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(newAmount, newAccountId);
      } else {
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(newAmount, newAccountId);
      }
    }

    const targetAccount = await db.prepare('SELECT name FROM accounts WHERE id = ?').get(newAccountId);
    const newBankName = targetAccount?.name || oldTx.bank_name;

    await db.prepare(`
      UPDATE transactions
      SET amount = ?, description = ?, category_id = ?, account_id = ?, bank_name = ?, type = ?, transaction_time = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newAmount, newDesc, newCatId, newAccountId, newBankName, newType, newTime, id);

    const updatedTx = await db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(id);

    broadcastEvent('TRANSACTION_UPDATED', updatedTx);
    const updatedAcc1 = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(oldTx.account_id);
    const updatedAcc2 = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(newAccountId);
    if (updatedAcc1) broadcastEvent('ACCOUNT_UPDATED', updatedAcc1);
    if (updatedAcc2 && newAccountId !== oldTx.account_id) broadcastEvent('ACCOUNT_UPDATED', updatedAcc2);

    res.json({ success: true, transaction: updatedTx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4.2. Xóa giao dịch (Delete Transaction)
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const oldTx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!oldTx) {
      return res.status(404).json({ error: 'Giao dịch không tồn tại' });
    }

    // Hoàn trả số dư nếu giao dịch không phải IGNORED
    if (oldTx.status !== 'IGNORED') {
      if (oldTx.type === 'EXPENSE') {
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(oldTx.amount, oldTx.account_id);
      } else {
        await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(oldTx.amount, oldTx.account_id);
      }
    }

    await db.prepare('DELETE FROM transactions WHERE id = ?').run(id);

    broadcastEvent('TRANSACTION_DELETED', { id });
    const updatedAcc = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(oldTx.account_id);
    if (updatedAcc) broadcastEvent('ACCOUNT_UPDATED', updatedAcc);

    res.json({ success: true, message: 'Đã xóa giao dịch thành công' });
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
    const rawTitle = req.body.title || req.body.not_title || '';
    const rawAppName = req.body.appName || req.body.app_name || req.body.package || req.body.pkg_name || req.body.not_app_name || '';
    const { timestamp, source = 'BANK_NOTIFICATION' } = req.body;

    const content = rawContent || rawTitle;

    if (!content) {
      console.warn('[Webhook Warning] Content is empty:', req.body);
      return res.status(400).json({ error: 'Nội dung thông báo (content) là bắt buộc' });
    }

    const effectiveTitle = rawTitle;

    // 1. Phân tích nội dung qua Parser
    const parsed = parseBankNotification(content, effectiveTitle, rawAppName);

    if (!parsed || parsed.isIgnored) {
      console.log('[Webhook Ignored]', parsed ? parsed.reason : 'null');
      return res.json({
        success: true,
        ignored: true,
        reason: parsed ? parsed.reason : 'UNRECOGNIZED_NOTIFICATION'
      });
    }

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
    let account = await db.prepare('SELECT id, name, account_number FROM accounts WHERE bank_code = ?').get(parsed.bankCode);
    if (!account) {
      if (parsed.bankCode === 'AGRI') {
        await db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_primary', 'Agribank Plus', 'AGRI', '7901205294347', 0, 'VND', 'landmark', '#059669')
        `).run();
        account = { id: 'acc_primary', name: 'Agribank Plus', account_number: '7901205294347' };
      } else if (parsed.bankCode === 'TCB') {
        await db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_tcb', 'Techcombank', 'TCB', '1912200512', 0, 'VND', 'credit-card', '#dc2626')
        `).run();
        account = { id: 'acc_tcb', name: 'Techcombank', account_number: '1912200512' };
      } else if (parsed.bankCode === 'VTM') {
        await db.prepare(`
          INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
          VALUES ('acc_vtm', 'Viettel Money', 'VTM', 'Ví Viettel Money', 0, 'VND', 'smartphone', '#e11d48')
        `).run();
        account = { id: 'acc_vtm', name: 'Viettel Money', account_number: 'Ví Viettel Money' };
      } else {
        if (/viettel|vtmoney|viettelpay/i.test(content)) {
          account = await db.prepare("SELECT id, name, account_number FROM accounts WHERE bank_code = 'VTM'").get();
        }
        if (!account) {
          account = await db.prepare("SELECT id, name, account_number FROM accounts WHERE id != 'acc_cash' ORDER BY id ASC LIMIT 1").get();
        }
      }
    }

    const targetAccountId = account?.id || 'acc_primary';

    // 2.1. Chống spam & khử trùng lặp webhook (Anti-Spam / Idempotency Guard trong 90 giây)
    const recentDuplicate = await db.prepare(`
      SELECT id, description, transaction_time 
      FROM transactions 
      WHERE account_id = ? 
        AND amount = ? 
        AND type = ? 
        AND (raw_content = ? OR (datetime(created_at) >= datetime('now', '-90 seconds') AND description = ?))
        AND datetime(created_at) >= datetime('now', '-90 seconds')
      LIMIT 1
    `).get(targetAccountId, parsed.amount, parsed.type, parsed.rawContent, parsed.description);

    if (recentDuplicate) {
      console.log(`[Webhook Anti-Spam] Bỏ qua webhook trùng lặp với giao dịch ${recentDuplicate.id}`);
      return res.json({
        success: true,
        duplicate: true,
        transactionId: recentDuplicate.id,
        message: 'Giao dịch đã được ghi nhận trước đó, bỏ qua để tránh trùng lặp'
      });
    }

    // Chuẩn bị thời gian giao dịch chuẩn theo múi giờ Việt Nam
    const vnTime = getVietnamTimeParts();
    const curDay = vnTime.day;
    const curMonth = vnTime.month;
    const curYear = vnTime.year;
    const curHour = vnTime.hour;
    const curMin = vnTime.minute;

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
        txTime = vnTime.fullStr;
      }
    } else {
      txTime = vnTime.fullStr;
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
      // Nếu chưa có giao dịch đối ứng, phân tích sâu người gửi và người nhận
      const transferInfo = extractTransferInfo(content, parsed.description);
      const allOtherAccounts = await db.prepare('SELECT id, name, bank_code, account_number FROM accounts WHERE id != ?').all(targetAccountId);
      const descUpper = (parsed.description || '').toUpperCase();
      const rawUpper = (content || '').toUpperCase();
      const combinedUpper = `${descUpper} ${rawUpper}`;

      const isOwnerSender = transferInfo.isSenderOwner;
      const isExplicitThirdParty = Boolean(transferInfo.senderName && !transferInfo.isSenderOwner);

      // Cú pháp chuyển liên ngân hàng (ví dụ Agribank / Napas: 140421-TCB;19028817209389;VU HA KIEN chuyen tien)
      const interbankMatch = content.match(/(?:[0-9]+-)?([A-Z]+);([0-9]{6,20});/i);
      const interbankDestStk = interbankMatch ? interbankMatch[2] : null;

      let isPotentialInternal = false;
      let mentionedAcc = null;

      if (parsed.type === 'EXPENSE') {
        // Khi chi tiền ra:
        if (interbankDestStk) {
          // Có số tài khoản đích: Chỉ coi là nội bộ nếu số tài khoản thụ hưởng trùng với STK tài khoản của bạn trong hệ thống!
          mentionedAcc = allOtherAccounts.find(a => a.account_number && a.account_number.length > 5 && a.account_number === interbankDestStk);
          if (mentionedAcc) {
            isPotentialInternal = true;
          }
        } else {
          // Không có STK đích: Chỉ coi là nội bộ nếu có từ khóa rõ ràng ("nội bộ", "sang tcb của tôi", "vào ví", "tự chuyển")
          const hasExplicitSelfTransfer = /nội bộ|noi bo|sang tai khoan|cua toi|chuyen sang vi|tu chuyen/i.test(combinedUpper);
          if (hasExplicitSelfTransfer) {
            mentionedAcc = allOtherAccounts.find(a => 
              combinedUpper.includes(a.name.toUpperCase()) ||
              (a.bank_code === 'TCB' && combinedUpper.includes('TECHCOMBANK')) ||
              (a.bank_code === 'VTM' && (combinedUpper.includes('VIETTEL') || combinedUpper.includes('VTMONEY') || combinedUpper.includes('VIETTELPAY'))) ||
              (a.bank_code === 'AGRI' && combinedUpper.includes('AGRIBANK'))
            );
            if (mentionedAcc) {
              isPotentialInternal = true;
            }
          }
        }
      } else if (parsed.type === 'INCOME') {
        // Khi tiền vào: Chỉ nội bộ nếu người gửi là chính chủ và không phải người thứ 3
        if (isOwnerSender && !isExplicitThirdParty) {
          isPotentialInternal = true;
          mentionedAcc = allOtherAccounts.find(a => 
            combinedUpper.includes(a.bank_code) || 
            combinedUpper.includes(a.name.toUpperCase()) ||
            (a.bank_code === 'TCB' && combinedUpper.includes('TECHCOMBANK')) ||
            (a.bank_code === 'VTM' && (combinedUpper.includes('VIETTEL') || combinedUpper.includes('VTMONEY') || combinedUpper.includes('VIETTELPAY'))) ||
            (a.bank_code === 'AGRI' && combinedUpper.includes('AGRIBANK'))
          );
        }
      }

      if (mentionedAcc && isPotentialInternal) {
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
      } else if (isOwnerSender && parsed.type === 'INCOME' && !isExplicitThirdParty) {
        // Tên người chuyển là chính chủ VU HA KIEN nhưng trong remark không có tên ngân hàng nguồn cụ thể
        // Tuyệt đối KHÔNG tự ý suy đoán và trừ tiền tài khoản khác. Đưa về PENDING để người dùng xác nhận nếu muốn.
        categoryId = 'cat_transfer_in';
        suggested = { categoryId, isAutoApply: false, keyword: 'Chuyển tiền nội bộ' };
        parsed.description = `Nhận chuyển tiền nội bộ (VU HA KIEN)`;
        status = 'PENDING';
      } else {
        // Giao dịch từ bên thứ 3 chuyển tới hoặc chi tiêu thông thường
        if (parsed.type === 'INCOME' && isExplicitThirdParty) {
          const sender = transferInfo.senderName;
          const remark = transferInfo.remark;
          parsed.description = remark && remark.length > 3
            ? `${sender}: ${remark}`
            : `Nhận tiền từ ${sender}`;
        }

        // Kiểm tra Auto Rules và từ khóa trả nợ / thu tiền
        const rules = await db.prepare('SELECT * FROM auto_rules').all();
        suggested = matchSuggestedCategory(combinedUpper, rules);
        if (suggested && suggested.isAutoApply) {
          categoryId = suggested.categoryId;
          status = 'CONFIRMED';
        } else if (suggested) {
          categoryId = suggested.categoryId;
          status = 'PENDING';
        } else if (parsed.type === 'INCOME') {
          categoryId = 'cat_debt_collect';
          status = 'PENDING';
        }

        // Đảm bảo giao dịch INCOME không bao giờ nhận danh mục EXPENSE (như cat_loan hay cat_other_expense)
        if (parsed.type === 'INCOME' && categoryId) {
          if (categoryId === 'cat_loan' || categoryId === 'cat_other_expense') {
            categoryId = 'cat_debt_collect';
          }
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
    const vnTime = getVietnamTimeParts();
    const txTime = vnTime.fullStr;

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
    const { text, autoSave = true, forceCash = false, expectedType, originalAmount } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung chi tiêu' });
    }
    const keyRow = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const apiKey = keyRow?.value || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Chưa cấu hình API Key. Vui lòng bấm vào nút thiết lập API Key của Google AI Studio (miễn phí).' });
    }

    const categories = await db.prepare('SELECT id, name, type FROM categories').all();
    const parsed = await parseTransactionWithGemini(text, categories, apiKey, { forceCash, expectedType, originalAmount });

    // Hỗ trợ tự động tách giao dịch (Split transaction)
    if (parsed.isSplit && parsed.splits && parsed.splits.length > 1) {
      if (!autoSave) {
        return res.json({
          success: true,
          isSplit: true,
          splits: parsed.splits,
          parsed
        });
      }

      const txTime = formatVietnamTxTime({
        clientTime: req.body.clientTime,
        customDate: parsed.customDate,
        customTime: parsed.customTime
      });

      let bankAcc = await db.prepare("SELECT * FROM accounts WHERE id != 'acc_cash' LIMIT 1").get();
      let cashAcc = await db.prepare("SELECT * FROM accounts WHERE id = 'acc_cash'").get();
      let targetAcc = (parsed.wallet === 'CASH') ? cashAcc : bankAcc;

      const createdSplits = [];
      let totalAmount = 0;

      for (let i = 0; i < parsed.splits.length; i++) {
        const s = parsed.splits[i];
        totalAmount += s.amount;
        const sTxId = 'tx_' + crypto.randomUUID().slice(0, 8);
        await db.prepare(`
          INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
        `).run(
          sTxId,
          targetAcc.id,
          s.categoryId || 'cat_food',
          s.amount,
          parsed.type,
          s.description || 'Khoản chi',
          text,
          targetAcc.name,
          txTime,
          txTime
        );

        const createdItem = await db.prepare(`
          SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
          FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
          WHERE t.id = ?
        `).get(sTxId);
        broadcastEvent('TRANSACTION_CREATED', createdItem);
        createdSplits.push(createdItem);
      }

      if (parsed.type === 'EXPENSE') {
        await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(totalAmount, targetAcc.id);
      } else {
        await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(totalAmount, targetAcc.id);
      }

      broadcastEvent('ACCOUNT_UPDATED', await db.prepare('SELECT * FROM accounts WHERE id = ?').get(targetAcc.id));

      return res.json({
        success: true,
        isSplit: true,
        splits: createdSplits,
        parsed,
        transaction: createdSplits[0],
        message: `✨ Đã tự động tách thành ${createdSplits.length} khoản chi và ghi nhận thành công!`
      });
    }

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
      const txTime = formatVietnamTxTime({
        clientTime: req.body.clientTime,
        customDate: parsed.customDate,
        customTime: parsed.customTime
      });

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

// 12. Báo cáo tài chính đánh giá cuối ngày & Phát hiện bất thường từ Gemini AI

/**
 * Core Pipeline: Tạo và lưu trữ báo cáo tài chính cuối ngày, đồng thời bắn thông báo tới điện thoại
 */
export async function generateAndSaveDailyReport(date, { force = false, triggerSource = 'MANUAL' } = {}) {
  // 1. Xác định ngày báo cáo (theo múi giờ Việt Nam Asia/Ho_Chi_Minh)
  const vnTime = getVietnamTimeParts();
  const targetDate = date || vnTime.isoDate;

  const [tY, tM, tD] = targetDate.split('-');
  const pattern1 = `%${tD}/${tM}/${tY}%`;
  const pattern2 = `${targetDate}%`;

  // Kiểm tra cache trong DB nếu không force làm mới
  if (!force) {
    const cached = await db.prepare('SELECT * FROM daily_reports WHERE report_date = ?').get(targetDate);
    if (cached) {
      const txs = await db.prepare(`
        SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE (t.transaction_time LIKE ? OR t.created_at LIKE ?) AND t.status != 'IGNORED'
        ORDER BY t.created_at ASC
      `).all(pattern1, pattern2);

      return {
        success: true,
        date: targetDate,
        totalIncome: Number(cached.total_income) || 0,
        totalExpense: Number(cached.total_expense) || 0,
        netFlow: Number(cached.net_flow) || 0,
        txCount: Number(cached.tx_count) || 0,
        categoryBreakdown: cached.category_breakdown ? JSON.parse(cached.category_breakdown) : {},
        accountBreakdown: cached.account_breakdown ? JSON.parse(cached.account_breakdown) : {},
        transactions: txs,
        aiEvaluation: cached.raw_ai_json ? JSON.parse(cached.raw_ai_json) : {
          rating: cached.rating_badge || 'Cân đối 👍',
          overview: cached.overview || '',
          anomalies: cached.anomalies_json ? JSON.parse(cached.anomalies_json) : [],
          advice: cached.advice_tomorrow || ''
        },
        fromCache: true
      };
    }
  }

  // Lấy danh sách giao dịch
  const txs = await db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE (t.transaction_time LIKE ? OR t.created_at LIKE ?) AND t.status != 'IGNORED'
    ORDER BY t.created_at ASC
  `).all(pattern1, pattern2);

  const totalIncome = txs
    .filter((t) => t.type === 'INCOME' && !t.category_id?.startsWith('cat_transfer_'))
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = txs
    .filter((t) => t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_'))
    .reduce((s, t) => s + (t.amount || 0), 0);
  const netFlow = totalIncome - totalExpense;

  const catMap = {};
  txs
    .filter((t) => t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_'))
    .forEach((t) => {
      const cName = t.category_name || 'Khác';
      catMap[cName] = (catMap[cName] || 0) + (t.amount || 0);
    });

  const accMap = {};
  txs.forEach((t) => {
    const aName = t.account_name || 'Tài khoản khác';
    if (!accMap[aName]) accMap[aName] = { in: 0, out: 0, count: 0 };
    accMap[aName].count += 1;
    if (t.type === 'INCOME') accMap[aName].in += t.amount || 0;
    else accMap[aName].out += t.amount || 0;
  });

  const keyRow = await db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
  const apiKey = keyRow?.value || process.env.GEMINI_API_KEY;

  let aiEvaluation = null;
  if (apiKey && txs.length > 0) {
    aiEvaluation = await generateDailyAiReport({
      date: targetDate,
      txs,
      totalIncome,
      totalExpense,
      netFlow,
      catMap,
      apiKey
    });
  }

  if (!aiEvaluation) {
    aiEvaluation = generateFallbackDailyReport({
      date: targetDate,
      txs,
      totalIncome,
      totalExpense,
      netFlow,
      catMap
    });
  }

  const reportData = {
    success: true,
    date: targetDate,
    totalIncome,
    totalExpense,
    netFlow,
    txCount: txs.length,
    categoryBreakdown: catMap,
    accountBreakdown: accMap,
    transactions: txs,
    aiEvaluation,
    fromCache: false
  };

  // Lưu vào database bảng daily_reports
  try {
    await db.prepare(`
      INSERT INTO daily_reports (
        report_date, total_income, total_expense, net_flow, tx_count,
        category_breakdown, account_breakdown, rating_badge, overview,
        anomalies_json, advice_tomorrow, raw_ai_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(report_date) DO UPDATE SET
        total_income = excluded.total_income,
        total_expense = excluded.total_expense,
        net_flow = excluded.net_flow,
        tx_count = excluded.tx_count,
        category_breakdown = excluded.category_breakdown,
        account_breakdown = excluded.account_breakdown,
        rating_badge = excluded.rating_badge,
        overview = excluded.overview,
        anomalies_json = excluded.anomalies_json,
        advice_tomorrow = excluded.advice_tomorrow,
        raw_ai_json = excluded.raw_ai_json,
        updated_at = datetime('now', 'localtime')
    `).run(
      targetDate,
      totalIncome,
      totalExpense,
      netFlow,
      txs.length,
      JSON.stringify(catMap),
      JSON.stringify(accMap),
      aiEvaluation?.rating || 'Cân đối 👍',
      aiEvaluation?.overview || '',
      JSON.stringify(aiEvaluation?.anomalies || []),
      aiEvaluation?.advice || '',
      JSON.stringify(aiEvaluation)
    );
  } catch (dbErr) {
    console.error('Lỗi lưu daily_reports cache:', dbErr.message);
  }

  // Nếu kích hoạt từ CRON hoặc TEST_PUSH hoặc NOTIFICATION_REQUEST, thực hiện bắn thông báo tới điện thoại
  let dispatchResult = null;
  if (triggerSource.startsWith('CRON') || triggerSource === 'TEST_PUSH' || triggerSource === 'NOTIFICATION_REQUEST') {
    try {
      const settingRows = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'daily_report%' OR key LIKE 'ntfy%' OR key LIKE 'telegram%' OR key LIKE 'macrodroid%'").all();
      const settingsMap = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

      dispatchResult = await dispatchDailyReportNotification(reportData, settingsMap);

      await db.prepare('UPDATE daily_reports SET sent_notification = 1 WHERE report_date = ?').run(targetDate);

      // Ghi log vào notification_logs
      await db.prepare(`
        INSERT INTO notification_logs (id, title, body, actions_payload, status)
        VALUES (?, ?, ?, ?, 'SENT')
      `).run(
        'log_' + crypto.randomUUID().slice(0, 8),
        dispatchResult.formatted.title,
        dispatchResult.formatted.shortText,
        JSON.stringify({ triggerSource, date: targetDate, results: dispatchResult.results })
      );
    } catch (pushErr) {
      console.error('Lỗi dispatch thông báo điện thoại:', pushErr.message);
    }
  }

  // Phát tín hiệu realtime tới giao diện web
  broadcastEvent('DAILY_REPORT_READY', reportData);

  return {
    ...reportData,
    dispatchResult
  };
}

// 12.1. API Lấy thông báo báo cáo ngày (Tối ưu riêng cho MacroDroid hoặc tự động bắn tới điện thoại)
app.get('/api/ai/daily-report/notification', async (req, res) => {
  try {
    const { format = 'text', date, force } = req.query;
    const isForce = force === 'true' || force === '1';
    const report = await generateAndSaveDailyReport(date, {
      force: isForce,
      triggerSource: 'NOTIFICATION_REQUEST'
    });

    const formatted = formatDailyReportNotification(report);

    if (format === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(formatted.shortText);
    }

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(formatted.markdownText);
    }

    res.json({
      success: true,
      title: formatted.title,
      message: formatted.shortText,
      rating: formatted.rating,
      hasAnomalies: formatted.hasAnomalies,
      report
    });
  } catch (err) {
    console.error('Lỗi /api/ai/daily-report/notification:', err);
    res.status(500).send('Lỗi tạo thông báo báo cáo: ' + err.message);
  }
});

// 12.2. API Kích hoạt chạy và bắn thử thông báo tới điện thoại ngay lập tức
app.post('/api/ai/daily-report/trigger', async (req, res) => {
  try {
    const { date } = req.body || {};
    const report = await generateAndSaveDailyReport(date, {
      force: true,
      triggerSource: 'TEST_PUSH'
    });
    res.json({
      success: true,
      message: 'Đã kích hoạt tạo báo cáo và bắn thông báo tới điện thoại thành công!',
      report
    });
  } catch (err) {
    console.error('Lỗi /api/ai/daily-report/trigger:', err);
    res.status(500).json({ error: err.message });
  }
});

// 12.3. API Cài đặt thông báo tự động 10h (22:00)
app.get('/api/settings/daily-report', async (req, res) => {
  try {
    const rows = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'daily_report%' OR key LIKE 'ntfy%' OR key LIKE 'telegram%' OR key LIKE 'macrodroid%'").all();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      success: true,
      settings: {
        time: map.daily_report_time || '22:00',
        enabled: map.daily_report_enabled !== 'false',
        ntfyTopic: map.ntfy_topic || 'smartspend_kienvu',
        macrodroidWebhookUrl: map.macrodroid_webhook_url || '',
        telegramBotToken: map.telegram_bot_token ? '******' : '',
        telegramChatId: map.telegram_chat_id || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/daily-report', async (req, res) => {
  try {
    const { time, enabled, ntfyTopic, macrodroidWebhookUrl, telegramBotToken, telegramChatId } = req.body || {};
    const updates = [];

    if (time !== undefined) updates.push({ key: 'daily_report_time', value: String(time).trim() });
    if (enabled !== undefined) updates.push({ key: 'daily_report_enabled', value: String(enabled) });
    if (ntfyTopic !== undefined) updates.push({ key: 'ntfy_topic', value: String(ntfyTopic).trim() });
    if (macrodroidWebhookUrl !== undefined) updates.push({ key: 'macrodroid_webhook_url', value: String(macrodroidWebhookUrl).trim() });
    if (telegramBotToken !== undefined && telegramBotToken !== '******') updates.push({ key: 'telegram_bot_token', value: String(telegramBotToken).trim() });
    if (telegramChatId !== undefined) updates.push({ key: 'telegram_chat_id', value: String(telegramChatId).trim() });

    for (const item of updates) {
      await db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now', 'localtime')
      `).run(item.key, item.value);
    }

    res.json({ success: true, message: 'Đã lưu cấu hình thông báo báo cáo 10h' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12.4. API Web Push Notification (Thông báo đẩy trực tiếp tới điện thoại/trình duyệt)
app.get('/api/notifications/vapid-public-key', async (req, res) => {
  try {
    const key = await initWebPush();
    res.json({ success: true, publicKey: key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Dữ liệu subscription là bắt buộc' });
    }

    const endpoint = subscription.endpoint;
    const subJson = JSON.stringify(subscription);
    const userAgent = req.headers['user-agent'] || '';
    const id = 'sub_' + crypto.randomUUID().slice(0, 8);

    await db.prepare(`
      INSERT INTO push_subscriptions (id, endpoint, subscription_json, user_agent, created_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(endpoint) DO UPDATE SET
        subscription_json = excluded.subscription_json,
        user_agent = excluded.user_agent
    `).run(id, endpoint, subJson, userAgent);

    // Bắn thông báo xác nhận ngay tức thì tới thiết bị vừa đăng ký
    try {
      await sendWebPushNotificationToAll({
        title: 'SmartSpend 🔔',
        body: 'Thông báo ứng dụng đã được kích hoạt thành công trên thiết bị của bạn!',
        url: '/'
      });
    } catch { }

    res.json({ success: true, message: 'Đã đăng ký nhận thông báo ứng dụng thành công!' });
  } catch (err) {
    console.error('Lỗi subscribe push:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/test-push', async (req, res) => {
  try {
    const result = await sendWebPushNotificationToAll({
      title: 'SmartSpend Test 🔔',
      body: 'Thông báo ứng dụng hoạt động hoàn hảo lúc ' + new Date().toLocaleTimeString('vi-VN'),
      url: '/'
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12.4. Báo cáo tài chính cuối ngày (hỗ trợ cache để mở modal là hiển thị ngay không phải đợi)
app.post('/api/ai/daily-report', async (req, res) => {
  try {
    const { date, refresh = false } = req.body || {};
    const report = await generateAndSaveDailyReport(date, {
      force: Boolean(refresh),
      triggerSource: 'UI_MODAL'
    });
    res.json(report);
  } catch (err) {
    console.error('Lỗi daily-report:', err);
    res.status(500).json({ error: err.message });
  }
});

// 12.5. Background Cron: Tự động chạy báo cáo và bắn thông báo lúc 22:00 (10h đêm giờ Việt Nam)
setInterval(async () => {
  try {
    const nowVn = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const curHour = String(nowVn.getHours()).padStart(2, '0');
    const curMin = String(nowVn.getMinutes()).padStart(2, '0');
    const currentTime = `${curHour}:${curMin}`;

    const curY = nowVn.getFullYear();
    const curM = String(nowVn.getMonth() + 1).padStart(2, '0');
    const curD = String(nowVn.getDate()).padStart(2, '0');
    const todayDate = `${curY}-${curM}-${curD}`;

    const rows = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'daily_report%'").all();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const targetTime = map.daily_report_time || '22:00';
    const isEnabled = map.daily_report_enabled !== 'false';

    if (isEnabled && currentTime === targetTime) {
      const existing = await db.prepare('SELECT sent_notification FROM daily_reports WHERE report_date = ?').get(todayDate);
      if (!existing || Number(existing.sent_notification) !== 1) {
        console.log(`[10h Auto Cron] 🔔 Đã tới ${currentTime}. Tự động tạo báo cáo ngày và bắn thông báo tới điện thoại...`);
        await generateAndSaveDailyReport(todayDate, { force: true, triggerSource: 'CRON_AUTO_22H' });
      }
    }
  } catch (err) {
    console.error('[10h Auto Cron Error]', err.message);
  }
}, 30000);

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
