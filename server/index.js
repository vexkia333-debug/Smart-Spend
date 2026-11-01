import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { initDatabase } from './db.js';
import { initWebPush } from './notifications.js';

// Middlewares
import { webhookPaths, webhookTextParser, sanitizeWebhookBody } from './middlewares/webhookBodyParser.js';
import { requirePinAuth } from './middlewares/auth.js';

// Services
import { broadcastEvent } from './services/sse.js';
import { generateAndSaveDailyReport, generateAndSavePeriodicReport, startReportCronJob } from './services/reportService.js';

// Routes
import authRouter from './routes/auth.js';
import eventsRouter from './routes/events.js';
import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import categoriesRouter from './routes/categories.js';
import rulesRouter from './routes/rules.js';
import settingsRouter from './routes/settings.js';
import webhookRouter from './routes/webhook.js';
import aiRouter from './routes/ai.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';

// Re-export utility / service functions for backward compatibility with external scripts
export { getVietnamTimeParts, formatVietnamTxTime, parseTxDateToISO } from './utils/time.js';
export { broadcastEvent } from './services/sse.js';
export { generateAndSaveDailyReport, generateAndSavePeriodicReport } from './services/reportService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Khởi tạo Database, Web Push & Cron jobs
await initDatabase();
await initWebPush();
startReportCronJob();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Webhook parsing middleware (xử lý thô ký tự xuống dòng từ MacroDroid)
app.use(webhookPaths, webhookTextParser, sanitizeWebhookBody);

app.use(express.json());

// PIN Auth Protection Middleware
app.use(requirePinAuth);

// Mount Modular API Routers
app.use('/api', authRouter);             // /api/auth/* & /api/health
app.use('/api/events', eventsRouter);     // /api/events (SSE)
app.use('/api/categories', categoriesRouter); // /api/categories
app.use('/api/accounts', accountsRouter); // /api/accounts
app.use('/api/rules', rulesRouter);       // /api/rules
app.use('/api/settings', settingsRouter); // /api/settings
app.use('/api/notifications', notificationsRouter); // /api/notifications
app.use('/api/ai', aiRouter);             // /api/ai/parse-transaction
app.use('/api', reportsRouter);          // /api/ai/daily-report*, /api/settings/daily-report
app.use('/api', webhookRouter);          // /api/webhook/*, /api/simulate/*
app.use('/api', transactionsRouter);     // /api/stats, /api/transactions*, /api/reset-data

// Backward compatibility: alias /webhook on root to webhook bank notification
app.post(['/webhook', '/webhook/'], (req, res, next) => {
  req.url = '/api/webhook/bank-notification';
  app._router.handle(req, res, next);
});

// Phục vụ giao diện web tĩnh từ thư mục dist (Production / Render)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Chỉ phục vụ index.html cho các request GET không phải API
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Bắt các request POST gửi nhầm vào root để tự động chuyển vào webhook
app.post('/', (req, res, next) => {
  if (req.body && (req.body.content || req.body.text || req.body.title || req.body.not_text)) {
    console.log('[Webhook Redirect] Nhận request POST tại root, chuyển hướng vào webhook bank-notification...');
    req.url = '/api/webhook/bank-notification';
    return app._router.handle(req, res, next);
  }
  res.status(404).json({ error: 'Endpoint không tồn tại. Vui lòng gửi Webhook tới /api/webhook/bank-notification' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
