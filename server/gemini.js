/**
 * Module tích hợp Google AI Studio (Gemini Flash) để phân tích ngôn ngữ tự nhiên và phân loại chi tiêu
 */

export async function parseTransactionWithGemini(userText, categories = [], apiKey, options = {}) {
  if (!apiKey) {
    throw new Error('Chưa cấu hình API Key của Google AI Studio (Gemini)');
  }
  if (!userText || !userText.trim()) {
    throw new Error('Vui lòng nhập nội dung chi tiêu cần phân tích');
  }

  const categoryListPrompt = categories.map(c => `- ID: "${c.id}", Tên: "${c.name}", Loại: "${c.type}"`).join('\n');

  const prompt = `Bạn là trợ lý tài chính cá nhân thông minh của hệ thống SmartSpend tại Việt Nam.
Nhiệm vụ của bạn là đọc và phân tích đoạn văn bản chi tiêu/thu nhập tự nhiên (ví dụ: "vừa ăn bún bò 45k", "mua áo Uniqlo 599k", "nhận lương 20tr", "rút tiền mặt 2tr", "cho Nam vay 500k", "Nam trả nợ 500k", "mua thức ăn cho mèo 150k", "tiền tập gym 600k", "tiền làm móng 180k") hoặc nội dung thông báo ngân hàng thô, sau đó bóc tách số tiền, danh mục phù hợp và phương thức thanh toán.

DANH SÁCH DANH MỤC HIỆN CÓ TRONG HỆ THỐNG:
${categoryListPrompt}

VĂN BẢN ĐẦU VÀO CẦN PHÂN TÍCH:
"""${userText.trim()}"""

${options.forceCash ? 'LƯU Ý ĐẶC BIỆT: Người dùng đang chọn chế độ [Chi bằng Tiền mặt], hãy đặt wallet = "CASH".' : ''}

QUY TẮC PHÂN TÍCH & PHÂN LOẠI DANH MỤC THÔNG MINH:
1. Số tiền: Phải quy đổi chính xác về số nguyên VNĐ (ví dụ: 45k -> 45000, 1.2tr hoặc 1tr2 -> 1200000, 25 triệu -> 25000000).
2. Loại (type):
   - "EXPENSE": Chi tiêu hoặc chuyển tiền đưa đi.
   - "INCOME": Thu nhập, nhận tiền hoặc thu hồi nợ.

3. QUY TẮC CHỌN HOẶC TỰ ĐỘNG TẠO DANH MỤC:
   - ƯU TIÊN 1 (Gán vào danh mục có sẵn): Nếu nội dung chi tiêu/thu nhập phù hợp rõ ràng với một trong các danh mục hiện có:
     + Đồ ăn, bữa ăn (cơm, bún bò, phở, bánh mì, hủ tiếu, quán ăn, nhà hàng, đồ ăn vặt) -> "cat_food" (Cơm & Đồ ăn).
     + Đồ uống (cà phê, trà sữa, trà đá, nước ngọt, Highlands, Phúc Long, The Coffee House, Starbucks, Katinat, Mixue...) -> "cat_drink" (Cà phê & Đồ uống).
     + Rút tiền mặt ATM -> "cat_transfer_cash" (Rút tiền vào Ví (ATM)).
     + Cho vay / mượn tiền -> "cat_loan" (Cho vay & Cho mượn).
     + Nhận lại tiền người khác trả nợ -> "cat_debt_collect" (Thu hồi nợ / Nhận tiền trả).
     + Đi lại, xăng xe, Grab, taxi, vé xe, gửi xe -> "cat_transport" (Di chuyển & Xăng xe).
     + Mua sắm quần áo, đồ dùng siêu thị, Shopee, Tiki -> "cat_shopping" (Mua sắm & Siêu thị).
     + Điện nước, internet, rác, hóa đơn nhà mạng -> "cat_bills" (Hóa đơn & Tiện ích).
     + Xem phim, game, du lịch giải trí -> "cat_entertainment" (Giải trí & Phim ảnh).
     + Thuốc men, khám bệnh, nha khoa -> "cat_health" (Sức khỏe & Thuốc).
     + Tiền học, mua sách, khóa học -> "cat_education" (Học tập & Sách).
     + Đồ gia dụng, sửa nhà, tiền trọ -> "cat_housing" (Nhà cửa & Đồ gia dụng).
     + Lương -> "cat_salary", Thưởng/ngoài giờ -> "cat_freelance", Lãi đầu tư -> "cat_investment".
     => Khi chọn danh mục có sẵn: Đặt "categoryId" = ID danh mục đó, "isNewCategory" = false, "newCategory" = null.

   - ƯU TIÊN 2 (TỰ ĐỘNG TẠO DANH MỤC MỚI): CHỈ KHI khoản chi/thu thực sự thuộc về một nhóm lĩnh vực hoàn toàn mới chưa hề có trong danh sách trên (Ví dụ: Thú cưng / Chăm sóc chó mèo; Tập Gym / Thể hình / Yoga; Làm đẹp / Mỹ phẩm / Spa / Cắt tóc; Du lịch / Khách sạn; Sửa chữa / Bảo dưỡng xe cộ; Từ thiện / Quyên góp; Đồ công nghệ...):
     => Hãy tự động đề xuất tạo danh mục mới chuẩn xác:
     + Đặt "isNewCategory" = true
     + Đặt "categoryId" = null
     + "newCategory": {
         "name": Tên danh mục khái quát, ngắn gọn, chuẩn mực (Ví dụ: "Thú cưng & Pet", "Thể thao & Gym", "Làm đẹp & Mỹ phẩm", "Du lịch & Khách sạn", "Bảo dưỡng & Sửa xe", "Từ thiện & Ủng hộ"). TUYỆT ĐỐI KHÔNG đặt tên vụn vặt như "Thức ăn hạt cho mèo" hay "Son dưỡng",
         "icon": Tên một Lucide React icon phù hợp (chọn từ: "Dog", "Cat", "Dumbbell", "Sparkles", "Plane", "Wrench", "HeartHandshake", "Scissors", "Gamepad2", "Flower2", "BookOpen", "Baby", "Camera", "Laptop", "Shirt", "Tag"),
         "color": Mã màu HEX pastel/vibrant đẹp (chọn một trong: "#ec4899", "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#14b8a6", "#f43f5e", "#84cc16", "#3b82f6", "#eab308")
       }

4. wallet:
   - "INTERNAL_TRANSFER": Khi chuyển tiền giữa các tài khoản ngân hàng hoặc ví với nhau (ví dụ: "chuyển 500k từ Agribank sang Techcombank", "bắn 200k từ TCB sang Viettel Money", "nạp 100k Viettel Money từ Agri").
   - "TRANSFER_TO_CASH": Khi rút tiền mặt từ thẻ/ngân hàng về ví tiền mặt (ví dụ: "rút tiền mặt 2tr", "rút atm 500k").
   - "CASH": Khi câu nói có từ "tiền mặt", "ví", "tiền túi", "trả mặt", hoặc chi tiêu vặt (gửi xe, mua rau, trà đá, bánh mì) hoặc options.forceCash = true.
   - "BANK": Khi chuyển khoản, quét mã QR ngân hàng, hoặc mặc định nếu không nhắc đến tiền mặt.
5. sourceBank: Tên ngân hàng/ví nguồn nếu là chuyển khoản (ví dụ: "Agribank", "Techcombank", "Viettel Money").
6. targetBank: Tên ngân hàng/ví nhận nếu là chuyển khoản (ví dụ: "Techcombank", "Viettel Money", "Agribank").
7. description: Tên khoản chi hoặc thu rõ ràng, lịch sự. Ví dụ: "Ăn bún bò", "Cho Nam vay tiền", "Mua thức ăn cho mèo", "Tập gym tháng 10".
8. bankName: Tên ngân hàng nếu phát hiện (ví dụ: "Agribank", "Techcombank", "Viettel Money"...), nếu không có thì để null.

Trả về DUY NHẤT một đối tượng JSON hợp lệ theo định dạng:
{
  "amount": number,
  "type": "EXPENSE" | "INCOME",
  "categoryId": string | null,
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
}`;

  // Gọi trực tiếp REST API của Google AI Studio (Model gemini-3.5-flash-lite)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

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

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `Lỗi Google AI API: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const data = await response.json();
  return formatParsedResult(data, userText, options);
}

function formatParsedResult(data, userText, options) {
  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawContent) {
    throw new Error('Google AI không phản hồi nội dung hợp lệ');
  }

  try {
    const parsed = JSON.parse(rawContent.trim());
    const isCashExplicit = options.forceCash || 
      /tiền\s*mặt|tiền\s*túi|trong\s*ví|trả\s*mặt/i.test(userText) || 
      parsed.wallet === 'CASH';

    return {
      amount: Math.abs(Number(parsed.amount)) || 50000,
      type: parsed.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      categoryId: parsed.categoryId || null,
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
      sourceBank: parsed.sourceBank || null,
      targetBank: parsed.targetBank || null,
      borrower: parsed.borrower || null,
      bankName: parsed.bankName || null,
      reasoning: parsed.reasoning || 'Tự động phân loại bởi Gemini AI'
    };
  } catch (err) {
    throw new Error('Không thể đọc kết quả JSON từ Gemini: ' + err.message);
  }
}
