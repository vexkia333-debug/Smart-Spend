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
