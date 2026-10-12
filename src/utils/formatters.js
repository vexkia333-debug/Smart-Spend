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
