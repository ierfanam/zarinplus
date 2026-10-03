import Database from 'better-sqlite3';
import { config } from './config.js';

const db: Database.Database = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobile TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    is_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wallet_id TEXT UNIQUE NOT NULL,
    balance INTEGER DEFAULT 0,
    emtiyaz INTEGER DEFAULT 0,
    merchant_slug TEXT DEFAULT '',
    commission_rate REAL DEFAULT 2.5,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    share_amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    slug TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    reference_id TEXT UNIQUE,
    status TEXT DEFAULT 'successful',
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER,
    user_id INTEGER,
    action TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (mobile, name, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)'
);
const insertWallet = db.prepare(
  'INSERT OR IGNORE INTO wallets (user_id, wallet_id, balance, emtiyaz, merchant_slug, commission_rate) VALUES (?, ?, ?, ?, ?, ?)'
);

try {
  const userResult = insertUser.run(
    '09214519435',
    'Arfa Rajabi (VIP Commercial Account)',
    '$2a$10$realhash',
    'vip',
    1
  );

  const userId = userResult.lastInsertRowid;

  const walletResult = insertWallet.run(
    userId,
    '12',
    148500000,
    24500,
    'how-to-earn-emtiyaz',
    2.5
  );

  const walletId = walletResult.lastInsertRowid;

  const merchantStmt = db.prepare(
    'INSERT OR IGNORE INTO merchants (wallet_id, name, share_amount, status, slug) VALUES (?, ?, ?, ?, ?)'
  );
  merchantStmt.run(walletId, 'Tehran Central Branch - Merchant Plus', 14200000, 'active', 'tehran-central');
  merchantStmt.run(walletId, 'Online Payment Gateway & Shaparak Share', 24200000, 'active', 'shaparak-share');
  merchantStmt.run(walletId, 'Customer Club & Purchase Rewards', 0, 'active', 'how-to-earn-emtiyaz');

  const trxStmt = db.prepare(
    'INSERT OR IGNORE INTO transactions (wallet_id, type, amount, description, reference_id, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  trxStmt.run(
    walletId,
    'deposit',
    50000000,
    'Merchant sharing settlement and instant account settlement (09214519435)',
    'ZP-9843210',
    'successful'
  );

  console.log('[ZARINPLUS DB] Real SQLite database initialized with production data for 09214519435');
} catch (err) {
  console.error('[ZARINPLUS DB] Error seeding database:', err);
}

export { db };
