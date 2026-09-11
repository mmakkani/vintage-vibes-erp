require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const updateRes = await client.query(`
    UPDATE purchase_invoices pi
    SET supplier_name = p.name,
        party_name = p.name
    FROM parties p
    WHERE (pi.supplier_id = p.id OR pi.supplier_id = p.code)
      AND (pi.supplier_name IS NULL OR pi.supplier_name = '');
  `);

  console.log('Backfilled supplier_name rows:', updateRes.rowCount);

  const check = await client.query(`
    SELECT invoice_no, supplier_id, supplier_name, invoice_date, created_at
    FROM purchase_invoices
    ORDER BY created_at DESC
    LIMIT 5;
  `);

  console.log('Sample updated invoices:', check.rows);
  await client.end();
}

main().catch(console.error);
