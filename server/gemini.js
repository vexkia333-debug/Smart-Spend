/**
 * Module tích hợp Google AI Studio (Gemini Flash) để phân tích ngôn ngữ tự nhiên và phân loại chi tiêu
 * Hỗ trợ danh sách model dự phòng (Model Fallback Pool) và cơ chế tự động phân loại thông minh khi máy chủ Google quá tải
 */

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash'
];

export async function parseTransactionWithGemini(userText, categories = [], apiKey, options = {}) {
  if (!userText || !userText.trim()) {
    throw new Error('Vui lòng nhập nội dung chi tiêu cần phân tích');
  }

  // Nếu không có API Key, sử dụng ngay bộ lọc thông minh nội bộ
  if (!apiKey) {
    return fallbackLocalParse(userText, categories, options);
  }

  const categoryListPrompt = categories.map(c => `- ID: "${c.id}", Tên: "${c.name}", Loại: "${c.type}"`).join('\n');

  const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const todayStr = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-${String(vnNow.getDate()).padStart(2, '0')}`;

  const prompt = `Bạn là trợ lý tài chính cá nhân thông minh của hệ thống SmartSpend tại Việt Nam.
Nhiệm vụ của bạn là đọc và phân tích đoạn văn bản chi tiêu/thu nhập tự nhiên (ví dụ: "vừa ăn bún bò 45k", "mua áo Uniqlo 599k", "nhận lương 20tr", "rút tiền mặt 2tr", "cho Nam vay 500k", "Nam trả nợ 500k", "hôm qua uống bia 200k tiền mặt", "trưa nay ăn bún chả 40k", "ngày 15/10 mua quà 300k") hoặc nội dung giao dịch chuyển khoản.

THỜI ĐIỂM HIỆN TẠI: Hôm nay là ngày ${todayStr} (theo múi giờ Việt Nam).
VĂN BẢN ĐẦU VÀO CẦN PHÂN TÍCH:
"""${userText.trim()}"""

${options.expectedType ? `LƯU Ý RẤT QUAN TRỌNG VỀ LOẠI GIAO DỊCH: Đây là giao dịch ${options.expectedType === 'INCOME' ? 'TIỀN VÀO TÀI KHOẢN (INCOME)' : 'TIỀN CHI RA (EXPENSE)'}. BẮT BUỘC ĐẶT type = "${options.expectedType}" VÀ CHỈ ĐƯỢC CHỌN DANH MỤC CÙNG LOẠI.` : ''}
${options.originalAmount ? `LƯU Ý VỀ TỔNG SỐ TIỀN: Giao dịch này có tổng số tiền ban đầu là ${options.originalAmount} VNĐ.` : ''}
${options.forceCash ? 'LƯU Ý: Người dùng đang chọn chế độ [Chi bằng Tiền mặt], hãy đặt wallet = "CASH".' : ''}

QUY TẮC PHÂN TÍCH & PHÂN LOẠI DANH MỤC THÔNG MINH:
1. Số tiền: Phải quy đổi chính xác về số nguyên VNĐ (ví dụ: 45k -> 45000, 1.2tr hoặc 1tr2 -> 1200000, 25 triệu -> 25000000).
2. Loại (type):
   - "EXPENSE": Chi tiêu hoặc chuyển tiền đưa đi.
   - "INCOME": Thu nhập, nhận tiền hoặc thu hồi nợ.

3. QUY TẮC NHẬN DIỆN THỜI GIAN GIAO DỊCH:
   - Nếu câu nói có nhắc đến ngày trong quá khứ hoặc thời gian cụ thể:
     + "hôm qua" / "tối qua" / "sáng qua" => tính lùi 1 ngày so với ngày hôm nay ${todayStr}.
     + "hôm kia" => tính lùi 2 ngày so với ngày hôm nay ${todayStr}.
     + Ngày cụ thể như "ngày 15/10", "15-10" => đặt "customDate" dạng "YYYY-MM-DD" với năm hiện tại.
     + Giờ cụ thể như "lúc 14h", "trưa 12h30", "sáng 8h" => đặt "customTime" dạng "HH:mm".
     + Nếu KHÔNG đề cập ngày hoặc nói "vừa mới", "hôm nay", "sáng nay", "trưa nay", "tối nay" => đặt "customDate" = null.
     + Nếu KHÔNG đề cập giờ cụ thể => đặt "customTime" = null.

4. QUY TẮC TÁCH GIAO DỊCH (SPLIT EXPENSE):
   - Khi câu nói thể hiện vừa chi cho cá nhân vừa trả hộ / cho người khác mượn (Ví dụ: "tôi ăn hết 101k còn lại là trả hộ", "ăn 101k trả hộ bạn", "ăn 80k cho Thảo mượn 40k", "tiền ăn 443k tôi ăn 101k"):
     => Đặt "isSplit": true
     => Tạo mảng "splits" gồm các phần:
        + Phần cá nhân: amount = số tiền cá nhân (ví dụ: 101000), categoryId = "cat_food", description = "Ăn trưa (phần cá nhân)"
        + Phần trả hộ: amount = (Tổng tiền ban đầu ${options.originalAmount || 'trong câu'} - phần cá nhân), categoryId = "cat_loan", description = "Trả hộ tiền ăn bạn bè"
     => Nếu không có yêu cầu tách tiền, đặt "isSplit": false và "splits": null.

5. QUY TẮC CHỌN DANH MỤC ĐẶC BIỆT:
   - TIỀN TRẢ NỢ / THU NỢ: Khi là TIỀN VÀO (INCOME) hoặc có từ khóa "trả nợ", "bạn trả tiền", "người khác trả", "thu nợ" => BẮT BUỘC gán "cat_debt_collect" (Thu hồi nợ / Nhận tiền trả), type = "INCOME". TUYỆT ĐỐI KHÔNG gán "cat_loan" hay "cat_other_expense"!
   - ĐỀN BÙ / NỘP PHẠT: "đền mất vé xe", "đền tiền", "nộp phạt", "bồi thường" => BẮT BUỘC gán "cat_other_expense" (Chi tiêu khác). TUYỆT ĐỐI KHÔNG gán "cat_transport"!
   - TIỀN ĐI NHẬU: "tiền đi nhậu", "nhậu nhẹt", "uống bia" => gán "cat_food" (Cơm & Đồ ăn) với mô tả "Tiền đi nhậu", KHÔNG PHẢI chuyển tiền nội bộ.

6. QUY TẮC CHỌN HOẶC TỰ ĐỘNG TẠO DANH MỤC:
   - ƯU TIÊN 1 (Gán vào danh mục có sẵn): Nếu nội dung chi tiêu/thu nhập phù hợp rõ ràng với một trong các danh mục hiện có:
     + Đồ ăn, bữa ăn (cơm, bún bò, phở, bánh mì, hủ tiếu, quán ăn, nhà hàng, đồ ăn vặt, đi nhậu) -> "cat_food" (Cơm & Đồ ăn).
     + Đồ uống (cà phê, trà sữa, trà đá, nước ngọt, Highlands, Phúc Long, The Coffee House, Starbucks, Katinat, Mixue...) -> "cat_drink" (Cà phê & Đồ uống).
     + Rút tiền mặt ATM -> "cat_transfer_cash" (Rút tiền vào Ví (ATM)).
     + Cho vay / mượn tiền / chi tiền trả hộ -> "cat_loan" (Cho vay & Cho mượn).
     + Nhận lại tiền người khác trả nợ / trả tiền ăn -> "cat_debt_collect" (Thu hồi nợ / Nhận tiền trả).
     + Đi lại, xăng xe, Grab, taxi, gửi xe -> "cat_transport" (Di chuyển & Xăng xe).
     + Mua sắm quần áo, đồ dùng siêu thị, Shopee, Tiki -> "cat_shopping" (Mua sắm & Siêu thị).
     + Hóa đơn: Điện nước, internet, rác, nạp điện thoại -> "cat_bills" (Hóa đơn & Tiện ích).
     + Xem phim, game, du lịch giải trí -> "cat_entertainment" (Giải trí & Phim ảnh).
     + Thuốc men, khám bệnh, nha khoa -> "cat_health" (Sức khỏe & Thuốc).
     + Tiền học, mua sách, khóa học -> "cat_education" (Học tập & Sách).
     + Đồ gia dụng, sửa nhà, tiền trọ -> "cat_housing" (Nhà cửa & Đồ gia dụng).
     + Lương -> "cat_salary", Thưởng/ngoài giờ -> "cat_freelance", Lãi đầu tư -> "cat_investment".
     + Đền bù, nộp phạt, sự cố -> "cat_other_expense" (Chi tiêu khác).
     => Khi chọn danh mục có sẵn: Đặt "categoryId" = ID danh mục đó, "isNewCategory" = false, "newCategory" = null.

   - ƯU TIÊN 2 (TỰ ĐỘNG TẠO DANH MỤC MỚI): CHỈ KHI khoản chi/thu thực sự thuộc về một nhóm lĩnh vực hoàn toàn mới chưa hề có trong danh sách trên:
     => Hãy tự động đề xuất tạo danh mục mới chuẩn xác:
     + Đặt "isNewCategory" = true
     + Đặt "categoryId" = null
     + "newCategory": {
         "name": Tên danh mục khái quát, ngắn gọn, chuẩn mực,
         "icon": Tên một Lucide React icon phù hợp,
         "color": Mã màu HEX pastel/vibrant đẹp
       }

7. wallet:
   - "INTERNAL_TRANSFER": Khi chuyển tiền giữa các tài khoản ngân hàng hoặc ví với nhau.
   - "TRANSFER_TO_CASH": Khi rút tiền mặt từ thẻ/ngân hàng về ví tiền mặt.
   - "CASH": Khi câu nói có từ "tiền mặt", "ví", "tiền túi", "trả mặt", hoặc chi tiêu vặt hoặc options.forceCash = true.
   - "BANK": Khi chuyển khoản, quét mã QR ngân hàng, hoặc mặc định nếu không nhắc đến tiền mặt.
8. description: Tên khoản chi hoặc thu rõ ràng, lịch sự.

Trả về DUY NHẤT một đối tượng JSON hợp lệ theo định dạng:
{
  "amount": number,
  "type": "EXPENSE" | "INCOME",
  "categoryId": string | null,
  "customDate": string | null,
  "customTime": string | null,
  "isSplit": boolean,
  "splits": [
    {
      "amount": number,
      "categoryId": string,
      "description": string
    }
  ] | null,
  "isNewCategory": boolean,
  "newCategory": {
    "name": string,
    "icon": string,
    "color": string
  } | null,
  "description": string,
  "wallet": "CASH" | "BANK" | "TRANSFER_TO_CASH" | "INTERNAL_TRANSFER",
  "sourceBank": string | null,
  "targetBank": string | null,
  "borrower": string | null,
  "bankName": string | null,
  "reasoning": string
}
`;

  // Thử lần lượt các Model trong danh sách dự phòng (Failover Pool)
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        return formatParsedResult(data, userText, options);
      }

      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || `HTTP ${response.status}`;
      console.warn(`[Gemini Fallback] Model ${model} gặp sự cố (${response.status}): ${message}. Đang chuyển model tiếp theo...`);
      lastError = new Error(message);

      // Nếu model bị 503 (quá tải) hoặc 429 (rate limit), tiếp tục vòng lặp sang model khác
      if (response.status === 503 || response.status === 429 || response.status === 500) {
        continue;
      }
    } catch (e) {
      console.warn(`[Gemini Fallback] Lỗi kết nối model ${model}:`, e.message);
      lastError = e;
    }
  }

  // Nếu tất cả model của Google đều quá tải hoặc mất mạng, tự động dùng bộ phân tích thông minh nội bộ
  console.log('[Gemini Fallback] Tất cả model Google tạm thời bận. Kích hoạt bộ phân loại thông minh nội bộ.');
  return fallbackLocalParse(userText, categories, options);
}

function formatParsedResult(data, userText, options) {
  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawContent) {
    return fallbackLocalParse(userText, [], options);
  }

  try {
    const parsed = JSON.parse(rawContent.trim());
    const isCashExplicit = options.forceCash || 
      /tiền\s*mặt|tiền\s*túi|trong\s*ví|trả\s*mặt/i.test(userText) || 
      parsed.wallet === 'CASH';

    let categoryId = parsed.categoryId || null;
    let type = options.expectedType || (parsed.type === 'INCOME' ? 'INCOME' : 'EXPENSE');

    // Bảo vệ loại danh mục đúng chuẩn Thu/Chi
    if (type === 'INCOME') {
      if (categoryId === 'cat_loan' || categoryId === 'cat_other_expense') {
        categoryId = 'cat_debt_collect';
      }
    }

    return {
      amount: Math.abs(Number(parsed.amount)) || 50000,
      type,
      categoryId,
      isSplit: Boolean(parsed.isSplit && Array.isArray(parsed.splits) && parsed.splits.length > 1),
      splits: (parsed.isSplit && Array.isArray(parsed.splits) && parsed.splits.length > 1) ? parsed.splits : null,
      isNewCategory: Boolean(parsed.isNewCategory),
      newCategory: parsed.isNewCategory && parsed.newCategory ? {
        name: String(parsed.newCategory.name || 'Chi tiêu mới').trim(),
        icon: String(parsed.newCategory.icon || 'Tag').trim(),
        color: String(parsed.newCategory.color || '#ec4899').trim()
      } : null,
      description: parsed.description || userText,
      wallet: parsed.wallet === 'INTERNAL_TRANSFER'
        ? 'INTERNAL_TRANSFER'
        : (parsed.wallet === 'TRANSFER_TO_CASH' || parsed.categoryId === 'cat_transfer_cash'
            ? 'TRANSFER_TO_CASH'
            : (isCashExplicit ? 'CASH' : (parsed.wallet || 'BANK'))),
      customDate: parsed.customDate || null,
      customTime: parsed.customTime || null,
      sourceBank: parsed.sourceBank || null,
      targetBank: parsed.targetBank || null,
      borrower: parsed.borrower || null,
      bankName: parsed.bankName || null,
      reasoning: parsed.reasoning || 'Tự động phân loại bởi Gemini AI'
    };
  } catch {
    return fallbackLocalParse(userText, [], options);
  }
}

/**
 * Bộ phân tích thông minh nội bộ (dự phòng an toàn tuyệt đối khi Google AI quá tải)
 */
function fallbackLocalParse(userText, categories = [], options = {}) {
  const text = (userText || '').trim();
  const lower = text.toLowerCase();

  // 1. Bóc tách số tiền
  let amount = options.originalAmount || 50000;
  const trMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|củ)/i) || text.match(/(\d+)tr(\d+)/i);
  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn|lít)/i);
  const rawNumMatch = text.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(?:đ|vnd|đồng)?/i);

  if (trMatch) {
    if (trMatch[2] !== undefined && text.includes('tr')) {
      const whole = parseFloat(trMatch[1]);
      const frac = parseFloat(trMatch[2]);
      amount = whole * 1000000 + frac * (frac < 10 ? 100000 : 10000);
    } else {
      amount = parseFloat(trMatch[1].replace(',', '.')) * 1000000;
    }
  } else if (kMatch) {
    amount = parseFloat(kMatch[1].replace(',', '.')) * 1000;
  } else if (rawNumMatch) {
    amount = parseFloat(rawNumMatch[1].replace(/[.,]/g, ''));
  }

  // Kiểm tra yêu cầu tách tiền vừa ăn vừa trả hộ
  const splitMatch = text.match(/(?:tôi\s+ăn|ăn|mình\s+ăn|phần\s+tôi|phần\s+mình)\s*(?:hết)?\s*(\d+k|\d+tr|\d+[\d.,]*)\s*(?:còn\s*lại\s*(?:là)?)?\s*(?:trả\s*hộ|cho\s*mượn|cho\s*vay)/i);
  let isSplit = false;
  let splits = null;
  if (splitMatch) {
    let personalAmt = 0;
    const pStr = splitMatch[1];
    if (/k|nghìn|ngàn/i.test(pStr)) personalAmt = parseFloat(pStr) * 1000;
    else if (/tr|triệu/i.test(pStr)) personalAmt = parseFloat(pStr) * 1000000;
    else personalAmt = parseFloat(pStr.replace(/[.,]/g, ''));

    const totalAmt = options.originalAmount || amount;
    if (personalAmt > 0 && totalAmt > personalAmt) {
      isSplit = true;
      splits = [
        { amount: personalAmt, categoryId: 'cat_food', description: 'Ăn trưa (phần cá nhân)' },
        { amount: totalAmt - personalAmt, categoryId: 'cat_loan', description: 'Trả hộ tiền ăn bạn bè' }
      ];
    }
  }

  // 2. Xác định Loại Thu nhập / Chi tiêu
  const isIncome = options.expectedType === 'INCOME' || 
    (options.expectedType !== 'EXPENSE' && /lương|thưởng|thu\s*tiền|nhận\s*tiền|được\s*cho|tiền\s*về|trả\s*nợ|thu\s*nợ|lãi/i.test(lower));
  const type = isIncome ? 'INCOME' : 'EXPENSE';

  // 3. Xác định Danh mục phù hợp
  let categoryId = null;
  if (isIncome) {
    if (/trả\s*nợ|thu\s*nợ|trả\s*tiền|hoàn\s*tiền|tiền\s*ăn/i.test(lower)) categoryId = 'cat_debt_collect';
    else if (/lương/i.test(lower)) categoryId = 'cat_salary';
    else if (/thưởng|freelance|ngoài\s*giờ/i.test(lower)) categoryId = 'cat_freelance';
    else if (/lãi|đầu\s*tư|cổ\s*phiếu/i.test(lower)) categoryId = 'cat_investment';
    else categoryId = 'cat_debt_collect';
  } else {
    if (/đền|phạt|bồi\s*thường|mất\s*vé|làm\s*mất/i.test(lower)) categoryId = 'cat_other_expense';
    else if (/nhậu|uống\s*bia/i.test(lower)) categoryId = 'cat_food';
    else if (/cơm|bún|phở|ăn|bánh|thịt|rau|trưa|tối|sáng|mì|cháo|lẩu|nướng/i.test(lower)) categoryId = 'cat_food';
    else if (/cà\s*phê|cafe|trà|nước|highlands|phúc\s*long|katinat|starbucks|mixue/i.test(lower)) categoryId = 'cat_drink';
    else if (/grab|xe|xăng|taxi|be|gửi\s*xe|vé\s*xe/i.test(lower)) categoryId = 'cat_transport';
    else if (/mua|siêu\s*thị|áo|quần|shopee|tiki|lazada|tiệm/i.test(lower)) categoryId = 'cat_shopping';
    else if (/điện|nước|internet|wifi|rác|hóa\s*đơn|mạng/i.test(lower)) categoryId = 'cat_bills';
    else if (/thuốc|bệnh|khám|nha\s*khoa|y\s*tế/i.test(lower)) categoryId = 'cat_health';
    else if (/phim|game|du\s*lịch|vé\s*xem/i.test(lower)) categoryId = 'cat_entertainment';
    else if (/cho\s*vay|cho\s*mượn|trả\s*hộ/i.test(lower)) categoryId = 'cat_loan';
    else if (/rút\s*tiền|rút\s*atm/i.test(lower)) categoryId = 'cat_transfer_cash';
    else categoryId = 'cat_other_expense';
  }

  // 4. Tạo mô tả khoản tiền rõ ràng
  let description = text
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn|tr|triệu|củ|lít|đ|vnd|đồng)/gi, '')
    .replace(/(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/g, '')
    .replace(/vừa|hôm\s*nay|mới|hết|mất|tiền\s*mặt|chi\s*hết/gi, '')
    .trim();
  if (!description || description.length < 2) {
    description = text;
  }
  description = description.charAt(0).toUpperCase() + description.slice(1);

  const isCashExplicit = options.forceCash || 
    /tiền\s*mặt|tiền\s*túi|trong\s*ví|trả\s*mặt/i.test(text);

  // Nhận diện ngày/giờ nếu người dùng có nói trong câu
  let customDate = null;
  let customTime = null;
  const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  if (/hôm\s*qua|tối\s*qua|sáng\s*qua/i.test(lower)) {
    const d = new Date(vnNow);
    d.setDate(d.getDate() - 1);
    customDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else if (/hôm\s*kia/i.test(lower)) {
    const d = new Date(vnNow);
    d.setDate(d.getDate() - 2);
    customDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else {
    const dateMatch = lower.match(/(?:ngày\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i);
    if (dateMatch) {
      const d = String(dateMatch[1]).padStart(2, '0');
      const m = String(dateMatch[2]).padStart(2, '0');
      const y = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : String(vnNow.getFullYear());
      customDate = `${y}-${m}-${d}`;
    }
  }

  const timeMatch = lower.match(/(?:lúc\s*)?(\d{1,2})h(?:(\d{2}))?/i);
  if (timeMatch) {
    const h = String(timeMatch[1]).padStart(2, '0');
    const min = String(timeMatch[2] || '00').padStart(2, '0');
    customTime = `${h}:${min}`;
  }

  return {
    amount: Math.round(amount),
    type,
    categoryId,
    customDate,
    customTime,
    isSplit,
    splits,
    isNewCategory: false,
    newCategory: null,
    description,
    wallet: categoryId === 'cat_transfer_cash' ? 'TRANSFER_TO_CASH' : (isCashExplicit ? 'CASH' : 'BANK'),
    sourceBank: null,
    targetBank: null,
    borrower: null,
    bankName: null,
    reasoning: 'Tự động phân loại thông minh (Hệ thống dự phòng)'
  };
}

/**
 * Tạo báo cáo tài chính đánh giá cuối ngày bằng Gemini Flash
 */
export async function generateDailyAiReport({ date, txs = [], totalIncome = 0, totalExpense = 0, netFlow = 0, catMap = {}, apiKey }) {
  if (!apiKey || !txs.length) return null;

  const txListStr = txs
    .map((t) => `- [${t.type === 'INCOME' ? '+' : '-'}${t.amount}đ] ${t.category_name || 'Chưa gắn thẻ'}: ${t.description} (TK: ${t.account_name || t.bank_name}, ID: ${t.id})`)
    .join('\n');

  const prompt = `Bạn là chuyên gia cố vấn tài chính cá nhân thông minh của hệ thống SmartSpend tại Việt Nam.
Hãy lập BÁO CÁO ĐÁNH GIÁ TÀI CHÍNH CUỐI NGÀY (${date}) dựa trên các giao dịch thực tế của người dùng:
- TỔNG THU HÔM NAY: ${new Intl.NumberFormat('vi-VN').format(totalIncome)} VNĐ
- TỔNG CHI HÔM NAY: ${new Intl.NumberFormat('vi-VN').format(totalExpense)} VNĐ
- DÒNG TIỀN RÒNG: ${new Intl.NumberFormat('vi-VN').format(netFlow)} VNĐ

DANH SÁCH GIAO DỊCH TRONG NGÀY:
${txListStr}

YÊU CẦU ĐÁNH GIÁ CHUYÊN SÂU:
1. "rating": Đánh giá mức độ kỷ luật hôm nay: "Rất tốt 🌟" | "Cân đối 👍" | "Cần chú ý ⚠️" | "Chi vượt định mức 🚨".
2. "overview": Tóm tắt súc tích 1-2 câu về tình hình thu chi và thói quen tiêu dùng trong ngày.
3. "anomalies": Mảng các chuỗi nhận xét phát hiện điểm bất thường:
   - Các khoản chi lớn bất thường hoặc chiếm tỷ trọng cao.
   - Các khoản nghi vấn xếp nhầm danh mục (ví dụ tiền phạt/đền bù bị xếp vào di chuyển, tiền trả nợ bị xếp vào chi tiêu...).
   - Nếu không có bất thường, trả về mảng có 1 câu khen ngợi kỷ luật tốt.
4. "advice": 1-2 câu lời khuyên tài chính ngắn gọn, ấm áp cho ngày mai.
5. "suggestedEdits": Mảng các giao dịch cụ thể đề xuất người dùng nên bấm vào chỉnh sửa lại (nếu có nghi vấn):
   [
     {
       "txId": string,
       "txDescription": string,
       "currentCategory": string,
       "suggestedCategory": string,
       "reason": string
     }
   ]

Trả về DUY NHẤT một JSON hợp lệ:
{
  "rating": string,
  "overview": string,
  "anomalies": [string],
  "advice": string,
  "suggestedEdits": [
    {
      "txId": string,
      "txDescription": string,
      "currentCategory": string,
      "suggestedCategory": string,
      "reason": string
    }
  ]
}`;

  for (const model of GEMINI_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) continue;
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;
      return JSON.parse(rawText);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Bộ tạo báo cáo cuối ngày dự phòng thông minh (khi offline hoặc không có API Key)
 */
export function generateFallbackDailyReport({ date, txs = [], totalIncome = 0, totalExpense = 0, netFlow = 0, catMap = {} }) {
  const anomalies = [];
  const suggestedEdits = [];

  const expenses = txs.filter((t) => t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_'));
  if (expenses.length > 0) {
    const sorted = [...expenses].sort((a, b) => b.amount - a.amount);
    const maxTx = sorted[0];
    if (maxTx.amount >= 150000) {
      anomalies.push(`Khoản chi lớn nhất hôm nay là "${maxTx.description}" (${new Intl.NumberFormat('vi-VN').format(maxTx.amount)} ₫).`);
    }
  }

  // Quét bất thường về danh mục
  txs.forEach((t) => {
    const desc = (t.description || '').toLowerCase();
    if (t.type === 'EXPENSE' && (desc.includes('đền') || desc.includes('phạt') || desc.includes('mất vé')) && t.category_name?.includes('Di chuyển')) {
      anomalies.push(`Khoản "${t.description}" (${new Intl.NumberFormat('vi-VN').format(t.amount)} ₫) là đền bù/tiền phạt nhưng đang ở danh mục Di chuyển.`);
      suggestedEdits.push({
        txId: t.id,
        txDescription: t.description,
        currentCategory: t.category_name,
        suggestedCategory: 'Chi tiêu khác',
        reason: 'Tiền phạt/đền bù thuộc nhóm Chi tiêu khác'
      });
    }
    if (t.type === 'INCOME' && (desc.includes('trả') || desc.includes('thu nợ')) && t.category_id?.includes('loan')) {
      anomalies.push(`Khoản tiền vào "${t.description}" đang bị gán vào mục Cho vay mượn.`);
      suggestedEdits.push({
        txId: t.id,
        txDescription: t.description,
        currentCategory: t.category_name,
        suggestedCategory: 'Thu hồi nợ / Nhận tiền trả',
        reason: 'Khoản tiền nhận về từ người khác trả'
      });
    }
  });

  const rating =
    totalExpense > totalIncome && totalIncome > 0
      ? 'Cần chú ý ⚠️'
      : totalExpense === 0
      ? 'Xuất sắc 🌟'
      : 'Cân đối 👍';

  const overview =
    totalExpense > 0
      ? `Hôm nay bạn đã chi tiêu ${new Intl.NumberFormat('vi-VN').format(totalExpense)} ₫ qua ${expenses.length} khoản chi${
          totalIncome > 0 ? ` và thu về ${new Intl.NumberFormat('vi-VN').format(totalIncome)} ₫` : ''
        }.`
      : `Hôm nay bạn chưa phát sinh khoản chi tiêu nào. Dòng tiền được giữ vững trọn vẹn!`;

  const advice =
    totalExpense > 250000
      ? 'Hôm nay tổng chi tương đối đáng kể. Ngày mai hãy ưu tiên các nhu cầu thiết yếu và giữ vững ngân sách nhé!'
      : 'Bạn đang quản lý chi tiêu trong ngày rất tốt. Hãy tiếp tục duy trì mức chi tiêu hợp lý này!';

  return {
    rating,
    overview,
    anomalies: anomalies.length > 0 ? anomalies : ['Không phát hiện khoản chi tiêu bất thường hay nghi vấn xếp sai danh mục.'],
    advice,
    suggestedEdits
  };
}
