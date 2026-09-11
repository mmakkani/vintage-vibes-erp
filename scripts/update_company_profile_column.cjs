require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to DB');

  // Add columns if they don't exist
  await client.query(`
    ALTER TABLE public.company_profile 
      ADD COLUMN IF NOT EXISTS company_display_name TEXT,
      ADD COLUMN IF NOT EXISTS trn_number TEXT,
      ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
      ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'AL AIN, ABU DHABI',
      ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'UNITED ARAB EMIRATES',
      ADD COLUMN IF NOT EXISTS corporate_phone TEXT,
      ADD COLUMN IF NOT EXISTS corporate_email TEXT,
      ADD COLUMN IF NOT EXISTS whatsapp_orders_number TEXT,
      ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{"facebook":"","instagram":"","youtube":"","tiktok":""}'::jsonb;

    ALTER TABLE public.company_profile DISABLE ROW LEVEL SECURITY;
  `);

  // Sync existing values
  await client.query(`
    UPDATE public.company_profile 
    SET 
      company_display_name = COALESCE(NULLIF(company_display_name, ''), NULLIF(company_name, ''), 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'),
      company_name = COALESCE(NULLIF(company_name, ''), NULLIF(company_display_name, ''), 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'),
      trn_number = COALESCE(NULLIF(trn_number, ''), NULLIF(trn_tax_no, ''), '100482910300003'),
      trn_tax_no = COALESCE(NULLIF(trn_tax_no, ''), NULLIF(trn_number, ''), '100482910300003'),
      address_line_1 = COALESCE(NULLIF(address_line_1, ''), NULLIF(address_line1, ''), 'House 14 Street 4 - Al Jimi - Al Nudood'),
      address_line1 = COALESCE(NULLIF(address_line1, ''), NULLIF(address_line_1, ''), 'House 14 Street 4 - Al Jimi - Al Nudood'),
      address_line_2 = COALESCE(NULLIF(address_line_2, ''), NULLIF(address_line2, ''), 'Al Ain, Abu Dhabi, United Arab Emirates'),
      address_line2 = COALESCE(NULLIF(address_line2, ''), NULLIF(address_line_2, ''), 'Al Ain, Abu Dhabi, United Arab Emirates'),
      city = COALESCE(NULLIF(city, ''), 'AL AIN, ABU DHABI'),
      country = COALESCE(NULLIF(country, ''), 'UNITED ARAB EMIRATES'),
      corporate_phone = COALESCE(NULLIF(corporate_phone, ''), NULLIF(phone, ''), '+971 55 418 6086'),
      phone = COALESCE(NULLIF(phone, ''), NULLIF(corporate_phone, ''), '+971 55 418 6086'),
      corporate_email = COALESCE(NULLIF(corporate_email, ''), NULLIF(email, ''), 'vintagevibe006@gmail.com'),
      email = COALESCE(NULLIF(email, ''), NULLIF(corporate_email, ''), 'vintagevibe006@gmail.com'),
      whatsapp_orders_number = COALESCE(NULLIF(whatsapp_orders_number, ''), '+971554186086'),
      social_links = CASE 
        WHEN social_links IS NULL 
             OR (social_links->>'facebook' = '' AND social_links->>'instagram' = '' AND social_links->>'youtube' = '' AND social_links->>'tiktok' = '')
        THEN '{"facebook":"https://www.facebook.com/vintagevibes.ae/","instagram":"https://www.instagram.com/vintagevibes.llc/","youtube":"https://www.youtube.com/@VintageVibesLLCSPC","tiktok":"https://www.tiktok.com/@vintagevibe5500?_r=1&_t=ZS-92mvtBCTWqn"}'::jsonb
        ELSE social_links
      END
    WHERE id = 'default-company';
  `);

  const profile = await client.query(`
    SELECT id, company_display_name, trn_number, address_line_1, address_line_2, city, country, corporate_phone, corporate_email, whatsapp_orders_number, social_links FROM public.company_profile WHERE id = 'default-company';
  `);
  console.log('Current company_profile row:', profile.rows[0]);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
