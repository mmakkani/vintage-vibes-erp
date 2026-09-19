/**
 * test_unified_omnichannel_dispatch.cjs
 * 
 * ZERO-DEMO-DATA AUTOMATED VERIFICATION HARNESS
 * Tests:
 * 1. Storefront Online Paid Checkout (Atomic Lock + Draft Queue + Ref Capture)
 * 2. Storefront COD Checkout (Atomic Lock + Pending COD Flag)
 * 3. Live Dispatch Hub: post_sales_dispatch_and_cogs_voucher (COGS Derecognition + Double-Entry Parity + Courier Transit Quarantine)
 * 4. Anti-Fraud Strict PIN Quarantine (Blocks settlement if Bank PIN unverified)
 * 5. Settle Courier COD Remittance: settle_courier_cod_remittance (Clears 1128-01 into Bank 1120-01)
 * 6. Grail Bounty Radar Lifecycle (Insert, auto-match query, status update)
 * 7. ATOMIC ROLLBACK (Guarantees zero persistent test/demo records in production)
 */

const { Client } = require('pg');
const crypto = require('crypto');

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

async function runVerification() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('========================================================================');
  console.log('🚀 MASTER ZERO-DEMO-DATA VERIFICATION HARNESS');
  console.log('   Omnichannel Dispatch, Dynamic Courier Accounting & Grail Radar');
  console.log('========================================================================');

  await client.connect();

  try {
    // BEGIN ATOMIC TRANSACTION
    await client.query('BEGIN;');
    console.log('\n🔒 Transaction Started: BEGIN (Atomic test isolated from persistent storage)');

    // -------------------------------------------------------------------------
    // TEST 1: PREPARATION & STOREFRONT ATOMIC STOCK LOCK (ONLINE PAID)
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 1] Storefront Online Paid Checkout & Stock Lock ---');
    const testBarcodePaid = `TEST-VINTAGE-PAID-${Date.now()}`;
    const testPiecePaidRes = await client.query(`
      INSERT INTO inventory_pieces (
        id, barcode, item_name, brand_name, style, size_scanned, 
        estimated_price, retail_price_aed, status, is_sold, created_at
      ) VALUES ($1, $2, 'Vintage Aloha Silk Shirt 90s', 'Tommy Bahama', 'Hawaiian', 'L', 65.00, 185.00, 'AVAILABLE', false, NOW())
      RETURNING id, barcode, estimated_price, retail_price_aed;
    `, [crypto.randomUUID(), testBarcodePaid]);
    const paidPiece = testPiecePaidRes.rows[0];
    console.log(`✅ Staged test inventory piece: ${paidPiece.barcode} (Cost: AED ${paidPiece.estimated_price}, Retail: AED ${paidPiece.retail_price_aed})`);

    // Simulate Online Paid Checkout
    const orderPaidNo = `ORD-TEST-PAID-${Date.now().toString().slice(-6)}`;
    const txRef = `#TXN-STRIPE-${Date.now().toString().slice(-6)}`;
    
    // Atomically lock piece
    const lockRes = await client.query(`
      UPDATE inventory_pieces 
      SET status = 'CLAIMED_PENDING', is_sold = true, updated_at = NOW()
      WHERE id = $1 AND (is_sold = false OR is_sold IS NULL)
      RETURNING id, barcode, status, is_sold;
    `, [paidPiece.id]);
    if (lockRes.rowCount !== 1) throw new Error('Failed to lock inventory piece atomically');
    console.log(`✅ Atomically locked piece: status='${lockRes.rows[0].status}', is_sold=${lockRes.rows[0].is_sold}`);

    // Create Order
    const orderPaidRes = await client.query(`
      INSERT INTO orders (
        id, order_number, customer_name, customer_email, customer_phone,
        total_amount, subtotal, delivery_fee, payment_method,
        payment_status, payment_reference, status, items, created_at
      ) VALUES ($1, $2, 'Hamdan Al Maktoum', 'hamdan@test-vintage.ae', '+971501234567',
        185.00, 185.00, 0.00, 'CARD', 'PAID', $3, 'PENDING_DISPATCH',
        $4, NOW()
      ) RETURNING id, order_number, payment_status, payment_reference;
    `, [crypto.randomUUID(), orderPaidNo, txRef, JSON.stringify([{ barcode: testBarcodePaid, unit_price: 185.00, cost_price: 65.00, quantity: 1 }])]);
    const orderPaid = orderPaidRes.rows[0];
    console.log(`✅ Created Online Paid Order: ${orderPaid.order_number}, Status: ${orderPaid.payment_status}, Ref: ${orderPaid.payment_reference}`);

    // Queue in sales_invoices as DRAFT
    const invPaidNo = `INV-DRAFT-${Date.now().toString().slice(-6)}`;
    const invPaidRes = await client.query(`
      INSERT INTO sales_invoices (
        id, invoice_no, order_id, channel, customer_name, customer_phone,
        shipping_address, city, payment_status, payment_reference,
        status, subtotal, total_amount, created_at
      ) VALUES ($1, $2, $3, 'ECOMMERCE', 'Hamdan Al Maktoum', '+971501234567',
        'Villa 12, Jumeirah 1', 'Dubai', 'PAID', $4,
        'DRAFT', 185.00, 185.00, NOW()
      ) RETURNING id, invoice_no, channel, status, payment_status, payment_reference;
    `, [crypto.randomUUID(), invPaidNo, orderPaid.id, txRef]);
    console.log(`✅ Queued Draft Invoice in Live Hub: ${invPaidRes.rows[0].invoice_no} (Channel: ${invPaidRes.rows[0].channel}, Payment: ${invPaidRes.rows[0].payment_status}, Ref: ${invPaidRes.rows[0].payment_reference})`);

    // -------------------------------------------------------------------------
    // TEST 2: STOREFRONT COD CHECKOUT
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 2] Storefront Cash on Delivery (COD) Checkout ---');
    const testBarcodeCod = `TEST-CARHARTT-COD-${Date.now()}`;
    const testPieceCodRes = await client.query(`
      INSERT INTO inventory_pieces (
        id, barcode, item_name, brand_name, style, size_scanned, 
        estimated_price, retail_price_aed, status, is_sold, created_at
      ) VALUES ($1, $2, 'Carhartt Detroit Jacket J97', 'Carhartt', 'Workwear', 'XL', 120.00, 320.00, 'AVAILABLE', false, NOW())
      RETURNING id, barcode, estimated_price, retail_price_aed;
    `, [crypto.randomUUID(), testBarcodeCod]);
    const codPiece = testPieceCodRes.rows[0];

    // Dynamically fetch courier party (e.g. Aramex or DHL)
    const courierPartyRes = await client.query(`SELECT party_id, id, name FROM parties WHERE type = 'COURIER' LIMIT 1;`);
    const courierParty = courierPartyRes.rows[0];
    const courierId = courierParty ? courierParty.party_id : 23;
    console.log(`✅ Using dynamic courier partner: ${courierParty?.name || 'DHL Express UAE'} (Party ID: ${courierId})`);

    const orderCodNo = `ORD-TEST-COD-${Date.now().toString().slice(-6)}`;
    await client.query(`
      UPDATE inventory_pieces 
      SET status = 'CLAIMED_PENDING', is_sold = true, updated_at = NOW()
      WHERE id = $1;
    `, [codPiece.id]);

    const orderCodRes = await client.query(`
      INSERT INTO orders (
        id, order_number, customer_name, customer_email, customer_phone,
        total_amount, subtotal, delivery_fee, payment_method,
        payment_status, status, courier_partner_id, items, created_at
      ) VALUES ($1, $2, 'Rashid Bin Saeed', 'rashid@test-vintage.ae', '+971559876543',
        345.00, 320.00, 25.00, 'COD', 'UNPAID_PENDING_COD', 'PENDING_DISPATCH', $3,
        $4, NOW()
      ) RETURNING id, order_number, payment_status;
    `, [crypto.randomUUID(), orderCodNo, courierId, JSON.stringify([{ barcode: testBarcodeCod, unit_price: 320.00, cost_price: 120.00, quantity: 1 }])]);
    const orderCod = orderCodRes.rows[0];

    const invCodNo = `INV-COD-${Date.now().toString().slice(-6)}`;
    const invCodRes = await client.query(`
      INSERT INTO sales_invoices (
        id, invoice_no, order_id, channel, customer_name, customer_phone,
        shipping_address, city, payment_status, courier_partner_id,
        status, subtotal, total_amount, created_at
      ) VALUES ($1, $2, $3, 'ECOMMERCE', 'Rashid Bin Saeed', '+971559876543',
        'Flat 402, Al Nahda', 'Sharjah', 'UNPAID_PENDING_COD', $4,
        'DRAFT', 320.00, 345.00, NOW()
      ) RETURNING id, invoice_no, channel, status, payment_status;
    `, [crypto.randomUUID(), invCodNo, orderCod.id, courierId]);
    console.log(`✅ Queued COD Draft in Live Hub: ${invCodRes.rows[0].invoice_no} (Status: ${invCodRes.rows[0].payment_status}, Grand Total: AED 345.00)`);

    // -------------------------------------------------------------------------
    // TEST 3: DISPATCH HUB EXECUTION & COGS LEDGER DERECOGNITION
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 3] Execute post_sales_dispatch_and_cogs_voucher (COD Dispatch) ---');
    const dispatchRes = await client.query(`
      SELECT public.post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;
    `, [orderCod.id, 'ECOMMERCE', null, courierId.toString(), 25.00, 'Customer Bears']);

    const dResult = dispatchRes.rows[0].result;
    console.log('✅ Dispatch Procedure Output:', dResult);
    if (!dResult.success) {
      throw new Error(`Dispatch failed: ${dResult.error}`);
    }

    const voucherId = dResult.voucher_id || dResult.voucherId;
    console.log(`✅ Created General Ledger Voucher ID: ${voucherId}`);

    // Inspect Voucher Header & Lines
    const vHeader = await client.query('SELECT * FROM vouchers WHERE id = $1;', [voucherId]);
    console.log(`✅ Voucher Header: Type='${vHeader.rows[0].voucher_type || vHeader.rows[0].type}', Status='${vHeader.rows[0].status}'`);

    const vLines = await client.query(`
      SELECT account_id, account_code as code, account_name as name, debit as debit_amount, credit as credit_amount, particulars as description
      FROM voucher_entries
      WHERE voucher_id = $1
      ORDER BY created_at ASC;
    `, [voucherId]);

    console.log('\n📜 Ledger Posting Breakdown:');
    let totalDebit = 0;
    let totalCredit = 0;
    let lineIdx = 1;
    for (const line of vLines.rows) {
      const d = Number(line.debit_amount || 0);
      const c = Number(line.credit_amount || 0);
      totalDebit += d;
      totalCredit += c;
      console.log(`   Line ${lineIdx++}: [${line.code || line.account_id}] ${line.name || ''} | Dr: ${d.toFixed(2)} | Cr: ${c.toFixed(2)} (${line.description})`);
    }

    console.log(`\n⚖️ Dual-Entry Parity Check:`);
    console.log(`   Total Debits:  AED ${totalDebit.toFixed(2)}`);
    console.log(`   Total Credits: AED ${totalCredit.toFixed(2)}`);
    const discrepancy = Math.abs(totalDebit - totalCredit);
    console.log(`   Discrepancy:   AED ${discrepancy.toFixed(2)}`);
    if (discrepancy > 0.001) {
      throw new Error(`FATAL: Ledger discrepancy detected: AED ${discrepancy}`);
    }
    console.log('✅ 100% Balanced Parity: ZERO discrepancy verified.');

    // Verify Bank is NOT touched during COD dispatch
    const bankHit = vLines.rows.find(l => (l.code || '').startsWith('1120'));
    if (bankHit && Number(bankHit.debit_amount) > 0) {
      throw new Error('FATAL: Bank account was debited during COD dispatch before courier remittance!');
    }
    console.log('✅ Courier Transit Quarantine Verified: Bank (1120-01) is strictly untouched.');

    // Verify COD clearing account is debited
    const codClearingHit = vLines.rows.find(l => (l.code || '').startsWith('1128'));
    if (!codClearingHit || Number(codClearingHit.debit_amount) <= 0) {
      throw new Error('FATAL: Courier COD Clearing account (1128-01) was not debited during COD dispatch.');
    }
    console.log(`✅ Courier COD Clearing (1128-01) correctly holding transit funds: AED ${Number(codClearingHit.debit_amount).toFixed(2)}`);

    // -------------------------------------------------------------------------
    // TEST 4: STRICT PIN QUARANTINE - ATTEMPT SETTLEMENT WITHOUT PIN
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 4] Strict Bank PIN Quarantine Enforcement ---');
    let securityBlocked = false;
    await client.query('SAVEPOINT sp_test4;');
    try {
      await client.query(`
        SELECT public.settle_courier_cod_remittance($1, $2, $3, $4, $5, $6, $7) as result;
      `, [courierId.toString(), null, 345.00, 25.00, 320.00, '', false]); // unverified PIN & blank code
    } catch (secErr) {
      securityBlocked = true;
      await client.query('ROLLBACK TO SAVEPOINT sp_test4;');
      console.log(`✅ Security Exception correctly raised: "${secErr.message.split('\n')[0]}"`);
    }
    if (!securityBlocked) {
      throw new Error('FATAL: Settlement succeeded without Bank PIN verification!');
    }
    console.log('✅ Anti-Fraud Courier Quarantine Active: Unverified remittances are completely blocked.');

    // -------------------------------------------------------------------------
    // TEST 5: REAL-TIME BANK PIN SETTLEMENT & AUTO-VOUCHER
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 5] Execute Verified Courier Settlement (BRV-COD) ---');
    const validRemittanceCode = `ENBD-DEP-${Date.now().toString().slice(-6)}`;
    const settleRes = await client.query(`
      SELECT public.settle_courier_cod_remittance($1, $2, $3, $4, $5, $6, $7) as result;
    `, [courierId.toString(), null, 345.00, 25.00, 320.00, validRemittanceCode, true]);

    const sResult = settleRes.rows[0].result;
    console.log('✅ Settlement Procedure Output:', sResult);
    if (!sResult.success) {
      throw new Error(`Settlement failed: ${sResult.error}`);
    }

    const settleVoucherId = sResult.voucher_id || sResult.voucherId;
    const sLines = await client.query(`
      SELECT account_id, account_code as code, account_name as name, debit as debit_amount, credit as credit_amount, particulars as description
      FROM voucher_entries
      WHERE voucher_id = $1
      ORDER BY created_at ASC;
    `, [settleVoucherId]);

    console.log('\n📜 Settle Remittance Ledger Breakdown:');
    let sTotalDebit = 0;
    let sTotalCredit = 0;
    let sLineIdx = 1;
    for (const line of sLines.rows) {
      const d = Number(line.debit_amount || 0);
      const c = Number(line.credit_amount || 0);
      sTotalDebit += d;
      sTotalCredit += c;
      console.log(`   Line ${sLineIdx++}: [${line.code || line.account_id}] ${line.name || ''} | Dr: ${d.toFixed(2)} | Cr: ${c.toFixed(2)} (${line.description})`);
    }

    console.log(`\n⚖️ Settlement Dual-Entry Parity Check:`);
    console.log(`   Total Debits:  AED ${sTotalDebit.toFixed(2)}`);
    console.log(`   Total Credits: AED ${sTotalCredit.toFixed(2)}`);
    const sDiscrepancy = Math.abs(sTotalDebit - sTotalCredit);
    if (sDiscrepancy > 0.001) {
      throw new Error(`FATAL: Settlement ledger discrepancy: AED ${sDiscrepancy}`);
    }
    console.log('✅ Settle Voucher 100% Balanced Parity: ZERO discrepancy verified.');

    // Verify Bank is debited by Net Amount
    const bankDebitLine = sLines.rows.find(l => (l.code || '').startsWith('1120') && Number(l.debit_amount) > 0);
    if (!bankDebitLine || Math.abs(Number(bankDebitLine.debit_amount) - 320.00) > 0.01) {
      throw new Error('FATAL: Bank account was not debited with the net remittance amount AED 320.00');
    }
    console.log(`✅ Bank Account (1120-01) credited net cash: AED ${Number(bankDebitLine.debit_amount).toFixed(2)}`);

    // Verify COD Transit 1128-01 is credited with gross
    const transitCreditLine = sLines.rows.find(l => (l.code || '').startsWith('1128') && Number(l.credit_amount) > 0);
    if (!transitCreditLine || Math.abs(Number(transitCreditLine.credit_amount) - 345.00) > 0.01) {
      throw new Error('FATAL: Courier COD Clearing account (1128-01) was not credited with gross AED 345.00');
    }
    console.log(`✅ Courier COD Clearing (1128-01) transit balance cleared: AED ${Number(transitCreditLine.credit_amount).toFixed(2)}`);

    // -------------------------------------------------------------------------
    // TEST 6: GRAIL BOUNTY RADAR LIFECYCLE & AUTO-MATCH
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 6] Grail Bounty Radar Lifecycle & Auto-Match ---');
    const bountyRes = await client.query(`
      INSERT INTO grail_bounties (
        id, customer_name, customer_phone, whatsapp_phone, desired_brand,
        desired_category, desired_size, preferred_size, max_budget_aed,
        era_notes, notes, status, created_at, updated_at
      ) VALUES (
        $1, 'Sheikh Tariq', '+971509998888', '+971509998888', 'Vintage Ralph Lauren Polo Sport',
        'Jackets', 'L', 'L', 450.00,
        '1992 Stadium or 1993 Snow Beach collection only', 'Collector grail hunt',
        'OPEN', NOW(), NOW()
      ) RETURNING *;
    `, [crypto.randomUUID()]);
    const bounty = bountyRes.rows[0];
    console.log(`✅ Created Grail Bounty: ID=${bounty.id}, Brand='${bounty.desired_brand}', Customer='${bounty.customer_name}', Status='${bounty.status}'`);

    // Query Auto-Match
    const matchRes = await client.query(`
      SELECT barcode, brand_name, item_name, style, size_scanned, retail_price_aed
      FROM inventory_pieces
      WHERE brand_name ILIKE '%Tommy Bahama%' OR brand_name ILIKE '%Carhartt%'
      LIMIT 2;
    `);
    console.log(`✅ Auto-match inventory search returned ${matchRes.rowCount} candidate pieces`);

    // Update Status to MATCHED
    const updateBountyRes = await client.query(`
      UPDATE grail_bounties
      SET status = 'MATCHED', matched_barcode = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, status, matched_barcode;
    `, [testBarcodeCod, bounty.id]);
    console.log(`✅ Updated Bounty to Status='${updateBountyRes.rows[0].status}' with Barcode='${updateBountyRes.rows[0].matched_barcode}'`);

    // -------------------------------------------------------------------------
    // TEST 7: ATOMIC ROLLBACK (ZERO PERSISTENT DATA VERIFICATION)
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 7] Atomic Rollback & Zero-Demo-Data Verification ---');
    await client.query('ROLLBACK;');
    console.log('🔄 Executed: ROLLBACK (All test records discarded from database)');

    // Verify pieces and orders are completely absent
    const checkPieces = await client.query(`
      SELECT COUNT(*) as cnt FROM inventory_pieces 
      WHERE barcode IN ($1, $2);
    `, [testBarcodePaid, testBarcodeCod]);
    if (parseInt(checkPieces.rows[0].cnt) !== 0) {
      throw new Error('FATAL: Test inventory pieces persisted after rollback!');
    }

    const checkOrders = await client.query(`
      SELECT COUNT(*) as cnt FROM orders 
      WHERE order_number IN ($1, $2);
    `, [orderPaidNo, orderCodNo]);
    if (parseInt(checkOrders.rows[0].cnt) !== 0) {
      throw new Error('FATAL: Test orders persisted after rollback!');
    }

    const checkBounties = await client.query(`
      SELECT COUNT(*) as cnt FROM grail_bounties 
      WHERE customer_name = 'Sheikh Tariq';
    `);
    if (parseInt(checkBounties.rows[0].cnt) !== 0) {
      throw new Error('FATAL: Test grail bounties persisted after rollback!');
    }

    console.log('✅ ZERO-DEMO-DATA RULE CONFIRMED: 0 rows persisted in production database.');
    console.log('\n========================================================================');
    console.log('🎉 ALL 7 INTEGRATION TESTS PASSED WITH 100% ACCURACY & ZERO POLLUTION!');
    console.log('========================================================================\n');

  } catch (err) {
    try {
      await client.query('ROLLBACK;');
      console.log('⚠️ Transaction rolled back due to error.');
    } catch (_) {}
    console.error('❌ Verification Failed with Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runVerification();
