import { withDb } from '../src/db/pgPool.ts';

async function setupFiscalTables() {
  console.log('🚀 Creating Fiscal & Period Closing tables in Supabase PostgreSQL...');
  try {
    await withDb(async (client) => {
      // 1. Fiscal Years Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.fiscal_years (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          year INT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          status TEXT DEFAULT 'OPEN',
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      console.log('  ✓ public.fiscal_years table ready');

      // 2. Closed Fiscal Periods Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.fiscal_closed_periods (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          period_name TEXT NOT NULL,
          period_type TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          closed_at TIMESTAMPTZ DEFAULT now(),
          closed_by TEXT NOT NULL,
          total_revenue NUMERIC(15, 2) DEFAULT 0,
          total_cogs NUMERIC(15, 2) DEFAULT 0,
          gross_profit NUMERIC(15, 2) DEFAULT 0,
          operating_expenses NUMERIC(15, 2) DEFAULT 0,
          net_profit NUMERIC(15, 2) DEFAULT 0,
          retained_earnings_balance NUMERIC(15, 2) DEFAULT 0,
          is_locked BOOLEAN DEFAULT true,
          closing_voucher_no TEXT NOT NULL,
          hash_checksum TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      console.log('  ✓ public.fiscal_closed_periods table ready');

      // Seed default fiscal years if empty
      const existingYears = await client.query(`SELECT COUNT(*) FROM public.fiscal_years`);
      if (parseInt(existingYears.rows[0].count, 10) === 0) {
        await client.query(`
          INSERT INTO public.fiscal_years (year, title, start_date, end_date, status)
          VALUES 
            (2024, 'Fiscal Year 2024', '2024-01-01', '2024-12-31', 'OPEN'),
            (2025, 'Fiscal Year 2025', '2025-01-01', '2025-12-31', 'OPEN'),
            (2026, 'Fiscal Year 2026', '2026-01-01', '2026-12-31', 'CURRENT'),
            (2027, 'Fiscal Year 2027', '2027-01-01', '2027-12-31', 'OPEN')
          ON CONFLICT (year) DO NOTHING;
        `);
        console.log('  ✓ Default fiscal years seeded (2024-2027)');
      }
    });

    console.log('🎉 Database setup complete! Tables created successfully.');
  } catch (error) {
    console.error('❌ Error setting up database tables:', error);
  } finally {
    process.exit(0);
  }
}

setupFiscalTables();
