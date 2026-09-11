import { SalesGatePass, SalesInvoice, SalesInvoiceItem } from './sales.types.ts';
import { Voucher } from '../finance/finance.types.ts';
import { Party } from '../parties/parties.types.ts';

export class SalesEngine {
  /**
   * Recalculates invoice totals: subtotal, discount, VAT, and grand total
   */
  public static calculateInvoiceTotals(
    items: { unitPrice: number; discount?: number }[],
    vatPercent: number = 5.0
  ): {
    subTotal: number;
    discountAmount: number;
    taxableAmount: number;
    vatAmount: number;
    totalAmount: number;
  } {
    let subTotal = 0;
    let discountAmount = 0;

    items.forEach(item => {
      const price = Number(item.unitPrice) || 0;
      const disc = Number(item.discount) || 0;
      subTotal += price;
      discountAmount += disc;
    });

    const taxableAmount = Math.max(0, subTotal - discountAmount);
    const vatAmount = Number(((taxableAmount * vatPercent) / 100).toFixed(2));
    const totalAmount = Number((taxableAmount + vatAmount).toFixed(2));

    return {
      subTotal: Number(subTotal.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      taxableAmount: Number(taxableAmount.toFixed(2)),
      vatAmount,
      totalAmount
    };
  }

  /**
   * 1-Click Conversion: Converts verified Sales Gate Pass into a finalized Sales Invoice
   */
  public static convertGatePassToInvoice(
    gatePass: SalesGatePass,
    customer: Party,
    invoiceNo: string,
    vatPercent: number = 5.0
  ): {
    canConvert: boolean;
    invoice?: SalesInvoice;
    error?: string;
  } {
    if (gatePass.status !== 'POSTED') {
      return {
        canConvert: false,
        error: `Sales Gate Pass ${gatePass.gatePassNo} must be in POSTED status before converting to a Sales Invoice.`
      };
    }

    if (gatePass.isConverted) {
      return {
        canConvert: false,
        error: `Sales Gate Pass ${gatePass.gatePassNo} has already been converted into invoice ${gatePass.salesInvoiceId}.`
      };
    }

    if (!gatePass.items || gatePass.items.length === 0) {
      return {
        canConvert: false,
        error: `Cannot convert an empty Sales Gate Pass.`
      };
    }

    const invoiceItems: SalesInvoiceItem[] = gatePass.items.map(item => {
      const discount = Number(((item.unitPrice * item.discountPercent) / 100).toFixed(2));
      const finalAmount = Number((item.unitPrice - discount).toFixed(2));
      return {
        id: `sii-${item.barcode}-${Date.now()}`,
        barcode: item.barcode,
        description: `${item.brandName} ${item.itemName} (${item.size})`,
        weightKg: item.weightKg,
        unitPrice: item.unitPrice,
        discount,
        finalAmount
      };
    });

    const totals = this.calculateInvoiceTotals(
      invoiceItems.map(i => ({ unitPrice: i.unitPrice, discount: i.discount })),
      vatPercent
    );

    const invoice: SalesInvoice = {
      id: `sinv-${Date.now()}`,
      invoiceNo,
      salesGatePassId: gatePass.id,
      salesGatePassNo: gatePass.gatePassNo,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerTrn: customer.trnNo,
      date: new Date().toISOString().slice(0, 10),
      status: 'DRAFT',
      currency: 'AED',
      exchangeRate: 1.0,
      subTotal: totals.subTotal,
      discountAmount: totals.discountAmount,
      vatAmount: totals.vatAmount,
      totalAmount: totals.totalAmount,
      items: invoiceItems,
      paymentMethod: 'CREDIT_ACCOUNT'
    };

    return { canConvert: true, invoice };
  }

  /**
   * Generates Dual-Entry COA Voucher for a finalized Sales Invoice
   * DEBIT: Accounts Receivable (Customer) or Cash
   * CREDIT: Sales Revenue
   * DEBIT: Cost of Goods Sold (COGS) (Piece Weight-based Cost)
   * CREDIT: Inventory Finished Goods (Piece Weight-based Cost)
   * CREDIT: Output VAT Payable (if vat > 0)
   * Handles Courier shipping charge & bearer (Customer vs. Company)
   */
  public static generateComprehensiveCOASalesVoucher(
    invoice: SalesInvoice,
    totalCOGS: number,
    accounts: {
      receivableAccountId?: string;
      cashAccountId?: string;
      codReceivableAccountId?: string;
      bankAccountId?: string;
      cardClearingAccountId?: string;
      salesRevenueAccountId?: string;
      cogsAccountId?: string;
      inventoryAssetAccountId?: string;
      vatPayableAccountId?: string;
      shippingExpenseAccountId?: string;
      courierPayableAccountId?: string;
    }
  ): Omit<Voucher, 'id' | 'status'> {
    let debitAccountId = accounts.receivableAccountId || 'acc-1130';
    let debitAccountName = `Accounts Receivable - ${invoice.customerName || 'Retail Client'}`;

    if (invoice.paymentMethod === 'COD' || invoice.notes?.includes('COD')) {
      debitAccountId = accounts.codReceivableAccountId || 'acc-1128';
      debitAccountName = `Courier COD Clearing / Receivable (${invoice.courierPartner || 'Aramex / iMile'})`;
    } else if (invoice.paymentMethod === 'BANK_TRANSFER' || invoice.paymentMethod === 'BANK_QR') {
      debitAccountId = accounts.bankAccountId || 'acc-1120';
      debitAccountName = 'Bank Account (Emirates NBD)';
    } else if (invoice.paymentMethod === 'CARD_POS') {
      debitAccountId = accounts.cardClearingAccountId || 'acc-1125';
      debitAccountName = 'POS Terminal Card Clearing';
    } else if (invoice.paymentMethod === 'CASH') {
      debitAccountId = accounts.cashAccountId || 'acc-1110';
      debitAccountName = 'Cash in Hand (Counter 1)';
    }

    const revAccountId = accounts.salesRevenueAccountId || 'acc-4110';
    const cogsAccountId = accounts.cogsAccountId || 'acc-5110';
    const invAccountId = accounts.inventoryAssetAccountId || 'acc-1140';
    const vatAccountId = accounts.vatPayableAccountId || 'acc-2140';
    const shippingExpAccountId = accounts.shippingExpenseAccountId || 'acc-5420';
    const courierPayableAccountId = accounts.courierPayableAccountId || 'acc-2120';

    const netRevenue = Number((invoice.subTotal - invoice.discountAmount).toFixed(2));
    const lines: Voucher['lines'] = [];

    // 1. Customer Receivable / COD / Cash / Bank Debit
    lines.push({
      id: `line-rec-${invoice.id}`,
      accountId: debitAccountId,
      accountCode: '',
      accountName: debitAccountName,
      debitAmount: invoice.totalAmount,
      creditAmount: 0,
      memo: `Sales Invoice ${invoice.invoiceNo} - ${debitAccountName} (Selling Price + VAT)`
    });

    // 2. Sales Revenue Credit
    lines.push({
      id: `line-rev-${invoice.id}`,
      accountId: revAccountId,
      accountCode: '',
      accountName: 'Retail & Live Stream Sales Revenue',
      debitAmount: 0,
      creditAmount: netRevenue,
      memo: `Sales Invoice ${invoice.invoiceNo} - Net Garment Revenue`
    });

    // 3. VAT Credit (if applicable)
    if (invoice.vatAmount > 0) {
      lines.push({
        id: `line-vat-${invoice.id}`,
        accountId: vatAccountId,
        accountCode: '',
        accountName: 'Output VAT Tax Payable (5% FTA UAE)',
        debitAmount: 0,
        creditAmount: invoice.vatAmount,
        memo: `Output 5% UAE VAT on ${invoice.invoiceNo}`
      });
    }

    // 4. COGS & Inventory Finished Goods Linkage
    if (totalCOGS > 0) {
      // Debit: COGS
      lines.push({
        id: `line-cogs-${invoice.id}`,
        accountId: cogsAccountId,
        accountCode: '',
        accountName: 'Cost of Goods Sold (Bales Consumption)',
        debitAmount: Number(totalCOGS.toFixed(2)),
        creditAmount: 0,
        memo: `COGS: Gram-weight allocated piece cost for ${invoice.items.length} garments`
      });

      // Credit: Inventory Finished Goods
      lines.push({
        id: `line-inv-${invoice.id}`,
        accountId: invAccountId,
        accountCode: '',
        accountName: 'Vintage Bales & Garment Stock Asset',
        debitAmount: 0,
        creditAmount: Number(totalCOGS.toFixed(2)),
        memo: `Inventory Deduction: ${invoice.items.length} pieces dispatched at gram cost`
      });
    }

    // 5. Courier Shipping liability
    if (invoice.shippingCharge && invoice.shippingCharge > 0) {
      if (invoice.shippingBearer === 'COMPANY') {
        // Company bears shipping: Debit Delivery Expense, Credit Courier Liability
        lines.push({
          id: `line-ship-exp-${invoice.id}`,
          accountId: shippingExpAccountId,
          accountCode: '',
          accountName: 'Courier & RTO Shipping Operating Expense',
          debitAmount: Number(invoice.shippingCharge.toFixed(2)),
          creditAmount: 0,
          memo: `Company-absorbed express delivery charge for parcel ${invoice.trackingNumber || invoice.invoiceNo}`
        });

        lines.push({
          id: `line-courier-pay-${invoice.id}`,
          accountId: courierPayableAccountId,
          accountCode: '',
          accountName: 'Courier Partners Payable (Aramex / Emirates Post)',
          debitAmount: 0,
          creditAmount: Number(invoice.shippingCharge.toFixed(2)),
          memo: `Payable to courier partner for dispatched parcel ${invoice.trackingNumber || invoice.invoiceNo}`
        });
      } else {
        // Customer bears shipping: Shipping fee is billed to buyer, Credit Courier Liability
        lines.push({
          id: `line-courier-cust-${invoice.id}`,
          accountId: courierPayableAccountId,
          accountCode: '',
          accountName: 'Courier Partners Payable (Customer Collected)',
          debitAmount: 0,
          creditAmount: Number(invoice.shippingCharge.toFixed(2)),
          memo: `Customer-paid courier delivery charge collected for ${invoice.trackingNumber || invoice.invoiceNo}`
        });
      }
    }

    const totalDebit = Number(lines.reduce((s, l) => s + l.debitAmount, 0).toFixed(2));
    const totalCredit = Number(lines.reduce((s, l) => s + l.creditAmount, 0).toFixed(2));

    return {
      voucherNo: `JV-SLS-${invoice.invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}`,
      type: 'JV',
      date: invoice.date,
      narration: `Automated COA & COGS posting for Live Sale Invoice ${invoice.invoiceNo} (${invoice.customerName}, ${invoice.items.length} garments, AED ${invoice.totalAmount})`,
      totalDebit,
      totalCredit,
      currency: invoice.currency,
      exchangeRate: invoice.exchangeRate,
      documentRef: invoice.invoiceNo,
      lines
    };
  }

  /**
   * Generates Dual-Entry COA Reversal Voucher for Parcel Return / RTO
   * DEBIT: Inventory Finished Goods (Piece Weight-based Cost) -> restores stock asset
   * CREDIT: Cost of Goods Sold (COGS) (Piece Weight-based Cost) -> reverses COGS
   * DEBIT: Sales Revenue (Selling Price) -> reverses revenue
   * CREDIT: Accounts Receivable (Selling Price) -> reduces customer balance
   * DEBIT: Courier & RTO Shipping Expense (Courier Return Charge)
   * CREDIT: Courier Partners Payable (Courier Return Charge)
   */
  public static generateCOAReturnVoucher(params: {
    returnNo: string;
    invoiceNo: string;
    customerName: string;
    date: string;
    totalSaleRefunded: number;
    totalCOGSReversed: number;
    courierReturnCharge: number;
    courierPartner: string;
    accounts: {
      receivableAccountId?: string;
      salesRevenueAccountId?: string;
      cogsAccountId?: string;
      inventoryAssetAccountId?: string;
      shippingExpenseAccountId?: string;
      courierPayableAccountId?: string;
    };
  }): Omit<Voucher, 'id' | 'status'> {
    const arAccountId = params.accounts.receivableAccountId || 'acc-1130';
    const revAccountId = params.accounts.salesRevenueAccountId || 'acc-4120';
    const cogsAccountId = params.accounts.cogsAccountId || 'acc-5110';
    const invAccountId = params.accounts.inventoryAssetAccountId || 'acc-1200';
    const shippingExpAccountId = params.accounts.shippingExpenseAccountId || 'acc-5420';
    const courierPayableAccountId = params.accounts.courierPayableAccountId || 'acc-2120';

    const lines: Voucher['lines'] = [];

    // 1. Reverse Revenue: Debit Sales Revenue
    if (params.totalSaleRefunded > 0) {
      lines.push({
        id: `line-ret-rev-${params.returnNo}`,
        accountId: revAccountId,
        accountCode: '',
        accountName: 'Retail Scanned Pieces Sales Revenue (Return Reversal)',
        debitAmount: Number(params.totalSaleRefunded.toFixed(2)),
        creditAmount: 0,
        memo: `RTO ${params.returnNo}: Reversal of sales revenue on returned parcel (${params.invoiceNo})`
      });

      // Credit: Accounts Receivable
      lines.push({
        id: `line-ret-ar-${params.returnNo}`,
        accountId: arAccountId,
        accountCode: '',
        accountName: `Accounts Receivable - ${params.customerName}`,
        debitAmount: 0,
        creditAmount: Number(params.totalSaleRefunded.toFixed(2)),
        memo: `RTO ${params.returnNo}: Credit note adjustment against original invoice ${params.invoiceNo}`
      });
    }

    // 2. Reverse COGS & Restore Inventory Finished Goods Stock Asset
    if (params.totalCOGSReversed > 0) {
      // Debit: Inventory Finished Goods
      lines.push({
        id: `line-ret-inv-${params.returnNo}`,
        accountId: invAccountId,
        accountCode: '',
        accountName: 'Vintage Bales & Garment Stock Asset',
        debitAmount: Number(params.totalCOGSReversed.toFixed(2)),
        creditAmount: 0,
        memo: `RTO ${params.returnNo}: Restoring returned garment stock asset at original gram-weight cost`
      });

      // Credit: Cost of Goods Sold
      lines.push({
        id: `line-ret-cogs-${params.returnNo}`,
        accountId: cogsAccountId,
        accountCode: '',
        accountName: 'Cost of Goods Sold (Bales Consumption)',
        debitAmount: 0,
        creditAmount: Number(params.totalCOGSReversed.toFixed(2)),
        memo: `RTO ${params.returnNo}: Reversing COGS consumption on returned garments`
      });
    }

    // 3. Book Courier Return Charge as Operating Expense & Courier Liability
    if (params.courierReturnCharge > 0) {
      lines.push({
        id: `line-ret-courier-exp-${params.returnNo}`,
        accountId: shippingExpAccountId,
        accountCode: '',
        accountName: 'Courier & RTO Shipping Operating Expense',
        debitAmount: Number(params.courierReturnCharge.toFixed(2)),
        creditAmount: 0,
        memo: `Courier return handling fee for RTO ${params.returnNo} (${params.courierPartner})`
      });

      lines.push({
        id: `line-ret-courier-pay-${params.returnNo}`,
        accountId: courierPayableAccountId,
        accountCode: '',
        accountName: `Courier Partners Payable (${params.courierPartner})`,
        debitAmount: 0,
        creditAmount: Number(params.courierReturnCharge.toFixed(2)),
        memo: `Payable to ${params.courierPartner} for RTO return delivery charges`
      });
    }

    const totalDebit = Number(lines.reduce((s, l) => s + l.debitAmount, 0).toFixed(2));
    const totalCredit = Number(lines.reduce((s, l) => s + l.creditAmount, 0).toFixed(2));

    return {
      voucherNo: `JV-${params.returnNo}`,
      type: 'JV',
      date: params.date,
      narration: `Automated COA Reversal for Parcel Return / RTO ${params.returnNo} (Invoice: ${params.invoiceNo}, Customer: ${params.customerName})`,
      totalDebit,
      totalCredit,
      currency: 'AED',
      exchangeRate: 1.0,
      documentRef: params.returnNo,
      lines
    };
  }

  /**
   * Generates Dual-Entry COA Voucher for a finalized Sales Invoice
   * (Backward compatibility wrapper)
   */
  public static generateCOASalesVoucher(
    invoice: SalesInvoice,
    customerReceivableAccountId: string,
    salesRevenueAccountId: string,
    vatPayableAccountId: string
  ): Omit<Voucher, 'id' | 'status'> {
    return this.generateComprehensiveCOASalesVoucher(invoice, 0, {
      receivableAccountId: customerReceivableAccountId,
      salesRevenueAccountId,
      vatPayableAccountId
    });
  }
}
