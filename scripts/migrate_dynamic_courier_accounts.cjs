const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting Dynamic Courier Partner & Ledger Migration...');
    await client.query('BEGIN;');

    // 1. Alter parties table: relax party_type check constraint and add account_id
    console.log('1. Altering parties table constraints and columns...');
    await client.query(`
      ALTER TABLE parties DROP CONSTRAINT IF EXISTS parties_party_type_check;
      ALTER TABLE parties ADD CONSTRAINT parties_party_type_check 
        CHECK (party_type::text = ANY (ARRAY[
          'SUPPLIER'::text, 'CUSTOMER'::text, 'BOTH'::text, 
          'COURIER'::text, 'LOGISTICS_AGENT'::text, 'AGENT'::text
        ]));

      ALTER TABLE parties ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(account_id);
      ALTER TABLE parties ALTER COLUMN linked_account_id DROP NOT NULL;
      UPDATE parties SET account_id = linked_account_id WHERE account_id IS NULL AND linked_account_id IS NOT NULL;
    `);

    // 2. Alter orders table: add courier_partner_id
    console.log('2. Altering orders table for courier_partner_id...');
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_partner_id INTEGER REFERENCES parties(party_id) ON DELETE SET NULL;
    `);

    // 3. Register Tier-3 Courier Accounts under 2120-00 (Parent ID 5099)
    console.log('3. Registering Tier-3 Courier Accounts in accounts, chart_of_accounts, coa_accounts...');
    
    // Register in accounts table (PostgreSQL ERP accounts)
    await client.query(`
      INSERT INTO accounts (account_id, account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level)
      VALUES 
        (5188, '2120-02', 'Aramex Logistics UAE', 2, 5099, true, true, 3),
        (5189, '2120-03', 'SMSA Express GCC', 2, 5099, true, true, 3),
        (5190, '2120-04', 'Emirates Post Premium', 2, 5099, true, true, 3)
      ON CONFLICT (account_code) DO UPDATE
      SET account_name = EXCLUDED.account_name, is_active = true, is_transactional = true;
    `);

    // Register in chart_of_accounts
    await client.query(`
      INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, current_balance, created_at)
      VALUES 
        (gen_random_uuid(), '2120-02', 'Aramex Logistics UAE', 'LIABILITY', '4cf50ade-782f-4535-9548-f97011d3d604', 0.00, NOW()),
        (gen_random_uuid(), '2120-03', 'SMSA Express GCC', 'LIABILITY', '4cf50ade-782f-4535-9548-f97011d3d604', 0.00, NOW()),
        (gen_random_uuid(), '2120-04', 'Emirates Post Premium', 'LIABILITY', '4cf50ade-782f-4535-9548-f97011d3d604', 0.00, NOW())
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name, account_type = 'LIABILITY';
    `);

    // Register in coa_accounts
    await client.query(`
      INSERT INTO coa_accounts (id, code, name, type, sub_type, currency, current_balance, is_active, tier_level, parent_code, parent_id)
      VALUES 
        ('coa-2120-02', '2120-02', 'Aramex Logistics UAE', 'LIABILITY', 'Accounts Payable - Clearing & Courier Agent', 'AED', 0.00, true, 3, '2120-00', '4cf50ade-782f-4535-9548-f97011d3d604'),
        ('coa-2120-03', '2120-03', 'SMSA Express GCC', 'LIABILITY', 'Accounts Payable - Clearing & Courier Agent', 'AED', 0.00, true, 3, '2120-00', '4cf50ade-782f-4535-9548-f97011d3d604'),
        ('coa-2120-04', '2120-04', 'Emirates Post Premium', 'LIABILITY', 'Accounts Payable - Clearing & Courier Agent', 'AED', 0.00, true, 3, '2120-00', '4cf50ade-782f-4535-9548-f97011d3d604')
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name, is_active = true, tier_level = 3;
    `);

    // 4. Update / Register Courier Partners in parties
    console.log('4. Registering Couriers in parties registry...');
    // Ensure DHL Express has type = COURIER and account_id = 5171
    await client.query(`
      UPDATE parties
      SET type = 'COURIER',
          party_type = 'COURIER',
          account_id = 5171,
          linked_account_id = 5171,
          coa_account_id = '2120-01',
          name = 'DHL Express UAE',
          company_name = 'DHL Express UAE',
          account_map = jsonb_build_object(
            'payableAccountId', '2120-01',
            'payable_account_id', '2120-01',
            'expenseAccountId', '5140-01'
          )
      WHERE code = 'AGT-0008';
    `);

    // Insert or update Aramex, SMSA, Emirates Post
    const couriers = [
      {
        id: '9b1e1713-39d2-4309-8488-81203f5ad602',
        code: 'COU-0002',
        name: 'Aramex Logistics UAE',
        phone: '+971 600 544000',
        email: 'support@aramex.com',
        address: 'Umm Ramool, Dubai, UAE',
        accountId: 5188,
        coaCode: '2120-02'
      },
      {
        id: 'a8291f04-89f1-46bb-ba22-81203f5ad603',
        code: 'COU-0003',
        name: 'SMSA Express GCC',
        phone: '+971 4 230 6000',
        email: 'info@smsaexpress.com',
        address: 'Cargo Village, DXB Airport, Dubai, UAE',
        accountId: 5189,
        coaCode: '2120-03'
      },
      {
        id: 'c5713e89-11ba-47ee-99aa-81203f5ad604',
        code: 'COU-0004',
        name: 'Emirates Post Premium',
        phone: '+971 600 599999',
        email: 'custservice@emiratespost.ae',
        address: 'Deira Main Post Office, Dubai, UAE',
        accountId: 5190,
        coaCode: '2120-04'
      }
    ];

    for (const c of couriers) {
      const existing = await client.query('SELECT party_id FROM parties WHERE code = $1 OR linked_account_id = $2', [c.code, c.accountId]);
      const map = JSON.stringify({ payableAccountId: c.coaCode, payable_account_id: c.coaCode, expenseAccountId: '5140-01' });
      if (existing.rows.length > 0) {
        await client.query(`
          UPDATE parties
          SET name = $1, company_name = $2, type = 'COURIER', party_type = 'COURIER', phone = $3, email = $4, address = $5,
              account_id = $6, linked_account_id = $6, coa_account_id = $7, account_map = $8::jsonb, is_active = true
          WHERE party_id = $9;
        `, [c.name, c.name, c.phone, c.email, c.address, c.accountId, c.coaCode, map, existing.rows[0].party_id]);
      } else {
        await client.query(`
          INSERT INTO parties (
            id, code, name, company_name, type, party_type, phone, email, address,
            account_id, linked_account_id, coa_account_id, is_active, account_map
          )
          VALUES ($1, $2, $3, $4, 'COURIER', 'COURIER', $5, $6, $7, $8, $8, $9, true, $10::jsonb);
        `, [c.id, c.code, c.name, c.name, c.phone, c.email, c.address, c.accountId, c.coaCode, map]);
      }
    }

    // 5. Redeploy post_sales_dispatch_and_cogs_voucher with dynamic courier liability accounting & fallback continuity
    console.log('5. Redeploying post_sales_dispatch_and_cogs_voucher with dynamic courier routing...');
    await client.query(`
      CREATE OR REPLACE FUNCTION post_sales_dispatch_and_cogs_voucher(
          p_order_id UUID,
          p_channel TEXT, -- 'POS', 'POS_CARD', 'B2B', 'LIVE_DISPATCH', 'ECOMMERCE'
          p_client_id UUID DEFAULT NULL,
          p_courier_party_id TEXT DEFAULT NULL,
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
          v_resolved_courier_party_id TEXT := NULL;
          v_resolved_courier_partner_id INT := NULL;

          v_total_selling NUMERIC(15,2) := 0.00;
          v_total_cost NUMERIC(15,2) := 0.00;
          v_total_cod_receivable NUMERIC(15,2) := 0.00;
          v_total_entry_debit NUMERIC(15,2) := 0.00;
          v_total_entry_credit NUMERIC(15,2) := 0.00;

          v_item RECORD;
          v_items_count INT := 0;
          v_order RECORD;
          v_courier_rec RECORD;
          v_norm_channel TEXT;
          v_is_courier_dispatch BOOLEAN := false;
      BEGIN
          -- 0. Check order existence and status
          SELECT * INTO v_order FROM orders WHERE id = p_order_id;
          IF v_order.id IS NULL THEN
              RAISE EXCEPTION 'Order with ID % not found.', p_order_id;
          END IF;

          IF v_order.status = 'DISPATCHED' AND v_order.voucher_id IS NOT NULL THEN
              RAISE EXCEPTION 'Order % is already dispatched with voucher %.', p_order_id, v_order.voucher_id;
          END IF;

          -- 1. Read Base Account Codes from Settings (with safe fallback to verified defaults)
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'cogs_account'), '5100-02') INTO v_cogs_code;
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'finished_goods_inventory'), '1160-01') INTO v_fg_code;
          SELECT COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'delivery_expense'), '5140-01') INTO v_delivery_exp_code;

          -- 2. DYNAMIC COURIER LIABILITY RESOLUTION
          -- Priority 1: Check p_courier_party_id or order's courier_partner_id / courier_party_id
          v_resolved_courier_party_id := COALESCE(p_courier_party_id, v_order.courier_partner_id::text, v_order.courier_party_id::text);

          IF v_resolved_courier_party_id IS NOT NULL AND TRIM(v_resolved_courier_party_id) != '' THEN
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
              WHERE p.party_id::text = v_resolved_courier_party_id
                 OR p.id = v_resolved_courier_party_id
                 OR UPPER(p.name) = UPPER(TRIM(v_resolved_courier_party_id))
                 OR p.code = v_resolved_courier_party_id
              LIMIT 1;

              IF v_courier_rec.party_id IS NOT NULL THEN
                  v_courier_name := v_courier_rec.name;
                  v_resolved_courier_partner_id := v_courier_rec.party_id;
                  
                  -- Check if party has a valid transactional liability account
                  IF v_courier_rec.linked_code IS NOT NULL THEN
                      SELECT id, code, name INTO v_courier_payable_id, v_courier_payable_code, v_courier_payable_name
                      FROM chart_of_accounts WHERE code = v_courier_rec.linked_code LIMIT 1;
                  END IF;
              END IF;
          END IF;

          -- Priority 2: Fallback Continuity
          -- If no courier was selected or courier party has no specific account, use settings control account
          IF v_courier_payable_id IS NULL THEN
              v_courier_payable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_payable'), '2120-00');
              SELECT id, name INTO v_courier_payable_id, v_courier_payable_name FROM chart_of_accounts WHERE code = v_courier_payable_code LIMIT 1;

              -- If 2120-00 not registered in chart_of_accounts, fallback to 2120-01
              IF v_courier_payable_id IS NULL THEN
                  v_courier_payable_code := '2120-01';
                  SELECT id, name INTO v_courier_payable_id, v_courier_payable_name FROM chart_of_accounts WHERE code = v_courier_payable_code LIMIT 1;
              END IF;
          END IF;

          -- 3. Resolve Core Account UUIDs and Names
          SELECT id, name INTO v_cogs_id, v_cogs_name FROM chart_of_accounts WHERE code = v_cogs_code LIMIT 1;
          SELECT id, name INTO v_fg_id, v_fg_name FROM chart_of_accounts WHERE code = v_fg_code LIMIT 1;
          SELECT id, name INTO v_delivery_exp_id, v_delivery_exp_name FROM chart_of_accounts WHERE code = v_delivery_exp_code LIMIT 1;

          IF v_cogs_id IS NULL OR v_fg_id IS NULL THEN
              RAISE EXCEPTION 'Configuration Error: Core account % or % is missing in COA.', v_cogs_code, v_fg_code;
          END IF;

          v_norm_channel := UPPER(TRIM(COALESCE(p_channel, '')));
          v_is_courier_dispatch := (v_norm_channel NOT IN ('B2B', 'COMPANY', 'CUSTOM_SALE', 'CORPORATE', 'POS', 'POS_CARD', 'POS_TERMINAL', 'COUNTER_SALE', 'RETAIL'));

          -- 4. Resolve Channel-Specific Accounts
          IF v_norm_channel IN ('B2B', 'COMPANY', 'CUSTOM_SALE', 'CORPORATE') THEN
              v_revenue_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'b2b_revenue'), '4110-05');
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

              IF p_client_id IS NOT NULL THEN
                  SELECT (account_map->>'receivable_account_id')::UUID, name 
                  INTO v_receivable_id, v_client_name 
                  FROM parties WHERE id = p_client_id::text OR party_id::text = p_client_id::text;
              END IF;
              
              IF v_receivable_id IS NULL THEN
                  v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'b2b_sales_receivable'), '1130-01');
                  SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
              ELSE
                  SELECT code, name INTO v_receivable_code, v_receivable_name FROM chart_of_accounts WHERE id = v_receivable_id LIMIT 1;
              END IF;

          ELSIF v_norm_channel IN ('POS', 'POS_CARD', 'POS_TERMINAL', 'COUNTER_SALE', 'RETAIL') THEN
              v_revenue_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;

              -- Settle Card / Tap / Apple Pay / Google Pay against 1125-01 (POS Terminal & Card Clearing)
              IF v_norm_channel IN ('POS_CARD', 'POS_TERMINAL') OR 
                 UPPER(COALESCE(v_order.payment_method, '')) IN ('CARD', 'CARD_POS', 'POS_CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'TERMINAL', 'TAP', 'CARD_MACHINE') THEN
                  v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'pos_terminal_clearing'), '1125-01');
              ELSE
                  v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'pos_cash_drawer'), '1110-01');
              END IF;

              SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
          ELSE
              -- Omnichannel Courier Dispatch (Live Selling, Stream Claims, E-commerce Storefront, etc.)
              v_revenue_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'omnichannel_retail_revenue'), '4110-01');
              SELECT id, name INTO v_revenue_id, v_revenue_name FROM chart_of_accounts WHERE code = v_revenue_code LIMIT 1;
              
              v_receivable_code := COALESCE((SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_cod_clearing'), '1128-01');
              SELECT id, name INTO v_receivable_id, v_receivable_name FROM chart_of_accounts WHERE code = v_receivable_code LIMIT 1;
          END IF;

          -- 5. Calculate Sales, Cost, and Derecognize Stock Atomically
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

          -- Fallback to order total_amount if selling value still 0
          IF v_total_selling <= 0 AND v_order.total_amount IS NOT NULL AND v_order.total_amount > 0 THEN
              v_total_selling := v_order.total_amount;
          END IF;

          -- 6. Calculate COD Logistics Figures
          IF v_is_courier_dispatch THEN
              IF p_shipping_bearer = 'Customer Bears' THEN
                  v_total_cod_receivable := v_total_selling + COALESCE(p_shipping_fee, 0.00);
              ELSE
                  v_total_cod_receivable := v_total_selling;
              END IF;
          ELSE
              v_total_cod_receivable := v_total_selling;
          END IF;

          -- 7. Insert Balanced Journal Voucher Header
          v_voucher_id := gen_random_uuid();
          v_voucher_id_str := v_voucher_id::text;
          v_voucher_no := 'INV-' || UPPER(p_channel) || '-' || TO_CHAR(v_now, 'YYYYMMDD-HH24MISS') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

          IF v_is_courier_dispatch THEN
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

          -- Strict Mathematical Parity: Total Debits == Total Credits
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
              'Auto dispatch sales recognition, COGS & courier logistics for order ' || p_order_id::text,
              'Auto dispatch sales recognition, COGS & courier logistics for order ' || p_order_id::text,
              'POSTED', v_total_entry_debit, v_total_entry_credit, v_total_selling,
              v_voucher_date, v_voucher_date, true, 'AED', 1.0, 'AED', v_total_selling,
              v_now
          );

          -- Mirror into financial_vouchers if exists
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
                  'Auto dispatch sales recognition, COGS & courier logistics for order ' || p_order_id::text,
                  v_total_selling, v_total_entry_debit, v_total_entry_credit,
                  'POSTED', true, 'AED', 1.0, 'AED', v_total_selling,
                  v_now
              );
          END IF;

          -- Insert Journal Lines: Revenue & Receivable
          IF v_is_courier_dispatch THEN
              -- Line 1: Debit Courier COD Clearing
              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_receivable_id, CASE WHEN v_resolved_courier_partner_id IS NOT NULL THEN (SELECT id FROM parties WHERE party_id = v_resolved_courier_partner_id)::uuid ELSE NULL END, v_total_cod_receivable, 0.00, 'Courier COD receivable in transit');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, v_total_cod_receivable, 0.00, 'Courier COD receivable in transit', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_receivable_code, v_receivable_name, v_receivable_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, v_total_cod_receivable, 0.00, v_voucher_date, 'Courier COD receivable in transit', v_now);

              -- Line 2: Credit Sales Revenue
              INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
              VALUES (v_voucher_id_str, v_revenue_id, p_client_id, 0.00, v_total_selling, 'Sales revenue recognized');

              INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, p_client_id::text, v_client_name, 0.00, v_total_selling, 'Sales revenue recognized', v_voucher_date, v_now);

              INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
              VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_revenue_code, v_revenue_name, v_revenue_id::text, p_client_id::text, v_client_name, 0.00, v_total_selling, v_voucher_date, 'Sales revenue recognized', v_now);

              -- Logistics Freight Entries with Dynamic Courier Liability Hit
              IF COALESCE(p_shipping_fee, 0.00) > 0 THEN
                  IF p_shipping_bearer = 'Customer Bears' THEN
                      -- Credit Courier Liability (Specific or Control)
                      INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
                      VALUES (v_voucher_id_str, v_courier_payable_id, CASE WHEN v_resolved_courier_partner_id IS NOT NULL THEN (SELECT id FROM parties WHERE party_id = v_resolved_courier_partner_id)::uuid ELSE NULL END, 0.00, p_shipping_fee, 'Courier shipping liability to ' || v_courier_name);

                      INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, 0.00, p_shipping_fee, 'Courier shipping liability to ' || v_courier_name, v_voucher_date, v_now);

                      INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, 0.00, p_shipping_fee, v_voucher_date, 'Courier shipping liability to ' || v_courier_name, v_now);
                  ELSE
                      -- Company Free: Debit Delivery Expense, Credit Courier Liability
                      INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
                      VALUES (v_voucher_id_str, v_delivery_exp_id, CASE WHEN v_resolved_courier_partner_id IS NOT NULL THEN (SELECT id FROM parties WHERE party_id = v_resolved_courier_partner_id)::uuid ELSE NULL END, p_shipping_fee, 0.00, 'Company-absorbed shipping expense for ' || v_courier_name);

                      INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_delivery_exp_code, v_delivery_exp_name, v_delivery_exp_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, p_shipping_fee, 0.00, 'Company-absorbed shipping expense for ' || v_courier_name, v_voucher_date, v_now);

                      INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_delivery_exp_code, v_delivery_exp_name, v_delivery_exp_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, p_shipping_fee, 0.00, v_voucher_date, 'Company-absorbed shipping expense for ' || v_courier_name, v_now);

                      INSERT INTO journal_entries (voucher_id, account_id, party_id, debit, credit, description)
                      VALUES (v_voucher_id_str, v_courier_payable_id, CASE WHEN v_resolved_courier_partner_id IS NOT NULL THEN (SELECT id FROM parties WHERE party_id = v_resolved_courier_partner_id)::uuid ELSE NULL END, 0.00, p_shipping_fee, 'Courier service charge payable to ' || v_courier_name);

                      INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, particulars, date, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, 0.00, p_shipping_fee, 'Courier service charge payable to ' || v_courier_name, v_voucher_date, v_now);

                      INSERT INTO general_ledger (id, voucher_id, voucher_no, account_code, account_name, account_id, party_id, party_name, debit, credit, entry_date, narration, created_at)
                      VALUES (gen_random_uuid()::text, v_voucher_id_str, v_voucher_no, v_courier_payable_code, v_courier_payable_name, v_courier_payable_id::text, COALESCE(v_resolved_courier_partner_id::text, v_resolved_courier_party_id), v_courier_name, 0.00, p_shipping_fee, v_voucher_date, 'Courier service charge payable to ' || v_courier_name, v_now);
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

          -- 8. Update Order Header
          UPDATE orders 
          SET status = 'DISPATCHED',
              order_status = 'DISPATCHED',
              voucher_id = v_voucher_id_str,
              courier_party_id = CASE 
                  WHEN v_resolved_courier_partner_id IS NOT NULL THEN (SELECT id::uuid FROM parties WHERE party_id = v_resolved_courier_partner_id LIMIT 1)
                  WHEN p_courier_party_id ~ '^[0-9a-fA-F-]{36}$' THEN p_courier_party_id::uuid 
                  ELSE v_order.courier_party_id 
              END,
              courier_partner_id = COALESCE(
                  v_resolved_courier_partner_id,
                  CASE WHEN p_courier_party_id ~ '^[0-9]+$' THEN p_courier_party_id::integer ELSE NULL END,
                  v_order.courier_partner_id
              ),
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
              'shipping_bearer', p_shipping_bearer,
              'receivable_code', v_receivable_code,
              'cogs_code', v_cogs_code,
              'courier_payable_code', v_courier_payable_code,
              'courier_name', v_courier_name,
              'courier_partner_id', v_resolved_courier_partner_id
          );
      END;
      $$;
    `);

    await client.query('COMMIT;');
    console.log('✅ Dynamic Courier Partner & Ledger Migration Completed Successfully!');

  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Migration Failed and Rolled Back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
