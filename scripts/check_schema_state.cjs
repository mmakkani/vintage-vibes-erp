const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('grail_bounties', 'orders', 'sales_invoices', 'inventory_pieces', 'sales_channel_settings');
  `);
  console.log('Existing tables:', tables.rows.map(r => r.table_name));

  const gbCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'grail_bounties';
  `);
  console.log('grail_bounties cols:', gbCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  const ordCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'orders';
  `);
  console.log('orders cols:', ordCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  const sinvCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'sales_invoices';
  `);
  console.log('sales_invoices cols:', sinvCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  const proc = await client.query(`
    SELECT proname, proargnames FROM pg_proc 
    WHERE proname IN ('post_sales_dispatch_and_cogs_voucher', 'settle_courier_cod_remittance');
  `);
  console.log('Procedures:', proc.rows.map(r => ({ name: r.proname, args: r.proargnames })));

  const pCols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'parties';
  `);
  console.log('parties cols:', pCols.rows.map(r => `${r.column_name} (${r.data_type})`));

  await client.end();
}

main().catch(console.error);
