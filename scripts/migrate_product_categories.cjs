const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true';
  if (dbUrl.includes('.pooler.supabase.com:5432')) {
    dbUrl = dbUrl.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
  }
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

  console.log('Connected to PostgreSQL. Creating public.product_categories table...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.product_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log('Table public.product_categories verified/created.');

  // Check if categories need initial seeding
  const existingCount = await client.query('SELECT COUNT(*) FROM public.product_categories');
  const count = parseInt(existingCount.rows[0].count, 10);
  console.log(`Current product_categories count: ${count}`);

  if (count === 0) {
    console.log('Seeding initial default product categories...');
    const seedCategories = [
      { name: 'Vintage Denim & Jeans', slug: 'vintage-denim-jeans' },
      { name: 'Vintage Jackets & Outerwear', slug: 'vintage-jackets-outerwear' },
      { name: 'Graphic T-Shirts & Band Tees', slug: 'graphic-t-shirts-band-tees' },
      { name: 'Knitwear & Sweaters', slug: 'knitwear-sweaters' },
      { name: 'Hoodies & Sweatshirts', slug: 'hoodies-sweatshirts' },
      { name: 'Workwear & Cargo Pants', slug: 'workwear-cargo-pants' },
      { name: 'Silk Blouses & Rayon Shirts', slug: 'silk-blouses-rayon-shirts' },
      { name: 'Leather & Suede Jackets', slug: 'leather-suede-jackets' },
      { name: 'Vintage Sportswear & Track Tops', slug: 'vintage-sportswear-track-tops' },
      { name: 'Caps, Hats & Accessories', slug: 'caps-hats-accessories' },
      { name: 'Miscellaneous Curated', slug: 'miscellaneous-curated' }
    ];

    for (const cat of seedCategories) {
      await client.query(`
        INSERT INTO public.product_categories (name, slug, is_active, created_at)
        VALUES ($1, $2, true, NOW())
        ON CONFLICT (slug) DO UPDATE SET is_active = true;
      `, [cat.name, cat.slug]);
    }
    console.log('Seeded 11 product categories.');
  }

  const result = await client.query('SELECT id, name, slug, is_active FROM public.product_categories ORDER BY created_at ASC');
  console.log('Active categories in DB:');
  console.table(result.rows);

  await client.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
