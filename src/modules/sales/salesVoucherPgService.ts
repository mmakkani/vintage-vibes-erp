import { withDb } from '../../db/pgPool.ts';
import { insertVoucherPg } from '../finance/voucherPgService.ts';

interface SalesVoucherResult {
  success: boolean;
  voucherNo?: string;
  voucherId?: string;
  error?: string;
}

/**
 * Automatically creates a GAAP/IFRS compliant dual-entry financial voucher in PostgreSQL
 * for any finalized/posted Sales Invoice (Live Stream, POS, E-Commerce, Wholesale B2B).
 *
 * Accounting Entries Generated:
 * 1. DEBIT: Settlement Asset / Accounts Receivable (total_amount)
 *    - COD -> 1128-01 Courier COD Clearing (Pending Remittance)
 *    - CASH -> 1110-01 Cash in Hand (POS / Counter)
 *    - BANK / CARD -> 1120-01 Cash in Bank (AED)
 *    - Credit / AR -> 1130-02 (Live Stream), 1130-03 (Ecom), 1130-01 (POS), 1130-00 (Trade Debtors)
 * 2. CREDIT: Sales Revenue (subtotal - discount)
 *    - Live Stream -> 4110-02 Live Streaming Sales Revenue
 *    - E-Commerce -> 4110-03 E-Commerce / Online Website Sales
 *    - Wholesale B2B -> 4120-01 Wholesale & Export Sales Revenue
 *    - POS Retail -> 4110-01 POS / Counter Retail Sales
 * 3. CREDIT: UAE VAT Output Tax 5% (tax_amount)
 *    - 2140-01 UAE VAT Output Tax (5%)
 * 4. SHIPPING FEE:
 *    - If Customer Bears: CREDIT 4110-04 Delivery & Shipping Charges Collected
 *    - If Company Bears: DEBIT 5140-01 Courier & Delivery Charges, CREDIT 2120-00 Courier Partner Payable
 * 5. COGS & INVENTORY ASSET RELIEF:
 *    - DEBIT: 5100-02 Cost of Goods Sold - Finished Goods
 *    - CREDIT: 1160-01 Finished Goods (Garment Inventory Asset)
 */
export async function postSalesInvoiceVoucherPg(
  invoiceIdOrNo: string,
  postedBy: string = 'Sales Engine'
): Promise<SalesVoucherResult> {
  const queryRef = (invoiceIdOrNo || '').trim();
  if (!queryRef) {
    return { success: false, error: 'invoiceIdOrNo is required' };
  }

  return await withDb(async (client) => {
    // 1. Fetch Sales Invoice from PostgreSQL
    let invRow: any = null;
    const invRes = await client.query(
      `SELECT * FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1`,
      [queryRef]
    );

    if (invRes.rows.length > 0) {
      invRow = invRes.rows[0];
    } else {
      // Check b2b_sales if applicable
      const b2bRes = await client.query(
        `SELECT * FROM b2b_sales WHERE id::text = $1 OR b2b_invoice_number = $1 LIMIT 1`,
        [queryRef]
      );
      if (b2bRes.rows.length > 0) {
        const b = b2bRes.rows[0];
        invRow = {
          id: b.id,
          invoice_no: b.b2b_invoice_number,
          client_id: b.customer_id || b.party_id,
          customer_name: b.buyer_company || b.customer_name || 'B2B Wholesale Buyer',
          customer_phone: b.buyer_phone || b.customer_phone || '',
          invoice_date: b.invoice_date || b.created_at,
          channel: 'WHOLESALE',
          payment_method: b.payment_method || 'BANK_TRANSFER',
          subtotal: b.subtotal || b.total_amount || 0,
          discount_amount: b.discount_amount || 0,
          tax_amount: b.vat_amount || b.tax_amount || 0,
          total_amount: b.total_amount || 0,
          shipping_fee: b.shipping_fee || 0,
          shipping_bearer: b.shipping_bearer || 'CUSTOMER',
          items: b.items || []
        };
      }
    }

    if (!invRow) {
      return { success: false, error: `Sales Invoice "${queryRef}" not found in database` };
    }

    const invoiceNo = invRow.invoice_no || invRow.id;
    const items: any[] = Array.isArray(invRow.items)
      ? invRow.items
      : (typeof invRow.items === 'string' ? JSON.parse(invRow.items || '[]') : []);

    // 2. Accurate COGS calculation from pieces database & item breakdown
    const barcodes = items.map((it: any) => it.barcode).filter(Boolean);
    const pieceCostMap = new Map<string, number>();

    if (barcodes.length > 0) {
      const piecesRes = await client.query(
        `SELECT barcode, cost_price, cost_per_gram, weight_grams, weight_kg 
         FROM inventory_pieces 
         WHERE barcode = ANY($1::text[])`,
        [barcodes]
      );
      for (const p of piecesRes.rows) {
        const grams = Number(p.weight_grams || 0) || Math.round(Number(p.weight_kg || 0) * 1000);
        const costPerGram = Number(p.cost_per_gram || 0);
        const costPrice = Number(p.cost_price || 0);
        const gramCost = (costPerGram > 0 && grams > 0) ? Number((costPerGram * grams).toFixed(2)) : 0;
        const finalCost = costPrice > 0 ? costPrice : gramCost;
        if (p.barcode) {
          pieceCostMap.set(p.barcode, finalCost);
        }
      }
    }

    let totalCOGS = 0;
    for (const it of items) {
      const bc = it.barcode;
      const dbCost = bc ? pieceCostMap.get(bc) : undefined;
      if (typeof dbCost === 'number' && dbCost > 0) {
        totalCOGS += dbCost;
      } else {
        const itemCalc = Number(it.calculatedCostPrice || 0);
        const itemBase = Number(it.costPrice || 0);
        const itemGrams = Number(it.weightGrams || 0) || Math.round(Number(it.weightKg || 0) * 1000);
        const itemPerGram = Number(it.costPerGram || 0);
        const itemGramCost = (itemPerGram > 0 && itemGrams > 0) ? Number((itemPerGram * itemGrams).toFixed(2)) : 0;
        const chosen = itemCalc > 0 ? itemCalc : (itemBase > 0 ? itemBase : itemGramCost);
        totalCOGS += chosen;
      }
    }
    totalCOGS = Number(totalCOGS.toFixed(2));

    // 3. Financial breakdown amounts
    const subtotal = Number(invRow.subtotal || 0);
    const discount = Number(invRow.discount_amount || 0);
    const netRevenue = Number(Math.max(0, subtotal - discount).toFixed(2));
    const taxAmount = Number(Number(invRow.tax_amount || 0).toFixed(2));
    const shippingFee = Number(Number(invRow.shipping_fee || 0).toFixed(2));
    const shippingBearer = String(invRow.shipping_bearer || 'CUSTOMER').toUpperCase();
    let totalAmount = Number(Number(invRow.total_amount || 0).toFixed(2));

    if (totalAmount <= 0) {
      totalAmount = Number((netRevenue + taxAmount + (shippingBearer !== 'COMPANY' ? shippingFee : 0)).toFixed(2));
    }

    // 4. Resolve COA Accounts based on Channel and Payment Method
    const channel = String(invRow.channel || '').toUpperCase();
    const paymentMethod = String(invRow.payment_method || '').toUpperCase();

    // Line A Account: Settlement Asset or Accounts Receivable
    let debitAccountCode = '1128-01';
    let debitAccountName = 'Courier COD Clearing (Pending Remittance)';

    if (paymentMethod === 'COD' || paymentMethod.includes('COD')) {
      debitAccountCode = '1128-01';
      debitAccountName = 'Courier COD Clearing (Pending Remittance)';
    } else if (paymentMethod === 'CASH' || paymentMethod === 'CASH_DRAWER') {
      debitAccountCode = '1110-01';
      debitAccountName = 'Cash in Hand (POS / Counter)';
    } else if (
      paymentMethod === 'BANK' ||
      paymentMethod === 'BANK_TRANSFER' ||
      paymentMethod === 'BANK_QR' ||
      paymentMethod === 'CARD' ||
      paymentMethod === 'CARD_POS' ||
      paymentMethod === 'STRIPE' ||
      paymentMethod === 'ONLINE'
    ) {
      debitAccountCode = '1120-01';
      debitAccountName = 'Cash in Bank (AED)';
    } else {
      // Credit Sale / Trade AR
      // Check if client party has a mapped COA account
      let partyAccountCode: string | null = null;
      if (invRow.client_id) {
        const partyRes = await client.query(
          `SELECT coa_account_id, code, name FROM parties WHERE id::text = $1 OR code = $1 LIMIT 1`,
          [invRow.client_id]
        );
        if (partyRes.rows.length > 0 && partyRes.rows[0].coa_account_id) {
          const coaRes = await client.query(
            `SELECT code, name FROM chart_of_accounts WHERE id::text = $1 LIMIT 1`,
            [partyRes.rows[0].coa_account_id]
          );
          if (coaRes.rows.length > 0) {
            partyAccountCode = coaRes.rows[0].code;
            debitAccountName = coaRes.rows[0].name;
          }
        }
      }

      if (partyAccountCode) {
        debitAccountCode = partyAccountCode;
      } else if (channel === 'LIVE_STREAM') {
        debitAccountCode = '1130-02';
        debitAccountName = 'LIVE SALE STUDIO (Customer)';
      } else if (channel === 'ECOMMERCE') {
        debitAccountCode = '1130-03';
        debitAccountName = 'E-COOMERCE SALE (Customer)';
      } else if (channel === 'POS' || channel === 'POS_COUNTER') {
        debitAccountCode = '1130-01';
        debitAccountName = 'POS SALE (Customer)';
      } else {
        debitAccountCode = '1130-00';
        debitAccountName = 'Accounts Receivable (Trade Debtors)';
      }
    }

    // Line B Account: Sales Revenue
    let revAccountCode = '4110-01';
    let revAccountName = 'POS / Counter Retail Sales';

    if (channel === 'LIVE_STREAM') {
      revAccountCode = '4110-02';
      revAccountName = 'Live Streaming Sales Revenue';
    } else if (channel === 'ECOMMERCE') {
      revAccountCode = '4110-03';
      revAccountName = 'E-Commerce / Online Website Sales';
    } else if (channel === 'WHOLESALE' || channel === 'B2B') {
      revAccountCode = '4120-01';
      revAccountName = 'Wholesale & Export Sales Revenue';
    } else {
      revAccountCode = '4110-01';
      revAccountName = 'POS / Counter Retail Sales';
    }

    // 5. Construct Double-Entry Lines
    const lines: any[] = [];

    // Line 1: Debit Settlement / Customer Receivable
    lines.push({
      accountCode: debitAccountCode,
      accountName: debitAccountName,
      debit: totalAmount,
      credit: 0,
      memo: `Sales Invoice ${invoiceNo} [${paymentMethod}] - ${invRow.customer_name || 'Retail Client'}`
    });

    // Line 2: Credit Sales Revenue
    lines.push({
      accountCode: revAccountCode,
      accountName: revAccountName,
      debit: 0,
      credit: netRevenue,
      memo: `Sales Invoice ${invoiceNo} Net Revenue (${items.length} garments)`
    });

    // Line 3: Credit Output VAT (if applicable)
    if (taxAmount > 0) {
      lines.push({
        accountCode: '2140-01',
        accountName: 'UAE VAT Output Tax (5%)',
        debit: 0,
        credit: taxAmount,
        memo: `Output 5% UAE VAT on Sales Invoice ${invoiceNo}`
      });
    }

    // Line 4: Shipping Handling
    if (shippingFee > 0) {
      if (shippingBearer !== 'COMPANY') {
        // Customer bears shipping: credited to Delivery & Shipping Charges Collected
        lines.push({
          accountCode: '4110-04',
          accountName: 'Delivery & Shipping Charges Collected',
          debit: 0,
          credit: shippingFee,
          memo: `Delivery & shipping fee collected from buyer for ${invoiceNo}`
        });
      } else {
        // Company absorbs shipping: Debit delivery expense, Credit courier payable
        lines.push({
          accountCode: '5140-01',
          accountName: 'Courier & Delivery Charges',
          debit: shippingFee,
          credit: 0,
          memo: `Company-absorbed shipping expense for parcel ${invoiceNo}`
        });
        lines.push({
          accountCode: '2120-00',
          accountName: 'Accounts Payable - Courier, Freight & Clearing Agents',
          debit: 0,
          credit: shippingFee,
          memo: `Payable to courier partner for parcel ${invoiceNo}`
        });
      }
    }

    // Line 5 & 6: COGS & Finished Goods Relief
    if (totalCOGS > 0) {
      lines.push({
        accountCode: '5100-02',
        accountName: 'Cost of Goods Sold - Finished Goods',
        debit: totalCOGS,
        credit: 0,
        memo: `COGS: Allocated cost of ${items.length} pieces for ${invoiceNo}`
      });
      lines.push({
        accountCode: '1160-01',
        accountName: 'Finished Goods',
        debit: 0,
        credit: totalCOGS,
        memo: `Inventory relief: ${items.length} pieces sold on ${invoiceNo}`
      });
    }

    // 6. Strict Double-Entry Balance Verification & Micro-adjustment
    const calculatedDebit = Number(lines.reduce((s, l) => s + Number(l.debit || 0), 0).toFixed(2));
    const calculatedCredit = Number(lines.reduce((s, l) => s + Number(l.credit || 0), 0).toFixed(2));
    const diff = Number((calculatedDebit - calculatedCredit).toFixed(2));

    if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05) {
      // Reconcile rounding penny on the revenue credit line
      const revLine = lines.find(l => l.accountCode === revAccountCode);
      if (revLine) {
        revLine.credit = Number((Number(revLine.credit) + diff).toFixed(2));
      }
    }

    const finalDebit = Number(lines.reduce((s, l) => s + Number(l.debit || 0), 0).toFixed(2));
    const finalCredit = Number(lines.reduce((s, l) => s + Number(l.credit || 0), 0).toFixed(2));

    if (Math.abs(finalDebit - finalCredit) > 0.01) {
      throw new Error(`Double-Entry Imbalance for ${invoiceNo}: Debit AED ${finalDebit} != Credit AED ${finalCredit}`);
    }

    // 7. Insert or update financial voucher via insertVoucherPg
    const voucherNo = `JV-SLS-${invoiceNo}`;
    const invoiceDateStr = invRow.invoice_date
      ? new Date(invRow.invoice_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const voucherPayload = {
      voucherNo,
      date: invoiceDateStr,
      type: 'JOURNAL',
      reference: invoiceNo,
      documentRef: invoiceNo,
      narration: `Automated Financial Posting for Sales Invoice ${invoiceNo} (${invRow.customer_name || 'Retail Client'}, ${items.length} items, Total AED ${totalAmount})`,
      totalDebit: finalDebit,
      totalCredit: finalCredit,
      currency: 'AED',
      exchangeRate: 1.0,
      baseCurrency: 'AED',
      status: 'POSTED',
      createdBy: postedBy || 'Sales Engine',
      isAuto: true,
      lines
    };

    const insertedVoucher = await insertVoucherPg(voucherPayload);

    // 8. If customer is a registered party in public.parties, record running khata log
    if (invRow.client_id) {
      try {
        const partyRes = await client.query(
          `SELECT id, name, current_balance FROM parties WHERE id::text = $1 OR code = $1 LIMIT 1`,
          [invRow.client_id]
        );
        if (partyRes.rows.length > 0) {
          const party = partyRes.rows[0];
          const newBalance = Number((Number(party.current_balance || 0) + totalAmount).toFixed(2));
          await client.query(
            `UPDATE parties SET current_balance = $1, updated_at = NOW() WHERE id = $2`,
            [newBalance, party.id]
          );
          await client.query(
            `INSERT INTO party_khata_logs (id, party_id, date, reference, debit, credit, running_balance, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7, NOW())
             ON CONFLICT (id) DO UPDATE SET debit = EXCLUDED.debit, running_balance = EXCLUDED.running_balance`,
            [
              `pkl-sls-${invRow.id || invoiceNo}`,
              party.id,
              invoiceDateStr,
              invoiceNo,
              totalAmount,
              newBalance,
              `Sales Invoice ${invoiceNo} [${paymentMethod}]`
            ]
          );
        }
      } catch (khataErr) {
        console.warn(`[postSalesInvoiceVoucherPg] Party khata log notice for ${invoiceNo}:`, khataErr);
      }
    }

    return {
      success: true,
      voucherNo: insertedVoucher?.voucherNo || voucherNo,
      voucherId: insertedVoucher?.id
    };
  });
}
