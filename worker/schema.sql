-- Cloudflare D1 SQL Schema for Smart Fridge
-- Conforms to Zero-VPS Serverless Architecture

-- 1. Fridges Table
CREATE TABLE IF NOT EXISTS fridges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Fridge Members Table (RBAC: owner, admin, member)
CREATE TABLE IF NOT EXISTS fridge_members (
  fridge_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (fridge_id, user_id)
);

-- 3. Products Table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  fridge_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_type TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  opened_at TEXT,
  expires_at TEXT NOT NULL,
  notify_before_days INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active',
  added_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 4. Invites Table
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  fridge_id TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 10,
  uses_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Indices for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_products_fridge ON products(fridge_id);
CREATE INDEX IF NOT EXISTS idx_products_expires ON products(expires_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON fridge_members(user_id);
