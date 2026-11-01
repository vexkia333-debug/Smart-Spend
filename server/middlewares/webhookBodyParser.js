import express from 'express';

export const webhookPaths = [
  '/api/webhook/bank-notification',
  '/api/webhook/bank-notification/',
  '/api/webhook',
  '/api/webhook/',
  '/webhook',
  '/webhook/'
];

/**
 * Middleware xử lý riêng cho Webhook để chống lỗi "Bad control character in string literal in JSON" (HTTP 400)
 * khi MacroDroid truyền thông báo có dấu xuống dòng thô (Techcombank, Viettel Money)
 */
export const webhookTextParser = express.text({ type: '*/*' });

export function sanitizeWebhookBody(req, res, next) {
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    if (!raw) return next();

    // 1. Thử parse JSON chuẩn
    try {
      req.body = JSON.parse(raw);
      return next();
    } catch (e1) {
      // 2. Tự động sửa lỗi ký tự xuống dòng thô (\r, \n) do MacroDroid chèn trực tiếp vào chuỗi JSON
      try {
        const sanitized = raw.replace(/[\r\n]+/g, ' ');
        req.body = JSON.parse(sanitized);
        return next();
      } catch (e2) {
        // 3. Nếu vẫn không parse được (ví dụ text thuần), tự bọc vào { content: raw }
        req.body = {
          content: raw,
          source: 'BANK_NOTIFICATION'
        };
        return next();
      }
    }
  }
  next();
}
