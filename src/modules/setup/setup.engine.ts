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
    if (fromCurrency === toCurrency) return amount;

    const fromRate = currencies.find(c => c.code === fromCurrency)?.exchangeRate || 1;
    const toRate = currencies.find(c => c.code === toCurrency)?.exchangeRate || 1;

    // Convert from source to base (AED) then base to target
    const inBaseAed = amount / fromRate;
    const converted = inBaseAed * toRate;
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
  public static generateWhatsAppSummaryReport(data: DailySummaryData, companyName: string): {
    messageText: string;
    waDeepLink: string;
  } {
    const message = `📊 *${companyName.toUpperCase()} — DAILY EXECUTIVE ERP DIGEST*
📅 *Date:* ${data.date}

🔹 *PURCHASE & INWARD BALES*
• Purchased Total: AED ${data.totalPurchasesAmount.toLocaleString()}
• Total Weight: ${data.totalPurchasedWeightKg.toFixed(2)} KG
• Garment Pieces Broken Down: ${data.totalPiecesBrokenDown} pcs

🔹 *SALES & REVENUE*
• Gross Sales: AED ${data.totalSalesAmount.toLocaleString()}
• 5% VAT Assessed: AED ${data.vatCollectedAmount.toLocaleString()}
• Open Outstanding Receivables: AED ${data.openReceivablesTotal.toLocaleString()}

🔹 *PLANT & WORKFORCE*
• Sorters & Handlers Active: ${data.activeEmployeesWorked} staff

_Generated automatically by Vintage Vibe ERP Modular Engine. All ledgers posted & verified._`;

    const encoded = encodeURIComponent(message);
    const waDeepLink = `https://wa.me/?text=${encoded}`;

    return {
      messageText: message,
      waDeepLink
    };
  }
}
