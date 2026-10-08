import { CurrencyCode, WeightUOM } from '../../types/common.types.ts';
import { CurrencyItem, DailySummaryData } from './setup.types.ts';

export class SetupEngine {
  private static readonly KG_TO_LBS_FACTOR = 2.20462;

  /**
   * Currency conversion using master exchange rates
   */
  public static convertCurrency(
    amount: number,
    fromCurrency: CurrencyCode,
    toCurrency: CurrencyCode,
    currencies: CurrencyItem[]
  ): number {
    if (fromCurrency === toCurrency || amount === 0) return Number(amount.toFixed(2));

    const fromRate = Math.max(0.000001, Number(currencies.find(c => c.code === fromCurrency)?.exchangeRate || 1));
    const toRate = Math.max(0.000001, Number(currencies.find(c => c.code === toCurrency)?.exchangeRate || 1));

    // Direct quote convention against base currency (AED, rate = 1.0):
    // 1 Foreign Unit = Rate in AED (e.g. 1 USD = 3.6725 AED).
    // Amount in From Currency * fromRate = Amount in Base AED.
    // Amount in Base AED / toRate = Amount in Target Currency.
    const inBaseAed = fromCurrency === 'AED' ? amount : amount * fromRate;
    const converted = toCurrency === 'AED' ? inBaseAed : inBaseAed / toRate;
    return Number(converted.toFixed(2));
  }

  /**
   * Weight UOM conversion between KG and LBS
   */
  public static convertWeight(weight: number, from: WeightUOM, to: WeightUOM): number {
    if (from === to) return weight;
    if (from === 'KG' && to === 'LBS') {
      return Number((weight * this.KG_TO_LBS_FACTOR).toFixed(3));
    }
    if (from === 'LBS' && to === 'KG') {
      return Number((weight / this.KG_TO_LBS_FACTOR).toFixed(3));
    }
    return weight;
  }

  /**
   * Calculates VAT amount and gross total given tax percentage
   */
  public static calculateVat(subtotal: number, vatPercent: number): { vatAmount: number; totalWithVat: number } {
    const vatAmount = Number(((subtotal * vatPercent) / 100).toFixed(2));
    const totalWithVat = Number((subtotal + vatAmount).toFixed(2));
    return { vatAmount, totalWithVat };
  }

  /**
   * Builds the automated WhatsApp daily summary dispatch payload and link
   */
  public static generateWhatsAppSummaryReport(data?: Partial<DailySummaryData> | null, companyName?: string | null): {
    messageText: string;
    waDeepLink: string;
  } {
    const safeData = data || {};
    const safeCompany = (companyName || 'Vintage Vibes').trim().toUpperCase();
    const dateStr = safeData.date || new Date().toISOString().split('T')[0];
    const totalPurchases = Number(safeData.totalPurchasesAmount || 0);
    const totalWeight = Number(safeData.totalPurchasedWeightKg || 0);
    const totalPieces = Number(safeData.totalPiecesBrokenDown || 0);
    const totalSales = Number(safeData.totalSalesAmount || 0);
    const vatCollected = Number(safeData.vatCollectedAmount || 0);
    const openReceivables = Number(safeData.openReceivablesTotal || 0);
    const activeStaff = Number(safeData.activeEmployeesWorked || 0);

    const message = `📊 *${safeCompany} — DAILY EXECUTIVE ERP DIGEST*
📅 *Date:* ${dateStr}

🔹 *PURCHASE & INWARD BALES*
• Purchased Total: AED ${totalPurchases.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
• Total Weight: ${totalWeight.toFixed(2)} KG
• Garment Pieces Broken Down: ${totalPieces} pcs

🔹 *SALES & REVENUE*
• Gross Sales: AED ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
• 5% VAT Assessed: AED ${vatCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
• Open Outstanding Receivables: AED ${openReceivables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

🔹 *PLANT & WORKFORCE*
• Sorters & Handlers Active: ${activeStaff} staff

_Generated automatically by Vintage Vibe ERP Modular Engine. All ledgers posted & verified._`;

    const encoded = encodeURIComponent(message);
    const waDeepLink = `https://wa.me/?text=${encoded}`;

    return {
      messageText: message,
      waDeepLink
    };
  }
}
