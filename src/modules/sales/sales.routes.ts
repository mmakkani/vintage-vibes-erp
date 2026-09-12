import { Router } from 'express';
import { SalesController } from './sales.controller.ts';
import { SalesService } from '../../services/salesService.ts';

export const salesRouter = Router();

salesRouter.get('/gate-passes', (req, res) => {
  return res.json(SalesController.getGatePasses());
});

salesRouter.post('/gate-passes', (req, res) => {
  return res.json(SalesController.createGatePass(req.body));
});

salesRouter.post('/gate-passes/:id/scan', (req, res) => {
  const { id } = req.params;
  const { barcode } = req.body;
  const result = SalesController.addPieceToGatePass(id, barcode);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/gate-passes/:id/post', (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const result = SalesController.postGatePass(id, postedBy || 'Sales Manager');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/gate-passes/:id/unpost', (req, res) => {
  const { id } = req.params;
  const result = SalesController.unpostGatePass(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/gate-passes/:id/convert-invoice', (req, res) => {
  const { id } = req.params;
  const result = SalesController.convertGatePassToInvoice(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.get('/invoices', async (req, res) => {
  try {
    const list = await SalesService.getSalesInvoices();
    return res.json(list);
  } catch (_) {
    return res.json(SalesController.getInvoices());
  }
});

salesRouter.post('/invoices', async (req, res) => {
  try {
    const inv = await SalesService.createSalesInvoice(req.body);
    return res.json(inv);
  } catch (_) {
    const inv = SalesController.createSalesInvoice(req.body);
    return res.json(inv);
  }
});

salesRouter.get('/pos', async (req, res) => {
  try {
    const list = await SalesService.getPosSales();
    return res.json(list);
  } catch (_) {
    return res.json([]);
  }
});

salesRouter.get('/b2b', async (req, res) => {
  try {
    const list = await SalesService.getB2bSales();
    return res.json(list);
  } catch (_) {
    return res.json([]);
  }
});

salesRouter.get('/orders', async (req, res) => {
  try {
    const list = await SalesService.getOrders();
    return res.json(list);
  } catch (_) {
    return res.json([]);
  }
});

salesRouter.post('/live-checkout', (req, res) => {
  const result = SalesController.createLiveSellingInvoice(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/live-draft-invoice', (req, res) => {
  const result = SalesController.createDraftLiveInvoice(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.put('/invoices/:id/draft', (req, res) => {
  const { id } = req.params;
  const result = SalesController.updateDraftInvoice(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/invoices/:id/draft', (req, res) => {
  const { id } = req.params;
  const result = SalesController.updateDraftInvoice(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/invoices/:id/cancel', (req, res) => {
  const { id } = req.params;
  const { cancelledBy } = req.body;
  const result = SalesController.cancelInvoice(id, cancelledBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

// Parcel Return & RTO Management Endpoints
salesRouter.get('/returns', (req, res) => {
  return res.json(SalesController.getParcelReturns());
});

salesRouter.get('/returns/lookup', (req, res) => {
  const query = String(req.query.query || '');
  const result = SalesController.getParcelByTrackingOrInvoice(query);
  if (!result.found) {
    return res.status(404).json(result);
  }
  return res.json(result);
});

salesRouter.post('/returns/process', (req, res) => {
  const result = SalesController.processParcelReturn(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/invoices/:id/post', (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const result = SalesController.postInvoice(id, postedBy || 'Accounts Lead');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/invoices/:id/unpost', (req, res) => {
  const { id } = req.params;
  const result = SalesController.unpostInvoice(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

// Retail POS Counter Sale Endpoints
salesRouter.post('/counter-sale/checkout', (req, res) => {
  const result = SalesController.confirmCounterSale(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.get('/counter-sale/scan/:barcode', (req, res) => {
  const { barcode } = req.params;
  const result = SalesController.lookupPieceByBarcode(barcode);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
});

// B2B Custom Corporate Sales Endpoints
salesRouter.get('/custom-b2b/available-bales', (req, res) => {
  return res.json(SalesController.getAvailableRawBales());
});

salesRouter.get('/custom-b2b/scan/:barcode', (req, res) => {
  const { barcode } = req.params;
  const result = SalesController.lookupB2BBarcode(barcode);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/custom-b2b/save', (req, res) => {
  const result = SalesController.createOrUpdateCustomB2BInvoice(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/custom-b2b/:id/post', (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const result = SalesController.postCustomB2BInvoice(id, postedBy || 'Sales Lead');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/custom-b2b/:id/unpost', (req, res) => {
  const { id } = req.params;
  const result = SalesController.unpostCustomB2BInvoice(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.delete('/custom-b2b/:id', (req, res) => {
  const { id } = req.params;
  const result = SalesController.deleteDraftCustomB2BInvoice(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});
