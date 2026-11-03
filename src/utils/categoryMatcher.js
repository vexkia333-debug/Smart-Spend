/**
 * categoryMatcher.js
 * Tiện ích nhận diện và ánh xạ thông minh danh mục đề xuất từ AI (Gemini)
 * sang danh mục thực tế trong cơ sở dữ liệu SmartSpend.
 */

const SYNONYMS = [
  {
    keys: ['giáo dục', 'học tập', 'học', 'sách', 'đồ án', 'in ấn', 'khóa học', 'học phí', 'tài liệu', 'luận văn'],
    preferredId: 'cat_education',
    namePattern: 'học'
  },
  {
    keys: ['ăn uống', 'cơm', 'đồ ăn', 'bữa ăn', 'thực phẩm', 'socola', 'bánh', 'kẹo', 'ăn vặt', 'circle k', 'mì', 'phở', 'quán ăn'],
    preferredId: 'cat_food',
    namePattern: 'cơm'
  },
  {
    keys: ['uống', 'cà phê', 'cafe', 'coffee', 'trà', 'trà sữa', 'nước ngọt', 'highlands', 'starbucks', 'phúc long'],
    preferredId: 'cat_drink',
    namePattern: 'uống'
  },
  {
    keys: ['mua sắm', 'siêu thị', 'quần áo', 'giày', 'tạp hóa', 'shopee', 'lazada', 'tiki', 'winmart', 'bách hóa'],
    preferredId: 'cat_shopping',
    namePattern: 'mua sắm'
  },
  {
    keys: ['di chuyển', 'xăng', 'xăng xe', 'xe', 'grab', 'be', 'xe buýt', 'gửi xe', 'rửa xe', 'vé xe', 'taxi'],
    preferredId: 'cat_transport',
    namePattern: 'di chuyển'
  },
  {
    keys: ['hóa đơn', 'tiện ích', 'điện', 'nước', 'internet', 'wifi', 'rác', 'truyền hình', 'phí chung cư'],
    preferredId: 'cat_bills',
    namePattern: 'hóa đơn'
  },
  {
    keys: ['giải trí', 'phim', 'game', 'du lịch', 'xem phim', 'netflix', 'spotify', 'vé xem phim', 'hát', 'karaoke'],
    preferredId: 'cat_entertainment',
    namePattern: 'giải trí'
  },
  {
    keys: ['sức khỏe', 'thuốc', 'khám', 'bệnh viện', 'nha khoa', 'y tế', 'phòng khám', 'tiêm', 'vitamin'],
    preferredId: 'cat_health',
    namePattern: 'sức khỏe'
  },
  {
    keys: ['nhà cửa', 'phòng trọ', 'tiền trọ', 'tiền nhà', 'đồ gia dụng', 'nội thất', 'sửa nhà', 'thuê nhà'],
    preferredId: 'cat_housing',
    namePattern: 'nhà'
  },
  {
    keys: ['làm đẹp', 'chăm sóc cá nhân', 'cắt tóc', 'spa', 'mỹ phẩm', 'gội đầu', 'nail'],
    preferredId: 'cat_mvdmiu8j_uv2f',
    namePattern: 'làm đẹp'
  },
  {
    keys: ['lương', 'tiền lương', 'thu nhập chính', 'công ty chuyển'],
    preferredId: 'cat_salary',
    namePattern: 'lương'
  },
  {
    keys: ['thu hồi nợ', 'nhận tiền trả', 'đòi nợ', 'trả tiền', 'bạn trả', 'hoàn tiền'],
    preferredId: 'cat_debt_collect',
    namePattern: 'thu hồi'
  },
  {
    keys: ['cho vay', 'cho mượn', 'trả hộ', 'chi hộ', 'ứng trước'],
    preferredId: 'cat_loan',
    namePattern: 'cho vay'
  }
];

const normStr = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&|\+|\/|-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Tìm danh mục phù hợp nhất từ danh sách danh mục hiện có
 */
export function matchOrFindCategory(categories = [], suggestedName = '', type = 'EXPENSE') {
  if (!suggestedName || !categories.length) return null;

  const searchNorm = normStr(suggestedName);

  // 1. So khớp chính xác tên (Exact Normalized Match)
  const exact = categories.find((c) => normStr(c.name) === searchNorm && (!type || c.type === type));
  if (exact) return exact;

  // 2. So khớp theo nhóm từ đồng nghĩa (Synonyms / Semantic Knowledge)
  for (const syn of SYNONYMS) {
    if (syn.keys.some((k) => searchNorm.includes(normStr(k)) || normStr(k).includes(searchNorm))) {
      // Ưu tiên tìm theo ID chuẩn
      if (syn.preferredId) {
        const byId = categories.find((c) => c.id === syn.preferredId);
        if (byId) return byId;
      }
      // Hoặc tìm theo tên đại diện
      if (syn.namePattern) {
        const byPattern = categories.find(
          (c) => normStr(c.name).includes(normStr(syn.namePattern)) && (!type || c.type === type)
        );
        if (byPattern) return byPattern;
      }
    }
  }

  // 3. So khớp chuỗi con tương đối (Substring Match)
  const partial = categories.find((c) => {
    const cNorm = normStr(c.name);
    return (cNorm.includes(searchNorm) || searchNorm.includes(cNorm)) && (!type || c.type === type);
  });
  if (partial) return partial;

  return null;
}

/**
 * Đảm bảo danh mục tồn tại:
 * - Nếu đã có (hoặc tương đương) -> Trả về danh mục đó.
 * - Nếu chưa có -> Tự động gọi API tạo mới danh mục và trả về.
 */
export async function ensureCategoryExists(authFetch, categories = [], suggestedName = '', type = 'EXPENSE') {
  if (!suggestedName) return { category: null, wasCreated: false };

  // 1. Kiểm tra xem danh mục đã có sẵn chưa
  const matched = matchOrFindCategory(categories, suggestedName, type);
  if (matched) {
    return { category: matched, wasCreated: false };
  }

  // 2. Chưa có -> Tự động tạo mới
  try {
    const res = await authFetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: suggestedName.trim(),
        type: type || 'EXPENSE',
        icon: 'Tag',
        color: '#10b981',
        is_quick_action: 1
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tạo danh mục mới');

    const newCat = {
      id: data.id,
      name: suggestedName.trim(),
      type: type || 'EXPENSE',
      icon: 'Tag',
      color: '#10b981',
      is_quick_action: 1
    };

    return { category: newCat, wasCreated: true };
  } catch (err) {
    console.error('Lỗi tự động tạo danh mục:', err);
    return { category: null, wasCreated: false, error: err.message };
  }
}

