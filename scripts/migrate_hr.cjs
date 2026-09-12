const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
  }

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

  console.log('[HR Migration] Connecting to PostgreSQL database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[HR Migration] Connected successfully!');

    // 1. Check existing employees table structure
    const empCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employees'
      ORDER BY ordinal_position;
    `);
    console.log('[HR Migration] Current employees columns count:', empCols.rows.length);

    // 2. Add all missing columns to employees table
    const alterEmployeesSQL = `
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name_arabic TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS nationality TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'MALE';
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS dob DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS joining_date DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emirates_id TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS id_card_no TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emirates_id_expiry DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS passport_no TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS passport_country TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS passport_issue_date DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS passport_expiry DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS residency_card_no TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS uid_no TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS residency_profession TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS residency_sponsor TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS residency_issue_date DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS residency_expiry_date DATE;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS id_front_image_url TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS id_back_image_url TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS passport_image_url TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS residency_image_url TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS photo_url TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS base_salary NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS housing_allow NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS transport_allow NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS other_allow NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS working_hours_per_day NUMERIC(5,2) DEFAULT 8;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      UPDATE public.employees 
      SET name = COALESCE(name, full_name, 'Employee'),
          full_name = COALESCE(full_name, name, 'Employee'),
          base_salary = COALESCE(base_salary, basic_salary, 0),
          basic_salary = COALESCE(basic_salary, base_salary, 0),
          joining_date = COALESCE(joining_date, date_of_joining, CURRENT_DATE),
          date_of_joining = COALESCE(date_of_joining, joining_date, CURRENT_DATE);
    `;
    await client.query(alterEmployeesSQL);
    console.log('[HR Migration] Successfully updated public.employees table columns.');

    // 3. Create public.employee_documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.employee_documents (
        id TEXT PRIMARY KEY,
        employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
        document_type TEXT NOT NULL,
        document_no TEXT,
        document_name TEXT,
        file_url TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        issue_date DATE,
        expiry_date DATE,
        ocr_data JSONB,
        is_verified BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_employee_docs_emp_id ON public.employee_documents(employee_id);
    `);
    console.log('[HR Migration] Verified public.employee_documents table.');

    // 4. Create public.employee_attendance & hr_attendance_sheets
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.employee_attendance (
        id TEXT PRIMARY KEY,
        employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
        employee_name TEXT,
        emp_code TEXT,
        month_year TEXT NOT NULL,
        days_worked NUMERIC(5,2) DEFAULT 30,
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        status TEXT DEFAULT 'DRAFT',
        locked_at TIMESTAMPTZ,
        locked_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_emp_att_month ON public.employee_attendance(month_year);

      CREATE TABLE IF NOT EXISTS public.hr_attendance_sheets (
        id TEXT PRIMARY KEY,
        month_year TEXT UNIQUE NOT NULL,
        total_employees INTEGER DEFAULT 0,
        status TEXT DEFAULT 'DRAFT',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[HR Migration] Verified attendance tables.');

    // 5. Create public.employee_loans
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.employee_loans (
        id TEXT PRIMARY KEY,
        employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
        employee_name TEXT,
        emp_code TEXT,
        type TEXT DEFAULT 'SALARY_ADVANCE',
        principal_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        emi_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        total_months INTEGER NOT NULL DEFAULT 1,
        start_month TEXT NOT NULL,
        remaining_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        disbursement_account TEXT,
        disbursement_method TEXT DEFAULT 'BANK_TRANSFER',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_emp_loans_emp_id ON public.employee_loans(employee_id);
    `);
    console.log('[HR Migration] Verified employee_loans table.');

    // 6. Create public.employee_payroll & hr_payroll_sheets
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.employee_payroll (
        id TEXT PRIMARY KEY,
        employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
        employee_name TEXT,
        emp_code TEXT,
        designation TEXT,
        month_year TEXT NOT NULL,
        status TEXT DEFAULT 'DRAFT',
        base_salary NUMERIC(15,2) DEFAULT 0,
        allowances NUMERIC(15,2) DEFAULT 0,
        daily_rate NUMERIC(15,2) DEFAULT 0,
        hourly_rate NUMERIC(15,2) DEFAULT 0,
        days_worked NUMERIC(5,2) DEFAULT 30,
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        earned_basic NUMERIC(15,2) DEFAULT 0,
        overtime_pay NUMERIC(15,2) DEFAULT 0,
        gross_pay NUMERIC(15,2) DEFAULT 0,
        advance_deduction NUMERIC(15,2) DEFAULT 0,
        loan_emi_deduction NUMERIC(15,2) DEFAULT 0,
        total_deductions NUMERIC(15,2) DEFAULT 0,
        net_pay NUMERIC(15,2) DEFAULT 0,
        payment_method TEXT DEFAULT 'BANK_TRANSFER',
        bank_account_id TEXT,
        bank_account_name TEXT,
        posted_at TIMESTAMPTZ,
        posted_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_emp_payroll_month ON public.employee_payroll(month_year);

      CREATE TABLE IF NOT EXISTS public.hr_payroll_sheets (
        id TEXT PRIMARY KEY,
        month_year TEXT UNIQUE NOT NULL,
        total_employees INTEGER DEFAULT 0,
        total_gross NUMERIC(15,2) DEFAULT 0,
        total_deductions NUMERIC(15,2) DEFAULT 0,
        total_net NUMERIC(15,2) DEFAULT 0,
        status TEXT DEFAULT 'DRAFT',
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[HR Migration] Verified payroll tables.');

    // 7. Create public.hr_ocr_logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.hr_ocr_logs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        employee_id TEXT,
        document_type TEXT,
        confidence_score NUMERIC(5,2),
        extracted_data JSONB,
        raw_response TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[HR Migration] Verified hr_ocr_logs table.');

    console.log('[HR Migration] All HR tables and columns successfully migrated!');
  } catch (err) {
    console.error('[HR Migration Error]:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
