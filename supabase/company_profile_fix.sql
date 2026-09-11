-- ============================================================================
-- VINTAGE VIBES ENTERPRISE ERP - SUPABASE SCHEMA FIX & RLS DEACTIVATION
-- Database: Supabase PostgreSQL (Production)
-- ============================================================================

-- 1. Create company_profile table with all columns and JSONB fallback
CREATE TABLE IF NOT EXISTS public.company_profile (
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

-- 2. Ensure all columns exist for existing deployments
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS company_name VARCHAR(255) DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS address_line1 TEXT DEFAULT 'Plot 42, Industrial Zone 3, Al Quoz';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS address_line2 TEXT DEFAULT 'Dubai Wholesale Garments Hub, UAE';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS trn_tax_no VARCHAR(64) DEFAULT 'TRN-100482910300003';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS default_currency VARCHAR(8) DEFAULT 'AED';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '/vintage_logo.svg';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS phone VARCHAR(32) DEFAULT '+971 4 883 9120';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS email VARCHAR(128) DEFAULT 'contact@vintagevibe.ae';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS vat_rate_percent NUMERIC(5,2) DEFAULT 5.0;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS global_stock_alert_threshold INTEGER DEFAULT 5;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255) DEFAULT 'Emirates NBD - Dubai Business Bay Branch';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bank_account_title VARCHAR(255) DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bank_iban VARCHAR(64) DEFAULT 'AE24 0331 2345 6789 0123 456';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(64);
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bank_qr_code_url TEXT;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS bank_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS enable_cod BOOLEAN DEFAULT TRUE;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS enable_bank_transfer BOOLEAN DEFAULT TRUE;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS enable_card_pay BOOLEAN DEFAULT TRUE;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS enable_apple_google_pay BOOLEAN DEFAULT TRUE;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS free_shipping_threshold_aed NUMERIC(10,2) DEFAULT 350;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS standard_shipping_fee_aed NUMERIC(10,2) DEFAULT 25;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS whatsapp_order_number VARCHAR(32) DEFAULT '+971554186086';
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS pos_terminal_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS payment_gateway JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS tiktok_live_socket JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS pos_bridge JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.company_profile ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Seed Default Company Profile Record
INSERT INTO public.company_profile (
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

-- 4. Global Supabase Row Level Security (RLS) Disable across all public tables
DO $$ 
DECLARE 
  r RECORD;
BEGIN 
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY;';
  END LOOP; 
END $$;
