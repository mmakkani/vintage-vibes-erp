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
    supplier_name VARCHAR(255),
    party_name VARCHAR(255),
    container_no VARCHAR(64),
    bl_no VARCHAR(64),
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

-- Ensure columns exist if table was already created
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS party_name VARCHAR(255);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS container_no VARCHAR(64);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS bl_no VARCHAR(64);

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

-- ==========================================================
-- 16. OMNICHANNEL SALES & E-COMMERCE
-- ==========================================================

-- A. POS Sales
CREATE TABLE IF NOT EXISTS public.pos_sales (
    id VARCHAR(64) PRIMARY KEY,
    invoice_number VARCHAR(64) NOT NULL,
    cashier_id VARCHAR(64),
    customer_name VARCHAR(128) DEFAULT 'Walk-in Customer',
    customer_phone VARCHAR(32),
    items JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC(16, 2) DEFAULT 0.00,
    tax_amount NUMERIC(16, 2) DEFAULT 0.00,
    discount_amount NUMERIC(16, 2) DEFAULT 0.00,
    grand_total NUMERIC(16, 2) DEFAULT 0.00,
    payment_type VARCHAR(32) DEFAULT 'CASH',
    payment_status VARCHAR(32) DEFAULT 'PAID',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. B2B Wholesale Sales
CREATE TABLE IF NOT EXISTS public.b2b_sales (
    id VARCHAR(64) PRIMARY KEY,
    b2b_invoice_number VARCHAR(64) NOT NULL,
    company_name VARCHAR(128) NOT NULL,
    trn_number VARCHAR(64),
    contact_person VARCHAR(128),
    phone VARCHAR(32),
    email VARCHAR(128),
    items JSONB DEFAULT '[]'::jsonb,
    total_amount NUMERIC(16, 2) DEFAULT 0.00,
    paid_amount NUMERIC(16, 2) DEFAULT 0.00,
    balance_due NUMERIC(16, 2) DEFAULT 0.00,
    payment_terms VARCHAR(64) DEFAULT 'Net 30',
    credit_status VARCHAR(32) DEFAULT 'PENDING',
    shipping_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C. Online Orders
CREATE TABLE IF NOT EXISTS public.orders (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL,
    customer_name VARCHAR(128) NOT NULL,
    customer_phone VARCHAR(32) NOT NULL,
    customer_address TEXT,
    city VARCHAR(64),
    items JSONB DEFAULT '[]'::jsonb,
    total_amount NUMERIC(16, 2) DEFAULT 0.00,
    delivery_fee NUMERIC(12, 2) DEFAULT 0.00,
    payment_method VARCHAR(32) DEFAULT 'COD',
    payment_status VARCHAR(32) DEFAULT 'PENDING',
    order_status VARCHAR(32) DEFAULT 'CONFIRMED',
    source VARCHAR(64) DEFAULT 'ONLINE_STORE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- D. Live Stream Flash Claims
CREATE TABLE IF NOT EXISTS public.live_stream_sales (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) DEFAULT 'LIVE-STREAM',
    platform VARCHAR(32) DEFAULT 'TIKTOK',
    customer_handle VARCHAR(128) NOT NULL,
    customer_phone VARCHAR(32),
    item_code VARCHAR(64) NOT NULL,
    item_description TEXT,
    claimed_price NUMERIC(14, 2) DEFAULT 0.00,
    claim_status VARCHAR(32) DEFAULT 'CLAIMED',
    converted_to_order_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 17. ITEM MASTERS & INVENTORY AGGREGATES
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.item_masters (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(128) DEFAULT 'Denim & Outerwear',
    description TEXT,
    base_price NUMERIC(14, 2) DEFAULT 100.00,
    target_uom VARCHAR(32) DEFAULT 'KG',
    weight_kg NUMERIC(10, 2) DEFAULT 1.00,
    uom VARCHAR(32) DEFAULT 'KG',
    coa_account_id VARCHAR(64),
    min_stock_threshold INTEGER DEFAULT 5,
    status VARCHAR(32) DEFAULT 'POSTED',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(64) UNIQUE,
    stock_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 18. LIVE BROADCAST BOOTHS & MULTI-CAST SOCIAL MEDIA
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.live_booths (
    id VARCHAR(64) PRIMARY KEY,
    booth_name VARCHAR(128) NOT NULL,
    host_operator_name VARCHAR(128),
    rtmp_ingest_url TEXT,
    stream_key TEXT,
    hls_playback_url TEXT,
    active_product_sku VARCHAR(64),
    is_broadcasting BOOLEAN DEFAULT FALSE,
    viewer_count INTEGER DEFAULT 0,
    camera_source VARCHAR(64) DEFAULT 'OBS Camera',
    current_deal_price NUMERIC(12, 2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default booths
INSERT INTO public.live_booths (id, booth_name, host_operator_name, is_broadcasting, viewer_count, camera_source, current_deal_price)
VALUES 
    ('booth_01', 'Booth 1 - Main Studio', 'Staff Host 1', false, 0, 'OBS Studio 1', 0),
    ('booth_02', 'Booth 2 - Vintage Grail Desk', 'Staff Host 2', false, 0, 'OBS Studio 2', 0),
    ('booth_03', 'Booth 3 - Streetwear Floor', 'Staff Host 3', false, 0, 'OBS Studio 3', 0),
    ('booth_04', 'Booth 4 - Denim & Workwear', 'Staff Host 4', false, 0, 'OBS Studio 4', 0),
    ('booth_05', 'Booth 5 - Flash Sale Express', 'Staff Host 5', false, 0, 'OBS Studio 5', 0)
ON CONFLICT (id) DO UPDATE SET
    booth_name = EXCLUDED.booth_name;

CREATE TABLE IF NOT EXISTS public.live_multicast_settings (
    id VARCHAR(64) PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
    is_live BOOLEAN DEFAULT FALSE,
    broadcast_title VARCHAR(255) DEFAULT 'Live Showcase',
    stream_url TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    youtube_url TEXT,
    tiktok_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.live_multicast_settings (id, is_live, broadcast_title)
VALUES ('00000000-0000-0000-0000-000000000001', false, 'Live Vintage Showcase')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.streaming_api_keys (
    id VARCHAR(64) PRIMARY KEY,
    platform VARCHAR(32) NOT NULL,
    server_url TEXT,
    stream_key TEXT,
    api_key TEXT,
    api_secret TEXT,
    access_token TEXT,
    is_connected BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 19. MARKETING ENGINE (CAMPAIGNS, AUTOMATIONS, COUPONS, AUDIENCES)
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'cmp-' || replace(gen_random_uuid()::text, '-', ''),
    campaign_name VARCHAR(255) NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
    target_audience VARCHAR(128),
    message_template TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_automations (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'auto-' || replace(gen_random_uuid()::text, '-', ''),
    automation_name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(128) NOT NULL,
    action_type VARCHAR(128) NOT NULL,
    template_id VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupons (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'cpn-' || replace(gen_random_uuid()::text, '-', ''),
    coupon_code VARCHAR(64) UNIQUE NOT NULL,
    discount_type VARCHAR(32) DEFAULT 'percentage',
    discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    min_order_amount NUMERIC(12, 2) DEFAULT 0.00,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_audiences (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'aud-' || replace(gen_random_uuid()::text, '-', ''),
    segment_name VARCHAR(128) NOT NULL,
    criteria JSONB DEFAULT '{}'::jsonb,
    total_members INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 20. FOREIGN KEY SAFETY RELAXATION (ZERO POSTING FAILURES)
-- ==========================================================
ALTER TABLE purchase_invoices DROP CONSTRAINT IF EXISTS purchase_invoices_supplier_id_fkey;
ALTER TABLE sales_invoices DROP CONSTRAINT IF EXISTS sales_invoices_client_id_fkey;
ALTER TABLE ledgers DROP CONSTRAINT IF EXISTS ledgers_voucher_id_fkey;
ALTER TABLE ledgers DROP CONSTRAINT IF EXISTS ledgers_account_id_fkey;
ALTER TABLE ledgers DROP CONSTRAINT IF EXISTS ledgers_party_id_fkey;
ALTER TABLE parties DROP CONSTRAINT IF EXISTS parties_coa_account_id_fkey;

-- DISABLE ROW LEVEL SECURITY ACROSS ALL PUBLIC TABLES
DO $$ 
DECLARE 
  r RECORD;
BEGIN 
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY;';
  END LOOP; 
END $$;

-- ==========================================================
-- 21. HR & UAE LEGAL IDENTITY RECORD TABLES
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    emp_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT,
    name_arabic TEXT,
    designation TEXT,
    department TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    nationality TEXT,
    gender TEXT DEFAULT 'MALE',
    dob DATE,
    joining_date DATE DEFAULT CURRENT_DATE,
    date_of_joining DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'POSTED',
    is_active BOOLEAN DEFAULT true,
    salary_type TEXT DEFAULT 'MONTHLY',
    base_salary NUMERIC(15,2) DEFAULT 0,
    basic_salary NUMERIC(15,2) DEFAULT 0,
    housing_allow NUMERIC(15,2) DEFAULT 0,
    transport_allow NUMERIC(15,2) DEFAULT 0,
    other_allow NUMERIC(15,2) DEFAULT 0,
    working_hours_per_day NUMERIC(5,2) DEFAULT 8,
    piece_rate_per_kg NUMERIC(15,2) DEFAULT 0,
    overtime_hourly_rate NUMERIC(15,2) DEFAULT 0,
    bank_account_iban TEXT,
    emirates_id TEXT,
    id_card_no TEXT,
    emirates_id_expiry DATE,
    passport_no TEXT,
    passport_country TEXT,
    passport_issue_date DATE,
    passport_expiry DATE,
    residency_card_no TEXT,
    uid_no TEXT,
    residency_profession TEXT,
    residency_sponsor TEXT,
    residency_issue_date DATE,
    residency_expiry_date DATE,
    id_front_image_url TEXT,
    id_back_image_url TEXT,
    passport_image_url TEXT,
    residency_image_url TEXT,
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_documents (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_no TEXT,
    document_name TEXT,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    issue_date DATE,
    expiry_date DATE,
    ocr_data JSONB,
    is_verified BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_attendance (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name TEXT,
    emp_code TEXT,
    month_year TEXT NOT NULL,
    days_worked NUMERIC(5,2) DEFAULT 30,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    status TEXT DEFAULT 'DRAFT',
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_attendance_sheets (
    id TEXT PRIMARY KEY,
    month_year TEXT UNIQUE NOT NULL,
    total_employees INTEGER DEFAULT 0,
    status TEXT DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_loans (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name TEXT,
    emp_code TEXT,
    type TEXT DEFAULT 'SALARY_ADVANCE',
    principal_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    emi_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_months INTEGER NOT NULL DEFAULT 1,
    start_month TEXT NOT NULL,
    remaining_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    disbursement_account TEXT,
    disbursement_method TEXT DEFAULT 'BANK_TRANSFER',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.employee_payroll (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name TEXT,
    emp_code TEXT,
    designation TEXT,
    month_year TEXT NOT NULL,
    status TEXT DEFAULT 'DRAFT',
    base_salary NUMERIC(15,2) DEFAULT 0,
    allowances NUMERIC(15,2) DEFAULT 0,
    daily_rate NUMERIC(15,2) DEFAULT 0,
    hourly_rate NUMERIC(15,2) DEFAULT 0,
    days_worked NUMERIC(5,2) DEFAULT 30,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    earned_basic NUMERIC(15,2) DEFAULT 0,
    overtime_pay NUMERIC(15,2) DEFAULT 0,
    gross_pay NUMERIC(15,2) DEFAULT 0,
    advance_deduction NUMERIC(15,2) DEFAULT 0,
    loan_emi_deduction NUMERIC(15,2) DEFAULT 0,
    total_deductions NUMERIC(15,2) DEFAULT 0,
    net_pay NUMERIC(15,2) DEFAULT 0,
    payment_method TEXT DEFAULT 'BANK_TRANSFER',
    bank_account_id TEXT,
    bank_account_name TEXT,
    posted_at TIMESTAMPTZ,
    posted_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_payroll_sheets (
    id TEXT PRIMARY KEY,
    month_year TEXT UNIQUE NOT NULL,
    total_employees INTEGER DEFAULT 0,
    total_gross NUMERIC(15,2) DEFAULT 0,
    total_deductions NUMERIC(15,2) DEFAULT 0,
    total_net NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'DRAFT',
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_ocr_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    employee_id TEXT,
    document_type TEXT,
    confidence_score NUMERIC(5,2),
    extracted_data JSONB,
    raw_response TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- WHATSAPP GATEWAY & PERSISTENT WORKER BRIDGE CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_config (
    id VARCHAR(64) PRIMARY KEY,
    config JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.whatsapp_gateway_config (id, config, updated_at)
VALUES (
    'default',
    '{"connectionMode":"BAILEYS_DIRECT_WEB","baileysConfig":{"enabled":true,"sessionName":"vintage-vibes-prod","autoReconnect":true,"browserName":"Vintage Vibes ERP (Production)","status":"READY","workerBridgeUrl":"https://vintage-vibes-erp-production.up.railway.app"},"metaCloudConfig":{},"gatewayConfig":{},"channelConfig":{}}'::jsonb,
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET config = jsonb_set(
    COALESCE(whatsapp_gateway_config.config, '{}'::jsonb),
    '{baileysConfig,workerBridgeUrl}',
    '"https://vintage-vibes-erp-production.up.railway.app"'::jsonb
),
updated_at = NOW();

-- ============================================================================
-- 22. BOOTH SOCIAL CHANNELS & HEADLESS LIVE MULTICAST INGESTION
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booth_social_channels (
    id TEXT PRIMARY KEY,
    booth_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    account_username TEXT,
    account_password TEXT,
    session_cookies JSONB DEFAULT '[]'::jsonb,
    auth_status TEXT DEFAULT 'IDLE' CHECK (auth_status IN ('IDLE', 'AUTHENTICATING', 'WAITING_OTP', 'LOGGED_IN', 'AUTH_FAILED')),
    last_login_at TIMESTAMPTZ,
    otp_required BOOLEAN DEFAULT false,
    proxy_url TEXT,
    is_active BOOLEAN DEFAULT true,
    stream_status TEXT DEFAULT 'STANDBY',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_booth_platform UNIQUE (booth_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_booth_social_booth_id ON public.booth_social_channels(booth_id);
CREATE INDEX IF NOT EXISTS idx_booth_social_platform ON public.booth_social_channels(platform);