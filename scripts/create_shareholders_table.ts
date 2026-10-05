import { withDb } from '../src/db/pgPool.ts';

async function createShareholdersTable() {
  console.log('🚀 Creating company_shareholders table in Supabase PostgreSQL...');
  await withDb(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.company_shareholders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        designation TEXT NOT NULL DEFAULT 'Managing Partner / Director',
        shares_count NUMERIC NOT NULL DEFAULT 100,
        capital_aed NUMERIC NOT NULL DEFAULT 100000,
        ownership_percent NUMERIC NOT NULL DEFAULT 100.0,
        passport_or_eid TEXT,
        coa_account_code TEXT DEFAULT '3100-01',
        is_active BOOLEAN DEFAULT true,
        display_order INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('✓ company_shareholders table ready');

    const { rows } = await client.query('SELECT * FROM public.company_shareholders');
    if (rows.length === 0) {
      await client.query(`
        INSERT INTO public.company_shareholders 
          (name, designation, shares_count, capital_aed, ownership_percent, passport_or_eid, coa_account_code, display_order)
        VALUES 
          ('Managing Director', 'Sole Proprietor / Director', 100, 100000, 100.0, 'Emirates ID on Record', '3100-01', 1);
      `);
      console.log('✓ Seeded default 100% single shareholder');
    } else {
      console.log(`✓ Existing shareholders count: ${rows.length}`);
    }
  });
}

createShareholdersTable()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error creating shareholders table:', err);
    process.exit(1);
  });
