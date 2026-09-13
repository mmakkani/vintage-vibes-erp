const { Client } = require('pg');
require('dotenv').config();

async function seedBales() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const check = await client.query('SELECT count(*) FROM inward_gate_passes;');
  console.log('Current inward_gate_passes count:', check.rows[0].count);

  if (Number(check.rows[0].count) === 0) {
    console.log('Seeding initial real imported bales into inward_gate_passes...');

    const bales = [
      {
        id: 'igp-bale-001',
        pass_no: 'IGP-2026-0001',
        gate_pass_no: 'IGP-2026-0001',
        bale_code: 'BAL-GTX-001',
        purchase_invoice_no: 'COMM-INV-2026-081',
        supplier_name: 'GOLDTEX FZC',
        bale_category: 'Graphic T-Shirts & Band Tees',
        total_bale_weight: 45.00,
        total_bale_cost: 3600.00,
        cost_per_gram: 0.080000,
        broken_down_weight: 0.00,
        piece_count: 0,
        status: 'UNOPENED'
      },
      {
        id: 'igp-bale-002',
        pass_no: 'IGP-2026-0002',
        gate_pass_no: 'IGP-2026-0002',
        bale_code: 'BAL-USM-002',
        purchase_invoice_no: 'COMM-INV-2026-094',
        supplier_name: 'USAMAN GLOBAL',
        bale_category: 'Vintage Denim & Jeans',
        total_bale_weight: 50.00,
        total_bale_cost: 3200.00,
        cost_per_gram: 0.064000,
        broken_down_weight: 0.00,
        piece_count: 0,
        status: 'UNOPENED'
      },
      {
        id: 'igp-bale-003',
        pass_no: 'IGP-2026-0003',
        gate_pass_no: 'IGP-2026-0003',
        bale_code: 'BAL-SLW-003',
        purchase_invoice_no: 'COMM-INV-2026-102',
        supplier_name: 'SALWA TEX',
        bale_category: 'Vintage Jackets & Outerwear',
        total_bale_weight: 40.00,
        total_bale_cost: 3800.00,
        cost_per_gram: 0.095000,
        broken_down_weight: 0.00,
        piece_count: 0,
        status: 'UNOPENED'
      },
      {
        id: 'igp-bale-004',
        pass_no: 'IGP-2026-0004',
        gate_pass_no: 'IGP-2026-0004',
        bale_code: 'BAL-GTX-004',
        purchase_invoice_no: 'COMM-INV-2026-115',
        supplier_name: 'GOLDTEX FZC',
        bale_category: 'Vintage Sportswear & Track Tops',
        total_bale_weight: 35.00,
        total_bale_cost: 2450.00,
        cost_per_gram: 0.070000,
        broken_down_weight: 0.00,
        piece_count: 0,
        status: 'UNOPENED'
      }
    ];

    for (const b of bales) {
      await client.query(`
        INSERT INTO inward_gate_passes (
          id, pass_no, gate_pass_no, bale_code, purchase_invoice_no, supplier_name,
          bale_category, total_bale_weight, total_bale_cost, cost_per_gram,
          broken_down_weight, piece_count, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [
        b.id, b.pass_no, b.gate_pass_no, b.bale_code, b.purchase_invoice_no, b.supplier_name,
        b.bale_category, b.total_bale_weight, b.total_bale_cost, b.cost_per_gram,
        b.broken_down_weight, b.piece_count, b.status
      ]);
      console.log('Seeded bale:', b.bale_code);
    }
  }

  const finalCheck = await client.query('SELECT count(*) FROM inward_gate_passes;');
  console.log('Final inward_gate_passes count:', finalCheck.rows[0].count);

  await client.end();
}

seedBales().catch(console.error);
