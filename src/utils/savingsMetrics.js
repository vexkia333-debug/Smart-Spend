function normalizePersonName(name) {
  if (!name) return 'Khác';
  return name.trim().toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function extractPersonKey(desc) {
  if (!desc) return 'Khác';
  const d = desc.trim();
  let m = d.match(/(?:Cho\s+)?([A-Za-zÀ-ỹ\s]+?)\s+(?:vay|mượn)/i);
  if (m && m[1].trim()) return normalizePersonName(m[1].trim());
  m = d.match(/Trả\s+hộ\s+(?:tiền\s+(?:ăn|uống)\s+cho\s+)?([A-Za-zÀ-ỹ\s,]+)/i);
  if (m && m[1].trim()) return normalizePersonName(m[1].trim());
  m = d.match(/^([A-Za-zÀ-ỹ\s]+?)\s+(?:trả\s*nợ|trả\s*tiền|trả\s*trước|trả|bắn\s*tiền|ck|chuyển\s*tiền|chuyển)/i);
  if (m && m[1].trim()) return normalizePersonName(m[1].trim());
  m = d.match(/Trả\s+nợ\s+(?:cho\s+)?([A-Za-zÀ-ỹ\s]+)/i);
  if (m && m[1].trim()) return normalizePersonName(m[1].trim());
  m = d.match(/(?:từ|của)\s+([A-Za-zÀ-ỹ\s]+)/i);
  if (m && m[1].trim()) return normalizePersonName(m[1].trim());
  return normalizePersonName(d);
}

/**
 * Tính thu nhập, chi tiêu và thặng dư tiết kiệm của một tháng theo hướng:
 * - Tách riêng Cho vay (cat_loan) và Trả nợ (cat_debt_repay) khỏi chi tiêu sinh hoạt.
 * - Các khoản Thu hồi nợ / Nhận tiền trả (cat_debt_collect) tự triệt tiêu với khoản Cho vay
 *   cùng người trong tháng; phần tiền trả dư (tiền trả hộ ăn uống/chơi/sash) được cộng vào thu nhập tháng.
 */
export function computeMonthlySavingsSummary(monthTxs = []) {
  let baseIncome = 0;
  let expense = 0;
  const lentByPerson = {};
  const collectedEntries = [];

  for (const t of monthTxs) {
    if (t.status === 'IGNORED' || t.category_id?.startsWith('cat_transfer_')) continue;
    const amt = Number(t.amount || 0);
    if (t.type === 'INCOME') {
      if (t.category_id === 'cat_debt_collect') {
        collectedEntries.push({ person: extractPersonKey(t.description), amount: amt });
      } else {
        baseIncome += amt;
      }
    } else if (t.type === 'EXPENSE') {
      if (t.category_id === 'cat_loan') {
        const person = extractPersonKey(t.description);
        lentByPerson[person] = (lentByPerson[person] || 0) + amt;
      } else if (t.category_id !== 'cat_debt_repay') {
        expense += amt;
      }
    }
  }

  let reimbursement = 0;
  const remainingLent = { ...lentByPerson };
  for (const entry of collectedEntries) {
    const owed = remainingLent[entry.person] || 0;
    if (owed > 0) {
      const matched = Math.min(owed, entry.amount);
      remainingLent[entry.person] = owed - matched;
      reimbursement += entry.amount - matched;
    } else {
      reimbursement += entry.amount;
    }
  }

  const income = baseIncome + reimbursement;
  return {
    baseIncome,
    reimbursement,
    income,
    expense,
    savings: income - expense
  };
}
