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
Nhiệm vụ của bạn là đọc và phân tích đoạn văn bản chi tiêu/thu nhập tự nhiên (ví dụ: "vừa ăn bún bò 45k", "mua áo Uniqlo 599k", "nhận lương 20tr", "rút tiền mặt 2tr", "cho Nam vay 500k", "Nam trả nợ 500k") hoặc nội dung thông báo ngân hàng thô, sau đó bóc tách số tiền, danh mục phù hợp và phương thức thanh toán.

DANH SÁCH DANH MỤC HIỆN CÓ:
${categoryListPrompt}

VĂN BẢN ĐẦU VÀO CẦN PHÂN TÍCH:
"""${userText.trim()}"""

${options.forceCash ? 'LƯU Ý ĐẶC BIỆT: Người dùng đang chọn chế độ [Chi bằng Tiền mặt], hãy đặt wallet = "CASH".' : ''}

QUY TẮC PHÂN TÍCH:
1. Số tiền: Phải quy đổi chính xác về số nguyên VNĐ (ví dụ: 45k -> 45000, 1.2tr hoặc 1tr2 -> 1200000, 25 triệu -> 25000000).
2. Loại (type):
   - "EXPENSE": Chi tiêu hoặc chuyển tiền đưa đi.
   - "INCOME": Thu nhập, nhận tiền hoặc thu hồi nợ.
3. categoryId: Phải chọn đúng một ID từ danh sách trên:
   - Nếu là Rút tiền mặt từ cây ATM / tài khoản thẻ -> chọn "cat_transfer_cash" (Rút tiền vào Ví (ATM)).
   - Nếu là Cho vay / Cho mượn tiền ("cho Nam vay 500k", "cho bạn mượn 1tr") -> chọn "cat_loan" (Cho vay & Cho mượn).
   - Nếu là Nhận lại tiền người khác trả nợ ("Nam trả nợ 500k", "được trả tiền") -> chọn "cat_debt_collect" (Thu hồi nợ / Nhận tiền trả).
   - Các khoản chi tiêu thông thường khác: chọn danh mục phù hợp nhất (cat_food, cat_transport, cat_shopping...).
4. wallet:
   - "TRANSFER_TO_CASH": Khi rút tiền mặt từ thẻ/ngân hàng về ví (ví dụ: "rút tiền mặt 2tr", "rút atm 500k", "rút 1 triệu").
   - "CASH": Khi câu nói có từ "tiền mặt", "ví", "tiền túi", "trả mặt", hoặc chi tiêu vặt (gửi xe, mua rau, trà đá, bánh mì) hoặc options.forceCash = true.
   - "BANK": Khi chuyển khoản, quét mã QR ngân hàng, hoặc mặc định nếu không nhắc đến tiền mặt.
5. description: Tên khoản chi hoặc thu rõ ràng, lịch sự. Ví dụ: "Ăn bún bò", "Cho Nam vay tiền", "Thu hồi nợ từ Nam", "Rút tiền mặt vào Ví".
6. bankName: Tên ngân hàng nếu phát hiện (ví dụ: "Agribank", "Vietcombank"...), nếu không có thì để null.

Trả về DUY NHẤT một đối tượng JSON hợp lệ theo định dạng:
{
  "amount": number,
  "type": "EXPENSE" | "INCOME",
  "categoryId": string,
  "description": string,
  "wallet": "CASH" | "BANK" | "TRANSFER_TO_CASH",
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
      categoryId: parsed.categoryId || (parsed.type === 'INCOME' ? 'cat_other_income' : 'cat_other_expense'),
      description: parsed.description || userText,
      wallet: parsed.wallet === 'TRANSFER_TO_CASH' || parsed.categoryId === 'cat_transfer_cash'
        ? 'TRANSFER_TO_CASH'
        : (isCashExplicit ? 'CASH' : (parsed.wallet || 'BANK')),
      borrower: parsed.borrower || null,
      bankName: parsed.bankName || null,
      reasoning: parsed.reasoning || 'Tự động phân loại bởi Gemini AI'
    };
  } catch (err) {
    throw new Error('Không thể đọc kết quả JSON từ Gemini: ' + err.message);
  }
}
