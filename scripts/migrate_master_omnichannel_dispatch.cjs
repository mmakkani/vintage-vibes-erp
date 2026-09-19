const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('=== [MASTER PRODUCTION MIGRATION STARTED] ===');

  // 1. Grail Bounties / Custom Sourcing Customer Demands Table
  console.log('1. Ensuring grail_bounties table and columns...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.grail_bounties (
      id VARCHAR(64) PRIMARY KEY,
      customer_name VARCHAR(150) NOT NULL,
      customer_phone VARCHAR(50) NOT NULL,
      customer_email VARCHAR(255),
      desired_brand VARCHAR(150) NOT NULL,
      desired_category VARCHAR(100),
      desired_size VARCHAR(50),
      max_budget_aed NUMERIC(12, 2) DEFAULT 0.00,
      notes TEXT,
      status VARCHAR(50) DEFAULT 'OPEN',
      matched_barcode VARCHAR(64),
      notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE public.grail_bounties
    ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS preferred_size VARCHAR(50),
    ADD COLUMN IF NOT EXISTS era_notes TEXT,
    ADD COLUMN IF NOT EXISTS matched_piece_id BIGINT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

    -- Sync complementary column values if null
    UPDATE public.grail_bounties SET whatsapp_phone = customer_phone WHERE whatsapp_phone IS NULL;
    UPDATE public.grail_bounties SET preferred_size = desired_size WHERE preferred_size IS NULL;
    UPDATE public.grail_bounties SET era_notes = notes WHERE era_notes IS NULL;

    CREATE INDEX IF NOT EXISTS idx_grail_bounties_status ON public.grail_bounties(status);
    CREATE INDEX IF NOT EXISTS idx_grail_bounties_phone ON public.grail_bounties(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_grail_bounties_brand ON public.grail_bounties(desired_brand);
  `);

  // 1b. Inventory Pieces Table: Add dispatched_at
  console.log('1b. Updating inventory_pieces table columns...');
  await client.query(`
    ALTER TABLE public.inventory_pieces
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
  `);

  // 2. Orders Table: Complete Courier & Payment Classification
  console.log('2. Updating orders table columns...');
  await client.query(`
    ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS courier_partner_id INTEGER,
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_remittance_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS settlement_pin_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shipping_bearer VARCHAR(50) DEFAULT 'Customer Bears',
    ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS voucher_id TEXT,
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
  `);

  // 3. Sales Invoices Table: Dispatch & Payment Support
  console.log('3. Updating sales_invoices table columns...');
  await client.query(`
    ALTER TABLE public.sales_invoices
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(64) DEFAULT 'UNPAID_PENDING_COD',
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(128),
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS courier_partner_id INTEGER,
    ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(128),
    ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS shipping_bearer VARCHAR(32) DEFAULT 'Customer Bears',
    ADD COLUMN IF NOT EXISTS order_id TEXT;
  `);

  // 4. Sales Channel Settings: Seed verified transactional fallbacks
  console.log('4. Seeding sales_channel_settings...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.sales_channel_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      setting_key TEXT UNIQUE NOT NULL,
      account_code TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO public.sales_channel_settings (setting_key, account_code, description)
    VALUES 
      ('cogs_account', '5100-02', 'Cost of Goods Sold - Finished Goods'),
      ('finished_goods_inventory', '1160-01', 'Finished Goods Inventory Asset'),
      ('courier_cod_clearing', '1128-01', 'Courier COD Clearing (Pending Remittance)'),
      ('courier_payable', '2120-00', 'Courier Delivery Payable Control Khata'),
      ('delivery_expense', '5140-01', 'Courier & Delivery Charges Expense'),
      ('pos_cash_drawer', '1110-01', 'POS Cash in Hand (Drawer)'),
      ('pos_terminal_clearing', '1125-01', 'POS Terminal & Card Tap Clearing'),
      ('live_sales_clearing', '1130-02', 'LIVE SALES Control Khata'),
      ('ecommerce_sales_clearing', '1130-03', 'E-COMMERCE SALES Control Khata'),
      ('pos_sales_clearing', '1130-04', 'POS SALES Control Khata'),
      ('b2b_sales_receivable', '1130-01', 'EMIRATES WHOLESALE Receivable'),
      ('b2b_revenue', '4110-05', 'B2B Wholesale Revenue'),
      ('omnichannel_retail_revenue', '4110-01', 'POS, Live & E-Commerce Revenue')
    ON CONFLICT (setting_key) DO UPDATE 
    SET account_code = EXCLUDED.account_code,
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP;
  `);

  // 5. Deploy Procedure 1: post_sales_dispatch_and_cogs_voucher
  console.log('5. Deploying post_sales_dispatch_and_cogs_voucher procedure...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.post_sales_dispatch_and_cogs_voucher(
        p_order_id TEXT, -- accepts UUID string or order number
        p_channel TEXT, -- 'POS', 'B2B', 'LIVE_DISPATCH', 'ECOMMERCE'
        p_client_id TEXT DEFAULT NULL,
        p_courier_partner_id TEXT DEFAULT NULL,
        p_shipping_fee NUMERIC(15,2) DEFAULT 0.00,
        p_shipping_bearer TEXT DEFAULT 'Customer Bears'
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_order RECORD;
        v_voucher_id UUID;
        v_voucher_id_str TEXT;
        v_voucher_no TEXT;
        v_cogs_id UUID;
        v_fg_id UUID;
        v_revenue_id UUID;
        v_receivable_id UUID;
        v_courier_payable_id UUID;
        v_delivery_exp_id UUID;
        v_cogs_code TEXT;
        v_fg_code TEXT;
        v_revenue_code TEXT;
        v_receivable_code TEXT;
        v_courier_payable_code TEXT;
        v_delivery_exp_code TEXT;
        v_cogs_name TEXT;
        v_fg_name TEXT;
        v_revenue_name TEXT;
        v_receivable_name TEXT;
        v_courier_payable_name TEXT;
        v_delivery_exp_name TEXT;
        v_total_selling NUMERIC(15,2) := 0.00;
        v_total_cost NUMERIC(15,2) := 0.00;
        v_total_cod_receivable NUMERIC(15,2) := 0.00;
        v_item RECORD;
        v_items_count INT := 0;
        v_courier_rec RECORD;
        v_norm_channel TEXT;
        v_resolved_courier_id TEXT := NULL;
        v_resolved_courier_int INT := NULL;
        v_courier_party_uuid UUID := NULL;
        v_client_party_uuid UUID := NULL;
        v_now TIMESTAMPTZ := NOW();
    BEGIN
        -- 1. Fetch Order and Prevent Duplicate Dispatch
        SELECT * INTO v_order FROM public.orders 
        WHERE id::text = p_order_id::text 
           OR order_number = p_order_id::text 
        FOR UPDATE;

        IF v_order.id IS NULL THEN
            RAISE EXCEPTION 'Order ID % does not exist.', p_order_id;
        END IF;

        IF v_order.status IN ('DISPATCHED', 'POSTED') AND v_order.voucher_id IS NOT NULL THEN
            RAISE EXCEPTION 'Order ID % is already finalized and dispatched.', p_order_id;
        END IF;

        -- 2. Resolve Core COGS, Inventory & Expense Accounts
        SELECT COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'cogs_account'), '5100-02') INTO v_cogs_code;
        SELECT COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'finished_goods_inventory'), '1160-01') INTO v_fg_code;
        SELECT COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'delivery_expense'), '5140-01') INTO v_delivery_exp_code;

        SELECT id, name INTO v_cogs_id, v_cogs_name FROM chart_of_accounts WHERE code = v_cogs_code LIMIT 1;
        SELECT id, name INTO v_fg_id, v_fg_name FROM chart_of_accounts WHERE code = v_fg_code LIMIT 1;
        SELECT id, name INTO v_delivery_exp_id, v_delivery_exp_name FROM chart_of_accounts WHERE code = v_delivery_exp_code LIMIT 1;

        IF v_cogs_id IS NULL OR v_fg_id IS NULL THEN
            RAISE EXCEPTION 'Configuration Error: Core COGS account % or Inventory account % missing in COA.', v_cogs_code, v_fg_code;
        END IF;

        -- 3. Dynamic Courier Liability Resolution (Party Sub-Ledger with Fallback)
        v_resolved_courier_id := COALESCE(p_courier_partner_id, v_order.courier_partner_id::text, v_order.courier_party_id::text);

        IF v_resolved_courier_id IS NOT NULL AND TRIM(v_resolved_courier_id) != '' THEN
            SELECT 
                p.party_id,
                p.id as party_uuid,
                p.name,
                COALESCE(
                    (SELECT a.account_code FROM accounts a WHERE a.account_id = p.account_id OR a.account_id = p.linked_account_id),
                    p.coa_account_id,
                    p.account_map->>'payableAccountId',
                    p.account_map->>'payable_account_id'
                ) as linked_code
            INTO v_courier_rec
            FROM parties p
            WHERE p.party_id::text = v_resolved_courier_id
               OR p.id::text = v_resolved_courier_id
               OR UPPER(p.name) = UPPER(TRIM(v_resolved_courier_id))
               OR p.code = v_resolved_courier_id
            LIMIT 1;

            IF v_courier_rec.party_id IS NOT NULL THEN
                v_resolved_courier_int := v_courier_rec.party_id;
                IF v_courier_rec.party_uuid IS NOT NULL THEN
                    BEGIN
                        v_courier_party_uuid := v_courier_rec.party_uuid::UUID;
                    EXCEPTION WHEN OTHERS THEN
                        v_courier_party_uuid := NULL;
                    END;
                END IF;
                IF v_courier_rec.linked_code IS NOT NULL THEN
                    SELECT id, code, name INTO v_courier_payable_id, v_courier_payable_code, v_courier_payable_name
                    FROM chart_of_accounts WHERE code = v_courier_rec.linked_code LIMIT 1;
                END IF;
            END IF;
        END IF;

        -- Fallback to control account if no specific courier account resolved
        IF v_courier_payable_id IS NULL THEN
            v_courier_payable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'courier_payable'), '2120-00');
            SELECT id, name INTO v_courier_payable_id, v_courier_payable_name FROM chart_of_accounts WHERE code = v_courier_payable_code LIMIT 1;
            IF v_courier_payable_id IS NULL THEN
                v_courier_payable_code := '2120-01';
                SELECT id, name INTO v_courier_payable_id, v_courier_payable_name FROM chart_of_accounts WHERE code = v_courier_payable_code LIMIT 1;
            END IF;
        END IF;

        -- 4. Channel-Specific Receivable & Revenue Routing
        v_norm_channel := UPPER(TRIM(COALESCE(p_channel, '')));

        IF v_norm_channel = 'B2B' THEN
            v_revenue_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'b2b_revenue'), '4110-05');
            SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

            IF p_client_id IS NOT NULL THEN
                SELECT (account_map->>'receivable_account_id')::UUID INTO v_receivable_id 
                FROM parties WHERE id::text = p_client_id::text OR party_id::text = p_client_id::text;
            END IF;
            IF v_receivable_id IS NULL THEN
                v_receivable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'b2b_sales_receivable'), '1130-01');
                SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
            ELSE
                SELECT code, name INTO v_receivable_code, v_receivable_name FROM chart_of_accounts WHERE id = v_receivable_id LIMIT 1;
            END IF;

        ELSIF v_norm_channel = 'ECOMMERCE' THEN
            v_revenue_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
            SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

            IF v_order.payment_status = 'PAID' OR UPPER(COALESCE(v_order.payment_method, '')) NOT IN ('COD', 'CASH_ON_DELIVERY') THEN
                -- Online Card / Apple Pay Paid: Pre-Clearing 1130-03
                v_receivable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'ecommerce_sales_clearing'), '1130-03');
            ELSE
                -- Cash on Delivery: Courier COD Clearing 1128-01 (Bank is strictly UNTOUCHED)
                v_receivable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'courier_cod_clearing'), '1128-01');
            END IF;
            SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;

        ELSIF v_norm_channel = 'LIVE_DISPATCH' THEN
            v_revenue_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
            SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

            v_receivable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'courier_cod_clearing'), '1128-01');
            SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;

        ELSIF v_norm_channel IN ('POS', 'POS_CARD', 'POS_TERMINAL', 'COUNTER_SALE') THEN
            v_revenue_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
            SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

            IF UPPER(COALESCE(v_order.payment_method, '')) IN ('CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'TAP', 'CARD_MACHINE', 'POS_CARD') THEN
                v_receivable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'pos_terminal_clearing'), '1125-01');
            ELSE
                v_receivable_code := COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'pos_cash_drawer'), '1110-01');
            END IF;
            SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
        ELSE
            -- Default omnichannel fallback
            v_revenue_code := '4110-01';
            v_receivable_code := '1128-01';
            SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;
            SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
        END IF;

        -- 5. Calculate Selling, Cost and Atomically Derecognize Inventory
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
            FOR v_item IN 
                SELECT item_id, quantity, unit_price, cost_price 
                FROM order_items 
                WHERE order_id::text = v_order.id::text
            LOOP
                v_items_count := v_items_count + 1;
                v_total_selling := v_total_selling + (COALESCE(v_item.quantity, 1) * COALESCE(v_item.unit_price, 0.00));
                v_total_cost := v_total_cost + (COALESCE(v_item.quantity, 1) * COALESCE(v_item.cost_price, 0.00));

                IF v_item.item_id IS NOT NULL THEN
                    UPDATE inventory_items 
                    SET status = 'SOLD', dispatched_at = v_now 
                    WHERE id::text = v_item.item_id::text;
                END IF;
            END LOOP;
        END IF;

        -- Fallback to orders.items JSONB if order_items was empty
        IF v_items_count = 0 AND v_order.items IS NOT NULL AND jsonb_array_length(v_order.items) > 0 THEN
            FOR v_item IN
                SELECT 
                    elem->>'barcode' as barcode,
                    elem->>'id' as item_id,
                    COALESCE((elem->>'quantity')::numeric, 1) as quantity,
                    COALESCE((elem->>'unit_price')::numeric, (elem->>'price')::numeric, (elem->>'estimatedPrice')::numeric, 0.00) as unit_price,
                    COALESCE((elem->>'cost_price')::numeric, (elem->>'costPrice')::numeric, 0.00) as cost_price
                FROM jsonb_array_elements(v_order.items) as elem
            LOOP
                v_items_count := v_items_count + 1;
                v_total_selling := v_total_selling + (v_item.quantity * v_item.unit_price);
                v_total_cost := v_total_cost + (v_item.quantity * v_item.cost_price);

                IF v_item.barcode IS NOT NULL THEN
                    UPDATE inventory_pieces 
                    SET status = 'SOLD', is_sold = true, dispatched_at = v_now 
                    WHERE barcode = v_item.barcode;
                END IF;
            END LOOP;
        END IF;

        -- If order has financial totals recorded on header
        IF v_total_selling = 0 AND COALESCE(v_order.total_amount, 0) > 0 THEN
            v_total_selling := v_order.total_amount - COALESCE(v_order.delivery_fee, 0);
        END IF;
        IF v_total_cost = 0 THEN
            v_total_cost := ROUND(v_total_selling * 0.40, 2); -- 40% standard vintage COGS fallback
        END IF;

        -- Calculate COD vs Prepaid receivable
        IF v_norm_channel IN ('LIVE_DISPATCH', 'ECOMMERCE') AND v_order.payment_status != 'PAID' THEN
            IF p_shipping_bearer = 'Customer Bears' THEN
                v_total_cod_receivable := v_total_selling + COALESCE(p_shipping_fee, 0.00);
            ELSE
                v_total_cod_receivable := v_total_selling;
            END IF;
        ELSE
            v_total_cod_receivable := v_total_selling;
        END IF;

        -- 6. Insert Balanced Journal Voucher (Exact Parity Guaranteed)
        v_voucher_id := gen_random_uuid();
        v_voucher_id_str := v_voucher_id::text;
        v_voucher_no := 'INV-' || UPPER(p_channel) || '-' || TO_CHAR(v_now, 'YYYYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

        INSERT INTO vouchers (
            id, voucher_no, voucher_type, type, reference_no, reference,
            description, narration, status, total_debit, total_credit, created_at, created_by
        ) VALUES (
            v_voucher_id_str, v_voucher_no, 'INV', 'JOURNAL', v_voucher_no, v_order.order_number,
            'Omnichannel dispatch: Order #' || v_order.order_number,
            'COGS & Dispatch Derecognition (' || v_norm_channel || ')',
            'POSTED', v_total_cod_receivable + v_total_cost + (CASE WHEN p_shipping_bearer != 'Customer Bears' AND COALESCE(p_shipping_fee, 0) > 0 THEN p_shipping_fee ELSE 0 END),
            v_total_selling + v_total_cost + (CASE WHEN COALESCE(p_shipping_fee, 0) > 0 THEN p_shipping_fee ELSE 0 END),
            v_now, 'Sales Engine'
        );

        -- Journal Entry 1: Debit Receivable / Clearing Asset
        INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
        VALUES (gen_random_uuid(), v_voucher_id_str, v_receivable_id, (CASE WHEN v_norm_channel = 'B2B' THEN v_client_party_uuid ELSE NULL END), v_total_cod_receivable, 0.00, 'Order receivable recognized: ' || v_order.order_number, v_now);

        INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, debit, credit, particulars, date, created_at)
        VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, (CASE WHEN v_norm_channel = 'B2B' THEN p_client_id::text ELSE NULL END), v_total_cod_receivable, 0.00, 'Order receivable recognized: ' || v_order.order_number, CURRENT_DATE, v_now);

        -- Journal Entry 2: Credit Sales Revenue
        INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
        VALUES (gen_random_uuid(), v_voucher_id_str, v_revenue_id, NULL, 0.00, v_total_selling, 'Sales revenue recognized: ' || v_order.order_number, v_now);

        INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
        VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, 0.00, v_total_selling, 'Sales revenue recognized: ' || v_order.order_number, CURRENT_DATE, v_now);

        -- Journal Entry 3: Courier Freight Liability & Expense Entries
        IF COALESCE(p_shipping_fee, 0.00) > 0 AND v_norm_channel IN ('LIVE_DISPATCH', 'ECOMMERCE') THEN
            IF p_shipping_bearer = 'Customer Bears' THEN
                INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
                VALUES (gen_random_uuid(), v_voucher_id_str, v_courier_payable_id, v_courier_party_uuid, 0.00, p_shipping_fee, 'Courier liability collected from customer: ' || v_order.order_number, v_now);

                INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, debit, credit, particulars, date, created_at)
                VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, COALESCE(v_courier_party_uuid::text, v_courier_rec.party_uuid::text), 0.00, p_shipping_fee, 'Courier liability collected from customer: ' || v_order.order_number, CURRENT_DATE, v_now);
            ELSE
                INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
                VALUES (gen_random_uuid(), v_voucher_id_str, v_delivery_exp_id, NULL, p_shipping_fee, 0.00, 'Company-absorbed shipping expense: ' || v_order.order_number, v_now);

                INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
                VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_delivery_exp_code, v_delivery_exp_name, v_delivery_exp_id::text, p_shipping_fee, 0.00, 'Company-absorbed shipping expense: ' || v_order.order_number, CURRENT_DATE, v_now);

                INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
                VALUES (gen_random_uuid(), v_voucher_id_str, v_courier_payable_id, v_courier_party_uuid, 0.00, p_shipping_fee, 'Courier partner fee payable: ' || v_order.order_number, v_now);

                INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, debit, credit, particulars, date, created_at)
                VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, COALESCE(v_courier_party_uuid::text, v_courier_rec.party_uuid::text), 0.00, p_shipping_fee, 'Courier partner fee payable: ' || v_order.order_number, CURRENT_DATE, v_now);
            END IF;
        END IF;

        -- Journal Entry 4: Debit COGS Expense
        INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
        VALUES (gen_random_uuid(), v_voucher_id_str, v_cogs_id, NULL, v_total_cost, 0.00, 'COGS derecognition: ' || v_order.order_number, v_now);

        INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
        VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_cogs_code, v_cogs_name, v_cogs_id::text, v_total_cost, 0.00, 'COGS derecognition: ' || v_order.order_number, CURRENT_DATE, v_now);

        -- Journal Entry 5: Credit Finished Goods Inventory
        INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
        VALUES (gen_random_uuid(), v_voucher_id_str, v_fg_id, NULL, 0.00, v_total_cost, 'Finished goods asset relief: ' || v_order.order_number, v_now);

        INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
        VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_fg_code, v_fg_name, v_fg_id::text, 0.00, v_total_cost, 'Finished goods asset relief: ' || v_order.order_number, CURRENT_DATE, v_now);

        -- 7. Update Order Header Status
        UPDATE public.orders 
        SET status = 'POSTED',
            order_status = 'DISPATCHED',
            voucher_id = v_voucher_id_str,
            courier_partner_id = v_resolved_courier_int,
            shipping_fee = p_shipping_fee,
            shipping_bearer = p_shipping_bearer,
            dispatched_at = v_now,
            updated_at = v_now
        WHERE id = v_order.id;

        -- 8. Also update corresponding sales_invoices if present
        UPDATE public.sales_invoices
        SET status = 'POSTED'
        WHERE order_id = v_order.id::text OR invoice_no = v_order.order_number;

        RETURN jsonb_build_object(
            'success', TRUE,
            'voucher_id', v_voucher_id_str,
            'voucher_no', v_voucher_no,
            'selling_amount', v_total_selling,
            'cogs_amount', v_total_cost,
            'cod_receivable', v_total_cod_receivable
        );
    END;
    $$;
  `);

  // 6. Deploy Procedure 2: settle_courier_cod_remittance with Real-Time Bank PIN
  console.log('6. Deploying settle_courier_cod_remittance procedure with PIN verification...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.settle_courier_cod_remittance(
        p_courier_party_id TEXT,
        p_bank_account_id TEXT,
        p_gross_cod_cleared NUMERIC(15,2),
        p_courier_fee_deducted NUMERIC(15,2),
        p_net_bank_received NUMERIC(15,2),
        p_bank_remittance_code TEXT,
        p_accountant_pin_verified BOOLEAN DEFAULT FALSE
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_voucher_id UUID;
        v_voucher_id_str TEXT;
        v_voucher_no TEXT;
        v_cod_clearing_id UUID;
        v_delivery_exp_id UUID;
        v_bank_id UUID;
        v_cod_code TEXT;
        v_delivery_exp_code TEXT;
        v_bank_code TEXT;
        v_cod_name TEXT;
        v_delivery_exp_name TEXT;
        v_bank_name TEXT;
        v_courier_name TEXT := 'Courier Partner';
        v_now TIMESTAMPTZ := NOW();
        v_courier_int INT := NULL;
    BEGIN
        -- 1. Security Check: Real-Time Remittance Code and PIN Verification
        IF NOT p_accountant_pin_verified OR p_bank_remittance_code IS NULL OR TRIM(p_bank_remittance_code) = '' THEN
            RAISE EXCEPTION 'Security Exception: Remittance settlement requires valid Bank PIN / Transaction Reference verification.';
        END IF;

        -- 2. Verify Mathematical Parity
        IF ROUND(p_net_bank_received + p_courier_fee_deducted, 2) != ROUND(p_gross_cod_cleared, 2) THEN
            RAISE EXCEPTION 'Discrepancy Error: Net Cash (%) + Courier Fee (%) != Gross COD Cleared (%)',
                p_net_bank_received, p_courier_fee_deducted, p_gross_cod_cleared;
        END IF;

        -- 3. Resolve Accounts
        SELECT COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'courier_cod_clearing'), '1128-01') INTO v_cod_code;
        SELECT COALESCE((SELECT account_code FROM public.sales_channel_settings WHERE setting_key = 'delivery_expense'), '5140-01') INTO v_delivery_exp_code;

        SELECT id, name INTO v_cod_clearing_id, v_cod_name FROM chart_of_accounts WHERE code = v_cod_code LIMIT 1;
        SELECT id, name INTO v_delivery_exp_id, v_delivery_exp_name FROM chart_of_accounts WHERE code = v_delivery_exp_code LIMIT 1;

        -- Resolve bank account
        SELECT id, code, name INTO v_bank_id, v_bank_code, v_bank_name 
        FROM chart_of_accounts 
        WHERE id::text = p_bank_account_id::text OR code = p_bank_account_id::text OR code = '1120-01' LIMIT 1;

        IF v_bank_id IS NULL THEN
            SELECT id, code, name INTO v_bank_id, v_bank_code, v_bank_name FROM chart_of_accounts WHERE code = '1120-01' LIMIT 1;
        END IF;

        IF p_courier_party_id IS NOT NULL THEN
            SELECT party_id, name INTO v_courier_int, v_courier_name 
            FROM public.parties 
            WHERE party_id::text = p_courier_party_id::text OR id::text = p_courier_party_id::text;
        END IF;

        -- 4. Create Bank Receipt Voucher (BRV-COD)
        v_voucher_id := gen_random_uuid();
        v_voucher_id_str := v_voucher_id::text;
        v_voucher_no := 'BRV-COD-' || TO_CHAR(v_now, 'YYYYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

        INSERT INTO vouchers (
            id, voucher_no, voucher_type, type, reference_no, reference,
            description, narration, status, total_debit, total_credit, created_at, created_by
        ) VALUES (
            v_voucher_id_str, v_voucher_no, 'BRV', 'RECEIPT', p_bank_remittance_code, v_courier_name,
            'Courier Remittance Settle (' || COALESCE(v_courier_name, 'Logistics') || ') - Ref: ' || p_bank_remittance_code,
            'COD Remittance deposited to ' || v_bank_name,
            'POSTED', p_gross_cod_cleared, p_gross_cod_cleared, v_now, 'Finance Lead'
        );

        -- Line 1: Debit Main Bank (1120-01) with Net Funds Received
        INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
        VALUES (gen_random_uuid(), v_voucher_id_str, v_bank_id, NULL, p_net_bank_received, 0.00, 'Net bank deposit from courier remittance (' || v_courier_name || ')', v_now);

        INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
        VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_bank_code, v_bank_name, v_bank_id::text, p_net_bank_received, 0.00, 'Net bank deposit from courier remittance (' || v_courier_name || ')', CURRENT_DATE, v_now);

        -- Line 2: Debit Delivery Expense (5140-01) with Retained Service Fee
        IF p_courier_fee_deducted > 0 THEN
            INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
            VALUES (gen_random_uuid(), v_voucher_id_str, v_delivery_exp_id, NULL, p_courier_fee_deducted, 0.00, 'Courier service charge deducted at source (' || v_courier_name || ')', v_now);

            INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
            VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_delivery_exp_code, v_delivery_exp_name, v_delivery_exp_id::text, p_courier_fee_deducted, 0.00, 'Courier service charge deducted at source (' || v_courier_name || ')', CURRENT_DATE, v_now);
        END IF;

        -- Line 3: Credit Courier COD Clearing (1128-01) with Gross Settled Amount
        INSERT INTO journal_entries (id, voucher_id, account_id, party_id, debit, credit, description, created_at)
        VALUES (gen_random_uuid(), v_voucher_id_str, v_cod_clearing_id, NULL, 0.00, p_gross_cod_cleared, 'Gross COD parcel balance cleared (' || v_courier_name || ')', v_now);

        INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
        VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_cod_code, v_cod_name, v_cod_clearing_id::text, 0.00, p_gross_cod_cleared, 'Gross COD parcel balance cleared (' || v_courier_name || ')', CURRENT_DATE, v_now);

        -- Mark Associated Orders as Fully Settled
        UPDATE public.orders 
        SET bank_remittance_code = p_bank_remittance_code,
            settlement_pin_verified = TRUE,
            updated_at = v_now
        WHERE (courier_partner_id = v_courier_int OR courier_party_id::text = p_courier_party_id::text)
          AND status = 'POSTED' 
          AND settlement_pin_verified = FALSE;

        RETURN jsonb_build_object(
            'success', TRUE,
            'voucher_id', v_voucher_id_str,
            'voucher_no', v_voucher_no,
            'net_received', p_net_bank_received,
            'gross_cleared', p_gross_cod_cleared
        );
    END;
    $$;
  `);

  console.log('=== [MASTER PRODUCTION MIGRATION COMPLETED SUCCESSFULLY] ===');
  await client.end();
}

main().catch(err => {
  console.error('[MIGRATION FAILED]:', err);
  process.exit(1);
});
