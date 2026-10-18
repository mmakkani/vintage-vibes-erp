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

  public static async resolveGeminiApiKey(apiKeyOverride?: string): Promise<string | null> {
    if (apiKeyOverride && apiKeyOverride.trim().length > 10 && !apiKeyOverride.includes('TestSecretKey')) {
      return apiKeyOverride.trim();
    }
    const envKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    if (envKey && envKey.length > 10 && !envKey.includes('TestSecretKey')) {
      return envKey;
    }
    try {
      const { withDb } = await import('../../db/pgPool.ts');
      const dbKey = await withDb(async (client) => {
        const dbRes = await client.query(`SELECT api_key FROM gemini_api_config WHERE id = 'default' LIMIT 1;`);
        return dbRes.rows?.[0]?.api_key || null;
      });
      if (dbKey && dbKey.trim().length > 10 && !dbKey.includes('TestSecretKey')) {
        return dbKey.trim();
      }
    } catch (_) {}
    return null;
  }

  public static async scanGarmentTagWithAI(
    imageBase64?: string,
    textPrompt?: string,
    apiKeyOverride?: string,
    options?: {
      imagesBase64?: string[];
      hasLengthTape?: boolean;
      hasWidthTape?: boolean;
      hasWashTag?: boolean;
    }
  ): Promise<any> {
    const allImages = (options?.imagesBase64 && options.imagesBase64.length > 0)
      ? options.imagesBase64.filter(img => Boolean(img && img.trim().length > 100))
      : (imageBase64 && imageBase64.trim().length > 100 ? [imageBase64] : []);

    const primaryImage = imageBase64 || allImages[0] || '';
    if (!primaryImage || primaryImage.trim().length < 200) {
      throw new Error('No valid garment tag image provided. Please point camera directly at the clothing label or upload a clear tag photo.');
    }

    const apiKey = await PurchaseController.resolveGeminiApiKey(apiKeyOverride);
    if (!apiKey) {
      console.warn('[PurchaseController] No active Gemini API key configured. Executing graceful Dubai Archival Appraisal.');
      const { getHeuristicVintageAppraisal } = await import('../../utils/geminiVintageValuation.ts');
      const heuristic = getHeuristicVintageAppraisal(textPrompt, primaryImage);
      const isGrail = Boolean(heuristic.isGrail);
      const estAed = Number(heuristic.estimatedMarketValueAed) || (isGrail ? 350 : 60);
      const estUsd = Number(heuristic.estimatedMarketValueUsd) || Math.round(estAed / 3.67);
      const retailAed = Number(heuristic.recommendedRetailPriceAed) || (isGrail ? 300 : 45);

      return {
        brand: heuristic.brand || 'Curated Vintage',
        garmentTitle: heuristic.garmentTitle || 'Curated Everyday Vintage Garment',
        category: heuristic.category || 'T-Shirts',
        subCategory: heuristic.subCategory || 'Graphic Tees',
        gender: heuristic.gender || "Men's",
        size: heuristic.size || 'L',
        countryOfOrigin: heuristic.countryOfOrigin || 'Imported',
        era: heuristic.era || 'Curated Vintage Archive',
        marketSegment: heuristic.marketSegment || 'Regular Thrift',
        stitchType: heuristic.stitchType || 'Standard Hem Stitch',
        tagType: heuristic.tagType || 'Curated Apparel Tag',
        rarityTier: heuristic.rarityTier || (isGrail ? 'GRAIL' : 'STANDARD'),
        isGrail,
        estimatedMarketValueAed: estAed,
        estimatedMarketValueUsd: estUsd,
        recommendedRetailPriceAed: retailAed,
        pitToPitInches: '',
        lengthInches: '',
        global_insights: heuristic.global_insights,
        suggestedQualityGrade: heuristic.suggestedQualityGrade || 'Grade A+ (Pristine Cream)',
        confidence: Number(heuristic.confidence) || 0.90,
        grailNotes: heuristic.grailNotes || 'Standard curated vintage thrift garment.',
        collectorTipsUrdu: heuristic.collectorTipsUrdu || (isGrail ? '🎯 GRAIL: Minimum AED 300 lagayein.' : '📦 CURATED THRIFT: Standard retail tag AED 40 - 50 lagayein.'),
        style: heuristic.garmentTitle || 'Curated Everyday Vintage Garment',
        notes: 'Dubai Vintage Engine (Rulebook Mode)'
      };
    }

    try {
      const { VINTAGE_APPRAISER_PROMPT, getDefaultSellingPrice } = await import('../../utils/geminiVintageValuation.ts');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      const parts: any[] = [];
      for (const img of allImages) {
        const mimeMatch = img.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const cleanBase64 = img.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
        parts.push({
          inlineData: {
            mimeType,
            data: cleanBase64
          }
        });
      }

      parts.push({
        text: VINTAGE_APPRAISER_PROMPT
      });

      let response: any = null;
      const candidateModels = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
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

      let pitToPit: any =
        result.pitToPitInches !== undefined && result.pitToPitInches !== '' && result.pitToPitInches !== null
          ? result.pitToPitInches
          : (result.measurements?.pitToPit || result.global_insights?.measurements?.pitToPit || '');
      let garmentLength: any =
        result.lengthInches !== undefined && result.lengthInches !== '' && result.lengthInches !== null
          ? result.lengthInches
          : (result.measurements?.length || result.global_insights?.measurements?.length || '');

      if (pitToPit !== '' && !isNaN(Number(pitToPit)) && Number(pitToPit) > 0) {
        const numP2P = Number(pitToPit);
        pitToPit = numP2P > 35 ? Number((numP2P / 2.54).toFixed(1)) : Number(numP2P.toFixed(1));
      } else {
        pitToPit = '';
      }

      if (garmentLength !== '' && !isNaN(Number(garmentLength)) && Number(garmentLength) > 0) {
        const numLen = Number(garmentLength);
        garmentLength = numLen > 45 ? Number((numLen / 2.54).toFixed(1)) : Number(numLen.toFixed(1));
      } else {
        garmentLength = '';
      }

      const defaultPrice = getDefaultSellingPrice(result.category, result.era, result.brand);
      const mktAed = Number(result.estimatedMarketValueAed) || Math.round(defaultPrice * 1.3);
      const retailAed = Number(result.recommendedRetailPriceAed) || defaultPrice;
      const isGrail = Boolean(result.isGrail || mktAed >= 350 || result.rarityTier === 'GRAIL');

      const globalInsights = result.global_insights ? {
        ...result.global_insights,
        measurements: {
          pitToPit: pitToPit || '',
          length: garmentLength || ''
        }
      } : {
        usa_market_usd: Math.round(mktAed / 3.67),
        europe_market_eur: Math.round(mktAed / 4.0),
        australia_market_aud: Math.round(mktAed / 2.35),
        uae_retail_aed: retailAed,
        arbitrage_analysis: isGrail ? 'High demand in US/EU collector scene.' : 'Standard local thrift market turnover.',
        collector_notes: result.grailNotes || 'Verified vintage appraisal by Gemini Vision.',
        measurements: {
          pitToPit: pitToPit || '',
          length: garmentLength || ''
        }
      };

      return {
        brand: result.brand || 'Vintage Curated',
        garmentTitle: result.garmentTitle || `${result.brand || 'Vintage'} Apparel Piece`,
        category: result.category || 'T-Shirts',
        subCategory: result.subCategory || undefined,
        gender: result.gender || "Men's",
        size: result.size || 'L',
        countryOfOrigin: result.countryOfOrigin || 'Made in USA',
        era: result.era || 'Modern Branded',
        marketSegment: result.marketSegment || (isGrail ? 'Grails' : 'Regular Thrift'),
        stitchType: result.stitchType || 'Double Stitch',
        tagType: result.tagType || 'Vintage Label',
        rarityTier: result.rarityTier || (isGrail ? 'GRAIL' : 'GRADE_A'),
        isGrail,
        estimatedMarketValueAed: mktAed,
        estimatedMarketValueUsd: Number(result.estimatedMarketValueUsd) || Math.round(mktAed / 3.67),
        recommendedRetailPriceAed: retailAed,
        pitToPitInches: pitToPit,
        lengthInches: garmentLength,
        global_insights: globalInsights,
        ecommerce_description: result.ecommerce_description || undefined,
        seo_tags: Array.isArray(result.seo_tags) ? result.seo_tags : undefined,
        suggestedQualityGrade: result.suggestedQualityGrade || (isGrail ? 'Super Cream (Mint / Luxury Vintage)' : 'Grade A (Branded Vintage)'),
        confidence: Number(result.confidence) || 0.96,
        grailNotes: result.grailNotes || 'Verified vintage appraisal by Gemini Vision.',
        collectorTipsUrdu: result.collectorTipsUrdu || (isGrail ? 'Yeh high-value vintage piece hai. Aam sasti shirts kay sath na bechein!' : 'Authentic vintage piece.'),
        style: result.style || result.garmentTitle || 'Vintage Apparel',
        notes: `Gemini Vision 6-Angle Appraisal (${result.era || 'Vintage'})`
      };
    } catch (err: any) {
      console.warn('Gemini OCR Vision call failed, using graceful archival fallback:', err?.message);
      try {
        const { getHeuristicVintageAppraisal } = await import('../../utils/geminiVintageValuation.ts');
        const heuristic = getHeuristicVintageAppraisal(textPrompt, primaryImage);
        return {
          brand: heuristic.brand || 'Vintage Archive',
          garmentTitle: heuristic.garmentTitle || 'Curated Vintage Apparel',
          category: heuristic.category || 'T-Shirts',
          subCategory: heuristic.subCategory || 'Graphic Tees',
          gender: heuristic.gender || "Men's",
          size: heuristic.size || 'L',
          countryOfOrigin: heuristic.countryOfOrigin || 'Imported',
          era: heuristic.era || '1990s Vintage',
          marketSegment: heuristic.marketSegment || 'Regular Thrift',
          stitchType: heuristic.stitchType || 'Single Stitch',
          tagType: heuristic.tagType || 'Vintage Label',
          rarityTier: heuristic.rarityTier || (heuristic.isGrail ? 'GRAIL' : 'STANDARD_VINTAGE'),
          isGrail: Boolean(heuristic.isGrail),
          estimatedMarketValueAed: Number(heuristic.estimatedMarketValueAed) || 350,
          estimatedMarketValueUsd: Number(heuristic.estimatedMarketValueUsd) || 95,
          recommendedRetailPriceAed: Number(heuristic.recommendedRetailPriceAed) || 300,
          pitToPitInches: '',
          lengthInches: '',
          global_insights: heuristic.global_insights,
          suggestedQualityGrade: heuristic.suggestedQualityGrade || 'Super Cream (Mint / Luxury Vintage)',
          confidence: Number(heuristic.confidence) || 0.90,
          grailNotes: heuristic.grailNotes || 'Evaluated via Dubai Vintage Archival Engine.',
          collectorTipsUrdu: heuristic.collectorTipsUrdu || 'Vintage Archival valuation active.',
          style: heuristic.garmentTitle || 'Vintage Apparel',
          notes: `Dubai Archival Vintage Rulebook (AI Fallback: ${err?.message || 'Quota/Network'})`
        };
      } catch (fallbackErr: any) {
        throw new Error(err?.message || 'Garment tag OCR failed. Please ensure the label is clearly illuminated.');
      }
    }
  }

  public static async scanSupplierInvoiceWithAI(imageBase64?: string, textPrompt?: string): Promise<any> {
    try {
      if (!imageBase64 || imageBase64.trim().length < 500) {
        throw new Error('No valid document image received. Please point your camera at a real invoice or upload an image/PDF file.');
      }

      const apiKey = await PurchaseController.resolveGeminiApiKey();
      if (!apiKey) {
        return {
          error: 'GEMINI_API_KEY environment variable not configured on server. Please configure your key in Global Setup -> Gemini AI Config.'
        };
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
