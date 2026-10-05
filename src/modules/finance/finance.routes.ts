import 'dotenv/config';
import { Router } from 'express';
import { Client } from 'pg';
import { FinanceController } from './finance.controller.ts';
import { FinanceService } from '../../services/financeService.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { withDb, borrowClient, sanitizeDbUrl, DEFAULT_DB_URL } from '../../db/pgPool.ts';
import { insertVoucherPg } from './voucherPgService.ts';
import { verifyAuthToken, checkModulePermission, extractAuthToken } from '../../server/authValidator.ts';

export const financeRouter = Router();

async function getDbClient(): Promise<any> {
  return await borrowClient();
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
  const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  const token = extractAuthToken(req);
  const authResult = await verifyAuthToken(token);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: authResult.error || 'Unauthorized. Valid cryptographic authorization token is required to access Chart of Accounts.',
      correlationId
    });
  }

  const perm = checkModulePermission(authResult.user, 'FINANCE');
  if (!perm.allowed) {
    return res.status(403).json({
      success: false,
      error: perm.reason || 'Forbidden: Insufficient privileges to access Chart of Accounts.',
      correlationId
    });
  }

  try {
    const accounts = await withDb(async (client) => {
      let rawRows: any[] = [];
      try {
        const result = await client.query(`
          SELECT 
            c.*,
            COALESCE(v.current_balance, c.current_balance, 0) as live_balance,
            v.tier_level as tier_level,
            v.sub_type as sub_type,
            v.parent_code as parent_code,
            COALESCE(v.is_active, true) as is_active
          FROM public.chart_of_accounts c 
          LEFT JOIN view_coa_live_balances v ON c.id::text = v.account_id::text OR c.code = v.account_code
          ORDER BY c.code ASC;
        `);
        rawRows = result.rows || [];
      } catch (coaErr: any) {
        console.warn('[Finance COA] Live balance query failed, trying direct chart_of_accounts:', coaErr?.message);
        try {
          const directRes = await client.query('SELECT * FROM public.chart_of_accounts ORDER BY code ASC;');
          rawRows = directRes.rows || [];
        } catch (dirErr: any) {
          console.warn('[Finance COA] Direct chart_of_accounts failed, trying accounts table:', dirErr?.message);
          try {
            const resAcc = await client.query('SELECT * FROM accounts ORDER BY account_code ASC;');
            rawRows = resAcc.rows || [];
          } catch (accErr: any) {
            console.warn('[Finance COA] All COA queries failed:', accErr?.message);
            return null;
          }
        }
      }

      if (!rawRows || rawRows.length === 0) {
        return [];
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
        const isMaster = code.endsWith('000-00') || !code.includes('-') || code === '1000-00' || code === '2000-00' || code === '3000-00' || code === '4000-00' || code === '5000-00';
        const isSub = code.endsWith('-00') && !isMaster;
        const computedTier = isMaster ? 1 : (isSub ? 2 : 3);
        const tierLevel = Number(r.tier_level || r.tierLevel || r.account_level || computedTier);
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

    if (accounts === null || accounts === undefined) {
      const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return res.status(503).json({
        success: false,
        degraded: true,
        error: 'Chart of accounts database service unavailable',
        correlationId,
        accounts: [],
        coa: []
      });
    }

    return res.status(200).json({
      success: true,
      data: accounts,
      accounts: accounts,
      coa: accounts
    });
  } catch (err: any) {
    const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.error('[Finance COA] Error in GET /api/finance/coa:', err?.message || err);
    return res.status(503).json({
      success: false,
      degraded: true,
      error: 'Chart of accounts database query failed',
      correlationId,
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

// DELETE /api/finance/coa/:id - Delete COA Account with strict transaction checks
financeRouter.delete('/coa/:id', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;
  try {
    client = await getDbClient();

    // 1. Lookup account safely across accounts, chart_of_accounts, and coa_accounts
    let accountCode = '';
    let tierLevel = 3;
    let currentBalance = 0;
    let accountUuid: string | null = null;

    // Check accounts table
    const accLookup = await client.query(
      `SELECT account_id, account_code, account_level, is_active FROM accounts WHERE account_id::text = $1 OR account_code = $1 LIMIT 1`,
      [id]
    ).catch(() => ({ rows: [] }));

    // Check chart_of_accounts table (valid columns: id, code, current_balance, is_deleted)
    const coaLookup = await client.query(
      `SELECT id, code, current_balance, is_deleted FROM chart_of_accounts WHERE id::text = $1 OR code = $1 LIMIT 1`,
      [id]
    ).catch(() => ({ rows: [] }));

    // Check coa_accounts table
    const coaAccLookup = await client.query(
      `SELECT id, code, tier_level, is_active, current_balance FROM coa_accounts WHERE id = $1 OR code = $1 LIMIT 1`,
      [id]
    ).catch(() => ({ rows: [] }));

    if (accLookup.rows.length === 0 && coaLookup.rows.length === 0 && coaAccLookup.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (coaAccLookup.rows.length > 0) {
      const r = coaAccLookup.rows[0];
      accountCode = r.code;
      accountUuid = r.id;
      tierLevel = Number(r.tier_level || 3);
      currentBalance = Number(r.current_balance || 0);
    }
    if (coaLookup.rows.length > 0) {
      const r = coaLookup.rows[0];
      accountCode = accountCode || r.code;
      accountUuid = accountUuid || r.id;
      currentBalance = currentBalance || Number(r.current_balance || 0);
    }
    if (accLookup.rows.length > 0) {
      const r = accLookup.rows[0];
      accountCode = accountCode || r.account_code;
      tierLevel = Number(r.account_level || tierLevel);
    }

    accountCode = accountCode || id;
    const isMaster = accountCode.endsWith('000-00') || ['1000-00', '2000-00', '3000-00', '4000-00', '5000-00'].includes(accountCode);
    if (tierLevel === 1 || isMaster) {
      return res.status(400).json({
        error: "Cannot delete: Master tier folder accounts cannot be deleted. Please deactivate it instead."
      });
    }

    // Current balance check
    if (Math.abs(currentBalance) > 0.001) {
      return res.status(400).json({
        error: "Cannot delete: This account/supplier has existing transactions. Please deactivate it instead."
      });
    }

    // Check journal_entries (UUID-safe)
    const jeCheck = await client.query(
      `SELECT id FROM journal_entries WHERE account_id::text = $1 ${accountUuid && accountUuid !== id ? 'OR account_id::text = $2' : ''} LIMIT 1`,
      accountUuid && accountUuid !== id ? [id, accountUuid] : [id]
    ).catch(() => ({ rows: [] }));
    if (jeCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Cannot delete: This account/supplier has existing transactions. Please deactivate it instead."
      });
    }

    // Check voucher_entries
    const veCheck = await client.query(
      `SELECT id FROM voucher_entries WHERE account_id::text = $1 ${accountUuid && accountUuid !== id ? 'OR account_id::text = $2' : ''} ${accountCode ? 'OR account_code = $3' : ''} LIMIT 1`,
      accountUuid && accountUuid !== id
        ? (accountCode ? [id, accountUuid, accountCode] : [id, accountUuid])
        : (accountCode ? [id, accountCode] : [id])
    ).catch(() => ({ rows: [] }));
    if (veCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Cannot delete: This account/supplier has existing transactions. Please deactivate it instead."
      });
    }

    // Check ledgers
    const ledgerCheck = await client.query(
      `SELECT id FROM ledgers WHERE account_id::text = $1 ${accountCode ? 'OR code = $2' : ''} LIMIT 1`,
      accountCode ? [id, accountCode] : [id]
    ).catch(() => ({ rows: [] }));
    if (ledgerCheck.rows.length > 0) {
      return res.status(400).json({
        error: "Cannot delete: This account/supplier has existing transactions. Please deactivate it instead."
      });
    }

    // Safe to delete: Delete from chart_of_accounts, accounts, and coa_accounts
    if (accountCode) {
      await client.query('DELETE FROM chart_of_accounts WHERE code = $1', [accountCode]).catch(() => {});
      await client.query('DELETE FROM accounts WHERE account_code = $1', [accountCode]).catch(() => {});
      await client.query('DELETE FROM coa_accounts WHERE code = $1', [accountCode]).catch(() => {});
    }
    if (id) {
      await client.query('DELETE FROM chart_of_accounts WHERE id::text = $1 OR code = $1', [id]).catch(() => {});
      await client.query('DELETE FROM accounts WHERE account_id::text = $1 OR account_code = $1', [id]).catch(() => {});
      await client.query('DELETE FROM coa_accounts WHERE id = $1 OR code = $1', [id]).catch(() => {});
    }
    if (accountUuid && accountUuid !== id) {
      await client.query('DELETE FROM chart_of_accounts WHERE id::text = $1', [accountUuid]).catch(() => {});
      await client.query('DELETE FROM coa_accounts WHERE id = $1', [accountUuid]).catch(() => {});
    }
    await client.query('COMMIT').catch(() => {});

    return res.status(200).json({
      success: true,
      message: `Account ${accountCode || id} successfully deleted.`
    });
  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[Finance DELETE /coa/:id] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to delete account' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// PATCH /api/finance/coa/:id/toggle-active - Toggle Active/Inactive Status
financeRouter.patch('/coa/:id/toggle-active', async (req, res) => {
  const { id } = req.params;
  try {
    const reqActive = req.body?.is_active ?? req.body?.isActive;

    const result = await withDb(async (client) => {
      let newActiveState: boolean;
      if (typeof reqActive === 'boolean') {
        newActiveState = reqActive;
      } else {
        // Lookup current state from accounts or coa_accounts
        const curr = await client.query(
          'SELECT is_active FROM accounts WHERE account_id::text = $1 OR account_code = $1 LIMIT 1',
          [id]
        ).catch(() => ({ rows: [] }));
        let currentVal = curr.rows[0]?.is_active;
        if (currentVal === undefined) {
          const coaCurr = await client.query(
            'SELECT is_active FROM coa_accounts WHERE id = $1 OR code = $1 LIMIT 1',
            [id]
          ).catch(() => ({ rows: [] }));
          currentVal = coaCurr.rows[0]?.is_active;
        }
        newActiveState = currentVal === undefined ? false : !currentVal;
      }

      await client.query('BEGIN');
      try {
        await client.query(
          'UPDATE accounts SET is_active = $1 WHERE account_id::text = $2 OR account_code = $2',
          [newActiveState, id]
        );
        await client.query(
          'UPDATE coa_accounts SET is_active = $1 WHERE id = $2 OR code = $2',
          [newActiveState, id]
        );
        // chart_of_accounts uses is_deleted for soft-delete/archive semantics (never is_active)
        await client.query(
          'UPDATE chart_of_accounts SET is_deleted = NOT $1 WHERE code = $2 OR id::text = $2',
          [newActiveState, id]
        ).catch(() => {});
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      }

      return newActiveState;
    });

    return res.status(200).json({
      success: true,
      is_active: result,
      isActive: result
    });
  } catch (err: any) {
    console.error('[Finance PATCH /coa/:id/toggle-active] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to update account status' });
  }
});

financeRouter.get('/vouchers', async (req, res) => {
  try {
    const vouchers = await withDb(async (client) => {
      const q = `
        SELECT 
          fv.*,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ve.id,
                'voucherId', ve.voucher_id,
                'accountId', ve.account_id,
                'accountCode', ve.account_code,
                'accountName', ve.account_name,
                'partyId', ve.party_id,
                'partyName', ve.party_name,
                'debitAmount', ve.debit,
                'creditAmount', ve.credit,
                'debit', ve.debit,
                'credit', ve.credit,
                'memo', COALESCE(ve.memo, ve.particulars, ve.narration, '')
              )
            ) FILTER (WHERE ve.id IS NOT NULL),
            '[]'
          ) as lines
        FROM financial_vouchers fv
        LEFT JOIN voucher_entries ve ON fv.id::text = ve.voucher_id::text OR fv.voucher_no = ve.voucher_no
        GROUP BY fv.id
        ORDER BY fv.created_at DESC
      `;
      const result = await client.query(q);
      return result.rows.map((row: any) => ({
        id: row.id,
        voucherNo: row.voucher_no || row.id,
        date: typeof row.date === 'string' ? row.date.slice(0, 10) : (row.date ? new Date(row.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
        type: row.type || row.voucher_type || 'JOURNAL',
        reference: row.reference || row.reference_no || '',
        narration: row.narration || '',
        totalDebit: Number(row.total_debit || 0),
        totalCredit: Number(row.total_credit || 0),
        status: row.status || 'POSTED',
        currency: (row.currency || 'AED').toUpperCase(),
        exchangeRate: Number(row.exchange_rate || 1.0),
        baseCurrency: (row.base_currency || 'AED').toUpperCase(),
        foreignTotalAmount: Number(row.foreign_total_amount || 0),
        createdBy: row.created_by || 'System',
        isAuto: Boolean(row.is_auto),
        lines: Array.isArray(row.lines) ? row.lines : [],
        entries: Array.isArray(row.lines) ? row.lines : [],
        createdAt: row.created_at
      }));
    });
    return res.json(vouchers);
  } catch (err: any) {
    console.warn('[Finance GET /vouchers] PostgreSQL query failed, falling back:', err?.message);
    try {
      const data = await FinanceService.getVouchers();
      return res.json(data);
    } catch (_) {
      return res.json(FinanceController.getVouchers());
    }
  }
});

financeRouter.post('/vouchers', async (req, res) => {
  try {
    const v = await insertVoucherPg(req.body);
    return res.json({ success: true, voucher: v });
  } catch (err: any) {
    console.error('[Finance POST /vouchers] Error:', err);
    return res.status(400).json({ success: false, error: err?.message || 'Failed to record financial voucher' });
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
  const isForce = req.query?.force === 'true';
  try {
    await FinanceService.deleteVoucher(id, isForce);
    return res.json({ success: true });
  } catch (err: any) {
    const isBlocked = err?.message?.includes('Deletion Blocked');
    return res.status(isBlocked ? 403 : 400).json({ error: err?.message || 'Failed to delete voucher' });
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

// --- Bale Yield & Container ROI Analytics (Live Warehouse ROI Engine) ---
financeRouter.get('/yield-analytics', async (req, res) => {
  try {
    const analytics = await withDb(async (client) => {
      const gpRes = await client.query(`
        SELECT * FROM inward_gate_passes 
        ORDER BY created_at DESC;
      `);
      const piecesRes = await client.query(`
        SELECT * FROM inventory_pieces;
      `);

      const passes = gpRes.rows || [];
      const pieces = piecesRes.rows || [];

      // Include all passes that have sorting started, pieces present, or completed
      const relevantPasses = passes.filter((gp: any) => {
        const hasPieces = pieces.some((p: any) => String(p.gate_pass_id) === String(gp.id));
        const status = String(gp.status || '').toUpperCase();
        return hasPieces || ['COMPLETED', 'POSTED', 'FULLY_SORTED', 'PARTIALLY_SORTED', 'IN_PROGRESS'].includes(status) || Number(gp.piece_count || 0) > 0;
      });

      const baleDetails = relevantPasses.map((gp: any) => {
        const gpPieces = pieces.filter((p: any) => String(p.gate_pass_id) === String(gp.id));
        const totalPiecesCount = gpPieces.length || Number(gp.piece_count) || 0;
        const soldPieces = gpPieces.filter((p: any) => p.is_sold || p.status === 'SOLD');
        const inStockPieces = gpPieces.filter((p: any) => !p.is_sold && p.status !== 'SOLD');

        const totalWeightKg = Number(gp.total_bale_weight ?? gp.weight_kg ?? 0);
        const rawCost = Number(gp.total_bale_cost ?? gp.cost_price ?? 0);
        const baleCostAed = rawCost > 0 ? rawCost : (totalWeightKg > 0 ? totalWeightKg * 8.5 : 0);

        const totalPiecesRetailValue = gpPieces.reduce((s: number, p: any) => s + (Number(p.retail_price_aed ?? p.estimated_price) || 0), 0);
        const soldRevenueAed = soldPieces.reduce((s: number, p: any) => s + (Number(p.sold_price_aed ?? p.retail_price_aed ?? p.estimated_price) || 0), 0);
        const inStockValueAed = inStockPieces.reduce((s: number, p: any) => s + (Number(p.retail_price_aed ?? p.estimated_price) || 0), 0);

        const estimatedCostOfSold = totalPiecesCount > 0 ? (soldPieces.length / totalPiecesCount) * baleCostAed : 0;
        const grossMarginAed = soldRevenueAed - estimatedCostOfSold;
        const grossMarginPercent = soldRevenueAed > 0 ? (grossMarginAed / soldRevenueAed) * 100 : 0;
        const realizedRoiPercent = baleCostAed > 0 ? (((soldRevenueAed + inStockValueAed) - baleCostAed) / baleCostAed) * 100 : 0;

        const gradeCount: Record<string, number> = {};
        gpPieces.forEach((p: any) => {
          const g = p.label_grade || 'Standard';
          gradeCount[g] = (gradeCount[g] || 0) + 1;
        });

        const originCountry = gp.supplier_name?.includes('Rotterdam')
          ? 'Netherlands'
          : (gp.supplier_name?.includes('US') ? 'USA' : (gp.supplier_name || 'Global Import'));

        return {
          gatePassId: String(gp.id),
          gatePassNo: gp.gate_pass_no || gp.pass_no || 'IGP',
          date: (gp.created_at ? new Date(gp.created_at).toISOString() : new Date().toISOString()).slice(0, 10),
          baleBatchNo: gp.bale_code || gp.bale_tag_no || 'BAL',
          containerNo: gp.container_no || 'N/A',
          originCountry,
          totalBales: Number(gp.total_bales || 1),
          totalWeightKg,
          baleCostAed,
          totalPiecesCount,
          soldPiecesCount: soldPieces.length,
          inStockPiecesCount: inStockPieces.length,
          soldRevenueAed,
          inStockValueAed,
          totalPiecesRetailValue,
          grossMarginAed,
          grossMarginPercent,
          realizedRoiPercent,
          gradeCount
        };
      });

      const totalBalesProcessed = relevantPasses.reduce((s: number, gp: any) => s + Number(gp.total_bales || 1), 0);
      const totalPiecesRealized = pieces.length;
      const totalPiecesSold = pieces.filter((p: any) => p.is_sold || p.status === 'SOLD').length;
      const overallSoldRevenue = pieces.filter((p: any) => p.is_sold || p.status === 'SOLD').reduce((s: number, p: any) => s + (Number(p.sold_price_aed ?? p.retail_price_aed ?? p.estimated_price) || 0), 0);
      const overallStockValue = pieces.filter((p: any) => !p.is_sold && p.status !== 'SOLD').reduce((s: number, p: any) => s + (Number(p.retail_price_aed ?? p.estimated_price) || 0), 0);

      return {
        totalBalesProcessed,
        totalPiecesRealized,
        totalPiecesSold,
        overallSoldRevenue,
        overallStockValue,
        baleDetails
      };
    });

    return res.json(analytics);
  } catch (err: any) {
    console.warn('[Finance Router] live yield analytics error, fallback to store:', err?.message || err);
    return res.json(relationalStore.getBaleYieldAnalytics());
  }
});

// ========================================================
// STATUTORY FISCAL YEARS & PERIOD CLOSING DATABASE APIS
// ========================================================

financeRouter.get('/fiscal-years', async (_req, res) => {
  try {
    const data = await withDb(async (client) => {
      const result = await client.query('SELECT * FROM public.fiscal_years ORDER BY year ASC');
      return result.rows.map(row => ({
        id: String(row.id),
        year: Number(row.year),
        title: row.title,
        startDate: typeof row.start_date === 'string' ? row.start_date.slice(0, 10) : new Date(row.start_date).toISOString().slice(0, 10),
        endDate: typeof row.end_date === 'string' ? row.end_date.slice(0, 10) : new Date(row.end_date).toISOString().slice(0, 10),
        status: row.status || 'OPEN',
        notes: row.notes || ''
      }));
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[Finance Router] get fiscal years error:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to fetch fiscal years' });
  }
});

financeRouter.post('/fiscal-years', async (req, res) => {
  try {
    const { year, title, startDate, endDate, notes } = req.body;
    if (!year || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Year, Start Date, and End Date are required.' });
    }
    const created = await withDb(async (client) => {
      const result = await client.query(
        `INSERT INTO public.fiscal_years (year, title, start_date, end_date, status, notes)
         VALUES ($1, $2, $3, $4, 'OPEN', $5)
         RETURNING *`,
        [Number(year), title || `Fiscal Year ${year}`, startDate, endDate, notes || '']
      );
      const row = result.rows[0];
      return {
        id: String(row.id),
        year: Number(row.year),
        title: row.title,
        startDate: typeof row.start_date === 'string' ? row.start_date.slice(0, 10) : new Date(row.start_date).toISOString().slice(0, 10),
        endDate: typeof row.end_date === 'string' ? row.end_date.slice(0, 10) : new Date(row.end_date).toISOString().slice(0, 10),
        status: row.status || 'OPEN',
        notes: row.notes || ''
      };
    });
    return res.json({ success: true, data: created });
  } catch (err: any) {
    console.error('[Finance Router] create fiscal year error:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to create fiscal year' });
  }
});

financeRouter.get('/closed-periods', async (_req, res) => {
  try {
    const data = await withDb(async (client) => {
      const result = await client.query('SELECT * FROM public.fiscal_closed_periods ORDER BY start_date DESC');
      return result.rows.map(row => ({
        id: String(row.id),
        periodName: row.period_name,
        periodType: row.period_type,
        startDate: typeof row.start_date === 'string' ? row.start_date.slice(0, 10) : new Date(row.start_date).toISOString().slice(0, 10),
        endDate: typeof row.end_date === 'string' ? row.end_date.slice(0, 10) : new Date(row.end_date).toISOString().slice(0, 10),
        closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : new Date().toISOString(),
        closedBy: row.closed_by,
        totalRevenue: Number(row.total_revenue || 0),
        totalCogs: Number(row.total_cogs || 0),
        grossProfit: Number(row.gross_profit || 0),
        operatingExpenses: Number(row.operating_expenses || 0),
        netProfit: Number(row.net_profit || 0),
        retainedEarningsBalance: Number(row.retained_earnings_balance || 0),
        isLocked: row.is_locked !== false,
        closingVoucherNo: row.closing_voucher_no,
        hashChecksum: row.hash_checksum
      }));
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[Finance Router] get closed periods error:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to fetch closed periods' });
  }
});

financeRouter.post('/closed-periods', async (req, res) => {
  try {
    const record = req.body;
    if (!record.startDate || !record.endDate || !record.periodName) {
      return res.status(400).json({ success: false, error: 'Period details are incomplete' });
    }

    const saved = await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        // Find COA Retained Earnings account
        const coaRes = await client.query(
          "SELECT id, account_code, account_name FROM coa_accounts WHERE account_code LIKE '3200%' OR account_name ILIKE '%Retained Earnings%' LIMIT 1"
        );
        let retainedEarningsAcc = coaRes.rows[0];
        if (!retainedEarningsAcc) {
          const eqRes = await client.query("SELECT id, account_code, account_name FROM coa_accounts WHERE account_code LIKE '3%' LIMIT 1");
          retainedEarningsAcc = eqRes.rows[0];
        }

        // Insert Closed Period Record
        const insertRes = await client.query(
          `INSERT INTO public.fiscal_closed_periods 
            (period_name, period_type, start_date, end_date, closed_at, closed_by, total_revenue, total_cogs, gross_profit, operating_expenses, net_profit, retained_earnings_balance, is_locked, closing_voucher_no, hash_checksum)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, $13, $14)
           RETURNING *`,
          [
            record.periodName,
            record.periodType || 'ANNUAL',
            record.startDate,
            record.endDate,
            record.closedAt || new Date().toISOString(),
            record.closedBy || 'Authorized Officer',
            Number(record.totalRevenue || 0),
            Number(record.totalCogs || 0),
            Number(record.grossProfit || 0),
            Number(record.operatingExpenses || 0),
            Number(record.netProfit || 0),
            Number(record.retainedEarningsBalance || record.netProfit || 0),
            record.closingVoucherNo || `JV-CLOSE-${record.startDate}-${record.endDate}`,
            record.hashChecksum || `SHA256-${Date.now()}`
          ]
        );

        // Record closing journal entry if netProfit is non-zero and retainedEarnings account exists
        const netProfit = Number(record.netProfit || 0);
        if (netProfit !== 0 && retainedEarningsAcc) {
          const voucherId = crypto.randomUUID();
          const vNo = record.closingVoucherNo || `JV-CLOSE-${record.startDate.replace(/-/g, '')}-${record.endDate.replace(/-/g, '')}`;
          const narration = `Statutory Fiscal Year Closing Transfer to Retained Earnings (${record.periodName})`;

          await client.query(
            `INSERT INTO vouchers (id, voucher_no, voucher_date, voucher_type, reference_no, narration, total_debit, total_credit, status, is_auto, created_by)
             VALUES ($1, $2, $3, 'JOURNAL', $4, $5, $6, $7, 'POSTED', true, $8)
             ON CONFLICT (voucher_no) DO UPDATE SET narration = EXCLUDED.narration`,
            [
              voucherId,
              vNo,
              record.endDate,
              'FISCAL-CLOSE',
              narration,
              Math.abs(netProfit),
              Math.abs(netProfit),
              record.closedBy || 'System Audit'
            ]
          );

          await client.query(
            `INSERT INTO voucher_entries (voucher_id, account_id, debit_amount, credit_amount, memo)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              voucherId,
              retainedEarningsAcc.id,
              netProfit < 0 ? Math.abs(netProfit) : 0,
              netProfit > 0 ? Math.abs(netProfit) : 0,
              `Rollover Net Profit to ${retainedEarningsAcc.account_name} (${retainedEarningsAcc.account_code})`
            ]
          );
        }

        await client.query('COMMIT');
        return insertRes.rows[0];
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    return res.json({ success: true, data: saved });
  } catch (err: any) {
    console.error('[Finance Router] close period error:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to close period' });
  }
});

financeRouter.post('/closed-periods/:id/reopen', async (req, res) => {
  try {
    const { pin } = req.body;
    if (pin !== '0099') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Invalid Master PIN override.' });
    }
    const { id } = req.params;
    await withDb(async (client) => {
      const r = await client.query('SELECT closing_voucher_no FROM public.fiscal_closed_periods WHERE id = $1', [id]);
      if (r.rows.length > 0) {
        const vNo = r.rows[0].closing_voucher_no;
        if (vNo) {
          await client.query('DELETE FROM public.vouchers WHERE voucher_no = $1', [vNo]);
        }
      }
      await client.query('DELETE FROM public.fiscal_closed_periods WHERE id = $1', [id]);
    });
    return res.json({ success: true, message: 'Period re-opened successfully.' });
  } catch (err: any) {
    console.error('[Finance Router] reopen period error:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to reopen period' });
  }
});

// --- Company Shareholders & Equity Governance Hub ---
financeRouter.get('/shareholders', async (req, res) => {
  try {
    const shareholders = await withDb(async (client) => {
      const { rows } = await client.query(`
        SELECT * FROM public.company_shareholders 
        ORDER BY display_order ASC, created_at ASC;
      `);
      return rows;
    });
    return res.json({ success: true, data: shareholders });
  } catch (err: any) {
    console.error('[Finance Router] get shareholders error:', err?.message);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

financeRouter.post('/shareholders', async (req, res) => {
  try {
    const { id, name, designation, sharesCount, capitalAed, ownershipPercent, passportOrEid, coaAccountCode, displayOrder } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Shareholder name is required' });
    }

    const saved = await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        let resultRow: any;
        const sharesNum = Number(sharesCount || 100);
        const capNum = Number(capitalAed || 100000);
        const ownNum = Number(ownershipPercent || 100.0);
        const orderNum = Number(displayOrder || 1);
        const coaCode = coaAccountCode || '3100-01';

        if (id) {
          const updateRes = await client.query(`
            UPDATE public.company_shareholders
            SET name = $1, designation = $2, shares_count = $3, capital_aed = $4, ownership_percent = $5,
                passport_or_eid = $6, coa_account_code = $7, display_order = $8, updated_at = now()
            WHERE id = $9
            RETURNING *;
          `, [name.trim(), designation || 'Director', sharesNum, capNum, ownNum, passportOrEid || '', coaCode, orderNum, id]);
          resultRow = updateRes.rows[0];
        } else {
          const insertRes = await client.query(`
            INSERT INTO public.company_shareholders
              (name, designation, shares_count, capital_aed, ownership_percent, passport_or_eid, coa_account_code, display_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
          `, [name.trim(), designation || 'Director', sharesNum, capNum, ownNum, passportOrEid || '', coaCode, orderNum]);
          resultRow = insertRes.rows[0];
        }

        // Synchronize with Chart of Accounts (COA Equity 3100 series)
        if (coaCode && capNum > 0) {
          await client.query(`
            UPDATE chart_of_accounts 
            SET current_balance = $1
            WHERE code = $2;
          `, [capNum, coaCode]).catch(() => {});
        }

        await client.query('COMMIT');
        return resultRow;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    return res.json({ success: true, data: saved });
  } catch (err: any) {
    console.error('[Finance Router] save shareholder error:', err?.message);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

financeRouter.delete('/shareholders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await withDb(async (client) => {
      await client.query('DELETE FROM public.company_shareholders WHERE id = $1', [id]);
    });
    return res.json({ success: true, message: 'Shareholder deleted' });
  } catch (err: any) {
    console.error('[Finance Router] delete shareholder error:', err?.message);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// --- Bank Direct Transfers Audit Trail (Live from vouchers) ---
financeRouter.get('/bank-audit-trail', async (req, res) => {
  try {
    const trail = await withDb(async (client) => {
      // Find vouchers with bank outflows (Credits to bank 1120 or Debits to payables/assets)
      const q = `
        SELECT 
          v.id,
          v.voucher_no as ref_no,
          COALESCE(v.date::text, v.created_at::text) as date,
          v.narration,
          v.total_amount,
          COALESCE(v.currency, 'AED') as currency,
          COALESCE(v.exchange_rate, 1.0) as exchange_rate,
          v.status
        FROM vouchers v
        WHERE v.status = 'POSTED'
        ORDER BY v.created_at DESC
        LIMIT 25;
      `;
      const r = await client.query(q).catch(async () => {
        const fallbackQ = `
          SELECT id, voucher_no as ref_no, date::text as date, narration, total_debit as total_amount, currency, status 
          FROM vouchers LIMIT 25;
        `;
        return await client.query(fallbackQ);
      });

      return (r.rows || []).map((row: any, idx: number) => {
        const amtAed = Number(row.total_amount || 0);
        const peg = 3.6725;
        const amtUsd = Number((amtAed / peg).toFixed(2));
        return {
          id: row.id,
          index: idx + 1,
          date: (row.date ? new Date(row.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
          bankRef: row.ref_no || `REF-${row.id.slice(0, 8)}`,
          narration: row.narration || 'Commercial Purchase / Operational Settlement',
          amountAed: amtAed,
          amountUsd: amtUsd
        };
      });
    });
    return res.json({ success: true, data: trail });
  } catch (err: any) {
    console.error('[Finance Router] bank audit trail error:', err?.message);
    return res.json({ success: true, data: [] });
  }
});




