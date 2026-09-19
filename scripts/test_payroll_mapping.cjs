const { Client } = require('pg');
require('dotenv').config();

async function runTest() {
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
  console.log('=== STRICT ZERO DEMO DATA HR PAYROLL MAPPING INTEGRATION TEST ===');

  const tables = [
    'hr_payroll_sheets',
    'employee_payroll',
    'payroll_records',
    'vouchers',
    'voucher_entries',
    'financial_vouchers',
    'general_ledger',
    'ledgers'
  ];

  // 1. Capture baseline production row counts
  console.log('\n[1] Capturing baseline production row counts...');
  const baselineCounts = {};
  for (const t of tables) {
    const res = await client.query(`SELECT COUNT(*)::int as c FROM public.${t}`);
    baselineCounts[t] = res.rows[0].c;
    console.log(`   * ${t}: ${baselineCounts[t]} rows`);
  }

  // 2. Begin Transaction
  console.log('\n[2] Starting transactional block (BEGIN)...');
  await client.query('BEGIN;');

  try {
    const testMonth = '9999-12';

    // 3. Insert temporary employee_payroll row for test month inside transaction
    console.log(`\n[3] Inserting draft payroll record for test month ${testMonth}...`);
    await client.query(`
      INSERT INTO public.employee_payroll (
        id, employee_id, employee_name, emp_code, designation, month_year, status,
        gross_pay, advance_deduction, loan_emi_deduction, total_deductions, net_pay
      ) VALUES (
        'test-pay-slip-9999', '21663b3f-fae9-46bc-96ef-54af40b1b8cb', 'Test Rollback Employee', 'EMP-TEST-999', 'Sorter',
        $1, 'DRAFT', 5000.00, 500.00, 0.00, 500.00, 4500.00
      );
    `, [testMonth]);
    console.log('   -> Draft payroll record inserted: Gross: 5000.00, Deductions: 500.00, Net: 4500.00 AED');

    // 4. Execute post_payroll_batch_and_post_jv
    console.log('\n[4] Calling public.post_payroll_batch_and_post_jv...');
    const postRes = await client.query(
      'SELECT public.post_payroll_batch_and_post_jv($1, $2) as result;',
      [testMonth, 'Automated Test Controller']
    );
    const postData = postRes.rows[0].result;
    console.log('   -> post_payroll_batch_and_post_jv returned:', postData);

    if (!postData.success || postData.status !== 'POSTED') {
      throw new Error(`post_payroll_batch_and_post_jv failed: ${JSON.stringify(postData)}`);
    }

    const voucherNo = postData.voucher_no;
    const voucherId = postData.voucher_id;

    // 5. Verify Voucher in vouchers table
    console.log('\n[5] Verifying parent voucher in vouchers table...');
    const vRes = await client.query('SELECT * FROM public.vouchers WHERE id = $1', [voucherId]);
    if (vRes.rows.length === 0) throw new Error('Voucher not found in vouchers table!');
    const v = vRes.rows[0];
    console.log(`   -> Found Voucher: ${v.voucher_no}, Status: ${v.status}, Debit: ${v.total_debit}, Credit: ${v.total_credit}`);
    if (v.status !== 'POSTED') throw new Error(`Expected voucher status POSTED, got ${v.status}`);
    if (Number(v.total_debit) !== 5000 || Number(v.total_credit) !== 5000) {
      throw new Error(`Voucher totals unbalanced: DR ${v.total_debit} / CR ${v.total_credit}`);
    }

    // 6. Verify Voucher Entries & Account Codes
    console.log('\n[6] Verifying strictly transactional account codes and double-entry balance...');
    const veRes = await client.query('SELECT * FROM public.voucher_entries WHERE voucher_id = $1 ORDER BY debit DESC', [voucherId]);
    console.log(`   -> Found ${veRes.rows.length} voucher_entries:`);
    let sumDebit = 0;
    let sumCredit = 0;
    let hasSalaryExpense = false;
    let hasSalariesPayable = false;
    let hasAdvanceRecovery = false;

    for (const line of veRes.rows) {
      console.log(`      Line: Code ${line.account_code} (${line.account_name}) | DR: ${line.debit} | CR: ${line.credit}`);
      sumDebit += Number(line.debit);
      sumCredit += Number(line.credit);

      if (line.account_code.endsWith('-00')) {
        throw new Error(`DEFECT: Account ${line.account_code} is a parent header ending in -00! Must be transactional.`);
      }

      if (line.account_code === '5210-100') {
        hasSalaryExpense = true;
        if (Number(line.debit) !== 5000) throw new Error(`5210-100 debit must be 5000, got ${line.debit}`);
      }
      if (line.account_code === '2310-01') {
        hasSalariesPayable = true;
        if (Number(line.credit) !== 4500) throw new Error(`2310-01 credit must be 4500, got ${line.credit}`);
      }
      if (line.account_code === '1135-01') {
        hasAdvanceRecovery = true;
        if (Number(line.credit) !== 500) throw new Error(`1135-01 credit must be 500, got ${line.credit}`);
      }
    }

    if (!hasSalaryExpense) throw new Error('Missing required Debit line to 5210-100 (SALARY EXPNSE)');
    if (!hasSalariesPayable) throw new Error('Missing required Credit line to 2310-01 (Staff Salaries Payable)');
    if (!hasAdvanceRecovery) throw new Error('Missing required Credit line to 1135-01 (Staff Advance Deductions)');

    console.log(`   -> Mathematical Balance: Total DR ${sumDebit} AED == Total CR ${sumCredit} AED`);
    if (sumDebit !== 5000 || sumCredit !== 5000) {
      throw new Error(`Double-entry balance check failed! DR ${sumDebit} != CR ${sumCredit}`);
    }

    // 7. Verify Duplicate Posting Prevention (using SAVEPOINT so expected error does not abort transaction)
    console.log('\n[7] Testing duplicate posting prevention...');
    let duplicateBlocked = false;
    await client.query('SAVEPOINT dup_test;');
    try {
      await client.query(
        'SELECT public.post_payroll_batch_and_post_jv($1, $2) as result;',
        [testMonth, 'Duplicate Attempter']
      );
    } catch (dupErr) {
      await client.query('ROLLBACK TO SAVEPOINT dup_test;');
      if (dupErr.message.includes('already posted')) {
        duplicateBlocked = true;
        console.log(`   -> Correctly blocked duplicate posting with error: "${dupErr.message}"`);
      } else {
        throw dupErr;
      }
    }
    if (!duplicateBlocked) {
      throw new Error('Duplicate posting was NOT blocked! Expected error when posting already posted month.');
    }

    // 8. Verify Unposting
    console.log('\n[8] Testing unpost_payroll_batch_and_reverse_jv...');
    const unpostRes = await client.query(
      'SELECT public.unpost_payroll_batch_and_reverse_jv($1) as result;',
      [testMonth]
    );
    const unpostData = unpostRes.rows[0].result;
    console.log('   -> unpost returned:', unpostData);
    if (!unpostData.success || !unpostData.unposted) {
      throw new Error(`unpost failed: ${JSON.stringify(unpostData)}`);
    }

    // Confirm voucher was deleted
    const vCheck = await client.query('SELECT * FROM public.vouchers WHERE id = $1', [voucherId]);
    if (vCheck.rows.length !== 0) throw new Error('Voucher was not deleted on unpost!');
    const veCheck = await client.query('SELECT * FROM public.voucher_entries WHERE voucher_id = $1', [voucherId]);
    if (veCheck.rows.length !== 0) throw new Error('Voucher entries were not deleted on unpost!');
    console.log('   -> Verified voucher and ledger lines fully reversed upon unpost.');

    console.log('\n[9] All verification assertions PASSED successfully inside transaction!');
  } finally {
    // 9. Rollback transaction
    console.log('\n[10] Rolling back test transaction (ROLLBACK)...');
    await client.query('ROLLBACK;');
    console.log('   -> Transaction rolled back.');
  }

  // 10. Verify post-rollback counts match baseline exactly
  console.log('\n[11] Verifying zero test data leakage (comparing to pre-test baseline)...');
  let clean = true;
  for (const t of tables) {
    const res = await client.query(`SELECT COUNT(*)::int as c FROM public.${t}`);
    const postCount = res.rows[0].c;
    if (postCount !== baselineCounts[t]) {
      console.error(`   [DATA LEAK DETECTED]: Table ${t} count mismatch! Baseline: ${baselineCounts[t]}, Current: ${postCount}`);
      clean = false;
    } else {
      console.log(`   * ${t}: count is ${postCount} (matches baseline: ${baselineCounts[t]}) [CLEAN]`);
    }
  }

  await client.end();

  if (!clean) {
    throw new Error('Zero Demo Data policy violated: database was not left clean!');
  }

  console.log('\n=== ZERO DEMO DATA PAYROLL INTEGRATION TEST COMPLETED SUCCESSFULLY WITH 100% CLEAN DATABASE ===');
}

runTest().catch(err => {
  console.error('\n[TEST FAILURE]:', err);
  process.exit(1);
});
