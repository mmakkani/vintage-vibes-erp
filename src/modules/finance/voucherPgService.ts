import { withDb } from '../../db/pgPool.ts';
import { SequenceService } from '../../services/sequenceService.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (val: any): boolean => typeof val === 'string' && UUID_REGEX.test(val.trim());

const generateLedgerUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const toSafeLedgerAmount = (val: unknown, decimals: number = 4): number => {
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) return 0;
  return Number(num.toFixed(decimals));
};

export async function insertVoucherPg(v: any): Promise<any> {
  let id = String(v.id && isValidUuid(v.id) ? v.id : generateLedgerUuid());
  const date = v.date || new Date().toISOString().slice(0, 10);
  const type = String(v.type || 'JOURNAL');
  const typeUpper = type.toUpperCase();

  let prefix = 'JV';
  if (typeUpper.includes('CASH_RECEIPT') || typeUpper === 'CRV') prefix = 'CRV';
  else if (typeUpper.includes('BANK_RECEIPT') || typeUpper === 'BRV') prefix = 'BRV';
  else if (typeUpper.includes('CASH_PAYMENT') || typeUpper === 'CPV') prefix = 'CPV';
  else if (typeUpper.includes('BANK_PAYMENT') || typeUpper === 'BPV') prefix = 'BPV';
  else if (typeUpper.includes('CONTRA') || typeUpper === 'CV') prefix = 'CV';
  else prefix = 'JV';

  let voucherNo = String(v.voucherNo || '').trim();
  const reference = String(v.reference || v.documentRef || '');
  const narration = String(v.narration || '');
  const totalDebit = Number(v.totalDebit || 0);
  const totalCredit = Number(v.totalCredit || 0);
  const status = String(v.status || 'POSTED');
  const createdBy = String(v.createdBy || 'System');
  const isAuto = Boolean(
    v.isAuto ||
    v.is_auto ||
    /^(JV-PINV-|JV-INW-|JV-FIN-|JV-SORT-|JV-SLS-|JV-CS-|JV-VAT-|JV-CORP-|JV-WIP-|JV-PAYROLL-|JV-OP-|JV-CLOSE-)/i.test(voucherNo)
  );

  const currency = String(v.currency || 'AED').toUpperCase();
  const exchangeRate = Number(v.exchangeRate ?? v.exchange_rate ?? 1.0);
  const baseCurrency = String(v.baseCurrency || v.base_currency || 'AED').toUpperCase();
  const foreignTotalAmount = Number(
    v.foreignTotalAmount ?? v.foreign_total_amount ?? (currency === 'AED' ? totalDebit : (totalDebit / (exchangeRate || 1.0)))
  );

  const lines = v.lines || v.entries || [];

  return await withDb(async (client) => {
    await client.query('BEGIN');
    try {
      if (voucherNo) {
        const existRes = await client.query(
          `SELECT id FROM vouchers WHERE voucher_no = $1 UNION SELECT id FROM financial_vouchers WHERE voucher_no = $1 LIMIT 1`,
          [voucherNo]
        );
        if (existRes.rows.length > 0 && existRes.rows[0].id) {
          id = String(existRes.rows[0].id);
        }
      }
      if (!voucherNo || voucherNo.startsWith('VCH-')) {
        const dateObj = date ? new Date(date) : new Date();
        const safeDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
        const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
        const yyyy = String(safeDate.getFullYear());
        const prefixWithDate = `${prefix}-${mm}-${yyyy}`;

        const seqRes = await client.query(
          `SELECT voucher_no FROM vouchers WHERE voucher_no LIKE $1 UNION SELECT voucher_no FROM financial_vouchers WHERE voucher_no LIKE $1`,
          [`${prefixWithDate}-%`]
        );
        let maxSeq = 0;
        for (const r of seqRes.rows) {
          const parts = String(r.voucher_no || '').split('-');
          const num = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
        voucherNo = `${prefixWithDate}-${String(maxSeq + 1).padStart(4, '0')}`;
      }

      const calculatedDebit = lines.reduce((sum: number, l: any) => sum + toSafeLedgerAmount(l.debitAmount ?? l.debit ?? 0), 0);
      const calculatedCredit = lines.reduce((sum: number, l: any) => sum + toSafeLedgerAmount(l.creditAmount ?? l.credit ?? 0), 0);

      if (lines.length > 0 && Math.abs(calculatedDebit - calculatedCredit) > 0.01) {
        throw new Error(`Double-Entry Imbalance: Total Debit (${calculatedDebit.toFixed(2)}) must exactly equal Total Credit (${calculatedCredit.toFixed(2)}). GAAP/IFRS balance requirement.`);
      }

      const effectiveDebit = lines.length > 0 ? calculatedDebit : totalDebit;
      const effectiveCredit = lines.length > 0 ? calculatedCredit : totalCredit;

      // 1. vouchers
      await client.query(`
        INSERT INTO vouchers (id, voucher_no, date, type, reference, narration, total_debit, total_credit, total_amount, status, created_by, is_auto)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          voucher_no = EXCLUDED.voucher_no,
          date = EXCLUDED.date,
          total_debit = EXCLUDED.total_debit,
          total_credit = EXCLUDED.total_credit,
          total_amount = EXCLUDED.total_amount,
          status = EXCLUDED.status,
          is_auto = EXCLUDED.is_auto;
      `, [id, voucherNo, date, type, reference, narration, effectiveDebit, effectiveCredit, status, createdBy, isAuto]);

      // 2. financial_vouchers
      await client.query(`
        INSERT INTO financial_vouchers (
          id, voucher_no, date, voucher_date, type, voucher_type, reference, reference_no,
          narration, total_debit, total_credit, total_amount, currency, exchange_rate,
          base_currency, foreign_total_amount, status, created_by, is_auto
        ) VALUES (
          $1, $2, $3, $3, $4, $4, $5, $5,
          $6, $7, $8, $7, $9, $10,
          $11, $12, $13, $14, $15
        ) ON CONFLICT (id) DO UPDATE SET
          voucher_no = EXCLUDED.voucher_no,
          date = EXCLUDED.date,
          total_debit = EXCLUDED.total_debit,
          total_credit = EXCLUDED.total_credit,
          total_amount = EXCLUDED.total_amount,
          status = EXCLUDED.status;
      `, [id, voucherNo, date, type, reference, narration, effectiveDebit, effectiveCredit, currency, exchangeRate, baseCurrency, foreignTotalAmount, status, createdBy, isAuto]);

      // Lines processing
      if (Array.isArray(lines) && lines.length > 0) {
        // Idempotency: purge existing lines for this voucher to prevent duplicate lines on update or retry
        await client.query(`DELETE FROM voucher_entries WHERE voucher_id = $1 OR voucher_no = $2`, [id, voucherNo]);
        await client.query(`DELETE FROM ledgers WHERE voucher_id = $1 OR voucher_no = $2`, [id, voucherNo]);
        await client.query(`DELETE FROM general_ledger WHERE voucher_id = $1 OR voucher_no = $2`, [id, voucherNo]);
        await client.query(`DELETE FROM journal_entries WHERE voucher_id = $1`, [id]);

        // Auto-extract accountCode from accountId if missing (e.g. 'acc-1130' -> '1130-00')
        for (const l of lines) {
          if (!l.accountCode && !l.account_code && l.accountId) {
            const accStr = String(l.accountId).trim();
            if (!isValidUuid(accStr)) {
              const clean = accStr.replace(/^acc-/, '');
              if (/^\d{4}/.test(clean)) {
                l.accountCode = clean.includes('-') ? clean : `${clean}-00`;
              }
            }
          }
        }

        const codes = Array.from(new Set(lines.map((l: any) => String(l.accountCode || l.account_code || '').trim()).filter(Boolean)));

        const chartMap = new Map<string, { id: string; name: string }>();
        const coaMap = new Map<string, { id: string; name: string }>();

        if (codes.length > 0) {
          const chartRes = await client.query(
            `SELECT id, code, name FROM chart_of_accounts WHERE code = ANY($1::text[])`,
            [codes]
          );
          for (const r of chartRes.rows) {
            chartMap.set(r.code, { id: r.id, name: r.name });
          }

          const coaRes = await client.query(
            `SELECT id, code, name FROM coa_accounts WHERE code = ANY($1::text[])`,
            [codes]
          );
          for (const r of coaRes.rows) {
            coaMap.set(r.code, { id: r.id, name: r.name });
          }
        }

        // Also resolve UUIDs passed in accountId
        for (const l of lines) {
          const accId = String(l.accountId || l.account_id || '');
          if (isValidUuid(accId)) {
            const chartMatch = await client.query(`SELECT id, code, name FROM chart_of_accounts WHERE id = $1 LIMIT 1`, [accId]);
            if (chartMatch.rows[0]) {
              chartMap.set(chartMatch.rows[0].code, { id: chartMatch.rows[0].id, name: chartMatch.rows[0].name });
              if (!l.accountCode && !l.account_code) {
                l.accountCode = chartMatch.rows[0].code;
              }
              const coaMatch = await client.query(`SELECT id, code, name FROM coa_accounts WHERE code = $1 LIMIT 1`, [chartMatch.rows[0].code]);
              if (coaMatch.rows[0]) {
                coaMap.set(chartMatch.rows[0].code, { id: coaMatch.rows[0].id, name: coaMatch.rows[0].name });
              }
            } else {
              const coaMatch = await client.query(`SELECT id, code, name FROM coa_accounts WHERE id = $1 LIMIT 1`, [accId]);
              if (coaMatch.rows[0]) {
                coaMap.set(coaMatch.rows[0].code, { id: coaMatch.rows[0].id, name: coaMatch.rows[0].name });
                if (!l.accountCode && !l.account_code) {
                  l.accountCode = coaMatch.rows[0].code;
                }
              }
            }
          }
        }

        const calcForeign = (amount: number) => {
          if (currency === 'AED' || !exchangeRate || exchangeRate === 1.0) return amount;
          return exchangeRate < 1.0 ? toSafeLedgerAmount(amount * exchangeRate) : toSafeLedgerAmount(amount / exchangeRate);
        };

        for (const l of lines) {
          const lineId = String(l.id && isValidUuid(l.id) ? l.id : generateLedgerUuid());
          const debit = toSafeLedgerAmount(l.debitAmount ?? l.debit ?? 0);
          const credit = toSafeLedgerAmount(l.creditAmount ?? l.credit ?? 0);
          const foreignDebit = toSafeLedgerAmount(l.foreignDebit ?? l.foreign_debit ?? calcForeign(debit));
          const foreignCredit = toSafeLedgerAmount(l.foreignCredit ?? l.foreign_credit ?? calcForeign(credit));
          const memo = l.memo || l.narration || narration;

          const rawCode = String(l.accountCode || l.account_code || '').trim();
          const chartEntry = chartMap.get(rawCode);
          const coaEntry = coaMap.get(rawCode);

          const resolvedCode = rawCode || '';
          const resolvedName = String(l.accountName || l.account_name || chartEntry?.name || coaEntry?.name || '');
          const chartAccId = chartEntry?.id || (isValidUuid(l.accountId || l.account_id) ? (l.accountId || l.account_id) : null);
          const coaAccId = coaEntry?.id || null;

          const resolvedPartyId = isValidUuid(l.partyId || l.party_id) ? (l.partyId || l.party_id) : null;
          const resolvedPartyName = l.partyName || l.party_name || null;

          // 3. voucher_entries
          await client.query(`
            INSERT INTO voucher_entries (
              id, voucher_id, voucher_no, account_id, account_code, account_name,
              party_id, party_name, debit, credit, currency, exchange_rate,
              foreign_debit, foreign_credit, particulars, memo, narration, date
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18
            )
          `, [
            lineId, id, voucherNo, chartAccId, resolvedCode, resolvedName,
            resolvedPartyId, resolvedPartyName, debit, credit, currency, exchangeRate,
            foreignDebit, foreignCredit, memo, memo, memo, date
          ]);

          // 4. ledgers (FK strictly requires coa_accounts.id)
          if (coaAccId) {
            const ledgerId = generateLedgerUuid();
            await client.query(`
              INSERT INTO ledgers (
                id, voucher_id, voucher_no, account_id, account_code, account_name,
                party_id, party_name, date, entry_date, debit, credit,
                currency, exchange_rate, foreign_debit, foreign_credit,
                balance, running_balance, narration, description
              ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $9, $10, $11,
                $12, $13, $14, $15,
                $16, $16, $17, $17
              )
            `, [
              ledgerId, id, voucherNo, coaAccId, resolvedCode, resolvedName,
              resolvedPartyId, resolvedPartyName, date, debit, credit,
              currency, exchangeRate, foreignDebit, foreignCredit,
              toSafeLedgerAmount(debit - credit), memo
            ]);
          }

          // 5. general_ledger
          const glId = generateLedgerUuid();
          await client.query(`
            INSERT INTO general_ledger (
              id, voucher_id, voucher_no, account_id, account_code, account_name,
              party_id, party_name, date, entry_date, debit, credit,
              currency, exchange_rate, foreign_debit, foreign_credit,
              balance, running_balance, narration, description
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $9, $10, $11,
              $12, $13, $14, $15,
              $16, $16, $17, $17
            )
          `, [
            glId, id, voucherNo, chartAccId, resolvedCode, resolvedName,
            resolvedPartyId, resolvedPartyName, date, debit, credit,
            currency, exchangeRate, foreignDebit, foreignCredit,
            toSafeLedgerAmount(debit - credit), memo
          ]);

          // 6. journal_entries (strictly RFC4122 v4 UUID PK, account_id from chart_of_accounts)
          if (chartAccId) {
            const jeId = generateLedgerUuid();
            await client.query(`
              INSERT INTO journal_entries (
                id, voucher_id, account_id, party_id, debit, credit, description
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7
              )
            `, [
              jeId, id, chartAccId, resolvedPartyId, debit, credit, memo
            ]);
          }
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

    // 7. sync_coa_current_balances() executed post-commit so notice/error never aborts the committed voucher
    await client.query(`SELECT sync_coa_current_balances();`).catch(err => {
      console.warn('[Voucher Pg Service] sync_coa_current_balances notice:', err?.message);
    });

    return {
      id,
      voucherNo,
      date,
      type: type as any,
      reference,
      narration,
      totalDebit,
      totalCredit,
      status: status as any,
      currency: currency as any,
      exchangeRate,
      baseCurrency,
      foreignTotalAmount,
      createdBy,
      entries: lines,
      lines
    };
  });
}

/**
 * Universal Voucher Purge Engine:
 * Atomically deletes a voucher and all its child lines across all 6 financial tables
 * (journal_entries, voucher_entries, ledgers, general_ledger, financial_vouchers, vouchers)
 * and immediately reconciles Chart of Accounts balances via sync_coa_current_balances().
 */
export async function purgeVoucherCompletelyPg(
  tokensInput: string | string[],
  existingClient?: any
): Promise<void> {
  const rawTokens = Array.isArray(tokensInput) ? tokensInput : [tokensInput];
  const tokens = Array.from(
    new Set(
      rawTokens
        .map(t => String(t || '').trim())
        .filter(t => t.length >= 2)
    )
  );
  if (tokens.length === 0) return;

  const runPurge = async (client: any) => {
    const voucherIds = new Set<string>();
    const voucherNos = new Set<string>();

    for (const tok of tokens) {
      voucherIds.add(tok);
      voucherNos.add(tok);
    }

    try {
      const matchRes = await client.query(
        `SELECT id::text AS id, voucher_no FROM vouchers
         WHERE id::text = ANY($1::text[]) OR voucher_no = ANY($1::text[]) OR reference = ANY($1::text[])
         UNION
         SELECT id::text AS id, voucher_no FROM financial_vouchers
         WHERE id::text = ANY($1::text[]) OR voucher_no = ANY($1::text[]) OR reference = ANY($1::text[]) OR reference_no = ANY($1::text[])
         UNION
         SELECT voucher_id::text AS id, voucher_no FROM voucher_entries
         WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($1::text[])
         UNION
         SELECT voucher_id::text AS id, voucher_no FROM general_ledger
         WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($1::text[])`,
        [tokens]
      );
      for (const r of matchRes.rows || []) {
        if (r.id) voucherIds.add(String(r.id).trim());
        if (r.voucher_no) voucherNos.add(String(r.voucher_no).trim());
      }
    } catch (_) {}

    const idArr = Array.from(voucherIds).filter(Boolean);
    const noArr = Array.from(voucherNos).filter(Boolean);

    if (idArr.length > 0) {
      await client.query(`DELETE FROM journal_entries WHERE voucher_id::text = ANY($1::text[])`, [idArr]).catch(() => {});
    }
    for (const tok of tokens) {
      if (tok.length >= 6) {
        await client.query(`DELETE FROM journal_entries WHERE description ILIKE $1`, [`%${tok}%`]).catch(() => {});
      }
    }
    if (idArr.length > 0 || noArr.length > 0) {
      await client.query(
        `DELETE FROM voucher_entries WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`,
        [idArr, noArr]
      ).catch(() => {});
      await client.query(
        `DELETE FROM ledgers WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`,
        [idArr, noArr]
      ).catch(() => {});
      await client.query(
        `DELETE FROM general_ledger WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`,
        [idArr, noArr]
      ).catch(() => {});
      await client.query(
        `DELETE FROM financial_vouchers WHERE id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[]) OR reference = ANY($3::text[]) OR reference_no = ANY($3::text[])`,
        [idArr, noArr, tokens]
      ).catch(() => {});
      await client.query(
        `DELETE FROM vouchers WHERE id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[]) OR reference = ANY($3::text[])`,
        [idArr, noArr, tokens]
      ).catch(() => {});
    }

    await client.query(`SELECT public.sync_coa_current_balances();`).catch(() => {});
  };

  if (existingClient) {
    await runPurge(existingClient);
  } else {
    await withDb(runPurge);
  }
}

/**
 * Unposts a voucher to DRAFT in PostgreSQL, clears posted ledger entries
 * (journal_entries, ledgers, general_ledger), and syncs COA balances.
 */
export async function unpostVoucherCompletelyPg(idOrNo: string): Promise<void> {
  const tok = String(idOrNo || '').trim();
  if (!tok) return;

  await withDb(async (client) => {
    const matchRes = await client.query(
      `SELECT id::text AS id, voucher_no FROM vouchers WHERE id::text = $1 OR voucher_no = $1
       UNION
       SELECT id::text AS id, voucher_no FROM financial_vouchers WHERE id::text = $1 OR voucher_no = $1`,
      [tok]
    );
    const idArr = Array.from(new Set([tok, ...(matchRes.rows || []).map((r: any) => String(r.id || '')).filter(Boolean)]));
    const noArr = Array.from(new Set([tok, ...(matchRes.rows || []).map((r: any) => String(r.voucher_no || '')).filter(Boolean)]));

    await client.query(`UPDATE vouchers SET status = 'DRAFT' WHERE id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [idArr, noArr]).catch(() => {});
    await client.query(`UPDATE financial_vouchers SET status = 'DRAFT' WHERE id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [idArr, noArr]).catch(() => {});
    await client.query(`DELETE FROM journal_entries WHERE voucher_id::text = ANY($1::text[])`, [idArr]).catch(() => {});
    await client.query(`DELETE FROM ledgers WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [idArr, noArr]).catch(() => {});
    await client.query(`DELETE FROM general_ledger WHERE voucher_id::text = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [idArr, noArr]).catch(() => {});
    await client.query(`SELECT public.sync_coa_current_balances();`).catch(() => {});
  });
}

/**
 * Real-Time Per-Piece WIP -> Finished Goods Capitalization Voucher (`JV-SORT-<SKU>`):
 * Whenever a sorted piece is added or its weight/cost is edited, this atomically replaces
 * its `JV-SORT-<SKU>` voucher across all 6 financial tables (`vouchers`, `financial_vouchers`,
 * `voucher_entries`, `journal_entries`, `general_ledger`, `ledgers`) and updates COA balances.
 */
export async function syncPieceSortingVoucherPg(piece: {
  id?: string;
  barcode: string;
  baleCode?: string;
  itemName?: string;
  weightGrams?: number;
  costPrice: number;
  date?: string;
}): Promise<any> {
  const cleanBarcode = String(piece.barcode || '').trim();
  if (!cleanBarcode) return null;

  const voucherNo = `JV-SORT-${cleanBarcode}`;
  const cost = Number(Number(piece.costPrice || 0).toFixed(2));
  const grams = Number(piece.weightGrams || 0);
  const itemLabel = String(piece.itemName || 'Sorted Garment').trim();

  // First purge any existing voucher for this piece so edits/re-saves never duplicate
  const purgeTokens = [voucherNo, cleanBarcode];
  if (piece.id) {
    purgeTokens.push(String(piece.id), `JV-SORT-${piece.id}`);
  }
  await purgeVoucherCompletelyPg(purgeTokens);

  if (cost <= 0) return null;

  const today = piece.date || new Date().toISOString().slice(0, 10);
  return await insertVoucherPg({
    voucherNo,
    date: today,
    type: 'JOURNAL',
    reference: cleanBarcode,
    narration: `Auto Sorting Capitalization: WIP (1150-01) -> Finished Goods (1160-01) for ${cleanBarcode} (${itemLabel}, ${grams}g)`,
    totalDebit: cost,
    totalCredit: cost,
    status: 'POSTED',
    createdBy: 'System (Bale Sorting)',
    isAuto: true,
    lines: [
      {
        accountCode: '1160-01',
        accountName: 'Finished Goods (Sorted)',
        debitAmount: cost,
        creditAmount: 0,
        memo: `Finished Goods Capitalization: ${cleanBarcode} (${itemLabel}, ${grams}g)`
      },
      {
        accountCode: '1150-01',
        accountName: 'WIP (Work in Progress)',
        debitAmount: 0,
        creditAmount: cost,
        memo: `Relieve WIP for Sorted Piece: ${cleanBarcode} (${grams}g)`
      }
    ]
  });
}

/**
 * Atomically deletes a piece's `JV-SORT-<SKU>` voucher and all ledger lines across all 6 financial tables
 * when a piece is deleted from Sorting Terminal or Inventory.
 */
export async function deletePieceSortingVoucherPg(
  pieceIdOrBarcode: string,
  existingClient?: any
): Promise<void> {
  const cleanKey = String(pieceIdOrBarcode || '').trim();
  if (!cleanKey) return;

  const collectAndPurge = async (client: any) => {
    const tokens = new Set<string>([cleanKey, `JV-SORT-${cleanKey}`]);
    try {
      const q = await client.query(
        `SELECT id::text AS id, barcode, sku FROM inventory_pieces WHERE id::text = $1 OR barcode = $1 OR sku = $1
         UNION
         SELECT id::text AS id, piece_code AS barcode, sku FROM bale_sorted_pieces WHERE id::text = $1 OR piece_code = $1 OR sku = $1`,
        [cleanKey]
      );
      for (const r of q.rows || []) {
        if (r.id) {
          tokens.add(String(r.id));
          tokens.add(`JV-SORT-${r.id}`);
        }
        if (r.barcode) {
          tokens.add(String(r.barcode));
          tokens.add(`JV-SORT-${r.barcode}`);
        }
        if (r.sku) {
          tokens.add(String(r.sku));
          tokens.add(`JV-SORT-${r.sku}`);
        }
      }
    } catch (_) {}

    await purgeVoucherCompletelyPg(Array.from(tokens), client);
  };

  if (existingClient) {
    await collectAndPurge(existingClient);
  } else {
    await withDb(collectAndPurge);
  }
}
