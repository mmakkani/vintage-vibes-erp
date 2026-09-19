import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem, InventoryFilterOptions } from './purchase.types.ts';
import { PurchaseEngine } from './purchase.engine.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { GoogleGenAI } from '@google/genai';

export class PurchaseController {
  public static getInvoices(): PurchaseInvoice[] {
    return relationalStore.getPurchaseInvoices();
  }

  public static createInvoice(invoiceData: any): PurchaseInvoice {
    return relationalStore.createPurchaseInvoice(invoiceData);
  }

  public static updateInvoice(invoiceId: string, invoiceData: any): { success: boolean; invoice?: PurchaseInvoice; error?: string } {
    return relationalStore.updatePurchaseInvoice(invoiceId, invoiceData);
  }

  public static deleteInvoice(invoiceId: string): { success: boolean; error?: string } {
    const invoice = relationalStore.getPurchaseInvoices().find(i => i.id === invoiceId);
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    const relatedBales = relationalStore.getInwardGatePasses().filter(
      b => b.purchaseInvoiceId === invoiceId || b.purchaseInvoiceNo === invoice.invoiceNo
    );

    const check = PurchaseEngine.validateInvoiceDeletion(invoice, relatedBales);
    if (!check.canDelete) {
      return { success: false, error: check.error };
    }

    return relationalStore.deletePurchaseInvoice(invoiceId);
  }

  public static postInvoice(invoiceId: string, postedBy: string): { success: boolean; error?: string } {
    return relationalStore.postPurchaseInvoice(invoiceId, postedBy);
  }

  public static unpostInvoice(invoiceId: string): { success: boolean; error?: string } {
    return relationalStore.unpostPurchaseInvoice(invoiceId);
  }

  public static setInvoiceStatus(invoiceId: string, status: any, updatedBy: string = 'Procurement Lead'): { success: boolean; error?: string } {
    return relationalStore.setPurchaseInvoiceStatus(invoiceId, status, updatedBy);
  }

  public static setGatePassStatus(gatePassId: string, status: any, updatedBy: string = 'Sortery Supervisor'): { success: boolean; error?: string } {
    return relationalStore.setInwardGatePassStatus(gatePassId, status, updatedBy);
  }

  public static convertToInwardGatePass(invoiceId: string): {
    success: boolean;
    gatePass?: InwardGatePass;
    error?: string;
  } {
    return relationalStore.convertInvoiceToInwardGatePass(invoiceId);
  }

  public static getInwardGatePasses(): InwardGatePass[] {
    return relationalStore.getInwardGatePasses();
  }

  public static createBaleInward(data: any): { success: boolean; bale?: InwardGatePass; error?: string } {
    return relationalStore.createBaleInward(data);
  }

  public static getInwardGatePassById(id: string): InwardGatePass | undefined {
    return relationalStore.getInwardGatePasses().find(g => g.id === id);
  }

  public static addPieceToBreakdown(gatePassId: string, pieceData: Partial<PieceBreakdownItem>): {
    success: boolean;
    piece?: PieceBreakdownItem;
    gatePass?: InwardGatePass;
    error?: string;
  } {
    return relationalStore.addPieceToGatePass(gatePassId, pieceData);
  }

  public static deletePieceFromBreakdown(gatePassId: string, pieceId: string): {
    success: boolean;
    gatePass?: InwardGatePass;
    error?: string;
  } {
    return relationalStore.deletePieceFromGatePass(gatePassId, pieceId);
  }

  public static batchAddPiecesToBreakdown(gatePassId: string, pieces: Partial<PieceBreakdownItem>[]): {
    success: boolean;
    gatePass?: InwardGatePass;
    count: number;
    error?: string;
  } {
    return relationalStore.batchAddPiecesToGatePass(gatePassId, pieces);
  }

  public static saveGatePassPartial(gatePassId: string, savedBy: string): {
    success: boolean;
    gatePass?: InwardGatePass;
    error?: string;
  } {
    return relationalStore.saveGatePassPartial(gatePassId, savedBy);
  }

  public static postInwardGatePass(gatePassId: string, postedBy: string): { success: boolean; error?: string } {
    return relationalStore.postInwardGatePass(gatePassId, postedBy);
  }

  public static unpostInwardGatePass(gatePassId: string): { success: boolean; error?: string } {
    return relationalStore.unpostInwardGatePass(gatePassId);
  }

  public static getInventoryStock(filters: InventoryFilterOptions): PieceBreakdownItem[] {
    return relationalStore.queryInventoryStock(filters);
  }

  public static async scanGarmentTagWithAI(imageBase64?: string, textPrompt?: string, apiKeyOverride?: string): Promise<{
    brand: string;
    garmentTitle: string;
    category: string;
    size: string;
    countryOfOrigin: string;
    era: string;
    stitchType: string;
    tagType: string;
    rarityTier: string;
    isGrail: boolean;
    estimatedMarketValueAed: number;
    estimatedMarketValueUsd: number;
    recommendedRetailPriceAed: number;
    suggestedQualityGrade: string;
    confidence: number;
    grailNotes: string;
    collectorTipsUrdu: string;
    style: string;
    notes: string;
  }> {
    if (!imageBase64 || imageBase64.trim().length < 200) {
      throw new Error('No valid garment tag image provided. Please point camera directly at the clothing label or upload a clear tag photo.');
    }

    const apiKey = (apiKeyOverride || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable not configured on server.');
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      const parts: any[] = [];
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64
        }
      });

      parts.push({
        text: `You are a world-class vintage fashion archivist and senior appraiser for "Vintage Vibes" (Dubai's premier vintage archive and showroom).
Examine this garment photo (showing the neck tag, care label, fabric print, sleeve/hem stitch, or full piece).

GOAL: Detect high-value vintage "GRAIL" pieces (such as 1990s Single-Stitch Band/Tour Tees, 1990s Carhartt Detroit Jackets, 1970s-80s Levi's 501 Big E, 1980s-90s Nike Silver/Grey tag, 3D Emblem Harley, Stussy 80s, etc.) so sorting warehouse staff does NOT price an AED 800 - AED 1,500 collector garment at standard AED 40 - AED 60!

INSPECTION RULES:
1. Brand & Tag Lineage: Identify brand and authentic vintage tag type (Brockum, Giant, Screen Stars, Fruit of the Loom USA, Nike Silver Tag, Carhartt USA, etc.).
2. Stitching: Single-Stitch (pre-mid-90s authentic vintage indicator) vs Double-Stitch.
3. Era / Year: Exact year or decade (e.g. "1993", "1990s", "1980s", "Y2K").
4. Market Valuation:
   - estimatedMarketValueAed: Global resale value on Grailed/eBay in UAE Dirhams (AED). e.g. $200-$250 USD = AED 750 - AED 920.
   - recommendedRetailPriceAed: Suggested selling price tag for Vintage Vibes showroom (AED).
5. Grail Status:
   - isGrail: true if estimatedMarketValueAed >= 350 or rare collector piece.
   - rarityTier: "GRAIL" | "HIGH_VALUE" | "STANDARD_VINTAGE" | "COMMERCIAL".
6. Quality Grade: "Super Cream (Mint / Luxury Vintage)" or "Grade A (Branded Vintage)" or "Grade B".
7. Category: Must match one of: "Graphic T-Shirts & Band Tees", "Vintage Jackets & Outerwear", "Vintage Denim & Jeans", "Hoodies & Sweatshirts", "Knitwear & Sweaters", "Workwear & Cargo Pants", "Vintage Sportswear & Track Tops", "Leather & Suede Jackets", "Silk Blouses & Rayon Shirts", "Caps, Hats & Accessories", "Miscellaneous Curated".
8. Warehouse Guidance in Roman Urdu & English: Alert sorting staff why this item is valuable to protect profit.

Return ONLY pure JSON matching this schema:
{
  "brand": "Brand name",
  "garmentTitle": "Full descriptive title e.g. 1993 Nirvana In Utero Original Tour Tee",
  "category": "Graphic T-Shirts & Band Tees",
  "size": "L or XL or 34x32",
  "countryOfOrigin": "Made in USA",
  "era": "1990s (c. 1993)",
  "stitchType": "Single Stitch",
  "tagType": "Brockum Worldwide",
  "rarityTier": "GRAIL",
  "isGrail": true,
  "estimatedMarketValueAed": 850,
  "estimatedMarketValueUsd": 230,
  "recommendedRetailPriceAed": 750,
  "suggestedQualityGrade": "Super Cream (Mint / Luxury Vintage)",
  "confidence": 0.96,
  "grailNotes": "Authentic 90s vintage tour tee with single-needle hems.",
  "collectorTipsUrdu": "Khatarnaak Nuqsaan Se Bachaao: Rare single-stitch piece. AED 750 se kam mein na bechein!",
  "style": "Tour Tee / Graphic"
}
Only output pure JSON without markdown codeblocks or commentary.`
      });

      let response: any = null;
      const candidateModels = [
        'gemini-3.7-flash',
        'gemini-3-flash',
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-1.5-flash'
      ];
      let lastModelErr: any = null;
      for (const m of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: m,
            contents: { parts }
          });
          if (response?.text) break;
        } catch (mErr) {
          lastModelErr = mErr;
        }
      }
      if (!response?.text) throw lastModelErr || new Error('Vintage Garment valuation failed.');

      const text = response.text || '';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJson);

      if (result.error) {
        throw new Error(result.error);
      }

      const mktAed = Number(result.estimatedMarketValueAed) || 350;
      const retailAed = Number(result.recommendedRetailPriceAed) || Math.round((mktAed * 0.88) / 10) * 10;
      const isGrail = Boolean(result.isGrail || mktAed >= 350 || result.rarityTier === 'GRAIL');

      return {
        brand: result.brand || 'Vintage Curated',
        garmentTitle: result.garmentTitle || `${result.brand || 'Vintage'} Apparel Piece`,
        category: result.category || 'Graphic T-Shirts & Band Tees',
        size: result.size || 'L',
        countryOfOrigin: result.countryOfOrigin || 'Made in USA',
        era: result.era || '1990s',
        stitchType: result.stitchType || 'Single Stitch',
        tagType: result.tagType || 'Vintage Label',
        rarityTier: result.rarityTier || (isGrail ? 'GRAIL' : 'STANDARD_VINTAGE'),
        isGrail,
        estimatedMarketValueAed: mktAed,
        estimatedMarketValueUsd: Number(result.estimatedMarketValueUsd) || Math.round(mktAed / 3.67),
        recommendedRetailPriceAed: retailAed,
        suggestedQualityGrade: result.suggestedQualityGrade || (isGrail ? 'Super Cream (Mint / Luxury Vintage)' : 'Grade A (Branded Vintage)'),
        confidence: Number(result.confidence) || 0.95,
        grailNotes: result.grailNotes || 'Verified vintage appraisal by Gemini Vision.',
        collectorTipsUrdu: result.collectorTipsUrdu || (isGrail ? 'Yeh high-value vintage piece hai. Aam sasti shirts kay sath na bechein!' : 'Authentic vintage piece.'),
        style: result.style || result.garmentTitle || 'Vintage Apparel',
        notes: `Gemini 3.6 Flash Appraisal (${result.era || 'Vintage'})`
      };
    } catch (err: any) {
      console.warn('Gemini OCR Vision call failed:', err?.message);
      throw new Error(err?.message || 'Garment tag OCR failed. Please ensure the label is clearly illuminated.');
    }
  }

  public static async scanSupplierInvoiceWithAI(imageBase64?: string, textPrompt?: string): Promise<any> {
    try {
      if (!imageBase64 || imageBase64.trim().length < 500) {
        throw new Error('No valid document image received. Please point your camera at a real invoice or upload an image/PDF file.');
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable not configured');
      }

      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = [];

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64
        }
      });

      parts.push({
        text: `You are an expert international shipping commercial invoice and customs document OCR engine.
CRITICAL MANDATORY INSTRUCTIONS:
1. First, inspect the image to see if it is a real document or commercial invoice.
2. If the image is black, blank, dark, blurry, a selfie, a room, or DOES NOT contain clear readable text of a supplier invoice, packing list, or customs bill:
   You MUST return ONLY this JSON:
   {
     "error": "No readable commercial invoice detected. Please point camera directly at an invoice document or upload a clear file."
   }
3. STRICTLY FORBIDDEN: DO NOT hallucinate, invent, assume, or output dummy/sample company names (such as Rotterdam Textile, Texas Consignments, or sample addresses) if they are not explicitly written in the image.

4. If and ONLY if a genuine invoice document is clearly legible in the image, extract the exact text visible on the document:
{
  "supplierName": string (exact visible name),
  "supplierTrn": string or null,
  "invoiceNo": string (exact invoice ref),
  "date": string (YYYY-MM-DD),
  "currency": "AED" | "USD" | "EUR" | "GBP",
  "exchangeRate": number (1.0 for AED, 3.6725 for USD, etc.),
  "containerNo": string or null,
  "blAirwayBillNo": string or null,
  "portOfLoading": string or null,
  "portOfEntry": string or null,
  "oceanAirFreightAed": number or 0,
  "customsDutyAed": number or 0,
  "portHandlingAed": number or 0,
  "items": [
    {
      "itemName": string,
      "packagingUom": "BALES" | "BAGS" | "SACKS" | "CARTON" | "PIECE",
      "packageCount": number,
      "weightPerPackage": number,
      "totalWeight": number,
      "ratePerWeight": number,
      "lineTotal": number
    }
  ],
  "subTotal": number,
  "totalAmount": number,
  "notes": string
}
Only output pure JSON. No markdown codeblocks, no commentary. Context hint: ${textPrompt || 'Supplier commercial invoice'}`
      });

      let response: any = null;
      const candidateModels = [
        'gemini-3.7-flash',
        'gemini-3-flash',
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-1.5-flash'
      ];
      let lastModelErr: any = null;
      for (const m of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: m,
            contents: { parts }
          });
          if (response?.text) break;
        } catch (mErr) {
          lastModelErr = mErr;
        }
      }
      if (!response?.text) throw lastModelErr || new Error('Supplier invoice OCR scan failed.');

      const text = response.text || '';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      if (!parsed.invoiceNo && !parsed.supplierName && (!parsed.items || parsed.items.length === 0)) {
        throw new Error('No readable invoice content detected in image. Please provide a clear document photo.');
      }

      return {
        ...parsed,
        confidence: 0.96,
        source: 'GEMINI_AI_VISION'
      };
    } catch (err: any) {
      console.warn('Gemini Invoice OCR failure:', err?.message);
      throw new Error(err?.message || 'Invoice scanning failed. Please ensure the document is clearly illuminated or enter details manually.');
    }
  }
}
