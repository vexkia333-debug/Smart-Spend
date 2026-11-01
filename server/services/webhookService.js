import crypto from 'node:crypto';
import { db } from '../db.js';
import { parseBankNotification, matchSuggestedCategory, extractTransferInfo } from '../parser.js';
import { getVietnamTimeParts } from '../utils/time.js';
import { broadcastEvent } from './sse.js';

export async function processIncomingWebhook(body = {}) {
  const rawContent = body.content || body.text || body.body || body.message || body.notification || body.not_text || '';
  const rawTitle = body.title || body.not_title || '';
  const rawAppName = body.appName || body.app_name || body.package || body.pkg_name || body.not_app_name || '';
  const { timestamp, source = 'BANK_NOTIFICATION' } = body;

  const content = rawContent || rawTitle;
  if (!content) {
    throw new Error('Nội dung thông báo (content) là bắt buộc');
  }

  const effectiveTitle = rawTitle;

  // 1. Phân tích nội dung qua Parser
  const parsed = parseBankNotification(content, effectiveTitle, rawAppName);

  if (!parsed || parsed.isIgnored) {
    return {
      success: true,
      ignored: true,
      reason: parsed ? parsed.reason : 'UNRECOGNIZED_NOTIFICATION'
    };
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
    return {
      success: true,
      duplicate: true,
      transactionId: recentDuplicate.id,
      message: 'Giao dịch đã được ghi nhận trước đó, bỏ qua để tránh trùng lặp'
    };
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
    const transferInfo = extractTransferInfo(content, parsed.description);
    const descUpper = (parsed.description || '').toUpperCase();
    const rawUpper = (content || '').toUpperCase();
    const combinedUpper = `${descUpper} ${rawUpper}`;

    if (parsed.type === 'INCOME' && transferInfo.senderName && !transferInfo.isSenderOwner) {
      const sender = transferInfo.senderName;
      const remark = transferInfo.remark;
      parsed.description = remark && remark.length > 3
        ? `${sender}: ${remark}`
        : `Nhận tiền từ ${sender}`;
    }

    const rules = await db.prepare('SELECT * FROM auto_rules').all();
    suggested = matchSuggestedCategory(combinedUpper, rules);
    if (suggested && suggested.isAutoApply) {
      categoryId = suggested.categoryId;
      status = 'CONFIRMED';
    } else if (suggested) {
      categoryId = suggested.categoryId;
      status = 'PENDING';
    } else {
      status = 'PENDING';
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

  // 6. Gửi realtime prompt tới tất cả client
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

  return {
    success: true,
    transactionId: txId,
    isInternalTransfer,
    parsed,
    status,
    quickActions: quickCategories,
    message: isInternalTransfer
      ? '⚡ Đã tự động khớp lệnh chuyển tiền giữa các tài khoản của bạn'
      : (status === 'PENDING' ? 'Giao dịch đã được lưu và đang chờ bạn phân loại' : 'Đã tự động phân loại')
  };
}

