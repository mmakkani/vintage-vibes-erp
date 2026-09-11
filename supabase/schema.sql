-- ==========================================================
-- VINTAGE VIBES ENTERPRISE ERP - COMPLETE POSTGRESQL SCHEMA
-- Target Database: Supabase PostgreSQL (Live Production)
-- Storage Bucket: "vintage-vibes-media"
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & ACCESS CONTROL
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'STAFF',
    assigned_shop_id VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    permissions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CURRENCIES
CREATE TABLE IF NOT EXISTS currencies (
    id VARCHAR(32) PRIMARY KEY,
    code VARCHAR(8) UNIQUE NOT NULL,
    name VARCHAR(64) NOT NULL,
    symbol VARCHAR(8) NOT NULL,
    exchange_rate NUMERIC(14, 6) NOT NULL DEFAULT 1.0,
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CHART OF ACCOUNTS (COA)
CREATE TABLE IF NOT EXISTS coa_accounts (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL,
    sub_type VARCHAR(64),
    currency VARCHAR(8) DEFAULT 'AED',
    current_balance NUMERIC(16, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    parent_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PARTIES (SUPPLIERS & CLIENTS / CUSTOMERS)
CREATE TABLE IF NOT EXISTS parties (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL,
    contact_person VARCHAR(128),
    phone VARCHAR(32),
    email VARCHAR(128),
    address TEXT,
    trn_no VARCHAR(64),
    credit_limit NUMERIC(14, 2) DEFAULT 0.00,
    current_balance NUMERIC(16, 2) DEFAULT 0.00,
    currency VARCHAR(8) DEFAULT 'AED',
    is_active BOOLEAN DEFAULT TRUE,
    account_map JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SHOPS & WAREHOUSES
CREATE TABLE IF NOT EXISTS shop_masters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    location VARCHAR(255),
    is_warehouse BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRODUCT TAXONOMY
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    code VARCHAR(16)
);

CREATE TABLE IF NOT EXISTS sizes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(32) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS label_grades (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS brand_masters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    tier VARCHAR(32) DEFAULT 'Grail'
);

-- 7. PURCHASE INVOICES (BALES / CONSIGNMENTS)
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id VARCHAR(64) PRIMARY KEY,
    invoice_no VARCHAR(64) UNIQUE NOT NULL,
    supplier_id VARCHAR(64) REFERENCES parties(id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    currency VARCHAR(8) DEFAULT 'AED',
    exchange_rate NUMERIC(14, 6) DEFAULT 1.0,
    subtotal NUMERIC(16, 2) DEFAULT 0.00,
    tax_amount NUMERIC(16, 2) DEFAULT 0.00,
    total_amount NUMERIC(16, 2) DEFAULT 0.00,
    total_weight_kg NUMERIC(12, 3) DEFAULT 0.000,
    status VARCHAR(32) DEFAULT 'RECEIVED',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INWARD GATE PASSES (IGP)
CREATE TABLE IF NOT EXISTS inward_gate_passes (
    id VARCHAR(64) PRIMARY KEY,
    pass_no VARCHAR(64) UNIQUE NOT NULL,
    purchase_invoice_id VARCHAR(64) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    supplier_name VARCHAR(128),
    bale_tag_no VARCHAR(64),
    weight_kg NUMERIC(12, 3) DEFAULT 0.000,
    status VARCHAR(32) DEFAULT 'CLEARED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. INVENTORY PIECES (INDIVIDUAL GARMENTS WITH SUPABASE STORAGE MEDIA)
CREATE TABLE IF NOT EXISTS inventory_pieces (
    id VARCHAR(64) PRIMARY KEY,
    gate_pass_id VARCHAR(64) REFERENCES inward_gate_passes(id) ON DELETE SET NULL,
    barcode VARCHAR(64) UNIQUE NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    brand_name VARCHAR(64),
    brand_tier VARCHAR(32),
    label_grade VARCHAR(32),
    shop_location VARCHAR(128) DEFAULT 'Central Warehouse (Al Quoz)',
    weight_kg NUMERIC(8, 3) DEFAULT 0.000,
    weight_grams NUMERIC(10, 2) DEFAULT 0.00,
    cost_per_gram NUMERIC(10, 4) DEFAULT 0.00,
    cost_price NUMERIC(14, 2) DEFAULT 0.00,
    estimated_price NUMERIC(14, 2) DEFAULT 0.00,
    retail_price_aed NUMERIC(14, 2) DEFAULT 0.00,
    size_scanned VARCHAR(32),
    country_of_origin VARCHAR(64),
    style VARCHAR(128),
    -- Supabase Storage Public URLs
    front_image_url TEXT,
    back_image_url TEXT,
    tag_image_url TEXT,
    is_sold BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) DEFAULT 'AVAILABLE',
    locked_by_buyer VARCHAR(128),
    locked_by_booth VARCHAR(64),
    lock_expires_at BIGINT,
    reserved_until BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. SALES INVOICES
CREATE TABLE IF NOT EXISTS sales_invoices (
    id VARCHAR(64) PRIMARY KEY,
    invoice_no VARCHAR(64) UNIQUE NOT NULL,
    client_id VARCHAR(64) REFERENCES parties(id) ON DELETE SET NULL,
    customer_name VARCHAR(128),
    customer_phone VARCHAR(32),
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    channel VARCHAR(64) DEFAULT 'WHATSAPP_LIVE',
    payment_method VARCHAR(64) DEFAULT 'CASH',
    subtotal NUMERIC(16, 2) DEFAULT 0.00,
    discount_amount NUMERIC(14, 2) DEFAULT 0.00,
    tax_amount NUMERIC(14, 2) DEFAULT 0.00,
    total_amount NUMERIC(16, 2) DEFAULT 0.00,
    status VARCHAR(32) DEFAULT 'PAID',
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. FINANCIAL VOUCHERS & LEDGERS
CREATE TABLE IF NOT EXISTS vouchers (
    id VARCHAR(64) PRIMARY KEY,
    voucher_no VARCHAR(64) UNIQUE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(32) NOT NULL,
    reference VARCHAR(128),
    narration TEXT,
    total_debit NUMERIC(16, 2) DEFAULT 0.00,
    total_credit NUMERIC(16, 2) DEFAULT 0.00,
    status VARCHAR(32) DEFAULT 'POSTED',
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledgers (
    id VARCHAR(64) PRIMARY KEY,
    voucher_id VARCHAR(64) REFERENCES vouchers(id) ON DELETE CASCADE,
    account_id VARCHAR(64) REFERENCES coa_accounts(id) ON DELETE CASCADE,
    account_code VARCHAR(32),
    account_name VARCHAR(128),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    debit NUMERIC(16, 2) DEFAULT 0.00,
    credit NUMERIC(16, 2) DEFAULT 0.00,
    balance NUMERIC(16, 2) DEFAULT 0.00,
    narration TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PARTY KHATA LOGS
CREATE TABLE IF NOT EXISTS party_khata_logs (
    id VARCHAR(64) PRIMARY KEY,
    party_id VARCHAR(64) REFERENCES parties(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference VARCHAR(128),
    debit NUMERIC(16, 2) DEFAULT 0.00,
    credit NUMERIC(16, 2) DEFAULT 0.00,
    running_balance NUMERIC(16, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    module VARCHAR(32) NOT NULL,
    action VARCHAR(32) NOT NULL,
    document_ref VARCHAR(128),
    status VARCHAR(32) DEFAULT 'POSTED',
    actor VARCHAR(128) NOT NULL,
    details TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR FAST REPORTING & HIGH-VOLUME SCANS
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory_pieces(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_pieces(status);
CREATE INDEX IF NOT EXISTS idx_ledgers_account ON ledgers(account_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_date ON ledgers(date);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
CREATE INDEX IF NOT EXISTS idx_parties_phone ON parties(phone);