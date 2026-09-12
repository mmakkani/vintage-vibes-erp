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
    parent_code VARCHAR(32),
    party_id VARCHAR(64),
    tier_level INTEGER DEFAULT 3,
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
    coa_account_id VARCHAR(64) REFERENCES coa_accounts(id) ON DELETE SET NULL,
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

-- 6B. BALE CATEGORIES & BALE PRESETS
CREATE TABLE IF NOT EXISTS public.bale_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bale_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(128) NOT NULL,
    uom VARCHAR(32) DEFAULT 'Bales',
    std_weight NUMERIC(10, 2) DEFAULT 45.00,
    base_rate NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id VARCHAR(64) PRIMARY KEY,
    invoice_id VARCHAR(64) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    item_id VARCHAR(64),
    item_code VARCHAR(64),
    item_name VARCHAR(255),
    package_count NUMERIC(10, 2) DEFAULT 1,
    packaging_uom VARCHAR(32) DEFAULT 'Bales',
    total_weight NUMERIC(12, 3) DEFAULT 0.000,
    rate_per_weight NUMERIC(14, 2) DEFAULT 0.00,
    line_total NUMERIC(16, 2) DEFAULT 0.00,
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

-- 8B. BALE SESSIONS & HIGH-SPEED SORTED PIECES
CREATE TABLE IF NOT EXISTS public.bale_sessions (
    id VARCHAR(64) PRIMARY KEY,
    bale_id VARCHAR(64),
    bale_code VARCHAR(64),
    total_grams NUMERIC(12, 2) DEFAULT 50000.00,
    sorted_grams NUMERIC(12, 2) DEFAULT 0.00,
    remaining_grams NUMERIC(12, 2) DEFAULT 50000.00,
    pieces_count INTEGER DEFAULT 0,
    progress_percent NUMERIC(5, 2) DEFAULT 0.00,
    status VARCHAR(32) DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bale_sorted_pieces (
    id VARCHAR(64) PRIMARY KEY,
    bale_id VARCHAR(64),
    piece_code VARCHAR(64) NOT NULL,
    category VARCHAR(128),
    size VARCHAR(32),
    brand_title VARCHAR(128),
    weight_grams NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cost_price NUMERIC(14, 2) DEFAULT 0.00,
    selling_price NUMERIC(14, 2) DEFAULT 0.00,
    quality_grade VARCHAR(64),
    front_image TEXT,
    back_image TEXT,
    tag_image TEXT,
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

-- Unified aliases/tables for financial vouchers, entries, and general ledger
CREATE TABLE IF NOT EXISTS public.financial_vouchers (
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.voucher_entries (
    id VARCHAR(64) PRIMARY KEY,
    voucher_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(64),
    account_code VARCHAR(32),
    account_name VARCHAR(128),
    party_id VARCHAR(64),
    party_name VARCHAR(128),
    debit NUMERIC(16, 2) DEFAULT 0.00,
    credit NUMERIC(16, 2) DEFAULT 0.00,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledgers (
    id VARCHAR(64) PRIMARY KEY,
    voucher_id VARCHAR(64) REFERENCES vouchers(id) ON DELETE CASCADE,
    account_id VARCHAR(64) REFERENCES coa_accounts(id) ON DELETE CASCADE,
    account_code VARCHAR(32),
    account_name VARCHAR(128),
    party_id VARCHAR(64) REFERENCES parties(id) ON DELETE SET NULL,
    party_name VARCHAR(128),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    debit NUMERIC(16, 2) DEFAULT 0.00,
    credit NUMERIC(16, 2) DEFAULT 0.00,
    balance NUMERIC(16, 2) DEFAULT 0.00,
    narration TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.general_ledger (
    id VARCHAR(64) PRIMARY KEY,
    voucher_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(64),
    account_code VARCHAR(32),
    account_name VARCHAR(128),
    party_id VARCHAR(64),
    party_name VARCHAR(128),
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

-- 14. COMPANY PROFILE & GLOBAL CONFIGURATION
CREATE TABLE IF NOT EXISTS company_profile (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'default-company',
    company_name VARCHAR(255) NOT NULL DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    address_line1 TEXT NOT NULL DEFAULT 'Plot 42, Industrial Zone 3, Al Quoz',
    address_line2 TEXT NOT NULL DEFAULT 'Dubai Wholesale Garments Hub, UAE',
    trn_tax_no VARCHAR(64) NOT NULL DEFAULT 'TRN-100482910300003',
    default_currency VARCHAR(8) NOT NULL DEFAULT 'AED',
    logo_url TEXT DEFAULT '/vintage_logo.svg',
    phone VARCHAR(32) DEFAULT '+971 4 883 9120',
    email VARCHAR(128) DEFAULT 'contact@vintagevibe.ae',
    vat_rate_percent NUMERIC(5,2) DEFAULT 5.0,
    global_stock_alert_threshold INTEGER DEFAULT 5,
    bank_name VARCHAR(255) DEFAULT 'Emirates NBD - Dubai Business Bay Branch',
    bank_account_title VARCHAR(255) DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    bank_iban VARCHAR(64) DEFAULT 'AE24 0331 2345 6789 0123 456',
    bank_account_number VARCHAR(64),
    bank_qr_code_url TEXT,
    bank_accounts JSONB DEFAULT '[]'::jsonb,
    enable_cod BOOLEAN DEFAULT TRUE,
    enable_bank_transfer BOOLEAN DEFAULT TRUE,
    enable_card_pay BOOLEAN DEFAULT TRUE,
    enable_apple_google_pay BOOLEAN DEFAULT TRUE,
    free_shipping_threshold_aed NUMERIC(10,2) DEFAULT 350,
    standard_shipping_fee_aed NUMERIC(10,2) DEFAULT 25,
    whatsapp_order_number VARCHAR(32) DEFAULT '+971554186086',
    pos_terminal_config JSONB DEFAULT '{}'::jsonb,
    payment_gateway JSONB DEFAULT '{}'::jsonb,
    tiktok_live_socket JSONB DEFAULT '{}'::jsonb,
    pos_bridge JSONB DEFAULT '{}'::jsonb,
    profile_data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist for existing tables
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS address_line1 TEXT DEFAULT 'Plot 42, Industrial Zone 3, Al Quoz';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS address_line2 TEXT DEFAULT 'Dubai Wholesale Garments Hub, UAE';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS trn_tax_no VARCHAR(64) DEFAULT 'TRN-100482910300003';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS default_currency VARCHAR(8) DEFAULT 'AED';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '/vintage_logo.svg';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS phone VARCHAR(32) DEFAULT '+971 4 883 9120';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS email VARCHAR(128) DEFAULT 'contact@vintagevibe.ae';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS vat_rate_percent NUMERIC(5,2) DEFAULT 5.0;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS global_stock_alert_threshold INTEGER DEFAULT 5;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255) DEFAULT 'Emirates NBD - Dubai Business Bay Branch';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_account_title VARCHAR(255) DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_iban VARCHAR(64) DEFAULT 'AE24 0331 2345 6789 0123 456';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(64);
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_qr_code_url TEXT;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS bank_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS enable_cod BOOLEAN DEFAULT TRUE;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS enable_bank_transfer BOOLEAN DEFAULT TRUE;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS enable_card_pay BOOLEAN DEFAULT TRUE;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS enable_apple_google_pay BOOLEAN DEFAULT TRUE;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS free_shipping_threshold_aed NUMERIC(10,2) DEFAULT 350;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS standard_shipping_fee_aed NUMERIC(10,2) DEFAULT 25;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS whatsapp_order_number VARCHAR(32) DEFAULT '+971554186086';
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS pos_terminal_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS payment_gateway JSONB DEFAULT '{}'::jsonb;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS tiktok_live_socket JSONB DEFAULT '{}'::jsonb;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS pos_bridge JSONB DEFAULT '{}'::jsonb;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Seed Default Company Profile Record
INSERT INTO company_profile (
    id, company_name, address_line1, address_line2, trn_tax_no, default_currency,
    phone, email, vat_rate_percent, bank_name, bank_account_title, bank_iban,
    enable_cod, enable_bank_transfer, enable_card_pay, enable_apple_google_pay,
    free_shipping_threshold_aed, standard_shipping_fee_aed, whatsapp_order_number, updated_at
) VALUES (
    'default-company',
    'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    'Plot 42, Industrial Zone 3, Al Quoz',
    'Dubai Wholesale Garments Hub, UAE',
    'TRN-100482910300003',
    'AED',
    '+971 4 883 9120',
    'contact@vintagevibe.ae',
    5.0,
    'Emirates NBD - Dubai Business Bay Branch',
    'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    'AE24 0331 2345 6789 0123 456',
    true, true, true, true,
    350, 25, '+971554186086', NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 15. HR & WORKFORCE MANAGEMENT (EMPLOYEES, ATTENDANCE, LOANS, PAYROLL)
CREATE TABLE IF NOT EXISTS public.employees (
    id VARCHAR(64) PRIMARY KEY,
    emp_code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(128),
    department VARCHAR(128),
    base_salary NUMERIC(12,2) DEFAULT 0,
    housing_allow NUMERIC(12,2) DEFAULT 0,
    transport_allow NUMERIC(12,2) DEFAULT 0,
    working_hours_per_day NUMERIC(4,1) DEFAULT 8,
    is_active BOOLEAN DEFAULT TRUE,
    joining_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(32) DEFAULT 'POSTED',
    emirates_id VARCHAR(64),
    residency_card_no VARCHAR(64),
    passport_no VARCHAR(64),
    id_front_image_url TEXT,
    id_back_image_url TEXT,
    name_arabic VARCHAR(255),
    nationality VARCHAR(64),
    gender VARCHAR(16),
    dob DATE,
    emirates_id_expiry DATE,
    id_card_no VARCHAR(64),
    passport_expiry DATE,
    passport_issue_date DATE,
    passport_country VARCHAR(64),
    passport_image_url TEXT,
    uid_no VARCHAR(64),
    residency_issue_date DATE,
    residency_expiry_date DATE,
    residency_sponsor VARCHAR(128),
    residency_profession VARCHAR(128),
    residency_image_url TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_attendance (
    id VARCHAR(64) PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255),
    emp_code VARCHAR(32),
    month_year VARCHAR(16) NOT NULL,
    days_worked NUMERIC(5,2) DEFAULT 30,
    overtime_hours NUMERIC(6,2) DEFAULT 0,
    status VARCHAR(32) DEFAULT 'DRAFT',
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_attendance_sheets (
    id VARCHAR(64) PRIMARY KEY,
    month_year VARCHAR(16) NOT NULL UNIQUE,
    total_employees INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'DRAFT',
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_loans (
    id VARCHAR(64) PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255),
    emp_code VARCHAR(32),
    type VARCHAR(32) DEFAULT 'SALARY_ADVANCE',
    principal_amount NUMERIC(12,2) DEFAULT 0,
    emi_amount NUMERIC(12,2) DEFAULT 0,
    total_months INTEGER DEFAULT 1,
    start_month VARCHAR(16),
    remaining_amount NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(32) DEFAULT 'ACTIVE',
    disbursement_account VARCHAR(64),
    disbursement_method VARCHAR(32) DEFAULT 'BANK_TRANSFER',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_payroll (
    id VARCHAR(64) PRIMARY KEY,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(255),
    emp_code VARCHAR(32),
    designation VARCHAR(128),
    month_year VARCHAR(16) NOT NULL,
    status VARCHAR(32) DEFAULT 'DRAFT',
    base_salary NUMERIC(12,2) DEFAULT 0,
    allowances NUMERIC(12,2) DEFAULT 0,
    daily_rate NUMERIC(12,2) DEFAULT 0,
    hourly_rate NUMERIC(12,2) DEFAULT 0,
    days_worked NUMERIC(5,2) DEFAULT 30,
    overtime_hours NUMERIC(6,2) DEFAULT 0,
    earned_basic NUMERIC(12,2) DEFAULT 0,
    overtime_pay NUMERIC(12,2) DEFAULT 0,
    gross_pay NUMERIC(12,2) DEFAULT 0,
    advance_deduction NUMERIC(12,2) DEFAULT 0,
    loan_emi_deduction NUMERIC(12,2) DEFAULT 0,
    total_deductions NUMERIC(12,2) DEFAULT 0,
    net_pay NUMERIC(12,2) DEFAULT 0,
    payment_method VARCHAR(32) DEFAULT 'BANK_TRANSFER',
    bank_account_id VARCHAR(64),
    bank_account_name VARCHAR(128),
    posted_at TIMESTAMPTZ,
    posted_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_sheets (
    id VARCHAR(64) PRIMARY KEY,
    month_year VARCHAR(16) NOT NULL UNIQUE,
    total_employees INTEGER DEFAULT 0,
    total_gross NUMERIC(14,2) DEFAULT 0,
    total_deductions NUMERIC(14,2) DEFAULT 0,
    total_net NUMERIC(14,2) DEFAULT 0,
    status VARCHAR(32) DEFAULT 'DRAFT',
    disbursement_method VARCHAR(32),
    disbursement_account VARCHAR(64),
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DISABLE ROW LEVEL SECURITY ACROSS ALL PUBLIC TABLES
DO $$ 
DECLARE 
  r RECORD;
BEGIN 
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY;';
  END LOOP; 
END $$;