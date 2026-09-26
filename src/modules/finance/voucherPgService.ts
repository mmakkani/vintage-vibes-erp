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
  const id = String(v.id && isValidUuid(v.id) ? v.id : generateLedgerUuid());
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
  if (!voucherNo || voucherNo.startsWith('VCH-')) {
    voucherNo = await SequenceService.getNextNumber(prefix, date);
  }
  const reference = String(v.reference || v.documentRef || '');
  const narration = String(v.narration || '');
  const totalDebit = Number(v.totalDebit || 0);
  const totalCredit = Number(v.totalCredit || 0);
  const status = String(v.status || 'POSTED');
  const createdBy = String(v.createdBy || 'System');
  const isAuto = Boolean(v.isAuto || v.is_auto);

  const currency = String(v.currency || 'AED').toUpperCase();
  const exchangeRate = Number(v.exchangeRate ?? v.exchange_rate ?? 1.0);
  const baseCurrency = String(v.baseCurrency || v.base_currency || 'AED').toUpperCase();
  const foreignTotalAmount = Number(
    v.foreignTotalAmount ?? v.foreign_total_amount ?? (currency === 'AED' ? totalDebit : (totalDebit / (exchangeRate || 1.0)))
  );

  return await withDb(async (client) => {
    await client.query('BEGIN');
    try {
      // 1. vouchers
      await client.query(`
        INSERT INTO vouchers (id, voucher_no, date, type, reference, narration, total_debit, total_credit, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          voucher_no = EXCLUDED.voucher_no,
          date = EXCLUDED.date,
          total_debit = EXCLUDED.total_debit,
          total_credit = EXCLUDED.total_credit,
          status = EXCLUDED.status;
      `, [id, voucherNo, date, type, reference, narration, totalDebit, totalCredit, status, createdBy]);

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
      `, [id, voucherNo, date, type, reference, narration, totalDebit, totalCredit, currency, exchangeRate, baseCurrency, foreignTotalAmount, status, createdBy, isAuto]);

      // Lines processing
      const lines = v.lines || v.entries || [];
      if (Array.isArray(lines) && lines.length > 0) {
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
              const coaMatch = await client.query(`SELECT id, code, name FROM coa_accounts WHERE code = $1 LIMIT 1`, [chartMatch.rows[0].code]);
              if (coaMatch.rows[0]) {
                coaMap.set(chartMatch.rows[0].code, { id: coaMatch.rows[0].id, name: coaMatch.rows[0].name });
              }
            }
          }
        }

        for (const l of lines) {
          const lineId = String(l.id && isValidUuid(l.id) ? l.id : generateLedgerUuid());
          const debit = toSafeLedgerAmount(l.debitAmount ?? l.debit ?? 0);
          const credit = toSafeLedgerAmount(l.creditAmount ?? l.credit ?? 0);
          const foreignDebit = toSafeLedgerAmount(l.foreignDebit ?? l.foreign_debit ?? (currency === 'AED' ? debit : (debit / (exchangeRate || 1.0))));
          const foreignCredit = toSafeLedgerAmount(l.foreignCredit ?? l.foreign_credit ?? (currency === 'AED' ? credit : (credit / (exchangeRate || 1.0))));
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

      // 7. sync_coa_current_balances()
      await client.query(`SELECT sync_coa_current_balances();`).catch(err => {
        console.warn('[Voucher Pg Service] sync_coa_current_balances notice:', err?.message);
      });

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

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
