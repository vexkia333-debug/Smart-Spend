/**
 * Engine bóc tách nội dung thông báo biến động số dư các ngân hàng Việt Nam
 */

export function parseBankNotification(text, title = '') {
  if (!text) return null;

  // Ghép cả title và text để không bao giờ bị sót nội dung dù MacroDroid truyền ngược trường
  let fullContent = `${title ? title + ' ' : ''}${text || ''}`.replace(/[\r\n]+/g, ' ').trim();
  // Loại bỏ token văn bản nếu người dùng gõ nhầm literal string
  const cleanContent = fullContent.replace(/\[not_text\]|\[notification\]/gi, '').trim();
  const cleanText = cleanContent.length > 5 ? cleanContent : fullContent;

  let bankName = 'Ngân hàng';
  let bankCode = 'UNKNOWN';
  let amount = 0;
  let type = 'EXPENSE';
  let description = cleanText;
  let balance = null;

  // 1. Nhận diện Ngân hàng: Ưu tiên App Title / Header nếu có
  const titleUpper = (title || '').toUpperCase();

  // Loại bỏ phần ND giao dịch khi nhận diện ngân hàng chủ quản để không bị nhầm ngân hàng thụ hưởng (ví dụ: 140421-TCB;... trong tin của Agribank)
  const cleanWithoutND = cleanText.replace(/(?:ND|Noi dung|Nội dung)(?:\s+(?:giao dich|giao dịch))?[:\s]+[\s\S]*?(?=(?:\.|\s)*(?:Số dư|So du|SD[:\s])|$)/i, ' ');
  const contentUpper = cleanWithoutND.toUpperCase();

  function detectBank(str) {
    if (!str) return null;
    if (str.includes('7901205294347') || str.includes('AGRIBANK') || str.includes('AGRI') || str.includes('VARB')) return { bankName: 'Agribank', bankCode: 'AGRI' };
    if (str.includes('1912200512') || str.includes('TECHCOMBANK') || str.includes('TCB')) return { bankName: 'Techcombank', bankCode: 'TCB' };
    if (str.includes('VIETTEL') || str.includes('VTMONEY') || str.includes('VIETTELPAY') || str.includes('GD THANH TOAN') || str.includes('NAPVIETTELPAY') || (str.includes('SỐ TIỀN GIAO DỊCH') && str.includes('THỜI GIAN:'))) return { bankName: 'Viettel Money', bankCode: 'VTM' };
    if (str.includes('VCB') || str.includes('VIETCOMBANK')) return { bankName: 'Vietcombank', bankCode: 'VCB' };
    if (str.includes('MBBANK') || str.includes('MB BANK') || str.includes('MB ')) return { bankName: 'MB Bank', bankCode: 'MB' };
    if (str.includes('MOMO')) return { bankName: 'MoMo', bankCode: 'MOMO' };
    if (str.includes('ACB')) return { bankName: 'ACB', bankCode: 'ACB' };
    if (str.includes('VPBANK') || str.includes('VPB')) return { bankName: 'VPBank', bankCode: 'VPB' };
    if (str.includes('BIDV')) return { bankName: 'BIDV', bankCode: 'BIDV' };
    if (str.includes('TPBANK') || str.includes('TPB')) return { bankName: 'TPBank', bankCode: 'TPB' };
    return null;
  }

  const detectedFromTitle = detectBank(titleUpper);
  const detectedFromContent = detectBank(contentUpper);

  if (detectedFromTitle) {
    bankName = detectedFromTitle.bankName;
    bankCode = detectedFromTitle.bankCode;
  } else if (detectedFromContent) {
    bankName = detectedFromContent.bankName;
    bankCode = detectedFromContent.bankCode;
  }

  // Lọc thông báo tiếp thị, ưu đãi, quảng cáo không phải biến động số dư thực tế
  const isMarketing = /bảo hiểm|bao hiem|vay online|duyệt vay|duyet vay|hạn mức|han muc|mở ví trả sau|mo vi tra sau|ví trả sau|vi tra sau|nhận ngay voucher|nhan ngay voucher|tiêu trước trả sau|tieu truoc tra sau|quà tặng|qua tang|khuyến mãi|khuyen mai|ưu đãi|uu dai|voucher|hoàn tiền tới|hoan tien toi|trúng thưởng|trung thuong|quay số|quay so|tri ân|tri an|mở thẻ|mo the|tiết kiệm chỉ từ|tiet kiem|lãi suất|lai suat|đăng ký ngay|dang ky ngay|click để|click de|xem ngay|sắp hết hạn|sap het han/i.test(cleanText);
  const hasSignedAmount = /(?:GD[:\s]*)?[+-]\s*[0-9]{1,3}(?:[.,][0-9]{3})+/i.test(cleanText) ||
    /(?:số tiền giao dịch|so tien gd)[:\s]*[+-]?\s*[0-9]{1,3}(?:[.,][0-9]{3})+/i.test(cleanText);
  const hasBalanceSignature = /(?:số dư|so du|sd)(?:\s+(?:cuối|cuoi|hien tai|hiện tại))?[:\s]*[0-9]{1,3}(?:[.,][0-9]{3})+/i.test(cleanText);

  if (isMarketing && (!hasSignedAmount || !hasBalanceSignature || /ví trả sau|vi tra sau|duyệt vay|duyet vay|bảo hiểm|bao hiem/i.test(cleanText))) {
    return {
      isIgnored: true,
      reason: 'PROMOTIONAL_NOTIFICATION',
      rawContent: cleanText
    };
  }

  // 2. Xác định Loại: Thu (+) hay Chi (-)
  if (/[+]|nhan duoc|cong tien|nhan tien|chuyen vao|tang|nap thanh cong|nap vao|nhan tu/i.test(cleanText)) {
    type = 'INCOME';
  } else if (/[-]|thanh toan|chuyen di|chuyen tien|tru tien|rut tien|giam|mua/i.test(cleanText)) {
    type = 'EXPENSE';
  }

  // 3. Regex bóc tách số tiền
  // Ưu tiên 1: Có dấu [+-] rõ ràng (ví dụ: -50,000VND, +150.000d)
  let amountMatch = cleanText.match(/(?:GD[:\s]*)?([+-]\s*(?:[0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,12}))\s*(?:VND|VNĐ|d|đ|\$)?/i);

  // Ưu tiên 2: Đi liền với đơn vị tiền tệ VND/VNĐ/d/đ
  if (!amountMatch) {
    amountMatch = cleanText.match(/(?:thanh toan|chuyen|nhan|so tien|tiền|giao dịch)?[:\s]*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,12})\s*(?:VND|VNĐ|d|đ|\$)/i);
  }

  // Ưu tiên 3: Định dạng có dấu chấm/phẩy hàng nghìn
  if (!amountMatch) {
    amountMatch = cleanText.match(/([0-9]{1,3}(?:[.,][0-9]{3})+)\s*(?:VND|VNĐ|d|đ|\$)?/i);
  }

  if (amountMatch && amountMatch[1]) {
    const normalized = amountMatch[1].replace(/[+-.,\s]/g, '');
    amount = parseFloat(normalized);
  }

  // Nếu không tìm thấy số tiền hợp lệ, bỏ qua để không tạo giao dịch ảo
  if (!amount || amount <= 0) {
    return {
      isIgnored: true,
      reason: 'NO_TRANSACTION_AMOUNT',
      rawContent: cleanText
    };
  }

  // 4. Bóc tách số dư cuối / số dư khả dụng (ví dụ: "Số dư cuối: 355,788VND" hoặc "SD: 18,365,000 VND")
  const balanceMatch = cleanText.match(/(?:SD|So du|Số dư)(?:\s+(?:cuối|cuoi|kha dung|khả dụng|hien tai|hiện tại))?[:\s]*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,12})/i);
  if (balanceMatch && balanceMatch[1]) {
    balance = parseFloat(balanceMatch[1].replace(/[.,]/g, ''));
  }

  // 5. Bóc tách nội dung giao dịch (ND / Noi dung giao dich / Ref)
  let descMatch = cleanText.match(/(?:ND|Noi dung|Nội dung)(?:\s+(?:giao dich|giao dịch))?[:\s]+([\s\S]*?)(?=(?:\.|\s)*(?:Số dư|So du|SD[:\s])|$)/i);
  if (!descMatch || !descMatch[1].trim()) {
    descMatch = cleanText.match(/\b(?:tai|cho)[:\s]+(.*?)(?:\.|$)/i);
  }

  if (descMatch && descMatch[1]) {
    description = descMatch[1].trim();
  } else {
    description = cleanText.length > 80 ? cleanText.slice(0, 77) + '...' : cleanText;
  }

  return {
    bankName,
    bankCode,
    amount,
    type,
    balance,
    description: description || 'Giao dịch qua ngân hàng',
    rawContent: cleanText
  };
}

/**
 * Bóc tách chi tiết thông tin người gửi, người nhận, lời nhắn từ giao dịch ngân hàng
 */
export function extractTransferInfo(content, rawDesc = '') {
  const full = `${content} ${rawDesc}`;
  const upper = full.toUpperCase();
  let senderName = null;
  let receiverName = null;
  let remark = null;

  // 1. Cú pháp Napas/VietQR liên ngân hàng: CT tu <STK> <SENDER> (tai <BANK>) toi <STK> <RECEIVER> (tai <BANK>)
  const tuToiMatch = full.match(/(?:CT\s+)?tu\s+(?:[0-9]+\s+)?([A-Za-zÀ-ỹ\s]+?)(?:\s+tai\s+[A-Za-z0-9\s]+?)?\s+toi\s+(?:[0-9]+\s+)?([A-Za-zÀ-ỹ\s]+?)(?:\s+tai|\.|$)/i);
  if (tuToiMatch) {
    senderName = tuToiMatch[1].trim();
    receiverName = tuToiMatch[2].trim();
  }

  // 2. Cú pháp [NAME] chuyen tien / chuyen khoan
  if (!senderName) {
    const chuyenMatch = full.match(/(?:^|[.;\n])\s*([A-Za-zÀ-ỹ\s]{3,30})\s+chuyen(?:\s+tien|\s+khoan|\.|\s*$)/i);
    if (chuyenMatch) {
      senderName = chuyenMatch[1].trim();
    }
  }

  // 3. Trích xuất lời nhắn giao dịch (Remark)
  const ndMatch = full.match(/(?:ND|Noi dung|Nội dung)(?:\s+(?:giao dich|giao dịch))?[:\s]+(.*?)(?:\s*(?:\bSD\b|\bSo du\b|\bSố dư\b|$))/i);
  const rawND = ndMatch ? ndMatch[1].trim() : (rawDesc || full);
  const dotParts = rawND.split('.').map(p => p.trim()).filter(Boolean);
  for (const part of dotParts) {
    if (/^[0-9]+$/.test(part)) continue;
    if (/^(?:MBVCB|VCB|TCB|IBFT|FT[0-9]+)/i.test(part)) continue;
    if (/^CT\s+tu/i.test(part)) continue;
    if (/^Số dư/i.test(part)) continue;
    if (part.length >= 3) {
      remark = part;
      break;
    }
  }

  const isSenderOwner = senderName
    ? (senderName.toUpperCase().includes('VU HA KIEN') || senderName.toUpperCase().includes('KIEN VU'))
    : (upper.includes('VU HA KIEN CHUYEN') || upper.includes('KIEN VU CHUYEN'));

  const isReceiverOwner = receiverName
    ? (receiverName.toUpperCase().includes('VU HA KIEN') || receiverName.toUpperCase().includes('KIEN VU'))
    : false;

  return { senderName, receiverName, remark, isSenderOwner, isReceiverOwner };
}

/**
 * Gợi ý danh mục dựa trên từ khóa trong nội dung
 */
export function matchSuggestedCategory(description, rules = []) {
  const descUpper = (description || '').toUpperCase();

  // Bồi thường / phạt / đền mất vé xe -> Chi tiêu khác (KHÔNG PHẢI di chuyển xăng xe)
  if (/ĐỀN|PHẠT|BỒI THƯỜNG|MẤT VÉ|LÀM MẤT|ĐỀN BÙ|DEN MAT VE/i.test(descUpper)) {
    return {
      categoryId: 'cat_other_expense',
      isAutoApply: true,
      keyword: 'Bồi thường / Đền bù'
    };
  }

  // Nhận diện tự động các mẫu câu về trả nợ / trả tiền ăn / hoàn tiền
  if (/TRA TIEN|TRA NO|TRA HO|TIEN AN|TIEN COM|TRA LAI|REIMBURSE|HOAN TIEN|THAO TRA|CHUYEN TIEN QR|\bTRA\b/i.test(descUpper)) {
    return {
      categoryId: 'cat_debt_collect',
      isAutoApply: true,
      keyword: 'Trả tiền / Thu nợ'
    };
  }

  for (const rule of rules) {
    if (descUpper.includes(rule.keyword.toUpperCase())) {
      return {
        categoryId: rule.category_id,
        isAutoApply: Boolean(rule.is_auto_apply),
        keyword: rule.keyword
      };
    }
  }

  return null;
}

