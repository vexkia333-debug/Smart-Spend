import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { getVietnamTimeParts } from '../utils/time.js';
import { broadcastEvent } from '../services/sse.js';

const router = Router();

// Lấy danh sách tài khoản (Accounts)
router.get('/', async (req, res) => {
  try {
    const accounts = await db.prepare('SELECT * FROM accounts ORDER BY balance DESC').all();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Điều chỉnh số dư / Kiểm kê Ví (Reconciliation)
router.post('/:id/adjust-balance', async (req, res) => {
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

export default router;
