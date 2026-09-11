require('dotenv').config();
const { Client } = require('pg');

const targetTables = [
  'pos_sales', 'b2b_sales', 'orders', 'live_stream_sales',
  'bank_accounts', 'streaming_api_keys', 'live_booths'
];

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  for (const t of targetTables) {
    const cols = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [t]);
    console.log(`\n=== Table: ${t} ===`);
    cols.rows.forEach(c => {
      console.log(`  ${c.column_name} (${c.data_type}) nullable:${c.is_nullable}`);
    });
  }
  await client.end();
}

main().catch(console.error);
