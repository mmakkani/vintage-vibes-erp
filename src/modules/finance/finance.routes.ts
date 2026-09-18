import { Router } from 'express';
import { Client } from 'pg';
import { FinanceController } from './finance.controller.ts';
import { FinanceService } from '../../services/financeService.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export const financeRouter = Router();

async function getDbClient(): Promise<Client> {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('Database connection URL not configured');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
}

financeRouter.get('/coa', async (req, res) => {
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const result = await client.query(`
      SELECT 
        id, 
        code, 
        name, 
        account_type, 
        parent_id, 
        COALESCE(current_balance, 0) AS current_balance, 
        created_at
      FROM chart_of_accounts
      ORDER BY code ASC
    `);

    const accounts = result.rows.map((r: any) => {
      const rawType = (r.account_type || 'ASSET').toUpperCase();
      const normalizedType = rawType === 'INCOME' ? 'REVENUE' : rawType;
      const codeStr = r.code || '';
      const isMaster = codeStr === '1000-00' || codeStr === '2000-00' || codeStr === '3000-00' || codeStr === '4000-00' || codeStr === '5000-00' || !codeStr.includes('-');
      const isSub = codeStr.endsWith('-00') && !isMaster;
      const tierLevel = isMaster ? 1 : (isSub ? 2 : 3);

      return {
        id: r.id,
        code: r.code,
        name: r.name,
        type: normalizedType,
        classification: normalizedType,
        account_type: rawType,
        subType: '',
        sub_type: '',
        currency: 'AED',
        currentBalance: Number(r.current_balance || 0),
        current_balance: Number(r.current_balance || 0),
        isActive: true,
        is_active: true,
        parentId: r.parent_id || null,
        parent_id: r.parent_id || null,
        parentCode: '',
        parent_code: '',
        tierLevel,
        tier_level: tierLevel,
        createdAt: r.created_at,
        created_at: r.created_at
      };
    });
    return res.json(accounts);
  } catch (err: any) {
    console.warn('[Finance COA] Error fetching from Postgres, trying FinanceService:', err.message);
    try {
      const data = await FinanceService.getCoaAccounts();
      return res.json(Array.isArray(data) ? data : []);
    } catch (_) {
      return res.json([]);
    }
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

financeRouter.post('/coa', async (req, res) => {
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const body = req.body || {};
    const code = (body.code || '').trim();
    const name = (body.name || '').trim();
    if (!code || !name) {
      return res.status(400).json({ error: 'Account Code and Name are required' });
    }
    const rawType = (body.account_type || body.type || body.classification || 'ASSET').toUpperCase();
    const accountType = rawType === 'REVENUE' ? 'INCOME' : rawType;
    let parentId = body.parent_id || body.parentId || null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parentId && !uuidRegex.test(parentId)) {
      const parentLookup = await client.query('SELECT id FROM chart_of_accounts WHERE code = $1 LIMIT 1', [parentId]);
      parentId = parentLookup.rows[0]?.id || null;
    }
    const currentBalance = Number(body.current_balance ?? body.currentBalance ?? 0);

    const insertResult = await client.query(`
      INSERT INTO chart_of_accounts (code, name, account_type, parent_id, current_balance)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, code, name, account_type, parent_id, current_balance, created_at
    `, [code, name, accountType, parentId, currentBalance]);

    const r = insertResult.rows[0];
    const normalizedType = r.account_type === 'INCOME' ? 'REVENUE' : r.account_type;
    const codeStr = r.code || '';
    const isMaster = codeStr === '1000-00' || codeStr === '2000-00' || codeStr === '3000-00' || codeStr === '4000-00' || codeStr === '5000-00' || !codeStr.includes('-');
    const isSub = codeStr.endsWith('-00') && !isMaster;
    const tierLevel = isMaster ? 1 : (isSub ? 2 : 3);

    return res.json({
      id: r.id,
      code: r.code,
      name: r.name,
      type: normalizedType,
      classification: normalizedType,
      account_type: r.account_type,
      subType: '',
      sub_type: '',
      currency: 'AED',
      currentBalance: Number(r.current_balance || 0),
      current_balance: Number(r.current_balance || 0),
      isActive: true,
      is_active: true,
      parentId: r.parent_id || null,
      parent_id: r.parent_id || null,
      parentCode: '',
      parent_code: '',
      tierLevel,
      tier_level: tierLevel,
      createdAt: r.created_at,
      created_at: r.created_at
    });
  } catch (err: any) {
    console.error('[Finance POST /coa] Postgres insert failed:', err.message);
    try {
      const created = await FinanceService.addCoaAccount(req.body);
      return res.json(created);
    } catch (e: any) {
      return res.status(400).json({ error: e.message || err.message });
    }
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
  try {
    const data = await FinanceService.getGeneralLedgerEntries({
      accountId,
      partyId,
      startDate,
      endDate,
      search
    });
    return res.json(data.entries);
  } catch (_) {
    return res.json(FinanceController.getLedger(accountId, partyId));
  }
});

financeRouter.get('/reports', async (req, res) => {
  try {
    const s = req.query.startDate as string;
    const e = req.query.endDate as string;
    const asOf = req.query.asOfDate as string;
    const data = await FinanceService.getFinancialReports({ startDate: s, endDate: e, asOfDate: asOf });
    return res.json(data);
  } catch (_) {
    return res.json(FinanceController.getFinancialStatements());
  }
});

financeRouter.get('/reports/trial-balance', async (req, res) => {
  try {
    const s = req.query.startDate as string;
    const e = req.query.endDate as string;
    const data = await FinanceService.getTrialBalance(s, e);
    return res.json(data);
  } catch (_) {
    return res.json([]);
  }
});

financeRouter.get('/reports/income-statement', async (req, res) => {
  try {
    const s = req.query.startDate as string;
    const e = req.query.endDate as string;
    const data = await FinanceService.getIncomeStatement(s, e);
    return res.json(data);
  } catch (_) {
    return res.json([]);
  }
});

financeRouter.get('/reports/balance-sheet', async (req, res) => {
  try {
    const asOf = req.query.asOfDate as string;
    const data = await FinanceService.getBalanceSheet(asOf);
    return res.json(data);
  } catch (_) {
    return res.json([]);
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


