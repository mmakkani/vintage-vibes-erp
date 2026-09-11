const { Client } = require('pg');
require('dotenv').config();

async function run() {
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
  console.log('[Migration] Connected to Supabase PostgreSQL database.');

  console.log('[Migration] Updating table schemas...');
  // 1. coa_accounts columns
  await client.query(`
    ALTER TABLE coa_accounts ADD COLUMN IF NOT EXISTS party_id VARCHAR(64);
    ALTER TABLE coa_accounts ADD COLUMN IF NOT EXISTS tier_level INTEGER DEFAULT 3;
    ALTER TABLE coa_accounts ADD COLUMN IF NOT EXISTS parent_code VARCHAR(32);
  `);

  // 2. parties columns
  await client.query(`
    ALTER TABLE parties ADD COLUMN IF NOT EXISTS coa_account_id VARCHAR(64);
  `);

  // 3. ledgers columns
  await client.query(`
    ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS party_id VARCHAR(64);
    ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS party_name VARCHAR(128);
  `);

  // Add foreign keys safely if not exists
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_parties_coa_account'
      ) THEN
        ALTER TABLE parties 
        ADD CONSTRAINT fk_parties_coa_account 
        FOREIGN KEY (coa_account_id) REFERENCES coa_accounts(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_coa_accounts_party'
      ) THEN
        ALTER TABLE coa_accounts 
        ADD CONSTRAINT fk_coa_accounts_party 
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_ledgers_party'
      ) THEN
        ALTER TABLE ledgers 
        ADD CONSTRAINT fk_ledgers_party 
        FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  console.log('[Migration] Schema updated successfully!');

  // 4. Backfill existing parties to ensure COA accounts exist and are linked
  console.log('[Migration] Auto-provisioning COA accounts for all existing parties...');
  const partiesRes = await client.query('SELECT * FROM parties');
  console.log(`[Migration] Found ${partiesRes.rows.length} parties.`);

  for (const party of partiesRes.rows) {
    const isSupplier = party.type === 'SUPPLIER';
    const isClient = party.type === 'CLIENT' || party.type === 'CUSTOMER';
    
    // Parent Account determination
    const parentCode = isSupplier ? '2110-00' : (isClient ? '1130-00' : '2120-00');
    const parentRes = await client.query('SELECT id FROM coa_accounts WHERE code = $1', [parentCode]);
    const parentId = parentRes.rows[0]?.id || (isSupplier ? 'acc-2110' : 'acc-1130');
    
    const coaType = isSupplier ? 'LIABILITY' : (isClient ? 'ASSET' : 'LIABILITY');
    const subType = isSupplier ? 'Accounts Payable - Trade' : (isClient ? 'Accounts Receivable - Trade' : 'Accounts Payable - Agent');
    const cleanCode = (party.code || '').replace(/[^A-Za-z0-9]/g, '') || String(Date.now()).slice(-4);
    const coaCode = isSupplier ? `2110-${cleanCode}` : (isClient ? `1130-${cleanCode}` : `2120-${cleanCode}`);
    const coaId = `acc-${party.id}`;
    const roleTag = isSupplier ? 'Supplier' : (isClient ? 'Customer' : 'Agent');
    const coaName = `${party.name} (${roleTag})`;

    console.log(`[Migration] Processing party "${party.name}" (${party.type}) -> COA: ${coaCode} (${coaName})`);

    // Insert or update in coa_accounts
    await client.query(`
      INSERT INTO coa_accounts (id, code, name, type, sub_type, currency, current_balance, is_active, parent_id, party_id, tier_level, parent_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 3, $11)
      ON CONFLICT (code) DO UPDATE 
      SET name = EXCLUDED.name,
          type = EXCLUDED.type,
          sub_type = EXCLUDED.sub_type,
          parent_id = EXCLUDED.parent_id,
          party_id = EXCLUDED.party_id,
          tier_level = 3,
          parent_code = EXCLUDED.parent_code
    `, [
      coaId,
      coaCode,
      coaName,
      coaType,
      subType,
      party.currency || 'AED',
      party.current_balance || 0,
      party.is_active !== false,
      parentId,
      party.id,
      parentCode
    ]);

    // Update parties table with coa_account_id and account_map
    const accountMap = {
      ...(party.account_map || {}),
      payableAccountId: isSupplier ? coaCode : (party.account_map?.payableAccountId || '2110-00'),
      receivableAccountId: isClient ? coaCode : (party.account_map?.receivableAccountId || '1130-00')
    };

    await client.query(`
      UPDATE parties 
      SET coa_account_id = $1, account_map = $2
      WHERE id = $3
    `, [coaId, JSON.stringify(accountMap), party.id]);

    console.log(`[Migration] Successfully linked party "${party.name}" to COA Account ID "${coaId}" (${coaCode})!`);
  }

  // Verification query
  const checkCoa = await client.query(`
    SELECT c.id, c.code, c.name, c.type, c.sub_type, c.current_balance, c.party_id, p.name as party_name, p.type as party_type
    FROM coa_accounts c
    LEFT JOIN parties p ON c.party_id = p.id
    WHERE c.party_id IS NOT NULL OR c.code LIKE '2110-%' OR c.code LIKE '1130-%'
  `);
  console.log('[Migration] Verified linked accounts in COA:');
  console.log(checkCoa.rows);

  await client.end();
}

run().catch(err => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
