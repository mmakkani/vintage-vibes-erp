const path = require('path');
const rootDir = 'C:\\vintage-vibe';
const { Client } = require(path.join(rootDir, 'node_modules', 'pg'));
require(path.join(rootDir, 'node_modules', 'dotenv')).config({ path: path.join(rootDir, '.env') });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to PostgreSQL for Finance Engine migration...');

  // 1. Live COA Balances View
  console.log('Creating view_coa_live_balances...');
  await client.query(`
    CREATE OR REPLACE VIEW view_coa_live_balances AS
    WITH posted_entries AS (
      SELECT 
        ve.account_id,
        ve.account_code,
        ve.debit,
        ve.credit
      FROM voucher_entries ve
      INNER JOIN (
        SELECT id, voucher_no, status FROM vouchers WHERE status = 'POSTED'
        UNION
        SELECT id, voucher_no, status FROM financial_vouchers WHERE status = 'POSTED'
      ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
    ),
    totals AS (
      SELECT 
        c.id as account_id,
        c.code as account_code,
        c.name as account_name,
        c.type as account_type,
        c.sub_type,
        c.tier_level,
        c.parent_id,
        c.parent_code,
        c.currency,
        c.is_active,
        COALESCE(SUM(pe.debit), 0)::numeric as total_debit,
        COALESCE(SUM(pe.credit), 0)::numeric as total_credit
      FROM coa_accounts c
      LEFT JOIN posted_entries pe ON (pe.account_id = c.id OR pe.account_code = c.code)
      GROUP BY c.id, c.code, c.name, c.type, c.sub_type, c.tier_level, c.parent_id, c.parent_code, c.currency, c.is_active
    )
    SELECT 
      account_id,
      account_code,
      account_name,
      account_type,
      account_type as classification,
      sub_type,
      tier_level,
      parent_id,
      parent_code,
      currency,
      is_active,
      total_debit,
      total_credit,
      ROUND(
        CASE 
          WHEN account_type IN ('ASSET', 'EXPENSE') THEN (total_debit - total_credit)
          ELSE (total_credit - total_debit)
        END, 2
      ) as current_balance
    FROM totals;
  `);

  // 2. Automated COA live sync function
  console.log('Creating sync_coa_current_balances function...');
  await client.query(`
    CREATE OR REPLACE FUNCTION sync_coa_current_balances()
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE coa_accounts c
      SET current_balance = v.current_balance
      FROM view_coa_live_balances v
      WHERE c.id = v.account_id OR c.code = v.account_code;
    END;
    $$;
  `);

  // Run initial sync
  await client.query(`SELECT sync_coa_current_balances();`);
  console.log('Initial COA balances synchronized!');

  // 3. Ensure all parent accounts ending in -00 or level < 3 have is_transactional = false
  console.log('Setting is_transactional = false for parent accounts in accounts table...');
  await client.query(`
    UPDATE accounts 
    SET is_transactional = false 
    WHERE account_code LIKE '%-00' OR account_level < 3;
  `);

  // Provision missing -01 transactional sub-accounts
  const missingChildren = [
    { code: '1115-01', name: 'Cash in Vault (Main Safe Reserve)', parent: '1115-00', type_id: 1, sub_type: 'Cash & Cash Equivalents' },
    { code: '1125-01', name: 'POS Terminal & Card Clearing', parent: '1125-00', type_id: 1, sub_type: 'Clearing Account' },
    { code: '1128-01', name: 'Courier COD Clearing (Pending Remittance)', parent: '1128-00', type_id: 1, sub_type: 'Clearing Account' },
    { code: '1135-01', name: 'Staff Advance & Loan Receivables', parent: '1135-00', type_id: 1, sub_type: 'Accounts Receivable' },
    { code: '1210-01', name: 'Security Deposits (Store & Warehouse Leases)', parent: '1210-00', type_id: 1, sub_type: 'Fixed & Non-Current Assets' },
    { code: '1220-01', name: 'Warehouse, Steaming & Sorting Equipment', parent: '1220-00', type_id: 1, sub_type: 'Fixed & Non-Current Assets' },
    { code: '1310-01', name: 'Goods In-Transit & Port Clearing Account', parent: '1310-00', type_id: 1, sub_type: 'Goods In-Transit' },
    { code: '2320-01', name: 'End-of-Service Gratuity & Benefits Payable', parent: '2320-00', type_id: 2, sub_type: 'Accrued Payroll' },
    { code: '2410-01', name: 'Provision for Corporate Tax (9% FTA)', parent: '2410-00', type_id: 2, sub_type: 'Tax Payable' },
    { code: '5210-01', name: 'Salaries, Wages & Labour Sorter Expense', parent: '5210-00', type_id: 5, sub_type: 'Operating Expenses' }
  ];

  for (const item of missingChildren) {
    const pAcc = await client.query('SELECT account_id, account_type_id FROM accounts WHERE account_code = $1', [item.parent]);
    const parentAccId = pAcc.rows[0]?.account_id;
    const typeId = pAcc.rows[0]?.account_type_id || item.type_id;

    const pCoa = await client.query('SELECT id, account_type FROM chart_of_accounts WHERE code = $1', [item.parent]);
    const coaParentId = pCoa.rows[0]?.id;
    const coaAccType = pCoa.rows[0]?.account_type || (item.type_id === 1 ? 'ASSET' : (item.type_id === 2 ? 'LIABILITY' : 'EXPENSE'));

    await client.query(`
      INSERT INTO accounts (account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level)
      VALUES ($1, $2, $3, $4, true, true, 3)
      ON CONFLICT (account_code) DO UPDATE 
      SET account_name = EXCLUDED.account_name, is_transactional = true, account_level = 3, parent_id = EXCLUDED.parent_id;
    `, [item.code, item.name, typeId, parentAccId]);

    await client.query(`
      INSERT INTO chart_of_accounts (code, name, account_type, parent_id, current_balance)
      VALUES ($1, $2, $3, $4, 0.00)
      ON CONFLICT (code) DO UPDATE 
      SET name = EXCLUDED.name, account_type = EXCLUDED.account_type, parent_id = EXCLUDED.parent_id;
    `, [item.code, item.name, coaAccType, coaParentId]);

    await client.query(`
      INSERT INTO coa_accounts (id, code, name, type, sub_type, currency, current_balance, is_active, parent_id, parent_code, tier_level)
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'AED', 0.00, true, $5, $6, 3)
      ON CONFLICT (code) DO UPDATE 
      SET name = EXCLUDED.name, type = EXCLUDED.type, sub_type = EXCLUDED.sub_type, is_active = true;
    `, [item.code, item.name, coaAccType, item.sub_type, coaParentId ? coaParentId.toString() : null, item.parent]);
  }

  // 4. Trial Balance View & Function (Strictly posting accounts, no -00 parent accounts)
  console.log('Creating get_trial_balance RPC...');
  await client.query(`
    CREATE OR REPLACE FUNCTION get_trial_balance(p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      v_start date := NULL;
      v_end date := NULL;
      v_rows jsonb;
      v_total_debit numeric := 0;
      v_total_credit numeric := 0;
    BEGIN
      IF p_start_date IS NOT NULL AND p_start_date != '' THEN
        v_start := p_start_date::date;
      END IF;
      IF p_end_date IS NOT NULL AND p_end_date != '' THEN
        v_end := p_end_date::date;
      END IF;

      WITH filtered_entries AS (
        SELECT 
          ve.account_id,
          ve.account_code,
          ve.debit,
          ve.credit
        FROM voucher_entries ve
        INNER JOIN (
          SELECT id::text, voucher_no, status, date FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id::text, voucher_no, status, date FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        WHERE (v_start IS NULL OR COALESCE(ve.date::date, v.date::date) >= v_start)
          AND (v_end IS NULL OR COALESCE(ve.date::date, v.date::date) <= v_end)
      ),
      acc_totals AS (
        SELECT 
          COALESCE(c.id::text, a.account_id::text) as account_id,
          a.account_code,
          a.account_name,
          UPPER(at.type_name) as classification,
          COALESCE(SUM(fe.debit), 0)::numeric as tot_debit,
          COALESCE(SUM(fe.credit), 0)::numeric as tot_credit
        FROM accounts a
        JOIN account_types at ON a.account_type_id = at.type_id
        LEFT JOIN chart_of_accounts c ON c.code = a.account_code
        LEFT JOIN filtered_entries fe ON (fe.account_code = a.account_code OR fe.account_id = a.account_id::text OR (c.id IS NOT NULL AND fe.account_id = c.id::text))
        WHERE a.is_transactional = TRUE 
          AND a.account_code NOT LIKE '%-00'
        GROUP BY c.id, a.account_id, a.account_code, a.account_name, at.type_name
      ),
      computed AS (
        SELECT 
          account_id,
          account_code,
          account_name,
          classification,
          ROUND(
            CASE 
              WHEN classification IN ('ASSET', 'EXPENSE') THEN 
                CASE WHEN (tot_debit - tot_credit) > 0 THEN (tot_debit - tot_credit) ELSE 0 END
              ELSE 
                CASE WHEN (tot_credit - tot_debit) < 0 THEN ABS(tot_credit - tot_debit) ELSE 0 END
            END, 2
          ) as debit,
          ROUND(
            CASE 
              WHEN classification IN ('ASSET', 'EXPENSE') THEN 
                CASE WHEN (tot_debit - tot_credit) < 0 THEN ABS(tot_debit - tot_credit) ELSE 0 END
              ELSE 
                CASE WHEN (tot_credit - tot_debit) > 0 THEN (tot_credit - tot_debit) ELSE 0 END
            END, 2
          ) as credit,
          ROUND(
            CASE 
              WHEN classification IN ('ASSET', 'EXPENSE') THEN (tot_debit - tot_credit)
              ELSE (tot_credit - tot_debit)
            END, 2
          ) as closing_balance
        FROM acc_totals
        ORDER BY account_code ASC
      )
      SELECT 
        COALESCE(jsonb_agg(
          jsonb_build_object(
            'accountId', account_id,
            'accountCode', account_code,
            'accountName', account_name,
            'classification', classification,
            'debit', debit,
            'credit', credit,
            'closingBalance', closing_balance
          )
        ), '[]'::jsonb),
        COALESCE(SUM(debit), 0),
        COALESCE(SUM(credit), 0)
      INTO v_rows, v_total_debit, v_total_credit
      FROM computed;

      RETURN jsonb_build_object(
        'rows', COALESCE(v_rows, '[]'::jsonb),
        'totalDebit', v_total_debit,
        'totalCredit', v_total_credit,
        'isBalanced', (ABS(v_total_debit - v_total_credit) < 0.05),
        'difference', ROUND(ABS(v_total_debit - v_total_credit), 2)
      );
    END;
    $$;
  `);

  // 5. Income Statement Function (Strictly posting accounts, no -00 parent accounts)
  console.log('Creating get_income_statement RPC...');
  await client.query(`
    CREATE OR REPLACE FUNCTION get_income_statement(p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      v_start date := NULL;
      v_end date := NULL;
      v_revenue_rows jsonb;
      v_revenue_sales_rows jsonb;
      v_revenue_other_rows jsonb;
      v_cogs_rows jsonb;
      v_operating_expense_rows jsonb;
      v_all_expense_rows jsonb;
      v_total_revenue numeric := 0;
      v_total_revenue_sales numeric := 0;
      v_total_revenue_other numeric := 0;
      v_total_cogs numeric := 0;
      v_total_operating_expenses numeric := 0;
      v_total_expenses numeric := 0;
      v_gross_profit numeric := 0;
      v_net_profit numeric := 0;
    BEGIN
      IF p_start_date IS NOT NULL AND p_start_date != '' THEN
        v_start := p_start_date::date;
      END IF;
      IF p_end_date IS NOT NULL AND p_end_date != '' THEN
        v_end := p_end_date::date;
      END IF;

      WITH filtered_entries AS (
        SELECT 
          ve.account_id,
          ve.account_code,
          ve.debit,
          ve.credit
        FROM voucher_entries ve
        INNER JOIN (
          SELECT id::text, voucher_no, status, date FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id::text, voucher_no, status, date FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        WHERE (v_start IS NULL OR COALESCE(ve.date::date, v.date::date) >= v_start)
          AND (v_end IS NULL OR COALESCE(ve.date::date, v.date::date) <= v_end)
      ),
      acc_activity AS (
        SELECT 
          COALESCE(c.id::text, a.account_id::text) as account_id,
          a.account_code,
          a.account_name,
          UPPER(at.type_name) as account_type,
          p.account_code as parent_code,
          p.account_name as parent_name,
          ROUND(
            CASE 
              WHEN UPPER(at.type_name) = 'REVENUE' THEN (COALESCE(SUM(fe.credit), 0) - COALESCE(SUM(fe.debit), 0))
              WHEN UPPER(at.type_name) = 'EXPENSE' THEN (COALESCE(SUM(fe.debit), 0) - COALESCE(SUM(fe.credit), 0))
              ELSE 0
            END, 2
          ) as net_balance
        FROM accounts a
        JOIN account_types at ON a.account_type_id = at.type_id
        LEFT JOIN accounts p ON a.parent_id = p.account_id
        LEFT JOIN chart_of_accounts c ON c.code = a.account_code
        LEFT JOIN filtered_entries fe ON (fe.account_code = a.account_code OR fe.account_id = a.account_id::text OR (c.id IS NOT NULL AND fe.account_id = c.id::text))
        WHERE a.is_transactional = TRUE 
          AND a.account_code NOT LIKE '%-00'
          AND UPPER(at.type_name) IN ('REVENUE', 'EXPENSE')
        GROUP BY c.id, a.account_id, a.account_code, a.account_name, at.type_name, p.account_code, p.account_name
      )
      SELECT 
        -- 1. All Revenue Accounts (Strictly posting, no parent -00 accounts)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'REVENUE'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'REVENUE'), 0),
        -- 1a. Sales Revenue (4110, 4120)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'REVENUE' AND account_code LIKE '41%'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'REVENUE' AND account_code LIKE '41%'), 0),
        -- 1b. Other Revenue (4200)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'REVENUE' AND NOT (account_code LIKE '41%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'REVENUE' AND NOT (account_code LIKE '41%')), 0),

        -- 2. COGS (5100, 5110, 5120, 5150)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'EXPENSE' AND account_code LIKE '51%'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'EXPENSE' AND account_code LIKE '51%'), 0),

        -- 3. Operating & Administrative Expenses (5200+, 5300+, 5400+)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'EXPENSE' AND NOT (account_code LIKE '51%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'EXPENSE' AND NOT (account_code LIKE '51%')), 0),

        -- 4. All Expenses combined
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'EXPENSE'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'EXPENSE'), 0)
      INTO 
        v_revenue_rows, v_total_revenue,
        v_revenue_sales_rows, v_total_revenue_sales,
        v_revenue_other_rows, v_total_revenue_other,
        v_cogs_rows, v_total_cogs,
        v_operating_expense_rows, v_total_operating_expenses,
        v_all_expense_rows, v_total_expenses
      FROM acc_activity;

      v_gross_profit := ROUND(v_total_revenue - v_total_cogs, 2);
      v_net_profit := ROUND(v_total_revenue - v_total_expenses, 2);

      RETURN jsonb_build_object(
        'revenue', jsonb_build_object(
          'accounts', v_revenue_rows,
          'total', v_total_revenue,
          'categories', jsonb_build_object(
            'sales', jsonb_build_object('accounts', v_revenue_sales_rows, 'total', v_total_revenue_sales),
            'otherIncome', jsonb_build_object('accounts', v_revenue_other_rows, 'total', v_total_revenue_other)
          )
        ),
        'cogs', jsonb_build_object('accounts', v_cogs_rows, 'total', v_total_cogs),
        'operatingExpenses', jsonb_build_object('accounts', v_operating_expense_rows, 'total', v_total_operating_expenses),
        'expenses', jsonb_build_object('accounts', v_all_expense_rows, 'total', v_total_expenses),
        'grossProfit', v_gross_profit,
        'netProfit', v_net_profit,
        'netOperatingProfit', v_net_profit
      );
    END;
    $$;
  `);

  // 6. Balance Sheet Function (Strictly posting accounts, no -00 parent accounts)
  console.log('Creating get_balance_sheet RPC...');
  await client.query(`
    CREATE OR REPLACE FUNCTION get_balance_sheet(p_as_of_date text DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      v_as_of date := NULL;
      v_asset_rows jsonb;
      v_total_assets numeric := 0;
      v_asset_cash_bank_rows jsonb;
      v_total_asset_cash_bank numeric := 0;
      v_asset_clearing_rows jsonb;
      v_total_asset_clearing numeric := 0;
      v_asset_receivables_rows jsonb;
      v_total_asset_receivables numeric := 0;
      v_asset_inventory_rows jsonb;
      v_total_asset_inventory numeric := 0;
      v_asset_fixed_rows jsonb;
      v_total_asset_fixed numeric := 0;

      v_liability_rows jsonb;
      v_total_liabilities numeric := 0;
      v_liab_payables_rows jsonb;
      v_total_liab_payables numeric := 0;
      v_liab_tax_rows jsonb;
      v_total_liab_tax numeric := 0;
      v_liab_accruals_rows jsonb;
      v_total_liab_accruals numeric := 0;

      v_equity_rows jsonb;
      v_total_equity numeric := 0;
      v_eq_capital_rows jsonb;
      v_total_eq_capital numeric := 0;
      v_eq_reserves_rows jsonb;
      v_total_eq_reserves numeric := 0;

      v_net_profit_ytd numeric := 0;
      v_is_balanced boolean;
    BEGIN
      IF p_as_of_date IS NOT NULL AND p_as_of_date != '' THEN
        v_as_of := p_as_of_date::date;
      END IF;

      WITH filtered_entries AS (
        SELECT 
          ve.account_id,
          ve.account_code,
          ve.debit,
          ve.credit,
          COALESCE(ve.date::date, v.date::date) as entry_date
        FROM voucher_entries ve
        INNER JOIN (
          SELECT id::text, voucher_no, status, date FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id::text, voucher_no, status, date FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        WHERE (v_as_of IS NULL OR COALESCE(ve.date::date, v.date::date) <= v_as_of)
      ),
      acc_totals AS (
        SELECT 
          COALESCE(c.id::text, a.account_id::text) as account_id,
          a.account_code,
          a.account_name,
          UPPER(at.type_name) as account_type,
          p.account_code as parent_code,
          p.account_name as parent_name,
          ROUND(
            CASE 
              WHEN UPPER(at.type_name) = 'ASSET' THEN (COALESCE(SUM(fe.debit), 0) - COALESCE(SUM(fe.credit), 0))
              ELSE (COALESCE(SUM(fe.credit), 0) - COALESCE(SUM(fe.debit), 0))
            END, 2
          ) as net_balance
        FROM accounts a
        JOIN account_types at ON a.account_type_id = at.type_id
        LEFT JOIN accounts p ON a.parent_id = p.account_id
        LEFT JOIN chart_of_accounts c ON c.code = a.account_code
        LEFT JOIN filtered_entries fe ON (fe.account_code = a.account_code OR fe.account_id = a.account_id::text OR (c.id IS NOT NULL AND fe.account_id = c.id::text))
        WHERE a.is_transactional = TRUE 
          AND a.account_code NOT LIKE '%-00'
          AND UPPER(at.type_name) IN ('ASSET', 'LIABILITY', 'EQUITY')
        GROUP BY c.id, a.account_id, a.account_code, a.account_name, at.type_name, p.account_code, p.account_name
      )
      SELECT 
        -- Net Profit YTD calculation (REVENUE credits - EXPENSE debits from posted vouchers)
        COALESCE((
          SELECT ROUND(
            COALESCE(SUM(CASE WHEN UPPER(at_inc.type_name) = 'REVENUE' THEN (fe_inc.credit - fe_inc.debit) ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN UPPER(at_inc.type_name) = 'EXPENSE' THEN (fe_inc.debit - fe_inc.credit) ELSE 0 END), 0), 2
          )
          FROM accounts a_inc
          JOIN account_types at_inc ON a_inc.account_type_id = at_inc.type_id
          LEFT JOIN chart_of_accounts c_inc ON c_inc.code = a_inc.account_code
          INNER JOIN filtered_entries fe_inc ON (fe_inc.account_code = a_inc.account_code OR fe_inc.account_id = a_inc.account_id::text OR (c_inc.id IS NOT NULL AND fe_inc.account_id = c_inc.id::text))
          WHERE a_inc.is_transactional = TRUE
            AND a_inc.account_code NOT LIKE '%-00'
            AND UPPER(at_inc.type_name) IN ('REVENUE', 'EXPENSE')
        ), 0),

        -- All Assets (Strictly posting accounts, no parent -00 accounts)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'ASSET'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'ASSET'), 0),
        -- 1. Cash & Bank (1110, 1115, 1120)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'ASSET' AND (account_code LIKE '111%' OR account_code LIKE '1120%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'ASSET' AND (account_code LIKE '111%' OR account_code LIKE '1120%')), 0),
        -- 2. Clearing Accounts (1125, 1128, 1310)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'ASSET' AND (account_code LIKE '1125%' OR account_code LIKE '1128%' OR account_code LIKE '131%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'ASSET' AND (account_code LIKE '1125%' OR account_code LIKE '1128%' OR account_code LIKE '131%')), 0),
        -- 3. Receivables (1130, 1135)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'ASSET' AND account_code LIKE '113%'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'ASSET' AND account_code LIKE '113%'), 0),
        -- 4. Inventory (1140, 1150, 1160)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'ASSET' AND (account_code LIKE '114%' OR account_code LIKE '115%' OR account_code LIKE '116%' OR account_name ILIKE '%Inventory%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'ASSET' AND (account_code LIKE '114%' OR account_code LIKE '115%' OR account_code LIKE '116%' OR account_name ILIKE '%Inventory%')), 0),
        -- 5. Fixed Assets (1210, 1220)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'ASSET' AND account_code LIKE '12%'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'ASSET' AND account_code LIKE '12%'), 0),

        -- All Liabilities
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'LIABILITY'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'LIABILITY'), 0),
        -- 1. Payables (2110, 2120)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'LIABILITY' AND (account_code LIKE '211%' OR account_code LIKE '212%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'LIABILITY' AND (account_code LIKE '211%' OR account_code LIKE '212%')), 0),
        -- 2. Tax Liabilities (2140, 2150, 2410)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'LIABILITY' AND (account_code LIKE '214%' OR account_code LIKE '215%' OR account_code LIKE '241%' OR account_name ILIKE '%VAT%' OR account_name ILIKE '%Tax%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'LIABILITY' AND (account_code LIKE '214%' OR account_code LIKE '215%' OR account_code LIKE '241%' OR account_name ILIKE '%VAT%' OR account_name ILIKE '%Tax%')), 0),
        -- 3. Accrued Payroll (2310, 2320)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'LIABILITY' AND (account_code LIKE '23%' OR account_name ILIKE '%Payroll%' OR account_name ILIKE '%Gratuity%' OR account_name ILIKE '%Salaries%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'LIABILITY' AND (account_code LIKE '23%' OR account_name ILIKE '%Payroll%' OR account_name ILIKE '%Gratuity%' OR account_name ILIKE '%Salaries%')), 0),

        -- All Equity
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'EQUITY'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'EQUITY'), 0),
        -- 1. Capital (3100, 3300)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'EQUITY' AND (account_code LIKE '31%' OR account_code LIKE '33%')), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'EQUITY' AND (account_code LIKE '31%' OR account_code LIKE '33%')), 0),
        -- 2. Reserves (3200)
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', '', 'balance', net_balance, 'parentCode', parent_code, 'parentName', parent_name) ORDER BY account_code) FILTER (WHERE account_type = 'EQUITY' AND account_code LIKE '32%'), '[]'::jsonb),
        COALESCE(SUM(net_balance) FILTER (WHERE account_type = 'EQUITY' AND account_code LIKE '32%'), 0)
      INTO 
        v_net_profit_ytd,
        v_asset_rows, v_total_assets,
        v_asset_cash_bank_rows, v_total_asset_cash_bank,
        v_asset_clearing_rows, v_total_asset_clearing,
        v_asset_receivables_rows, v_total_asset_receivables,
        v_asset_inventory_rows, v_total_asset_inventory,
        v_asset_fixed_rows, v_total_asset_fixed,

        v_liability_rows, v_total_liabilities,
        v_liab_payables_rows, v_total_liab_payables,
        v_liab_tax_rows, v_total_liab_tax,
        v_liab_accruals_rows, v_total_liab_accruals,

        v_equity_rows, v_total_equity,
        v_eq_capital_rows, v_total_eq_capital,
        v_eq_reserves_rows, v_total_eq_reserves
      FROM acc_totals;

      -- Add dynamic Retained Earnings / Current Net Profit row to Equity
      v_equity_rows := v_equity_rows || jsonb_build_array(
        jsonb_build_object(
          'id', 'acc-retained-earnings-ytd',
          'code', 'NET-PROFIT-YTD',
          'name', 'Current Year Net Profit / (Loss) YTD',
          'subType', 'Profit & Loss',
          'balance', v_net_profit_ytd
        )
      );
      v_total_equity := ROUND(v_total_equity + v_net_profit_ytd, 2);
      v_is_balanced := (ABS(v_total_assets - (v_total_liabilities + v_total_equity)) < 0.05);

      RETURN jsonb_build_object(
        'assets', jsonb_build_object(
          'accounts', v_asset_rows,
          'total', v_total_assets,
          'categories', jsonb_build_object(
            'cashAndBank', jsonb_build_object('accounts', v_asset_cash_bank_rows, 'total', v_total_asset_cash_bank),
            'clearing', jsonb_build_object('accounts', v_asset_clearing_rows, 'total', v_total_asset_clearing),
            'receivables', jsonb_build_object('accounts', v_asset_receivables_rows, 'total', v_total_asset_receivables),
            'inventory', jsonb_build_object('accounts', v_asset_inventory_rows, 'total', v_total_asset_inventory),
            'fixedAssets', jsonb_build_object('accounts', v_asset_fixed_rows, 'total', v_total_asset_fixed)
          )
        ),
        'liabilities', jsonb_build_object(
          'accounts', v_liability_rows,
          'total', v_total_liabilities,
          'categories', jsonb_build_object(
            'payables', jsonb_build_object('accounts', v_liab_payables_rows, 'total', v_total_liab_payables),
            'taxPayables', jsonb_build_object('accounts', v_liab_tax_rows, 'total', v_total_liab_tax),
            'accruedPayroll', jsonb_build_object('accounts', v_liab_accruals_rows, 'total', v_total_liab_accruals)
          )
        ),
        'equity', jsonb_build_object(
          'accounts', v_equity_rows,
          'total', v_total_equity,
          'categories', jsonb_build_object(
            'capital', jsonb_build_object('accounts', v_eq_capital_rows, 'total', v_total_eq_capital),
            'retainedEarnings', jsonb_build_object('accounts', v_eq_reserves_rows, 'total', v_total_eq_reserves),
            'currentNetProfit', jsonb_build_object('balance', v_net_profit_ytd)
          )
        ),
        'retainedEarnings', v_net_profit_ytd,
        'totalAssets', v_total_assets,
        'totalLiabilities', v_total_liabilities,
        'totalEquity', v_total_equity,
        'totalLiabilitiesAndEquity', ROUND(v_total_liabilities + v_total_equity, 2),
        'balanced', v_is_balanced,
        'difference', ROUND(ABS(v_total_assets - (v_total_liabilities + v_total_equity)), 2)
      );
    END;
    $$;
  `);

  // 6. General Ledger Entries Function
  console.log('Creating get_general_ledger_entries RPC...');
  await client.query(`
    CREATE OR REPLACE FUNCTION get_general_ledger_entries(
      p_account_id text DEFAULT NULL,
      p_party_id text DEFAULT NULL,
      p_start_date text DEFAULT NULL,
      p_end_date text DEFAULT NULL,
      p_search text DEFAULT NULL
    )
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      v_start date := NULL;
      v_end date := NULL;
      v_entries jsonb;
      v_total_debit numeric := 0;
      v_total_credit numeric := 0;
    BEGIN
      IF p_start_date IS NOT NULL AND p_start_date != '' THEN
        v_start := p_start_date::date;
      END IF;
      IF p_end_date IS NOT NULL AND p_end_date != '' THEN
        v_end := p_end_date::date;
      END IF;

      WITH gl_rows AS (
        SELECT 
          ve.id,
          ve.voucher_id,
          ve.voucher_no,
          COALESCE(ve.account_id, c.id) as account_id,
          COALESCE(ve.account_code, c.code) as account_code,
          COALESCE(ve.account_name, c.name) as account_name,
          ve.party_id,
          ve.party_name,
          COALESCE(ve.date, v.date) as date,
          COALESCE(ve.debit, 0)::numeric as debit,
          COALESCE(ve.credit, 0)::numeric as credit,
          COALESCE(v.reference, '') as document_ref,
          COALESCE(ve.particulars, ve.memo, ve.narration, v.narration, '') as narration,
          c.type as account_type
        FROM voucher_entries ve
        INNER JOIN (
          SELECT id, voucher_no, status, date, narration, reference FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id, voucher_no, status, date, narration, reference FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        LEFT JOIN coa_accounts c ON (c.id = ve.account_id OR c.code = ve.account_code)
        WHERE (p_account_id IS NULL OR p_account_id = 'ALL' OR c.id = p_account_id OR c.code = p_account_id OR ve.account_id = p_account_id OR ve.account_code = p_account_id)
          AND (p_party_id IS NULL OR ve.party_id = p_party_id)
          AND (v_start IS NULL OR COALESCE(ve.date, v.date) >= v_start)
          AND (v_end IS NULL OR COALESCE(ve.date, v.date) <= v_end)
          AND (p_search IS NULL OR p_search = '' OR (
            ve.voucher_no ILIKE '%' || p_search || '%' OR
            c.name ILIKE '%' || p_search || '%' OR
            c.code ILIKE '%' || p_search || '%' OR
            ve.particulars ILIKE '%' || p_search || '%' OR
            ve.narration ILIKE '%' || p_search || '%'
          ))
        ORDER BY COALESCE(ve.date, v.date) ASC, ve.id ASC
      ),
      with_running AS (
        SELECT 
          id,
          voucher_id as "voucherId",
          voucher_no as "voucherNo",
          account_id as "accountId",
          account_code as "accountCode",
          account_name as "accountName",
          party_id as "partyId",
          party_name as "partyName",
          date,
          debit,
          credit,
          document_ref as "documentRef",
          narration,
          SUM(
            CASE 
              WHEN account_type IN ('ASSET', 'EXPENSE') THEN (debit - credit)
              ELSE (credit - debit)
            END
          ) OVER (
            PARTITION BY account_id 
            ORDER BY date ASC, id ASC 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) as "runningBalance"
        FROM gl_rows
      )
      SELECT 
        COALESCE(jsonb_agg(to_jsonb(with_running) ORDER BY date DESC, id DESC), '[]'::jsonb),
        COALESCE(SUM(debit), 0),
        COALESCE(SUM(credit), 0)
      INTO v_entries, v_total_debit, v_total_credit
      FROM with_running;

      RETURN jsonb_build_object(
        'entries', v_entries,
        'totalDebit', v_total_debit,
        'totalCredit', v_total_credit
      );
    END;
    $$;
  `);

  // Grant execution permissions
  console.log('Granting permissions to anon, authenticated, and service_role...');
  await client.query(`
    GRANT SELECT ON view_coa_live_balances TO anon, authenticated, service_role, postgres;
    GRANT EXECUTE ON FUNCTION sync_coa_current_balances() TO anon, authenticated, service_role, postgres;
    GRANT EXECUTE ON FUNCTION get_trial_balance(text, text) TO anon, authenticated, service_role, postgres;
    GRANT EXECUTE ON FUNCTION get_income_statement(text, text) TO anon, authenticated, service_role, postgres;
    GRANT EXECUTE ON FUNCTION get_balance_sheet(text) TO anon, authenticated, service_role, postgres;
    GRANT EXECUTE ON FUNCTION get_general_ledger_entries(text, text, text, text, text) TO anon, authenticated, service_role, postgres;
    NOTIFY pgrst, 'reload schema';
  `);

  console.log('PostgreSQL Finance Engine migration complete!');
  await client.end();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
