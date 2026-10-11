import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đảm bảo thư mục data tồn tại
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'finance.db');
const db = new DatabaseSync(dbPath);

// Bật Foreign Keys
db.exec('PRAGMA foreign_keys = ON;');

// Khởi tạo bảng
export function initDatabase() {
  db.exec(`
    -- Bảng Tài khoản / Ví ngân hàng
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bank_code TEXT NOT NULL,
      account_number TEXT,
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'VND',
      icon TEXT DEFAULT 'landmark',
      color TEXT DEFAULT '#10b981',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Bảng Danh mục Thu / Chi
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('EXPENSE', 'INCOME')),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_quick_action INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Bảng Giao dịch (Transactions)
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('EXPENSE', 'INCOME')),
      description TEXT NOT NULL,
      raw_content TEXT,
      bank_name TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'CONFIRMED', 'IGNORED')),
      source TEXT NOT NULL DEFAULT 'BANK_NOTIFICATION' CHECK(source IN ('BANK_NOTIFICATION', 'SMS', 'MANUAL')),
      transaction_time TEXT NOT NULL,
      confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Bảng Quy tắc tự động phân loại (Auto Rules)
    CREATE TABLE IF NOT EXISTS auto_rules (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      is_auto_apply INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Bảng Lịch sử gửi thông báo tới điện thoại (Notification Logs)
    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      actions_payload TEXT,
      status TEXT NOT NULL DEFAULT 'SENT' CHECK(status IN ('SENT', 'INTERACTED', 'DISMISSED', 'EXPIRED')),
      user_action TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Bảng Cài đặt & Khóa API (Settings & API Keys)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Indexes hỗ trợ tìm kiếm nhanh
    CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_trans_time ON transactions(transaction_time);
    CREATE INDEX IF NOT EXISTS idx_trans_cat ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_trans_acc ON transactions(account_id);
  `);

  seedInitialData();
}

function seedInitialData() {
  // Kiểm tra nếu đã có categories thì bỏ qua seed
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM categories');
  const result = countStmt.get();
  if (result.count > 0) return;

  console.log('Seeding initial data...');

  // 1. Seed Accounts
  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAccount.run('acc_vcb', 'Vietcombank DigiBank', 'VCB', '****9821', 18450000, 'VND', 'landmark', '#10b981');
  insertAccount.run('acc_tcb', 'Techcombank Mobile', 'TCB', '****4567', 35200000, 'VND', 'credit-card', '#ef4444');
  insertAccount.run('acc_mb', 'MB Bank', 'MB', '****1102', 8600000, 'VND', 'shield-check', '#3b82f6');
  insertAccount.run('acc_momo', 'Ví MoMo', 'MOMO', '098****321', 1250000, 'VND', 'wallet', '#ec4899');
  insertAccount.run('acc_cash', 'Tiền mặt', 'CASH', '', 2500000, 'VND', 'coins', '#f59e0b');

  // 2. Seed Categories
  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, type, icon, color, is_quick_action, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Chi tiêu
  insertCategory.run('cat_food', 'Ăn uống & Cà phê', 'EXPENSE', 'Utensils', '#f59e0b', 1, 1);
  insertCategory.run('cat_shopping', 'Mua sắm & Siêu thị', 'EXPENSE', 'ShoppingBag', '#ec4899', 1, 2);
  insertCategory.run('cat_transport', 'Di chuyển & Xăng xe', 'EXPENSE', 'Car', '#3b82f6', 1, 3);
  insertCategory.run('cat_bills', 'Hóa đơn & Tiện ích', 'EXPENSE', 'Receipt', '#8b5cf6', 1, 4);
  insertCategory.run('cat_entertainment', 'Giải trí & Phim ảnh', 'EXPENSE', 'Film', '#06b6d4', 1, 5);
  insertCategory.run('cat_health', 'Sức khỏe & Thuốc', 'EXPENSE', 'HeartPulse', '#10b981', 1, 6);
  insertCategory.run('cat_education', 'Học tập & Sách', 'EXPENSE', 'GraduationCap', '#6366f1', 0, 7);
  insertCategory.run('cat_housing', 'Nhà cửa & Đồ gia dụng', 'EXPENSE', 'Home', '#14b8a6', 0, 8);
  insertCategory.run('cat_other_expense', 'Chi tiêu khác', 'EXPENSE', 'MoreHorizontal', '#64748b', 1, 9);

  // Thu nhập
  insertCategory.run('cat_salary', 'Lương hàng tháng', 'INCOME', 'Briefcase', '#10b981', 1, 10);
  insertCategory.run('cat_freelance', 'Thu nhập ngoài & Thưởng', 'INCOME', 'Award', '#84cc16', 1, 11);
  insertCategory.run('cat_investment', 'Đầu tư & Lãi suất', 'INCOME', 'TrendingUp', '#06b6d4', 1, 12);
  insertCategory.run('cat_other_income', 'Thu nhập khác', 'INCOME', 'PlusCircle', '#64748b', 0, 13);

  // 3. Seed Auto Rules
  const insertRule = db.prepare(`
    INSERT INTO auto_rules (id, keyword, category_id, is_auto_apply)
    VALUES (?, ?, ?, ?)
  `);

  insertRule.run('rule_1', 'PHUC LONG', 'cat_food', 0);
  insertRule.run('rule_2', 'HIGHLANDS', 'cat_food', 0);
  insertRule.run('rule_3', 'STARBUCKS', 'cat_food', 0);
  insertRule.run('rule_4', 'GRAB', 'cat_transport', 0);
  insertRule.run('rule_5', 'BE GROUP', 'cat_transport', 0);
  insertRule.run('rule_6', 'SHOPEE', 'cat_shopping', 0);
  insertRule.run('rule_7', 'WINMART', 'cat_shopping', 0);
  insertRule.run('rule_8', 'TIEN DIEN', 'cat_bills', 1);
  insertRule.run('rule_9', 'LUONG THANG', 'cat_salary', 1);

  // 4. Seed initial transactions (vừa có CONFIRMED, vừa có PENDING)
  const insertTrans = db.prepare(`
    INSERT INTO transactions (id, account_id, category_id, amount, type, description, raw_content, bank_name, status, source, transaction_time, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const formatTime = (offsetHours) => {
    const d = new Date(now.getTime() - offsetHours * 3600 * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  };

  // Các giao dịch PENDING (người dùng bỏ lỡ thông báo trên điện thoại, cần bổ sung trên web)
  insertTrans.run(
    'tx_pend_1',
    'acc_vcb',
    null,
    65000,
    'EXPENSE',
    'QR TT Phuc Long Coffee Landmark',
    'VCB: -65,000 VND luc 10/10/2026 15:45. SD: 18,450,000 VND. ND: QR TT Phuc Long Coffee Landmark',
    'Vietcombank',
    'PENDING',
    'BANK_NOTIFICATION',
    formatTime(3),
    null
  );

  insertTrans.run(
    'tx_pend_2',
    'acc_tcb',
    null,
    320000,
    'EXPENSE',
    'Chuyen khoan mua sach tiki trading',
    'TCB: -320,000VND vao 10/10 11:20 tai Tiki Trading. So du: 35,200,000VND',
    'Techcombank',
    'PENDING',
    'BANK_NOTIFICATION',
    formatTime(7),
    null
  );

  insertTrans.run(
    'tx_pend_3',
    'acc_mb',
    null,
    45000,
    'EXPENSE',
    'Thanh toan GrabBike Nguyen Trai',
    'MBBank: GD -45,000VND luc 10/10/2026 08:30. ND: GrabBike trip ID 98213.',
    'MB Bank',
    'PENDING',
    'BANK_NOTIFICATION',
    formatTime(10),
    null
  );

  // Các giao dịch CONFIRMED (đã chọn trực tiếp qua thông báo hoặc trước đó)
  insertTrans.run(
    'tx_conf_1',
    'acc_vcb',
    'cat_salary',
    28500000,
    'INCOME',
    'Cong ty CP Tech tra luong T10',
    'VCB: +28,500,000 VND luc 05/10/2026 09:00. SD: 28,500,000 VND. ND: Cong ty CP Tech tra luong T10',
    'Vietcombank',
    'CONFIRMED',
    'BANK_NOTIFICATION',
    formatTime(120),
    formatTime(119)
  );

  insertTrans.run(
    'tx_conf_2',
    'acc_vcb',
    'cat_food',
    180000,
    'EXPENSE',
    'Thanh toan Quan com nieu Sai Gon',
    'VCB: -180,000 VND luc 09/10/2026 12:30. SD: 18,515,000 VND. ND: QR Quankomnieu',
    'Vietcombank',
    'CONFIRMED',
    'BANK_NOTIFICATION',
    formatTime(28),
    formatTime(28)
  );

  insertTrans.run(
    'tx_conf_3',
    'acc_tcb',
    'cat_bills',
    650000,
    'EXPENSE',
    'Thanh toan tien dien EVN thang 9',
    'TCB: -650,000VND vao 08/10 16:15 tai EVNHCMC. So du: 35,520,000VND',
    'Techcombank',
    'CONFIRMED',
    'BANK_NOTIFICATION',
    formatTime(48),
    formatTime(48)
  );

  insertTrans.run(
    'tx_conf_4',
    'acc_momo',
    'cat_entertainment',
    190000,
    'EXPENSE',
    'Ve xem phim CGV Cinema Vincom',
    'MoMo: Ban da thanh toan 190.000d cho CGV Cinemas.',
    'MoMo',
    'CONFIRMED',
    'BANK_NOTIFICATION',
    formatTime(52),
    formatTime(51)
  );

  console.log('Seeding completed successfully!');
}

export { db };
