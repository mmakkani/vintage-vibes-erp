import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem } from './purchase.types.ts';

export class PurchaseEngine {
  /**
   * Calculates base cost per gram from total bale cost and weight:
   * Cost_per_Gram = Total_Bale_Cost / (Total_Bale_Weight_KG * 1000)
   */
  public static calculateCostPerGram(totalBaleCost?: number, totalBaleWeightKg?: number): number {
    const cost = Number(totalBaleCost || 0);
    const weight = Number(totalBaleWeightKg || 0);
    if (weight <= 0 || cost <= 0) return 0;
    const totalGrams = weight * 1000;
    return Number((cost / totalGrams).toFixed(6));
  }

  /**
   * Calculates piece cost from weight in grams and cost per gram:
   * Piece_Cost = Piece_Weight_Grams * Cost_per_Gram
   */
  public static calculatePieceCost(weightGrams: number, costPerGram: number): number {
    return Number((Number(weightGrams || 0) * Number(costPerGram || 0)).toFixed(2));
  }

  /**
   * Comprehensive live weight depletion and sorting status engine
   */
  public static calculateBaleDepletion(
    totalBaleWeightKg: number,
    pieces: { weightKg?: number; weightGrams?: number }[] = []
  ): {
    totalBaleWeightKg: number;
    totalBaleGrams: number;
    brokenDownWeightKg: number;
    brokenDownGrams: number;
    remainingWeightKg: number;
    remainingGrams: number;
    pieceCount: number;
    percentCompleted: number;
    isOverWeight: boolean;
    sortingStatus: 'UNOPENED' | 'PARTIALLY_SORTED' | 'FULLY_SORTED';
  } {
    const totalBaleGrams = Math.round((Number(totalBaleWeightKg) || 0) * 1000);
    const brokenDownGrams = pieces.reduce((sum, p) => {
      if (p.weightGrams !== undefined && p.weightGrams !== null && p.weightGrams > 0) {
        return sum + Number(p.weightGrams);
      }
      if (p.weightKg !== undefined && p.weightKg !== null && p.weightKg > 0) {
        return sum + Math.round(Number(p.weightKg) * 1000);
      }
      return sum;
    }, 0);

    const brokenDownWeightKg = Number((brokenDownGrams / 1000).toFixed(3));
    const remainingGrams = totalBaleGrams - brokenDownGrams;
    const remainingWeightKg = Number((remainingGrams / 1000).toFixed(3));
    const isOverWeight = remainingGrams < 0;
    const pieceCount = pieces.length;

    let percentCompleted = totalBaleGrams > 0 ? Math.min(100, Math.max(0, Math.round((brokenDownGrams / totalBaleGrams) * 100))) : 0;
    let sortingStatus: 'UNOPENED' | 'PARTIALLY_SORTED' | 'FULLY_SORTED' = 'UNOPENED';

    if (pieceCount > 0 && brokenDownGrams >= totalBaleGrams - 100) {
      sortingStatus = 'FULLY_SORTED';
      percentCompleted = 100;
    } else if (pieceCount > 0) {
      sortingStatus = 'PARTIALLY_SORTED';
    }

    return {
      totalBaleWeightKg: Number(totalBaleWeightKg) || 0,
      totalBaleGrams,
      brokenDownWeightKg,
      brokenDownGrams,
      remainingWeightKg,
      remainingGrams,
      pieceCount,
      percentCompleted,
      isOverWeight,
      sortingStatus
    };
  }

  /**
   * Recalculates real-time sack weight deduction as pieces are entered in the breakdown grid
   */
  public static calculateSackWeightDeduction(
    totalBaleWeight: number,
    pieces: { weightKg?: number; weightGrams?: number }[]
  ): { brokenDownWeight: number; remainingWeight: number; isOverWeight: boolean } {
    const depletion = this.calculateBaleDepletion(totalBaleWeight, pieces);
    return {
      brokenDownWeight: depletion.brokenDownWeightKg,
      remainingWeight: depletion.remainingWeightKg,
      isOverWeight: depletion.isOverWeight
    };
  }

  /**
   * Barcode Engine: Generates unique standard barcode for apparel piece (e.g. VV-B01-0042)
   */
  public static generatePieceBarcode(baleCodeOrGatePassNo: string, index: number): string {
    const paddedIndex = String(index).padStart(4, '0');
    if (baleCodeOrGatePassNo.startsWith('VV-')) {
      return `${baleCodeOrGatePassNo}-${paddedIndex}`;
    }
    const cleanNo = baleCodeOrGatePassNo.replace(/[^a-zA-Z0-9]/g, '');
    return `VV-${cleanNo}-${paddedIndex}`;
  }

  /**
   * Calculates intelligent suggested selling price for vintage pieces based on brand & grade tiers
   */
  public static calculateEstimatedSellingPrice(
    basePrice: number,
    brandTier: string,
    labelGrade: string
  ): number {
    let brandMultiplier = 1.0;
    if (brandTier.toLowerCase().includes('grail') || brandTier.toLowerCase().includes('designer')) {
      brandMultiplier = 2.4;
    } else if (brandTier.toLowerCase().includes('premium')) {
      brandMultiplier = 1.6;
    } else if (brandTier.toLowerCase().includes('workwear') || brandTier.toLowerCase().includes('streetwear')) {
      brandMultiplier = 1.35;
    }

    let gradeMultiplier = 1.0;
    if (labelGrade.toLowerCase().includes('cream') || labelGrade.toLowerCase().includes('grade a')) {
      gradeMultiplier = 1.5;
    } else if (labelGrade.toLowerCase().includes('grail') || labelGrade.toLowerCase().includes('selection')) {
      gradeMultiplier = 2.0;
    } else if (labelGrade.toLowerCase().includes('grade b')) {
      gradeMultiplier = 0.9;
    }

    const calculated = basePrice * brandMultiplier * gradeMultiplier;
    // Round to clean retail ending (e.g. .00 or .50)
    return Math.max(25, Number((Math.round(calculated / 5) * 5).toFixed(2)));
  }

  /**
   * Validates if an invoice can be deleted:
   * Allowed ONLY if NO sorting has occurred yet on any of the bales generated from this invoice.
   * If any bale has sorted pieces (> 0 pieces or > 0kg broken down), deletion is strictly blocked
   * until all pieces are completely deleted.
   */
  public static validateInvoiceDeletion(
    invoice: PurchaseInvoice,
    relatedBales: InwardGatePass[] = []
  ): { canDelete: boolean; error?: string; sortedPiecesCount?: number } {
    const sortedPiecesCount = relatedBales.reduce(
      (sum, b) => sum + (b.pieces?.length || b.pieceCount || 0),
      0
    );
    const sortedWeightKg = relatedBales.reduce(
      (sum, b) => sum + (b.brokenDownWeight || 0),
      0
    );

    if (sortedPiecesCount > 0 || sortedWeightKg > 0) {
      return {
        canDelete: false,
        sortedPiecesCount,
        error: `Cannot delete invoice ${invoice.invoiceNo} because sorting has already started (${sortedPiecesCount} pieces sorted, ${sortedWeightKg.toFixed(2)} KG). You must first delete all sorted pieces in the Bale Sorting Terminal.`
      };
    }

    return { canDelete: true, sortedPiecesCount: 0 };
  }

  /**
   * Validates if an invoice can be edited:
   * Allowed ONLY if NO sorting has occurred yet on any of the bales generated from this invoice.
   */
  public static validateInvoiceModification(
    invoice: PurchaseInvoice,
    relatedBales: InwardGatePass[] = []
  ): { canEdit: boolean; error?: string; sortedPiecesCount?: number } {
    const sortedPiecesCount = relatedBales.reduce(
      (sum, b) => sum + (b.pieces?.length || b.pieceCount || 0),
      0
    );
    const sortedWeightKg = relatedBales.reduce(
      (sum, b) => sum + (b.brokenDownWeight || 0),
      0
    );

    if (sortedPiecesCount > 0 || sortedWeightKg > 0) {
      return {
        canEdit: false,
        sortedPiecesCount,
        error: `Cannot edit invoice ${invoice.invoiceNo} because sorting has already started (${sortedPiecesCount} pieces sorted, ${sortedWeightKg.toFixed(2)} KG). You must delete all sorted pieces in the Bale Sorting Terminal before making changes.`
      };
    }

    return { canEdit: true, sortedPiecesCount: 0 };
  }

  /**
   * AI OCR extraction fallback parser for garment tags
   */
  public static parseOCRTagData(text: string): {
    brand: string;
    size: string;
    countryOfOrigin: string;
    style: string;
  } {
    let brand = 'Vintage Archive';
    let size = 'L';
    let countryOfOrigin = 'Made in USA';
    let style = 'Vintage Classic';

    const clean = text.toUpperCase();

    // Brand detection
    if (clean.includes("LEVI") || clean.includes("501")) brand = "Levi's";
    else if (clean.includes("CARHARTT")) brand = "Carhartt";
    else if (clean.includes("RALPH") || clean.includes("POLO")) brand = "Ralph Lauren";
    else if (clean.includes("NIKE")) brand = "Nike";
    else if (clean.includes("CHAMPION")) brand = "Champion";
    else if (clean.includes("WRANGLER")) brand = "Wrangler";
    else if (clean.includes("HARLEY")) brand = "Harley Davidson";
    else if (clean.includes("PATAGONIA")) brand = "Patagonia";
    else if (clean.includes("NORTH FACE")) brand = "The North Face";

    // Size detection
    if (clean.match(/\b(XXL|2XL)\b/)) size = '2XL';
    else if (clean.match(/\bXL\b/)) size = 'XL';
    else if (clean.match(/\bL\b/) || clean.match(/\bLARGE\b/)) size = 'L';
    else if (clean.match(/\bM\b/) || clean.match(/\bMEDIUM\b/)) size = 'M';
    else if (clean.match(/\bS\b/) || clean.match(/\bSMALL\b/)) size = 'S';
    else if (clean.match(/\b\d{2}X\d{2}\b/)) {
      const match = clean.match(/\b\d{2}X\d{2}\b/);
      if (match) size = match[0];
    }

    // Country of Origin detection
    if (clean.includes("MADE IN USA") || clean.includes("U.S.A.")) countryOfOrigin = 'Made in USA';
    else if (clean.includes("JAPAN")) countryOfOrigin = 'Made in Japan';
    else if (clean.includes("ITALY") || clean.includes("ITALIA")) countryOfOrigin = 'Made in Italy';
    else if (clean.includes("MEXICO")) countryOfOrigin = 'Made in Mexico';
    else if (clean.includes("PORTUGAL")) countryOfOrigin = 'Made in Portugal';
    else if (clean.includes("FRANCE")) countryOfOrigin = 'Made in France';

    // Style
    if (clean.includes("DENIM") || clean.includes("TRUCKER")) style = 'Vintage Denim Trucker Jacket';
    else if (clean.includes("WOOL") || clean.includes("KNIT")) style = 'Heavyweight Knitwear';
    else if (clean.includes("FLEECE") || clean.includes("SYNCHILLA")) style = 'Retro Deep-Pile Fleece';
    else if (clean.includes("TEE") || clean.includes("COTTON")) style = 'Single Stitch Graphic Tee';
    else if (clean.includes("SWEATSHIRT") || clean.includes("REVERSE WEAVE")) style = 'Reverse Weave Crewneck';

    return { brand, size, countryOfOrigin, style };
  }
}
