const { Client } = require('pg');
require('dotenv').config();

const defaultAccounts = [
  // 1000 - ASSETS
  { id: 'acc-1000', code: '1000-00', name: 'Assets', type: 'ASSET', sub_type: 'Current Assets', currency: 'AED', current_balance: 0, is_active: true, parent_id: null },
  { id: 'acc-1110', code: '1110-00', name: 'Cash in Hand (Counter 1 POS Drawer)', type: 'ASSET', sub_type: 'Cash & Bank', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1115', code: '1115-00', name: 'Cash in Vault (Main Safe Reserve)', type: 'ASSET', sub_type: 'Cash & Bank', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1120', code: '1120-00', name: 'Primary Bank Account (Current Account)', type: 'ASSET', sub_type: 'Cash & Bank', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1125', code: '1125-00', name: 'POS Terminal Card Clearing (Sunmi / PAX PED)', type: 'ASSET', sub_type: 'Payment Clearing', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1128', code: '1128-00', name: 'Courier COD Clearing (Pending Remittance - Aramex / iMile / TCS)', type: 'ASSET', sub_type: 'Payment Clearing', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1130', code: '1130-00', name: 'Accounts Receivable (Trade & Live Stream Claimants)', type: 'ASSET', sub_type: 'Receivables', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1135', code: '1135-00', name: 'Staff Advance & Loan Receivables', type: 'ASSET', sub_type: 'Receivables', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1140', code: '1140-00', name: 'Inventory - Raw Bulk Bales (Unopened Sacks & Containers)', type: 'ASSET', sub_type: 'Inventory', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1150', code: '1150-00', name: 'Inventory - Sorting Work-in-Progress (WIP Bales Under Grading)', type: 'ASSET', sub_type: 'Inventory', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1160', code: '1160-00', name: 'Inventory - Sorted & Tagged Garments (Retail & Live Stream Ready)', type: 'ASSET', sub_type: 'Inventory', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1210', code: '1210-00', name: 'Security Deposits (Store & Warehouse Leases)', type: 'ASSET', sub_type: 'Non-Current Assets', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },
  { id: 'acc-1220', code: '1220-00', name: 'Warehouse, Steaming & Sorting Equipment', type: 'ASSET', sub_type: 'Fixed Assets', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-1000' },

  // 2000 - LIABILITIES
  { id: 'acc-2000', code: '2000-00', name: 'Liabilities', type: 'LIABILITY', sub_type: 'Current Liabilities', currency: 'AED', current_balance: 0, is_active: true, parent_id: null },
  { id: 'acc-2110', code: '2110-00', name: 'Accounts Payable - Trade Suppliers (Bale Exporters)', type: 'LIABILITY', sub_type: 'Payables', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-2000' },
  { id: 'acc-2120', code: '2120-00', name: 'Accounts Payable - Courier & Logistics Partners', type: 'LIABILITY', sub_type: 'Payables', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-2000' },
  { id: 'acc-2140', code: '2140-00', name: 'UAE VAT Output Tax Payable (5% FTA)', type: 'LIABILITY', sub_type: 'Tax Payable', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-2000' },
  { id: 'acc-2150', code: '2150-00', name: 'UAE VAT Input Tax Recoverable (5% FTA)', type: 'LIABILITY', sub_type: 'Tax Recoverable', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-2000' },
  { id: 'acc-2310', code: '2310-00', name: 'Accrued Staff Payroll & End-of-Service Gratuity', type: 'LIABILITY', sub_type: 'Accrued Liabilities', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-2000' },
  { id: 'acc-2410', code: '2410-00', name: 'Provision for UAE Corporate Tax (9% FTA)', type: 'LIABILITY', sub_type: 'Tax Payable', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-2000' },

  // 3000 - EQUITY
  { id: 'acc-3000', code: '3000-00', name: 'Equity', type: 'EQUITY', sub_type: 'Equity', currency: 'AED', current_balance: 0, is_active: true, parent_id: null },
  { id: 'acc-3110', code: '3110-00', name: 'Owner / Partner Capital', type: 'EQUITY', sub_type: 'Capital', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-3000' },
  { id: 'acc-3210', code: '3210-00', name: 'Retained Earnings / Accumulated Profit & Loss', type: 'EQUITY', sub_type: 'Reserves', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-3000' },
  { id: 'acc-3310', code: '3310-00', name: 'Current Year Net Profit / (Loss)', type: 'EQUITY', sub_type: 'Profit & Loss', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-3000' },

  // 4000 - REVENUE
  { id: 'acc-4000', code: '4000-00', name: 'Revenue', type: 'REVENUE', sub_type: 'Operating Revenue', currency: 'AED', current_balance: 0, is_active: true, parent_id: null },
  { id: 'acc-4110', code: '4110-00', name: 'Walk-in Counter POS Sales Revenue', type: 'REVENUE', sub_type: 'Sales', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-4000' },
  { id: 'acc-4120', code: '4120-00', name: 'Live Streaming Sales Revenue (TikTok / IG / FB Drops)', type: 'REVENUE', sub_type: 'Sales', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-4000' },
  { id: 'acc-4130', code: '4130-00', name: 'E-Commerce & Online Storefront Sales Revenue', type: 'REVENUE', sub_type: 'Sales', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-4000' },
  { id: 'acc-4140', code: '4140-00', name: 'Wholesale B2B Bulk Sales Revenue', type: 'REVENUE', sub_type: 'Sales', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-4000' },
  { id: 'acc-4210', code: '4210-00', name: 'Luxury Packaging & Gift Box Revenue', type: 'REVENUE', sub_type: 'Other Income', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-4000' },
  { id: 'acc-4310', code: '4310-00', name: 'Delivery & Shipping Fee Revenue', type: 'REVENUE', sub_type: 'Other Income', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-4000' },

  // 5000 - EXPENSES
  { id: 'acc-5000', code: '5000-00', name: 'Expenses', type: 'EXPENSE', sub_type: 'Operating Expenses', currency: 'AED', current_balance: 0, is_active: true, parent_id: null },
  { id: 'acc-5110', code: '5110-00', name: 'Cost of Goods Sold (COGS) - Finished Garments', type: 'EXPENSE', sub_type: 'Cost of Goods Sold', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5120', code: '5120-00', name: 'Cost of Goods Sold (COGS) - Bulk Bales Sold', type: 'EXPENSE', sub_type: 'Cost of Goods Sold', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5210', code: '5210-00', name: 'Ocean Freight & International Container Shipping', type: 'EXPENSE', sub_type: 'Logistics Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5220', code: '5220-00', name: 'Customs Duty & Dubai Port Clearance Charges', type: 'EXPENSE', sub_type: 'Import Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5230', code: '5230-00', name: 'Bale Sorting, Grading & Steaming Direct Labor', type: 'EXPENSE', sub_type: 'Direct Labor', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5240', code: '5240-00', name: 'Courier Delivery & Last-Mile Shipping Expense', type: 'EXPENSE', sub_type: 'Logistics Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5250', code: '5250-00', name: 'Packaging Supplies, Hang-Tags & Barcode Labels', type: 'EXPENSE', sub_type: 'Packaging Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5310', code: '5310-00', name: 'Staff Salaries, Live Host Commissions & Overtime', type: 'EXPENSE', sub_type: 'Payroll Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5410', code: '5410-00', name: 'Warehouse Rent, Retail Store Lease & Utilities (DEWA)', type: 'EXPENSE', sub_type: 'Facility Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5420', code: '5420-00', name: 'Payment Gateway & POS Card Terminal Fees (2%)', type: 'EXPENSE', sub_type: 'Financial Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' },
  { id: 'acc-5510', code: '5510-00', name: 'UAE Corporate Tax Provision Expense', type: 'EXPENSE', sub_type: 'Tax Expense', currency: 'AED', current_balance: 0, is_active: true, parent_id: 'acc-5000' }
];

async function seedCOA() {
  let dbUrl = process.env.DATABASE_URL;
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

  console.log('[COA Seeder] Connected to Supabase DB. Checking existing accounts...');
  const res = await client.query('SELECT COUNT(*) FROM coa_accounts');
  const count = parseInt(res.rows[0].count, 10);
  console.log(`[COA Seeder] Found ${count} existing accounts.`);

  if (count === 0) {
    console.log('[COA Seeder] Seeding standard Chart of Accounts...');
    for (const acc of defaultAccounts) {
      await client.query(
        `INSERT INTO coa_accounts (id, code, name, type, sub_type, currency, current_balance, is_active, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (code) DO NOTHING`,
        [acc.id, acc.code, acc.name, acc.type, acc.sub_type, acc.currency, acc.current_balance, acc.is_active, acc.parent_id]
      );
    }
    console.log(`[COA Seeder] Seeded ${defaultAccounts.length} standard accounts across all 5 pillars.`);
  }

  const verify = await client.query('SELECT id, code, name, type, current_balance FROM coa_accounts ORDER BY code ASC LIMIT 5');
  console.log('[COA Seeder] Verified accounts:', verify.rows);

  await client.end();
}

seedCOA().catch(err => {
  console.error('[COA Seeder Error]:', err);
  process.exit(1);
});
