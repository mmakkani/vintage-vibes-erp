import { Router } from 'express';
import { Client } from 'pg';
import { supabase } from '../../supabaseClient.ts';
import { PartiesController } from './parties.controller.ts';

export const partiesRouter = Router();

const getDbClient = async () => {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
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
  return client;
};

// -------------------------------------------------------------
// 1. GET /api/parties - List all parties from PostgreSQL
// -------------------------------------------------------------
partiesRouter.get('/', async (req, res) => {
  const { type } = req.query as { type?: string };
  let client: Client | null = null;

  try {
    client = await getDbClient();

    let query = 'SELECT * FROM parties';
    const params: any[] = [];
    if (type && type !== 'ALL') {
      query += ' WHERE UPPER(type) = UPPER($1)';
      params.push(type);
    }
    query += ' ORDER BY name ASC;';

    const partiesRes = await client.query(query, params);
    const liveBalancesRes = await client.query('SELECT party_id, account_id, current_balance FROM view_coa_live_balances;').catch(() => ({ rows: [] }));
    const khataCountsRes = await client.query('SELECT party_id, COUNT(*) as count FROM party_khata_logs GROUP BY party_id;').catch(() => ({ rows: [] }));
    const purCountsRes = await client.query('SELECT supplier_id as party_id, COUNT(*) as count FROM purchase_invoices GROUP BY supplier_id;').catch(() => ({ rows: [] }));
    const salesCountsRes = await client.query('SELECT client_id as party_id, COUNT(*) as count FROM sales_invoices GROUP BY client_id;').catch(() => ({ rows: [] }));
    const glCountsRes = await client.query('SELECT party_id, COUNT(*) as count FROM general_ledger WHERE party_id IS NOT NULL GROUP BY party_id;').catch(() => ({ rows: [] }));

    if (partiesRes.rows) {
      if (partiesRes.rows.length === 0) {
        return res.json([]);
      }
      const liveBalancesMap = new Map<string, number>();
      (liveBalancesRes.rows || []).forEach((row: any) => {
        if (row.party_id) liveBalancesMap.set(String(row.party_id), Number(row.current_balance || 0));
        if (row.account_id) liveBalancesMap.set(String(row.account_id), Number(row.current_balance || 0));
      });

      const khataMap = new Map<string, number>();
      (khataCountsRes.rows || []).forEach((r: any) => khataMap.set(String(r.party_id), Number(r.count || 0)));

      const purMap = new Map<string, number>();
      (purCountsRes.rows || []).forEach((r: any) => purMap.set(String(r.party_id), Number(r.count || 0)));

      const salesMap = new Map<string, number>();
      (salesCountsRes.rows || []).forEach((r: any) => salesMap.set(String(r.party_id), Number(r.count || 0)));

      const glMap = new Map<string, number>();
      (glCountsRes.rows || []).forEach((r: any) => glMap.set(String(r.party_id), Number(r.count || 0)));

      const mapped = partiesRes.rows.map((row: any) => {
        const liveBal = liveBalancesMap.has(String(row.id))
          ? liveBalancesMap.get(String(row.id))!
          : (row.coa_account_id && liveBalancesMap.has(String(row.coa_account_id))
            ? liveBalancesMap.get(String(row.coa_account_id))!
            : Number(row.current_balance ?? 0));

        const khataCount = khataMap.get(String(row.id)) || 0;
        const purCount = purMap.get(String(row.id)) || 0;
        const salesCount = salesMap.get(String(row.id)) || 0;
        const glCount = glMap.get(String(row.id)) || 0;
        const totalEntries = khataCount + purCount + salesCount + glCount;
        const hasEntries = totalEntries > 0 || Math.abs(liveBal) > 0.001;

        return {
          id: String(row.id),
          code: row.code || `P-${String(row.id).slice(-4)}`,
          name: row.name || 'Unnamed Party',
          type: (row.type || 'CLIENT').toUpperCase(),
          contactPerson: row.contact_person || '',
          phone: row.phone || '',
          email: row.email || '',
          address: row.address || '',
          trnNo: row.trn_no || '',
          creditLimit: Number(row.credit_limit ?? 0),
          currentBalance: Number(liveBal.toFixed(2)),
          currency: row.currency || 'AED',
          isActive: row.is_active !== false,
          accountMap: row.account_map || {},
          coaAccountId: row.coa_account_id,
          coa_account_id: row.coa_account_id,
          purchaseInvoicesCount: purCount,
          salesInvoicesCount: salesCount,
          khataLogsCount: khataCount,
          glEntriesCount: glCount,
          totalEntriesCount: totalEntries,
          hasEntries: hasEntries,
          createdAt: row.created_at || new Date().toISOString()
        };
      });

      return res.json(mapped);
    }
  } catch (err: any) {
    console.error('Error querying PostgreSQL parties in /api/parties:', err.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }

  // Fallback to Supabase client
  try {
    const { data, error } = await supabase.from('parties').select('*').order('name');
    if (!error && Array.isArray(data)) {
      return res.json(data.map((r: any) => ({
        id: String(r.id),
        code: r.code || `P-${String(r.id).slice(-4)}`,
        name: r.name,
        type: (r.type || 'CLIENT').toUpperCase(),
        contactPerson: r.contact_person || '',
        phone: r.phone || '',
        email: r.email || '',
        address: r.address || '',
        trnNo: r.trn_no || '',
        creditLimit: Number(r.credit_limit || 0),
        currentBalance: Number(r.current_balance || 0),
        currency: r.currency || 'AED',
        isActive: r.is_active !== false,
        accountMap: r.account_map || {},
        coaAccountId: r.coa_account_id,
        purchaseInvoicesCount: 0,
        salesInvoicesCount: 0,
        khataLogsCount: 0,
        glEntriesCount: 0,
        totalEntriesCount: 0,
        hasEntries: Math.abs(Number(r.current_balance || 0)) > 0.001,
        createdAt: r.created_at
      })));
    }
  } catch (err) {
    console.error('Supabase fallback error in /api/parties:', err);
  }

  return res.json([]);
});

// -------------------------------------------------------------
// 2. GET /api/parties/:id - View single party with financial stats
// -------------------------------------------------------------
partiesRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;

  try {
    client = await getDbClient();
    const partyRes = await client.query('SELECT * FROM parties WHERE id = $1', [id]);
    if (partyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Party not found' });
    }

    const party = partyRes.rows[0];
    const cleanCode = (party.code || '').replace(/[^A-Za-z0-9]/g, '');
    const accountCodeSupplier = `2110-${cleanCode}`;
    const accountCodeClient = `1130-${cleanCode}`;
    const accountId = party.coa_account_id || `acc-${id}`;

    // Query invoice stats and ledger entries sequentially (avoids pg client socket concurrency)
    const purchasesRes = await client.query('SELECT count(*) as count, COALESCE(SUM(total_amount), 0) as total FROM purchase_invoices WHERE supplier_id = $1', [id]).catch(() => ({ rows: [{ count: 0, total: 0 }] }));
    const salesRes = await client.query('SELECT count(*) as count, COALESCE(SUM(total_amount), 0) as total FROM sales_invoices WHERE client_id = $1', [id]).catch(() => ({ rows: [{ count: 0, total: 0 }] }));
    const khataRes = await client.query('SELECT count(*) as count FROM party_khata_logs WHERE party_id = $1', [id]).catch(() => ({ rows: [{ count: 0 }] }));
    const glRes = await client.query(`
      SELECT count(*) as count FROM general_ledger 
      WHERE party_id = $1 OR account_id = $2 OR account_code = $3 OR account_code = $4
    `, [id, accountId, accountCodeSupplier, accountCodeClient]).catch(() => ({ rows: [{ count: 0 }] }));

    const purCount = Number(purchasesRes.rows[0]?.count || 0);
    const purTotal = Number(purchasesRes.rows[0]?.total || 0);
    const salesCount = Number(salesRes.rows[0]?.count || 0);
    const salesTotal = Number(salesRes.rows[0]?.total || 0);
    const khataCount = Number(khataRes.rows[0]?.count || 0);
    const glCount = Number(glRes.rows[0]?.count || 0);
    const curBal = Number(party.current_balance || 0);
    const totalEntries = purCount + salesCount + khataCount + glCount;
    const hasEntries = totalEntries > 0 || Math.abs(curBal) > 0.001;

    const result = {
      id: String(party.id),
      code: party.code,
      name: party.name,
      type: (party.type || 'CLIENT').toUpperCase(),
      contactPerson: party.contact_person || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      trnNo: party.trn_no || '',
      creditLimit: Number(party.credit_limit || 0),
      currentBalance: curBal,
      currency: party.currency || 'AED',
      isActive: party.is_active !== false,
      accountMap: party.account_map || {},
      coaAccountId: party.coa_account_id,
      purchaseInvoicesCount: purCount,
      salesInvoicesCount: salesCount,
      khataLogsCount: khataCount,
      glEntriesCount: glCount,
      totalEntriesCount: totalEntries,
      hasEntries: hasEntries,
      createdAt: party.created_at,
      stats: {
        purchaseInvoicesCount: purCount,
        purchaseInvoicesTotal: purTotal,
        salesInvoicesCount: salesCount,
        salesInvoicesTotal: salesTotal,
        khataTransactionsCount: khataCount,
        glEntriesCount: glCount,
        totalEntriesCount: totalEntries,
        hasEntries: hasEntries
      }
    };

    return res.json(result);
  } catch (err: any) {
    console.error('Error fetching party details:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 3. POST /api/parties - Create new Party in PostgreSQL
// -------------------------------------------------------------
partiesRouter.post('/', async (req, res) => {
  let client: Client | null = null;
  try {
    const partyData = req.body || {};
    const id = partyData.id || partyData.party_id || `pty-${Date.now()}`;
    const code = partyData.code || `P-${Math.floor(1000 + Math.random() * 9000)}`;
    const cleanName = String(partyData.name || partyData.company_name || partyData.companyName || '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Party company/customer name is required' });
    }

    const rawType = String(partyData.type || partyData.party_type || partyData.partyType || 'CLIENT').trim().toUpperCase();
    const type = (rawType === 'SUPPLIER' || rawType === 'AGENT') ? rawType : 'CLIENT';

    client = await getDbClient();

    // 0. Strict Duplicate Name Check (Case-insensitive & Trimmed)
    const dupCheck = await client.query(
      'SELECT id, code, name, type FROM parties WHERE UPPER(TRIM(name)) = UPPER(TRIM($1)) LIMIT 1',
      [cleanName]
    );
    if (dupCheck.rows.length > 0) {
      const ex = dupCheck.rows[0];
      return res.status(409).json({
        success: false,
        error: `Party with name "${cleanName}" already exists in the system (Code: ${ex.code}, Type: ${ex.type}). Duplicate customer/supplier names are strictly prohibited.`,
        messageUrdu: `اس نام (${cleanName}) کے ساتھ کسٹمر/سپلائر پہلے سے موجود ہے (کوڈ: ${ex.code})۔ ڈپلیکیٹ نام رکھنے کی اجازت نہیں ہے۔`,
        isDuplicate: true,
        existingParty: ex
      });
    }

    const contactPerson = partyData.contactPerson || partyData.contact_person || '';
    const phone = partyData.phone || partyData.contact_no || partyData.contactNo || '';
    const email = partyData.email || '';
    const address = partyData.address || '';
    const trnNo = partyData.trn_no || partyData.trnNo || partyData.tax_id || partyData.trnTaxNo || '';
    const creditLimit = Number(partyData.creditLimit ?? partyData.credit_limit ?? 50000);
    const currentBalance = Number(partyData.currentBalance ?? partyData.current_balance ?? 0);
    const currency = partyData.currency || 'AED';
    const isActive = partyData.isActive !== false && partyData.is_active !== false;

    // Determine COA sub-account details
    const isSupplier = type === 'SUPPLIER';
    const isClient = type === 'CLIENT' || type === 'CUSTOMER';
    const cleanCode = code.replace(/[^A-Za-z0-9]/g, '');
    const coaCode = isSupplier ? `2110-${cleanCode}` : (isClient ? `1130-${cleanCode}` : `2120-${cleanCode}`);
    const coaId = `acc-${id}`;
    const parentCode = isSupplier 
      ? (partyData.payableAccountId || partyData.payable_account_id || '2110-00')
      : (isClient ? (partyData.receivableAccountId || partyData.receivable_account_id || '1130-00') : '2120-00');
    const coaType = isSupplier ? 'LIABILITY' : (isClient ? 'ASSET' : 'LIABILITY');
    const subType = isSupplier ? 'Accounts Payable - Trade' : (isClient ? 'Accounts Receivable - Trade' : 'Accounts Payable - Agent');
    const roleTag = isSupplier ? 'Supplier' : (isClient ? 'Customer' : 'Agent');
    const coaName = `${cleanName} (${roleTag})`;

    // Execute unified create_party_with_coa PostgreSQL database routine
    const rpcRes = await client.query(
      `SELECT public.create_party_with_coa($1, $2, $3, $4, $5, $6) as data;`,
      [cleanName, type, phone || null, trnNo || null, creditLimit, (partyData as any).inventory_account_id || null]
    );

    const rpcData = rpcRes.rows[0]?.data;
    const finalPartyId = rpcData?.party_id || id;
    const finalPartyCode = rpcData?.party_code || code;
    const finalCoaCode = rpcData?.code || coaCode;

    const initialMap = {
      ...(partyData.accountMap || partyData.account_map || {}),
      payableAccountId: isSupplier ? finalCoaCode : (partyData.payableAccountId || partyData.payable_account_id || '2110-00'),
      receivableAccountId: isClient ? finalCoaCode : (partyData.receivableAccountId || partyData.receivable_account_id || '1130-00'),
      clearingAccountId: partyData.clearingAccountId || partyData.clearing_account_id || '1310-00',
      revenueAccountId: partyData.revenueAccountId || partyData.revenue_account_id || '4110-00'
    };

    const createdParty = {
      id: finalPartyId,
      code: finalPartyCode,
      name: cleanName,
      company_name: cleanName,
      type,
      party_type: type,
      partyType: type,
      contactPerson,
      contact_person: contactPerson,
      phone,
      email,
      address,
      trnNo,
      trn_no: trnNo,
      tax_id: trnNo,
      creditLimit,
      credit_limit: creditLimit,
      currentBalance,
      current_balance: currentBalance,
      currency,
      isActive,
      is_active: isActive,
      accountMap: initialMap,
      account_map: initialMap,
      coaAccountId: finalCoaCode,
      coa_account_id: finalCoaCode,
      createdAt: new Date().toISOString()
    };

    PartiesController.addParty(createdParty);
    return res.json(createdParty);

  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating party in PostgreSQL:', err);
    return res.status(500).json({ error: err.message || 'Failed to save party in database' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 4. PUT /api/parties/:id - Edit / Update Party in PostgreSQL
// -------------------------------------------------------------
partiesRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  let client: Client | null = null;

  try {
    client = await getDbClient();

    // Check existing
    const checkRes = await client.query('SELECT * FROM parties WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Party not found' });
    }
    const current = checkRes.rows[0];

    const name = updates.name !== undefined ? String(updates.name).trim() : current.name;
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Party Name cannot be blank' });
    }

    // Duplicate Name Check (Case-insensitive, excluding current party)
    if (updates.name !== undefined && cleanName.toLowerCase() !== String(current.name || '').trim().toLowerCase()) {
      const dupCheck = await client.query(
        'SELECT id, code, name, type FROM parties WHERE UPPER(TRIM(name)) = UPPER(TRIM($1)) AND id != $2 LIMIT 1',
        [cleanName, id]
      );
      if (dupCheck.rows.length > 0) {
        const ex = dupCheck.rows[0];
        return res.status(409).json({
          success: false,
          error: `Another party with name "${cleanName}" already exists (Code: ${ex.code}, Type: ${ex.type}). Duplicate customer/supplier names are prohibited.`,
          messageUrdu: `اس نام (${cleanName}) کے ساتھ دوسری پارٹی پہلے سے موجود ہے (کوڈ: ${ex.code})۔ ڈپلیکیٹ نام کی اجازت نہیں ہے۔`,
          isDuplicate: true,
          existingParty: ex
        });
      }
    }

    const type = updates.type !== undefined ? String(updates.type).toUpperCase() : current.type;
    const contactPerson = updates.contactPerson !== undefined ? updates.contactPerson : (updates.contact_person !== undefined ? updates.contact_person : current.contact_person);
    const phone = updates.phone !== undefined ? updates.phone : current.phone;
    const email = updates.email !== undefined ? updates.email : current.email;
    const address = updates.address !== undefined ? updates.address : current.address;
    const trnNo = updates.trn_no !== undefined ? updates.trn_no : (updates.trnNo !== undefined ? updates.trnNo : current.trn_no);
    const creditLimit = updates.creditLimit !== undefined ? Number(updates.creditLimit) : (updates.credit_limit !== undefined ? Number(updates.credit_limit) : Number(current.credit_limit || 0));
    const currentBalance = updates.currentBalance !== undefined ? Number(updates.currentBalance) : (updates.current_balance !== undefined ? Number(updates.current_balance) : Number(current.current_balance || 0));
    const isActive = updates.isActive !== undefined ? Boolean(updates.isActive) : (updates.is_active !== undefined ? Boolean(updates.is_active) : Boolean(current.is_active));
    const accountMap = updates.accountMap || updates.account_map || current.account_map || {};

    await client.query('BEGIN');

    // 1. Update parties
    await client.query(`
      UPDATE parties SET
        name = $1,
        type = $2,
        contact_person = $3,
        phone = $4,
        email = $5,
        address = $6,
        trn_no = $7,
        credit_limit = $8,
        current_balance = $9,
        is_active = $10,
        account_map = $11
      WHERE id = $12
    `, [cleanName, type, contactPerson, phone, email, address, trnNo, creditLimit, currentBalance, isActive, JSON.stringify(accountMap), id]);

    // 2. Keep linked COA account updated
    if (current.coa_account_id) {
      const roleTag = type === 'SUPPLIER' ? 'Supplier' : (type === 'CLIENT' ? 'Customer' : 'Agent');
      const coaName = `${cleanName} (${roleTag})`;
      await client.query(`
        UPDATE coa_accounts SET
          name = $1,
          is_active = $2
        WHERE id = $3 OR party_id = $4
      `, [coaName, isActive, current.coa_account_id, id]).catch(() => {});
    }

    await client.query('COMMIT');

    const updatedParty = {
      id: String(id),
      code: current.code,
      name,
      type,
      contactPerson,
      phone,
      email,
      address,
      trnNo,
      creditLimit,
      currentBalance,
      currency: current.currency || 'AED',
      isActive,
      accountMap,
      coaAccountId: current.coa_account_id,
      coa_account_id: current.coa_account_id,
      createdAt: current.created_at
    };

    return res.json({
      success: true,
      message: `Party ${name} (${current.code}) updated successfully in SQL database!`,
      party: updatedParty
    });

  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error updating party in PostgreSQL:', err);
    return res.status(500).json({ error: err.message || 'Failed to update party' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 5. DELETE /api/parties/:id - Delete Party with Data Safety Checks
// -------------------------------------------------------------
partiesRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;

  try {
    client = await getDbClient();

    // Step A: Find the party details (retrieve id, party_code, and linked coa_account_id / coa_code)
    const partyRes = await client.query('SELECT * FROM parties WHERE id = $1', [id]);
    if (partyRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Party not found in database' });
    }
    const party = partyRes.rows[0];
    const partyCode = party.code || '';
    const cleanCode = String(partyCode).replace(/[^A-Za-z0-9]/g, '');
    const coaId = party.coa_account_id || `acc-${id}`;
    const coaCodeSupplier = `2110-${cleanCode}`;
    const coaCodeClient = `1130-${cleanCode}`;

    await client.query('BEGIN');

    // Step B: Disconnect circular foreign keys between parties and coa_accounts FIRST
    await client.query('UPDATE parties SET coa_account_id = NULL WHERE id = $1', [id]);
    await client.query('UPDATE coa_accounts SET party_id = NULL WHERE party_id = $1 OR id = $2', [id, coaId]);

    // Step C: Cascade delete or unlink child purchase and sales transactions:
    // 1. Delete purchase invoice items & unlink gate passes before deleting invoices
    await client.query(`
      DELETE FROM purchase_invoice_items 
      WHERE invoice_id IN (SELECT id FROM purchase_invoices WHERE supplier_id = $1)
    `).catch(() => {});
    await client.query(`
      UPDATE inward_gate_passes 
      SET purchase_invoice_id = NULL 
      WHERE purchase_invoice_id IN (SELECT id FROM purchase_invoices WHERE supplier_id = $1)
    `).catch(() => {});
    await client.query('DELETE FROM purchase_invoices WHERE supplier_id = $1').catch(async () => {
      await client!.query('UPDATE purchase_invoices SET supplier_id = NULL WHERE supplier_id = $1', [id]);
    });

    // 2. Delete or unlink sales invoices & returns
    await client.query('DELETE FROM sales_invoices WHERE client_id = $1').catch(async () => {
      await client!.query('UPDATE sales_invoices SET client_id = NULL WHERE client_id = $1', [id]);
    });
    await client.query('DELETE FROM sales_gate_passes WHERE party_id = $1', [id]).catch(() => {});
    await client.query('DELETE FROM parcel_returns WHERE party_id = $1', [id]).catch(() => {});

    // 3. Delete party khata logs
    await client.query('DELETE FROM party_khata_logs WHERE party_id = $1', [id]).catch(() => {});

    // 4. Any booth, voucher drafting, or ledger references where party_id matches
    await client.query('UPDATE ledgers SET party_id = NULL WHERE party_id = $1', [id]).catch(() => {});
    await client.query('UPDATE general_ledger SET party_id = NULL WHERE party_id = $1', [id]).catch(() => {});
    await client.query('UPDATE voucher_entries SET party_id = NULL WHERE party_id = $1', [id]).catch(() => {});
    await client.query('UPDATE financial_vouchers SET party_id = NULL WHERE party_id = $1', [id]).catch(() => {});
    await client.query('UPDATE vouchers SET party_id = NULL WHERE party_id = $1', [id]).catch(() => {});
    await client.query('UPDATE live_booths SET host_party_id = NULL WHERE host_party_id = $1', [id]).catch(() => {});
    await client.query('UPDATE live_stream_sales SET party_id = NULL WHERE party_id = $1', [id]).catch(() => {});

    // 5. Conditional deletion of junction tables if they exist in schema
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('public.party_contacts') IS NOT NULL THEN
          EXECUTE 'DELETE FROM party_contacts WHERE party_id = ' || quote_literal('${id}');
        END IF;
        IF to_regclass('public.party_ledger_entries') IS NOT NULL THEN
          EXECUTE 'DELETE FROM party_ledger_entries WHERE party_id = ' || quote_literal('${id}');
        END IF;
      END $$;
    `).catch(() => {});

    // Step D: Delete the corresponding Chart of Accounts record across BOTH tables:
    // First find matching records in `coa_accounts`:
    const coaRes = await client.query(`
      SELECT id, code FROM coa_accounts 
      WHERE party_id = $1 
         OR id = $2 
         OR (code IS NOT NULL AND ($3 != '' AND (code = '2110-' || $3 OR code = '1130-' || $3 OR code LIKE '%' || $3 || '%')))
    `, [id, coaId, cleanCode]);
    const coaIds = coaRes.rows.map((r: any) => r.id);

    if (coaIds.length > 0) {
      await client.query('UPDATE parties SET coa_account_id = NULL WHERE coa_account_id = ANY($1)', [coaIds]).catch(() => {});
      await client.query('UPDATE coa_accounts SET parent_id = NULL WHERE parent_id = ANY($1)', [coaIds]).catch(() => {});
      await client.query('DELETE FROM ledgers WHERE account_id = ANY($1)', [coaIds]).catch(() => {});
      await client.query('DELETE FROM general_ledger WHERE account_id = ANY($1)', [coaIds]).catch(() => {});
      await client.query('DELETE FROM voucher_entries WHERE account_id = ANY($1)', [coaIds]).catch(() => {});
      await client.query('DELETE FROM coa_accounts WHERE id = ANY($1)', [coaIds]).catch(() => {});
    }

    // Also in `chart_of_accounts` table:
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('public.chart_of_accounts') IS NOT NULL THEN
          EXECUTE 'DELETE FROM chart_of_accounts WHERE (code IS NOT NULL AND (' || quote_literal('${cleanCode}') || ' != '''' AND (code = ''2110-'' || ' || quote_literal('${cleanCode}') || ' OR code = ''1130-'' || ' || quote_literal('${cleanCode}') || ' OR code LIKE ''%'' || ' || quote_literal('${cleanCode}') || ' || ''%'')))';
        END IF;
      END $$;
    `).catch(() => {});

    // Step E: Delete the primary party record:
    await client.query('DELETE FROM parties WHERE id = $1', [id]);

    // Step F: Commit transaction and return { success: true, message: "Party and linked COA successfully deleted" }
    await client.query('COMMIT');

    // Also update in-memory store if active
    try {
      PartiesController.deleteParty(id);
    } catch {}

    return res.json({
      success: true,
      message: "Party and linked COA successfully deleted",
      deletedPartyId: id
    });

  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error deleting party from PostgreSQL:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete party'
    });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 6. GET /api/parties/:id/khata - Read Khata ledger entries
// -------------------------------------------------------------
partiesRouter.get('/:id/khata', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;

  try {
    client = await getDbClient();

    // 1. Query party_khata_logs directly from PostgreSQL
    const logsRes = await client.query(`
      SELECT * FROM party_khata_logs 
      WHERE party_id = $1 
      ORDER BY date ASC, created_at ASC;
    `, [id]);

    if (logsRes.rows.length > 0) {
      const logs = logsRes.rows.map((row: any) => ({
        id: String(row.id),
        partyId: row.party_id,
        date: String(row.date ? new Date(row.date).toISOString().slice(0, 10) : '').slice(0, 10),
        docRef: row.reference || 'REF',
        description: row.notes || 'Khata Transaction',
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        balance: Number(row.running_balance || 0)
      }));
      return res.json(logs);
    }

    // 2. Direct General Ledger Fallback
    const partyRes = await client.query('SELECT code, coa_account_id FROM parties WHERE id = $1', [id]);
    if (partyRes.rows.length > 0) {
      const cleanCode = (partyRes.rows[0].code || '').replace(/[^A-Za-z0-9]/g, '');
      const accountCodeSupplier = `2110-${cleanCode}`;
      const accountCodeClient = `1130-${cleanCode}`;
      const accountId = partyRes.rows[0].coa_account_id || `acc-${id}`;

      const glRes = await client.query(`
        SELECT * FROM general_ledger 
        WHERE account_id = $1 OR account_code = $2 OR account_code = $3
        ORDER BY entry_date ASC, created_at ASC;
      `, [accountId, accountCodeSupplier, accountCodeClient]).catch(() => ({ rows: [] }));

      if (glRes.rows.length > 0) {
        let runBal = 0;
        const glLogs = glRes.rows.map((row: any) => {
          const dr = Number(row.debit || 0);
          const cr = Number(row.credit || 0);
          runBal += (dr - cr);
          return {
            id: String(row.id),
            partyId: id,
            date: String(row.entry_date || row.created_at || '').slice(0, 10),
            docRef: row.voucher_no || row.reference || 'GL',
            description: row.narration || row.memo || 'General Ledger Entry',
            debit: dr,
            credit: cr,
            balance: runBal
          };
        });
        return res.json(glLogs);
      }
    }

    return res.json([]);
  } catch (err: any) {
    console.error('Error fetching Khata logs from PostgreSQL:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 7. POST /api/parties/:id/khata (or /:id/transaction) - Record Settlement
// -------------------------------------------------------------
const recordKhataHandler = async (req: any, res: any) => {
  const { id } = req.params;
  const { amount, type, docRef, description, date } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid transaction amount in AED is required' });
  }

  let client: Client | null = null;
  try {
    client = await getDbClient();

    // 1. Verify party exists
    const partyRes = await client.query('SELECT * FROM parties WHERE id = $1', [id]);
    if (partyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Party not found' });
    }
    const party = partyRes.rows[0];

    const isReceipt = String(type).toUpperCase() === 'RECEIPT';
    const numAmount = Number(amount);
    const debit = isReceipt ? 0 : numAmount;
    const credit = isReceipt ? numAmount : 0;

    const currentBal = Number(party.current_balance || 0);
    const newBal = currentBal + debit - credit;

    const khtId = `kht-${Date.now()}`;
    const txDate = date || new Date().toISOString().slice(0, 10);
    const txRef = docRef || `REC-${Date.now().toString().slice(-4)}`;
    const notes = description || (isReceipt ? 'Customer Settlement Receipt' : 'Supplier Settlement Payment');

    await client.query('BEGIN');

    // 2. Insert into party_khata_logs in PostgreSQL
    await client.query(`
      INSERT INTO party_khata_logs (
        id, party_id, date, reference, debit, credit, running_balance, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [khtId, id, txDate, txRef, debit, credit, newBal, notes]);

    // 3. Update current_balance on parties
    await client.query(`
      UPDATE parties 
      SET current_balance = $1 
      WHERE id = $2
    `, [newBal, id]);

    // 4. Update COA sub-account balance if mapped
    if (party.coa_account_id) {
      await client.query(`
        UPDATE coa_accounts 
        SET current_balance = $1 
        WHERE id = $2 OR party_id = $3
      `, [newBal, party.coa_account_id, id]).catch(() => {});
    }

    await client.query('COMMIT');

    const createdLog = {
      id: khtId,
      partyId: id,
      date: txDate,
      reference: txRef,
      debit,
      credit,
      runningBalance: newBal,
      notes
    };

    return res.json({
      success: true,
      message: `Recorded ${isReceipt ? 'Receipt' : 'Payment'} of AED ${numAmount.toLocaleString()} for ${party.name}.`,
      khataLog: createdLog,
      newBalance: newBal
    });

  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error recording Khata transaction:', err);
    return res.status(500).json({ error: err.message || 'Failed to record Khata transaction' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
};

partiesRouter.post('/:id/khata', recordKhataHandler);
partiesRouter.post('/:id/transaction', recordKhataHandler);

