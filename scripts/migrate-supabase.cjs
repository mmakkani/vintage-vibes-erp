const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl || dbUrl.includes('your_') || dbUrl.includes('[یہاں') || dbUrl.includes('placeholder')) {
    console.log('[Supabase Migration] No live connection string configured yet.');
    console.log('[Supabase Migration] Set DATABASE_URL in .env to execute live cloud migrations automatically.');
    return;
  }

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

  console.log('[Supabase Migration] Connecting to live Supabase PostgreSQL database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[Supabase Migration] Connected successfully!');

    const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('[Supabase Migration] Executing schema migrations, tables, and relational constraints...');
    await client.query(sql);
    console.log('[Supabase Migration] All tables, indexes, and relational constraints created successfully!');

    // Check if initial admin user exists
    const userRes = await client.query('SELECT count(*) FROM users');
    if (parseInt(userRes.rows[0].count, 10) === 0) {
      console.log('[Supabase Migration] Seeding initial Admin and Accountant credentials...');
      await client.query(`
        INSERT INTO users (id, username, password_hash, name, email, role, is_active)
        VALUES 
          ('usr-admin', 'admin', 'admin123', 'Muhammad', 'admin@vintagevibe.ae', 'ADMIN', true),
          ('usr-acct', 'accountant', 'acct123', 'Farhan Zaidi (Senior Accountant)', 'accountant@vintagevibe.ae', 'ACCOUNTANT', true)
        ON CONFLICT (username) DO NOTHING;
      `);
      console.log('[Supabase Migration] Admin accounts seeded!');
    }

  } catch (err) {
    console.error('[Supabase Migration Error]:', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
