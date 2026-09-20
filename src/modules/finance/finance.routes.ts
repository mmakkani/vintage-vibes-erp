import 'dotenv/config';
import { Router } from 'express';
import { Client } from 'pg';
import { FinanceController } from './finance.controller.ts';
import { FinanceService } from '../../services/financeService.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { withDb } from '../../db/pgPool.ts';

export const financeRouter = Router();

async function getDbClient(): Promise<Client> {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
}

async function ensureAccountTypes(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO account_types (type_id, type_name) VALUES
      (1, 'Asset'),
      (2, 'Liability'),
      (3, 'Equity'),
      (4, 'Revenue'),
      (5, 'Expense')
    ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name;
  `).catch(err => console.warn('[Finance COA] ensureAccountTypes error:', err.message));
}

async function ensureFiveRootAccounts(client: Client): Promise<void> {
  await ensureAccountTypes(client);

  const rootAccounts = [
    { code: '1000-00', name: 'Assets', typeId: 1, level: 1, isTransactional: false },
    { code: '2000-00', name: 'Liabilities', typeId: 2, level: 1, isTransactional: false },
    { code: '3000-00', name: 'Equity', typeId: 3, level: 1, isTransactional: false },
    { code: '4000-00', name: 'Revenue', typeId: 4, level: 1, isTransactional: false },
    { code: '5000-00', name: 'Expenses', typeId: 5, level: 1, isTransactional: false }
  ];

  for (const acc of rootAccounts) {
    await client.query(`
      INSERT INTO accounts (account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level)
      VALUES ($1, $2, $3, NULL, true, $4, $5)
      ON CONFLICT (account_code) DO NOTHING;
    `, [acc.code, acc.name, acc.typeId, acc.isTransactional, acc.level]);
  }
}

financeRouter.get('/coa', async (req, res) => {
  try {
    const accounts = await withDb(async (client) => {
      let rawRows: any[] = [];
      try {
        const result = await client.query(`
          SELECT 
            c.*,
            COALESCE(v.current_balance, c.current_balance, 0) as live_balance 
          FROM public.chart_of_accounts c 
          LEFT JOIN view_coa_live_balances v ON c.id::text = v.account_id::text OR c.code = v.account_code
          WHERE c.is_deleted IS NOT TRUE 
          ORDER BY c.code ASC;
        `);
        rawRows = result.rows || [];
      } catch (coaErr: any) {
        console.warn('[Finance COA] chart_of_accounts query failed, trying accounts table:', coaErr?.message);
        try {
          const resAcc = await client.query('SELECT * FROM accounts ORDER BY account_code ASC');
          rawRows = resAcc.rows || [];
        } catch (accErr: any) {
          console.warn('[Finance COA] accounts query also failed:', accErr?.message);
          return [];
        }
      }

      const typeMapById: Record<number, string> = {
        1: 'ASSET',
        2: 'LIABILITY',
        3: 'EQUITY',
        4: 'REVENUE',
        5: 'EXPENSE'
      };
      const typeMapByDigit: Record<string, string> = {
        '1': 'ASSET',
        '2': 'LIABILITY',
        '3': 'EQUITY',
        '4': 'REVENUE',
        '5': 'EXPENSE'
      };

      return rawRows.map((r: any) => {
        const code = String(r.code || r.account_code || '');
        const name = String(r.name || r.account_name || '');
        const detected = r.type || r.type_name || r.classification || typeMapById[Number(r.account_type_id)] || typeMapByDigit[code[0]] || 'ASSET';
        const rawType = String(detected).toUpperCase();
        const normType = rawType === 'INCOME' ? 'REVENUE' : rawType;
        const tierLevel = Number(r.tier_level || r.tierLevel || r.account_level || 1);
        const balance = Number(r.live_balance ?? r.current_balance ?? r.currentBalance ?? 0);
        const active = r.is_active !== false && r.isActive !== false && r.is_deleted !== true;

        return {
          ...r,
          id: String(r.id || r.account_id || code),
          account_id: String(r.account_id || r.id || code),
          code: code,
          account_code: code,
          name: name,
          account_name: name,
          type: normType,
          classification: normType,
          account_type: normType,
          pillar_category: normType,
          pillar: normType,
          subType: r.sub_type || r.subType || '',
          sub_type: r.sub_type || r.subType || '',
          currency: r.currency || 'AED',
          currentBalance: balance,
          current_balance: balance,
          isActive: active,
          is_active: active,
          status: active ? 'ACTIVE' : 'INACTIVE',
          parentId: r.parent_id ? String(r.parent_id) : null,
          parent_id: r.parent_id ? String(r.parent_id) : null,
          parentCode: r.parent_code || r.parentCode || '',
          parent_code: r.parent_code || r.parentCode || '',
          tierLevel,
          tier_level: tierLevel,
          account_level: tierLevel,
          isTransactional: Boolean(r.is_transactional ?? r.isTransactional ?? (tierLevel > 1)),
          is_transactional: Boolean(r.is_transactional ?? r.isTransactional ?? (tierLevel > 1)),
          isSystem: tierLevel === 1,
          is_system: tierLevel === 1,
          createdAt: r.created_at || new Date().toISOString(),
          created_at: r.created_at || new Date().toISOString()
        };
      });
    });

    return res.status(200).json({
      success: true,
      data: accounts,
      accounts: accounts,
      coa: accounts
    });
  } catch (err: any) {
    console.error('[Finance COA] Error in GET /api/finance/coa:', err?.message || err);
    return res.status(200).json({
      success: true,
      accounts: [],
      coa: []
    });
  }
});

financeRouter.post('/coa', async (req, res) => {
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const body = req.body || {};
    const code = (body.code || body.account_code || '').trim();
    const name = (body.name || body.account_name || '').trim();
    if (!code || !name) {
      return res.status(400).json({ error: 'Account Code and Name are required' });
    }

    const rawType = (body.classification || body.type || body.account_type || 'ASSET').toUpperCase();
    const normType = rawType === 'INCOME' ? 'REVENUE' : rawType;
    const typeMap: Record<string, number> = {
      ASSET: 1,
      LIABILITY: 2,
      EQUITY: 3,
      REVENUE: 4,
      EXPENSE: 5
    };
    const accountTypeId = typeMap[normType] || 1;

    // Resolve parent ID
    let parentId: number | null = null;
    let parentCode = '';
    const rawParent = body.parent_id || body.parentId || body.parent_code || body.parentCode;
    if (rawParent) {
      const parentLookup = await client.query(
        'SELECT account_id, account_code, account_level FROM accounts WHERE account_id::text = $1 OR account_code = $1 LIMIT 1',
        [String(rawParent).trim()]
      );
      if (parentLookup.rows.length > 0) {
        parentId = parentLookup.rows[0].account_id;
        parentCode = parentLookup.rows[0].account_code;
      }
    }

    const tierLevel = Number(body.tierLevel || body.tier_level || body.account_level || (parentId ? 2 : 1));
    const isTransactional = body.is_transactional !== undefined ? Boolean(body.is_transactional) : (tierLevel > 1);
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : (body.isActive !== undefined ? Boolean(body.isActive) : true);

    const insertResult = await client.query(`
      INSERT INTO accounts (account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (account_code) DO UPDATE 
      SET account_name = EXCLUDED.account_name,
          account_type_id = EXCLUDED.account_type_id,
          parent_id = EXCLUDED.parent_id,
          is_active = EXCLUDED.is_active,
          is_transactional = EXCLUDED.is_transactional,
          account_level = EXCLUDED.account_level
      RETURNING account_id, account_code, account_name, account_type_id, parent_id, is_active, is_transactional, account_level
    `, [code, name, accountTypeId, parentId, isActive, isTransactional, tierLevel]);

    const r = insertResult.rows[0];

    return res.json({
      id: String(r.account_id),
      code: r.account_code,
      name: r.account_name,
      type: normType,
      classification: normType,
      account_type: normType,
      subType: '',
      sub_type: '',
      currency: 'AED',
      currentBalance: 0,
      current_balance: 0,
      isActive: r.is_active,
      is_active: r.is_active,
      parentId: r.parent_id ? String(r.parent_id) : null,
      parent_id: r.parent_id ? String(r.parent_id) : null,
      parentCode,
      parent_code: parentCode,
      tierLevel: r.account_level,
      tier_level: r.account_level,
      isTransactional: r.is_transactional,
      is_transactional: r.is_transactional,
      isSystem: r.account_level === 1
    });
  } catch (err: any) {
    console.error('[Finance POST /coa] Postgres insert failed:', err.message);
    return res.status(400).json({ error: err.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

financeRouter.get('/vouchers', async (req, res) => {
  try {
    const data = await FinanceService.getVouchers();
    return res.json(data);
  } catch (_) {
    return res.json(FinanceController.getVouchers());
  }
});

financeRouter.post('/vouchers', async (req, res) => {
  try {
    const v = await FinanceService.addVoucher(req.body);
    return res.json({ success: true, voucher: v });
  } catch (err: any) {
    const result = FinanceController.createVoucher(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

financeRouter.post('/vouchers/:id/post', async (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  try {
    await FinanceService.postVoucher(id);
    return res.json({ success: true });
  } catch (err: any) {
    const result = FinanceController.postVoucher(id, postedBy || 'Admin');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

financeRouter.post('/vouchers/:id/unpost', async (req, res) => {
  const { id } = req.params;
  try {
    await FinanceService.unpostVoucher(id);
    return res.json({ success: true });
  } catch (err: any) {
    const result = FinanceController.unpostVoucher(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

financeRouter.put('/vouchers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await FinanceService.updateVoucher(id, req.body);
    return res.json({ success: true, voucher: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to update voucher' });
  }
});

financeRouter.delete('/vouchers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await FinanceService.deleteVoucher(id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to delete voucher' });
  }
});

financeRouter.get('/ledgers', async (req, res) => {
  const { accountId, partyId, startDate, endDate, search } = req.query as any;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query(
      'SELECT get_general_ledger_entries($1, $2, $3, $4, $5) AS gl',
      [accountId || null, partyId || null, startDate || null, endDate || null, search || null]
    );
    const gl = result.rows[0]?.gl;
    const entries = (gl?.entries || []).map((r: any) => ({
      id: r.id,
      voucherId: r.voucherId,
      voucherNo: r.voucherNo,
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      partyId: r.partyId,
      partyName: r.partyName,
      date: r.date,
      debit: Number(r.debit || 0),
      credit: Number(r.credit || 0),
      runningBalance: Number(r.runningBalance || 0),
      balance: Number(r.runningBalance || 0),
      documentRef: r.documentRef || '',
      narration: r.narration || ''
    }));
    return res.json(entries);
  } catch (err: any) {
    console.warn('[Finance /ledgers] Postgres error, trying FinanceService:', err?.message);
    try {
      const data = await FinanceService.getGeneralLedgerEntries({ accountId, partyId, startDate, endDate, search });
      return res.json(data.entries);
    } catch (_) {
      return res.json(FinanceController.getLedger(accountId, partyId));
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

financeRouter.get('/reports', async (req, res) => {
  const s = (req.query.startDate as string) || null;
  const e = (req.query.endDate as string) || null;
  const asOf = (req.query.asOfDate as string) || e || null;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const tbRes = await client.query('SELECT get_trial_balance($1, $2) AS tb', [s, e]);
    const incRes = await client.query('SELECT get_income_statement($1, $2) AS inc', [s, e]);
    const bsRes = await client.query('SELECT get_balance_sheet($1) AS bs', [asOf]);

    const tb = tbRes.rows[0]?.tb || { rows: [], totalDebit: 0, totalCredit: 0 };
    const inc = incRes.rows[0]?.inc || { revenue: { total: 0 }, cogs: { total: 0 }, operatingExpenses: { total: 0 }, netProfit: 0 };
    const bs = bsRes.rows[0]?.bs || { assets: { total: 0 }, liabilities: { total: 0 }, equity: { total: 0 }, balanced: true };

    return res.json({
      trialBalance: tb.rows || [],
      trialBalanceMeta: tb,
      incomeStatement: inc,
      balanceSheet: bs
    });
  } catch (err: any) {
    console.warn('[Finance /reports] Postgres error, trying FinanceService:', err?.message);
    try {
      const data = await FinanceService.getFinancialReports({ startDate: s || undefined, endDate: e || undefined, asOfDate: asOf || undefined });
      return res.json(data);
    } catch (_) {
      return res.json(FinanceController.getFinancialStatements());
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

financeRouter.get('/reports/trial-balance', async (req, res) => {
  const s = (req.query.startDate as string) || null;
  const e = (req.query.endDate as string) || null;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('SELECT get_trial_balance($1, $2) AS tb', [s, e]);
    return res.json(result.rows[0]?.tb || { rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true, difference: 0 });
  } catch (err: any) {
    console.warn('[Finance /reports/trial-balance] Postgres error, trying FinanceService:', err?.message);
    try {
      const data = await FinanceService.getTrialBalance(s || undefined, e || undefined);
      return res.json(data);
    } catch (_) {
      return res.json({ rows: [], totalDebit: 0, totalCredit: 0, isBalanced: true, difference: 0 });
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

financeRouter.get('/reports/income-statement', async (req, res) => {
  const s = (req.query.startDate as string) || null;
  const e = (req.query.endDate as string) || null;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('SELECT get_income_statement($1, $2) AS inc', [s, e]);
    return res.json(result.rows[0]?.inc || {});
  } catch (err: any) {
    console.warn('[Finance /reports/income-statement] Postgres error, trying FinanceService:', err?.message);
    try {
      const data = await FinanceService.getIncomeStatement(s || undefined, e || undefined);
      return res.json(data);
    } catch (_) {
      return res.json({});
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

financeRouter.get('/reports/balance-sheet', async (req, res) => {
  const asOf = (req.query.asOfDate as string) || null;
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('SELECT get_balance_sheet($1) AS bs', [asOf]);
    return res.json(result.rows[0]?.bs || {});
  } catch (err: any) {
    console.warn('[Finance /reports/balance-sheet] Postgres error, trying FinanceService:', err?.message);
    try {
      const data = await FinanceService.getBalanceSheet(asOf || undefined);
      return res.json(data);
    } catch (_) {
      return res.json({});
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// --- Budgets ---
financeRouter.get('/budgets', (req, res) => {
  const period = (req.query.period as string) || '2026-09';
  return res.json(FinanceController.getBudgets(period));
});

financeRouter.post('/budgets', (req, res) => {
  try {
    const budget = FinanceController.setBudget(req.body);
    return res.json(budget);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

financeRouter.delete('/budgets/:id', (req, res) => {
  const result = FinanceController.deleteBudget(req.params.id);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

financeRouter.post('/budgets/seed-defaults', (req, res) => {
  const period = (req.body.period as string) || '2026-09';
  return res.json(FinanceController.seedDefaultBudgets(period));
});

// --- Custom Reports ---
financeRouter.get('/custom-reports', (req, res) => {
  return res.json(FinanceController.getCustomReports());
});

financeRouter.post('/custom-reports', (req, res) => {
  try {
    const template = FinanceController.saveCustomReport(req.body);
    return res.json(template);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

financeRouter.delete('/custom-reports/:id', (req, res) => {
  const result = FinanceController.deleteCustomReport(req.params.id);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

financeRouter.get('/custom-reports/:id/execute', (req, res) => {
  try {
    const result = FinanceController.executeCustomReport(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// --- Recurring Vouchers ---
financeRouter.get('/recurring-vouchers', (req, res) => {
  return res.json(FinanceController.getRecurringVouchers());
});

financeRouter.post('/recurring-vouchers', (req, res) => {
  try {
    const template = FinanceController.saveRecurringVoucher(req.body);
    return res.json(template);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

financeRouter.delete('/recurring-vouchers/:id', (req, res) => {
  const result = FinanceController.deleteRecurringVoucher(req.params.id);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

financeRouter.post('/recurring-vouchers/:id/run', (req, res) => {
  const result = FinanceController.runRecurringVoucher(req.params.id, req.body.runDate);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

financeRouter.post('/recurring-vouchers/run-all', (req, res) => {
  const result = FinanceController.runAllDueRecurringVouchers(req.body.runDate);
  return res.json(result);
});

// --- UAE FTA Audit File (FAF) ---
financeRouter.get('/fta-faf', (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  const result = FinanceController.generateFtaAuditFile(startDate, endDate);
  return res.json(result);
});

// --- UAE Corporate Tax (9%) ---
financeRouter.get('/corporate-tax/estimate', (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : 2026;
  const result = FinanceController.calculateCorporateTaxEstimate(taxYear);
  return res.json(result);
});

financeRouter.post('/corporate-tax/provision', (req, res) => {
  const taxYear = req.body.taxYear ? Number(req.body.taxYear) : 2026;
  const postedBy = req.body.postedBy || 'Tax Compliance Officer';
  const result = FinanceController.postCorporateTaxProvision(taxYear, postedBy);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// --- Bale Yield & Container ROI Analytics ---
financeRouter.get('/yield-analytics', (req, res) => {
  return res.json(relationalStore.getBaleYieldAnalytics());
});


