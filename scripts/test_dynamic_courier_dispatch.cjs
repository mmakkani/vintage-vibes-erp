const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runDynamicCourierTests() {
  const client = await pool.connect();

  try {
    console.log('🔒 Starting Dynamic Courier Dispatch & Fallback Verification inside atomic BEGIN ... ROLLBACK;');
    await client.query('BEGIN;');

    // Baseline counts to guarantee ZERO DEMO DATA persists
    const baseOrders = await client.query('SELECT COUNT(*) FROM orders;');
    const baseVouchers = await client.query('SELECT COUNT(*) FROM vouchers;');
    const baseJournal = await client.query('SELECT COUNT(*) FROM journal_entries;');
    const baseVoucherEntries = await client.query('SELECT COUNT(*) FROM voucher_entries;');
    const baseGL = await client.query('SELECT COUNT(*) FROM general_ledger;');
    const baseInv = await client.query('SELECT COUNT(*) FROM inventory_items;');
    const baseParties = await client.query('SELECT COUNT(*) FROM parties;');

    const initialCounts = {
      orders: Number(baseOrders.rows[0].count),
      vouchers: Number(baseVouchers.rows[0].count),
      journal_entries: Number(baseJournal.rows[0].count),
      voucher_entries: Number(baseVoucherEntries.rows[0].count),
      general_ledger: Number(baseGL.rows[0].count),
      inventory_items: Number(baseInv.rows[0].count),
      parties: Number(baseParties.rows[0].count)
    };

    console.log('📊 Baseline counts before test:', initialCounts);

    // Verify courier parties and their registered COA accounts
    console.log('\n--- 1. Verifying Courier Parties & Linked Accounts ---');
    const couriersRes = await client.query(`
      SELECT p.party_id, p.code, p.name, p.company_name, p.account_id, a.account_code, a.account_name
      FROM parties p
      LEFT JOIN accounts a ON p.account_id = a.account_id
      WHERE p.party_type = 'COURIER' OR p.type = 'COURIER'
      ORDER BY p.party_id;
    `);

    console.log(`Found ${couriersRes.rows.length} registered courier parties in database:`);
    for (const c of couriersRes.rows) {
      console.log(`  • Party #${c.party_id} (${c.code || 'N/A'}) - ${c.name || c.company_name}: Account ID ${c.account_id} -> ${c.account_code} (${c.account_name})`);
    }

    const dhl = couriersRes.rows.find(c => c.account_code === '2120-01' || (c.name && c.name.includes('DHL')));
    const aramex = couriersRes.rows.find(c => c.account_code === '2120-02' || (c.name && c.name.includes('Aramex')));
    const smsa = couriersRes.rows.find(c => c.account_code === '2120-03' || (c.name && c.name.includes('SMSA')));

    if (!dhl) throw new Error('DHL Express (2120-01) party not found in database');
    if (!aramex) throw new Error('Aramex Logistics (2120-02) party not found in database');

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
    async function createTestOrder(source, total, fee, courierPartyId = null, courierPartnerId = null) {
      const r = await client.query(`
        INSERT INTO orders (
          id, order_number, customer_name, customer_phone, customer_address, city,
          total_amount, delivery_fee, order_status, source, status, payment_method,
          courier_party_id, courier_partner_id
        )
        VALUES (
          gen_random_uuid(), $1, 'Test Live Stream Buyer', '+971501112233', 'Dubai Marina', 'Dubai',
          $2, $3, 'PENDING', $4, 'PENDING', 'COD',
          $5, $6
        )
        RETURNING id;
      `, [
        `ORD-COURIER-TEST-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        total,
        fee,
        source,
        courierPartyId,
        courierPartnerId
      ]);
      return r.rows[0].id;
    }

    // Helper to verify voucher double-entry debits == credits & dual-posting parity
    async function verifyVoucher(voucherId, expectedCourierCode, expectedCourierAmount) {
      const vRes = await client.query('SELECT * FROM vouchers WHERE id = $1', [voucherId]);
      if (!vRes.rows.length) throw new Error(`Voucher ${voucherId} not found`);
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
      if (Math.abs(jeDebits - jeCredits) > 0.001) {
        throw new Error(`journal_entries imbalance: Debits ${jeDebits} != Credits ${jeCredits}`);
      }

      // Check voucher_entries
      const veRes = await client.query(`
        SELECT COALESCE(SUM(debit), 0) as debits, COALESCE(SUM(credit), 0) as credits, COUNT(*) as line_count
        FROM voucher_entries WHERE voucher_id = $1;
      `, [voucherId]);
      const veDebits = Number(veRes.rows[0].debits);
      const veCredits = Number(veRes.rows[0].credits);
      if (Math.abs(veDebits - veCredits) > 0.001) {
        throw new Error(`voucher_entries imbalance: Debits ${veDebits} != Credits ${veCredits}`);
      }

      // Check general_ledger
      const glRes = await client.query(`
        SELECT COALESCE(SUM(debit), 0) as debits, COALESCE(SUM(credit), 0) as credits, COUNT(*) as line_count
        FROM general_ledger WHERE voucher_id = $1;
      `, [voucherId]);
      const glDebits = Number(glRes.rows[0].debits);
      const glCredits = Number(glRes.rows[0].credits);
      if (Math.abs(glDebits - glCredits) > 0.001) {
        throw new Error(`general_ledger imbalance: Debits ${glDebits} != Credits ${glCredits}`);
      }

      // Parity check across journal_entries vs voucher_entries
      if (Math.abs(jeDebits - veDebits) > 0.001 || Math.abs(jeCredits - veCredits) > 0.001) {
        throw new Error(`Dual-posting discrepancy: journal_entries (${jeDebits}) vs voucher_entries (${veDebits})`);
      }

      // Check specific courier liability credit line
      if (expectedCourierCode && expectedCourierAmount > 0) {
        const courierLine = await client.query(`
          SELECT * FROM voucher_entries
          WHERE voucher_id = $1 AND account_code = $2 AND credit > 0;
        `, [voucherId, expectedCourierCode]);

        if (!courierLine.rows.length) {
          const allLines = await client.query(`
            SELECT account_code, debit, credit FROM voucher_entries WHERE voucher_id = $1;
          `, [voucherId]);
          console.error('All voucher lines generated:', allLines.rows);
          throw new Error(`Expected courier liability credit line for account ${expectedCourierCode} not found in voucher ${v.voucher_no}`);
        }

        const actualCredit = Number(courierLine.rows[0].credit);
        if (Math.abs(actualCredit - expectedCourierAmount) > 0.001) {
          throw new Error(`Expected courier credit amount AED ${expectedCourierAmount}, got AED ${actualCredit}`);
        }
        console.log(`  ✓ Courier liability correctly credited to ${expectedCourierCode} for AED ${actualCredit.toFixed(2)}`);
      }

      console.log(`  ✓ Voucher ${v.voucher_no}: Debits AED ${jeDebits.toFixed(2)} = Credits AED ${jeCredits.toFixed(2)} (Discrepancy: 0.00)`);
    }

    // -------------------------------------------------------------
    // Scenario 1: Dynamic Courier A (DHL Express UAE -> 2120-01)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Dynamic Courier A: DHL Express UAE (2120-01) ---');
    const itemA = await createTestItem('SKU-DHL-01', 50.00, 150.00);
    const orderA = await createTestOrder('LIVE_CLAIM', 175.00, 25.00, null, dhl.party_id);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 150.00, 50.00);
    `, [orderA, itemA]);

    const resA = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [orderA, 'LIVE_CLAIM', null, String(dhl.party_id), 25.00, 'Customer Bears']
    );
    const resultA = resA.rows[0].result;
    console.log('DHL Dispatch Result:', resultA);
    if (!resultA.success) throw new Error(`DHL dispatch failed: ${resultA.error}`);
    await verifyVoucher(resultA.voucher_id, '2120-01', 25.00);
    console.log('✅ Scenario 1 (DHL 2120-01) Verified!');

    // -------------------------------------------------------------
    // Scenario 2: Dynamic Courier B (Aramex Logistics UAE -> 2120-02)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Dynamic Courier B: Aramex Logistics UAE (2120-02) ---');
    const itemB = await createTestItem('SKU-ARX-01', 60.00, 180.00);
    const orderB = await createTestOrder('LIVE_CLAIM', 215.00, 35.00, null, aramex.party_id);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 180.00, 60.00);
    `, [orderB, itemB]);

    const resB = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [orderB, 'LIVE_CLAIM', null, String(aramex.party_id), 35.00, 'Customer Bears']
    );
    const resultB = resB.rows[0].result;
    console.log('Aramex Dispatch Result:', resultB);
    if (!resultB.success) throw new Error(`Aramex dispatch failed: ${resultB.error}`);
    await verifyVoucher(resultB.voucher_id, '2120-02', 35.00);
    console.log('✅ Scenario 2 (Aramex 2120-02) Verified!');

    // -------------------------------------------------------------
    // Scenario 3: Dynamic Courier C (SMSA Express GCC -> 2120-03)
    // -------------------------------------------------------------
    if (smsa) {
      console.log('\n--- 4. Testing Dynamic Courier C: SMSA Express GCC (2120-03) ---');
      const itemC = await createTestItem('SKU-SMSA-01', 45.00, 130.00);
      const orderC = await createTestOrder('LIVE_CLAIM', 160.00, 30.00, null, smsa.party_id);
      await client.query(`
        INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
        VALUES ($1, $2, 1, 130.00, 45.00);
      `, [orderC, itemC]);

      const resC = await client.query(
        'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
        [orderC, 'LIVE_CLAIM', null, String(smsa.party_id), 30.00, 'Customer Bears']
      );
      const resultC = resC.rows[0].result;
      console.log('SMSA Dispatch Result:', resultC);
      if (!resultC.success) throw new Error(`SMSA dispatch failed: ${resultC.error}`);
      await verifyVoucher(resultC.voucher_id, '2120-03', 30.00);
      console.log('✅ Scenario 3 (SMSA 2120-03) Verified!');
    }

    // -------------------------------------------------------------
    // Scenario 4: Fallback Continuity Test 1 (No courier specified: NULL)
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Fallback Continuity: NULL Courier ---');
    const itemD = await createTestItem('SKU-FALLBACK-01', 30.00, 90.00);
    const orderD = await createTestOrder('TIKTOK', 110.00, 20.00, null, null);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 90.00, 30.00);
    `, [orderD, itemD]);

    // Dispatch without courier specified
    const resD = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [orderD, 'TIKTOK', null, null, 20.00, 'Customer Bears']
    );
    const resultD = resD.rows[0].result;
    console.log('NULL Courier Dispatch Result:', resultD);
    if (!resultD.success) throw new Error(`Fallback dispatch failed: ${resultD.error}`);
    // Should credit default courier control account (2120-00 or 2120-01)
    const fallbackSetting = await client.query(`
      SELECT account_code FROM sales_channel_settings WHERE setting_key = 'courier_payable';
    `);
    const defaultCourierCode = fallbackSetting.rows[0]?.account_code || '2120-01';
    await verifyVoucher(resultD.voucher_id, defaultCourierCode, 20.00);
    console.log(`✅ Scenario 4a (NULL Courier seamlessly fell back to ${defaultCourierCode}) Verified!`);

    // -------------------------------------------------------------
    // Scenario 5: Fallback Continuity Test 2 (Party with NO linked account)
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Fallback Continuity: Party with NO linked account ---');
    const unlinkedParty = await client.query(`
      INSERT INTO parties (party_type, name, company_name, phone, account_id)
      VALUES ('COURIER', 'Unlinked Freight Co', 'Unlinked Freight Co', '+971509999999', NULL)
      RETURNING party_id;
    `);
    const unlinkedPartyId = unlinkedParty.rows[0].party_id;

    const itemE = await createTestItem('SKU-UNLINKED-01', 25.00, 80.00);
    const orderE = await createTestOrder('LIVE_CLAIM', 105.00, 25.00, null, unlinkedPartyId);
    await client.query(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, cost_price)
      VALUES ($1, $2, 1, 80.00, 25.00);
    `, [orderE, itemE]);

    const resE = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [orderE, 'LIVE_CLAIM', null, String(unlinkedPartyId), 25.00, 'Customer Bears']
    );
    const resultE = resE.rows[0].result;
    console.log('Unlinked Courier Dispatch Result:', resultE);
    if (!resultE.success) throw new Error(`Unlinked party dispatch failed: ${resultE.error}`);
    await verifyVoucher(resultE.voucher_id, defaultCourierCode, 25.00);
    console.log(`✅ Scenario 4b (Unlinked Party seamlessly fell back to ${defaultCourierCode}) Verified!`);

    // -------------------------------------------------------------
    // Rollback and verify Zero Demo Data
    // -------------------------------------------------------------
    console.log('\n--- 7. Atomic ROLLBACK & Zero Demo Data Verification ---');
    await client.query('ROLLBACK;');
    console.log('🔒 Transaction successfully rolled back.');

    // Query post-rollback counts
    const afterOrders = await client.query('SELECT COUNT(*) FROM orders;');
    const afterVouchers = await client.query('SELECT COUNT(*) FROM vouchers;');
    const afterJournal = await client.query('SELECT COUNT(*) FROM journal_entries;');
    const afterVoucherEntries = await client.query('SELECT COUNT(*) FROM voucher_entries;');
    const afterGL = await client.query('SELECT COUNT(*) FROM general_ledger;');
    const afterInv = await client.query('SELECT COUNT(*) FROM inventory_items;');
    const afterParties = await client.query('SELECT COUNT(*) FROM parties;');

    const postCounts = {
      orders: Number(afterOrders.rows[0].count),
      vouchers: Number(afterVouchers.rows[0].count),
      journal_entries: Number(afterJournal.rows[0].count),
      voucher_entries: Number(afterVoucherEntries.rows[0].count),
      general_ledger: Number(afterGL.rows[0].count),
      inventory_items: Number(afterInv.rows[0].count),
      parties: Number(afterParties.rows[0].count)
    };

    console.log('📊 Counts after rollback:', postCounts);

    for (const [table, count] of Object.entries(initialCounts)) {
      if (postCounts[table] !== count) {
        throw new Error(`Data persistence leak detected in ${table}! Baseline: ${count}, After: ${postCounts[table]}`);
      }
    }

    console.log('✅ ZERO DEMO DATA MANDATE VERIFIED: All test orders, vouchers, entries, and inventory items were fully rolled back. Production is 100% clean.');

  } catch (err) {
    await client.query('ROLLBACK;').catch(() => {});
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runDynamicCourierTests();
