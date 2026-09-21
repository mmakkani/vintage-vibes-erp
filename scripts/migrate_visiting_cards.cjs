const { Client } = require('pg');
require('dotenv').config();

async function migrate() {
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

  console.log('Connected to PostgreSQL. Creating public.visiting_cards table...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.visiting_cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name TEXT,
      contact_person TEXT,
      designation TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      website TEXT,
      card_image_url TEXT,
      notes TEXT,
      status TEXT DEFAULT 'LEAD',
      converted_party_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Table public.visiting_cards verified/created successfully.');

  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'visiting_cards'
    ORDER BY ordinal_position;
  `);
  console.log('Columns in visiting_cards:', cols.rows);

  await client.end();
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
