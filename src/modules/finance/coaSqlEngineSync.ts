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

      // 1b. Dynamically migrate any legacy 1120-01 ("Cash in Bank") postings to the active 1120-* bank account and purge 1120-01
      await client.query(`
        DO $$
        DECLARE
          v_bank RECORD;
          v_coa_bank_id TEXT;
        BEGIN
          SELECT id::text AS id, code, name INTO v_bank
          FROM public.chart_of_accounts
          WHERE (parent_code = '1120-00' OR code LIKE '1120-%')
            AND code NOT LIKE '%-00'
            AND code != '1120-01'
            AND COALESCE(is_deleted, false) = false
          ORDER BY CASE WHEN name ILIKE '%rakbank%' THEN 0 ELSE 1 END, code ASC
          LIMIT 1;

          IF v_bank.code IS NOT NULL THEN
            SELECT id INTO v_coa_bank_id FROM public.coa_accounts WHERE code = v_bank.code LIMIT 1;

            UPDATE public.voucher_entries
            SET account_id = v_bank.id, account_code = v_bank.code, account_name = v_bank.name
            WHERE account_code = '1120-01' OR account_name ILIKE 'Cash in Bank%';

            UPDATE public.general_ledger
            SET account_id = v_bank.id, account_code = v_bank.code, account_name = v_bank.name
            WHERE account_code = '1120-01' OR account_name ILIKE 'Cash in Bank%';

            IF v_coa_bank_id IS NOT NULL THEN
              UPDATE public.ledgers
              SET account_id = v_coa_bank_id, account_code = v_bank.code, account_name = v_bank.name
              WHERE account_code = '1120-01' OR account_name ILIKE 'Cash in Bank%';
            END IF;

            UPDATE public.journal_entries je
            SET account_id = v_bank.id::uuid
            FROM public.chart_of_accounts old_c
            WHERE old_c.code = '1120-01' AND je.account_id = old_c.id;

            UPDATE public.employee_loans
            SET disbursement_account = v_bank.code
            WHERE disbursement_account = '1120-01';

            DELETE FROM public.ledgers WHERE account_code = '1120-01';
            DELETE FROM public.coa_accounts WHERE code = '1120-01';
            DELETE FROM public.accounts WHERE account_code = '1120-01';
            DELETE FROM public.chart_of_accounts WHERE code = '1120-01';
          END IF;
        END $$;
      `).catch(() => {});

      // 2. Ensure Tier-2 Sub-Folders 2330-00 (Loans & Advances Payable) & 1320-00 (Tax & Statutory Refunds Receivable) exist
      await client.query(`
        INSERT INTO public.chart_of_accounts (id, code, name, account_type, parent_code, current_balance, is_deleted, created_at)
        SELECT gen_random_uuid(), '2330-00', 'Loans & Advances Payable (Short-Term / Friend Loans)', 'LIABILITY', '2000-00', 0, false, NOW()
        WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = '2330-00');

        INSERT INTO public.chart_of_accounts (id, code, name, account_type, parent_code, current_balance, is_deleted, created_at)
        SELECT gen_random_uuid(), '1320-00', 'Tax & Statutory Refunds Receivable', 'ASSET', '1000-00', 0, false, NOW()
        WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE code = '1320-00');
      `).catch(() => {});

      // 2b. Ensure canonical account_type and parent_code hierarchy on all COA accounts
      await client.query(`
        UPDATE public.chart_of_accounts
        SET account_type = CASE
          WHEN LEFT(code, 1) = '1' THEN 'ASSET'
          WHEN LEFT(code, 1) = '2' THEN 'LIABILITY'
          WHEN LEFT(code, 1) = '3' THEN 'EQUITY'
          WHEN LEFT(code, 1) = '4' THEN 'INCOME'
          WHEN LEFT(code, 1) = '5' THEN 'EXPENSE'
          ELSE account_type
        END
        WHERE LEFT(code, 1) IN ('1', '2', '3', '4', '5')
          AND UPPER(COALESCE(account_type, '')) NOT IN (
            CASE
              WHEN LEFT(code, 1) = '1' THEN 'ASSET'
              WHEN LEFT(code, 1) = '2' THEN 'LIABILITY'
              WHEN LEFT(code, 1) = '3' THEN 'EQUITY'
              WHEN LEFT(code, 1) = '4' THEN 'INCOME'
              ELSE 'EXPENSE'
            END,
            CASE WHEN LEFT(code, 1) = '4' THEN 'REVENUE' ELSE '__NONE__' END
          );

        UPDATE public.chart_of_accounts
        SET parent_code = '2330-00',
            parent_id = (SELECT id FROM public.chart_of_accounts WHERE code = '2330-00' LIMIT 1)
        WHERE code LIKE '2330-%' AND code != '2330-00' AND COALESCE(parent_code, '') != '2330-00';

        UPDATE public.chart_of_accounts
        SET parent_code = '1320-00',
            parent_id = (SELECT id FROM public.chart_of_accounts WHERE code = '1320-00' LIMIT 1)
        WHERE code LIKE '1320-%' AND code != '1320-00' AND COALESCE(parent_code, '') != '1320-00';

        UPDATE public.chart_of_accounts
        SET parent_code = '5120-00',
            parent_id = (SELECT id FROM public.chart_of_accounts WHERE code = '5120-00' LIMIT 1)
        WHERE code IN ('5140-01', '5150-01') AND COALESCE(parent_code, '') != '5120-00';

        UPDATE public.chart_of_accounts
        SET parent_code = CASE
          WHEN code IN ('1000-00', '2000-00', '3000-00', '4000-00', '5000-00') THEN NULL
          WHEN code LIKE '1%-00' THEN '1000-00'
          WHEN code LIKE '2%-00' THEN '2000-00'
          WHEN code LIKE '3%-00' THEN '3000-00'
          WHEN code LIKE '4%-00' THEN '4000-00'
          WHEN code LIKE '5%-00' THEN '5000-00'
          WHEN code = '1110-01' THEN '1110-00'
          WHEN code LIKE '1120-%' AND code != '1120-00' THEN '1120-00'
          WHEN code = '1140-01' THEN '1140-00'
          WHEN code = '1150-01' THEN '1150-00'
          WHEN code = '1160-01' THEN '1160-00'
          WHEN code = '1320-01' THEN '1320-00'
          WHEN code = '2330-01' THEN '2330-00'
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

      // 5b. Repair any JV-SORT-% voucher_entries where duplicate 1160-01 debit lines were inserted instead of 1150-01 credit
      await client.query(`
        WITH dup_sort_lines AS (
          SELECT
            ve.id,
            ve.voucher_id,
            ve.voucher_no,
            ve.debit,
            ROW_NUMBER() OVER (PARTITION BY ve.voucher_id ORDER BY ve.created_at ASC, ve.id ASC) AS rn,
            COUNT(*) OVER (PARTITION BY ve.voucher_id) AS cnt,
            SUM(ve.credit) OVER (PARTITION BY ve.voucher_id) AS total_cr
          FROM public.voucher_entries ve
          WHERE ve.voucher_no LIKE 'JV-SORT-%'
            AND ve.account_code = '1160-01'
            AND COALESCE(ve.debit, 0) > 0
        )
        UPDATE public.voucher_entries ve
        SET
          account_code = '1150-01',
          account_name = 'WIP (Work in Progress)',
          account_id = (SELECT id::text FROM public.chart_of_accounts WHERE code = '1150-01' LIMIT 1),
          credit = dup.debit,
          debit = 0,
          particulars = REPLACE(COALESCE(ve.particulars, ''), 'Sorted Piece Capitalized to Finished Goods', 'WIP Consumed for Sorted Piece'),
          narration = REPLACE(COALESCE(ve.narration, ''), 'Sorted Piece Capitalized to Finished Goods', 'WIP Consumed for Sorted Piece')
        FROM dup_sort_lines dup
        WHERE ve.id = dup.id
          AND dup.cnt = 2
          AND dup.total_cr = 0
          AND dup.rn = 2;
      `).catch(() => {});

      // 5c. Heal any non-UUID account_id (e.g. 'acc-wip-sorting', 'acc-fg-sorted', 'acc-wip') to real chart_of_accounts UUIDs
      // and backfill missing journal_entries so 100% of vouchers connect to COA statements & drilldown!
      await client.query(`
        UPDATE public.voucher_entries ve
        SET account_id = c.id::text,
            account_name = c.name
        FROM public.chart_of_accounts c
        WHERE ve.account_code = c.code
          AND (ve.account_id IS NULL OR ve.account_id != c.id::text);

        UPDATE public.general_ledger gl
        SET account_id = c.id::text,
            account_name = c.name
        FROM public.chart_of_accounts c
        WHERE gl.account_code = c.code
          AND (gl.account_id IS NULL OR gl.account_id != c.id::text);

        INSERT INTO public.journal_entries (id, voucher_id, account_id, debit, credit, description)
        SELECT
          gen_random_uuid(),
          fv.id,
          c.id,
          COALESCE(ve.debit, 0),
          COALESCE(ve.credit, 0),
          COALESCE(ve.memo, ve.narration, fv.narration, '')
        FROM public.voucher_entries ve
        JOIN public.financial_vouchers fv ON fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
        JOIN public.chart_of_accounts c ON c.code = ve.account_code
        WHERE fv.status = 'POSTED'
          AND NOT EXISTS (
            SELECT 1 FROM public.journal_entries je
            WHERE je.voucher_id::text = fv.id::text AND je.account_id = c.id
          );
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
          v_staff_rec NUMERIC(15,2) := 0;
          v_inventory NUMERIC(15,2) := 0;
          v_fixed NUMERIC(15,2) := 0;
          v_total_assets NUMERIC(15,2) := 0;

          v_payables NUMERIC(15,2) := 0;
          v_tax NUMERIC(15,2) := 0;
          v_payroll NUMERIC(15,2) := 0;
          v_loans NUMERIC(15,2) := 0;
          v_total_liab NUMERIC(15,2) := 0;

          v_capital NUMERIC(15,2) := 0;
          v_retained_acc NUMERIC(15,2) := 0;
          v_current_profit NUMERIC(15,2) := 0;
          v_total_equity NUMERIC(15,2) := 0;

          v_cash_arr JSONB := '[]'::jsonb;
          v_clearing_arr JSONB := '[]'::jsonb;
          v_rec_arr JSONB := '[]'::jsonb;
          v_staff_rec_arr JSONB := '[]'::jsonb;
          v_inv_arr JSONB := '[]'::jsonb;
          v_fixed_arr JSONB := '[]'::jsonb;
          v_all_assets_arr JSONB := '[]'::jsonb;

          v_pay_arr JSONB := '[]'::jsonb;
          v_tax_arr JSONB := '[]'::jsonb;
          v_payroll_arr JSONB := '[]'::jsonb;
          v_loans_arr JSONB := '[]'::jsonb;
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

          -- 5. Staff Advances & Loan Receivables (1135)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_staff_rec, v_staff_rec_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET' AND code LIKE '1135%';

          -- 6. Trade & Statutory Receivables (1130 Trade Debtors, 1320 VAT Refund, and any other Asset)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_receivables, v_rec_arr FROM tmp_bs_acc
          WHERE type_group = 'ASSET'
            AND NOT (code LIKE '101%' OR code LIKE '111%' OR code LIKE '1120%' OR code LIKE '1125%' OR code LIKE '1128%' OR code LIKE '131%' OR code LIKE '1135%' OR code LIKE '114%' OR code LIKE '115%' OR code LIKE '116%' OR code LIKE '12%' OR code LIKE '15%' OR code LIKE '16%' OR code LIKE '17%');

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

          -- 3. Accrued Payroll & Staff Benefits (2310 Salaries, 2320 Gratuity)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_payroll, v_payroll_arr FROM tmp_bs_acc
          WHERE type_group = 'LIABILITY' AND (code LIKE '231%' OR code LIKE '232%');

          -- 4. Short-Term & Friend Loans / Other Payables (2330 Loans, etc.)
          SELECT COALESCE(SUM(balance), 0), COALESCE(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'parentCode', parent_code, 'parentName', parent_name, 'subType', '', 'balance', balance) ORDER BY code), '[]'::jsonb)
          INTO v_loans, v_loans_arr FROM tmp_bs_acc
          WHERE type_group = 'LIABILITY'
            AND NOT (code LIKE '211%' OR code LIKE '212%' OR code LIKE '215%' OR code LIKE '214%' OR code LIKE '241%' OR code LIKE '231%' OR code LIKE '232%');

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
                'staffReceivables', jsonb_build_object('accounts', v_staff_rec_arr, 'total', ROUND(v_staff_rec, 2)),
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
                'accruedPayroll', jsonb_build_object('accounts', v_payroll_arr, 'total', ROUND(v_payroll, 2)),
                'loansPayable', jsonb_build_object('accounts', v_loans_arr, 'total', ROUND(v_loans, 2))
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

      // 9b. Upgrade HR Payroll Post & Unpost RPCs (real UUID + journal_entries + live COA balance sync)
      await client.query(`
        CREATE OR REPLACE FUNCTION public.post_payroll_batch_and_post_jv(p_month_year text, p_posted_by text DEFAULT 'Finance & HR Controller'::text)
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $func$
        DECLARE
          v_sheet RECORD;
          v_chart_exp RECORD;
          v_chart_pay RECORD;
          v_chart_ded RECORD;
          v_exp_acc RECORD;
          v_pay_acc RECORD;
          v_ded_acc RECORD;
          v_ledger_exp_id VARCHAR(255);
          v_ledger_pay_id VARCHAR(255);
          v_ledger_ded_id VARCHAR(255);
          v_total_gross NUMERIC(12, 2) := 0;
          v_total_deductions NUMERIC(12, 2) := 0;
          v_total_net NUMERIC(12, 2) := 0;
          v_emp_count INT := 0;
          v_voucher_uuid UUID := gen_random_uuid();
          v_voucher_id VARCHAR(255);
          v_voucher_no VARCHAR(255);
          v_voucher_date DATE;
          v_now TIMESTAMPTZ := NOW();
          v_existing_voucher RECORD;
        BEGIN
          IF p_month_year IS NULL OR TRIM(p_month_year) = '' THEN
            RAISE EXCEPTION 'Month-year parameter is required (e.g. 2026-11)';
          END IF;

          v_voucher_no := 'JV-PAY-' || p_month_year;
          v_voucher_id := v_voucher_uuid::text;

          IF p_month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM') THEN
            v_voucher_date := CURRENT_DATE;
          ELSE
            BEGIN
              v_voucher_date := (TO_DATE(p_month_year || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date;
            EXCEPTION WHEN OTHERS THEN
              v_voucher_date := CURRENT_DATE;
            END;
          END IF;

          SELECT * INTO v_sheet FROM public.hr_payroll_sheets WHERE month_year = p_month_year;
          SELECT * INTO v_existing_voucher FROM public.financial_vouchers WHERE voucher_no = v_voucher_no AND status = 'POSTED' LIMIT 1;

          IF (v_sheet.status = 'POSTED' AND v_sheet.voucher_id IS NOT NULL) OR v_existing_voucher.id IS NOT NULL THEN
            RAISE EXCEPTION 'Payroll for month % is already posted with voucher %. Unpost first before regenerating.',
              p_month_year, COALESCE(v_sheet.voucher_no, v_existing_voucher.voucher_no);
          END IF;

          SELECT
            COALESCE(SUM(gross_pay), 0)::numeric(12, 2),
            COALESCE(SUM(total_deductions), 0)::numeric(12, 2),
            COALESCE(SUM(net_pay), 0)::numeric(12, 2),
            COUNT(*)::int
          INTO v_total_gross, v_total_deductions, v_total_net, v_emp_count
          FROM public.employee_payroll
          WHERE month_year = p_month_year;

          IF (v_total_gross <= 0 OR v_emp_count = 0) AND v_sheet.total_gross IS NOT NULL AND v_sheet.total_gross > 0 THEN
            v_total_gross := v_sheet.total_gross;
            v_total_deductions := COALESCE(v_sheet.total_deductions, 0);
            v_total_net := COALESCE(v_sheet.total_net, v_total_gross - v_total_deductions);
            v_emp_count := COALESCE(v_sheet.total_employees, 1);
          END IF;

          IF v_total_gross <= 0 THEN
            RAISE EXCEPTION 'No payroll records or gross amount found for month %', p_month_year;
          END IF;

          IF ABS((v_total_net + v_total_deductions) - v_total_gross) > 0.02 THEN
            RAISE EXCEPTION 'Double-entry balance check failed for payroll %: Gross (%) != Net (%) + Deductions (%)',
              p_month_year, v_total_gross, v_total_net, v_total_deductions;
          END IF;

          SELECT id, code, name INTO v_chart_exp FROM public.chart_of_accounts WHERE code = '5210-100' LIMIT 1;
          IF v_chart_exp.id IS NULL THEN
            SELECT id, code, name INTO v_chart_exp FROM public.chart_of_accounts WHERE code = '5210-01' LIMIT 1;
          END IF;
          IF v_chart_exp.id IS NULL THEN
            RAISE EXCEPTION 'Account code 5210-100 / 5210-01 not found in Chart of Accounts.';
          END IF;

          SELECT id, code, name INTO v_chart_pay FROM public.chart_of_accounts WHERE code = '2310-01' LIMIT 1;
          IF v_chart_pay.id IS NULL THEN
            RAISE EXCEPTION 'Account code 2310-01 not found in Chart of Accounts.';
          END IF;

          IF v_total_deductions > 0 THEN
            SELECT id, code, name INTO v_chart_ded FROM public.chart_of_accounts WHERE code = '1135-01' LIMIT 1;
            IF v_chart_ded.id IS NULL THEN
              RAISE EXCEPTION 'Account code 1135-01 not found in Chart of Accounts.';
            END IF;
          END IF;

          SELECT id, code, name INTO v_exp_acc FROM public.coa_accounts WHERE code = v_chart_exp.code LIMIT 1;
          v_ledger_exp_id := COALESCE(v_exp_acc.id, v_chart_exp.id::text);

          SELECT id, code, name INTO v_pay_acc FROM public.coa_accounts WHERE code = v_chart_pay.code LIMIT 1;
          v_ledger_pay_id := COALESCE(v_pay_acc.id, v_chart_pay.id::text);

          IF v_total_deductions > 0 THEN
            SELECT id, code, name INTO v_ded_acc FROM public.coa_accounts WHERE code = v_chart_ded.code LIMIT 1;
            v_ledger_ded_id := COALESCE(v_ded_acc.id, v_chart_ded.id::text);
          END IF;

          DELETE FROM public.journal_entries WHERE voucher_id::text IN (SELECT id::text FROM public.financial_vouchers WHERE voucher_no = v_voucher_no);
          DELETE FROM public.voucher_entries WHERE voucher_no = v_voucher_no OR voucher_id = 'vch-pay-' || p_month_year;
          DELETE FROM public.general_ledger WHERE voucher_no = v_voucher_no OR voucher_id = 'vch-pay-' || p_month_year;
          DELETE FROM public.ledgers WHERE voucher_no = v_voucher_no OR voucher_id = 'vch-pay-' || p_month_year;
          DELETE FROM public.financial_vouchers WHERE voucher_no = v_voucher_no OR id::text = 'vch-pay-' || p_month_year;
          DELETE FROM public.vouchers WHERE voucher_no = v_voucher_no OR id::text = 'vch-pay-' || p_month_year;

          INSERT INTO public.vouchers (
            id, voucher_no, date, voucher_date, type, voucher_type,
            reference, reference_no, narration,
            total_debit, total_credit, total_amount,
            currency, exchange_rate, base_currency, foreign_total_amount,
            status, created_by, is_auto, created_at
          ) VALUES (
            v_voucher_id, v_voucher_no, v_voucher_date, v_voucher_date, 'JV', 'JV',
            'PAY-' || p_month_year, 'PAY-' || p_month_year,
            'Monthly payroll salary accrual for ' || p_month_year || ' (' || v_emp_count || ' staff) - Gross: AED ' || v_total_gross || ', Deductions: AED ' || v_total_deductions || ', Net Salaries Payable: AED ' || v_total_net,
            v_total_gross, v_total_gross, v_total_gross,
            'AED', 1.0, 'AED', v_total_gross,
            'POSTED', p_posted_by, true, v_now
          );

          INSERT INTO public.financial_vouchers (
            id, voucher_no, voucher_type, type, voucher_date, date,
            reference_no, reference, narration,
            total_amount, total_debit, total_credit,
            status, is_auto, currency, exchange_rate, base_currency, foreign_total_amount,
            created_by, created_at
          ) VALUES (
            v_voucher_id, v_voucher_no, 'JV', 'JV', v_voucher_date, v_voucher_date,
            'PAY-' || p_month_year, 'PAY-' || p_month_year,
            'Monthly payroll salary accrual for ' || p_month_year || ' (' || v_emp_count || ' staff) - Gross: AED ' || v_total_gross || ', Deductions: AED ' || v_total_deductions || ', Net Salaries Payable: AED ' || v_total_net,
            v_total_gross, v_total_gross, v_total_gross,
            'POSTED', true, 'AED', 1.0, 'AED', v_total_gross,
            p_posted_by, v_now
          );

          -- voucher_entries
          INSERT INTO public.voucher_entries (
            id, voucher_id, voucher_no, account_id, account_code, account_name,
            debit, credit, particulars, memo, narration, date, created_at,
            currency, exchange_rate, foreign_debit, foreign_credit
          ) VALUES (
            gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_chart_exp.id::text, v_chart_exp.code, v_chart_exp.name,
            v_total_gross, 0,
            'Staff Salaries Expense for ' || p_month_year,
            'Staff Salaries Expense for ' || p_month_year,
            'Staff Salaries Expense for ' || p_month_year,
            v_voucher_date, v_now, 'AED', 1.0, v_total_gross, 0
          );

          INSERT INTO public.journal_entries (id, voucher_id, account_id, debit, credit, description)
          VALUES (gen_random_uuid(), v_voucher_id, v_chart_exp.id, v_total_gross, 0, 'Staff Salaries Expense for ' || p_month_year);

          IF v_total_deductions > 0 THEN
            INSERT INTO public.voucher_entries (
              id, voucher_id, voucher_no, account_id, account_code, account_name,
              debit, credit, particulars, memo, narration, date, created_at,
              currency, exchange_rate, foreign_debit, foreign_credit
            ) VALUES (
              gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_chart_ded.id::text, v_chart_ded.code, v_chart_ded.name,
              0, v_total_deductions,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              v_voucher_date, v_now, 'AED', 1.0, 0, v_total_deductions
            );

            INSERT INTO public.journal_entries (id, voucher_id, account_id, debit, credit, description)
            VALUES (gen_random_uuid(), v_voucher_id, v_chart_ded.id, 0, v_total_deductions, 'Staff Loan & Advance Recoveries for ' || p_month_year);
          END IF;

          INSERT INTO public.voucher_entries (
            id, voucher_id, voucher_no, account_id, account_code, account_name,
            debit, credit, particulars, memo, narration, date, created_at,
            currency, exchange_rate, foreign_debit, foreign_credit
          ) VALUES (
            gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_chart_pay.id::text, v_chart_pay.code, v_chart_pay.name,
            0, v_total_net,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            v_voucher_date, v_now, 'AED', 1.0, 0, v_total_net
          );

          INSERT INTO public.journal_entries (id, voucher_id, account_id, debit, credit, description)
          VALUES (gen_random_uuid(), v_voucher_id, v_chart_pay.id, 0, v_total_net, 'Accrued Staff Salaries Payable for ' || p_month_year);

          -- general_ledger
          INSERT INTO public.general_ledger (
            id, entry_date, date, voucher_id, voucher_no,
            account_id, account_code, account_name,
            debit, credit, balance, description, narration,
            currency, exchange_rate, foreign_debit, foreign_credit, created_at
          ) VALUES (
            gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
            v_chart_exp.id::text, v_chart_exp.code, v_chart_exp.name,
            v_total_gross, 0, v_total_gross,
            'Staff Salaries Expense for ' || p_month_year,
            'Staff Salaries Expense for ' || p_month_year,
            'AED', 1.0, v_total_gross, 0, v_now
          );

          IF v_total_deductions > 0 THEN
            INSERT INTO public.general_ledger (
              id, entry_date, date, voucher_id, voucher_no,
              account_id, account_code, account_name,
              debit, credit, balance, description, narration,
              currency, exchange_rate, foreign_debit, foreign_credit, created_at
            ) VALUES (
              gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
              v_chart_ded.id::text, v_chart_ded.code, v_chart_ded.name,
              0, v_total_deductions, -v_total_deductions,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              'AED', 1.0, 0, v_total_deductions, v_now
            );
          END IF;

          INSERT INTO public.general_ledger (
            id, entry_date, date, voucher_id, voucher_no,
            account_id, account_code, account_name,
            debit, credit, balance, description, narration,
            currency, exchange_rate, foreign_debit, foreign_credit, created_at
          ) VALUES (
            gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
            v_chart_pay.id::text, v_chart_pay.code, v_chart_pay.name,
            0, v_total_net, -v_total_net,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            'AED', 1.0, 0, v_total_net, v_now
          );

          -- ledgers
          INSERT INTO public.ledgers (
            id, entry_date, date, voucher_id, voucher_no,
            account_id, account_code, account_name,
            debit, credit, balance, description, narration,
            currency, exchange_rate, foreign_debit, foreign_credit, created_at
          ) VALUES (
            gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
            v_ledger_exp_id, v_chart_exp.code, v_chart_exp.name,
            v_total_gross, 0, v_total_gross,
            'Staff Salaries Expense for ' || p_month_year,
            'Staff Salaries Expense for ' || p_month_year,
            'AED', 1.0, v_total_gross, 0, v_now
          );

          IF v_total_deductions > 0 THEN
            INSERT INTO public.ledgers (
              id, entry_date, date, voucher_id, voucher_no,
              account_id, account_code, account_name,
              debit, credit, balance, description, narration,
              currency, exchange_rate, foreign_debit, foreign_credit, created_at
            ) VALUES (
              gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
              v_ledger_ded_id, v_chart_ded.code, v_chart_ded.name,
              0, v_total_deductions, -v_total_deductions,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              'Staff Loan & Advance Recoveries for ' || p_month_year,
              'AED', 1.0, 0, v_total_deductions, v_now
            );
          END IF;

          INSERT INTO public.ledgers (
            id, entry_date, date, voucher_id, voucher_no,
            account_id, account_code, account_name,
            debit, credit, balance, description, narration,
            currency, exchange_rate, foreign_debit, foreign_credit, created_at
          ) VALUES (
            gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
            v_ledger_pay_id, v_chart_pay.code, v_chart_pay.name,
            0, v_total_net, -v_total_net,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            'Accrued Staff Salaries Payable for ' || p_month_year,
            'AED', 1.0, 0, v_total_net, v_now
          );

          INSERT INTO public.hr_payroll_sheets (
            id, month_year, total_employees, total_gross, total_deductions, total_net,
            status, voucher_id, voucher_no, posted_at, created_at
          ) VALUES (
            'pay-sheet-' || p_month_year, p_month_year, v_emp_count, v_total_gross, v_total_deductions, v_total_net,
            'POSTED', v_voucher_id, v_voucher_no, v_now, v_now
          )
          ON CONFLICT (id) DO UPDATE SET
            total_employees = EXCLUDED.total_employees,
            total_gross = EXCLUDED.total_gross,
            total_deductions = EXCLUDED.total_deductions,
            total_net = EXCLUDED.total_net,
            status = 'POSTED',
            voucher_id = EXCLUDED.voucher_id,
            voucher_no = EXCLUDED.voucher_no,
            posted_at = EXCLUDED.posted_at;

          UPDATE public.employee_payroll
          SET status = 'POSTED', posted_at = v_now, posted_by = p_posted_by
          WHERE month_year = p_month_year;

          UPDATE public.payroll_records
          SET voucher_id = v_voucher_id, payment_status = 'POSTED'
          WHERE payroll_month = p_month_year;

          PERFORM public.sync_coa_current_balances();

          RETURN jsonb_build_object(
            'success', true,
            'month_year', p_month_year,
            'status', 'POSTED',
            'voucher_id', v_voucher_id,
            'voucher_no', v_voucher_no,
            'total_gross', v_total_gross,
            'total_deductions', v_total_deductions,
            'total_net', v_total_net,
            'total_employees', v_emp_count
          );
        END;
        $func$;

        CREATE OR REPLACE FUNCTION public.unpost_payroll_batch_and_reverse_jv(p_month_year text)
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $func$
        DECLARE
          v_voucher_no VARCHAR(255);
          v_sheet_voucher_id VARCHAR(255);
        BEGIN
          IF p_month_year IS NULL OR TRIM(p_month_year) = '' THEN
            RAISE EXCEPTION 'Month-year parameter is required (e.g. 2026-11)';
          END IF;

          v_voucher_no := 'JV-PAY-' || p_month_year;
          SELECT voucher_id INTO v_sheet_voucher_id FROM public.hr_payroll_sheets WHERE month_year = p_month_year LIMIT 1;

          DELETE FROM public.journal_entries
          WHERE voucher_id::text = COALESCE(v_sheet_voucher_id, '')
             OR voucher_id::text = 'vch-pay-' || p_month_year
             OR voucher_id::text IN (SELECT id::text FROM public.financial_vouchers WHERE voucher_no = v_voucher_no);

          DELETE FROM public.voucher_entries WHERE voucher_no = v_voucher_no OR voucher_id = COALESCE(v_sheet_voucher_id, '') OR voucher_id = 'vch-pay-' || p_month_year;
          DELETE FROM public.general_ledger WHERE voucher_no = v_voucher_no OR voucher_id = COALESCE(v_sheet_voucher_id, '') OR voucher_id = 'vch-pay-' || p_month_year;
          DELETE FROM public.ledgers WHERE voucher_no = v_voucher_no OR voucher_id = COALESCE(v_sheet_voucher_id, '') OR voucher_id = 'vch-pay-' || p_month_year;
          DELETE FROM public.financial_vouchers WHERE voucher_no = v_voucher_no OR id::text = COALESCE(v_sheet_voucher_id, '') OR id::text = 'vch-pay-' || p_month_year;
          DELETE FROM public.vouchers WHERE voucher_no = v_voucher_no OR id::text = COALESCE(v_sheet_voucher_id, '') OR id::text = 'vch-pay-' || p_month_year;

          UPDATE public.hr_payroll_sheets
          SET status = 'DRAFT', voucher_id = NULL, voucher_no = NULL, posted_at = NULL
          WHERE month_year = p_month_year;

          UPDATE public.employee_payroll
          SET status = 'DRAFT', posted_at = NULL
          WHERE month_year = p_month_year;

          UPDATE public.payroll_records
          SET voucher_id = NULL, payment_status = 'DRAFT'
          WHERE payroll_month = p_month_year;

          PERFORM public.sync_coa_current_balances();

          RETURN jsonb_build_object(
            'success', true,
            'month_year', p_month_year,
            'status', 'DRAFT',
            'unposted', true
          );
        END;
        $func$;
      `).catch((e: any) => console.warn('[coaSqlEngineSync] Payroll RPC sync warning:', e?.message));

      // 9c. Ensure sales_channel_settings & company_profile point strictly to Tier-3 transaction COA accounts,
      // clean legacy 'Cash in Bank (AED)' narration strings, and reconcile JV-SORT-* vouchers strictly to inventory_pieces.cost_price
      await client.query(`
        UPDATE public.sales_channel_settings SET account_code = '2120-06' WHERE setting_key = 'courier_payable' AND account_code = '2120-00';
        UPDATE public.sales_channel_settings SET account_code = '1130-01' WHERE setting_key = 'pos_sales_clearing' AND account_code = '1130-05';
        UPDATE public.employees SET status = 'POSTED' WHERE emp_code = 'EMP-0283' AND status = 'DRAFT';

        UPDATE public.voucher_entries
        SET narration = REPLACE(narration, 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)'),
            memo = REPLACE(COALESCE(memo,''), 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)'),
            particulars = REPLACE(COALESCE(particulars,''), 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)')
        WHERE narration ILIKE '%Cash in Bank%' OR memo ILIKE '%Cash in Bank%' OR particulars ILIKE '%Cash in Bank%';

        UPDATE public.general_ledger
        SET narration = REPLACE(narration, 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)'),
            description = REPLACE(COALESCE(description,''), 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)')
        WHERE narration ILIKE '%Cash in Bank%' OR description ILIKE '%Cash in Bank%';

        UPDATE public.ledgers
        SET narration = REPLACE(narration, 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)'),
            description = REPLACE(COALESCE(description,''), 'Cash in Bank (AED)', 'RAKBANK - Current Account (0143656279001 - Al Ain)')
        WHERE narration ILIKE '%Cash in Bank%' OR description ILIKE '%Cash in Bank%';

        -- Purge any JV-SORT-* voucher whose SKU no longer exists in inventory_pieces
        DELETE FROM public.journal_entries WHERE voucher_id::text IN (
          SELECT fv.id::text FROM public.financial_vouchers fv
          WHERE fv.voucher_no LIKE 'JV-SORT-%'
            AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE fv.voucher_no = 'JV-SORT-' || ip.sku OR fv.reference = ip.sku)
        );
        DELETE FROM public.voucher_entries WHERE voucher_no LIKE 'JV-SORT-%'
          AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE voucher_entries.voucher_no = 'JV-SORT-' || ip.sku);
        DELETE FROM public.general_ledger WHERE voucher_no LIKE 'JV-SORT-%'
          AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE general_ledger.voucher_no = 'JV-SORT-' || ip.sku);
        DELETE FROM public.ledgers WHERE voucher_no LIKE 'JV-SORT-%'
          AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE ledgers.voucher_no = 'JV-SORT-' || ip.sku);
        DELETE FROM public.financial_vouchers fv WHERE fv.voucher_no LIKE 'JV-SORT-%'
          AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE fv.voucher_no = 'JV-SORT-' || ip.sku OR fv.reference = ip.sku);
        DELETE FROM public.vouchers v WHERE v.voucher_no LIKE 'JV-SORT-%'
          AND NOT EXISTS (SELECT 1 FROM public.inventory_pieces ip WHERE v.voucher_no = 'JV-SORT-' || ip.sku OR v.reference = ip.sku);

        -- Keep JV-SORT-* voucher amounts 100% synced to inventory_pieces.cost_price
        UPDATE public.financial_vouchers fv
        SET total_debit = ROUND(ip.cost_price::numeric, 2),
            total_credit = ROUND(ip.cost_price::numeric, 2),
            total_amount = ROUND(ip.cost_price::numeric, 2),
            foreign_total_amount = ROUND(ip.cost_price::numeric, 2)
        FROM public.inventory_pieces ip
        WHERE (fv.voucher_no = 'JV-SORT-' || ip.sku OR fv.reference = ip.sku)
          AND ABS(COALESCE(fv.total_debit, 0) - COALESCE(ip.cost_price, 0)) > 0.005;

        UPDATE public.vouchers v
        SET total_debit = ROUND(ip.cost_price::numeric, 2),
            total_credit = ROUND(ip.cost_price::numeric, 2),
            total_amount = ROUND(ip.cost_price::numeric, 2)
        FROM public.inventory_pieces ip
        WHERE (v.voucher_no = 'JV-SORT-' || ip.sku OR v.reference = ip.sku)
          AND ABS(COALESCE(v.total_debit, 0) - COALESCE(ip.cost_price, 0)) > 0.005;

        UPDATE public.voucher_entries ve
        SET debit = CASE WHEN ve.account_code = '1160-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            credit = CASE WHEN ve.account_code = '1150-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            foreign_debit = CASE WHEN ve.account_code = '1160-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            foreign_credit = CASE WHEN ve.account_code = '1150-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END
        FROM public.inventory_pieces ip
        WHERE ve.voucher_no = 'JV-SORT-' || ip.sku
          AND (
            (ve.account_code = '1160-01' AND ABS(COALESCE(ve.debit, 0) - COALESCE(ip.cost_price, 0)) > 0.005)
            OR (ve.account_code = '1150-01' AND ABS(COALESCE(ve.credit, 0) - COALESCE(ip.cost_price, 0)) > 0.005)
          );

        UPDATE public.journal_entries je
        SET debit = CASE WHEN je.debit > 0 THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            credit = CASE WHEN je.credit > 0 THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END
        FROM public.financial_vouchers fv
        JOIN public.inventory_pieces ip ON fv.voucher_no = 'JV-SORT-' || ip.sku OR fv.reference = ip.sku
        WHERE je.voucher_id::text = fv.id::text
          AND (
            (je.debit > 0 AND ABS(je.debit - COALESCE(ip.cost_price, 0)) > 0.005)
            OR (je.credit > 0 AND ABS(je.credit - COALESCE(ip.cost_price, 0)) > 0.005)
          );

        UPDATE public.general_ledger gl
        SET debit = CASE WHEN gl.account_code = '1160-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            credit = CASE WHEN gl.account_code = '1150-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            balance = CASE WHEN gl.account_code = '1160-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE -ROUND(ip.cost_price::numeric, 2) END
        FROM public.inventory_pieces ip
        WHERE gl.voucher_no = 'JV-SORT-' || ip.sku
          AND (
            (gl.account_code = '1160-01' AND ABS(COALESCE(gl.debit, 0) - COALESCE(ip.cost_price, 0)) > 0.005)
            OR (gl.account_code = '1150-01' AND ABS(COALESCE(gl.credit, 0) - COALESCE(ip.cost_price, 0)) > 0.005)
          );

        UPDATE public.ledgers l
        SET debit = CASE WHEN l.account_code = '1160-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            credit = CASE WHEN l.account_code = '1150-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE 0 END,
            balance = CASE WHEN l.account_code = '1160-01' THEN ROUND(ip.cost_price::numeric, 2) ELSE -ROUND(ip.cost_price::numeric, 2) END
        FROM public.inventory_pieces ip
        WHERE l.voucher_no = 'JV-SORT-' || ip.sku
          AND (
            (l.account_code = '1160-01' AND ABS(COALESCE(l.debit, 0) - COALESCE(ip.cost_price, 0)) > 0.005)
            OR (l.account_code = '1150-01' AND ABS(COALESCE(l.credit, 0) - COALESCE(ip.cost_price, 0)) > 0.005)
          );
      `).catch(() => {});

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
