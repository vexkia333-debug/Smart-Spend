/**
 * Module tích hợp Google AI Studio (Gemini Flash) để phân tích ngôn ngữ tự nhiên và phân loại chi tiêu
 * Hỗ trợ danh sách model dự phòng (Model Fallback Pool) và cơ chế tự động phân loại thông minh khi máy chủ Google quá tải
 */

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash'
];

export async function parseTransactionWithGemini(userText, categories = [], apiKey, options = {}) {
  if (!userText || !userText.trim()) {
    throw new Error('Vui lòng nhập nội dung chi tiêu cần phân tích');
  }

  // BƯỚC 1: Chạy Engine NLU Tiếng Việt tốc độ cao (< 1ms)
  const localResult = fallbackLocalParse(userText, categories, options);

  // Nếu không có API Key HOẶC Engine NLU đã nhận diện rõ ràng số tiền + danh mục (độ tin cậy cao),
  // trả kết quả ngay lập tức (0ms) mà không cần chờ mạng từ máy chủ Google!
  if (!apiKey || localResult.isHighConfidence) {
    return localResult;
  }

  const categoryListPrompt = categories.length > 0
    ? categories.map(c => `- "${c.id}": "${c.name}" (${c.type})`).join('\n')
    : '';

  const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const todayStr = `${vnNow.getFullYear()}-${String(vnNow.getMonth() + 1).padStart(2, '0')}-${String(vnNow.getDate()).padStart(2, '0')}`;

  const prompt = `Trợ lý tài chính SmartSpend VN. Hôm nay: ${todayStr}.
Phân tích câu: """${userText.trim()}"""
${categoryListPrompt ? `Danh mục:\n${categoryListPrompt}` : ''}
${options.expectedType ? `Bắt buộc type="${options.expectedType}".` : ''}
${options.originalAmount ? `Tổng tiền gốc=${options.originalAmount}.` : ''}
${options.forceCash ? 'Bắt buộc wallet="CASH".' : ''}
Quy tắc:
1. Quy đổi tiền VNĐ (45k->45000, 1tr2->1200000).
2. Nếu có >=2 khoản chi/thu nối bằng "+", ",", "và" hoặc vừa chi cá nhân vừa trả hộ: đặt isSplit=true, amount=tổng, splits=[{amount, categoryId, description, type}].
3. Nếu thuộc lĩnh vực hoàn toàn mới chưa có trong danh mục: isNewCategory=true, categoryId=null, newCategory={name, icon, color}.
4. description lịch sự, viết hoa chữ đầu, bỏ số tiền.
Trả về 1 JSON object:
{"amount":number,"type":"EXPENSE"|"INCOME","categoryId":string|null,"customDate":"YYYY-MM-DD"|null,"customTime":"HH:mm"|null,"isSplit":boolean,"splits":[{"amount":number,"categoryId":string,"description":string,"type":"EXPENSE"|"INCOME"}]|null,"isNewCategory":boolean,"newCategory":{"name":string,"icon":string,"color":string}|null,"description":string,"wallet":"CASH"|"BANK"|"TRANSFER_TO_CASH"|"INTERNAL_TRANSFER","sourceBank":string|null,"targetBank":string|null,"reasoning":string}`;

  // BƯỚC 2: Gọi song song (Parallel Race) các model Gemini với timeout ngắn (3.2s)
  // Model nào phản hồi 200 OK đầu tiên sẽ được lấy ngay, tránh chờ tuần tự hàng chục giây khi 1 model bị 503
  const callModel = async (model) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3200),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const text = extractRawTextFromGeminiResponse(data);
    if (!text) throw new Error('Empty response');
    return data;
  };

  try {
    const fastestData = await Promise.any(GEMINI_MODELS.map(m => callModel(m)));
    return formatParsedResult(fastestData, userText, categories, options);
  } catch {
    // Nếu tất cả model Google đang bận (503/timeout), trả về kết quả từ bộ phân tích thông minh nội bộ ngay
    return localResult;
  }
}

function extractRawTextFromGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  // Ưu tiên lấy part không phải là internal thought
  const nonThoughtPart = parts.find(p => !p.thought && typeof p.text === 'string' && p.text.trim());
  const raw = nonThoughtPart ? nonThoughtPart.text : parts[parts.length - 1]?.text;
  if (!raw || typeof raw !== 'string') return null;
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function formatParsedResult(data, userText, categories = [], options = {}) {
  const rawContent = extractRawTextFromGeminiResponse(data);

  if (!rawContent) {
    return fallbackLocalParse(userText, categories, options);
  }

  try {
    let parsed = JSON.parse(rawContent);

    // Nếu AI trả về một mảng các giao dịch (ví dụ: [{amount: 60000, ...}, {amount: 20000, ...}])
    // hoặc trả về object có thuộc tính transactions / items
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return fallbackLocalParse(userText, categories, options);
      }
      if (parsed.length === 1) {
        parsed = parsed[0];
      } else {
        const mappedSplits = parsed
          .map(item => ({
            amount: Math.abs(Number(item.amount)) || 0,
            categoryId: item.categoryId || item.category_id || inferCategoryFromText(item.description || '', item.type || 'EXPENSE'),
            description: cleanDescriptionText(item.description || userText),
            type: item.type === 'INCOME' ? 'INCOME' : 'EXPENSE'
          }))
          .filter(s => s.amount > 0);

        if (mappedSplits.length > 1) {
          const totalAmt = mappedSplits.reduce((sum, s) => sum + s.amount, 0);
          parsed = {
            ...parsed[0],
            amount: totalAmt,
            isSplit: true,
            splits: mappedSplits,
            description: mappedSplits.map(s => s.description).join(' + '),
            reasoning: parsed[0]?.reasoning || `Tự động tách ${mappedSplits.length} khoản giao dịch bởi Gemini AI`
          };
        } else if (mappedSplits.length === 1) {
          parsed = {
            ...parsed[0],
            amount: mappedSplits[0].amount,
            categoryId: mappedSplits[0].categoryId,
            description: mappedSplits[0].description
          };
        }
      }
    } else if (parsed && typeof parsed === 'object' && !parsed.isSplit) {
      const subArray = Array.isArray(parsed.transactions) ? parsed.transactions : (Array.isArray(parsed.items) ? parsed.items : null);
      if (subArray && subArray.length > 1) {
        const mappedSplits = subArray
          .map(item => ({
            amount: Math.abs(Number(item.amount)) || 0,
            categoryId: item.categoryId || item.category_id || inferCategoryFromText(item.description || '', item.type || 'EXPENSE'),
            description: cleanDescriptionText(item.description || userText),
            type: item.type === 'INCOME' ? 'INCOME' : 'EXPENSE'
          }))
          .filter(s => s.amount > 0);
        if (mappedSplits.length > 1) {
          parsed.isSplit = true;
          parsed.splits = mappedSplits;
          parsed.amount = mappedSplits.reduce((sum, s) => sum + s.amount, 0);
        }
      }
    }

    // Kiểm tra dự phòng: Nếu người dùng nhập nhiều khoản rõ ràng bằng dấu "+" (VD: "đổ xăng 60k + mua bánh xà phòng tắm 20k")
    // nhưng AI lại chưa tách (isSplit = false) hoặc gộp sai số tiền
    const localFallback = fallbackLocalParse(userText, categories, options);
    if ((!parsed.isSplit || !Array.isArray(parsed.splits) || parsed.splits.length < 2) && localFallback.isSplit && localFallback.splits?.length > 1) {
      parsed.isSplit = true;
      parsed.splits = localFallback.splits;
      parsed.amount = localFallback.amount;
    }

    const isCashExplicit = options.forceCash || 
      /tiền\s*mặt|tiền\s*túi|trong\s*ví|trả\s*mặt/i.test(userText) || 
      parsed.wallet === 'CASH';

    let type = options.expectedType || (parsed.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
    let categoryId = parsed.categoryId || parsed.category_id || null;

    if (!categoryId && !parsed.isNewCategory) {
      categoryId = inferCategoryFromText(parsed.description || userText, type);
    }

    // Bảo vệ loại danh mục đúng chuẩn Thu/Chi
    if (type === 'INCOME') {
      if (categoryId === 'cat_loan' || categoryId === 'cat_other_expense') {
        categoryId = 'cat_debt_collect';
      }
    }

    // Chuẩn hóa mảng splits nếu có
    let validSplits = null;
    if (parsed.isSplit && Array.isArray(parsed.splits) && parsed.splits.length > 1) {
      validSplits = parsed.splits
        .map(s => {
          const sType = options.expectedType || (s.type === 'INCOME' ? 'INCOME' : type);
          let sCat = s.categoryId || s.category_id || inferCategoryFromText(s.description || '', sType);
          if (sType === 'INCOME' && (sCat === 'cat_loan' || sCat === 'cat_other_expense')) {
            sCat = 'cat_debt_collect';
          }
          return {
            amount: Math.abs(Number(s.amount)) || 0,
            categoryId: sCat || (sType === 'INCOME' ? 'cat_other_income' : 'cat_other_expense'),
            description: cleanDescriptionText(s.description || 'Khoản giao dịch'),
            type: sType
          };
        })
        .filter(s => s.amount > 0);
    }

    const isSplitValid = Boolean(validSplits && validSplits.length > 1);
    const finalAmount = isSplitValid
      ? validSplits.reduce((sum, s) => sum + s.amount, 0)
      : (Math.abs(Number(parsed.amount)) || localFallback.amount || 50000);

    return {
      amount: finalAmount,
      type,
      categoryId,
      isSplit: isSplitValid,
      splits: isSplitValid ? validSplits : null,
      isNewCategory: Boolean(parsed.isNewCategory),
      newCategory: parsed.isNewCategory && parsed.newCategory ? {
        name: String(parsed.newCategory.name || 'Chi tiêu mới').trim(),
        icon: String(parsed.newCategory.icon || 'Tag').trim(),
        color: String(parsed.newCategory.color || '#ec4899').trim()
      } : null,
      description: cleanDescriptionText(parsed.description || localFallback.description || userText),
      wallet: parsed.wallet === 'INTERNAL_TRANSFER'
        ? 'INTERNAL_TRANSFER'
        : (parsed.wallet === 'TRANSFER_TO_CASH' || categoryId === 'cat_transfer_cash'
            ? 'TRANSFER_TO_CASH'
            : (isCashExplicit ? 'CASH' : (parsed.wallet || 'BANK'))),
      customDate: parsed.customDate || localFallback.customDate || null,
      customTime: parsed.customTime || localFallback.customTime || null,
      sourceBank: parsed.sourceBank || null,
      targetBank: parsed.targetBank || null,
      borrower: parsed.borrower || null,
      bankName: parsed.bankName || null,
      reasoning: parsed.reasoning || (isSplitValid ? `Tự động tách ${validSplits.length} khoản bởi Gemini AI` : 'Tự động phân loại bởi Gemini AI')
    };
  } catch {
    return fallbackLocalParse(userText, categories, options);
  }
}

/**
 * Hàm nhận diện số tiền từ một cụm văn bản tiếng Việt (VD: "60k" -> 60000, "1tr2" -> 1200000)
 */
function parseVietnameseAmount(clauseText) {
  if (!clauseText) return null;
  const trMatch = clauseText.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|củ)/i) || clauseText.match(/(\d+)tr(\d+)/i);
  const kMatch = clauseText.match(/(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn|lít)/i);
  const rawNumMatch = clauseText.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(?:đ|vnd|đồng)?/i);

  if (trMatch) {
    if (trMatch[2] !== undefined && /tr/i.test(clauseText)) {
      const whole = parseFloat(trMatch[1]);
      const frac = parseFloat(trMatch[2]);
      return Math.round(whole * 1000000 + frac * (frac < 10 ? 100000 : 10000));
    }
    return Math.round(parseFloat(trMatch[1].replace(',', '.')) * 1000000);
  }
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(',', '.'));
    return Math.round(val * (/lít/i.test(kMatch[0]) ? 100000 : 1000));
  }
  if (rawNumMatch) {
    return Math.round(parseFloat(rawNumMatch[1].replace(/[.,]/g, '')));
  }
  return null;
}

/**
 * Hàm suy luận danh mục chuẩn xác từ văn bản tiếng Việt + kiểm tra độ tin cậy (confidence)
 */
function inferCategoryWithConfidence(text, type = 'EXPENSE', categories = [], rules = []) {
  const lower = (text || '').toLowerCase();

  // 1. Ưu tiên kiểm tra quy tắc tự động (auto_rules) của người dùng trước
  if (Array.isArray(rules) && rules.length > 0) {
    for (const rule of rules) {
      if (rule.keyword && lower.includes(String(rule.keyword).toLowerCase())) {
        return { categoryId: rule.category_id, matched: true };
      }
    }
  }

  // 2. Kiểm tra khớp trực tiếp tên danh mục tùy chỉnh của người dùng
  if (Array.isArray(categories) && categories.length > 0) {
    for (const cat of categories) {
      if (cat.type === type && cat.name && cat.name.length >= 3) {
        const catLower = cat.name.toLowerCase();
        if (lower.includes(catLower)) {
          return { categoryId: cat.id, matched: true };
        }
      }
    }
  }

  // 3. Bộ từ điển ngữ nghĩa Tiếng Việt mở rộng
  if (type === 'INCOME') {
    if (/trả\s*nợ|thu\s*nợ|trả\s*tiền|hoàn\s*tiền|tiền\s*ăn|bạn\s*trả|chuyển\s*trả/i.test(lower)) {
      return { categoryId: 'cat_debt_collect', matched: true };
    }
    if (/lương|tháng\s*lương|ứng\s*lương/i.test(lower)) {
      return { categoryId: 'cat_salary', matched: true };
    }
    if (/thưởng|freelance|ngoài\s*giờ|làm\s*thêm|hoa\s*hồng|dự\s*án/i.test(lower)) {
      return { categoryId: 'cat_freelance', matched: true };
    }
    if (/lãi|đầu\s*tư|cổ\s*phiếu|chứng\s*khoán|cổ\s*tức|tiết\s*kiệm/i.test(lower)) {
      return { categoryId: 'cat_investment', matched: true };
    }
    return { categoryId: 'cat_debt_collect', matched: false };
  }

  if (/đền|phạt|bồi\s*thường|mất\s*vé|làm\s*mất|rơi\s*tiền|ủng\s*hộ|từ\s*thiện|mừng\s*cưới|phong\s*bì|đi\s*đám/i.test(lower)) {
    return { categoryId: 'cat_other_expense', matched: true };
  }
  if (/grab|xe\s*ôm|xăng|đổ\s*xăng|taxi|be\b|xanh\s*sm|gửi\s*xe|vé\s*xe|thay\s*nhớt|sửa\s*xe|rửa\s*xe|bơm\s*xe|vá\s*xe|trạm\s*thu\s*phí|vé\s*tàu|vé\s*máy\s*bay|bus|buýt/i.test(lower)) {
    return { categoryId: 'cat_transport', matched: true };
  }
  if (/xà\s*phòng|xà\s*bông|dầu\s*gội|sữa\s*tắm|kem\s*đánh\s*răng|bàn\s*chải|bột\s*giặt|nước\s*giặt|nước\s*rửa|khăn\s*giấy|giấy\s*vệ\s*sinh|mỹ\s*phẩm|son|kem\s*chống\s*nắng|áo|quần|giày|dép|túi\s*xách|mũ|nón|mua\s*sắm|siêu\s*thị|tạp\s*hóa|bách\s*hóa|winmart|circle\s*k|shopee|tiki|lazada|tiktok|tiệm|cắt\s*tóc|gội\s*đầu/i.test(lower)) {
    return { categoryId: 'cat_shopping', matched: true };
  }
  if (/nhậu|uống\s*bia|quán\s*bia/i.test(lower)) {
    return { categoryId: 'cat_food', matched: true };
  }
  if (/cà\s*phê|cafe|coffee|trà\s*sữa|trà\s*đá|trà\s*chanh|trà\s*đào|trà\s*tắc|nước\s*ngọt|nước\s*mía|sinh\s*tố|nước\s*ép|nước\s*suối|nước\s*khoáng|highlands|phúc\s*long|katinat|starbucks|mixue|gong\s*cha|tocotoco|phe\s*la|phê\s*la|aha|cộng\s*cà\s*phê/i.test(lower)) {
    return { categoryId: 'cat_drink', matched: true };
  }
  if (/cơm|bún|phở|ăn|bánh|thịt|cá|trứng|sữa|rau|củ|quả|trái\s*cây|hoa\s*quả|trưa|tối|sáng|mì|miến|cháo|lẩu|nướng|hủ\s*tiếu|xôi|chè|đồ\s*ăn|ăn\s*vặt|ốc|nem|gà\s*rán|pizza|kfc|lotteria|jollibee|đi\s*chợ/i.test(lower)) {
    return { categoryId: 'cat_food', matched: true };
  }
  if (/tiền\s*điện|tiền\s*nước|internet|wifi|rác|hóa\s*đơn|mạng|4g|5g|nạp\s*thẻ|thẻ\s*điện\s*thoại|cước\s*viễn\s*thông|viettel|vinaphone|mobifone/i.test(lower)) {
    return { categoryId: 'cat_bills', matched: true };
  }
  if (/thuốc|tiền\s*thuốc|nhà\s*thuốc|pharmacity|long\s*châu|an\s*khang|bệnh\s*viện|khám|nha\s*khoa|y\s*tế|viện\s*phí|vitamin/i.test(lower)) {
    return { categoryId: 'cat_health', matched: true };
  }
  if (/xem\s*phim|vé\s*phim|cgv|lotte\s*cinema|galaxy|game|nạp\s*game|net|đi\s*net|quán\s*net|du\s*lịch|vé\s*xem|bi-a|bida|billiards|karaoke|bowling|cầu\s*lông|bóng\s*đá|gym|thể\s*thao|netflix|spotify|youtube/i.test(lower)) {
    return { categoryId: 'cat_entertainment', matched: true };
  }
  if (/học|sách|vở|khóa\s*học|học\s*phí|tài\s*liệu|in\s*ấn|photocopy|bút|văn\s*phòng\s*phẩm|thi\s*chứng\s*chỉ/i.test(lower)) {
    return { categoryId: 'cat_education', matched: true };
  }
  if (/tiền\s*trọ|nhà\s*trọ|thuê\s*nhà|tiền\s*nhà|sửa\s*nhà|gia\s*dụng|nội\s*thất|chăn\s*ga/i.test(lower)) {
    return { categoryId: 'cat_housing', matched: true };
  }
  if (/cho\s*vay|cho\s*mượn|trả\s*hộ|ứng\s*trước|mượn\s*tiền/i.test(lower)) {
    return { categoryId: 'cat_loan', matched: true };
  }
  if (/rút\s*tiền|rút\s*atm|rút\s*mặt/i.test(lower)) {
    return { categoryId: 'cat_transfer_cash', matched: true };
  }
  return { categoryId: 'cat_other_expense', matched: false };
}

function inferCategoryFromText(text, type = 'EXPENSE', categories = [], rules = []) {
  return inferCategoryWithConfidence(text, type, categories, rules).categoryId;
}

/**
 * Làm sạch mô tả khoản chi/thu (bóc tách số tiền thừa, dấu +, viết hoa chữ cái đầu)
 */
function cleanDescriptionText(rawText) {
  if (!rawText) return 'Giao dịch';
  let desc = String(rawText)
    .replace(/\(khoản\s*tiền:\s*\d+\s*đ\)/gi, '')
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn|tr|triệu|củ|lít|đ|vnd|đồng)\b/gi, '')
    .replace(/\b(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\b/g, '')
    .replace(/\b(?:vừa\s*mới|vừa|hôm\s*nay|hôm\s*qua|hôm\s*kia|mới|hết|mất|tiền\s*mặt|bằng\s*tiền\s*mặt|chi\s*hết)\b/gi, '')
    .replace(/^[+,\-.;:\s]+|[+,\-.;:\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!desc || desc.length < 2) {
    desc = String(rawText).replace(/\(khoản\s*tiền:\s*\d+\s*đ\)/gi, '').trim();
  }
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

/**
 * Bộ phân tích thông minh nội bộ (xử lý tức thì < 1ms cho các giao dịch rõ ràng & dự phòng an toàn khi Google AI quá tải)
 */
function fallbackLocalParse(userText, categories = [], options = {}) {
  const text = (userText || '').trim();
  const lower = text.toLowerCase();
  const rules = options.rules || [];

  // 1. Kiểm tra nếu câu chứa nhiều khoản chi tiêu nối bằng dấu "+", ",", ";", "và", "với"
  // Ví dụ: "đổ xăng 60k + mua bánh xà phòng tắm 20k" hoặc "ăn sáng 35k, cafe 25k"
  const embeddedAmtMatch = text.match(/\(khoản\s*tiền:\s*(\d+)\s*đ\)/i);
  const embeddedAmount = embeddedAmtMatch ? parseInt(embeddedAmtMatch[1], 10) : null;
  const cleanForSplit = text.replace(/\(khoản\s*tiền:\s*\d+\s*đ\)/gi, '').trim();
  const multiClauses = cleanForSplit
    .split(/\s*(?:\+|;|,|\bvà\b|\bvới\b)\s*/i)
    .map(c => c.trim())
    .filter(Boolean);

  let isSplit = false;
  let splits = null;
  const singleAmt = parseVietnameseAmount(cleanForSplit);
  const fallbackOriginalAmt = options.originalAmount || embeddedAmount;
  let amount = singleAmt || fallbackOriginalAmt || 50000;
  let hasExplicitAmount = Boolean((singleAmt && singleAmt > 0) || (fallbackOriginalAmt && fallbackOriginalAmt > 0));
  let splitMatchedCount = 0;

  if (multiClauses.length >= 2) {
    const parsedClauses = [];
    for (const clause of multiClauses) {
      const clauseAmt = parseVietnameseAmount(clause);
      if (clauseAmt && clauseAmt > 0) {
        const clauseLower = clause.toLowerCase();
        const clauseIncome = options.expectedType === 'INCOME' ||
          (options.expectedType !== 'EXPENSE' && /lương|thưởng|thu\s*tiền|nhận\s*tiền|trả\s*nợ|thu\s*nợ/i.test(clauseLower));
        const clauseType = clauseIncome ? 'INCOME' : 'EXPENSE';
        const { categoryId: clauseCat, matched } = inferCategoryWithConfidence(clause, clauseType, categories, rules);
        if (matched) splitMatchedCount++;
        const clauseDesc = cleanDescriptionText(clause);
        parsedClauses.push({
          amount: clauseAmt,
          categoryId: clauseCat,
          description: clauseDesc,
          type: clauseType
        });
      }
    }

    if (parsedClauses.length >= 2) {
      isSplit = true;
      splits = parsedClauses;
      amount = parsedClauses.reduce((sum, item) => sum + item.amount, 0);
      hasExplicitAmount = true;
    }
  }

  // 2. Nếu chưa phải multi-clause split, kiểm tra yêu cầu tách tiền vừa ăn vừa trả hộ
  if (!isSplit) {
    const splitMatch = cleanForSplit.match(/(?:tôi\s+ăn|ăn|mình\s+ăn|phần\s+tôi|phần\s+mình)\s*(?:hết)?\s*(\d+k|\d+tr|\d+[\d.,]*)\s*(?:còn\s*lại\s*(?:là)?)?\s*(?:trả\s*hộ|cho\s*mượn|cho\s*vay)/i);
    if (splitMatch) {
      const personalAmt = parseVietnameseAmount(splitMatch[1]) || 0;
      const totalAmt = fallbackOriginalAmt || amount;
      if (personalAmt > 0 && totalAmt > personalAmt) {
        isSplit = true;
        amount = totalAmt;
        hasExplicitAmount = true;
        splitMatchedCount = 2;
        splits = [
          { amount: personalAmt, categoryId: 'cat_food', description: 'Ăn uống (phần cá nhân)', type: 'EXPENSE' },
          { amount: totalAmt - personalAmt, categoryId: 'cat_loan', description: 'Trả hộ bạn bè', type: 'EXPENSE' }
        ];
      }
    }
  }

  // 3. Xác định Loại Thu nhập / Chi tiêu
  const isIncome = options.expectedType === 'INCOME' || 
    (options.expectedType !== 'EXPENSE' && /lương|thưởng|thu\s*tiền|nhận\s*tiền|được\s*cho|tiền\s*về|trả\s*nợ|thu\s*nợ|lãi/i.test(lower));
  const type = isIncome ? 'INCOME' : 'EXPENSE';

  // 4. Xác định Danh mục phù hợp & Độ tin cậy (High Confidence Fast-Path)
  const singleInfer = inferCategoryWithConfidence(cleanForSplit, type, categories, rules);
  const categoryId = isSplit && splits?.length > 0
    ? splits[0].categoryId
    : singleInfer.categoryId;

  const asksForNewCategory = /tạo\s*danh\s*mục|danh\s*mục\s*mới/i.test(lower);
  const isComplexTransfer = /chuyển\s*(?:từ|sang|qua)\s*(?:agribank|techcombank|viettel|vcb|mb|bidv)/i.test(lower);

  const isHighConfidence = !asksForNewCategory && !isComplexTransfer && hasExplicitAmount && (
    isSplit
      ? (splits && splits.length >= 2 && splitMatchedCount >= 1)
      : singleInfer.matched
  );

  // 5. Tạo mô tả khoản tiền rõ ràng
  const description = isSplit && splits?.length > 0
    ? splits.map(s => s.description).join(' + ')
    : cleanDescriptionText(cleanForSplit);

  const isCashExplicit = options.forceCash || 
    /tiền\s*mặt|tiền\s*túi|trong\s*ví|trả\s*mặt/i.test(text);

  // Nhận diện ngày/giờ nếu người dùng có nói trong câu
  let customDate = null;
  let customTime = null;
  const vnNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  if (/hôm\s*qua|tối\s*qua|sáng\s*qua|trưa\s*qua|chiều\s*qua/i.test(lower)) {
    const d = new Date(vnNow);
    d.setDate(d.getDate() - 1);
    customDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else if (/hôm\s*kia/i.test(lower)) {
    const d = new Date(vnNow);
    d.setDate(d.getDate() - 2);
    customDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else {
    const dateMatch = lower.match(/(?:ngày\s*|hôm\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/i);
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
    isHighConfidence,
    reasoning: isSplit
      ? `⚡ Tự động tách ${splits.length} khoản tức thì`
      : (isHighConfidence ? '⚡ Phân loại tức thì bởi SmartSpend NLU' : 'Tự động phân loại thông minh (Hệ thống dự phòng)')
  };
}

/**
 * Tạo báo cáo tài chính đánh giá định kỳ (Ngày / Tuần / Tháng) bằng Gemini Flash
 */
export async function generatePeriodicAiReport({
  period = 'DAY', // 'DAY' | 'WEEK' | 'MONTH'
  dateRange = '',
  txs = [],
  totalIncome = 0,
  totalExpense = 0,
  netFlow = 0,
  catMap = {},
  apiKey
}) {
  if (!apiKey || !txs.length) return null;

  const fmtVND = (num) => new Intl.NumberFormat('vi-VN').format(num || 0) + ' VNĐ';

  const txListStr = txs
    .slice(0, 60)
    .map((t) => `- [${t.type === 'INCOME' ? '+' : '-'}${t.amount}đ] ${t.category_name || 'Chưa gắn thẻ'}: ${t.description} (TK: ${t.account_name || t.bank_name}, ID: ${t.id}, Ngày: ${t.transaction_time || t.created_at})`)
    .join('\n');

  let periodTitle = `BÁO CÁO ĐÁNH GIÁ TÀI CHÍNH CUỐI NGÀY (${dateRange})`;
  let extraGuidelines = `
YÊU CẦU ĐÁNH GIÁ NGÀY:
1. "rating": Đánh giá mức độ kỷ luật hôm nay: "Rất tốt 🌟" | "Cân đối 👍" | "Cần chú ý ⚠️" | "Chi vượt định mức 🚨".
2. "overview": Tóm tắt súc tích 1-2 câu về tình hình thu chi và thói quen tiêu dùng trong ngày.
3. "highlights": Mảng 1-2 điểm đáng nhớ nhất trong ngày.
4. "anomalies": Mảng các chuỗi nhận xét phát hiện điểm bất thường (khoản chi lớn, nghi vấn xếp sai danh mục).
5. "advice": 1-2 câu lời khuyên tài chính ngắn gọn cho ngày mai.`;

  if (period === 'WEEK') {
    periodTitle = `BÁO CÁO TỔNG KẾT & PHÂN TÍCH TÀI CHÍNH SAU 1 TUẦN (${dateRange})`;
    extraGuidelines = `
YÊU CẦU ĐÁNH GIÁ TUẦN:
1. "rating": Đánh giá kỷ luật chi tiêu tuần: "Xuất sắc 🌟" | "Cân đối 👍" | "Cần chú ý ⚠️" | "Vượt định mức tuần 🚨".
2. "overview": Tóm tắt 2-3 câu đánh giá tổng thể dòng tiền và thói quen tiêu dùng trong cả tuần qua.
3. "highlights": Mảng 2-3 gạch đầu dòng phân tích: Hạng mục ngốn tiền nhiều nhất tuần, tỷ lệ chi tiêu thiết yếu vs giải trí/hưởng thụ, nhận định xu hướng chi tiêu.
4. "anomalies": Mảng các khoản chi đột biến lớn hoặc bất thường đáng lưu ý trong tuần.
5. "advice": 2 câu định hướng phân bổ ngân sách và chiến lược tài chính thực tế cho tuần tới.`;
  } else if (period === 'MONTH') {
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
    periodTitle = `BÁO CÁO TỔNG HỢP & PHÂN TÍCH SỨC KHỎE TÀI CHÍNH SAU 1 THÁNG (${dateRange})`;
    extraGuidelines = `
- TỶ LỆ TÍCH LŨY / TIẾT KIỆM THÁNG: ${savingsRate}%
YÊU CẦU ĐÁNH GIÁ THÁNG:
1. "rating": Xếp loại sức khỏe tài chính tháng: "Vững mạnh 💎" | "Cân đối lành mạnh 🌟" | "Cần thắt chặt ⚠️" | "Báo động thâm hụt 🚨".
2. "overview": Đánh giá toàn cảnh 2-3 câu về hiệu quả quản lý tài chính, tỷ lệ tích lũy và dòng tiền trong suốt tháng qua.
3. "highlights": Mảng 3-4 gạch đầu dòng phân tích sâu: Top các danh mục chi tiêu lớn nhất tháng, đánh giá tính bền vững của dòng tiền, các khoản chi đột biến.
4. "anomalies": Mảng các điểm bất thường hoặc biến động chi phí lớn trong tháng.
5. "advice": 2-3 câu chiến lược tối ưu hóa ngân sách, mục tiêu tiết kiệm và kế hoạch chi tiêu cho tháng tiếp theo.`;
  }

  const prompt = `Bạn là chuyên gia cố vấn tài chính cá nhân thông minh của hệ thống SmartSpend tại Việt Nam.
Hãy lập ${periodTitle} dựa trên các số liệu thực tế:
- TỔNG THU: ${fmtVND(totalIncome)}
- TỔNG CHI: ${fmtVND(totalExpense)}
- DÒNG TIỀN RÒNG: ${fmtVND(netFlow)}
- CƠ CẤU CHI THEO DANH MỤC: ${JSON.stringify(catMap)}

DANH SÁCH GIAO DỊCH (${txs.length} giao dịch):
${txListStr}

QUY ƯỚC DANH MỤC CỦA HỆ THỐNG SMARTSPEND:
- Danh mục "Cho vay & Cho mượn" (EXPENSE) dùng cho cả việc cho vay lẫn việc chi tiền trả hộ / ứng trước cho bạn bè. KHÔNG coi đây là xếp nhầm danh mục.
- Danh mục "Thu hồi nợ / Nhận tiền trả" (INCOME) khi người khác hoàn trả lại tiền nợ hoặc tiền trả hộ.
- Danh mục "Chuyển tiền nội bộ" / "Nhận chuyển nội bộ" / "Rút tiền vào Ví (ATM)" là luân chuyển giữa các ví của chính người dùng.
${extraGuidelines}
6. "suggestedEdits": Mảng các giao dịch cụ thể đề xuất người dùng nên bấm vào chỉnh sửa lại (nếu có nghi vấn):
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
  "highlights": [string],
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
        signal: AbortSignal.timeout(15000),
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
      const rawText = extractRawTextFromGeminiResponse(data);
      if (!rawText) continue;
      return JSON.parse(rawText);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Giữ nguyên hàm generateDailyAiReport cho tương thích ngược
 */
export async function generateDailyAiReport({ date, txs = [], totalIncome = 0, totalExpense = 0, netFlow = 0, catMap = {}, apiKey }) {
  return generatePeriodicAiReport({
    period: 'DAY',
    dateRange: date,
    txs,
    totalIncome,
    totalExpense,
    netFlow,
    catMap,
    apiKey
  });
}

/**
 * Bộ tạo báo cáo định kỳ dự phòng thông minh (khi offline hoặc không có API Key)
 */
export function generateFallbackPeriodicReport({ period = 'DAY', dateRange, txs = [], totalIncome = 0, totalExpense = 0, netFlow = 0, catMap = {} }) {
  const anomalies = [];
  const suggestedEdits = [];
  const highlights = [];

  const expenses = txs.filter((t) => t.type === 'EXPENSE' && !t.category_id?.startsWith('cat_transfer_'));
  const sortedExpenses = [...expenses].sort((a, b) => b.amount - a.amount);

  if (sortedExpenses.length > 0) {
    const maxTx = sortedExpenses[0];
    if (maxTx.amount >= 150000) {
      anomalies.push(`Khoản chi lớn nhất là "${maxTx.description}" (${new Intl.NumberFormat('vi-VN').format(maxTx.amount)} ₫).`);
    }
  }

  // Sắp xếp top danh mục chi nhiều nhất
  const topCategories = Object.entries(catMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (topCategories.length > 0) {
    const topStr = topCategories.map(([cat, amt]) => `${cat} (${new Intl.NumberFormat('vi-VN').format(amt)} ₫)`).join(', ');
    highlights.push(`Top danh mục chi tiêu lớn nhất: ${topStr}.`);
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

  let rating = 'Cân đối 👍';
  let overview = '';
  let advice = '';

  const fmtVND = (num) => new Intl.NumberFormat('vi-VN').format(num || 0) + ' ₫';

  if (period === 'WEEK') {
    rating = totalExpense > totalIncome && totalIncome > 0
      ? 'Cần chú ý ⚠️'
      : totalExpense === 0
      ? 'Xuất sắc 🌟'
      : netFlow >= 500000
      ? 'Xuất sắc 🌟'
      : 'Cân đối 👍';

    overview = `Tổng kết tuần (${dateRange}): Bạn đã chi tiêu ${fmtVND(totalExpense)} qua ${expenses.length} khoản chi${
      totalIncome > 0 ? ` và thu về ${fmtVND(totalIncome)} (dòng tiền ròng ${netFlow >= 0 ? '+' : ''}${fmtVND(netFlow)})` : ''
    }.`;

    highlights.push(`Trung bình mỗi ngày trong tuần bạn chi khoảng ${fmtVND(Math.round(totalExpense / 7))}.`);

    advice = totalExpense > totalIncome && totalIncome > 0
      ? 'Tuần này chi tiêu hơi vượt thu. Hãy lập kế hoạch hạn mức cụ thể cho tuần tới để cân bằng lại dòng tiền nhé!'
      : 'Kỷ luật tài chính trong tuần rất tốt! Tiếp tục phát huy trong tuần tiếp theo nhé.';
  } else if (period === 'MONTH') {
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
    rating = savingsRate >= 30
      ? 'Vững mạnh 💎'
      : savingsRate >= 10
      ? 'Cân đối lành mạnh 🌟'
      : totalExpense > totalIncome && totalIncome > 0
      ? 'Báo động thâm hụt 🚨'
      : 'Cần thắt chặt ⚠️';

    overview = `Tổng kết tháng (${dateRange}): Tổng chi tiêu ${fmtVND(totalExpense)}, tổng thu ${fmtVND(totalIncome)}. Tích lũy được ${fmtVND(netFlow)} (tỷ lệ tiết kiệm đạt ${savingsRate}%).`;

    highlights.push(`Tỷ lệ tích lũy của tháng đạt ${savingsRate}%.`);

    advice = savingsRate >= 20
      ? 'Sức khỏe tài chính tháng qua rất đáng khen ngợi! Đề xuất trích 50% số tiền tích lũy vào quỹ dự phòng khẩn cấp.'
      : 'Tháng tới hãy theo dõi sát các khoản ăn uống và mua sắm không thiết yếu để cải thiện tỷ lệ tích lũy nhé.';
  } else {
    // DAY
    rating = totalExpense > totalIncome && totalIncome > 0
      ? 'Cần chú ý ⚠️'
      : totalExpense === 0
      ? 'Xuất sắc 🌟'
      : 'Cân đối 👍';

    overview = totalExpense > 0
      ? `Hôm nay bạn đã chi tiêu ${fmtVND(totalExpense)} qua ${expenses.length} khoản chi${
          totalIncome > 0 ? ` và thu về ${fmtVND(totalIncome)}` : ''
        }.`
      : `Hôm nay bạn chưa phát sinh khoản chi tiêu nào. Dòng tiền được giữ vững trọn vẹn!`;

    advice = totalExpense > 250000
      ? 'Hôm nay tổng chi tương đối đáng kể. Ngày mai hãy ưu tiên các nhu cầu thiết yếu và giữ vững ngân sách nhé!'
      : 'Bạn đang quản lý chi tiêu trong ngày rất tốt. Hãy tiếp tục duy trì mức chi tiêu hợp lý này!';
  }

  return {
    rating,
    overview,
    highlights: highlights.length > 0 ? highlights : ['Dòng tiền vận hành ổn định.'],
    anomalies: anomalies.length > 0 ? anomalies : ['Không phát hiện khoản chi tiêu bất thường hay nghi vấn xếp sai danh mục.'],
    advice,
    suggestedEdits
  };
}

/**
 * Giữ nguyên hàm generateFallbackDailyReport cho tương thích ngược
 */
export function generateFallbackDailyReport(params) {
  return generateFallbackPeriodicReport({ ...params, period: 'DAY' });
}
