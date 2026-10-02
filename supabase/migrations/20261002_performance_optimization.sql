-- ==========================================================
-- SUPABASE POSTGRESQL PERFORMANCE OPTIMIZATION MIGRATION
-- Migration Date: 2026-10-02
-- Scope:
--   1. Schema Stabilization: One-time DDL for sessions & WhatsApp channels (removes repeated runtime DDL)
--   2. Foreign Key Covering Indexes: Accelerate joins, cascades & filtered scans
--   3. Redundant Duplicate Index Review & Cleanup
-- ==========================================================

-- ----------------------------------------------------------
-- 1. SCHEMA STABILIZATION (Moved from hot request handlers)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_gateway_config (
    id VARCHAR(64) PRIMARY KEY,
    config JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_channels (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    jid VARCHAR(255) NOT NULL,
    invite_link TEXT,
    role VARCHAR(64) DEFAULT 'ADMIN',
    verified_admin BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    subscribers_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_jid ON public.whatsapp_channels(jid);

-- ----------------------------------------------------------
-- 2. JUSTIFIED FOREIGN KEY COVERING INDEXES
--    Prevents sequential table scans during joins and cascade checks.
-- ----------------------------------------------------------

-- Inward Gate Passes: Essential for loading purchase invoice details and stock receipts
CREATE INDEX IF NOT EXISTS idx_inward_gp_purchase_inv 
    ON public.inward_gate_passes(purchase_invoice_id);

-- Inventory Pieces: Critical for gate pass piece lookups and warehouse inventory scanning
CREATE INDEX IF NOT EXISTS idx_inventory_pieces_gp_id 
    ON public.inventory_pieces(gate_pass_id);

-- General & Sub-Ledgers: Critical for financial voucher entry lookups and audits
CREATE INDEX IF NOT EXISTS idx_ledgers_voucher_id 
    ON public.ledgers(voucher_id);

-- Omnichannel & Sales Invoices: Fixes courier join lookup and dispatch filtering
CREATE INDEX IF NOT EXISTS idx_sales_invoices_courier_partner 
    ON public.sales_invoices(courier_partner_id);

-- Orders: Speeds up customer history and courier manifest lookups
CREATE INDEX IF NOT EXISTS idx_orders_courier_partner_id 
    ON public.orders(courier_partner_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id 
    ON public.orders(customer_id);

-- Bale Sorted Pieces: Speeds up collection-based inventory aggregation
CREATE INDEX IF NOT EXISTS idx_bale_sorted_pieces_collection 
    ON public.bale_sorted_pieces(collection_id);

-- Chart of Accounts: Speeds up hierarchical COA tree traversal and type filtering
CREATE INDEX IF NOT EXISTS idx_accounts_account_type_id 
    ON public.accounts(account_type_id);

CREATE INDEX IF NOT EXISTS idx_accounts_parent_id 
    ON public.accounts(parent_id);

-- Parties: Connects parties to their default Chart of Accounts mapping
CREATE INDEX IF NOT EXISTS idx_parties_account_id 
    ON public.parties(account_id);

-- Customer Wallet Transactions: Speeds up order-level wallet settlement lookups
CREATE INDEX IF NOT EXISTS idx_cust_wallet_tx_order_id 
    ON public.customer_wallet_transactions(reference_order_id);


-- ----------------------------------------------------------
-- 3. VERIFIED REDUNDANT DUPLICATE INDEXES (For Review & Approval)
--    The following non-unique indexes duplicate existing UNIQUE constraints or identical btrees.
--    Dropping them reduces write amplification and saves Supabase storage I/O.
-- ----------------------------------------------------------

-- Table: inventory_pieces (barcode is already UNIQUE indexed by inventory_pieces_barcode_key)
-- DROP INDEX IF EXISTS public.idx_inventory_barcode;
-- DROP INDEX IF EXISTS public.idx_inv_pieces_barcode;

-- Table: inventory_pieces (duplicate of idx_inventory_status)
-- DROP INDEX IF EXISTS public.idx_inv_pieces_status;

-- Table: orders (order_number is already UNIQUE indexed by orders_order_number_key)
-- DROP INDEX IF EXISTS public.idx_orders_order_number;

-- Table: sales_gate_passes (gate_pass_no is already UNIQUE indexed by sales_gate_passes_gate_pass_no_key)
-- DROP INDEX IF EXISTS public.idx_sales_gate_passes_no;

-- Table: parcel_returns (return_no is already UNIQUE indexed by parcel_returns_return_no_key)
-- DROP INDEX IF EXISTS public.idx_parcel_returns_no;

-- Table: courier_cod_settlements (settlement_no is already UNIQUE indexed by courier_cod_settlements_settlement_no_key)
-- DROP INDEX IF EXISTS public.idx_courier_cod_settlement_no;

-- Table: device_installations (device_id is already UNIQUE indexed by device_installations_device_id_key)
-- DROP INDEX IF EXISTS public.idx_device_install_device_id;

-- Table: sorting_batches (batch_number is already UNIQUE indexed by sorting_batches_batch_number_key)
-- DROP INDEX IF EXISTS public.idx_sorting_batches_batch_no;

-- Table: grail_bounties (duplicates of idx_bounties_*)
-- DROP INDEX IF EXISTS public.idx_grail_bounties_brand;
-- DROP INDEX IF EXISTS public.idx_grail_bounties_status;
-- DROP INDEX IF EXISTS public.idx_grail_bounties_phone;
