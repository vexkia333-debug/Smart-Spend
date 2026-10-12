/**
 * Các hàm định dạng tiền tệ và thời gian dùng chung
 */

export const formatVND = (num) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
};

export const formatTxTime = (timeStr, createdAt) => {
  const raw = timeStr || createdAt || '';
  if (!raw) return '';
  return raw
    .replace(/\{day_of_month\}|\[day_of_month\]/gi, '10')
    .replace(/\{day\}|\[day\]/gi, '10')
    .replace(/tháng\s+/gi, '')
    .trim();
};

export const formatCompactVND = (v) => {
  if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}tr`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return '0đ';
};

/**
 * Định dạng số với dấu phẩy ngăn cách hàng nghìn (1000000 -> 1,000,000)
 */
export const formatNumberWithCommas = (val) => {
  if (val === undefined || val === null || val === '') return '';
  const clean = String(val).replace(/\D/g, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * Chuyển chuỗi có dấu phẩy thành số thực tế (1,000,000 -> 1000000)
 */
export const parseNumberFromCommas = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const clean = String(val).replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

/**
 * Chuyển đổi linh hoạt chuỗi ngày giờ giao dịch thành đối tượng Date (hỗ trợ cả YYYY-MM-DD và DD/MM/YYYY)
 */
export const parseTxDate = (timeStr, createdAt) => {
  const raw = timeStr || createdAt;
  if (!raw) return new Date();

  // Kiểm tra định dạng ngày Việt Nam: DD/MM/YYYY (hoặc HH:mm DD/MM/YYYY)
  const dmyMatch = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hmMatch = String(raw).match(/(\d{1,2}):(\d{1,2})/);
    const hour = hmMatch ? parseInt(hmMatch[1], 10) : 0;
    const min = hmMatch ? parseInt(hmMatch[2], 10) : 0;
    return new Date(year, month, day, hour, min);
  }

  // Định dạng ISO hoặc YYYY-MM-DD HH:mm:ss
  if (typeof raw === 'string') {
    const cleaned = raw.replace(' ', 'T');
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
  }

  if (createdAt) {
    const d = new Date(String(createdAt).replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
  }

  return new Date();
};

/**
 * Format ngày thành chuỗi YYYY-MM-DD cho thẻ <input type="date">
 */
export const formatDateInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Chuyển YYYY-MM-DD sang DD/MM/YYYY để hiển thị thân thiện
 */
export const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};
