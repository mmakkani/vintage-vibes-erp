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

  console.log('Connected to PostgreSQL. Running Inventory & E-Commerce Pipeline Migration...');

  try {
    // 1. Upgrade public.product_categories with hierarchy columns
    console.log('1. Upgrading public.product_categories with hierarchy columns...');
    await client.query(`
      ALTER TABLE public.product_categories 
      ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS department_code VARCHAR(10) NULL,
      ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
    `);

    // 2. Seed 6 Top-Level Departments
    console.log('2. Seeding 6 Top-Level Departments (Men, Ladies, Children, Accessories, Vintage, Antique)...');
    const topDepartments = [
      { name: 'Men', slug: 'men', department_code: 'MEN', level: 1, display_order: 10 },
      { name: 'Ladies', slug: 'ladies', department_code: 'LAD', level: 1, display_order: 20 },
      { name: 'Children', slug: 'children', department_code: 'KID', level: 1, display_order: 30 },
      { name: 'Accessories', slug: 'accessories', department_code: 'ACC', level: 1, display_order: 40 },
      { name: 'Vintage', slug: 'vintage', department_code: 'VIN', level: 1, display_order: 50 },
      { name: 'Antique', slug: 'antique', department_code: 'ANT', level: 1, display_order: 60 }
    ];

    for (const dept of topDepartments) {
      await client.query(`
        INSERT INTO public.product_categories (name, slug, department_code, level, display_order, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        ON CONFLICT (slug) DO UPDATE 
        SET department_code = EXCLUDED.department_code, 
            level = EXCLUDED.level,
            display_order = EXCLUDED.display_order;
      `, [dept.name, dept.slug, dept.department_code, dept.level, dept.display_order]);
    }

    // 3. Link existing subcategories to default parent 'Vintage' where parent_id IS NULL and level != 1
    console.log('3. Linking existing subcategories under parent "Vintage"...');
    await client.query(`
      UPDATE public.product_categories 
      SET parent_id = (SELECT id FROM public.product_categories WHERE slug = 'vintage' LIMIT 1),
          level = 2
      WHERE slug NOT IN ('men', 'ladies', 'children', 'accessories', 'vintage', 'antique') 
        AND parent_id IS NULL;
    `);

    // 4. Upgrade public.bale_sorted_pieces
    console.log('4. Upgrading public.bale_sorted_pieces...');
    await client.query(`
      ALTER TABLE public.bale_sorted_pieces
      ADD COLUMN IF NOT EXISTS sku VARCHAR(50) NULL,
      ADD COLUMN IF NOT EXISTS parent_category_id UUID NULL,
      ADD COLUMN IF NOT EXISTS parent_category_name VARCHAR(100) NULL,
      ADD COLUMN IF NOT EXISTS ready_for_ecommerce BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ecommerce_description TEXT NULL,
      ADD COLUMN IF NOT EXISTS seo_tags TEXT[] DEFAULT '{}'::TEXT[],
      ADD COLUMN IF NOT EXISTS item_master_id UUID NULL;
    `);

    // 5. Upgrade public.inventory_pieces
    console.log('5. Upgrading public.inventory_pieces...');
    await client.query(`
      ALTER TABLE public.inventory_pieces
      ADD COLUMN IF NOT EXISTS sku VARCHAR(50) NULL,
      ADD COLUMN IF NOT EXISTS parent_category_name VARCHAR(100) NULL,
      ADD COLUMN IF NOT EXISTS ready_for_ecommerce BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS ecommerce_description TEXT NULL,
      ADD COLUMN IF NOT EXISTS seo_tags TEXT[] DEFAULT '{}'::TEXT[],
      ADD COLUMN IF NOT EXISTS item_master_id UUID NULL;
    `);

    // Backfill existing unsold pieces so they remain ready for ecommerce
    console.log('6. Backfilling existing unsold pieces with ready_for_ecommerce = true...');
    await client.query(`
      UPDATE public.inventory_pieces
      SET ready_for_ecommerce = true
      WHERE is_sold = false 
        AND (status IS NULL OR status = 'IN_STOCK' OR status = 'AVAILABLE')
        AND (ready_for_ecommerce IS NULL OR ready_for_ecommerce = false);
    `);

    // 7. Setup SKU sequences table
    console.log('7. Creating public.sku_sequences table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.sku_sequences (
        department_code VARCHAR(10) PRIMARY KEY,
        current_seq INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      INSERT INTO public.sku_sequences (department_code, current_seq)
      VALUES 
        ('MEN', 0), 
        ('LAD', 0), 
        ('KID', 0), 
        ('ACC', 0), 
        ('VIN', 0), 
        ('ANT', 0), 
        ('GEN', 0)
      ON CONFLICT (department_code) DO NOTHING;
    `);

    // 8. Add Indexes
    console.log('8. Creating performance indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_ecommerce_routing 
      ON public.inventory_pieces (ready_for_ecommerce, is_sold, status);

      CREATE INDEX IF NOT EXISTS idx_inventory_sku 
      ON public.inventory_pieces (sku);

      CREATE INDEX IF NOT EXISTS idx_categories_parent 
      ON public.product_categories (parent_id, level);
    `);

    console.log('✓ Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    await client.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
