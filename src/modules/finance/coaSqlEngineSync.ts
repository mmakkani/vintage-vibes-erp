/**
 * Unified COA, Registry (Parties), Voucher Entries & Financial Statements SQL Self-Heal Engine.
 * Runs idempotently on both Local PostgreSQL (24/7 VPS) and Cloud Supabase PostgreSQL
 * so that chart_of_accounts, coa_accounts, accounts, parties, view_coa_live_balances,
 * get_trial_balance, get_income_statement, and get_balance_sheet are always 100% synchronized.
 */

let hasSyncedInProcess = false;
let syncPromise: Promise<void> | null = null;

export async function ensureCoaAndFinancialStatementsSynced(client: any, force = false): Promise<void> {
  if (hasSyncedInProcess && !force) return;
  if (syncPromise && !force) {
    await syncPromise.catch(() => {});
    return;
  }

  syncPromise = (async () => {
    try {
      // 1. Remove duplicate legacy 1010-01 Cash in Hand if it has no transactions (1110-01 is canonical)
      await client.query(`
        DELETE FROM public.chart_of_accounts
        WHERE code = '1010-01'
          AND NOT EXISTS (SELECT 1 FROM public.voucher_entries WHERE account_code = '1010-01' OR account_id = chart_of_accounts.id::text)
          AND NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE account_id::text = chart_of_accounts.id::text);
      `).catch(() => {});
      await client.query(`DELETE FROM public.coa_accounts WHERE code = '1010-01';`).catch(() => {});
      await client.query(`DELETE FROM public.accounts WHERE account_code = '1010-01';`).catch(() => {});

      // 2. Ensure canonical parent_code hierarchy on all COA accounts
      await client.query(`
        UPDATE public.chart_of_accounts
        SET parent_code = CASE
          WHEN code IN ('1000-00', '2000-00', '3000-00', '4000-00', '5000-00') THEN NULL
          WHEN code LIKE '1%-00' THEN '1000-00'
          WHEN code LIKE '2%-00' THEN '2000-00'
          WHEN code LIKE '3%-00' THEN '3000-00'
          WHEN code LIKE '4%-00' THEN '4000-00'
          WHEN code LIKE '5%-00' THEN '5000-00'
          WHEN code = '1110-01' THEN '1110-00'
          WHEN code IN ('1120-01', '1120-02') THEN '1120-00'
          WHEN code = '1140-01' THEN '1140-00'
          WHEN code = '1150-01' THEN '1150-00'
          WHEN code = '1160-01' THEN '1160-00'
          WHEN code = '1320-01' THEN '1000-00'
          WHEN code = '2330-01' THEN '2000-00'
          WHEN code = '4110-05' THEN '4110-00'
          WHEN code = '5100-02' THEN '5100-00'
          WHEN code IN ('5140-01', '5150-01') THEN '5120-00'
          WHEN code = '5190-01' THEN '5190-00'
          ELSE COALESCE(parent_code, SUBSTRING(code FROM 1 FOR 4) || '-00')
        END
        WHERE parent_code IS NULL AND code NOT IN ('1000-00', '2000-00', '3000-00', '4000-00', '5000-00');
      `).catch(() => {});

      // 3. Fix COUR-06 (Banana Express) coa_account_id to '2120-06'
      await client.query(`
        UPDATE public.parties
        SET coa_account_id = '2120-06',
            account_map = COALESCE(account_map, '{}'::jsonb) || jsonb_build_object(
              'payableAccountId', '2120-06',
              'courierPayableAccountId', '2120-06',
              'payableAccountUuid', (SELECT id::text FROM public.chart_of_accounts WHERE code = '2120-06' LIMIT 1)
            )
        WHERE code = 'COUR-06' AND coa_account_id != '2120-06';
      `).catch(() => {});

      // 4. Ensure any Supplier / Customer COA account (2110-05 PARSA FASHION, 2110-06 saad, etc.) is linked in parties
      await client.query(`
        INSERT INTO public.parties (
          id, party_id, code, name, type, party_type, contact_person, phone, email, address, trn_no,
          opening_balance, current_balance, balance, credit_limit, is_active, status,
          coa_account_id, account_map, created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          gen_random_uuid(),
          'SUP-0010',
          'PARSA FASHION',
          'SUPPLIER',
          'SUPPLIER',
          'PARSA FASHION',
          '', '', '', '',
          0, 0, 0, 0, true, 'ACTIVE',
          '2110-05',
          jsonb_build_object(
            'payableAccountId', '2110-05',
            'payableAccountUuid', c.id::text
          ),
          NOW(), NOW()
        FROM public.chart_of_accounts c
        WHERE c.code = '2110-05'
          AND NOT EXISTS (SELECT 1 FROM public.parties WHERE coa_account_id = '2110-05' OR name ILIKE 'PARSA FASHION%');
      `).catch(() => {});

      await client.query(`
        INSERT INTO public.parties (
          id, party_id, code, name, type, party_type, contact_person, phone, email, address, trn_no,
          opening_balance, current_balance, balance, credit_limit, is_active, status,
          coa_account_id, account_map, created_at, updated_at
        )
        SELECT
          gen_random_uuid()::text,
          gen_random_uuid(),
          'SUP-0011',
          'saad',
          'SUPPLIER',
          'SUPPLIER',
          'saad',
          '', '', '', '',
          0, 0, 0, 0, true, 'ACTIVE',
          '2110-06',
          jsonb_build_object(
            'payableAccountId', '2110-06',
            'payableAccountUuid', c.id::text
          ),
          NOW(), NOW()
        FROM public.chart_of_accounts c
        WHERE c.code = '2110-06'
          AND NOT EXISTS (SELECT 1 FROM public.parties WHERE coa_account_id = '2110-06' OR LOWER(name) = 'saad');
      `).catch(() => {});

      // 5. Clean up duplicate 'acc-wip-sorting' rows, orphan voucher_entries, orphan journal_entries, and duplicate general_ledger rows
      await client.query(`
        DELETE FROM public.voucher_entries ve
        WHERE ve.account_id = 'acc-wip-sorting'
          AND EXISTS (
            SELECT 1 FROM public.voucher_entries ve2
            WHERE ve2.voucher_id = ve.voucher_id
              AND ve2.account_code = '1150-01'
              AND ve2.id != ve.id
          );
      `).catch(() => {});

      await client.query(`
        DELETE FROM public.voucher_entries ve
        WHERE NOT EXISTS (
          SELECT 1 FROM public.financial_vouchers fv
          WHERE fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.vouchers v
          WHERE v.id::text = ve.voucher_id::text OR v.voucher_no = ve.voucher_no
        );
      `).catch(() => {});

      await client.query(`
        DELETE FROM public.journal_entries je
        WHERE NOT EXISTS (
          SELECT 1 FROM public.financial_vouchers fv WHERE fv.id = je.voucher_id
        );
      `).catch(() => {});

      await client.query(`
        DELETE FROM public.general_ledger gl
        WHERE NOT EXISTS (
          SELECT 1 FROM public.financial_vouchers fv
          WHERE fv.id::text = gl.voucher_id::text OR fv.voucher_no = gl.reference_no OR fv.reference = gl.reference_no
        );
      `).catch(() => {});

      await client.query(`
        DELETE FROM public.general_ledger a
        USING public.general_ledger b
        WHERE a.id::text > b.id::text
          AND COALESCE(a.voucher_id::text, '') = COALESCE(b.voucher_id::text, '')
          AND COALESCE(a.account_code, '') = COALESCE(b.account_code, '')
          AND COALESCE(a.debit, 0) = COALESCE(b.debit, 0)
          AND COALESCE(a.credit, 0) = COALESCE(b.credit, 0);
      `).catch(() => {});

      await client.query(`
        DELETE FROM public.bale_sorted_pieces bsp
        WHERE NOT EXISTS (
          SELECT 1 FROM public.inventory_pieces ip
          WHERE ip.id::text = bsp.id::text OR ip.sku = bsp.piece_barcode OR ip.barcode = bsp.piece_barcode
        );
      `).catch(() => {});

      await client.query(`
        DELETE FROM public.bale_sorted_pieces a
        USING public.bale_sorted_pieces b
        WHERE a.piece_barcode = b.piece_barcode
          AND a.id::text != b.id::text
          AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE ip.id::text = a.id::text);
      `).catch(() => {});

      // 6. Create/update 3-table COA Synchronization Function
      await client.query(`
        CREATE OR REPLACE FUNCTION public.sync_all_coa_tables()
        RETURNS void
        LANGUAGE plpgsql
        AS $func$
        BEGIN
          INSERT INTO public.account_types (type_id, type_name) VALUES
            (1, 'Asset'), (2, 'Liability'), (3, 'Equity'), (4, 'Revenue'), (5, 'Expense')
          ON CONFLICT (type_id) DO NOTHING;

          -- Sync chart_of_accounts -> coa_accounts
          INSERT INTO public.coa_accounts (
            id, code, name, type, sub_type, parent_code, tier_level, is_active, currency, current_balance
          )
          SELECT
            c.id::text,
            c.code,
            c.name,
            CASE
              WHEN UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE') THEN 'REVENUE'
              WHEN UPPER(COALESCE(c.account_type, '')) IN ('ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE') THEN UPPER(c.account_type)
              WHEN LEFT(c.code, 1) = '1' THEN 'ASSET'
              WHEN LEFT(c.code, 1) = '2' THEN 'LIABILITY'
              WHEN LEFT(c.code, 1) = '3' THEN 'EQUITY'
              WHEN LEFT(c.code, 1) = '4' THEN 'REVENUE'
              ELSE 'EXPENSE'
            END,
            '',
            c.parent_code,
            CASE
              WHEN c.code IN ('1000-00','2000-00','3000-00','4000-00','5000-00') THEN 1
              WHEN c.code LIKE '%-00' THEN 2
              ELSE 3
            END,
            NOT COALESCE(c.is_deleted, false),
            'AED',
            COALESCE(c.current_balance, 0)
          FROM public.chart_of_accounts c
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            parent_code = COALESCE(EXCLUDED.parent_code, public.coa_accounts.parent_code),
            is_active = EXCLUDED.is_active,
            current_balance = EXCLUDED.current_balance;

          -- Sync coa_accounts -> chart_of_accounts (for any account only in coa_accounts)
          INSERT INTO public.chart_of_accounts (
            id, code, name, account_type, parent_code, current_balance, is_deleted, created_at
          )
          SELECT
            CASE WHEN ca.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ca.id::uuid ELSE gen_random_uuid() END,
            ca.code,
            ca.name,
            CASE WHEN UPPER(ca.type) = 'REVENUE' THEN 'INCOME' ELSE UPPER(ca.type) END,
            ca.parent_code,
            COALESCE(ca.current_balance, 0),
            NOT COALESCE(ca.is_active, true),
            NOW()
          FROM public.coa_accounts ca
          WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = ca.code)
          ON CONFLICT (code) DO NOTHING;

          -- Sync chart_of_accounts -> accounts
          INSERT INTO public.accounts (
            account_code, account_name, account_type_id, is_active, is_transactional, account_level
          )
          SELECT
            c.code,
            c.name,
            CASE
              WHEN LEFT(c.code, 1) = '1' THEN 1
              WHEN LEFT(c.code, 1) = '2' THEN 2
              WHEN LEFT(c.code, 1) = '3' THEN 3
              WHEN LEFT(c.code, 1) = '4' THEN 4
              ELSE 5
            END,
            NOT COALESCE(c.is_deleted, false),
            NOT (c.code LIKE '%-00'),
            CASE
              WHEN c.code IN ('1000-00','2000-00','3000-00','4000-00','5000-00') THEN 1
              WHEN c.code LIKE '%-00' THEN 2
              ELSE 3
            END
          FROM public.chart_of_accounts c
          ON CONFLICT (account_code) DO UPDATE SET
            account_name = EXCLUDED.account_name,
            is_active = EXCLUDED.is_active,
            is_transactional = EXCLUDED.is_transactional,
            account_level = EXCLUDED.account_level;

          UPDATE public.accounts child
          SET parent_id = parent.account_id
          FROM public.chart_of_accounts c
          JOIN public.accounts parent ON parent.account_code = c.parent_code
          WHERE child.account_code = c.code
            AND c.parent_code IS NOT NULL
            AND (child.parent_id IS DISTINCT FROM parent.account_id);
        END;
        $func$;
      `);

      // 7. Upgrade create_party_with_coa & cleanup_orphan_party_accounts
      await client.query(`
        CREATE OR REPLACE FUNCTION public.create_party_with_coa(
          p_name text,
          p_type text,
          p_contact_person text DEFAULT ''::text,
          p_phone text DEFAULT ''::text,
          p_email text DEFAULT ''::text,
          p_address text DEFAULT ''::text,
          p_trn_no text DEFAULT ''::text,
          p_opening_balance numeric DEFAULT 0,
          p_credit_limit numeric DEFAULT 0,
          p_custom_code text DEFAULT NULL::text
        )
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $func$
        DECLARE
          v_norm_type TEXT;
          v_party_prefix TEXT;
          v_coa_parent TEXT;
          v_coa_type TEXT;
          v_coa_chart_type TEXT;
          v_coa_sub_type TEXT;
          v_suffix_label TEXT;
          v_max_party_num INT := 0;
          v_max_coa_num INT := 0;
          v_next_num INT := 1;
          v_party_code TEXT;
          v_coa_code TEXT;
          v_coa_name TEXT;
          v_party_id UUID := gen_random_uuid();
          v_coa_uuid UUID := gen_random_uuid();
          v_opening NUMERIC := COALESCE(p_opening_balance, 0);
          v_account_map JSONB;
          v_existing_coa RECORD;
          v_type_id INT := 1;
          v_parent_acc_id INT := NULL;
        BEGIN
          IF TRIM(COALESCE(p_name, '')) = '' THEN
            RAISE EXCEPTION 'Party Name is required';
          END IF;

          v_norm_type := UPPER(TRIM(COALESCE(p_type, 'SUPPLIER')));
          IF v_norm_type = 'CLIENT' THEN v_norm_type := 'CUSTOMER'; END IF;

          IF v_norm_type = 'SUPPLIER' THEN
            v_party_prefix := 'SUP';
            v_coa_parent := '2110-00';
            v_coa_type := 'LIABILITY';
            v_coa_chart_type := 'LIABILITY';
            v_coa_sub_type := 'Accounts Payable';
            v_suffix_label := '(Supplier)';
            v_type_id := 2;
          ELSIF v_norm_type = 'AGENT' THEN
            v_party_prefix := 'AGT';
            v_coa_parent := '2120-00';
            v_coa_type := 'LIABILITY';
            v_coa_chart_type := 'LIABILITY';
            v_coa_sub_type := 'Clearing Agent Payable';
            v_suffix_label := '(Clearing Agent)';
            v_type_id := 2;
          ELSIF v_norm_type = 'COURIER' THEN
            v_party_prefix := 'COUR';
            v_coa_parent := '2120-00';
            v_coa_type := 'LIABILITY';
            v_coa_chart_type := 'LIABILITY';
            v_coa_sub_type := 'Courier Payable';
            v_suffix_label := '(Courier Payable)';
            v_type_id := 2;
          ELSE
            v_norm_type := 'CUSTOMER';
            v_party_prefix := 'CLI';
            v_coa_parent := '1130-00';
            v_coa_type := 'ASSET';
            v_coa_chart_type := 'ASSET';
            v_coa_sub_type := 'Accounts Receivable';
            v_suffix_label := '(Customer)';
            v_type_id := 1;
          END IF;

          PERFORM pg_advisory_xact_lock(hashtext('create_party_with_coa_' || v_coa_parent));

          SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^' || v_party_prefix || '-0*', ''), '')::INT), 0)
          INTO v_max_party_num
          FROM public.parties
          WHERE code ~ ('^' || v_party_prefix || '-[0-9]+$');

          SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^' || split_part(v_coa_parent, '-', 1) || '-0*', ''), '')::INT), 0)
          INTO v_max_coa_num
          FROM (
            SELECT code FROM public.chart_of_accounts WHERE code ~ ('^' || split_part(v_coa_parent, '-', 1) || '-[0-9]+$') AND code != v_coa_parent
            UNION
            SELECT code FROM public.coa_accounts WHERE code ~ ('^' || split_part(v_coa_parent, '-', 1) || '-[0-9]+$') AND code != v_coa_parent
            UNION
            SELECT account_code AS code FROM public.accounts WHERE account_code ~ ('^' || split_part(v_coa_parent, '-', 1) || '-[0-9]+$') AND account_code != v_coa_parent
          ) combined_codes;

          v_next_num := GREATEST(v_max_party_num, v_max_coa_num) + 1;

          IF p_custom_code IS NOT NULL AND TRIM(p_custom_code) <> '' THEN
            v_party_code := TRIM(p_custom_code);
          ELSE
            v_party_code := v_party_prefix || '-' || LPAD(v_next_num::TEXT, 4, '0');
          END IF;

          v_coa_code := split_part(v_coa_parent, '-', 1) || '-' || LPAD(v_next_num::TEXT, 2, '0');
          v_coa_name := TRIM(p_name) || ' ' || v_suffix_label;

          SELECT id, code INTO v_existing_coa
          FROM public.chart_of_accounts
          WHERE LOWER(TRIM(name)) = LOWER(v_coa_name)
             OR LOWER(TRIM(name)) = LOWER(TRIM(p_name))
          LIMIT 1;

          IF v_existing_coa.id IS NOT NULL THEN
            v_coa_uuid := v_existing_coa.id;
            v_coa_code := v_existing_coa.code;
          ELSE
            INSERT INTO public.chart_of_accounts (
              id, code, name, account_type, parent_code, is_deleted, current_balance, created_at
            ) VALUES (
              v_coa_uuid, v_coa_code, v_coa_name, v_coa_chart_type, v_coa_parent, false, v_opening, NOW()
            )
            ON CONFLICT (code) DO UPDATE
              SET name = EXCLUDED.name,
                  account_type = EXCLUDED.account_type,
                  parent_code = EXCLUDED.parent_code,
                  is_deleted = false
            RETURNING id INTO v_coa_uuid;
          END IF;

          INSERT INTO public.coa_accounts (
            id, code, name, type, sub_type, parent_code, tier_level, is_active, currency, current_balance
          ) VALUES (
            v_coa_uuid::TEXT, v_coa_code, v_coa_name, v_coa_type, v_coa_sub_type, v_coa_parent, 3, true, 'AED', v_opening
          )
          ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name,
                type = EXCLUDED.type,
                sub_type = EXCLUDED.sub_type,
                parent_code = EXCLUDED.parent_code,
                is_active = true;

          SELECT account_id INTO v_parent_acc_id FROM public.accounts WHERE account_code = v_coa_parent LIMIT 1;

          INSERT INTO public.accounts (
            account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level
          ) VALUES (
            v_coa_code, v_coa_name, v_type_id, v_parent_acc_id, true, true, 3
          )
          ON CONFLICT (account_code) DO UPDATE
            SET account_name = EXCLUDED.account_name,
                account_type_id = EXCLUDED.account_type_id,
                parent_id = COALESCE(EXCLUDED.parent_id, public.accounts.parent_id),
                is_active = true,
                is_transactional = true;

          IF v_norm_type = 'CUSTOMER' THEN
            v_account_map := jsonb_build_object('receivableAccountId', v_coa_code, 'receivableAccountUuid', v_coa_uuid::TEXT);
          ELSIF v_norm_type = 'AGENT' THEN
            v_account_map := jsonb_build_object('payableAccountId', v_coa_code, 'payableAccountUuid', v_coa_uuid::TEXT, 'agentPayableAccountId', v_coa_code);
          ELSIF v_norm_type = 'COURIER' THEN
            v_account_map := jsonb_build_object('payableAccountId', v_coa_code, 'payableAccountUuid', v_coa_uuid::TEXT, 'courierPayableAccountId', v_coa_code);
          ELSE
            v_account_map := jsonb_build_object('payableAccountId', v_coa_code, 'payableAccountUuid', v_coa_uuid::TEXT);
          END IF;

          INSERT INTO public.parties (
            id, code, name, company_name, type, party_type,
            contact_person, phone, email, address, trn_no,
            opening_balance, current_balance, credit_limit,
            is_active, currency, coa_account_id, linked_account_id, account_map
          ) VALUES (
            v_party_id::TEXT, v_party_code, TRIM(p_name), TRIM(p_name), v_norm_type, v_norm_type,
            COALESCE(p_contact_person, ''), COALESCE(p_phone, ''), COALESCE(p_email, ''), COALESCE(p_address, ''), COALESCE(p_trn_no, ''),
            v_opening, v_opening, COALESCE(p_credit_limit, 0),
            true, 'AED', v_coa_code, v_coa_uuid, v_account_map
          );

          RETURN jsonb_build_object(
            'id', v_party_id::TEXT,
            'party_id', v_party_id::TEXT,
            'code', v_party_code,
            'name', TRIM(p_name),
            'type', v_norm_type,
            'party_type', v_norm_type,
            'contactPerson', COALESCE(p_contact_person, ''),
            'phone', COALESCE(p_phone, ''),
            'email', COALESCE(p_email, ''),
            'address', COALESCE(p_address, ''),
            'trnNo', COALESCE(p_trn_no, ''),
            'openingBalance', v_opening,
            'currentBalance', v_opening,
            'creditLimit', COALESCE(p_credit_limit, 0),
            'isActive', true,
            'coaCode', v_coa_code,
            'coaUuid', v_coa_uuid::TEXT,
            'coa_account_id', v_coa_code,
            'linked_account_id', v_coa_uuid::TEXT,
            'accountMap', v_account_map
          );
        END;
        $func$;
      `);

      // 8. Upgrade view_coa_live_balances & sync_coa_current_balances
      await client.query(`DROP VIEW IF EXISTS public.view_coa_live_balances CASCADE;`).catch(() => {});
      await client.query(`
        CREATE OR REPLACE VIEW public.view_coa_live_balances AS
        WITH active_ve AS (
          SELECT ve.account_id, ve.account_code, ve.debit, ve.credit
          FROM public.voucher_entries ve
          JOIN public.financial_vouchers fv ON fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
          WHERE fv.status = 'POSTED'
        ),
        party_links AS (
          SELECT DISTINCT ON (coa_ref)
            id AS party_id,
            name AS party_name,
            COALESCE(type, party_type) AS party_type,
            COALESCE(opening_balance, 0) AS party_opening_balance,
            coa_ref
          FROM (
            SELECT id, name, type, party_type, opening_balance, coa_account_id AS coa_ref FROM public.parties WHERE coa_account_id IS NOT NULL
            UNION ALL
            SELECT id, name, type, party_type, opening_balance, linked_account_id::text AS coa_ref FROM public.parties WHERE linked_account_id IS NOT NULL
            UNION ALL
            SELECT id, name, type, party_type, opening_balance, account_map->>'payableAccountId' AS coa_ref FROM public.parties WHERE account_map->>'payableAccountId' IS NOT NULL
            UNION ALL
            SELECT id, name, type, party_type, opening_balance, account_map->>'receivableAccountId' AS coa_ref FROM public.parties WHERE account_map->>'receivableAccountId' IS NOT NULL
          ) pl
          WHERE coa_ref IS NOT NULL AND coa_ref != '' AND coa_ref NOT LIKE '%-00'
        )
        SELECT
          (c.id::text)::character varying(64) AS account_id,
          (c.code)::character varying(32) AS account_code,
          (c.name)::character varying(255) AS account_name,
          (CASE
            WHEN UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE') THEN 'REVENUE'
            WHEN UPPER(COALESCE(c.account_type, '')) IN ('ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE') THEN UPPER(c.account_type)
            WHEN LEFT(c.code, 1) = '1' THEN 'ASSET'
            WHEN LEFT(c.code, 1) = '2' THEN 'LIABILITY'
            WHEN LEFT(c.code, 1) = '3' THEN 'EQUITY'
            WHEN LEFT(c.code, 1) = '4' THEN 'REVENUE'
            ELSE 'EXPENSE'
          END)::character varying(32) AS classification,
          (COALESCE(ca.sub_type, ''))::character varying(64) AS sub_type,
          (c.parent_code)::character varying(32) AS parent_code,
          (CASE
            WHEN c.code IN ('1000-00','2000-00','3000-00','4000-00','5000-00') THEN 1
            WHEN c.code LIKE '%-00' THEN 2
            ELSE 3
          END)::integer AS tier_level,
          (c.code LIKE '%-00')::boolean AS is_system,
          (NOT COALESCE(c.is_deleted, false))::boolean AS is_active,
          ('AED')::character varying(10) AS currency,
          (pl.party_id)::character varying(64) AS party_id,
          (pl.party_name)::character varying(255) AS party_name,
          (ROUND(COALESCE(SUM(ve.debit), 0)::numeric, 2))::numeric AS total_debit,
          (ROUND(COALESCE(SUM(ve.credit), 0)::numeric, 2))::numeric AS total_credit,
          (ROUND(
            CASE
              WHEN c.code LIKE '%-00' THEN 0
              WHEN COUNT(ve.debit) > 0 THEN
                CASE
                  WHEN LEFT(c.code, 1) IN ('1', '5') OR UPPER(COALESCE(c.account_type, '')) IN ('ASSET', 'EXPENSE')
                    THEN COALESCE(SUM(ve.debit), 0) - COALESCE(SUM(ve.credit), 0)
                  ELSE COALESCE(SUM(ve.credit), 0) - COALESCE(SUM(ve.debit), 0)
                END
              WHEN pl.party_id IS NOT NULL THEN COALESCE(pl.party_opening_balance, 0)
              ELSE 0
            END::numeric,
            2
          ))::numeric AS current_balance
        FROM public.chart_of_accounts c
        LEFT JOIN public.coa_accounts ca ON ca.code = c.code
        LEFT JOIN active_ve ve ON ve.account_id = c.id::text OR ve.account_code = c.code
        LEFT JOIN party_links pl ON (pl.coa_ref = c.code OR pl.coa_ref = c.id::text) AND c.code NOT LIKE '%-00'
        GROUP BY c.id, c.code, c.name, c.account_type, c.parent_code, c.is_deleted, ca.sub_type, pl.party_id, pl.party_name, pl.party_opening_balance;
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION public.sync_coa_current_balances()
        RETURNS void
        LANGUAGE plpgsql
        AS $func$
        BEGIN
          PERFORM public.sync_all_coa_tables();

          UPDATE public.chart_of_accounts c
          SET current_balance = CASE WHEN c.code LIKE '%-00' THEN 0 ELSE COALESCE(v.current_balance, 0) END
          FROM public.view_coa_live_balances v
          WHERE c.code = v.account_code;

          UPDATE public.coa_accounts ca
          SET current_balance = CASE WHEN ca.code LIKE '%-00' THEN 0 ELSE COALESCE(v.current_balance, 0) END
          FROM public.view_coa_live_balances v
          WHERE ca.code = v.account_code;

          UPDATE public.parties p
          SET current_balance = COALESCE(v.current_balance, COALESCE(p.opening_balance, 0))
          FROM public.view_coa_live_balances v
          WHERE v.account_code NOT LIKE '%-00'
            AND (p.coa_account_id = v.account_code
             OR p.coa_account_id = v.account_id
             OR p.linked_account_id::text = v.account_id);
        END;
        $func$;
      `);

      // 9. Upgrade get_trial_balance, get_income_statement, and get_balance_sheet to read directly from chart_of_accounts + voucher_entries
      await client.query(`
        CREATE OR REPLACE FUNCTION public.get_trial_balance(p_start_date text DEFAULT NULL::text, p_end_date text DEFAULT NULL::text)
        RETURNS jsonb
        LANGUAGE plpgsql
        AS $func$
        DECLARE
          v_rows JSONB;
          v_total_debit NUMERIC(15,2) := 0;
          v_total_credit NUMERIC(15,2) := 0;
        BEGIN
          WITH active_ve AS (
            SELECT ve.account_id, ve.account_code, ve.debit, ve.credit
            FROM public.voucher_entries ve
            JOIN public.financial_vouchers fv ON fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
            WHERE fv.status = 'POSTED'
              AND (p_start_date IS NULL OR p_start_date = '' OR COALESCE(ve.date, fv.date)::date >= p_start_date::date)
              AND (p_end_date IS NULL OR p_end_date = '' OR COALESCE(ve.date, fv.date)::date <= p_end_date::date)
          ),
          account_totals AS (
            SELECT
              c.id::text AS account_id,
              c.code AS account_code,
              c.name AS account_name,
              p.code AS parent_code,
              p.name AS parent_name,
              CASE
                WHEN UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE') THEN 'REVENUE'
                WHEN UPPER(COALESCE(c.account_type, '')) IN ('ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE') THEN UPPER(c.account_type)
                WHEN LEFT(c.code, 1) = '1' THEN 'ASSET'
                WHEN LEFT(c.code, 1) = '2' THEN 'LIABILITY'
                WHEN LEFT(c.code, 1) = '3' THEN 'EQUITY'
                WHEN LEFT(c.code, 1) = '4' THEN 'REVENUE'
                ELSE 'EXPENSE'
              END AS classification,
              COALESCE(SUM(ve.debit), 0) AS sum_debit,
              COALESCE(SUM(ve.credit), 0) AS sum_credit
            FROM public.chart_of_accounts c
            LEFT JOIN public.chart_of_accounts p ON p.code = c.parent_code
            LEFT JOIN active_ve ve ON ve.account_id = c.id::text OR ve.account_code = c.code
            WHERE NOT COALESCE(c.is_deleted, false)
              AND NOT (c.code LIKE '%-00')
            GROUP BY c.id, c.code, c.name, p.code, p.name, c.account_type
          ),
          net_balances AS (
            SELECT
              account_id,
              account_code,
              account_name,
              parent_code,
              parent_name,
              classification,
              sum_debit,
              sum_credit,
              CASE WHEN (sum_debit - sum_credit) > 0 THEN ROUND(sum_debit - sum_credit, 2) ELSE 0 END AS net_debit,
              CASE WHEN (sum_credit - sum_debit) > 0 THEN ROUND(sum_credit - sum_debit, 2) ELSE 0 END AS net_credit
            FROM account_totals
          )
          SELECT
            COALESCE(jsonb_agg(
              jsonb_build_object(
                'accountId', account_id,
                'accountCode', account_code,
                'accountName', account_name,
                'parentCode', COALESCE(parent_code, ''),
                'parentName', COALESCE(parent_name, ''),
                'accountType', classification,
                'classification', classification,
                'rawDebit', ROUND(sum_debit, 2),
                'rawCredit', ROUND(sum_credit, 2),
                'debit', net_debit,
                'credit', net_credit
              ) ORDER BY account_code ASC
            ), '[]'::jsonb),
            COALESCE(SUM(net_debit), 0),
            COALESCE(SUM(net_credit), 0)
          INTO v_rows, v_total_debit, v_total_credit
          FROM net_balances;

          RETURN jsonb_build_object(
            'rows', v_rows,
            'totalDebit', ROUND(v_total_debit, 2),
            'totalCredit', ROUND(v_total_credit, 2),
            'isBalanced', ABS(v_total_debit - v_total_credit) < 0.01,
            'difference', ROUND(ABS(v_total_debit - v_total_credit), 2)
          );
        END;
        $func$;
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION public.get_income_statement(p_start_date text DEFAULT NULL::text, p_end_date text DEFAULT NULL::text)
        RETURNS jsonb
        LANGUAGE plpgsql
        AS $func$
        DECLARE
          v_sales_rev NUMERIC(15,2) := 0;
          v_other_rev NUMERIC(15,2) := 0;
          v_total_rev NUMERIC(15,2) := 0;
          v_cogs NUMERIC(15,2) := 0;
          v_opex NUMERIC(15,2) := 0;
          v_gross_profit NUMERIC(15,2) := 0;
          v_net_profit NUMERIC(15,2) := 0;
          v_sales_arr JSONB := '[]'::jsonb;
          v_other_arr JSONB := '[]'::jsonb;
          v_all_rev_arr JSONB := '[]'::jsonb;
          v_cogs_arr JSONB := '[]'::jsonb;
          v_opex_arr JSONB := '[]'::jsonb;
          v_all_exp_arr JSONB := '[]'::jsonb;
        BEGIN
          CREATE TEMP TABLE tmp_is_acc ON COMMIT DROP AS
          WITH active_ve AS (
            SELECT ve.account_id, ve.account_code, ve.debit, ve.credit
            FROM public.voucher_entries ve
            JOIN public.financial_vouchers fv ON fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
            WHERE fv.status = 'POSTED'
              AND (p_start_date IS NULL OR p_start_date = '' OR COALESCE(ve.date, fv.date)::date >= p_start_date::date)
              AND (p_end_date IS NULL OR p_end_date = '' OR COALESCE(ve.date, fv.date)::date <= p_end_date::date)
          )
          SELECT
            c.id::text AS id,
            c.code AS code,
            c.name AS name,
            COALESCE(p.code, '') AS parent_code,
            COALESCE(p.name, '') AS parent_name,
            CASE
              WHEN UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE') OR LEFT(c.code, 1) = '4' THEN 'REVENUE'
              WHEN UPPER(COALESCE(c.account_type, '')) = 'EXPENSE' OR LEFT(c.code, 1) = '5' THEN 'EXPENSE'
              ELSE 'OTHER'
            END AS type_group,
            ROUND(
              CASE
                WHEN UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE') OR LEFT(c.code, 1) = '4'
                  THEN COALESCE(SUM(ve.credit), 0) - COALESCE(SUM(ve.debit), 0)
                ELSE COALESCE(SUM(ve.debit), 0) - COALESCE(SUM(ve.credit), 0)
              END,
              2
            ) AS balance
          FROM public.chart_of_accounts c
          LEFT JOIN public.chart_of_accounts p ON p.code = c.parent_code
          LEFT JOIN active_ve ve ON ve.account_id = c.id::text OR ve.account_code = c.code
          WHERE NOT COALESCE(c.is_deleted, false)
            AND NOT (c.code LIKE '%-00')
            AND (UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE', 'EXPENSE') OR LEFT(c.code, 1) IN ('4', '5'))
          GROUP BY c.id, c.code, c.name, p.code, p.name, c.account_type;

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_sales_rev, v_sales_arr
          FROM tmp_is_acc
          WHERE type_group = 'REVENUE' AND (code LIKE '411%' OR code LIKE '412%');

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_other_rev, v_other_arr
          FROM tmp_is_acc
          WHERE type_group = 'REVENUE' AND NOT (code LIKE '411%' OR code LIKE '412%');

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_total_rev, v_all_rev_arr
          FROM tmp_is_acc
          WHERE type_group = 'REVENUE';

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_cogs, v_cogs_arr
          FROM tmp_is_acc
          WHERE type_group = 'EXPENSE' AND code LIKE '51%';

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_opex, v_opex_arr
          FROM tmp_is_acc
          WHERE type_group = 'EXPENSE' AND NOT (code LIKE '51%');

          SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_all_exp_arr
          FROM tmp_is_acc
          WHERE type_group = 'EXPENSE';

          v_gross_profit := ROUND(v_total_rev - v_cogs, 2);
          v_net_profit := ROUND(v_gross_profit - v_opex, 2);

          RETURN jsonb_build_object(
            'revenue', jsonb_build_object(
              'categories', jsonb_build_object(
                'sales', jsonb_build_object('accounts', v_sales_arr, 'total', ROUND(v_sales_rev, 2)),
                'otherIncome', jsonb_build_object('accounts', v_other_arr, 'total', ROUND(v_other_rev, 2))
              ),
              'accounts', v_all_rev_arr,
              'total', ROUND(v_total_rev, 2)
            ),
            'cogs', jsonb_build_object('accounts', v_cogs_arr, 'total', ROUND(v_cogs, 2)),
            'grossProfit', v_gross_profit,
            'operatingExpenses', jsonb_build_object('accounts', v_opex_arr, 'total', ROUND(v_opex, 2)),
            'expenses', jsonb_build_object('accounts', v_all_exp_arr, 'total', ROUND(v_cogs + v_opex, 2)),
            'netOperatingProfit', v_net_profit,
            'netProfit', v_net_profit
          );
        END;
        $func$;
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_as_of_date text DEFAULT NULL::text)
        RETURNS jsonb
        LANGUAGE plpgsql
        AS $func$
        DECLARE
          v_cash NUMERIC(15,2) := 0;
          v_clearing NUMERIC(15,2) := 0;
          v_receivables NUMERIC(15,2) := 0;
          v_inventory NUMERIC(15,2) := 0;
          v_fixed NUMERIC(15,2) := 0;
          v_total_assets NUMERIC(15,2) := 0;

          v_payables NUMERIC(15,2) := 0;
          v_tax NUMERIC(15,2) := 0;
          v_payroll NUMERIC(15,2) := 0;
          v_total_liab NUMERIC(15,2) := 0;

          v_capital NUMERIC(15,2) := 0;
          v_retained_acc NUMERIC(15,2) := 0;
          v_current_profit NUMERIC(15,2) := 0;
          v_total_equity NUMERIC(15,2) := 0;

          v_cash_arr JSONB := '[]'::jsonb;
          v_clearing_arr JSONB := '[]'::jsonb;
          v_rec_arr JSONB := '[]'::jsonb;
          v_inv_arr JSONB := '[]'::jsonb;
          v_fixed_arr JSONB := '[]'::jsonb;
          v_all_assets_arr JSONB := '[]'::jsonb;

          v_pay_arr JSONB := '[]'::jsonb;
          v_tax_arr JSONB := '[]'::jsonb;
          v_payroll_arr JSONB := '[]'::jsonb;
          v_all_liab_arr JSONB := '[]'::jsonb;

          v_cap_arr JSONB := '[]'::jsonb;
          v_ret_arr JSONB := '[]'::jsonb;
          v_all_eq_arr JSONB := '[]'::jsonb;
        BEGIN
          CREATE TEMP TABLE tmp_bs_acc ON COMMIT DROP AS
          WITH active_ve AS (
            SELECT ve.account_id, ve.account_code, ve.debit, ve.credit
            FROM public.voucher_entries ve
            JOIN public.financial_vouchers fv ON fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
            WHERE fv.status = 'POSTED'
              AND (p_as_of_date IS NULL OR p_as_of_date = '' OR COALESCE(ve.date, fv.date)::date <= p_as_of_date::date)
          )
          SELECT
            c.id::text AS id,
            c.code AS code,
            c.name AS name,
            COALESCE(p.code, '') AS parent_code,
            COALESCE(p.name, '') AS parent_name,
            CASE
              WHEN UPPER(COALESCE(c.account_type, '')) IN ('INCOME', 'REVENUE') THEN 'REVENUE'
              WHEN UPPER(COALESCE(c.account_type, '')) IN ('ASSET', 'LIABILITY', 'EQUITY', 'EXPENSE') THEN UPPER(c.account_type)
              WHEN LEFT(c.code, 1) = '1' THEN 'ASSET'
              WHEN LEFT(c.code, 1) = '2' THEN 'LIABILITY'
              WHEN LEFT(c.code, 1) = '3' THEN 'EQUITY'
              WHEN LEFT(c.code, 1) = '4' THEN 'REVENUE'
              ELSE 'EXPENSE'
            END AS type_group,
            ROUND(
              CASE
                WHEN LEFT(c.code, 1) IN ('1', '5') OR UPPER(COALESCE(c.account_type, '')) IN ('ASSET', 'EXPENSE')
                  THEN COALESCE(SUM(ve.debit), 0) - COALESCE(SUM(ve.credit), 0)
                ELSE COALESCE(SUM(ve.credit), 0) - COALESCE(SUM(ve.debit), 0)
              END,
              2
            ) AS balance
          FROM public.chart_of_accounts c
          LEFT JOIN public.chart_of_accounts p ON p.code = c.parent_code
          LEFT JOIN active_ve ve ON ve.account_id = c.id::text OR ve.account_code = c.code
          WHERE NOT COALESCE(c.is_deleted, false)
            AND NOT (c.code LIKE '%-00')
          GROUP BY c.id, c.code, c.name, p.code, p.name, c.account_type;

          -- ASSETS:
          -- 1. Cash & Bank (1110, 1115, 1120)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_cash, v_cash_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET' AND (code LIKE '101%' OR code LIKE '111%' OR code LIKE '1120%');

          -- 2. Clearing Accounts (1125 POS Clearing, 1128 Courier COD Clearing, 1310 Port Clearing)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_clearing, v_clearing_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET' AND (code LIKE '1125%' OR code LIKE '1128%' OR code LIKE '131%');

          -- 3. Inventory (1140 Raw Bales, 1150 Sorting WIP, 1160 Finished Goods)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_inventory, v_inv_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET' AND (code LIKE '114%' OR code LIKE '115%' OR code LIKE '116%');

          -- 4. Fixed Assets (1210 Security Deposits, 1220 Equipment, 15xx-17xx)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_fixed, v_fixed_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET' AND (code LIKE '12%' OR code LIKE '15%' OR code LIKE '16%' OR code LIKE '17%');

          -- 5. Receivables (1130 Trade Debtors, 1135 Staff Advances, 1320 VAT Refund, and any other Asset)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_receivables, v_rec_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET'
            AND NOT (code LIKE '101%' OR code LIKE '111%' OR code LIKE '1120%' OR code LIKE '1125%' OR code LIKE '1128%' OR code LIKE '131%' OR code LIKE '114%' OR code LIKE '115%' OR code LIKE '116%' OR code LIKE '12%' OR code LIKE '15%' OR code LIKE '16%' OR code LIKE '17%');

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_total_assets, v_all_assets_arr FROM tmp_bs_acc WHERE type_group = 'ASSET';

          -- LIABILITIES:
          -- 1. Trade & Logistics Payables (2110 Suppliers, 2120 Couriers/Agents, 2150 Customer Wallets)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_payables, v_pay_arr FROM tmp_bs_acc
          WHERE type_group = 'LIABILITY' AND (code LIKE '211%' OR code LIKE '212%' OR code LIKE '215%');

          -- 2. Tax Payables (2140 VAT, 2410 Corporate Tax)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_tax, v_tax_arr FROM tmp_bs_acc
          WHERE type_group = 'LIABILITY' AND (code LIKE '214%' OR code LIKE '241%');

          -- 3. Accrued Payroll, Loans & Other Payables (2310 Salaries, 2320 Gratuity, 2330 Friend Loans, etc.)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_payroll, v_payroll_arr FROM tmp_bs_acc
          WHERE type_group = 'LIABILITY'
            AND NOT (code LIKE '211%' OR code LIKE '212%' OR code LIKE '215%' OR code LIKE '214%' OR code LIKE '241%');

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_total_liab, v_all_liab_arr FROM tmp_bs_acc WHERE type_group = 'LIABILITY';

          -- EQUITY:
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_capital, v_cap_arr FROM tmp_bs_acc
          WHERE type_group = 'EQUITY' AND code LIKE '31%';

          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_retained_acc, v_ret_arr FROM tmp_bs_acc
          WHERE type_group = 'EQUITY' AND NOT (code LIKE '31%');

          SELECT COALESCE(SUM(CASE WHEN type_group = 'REVENUE' THEN balance ELSE -balance END), 0)
          INTO v_current_profit
          FROM tmp_bs_acc
          WHERE type_group IN ('REVENUE', 'EXPENSE');

          SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_all_eq_arr FROM tmp_bs_acc WHERE type_group = 'EQUITY';

          v_all_eq_arr := v_all_eq_arr || jsonb_build_array(
            jsonb_build_object(
              'id', 'retained-earnings-ytd',
              'code', 'NET-PROFIT-YTD',
              'name', 'Current Year Net Profit / (Loss) YTD',
              'parentCode', '3200-00',
              'parentName', 'Retained Earnings / Prior Years Profit',
              'subType', 'System Computed',
              'balance', ROUND(v_current_profit, 2)
            )
          );

          v_total_equity := ROUND(v_capital + v_retained_acc + v_current_profit, 2);

          RETURN jsonb_build_object(
            'assets', jsonb_build_object(
              'categories', jsonb_build_object(
                'cashAndBank', jsonb_build_object('accounts', v_cash_arr, 'total', ROUND(v_cash, 2)),
                'clearing', jsonb_build_object('accounts', v_clearing_arr, 'total', ROUND(v_clearing, 2)),
                'receivables', jsonb_build_object('accounts', v_rec_arr, 'total', ROUND(v_receivables, 2)),
                'inventory', jsonb_build_object('accounts', v_inv_arr, 'total', ROUND(v_inventory, 2)),
                'fixedAssets', jsonb_build_object('accounts', v_fixed_arr, 'total', ROUND(v_fixed, 2))
              ),
              'accounts', v_all_assets_arr,
              'total', ROUND(v_total_assets, 2)
            ),
            'liabilities', jsonb_build_object(
              'categories', jsonb_build_object(
                'payables', jsonb_build_object('accounts', v_pay_arr, 'total', ROUND(v_payables, 2)),
                'taxPayables', jsonb_build_object('accounts', v_tax_arr, 'total', ROUND(v_tax, 2)),
                'accruedPayroll', jsonb_build_object('accounts', v_payroll_arr, 'total', ROUND(v_payroll, 2))
              ),
              'accounts', v_all_liab_arr,
              'total', ROUND(v_total_liab, 2)
            ),
            'equity', jsonb_build_object(
              'categories', jsonb_build_object(
                'capital', jsonb_build_object('accounts', v_cap_arr, 'total', ROUND(v_capital, 2)),
                'retainedEarnings', jsonb_build_object('accounts', v_ret_arr, 'total', ROUND(v_retained_acc, 2)),
                'currentNetProfit', jsonb_build_object('balance', ROUND(v_current_profit, 2))
              ),
              'accounts', v_all_eq_arr,
              'total', v_total_equity
            ),
            'retainedEarnings', ROUND(v_retained_acc + v_current_profit, 2),
            'totalAssets', ROUND(v_total_assets, 2),
            'totalLiabilities', ROUND(v_total_liab, 2),
            'totalEquity', v_total_equity,
            'totalLiabilitiesAndEquity', ROUND(v_total_liab + v_total_equity, 2),
            'balanced', ABS(v_total_assets - (v_total_liab + v_total_equity)) < 0.01,
            'difference', ROUND(ABS(v_total_assets - (v_total_liab + v_total_equity)), 2)
          );
        END;
        $func$;
      `);

      // 10. Execute full sync right now
      await client.query(`SELECT public.sync_coa_current_balances();`);
      hasSyncedInProcess = true;
    } catch (err: any) {
      console.warn('[coaSqlEngineSync] Sync warning:', err?.message || err);
    } finally {
      syncPromise = null;
    }
  })();

  await syncPromise;
}
