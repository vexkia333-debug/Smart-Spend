import { Router } from 'express';
import crypto from 'node:crypto';
import { db, seedInitialTransactions } from '../db.js';
import { broadcastEvent } from '../services/sse.js';

const router = Router();

// 1. Thống kê tổng quan (Stats)
router.get('/stats', async (req, res) => {
  try {
    const totalBalanceRow = await db.prepare('SELECT SUM(balance) as total FROM accounts').get();
    const pendingCountRow = await db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'PENDING'").get();

    // Chi tiêu sinh hoạt thuần túy (loại trừ chuyển tiền nội bộ & cho vay)
    const monthlyExpenseRow = await db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE type = 'EXPENSE' AND status != 'IGNORED' 
        AND (category_id != 'cat_transfer_cash' OR category_id IS NULL)
        AND (category_id != 'cat_loan' OR category_id IS NULL)
        AND (category_id NOT LIKE 'cat_transfer_%' OR category_id IS NULL)
    `).get();

    // Thu nhập thực tế (loại trừ thu hồi nợ và chuyển khoản nội bộ)
    const monthlyIncomeRow = await db.prepare(`
      SELECT SUM(amount) as total FROM transactions 
      WHERE type = 'INCOME' AND status != 'IGNORED'
        AND (category_id != 'cat_debt_collect' OR category_id IS NULL)
        AND (category_id NOT LIKE 'cat_transfer_%' OR category_id IS NULL)
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

    // Thống kê chi tiêu sinh hoạt theo từng danh mục (loại trừ nợ và chuyển tiền)
    const categoryStats = await db.prepare(`
      SELECT 
        c.id, c.name, c.color, c.icon,
        COALESCE(SUM(t.amount), 0) as total_amount,
        COUNT(t.id) as tx_count
      FROM categories c
      LEFT JOIN transactions t ON c.id = t.category_id AND t.type = 'EXPENSE' AND t.status = 'CONFIRMED'
      WHERE c.type = 'EXPENSE' AND c.id != 'cat_loan' AND c.id NOT LIKE 'cat_transfer_%'
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

// 1.1 Thêm nhanh giao dịch Cho vay & Thu hồi nợ (Debt / Loan Management)
router.post('/debt-loan', async (req, res) => {
  try {
    const { type, amount, borrower, description, account_id, transaction_time } = req.body;
    const numAmount = Math.abs(parseFloat(amount));
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    const isLoan = type === 'LOAN'; // LOAN: Cho vay/Trả hộ (EXPENSE), COLLECT: Thu hồi nợ (INCOME)
    const txType = isLoan ? 'EXPENSE' : 'INCOME';
    const category_id = isLoan ? 'cat_loan' : 'cat_debt_collect';

    // Xác định tài khoản
    let targetAccId = account_id;
    if (!targetAccId) {
      const defaultAcc = await db.prepare('SELECT id FROM accounts ORDER BY balance DESC LIMIT 1').get();
      targetAccId = defaultAcc?.id || 'acc_cash';
    }

    const acc = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(targetAccId);
    if (!acc) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    }

    const txId = 'tx_' + crypto.randomUUID().slice(0, 8);
    const borrowerName = (borrower || '').trim();
    let finalDesc = (description || '').trim();

    if (!finalDesc) {
      if (isLoan) {
        finalDesc = borrowerName ? `Cho ${borrowerName} vay tiền` : 'Khoản cho vay';
      } else {
        finalDesc = borrowerName ? `${borrowerName} trả nợ` : 'Thu hồi nợ';
      }
    }

    const now = new Date();
    const defaultTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    const txTime = transaction_time && transaction_time.trim() ? transaction_time.trim() : defaultTimeStr;

    // Cập nhật số dư tài khoản
    if (txType === 'EXPENSE') {
      await db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(numAmount, targetAccId);
    } else {
      await db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(numAmount, targetAccId);
    }

    // Thêm giao dịch đã xác nhận (CONFIRMED)
    await db.prepare(`
      INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      txId,
      targetAccId,
      category_id,
      numAmount,
      txType,
      finalDesc,
      `${isLoan ? 'Cho vay/Trả hộ' : 'Thu hồi nợ'}: ${finalDesc} - ${numAmount.toLocaleString('vi-VN')} VND`,
      acc.name,
      txTime
    );

    const createdTx = await db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color, c.icon as category_icon, a.name as account_name
      FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.id = ?
    `).get(txId);

    const updatedAcc = await db.prepare('SELECT * FROM accounts WHERE id = ?').get(targetAccId);

    broadcastEvent('TRANSACTION_CREATED', createdTx);
    if (updatedAcc) broadcastEvent('ACCOUNT_UPDATED', updatedAcc);

    res.json({ success: true, transaction: createdTx, account: updatedAcc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Danh sách giao dịch (Transactions)
router.get('/transactions', async (req, res) => {
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
router.patch('/transactions/:id/categorize', async (req, res) => {
  try {
    const { id } = req.params;
    let { category_id, description, partner_account_id } = req.body;

    const existingTx = await db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existingTx) {
      return res.status(404).json({ error: 'Giao dịch không tồn tại' });
    }

    // Bảo vệ loại danh mục: Không để giao dịch INCOME nhận danh mục EXPENSE
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
router.post('/transactions/:id/split', async (req, res) => {
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
router.patch('/transactions/:id/ignore', async (req, res) => {
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
router.put('/transactions/:id', async (req, res) => {
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
    const newStatus = (oldTx.status === 'PENDING' && newCatId) ? 'CONFIRMED' : oldTx.status;

    await db.prepare(`
      UPDATE transactions
      SET amount = ?, description = ?, category_id = ?, account_id = ?, bank_name = ?, type = ?, status = ?, transaction_time = ?, confirmed_at = COALESCE(confirmed_at, datetime('now', 'localtime')), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newAmount, newDesc, newCatId, newAccountId, newBankName, newType, newStatus, newTime, id);

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
router.delete('/transactions/:id', async (req, res) => {
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

// Xóa toàn bộ dữ liệu mẫu, thiết lập tài khoản thật
router.post('/reset-data', async (req, res) => {
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

// Xóa / Đặt lại lịch sử giao dịch (Transaction History Reset)
router.post('/transactions/clear', async (req, res) => {
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

export default router;

