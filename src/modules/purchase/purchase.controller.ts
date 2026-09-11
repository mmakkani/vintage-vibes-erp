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

  public static async scanGarmentTagWithAI(imageBase64?: string, textPrompt?: string): Promise<{
    brand: string;
    size: string;
    countryOfOrigin: string;
    style: string;
    confidence: number;
    notes: string;
  }> {
    if (!imageBase64 || imageBase64.trim().length < 500) {
      throw new Error('No valid garment tag image provided. Please point camera directly at the clothing label or upload a clear tag photo.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
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
        text: `You are an expert vintage apparel OCR specialist. Inspect this physical clothing tag/label image.
CRITICAL MANDATORY RULES:
1. If the image is black, blank, dark, blurry, or DOES NOT clearly display a physical clothing neck tag, care label, or brand stamp:
   You MUST return ONLY this JSON:
   {
     "error": "No readable garment tag or care label detected. Please ensure the tag is well-lit and clearly centered."
   }
2. STRICTLY FORBIDDEN: DO NOT hallucinate, invent, or output dummy/sample brand names (e.g. Levi's or Ralph Lauren) unless clearly visible on the tag.
3. If and ONLY if a physical garment tag is clearly legible:
{
  "brand": "Exact brand name visible on tag",
  "size": "Exact size visible (e.g. L, XL, 34x32)",
  "countryOfOrigin": "Country of manufacture (e.g. Made in USA, Made in Japan)",
  "style": "Garment style description or RN number",
  "confidence": 0.95
}
Only output pure JSON without markdown codeblocks or commentary.`
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts }
      });

      const text = response.text || '';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJson);

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.brand && !result.size && !result.countryOfOrigin) {
        throw new Error('Could not identify apparel tag text in the provided image.');
      }

      return {
        brand: result.brand || '',
        size: result.size || '',
        countryOfOrigin: result.countryOfOrigin || '',
        style: result.style || '',
        confidence: Number(result.confidence) || 0.95,
        notes: 'Extracted with Gemini 3.8 Flash Vision OCR'
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

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts }
      });

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
