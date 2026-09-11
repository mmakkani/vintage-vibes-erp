const { Client } = require('pg');
require('dotenv').config();

async function run() {
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

  console.log('[Bale Tables] Creating/verifying bale_categories and bale_presets tables in public schema...');
  
  // 1. Create bale_categories table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.bale_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 2. Create bale_presets table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.bale_presets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_code VARCHAR(64) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(128) NOT NULL,
      uom VARCHAR(32) DEFAULT 'Bales',
      std_weight NUMERIC(10, 2) DEFAULT 45.00,
      base_rate NUMERIC(10, 2) DEFAULT 0.00,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default categories if empty
  const catCount = await client.query('SELECT COUNT(*) FROM public.bale_categories');
  if (parseInt(catCount.rows[0].count, 10) === 0) {
    console.log('[Bale Tables] Seeding default bale categories...');
    const defaults = [
      '90s Vintage Denim & American Workwear',
      'Vintage Band Tees & Graphic Hoodies',
      'Italian Wool Overcoats & Blazers',
      'Outdoor Fleece & Retro Sportswear (Nike/Adidas)',
      'Carhartt & Workwear Duck Canvas',
      'Mix Vintage Silk Blouses & Hawaiian Shirts',
      'Vintage Cargo Pants & Tactical Utility'
    ];
    for (const name of defaults) {
      await client.query('INSERT INTO public.bale_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
    }
  }

  // Check columns
  const catCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bale_categories'");
  console.log('bale_categories cols:', catCols.rows.map(c => c.column_name));

  const presetCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bale_presets'");
  console.log('bale_presets cols:', presetCols.rows.map(c => c.column_name));

  const cats = await client.query('SELECT * FROM public.bale_categories ORDER BY created_at ASC');
  console.log(`bale_categories count: ${cats.rows.length}`);

  const presets = await client.query('SELECT * FROM public.bale_presets ORDER BY created_at DESC');
  console.log(`bale_presets count: ${presets.rows.length}`);

  await client.end();
}

run().catch(console.error);
