-- ==========================================================
-- SUPABASE POSTGRESQL MIGRATION: SALES COURIER TYPE ALIGNMENT & SCHEMA STABILIZATION
-- Migration Date: 2026-10-03
-- Scope:
--   1. Fix join type mismatch (operator does not exist: integer = character varying):
--      Aligns sales_invoices.courier_partner_id to INTEGER matching parties.party_id (int4)
--   2. Ensures B-Tree index on sales_invoices(courier_partner_id) for O(1) indexed joins
--   3. One-time DDL definition for whatsapp_channels and user_sessions (moved out of runtime handlers)
--   4. Preserves all existing data (no drops, safe type coercion using regex digits)
-- ==========================================================

-- ----------------------------------------------------------
-- 1. WHATSAPP CHANNELS & USER SESSIONS SCHEMA STABILIZATION
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    jid VARCHAR(255) NOT NULL UNIQUE,
    invite_link TEXT,
    role VARCHAR(64) DEFAULT 'ADMIN',
    verified_admin BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    subscribers_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_jid 
    ON public.whatsapp_channels(jid);

CREATE TABLE IF NOT EXISTS public.user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id 
    ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at 
    ON public.user_sessions(expires_at);

-- ----------------------------------------------------------
-- 2. SALES INVOICES COURIER PARTNER TYPE ALIGNMENT
-- ----------------------------------------------------------

-- Safely convert courier_partner_id to INTEGER matching parties.party_id (int4)
-- Extracts numeric digits safely so existing numbers (e.g. '75') convert cleanly,
-- while any non-numeric strings become NULL instead of throwing conversion errors.
ALTER TABLE public.sales_invoices 
    ALTER COLUMN courier_partner_id TYPE INTEGER 
    USING NULLIF(regexp_replace(courier_partner_id::text, '[^0-9]', '', 'g'), '')::integer;

-- High-performance covering index for indexed join resolution
CREATE INDEX IF NOT EXISTS idx_sales_invoices_courier_partner 
    ON public.sales_invoices(courier_partner_id);

-- Optional Foreign Key constraint to enforce referential integrity to parties(party_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_invoices_courier_partner'
    ) THEN
        ALTER TABLE public.sales_invoices
            ADD CONSTRAINT fk_sales_invoices_courier_partner
            FOREIGN KEY (courier_partner_id) REFERENCES public.parties(party_id)
            ON DELETE SET NULL;
    END IF;
END $$;
