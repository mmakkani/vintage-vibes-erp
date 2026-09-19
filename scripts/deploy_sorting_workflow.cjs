const { Client } = require('pg');
require('dotenv').config();

async function deploy() {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  try {
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, user, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
      dbUrl = `postgresql://${user}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
  } catch (e) {}

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('[Sorting Workflow Deploy] Connected to PostgreSQL...');

  // 1. Create tables sorting_batches and sorting_batch_items
  console.log('1. Creating tables sorting_batches & sorting_batch_items...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.sorting_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_number VARCHAR(64) UNIQUE NOT NULL,
      inward_pass_id VARCHAR(255) NULL,
      raw_bales_count INTEGER DEFAULT 0,
      raw_weight_kg NUMERIC(12, 2) DEFAULT 0.00,
      raw_cost_value NUMERIC(12, 2) DEFAULT 0.00,
      finished_weight_kg NUMERIC(12, 2) DEFAULT 0.00,
      wastage_weight_kg NUMERIC(12, 2) DEFAULT 0.00,
      status VARCHAR(32) DEFAULT 'DRAFT',
      wip_voucher_id VARCHAR(255) NULL,
      fg_voucher_id VARCHAR(255) NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sorting_batches_status ON public.sorting_batches(status);
    CREATE INDEX IF NOT EXISTS idx_sorting_batches_batch_no ON public.sorting_batches(batch_number);

    CREATE TABLE IF NOT EXISTS public.sorting_batch_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id UUID NOT NULL REFERENCES public.sorting_batches(id) ON DELETE CASCADE,
      item_sku VARCHAR(128) NULL,
      item_name VARCHAR(255) NOT NULL,
      category VARCHAR(128) NULL,
      grade VARCHAR(64) NULL,
      quantity INTEGER DEFAULT 1,
      weight_kg NUMERIC(12, 2) DEFAULT 0.00,
      cost_price NUMERIC(12, 2) DEFAULT 0.00,
      selling_price NUMERIC(12, 2) DEFAULT 0.00,
      barcode VARCHAR(128) NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sorting_batch_items_batch ON public.sorting_batch_items(batch_id);
  `);
  console.log('   -> sorting_batches and sorting_batch_items tables verified.');

  // 2. Provision 5190-00 and 5190-01 in coa_accounts, accounts, chart_of_accounts
  console.log('2. Provisioning Sorting Scrap & Loss accounts (5190-00 / 5190-01)...');

  // 2a. coa_accounts
  const coaParent = await client.query("SELECT id FROM coa_accounts WHERE code = '5190-00'");
  let coaParentId = coaParent.rows[0]?.id;
  if (!coaParentId) {
    const ins = await client.query(`
      INSERT INTO coa_accounts (
        id, code, name, type, sub_type, tier_level, is_active, parent_code, currency
      ) VALUES (
        gen_random_uuid()::text, '5190-00', 'Sorting Scrap, Damaged & Yield Loss', 'EXPENSE', 'Direct Expense', 2, true, '5000-00', 'AED'
      ) RETURNING id
    `);
    coaParentId = ins.rows[0].id;
    console.log('   -> Created 5190-00 in coa_accounts:', coaParentId);
  }

  const coaSub = await client.query("SELECT id FROM coa_accounts WHERE code = '5190-01'");
  if (coaSub.rows.length === 0) {
    await client.query(`
      INSERT INTO coa_accounts (
        id, code, name, type, sub_type, tier_level, is_active, parent_id, parent_code, currency
      ) VALUES (
        gen_random_uuid()::text, '5190-01', 'Sorting Scrap & Yield Loss', 'EXPENSE', 'Direct Expense', 3, true, $1, '5190-00', 'AED'
      )
    `, [coaParentId]);
    console.log('   -> Created 5190-01 in coa_accounts');
  }

  // 2b. accounts
  const accParent = await client.query("SELECT account_id FROM accounts WHERE account_code = '5190-00'");
  let accParentId = accParent.rows[0]?.account_id;
  if (!accParentId) {
    const nextAcc = await client.query("SELECT COALESCE(MAX(account_id), 5190) + 1 as nid FROM accounts");
    const newId = nextAcc.rows[0].nid;
    await client.query(`
      INSERT INTO accounts (
        account_id, account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level
      ) VALUES (
        $1, '5190-00', 'Sorting Scrap, Damaged & Yield Loss', 5, 5080, true, false, 2
      )
    `, [newId]);
    accParentId = newId;
    console.log('   -> Created 5190-00 in accounts:', accParentId);
  }

  const accSub = await client.query("SELECT account_id FROM accounts WHERE account_code = '5190-01'");
  if (accSub.rows.length === 0) {
    const nextAcc = await client.query("SELECT COALESCE(MAX(account_id), 5191) + 1 as nid FROM accounts");
    const newId = nextAcc.rows[0].nid;
    await client.query(`
      INSERT INTO accounts (
        account_id, account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level
      ) VALUES (
        $1, '5190-01', 'Sorting Scrap & Yield Loss', 5, $2, true, true, 3
      )
    `, [newId, accParentId]);
    console.log('   -> Created 5190-01 in accounts:', newId);
  }

  // 2c. chart_of_accounts
  await client.query(`
    INSERT INTO chart_of_accounts (id, code, name, account_type, current_balance)
    VALUES (gen_random_uuid(), '5190-00', 'Sorting Scrap, Damaged & Yield Loss', 'EXPENSE', 0)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

    INSERT INTO chart_of_accounts (id, code, name, account_type, current_balance)
    VALUES (gen_random_uuid(), '5190-01', 'Sorting Scrap & Yield Loss', 'EXPENSE', 0)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
  `);
  console.log('   -> Verified chart_of_accounts entries.');

  // 3. Deploy Stored Procedure 1: start_sorting_batch_and_post_wip
  console.log('3. Deploying start_sorting_batch_and_post_wip...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.start_sorting_batch_and_post_wip(p_batch_id UUID)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_batch RECORD;
      v_wip_acc RECORD;
      v_raw_acc RECORD;
      v_voucher_id VARCHAR(255);
      v_voucher_no VARCHAR(255);
      v_now TIMESTAMPTZ := NOW();
      v_today DATE := CURRENT_DATE;
    BEGIN
      -- 1. Fetch and lock sorting batch
      SELECT * INTO v_batch FROM public.sorting_batches WHERE id = p_batch_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Sorting batch % not found', p_batch_id;
      END IF;

      -- 2. Validate DRAFT status
      IF v_batch.status != 'DRAFT' THEN
        RAISE EXCEPTION 'Sorting batch % cannot be started: status is "%" (must be "DRAFT")', p_batch_id, v_batch.status;
      END IF;

      -- 3. Validate raw cost value
      IF v_batch.raw_cost_value IS NULL OR v_batch.raw_cost_value <= 0 THEN
        RAISE EXCEPTION 'Sorting batch % raw cost value must be greater than zero (current: %)', p_batch_id, v_batch.raw_cost_value;
      END IF;

      -- 4. Validate strictly transactional COA accounts (1150-01 & 1140-01)
      SELECT id, code, name INTO v_wip_acc FROM public.coa_accounts WHERE code = '1150-01' AND is_active = true LIMIT 1;
      IF v_wip_acc.id IS NULL THEN
        RAISE EXCEPTION 'Active transactional COA account 1150-01 (WIP) not found';
      END IF;

      SELECT id, code, name INTO v_raw_acc FROM public.coa_accounts WHERE code = '1140-01' AND is_active = true LIMIT 1;
      IF v_raw_acc.id IS NULL THEN
        RAISE EXCEPTION 'Active transactional COA account 1140-01 (Raw Material) not found';
      END IF;

      -- 5. Generate Voucher Identifiers
      v_voucher_id := 'vch-' || gen_random_uuid()::text;
      v_voucher_no := 'JV-SRT-WIP-' || TO_CHAR(v_today, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 6);

      -- 6. Insert Journal Voucher into vouchers
      INSERT INTO public.vouchers (
        id, voucher_no, date, voucher_date, type, voucher_type,
        reference, reference_no, narration,
        total_debit, total_credit, total_amount,
        currency, exchange_rate, base_currency, foreign_total_amount,
        status, created_by, is_auto, created_at
      ) VALUES (
        v_voucher_id, v_voucher_no, v_today, v_today, 'JV', 'JV',
        v_batch.batch_number, v_batch.batch_number,
        'Issued raw bales to sorting WIP [Batch: ' || v_batch.batch_number || ']',
        v_batch.raw_cost_value, v_batch.raw_cost_value, v_batch.raw_cost_value,
        'AED', 1.0, 'AED', v_batch.raw_cost_value,
        'POSTED', 'System - Sorting Workflow', true, v_now
      );

      -- Mirror into financial_vouchers
      INSERT INTO public.financial_vouchers (
        id, voucher_no, voucher_type, type, voucher_date, date,
        reference_no, reference, narration,
        total_amount, total_debit, total_credit,
        status, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
        created_by, created_at
      ) VALUES (
        v_voucher_id, v_voucher_no, 'JV', 'JV', v_today, v_today,
        v_batch.batch_number, v_batch.batch_number,
        'Issued raw bales to sorting WIP [Batch: ' || v_batch.batch_number || ']',
        v_batch.raw_cost_value, v_batch.raw_cost_value, v_batch.raw_cost_value,
        'POSTED', true, 'AED', 1.0, 'AED', v_batch.raw_cost_value,
        'System - Sorting Workflow', v_now
      );

      -- 7. Insert balanced journal entries into voucher_entries
      -- Line 1: DEBIT 1150-01 (WIP)
      INSERT INTO public.voucher_entries (
        id, voucher_id, voucher_no, account_id, account_code, account_name,
        debit, credit, particulars, memo, narration, date, created_at,
        currency, exchange_rate, foreign_debit, foreign_credit
      ) VALUES (
        gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_wip_acc.id, '1150-01', v_wip_acc.name,
        v_batch.raw_cost_value, 0,
        'Issued to Sorting WIP [Batch: ' || v_batch.batch_number || ']',
        'Issued to Sorting WIP',
        'Issued to Sorting WIP',
        v_today, v_now, 'AED', 1.0, v_batch.raw_cost_value, 0
      );

      -- Line 2: CREDIT 1140-01 (Raw Material)
      INSERT INTO public.voucher_entries (
        id, voucher_id, voucher_no, account_id, account_code, account_name,
        debit, credit, particulars, memo, narration, date, created_at,
        currency, exchange_rate, foreign_debit, foreign_credit
      ) VALUES (
        gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_raw_acc.id, '1140-01', v_raw_acc.name,
        0, v_batch.raw_cost_value,
        'Raw Material Issued to WIP [Batch: ' || v_batch.batch_number || ']',
        'Raw Material Issued to WIP',
        'Raw Material Issued to WIP',
        v_today, v_now, 'AED', 1.0, 0, v_batch.raw_cost_value
      );

      -- Mirror to general_ledger
      INSERT INTO public.general_ledger (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES
      (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_wip_acc.id, '1150-01', v_wip_acc.name,
        v_batch.raw_cost_value, 0, v_batch.raw_cost_value,
        'Issued to Sorting WIP [Batch: ' || v_batch.batch_number || ']',
        'Issued to Sorting WIP',
        'AED', 1.0, v_batch.raw_cost_value, 0, v_now
      ),
      (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_raw_acc.id, '1140-01', v_raw_acc.name,
        0, v_batch.raw_cost_value, -v_batch.raw_cost_value,
        'Raw Material Issued to WIP [Batch: ' || v_batch.batch_number || ']',
        'Raw Material Issued to WIP',
        'AED', 1.0, 0, v_batch.raw_cost_value, v_now
      );

      -- Mirror to ledgers
      INSERT INTO public.ledgers (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES
      (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_wip_acc.id, '1150-01', v_wip_acc.name,
        v_batch.raw_cost_value, 0, v_batch.raw_cost_value,
        'Issued to Sorting WIP [Batch: ' || v_batch.batch_number || ']',
        'Issued to Sorting WIP',
        'AED', 1.0, v_batch.raw_cost_value, 0, v_now
      ),
      (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_raw_acc.id, '1140-01', v_raw_acc.name,
        0, v_batch.raw_cost_value, -v_batch.raw_cost_value,
        'Raw Material Issued to WIP [Batch: ' || v_batch.batch_number || ']',
        'Raw Material Issued to WIP',
        'AED', 1.0, 0, v_batch.raw_cost_value, v_now
      );

      -- 8. Update inward_gate_passes if linked
      IF v_batch.inward_pass_id IS NOT NULL AND TRIM(v_batch.inward_pass_id) != '' THEN
        UPDATE public.inward_gate_passes
        SET status = 'IN_PROCESS'
        WHERE id = v_batch.inward_pass_id OR pass_no = v_batch.inward_pass_id;
      END IF;

      -- 9. Update sorting batch status
      UPDATE public.sorting_batches
      SET
        status = 'IN_PROCESS',
        wip_voucher_id = v_voucher_id,
        updated_at = v_now
      WHERE id = p_batch_id;

      RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'batch_number', v_batch.batch_number,
        'status', 'IN_PROCESS',
        'wip_voucher_id', v_voucher_id,
        'wip_voucher_no', v_voucher_no,
        'raw_cost_value', v_batch.raw_cost_value
      );
    END;
    $$;
  `);
  console.log('   -> start_sorting_batch_and_post_wip deployed.');

  // 4. Deploy Stored Procedure 2: complete_sorting_batch_and_post_fg
  console.log('4. Deploying complete_sorting_batch_and_post_fg...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.complete_sorting_batch_and_post_fg(
      p_batch_id UUID,
      p_finished_items JSONB
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_batch RECORD;
      v_fg_acc RECORD;
      v_scrap_acc RECORD;
      v_wip_acc RECORD;
      v_voucher_id VARCHAR(255);
      v_voucher_no VARCHAR(255);
      v_now TIMESTAMPTZ := NOW();
      v_today DATE := CURRENT_DATE;

      v_item JSONB;
      v_item_sku TEXT;
      v_item_name TEXT;
      v_item_cat TEXT;
      v_item_grade TEXT;
      v_item_qty INT;
      v_item_weight NUMERIC(12, 2);
      v_item_cost NUMERIC(12, 2);
      v_item_selling NUMERIC(12, 2);
      v_item_barcode TEXT;

      v_total_fg_weight NUMERIC(12, 2) := 0;
      v_total_fg_cost NUMERIC(12, 2) := 0;
      v_scrap_cost NUMERIC(12, 2) := 0;
      v_wastage_weight NUMERIC(12, 2) := 0;
      v_wip_cleared NUMERIC(12, 2);
      v_items_count INT := 0;
    BEGIN
      -- 1. Fetch and lock sorting batch
      SELECT * INTO v_batch FROM public.sorting_batches WHERE id = p_batch_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Sorting batch % not found', p_batch_id;
      END IF;

      -- 2. Validate IN_PROCESS status
      IF v_batch.status != 'IN_PROCESS' THEN
        RAISE EXCEPTION 'Sorting batch % cannot be completed: status is "%" (must be "IN_PROCESS")', p_batch_id, v_batch.status;
      END IF;

      -- 3. Validate finished items array
      IF p_finished_items IS NULL OR jsonb_typeof(p_finished_items) != 'array' OR jsonb_array_length(p_finished_items) = 0 THEN
        RAISE EXCEPTION 'Finished goods items array cannot be empty';
      END IF;

      v_wip_cleared := COALESCE(v_batch.raw_cost_value, 0);
      IF v_wip_cleared <= 0 THEN
        RAISE EXCEPTION 'Sorting batch % has invalid raw cost value (%)', p_batch_id, v_wip_cleared;
      END IF;

      -- 4. Calculate total weights and costs from items
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_finished_items) LOOP
        v_item_qty := COALESCE((v_item->>'quantity')::int, 1);
        v_item_weight := COALESCE((v_item->>'weight_kg')::numeric, 0);
        v_item_cost := COALESCE((v_item->>'cost_price')::numeric, 0);

        v_total_fg_weight := v_total_fg_weight + v_item_weight;
        v_total_fg_cost := v_total_fg_cost + (v_item_cost * v_item_qty);
        v_items_count := v_items_count + 1;
      END LOOP;

      -- If item costs were not explicitly broken down, allocate entire WIP cost to finished goods
      IF v_total_fg_cost <= 0 THEN
        v_total_fg_cost := v_wip_cleared;
        v_scrap_cost := 0;
      ELSIF v_total_fg_cost < v_wip_cleared THEN
        -- Remaining WIP balance is recognized as Sorting Scrap & Yield Loss
        v_scrap_cost := v_wip_cleared - v_total_fg_cost;
      ELSE
        -- Total FG cost matches or clears entire WIP cost
        v_total_fg_cost := v_wip_cleared;
        v_scrap_cost := 0;
      END IF;

      -- Strict double-entry balance validation: DEBITS == CREDITS
      IF (v_total_fg_cost + v_scrap_cost) != v_wip_cleared THEN
        RAISE EXCEPTION 'Double-entry balance check failed: Debits (%) != Credits (%)',
          (v_total_fg_cost + v_scrap_cost), v_wip_cleared;
      END IF;

      -- Calculate wastage weight (difference between raw batch weight and finished goods weight)
      v_wastage_weight := GREATEST(0, COALESCE(v_batch.raw_weight_kg, 0) - v_total_fg_weight);

      -- 5. Validate strictly transactional COA accounts
      SELECT id, code, name INTO v_fg_acc FROM public.coa_accounts WHERE code = '1160-01' AND is_active = true LIMIT 1;
      IF v_fg_acc.id IS NULL THEN
        RAISE EXCEPTION 'Active transactional COA account 1160-01 (Finished Goods) not found';
      END IF;

      IF v_scrap_cost > 0 THEN
        SELECT id, code, name INTO v_scrap_acc FROM public.coa_accounts WHERE code = '5190-01' AND is_active = true LIMIT 1;
        IF v_scrap_acc.id IS NULL THEN
          RAISE EXCEPTION 'Active transactional COA account 5190-01 (Sorting Scrap & Yield Loss) not found';
        END IF;
      END IF;

      SELECT id, code, name INTO v_wip_acc FROM public.coa_accounts WHERE code = '1150-01' AND is_active = true LIMIT 1;
      IF v_wip_acc.id IS NULL THEN
        RAISE EXCEPTION 'Active transactional COA account 1150-01 (WIP) not found';
      END IF;

      -- 6. Generate Voucher Identifiers
      v_voucher_id := 'vch-' || gen_random_uuid()::text;
      v_voucher_no := 'JV-SRT-FG-' || TO_CHAR(v_today, 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text, 1, 6);

      -- 7. Insert Journal Voucher into vouchers
      INSERT INTO public.vouchers (
        id, voucher_no, date, voucher_date, type, voucher_type,
        reference, reference_no, narration,
        total_debit, total_credit, total_amount,
        currency, exchange_rate, base_currency, foreign_total_amount,
        status, created_by, is_auto, created_at
      ) VALUES (
        v_voucher_id, v_voucher_no, v_today, v_today, 'JV', 'JV',
        v_batch.batch_number, v_batch.batch_number,
        'Completed sorting output to Finished Goods inventory [Batch: ' || v_batch.batch_number || ']',
        v_wip_cleared, v_wip_cleared, v_wip_cleared,
        'AED', 1.0, 'AED', v_wip_cleared,
        'POSTED', 'System - Sorting Workflow', true, v_now
      );

      -- Mirror into financial_vouchers
      INSERT INTO public.financial_vouchers (
        id, voucher_no, voucher_type, type, voucher_date, date,
        reference_no, reference, narration,
        total_amount, total_debit, total_credit,
        status, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
        created_by, created_at
      ) VALUES (
        v_voucher_id, v_voucher_no, 'JV', 'JV', v_today, v_today,
        v_batch.batch_number, v_batch.batch_number,
        'Completed sorting output to Finished Goods inventory [Batch: ' || v_batch.batch_number || ']',
        v_wip_cleared, v_wip_cleared, v_wip_cleared,
        'POSTED', true, 'AED', 1.0, 'AED', v_wip_cleared,
        'System - Sorting Workflow', v_now
      );

      -- 8. Insert balanced journal entries into voucher_entries
      -- Line 1: DEBIT 1160-01 (Finished Goods)
      INSERT INTO public.voucher_entries (
        id, voucher_id, voucher_no, account_id, account_code, account_name,
        debit, credit, particulars, memo, narration, date, created_at,
        currency, exchange_rate, foreign_debit, foreign_credit
      ) VALUES (
        gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_fg_acc.id, '1160-01', v_fg_acc.name,
        v_total_fg_cost, 0,
        'Finished Goods Capitalized [Batch: ' || v_batch.batch_number || ']',
        'Finished Goods Capitalized',
        'Finished Goods Capitalized',
        v_today, v_now, 'AED', 1.0, v_total_fg_cost, 0
      );

      -- Line 2 (if scrap > 0): DEBIT 5190-01 (Sorting Scrap & Yield Loss)
      IF v_scrap_cost > 0 THEN
        INSERT INTO public.voucher_entries (
          id, voucher_id, voucher_no, account_id, account_code, account_name,
          debit, credit, particulars, memo, narration, date, created_at,
          currency, exchange_rate, foreign_debit, foreign_credit
        ) VALUES (
          gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_scrap_acc.id, '5190-01', v_scrap_acc.name,
          v_scrap_cost, 0,
          'Sorting Scrap & Yield Loss [Batch: ' || v_batch.batch_number || ']',
          'Sorting Scrap & Yield Loss',
          'Sorting Scrap & Yield Loss',
          v_today, v_now, 'AED', 1.0, v_scrap_cost, 0
        );
      END IF;

      -- Line 3: CREDIT 1150-01 (WIP)
      INSERT INTO public.voucher_entries (
        id, voucher_id, voucher_no, account_id, account_code, account_name,
        debit, credit, particulars, memo, narration, date, created_at,
        currency, exchange_rate, foreign_debit, foreign_credit
      ) VALUES (
        gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_wip_acc.id, '1150-01', v_wip_acc.name,
        0, v_wip_cleared,
        'Clear WIP to Finished Goods [Batch: ' || v_batch.batch_number || ']',
        'Clear WIP to Finished Goods',
        'Clear WIP to Finished Goods',
        v_today, v_now, 'AED', 1.0, 0, v_wip_cleared
      );

      -- Mirror to general_ledger
      INSERT INTO public.general_ledger (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES
      (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_fg_acc.id, '1160-01', v_fg_acc.name,
        v_total_fg_cost, 0, v_total_fg_cost,
        'Finished Goods Capitalized [Batch: ' || v_batch.batch_number || ']',
        'Finished Goods Capitalized',
        'AED', 1.0, v_total_fg_cost, 0, v_now
      );

      IF v_scrap_cost > 0 THEN
        INSERT INTO public.general_ledger (
          id, entry_date, date, voucher_id, voucher_no,
          account_id, account_code, account_name,
          debit, credit, balance, description, narration,
          currency, exchange_rate, foreign_debit, foreign_credit, created_at
        ) VALUES (
          gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
          v_scrap_acc.id, '5190-01', v_scrap_acc.name,
          v_scrap_cost, 0, v_scrap_cost,
          'Sorting Scrap & Yield Loss [Batch: ' || v_batch.batch_number || ']',
          'Sorting Scrap & Yield Loss',
          'AED', 1.0, v_scrap_cost, 0, v_now
        );
      END IF;

      INSERT INTO public.general_ledger (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_wip_acc.id, '1150-01', v_wip_acc.name,
        0, v_wip_cleared, -v_wip_cleared,
        'Clear WIP to Finished Goods [Batch: ' || v_batch.batch_number || ']',
        'Clear WIP to Finished Goods',
        'AED', 1.0, 0, v_wip_cleared, v_now
      );

      -- Mirror to ledgers
      INSERT INTO public.ledgers (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES
      (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_fg_acc.id, '1160-01', v_fg_acc.name,
        v_total_fg_cost, 0, v_total_fg_cost,
        'Finished Goods Capitalized [Batch: ' || v_batch.batch_number || ']',
        'Finished Goods Capitalized',
        'AED', 1.0, v_total_fg_cost, 0, v_now
      );

      IF v_scrap_cost > 0 THEN
        INSERT INTO public.ledgers (
          id, entry_date, date, voucher_id, voucher_no,
          account_id, account_code, account_name,
          debit, credit, balance, description, narration,
          currency, exchange_rate, foreign_debit, foreign_credit, created_at
        ) VALUES (
          gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
          v_scrap_acc.id, '5190-01', v_scrap_acc.name,
          v_scrap_cost, 0, v_scrap_cost,
          'Sorting Scrap & Yield Loss [Batch: ' || v_batch.batch_number || ']',
          'Sorting Scrap & Yield Loss',
          'AED', 1.0, v_scrap_cost, 0, v_now
        );
      END IF;

      INSERT INTO public.ledgers (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES (
        gen_random_uuid()::text, v_today, v_today, v_voucher_id, v_voucher_no,
        v_wip_acc.id, '1150-01', v_wip_acc.name,
        0, v_wip_cleared, -v_wip_cleared,
        'Clear WIP to Finished Goods [Batch: ' || v_batch.batch_number || ']',
        'Clear WIP to Finished Goods',
        'AED', 1.0, 0, v_wip_cleared, v_now
      );

      -- 9. Insert items into sorting_batch_items and inventory_items
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_finished_items) LOOP
        v_item_sku := COALESCE(v_item->>'item_sku', v_item->>'sku', 'SKU-' || SUBSTRING(gen_random_uuid()::text, 1, 8));
        v_item_name := COALESCE(v_item->>'item_name', v_item->>'title', 'Finished Garment');
        v_item_cat := COALESCE(v_item->>'category', 'Graded Vintage');
        v_item_grade := v_item->>'grade';
        v_item_qty := COALESCE((v_item->>'quantity')::int, 1);
        v_item_weight := COALESCE((v_item->>'weight_kg')::numeric, 0.00);
        v_item_cost := COALESCE((v_item->>'cost_price')::numeric, 0.00);
        v_item_selling := COALESCE((v_item->>'selling_price')::numeric, 0.00);
        v_item_barcode := COALESCE(v_item->>'barcode', 'BC-' || SUBSTRING(gen_random_uuid()::text, 1, 10));

        -- 9a. Insert into sorting_batch_items
        INSERT INTO public.sorting_batch_items (
          batch_id, item_sku, item_name, category, grade,
          quantity, weight_kg, cost_price, selling_price, barcode, created_at
        ) VALUES (
          p_batch_id, v_item_sku, v_item_name, v_item_cat, v_item_grade,
          v_item_qty, v_item_weight, v_item_cost, v_item_selling, v_item_barcode, v_now
        );

        -- 9b. Capitalize into inventory_items for sale
        INSERT INTO public.inventory_items (
          id, sku, title, category, cost_price, selling_price, stock_quantity, barcode,
          is_b2b_enabled, is_pos_enabled, created_at
        ) VALUES (
          gen_random_uuid(), v_item_sku, v_item_name, v_item_cat, v_item_cost, v_item_selling,
          v_item_qty, v_item_barcode, true, true, v_now
        );
      END LOOP;

      -- 10. Update inward_gate_passes if linked
      IF v_batch.inward_pass_id IS NOT NULL AND TRIM(v_batch.inward_pass_id) != '' THEN
        UPDATE public.inward_gate_passes
        SET status = 'COMPLETED'
        WHERE id = v_batch.inward_pass_id OR pass_no = v_batch.inward_pass_id;
      END IF;

      -- 11. Update sorting batch status
      UPDATE public.sorting_batches
      SET
        status = 'COMPLETED',
        fg_voucher_id = v_voucher_id,
        finished_weight_kg = v_total_fg_weight,
        wastage_weight_kg = v_wastage_weight,
        updated_at = v_now
      WHERE id = p_batch_id;

      RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'batch_number', v_batch.batch_number,
        'status', 'COMPLETED',
        'fg_voucher_id', v_voucher_id,
        'fg_voucher_no', v_voucher_no,
        'total_fg_cost', v_total_fg_cost,
        'scrap_cost', v_scrap_cost,
        'finished_weight_kg', v_total_fg_weight,
        'wastage_weight_kg', v_wastage_weight,
        'items_count', v_items_count
      );
    END;
    $$;
  `);
  console.log('   -> complete_sorting_batch_and_post_fg deployed.');

  await client.end();
  console.log('[Sorting Workflow Deploy] Successfully deployed all database components!');
}

deploy().catch(err => {
  console.error('[Deployment Error]:', err);
  process.exit(1);
});
