import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { parseTransactionWithGemini } from '../gemini.js';
import { formatVietnamTxTime } from '../utils/time.js';
import { broadcastEvent } from '../services/sse.js';

const router = Router();

// Phân tích chi tiêu thông minh bằng Gemini Flash + SmartSpend NLU tốc độ cao
router.post('/parse-transaction', async (req, res) => {
  try {
    const { text, autoSave = true, forceCash = false, expectedType, originalAmount } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung chi tiêu' });
    }

    // Truy vấn song song (Parallel Batch) giảm 75% thời gian chờ kết nối Turso Cloud
    const [keyRow, categories, accounts, rules] = await Promise.all([
      db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get(),
      db.prepare('SELECT id, name, type, color, icon FROM categories').all(),
      db.prepare('SELECT * FROM accounts').all(),
      db.prepare('SELECT * FROM auto_rules').all()
    ]);

    const apiKey = keyRow?.value || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Chưa cấu hình API Key. Vui lòng bấm vào nút thiết lập API Key của Google AI Studio (miễn phí).' });
    }

    const parsed = await parseTransactionWithGemini(text, categories, apiKey, {
      forceCash,
      expectedType,
      originalAmount,
      rules
    });

    const catMap = new Map(categories.map(c => [c.id, c]));
    let bankAcc = accounts.find(a => a.id === 'acc_primary') || accounts.find(a => a.id !== 'acc_cash');
    let cashAcc = accounts.find(a => a.id === 'acc_cash');

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

      let targetAcc = (parsed.wallet === 'CASH') ? (cashAcc || bankAcc) : (bankAcc || cashAcc);
      const createdSplits = [];
      let netBalanceDelta = 0;
      const writePromises = [];

      for (let i = 0; i < parsed.splits.length; i++) {
        const s = parsed.splits[i];
        const sType = s.type || parsed.type || 'EXPENSE';
        netBalanceDelta += (sType === 'EXPENSE' ? -s.amount : s.amount);
        const sTxId = 'tx_' + crypto.randomUUID().slice(0, 8);
        const sCatId = s.categoryId || (sType === 'INCOME' ? 'cat_other_income' : 'cat_other_expense');
        const catInfo = catMap.get(sCatId);

        writePromises.push(
          db.prepare(`
            INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
          `).run(
            sTxId,
            targetAcc.id,
            sCatId,
            s.amount,
            sType,
            s.description || 'Khoản giao dịch',
            text,
            targetAcc.name,
            txTime,
            txTime
          )
        );

        createdSplits.push({
          id: sTxId,
          account_id: targetAcc.id,
          category_id: sCatId,
          amount: s.amount,
          type: sType,
          description: s.description || 'Khoản giao dịch',
          raw_content: text,
          bank_name: targetAcc.name,
          status: 'CONFIRMED',
          source: 'MANUAL',
          transaction_time: txTime,
          confirmed_at: txTime,
          category_name: catInfo?.name || 'Chi tiêu khác',
          category_color: catInfo?.color || '#64748b',
          category_icon: catInfo?.icon || 'Tag',
          account_name: targetAcc.name
        });
      }

      await Promise.all(writePromises);

      const updatedTargetAcc = { ...targetAcc, balance: Number(targetAcc.balance || 0) + netBalanceDelta };
      for (const item of createdSplits) {
        broadcastEvent('TRANSACTION_CREATED', item);
      }
      broadcastEvent('ACCOUNT_UPDATED', updatedTargetAcc);

      const splitSummary = createdSplits
        .map(item => `${item.description} (${new Intl.NumberFormat('vi-VN').format(item.amount)} ₫)`)
        .join(' + ');

      return res.json({
        success: true,
        isSplit: true,
        splits: createdSplits,
        parsed,
        transaction: createdSplits[0],
        message: `✨ Đã tự động tách ${createdSplits.length} khoản: ${splitSummary}`
      });
    }

    // Tự động tạo danh mục mới nếu AI phát hiện chi tiêu thuộc lĩnh vực mới
    let createdCategory = null;
    let targetCatId = parsed.categoryId;

    if (parsed.isNewCategory && parsed.newCategory?.name) {
      const catName = parsed.newCategory.name.trim();
      const existingCat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
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
        catMap.set(newCatId, createdCategory);
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

      if (!bankAcc) {
        await db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_primary', 'Agribank Plus', 'AGRI', '****8888', 0, 'VND', 'landmark', '#059669')").run();
        bankAcc = { id: 'acc_primary', name: 'Agribank Plus', bank_code: 'AGRI', balance: 0 };
      }

      if (!cashAcc) {
        await db.prepare("INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES ('acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b')").run();
        cashAcc = { id: 'acc_cash', name: 'Ví Tiền Mặt', bank_code: 'CASH', balance: 0 };
      }

      // TRƯỜNG HỢP 1: Chuyển tiền nội bộ giữa các tài khoản ngân hàng / ví
      if (parsed.wallet === 'INTERNAL_TRANSFER' || parsed.categoryId === 'cat_transfer_internal') {
        const allAccs = accounts;
        let srcAcc = allAccs.find(a => parsed.sourceBank && (a.name.toLowerCase().includes(parsed.sourceBank.toLowerCase()) || a.bank_code.toLowerCase() === parsed.sourceBank.toLowerCase())) || bankAcc;
        let dstAcc = allAccs.find(a => parsed.targetBank && (a.name.toLowerCase().includes(parsed.targetBank.toLowerCase()) || a.bank_code.toLowerCase() === parsed.targetBank.toLowerCase()) && a.id !== srcAcc.id);
        
        if (!dstAcc) {
          dstAcc = allAccs.find(a => a.id !== srcAcc.id && a.id !== 'acc_cash') || allAccs.find(a => a.id !== srcAcc.id) || cashAcc;
        }

        const txIdOut = txId;
        const txIdIn = 'tx_' + crypto.randomUUID().slice(0, 8);

        await Promise.all([
          db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, srcAcc.id),
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, dstAcc.id),
          db.prepare(`
            INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
            VALUES (?, ?, 'cat_transfer_internal', ?, 'EXPENSE', ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
          `).run(txIdOut, srcAcc.id, parsed.amount, `Chuyển tiền sang ${dstAcc.name}`, text, srcAcc.name, txTime, txTime),
          db.prepare(`
            INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
            VALUES (?, ?, 'cat_transfer_in', ?, 'INCOME', ?, ?, ?, 'CONFIRMED', 'MANUAL', ?, ?)
          `).run(txIdIn, dstAcc.id, parsed.amount, `Nhận tiền từ ${srcAcc.name}`, text, dstAcc.name, txTime, txTime)
        ]);

        broadcastEvent('ACCOUNT_UPDATED', { ...srcAcc, balance: Number(srcAcc.balance || 0) - parsed.amount });
        broadcastEvent('ACCOUNT_UPDATED', { ...dstAcc, balance: Number(dstAcc.balance || 0) + parsed.amount });

        return res.json({
          success: true,
          message: `⚡ Đã chuyển thành công ${new Intl.NumberFormat('vi-VN').format(parsed.amount)} ₫ từ ${srcAcc.name} sang ${dstAcc.name}`,
          parsed
        });
      }

      // TRƯỜNG HỢP 2: Rút tiền mặt (Bank -> Cash)
      if (parsed.wallet === 'TRANSFER_TO_CASH' || parsed.categoryId === 'cat_transfer_cash') {
        const sourceAcc = bankAcc;
        const catInfo = catMap.get('cat_transfer_cash');

        await Promise.all([
          db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(parsed.amount, sourceAcc.id),
          db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(parsed.amount, cashAcc.id),
          db.prepare(`
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
          )
        ]);

        const createdTx = {
          id: txId,
          account_id: sourceAcc.id,
          category_id: 'cat_transfer_cash',
          amount: parsed.amount,
          type: 'EXPENSE',
          description: parsed.description || 'Rút tiền mặt vào Ví',
          raw_content: text,
          bank_name: sourceAcc.name,
          status: 'CONFIRMED',
          source: 'MANUAL',
          transaction_time: txTime,
          confirmed_at: txTime,
          category_name: catInfo?.name || 'Rút tiền mặt',
          category_color: catInfo?.color || '#f59e0b',
          category_icon: catInfo?.icon || 'Wallet',
          account_name: sourceAcc.name
        };

        broadcastEvent('ACCOUNT_UPDATED', { ...sourceAcc, balance: Number(sourceAcc.balance || 0) - parsed.amount });
        broadcastEvent('ACCOUNT_UPDATED', { ...cashAcc, balance: Number(cashAcc.balance || 0) + parsed.amount });
        broadcastEvent('TRANSACTION_CREATED', createdTx);

        return res.json({
          success: true,
          parsed,
          createdCategory,
          transaction: createdTx,
          message: `Đã phân loại: ${createdTx.category_name} (${parsed.reasoning})`
        });
      }

      // TRƯỜNG HỢP 3: Chi tiêu hoặc Thu nhập thông thường (Song song hóa INSERT + UPDATE)
      let targetAcc = (parsed.wallet === 'CASH') ? cashAcc : bankAcc;
      if (parsed.bankName && parsed.wallet !== 'CASH') {
        const bLower = parsed.bankName.toLowerCase();
        const matchedAcc = accounts.find(a => a.name.toLowerCase().includes(bLower) || a.bank_code.toLowerCase() === bLower);
        if (matchedAcc) targetAcc = matchedAcc;
      }

      const balanceDelta = parsed.type === 'EXPENSE' ? -parsed.amount : parsed.amount;
      const catInfo = catMap.get(parsed.categoryId);

      await Promise.all([
        db.prepare(`
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
        ),
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(balanceDelta, targetAcc.id)
      ]);

      const createdTx = {
        id: txId,
        account_id: targetAcc.id,
        category_id: parsed.categoryId,
        amount: parsed.amount,
        type: parsed.type,
        description: parsed.description,
        raw_content: text,
        bank_name: parsed.bankName || targetAcc.name,
        status: 'CONFIRMED',
        source: 'MANUAL',
        transaction_time: txTime,
        confirmed_at: txTime,
        category_name: catInfo?.name || 'Chi tiêu khác',
        category_color: catInfo?.color || '#64748b',
        category_icon: catInfo?.icon || 'Tag',
        account_name: targetAcc.name
      };

      broadcastEvent('ACCOUNT_UPDATED', { ...targetAcc, balance: Number(targetAcc.balance || 0) + balanceDelta });
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

export default router;

