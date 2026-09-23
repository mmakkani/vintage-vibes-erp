import { SalesGatePass, SalesInvoice, ParcelReturnRecord } from './sales.types.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export class SalesController {
  public static getGatePasses(): SalesGatePass[] {
    return relationalStore.getSalesGatePasses();
  }

  public static createGatePass(data: any): SalesGatePass {
    return relationalStore.createSalesGatePass(data);
  }

  public static addPieceToGatePass(gatePassId: string, barcode: string): {
    success: boolean;
    gatePass?: SalesGatePass;
    error?: string;
  } {
    return relationalStore.scanBarcodeToSalesGatePass(gatePassId, barcode);
  }

  public static postGatePass(gatePassId: string, postedBy: string): { success: boolean; error?: string } {
    return relationalStore.postSalesGatePass(gatePassId, postedBy);
  }

  public static unpostGatePass(gatePassId: string): { success: boolean; error?: string } {
    return relationalStore.unpostSalesGatePass(gatePassId);
  }

  public static convertGatePassToInvoice(gatePassId: string): {
    success: boolean;
    invoice?: SalesInvoice;
    error?: string;
  } {
    return relationalStore.convertSalesGatePassToInvoice(gatePassId);
  }

  public static getInvoices(): SalesInvoice[] {
    return relationalStore.getSalesInvoices();
  }

  public static createLiveSellingInvoice(data: any): {
    success: boolean;
    invoice?: SalesInvoice;
    error?: string;
  } {
    return relationalStore.createLiveSellingInvoice(data);
  }

  public static createDraftLiveInvoice(data: any) {
    return relationalStore.createDraftLiveInvoice(data);
  }

  public static updateDraftInvoice(invoiceId: string, updates: any) {
    return relationalStore.updateDraftSalesInvoice(invoiceId, updates);
  }

  public static cancelInvoice(invoiceId: string, cancelledBy?: string) {
    return relationalStore.cancelSalesInvoice(invoiceId, cancelledBy);
  }

  public static getParcelReturns(): ParcelReturnRecord[] {
    return relationalStore.getParcelReturns();
  }

  public static getParcelByTrackingOrInvoice(query: string) {
    return relationalStore.getParcelByTrackingOrInvoice(query);
  }

  public static processParcelReturn(data: any) {
    return relationalStore.processParcelReturn(data);
  }

  public static postInvoice(invoiceId: string, postedBy: string): { success: boolean; error?: string } {
    return relationalStore.postSalesInvoice(invoiceId, postedBy);
  }

  public static unpostInvoice(invoiceId: string): { success: boolean; error?: string } {
    return relationalStore.unpostSalesInvoice(invoiceId);
  }

  public static confirmCounterSale(data: any) {
    return relationalStore.confirmMultiItemCounterSaleAndPostCOA(data);
  }

  public static lookupPieceByBarcode(barcode: string) {
    const norm = barcode.trim().toLowerCase();
    const piece = relationalStore.getInventoryPieces().find(p => p.barcode.toLowerCase() === norm);
    if (!piece) {
      return { success: false, error: `SKU "${barcode}" not found in inventory database.` };
    }
    if (piece.isSold || piece.status === 'SOLD') {
      return { success: false, error: `SKU "${barcode}" (${piece.brandName} ${piece.itemName}) has already been SOLD.` };
    }
    if (piece.status === 'RESERVED') {
      return { success: false, error: `SKU "${barcode}" (${piece.brandName} ${piece.itemName}) is currently RESERVED in an active draft or cart.` };
    }
    if (piece.status !== 'IN_STOCK') {
      return { success: false, error: `SKU "${barcode}" is not available for sale (status: ${piece.status}).` };
    }
    return { success: true, piece };
  }

  // --- B2B Custom Corporate Sales ---
  public static getAvailableRawBales() {
    return relationalStore.getAvailableRawBales();
  }

  public static createOrUpdateCustomB2BInvoice(data: any) {
    return relationalStore.createOrUpdateCustomB2BSaleInvoice(data);
  }

  public static postCustomB2BInvoice(id: string, postedBy: string) {
    return relationalStore.postCustomB2BSaleInvoice(id, postedBy);
  }

  public static unpostCustomB2BInvoice(id: string) {
    return relationalStore.unpostCustomB2BSaleInvoice(id);
  }

  public static deleteDraftCustomB2BInvoice(id: string) {
    return relationalStore.deleteDraftCustomB2BSaleInvoice(id);
  }

  public static lookupB2BBarcode(barcode: string) {
    const norm = barcode.trim().toLowerCase();
    // 1. Check if raw bale
    const bale = relationalStore.getInwardGatePasses().find(
      b => (b.baleCode && b.baleCode.toLowerCase() === norm) ||
           b.gatePassNo.toLowerCase() === norm ||
           b.id.toLowerCase() === norm
    );
    if (bale) {
      if (bale.status === 'SOLD_AS_BALE') {
        return { success: false, error: `Raw Bale "${bale.baleCode || bale.gatePassNo}" is already marked as SOLD!` };
      }
      return {
        success: true,
        isRawBale: true,
        bale: {
          id: bale.id,
          baleCode: bale.baleCode || bale.gatePassNo,
          category: bale.baleCategory,
          supplierName: bale.supplierName,
          grossWeightKg: bale.totalBaleWeight,
          costPerGram: bale.costPerGram,
          landedCostAed: bale.totalBaleCost,
          suggestedPriceAed: Math.round(Number(bale.totalBaleCost || 2000) * 1.35)
        }
      };
    }

    // 2. Check if sorted garment piece
    const piece = relationalStore.getInventoryPieces().find(p => p.barcode.toLowerCase() === norm);
    if (piece) {
      if (piece.isSold || piece.status === 'SOLD') {
        return { success: false, error: `Garment Piece "${piece.barcode}" (${piece.brandName} ${piece.itemName}) has already been SOLD!` };
      }
      if (piece.status === 'RESERVED') {
        return { success: false, error: `Garment Piece "${piece.barcode}" (${piece.brandName} ${piece.itemName}) is currently RESERVED in another draft or cart!` };
      }
      if (piece.status !== 'IN_STOCK') {
        return { success: false, error: `Garment Piece "${piece.barcode}" is not available for sale (status: ${piece.status}).` };
      }
      const grams = piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000);
      const cogs = piece.calculatedCostPrice || piece.costPrice || (piece.costPerGram ? Number((grams * piece.costPerGram).toFixed(2)) : 18.5);
      return {
        success: true,
        isRawBale: false,
        piece: {
          id: piece.id,
          barcode: piece.barcode,
          brandName: piece.brandName,
          itemName: piece.itemName,
          size: piece.sizeScanned,
          labelGrade: piece.labelGrade,
          weightGrams: grams,
          weightKg: piece.weightKg,
          calculatedCostPrice: cogs,
          suggestedPriceAed: piece.retailPriceAed || piece.estimatedPrice || Math.round(cogs * 2.5)
        }
      };
    }

    return { success: false, error: `Barcode "${barcode}" does not match any Raw Bale or Garment Piece in warehouse inventory.` };
  }
}
