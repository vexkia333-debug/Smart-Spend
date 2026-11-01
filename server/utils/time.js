/**
 * Tiện ích xử lý thời gian chuẩn xác theo múi giờ Việt Nam (UTC+7, Asia/Ho_Chi_Minh)
 * Khắc phục hoàn toàn lỗi sai lệch 7 tiếng khi máy chủ deploy trên môi trường Cloud / Render (UTC GMT+0)
 */

export function getVietnamTimeParts(inputDate = new Date()) {
  const d = (inputDate instanceof Date) ? inputDate : new Date(inputDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  
  const vnStr = validDate.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  // vnStr format en-GB: "DD/MM/YYYY, HH:mm:ss"
  const [datePart, timePart] = vnStr.split(', ');
  const [day, month, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');

  return {
    day,
    month,
    year,
    hour,
    minute,
    second,
    dateStr: `${day}/${month}/${year}`,
    timeStr: `${hour}:${minute}`,
    fullStr: `${hour}:${minute} ${day}/${month}/${year}`,
    isoDate: `${year}-${month}-${day}`
  };
}

export function formatVietnamTxTime({ clientTime, customDate, customTime } = {}) {
  const vnNow = getVietnamTimeParts(clientTime || new Date());
  
  let d = vnNow.day;
  let m = vnNow.month;
  let y = vnNow.year;
  let hh = vnNow.hour;
  let mm = vnNow.minute;

  if (customDate && typeof customDate === 'string') {
    if (customDate.includes('-')) {
      const parts = customDate.split('-');
      if (parts.length === 3) {
        y = parts[0];
        m = parts[1].padStart(2, '0');
        d = parts[2].padStart(2, '0');
      }
    } else if (customDate.includes('/')) {
      const parts = customDate.split('/');
      if (parts.length === 3) {
        d = parts[0].padStart(2, '0');
        m = parts[1].padStart(2, '0');
        y = parts[2];
      }
    }
  }

  if (customTime && typeof customTime === 'string') {
    const parts = customTime.split(':');
    if (parts.length >= 2) {
      hh = parts[0].padStart(2, '0');
      mm = parts[1].padStart(2, '0');
    }
  }

  return `${hh}:${mm} ${d}/${m}/${y}`;
}

export function parseTxDateToISO(tx) {
  const raw = tx.transaction_time || tx.created_at;
  if (!raw) return '';
  const str = String(raw).trim();
  const dmyMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  const isoMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return '';
}

