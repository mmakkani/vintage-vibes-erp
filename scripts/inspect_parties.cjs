const { Client } = require('pg');
require('dotenv').config();

async function inspect() {
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

  const partyCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'parties'");
  console.log('parties columns:', partyCols.rows);

  const parties = await client.query('SELECT * FROM parties');
  console.log('existing parties in db:', parties.rows);

  const coaAccounts = await client.query('SELECT code, name, type, parent_id FROM coa_accounts WHERE code LIKE $1 OR code LIKE $2', ['2110%', '1130%']);
  console.log('accounts under 2110 or 1130 in db:', coaAccounts.rows);

  await client.end();
}

inspect().catch(console.error);
