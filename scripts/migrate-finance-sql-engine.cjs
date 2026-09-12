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

  // 3. Trial Balance View & Function
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
          SELECT id, voucher_no, status, date FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id, voucher_no, status, date FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        WHERE (v_start IS NULL OR COALESCE(ve.date, v.date) >= v_start)
          AND (v_end IS NULL OR COALESCE(ve.date, v.date) <= v_end)
      ),
      acc_totals AS (
        SELECT 
          c.id as account_id,
          c.code as account_code,
          c.name as account_name,
          c.type as classification,
          COALESCE(SUM(fe.debit), 0)::numeric as tot_debit,
          COALESCE(SUM(fe.credit), 0)::numeric as tot_credit
        FROM coa_accounts c
        LEFT JOIN filtered_entries fe ON (fe.account_id = c.id OR fe.account_code = c.code)
        GROUP BY c.id, c.code, c.name, c.type
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
        WHERE tot_debit > 0 OR tot_credit > 0
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

  // 4. Income Statement Function
  console.log('Creating get_income_statement RPC...');
  await client.query(`
    CREATE OR REPLACE FUNCTION get_income_statement(p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      v_start date := NULL;
      v_end date := NULL;
      v_revenue_rows jsonb;
      v_cogs_rows jsonb;
      v_operating_expense_rows jsonb;
      v_all_expense_rows jsonb;
      v_total_revenue numeric := 0;
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
          SELECT id, voucher_no, status, date FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id, voucher_no, status, date FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        WHERE (v_start IS NULL OR COALESCE(ve.date, v.date) >= v_start)
          AND (v_end IS NULL OR COALESCE(ve.date, v.date) <= v_end)
      ),
      acc_activity AS (
        SELECT 
          c.id as account_id,
          c.code as account_code,
          c.name as account_name,
          c.type as account_type,
          c.sub_type,
          ROUND(
            CASE 
              WHEN c.type = 'REVENUE' THEN (COALESCE(SUM(fe.credit), 0) - COALESCE(SUM(fe.debit), 0))
              WHEN c.type = 'EXPENSE' THEN (COALESCE(SUM(fe.debit), 0) - COALESCE(SUM(fe.credit), 0))
              ELSE 0
            END, 2
          ) as net_balance
        FROM coa_accounts c
        LEFT JOIN filtered_entries fe ON (fe.account_id = c.id OR fe.account_code = c.code)
        WHERE c.type IN ('REVENUE', 'EXPENSE')
        GROUP BY c.id, c.code, c.name, c.type, c.sub_type
      )
      -- 1. Revenue
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_revenue_rows, v_total_revenue
      FROM acc_activity
      WHERE account_type = 'REVENUE' AND net_balance != 0;

      -- 2. COGS (Expenses with code starting with 51 or sub_type ILIKE '%Cost of Goods%')
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_cogs_rows, v_total_cogs
      FROM acc_activity
      WHERE account_type = 'EXPENSE' AND (account_code LIKE '51%' OR sub_type ILIKE '%Cost of Goods%') AND net_balance != 0;

      -- 3. Operating Expenses (All other expenses)
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_operating_expense_rows, v_total_operating_expenses
      FROM acc_activity
      WHERE account_type = 'EXPENSE' AND NOT (account_code LIKE '51%' OR sub_type ILIKE '%Cost of Goods%') AND net_balance != 0;

      -- 4. All Expenses combined
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_all_expense_rows, v_total_expenses
      FROM acc_activity
      WHERE account_type = 'EXPENSE' AND net_balance != 0;

      v_gross_profit := ROUND(v_total_revenue - v_total_cogs, 2);
      v_net_profit := ROUND(v_total_revenue - v_total_expenses, 2);

      RETURN jsonb_build_object(
        'revenue', jsonb_build_object('accounts', v_revenue_rows, 'total', v_total_revenue),
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

  // 5. Balance Sheet Function
  console.log('Creating get_balance_sheet RPC...');
  await client.query(`
    CREATE OR REPLACE FUNCTION get_balance_sheet(p_as_of_date text DEFAULT NULL)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      v_as_of date := NULL;
      v_asset_rows jsonb;
      v_liability_rows jsonb;
      v_equity_rows jsonb;
      v_total_assets numeric := 0;
      v_total_liabilities numeric := 0;
      v_total_equity numeric := 0;
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
          ve.credit
        FROM voucher_entries ve
        INNER JOIN (
          SELECT id, voucher_no, status, date FROM vouchers WHERE status = 'POSTED'
          UNION
          SELECT id, voucher_no, status, date FROM financial_vouchers WHERE status = 'POSTED'
        ) v ON (v.id = ve.voucher_id OR v.voucher_no = ve.voucher_no)
        WHERE (v_as_of IS NULL OR COALESCE(ve.date, v.date) <= v_as_of)
      ),
      acc_totals AS (
        SELECT 
          c.id as account_id,
          c.code as account_code,
          c.name as account_name,
          c.type as account_type,
          c.sub_type,
          ROUND(
            CASE 
              WHEN c.type = 'ASSET' THEN (COALESCE(SUM(fe.debit), 0) - COALESCE(SUM(fe.credit), 0))
              WHEN c.type = 'LIABILITY' THEN (COALESCE(SUM(fe.credit), 0) - COALESCE(SUM(fe.debit), 0))
              WHEN c.type = 'EQUITY' THEN (COALESCE(SUM(fe.credit), 0) - COALESCE(SUM(fe.debit), 0))
              WHEN c.type = 'REVENUE' THEN (COALESCE(SUM(fe.credit), 0) - COALESCE(SUM(fe.debit), 0))
              WHEN c.type = 'EXPENSE' THEN (COALESCE(SUM(fe.debit), 0) - COALESCE(SUM(fe.credit), 0))
              ELSE 0
            END, 2
          ) as net_balance
        FROM coa_accounts c
        LEFT JOIN filtered_entries fe ON (fe.account_id = c.id OR fe.account_code = c.code)
        GROUP BY c.id, c.code, c.name, c.type, c.sub_type
      )
      -- Compute Net Profit YTD from P&L accounts (Revenue - Expense)
      SELECT 
        COALESCE(SUM(CASE WHEN account_type = 'REVENUE' THEN net_balance WHEN account_type = 'EXPENSE' THEN -net_balance ELSE 0 END), 0)
      INTO v_net_profit_ytd
      FROM acc_totals
      WHERE account_type IN ('REVENUE', 'EXPENSE');

      -- 1. Assets
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_asset_rows, v_total_assets
      FROM acc_totals
      WHERE account_type = 'ASSET' AND net_balance != 0;

      -- 2. Liabilities
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_liability_rows, v_total_liabilities
      FROM acc_totals
      WHERE account_type = 'LIABILITY' AND net_balance != 0;

      -- 3. Base Equity
      SELECT 
        COALESCE(jsonb_agg(jsonb_build_object('id', account_id, 'code', account_code, 'name', account_name, 'subType', sub_type, 'balance', net_balance) ORDER BY account_code), '[]'::jsonb),
        COALESCE(SUM(net_balance), 0)
      INTO v_equity_rows, v_total_equity
      FROM acc_totals
      WHERE account_type = 'EQUITY' AND net_balance != 0;

      -- Add dynamic Retained Earnings / Net Profit to Equity
      v_equity_rows := v_equity_rows || jsonb_build_array(
        jsonb_build_object(
          'id', 'acc-retained-earnings-ytd',
          'code', 'NET-PROFIT-YTD',
          'name', 'Net Profit / Retained Earnings (Current Year)',
          'subType', 'Retained Earnings',
          'balance', v_net_profit_ytd
        )
      );
      v_total_equity := ROUND(v_total_equity + v_net_profit_ytd, 2);

      v_is_balanced := (ABS(v_total_assets - (v_total_liabilities + v_total_equity)) < 0.05);

      RETURN jsonb_build_object(
        'assets', jsonb_build_object('accounts', v_asset_rows, 'total', v_total_assets),
        'liabilities', jsonb_build_object('accounts', v_liability_rows, 'total', v_total_liabilities),
        'equity', jsonb_build_object('accounts', v_equity_rows, 'total', v_total_equity),
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
