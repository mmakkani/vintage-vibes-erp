import { withDb } from '../../db/pgPool.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (val: any): boolean => typeof val === 'string' && UUID_REGEX.test(val.trim());

export interface PurchaseMutationResult {
  success: boolean;
  message: string;
  idempotent?: boolean;
  invoiceNo?: string;
  id?: string;
}

/**
 * Atomically unposts a commercial purchase invoice back to DRAFT:
 * 1. Checks that no Inward Gate Passes / Sorting Bales exist.
 * 2. Cascades deletion of all associated financial vouchers, journal entries, voucher entries,
 *    general ledger lines, ledgers, and party khata logs in a single DB transaction.
 * 3. Sets invoice status to 'DRAFT' and converted_to_inward to false.
 * 4. Recalculates supplier balance and triggers sync_coa_current_balances().
 */
export async function atomicUnpostPurchaseInvoice(rawInvoiceId: string): Promise<PurchaseMutationResult> {
  const cleanId = String(rawInvoiceId || '').trim();
  if (!cleanId) {
    throw new Error('Invoice ID is required for unposting');
  }

  return await withDb(async (client) => {
    await client.query('BEGIN');
    try {
      // 1. Fetch invoice row safely without invalid UUID casting
      const invRes = await client.query(
        `SELECT id, invoice_no, status, converted_to_inward, supplier_id, supplier_name, total_amount, currency, exchange_rate 
         FROM purchase_invoices 
         WHERE id = $1 OR invoice_no = $1 
         LIMIT 1`,
        [cleanId]
      );

      if (invRes.rows.length === 0) {
        await client.query('COMMIT');
        return {
          success: true,
          message: `Invoice "${cleanId}" not found or already deleted; idempotent success.`,
          idempotent: true,
          id: cleanId
        };
      }

      const invRow = invRes.rows[0];
      const invId = String(invRow.id || cleanId);
      const invoiceNo = String(invRow.invoice_no || invId);

      // Rule B: Cannot unpost if Inward Pass or Sorting Bale exists
      const passRes = await client.query(
        `SELECT id, gate_pass_no FROM inward_gate_passes WHERE purchase_invoice_id = $1 OR purchase_invoice_no = $2 LIMIT 10`,
        [invId, invoiceNo]
      );
      if (passRes.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error(
          `Cannot unpost invoice "${invoiceNo}" because ${passRes.rows.length} Inward Pass(es) / Sorting Bale(s) have already been generated for it. You must delete the Sorting Bales first.`
        );
      }

      // If status is not POSTED, it is already DRAFT or unposted - return idempotent 200 OK
      if (invRow.status !== 'POSTED') {
        if (invRow.converted_to_inward) {
          await client.query(`UPDATE purchase_invoices SET converted_to_inward = false WHERE id = $1`, [invId]);
        }
        await client.query('COMMIT');
        return {
          success: true,
          message: `Invoice "${invoiceNo}" is already ${invRow.status || 'DRAFT'}.`,
          idempotent: true,
          invoiceNo,
          id: invId
        };
      }

      // 2. Identify tokens and patterns for voucher discovery
      const tokens = Array.from(
        new Set(
          [cleanId, invId, invoiceNo, `PINV-${invoiceNo}`, `PUR-${invoiceNo}`, `INWARD-${invoiceNo}`].filter(Boolean)
        )
      );
      const likePatterns = [`%${invoiceNo}%`, `%${cleanId}%`];

      // 3. Find matching vouchers from financial_vouchers and vouchers
      const fvRes = await client.query(
        `SELECT id, voucher_no, party_id FROM financial_vouchers 
         WHERE reference = ANY($1::text[]) 
            OR reference_no = ANY($1::text[]) 
            OR voucher_no ILIKE ANY($2::text[]) 
            OR narration ILIKE ANY($2::text[])`,
        [tokens, likePatterns]
      );

      const vRes = await client.query(
        `SELECT id, voucher_no FROM vouchers 
         WHERE reference = ANY($1::text[]) 
            OR reference_no = ANY($1::text[]) 
            OR voucher_no ILIKE ANY($2::text[]) 
            OR narration ILIKE ANY($2::text[])`,
        [tokens, likePatterns]
      );

      const allVoucherRows = [...fvRes.rows, ...vRes.rows];
      const voucherIds = Array.from(new Set(allVoucherRows.map((r: any) => String(r.id)).filter(Boolean)));
      const voucherNos = Array.from(new Set(allVoucherRows.map((r: any) => String(r.voucher_no)).filter(Boolean)));

      const affectedPartyIds = new Set<string>();
      if (invRow.supplier_id) affectedPartyIds.add(String(invRow.supplier_id));
      fvRes.rows.forEach((r: any) => {
        if (r.party_id) affectedPartyIds.add(String(r.party_id));
      });

      // 4. Cascade purge of linked financial ledger records in correct dependency order
      if (voucherIds.length > 0 || voucherNos.length > 0) {
        // journal_entries
        await client.query(
          `DELETE FROM journal_entries 
           WHERE voucher_id = ANY($1::text[]) 
              OR description ILIKE ANY($2::text[])`,
          [voucherIds, likePatterns]
        );

        // voucher_entries
        await client.query(
          `DELETE FROM voucher_entries 
           WHERE voucher_id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // general_ledger
        await client.query(
          `DELETE FROM general_ledger 
           WHERE voucher_id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // ledgers
        await client.query(
          `DELETE FROM ledgers 
           WHERE voucher_id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // financial_vouchers
        await client.query(
          `DELETE FROM financial_vouchers 
           WHERE id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // vouchers
        await client.query(
          `DELETE FROM vouchers 
           WHERE id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );
      }

      // 5. Purge party_khata_logs for this invoice
      await client.query(
        `DELETE FROM party_khata_logs 
         WHERE reference = ANY($1::text[]) 
            OR notes ILIKE ANY($2::text[])`,
        [tokens, likePatterns]
      );

      // 6. Reset purchase invoice to DRAFT
      await client.query(
        `UPDATE purchase_invoices 
         SET status = 'DRAFT', converted_to_inward = false 
         WHERE id = $1`,
        [invId]
      );

      // 7. Recalculate supplier balance
      for (const pId of affectedPartyIds) {
        if (!pId) continue;
        await client.query(
          `UPDATE parties
           SET current_balance = COALESCE(opening_balance, 0) + COALESCE((
             SELECT SUM(CASE 
               WHEN UPPER(COALESCE(parties.type, parties.party_type, '')) LIKE '%SUPPLIER%' OR UPPER(COALESCE(parties.type, parties.party_type, '')) LIKE '%VENDOR%'
               THEN (credit - debit)
               ELSE (debit - credit)
             END)
             FROM party_khata_logs
             WHERE party_id = parties.id
           ), 0)
           WHERE id = $1`,
          [pId]
        );
      }

      // 8. Reconcile Chart of Accounts in SQL
      try {
        await client.query('SELECT sync_coa_current_balances()');
      } catch (coaErr) {
        console.warn('[Purchase] Notice running sync_coa_current_balances:', coaErr);
      }

      await client.query('COMMIT');
      return {
        success: true,
        message: `Purchase invoice "${invoiceNo}" unposted to DRAFT and financial vouchers purged successfully.`,
        invoiceNo,
        id: invId
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}

/**
 * Atomically deletes a commercial purchase invoice and all related records:
 * 1. Checks that no Inward Gate Passes / Sorting Bales exist.
 * 2. Cascades deletion of all associated financial vouchers, journal entries, voucher entries,
 *    general ledger lines, ledgers, party khata logs, and purchase_invoice_items in a single DB transaction.
 * 3. Deletes parent record from purchase_invoices.
 * 4. Recalculates supplier balance and triggers sync_coa_current_balances().
 */
export async function atomicDeletePurchaseInvoice(
  rawInvoiceId: string,
  explicitInvoiceNo?: string
): Promise<PurchaseMutationResult> {
  const cleanId = String(rawInvoiceId || '').trim();
  if (!cleanId) {
    throw new Error('Invoice ID is required for deletion');
  }

  return await withDb(async (client) => {
    await client.query('BEGIN');
    try {
      // 1. Fetch invoice row safely without invalid UUID casting
      const invRes = await client.query(
        `SELECT id, invoice_no, status, converted_to_inward, supplier_id, supplier_name, total_amount, currency, exchange_rate 
         FROM purchase_invoices 
         WHERE id = $1 OR invoice_no = $1 
         LIMIT 1`,
        [cleanId]
      );

      if (invRes.rows.length === 0) {
        await client.query('COMMIT');
        return {
          success: true,
          message: `Invoice "${cleanId}" not found or already deleted; idempotent success.`,
          idempotent: true,
          id: cleanId
        };
      }

      const invRow = invRes.rows[0];
      const invId = String(invRow.id || cleanId);
      const invoiceNo = String(invRow.invoice_no || explicitInvoiceNo || invId);

      // Rule B: Cannot delete if Inward Pass or Sorting Bale exists
      const passRes = await client.query(
        `SELECT id, gate_pass_no FROM inward_gate_passes WHERE purchase_invoice_id = $1 OR purchase_invoice_no = $2 LIMIT 10`,
        [invId, invoiceNo]
      );
      if (passRes.rows.length > 0 || invRow.converted_to_inward) {
        await client.query('ROLLBACK');
        const baleCount = passRes.rows.length || 1;
        throw new Error(
          `Cannot delete invoice "${invoiceNo}" because ${baleCount} Inward Pass(es) / Sorting Bale(s) have already been generated for it. You must delete the Sorting Bales first.`
        );
      }

      // 2. Identify tokens and patterns for voucher discovery
      const tokens = Array.from(
        new Set(
          [
            cleanId,
            invId,
            invoiceNo,
            `PINV-${invoiceNo}`,
            `PUR-${invoiceNo}`,
            `INWARD-${invoiceNo}`,
            `DEL-${invoiceNo}`,
            `UNPOST-${invoiceNo}`
          ].filter(Boolean)
        )
      );
      const likePatterns = [`%${invoiceNo}%`, `%${cleanId}%`];

      // 3. Find matching vouchers from financial_vouchers and vouchers
      const fvRes = await client.query(
        `SELECT id, voucher_no, party_id FROM financial_vouchers 
         WHERE reference = ANY($1::text[]) 
            OR reference_no = ANY($1::text[]) 
            OR voucher_no ILIKE ANY($2::text[]) 
            OR narration ILIKE ANY($2::text[])`,
        [tokens, likePatterns]
      );

      const vRes = await client.query(
        `SELECT id, voucher_no FROM vouchers 
         WHERE reference = ANY($1::text[]) 
            OR reference_no = ANY($1::text[]) 
            OR voucher_no ILIKE ANY($2::text[]) 
            OR narration ILIKE ANY($2::text[])`,
        [tokens, likePatterns]
      );

      const allVoucherRows = [...fvRes.rows, ...vRes.rows];
      const voucherIds = Array.from(new Set(allVoucherRows.map((r: any) => String(r.id)).filter(Boolean)));
      const voucherNos = Array.from(new Set(allVoucherRows.map((r: any) => String(r.voucher_no)).filter(Boolean)));

      const affectedPartyIds = new Set<string>();
      if (invRow.supplier_id) affectedPartyIds.add(String(invRow.supplier_id));
      fvRes.rows.forEach((r: any) => {
        if (r.party_id) affectedPartyIds.add(String(r.party_id));
      });

      // 4. Cascade purge of linked financial ledger records in correct dependency order
      if (voucherIds.length > 0 || voucherNos.length > 0) {
        // journal_entries
        await client.query(
          `DELETE FROM journal_entries 
           WHERE voucher_id = ANY($1::text[]) 
              OR description ILIKE ANY($2::text[])`,
          [voucherIds, likePatterns]
        );

        // voucher_entries
        await client.query(
          `DELETE FROM voucher_entries 
           WHERE voucher_id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // general_ledger
        await client.query(
          `DELETE FROM general_ledger 
           WHERE voucher_id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // ledgers
        await client.query(
          `DELETE FROM ledgers 
           WHERE voucher_id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // financial_vouchers
        await client.query(
          `DELETE FROM financial_vouchers 
           WHERE id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );

        // vouchers
        await client.query(
          `DELETE FROM vouchers 
           WHERE id = ANY($1::text[]) 
              OR voucher_no = ANY($2::text[])`,
          [voucherIds, voucherNos]
        );
      }

      // 5. Purge party_khata_logs for this invoice
      await client.query(
        `DELETE FROM party_khata_logs 
         WHERE reference = ANY($1::text[]) 
            OR notes ILIKE ANY($2::text[])`,
        [tokens, likePatterns]
      );

      // 6. Delete child table purchase_invoice_items
      await client.query(
        `DELETE FROM purchase_invoice_items WHERE invoice_id = $1 OR invoice_id = $2`,
        [invId, invoiceNo]
      );

      // 7. Delete parent record from purchase_invoices
      await client.query(
        `DELETE FROM purchase_invoices WHERE id = $1`,
        [invId]
      );

      // 8. Recalculate supplier balance
      for (const pId of affectedPartyIds) {
        if (!pId) continue;
        await client.query(
          `UPDATE parties
           SET current_balance = COALESCE(opening_balance, 0) + COALESCE((
             SELECT SUM(CASE 
               WHEN UPPER(COALESCE(parties.type, parties.party_type, '')) LIKE '%SUPPLIER%' OR UPPER(COALESCE(parties.type, parties.party_type, '')) LIKE '%VENDOR%'
               THEN (credit - debit)
               ELSE (debit - credit)
             END)
             FROM party_khata_logs
             WHERE party_id = parties.id
           ), 0)
           WHERE id = $1`,
          [pId]
        );
      }

      // 9. Reconcile Chart of Accounts in SQL
      try {
        await client.query('SELECT sync_coa_current_balances()');
      } catch (coaErr) {
        console.warn('[Purchase] Notice running sync_coa_current_balances:', coaErr);
      }

      // 10. If zero purchase invoices and zero bales remain, reset stock accounts
      const remainingCheck = await client.query(
        `SELECT 
          (SELECT COUNT(*) FROM purchase_invoices) as inv_count,
          (SELECT COUNT(*) FROM inward_gate_passes) as bale_count`
      );
      if (Number(remainingCheck.rows[0]?.inv_count || 0) === 0 && Number(remainingCheck.rows[0]?.bale_count || 0) === 0) {
        const stockCodes = ['1140-00', '1140-01', '1150-00', '1150-01', '2110-00', '2110-01'];
        await client.query(
          `UPDATE coa_accounts SET current_balance = 0 WHERE code = ANY($1::text[])`,
          [stockCodes]
        );
        await client.query(
          `UPDATE chart_of_accounts SET current_balance = 0 WHERE code = ANY($1::text[])`,
          [stockCodes]
        );
      }

      await client.query('COMMIT');
      return {
        success: true,
        message: `Purchase invoice "${invoiceNo}" and all linked vouchers/ledger entries deleted successfully.`,
        invoiceNo,
        id: invId
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  });
}
