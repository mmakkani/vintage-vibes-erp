const { Client } = require('pg');
require('dotenv').config();

async function runEcommerceMigration() {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

  // Auto-clean common password format issues (brackets, unescaped @)
  try {
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, user, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) {
        rawPwd = rawPwd.slice(1, -1);
      }
      dbUrl = `postgresql://${user}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
  } catch (e) {}

  console.log('[E-Commerce SQL Migration] Connecting to live database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[E-Commerce SQL Migration] Database connection established!');

    // 1. Ensure orders table exists with full ecommerce relational schema
    console.log('[E-Commerce SQL Migration] Creating/Verifying "orders" table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(64) PRIMARY KEY,
        order_number VARCHAR(32) UNIQUE NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(64) NOT NULL,
        customer_email VARCHAR(255),
        customer_address TEXT,
        city VARCHAR(100) DEFAULT 'Dubai',
        country VARCHAR(64) DEFAULT 'UAE',
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT 'AED',
        payment_method VARCHAR(32) DEFAULT 'COD',
        payment_status VARCHAR(32) DEFAULT 'PENDING',
        order_status VARCHAR(32) DEFAULT 'CONFIRMED',
        source VARCHAR(32) DEFAULT 'STOREFRONT',
        whatsapp_notified BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
    `);

    // 2. Ensure cart_reservations table exists (for 10-minute 1-of-1 piece lock)
    console.log('[E-Commerce SQL Migration] Creating/Verifying "cart_reservations" table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_reservations (
        id VARCHAR(64) PRIMARY KEY,
        barcode VARCHAR(64) NOT NULL,
        session_id VARCHAR(128) NOT NULL,
        piece_title VARCHAR(255),
        price_aed DECIMAL(10, 2) DEFAULT 0.00,
        reserved_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_cart_res_barcode ON cart_reservations(barcode);
      CREATE INDEX IF NOT EXISTS idx_cart_res_session ON cart_reservations(session_id);
      CREATE INDEX IF NOT EXISTS idx_cart_res_expires ON cart_reservations(expires_at);
    `);

    // 3. Ensure grail_bounties table exists (Customer Grail Wishlist)
    console.log('[E-Commerce SQL Migration] Creating/Verifying "grail_bounties" table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS grail_bounties (
        id VARCHAR(64) PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(64) NOT NULL,
        customer_email VARCHAR(255),
        desired_brand VARCHAR(100) NOT NULL,
        desired_category VARCHAR(100),
        desired_size VARCHAR(32),
        max_budget_aed DECIMAL(10, 2),
        notes TEXT,
        status VARCHAR(32) DEFAULT 'SEARCHING',
        matched_barcode VARCHAR(64),
        notified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_bounties_brand ON grail_bounties(desired_brand);
      CREATE INDEX IF NOT EXISTS idx_bounties_status ON grail_bounties(status);
      CREATE INDEX IF NOT EXISTS idx_bounties_phone ON grail_bounties(customer_phone);
    `);

    // 4. Ensure inventory_pieces table exists and has necessary columns
    console.log('[E-Commerce SQL Migration] Verifying "inventory_pieces" table columns...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_pieces (
        id VARCHAR(64) PRIMARY KEY,
        barcode VARCHAR(64) UNIQUE NOT NULL,
        item_id VARCHAR(64),
        item_name VARCHAR(255),
        brand_id VARCHAR(64),
        brand_name VARCHAR(255),
        label_grade_id VARCHAR(64),
        label_grade VARCHAR(64),
        shop_id VARCHAR(64),
        shop_name VARCHAR(255),
        size_scanned VARCHAR(64),
        country_of_origin VARCHAR(128),
        style VARCHAR(255),
        tag_image_url TEXT,
        ocr_confidence DECIMAL(5, 2),
        weight_kg DECIMAL(8, 3) DEFAULT 0.400,
        estimated_price DECIMAL(10, 2) DEFAULT 250.00,
        retail_price_aed DECIMAL(10, 2) DEFAULT 295.00,
        is_sold BOOLEAN DEFAULT FALSE,
        status VARCHAR(32) DEFAULT 'IN_STOCK',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_inv_pieces_barcode ON inventory_pieces(barcode);
      CREATE INDEX IF NOT EXISTS idx_inv_pieces_is_sold ON inventory_pieces(is_sold);
      CREATE INDEX IF NOT EXISTS idx_inv_pieces_status ON inventory_pieces(status);
    `);

    console.log('[E-Commerce SQL Migration] ✓ All E-Commerce SQL tables, constraints, and indexes are ready!');

  } catch (err) {
    console.error('[E-Commerce SQL Migration Error]:', err.message);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  runEcommerceMigration()
    .then(() => {
      console.log('[E-Commerce SQL Migration] Completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[E-Commerce SQL Migration] Failed:', err);
      process.exit(1);
    });
}

module.exports = { runEcommerceMigration };
