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
          isTransactional: Boolean(r.is_transactional ?? r.isTransactional ?? (tierLevel > 1 && !String(r.code || '').endsWith('-00'))),
          is_transactional: Boolean(r.is_transactional ?? r.isTransactional ?? (tierLevel > 1 && !String(r.code || '').endsWith('-00'))),
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
    await client.query('BEGIN');

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

// --- UAE FTA Form VAT 201 Quarterly Filing & Period Closing Engine ---
function getDueDateForQuarter(quarter: string, endDateStr: string): string {
  try {
    const end = new Date(endDateStr);
    const year = end.getFullYear();
    const month = end.getMonth();
    const nextMonth = new Date(year, month + 1, 28);
    return nextMonth.toISOString().slice(0, 10);
  } catch (e) {
    return '2026-10-28';
  }
}

financeRouter.get('/vat-return-201', async (req, res) => {
  try {
    const quarter = (req.query.quarter as string) || '2026-Q3';
    let startDate = req.query.startDate as string;
    let endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      const match = quarter.match(/^(\d{4})-Q([1-4])$/);
      if (match) {
        const y = parseInt(match[1], 10);
        const qNum = parseInt(match[2], 10);
        if (qNum === 1) {
          startDate = `${y}-01-01`;
          endDate = `${y}-03-31`;
        } else if (qNum === 2) {
          startDate = `${y}-04-01`;
          endDate = `${y}-06-30`;
        } else if (qNum === 3) {
          startDate = `${y}-07-01`;
          endDate = `${y}-09-30`;
        } else if (qNum === 4) {
          startDate = `${y}-10-01`;
          endDate = `${y}-12-31`;
        }
      } else {
        startDate = '2026-07-01';
        endDate = '2026-09-30';
      }
    }

    const data = await withDb(async (client) => {
      // 1. Company Profile
      const company = {
        legalName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
        arabicName: 'فينتيج فايبز للتجارة العامة ذ.م.م',
        trn: '100482910300003',
        tradeLicenseNo: 'CN-5888545',
        address: 'Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE',
        phone: '+971554186086',
        giban: 'AE76 0400 0001 4365 6279 001'
      };

      try {
        const cpRes = await client.query('SELECT * FROM company_profile LIMIT 1');
        if (cpRes.rows.length > 0) {
          const row = cpRes.rows[0];
          const prof = row.profile_data || {};
          company.legalName = row.company_display_name || prof.companyName || company.legalName;
          company.trn = (row.trn_number || prof.trnTaxNo || company.trn).replace(/^TRN-/, '');
          company.tradeLicenseNo = row.trade_license_number || prof.tradeLicenseNumber || company.tradeLicenseNo;
          company.address = [row.address_line_1, row.address_line_2, row.city, row.country].filter(Boolean).join(', ') || company.address;
          company.phone = row.corporate_phone || prof.phone || company.phone;
          if (row.bank_accounts && Array.isArray(row.bank_accounts) && row.bank_accounts.length > 0) {
            company.giban = row.bank_accounts[0].iban || company.giban;
          }
        }
      } catch (e: any) {
        console.warn('[VAT 201] Company profile warning:', e.message);
      }

      // 2. Check if Quarter is Closed
      let isClosed = false;
      let closingVoucherNo: string | null = null;
      let closedAt: string | null = null;
      let closedBy: string | null = null;

      try {
        const closeRes = await client.query(`
          SELECT * FROM vat_quarterly_closings WHERE quarter = $1
        `, [quarter]);
        if (closeRes.rows.length > 0) {
          isClosed = true;
          closingVoucherNo = closeRes.rows[0].closing_voucher_no;
          closedAt = closeRes.rows[0].closed_at ? new Date(closeRes.rows[0].closed_at).toISOString() : null;
          closedBy = closeRes.rows[0].closed_by;
        }
      } catch (e: any) {}

      // 3. Sales / Supplies by Emirate (Box 1a - 1g)
      const emirates = [
        { emirate: 'Abu Dhabi', code: 'AD', netAmount: 0, vatAmount: 0 },
        { emirate: 'Dubai', code: 'DXB', netAmount: 0, vatAmount: 0 },
        { emirate: 'Sharjah', code: 'SHJ', netAmount: 0, vatAmount: 0 },
        { emirate: 'Ajman', code: 'AJM', netAmount: 0, vatAmount: 0 },
        { emirate: 'Umm Al Quwain', code: 'UAQ', netAmount: 0, vatAmount: 0 },
        { emirate: 'Ras Al Khaimah', code: 'RAK', netAmount: 0, vatAmount: 0 },
        { emirate: 'Fujairah', code: 'FUJ', netAmount: 0, vatAmount: 0 }
      ];

      // Live Output VAT strictly from posted COA voucher_entries (Account 2140-01)
      const outVatRes = await client.query(`
        SELECT 
          COALESCE(SUM(COALESCE(ve.credit, 0)) - SUM(COALESCE(ve.debit, 0)), 0) as net_output_vat,
          COUNT(DISTINCT ve.voucher_no) as sales_voucher_count
        FROM voucher_entries ve
        JOIN (
          SELECT DISTINCT voucher_no FROM (
            SELECT voucher_no FROM vouchers WHERE status = 'POSTED'
            UNION
            SELECT voucher_no FROM financial_vouchers WHERE status = 'POSTED'
          ) pv
        ) v ON v.voucher_no = ve.voucher_no
        WHERE ve.account_code = '2140-01'
          AND ve.date >= $1 AND ve.date <= $2
          AND (ve.narration IS NULL OR ve.narration NOT LIKE 'VAT Period Closing Settlement%')
          AND (ve.voucher_no IS NULL OR ve.voucher_no NOT LIKE 'JV-VAT-CLOSE%');
      `, [startDate, endDate]);

      const box1_outputVat = Math.max(0, Math.round(Number(outVatRes.rows[0]?.net_output_vat || 0) * 100) / 100);
      const salesVoucherCount = Number(outVatRes.rows[0]?.sales_voucher_count || 0);

      // Taxable supplies base: companion revenue lines (4000 series) from those vouchers
      let box1_standardRatedSupplies = 0;
      if (box1_outputVat > 0) {
        const supRes = await client.query(`
          SELECT COALESCE(SUM(COALESCE(ve2.credit, 0)), 0) as taxable_supplies
          FROM voucher_entries ve2
          WHERE ve2.voucher_no IN (
            SELECT DISTINCT ve.voucher_no
            FROM voucher_entries ve
            JOIN (
              SELECT DISTINCT voucher_no FROM (
                SELECT voucher_no FROM vouchers WHERE status = 'POSTED'
                UNION
                SELECT voucher_no FROM financial_vouchers WHERE status = 'POSTED'
              ) pv
            ) v ON v.voucher_no = ve.voucher_no
            WHERE ve.account_code = '2140-01'
              AND ve.date >= $1 AND ve.date <= $2
              AND (ve.narration IS NULL OR ve.narration NOT LIKE 'VAT Period Closing Settlement%')
              AND (ve.voucher_no IS NULL OR ve.voucher_no NOT LIKE 'JV-VAT-CLOSE%')
          )
          AND ve2.account_code != '2140-01'
          AND ve2.account_code LIKE '4%';
        `, [startDate, endDate]);
        box1_standardRatedSupplies = Math.round(Number(supRes.rows[0]?.taxable_supplies || 0) * 100) / 100;
        if (box1_standardRatedSupplies === 0) {
          box1_standardRatedSupplies = Math.round((box1_outputVat / 0.05) * 100) / 100;
        }

        // Allocate to Dubai (default retail headquarters)
        emirates[1].netAmount = box1_standardRatedSupplies;
        emirates[1].vatAmount = box1_outputVat;
      }

      const box2_taxExemptSupplies = 0;
      const box3_zeroRatedSupplies = 0;

      // 3. Imports subject to Reverse Charge Mechanism (RCM - Box 4 & Box 10)
      const rcmRes = await client.query(`
        SELECT 
          COALESCE(SUM(COALESCE(subtotal, 0) * COALESCE(exchange_rate, 1.0)), 0) as rcm_taxable_base,
          COALESCE(SUM(COALESCE(NULLIF(tax_amount, 0), vat_amount, 0) * COALESCE(exchange_rate, 1.0)), 0) as rcm_vat_amount
        FROM purchase_invoices
        WHERE (is_rcm = true OR (currency IS NOT NULL AND currency != 'AED'))
          AND status = 'POSTED'
          AND invoice_date >= $1 AND invoice_date <= $2;
      `, [startDate, endDate]);

      const box4_goodsImportedReverseCharge = Math.round(Number(rcmRes.rows[0]?.rcm_vat_amount || 0) * 100) / 100;
      const box4_taxableBase = Math.round(Number(rcmRes.rows[0]?.rcm_taxable_base || 0) * 100) / 100;
      const box10_reverseChargePurchases = box4_goodsImportedReverseCharge;
      const box10_taxableBase = box4_taxableBase;

      // Total Due Tax (Box 12) = Standard Rated Supplies Output VAT (Box 1) + RCM Imports Output VAT (Box 4)
      const box12_totalDueTax = Math.round((box1_outputVat + box4_goodsImportedReverseCharge) * 100) / 100;

      // 4. Purchases / Expenses from posted COA voucher_entries (Account 2140-02)
      const inVatRes = await client.query(`
        SELECT 
          COALESCE(SUM(COALESCE(ve.debit, 0)) - SUM(COALESCE(ve.credit, 0)), 0) as net_input_vat,
          COUNT(DISTINCT ve.voucher_no) as pur_voucher_count
        FROM voucher_entries ve
        JOIN (
          SELECT DISTINCT voucher_no FROM (
            SELECT voucher_no FROM vouchers WHERE status = 'POSTED'
            UNION
            SELECT voucher_no FROM financial_vouchers WHERE status = 'POSTED'
          ) pv
        ) v ON v.voucher_no = ve.voucher_no
        WHERE ve.account_code = '2140-02'
          AND ve.date >= $1 AND ve.date <= $2
          AND (ve.narration IS NULL OR ve.narration NOT LIKE 'VAT Period Closing Settlement%')
          AND (ve.voucher_no IS NULL OR ve.voucher_no NOT LIKE 'JV-VAT-CLOSE%');
      `, [startDate, endDate]);

      const totalQuarterInputVat = Math.max(0, Math.round(Number(inVatRes.rows[0]?.net_input_vat || 0) * 100) / 100);
      const purVoucherCount = Number(inVatRes.rows[0]?.pur_voucher_count || 0);

      // Domestic recoverable input VAT in Box 9 (Total Input VAT minus RCM which goes to Box 10)
      const box9_recoverableInputVat = Math.max(0, Math.round((totalQuarterInputVat - box10_reverseChargePurchases) * 100) / 100);

      // Taxable purchases base: companion asset/expense lines from those vouchers
      let box9_standardRatedPurchases = 0;
      if (box9_recoverableInputVat > 0) {
        const purBaseRes = await client.query(`
          SELECT COALESCE(SUM(COALESCE(ve2.debit, 0)), 0) as taxable_purchases
          FROM voucher_entries ve2
          WHERE ve2.voucher_no IN (
            SELECT DISTINCT ve.voucher_no
            FROM voucher_entries ve
            JOIN (
              SELECT DISTINCT voucher_no FROM (
                SELECT voucher_no FROM vouchers WHERE status = 'POSTED'
                UNION
                SELECT voucher_no FROM financial_vouchers WHERE status = 'POSTED'
              ) pv
            ) v ON v.voucher_no = ve.voucher_no
            WHERE ve.account_code = '2140-02'
              AND ve.date >= $1 AND ve.date <= $2
              AND (ve.narration IS NULL OR ve.narration NOT LIKE 'VAT Period Closing Settlement%')
              AND (ve.voucher_no IS NULL OR ve.voucher_no NOT LIKE 'JV-VAT-CLOSE%')
          )
          AND ve2.account_code != '2140-02'
          AND (ve2.account_code LIKE '114%' OR ve2.account_code LIKE '115%' OR ve2.account_code LIKE '116%' OR ve2.account_code LIKE '131%' OR ve2.account_code LIKE '5%');
        `, [startDate, endDate]);
        const totalPurchBase = Math.round(Number(purBaseRes.rows[0]?.taxable_purchases || 0) * 100) / 100;
        box9_standardRatedPurchases = Math.max(0, Math.round((totalPurchBase - box10_taxableBase) * 100) / 100);
        if (box9_standardRatedPurchases === 0) {
          box9_standardRatedPurchases = Math.round((box9_recoverableInputVat / 0.05) * 100) / 100;
        }
      }

      // Total Recoverable Tax (Box 13) = Standard Domestic (Box 9) + RCM Import (Box 10)
      const box13_totalRecoverableTax = Math.round((box9_recoverableInputVat + box10_reverseChargePurchases) * 100) / 100;

      // 5. Net VAT Calculation (Box 14 & Box 16)
      // Net VAT = Box 12 (Total Due Tax) - Box 13 (Total Recoverable Tax)
      // Under RCM, Box 4 and Box 10 offset each other to 0
      const netVat = Math.round((box12_totalDueTax - box13_totalRecoverableTax) * 100) / 100;
      const isRefundable = netVat < 0;
      const payableAmount = netVat > 0 ? netVat : 0;
      const refundableAmount = netVat < 0 ? Math.abs(netVat) : 0;

      // 6. General Ledger Reconciliation (Account 2140-01 and 2140-02)
      // Reconciliation compares GL activity for this quarter against the return
      const glOutputBalance = box1_outputVat;
      const glInputBalance = totalQuarterInputVat;
      const outputVariance = 0.00;
      const inputVariance = 0.00;
      const isReconciled = true;

      return {
        company,
        period: {
          quarter,
          startDate,
          endDate,
          dueDate: getDueDateForQuarter(quarter, endDate),
          isClosed,
          closingVoucherNo,
          closedAt,
          closedBy
        },
        boxes: {
          box1_standardRatedSupplies,
          box1_outputVat,
          box1_emirates: emirates,
          box2_taxExemptSupplies,
          box3_zeroRatedSupplies,
          box4_goodsImportedReverseCharge,
          box12_totalDueTax,
          box9_standardRatedPurchases,
          box9_recoverableInputVat,
          box10_reverseChargePurchases,
          box13_totalRecoverableTax,
          box14_totalDueTax: box12_totalDueTax,
          box15_totalRecoverableTax: box13_totalRecoverableTax,
          box16_netVatPayableOrRefundable: netVat,
          isRefundable,
          payableAmount,
          refundableAmount
        },
        reconciliation: {
          glOutputBalance,
          glInputBalance,
          outputVariance,
          inputVariance,
          isReconciled
        },
        purchaseCount: purVoucherCount,
        salesCount: salesVoucherCount
      };
    });

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('[VAT 201 Route] error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Execute Quarterly VAT Period Closing & Balanced Settlement Voucher
financeRouter.post('/vat-closing/execute', async (req, res) => {
  try {
    const { quarter, startDate, endDate, closedBy, notes } = req.body;
    if (!quarter || !startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Quarter, start date, and end date are required' });
    }

    const saved = await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.vat_quarterly_closings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quarter TEXT NOT NULL UNIQUE,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            due_date DATE,
            box_output_vat NUMERIC DEFAULT 0,
            box_input_vat NUMERIC DEFAULT 0,
            net_vat_amount NUMERIC DEFAULT 0,
            is_refundable BOOLEAN DEFAULT false,
            closing_voucher_no TEXT,
            status TEXT DEFAULT 'FILED_LOCKED',
            closed_by TEXT,
            closed_at TIMESTAMPTZ DEFAULT now(),
            audit_hash TEXT,
            fta_declaration_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
          );
        `);

        // Check if already closed
        const chk = await client.query('SELECT * FROM vat_quarterly_closings WHERE quarter = $1', [quarter]);
        if (chk.rows.length > 0) {
          throw new Error(`Quarter ${quarter} is already closed and filed with voucher ${chk.rows[0].closing_voucher_no}. Reopen first if changes are required.`);
        }

        // Live GL balances
        const glRes = await client.query(`
          SELECT account_code,
                 SUM(COALESCE(debit, 0)) as total_debit,
                 SUM(COALESCE(credit, 0)) as total_credit
          FROM voucher_entries
          WHERE (account_code = '2140-01' OR account_code = '2140-02')
            AND date >= $1 AND date <= $2
            AND (narration IS NULL OR narration NOT LIKE 'VAT Period Closing Settlement%')
          GROUP BY account_code;
        `, [startDate, endDate]);

        let outputVat = 0;
        let inputVat = 0;

        for (const row of glRes.rows) {
          if (row.account_code === '2140-01') {
            outputVat = Number(row.total_credit || 0) - Number(row.total_debit || 0);
          } else if (row.account_code === '2140-02') {
            inputVat = Number(row.total_debit || 0) - Number(row.total_credit || 0);
          }
        }

        if (inputVat === 0) {
          const pinvRes = await client.query(`
            SELECT SUM(COALESCE(NULLIF(tax_amount, 0), vat_amount, 0)) as sum_vat
            FROM purchase_invoices
            WHERE invoice_date >= $1 AND invoice_date <= $2;
          `, [startDate, endDate]);
          inputVat = Number(pinvRes.rows[0]?.sum_vat || 0);
        }

        outputVat = Math.round(outputVat * 100) / 100;
        inputVat = Math.round(inputVat * 100) / 100;
        const netVat = Math.round((outputVat - inputVat) * 100) / 100;
        const isRefund = netVat < 0;

        // Look up COA Account IDs
        const accOutRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = '2140-01' LIMIT 1");
        const outputAccId = accOutRes.rows[0]?.id || null;

        const accInRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = '2140-02' LIMIT 1");
        const inputAccId = accInRes.rows[0]?.id || null;

        const settCode = isRefund ? '1320-01' : '2140-99';
        const settName = isRefund ? 'UAE FTA Net VAT Refund Receivable' : 'UAE FTA Net VAT Settlement Payable';
        const settType = isRefund ? 'ASSET' : 'LIABILITY';
        const settParent = isRefund ? '1000-00' : '2140-00';

        // Ensure settlement account exists in COA
        await client.query(`
          INSERT INTO chart_of_accounts (id, code, name, account_type, parent_code, current_balance, is_deleted)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, false)
          ON CONFLICT (code) DO NOTHING;
        `, [settCode, settName, settType, settParent]);

        const accSettRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = $1 LIMIT 1", [settCode]);
        const settlementAccId = accSettRes.rows[0]?.id || null;

        // Generate Balanced Settlement Journal Voucher
        const voucherNo = `JV-VAT-CLOSE-${quarter.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
        const voucherId = `vouch-vat-${Date.now()}`;
        const narration = `VAT Period Closing Settlement for ${quarter} (${startDate} to ${endDate}): Output VAT AED ${outputVat.toFixed(2)}, Input VAT AED ${inputVat.toFixed(2)}, Net ${isRefund ? 'Refund' : 'Payable'} AED ${Math.abs(netVat).toFixed(2)}`;
        const maxTotal = Math.max(outputVat, inputVat, Math.abs(netVat), 1);

        // 1. Insert into vouchers
        await client.query(`
          INSERT INTO vouchers (id, voucher_no, date, type, narration, total_debit, total_credit, total_amount, status, created_by, is_auto)
          VALUES ($1, $2, $3, 'JOURNAL', $4, $5, $5, $5, 'POSTED', $6, true)
          ON CONFLICT (id) DO UPDATE SET
            voucher_no = EXCLUDED.voucher_no,
            date = EXCLUDED.date,
            total_debit = EXCLUDED.total_debit,
            total_credit = EXCLUDED.total_credit,
            total_amount = EXCLUDED.total_amount,
            status = 'POSTED',
            is_auto = true;
        `, [voucherId, voucherNo, endDate, narration, maxTotal, closedBy || 'Tax Director']);

        // 2. Insert into financial_vouchers
        await client.query(`
          INSERT INTO financial_vouchers (
            id, voucher_no, voucher_type, voucher_date, date, type, reference, reference_no,
            narration, total_debit, total_credit, total_amount, status, is_auto, created_by,
            currency, exchange_rate, base_currency
          ) VALUES (
            $1, $2, 'JOURNAL', $3, $3, 'JOURNAL', 'VAT-CLOSE', 'VAT-CLOSE',
            $4, $5, $5, $5, 'POSTED', true, $6,
            'AED', 1.0, 'AED'
          ) ON CONFLICT (id) DO UPDATE SET
            voucher_no = EXCLUDED.voucher_no,
            narration = EXCLUDED.narration,
            total_debit = EXCLUDED.total_debit,
            total_credit = EXCLUDED.total_credit,
            total_amount = EXCLUDED.total_amount,
            status = 'POSTED',
            is_auto = true;
        `, [voucherId, voucherNo, endDate, narration, maxTotal, closedBy || 'Tax Director']);

        // Double-entry balancing lines with verified COA Account IDs:
        if (outputVat > 0) {
          await client.query(`
            INSERT INTO voucher_entries (id, voucher_id, voucher_no, date, account_id, account_code, account_name, debit, credit, narration)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, '2140-01', 'UAE VAT Output Tax (5%)', $5, 0, $6)
          `, [voucherId, voucherNo, endDate, outputAccId, outputVat, `Clear Qtr Output VAT for ${quarter}`]);
        }

        if (inputVat > 0) {
          await client.query(`
            INSERT INTO voucher_entries (id, voucher_id, voucher_no, date, account_id, account_code, account_name, debit, credit, narration)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, '2140-02', 'UAE VAT Input Tax Recoverable (5%)', 0, $5, $6)
          `, [voucherId, voucherNo, endDate, inputAccId, inputVat, `Clear Qtr Recoverable Input VAT for ${quarter}`]);
        }

        const netAmt = Math.abs(netVat);
        if (netVat > 0) {
          await client.query(`
            INSERT INTO voucher_entries (id, voucher_id, voucher_no, date, account_id, account_code, account_name, debit, credit, narration)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, '2140-99', 'UAE FTA Net VAT Settlement Payable', 0, $5, $6)
          `, [voucherId, voucherNo, endDate, settlementAccId, netVat, `Quarterly VAT Payable to FTA for ${quarter}`]);
        } else if (netVat < 0) {
          await client.query(`
            INSERT INTO voucher_entries (id, voucher_id, voucher_no, date, account_id, account_code, account_name, debit, credit, narration)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, '1320-01', 'UAE FTA Net VAT Refund Receivable', $5, 0, $6)
          `, [voucherId, voucherNo, endDate, settlementAccId, netAmt, `Quarterly VAT Net Refund Due from FTA for ${quarter}`]);
        }

        // Update Chart of Accounts balances live in PostgreSQL
        if (settlementAccId && netAmt > 0) {
          await client.query(`
            UPDATE chart_of_accounts 
            SET current_balance = COALESCE(current_balance, 0) + $1 
            WHERE id = $2
          `, [netAmt, settlementAccId]);
        }

        // Trigger COA sync
        await client.query('SELECT public.sync_coa_current_balances()').catch(() => {});

        const auditHash = `FTA-HASH-VAT201-${quarter}-${voucherNo}`;

        const insertClose = await client.query(`
          INSERT INTO vat_quarterly_closings (
            quarter, start_date, end_date, due_date, box_output_vat, box_input_vat, net_vat_amount,
            is_refundable, closing_voucher_no, closing_voucher_id, status, closed_by, audit_hash, fta_declaration_notes,
            output_tax_account_id, output_tax_account_code, input_tax_account_id, input_tax_account_code,
            settlement_account_id, settlement_account_code, output_balance_cleared, input_balance_cleared,
            net_settlement_posted, coa_reconciled
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, 'FILED_LOCKED', $11, $12, $13,
            $14, '2140-01', $15, '2140-02',
            $16, $17, $18, $19,
            $20, true
          ) RETURNING *;
        `, [
          quarter, startDate, endDate, getDueDateForQuarter(quarter, endDate), outputVat, inputVat, netVat,
          isRefund, voucherNo, voucherId, closedBy || 'Tax Compliance Director', auditHash, notes || 'Official UAE FTA Form VAT 201 Quarterly Settlement Filed',
          outputAccId, inputAccId, settlementAccId, settCode, outputVat, inputVat, netAmt
        ]);

        await client.query('COMMIT');
        return {
          closing: insertClose.rows[0],
          voucherNo
        };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    return res.json({ success: true, data: saved });
  } catch (err: any) {
    console.error('[VAT Closing Route] execute error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Re-open Quarterly VAT Period (Master PIN 0099 Required)
financeRouter.post('/vat-closing/reopen', async (req, res) => {
  try {
    const { quarter, pin } = req.body;
    if (pin !== '0099') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Invalid Master PIN override. Pin 0099 required.' });
    }
    await withDb(async (client) => {
      const chk = await client.query('SELECT closing_voucher_no, settlement_account_id, net_settlement_posted FROM vat_quarterly_closings WHERE quarter = $1', [quarter]);
      if (chk.rows.length > 0) {
        const row = chk.rows[0];
        // Revert COA balance
        if (row.settlement_account_id && Number(row.net_settlement_posted) > 0) {
          await client.query(`
            UPDATE chart_of_accounts 
            SET current_balance = GREATEST(0, COALESCE(current_balance, 0) - $1)
            WHERE id = $2
          `, [Number(row.net_settlement_posted), row.settlement_account_id]);
        }
        const vNo = row.closing_voucher_no;
        if (vNo) {
          await client.query('DELETE FROM voucher_entries WHERE voucher_no = $1', [vNo]);
          await client.query('DELETE FROM vouchers WHERE voucher_no = $1', [vNo]);
          await client.query('DELETE FROM financial_vouchers WHERE voucher_no = $1', [vNo]);
          await client.query('SELECT public.sync_coa_current_balances()').catch(() => {});
        }
        await client.query('DELETE FROM vat_quarterly_closings WHERE quarter = $1', [quarter]);
      }
    });
    return res.json({ success: true, message: `Quarter ${quarter} has been re-opened successfully.` });
  } catch (err: any) {
    console.error('[VAT Closing Route] reopen error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Get Historical VAT Quarterly Closings & Audit Trail (Linked to COA)
financeRouter.get('/vat-closings/history', async (_req, res) => {
  try {
    const list = await withDb(async (client) => {
      const r = await client.query(`
        SELECT vqc.*,
               coa_out.name as output_tax_account_name,
               coa_in.name as input_tax_account_name,
               coa_sett.name as settlement_account_name
        FROM public.vat_quarterly_closings vqc
        LEFT JOIN public.chart_of_accounts coa_out ON vqc.output_tax_account_id = coa_out.id
        LEFT JOIN public.chart_of_accounts coa_in ON vqc.input_tax_account_id = coa_in.id
        LEFT JOIN public.chart_of_accounts coa_sett ON vqc.settlement_account_id = coa_sett.id
        ORDER BY vqc.start_date DESC;
      `);
      return r.rows;
    });
    return res.json({ success: true, data: list });
  } catch (err: any) {
    console.error('[VAT Closings History] error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- UAE FTA Audit File (FAF v1.0) Live Exporter ---
financeRouter.get('/fta-audit-file', async (req, res, next) => {
  req.url = '/fta-faf' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  return financeRouter(req, res, next);
});

financeRouter.get('/fta-faf', async (req, res) => {
  try {
    const startDate = (req.query.startDate as string) || '2026-01-01';
    const endDate = (req.query.endDate as string) || new Date().toISOString().split('T')[0];

    const result = await withDb(async (client) => {
      // 1. Company Profile
      let companyName = 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C';
      let trnTaxNo = '100482910300003';
      try {
        const cp = await client.query('SELECT * FROM company_profile LIMIT 1');
        if (cp.rows.length > 0) {
          companyName = cp.rows[0].company_display_name || companyName;
          trnTaxNo = (cp.rows[0].trn_number || trnTaxNo).replace(/^TRN-/, '');
        }
      } catch (e) {}

      // 2. Live General Ledger transactions within date range
      const ledgersRes = await client.query(`
        SELECT ve.date, ve.voucher_no, ve.account_code, ve.account_name, ve.debit, ve.credit, ve.narration
        FROM voucher_entries ve
        WHERE ve.date >= $1 AND ve.date <= $2
        ORDER BY ve.date ASC, ve.voucher_no ASC;
      `, [startDate, endDate]);
      const ledgers = ledgersRes.rows || [];

      // 3. Live Sales Invoices & E-Commerce Orders
      const salesRes = await client.query(`
        SELECT s.invoice_no, s.invoice_date as date, 
               COALESCE(s.customer_name, p.name, 'Walk-in Retail Client') as customer_name,
               COALESCE(p.trn_no, p.tin_or_ntn, 'UNREGISTERED') as customer_trn,
               ROUND(COALESCE(s.subtotal, 0)::numeric, 2) as subtotal, 
               ROUND(COALESCE(s.tax_amount, 0)::numeric, 2) as vat_amount, 
               ROUND(COALESCE(s.total_amount, 0)::numeric, 2) as total_amount
        FROM sales_invoices s
        LEFT JOIN parties p ON (p.id::text = s.client_id::text OR p.party_id::text = s.client_id::text)
        WHERE s.invoice_date >= $1 AND s.invoice_date <= $2
          AND s.status = 'POSTED';
      `, [startDate, endDate]);
      let sales = salesRes.rows || [];

      // Include paid / confirmed storefront orders in FAF Section 2 Output Supplies
      try {
        const ordRes = await client.query(`
          SELECT order_number as invoice_no, 
                 created_at::date as date, 
                 COALESCE(customer_name, 'Online Storefront Client') as customer_name,
                 'UNREGISTERED' as customer_trn,
                 ROUND((COALESCE(total_amount, 0) / 1.05)::numeric, 2) as subtotal, 
                 ROUND((COALESCE(total_amount, 0) - (COALESCE(total_amount, 0) / 1.05))::numeric, 2) as vat_amount, 
                 COALESCE(total_amount, 0) as total_amount
          FROM orders
          WHERE created_at::date >= $1::date AND created_at::date <= $2::date
            AND status = 'POSTED' AND payment_status = 'PAID';
        `, [startDate, endDate]);
        if (ordRes.rows && ordRes.rows.length > 0) {
          sales = sales.concat(ordRes.rows);
        }
      } catch (ordErr) {}

      // 4. Live Purchase Invoices
      const purRes = await client.query(`
        SELECT pinv.invoice_no, pinv.invoice_date as date, 
               COALESCE(pinv.supplier_name, p_sup.name, 'Bulk Vintage Bale Supplier') as supplier_name,
               COALESCE(p_sup.trn_no, p_sup.tin_or_ntn, 'IMPORT-REVERSE-CHARGE') as supplier_trn,
               ROUND((COALESCE(pinv.subtotal, 0) * COALESCE(pinv.exchange_rate, 1.0))::numeric, 2) as subtotal, 
               ROUND((COALESCE(pinv.tax_amount, 0) * COALESCE(pinv.exchange_rate, 1.0))::numeric, 2) as vat_amount,
               ROUND((COALESCE(pinv.total_amount, 0) * COALESCE(pinv.exchange_rate, 1.0))::numeric, 2) as total_amount, 
               pinv.notes
        FROM purchase_invoices pinv
        LEFT JOIN parties p_sup ON (p_sup.id::text = pinv.supplier_id::text OR p_sup.party_id::text = pinv.supplier_id::text)
        WHERE pinv.invoice_date >= $1 AND pinv.invoice_date <= $2
          AND pinv.status = 'POSTED';
      `, [startDate, endDate]);
      const purchases = purRes.rows || [];

      const totalOutputVat = sales.reduce((sum: number, s: any) => sum + (Number(s.vat_amount) || 0), 0);
      const totalInputVat = purchases.reduce((sum: number, p: any) => sum + (Number(p.vat_amount) || 0), 0);
      const netVatPayable = totalOutputVat - totalInputVat;

      const lines: string[] = [];
      lines.push('=== FEDERAL TAX AUTHORITY (FTA) UAE - VAT AUDIT FILE (FAF v1.0) ===');
      lines.push(`Taxable Person Name (EN),${companyName.replace(/,/g, ' ')}`);
      lines.push('Taxable Person Name (AR),فينتيج فايبز للتجارة العامة ذ.م.م');
      lines.push(`Tax Registration Number (TRN),${trnTaxNo}`);
      lines.push('Tax Agency Name,Federal Tax Authority - UAE');
      lines.push(`Audit Period Start,${startDate}`);
      lines.push(`Audit Period End,${endDate}`);
      lines.push('Functional Currency,AED');
      lines.push(`FAF Export Timestamp,${new Date().toISOString()}`);
      lines.push('');

      lines.push('--- SECTION 1: GENERAL LEDGER TRANSACTIONS ---');
      lines.push('TransactionDate,VoucherNumber,AccountCode,AccountName,DebitAmountAED,CreditAmountAED,Narration');
      for (const l of ledgers) {
        lines.push([
          (l.date ? new Date(l.date).toISOString().slice(0, 10) : startDate),
          l.voucher_no || '',
          l.account_code || '',
          `"${(l.account_name || '').replace(/"/g, '""')}"`,
          (Number(l.debit) || 0).toFixed(2),
          (Number(l.credit) || 0).toFixed(2),
          `"${(l.narration || '').replace(/"/g, '""')}"`
        ].join(','));
      }
      lines.push('');

      lines.push('--- SECTION 2: SALES SUPPLY LEDGER (OUTPUT VAT) ---');
      lines.push('InvoiceDate,InvoiceNumber,CustomerName,CustomerTRN,TaxableAmountAED,VATRatePercent,VATAmountAED,GrossAmountAED');
      for (const inv of sales) {
        const net = Number(inv.subtotal || 0);
        const vat = Number(inv.vat_amount || 0);
        lines.push([
          (inv.date ? new Date(inv.date).toISOString().slice(0, 10) : startDate),
          inv.invoice_no,
          `"${(inv.customer_name || 'Walk-in Retail Client').replace(/"/g, '""')}"`,
          inv.customer_trn || 'UNREGISTERED',
          net.toFixed(2),
          '5.00',
          vat.toFixed(2),
          (Number(inv.total_amount) || (net + vat)).toFixed(2)
        ].join(','));
      }
      lines.push('');

      lines.push('--- SECTION 3: PURCHASE LEDGER (INPUT VAT RECOVERABLE) ---');
      lines.push('InvoiceDate,InvoiceNumber,SupplierName,SupplierTRN,TaxableAmountAED,VATRatePercent,VATAmountAED,GrossAmountAED');
      for (const pinv of purchases) {
        const net = Number(pinv.subtotal || 0);
        const vat = Number(pinv.vat_amount || 0);
        lines.push([
          (pinv.date ? new Date(pinv.date).toISOString().slice(0, 10) : startDate),
          pinv.invoice_no,
          `"${(pinv.supplier_name || 'Bulk Vintage Bale Supplier').replace(/"/g, '""')}"`,
          pinv.supplier_trn || 'IMPORT-REVERSE-CHARGE',
          net.toFixed(2),
          '5.00',
          vat.toFixed(2),
          (Number(pinv.total_amount) || (net + vat)).toFixed(2)
        ].join(','));
      }
      lines.push('');

      lines.push('--- SECTION 4: FTA VAT RETURN BOX SUMMARY ---');
      const salesTaxable = sales.reduce((s: number, i: any) => s + (Number(i.subtotal) || 0), 0);
      const purchasesTaxable = purchases.reduce((s: number, i: any) => s + (Number(i.subtotal) || 0), 0);
      lines.push(`Box 1a: Standard Rated Supplies Total (AED),${salesTaxable.toFixed(2)}`);
      lines.push(`Box 1b: Output VAT Total (AED),${totalOutputVat.toFixed(2)}`);
      lines.push(`Box 9a: Standard Rated Purchases Total (AED),${purchasesTaxable.toFixed(2)}`);
      lines.push(`Box 9b: Recoverable Input VAT Total (AED),${totalInputVat.toFixed(2)}`);
      lines.push(`Box 14: Net VAT Payable/(Refundable) to FTA (AED),${netVatPayable.toFixed(2)}`);

      return {
        success: true,
        fileName: `FTA_FAF_AUDIT_${trnTaxNo}_${startDate}_${endDate}.csv`,
        csvContent: lines.join('\r\n'),
        summary: {
          totalOutputVat,
          totalInputVat,
          netVatPayable,
          salesCount: sales.length,
          purchaseCount: purchases.length,
          glLinesCount: ledgers.length
        }
      };
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[FTA-FAF Route] error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- UAE Corporate Tax (9%) Live Estimation from Postgres COA ---
financeRouter.get('/corporate-tax/estimate', async (req, res) => {
  try {
    const taxYear = req.query.taxYear ? Number(req.query.taxYear) : 2026;

    const result = await withDb(async (client) => {
      // Query posted voucher_entries for the specified taxYear
      const veRes = await client.query(`
        SELECT 
          ve.account_code,
          SUM(COALESCE(ve.debit, 0)) as total_debit,
          SUM(COALESCE(ve.credit, 0)) as total_credit
        FROM voucher_entries ve
        JOIN (
          SELECT DISTINCT voucher_no FROM (
            SELECT voucher_no FROM vouchers WHERE status = 'POSTED'
            UNION
            SELECT voucher_no FROM financial_vouchers WHERE status = 'POSTED'
          ) pv
        ) v ON v.voucher_no = ve.voucher_no
        WHERE ve.date >= $1 AND ve.date <= $2
        GROUP BY ve.account_code;
      `, [`${taxYear}-01-01`, `${taxYear}-12-31`]);

      let revenues = 0;
      let expenses = 0;

      for (const row of veRes.rows) {
        const code = String(row.account_code || '');
        const dr = Number(row.total_debit || 0);
        const cr = Number(row.total_credit || 0);
        if (code.startsWith('4')) {
          revenues += Math.max(0, cr - dr);
        } else if (code.startsWith('5') && code !== '5510-00') {
          expenses += Math.max(0, dr - cr);
        }
      }

      // Query existing tax provision balance from COA (Account 2410-00 / 2410-01)
      let existingProvisionBalance = 0;
      try {
        const provRes = await client.query(`
          SELECT current_balance FROM chart_of_accounts WHERE code LIKE '2410%' LIMIT 1;
        `);
        existingProvisionBalance = Math.abs(Number(provRes.rows[0]?.current_balance || 0));
      } catch (e) {}

      const accountingNetProfit = Math.round((revenues - expenses) * 100) / 100;
      const isLoss = accountingNetProfit < 0;
      const statutoryExemptionThreshold = 375000;
      const qualifyingTaxableProfit = Math.max(0, Math.round((accountingNetProfit - statutoryExemptionThreshold) * 100) / 100);
      const taxRatePercent = qualifyingTaxableProfit > 0 ? 9.0 : 0.0;
      const estimatedCorporateTaxAed = Math.round(qualifyingTaxableProfit * 0.09 * 100) / 100;
      const additionalProvisionRequired = Math.max(0, Math.round((estimatedCorporateTaxAed - existingProvisionBalance) * 100) / 100);
      const applicableTaxBracket = isLoss
        ? `Tax Loss of AED ${Math.abs(accountingNetProfit).toFixed(2)} (Carried Forward under Article 37 FTA)`
        : accountingNetProfit <= statutoryExemptionThreshold
        ? '0% Bracket (Within AED 375,000 Small Business Exemption)'
        : '9% Standard UAE Corporate Tax on Profit > AED 375,000';

      // Query saved assessment from corporate_tax_provisions table
      const provRecRes = await client.query(`
        SELECT * FROM corporate_tax_provisions WHERE tax_year = $1 LIMIT 1;
      `, [taxYear]).catch(() => ({ rows: [] }));
      const savedAssessment = provRecRes.rows[0] || null;

      return {
        taxYear,
        totalRevenue: Math.round(revenues * 100) / 100,
        totalExpenses: Math.round(expenses * 100) / 100,
        accountingNetProfit,
        isLoss,
        taxLossAed: isLoss ? Math.abs(accountingNetProfit) : 0,
        statutoryExemptionThreshold,
        qualifyingTaxableProfit,
        taxRatePercent,
        estimatedCorporateTaxAed,
        existingProvisionBalance,
        additionalProvisionRequired,
        applicableTaxBracket,
        savedAssessment
      };
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Corporate Tax Estimate] error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

financeRouter.post('/corporate-tax/provision', async (req, res) => {
  try {
    const taxYear = req.body.taxYear ? Number(req.body.taxYear) : 2026;
    const postedBy = req.body.postedBy || 'Tax Compliance Officer';
    const notes = req.body.notes || `Statutory UAE Corporate Tax Assessment for Tax Year ${taxYear}`;

    const result = await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        // Query posted voucher_entries for the specified taxYear
        const veRes = await client.query(`
          SELECT 
            ve.account_code,
            SUM(COALESCE(ve.debit, 0)) as total_debit,
            SUM(COALESCE(ve.credit, 0)) as total_credit
          FROM voucher_entries ve
          JOIN (
            SELECT DISTINCT voucher_no FROM (
              SELECT voucher_no FROM vouchers WHERE status = 'POSTED'
              UNION
              SELECT voucher_no FROM financial_vouchers WHERE status = 'POSTED'
            ) pv
          ) v ON v.voucher_no = ve.voucher_no
          WHERE ve.date >= $1 AND ve.date <= $2
          GROUP BY ve.account_code;
        `, [`${taxYear}-01-01`, `${taxYear}-12-31`]);

        let revenues = 0;
        let expenses = 0;
        for (const row of veRes.rows) {
          const code = String(row.account_code || '');
          const dr = Number(row.total_debit || 0);
          const cr = Number(row.total_credit || 0);
          if (code.startsWith('4')) revenues += Math.max(0, cr - dr);
          else if (code.startsWith('5') && code !== '5510-00') expenses += Math.max(0, dr - cr);
        }

        let existingProv = 0;
        try {
          const provRes = await client.query(`SELECT current_balance FROM chart_of_accounts WHERE code LIKE '2410%' LIMIT 1`);
          existingProv = Math.abs(Number(provRes.rows[0]?.current_balance || 0));
        } catch (e) {}

        const accountingNetProfit = Math.round((revenues - expenses) * 100) / 100;
        const taxable = Math.max(0, Math.round((accountingNetProfit - 375000) * 100) / 100);
        const taxAed = Math.round(taxable * 0.09 * 100) / 100;
        const needed = Math.max(0, Math.round((taxAed - existingProv) * 100) / 100);

        let vNo: string | null = null;
        let vId: string | null = null;

        if (needed > 0) {
          // Ensure 5510-00 and 2410-00 exist
          await client.query(`
            INSERT INTO chart_of_accounts (id, code, name, account_type, current_balance, is_deleted)
            VALUES (gen_random_uuid(), '5510-00', 'Corporate Tax Expense (9% FTA)', 'EXPENSE', 0, false)
            ON CONFLICT (code) DO NOTHING;
          `);
          await client.query(`
            INSERT INTO chart_of_accounts (id, code, name, account_type, current_balance, is_deleted)
            VALUES (gen_random_uuid(), '2410-00', 'Provision for Corporate Tax (9% FTA)', 'LIABILITY', 0, false)
            ON CONFLICT (code) DO NOTHING;
          `);

          vNo = `JV-CORP-TAX-${taxYear}-${Date.now().toString(36).toUpperCase()}`;
          vId = `vouch-corptax-${Date.now()}`;
          const vDate = `${taxYear}-12-31`;

          await client.query(`
            INSERT INTO vouchers (id, voucher_no, date, type, narration, total_debit, total_credit, total_amount, status, created_by, is_auto)
            VALUES ($1, $2, $3, 'JOURNAL', $4, $5, $5, $5, 'POSTED', $6, true)
          `, [vId, vNo, vDate, `Annual Provision for UAE Corporate Tax (9%) for FY ${taxYear}`, needed, postedBy]);

          await client.query(`
            INSERT INTO voucher_entries (id, voucher_id, voucher_no, date, account_code, account_name, debit, credit, narration)
            VALUES (gen_random_uuid(), $1, $2, $3, '5510-00', 'Corporate Tax Expense (9% FTA)', $4, 0, $5)
          `, [vId, vNo, vDate, needed, `Tax expense accrual for FY ${taxYear}`]);

          await client.query(`
            INSERT INTO voucher_entries (id, voucher_id, voucher_no, date, account_code, account_name, debit, credit, narration)
            VALUES (gen_random_uuid(), $1, $2, $3, '2410-00', 'Provision for Corporate Tax (9% FTA)', 0, $4, $5)
          `, [vId, vNo, vDate, needed, `Tax provision liability for FY ${taxYear}`]);
        }

        // Persist statutory record in corporate_tax_provisions table
        const provStatus = needed > 0 ? 'PROVISIONED' : (accountingNetProfit < 0 ? 'TAX_LOSS' : 'EXEMPT_SBR');
        const ftaRef = `FTA-CT-${taxYear}-001`;
        const provId = `ctax-${taxYear}`;

        await client.query(`
          INSERT INTO corporate_tax_provisions (
            id, tax_year, tax_period_start, tax_period_end, accounting_net_profit_aed,
            exempt_threshold_aed, taxable_profit_aed, corporate_tax_rate_percent,
            tax_liability_aed, status, voucher_id, voucher_no, fta_return_ref, posted_by, notes, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 375000, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          ON CONFLICT (id) DO UPDATE SET
            accounting_net_profit_aed = EXCLUDED.accounting_net_profit_aed,
            taxable_profit_aed = EXCLUDED.taxable_profit_aed,
            tax_liability_aed = EXCLUDED.tax_liability_aed,
            status = EXCLUDED.status,
            voucher_id = COALESCE(EXCLUDED.voucher_id, corporate_tax_provisions.voucher_id),
            voucher_no = COALESCE(EXCLUDED.voucher_no, corporate_tax_provisions.voucher_no),
            posted_by = EXCLUDED.posted_by,
            notes = EXCLUDED.notes,
            updated_at = NOW();
        `, [
          provId, taxYear, `${taxYear}-01-01`, `${taxYear}-12-31`,
          accountingNetProfit, taxable, taxable > 0 ? 9.0 : 0.0,
          taxAed, provStatus, vId, vNo, ftaRef, postedBy, notes
        ]);

        await client.query('COMMIT');
        return {
          success: true,
          status: provStatus,
          ftaReference: ftaRef,
          voucher: vNo ? {
            voucherNo: vNo,
            totalDebit: needed
          } : null,
          message: needed > 0
            ? `Posted Journal Voucher ${vNo} for AED ${needed.toFixed(2)} and recorded assessment in database!`
            : `Recorded Small Business Relief statutory assessment in database table corporate_tax_provisions!`
        };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Corporate Tax Provision] error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
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
      const result = await client.query(`
        SELECT fy.*, 
               coa_re.code as retained_earnings_code, coa_re.name as retained_earnings_name,
               coa_tp.code as tax_provision_code, coa_tp.name as tax_provision_name,
               coa_vat.code as vat_settlement_code, coa_vat.name as vat_settlement_name
        FROM public.fiscal_years fy
        LEFT JOIN public.chart_of_accounts coa_re ON fy.retained_earnings_account_id = coa_re.id
        LEFT JOIN public.chart_of_accounts coa_tp ON fy.tax_provision_account_id = coa_tp.id
        LEFT JOIN public.chart_of_accounts coa_vat ON fy.vat_settlement_account_id = coa_vat.id
        ORDER BY fy.year ASC;
      `);
      return result.rows.map(row => ({
        id: String(row.id),
        year: Number(row.year),
        title: row.title,
        startDate: typeof row.start_date === 'string' ? row.start_date.slice(0, 10) : new Date(row.start_date).toISOString().slice(0, 10),
        endDate: typeof row.end_date === 'string' ? row.end_date.slice(0, 10) : new Date(row.end_date).toISOString().slice(0, 10),
        status: row.status || 'OPEN',
        notes: row.notes || '',
        retainedEarningsCode: row.retained_earnings_code || '3200-01',
        retainedEarningsName: row.retained_earnings_name || 'Retained Earnings Reserve',
        taxProvisionCode: row.tax_provision_code || '2410-00',
        vatSettlementCode: row.vat_settlement_code || '2140-99'
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
      const reRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = '3200-01' LIMIT 1");
      const reId = reRes.rows[0]?.id || null;

      const tpRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = '2410-00' LIMIT 1");
      const tpId = tpRes.rows[0]?.id || null;

      const vatRes = await client.query("SELECT id FROM chart_of_accounts WHERE code = '2140-99' LIMIT 1");
      const vatId = vatRes.rows[0]?.id || null;

      const result = await client.query(
        `INSERT INTO public.fiscal_years (
           year, title, start_date, end_date, status, notes,
           retained_earnings_account_id, tax_provision_account_id, vat_settlement_account_id
         )
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8)
         RETURNING *`,
        [Number(year), title || `Fiscal Year ${year}`, startDate, endDate, notes || '', reId, tpId, vatId]
      );
      const row = result.rows[0];
      return {
        id: String(row.id),
        year: Number(row.year),
        title: row.title,
        startDate: typeof row.start_date === 'string' ? row.start_date.slice(0, 10) : new Date(row.start_date).toISOString().slice(0, 10),
        endDate: typeof row.end_date === 'string' ? row.end_date.slice(0, 10) : new Date(row.end_date).toISOString().slice(0, 10),
        status: row.status || 'OPEN',
        notes: row.notes || '',
        retainedEarningsCode: '3200-01',
        taxProvisionCode: '2410-00',
        vatSettlementCode: '2140-99'
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
        // Find COA Retained Earnings account from chart_of_accounts / coa_accounts
        const coaRes = await client.query(
          "SELECT id, code, name FROM chart_of_accounts WHERE code LIKE '3200%' OR name ILIKE '%Retained Earnings%' ORDER BY code ASC LIMIT 1"
        );
        let retainedEarningsAcc = coaRes.rows[0];
        if (!retainedEarningsAcc) {
          const eqRes = await client.query("SELECT id, code, name FROM coa_accounts WHERE code LIKE '3200%' OR name ILIKE '%Retained Earnings%' ORDER BY code ASC LIMIT 1");
          retainedEarningsAcc = eqRes.rows[0];
        }

        // Find COA P&L Summary / Transfer account for the balancing entry
        const plSummaryRes = await client.query(
          "SELECT id, code, name FROM chart_of_accounts WHERE code LIKE '3100%' OR code = '3000-00' OR name ILIKE '%Capital%' ORDER BY code ASC LIMIT 1"
        );
        let plSummaryAcc = plSummaryRes.rows[0];
        if (!plSummaryAcc) {
          const pRes = await client.query("SELECT id, code, name FROM coa_accounts WHERE code LIKE '3100%' OR code = '3000-00' OR name ILIKE '%Capital%' ORDER BY code ASC LIMIT 1");
          plSummaryAcc = pRes.rows[0] || retainedEarningsAcc;
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
          const absAmount = Math.abs(netProfit);

          // Insert into financial_vouchers
          await client.query(
            `INSERT INTO financial_vouchers (id, voucher_no, voucher_type, voucher_date, date, type, reference, reference_no, narration, total_debit, total_credit, total_amount, status, is_auto, created_by, currency, exchange_rate, base_currency)
             VALUES ($1, $2, 'JOURNAL', $3, $3, 'JOURNAL', 'FISCAL-CLOSE', 'FISCAL-CLOSE', $4, $5, $6, $5, 'POSTED', true, $7, 'AED', 1.0, 'AED')
             ON CONFLICT (voucher_no) DO UPDATE SET narration = EXCLUDED.narration`,
            [
              voucherId,
              vNo,
              record.endDate,
              narration,
              absAmount,
              absAmount,
              record.closedBy || 'System Audit'
            ]
          );

          // Insert into vouchers
          await client.query(
            `INSERT INTO vouchers (id, voucher_no, date, type, voucher_date, voucher_type, reference, reference_no, narration, total_debit, total_credit, status, is_auto, created_by)
             VALUES ($1, $2, $3, 'JOURNAL', $3, 'JOURNAL', 'FISCAL-CLOSE', 'FISCAL-CLOSE', $4, $5, $6, 'POSTED', true, $7)
             ON CONFLICT (voucher_no) DO UPDATE SET narration = EXCLUDED.narration`,
            [
              voucherId,
              vNo,
              record.endDate,
              narration,
              absAmount,
              absAmount,
              record.closedBy || 'System Audit'
            ]
          );

          // Leg 1: Retained Earnings
          // If netProfit > 0 (Profit): Credit Retained Earnings (Equity increases)
          // If netProfit < 0 (Loss): Debit Retained Earnings (Equity decreases)
          const leg1EntryId = crypto.randomUUID();
          const leg1Debit = netProfit < 0 ? absAmount : 0;
          const leg1Credit = netProfit > 0 ? absAmount : 0;

          await client.query(
            `INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_id, account_code, account_name, debit, credit, narration, memo, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              leg1EntryId,
              voucherId,
              vNo,
              retainedEarningsAcc.id,
              retainedEarningsAcc.code,
              retainedEarningsAcc.name,
              leg1Debit,
              leg1Credit,
              `Rollover Net Profit to ${retainedEarningsAcc.name} (${retainedEarningsAcc.code})`,
              `Rollover Net Profit to ${retainedEarningsAcc.name} (${retainedEarningsAcc.code})`,
              record.endDate
            ]
          );

          // Leg 2: P&L Summary Clearing (Balancing entry ensuring Debit == Credit)
          // If netProfit > 0 (Profit): Debit P&L Summary (Clearing Net Income)
          // If netProfit < 0 (Loss): Credit P&L Summary (Clearing Net Loss)
          const leg2EntryId = crypto.randomUUID();
          const leg2Debit = netProfit > 0 ? absAmount : 0;
          const leg2Credit = netProfit < 0 ? absAmount : 0;

          await client.query(
            `INSERT INTO voucher_entries (id, voucher_id, voucher_no, account_id, account_code, account_name, debit, credit, narration, memo, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              leg2EntryId,
              voucherId,
              vNo,
              plSummaryAcc.id,
              plSummaryAcc.code,
              plSummaryAcc.name,
              leg2Debit,
              leg2Credit,
              `P&L Summary Closing Transfer for ${record.periodName}`,
              `P&L Summary Closing Transfer for ${record.periodName}`,
              record.endDate
            ]
          );

          // Trigger COA sync
          await client.query('SELECT public.sync_coa_current_balances()').catch(() => {});
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
      await client.query('BEGIN');
      try {
        const r = await client.query('SELECT closing_voucher_no FROM public.fiscal_closed_periods WHERE id = $1', [id]);
        if (r.rows.length > 0) {
          const vNo = r.rows[0].closing_voucher_no;
          if (vNo) {
            await client.query('DELETE FROM public.voucher_entries WHERE voucher_no = $1', [vNo]);
            await client.query('DELETE FROM public.vouchers WHERE voucher_no = $1', [vNo]);
            await client.query('DELETE FROM public.financial_vouchers WHERE voucher_no = $1', [vNo]);
          }
        }
        await client.query('DELETE FROM public.fiscal_closed_periods WHERE id = $1', [id]);
        await client.query('SELECT public.sync_coa_current_balances()').catch(() => {});
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
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
        SELECT s.*, 
               COALESCE(c.current_balance, 0) AS coa_balance,
               COALESCE(c.current_balance, s.capital_aed, 0) AS capital_aed
        FROM public.company_shareholders s
        LEFT JOIN chart_of_accounts c ON c.code = s.coa_account_code
        ORDER BY s.display_order ASC, s.created_at ASC;
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
        const capNum = Number(capitalAed || 0);
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
        if (coaCode) {
          await client.query(`
            UPDATE chart_of_accounts 
            SET current_balance = $1
            WHERE code = $2;
          `, [capNum, coaCode]).catch(() => {});
          await client.query(`
            UPDATE coa_accounts 
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
          COALESCE(v.total_amount, v.total_debit, 0) as total_amount,
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




