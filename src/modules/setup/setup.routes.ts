import { Router } from 'express';
import { SetupController } from './setup.controller.ts';

export const setupRouter = Router();

// Company profile (supports both /company and /company-profile)
setupRouter.get(['/company', '/company-profile'], (req, res) => {
  return res.json(SetupController.getCompanyProfile());
});

setupRouter.put(['/company', '/company-profile'], (req, res) => {
  return res.json(SetupController.updateCompanyProfile(req.body));
});

// Live Streaming Multicast Gateway (Restream / Livepush / Ingest Key)
setupRouter.get('/live-multicast', (req, res) => {
  return res.json(SetupController.getLiveMulticastConfig());
});

setupRouter.put('/live-multicast', (req, res) => {
  return res.json(SetupController.updateLiveMulticastConfig(req.body));
});

// Multi-Booth Live Stream Relays (Booth 1 to Booth 5)
setupRouter.get('/live-booths', (req, res) => {
  return res.json(SetupController.getLiveBoothConfigs());
});

setupRouter.get('/live-booths/:boothId', (req, res) => {
  const cfg = SetupController.getLiveBoothConfig(req.params.boothId);
  if (!cfg) return res.status(404).json({ error: 'Booth not found' });
  return res.json(cfg);
});

setupRouter.put('/live-booths/:boothId', (req, res) => {
  return res.json(SetupController.updateLiveBoothConfig(req.params.boothId, req.body));
});

// Currencies & FX (supports both /currencies and /currency)
setupRouter.get(['/currencies', '/currency'], (req, res) => {
  return res.json(SetupController.getCurrencies());
});

setupRouter.post(['/currencies', '/currency'], (req, res) => {
  return res.json(SetupController.addCurrency(req.body));
});

setupRouter.put('/currency', (req, res) => {
  const { code, exchangeRate, rate } = req.body;
  return res.json(SetupController.updateCurrencyRate(code, Number(exchangeRate ?? rate)));
});

setupRouter.put('/currencies/:code', (req, res) => {
  const { code } = req.params;
  const { rate, exchangeRate } = req.body;
  return res.json(SetupController.updateCurrencyRate(code, Number(rate ?? exchangeRate)));
});

setupRouter.delete(['/currencies/:code', '/currency/:code'], (req, res) => {
  const { code } = req.params;
  const success = SetupController.deleteCurrency(code);
  return res.json({ success });
});

setupRouter.get(['/items', '/item-master'], (req, res) => {
  return res.json(SetupController.getItemMasters());
});

setupRouter.post(['/items', '/item-master'], (req, res) => {
  return res.json(SetupController.addItemMaster(req.body));
});

setupRouter.put(['/items/:id', '/item-master/:id'], (req, res) => {
  const updated = SetupController.updateItemMaster(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Item not found' });
  return res.json(updated);
});

setupRouter.delete(['/items/:id', '/item-master/:id'], (req, res) => {
  const success = SetupController.deleteItemMaster(req.params.id);
  return res.json({ success });
});

setupRouter.post(['/items/:id/post', '/item-master/:id/post'], (req, res) => {
  const updated = SetupController.postItemMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Item not found' });
  return res.json(updated);
});

setupRouter.post(['/items/:id/unpost', '/item-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostItemMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Item not found' });
  return res.json(updated);
});

// Labels
setupRouter.get(['/labels', '/label-grade', '/labels-grade'], (req, res) => {
  return res.json(SetupController.getLabelGrades());
});

setupRouter.post(['/labels', '/label-grade', '/labels-grade'], (req, res) => {
  return res.json(SetupController.addLabelGrade(req.body));
});

setupRouter.put(['/labels/:id', '/label-grade/:id'], (req, res) => {
  const updated = SetupController.updateLabelGrade(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Label grade not found' });
  return res.json(updated);
});

setupRouter.delete(['/labels/:id', '/label-grade/:id'], (req, res) => {
  const success = SetupController.deleteLabelGrade(req.params.id);
  return res.json({ success });
});

setupRouter.post(['/labels/:id/post', '/label-grade/:id/post'], (req, res) => {
  const updated = SetupController.postLabelGrade(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Label grade not found' });
  return res.json(updated);
});

setupRouter.post(['/labels/:id/unpost', '/label-grade/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostLabelGrade(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Label grade not found' });
  return res.json(updated);
});

// Brands
setupRouter.get(['/brands', '/brand-master'], (req, res) => {
  return res.json(SetupController.getBrandMasters());
});

setupRouter.post(['/brands', '/brand-master'], (req, res) => {
  return res.json(SetupController.addBrandMaster(req.body));
});

setupRouter.put(['/brands/:id', '/brand-master/:id'], (req, res) => {
  const updated = SetupController.updateBrandMaster(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
  return res.json(updated);
});

setupRouter.delete(['/brands/:id', '/brand-master/:id'], (req, res) => {
  const success = SetupController.deleteBrandMaster(req.params.id);
  return res.json({ success });
});

setupRouter.post(['/brands/:id/post', '/brand-master/:id/post'], (req, res) => {
  const updated = SetupController.postBrandMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
  return res.json(updated);
});

setupRouter.post(['/brands/:id/unpost', '/brand-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostBrandMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
  return res.json(updated);
});

// Shops & Racks
setupRouter.get(['/shops', '/shop-master'], (req, res) => {
  return res.json(SetupController.getShopMasters());
});

setupRouter.post(['/shops', '/shop-master'], (req, res) => {
  return res.json(SetupController.addShopMaster(req.body));
});

setupRouter.put(['/shops/:id', '/shop-master/:id'], (req, res) => {
  const updated = SetupController.updateShopMaster(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Shop not found' });
  return res.json(updated);
});

setupRouter.delete(['/shops/:id', '/shop-master/:id'], (req, res) => {
  const success = SetupController.deleteShopMaster(req.params.id);
  return res.json({ success });
});

setupRouter.post(['/shops/:id/post', '/shop-master/:id/post'], (req, res) => {
  const updated = SetupController.postShopMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Shop not found' });
  return res.json(updated);
});

setupRouter.post(['/shops/:id/unpost', '/shop-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostShopMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Shop not found' });
  return res.json(updated);
});

// Garment Categories
setupRouter.get(['/categories', '/category-master'], (req, res) => {
  return res.json(SetupController.getCategories());
});

setupRouter.post(['/categories', '/category-master'], (req, res) => {
  return res.json(SetupController.addCategory(req.body));
});

setupRouter.put(['/categories/:id', '/category-master/:id'], (req, res) => {
  const updated = SetupController.updateCategory(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Category not found' });
  return res.json(updated);
});

setupRouter.delete(['/categories/:id', '/category-master/:id'], (req, res) => {
  const success = SetupController.deleteCategory(req.params.id);
  return res.json({ success });
});

setupRouter.post(['/categories/:id/post', '/category-master/:id/post'], (req, res) => {
  const updated = SetupController.postCategory(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Category not found' });
  return res.json(updated);
});

setupRouter.post(['/categories/:id/unpost', '/category-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostCategory(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Category not found' });
  return res.json(updated);
});

// Garment Sizes
setupRouter.get(['/sizes', '/size-master'], (req, res) => {
  return res.json(SetupController.getSizes());
});

setupRouter.post(['/sizes', '/size-master'], (req, res) => {
  return res.json(SetupController.addSize(req.body));
});

setupRouter.put(['/sizes/:id', '/size-master/:id'], (req, res) => {
  const updated = SetupController.updateSize(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Size not found' });
  return res.json(updated);
});

setupRouter.delete(['/sizes/:id', '/size-master/:id'], (req, res) => {
  const success = SetupController.deleteSize(req.params.id);
  return res.json({ success });
});

setupRouter.post(['/sizes/:id/post', '/size-master/:id/post'], (req, res) => {
  const updated = SetupController.postSize(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Size not found' });
  return res.json(updated);
});

setupRouter.post(['/sizes/:id/unpost', '/size-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostSize(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Size not found' });
  return res.json(updated);
});

setupRouter.get('/whatsapp-report', (req, res) => {
  return res.json(SetupController.getWhatsAppDailyReport());
});

// WhatsApp Dual-Engine Architecture Config (Baileys vs Meta Cloud API)
setupRouter.get('/whatsapp-config', (req, res) => {
  return res.json(SetupController.getWhatsAppConfig());
});

setupRouter.put('/whatsapp-config', (req, res) => {
  return res.json(SetupController.updateWhatsAppConfig(req.body));
});

// Top-level Dashboard KPIs
setupRouter.get('/dashboard-kpis', (req, res) => {
  return res.json(SetupController.getDashboardKPIs());
});

// Global Search
setupRouter.get('/search', (req, res) => {
  const query = (req.query.q as string) || '';
  return res.json(SetupController.globalSearch(query));
});

// Bulk Imports
setupRouter.post('/bulk-import-inventory', (req, res) => {
  const { pieces, importedBy } = req.body;
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return res.status(400).json({ error: 'pieces must be a non-empty array' });
  }
  return res.json(SetupController.bulkImportInventory(pieces, importedBy));
});

setupRouter.post('/bulk-import-sales', (req, res) => {
  const { records, sales, importedBy } = req.body;
  const list = Array.isArray(records) ? records : Array.isArray(sales) ? sales : [];
  if (list.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }
  return res.json(SetupController.bulkImportSales(list, importedBy));
});

