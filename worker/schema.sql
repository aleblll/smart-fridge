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

-- 3. Products Table (Запасы + Архив Съедено/Утиль)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  fridge_id TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL COLLATE NOCASE DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Другое',
  barcode TEXT,
  storage_type TEXT NOT NULL CHECK (storage_type IN ('fridge', 'freezer', 'pantry')),
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  is_discrete INTEGER NOT NULL DEFAULT 1 CHECK (is_discrete IN (0, 1)),
  opened_at TEXT,
  expires_at TEXT NOT NULL,
  after_opening_hours INTEGER,
  notify_before_days INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'discarded')),
  added_by INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (fridge_id) REFERENCES fridges(id) ON DELETE CASCADE
);

-- Покрывающий индекс: защищает квоту 100k чтений D1 от сканирования архива consumed/discarded
CREATE INDEX IF NOT EXISTS idx_products_fridge ON products(fridge_id);
CREATE INDEX IF NOT EXISTS idx_products_expires ON products(expires_at);
CREATE INDEX IF NOT EXISTS idx_products_active_lookup ON products (fridge_id, status, storage_type, expires_at ASC);

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

-- 5. User Notifications Table (Idempotency for daily digests)
CREATE TABLE IF NOT EXISTS user_notifications (
  user_id INTEGER PRIMARY KEY,
  last_digest_date TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 6. Family Presets Table (Частые покупки + кэш штрихкодов семьи)
CREATE TABLE IF NOT EXISTS fridge_presets (
  fridge_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  category TEXT,
  barcode TEXT,
  storage_type TEXT NOT NULL CHECK (storage_type IN ('fridge', 'freezer', 'pantry')),
  unit TEXT NOT NULL,
  is_discrete INTEGER NOT NULL DEFAULT 1,
  shelf_life_days INTEGER NOT NULL,
  after_opening_hours INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT NOT NULL,
  PRIMARY KEY (fridge_id, canonical_name, storage_type),
  FOREIGN KEY (fridge_id) REFERENCES fridges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fridge_presets_top ON fridge_presets (fridge_id, usage_count DESC, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_fridge_presets_barcode ON fridge_presets (fridge_id, barcode) WHERE barcode IS NOT NULL;

-- 7. Shopping List Table (Список покупок / Что закончилось)
CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  fridge_id TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL COLLATE NOCASE,
  storage_type TEXT NOT NULL DEFAULT 'fridge',
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'шт',
  shelf_life_days INTEGER NOT NULL DEFAULT 7,
  is_checked INTEGER NOT NULL DEFAULT 0 CHECK (is_checked IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (fridge_id) REFERENCES fridges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shopping_fridge ON shopping_items (fridge_id, is_checked, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_user ON fridge_members(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_date ON user_notifications(last_digest_date);
