/**
 * Phase 2.0 Omnichannel & B2B Hybrid Engine Database Migration
 * Upgrades crm_retail_customers with auth_id, customer_type, vip_tier, wallet_balance.
 * Configures COA Liability Account 2150-01 (Customer Wallet Balances).
 * Creates customer_wallet_transactions table.
 */
const { Client } = require('pg');
require('dotenv').config();

const DEFAULT_DB_URL = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
const dbUrl = (process.env.DATABASE_URL || DEFAULT_DB_URL).replace(':5432', ':6543');

async function migrate() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('[Omnichannel 2.0 Migration] Connected to PostgreSQL...');

  try {
    await client.query('BEGIN');

    // 1. Upgrade crm_retail_customers
    await client.query(`
      ALTER TABLE crm_retail_customers 
      ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50) DEFAULT 'RETAIL',
      ADD COLUMN IF NOT EXISTS vip_tier VARCHAR(50) DEFAULT 'BRONZE',
      ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(16,2) DEFAULT 0.00;

      CREATE INDEX IF NOT EXISTS idx_crm_retail_customers_auth_id ON crm_retail_customers(auth_id);
    `);
    console.log('[Omnichannel 2.0 Migration] crm_retail_customers upgraded.');

    // 2. Upgrade orders
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES crm_retail_customers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50) DEFAULT 'RETAIL',
      ADD COLUMN IF NOT EXISTS wallet_amount_used NUMERIC(16,2) DEFAULT 0.00;
    `);
    console.log('[Omnichannel 2.0 Migration] orders table upgraded.');

    // 3. Create customer_wallet_transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES crm_retail_customers(id) ON DELETE CASCADE,
        amount NUMERIC(16,2) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        description TEXT,
        reference_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        voucher_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT DEFAULT 'System'
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_customer_id ON customer_wallet_transactions(customer_id);
    `);
    console.log('[Omnichannel 2.0 Migration] customer_wallet_transactions ready.');

    // 4. Update COA Accounts 2150-00 and 2150-01
    await client.query(`
      UPDATE chart_of_accounts 
      SET name = 'Customer Deposits & Store Credit Wallets', account_type = 'LIABILITY' 
      WHERE code = '2150-00';

      UPDATE coa_accounts 
      SET name = 'Customer Deposits & Store Credit Wallets', type = 'LIABILITY' 
      WHERE code = '2150-00';

      UPDATE accounts 
      SET account_name = 'Customer Deposits & Store Credit Wallets' 
      WHERE account_code = '2150-00';

      UPDATE chart_of_accounts 
      SET name = 'Customer Wallet Balances (Liability)', account_type = 'LIABILITY' 
      WHERE code = '2150-01';

      UPDATE coa_accounts 
      SET name = 'Customer Wallet Balances (Liability)', type = 'LIABILITY' 
      WHERE code = '2150-01';

      UPDATE accounts 
      SET account_name = 'Customer Wallet Balances (Liability)' 
      WHERE account_code = '2150-01';
    `);
    console.log('[Omnichannel 2.0 Migration] COA 2150-01 Customer Wallet Balances ready.');

    await client.query('COMMIT');
    console.log('[Omnichannel 2.0 Migration] Successfully committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Omnichannel 2.0 Migration] Error:', err);
    throw err;
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
