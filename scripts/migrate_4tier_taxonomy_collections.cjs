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

  console.log('Connected to PostgreSQL. Running 4-Tier Taxonomy & Collections Migration...');

  try {
    // 1. Upgrade public.product_categories with taxonomy_level
    console.log('1. Upgrading public.product_categories with taxonomy_level and hierarchy columns...');
    await client.query(`
      ALTER TABLE public.product_categories 
      ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS department_code VARCHAR(10) NULL,
      ADD COLUMN IF NOT EXISTS taxonomy_level VARCHAR(20) NOT NULL DEFAULT 'CATEGORY',
      ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 2,
      ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
    `);

    // Add constraint if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_categories_taxonomy_level'
        ) THEN
          ALTER TABLE public.product_categories 
          ADD CONSTRAINT chk_product_categories_taxonomy_level 
          CHECK (taxonomy_level IN ('DEPARTMENT', 'CATEGORY', 'SUBCATEGORY'));
        END IF;
      END $$;
    `);

    // 2. Seed Tier 1: Departments (level 1)
    console.log('2. Seeding Tier 1: Root Departments...');
    const departments = [
      { name: 'Men', slug: 'men', code: 'MEN', order: 10 },
      { name: 'Ladies', slug: 'ladies', code: 'LAD', order: 20 },
      { name: 'Children', slug: 'children', code: 'KID', order: 30 },
      { name: 'Accessories', slug: 'accessories', code: 'ACC', order: 40 }
    ];

    const deptMap = {};
    for (const d of departments) {
      const res = await client.query(`
        INSERT INTO public.product_categories (name, slug, department_code, taxonomy_level, level, display_order, is_active, created_at)
        VALUES ($1, $2, $3, 'DEPARTMENT', 1, $4, true, NOW())
        ON CONFLICT (slug) DO UPDATE 
        SET department_code = EXCLUDED.department_code,
            taxonomy_level = 'DEPARTMENT',
            level = 1,
            display_order = EXCLUDED.display_order,
            is_active = true
        RETURNING id, slug;
      `, [d.name, d.slug, d.code, d.order]);
      deptMap[d.slug] = res.rows[0]?.id;
    }

    // 3. Seed Tier 2: Main Categories (level 2)
    console.log('3. Seeding Tier 2: Main Categories...');
    const mainCategories = [
      // Men
      { name: 'T-Shirts', slug: 'men-t-shirts', parentSlug: 'men', order: 10 },
      { name: 'Hoodies & Sweaters', slug: 'men-hoodies-sweaters', parentSlug: 'men', order: 20 },
      { name: 'Pants & Denim', slug: 'men-pants-denim', parentSlug: 'men', order: 30 },
      { name: 'Jackets & Outerwear', slug: 'men-jackets-outerwear', parentSlug: 'men', order: 40 },
      { name: 'Shorts', slug: 'men-shorts', parentSlug: 'men', order: 50 },
      // Ladies
      { name: 'Tops & Blouses', slug: 'ladies-tops-blouses', parentSlug: 'ladies', order: 10 },
      { name: 'Dresses & Skirts', slug: 'ladies-dresses-skirts', parentSlug: 'ladies', order: 20 },
      { name: 'Pants & Jeans', slug: 'ladies-pants-jeans', parentSlug: 'ladies', order: 30 },
      { name: 'Jackets & Coats', slug: 'ladies-jackets-coats', parentSlug: 'ladies', order: 40 },
      { name: 'Knitwear & Cardigans', slug: 'ladies-knitwear', parentSlug: 'ladies', order: 50 },
      // Children
      { name: 'Kids Tops', slug: 'kids-tops', parentSlug: 'children', order: 10 },
      { name: 'Kids Bottoms', slug: 'kids-bottoms', parentSlug: 'children', order: 20 },
      { name: 'Kids Outerwear', slug: 'kids-outerwear', parentSlug: 'children', order: 30 },
      // Accessories
      { name: 'Caps & Hats', slug: 'accessories-caps-hats', parentSlug: 'accessories', order: 10 },
      { name: 'Bags & Backpacks', slug: 'accessories-bags', parentSlug: 'accessories', order: 20 },
      { name: 'Belts & Leather', slug: 'accessories-belts', parentSlug: 'accessories', order: 30 }
    ];

    const catMap = {};
    for (const c of mainCategories) {
      const parentId = deptMap[c.parentSlug];
      const res = await client.query(`
        INSERT INTO public.product_categories (name, slug, parent_id, taxonomy_level, level, display_order, is_active, created_at)
        VALUES ($1, $2, $3, 'CATEGORY', 2, $4, true, NOW())
        ON CONFLICT (slug) DO UPDATE 
        SET parent_id = EXCLUDED.parent_id,
            taxonomy_level = 'CATEGORY',
            level = 2,
            display_order = EXCLUDED.display_order,
            is_active = true
        RETURNING id, slug;
      `, [c.name, c.slug, parentId, c.order]);
      catMap[c.slug] = res.rows[0]?.id;
    }

    // 4. Seed Tier 3: Sub-Categories (level 3)
    console.log('4. Seeding Tier 3: Sub-Categories...');
    const subCategories = [
      // Under Men T-Shirts
      { name: 'Graphic Tees', slug: 'sub-graphic-tees', parentSlug: 'men-t-shirts', order: 10 },
      { name: 'Band & Tour Tees', slug: 'sub-band-tour-tees', parentSlug: 'men-t-shirts', order: 20 },
      { name: 'Single Stitch Vintage', slug: 'sub-single-stitch', parentSlug: 'men-t-shirts', order: 30 },
      { name: 'Blank Basics', slug: 'sub-blank-basics', parentSlug: 'men-t-shirts', order: 40 },
      // Under Men Hoodies & Sweaters
      { name: 'Pullover Hoodies', slug: 'sub-pullover-hoodies', parentSlug: 'men-hoodies-sweaters', order: 10 },
      { name: 'Zip Hoodies', slug: 'sub-zip-hoodies', parentSlug: 'men-hoodies-sweaters', order: 20 },
      { name: 'Crewneck Sweatshirts', slug: 'sub-crewneck-sweatshirts', parentSlug: 'men-hoodies-sweaters', order: 30 },
      { name: 'Fleece Pullovers', slug: 'sub-fleece-pullovers', parentSlug: 'men-hoodies-sweaters', order: 40 },
      // Under Men Pants & Denim
      { name: 'Denim Jeans (501 / Straight)', slug: 'sub-denim-jeans', parentSlug: 'men-pants-denim', order: 10 },
      { name: 'Cargo Pants', slug: 'sub-cargo-pants', parentSlug: 'men-pants-denim', order: 20 },
      { name: 'Workwear / Painter Pants', slug: 'sub-workwear-pants', parentSlug: 'men-pants-denim', order: 30 },
      { name: 'Chinos & Slacks', slug: 'sub-chinos', parentSlug: 'men-pants-denim', order: 40 },
      { name: 'Track & Sweatpants', slug: 'sub-sweatpants', parentSlug: 'men-pants-denim', order: 50 },
      // Under Men Jackets & Outerwear
      { name: 'Denim Trucker', slug: 'sub-denim-trucker', parentSlug: 'men-jackets-outerwear', order: 10 },
      { name: 'Leather Jackets', slug: 'sub-leather-jackets', parentSlug: 'men-jackets-outerwear', order: 20 },
      { name: 'Bomber Jackets', slug: 'sub-bombers', parentSlug: 'men-jackets-outerwear', order: 30 },
      { name: 'Puffer Jackets', slug: 'sub-puffer-jackets', parentSlug: 'men-jackets-outerwear', order: 40 },
      { name: 'Windbreakers', slug: 'sub-windbreakers', parentSlug: 'men-jackets-outerwear', order: 50 },
      // Under Caps & Hats
      { name: 'Al Neyadi Caps', slug: 'sub-neyadi-caps', parentSlug: 'accessories-caps-hats', order: 10 },
      { name: 'Snapback Caps', slug: 'sub-snapbacks', parentSlug: 'accessories-caps-hats', order: 20 },
      { name: 'Trucker Caps', slug: 'sub-truckers', parentSlug: 'accessories-caps-hats', order: 30 },
      { name: 'Knit Beanies', slug: 'sub-beanies', parentSlug: 'accessories-caps-hats', order: 40 }
    ];

    for (const sc of subCategories) {
      const parentId = catMap[sc.parentSlug];
      await client.query(`
        INSERT INTO public.product_categories (name, slug, parent_id, taxonomy_level, level, display_order, is_active, created_at)
        VALUES ($1, $2, $3, 'SUBCATEGORY', 3, $4, true, NOW())
        ON CONFLICT (slug) DO UPDATE 
        SET parent_id = EXCLUDED.parent_id,
            taxonomy_level = 'SUBCATEGORY',
            level = 3,
            display_order = EXCLUDED.display_order,
            is_active = true;
      `, [sc.name, sc.slug, parentId, sc.order]);
    }

    // 5. Create NEW table public.collections
    console.log('5. Creating public.collections table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        code VARCHAR(50) NOT NULL,
        season VARCHAR(50) NOT NULL DEFAULT 'All Season',
        year INT NOT NULL DEFAULT 2026,
        is_active BOOLEAN NOT NULL DEFAULT true,
        display_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed Collections
    console.log('6. Seeding core Collections & Seasons...');
    const collections = [
      { name: 'Summer Edition 2026', code: 'SUMMER-26', season: 'Summer', year: 2026, order: 10 },
      { name: 'Winter Maazi Drop 2026', code: 'WINTER-26', season: 'Winter', year: 2026, order: 20 },
      { name: 'Autumn Heritage Archive', code: 'AUTUMN-26', season: 'Autumn', year: 2026, order: 30 },
      { name: 'Spring Essentials 2026', code: 'SPRING-26', season: 'Spring', year: 2026, order: 40 },
      { name: 'Core Archive Vault', code: 'CORE-VAULT', season: 'All Season', year: 2026, order: 50 },
      { name: 'Ramadan Special Drop', code: 'RAMADAN-26', season: 'Special Event', year: 2026, order: 60 }
    ];

    for (const col of collections) {
      await client.query(`
        INSERT INTO public.collections (name, code, season, year, is_active, display_order, created_at)
        VALUES ($1, $2, $3, $4, true, $5, NOW())
        ON CONFLICT (name) DO UPDATE 
        SET code = EXCLUDED.code,
            season = EXCLUDED.season,
            year = EXCLUDED.year,
            display_order = EXCLUDED.display_order,
            is_active = true;
      `, [col.name, col.code, col.season, col.year, col.order]);
    }

    // 7. Add collection_id, collection_name, sub_category to inventory_pieces and bale_sorted_pieces
    console.log('7. Adding collection and subcategory columns to inventory_pieces and bale_sorted_pieces...');
    await client.query(`
      ALTER TABLE public.inventory_pieces 
      ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS collection_name TEXT,
      ADD COLUMN IF NOT EXISTS sub_category TEXT;

      ALTER TABLE public.bale_sorted_pieces 
      ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS collection_name TEXT,
      ADD COLUMN IF NOT EXISTS sub_category TEXT;
    `);

    // 8. Performance indexes
    console.log('8. Creating indexes for taxonomy and collections...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_categories_taxonomy 
      ON public.product_categories(taxonomy_level, parent_id, is_active);

      CREATE INDEX IF NOT EXISTS idx_inventory_pieces_collection 
      ON public.inventory_pieces(collection_id);

      CREATE INDEX IF NOT EXISTS idx_inventory_pieces_segment 
      ON public.inventory_pieces(market_segment);
    `);

    console.log('✓ 4-Tier Taxonomy & Collections migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await client.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
