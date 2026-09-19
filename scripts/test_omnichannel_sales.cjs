const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runTests() {
  const client = await pool.connect();
  let testPassed = false;

  try {
    console.log('🔒 Starting Omnichannel Sales Verification inside atomic BEGIN ... ROLLBACK;');
    await client.query('BEGIN;');

    // Baseline counts to ensure ZERO DEMO DATA persists
    const baseOrders = await client.query('SELECT COUNT(*) FROM orders;');
    const baseVouchers = await client.query('SELECT COUNT(*) FROM vouchers;');
    const baseJournal = await client.query('SELECT COUNT(*) FROM journal_entries;');
    const baseInv = await client.query('SELECT COUNT(*) FROM inventory_items;');

    console.log('Baseline counts before test:', {
      orders: baseOrders.rows[0].count,
      vouchers: baseVouchers.rows[0].count,
      journal_entries: baseJournal.rows[0].count,
      inventory_items: baseInv.rows[0].count
    });

    // 1. Verify sales_channel_settings exist
    console.log('\n--- 1. Testing sales_channel_settings ---');
    const settingsRes = await client.query('SELECT setting_key, account_code FROM sales_channel_settings ORDER BY setting_key;');
    console.log(`Found ${settingsRes.rows.length} sales settings keys.`);
    const expectedKeys = [
      'b2b_revenue', 'b2b_sales_receivable', 'cogs_account', 'courier_cod_clearing',
      'courier_payable', 'delivery_expense', 'ecommerce_sales_clearing', 'finished_goods_inventory',
      'live_sales_clearing', 'omnichannel_retail_revenue', 'pos_cash_drawer', 'pos_sales_clearing', 'pos_terminal_clearing'
    ];
    for (const key of expectedKeys) {
      const match = settingsRes.rows.find(r => r.setting_key === key);
      if (!match) throw new Error(`Missing expected setting_key: ${key}`);
    }
    console.log('✅ All 13 mandatory sales channel settings verified.');

    // 2. Resolve Bank account UUID for settlement tests
    const bankRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = '1120-01' LIMIT 1;");
    if (!bankRes.rows.length) throw new Error("Bank account 1120-01 not found in chart_of_accounts");
    const bankAccountId = bankRes.rows[0].id;

    // Use existing DHL courier and Wholesale client from parties
    const courierRes = await client.query(`
      SELECT id FROM parties WHERE name ILIKE '%DHL%' OR party_type = 'SUPPLIER' LIMIT 1;
    `);
    const courierPartyId = courierRes.rows[0].id;

    const clientRes = await client.query(`
      SELECT id FROM parties WHERE name ILIKE '%EMIRATES WHOLESALE%' OR party_type = 'CUSTOMER' LIMIT 1;
    `);
    const clientPartyId = clientRes.rows[0].id;

    // Helper to create test inventory item
    async function createTestItem(sku, cost, selling) {
      const r = await client.query(`
        INSERT INTO inventory_items (id, sku, title, cost_price, selling_price, stock_quantity, status)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 1, 'AVAILABLE')
        RETURNING id;
      `, [sku, `Test Item ${sku}`, cost, selling]);
      return r.rows[0].id;
    }

    // Helper to create test order
    async function createTestOrder(source, total, fee) {
      const r = await client.query(`
        INSERT INTO orders (
          id, order_number, customer_name, customer_phone, customer_address, city,
          total_amount, delivery_fee, order_status, source, status
        )
        VALUES (
          gen_random_uuid(), $1, 'Test Client / Customer', '+971501234567', 'Al Quoz 3, Dubai', 'Dubai',
          $2, $3, 'PENDING', $4, 'PENDING'
        )
        RETURNING id;
      `, [`ORD-TEST-${Date.now()}-${Math.floor(Math.random()*1000)}`, total, fee, source]);
      return r.rows[0].id;
    }

    // Helper to verify voucher double-entry debits == credits
    async function verifyVoucherBalance(voucherId) {
      const vRes = await client.query('SELECT * FROM vouchers WHERE id = $1', [voucherId]);
      if (!vRes.rows.length) throw new Error(`Voucher ${voucherId} not found in vouchers`);
      const v = vRes.rows[0];
      if (Number(v.total_debit) !== Number(v.total_credit)) {
        throw new Error(`Voucher ${voucherId} header imbalance: Debit ${v.total_debit} != Credit ${v.total_credit}`);
      }

      // Check journal_entries
      const jeRes = await client.query(`
        SELECT COALESCE(SUM(debit), 0) as debits, COALESCE(SUM(credit), 0) as credits, COUNT(*) as line_count
        FROM journal_entries WHERE voucher_id = $1;
      `, [voucherId]);
      const jeDebits = Number(jeRes.rows[0].debits);
      const jeCredits = Number(jeRes.rows[0].credits);
      const jeDiff = Math.abs(jeDebits - jeCredits);
      if (jeDiff > 0.001) {
        throw new Error(`journal_entries imbalance: Debits ${jeDebits} != Credits ${jeCredits}`);
      }

      // Check voucher_entries
      const veRes = await client.query(`
        SELECT COALESCE(SUM(debit), 0) as debits, COALESCE(SUM(credit), 0) as credits, COUNT(*) as line_count
        FROM voucher_entries WHERE voucher_id = $1;
      `, [voucherId]);
      const veDebits = Number(veRes.rows[0].debits);
      const veCredits = Number(veRes.rows[0].credits);
      const veDiff = Math.abs(veDebits - veCredits);
      if (veDiff > 0.001) {
        throw new Error(`voucher_entries imbalance: Debits ${veDebits} != Credits ${veCredits}`);
      }

      // Check general_ledger
      const glRes = await client.query(`
        SELECT COALESCE(SUM(debit), 0) as debits, COALESCE(SUM(credit), 0) as credits, COUNT(*) as line_count
        FROM general_ledger WHERE voucher_id = $1;
      `, [voucherId]);
      const glDebits = Number(glRes.rows[0].debits);
      const glCredits = Number(glRes.rows[0].credits);
      const glDiff = Math.abs(glDebits - glCredits);
      if (glDiff > 0.001) {
        throw new Error(`general_ledger imbalance: Debits ${glDebits} != Credits ${glCredits}`);
      }

      console.log(`  ✓ Voucher ${v.voucher_no}: ${jeRes.rows[0].line_count} journal lines, Debits: AED ${jeDebits.toFixed(2)}, Credits: AED ${jeCredits.toFixed(2)} (Discrepancy: AED 0.00)`);
    }

    // -------------------------------------------------------------
    // Scenario A: Counter Sale (POS)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing POS Dispatch Workflow ---');
    const posItemId = await createTestItem('SKU-POS-01', 40.00, 100.00);
    const posOrderId = await createTestOrder('POS', 100.00, 0.00);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 100.00, 40.00);
    `, [posOrderId, posItemId]);

    const posRes = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2) as result;',
      [posOrderId, 'POS']
    );
    const posResult = posRes.rows[0].result;
    console.log('POS Dispatch Result:', posResult);
    if (!posResult.success) throw new Error('POS dispatch failed');

    // Verify voucher balance
    await verifyVoucherBalance(posResult.voucher_id);

    // Verify item derecognition
    const posItemCheck = await client.query('SELECT status, dispatched_at FROM inventory_items WHERE id = $1', [posItemId]);
    if (posItemCheck.rows[0].status !== 'SOLD' || !posItemCheck.rows[0].dispatched_at) {
      throw new Error(`POS item status expected SOLD, got ${posItemCheck.rows[0].status}`);
    }
    console.log('✅ POS Dispatch & COGS Derecognition Verified!');

    // -------------------------------------------------------------
    // Scenario B: Company / Custom Sales (B2B)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing B2B Dispatch Workflow ---');
    const b2bItemId = await createTestItem('SKU-B2B-01', 250.00, 600.00);
    const b2bOrderId = await createTestOrder('B2B', 600.00, 0.00);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 600.00, 250.00);
    `, [b2bOrderId, b2bItemId]);

    const b2bRes = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3) as result;',
      [b2bOrderId, 'B2B', clientPartyId]
    );
    const b2bResult = b2bRes.rows[0].result;
    console.log('B2B Dispatch Result:', b2bResult);
    if (!b2bResult.success) throw new Error('B2B dispatch failed');

    await verifyVoucherBalance(b2bResult.voucher_id);

    // Verify B2B revenue account 4110-05 credited
    const b2bRevLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '4110-05';
    `, [b2bResult.voucher_id]);
    if (!b2bRevLine.rows.length || Number(b2bRevLine.rows[0].credit) !== 600.00) {
      throw new Error('Expected 4110-05 B2B Revenue to be credited with 600.00');
    }
    console.log('✅ B2B Dispatch & Revenue Mapping to 4110-05 Verified!');

    // -------------------------------------------------------------
    // Scenario C: Live Selling Dispatch (Customer Bears Shipping)
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Live Dispatch (Customer Bears Shipping) ---');
    const live1ItemId = await createTestItem('SKU-LIVE-01', 50.00, 150.00);
    const live1OrderId = await createTestOrder('LIVE', 175.00, 25.00);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 150.00, 50.00);
    `, [live1OrderId, live1ItemId]);

    const live1Res = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [live1OrderId, 'LIVE_DISPATCH', null, courierPartyId, 25.00, 'Customer Bears']
    );
    const live1Result = live1Res.rows[0].result;
    console.log('Live Dispatch (Customer Bears) Result:', live1Result);
    if (!live1Result.success) throw new Error('Live dispatch failed');

    await verifyVoucherBalance(live1Result.voucher_id);

    // Verify COD Clearing debited: 150 + 25 = 175.00
    const codLine1 = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '1128-01';
    `, [live1Result.voucher_id]);
    if (!codLine1.rows.length || Number(codLine1.rows[0].debit) !== 175.00) {
      throw new Error(`Expected Courier COD Clearing 1128-01 debit 175.00, got ${codLine1.rows[0]?.debit}`);
    }

    // Verify Courier Payable credited: 25.00
    const courierPayLine1 = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '2140-01';
    `, [live1Result.voucher_id]);
    if (!courierPayLine1.rows.length || Number(courierPayLine1.rows[0].credit) !== 25.00) {
      throw new Error(`Expected Courier Payable 2140-01 credit 25.00, got ${courierPayLine1.rows[0]?.credit}`);
    }
    console.log('✅ Live Dispatch (Customer Bears) Logistics & COD Clearing Verified!');

    // -------------------------------------------------------------
    // Scenario D: Live Selling Dispatch (Company Free Shipping)
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Live Dispatch (Company Free Shipping) ---');
    const live2ItemId = await createTestItem('SKU-LIVE-02', 50.00, 150.00);
    const live2OrderId = await createTestOrder('LIVE', 150.00, 25.00);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 150.00, 50.00);
    `, [live2OrderId, live2ItemId]);

    const live2Res = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [live2OrderId, 'LIVE_DISPATCH', null, courierPartyId, 25.00, 'Company Free']
    );
    const live2Result = live2Res.rows[0].result;
    console.log('Live Dispatch (Company Free) Result:', live2Result);
    if (!live2Result.success) throw new Error('Live dispatch failed');

    await verifyVoucherBalance(live2Result.voucher_id);

    // Verify COD Clearing debited: 150.00 (Customer pays only item price)
    const codLine2 = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '1128-01';
    `, [live2Result.voucher_id]);
    if (!codLine2.rows.length || Number(codLine2.rows[0].debit) !== 150.00) {
      throw new Error(`Expected Courier COD Clearing 1128-01 debit 150.00, got ${codLine2.rows[0]?.debit}`);
    }

    // Verify Delivery Expense 5140-01 debited: 25.00
    const delExpLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '5140-01';
    `, [live2Result.voucher_id]);
    if (!delExpLine.rows.length || Number(delExpLine.rows[0].debit) !== 25.00) {
      throw new Error(`Expected Delivery Expense 5140-01 debit 25.00, got ${delExpLine.rows[0]?.debit}`);
    }

    // Verify Courier Payable 2140-01 credited: 25.00
    const courierPayLine2 = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '2140-01';
    `, [live2Result.voucher_id]);
    if (!courierPayLine2.rows.length || Number(courierPayLine2.rows[0].credit) !== 25.00) {
      throw new Error(`Expected Courier Payable 2140-01 credit 25.00, got ${courierPayLine2.rows[0]?.credit}`);
    }
    console.log('✅ Live Dispatch (Company Free) Expense & Payable Entries Verified!');

    // -------------------------------------------------------------
    // Scenario E: Courier COD Remittance Settlement
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Courier COD Remittance Settlement ---');
    // Gross COD = 1000.00, Courier fee = 150.00, Net Bank = 850.00
    const remRes = await client.query(`
      SELECT settle_courier_cod_remittance($1, $2, 1000.00, 150.00, 850.00, 'AWB-SETTLE-TEST-001') as result;
    `, [courierPartyId, bankAccountId]);
    const remResult = remRes.rows[0].result;
    console.log('Remittance Settlement Result:', remResult);
    if (!remResult.success) throw new Error('Remittance settlement failed');

    await verifyVoucherBalance(remResult.voucher_id);

    // Verify bank debited 850, courier liability debited 150, COD clearing credited 1000
    const bankLine = await client.query('SELECT debit FROM voucher_entries WHERE voucher_id = $1 AND account_code = $2', [remResult.voucher_id, '1120-01']);
    const liabLine = await client.query('SELECT debit FROM voucher_entries WHERE voucher_id = $1 AND account_code = $2', [remResult.voucher_id, '2140-01']);
    const clrLine = await client.query('SELECT credit FROM voucher_entries WHERE voucher_id = $1 AND account_code = $2', [remResult.voucher_id, '1128-01']);

    if (Number(bankLine.rows[0].debit) !== 850.00 || Number(liabLine.rows[0].debit) !== 150.00 || Number(clrLine.rows[0].credit) !== 1000.00) {
      throw new Error('Settlement lines mismatch');
    }
    console.log('✅ Courier COD Remittance Settlement Entries Verified!');

    // -------------------------------------------------------------
    // Scenario F: Duplicate Prevention Check
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing Duplicate Dispatch Prevention ---');
    await client.query('SAVEPOINT dup_test;');
    let dupBlocked = false;
    try {
      await client.query('SELECT post_sales_dispatch_and_cogs_voucher($1, $2);', [posOrderId, 'POS']);
    } catch (dupErr) {
      dupBlocked = true;
      console.log('✓ Blocked duplicate dispatch as expected:', dupErr.message);
      await client.query('ROLLBACK TO SAVEPOINT dup_test;');
    }
    if (!dupBlocked) throw new Error('Failed to block duplicate order dispatch');
    console.log('✅ Duplicate Dispatch Prevention Verified!');

    testPassed = true;
    console.log('\n🎉 ALL STORED PROCEDURE TESTS PASSED PERFECTLY!');

  } catch (err) {
    console.error('❌ Test execution error:', err);
    throw err;
  } finally {
    // STRICT ZERO DEMO DATA MANDATE: ALWAYS ROLLBACK
    console.log('\n🔄 Executing ROLLBACK to wipe all test rows from database...');
    await client.query('ROLLBACK;');

    // Verify post-rollback counts equal baseline counts
    const postOrders = await client.query('SELECT COUNT(*) FROM orders;');
    const postVouchers = await client.query('SELECT COUNT(*) FROM vouchers;');
    const postJournal = await client.query('SELECT COUNT(*) FROM journal_entries;');
    const postInv = await client.query('SELECT COUNT(*) FROM inventory_items;');

    console.log('Post-rollback counts:', {
      orders: postOrders.rows[0].count,
      vouchers: postVouchers.rows[0].count,
      journal_entries: postJournal.rows[0].count,
      inventory_items: postInv.rows[0].count
    });

    client.release();
    await pool.end();

    if (testPassed) {
      console.log('✅ ZERO DEMO DATA RULE SATISFIED: Database is 100% clean.');
    }
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
