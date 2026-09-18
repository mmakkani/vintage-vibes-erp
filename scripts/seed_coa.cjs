const { Client } = require('pg');
require('dotenv').config();

const rootAccounts = [
  { code: '1000-00', name: 'Assets', typeId: 1, level: 1, isTransactional: false },
  { code: '2000-00', name: 'Liabilities', typeId: 2, level: 1, isTransactional: false },
  { code: '3000-00', name: 'Equity', typeId: 3, level: 1, isTransactional: false },
  { code: '4000-00', name: 'Revenue', typeId: 4, level: 1, isTransactional: false },
  { code: '5000-00', name: 'Expenses', typeId: 5, level: 1, isTransactional: false }
];

async function seedCOA() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not configured in environment');
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('[COA Seeder] Connected to database. Ensuring strictly 5 fixed root Level 1 accounts in "accounts" table...');

  // Ensure account_types exists and has correct IDs
  await client.query(`
    INSERT INTO account_types (type_id, type_name) VALUES
      (1, 'Asset'),
      (2, 'Liability'),
      (3, 'Equity'),
      (4, 'Revenue'),
      (5, 'Expense')
    ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name;
  `);

  // Upsert the 5 fixed root accounts
  for (const acc of rootAccounts) {
    await client.query(`
      INSERT INTO accounts (account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level)
      VALUES ($1, $2, $3, NULL, true, $4, $5)
      ON CONFLICT (account_code) DO UPDATE 
      SET account_name = EXCLUDED.account_name,
          account_type_id = EXCLUDED.account_type_id,
          is_active = true,
          is_transactional = EXCLUDED.is_transactional,
          account_level = EXCLUDED.account_level;
    `, [acc.code, acc.name, acc.typeId, acc.isTransactional, acc.level]);
  }

  // Remove any legacy non-root mock accounts if any exist that have no children
  const rootCodes = rootAccounts.map(r => r.code);
  await client.query(`
    DELETE FROM accounts 
    WHERE account_code NOT IN ($1, $2, $3, $4, $5)
      AND account_id NOT IN (SELECT DISTINCT parent_id FROM accounts WHERE parent_id IS NOT NULL);
  `, rootCodes).catch(() => {});

  const res = await client.query(`
    SELECT a.account_id, a.account_code, a.account_name, t.type_name, a.account_level, a.is_transactional
    FROM accounts a
    JOIN account_types t ON a.account_type_id = t.type_id
    ORDER BY a.account_code ASC
  `);

  console.log('[COA Seeder] Verified accounts table (Count: ' + res.rows.length + '):');
  console.table(res.rows);

  await client.end();
}

seedCOA().catch(err => {
  console.error('[COA Seeder Error]:', err);
  process.exit(1);
});
