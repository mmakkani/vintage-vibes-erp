const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function deploy() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting Omnichannel Sales & COA Migration...');
    await client.query('BEGIN;');

    // 1. Ensure all 14 mandatory Tier-3 accounts exist in accounts, chart_of_accounts, and coa_accounts
    console.log('1. Checking and registering Tier-3 accounts...');

    // 1a. Ensure in accounts table
    // 4110-05 (B2B REVENUE) is already at account_id = 5185
    await client.query(`
      INSERT INTO accounts (account_id, account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level)
      VALUES ((SELECT COALESCE(MAX(account_id), 5185) + 1 FROM accounts), '5140-01', 'Courier & Delivery Charges', 5, 5080, true, true, 3)
      ON CONFLICT (account_code) DO NOTHING;
    `);

    // 1b. Ensure in chart_of_accounts table
    const coaList = [
      { code: '1110-01', name: 'Cash in Hand (POS / Counter)', type: 'ASSET' },
      { code: '1120-01', name: 'Cash in Bank (AED)', type: 'ASSET' },
      { code: '1125-01', name: 'POS Terminal & Card Clearing', type: 'ASSET' },
      { code: '1128-01', name: 'Courier COD Clearing (Pending Remittance)', type: 'ASSET' },
      { code: '1130-01', name: 'EMIRATES WHOLESALE', type: 'ASSET' },
      { code: '1130-02', name: 'LIVE SALES', type: 'ASSET' },
      { code: '1130-03', name: 'E-COOMERCE SALES', type: 'ASSET' },
      { code: '1130-04', name: 'POS SALES', type: 'ASSET' },
      { code: '1160-01', name: 'Finished Goods', type: 'ASSET' },
      { code: '2140-01', name: 'Courier Delivery & Commission Payable', type: 'LIABILITY' },
      { code: '4110-01', name: 'Retail / Online / Live Stream Sales Revenue', type: 'INCOME' },
      { code: '4110-05', name: 'B2B REVENUE', type: 'INCOME' },
      { code: '5110-01', name: 'Cost of Goods Sold - Finished Goods', type: 'EXPENSE' },
      { code: '5140-01', name: 'Courier & Delivery Charges', type: 'EXPENSE' }
    ];

    for (const acc of coaList) {
      await client.query(`
        INSERT INTO chart_of_accounts (id, code, name, account_type, current_balance, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, 0.00, NOW())
        ON CONFLICT (code) DO NOTHING;
      `, [acc.code, acc.name, acc.type]);

      await client.query(`
        INSERT INTO coa_accounts (id, code, name, type, sub_type, currency, current_balance, is_active, tier_level, parent_code)
        VALUES ($1, $2, $3, $4, $5, 'AED', 0.00, true, 3, $6)
        ON CONFLICT (code) DO UPDATE
        SET is_active = true
        WHERE coa_accounts.code = $2;
      `, [
        `coa-${acc.code}`,
        acc.code,
        acc.name,
        acc.type === 'INCOME' ? 'REVENUE' : acc.type,
        acc.type === 'INCOME' ? 'OPERATING_REVENUE' : (acc.type === 'EXPENSE' ? 'OPERATING_EXPENSE' : acc.type),
        acc.code.substring(0, 4) + '-00'
      ]);
    }

    // 2. Create sales_channel_settings table
    console.log('2. Creating sales_channel_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_channel_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key TEXT UNIQUE NOT NULL,
        account_code TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed default settings
    console.log('3. Seeding verified default settings...');
    await client.query(`
      INSERT INTO sales_channel_settings (setting_key, account_code, description)
      VALUES 
        ('cogs_account', '5110-01', 'Cost of Goods Sold - Finished Goods'),
        ('finished_goods_inventory', '1160-01', 'Finished Goods Inventory Asset'),
        ('courier_cod_clearing', '1128-01', 'Courier COD Clearing (Pending Remittance)'),
        ('courier_payable', '2140-01', 'Courier Delivery & Commission Payable'),
        ('delivery_expense', '5140-01', 'Company Borne Delivery Expense'),
        ('pos_cash_drawer', '1110-01', 'POS Cash Drawer'),
        ('pos_terminal_clearing', '1125-01', 'POS Card / Terminal Clearing'),
        ('live_sales_clearing', '1130-02', 'LIVE SALES Control Khata'),
        ('ecommerce_sales_clearing', '1130-03', 'E-COMMERCE SALES Control Khata'),
        ('pos_sales_clearing', '1130-04', 'POS SALES Control Khata'),
        ('b2b_sales_receivable', '1130-01', 'Default B2B Wholesale Receivable'),
        ('b2b_revenue', '4110-05', 'B2B Wholesale Revenue'),
        ('omnichannel_retail_revenue', '4110-01', 'POS, Live & E-Commerce Revenue')
      ON CONFLICT (setting_key) DO NOTHING;
    `);

    // 4. Create journal_entries table
    console.log('4. Ensuring journal_entries table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        voucher_id TEXT NOT NULL,
        account_id UUID,
        party_id UUID,
        debit NUMERIC(15,2) DEFAULT 0.00,
        credit NUMERIC(15,2) DEFAULT 0.00,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_journal_entries_voucher_id ON journal_entries(voucher_id);
    `);

    // 5. Ensure order_items table exists
    console.log('5. Ensuring order_items table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        item_id UUID,
        quantity NUMERIC(15,2) DEFAULT 1,
        unit_price NUMERIC(15,2) DEFAULT 0.00,
        cost_price NUMERIC(15,2) DEFAULT 0.00,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    `);

    // 6. Ensure orders and inventory_items columns exist
    console.log('6. Ensuring required columns on orders and inventory_items...');
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_id TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_party_id UUID;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(15,2) DEFAULT 0.00;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_bearer TEXT DEFAULT 'Customer Bears';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'AVAILABLE';
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

      -- Ensure vouchers table has description column if needed
      ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS description TEXT;
    `);

    // 7. Deploy post_sales_dispatch_and_cogs_voucher stored procedure
    console.log('7. Deploying post_sales_dispatch_and_cogs_voucher stored procedure...');
    await client.query(`
      CREATE OR REPLACE FUNCTION post_sales_dispatch_and_cogs_voucher(
          p_order_id UUID,
          p_channel TEXT, -- 'POS', 'B2B', 'LIVE_DISPATCH', 'ECOMMERCE'
          p_client_id UUID DEFAULT NULL,
          p_courier_party_id UUID DEFAULT NULL,
          p_shipping_fee NUMERIC(15,2) DEFAULT 0.00,
          p_shipping_bearer TEXT DEFAULT 'Customer Bears' -- 'Customer Bears' or 'Company Free'
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
          v_voucher_id UUID;
          v_voucher_id_str TEXT;
          v_voucher_no TEXT;
          v_voucher_date DATE := CURRENT_DATE;
          v_now TIMESTAMPTZ := NOW();

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

          v_client_name TEXT := 'Client / Customer';
          v_courier_name TEXT := 'Courier Partner';

          v_total_selling NUMERIC(15,2) := 0.00;
          v_total_cost NUMERIC(15,2) := 0.00;
          v_total_cod_receivable NUMERIC(15,2) := 0.00;
          v_total_entry_debit NUMERIC(15,2) := 0.00;
          v_total_entry_credit NUMERIC(15,2) := 0.00;

          v_item RECORD;
          v_items_count INT := 0;
          v_order RECORD;
      BEGIN
          -- 0. Check order existence and status
          SELECT * INTO v_order FROM orders WHERE id = p_order_id;
          IF v_order.id IS NULL THEN
              RAISE EXCEPTION 'Order with ID % not found.', p_order_id;
          END IF;

          IF v_order.status = 'DISPATCHED' AND v_order.voucher_id IS NOT NULL THEN
              RAISE EXCEPTION 'Order % is already dispatched with voucher %.', p_order_id, v_order.voucher_id;
          END IF;

          -- 1. Read Account Codes from Settings (with safe fallback to verified defaults)
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'cogs_account'), '5110-01') INTO v_cogs_code;
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'finished_goods_inventory'), '1160-01') INTO v_fg_code;
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_payable'), '2140-01') INTO v_courier_payable_code;
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'delivery_expense'), '5140-01') INTO v_delivery_exp_code;

          -- 2. Resolve Core Account UUIDs and Names
          SELECT id, name INTO v_cogs_id, v_cogs_name FROM chart_of_accounts WHERE code = v_cogs_code LIMIT 1;
          SELECT id, name INTO v_fg_id, v_fg_name FROM chart_of_accounts WHERE code = v_fg_code LIMIT 1;
          SELECT id, name INTO v_courier_payable_id, v_courier_payable_name FROM chart_of_accounts WHERE code = v_courier_payable_code LIMIT 1;
          SELECT id, name INTO v_delivery_exp_id, v_delivery_exp_name FROM chart_of_accounts WHERE code = v_delivery_exp_code LIMIT 1;

          IF v_cogs_id IS NULL OR v_fg_id IS NULL THEN
              RAISE EXCEPTION 'Configuration Error: Core account % or % is missing in COA.', v_cogs_code, v_fg_code;
          END IF;

          -- 3. Resolve Channel-Specific Accounts
          IF p_channel = 'B2B' THEN
              v_revenue_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'b2b_revenue'), '4110-05');
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

              IF p_client_id IS NOT NULL THEN
                  SELECT (account_map->>'receivable_account_id')::UUID, name 
                  INTO v_receivable_id, v_client_name 
                  FROM parties WHERE id = p_client_id::text;
              END IF;
              
              IF v_receivable_id IS NULL THEN
                  v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'b2b_sales_receivable'), '1130-01');
                  SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
              ELSE
                  SELECT code, name INTO v_receivable_code, v_receivable_name FROM chart_of_accounts WHERE id = v_receivable_id LIMIT 1;
              END IF;

          ELSIF p_channel IN ('LIVE_DISPATCH', 'ECOMMERCE') THEN
              v_revenue_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;
              
              v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_cod_clearing'), '1128-01');
              SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;

          ELSIF p_channel = 'POS' THEN
              v_revenue_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

              v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'pos_cash_drawer'), '1110-01');
              SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
          ELSE
              -- Default fallback
              v_revenue_code := '4110-01';
              v_receivable_code := '1110-01';
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;
              SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
          END IF;

          -- Resolve party names
          IF p_client_id IS NOT NULL AND (v_client_name IS NULL OR v_client_name = 'Client / Customer') THEN
              SELECT name INTO v_client_name FROM parties WHERE id = p_client_id::text;
          END IF;
          IF p_courier_party_id IS NOT NULL THEN
              SELECT name INTO v_courier_name FROM parties WHERE id = p_courier_party_id::text;
          END IF;

          -- 4. Calculate Sales, Cost, and Derecognize Stock Atomically
          FOR v_item IN 
              SELECT item_id, quantity, unit_price, cost_price 
              FROM order_items 
              WHERE order_id = p_order_id
          LOOP
              v_items_count := v_items_count + 1;
              v_total_selling := v_total_selling + (COALESCE(v_item.quantity, 1) * COALESCE(v_item.unit_price, 0.00));
              v_total_cost := v_total_cost + (COALESCE(v_item.quantity, 1) * COALESCE(v_item.cost_price, 0.00));

              IF v_item.item_id IS NOT NULL THEN
                  UPDATE inventory_items 
                  SET status = 'SOLD',
                      dispatched_at = v_now
                  WHERE id = v_item.item_id;
              END IF;
          END LOOP;

          -- Fallback to orders.items JSONB if order_items was not populated
          IF v_items_count = 0 AND v_order.items IS NOT NULL AND jsonb_array_length(v_order.items) > 0 THEN
              FOR v_item IN
                  SELECT 
                      (elem->>'id')::UUID as item_id,
                      COALESCE((elem->>'quantity')::numeric, 1) as quantity,
                      COALESCE((elem->>'unit_price')::numeric, (elem->>'price')::numeric, 0.00) as unit_price,
                      COALESCE((elem->>'cost_price')::numeric, 0.00) as cost_price
                  FROM jsonb_array_elements(v_order.items) as elem
              LOOP
                  v_items_count := v_items_count + 1;
                  v_total_selling := v_total_selling + (v_item.quantity * v_item.unit_price);
                  v_total_cost := v_total_cost + (v_item.quantity * v_item.cost_price);

                  IF v_item.item_id IS NOT NULL THEN
                      UPDATE inventory_items 
                      SET status = 'SOLD',
                          dispatched_at = v_now
                      WHERE id = v_item.item_id;
                  END IF;

                  -- Also mirror into order_items
                  INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
                  VALUES (p_order_id, v_item.item_id, v_item.quantity, v_item.unit_price, v_item.cost_price);
              END LOOP;
          END IF;

          -- If selling amount is still 0, fallback to order total_amount
          IF v_total_selling <= 0 AND v_order.total_amount IS NOT NULL AND v_order.total_amount > 0 THEN
              v_total_selling := v_order.total_amount;
          END IF;

          -- 5. Calculate COD Logistics Figures
          IF p_channel IN ('LIVE_DISPATCH', 'ECOMMERCE') THEN
              IF p_shipping_bearer = 'Customer Bears' THEN
                  v_total_cod_receivable := v_total_selling + COALESCE(p_shipping_fee, 0.00);
              ELSE
                  v_total_cod_receivable := v_total_selling;
              END IF;
          ELSE
              v_total_cod_receivable := v_total_selling;
          END IF;

          -- 6. Insert Balanced Journal Voucher Header
          v_voucher_id := gen_random_uuid();
          v_voucher_id_str := v_voucher_id::text;
          v_voucher_no := 'INV-' || UPPER(p_channel) || '-' || TO_CHAR(v_now, 'YYYYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

          -- Calculate total voucher debits/credits for header
          IF p_channel IN ('LIVE_DISPATCH', 'ECOMMERCE') THEN
              IF COALESCE(p_shipping_fee, 0.00) > 0 AND p_shipping_bearer = 'Company Free' THEN
                  v_total_entry_debit := v_total_cod_receivable + p_shipping_fee + v_total_cost;
                  v_total_entry_credit := v_total_selling + p_shipping_fee + v_total_cost;
              ELSE
                  v_total_entry_debit := v_total_cod_receivable + v_total_cost;
                  v_total_entry_credit := v_total_selling + COALESCE(p_shipping_fee, 0.00) + v_total_cost;
              END IF;
          ELSE
              v_total_entry_debit := v_total_selling + v_total_cost;
              v_total_entry_credit := v_total_selling + v_total_cost;
          END IF;

          -- Verify strict mathematical parity: Total Debits == Total Credits
          IF v_total_entry_debit != v_total_entry_credit THEN
              RAISE EXCEPTION 'Double-entry parity check failed: Total Debits (%) != Total Credits (%)',
                  v_total_entry_debit, v_total_entry_credit;
          END IF;

          -- Insert into vouchers
          INSERT INTO vouchers (
              id, voucher_no, voucher_type, type, reference_no, reference,
              narration, description, status, total_debit, total_credit, total_amount,
              date, voucher_date, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
              created_at
          )
          VALUES (
              v_voucher_id_str, v_voucher_no, 'INV', 'INV', v_voucher_no, v_voucher_no,
              'Auto dispatch sales recognition, COGS & logistics for order ' || p_order_id::text,
              'Auto dispatch sales recognition, COGS & logistics for order ' || p_order_id::text,
              'POSTED', v_total_entry_debit, v_total_entry_credit, v_total_selling,
              v_voucher_date, v_voucher_date, true, 'AED', 1.0, 'AED', v_total_selling,
              v_now
          );

          -- Mirror into financial_vouchers if table exists
          IF to_regclass('public.financial_vouchers') IS NOT NULL THEN
              INSERT INTO financial_vouchers (
                  id, voucher_no, voucher_type, type, voucher_date, date,
                  reference_no, reference, narration,
                  total_amount, total_debit, total_credit,
                  status, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
                  created_at
              ) VALUES (
                  v_voucher_id_str, v_voucher_no, 'INV', 'INV', v_voucher_date, v_voucher_date,
                  v_voucher_no, v_voucher_no,
                  'Auto dispatch sales recognition, COGS & logistics for order ' || p_order_id::text,
                  v_total_selling, v_total_entry_debit, v_total_entry_credit,
                  'POSTED', true, 'AED', 1.0, 'AED', v_total_selling,
                  v_now
              );
          END IF;

          -- Insert Journal Lines: Revenue & Receivable
          IF p_channel IN ('LIVE_DISPATCH', 'ECOMMERCE') THEN
              -- Line 1: Debit Courier COD Clearing
              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_receivable_id, p_courier_party_id, v_total_cod_receivable, 0.00, 'Courier COD receivable in transit');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, p_courier_party_id::text, v_courier_name, v_total_cod_receivable, 0.00, 'Courier COD receivable in transit', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, p_courier_party_id::text, v_courier_name, v_total_cod_receivable, 0.00, v_voucher_date, 'Courier COD receivable in transit', v_now);

              -- Line 2: Credit Sales Revenue
              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_revenue_id, p_client_id, 0.00, v_total_selling, 'Sales revenue recognized');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, p_client_id::text, v_client_name, 0.00, v_total_selling, 'Sales revenue recognized', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, p_client_id::text, v_client_name, 0.00, v_total_selling, v_voucher_date, 'Sales revenue recognized', v_now);

              -- Logistics Freight Entries
              IF COALESCE(p_shipping_fee, 0.00) > 0 THEN
                  IF p_shipping_bearer = 'Customer Bears' THEN
                      -- Credit Courier Payable (collected on courier's behalf)
                      INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
                      VALUES (v_voucher_id_str, v_courier_payable_id, p_courier_party_id, 0.00, p_shipping_fee, 'Courier shipping liability (collected from customer)');

                      INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, p_courier_party_id::text, v_courier_name, 0.00, p_shipping_fee, 'Courier shipping liability (collected from customer)', v_voucher_date, v_now);

                      INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, p_courier_party_id::text, v_courier_name, 0.00, p_shipping_fee, v_voucher_date, 'Courier shipping liability (collected from customer)', v_now);
                  ELSE
                      -- Company Free: Debit Delivery Expense, Credit Courier Payable
                      INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
                      VALUES (v_voucher_id_str, v_delivery_exp_id, p_courier_party_id, p_shipping_fee, 0.00, 'Company-absorbed shipping expense');

                      INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_delivery_exp_code, v_delivery_exp_name, v_delivery_exp_id::text, p_courier_party_id::text, v_courier_name, p_shipping_fee, 0.00, 'Company-absorbed shipping expense', v_voucher_date, v_now);

                      INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_delivery_exp_code, v_delivery_exp_name, v_delivery_exp_id::text, p_courier_party_id::text, v_courier_name, p_shipping_fee, 0.00, v_voucher_date, 'Company-absorbed shipping expense', v_now);

                      INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
                      VALUES (v_voucher_id_str, v_courier_payable_id, p_courier_party_id, 0.00, p_shipping_fee, 'Courier service charge payable');

                      INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, p_courier_party_id::text, v_courier_name, 0.00, p_shipping_fee, 'Courier service charge payable', v_voucher_date, v_now);

                      INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, p_courier_party_id::text, v_courier_name, 0.00, p_shipping_fee, v_voucher_date, 'Courier service charge payable', v_now);
                  END IF;
              END IF;
          ELSE
              -- POS / B2B Standard Entry
              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_receivable_id, p_client_id, v_total_selling, 0.00, 'Sales receivable / cash collected');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, p_client_id::text, v_client_name, v_total_selling, 0.00, 'Sales receivable / cash collected', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, p_client_id::text, v_client_name, v_total_selling, 0.00, v_voucher_date, 'Sales receivable / cash collected', v_now);

              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_revenue_id, p_client_id, 0.00, v_total_selling, 'Sales revenue recognized');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, p_client_id::text, v_client_name, 0.00, v_total_selling, 'Sales revenue recognized', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, p_client_id::text, v_client_name, 0.00, v_total_selling, v_voucher_date, 'Sales revenue recognized', v_now);
          END IF;

          -- Inventory Derecognition & COGS Lines
          IF v_total_cost > 0 THEN
              INSERT INTO journal_entries (voucher_id, account_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_cogs_id, v_total_cost, 0.00, 'COGS derecognized from inventory');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_cogs_code, v_cogs_name, v_cogs_id::text, v_total_cost, 0.00, 'COGS derecognized from inventory', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_cogs_code, v_cogs_name, v_cogs_id::text, v_total_cost, 0.00, v_voucher_date, 'COGS derecognized from inventory', v_now);

              INSERT INTO journal_entries (voucher_id, account_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_fg_id, 0.00, v_total_cost, 'Finished goods inventory asset deduction');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_fg_code, v_fg_name, v_fg_id::text, 0.00, v_total_cost, 'Finished goods inventory asset deduction', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_fg_code, v_fg_name, v_fg_id::text, 0.00, v_total_cost, v_voucher_date, 'Finished goods inventory asset deduction', v_now);
          END IF;

          -- 7. Update Order Header
          UPDATE orders 
          SET status = 'DISPATCHED',
              order_status = 'DISPATCHED',
              voucher_id = v_voucher_id_str,
              courier_party_id = p_courier_party_id,
              shipping_fee = p_shipping_fee,
              delivery_fee = p_shipping_fee,
              shipping_bearer = p_shipping_bearer,
              dispatched_at = v_now,
              updated_at = v_now
          WHERE id = p_order_id;

          RETURN jsonb_build_object(
              'success', true,
              'voucher_id', v_voucher_id_str,
              'voucher_no', v_voucher_no,
              'selling_amount', v_total_selling,
              'cogs_amount', v_total_cost,
              'cod_receivable', v_total_cod_receivable,
              'shipping_fee', p_shipping_fee,
              'shipping_bearer', p_shipping_bearer
          );
      END;
      $$;
    `);

    // 8. Deploy settle_courier_cod_remittance stored procedure
    console.log('8. Deploying settle_courier_cod_remittance stored procedure...');
    await client.query(`
      CREATE OR REPLACE FUNCTION settle_courier_cod_remittance(
          p_courier_party_id UUID,
          p_bank_account_id UUID,
          p_gross_cod_cleared NUMERIC(15,2),
          p_courier_fee_deducted NUMERIC(15,2),
          p_net_bank_received NUMERIC(15,2),
          p_reference_no TEXT
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
          v_voucher_id UUID;
          v_voucher_id_str TEXT;
          v_voucher_no TEXT;
          v_voucher_date DATE := CURRENT_DATE;
          v_now TIMESTAMPTZ := NOW();

          v_cod_clearing_id UUID;
          v_courier_payable_id UUID;
          v_cod_code TEXT;
          v_courier_payable_code TEXT;

          v_bank_code TEXT;
          v_bank_name TEXT;
          v_cod_name TEXT;
          v_courier_payable_name TEXT;
          v_courier_name TEXT := 'Courier Partner';
      BEGIN
          IF (p_net_bank_received + p_courier_fee_deducted) != p_gross_cod_cleared THEN
              RAISE EXCEPTION 'Settlement imbalance: Net Received (%) + Fees (%) must equal Gross COD (%)',
                  p_net_bank_received, p_courier_fee_deducted, p_gross_cod_cleared;
          END IF;

          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_cod_clearing'), '1128-01') INTO v_cod_code;
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_payable'), '2140-01') INTO v_courier_payable_code;

          SELECT id, name INTO v_cod_clearing_id, v_cod_name FROM chart_of_accounts WHERE code = v_cod_code LIMIT 1;
          SELECT id, name INTO v_courier_payable_id, v_courier_payable_name FROM chart_of_accounts WHERE code = v_courier_payable_code LIMIT 1;
          SELECT code, name INTO v_bank_code, v_bank_name FROM chart_of_accounts WHERE id = p_bank_account_id LIMIT 1;

          IF p_courier_party_id IS NOT NULL THEN
              SELECT name INTO v_courier_name FROM parties WHERE id = p_courier_party_id::text;
          END IF;

          v_voucher_id := gen_random_uuid();
          v_voucher_id_str := v_voucher_id::text;
          v_voucher_no := 'BRV-COD-' || TO_CHAR(v_now, 'YYYYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

          -- Insert into vouchers
          INSERT INTO vouchers (
              id, voucher_no, voucher_type, type, reference_no, reference,
              narration, description, status, total_debit, total_credit, total_amount,
              date, voucher_date, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
              created_at
          )
          VALUES (
              v_voucher_id_str, v_voucher_no, 'BRV', 'BRV', p_reference_no, p_reference_no,
              'Courier COD remittance settlement: ' || p_reference_no,
              'Courier COD remittance settlement: ' || p_reference_no,
              'POSTED', p_gross_cod_cleared, p_gross_cod_cleared, p_net_bank_received,
              v_voucher_date, v_voucher_date, true, 'AED', 1.0, 'AED', p_net_bank_received,
              v_now
          );

          -- Mirror into financial_vouchers
          IF to_regclass('public.financial_vouchers') IS NOT NULL THEN
              INSERT INTO financial_vouchers (
                  id, voucher_no, voucher_type, type, voucher_date, date,
                  reference_no, reference, narration,
                  total_amount, total_debit, total_credit,
                  status, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
                  created_at
              ) VALUES (
                  v_voucher_id_str, v_voucher_no, 'BRV', 'BRV', v_voucher_date, v_voucher_date,
                  p_reference_no, p_reference_no,
                  'Courier COD remittance settlement: ' || p_reference_no,
                  p_net_bank_received, p_gross_cod_cleared, p_gross_cod_cleared,
                  'POSTED', true, 'AED', 1.0, 'AED', p_net_bank_received,
                  v_now
              );
          END IF;

          -- Line 1: Debit Bank (Actual net cash deposited)
          INSERT INTO journal_entries (voucher_id, account_id, debit, credit, description)
          VALUES (v_voucher_id_str, p_bank_account_id, p_net_bank_received, 0.00, 'Bank receipt from courier remittance');

          INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, particulars, date, created_at)
          VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_bank_code, v_bank_name, p_bank_account_id::text, p_net_bank_received, 0.00, 'Bank receipt from courier remittance', v_voucher_date, v_now);

          INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, debit, credit, entry_date, narration, created_at)
          VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_bank_code, v_bank_name, p_bank_account_id::text, p_net_bank_received, 0.00, v_voucher_date, 'Bank receipt from courier remittance', v_now);

          -- Line 2: Debit Courier Service Liability (Clearing retained service fee)
          IF p_courier_fee_deducted > 0 THEN
              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_courier_payable_id, p_courier_party_id, p_courier_fee_deducted, 0.00, 'Courier delivery charge settlement');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, p_courier_party_id::text, v_courier_name, p_courier_fee_deducted, 0.00, 'Courier delivery charge settlement', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, p_courier_party_id::text, v_courier_name, p_courier_fee_deducted, 0.00, v_voucher_date, 'Courier delivery charge settlement', v_now);
          END IF;

          -- Line 3: Credit Courier COD Clearing (Clearing transit receivable)
          INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
          VALUES (v_voucher_id_str, v_cod_clearing_id, p_courier_party_id, 0.00, p_gross_cod_cleared, 'Cleared gross COD balance');

          INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
          VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_cod_code, v_cod_name, v_cod_clearing_id::text, p_courier_party_id::text, v_courier_name, 0.00, p_gross_cod_cleared, 'Cleared gross COD balance', v_voucher_date, v_now);

          INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
          VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_cod_code, v_cod_name, v_cod_clearing_id::text, p_courier_party_id::text, v_courier_name, 0.00, p_gross_cod_cleared, v_voucher_date, 'Cleared gross COD balance', v_now);

          RETURN jsonb_build_object(
              'success', true,
              'voucher_id', v_voucher_id_str,
              'voucher_no', v_voucher_no,
              'net_received', p_net_bank_received,
              'fee_deducted', p_courier_fee_deducted,
              'gross_cleared', p_gross_cod_cleared
          );
      END;
      $$;
    `);

    await client.query('COMMIT;');
    console.log('✅ Omnichannel Sales & COA Migration successfully completed!');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Migration failed and rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

deploy().catch(err => {
  console.error('Fatal deployment error:', err);
  process.exit(1);
});
