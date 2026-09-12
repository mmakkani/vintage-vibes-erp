import { Router } from 'express';
import { PurchaseController } from './purchase.controller.ts';
import { PurchaseService } from '../../services/purchaseService.ts';

export const purchaseRouter = Router();

purchaseRouter.get('/invoices', async (req, res) => {
  try {
    const list = await PurchaseService.getPurchaseInvoices();
    return res.json(list);
  } catch (_) {
    return res.json(PurchaseController.getInvoices());
  }
});

purchaseRouter.post('/invoices', async (req, res) => {
  try {
    const invoice = await PurchaseService.addPurchaseInvoice(req.body);
    return res.json(invoice);
  } catch (_) {
    const invoice = PurchaseController.createInvoice(req.body);
    return res.json(invoice);
  }
});

purchaseRouter.put('/invoices/:id', (req, res) => {
  const { id } = req.params;
  const result = PurchaseController.updateInvoice(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.delete('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.deletePurchaseInvoice(id);
    return res.json({ success: true });
  } catch (_) {
    const result = PurchaseController.deleteInvoice(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

purchaseRouter.post('/invoices/:id/post', async (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  try {
    await PurchaseService.postPurchaseInvoice(id);
    return res.json({ success: true });
  } catch (_) {
    const result = PurchaseController.postInvoice(id, postedBy || 'Procurement Mgr');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

purchaseRouter.post('/invoices/:id/unpost', async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.unpostPurchaseInvoice(id);
    return res.json({ success: true });
  } catch (_) {
    const result = PurchaseController.unpostInvoice(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

purchaseRouter.post('/invoices/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setInvoiceStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.put('/invoices/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setInvoiceStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post('/gate-passes/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setGatePassStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.put('/gate-passes/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setGatePassStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/invoices/:id/convert-inward', '/invoices/:id/convert-to-gate-pass'], async (req, res) => {
  const { id } = req.params;
  try {
    const gatePasses = await PurchaseService.convertToInwardGatePass(id);
    return res.json({ success: true, count: gatePasses.length, gatePasses });
  } catch (_) {
    const result = PurchaseController.convertToInwardGatePass(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

purchaseRouter.get(['/gate-passes', '/bales', '/'], async (req, res) => {
  try {
    const list = await PurchaseService.getInwardGatePasses();
    return res.json(list);
  } catch (_) {
    return res.json(PurchaseController.getInwardGatePasses());
  }
});

purchaseRouter.post(['/gate-passes/bale-inward', '/bales/inward', '/bales'], async (req, res) => {
  try {
    const item = await PurchaseService.addInwardGatePass(req.body);
    return res.json({ success: true, inwardPass: item });
  } catch (_) {
    const result = PurchaseController.createBaleInward(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

purchaseRouter.get(['/gate-passes/:id', '/bales/:id'], (req, res) => {
  const { id } = req.params;
  const gatePass = PurchaseController.getInwardGatePassById(id);
  if (!gatePass) return res.status(404).json({ error: 'Gate pass not found' });
  return res.json(gatePass);
});

purchaseRouter.post(['/gate-passes/:id/pieces', '/bales/:id/pieces'], (req, res) => {
  const { id } = req.params;
  const result = PurchaseController.addPieceToBreakdown(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.delete(['/gate-passes/:id/pieces/:pieceId', '/bales/:id/pieces/:pieceId'], (req, res) => {
  const { id, pieceId } = req.params;
  const result = PurchaseController.deletePieceFromBreakdown(id, pieceId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/pieces/batch', '/bales/:id/pieces/batch'], (req, res) => {
  const { id } = req.params;
  const { pieces } = req.body;
  const result = PurchaseController.batchAddPiecesToBreakdown(id, pieces);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/save-partial', '/bales/:id/save-partial'], (req, res) => {
  const { id } = req.params;
  const { savedBy } = req.body;
  const result = PurchaseController.saveGatePassPartial(id, savedBy || 'Sorting Supervisor');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/post', '/bales/:id/post'], (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const result = PurchaseController.postInwardGatePass(id, postedBy || 'Sortery Lead');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/unpost', '/bales/:id/unpost'], (req, res) => {
  const { id } = req.params;
  const result = PurchaseController.unpostInwardGatePass(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.get('/inventory', async (req, res) => {
  try {
    const list = await PurchaseService.getInventoryPieces();
    return res.json(list);
  } catch (_) {
    const filters = req.query as any;
    return res.json(PurchaseController.getInventoryStock(filters));
  }
});

purchaseRouter.get('/pieces', async (req, res) => {
  try {
    const list = await PurchaseService.getInventoryPieces();
    return res.json(list);
  } catch (_) {
    const filters = req.query as any;
    return res.json(PurchaseController.getInventoryStock(filters));
  }
});

purchaseRouter.post('/ai-ocr-scan', async (req, res) => {
  try {
    const { imageBase64, textPrompt } = req.body;
    const result = await PurchaseController.scanGarmentTagWithAI(imageBase64, textPrompt);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'OCR Processing failed' });
  }
});

purchaseRouter.post('/scan-invoice-ocr', async (req, res) => {
  try {
    const { imageBase64, textPrompt } = req.body;
    const result = await PurchaseController.scanSupplierInvoiceWithAI(imageBase64, textPrompt);
    return res.json({ success: true, data: result, confidence: result.confidence || 95 });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Invoice OCR Processing failed' });
  }
});

