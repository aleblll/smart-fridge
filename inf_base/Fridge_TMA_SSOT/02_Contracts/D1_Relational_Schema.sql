-- Cloudflare D1 Canonical Schema for Smart Fridge TMA (ADR-007)
-- Server-Authoritative relational structure

-- 1. Fridges Table (Random UUID primary keys to prevent IDOR / enumeration)
CREATE TABLE IF NOT EXISTS fridges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Мой холодильник',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Fridge Members Table (Multi-user household relationships)
CREATE TABLE IF NOT EXISTS fridge_members (
    fridge_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'member', 'viewer')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (fridge_id, user_id),
    FOREIGN KEY (fridge_id) REFERENCES fridges(id) ON DELETE CASCADE
);

-- 3. Products Table (Granular items with soft-delete & change tracking)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    fridge_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Другое',
    storage_type TEXT NOT NULL DEFAULT 'fridge' CHECK(storage_type IN ('fridge', 'freezer', 'pantry')),
    quantity REAL NOT NULL DEFAULT 1.0,
    unit TEXT NOT NULL DEFAULT 'pcs' CHECK(unit IN ('pcs', 'kg', 'g', 'l', 'pack')),
    opened_at TEXT,
    expires_at TEXT NOT NULL, -- Strict calendar format YYYY-MM-DD
    notify_before_days INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'consumed', 'discarded')),
    added_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT, -- Soft-delete timestamp for delta sync
    FOREIGN KEY (fridge_id) REFERENCES fridges(id) ON DELETE CASCADE
);

-- 4. Invites Table (Cryptographic one-time / limited tokens for household joining)
CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY, -- 16+ byte cryptographically random hex/base64 string
    fridge_id TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 10,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (fridge_id) REFERENCES fridges(id) ON DELETE CASCADE
);

-- Indexes for lightning fast queries and notification scans
CREATE INDEX IF NOT EXISTS idx_products_fridge ON products(fridge_id, status);
CREATE INDEX IF NOT EXISTS idx_products_expires ON products(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_members_user ON fridge_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_fridge ON invites(fridge_id);
