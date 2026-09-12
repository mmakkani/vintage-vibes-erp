const { Client } = require('pg');
require('dotenv').config({ path: 'c:/vintage-vibe/.env' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL database');

  // Check columns in company_profile
  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'company_profile'
    ORDER BY ordinal_position;
  `);
  console.log('Existing columns:', cols.rows.map(r => `${r.column_name} (${r.data_type})`));

  // Add column maintenance_modules if not exists
  console.log('Adding column maintenance_modules if not exists...');
  await client.query(`
    ALTER TABLE public.company_profile 
    ADD COLUMN IF NOT EXISTS maintenance_modules JSONB DEFAULT '{"hr_payroll": false, "purchases": false, "sales": false, "sorting": false, "vouchers": false, "inventory": false}'::jsonb;
  `);

  // Ensure default-company row has maintenance_modules populated
  await client.query(`
    UPDATE public.company_profile 
    SET maintenance_modules = COALESCE(maintenance_modules, '{"hr_payroll": false, "purchases": false, "sales": false, "sorting": false, "vouchers": false, "inventory": false}'::jsonb)
    WHERE id = 'default-company' OR maintenance_modules IS NULL;
  `);

  // Check current value
  const row = await client.query(`SELECT id, company_name, maintenance_modules FROM public.company_profile LIMIT 5;`);
  console.log('Current rows:', JSON.stringify(row.rows, null, 2));

  // Check publications for realtime
  const pubs = await client.query(`
    SELECT pubname, tablename 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime';
  `);
  console.log('supabase_realtime tables:', pubs.rows.map(r => r.tablename));

  const hasCompanyProfileInRealtime = pubs.rows.some(r => r.tablename === 'company_profile');
  if (!hasCompanyProfileInRealtime) {
    console.log('Adding company_profile to supabase_realtime publication...');
    try {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE public.company_profile;`);
      console.log('Added company_profile to supabase_realtime successfully.');
    } catch (e) {
      console.log('Publication note:', e.message);
    }
  } else {
    console.log('company_profile is already in supabase_realtime publication.');
  }

  // Ensure REPLICA IDENTITY FULL so updates broadcast full row data
  try {
    await client.query(`ALTER TABLE public.company_profile REPLICA IDENTITY FULL;`);
    console.log('Set REPLICA IDENTITY FULL on company_profile');
  } catch (e) {
    console.log('Replica identity note:', e.message);
  }

  await client.end();
  console.log('Migration completed successfully!');
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
