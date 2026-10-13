import { createClient } from '@libsql/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tự động load .env nếu có
try {
  process.loadEnvFile?.();
} catch {}

// Thông tin Turso Cloud mặc định (Đảm bảo Render luôn kết nối Database vĩnh viễn kể cả khi chưa cấu hình thủ công qua Dashboard)
const DEFAULT_TURSO_URL = 'libsql://smartspend-kienvu.aws-ap-northeast-1.turso.io';
const DEFAULT_TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE4NjMxNDUsImlkIjoiMDFhMTMzMTMtZTcwMS03ZTRlLTk2YWMtOGRmMGYwMzg1OGQyIiwia2lkIjoiVGxERFZSUG4yZlFZTmRiaTRUcm9RRElVczY3WnA3aXpCMXVMNzQ1eDQ0NCIsInJpZCI6IjI2MmExODgwLWZlYjgtNDYyYS04OTg5LTVhZmI3ZmIyZGI5NyJ9.osOtmrTrKFH1sp9S9aJg7R6aTfh2v4Y5v9MHpAjGXRvNIFph4XlgykfUV-gJKn0_uLoZElwTQ42WmPf-3kywAQ';

const TURSO_URL = process.env.TURSO_DATABASE_URL || DEFAULT_TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || DEFAULT_TURSO_AUTH_TOKEN;

let client;

if (TURSO_URL) {
  console.log(`[Database] Đang kết nối Turso Cloud: ${TURSO_URL}`);
  client = createClient({
    url: TURSO_URL,
    authToken: TURSO_AUTH_TOKEN,
  });
} else {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'finance.db');
  console.log(`[Database] Sử dụng file SQLite cục bộ: ${dbPath}`);
  client = createClient({
    url: `file:${dbPath}`
  });
}

// Wrapper thống nhất cho các thao tác truy vấn
const db = {
  client,
  async get(sql, ...args) {
    const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const res = await client.execute({ sql, args: flat });
    return res.rows[0] || null;
  },
  async all(sql, ...args) {
    const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const res = await client.execute({ sql, args: flat });
    return res.rows;
  },
  async run(sql, ...args) {
    const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const res = await client.execute({ sql, args: flat });
    return {
      changes: res.rowsAffected,
      lastInsertRowid: res.lastInsertRowid
    };
  },
  async exec(sql) {
    return await client.executeMultiple(sql);
  },
  prepare(sql) {
    return {
      get: (...args) => this.get(sql, ...args),
      all: (...args) => this.all(sql, ...args),
      run: (...args) => this.run(sql, ...args),
    };
  }
};

// Khởi tạo bảng và dữ liệu mặc định
export async function initDatabase() {
  await client.executeMultiple(`
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

  await seedInitialData();
}

async function seedInitialData() {
  // 1. Kiểm tra tài khoản - CHỈ seed nếu bảng accounts hoàn toàn trống, KHÔNG BAO GIỜ ghi đè số dư đang có
  const accCountRow = await db.get('SELECT COUNT(*) as count FROM accounts');
  if (!accCountRow || Number(accCountRow.count) === 0) {
    console.log('Khởi tạo tài khoản mặc định (Số dư 0đ)...');
    await client.batch([
      {
        sql: `INSERT OR IGNORE INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['acc_primary', 'Agribank Plus', 'AGRI', '****8888', 0, 'VND', 'landmark', '#059669']
      },
      {
        sql: `INSERT OR IGNORE INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['acc_cash', 'Ví Tiền Mặt', 'CASH', 'Tiền mặt trong ví', 0, 'VND', 'wallet', '#f59e0b']
      }
    ]);
  }

  // Đảm bảo có sẵn các tài khoản phụ nếu chưa có (Techcombank & Viettel Money)
  await client.batch([
    {
      sql: `INSERT OR IGNORE INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['acc_tcb', 'Techcombank', 'TCB', 'Tài khoản Techcombank', 0, 'VND', 'credit-card', '#dc2626']
    },
    {
      sql: `INSERT OR IGNORE INTO accounts (id, name, bank_code, account_number, balance, currency, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['acc_vtm', 'Viettel Money', 'VTM', 'Ví Viettel Money', 0, 'VND', 'smartphone', '#e11d48']
    }
  ]);
  const catCountRow = await db.get('SELECT COUNT(*) as count FROM categories');
  if (catCountRow && Number(catCountRow.count) > 0) {
    return; // Đã có danh mục, không cần seed lại
  }

  console.log('Khởi tạo dữ liệu danh mục & quy tắc ban đầu...');

  const categories = [
    ['cat_food', 'Cơm & Đồ ăn', 'EXPENSE', 'Utensils', '#f59e0b', 1, 1],
    ['cat_shopping', 'Mua sắm & Siêu thị', 'EXPENSE', 'ShoppingBag', '#ec4899', 1, 2],
    ['cat_drink', 'Cà phê & Đồ uống', 'EXPENSE', 'Coffee', '#d97706', 1, 2],
    ['cat_transport', 'Di chuyển & Xăng xe', 'EXPENSE', 'Car', '#3b82f6', 1, 3],
    ['cat_bills', 'Hóa đơn & Tiện ích', 'EXPENSE', 'Receipt', '#8b5cf6', 1, 4],
    ['cat_entertainment', 'Giải trí & Phim ảnh', 'EXPENSE', 'Film', '#06b6d4', 1, 5],
    ['cat_health', 'Sức khỏe & Thuốc', 'EXPENSE', 'HeartPulse', '#10b981', 1, 6],
    ['cat_education', 'Học tập & Sách', 'EXPENSE', 'GraduationCap', '#6366f1', 0, 7],
    ['cat_housing', 'Nhà cửa & Đồ gia dụng', 'EXPENSE', 'Home', '#14b8a6', 0, 8],
    ['cat_other_expense', 'Chi tiêu khác', 'EXPENSE', 'MoreHorizontal', '#64748b', 1, 9],
    ['cat_salary', 'Lương hàng tháng', 'INCOME', 'Briefcase', '#10b981', 1, 10],
    ['cat_freelance', 'Thu nhập ngoài & Thưởng', 'INCOME', 'Award', '#84cc16', 1, 11],
    ['cat_investment', 'Đầu tư & Lãi suất', 'INCOME', 'TrendingUp', '#06b6d4', 1, 12],
    ['cat_other_income', 'Thu nhập khác', 'INCOME', 'PlusCircle', '#64748b', 0, 13],
    ['cat_loan', 'Cho vay & Cho mượn', 'EXPENSE', 'HandCoins', '#ec4899', 1, 14],
    ['cat_debt_collect', 'Thu hồi nợ / Nhận tiền trả', 'INCOME', 'Handshake', '#10b981', 1, 15],
    ['cat_transfer_cash', 'Rút tiền vào Ví (ATM)', 'EXPENSE', 'Banknote', '#06b6d4', 1, 16],
  ];

  await client.batch(
    categories.map(c => ({
      sql: `INSERT OR IGNORE INTO categories (id, name, type, icon, color, is_quick_action, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: c
    }))
  );

  const rules = [
    ['rule_1', 'PHUC LONG', 'cat_drink', 0],
    ['rule_2', 'HIGHLANDS', 'cat_drink', 0],
    ['rule_3', 'STARBUCKS', 'cat_drink', 0],
    ['rule_coffee_house', 'THE COFFEE HOUSE', 'cat_drink', 0],
    ['rule_katinat', 'KATINAT', 'cat_drink', 0],
    ['rule_ca_phe', 'CA PHE', 'cat_drink', 0],
    ['rule_tra_sua', 'TRA SUA', 'cat_drink', 0],
    ['rule_mixue', 'MIXUE', 'cat_drink', 0],
    ['rule_food_1', 'COM TAM', 'cat_food', 0],
    ['rule_food_2', 'BUN BO', 'cat_food', 0],
    ['rule_food_3', 'PHO ', 'cat_food', 0],
    ['rule_food_4', 'BANH MI', 'cat_food', 0],
    ['rule_food_5', 'QUAN COM', 'cat_food', 0],
    ['rule_food_6', 'NHA HANG', 'cat_food', 0],
    ['rule_4', 'GRAB', 'cat_transport', 0],
    ['rule_5', 'BE GROUP', 'cat_transport', 0],
    ['rule_6', 'SHOPEE', 'cat_shopping', 0],
    ['rule_7', 'WINMART', 'cat_shopping', 0],
    ['rule_8', 'TIEN DIEN', 'cat_bills', 1],
    ['rule_9', 'LUONG THANG', 'cat_salary', 1],
  ];

  await client.batch(
    rules.map(r => ({
      sql: `INSERT OR IGNORE INTO auto_rules (id, keyword, category_id, is_auto_apply) VALUES (?, ?, ?, ?)`,
      args: r
    }))
  );

  console.log('Hoàn tất khởi tạo danh mục và quy tắc!');
}

// ĐÃ TẮT: Không tự động tạo giao dịch demo ban đầu
export function seedInitialTransactions() {
  console.log('Tự động tạo giao dịch mẫu đã bị tắt vĩnh viễn theo yêu cầu người dùng.');
}

export { db, TURSO_URL };
