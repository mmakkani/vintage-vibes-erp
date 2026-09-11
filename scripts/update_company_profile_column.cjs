require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  // Add column whatsapp_orders_number if it doesn't exist
  await client.query(`
    ALTER TABLE public.company_profile 
    ADD COLUMN IF NOT EXISTS whatsapp_orders_number TEXT;
  `);

  // Also sync existing value if any
  await client.query(`
    UPDATE public.company_profile 
    SET whatsapp_orders_number = COALESCE(whatsapp_orders_number, whatsapp_order_number, '+971554186086')
    WHERE id = 'default-company';
  `);

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'company_profile';
  `);
  console.log('company_profile columns:', cols.rows.map(r => r.column_name));

  const profile = await client.query(`
    SELECT id, company_name, whatsapp_order_number, whatsapp_orders_number FROM public.company_profile WHERE id = 'default-company';
  `);
  console.log('Current company_profile row:', profile.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
