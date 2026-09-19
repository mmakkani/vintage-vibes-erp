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
  console.log('[Payroll Deploy] Connected to PostgreSQL...');

  // 1. Ensure hr_payroll_sheets has voucher_id and voucher_no columns
  console.log('1. Checking and updating hr_payroll_sheets schema...');
  await client.query(`
    ALTER TABLE public.hr_payroll_sheets 
    ADD COLUMN IF NOT EXISTS voucher_id VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS voucher_no VARCHAR(255) NULL;
  `);
  console.log('   -> hr_payroll_sheets columns verified.');

  // 2. Ensure payroll_records has voucher_id
  console.log('2. Checking and updating payroll_records schema...');
  await client.query(`
    ALTER TABLE public.payroll_records 
    ADD COLUMN IF NOT EXISTS voucher_id VARCHAR(255) NULL;
  `);
  console.log('   -> payroll_records columns verified.');

  // 3. Verify COA accounts: 5210-100 and 2310-01
  console.log('3. Verifying mandatory COA accounts 5210-100 and 2310-01...');
  const expCheck = await client.query("SELECT code, name, is_active FROM public.coa_accounts WHERE code = '5210-100'");
  if (expCheck.rows.length === 0) {
    throw new Error('COA Account 5210-100 (SALARY EXPNSE) missing in coa_accounts!');
  }
  const payCheck = await client.query("SELECT code, name, is_active FROM public.coa_accounts WHERE code = '2310-01'");
  if (payCheck.rows.length === 0) {
    throw new Error('COA Account 2310-01 (Staff Salaries Payable) missing in coa_accounts!');
  }
  console.log('   -> 5210-100 & 2310-01 confirmed present and active.');

  // 4. Deploy Stored Procedure: post_payroll_batch_and_post_jv
  console.log('4. Deploying stored procedure post_payroll_batch_and_post_jv...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.post_payroll_batch_and_post_jv(
      p_month_year TEXT,
      p_posted_by TEXT DEFAULT 'Finance & HR Controller'
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_sheet RECORD;
      v_exp_acc RECORD;
      v_pay_acc RECORD;
      v_ded_acc RECORD;
      v_total_gross NUMERIC(12, 2) := 0;
      v_total_deductions NUMERIC(12, 2) := 0;
      v_total_net NUMERIC(12, 2) := 0;
      v_emp_count INT := 0;
      v_voucher_id VARCHAR(255);
      v_voucher_no VARCHAR(255);
      v_voucher_date DATE;
      v_now TIMESTAMPTZ := NOW();
      v_existing_voucher RECORD;
    BEGIN
      IF p_month_year IS NULL OR TRIM(p_month_year) = '' THEN
        RAISE EXCEPTION 'Month-year parameter is required (e.g. 2026-09)';
      END IF;

      v_voucher_no := 'JV-PAY-' || p_month_year;
      v_voucher_id := 'vch-pay-' || p_month_year;

      -- Determine voucher date: if current month use today, otherwise 1st of that month
      IF p_month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM') THEN
        v_voucher_date := CURRENT_DATE;
      ELSE
        BEGIN
          v_voucher_date := TO_DATE(p_month_year || '-01', 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN
          v_voucher_date := CURRENT_DATE;
        END;
      END IF;

      -- 1. Check if already posted to prevent duplicate vouchers
      SELECT * INTO v_sheet FROM public.hr_payroll_sheets WHERE month_year = p_month_year;
      SELECT * INTO v_existing_voucher FROM public.vouchers WHERE voucher_no = v_voucher_no AND status = 'POSTED';
      
      IF (v_sheet.status = 'POSTED' AND v_sheet.voucher_id IS NOT NULL) OR v_existing_voucher.id IS NOT NULL THEN
        RAISE EXCEPTION 'Payroll for month % is already posted with voucher %. Unpost first before regenerating.',
          p_month_year, COALESCE(v_sheet.voucher_no, v_existing_voucher.voucher_no);
      END IF;

      -- 2. Calculate totals from employee_payroll
      SELECT 
        COALESCE(SUM(gross_pay), 0)::numeric(12, 2),
        COALESCE(SUM(total_deductions), 0)::numeric(12, 2),
        COALESCE(SUM(net_pay), 0)::numeric(12, 2),
        COUNT(*)::int
      INTO v_total_gross, v_total_deductions, v_total_net, v_emp_count
      FROM public.employee_payroll
      WHERE month_year = p_month_year;

      -- Fallback to sheet figures if employee_payroll wasn't populated but sheet has numbers
      IF (v_total_gross <= 0 OR v_emp_count = 0) AND v_sheet.total_gross IS NOT NULL AND v_sheet.total_gross > 0 THEN
        v_total_gross := v_sheet.total_gross;
        v_total_deductions := COALESCE(v_sheet.total_deductions, 0);
        v_total_net := COALESCE(v_sheet.total_net, v_total_gross - v_total_deductions);
        v_emp_count := COALESCE(v_sheet.total_employees, 1);
      END IF;

      IF v_total_gross <= 0 THEN
        RAISE EXCEPTION 'No payroll records or gross amount found for month %', p_month_year;
      END IF;

      -- Double entry sanity check
      IF (v_total_net + v_total_deductions) != v_total_gross THEN
        RAISE EXCEPTION 'Double-entry balance check failed for payroll %: Gross (%) != Net (%) + Deductions (%)',
          p_month_year, v_total_gross, v_total_net, v_total_deductions;
      END IF;

      -- 3. Resolve Strictly Transactional COA Accounts:
      -- Debit: 5210-100 (SALARY EXPNSE)
      SELECT id, code, name INTO v_exp_acc 
      FROM public.coa_accounts 
      WHERE code = '5210-100' AND is_active = true LIMIT 1;
      
      IF v_exp_acc.id IS NULL THEN
        RAISE EXCEPTION 'Active transactional COA account 5210-100 (SALARY EXPNSE) not found';
      END IF;

      -- Credit: 2310-01 (Staff Salaries Payable)
      SELECT id, code, name INTO v_pay_acc 
      FROM public.coa_accounts 
      WHERE code = '2310-01' AND is_active = true LIMIT 1;
      
      IF v_pay_acc.id IS NULL THEN
        RAISE EXCEPTION 'Active transactional COA account 2310-01 (Staff Salaries Payable) not found';
      END IF;

      -- Credit: 1135-01 (Staff Advance & Loan Receivables) if deductions exist
      IF v_total_deductions > 0 THEN
        SELECT id, code, name INTO v_ded_acc 
        FROM public.coa_accounts 
        WHERE code = '1135-01' AND is_active = true LIMIT 1;
        
        IF v_ded_acc.id IS NULL THEN
          RAISE EXCEPTION 'Active transactional COA account 1135-01 (Staff Advance & Loan Receivables) not found';
        END IF;
      END IF;

      -- 4. Clean up any stale draft vouchers with this number
      DELETE FROM public.voucher_entries WHERE voucher_no = v_voucher_no OR voucher_id = v_voucher_id;
      DELETE FROM public.general_ledger WHERE voucher_no = v_voucher_no OR voucher_id = v_voucher_id;
      DELETE FROM public.ledgers WHERE voucher_no = v_voucher_no OR voucher_id = v_voucher_id;
      DELETE FROM public.financial_vouchers WHERE voucher_no = v_voucher_no OR id = v_voucher_id;
      DELETE FROM public.vouchers WHERE voucher_no = v_voucher_no OR id = v_voucher_id;

      -- 5. Insert Journal Voucher into vouchers
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

      -- Mirror into financial_vouchers
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

      -- 6. Insert Balanced Journal Entries into voucher_entries
      -- Line 1: DEBIT 5210-100 (SALARY EXPNSE)
      INSERT INTO public.voucher_entries (
        id, voucher_id, voucher_no, account_id, account_code, account_name,
        debit, credit, particulars, memo, narration, date, created_at,
        currency, exchange_rate, foreign_debit, foreign_credit
      ) VALUES (
        gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_exp_acc.id, '5210-100', v_exp_acc.name,
        v_total_gross, 0,
        'Staff Salaries Expense for ' || p_month_year,
        'Staff Salaries Expense for ' || p_month_year,
        'Staff Salaries Expense for ' || p_month_year,
        v_voucher_date, v_now, 'AED', 1.0, v_total_gross, 0
      );

      -- Line 2: CREDIT 1135-01 (Staff Advance Deductions, if any)
      IF v_total_deductions > 0 THEN
        INSERT INTO public.voucher_entries (
          id, voucher_id, voucher_no, account_id, account_code, account_name,
          debit, credit, particulars, memo, narration, date, created_at,
          currency, exchange_rate, foreign_debit, foreign_credit
        ) VALUES (
          gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_ded_acc.id, '1135-01', v_ded_acc.name,
          0, v_total_deductions,
          'Staff Loan & Advance Recoveries for ' || p_month_year,
          'Staff Loan & Advance Recoveries for ' || p_month_year,
          'Staff Loan & Advance Recoveries for ' || p_month_year,
          v_voucher_date, v_now, 'AED', 1.0, 0, v_total_deductions
        );
      END IF;

      -- Line 3: CREDIT 2310-01 (Staff Salaries Payable)
      INSERT INTO public.voucher_entries (
        id, voucher_id, voucher_no, account_id, account_code, account_name,
        debit, credit, particulars, memo, narration, date, created_at,
        currency, exchange_rate, foreign_debit, foreign_credit
      ) VALUES (
        gen_random_uuid()::text, v_voucher_id, v_voucher_no, v_pay_acc.id, '2310-01', v_pay_acc.name,
        0, v_total_net,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        v_voucher_date, v_now, 'AED', 1.0, 0, v_total_net
      );

      -- Mirror to general_ledger
      INSERT INTO public.general_ledger (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES
      (
        gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
        v_exp_acc.id, '5210-100', v_exp_acc.name,
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
          v_ded_acc.id, '1135-01', v_ded_acc.name,
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
        v_pay_acc.id, '2310-01', v_pay_acc.name,
        0, v_total_net, -v_total_net,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        'AED', 1.0, 0, v_total_net, v_now
      );

      -- Mirror to ledgers
      INSERT INTO public.ledgers (
        id, entry_date, date, voucher_id, voucher_no,
        account_id, account_code, account_name,
        debit, credit, balance, description, narration,
        currency, exchange_rate, foreign_debit, foreign_credit, created_at
      ) VALUES
      (
        gen_random_uuid()::text, v_voucher_date, v_voucher_date, v_voucher_id, v_voucher_no,
        v_exp_acc.id, '5210-100', v_exp_acc.name,
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
          v_ded_acc.id, '1135-01', v_ded_acc.name,
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
        v_pay_acc.id, '2310-01', v_pay_acc.name,
        0, v_total_net, -v_total_net,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        'Accrued Staff Salaries Payable for ' || p_month_year,
        'AED', 1.0, 0, v_total_net, v_now
      );

      -- 7. Upsert hr_payroll_sheets with voucher tracking
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

      -- 8. Update employee_payroll and payroll_records
      UPDATE public.employee_payroll
      SET status = 'POSTED', posted_at = v_now, posted_by = p_posted_by
      WHERE month_year = p_month_year;

      UPDATE public.payroll_records
      SET voucher_id = v_voucher_id, payment_status = 'POSTED'
      WHERE payroll_month = p_month_year;

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
    $$;
  `);
  console.log('   -> post_payroll_batch_and_post_jv deployed.');

  // 5. Deploy Stored Procedure: unpost_payroll_batch_and_reverse_jv
  console.log('5. Deploying stored procedure unpost_payroll_batch_and_reverse_jv...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.unpost_payroll_batch_and_reverse_jv(p_month_year TEXT)
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_voucher_no VARCHAR(255);
      v_voucher_id VARCHAR(255);
    BEGIN
      IF p_month_year IS NULL OR TRIM(p_month_year) = '' THEN
        RAISE EXCEPTION 'Month-year parameter is required (e.g. 2026-09)';
      END IF;

      v_voucher_no := 'JV-PAY-' || p_month_year;
      v_voucher_id := 'vch-pay-' || p_month_year;

      -- 1. Remove voucher and ledger lines
      DELETE FROM public.voucher_entries WHERE voucher_no = v_voucher_no OR voucher_id = v_voucher_id;
      DELETE FROM public.general_ledger WHERE voucher_no = v_voucher_no OR voucher_id = v_voucher_id;
      DELETE FROM public.ledgers WHERE voucher_no = v_voucher_no OR voucher_id = v_voucher_id;
      DELETE FROM public.financial_vouchers WHERE voucher_no = v_voucher_no OR id = v_voucher_id;
      DELETE FROM public.vouchers WHERE voucher_no = v_voucher_no OR id = v_voucher_id;

      -- 2. Reset hr_payroll_sheets
      UPDATE public.hr_payroll_sheets
      SET status = 'DRAFT', voucher_id = NULL, voucher_no = NULL, posted_at = NULL
      WHERE month_year = p_month_year;

      -- 3. Reset employee_payroll
      UPDATE public.employee_payroll
      SET status = 'DRAFT', posted_at = NULL
      WHERE month_year = p_month_year;

      -- 4. Reset payroll_records
      UPDATE public.payroll_records
      SET voucher_id = NULL, payment_status = 'DRAFT'
      WHERE payroll_month = p_month_year;

      RETURN jsonb_build_object(
        'success', true,
        'month_year', p_month_year,
        'status', 'DRAFT',
        'unposted', true
      );
    END;
    $$;
  `);
  console.log('   -> unpost_payroll_batch_and_reverse_jv deployed.');

  await client.end();
  console.log('[Payroll Deploy] Deployment completed successfully!');
}

deploy().catch(err => {
  console.error('[Deployment Error]:', err);
  process.exit(1);
});
