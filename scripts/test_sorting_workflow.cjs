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
  console.log('=== STRICT ZERO DEMO DATA SORTING INTEGRATION TEST ===');

  const tables = [
    'sorting_batches',
    'sorting_batch_items',
    'vouchers',
    'voucher_entries',
    'financial_vouchers',
    'general_ledger',
    'ledgers',
    'inventory_items'
  ];

  // Step A: Capture initial production row counts
  console.log('\n[1] Capturing baseline production row counts...');
  const baselineCounts = {};
  for (const t of tables) {
    const res = await client.query(`SELECT COUNT(*)::int as c FROM public.${t}`);
    baselineCounts[t] = res.rows[0].c;
    console.log(`   * ${t}: ${baselineCounts[t]} rows`);
  }

  // Step B: Begin Transaction
  console.log('\n[2] Starting transactional block (BEGIN)...');
  await client.query('BEGIN;');

  try {
    // Step C: Insert a test batch inside the transaction
    console.log('\n[3] Creating test sorting batch (Draft) inside transaction...');
    const insertBatchRes = await client.query(`
      INSERT INTO public.sorting_batches (
        batch_number, raw_bales_count, raw_weight_kg, raw_cost_value, status, notes
      ) VALUES (
        'SRT-TEST-TX-001', 2, 90.00, 1000.00, 'DRAFT', 'Automated Transactional Rollback Test'
      ) RETURNING id;
    `);
    const testBatchId = insertBatchRes.rows[0].id;
    console.log(`   -> Test batch created with ID: ${testBatchId}, Raw Cost: 1000.00 AED, Weight: 90.00 kg`);

    // Step D: Execute start_sorting_batch_and_post_wip
    console.log('\n[4] Executing start_sorting_batch_and_post_wip...');
    const startRes = await client.query(
      'SELECT public.start_sorting_batch_and_post_wip($1::uuid) as result;',
      [testBatchId]
    );
    const startData = startRes.rows[0].result;
    console.log('   -> start_sorting_batch_and_post_wip result:', startData);

    if (!startData.success || startData.status !== 'IN_PROCESS') {
      throw new Error(`start_sorting_batch_and_post_wip did not succeed: ${JSON.stringify(startData)}`);
    }

    const wipVoucherId = startData.wip_voucher_id;
    const wipVoucherNo = startData.wip_voucher_no;

    // Verify WIP Voucher in vouchers table
    const vWipRes = await client.query('SELECT * FROM public.vouchers WHERE id = $1', [wipVoucherId]);
    if (vWipRes.rows.length === 0) throw new Error('WIP voucher not found in vouchers table');
    const vWip = vWipRes.rows[0];
    console.log(`   -> Verified WIP Voucher: ${vWip.voucher_no}, Status: ${vWip.status}, Total Debit: ${vWip.total_debit}, Total Credit: ${vWip.total_credit}`);
    if (vWip.status !== 'POSTED') throw new Error(`WIP voucher status must be POSTED, got ${vWip.status}`);
    if (Number(vWip.total_debit) !== 1000 || Number(vWip.total_credit) !== 1000) {
      throw new Error(`WIP voucher unbalanced debits/credits: ${vWip.total_debit} / ${vWip.total_credit}`);
    }

    // Verify WIP Voucher Entries
    const veWipRes = await client.query('SELECT * FROM public.voucher_entries WHERE voucher_id = $1 ORDER BY debit DESC', [wipVoucherId]);
    console.log(`   -> Found ${veWipRes.rows.length} voucher_entries for WIP voucher:`);
    for (const line of veWipRes.rows) {
      console.log(`      Line: Code ${line.account_code} (${line.account_name}) | DR: ${line.debit} | CR: ${line.credit}`);
      if (line.account_code.endsWith('-00')) {
        throw new Error(`DEFECT: Account code ${line.account_code} ends in -00! Must be strictly transactional.`);
      }
    }
    if (veWipRes.rows.length !== 2) throw new Error(`Expected 2 voucher entries, got ${veWipRes.rows.length}`);
    if (veWipRes.rows[0].account_code !== '1150-01' || Number(veWipRes.rows[0].debit) !== 1000) {
      throw new Error(`Expected Line 1 to be DR 1150-01 1000.00, got ${veWipRes.rows[0].account_code} ${veWipRes.rows[0].debit}`);
    }
    if (veWipRes.rows[1].account_code !== '1140-01' || Number(veWipRes.rows[1].credit) !== 1000) {
      throw new Error(`Expected Line 2 to be CR 1140-01 1000.00, got ${veWipRes.rows[1].account_code} ${veWipRes.rows[1].credit}`);
    }

    // Step E: Execute complete_sorting_batch_and_post_fg
    console.log('\n[5] Executing complete_sorting_batch_and_post_fg with graded items and scrap...');
    const finishedItems = [
      {
        item_sku: 'TEST-DENIM-001',
        item_name: 'Vintage 90s Denim Jacket Grade A',
        category: 'Vintage Denim',
        grade: 'Grade A',
        quantity: 5,
        weight_kg: 15.00,
        cost_price: 100.00, // 5 * 100 = 500
        selling_price: 250.00,
        barcode: 'BC-TEST-001'
      },
      {
        item_sku: 'TEST-HOODIE-002',
        item_name: 'Retro Sportswear Hoodies Grade B',
        category: 'Vintage Hoodies',
        grade: 'Grade B',
        quantity: 8,
        weight_kg: 20.00,
        cost_price: 50.00, // 8 * 50 = 400
        selling_price: 120.00,
        barcode: 'BC-TEST-002'
      }
    ];
    // Total FG cost = 500 + 400 = 900.00 AED
    // Total WIP cost = 1000.00 AED
    // Expected Scrap Cost = 100.00 AED (Debit 5190-01)
    // Finished Weight = 35.00 kg, Wastage Weight = 55.00 kg (90 - 35)

    const completeRes = await client.query(
      'SELECT public.complete_sorting_batch_and_post_fg($1::uuid, $2::jsonb) as result;',
      [testBatchId, JSON.stringify(finishedItems)]
    );
    const completeData = completeRes.rows[0].result;
    console.log('   -> complete_sorting_batch_and_post_fg result:', completeData);

    if (!completeData.success || completeData.status !== 'COMPLETED') {
      throw new Error(`complete_sorting_batch_and_post_fg did not succeed: ${JSON.stringify(completeData)}`);
    }

    if (Number(completeData.total_fg_cost) !== 900) {
      throw new Error(`Expected total_fg_cost = 900, got ${completeData.total_fg_cost}`);
    }
    if (Number(completeData.scrap_cost) !== 100) {
      throw new Error(`Expected scrap_cost = 100, got ${completeData.scrap_cost}`);
    }
    if (Number(completeData.finished_weight_kg) !== 35) {
      throw new Error(`Expected finished_weight_kg = 35, got ${completeData.finished_weight_kg}`);
    }
    if (Number(completeData.wastage_weight_kg) !== 55) {
      throw new Error(`Expected wastage_weight_kg = 55, got ${completeData.wastage_weight_kg}`);
    }

    const fgVoucherId = completeData.fg_voucher_id;

    // Verify FG Voucher in vouchers table
    const vFgRes = await client.query('SELECT * FROM public.vouchers WHERE id = $1', [fgVoucherId]);
    if (vFgRes.rows.length === 0) throw new Error('FG voucher not found in vouchers table');
    const vFg = vFgRes.rows[0];
    console.log(`   -> Verified FG Voucher: ${vFg.voucher_no}, Status: ${vFg.status}, Total Debit: ${vFg.total_debit}, Total Credit: ${vFg.total_credit}`);
    if (vFg.status !== 'POSTED') throw new Error(`FG voucher status must be POSTED, got ${vFg.status}`);
    if (Number(vFg.total_debit) !== 1000 || Number(vFg.total_credit) !== 1000) {
      throw new Error(`FG voucher unbalanced debits/credits: ${vFg.total_debit} / ${vFg.total_credit}`);
    }

    // Verify FG Voucher Entries (Debits == Credits)
    const veFgRes = await client.query('SELECT * FROM public.voucher_entries WHERE voucher_id = $1 ORDER BY debit DESC', [fgVoucherId]);
    console.log(`   -> Found ${veFgRes.rows.length} voucher_entries for FG voucher:`);
    let sumDebit = 0;
    let sumCredit = 0;
    for (const line of veFgRes.rows) {
      console.log(`      Line: Code ${line.account_code} (${line.account_name}) | DR: ${line.debit} | CR: ${line.credit}`);
      sumDebit += Number(line.debit);
      sumCredit += Number(line.credit);
      if (line.account_code.endsWith('-00')) {
        throw new Error(`DEFECT: Account code ${line.account_code} ends in -00! Must be strictly transactional.`);
      }
    }
    console.log(`   -> Sum Debits: ${sumDebit} AED, Sum Credits: ${sumCredit} AED`);
    if (sumDebit !== 1000 || sumCredit !== 1000) {
      throw new Error(`Mathematical equality failed! Debits (${sumDebit}) != Credits (${sumCredit})`);
    }

    // Verify items in sorting_batch_items
    const sbiRes = await client.query('SELECT * FROM public.sorting_batch_items WHERE batch_id = $1', [testBatchId]);
    console.log(`   -> Verified sorting_batch_items count: ${sbiRes.rows.length}`);
    if (sbiRes.rows.length !== 2) throw new Error(`Expected 2 items in sorting_batch_items, got ${sbiRes.rows.length}`);

    // Verify items capitalized in inventory_items
    const invRes = await client.query("SELECT * FROM public.inventory_items WHERE sku IN ('TEST-DENIM-001', 'TEST-HOODIE-002')");
    console.log(`   -> Verified capitalized inventory_items count: ${invRes.rows.length}`);
    if (invRes.rows.length !== 2) throw new Error(`Expected 2 capitalized inventory_items, got ${invRes.rows.length}`);

    console.log('\n[6] All business logic, voucher posting, and double-entry validations PASSED!');
  } finally {
    // Step F: Rollback the transaction
    console.log('\n[7] Rolling back test transaction (ROLLBACK)...');
    await client.query('ROLLBACK;');
    console.log('   -> Transaction rolled back.');
  }

  // Step G: Verify post-rollback counts match baseline exactly
  console.log('\n[8] Verifying zero test data leakage (comparing to pre-test baseline)...');
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

  console.log('\n=== ZERO DEMO DATA INTEGRATION TEST COMPLETED SUCCESSFULLY WITH 100% CLEAN DATABASE ===');
}

runTest().catch(err => {
  console.error('\n[TEST FAILURE]:', err);
  process.exit(1);
});
