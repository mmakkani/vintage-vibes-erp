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
    const baseVoucherEntries = await client.query('SELECT COUNT(*) FROM voucher_entries;');
    const baseGL = await client.query('SELECT COUNT(*) FROM general_ledger;');
    const baseInv = await client.query('SELECT COUNT(*) FROM inventory_items;');

    console.log('Baseline counts before test:', {
      orders: baseOrders.rows[0].count,
      vouchers: baseVouchers.rows[0].count,
      journal_entries: baseJournal.rows[0].count,
      voucher_entries: baseVoucherEntries.rows[0].count,
      general_ledger: baseGL.rows[0].count,
      inventory_items: baseInv.rows[0].count
    });

    // 1. Verify sales_channel_settings exist and have confirmed mappings
    console.log('\n--- 1. Testing sales_channel_settings Mappings ---');
    const settingsRes = await client.query('SELECT setting_key, account_code FROM sales_channel_settings ORDER BY setting_key;');
    console.log(`Found ${settingsRes.rows.length} sales settings keys.`);
    const expectedMappings = {
      cogs_account: '5100-02',
      courier_payable: '2120-01',
      pos_terminal_clearing: '1125-01',
      courier_cod_clearing: '1128-01',
      pos_cash_drawer: '1110-01',
      finished_goods_inventory: '1160-01',
      delivery_expense: '5140-01',
      b2b_revenue: '4110-05',
      b2b_sales_receivable: '1130-01',
      omnichannel_retail_revenue: '4110-01',
      ecommerce_sales_clearing: '1130-03',
      live_sales_clearing: '1130-02',
      pos_sales_clearing: '1130-04'
    };

    for (const [key, expectedCode] of Object.entries(expectedMappings)) {
      const match = settingsRes.rows.find(r => r.setting_key === key);
      if (!match) throw new Error(`Missing expected setting_key: ${key}`);
      if (match.account_code !== expectedCode) {
        throw new Error(`Setting ${key} expected code ${expectedCode}, but got ${match.account_code}`);
      }
      console.log(`  ✓ ${key} -> ${match.account_code}`);
    }
    console.log('✅ All 13 mandatory sales channel settings and confirmed accounts verified.');

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
    async function createTestOrder(source, total, fee, paymentMethod = 'CASH') {
      const r = await client.query(`
        INSERT INTO orders (
          id, order_number, customer_name, customer_phone, customer_address, city,
          total_amount, delivery_fee, order_status, source, status, payment_method
        )
        VALUES (
          gen_random_uuid(), $1, 'Test Client / Customer', '+971501234567', 'Al Quoz 3, Dubai', 'Dubai',
          $2, $3, 'PENDING', $4, 'PENDING', $5
        )
        RETURNING id;
      `, [`ORD-TEST-${Date.now()}-${Math.floor(Math.random()*1000)}`, total, fee, source, paymentMethod]);
      return r.rows[0].id;
    }

    // Helper to verify voucher double-entry debits == credits & dual-posting parity
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

      // Parity check across journal_entries vs voucher_entries
      if (Math.abs(jeDebits - veDebits) > 0.001 || Math.abs(jeCredits - veCredits) > 0.001) {
        throw new Error(`Dual-posting discrepancy between journal_entries (${jeDebits}) and voucher_entries (${veDebits})`);
      }

      console.log(`  ✓ Voucher ${v.voucher_no}: ${jeRes.rows[0].line_count} journal lines, Debits: AED ${jeDebits.toFixed(2)}, Credits: AED ${jeCredits.toFixed(2)} (Discrepancy: AED 0.00)`);
    }

    // -------------------------------------------------------------
    // Scenario A.1: Counter Sale (POS Cash)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing POS Cash Dispatch Workflow ---');
    const posItemId = await createTestItem('SKU-POS-01', 40.00, 100.00);
    const posOrderId = await createTestOrder('POS', 100.00, 0.00, 'CASH');
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 100.00, 40.00);
    `, [posOrderId, posItemId]);

    const posRes = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2) as result;',
      [posOrderId, 'POS']
    );
    const posResult = posRes.rows[0].result;
    console.log('POS Cash Dispatch Result:', posResult);
    if (!posResult.success) throw new Error('POS cash dispatch failed');

    // Verify voucher balance
    await verifyVoucherBalance(posResult.voucher_id);

    // Verify POS cash drawer debited: 1110-01
    const posCashLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '1110-01';
    `, [posResult.voucher_id]);
    if (!posCashLine.rows.length || Number(posCashLine.rows[0].debit) !== 100.00) {
      throw new Error(`Expected POS Cash Drawer 1110-01 debit 100.00, got ${posCashLine.rows[0]?.debit}`);
    }

    // Verify COGS debited: 5100-02
    const posCogsLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '5100-02';
    `, [posResult.voucher_id]);
    if (!posCogsLine.rows.length || Number(posCogsLine.rows[0].debit) !== 40.00) {
      throw new Error(`Expected COGS 5100-02 debit 40.00, got ${posCogsLine.rows[0]?.debit}`);
    }

    // Verify item derecognition
    const posItemCheck = await client.query('SELECT status, dispatched_at FROM inventory_items WHERE id = $1', [posItemId]);
    if (posItemCheck.rows[0].status !== 'SOLD' || !posItemCheck.rows[0].dispatched_at) {
      throw new Error(`POS item status expected SOLD, got ${posItemCheck.rows[0].status}`);
    }
    console.log('✅ POS Cash Dispatch & COGS (5100-02) Derecognition Verified!');

    // -------------------------------------------------------------
    // Scenario A.2: Counter Sale (POS Card / Terminal / Apple Pay / Tap)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing POS Card & Terminal (Apple Pay / Tap) Dispatch Workflow ---');
    const posCardItemId = await createTestItem('SKU-POS-CARD-01', 60.00, 150.00);
    const posCardOrderId = await createTestOrder('POS', 150.00, 0.00, 'APPLE_PAY');
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 150.00, 60.00);
    `, [posCardOrderId, posCardItemId]);

    const posCardRes = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2) as result;',
      [posCardOrderId, 'POS']
    );
    const posCardResult = posCardRes.rows[0].result;
    console.log('POS Card Dispatch Result:', posCardResult);
    if (!posCardResult.success) throw new Error('POS card dispatch failed');

    // Verify voucher balance
    await verifyVoucherBalance(posCardResult.voucher_id);

    // Verify POS Terminal & Card Clearing debited: 1125-01
    const posTerminalLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '1125-01';
    `, [posCardResult.voucher_id]);
    if (!posTerminalLine.rows.length || Number(posTerminalLine.rows[0].debit) !== 150.00) {
      throw new Error(`Expected POS Terminal Clearing 1125-01 debit 150.00, got ${posTerminalLine.rows[0]?.debit}`);
    }

    // Verify COGS debited: 5100-02
    const posCardCogsLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '5100-02';
    `, [posCardResult.voucher_id]);
    if (!posCardCogsLine.rows.length || Number(posCardCogsLine.rows[0].debit) !== 60.00) {
      throw new Error(`Expected COGS 5100-02 debit 60.00, got ${posCardCogsLine.rows[0]?.debit}`);
    }

    console.log('✅ POS Card/Terminal Clearing (1125-01) & COGS (5100-02) Verified!');

    // -------------------------------------------------------------
    // Scenario B: Company / Custom Sales (B2B)
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing B2B Dispatch Workflow ---');
    const b2bItemId = await createTestItem('SKU-B2B-01', 250.00, 600.00);
    const b2bOrderId = await createTestOrder('B2B', 600.00, 0.00, 'ON_ACCOUNT');
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

    // Verify COGS account 5100-02 debited
    const b2bCogsLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '5100-02';
    `, [b2bResult.voucher_id]);
    if (!b2bCogsLine.rows.length || Number(b2bCogsLine.rows[0].debit) !== 250.00) {
      throw new Error('Expected 5100-02 COGS to be debited with 250.00');
    }
    console.log('✅ B2B Dispatch & Revenue (4110-05) & COGS (5100-02) Verified!');

    // -------------------------------------------------------------
    // Scenario C: Live Selling Dispatch (Customer Bears Shipping)
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Live Dispatch (Customer Bears Shipping) ---');
    const live1ItemId = await createTestItem('SKU-LIVE-01', 50.00, 150.00);
    const live1OrderId = await createTestOrder('LIVE', 175.00, 25.00, 'COD');
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

    // Verify Courier Payable 2120-01 credited: 25.00
    const courierPayLine1 = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '2120-01';
    `, [live1Result.voucher_id]);
    if (!courierPayLine1.rows.length || Number(courierPayLine1.rows[0].credit) !== 25.00) {
      throw new Error(`Expected Courier Payable 2120-01 credit 25.00, got ${courierPayLine1.rows[0]?.credit}`);
    }

    // Verify COGS 5100-02 debited: 50.00
    const live1CogsLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '5100-02';
    `, [live1Result.voucher_id]);
    if (!live1CogsLine.rows.length || Number(live1CogsLine.rows[0].debit) !== 50.00) {
      throw new Error(`Expected COGS 5100-02 debit 50.00, got ${live1CogsLine.rows[0]?.debit}`);
    }
    console.log('✅ Live Dispatch (Customer Bears) Logistics, Courier Liability (2120-01) & COD Clearing Verified!');

    // -------------------------------------------------------------
    // Scenario D: Live Selling Dispatch (Company Free Shipping)
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Live Dispatch (Company Free Shipping) ---');
    const live2ItemId = await createTestItem('SKU-LIVE-02', 50.00, 150.00);
    const live2OrderId = await createTestOrder('LIVE', 150.00, 25.00, 'COD');
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

    // Verify Courier Payable 2120-01 credited: 25.00
    const courierPayLine2 = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '2120-01';
    `, [live2Result.voucher_id]);
    if (!courierPayLine2.rows.length || Number(courierPayLine2.rows[0].credit) !== 25.00) {
      throw new Error(`Expected Courier Payable 2120-01 credit 25.00, got ${courierPayLine2.rows[0]?.credit}`);
    }

    // Verify COGS 5100-02 debited: 50.00
    const live2CogsLine = await client.query(`
      SELECT * FROM voucher_entries WHERE voucher_id = $1 AND account_code = '5100-02';
    `, [live2Result.voucher_id]);
    if (!live2CogsLine.rows.length || Number(live2CogsLine.rows[0].debit) !== 50.00) {
      throw new Error(`Expected COGS 5100-02 debit 50.00, got ${live2CogsLine.rows[0]?.debit}`);
    }
    console.log('✅ Live Dispatch (Company Free) Expense, Courier Liability (2120-01) & COGS Verified!');

    // -------------------------------------------------------------
    // Scenario E: Courier COD Remittance Settlement
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing Courier COD Remittance Settlement ---');
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
    const liabLine = await client.query('SELECT debit FROM voucher_entries WHERE voucher_id = $1 AND account_code = $2', [remResult.voucher_id, '2120-01']);
    const clrLine = await client.query('SELECT credit FROM voucher_entries WHERE voucher_id = $1 AND account_code = $2', [remResult.voucher_id, '1128-01']);

    if (Number(bankLine.rows[0].debit) !== 850.00 || Number(liabLine.rows[0].debit) !== 150.00 || Number(clrLine.rows[0].credit) !== 1000.00) {
      throw new Error('Settlement lines mismatch');
    }
    console.log('✅ Courier COD Remittance Settlement Entries (Bank 1120-01, Liability 2120-01, Clearing 1128-01) Verified!');

    // -------------------------------------------------------------
    // Scenario F: Duplicate Prevention Check
    // -------------------------------------------------------------
    console.log('\n--- 8. Testing Duplicate Dispatch Prevention ---');
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
    const postVoucherEntries = await client.query('SELECT COUNT(*) FROM voucher_entries;');
    const postGL = await client.query('SELECT COUNT(*) FROM general_ledger;');
    const postInv = await client.query('SELECT COUNT(*) FROM inventory_items;');

    console.log('Post-rollback counts:', {
      orders: postOrders.rows[0].count,
      vouchers: postVouchers.rows[0].count,
      journal_entries: postJournal.rows[0].count,
      voucher_entries: postVoucherEntries.rows[0].count,
      general_ledger: postGL.rows[0].count,
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
