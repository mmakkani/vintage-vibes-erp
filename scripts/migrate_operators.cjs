require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('No DATABASE_URL found in .env');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL successfully!');

  // Check if operators table exists
  const checkRes = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'operators'
    );
  `);
  console.log('Operators table exists initially:', checkRes.rows[0].exists);

  // Run the requested SQL
  const sql = `
    CREATE TABLE IF NOT EXISTS public.operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'operator',
      pin TEXT,
      permissions JSONB DEFAULT '{}'::jsonb,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE public.operators DISABLE ROW LEVEL SECURITY;

    -- Ensure default admin is present in the table
    INSERT INTO public.operators (username, password_hash, display_name, role, is_active)
    VALUES ('admin', 'admin123', 'Master Admin', 'superadmin', true)
    ON CONFLICT (username) DO NOTHING;
  `;

  await client.query(sql);
  console.log('✅ Executed CREATE TABLE and ALTER TABLE DISABLE RLS on public.operators!');

  // Query operators
  const opsRes = await client.query("SELECT id, username, display_name, role, is_active, created_at FROM public.operators");
  console.log('Operators in database:', opsRes.rows);

  await client.end();
  console.log('Migration finished successfully.');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
