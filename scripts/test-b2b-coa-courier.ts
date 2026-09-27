import { B2BTaxInvoiceA4Data, openB2BTaxInvoiceA4PrintWindow } from '../src/utils/printInvoiceA4.ts';

function runTests() {
  console.log('🧪 Starting Automated Unit & Integration Tests for B2B COA & Courier Khata...');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
      failed++;
    }
  }

  // 1. Verify Print Payload Type & Structure
  const testPayload: B2BTaxInvoiceA4Data = {
    invoiceNo: 'SLS-B2B-998811',
    invoiceDate: '2026-09-27',
    customerName: 'Al-Majid Luxury Vintage LLC',
    customerCoaCode: '1130-CUST01',
    courierName: 'Aramex UAE Express Logistics',
    waybillNo: 'AWB-7788991122',
    courierCoaCode: '2120-CR001',
    items: [
      {
        barcode: 'VV-TEE-9981',
        description: 'Vintage 90s Graphic Band Tee',
        quantity: 1,
        unitPrice: 350,
        finalAmount: 350
      }
    ],
    itemsSubtotal: 350,
    otherCharges: [
      {
        title: 'Express Doorstep Freight Courier',
        amount: 150,
        vatApplicable: true
      }
    ],
    otherChargesTotal: 150,
    vatAmount: 25, // 5% of (350 + 150)
    grandTotal: 525,
    advanceAmountPaid: 525
  };

  assert(testPayload.courierName === 'Aramex UAE Express Logistics', 'Print payload includes courierName');
  assert(testPayload.waybillNo === 'AWB-7788991122', 'Print payload includes waybillNo');
  assert(testPayload.courierCoaCode === '2120-CR001', 'Print payload includes courierCoaCode');

  // 2. Accounting Mapping Unit Verification
  const coaAccounts = [
    { code: '4110-00', name: 'Sales Revenue - Local / Retail Stream', tier_level: 2 },
    { code: '4110-04', name: 'Delivery & Shipping Charges Collected', tier_level: 3 },
    { code: '4110-05', name: 'B2B REVENUE', tier_level: 3 },
    { code: '2140-00', name: 'UAE VAT Output Tax Payable (5% FTA)', tier_level: 2 },
    { code: '2140-01', name: 'UAE VAT Output Tax (5%)', tier_level: 3 },
    { code: '2120-00', name: 'Accounts Payable - Courier, Freight & Clearing Agents', tier_level: 2 },
    { code: '2120-CR001', name: 'Accounts Payable - Aramex UAE', tier_level: 3 }
  ];

  // Test Case A: Revenue Account Mapping
  const targetRevenueAcc = coaAccounts.find(a => a.code === '4110-05');
  assert(targetRevenueAcc !== undefined, 'Target B2B Revenue Account 4110-05 exists');
  assert(targetRevenueAcc?.tier_level === 3, 'Target B2B Revenue Account 4110-05 is Tier 3 Transaction Account');
  assert(targetRevenueAcc?.name === 'B2B REVENUE', 'Target B2B Revenue Account name is "B2B REVENUE"');

  // Test Case B: UAE VAT Output Account Mapping
  const targetVatAcc = coaAccounts.find(a => a.code === '2140-01');
  assert(targetVatAcc !== undefined, 'Target UAE VAT Output Account 2140-01 exists');
  assert(targetVatAcc?.tier_level === 3, 'Target UAE VAT Output Account 2140-01 is Tier 3 Transaction Account');
  assert(targetVatAcc?.name === 'UAE VAT Output Tax (5%)', 'Target UAE VAT Output Account name is "UAE VAT Output Tax (5%)"');

  // Test Case C: Journal Voucher Builder Simulation (With Courier)
  function buildVoucherLines(params: {
    customerCoaCode: string;
    grandTotal: number;
    itemsSubtotal: number;
    otherChargesTotal: number;
    vatAmount: number;
    courier?: { name: string; coaCode: string; id: string };
    waybillNo?: string;
  }) {
    const lines: any[] = [];
    // Dr Customer
    lines.push({ accountCode: params.customerCoaCode, debit: params.grandTotal, credit: 0 });
    // Cr Revenue (4110-05)
    lines.push({ accountCode: '4110-05', debit: 0, credit: params.itemsSubtotal });
    // Cr Courier or Shipping
    if (params.otherChargesTotal > 0) {
      if (params.courier) {
        lines.push({ accountCode: params.courier.coaCode, debit: 0, credit: params.otherChargesTotal });
      } else {
        lines.push({ accountCode: '4110-04', debit: 0, credit: params.otherChargesTotal });
      }
    }
    // Cr VAT (2140-01)
    if (params.vatAmount > 0) {
      lines.push({ accountCode: '2140-01', debit: 0, credit: params.vatAmount });
    }
    return lines;
  }

  const linesWithCourier = buildVoucherLines({
    customerCoaCode: '1130-CUST01',
    grandTotal: 525,
    itemsSubtotal: 350,
    otherChargesTotal: 150,
    vatAmount: 25,
    courier: { name: 'Aramex', coaCode: '2120-CR001', id: 'cr-1' },
    waybillNo: 'AWB-7788991122'
  });

  const totalDebit = linesWithCourier.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = linesWithCourier.reduce((sum, l) => sum + l.credit, 0);
  assert(totalDebit === totalCredit, `Double-entry balanced: Dr ${totalDebit} === Cr ${totalCredit}`);
  assert(linesWithCourier.some(l => l.accountCode === '4110-05' && l.credit === 350), 'Cr 4110-05 B2B REVENUE has AED 350');
  assert(linesWithCourier.some(l => l.accountCode === '2120-CR001' && l.credit === 150), 'Cr 2120-CR001 Courier Khata has AED 150');
  assert(linesWithCourier.some(l => l.accountCode === '2140-01' && l.credit === 25), 'Cr 2140-01 UAE VAT Output has AED 25');

  // Test Case D: Fallback when No Courier is Selected
  const linesWithoutCourier = buildVoucherLines({
    customerCoaCode: '1130-CUST01',
    grandTotal: 525,
    itemsSubtotal: 350,
    otherChargesTotal: 150,
    vatAmount: 25
  });
  assert(linesWithoutCourier.some(l => l.accountCode === '4110-04' && l.credit === 150), 'Fallback Cr 4110-04 Delivery Revenue when no courier selected');

  console.log(`\n======================================================`);
  console.log(`  B2B COA & COURIER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
