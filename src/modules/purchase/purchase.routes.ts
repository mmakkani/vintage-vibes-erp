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
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to create invoice', message: err?.message });
  }
});

purchaseRouter.put('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const invoice = await PurchaseService.addPurchaseInvoice({ ...req.body, id });
    return res.json({ success: true, invoice });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to update invoice', message: err?.message });
  }
});

purchaseRouter.delete('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.deletePurchaseInvoice(id);
    return res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to delete invoice', message: err?.message });
  }
});

purchaseRouter.post('/invoices/:id/post', async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.postPurchaseInvoice(id);
    return res.json({ success: true, message: 'Invoice posted successfully' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to post invoice', message: err?.message });
  }
});

purchaseRouter.post('/invoices/:id/unpost', async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.unpostPurchaseInvoice(id);
    return res.json({ success: true, message: 'Invoice unposted successfully' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to unpost invoice', message: err?.message });
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
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (dbUrl && !dbUrl.includes('placeholder')) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      const q = await client.query('SELECT * FROM inward_gate_passes ORDER BY created_at DESC;');
      await client.end();
      if (q.rows && q.rows.length > 0) {
        const mapped = q.rows.map((row: any) => ({
          id: String(row.id),
          passNo: row.gate_pass_no || row.pass_no || `IGP-${String(row.id).slice(-6)}`,
          gatePassNo: row.gate_pass_no || row.pass_no || `IGP-${String(row.id).slice(-6)}`,
          baleCode: row.bale_code || row.bale_tag_no || `BAL-${String(row.id).slice(-6)}`,
          baleCategory: row.bale_category || 'Vintage Mixed Bales',
          purchaseInvoiceId: row.purchase_invoice_id || '',
          purchaseInvoiceNo: row.purchase_invoice_no || '',
          supplierName: row.supplier_name || 'Trade Supplier',
          date: (row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()).slice(0, 10),
          status: row.status || 'UNOPENED',
          sortingStatus: row.status || 'UNOPENED',
          totalBaleCost: Number(row.total_bale_cost ?? row.cost_price ?? 0),
          totalBaleWeight: Number(row.total_bale_weight ?? row.weight_kg ?? 0),
          costPerGram: Number(row.cost_per_gram ?? 0),
          brokenDownWeight: Number(row.broken_down_weight ?? 0),
          remainingWeight: Math.max(0, Number(row.total_bale_weight ?? row.weight_kg ?? 0) - Number(row.broken_down_weight ?? 0)),
          pieceCount: Number(row.piece_count ?? 0),
          pieces: Array.isArray(row.pieces) ? row.pieces : []
        }));
        return res.json(mapped);
      }
    }
  } catch (err: any) {
    console.warn('Postgres direct query notice on /gate-passes:', err?.message);
  }

  try {
    const list = await PurchaseService.getInwardGatePasses();
    if (list && list.length > 0) return res.json(list);
  } catch (_) {}

  return res.json(PurchaseController.getInwardGatePasses());
});

purchaseRouter.get(['/bale-presets', '/presets'], async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (dbUrl && !dbUrl.includes('placeholder')) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      const q = await client.query('SELECT * FROM bale_presets ORDER BY name ASC;');
      await client.end();
      if (q.rows && q.rows.length > 0) {
        const mapped = q.rows.map((r: any) => ({
          id: String(r.id),
          code: r.item_code || r.code || `BALE-${r.id}`,
          name: r.name,
          category: r.category || 'Apparel',
          uom: r.uom || 'BALES',
          targetUom: r.uom || 'BALES',
          stdWeight: Number(r.std_weight ?? 45),
          weightKg: Number(r.std_weight ?? 45),
          basePrice: Number(r.base_rate ?? 0),
          baseRate: Number(r.base_rate ?? 0),
          status: 'POSTED',
          isActive: true
        }));
        return res.json(mapped);
      }
    }
  } catch (err: any) {
    console.warn('Postgres direct query notice on /bale-presets:', err?.message);
  }

  try {
    const presets = await PurchaseService.getBalePresets();
    return res.json(presets);
  } catch (_) {
    return res.json([]);
  }
});

purchaseRouter.post(['/gate-passes/bale-inward', '/bales/inward', '/bales', '/gate-passes'], async (req, res) => {
  try {
    const item = await PurchaseService.addInwardGatePass(req.body);
    return res.json({ success: true, inwardPass: item, bale: item });
  } catch (err: any) {
    const result = PurchaseController.createBaleInward(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error || err?.message });
    }
    return res.json(result);
  }
});

purchaseRouter.delete(['/gate-passes/:id', '/bales/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.deleteInwardGatePass(id);
    return res.json({ success: true, message: 'Bale / Gate pass deleted successfully', id });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to delete gate pass' });
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

purchaseRouter.post(['/gate-passes/:id/pieces', '/bales/:id/pieces'], async (req, res) => {
  const { id } = req.params;
  try {
    const piece = await PurchaseService.addInventoryPiece({ ...req.body, gatePassId: id });
    return res.json({ success: true, piece });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

purchaseRouter.delete([
  '/gate-passes/:id/pieces/:pieceId',
  '/bales/:id/pieces/:pieceId',
  '/pieces/:pieceId',
  '/inventory/:pieceId',
  '/pieces/:id',
  '/inventory/:id'
], async (req, res) => {
  const targetPieceId = req.params.pieceId || req.params.id;
  const gatePassId = req.params.pieceId ? req.params.id : undefined;

  try {
    if (gatePassId) {
      try {
        PurchaseController.deletePieceFromBreakdown(gatePassId, targetPieceId);
      } catch (_) {}
    }
    await PurchaseService.deleteInventoryPiece(targetPieceId);
    return res.json({ success: true, message: 'Piece deleted successfully', pieceId: targetPieceId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

purchaseRouter.post('/inventory/cleanup-orphaned', async (req, res) => {
  try {
    const result = await PurchaseService.purgeOrphanedInventory();
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

purchaseRouter.delete('/inventory/cleanup-orphaned', async (req, res) => {
  try {
    const result = await PurchaseService.purgeOrphanedInventory();
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
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
    const apiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const result = await PurchaseController.scanGarmentTagWithAI(imageBase64, textPrompt, apiKey);
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

