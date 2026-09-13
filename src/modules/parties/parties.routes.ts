import { Router } from 'express';
import { PartiesController } from './parties.controller.ts';
import { PartiesService } from '../../services/partiesService.ts';

export const partiesRouter = Router();

partiesRouter.get('/', async (req, res) => {
  const { type } = req.query as { type?: string };

  try {
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (dbUrl && !dbUrl.includes('placeholder')) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();

      let query = 'SELECT * FROM parties';
      const params: any[] = [];
      if (type) {
        query += ' WHERE UPPER(type) = UPPER($1)';
        params.push(type);
      }
      query += ' ORDER BY name ASC;';

      const [partiesRes, liveBalancesRes] = await Promise.all([
        client.query(query, params),
        client.query('SELECT party_id, account_id, current_balance FROM view_coa_live_balances;').catch(() => ({ rows: [] }))
      ]);
      await client.end();

      if (partiesRes.rows && partiesRes.rows.length > 0) {
        const liveBalancesMap = new Map<string, number>();
        (liveBalancesRes.rows || []).forEach((row: any) => {
          if (row.party_id) liveBalancesMap.set(String(row.party_id), Number(row.current_balance || 0));
          if (row.account_id) liveBalancesMap.set(String(row.account_id), Number(row.current_balance || 0));
        });

        const mapped = partiesRes.rows.map((row: any) => {
          const liveBal = liveBalancesMap.has(String(row.id))
            ? liveBalancesMap.get(String(row.id))!
            : (row.coa_account_id && liveBalancesMap.has(String(row.coa_account_id))
              ? liveBalancesMap.get(String(row.coa_account_id))!
              : Number(row.current_balance ?? 0));

          return {
            id: String(row.id),
            code: row.code || `P-${String(row.id).slice(-4)}`,
            name: row.name,
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
            createdAt: row.created_at || new Date().toISOString()
          };
        });

        return res.json(mapped);
      }
    }
  } catch (err: any) {
    console.error('Error querying PostgreSQL parties in /api/parties:', err);
  }

  try {
    const list = await PartiesService.getParties();
    if (type) {
      return res.json(list.filter(p => (p.type || '').toUpperCase() === (type || '').toUpperCase()));
    }
    return res.json(list);
  } catch (_) {
    return res.json(PartiesController.getParties(type));
  }
});

partiesRouter.post('/', async (req, res) => {
  try {
    const partyData = req.body;
    const id = partyData.id || `pty-${Date.now()}`;
    const code = partyData.code || `P-${Math.floor(1000 + Math.random() * 9000)}`;
    const name = partyData.name;
    const type = (partyData.type || 'CLIENT').toUpperCase();
    const phone = partyData.phone || '';
    const email = partyData.email || '';
    const address = partyData.address || '';
    const trnNo = partyData.trnNo || partyData.trn_no || '';
    const creditLimit = Number(partyData.creditLimit || partyData.credit_limit || 0);
    const currentBalance = Number(partyData.currentBalance || partyData.current_balance || 0);
    const currency = partyData.currency || 'AED';

    // Insert into PostgreSQL
    try {
      const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
      if (dbUrl && !dbUrl.includes('placeholder')) {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
        await client.connect();
        await client.query(`
          INSERT INTO parties (id, code, name, type, contact_person, phone, email, address, trn_no, credit_limit, current_balance, currency, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            trn_no = EXCLUDED.trn_no,
            credit_limit = EXCLUDED.credit_limit,
            current_balance = EXCLUDED.current_balance;
        `, [id, code, name, type, partyData.contactPerson || '', phone, email, address, trnNo, creditLimit, currentBalance, currency]);
        await client.end();
      }
    } catch (pgErr) {
      console.error('Error inserting party into PostgreSQL:', pgErr);
    }

    const newParty = PartiesController.addParty({
      ...partyData,
      id,
      code,
      name,
      type,
      phone,
      email,
      address,
      trnNo,
      creditLimit,
      currentBalance,
      currency
    });

    try {
      await PartiesService.ensurePartyCoaAccount(newParty);
    } catch (_) {}

    return res.json(newParty);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

partiesRouter.get('/:id/khata', (req, res) => {
  const { id } = req.params;
  return res.json(PartiesController.getPartyKhata(id));
});

partiesRouter.post('/:id/transaction', (req, res) => {
  const { id } = req.params;
  const result = PartiesController.recordPaymentOrReceipt(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});
