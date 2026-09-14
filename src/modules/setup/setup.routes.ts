import { Router } from 'express';
import { Client } from 'pg';
import { SetupController } from './setup.controller.ts';
import { CompanyProfileService } from '../../services/companyProfileService.ts';
import { SetupService } from '../../services/setupService.ts';
import { supabase } from '../../supabaseClient.ts';

async function getPgClient(): Promise<Client | null> {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  try {
    if (dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
      dbUrl = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
    }
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, u, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
      dbUrl = `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return client;
  } catch (err) {
    try {
      const fallbackUrl = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
      const fallbackClient = new Client({ connectionString: fallbackUrl, ssl: { rejectUnauthorized: false } });
      await fallbackClient.connect();
      return fallbackClient;
    } catch {
      return null;
    }
  }
}

export const setupRouter = Router();

// Company profile (supports both /company and /company-profile)
setupRouter.get(['/company', '/company-profile'], async (req, res) => {
  try {
    const data = await CompanyProfileService.getCompanyProfile();
    return res.json(data);
  } catch (_) {
    return res.json(SetupController.getCompanyProfile());
  }
});

setupRouter.put(['/company', '/company-profile'], async (req, res) => {
  try {
    const updated = await CompanyProfileService.updateCompanyProfile(req.body);
    return res.json(updated);
  } catch (_) {
    return res.json(SetupController.updateCompanyProfile(req.body));
  }
});

// Live Streaming Multicast Gateway (Restream / Livepush / Ingest Key)
setupRouter.get('/live-multicast', async (req, res) => {
  try {
    const data = await SetupService.getLiveMulticastConfig();
    return res.json({ success: true, data });
  } catch (_) {
    return res.json({ success: true, data: SetupController.getLiveMulticastConfig() });
  }
});

setupRouter.put('/live-multicast', async (req, res) => {
  try {
    const data = await SetupService.updateLiveMulticastConfig(req.body);
    SetupController.updateLiveMulticastConfig(req.body);
    return res.json({ success: true, data });
  } catch (_) {
    return res.json({ success: true, data: SetupController.updateLiveMulticastConfig(req.body) });
  }
});

// Multi-Booth Live Stream Relays (Booth 1 to Booth 5)
setupRouter.get('/live-booths', async (req, res) => {
  try {
    const list = await SetupService.getLiveBoothConfigs();
    if (list && list.length > 0) return res.json(list);
    return res.json(SetupController.getLiveBoothConfigs());
  } catch (_) {
    return res.json(SetupController.getLiveBoothConfigs());
  }
});

setupRouter.get('/live-booths/:boothId', async (req, res) => {
  try {
    const cfg = await SetupService.getLiveBoothConfig(req.params.boothId);
    if (cfg) return res.json(cfg);
    const fallback = SetupController.getLiveBoothConfig(req.params.boothId);
    if (!fallback) return res.status(404).json({ error: 'Booth not found' });
    return res.json(fallback);
  } catch (_) {
    const cfg = SetupController.getLiveBoothConfig(req.params.boothId);
    if (!cfg) return res.status(404).json({ error: 'Booth not found' });
    return res.json(cfg);
  }
});

setupRouter.put('/live-booths/:boothId', async (req, res) => {
  try {
    const updated = await SetupService.updateLiveBoothConfig(req.params.boothId, req.body);
    SetupController.updateLiveBoothConfig(req.params.boothId, req.body);
    return res.json(updated);
  } catch (_) {
    return res.json(SetupController.updateLiveBoothConfig(req.params.boothId, req.body));
  }
});

// Currencies & FX (supports both /currencies and /currency)
setupRouter.get(['/currencies', '/currency'], async (req, res) => {
  try {
    const list = await SetupService.getCurrencies();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getCurrencies());
  }
});

setupRouter.post(['/currencies', '/currency'], async (req, res) => {
  try {
    const created = await SetupService.addCurrency(req.body);
    SetupController.addCurrency(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addCurrency(req.body));
  }
});

setupRouter.put('/currency', async (req, res) => {
  const { code, exchangeRate, rate } = req.body;
  const numRate = Number(exchangeRate ?? rate);
  try {
    await SetupService.updateCurrencyRate(code, numRate);
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  } catch (_) {
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  }
});

setupRouter.put('/currencies/:code', async (req, res) => {
  const { code } = req.params;
  const { rate, exchangeRate } = req.body;
  const numRate = Number(rate ?? exchangeRate);
  try {
    await SetupService.updateCurrencyRate(code, numRate);
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  } catch (_) {
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  }
});

setupRouter.delete(['/currencies/:code', '/currency/:code'], async (req, res) => {
  const { code } = req.params;
  try {
    await SetupService.deleteCurrency(code);
    const success = SetupController.deleteCurrency(code);
    return res.json({ success });
  } catch (_) {
    const success = SetupController.deleteCurrency(code);
    return res.json({ success });
  }
});

setupRouter.get(['/items', '/item-master'], async (req, res) => {
  try {
    const list = await SetupService.getItems();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getItemMasters());
  }
});

setupRouter.post(['/items', '/item-master'], async (req, res) => {
  try {
    const created = await SetupService.addItem(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addItemMaster(req.body));
  }
});

setupRouter.put(['/items/:id', '/item-master/:id'], async (req, res) => {
  try {
    await SetupService.updateItem(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateItemMaster(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/items/:id', '/item-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteItem(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteItemMaster(req.params.id);
    return res.json({ success });
  }
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
setupRouter.get(['/labels', '/label-grade', '/labels-grade'], async (req, res) => {
  try {
    const list = await SetupService.getLabelGrades();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getLabelGrades());
  }
});

setupRouter.post(['/labels', '/label-grade', '/labels-grade'], async (req, res) => {
  try {
    const created = await SetupService.addLabelGrade(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addLabelGrade(req.body));
  }
});

setupRouter.put(['/labels/:id', '/label-grade/:id'], async (req, res) => {
  try {
    await SetupService.updateLabelGrade(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateLabelGrade(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Label grade not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/labels/:id', '/label-grade/:id'], async (req, res) => {
  try {
    await SetupService.deleteLabelGrade(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteLabelGrade(req.params.id);
    return res.json({ success });
  }
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
setupRouter.get(['/brands', '/brand-master'], async (req, res) => {
  try {
    const list = await SetupService.getBrands();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getBrandMasters());
  }
});

setupRouter.post(['/brands', '/brand-master'], async (req, res) => {
  try {
    const created = await SetupService.addBrand(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addBrandMaster(req.body));
  }
});

setupRouter.put(['/brands/:id', '/brand-master/:id'], async (req, res) => {
  try {
    await SetupService.updateBrand(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateBrandMaster(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/brands/:id', '/brand-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteBrand(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteBrandMaster(req.params.id);
    return res.json({ success });
  }
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
setupRouter.get(['/shops', '/shop-master'], async (req, res) => {
  try {
    const list = await SetupService.getShops();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getShopMasters());
  }
});

setupRouter.post(['/shops', '/shop-master'], async (req, res) => {
  try {
    const created = await SetupService.addShop(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addShopMaster(req.body));
  }
});

setupRouter.put(['/shops/:id', '/shop-master/:id'], async (req, res) => {
  try {
    await SetupService.updateShop(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateShopMaster(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Shop not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/shops/:id', '/shop-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteShop(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteShopMaster(req.params.id);
    return res.json({ success });
  }
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
setupRouter.get(['/categories', '/category-master'], async (req, res) => {
  try {
    const list = await SetupService.getCategories();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getCategories());
  }
});

setupRouter.post(['/categories', '/category-master'], async (req, res) => {
  try {
    const created = await SetupService.addCategory(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addCategory(req.body));
  }
});

setupRouter.put(['/categories/:id', '/category-master/:id'], async (req, res) => {
  try {
    await SetupService.updateCategory(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateCategory(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/categories/:id', '/category-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteCategory(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteCategory(req.params.id);
    return res.json({ success });
  }
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
setupRouter.get(['/sizes', '/size-master'], async (req, res) => {
  try {
    const list = await SetupService.getSizes();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getSizes());
  }
});

setupRouter.post(['/sizes', '/size-master'], async (req, res) => {
  try {
    const created = await SetupService.addSize(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addSize(req.body));
  }
});

setupRouter.put(['/sizes/:id', '/size-master/:id'], async (req, res) => {
  try {
    await SetupService.updateSize(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateSize(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Size not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/sizes/:id', '/size-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteSize(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteSize(req.params.id);
    return res.json({ success });
  }
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
setupRouter.get('/whatsapp-config', async (req, res) => {
  try {
    const { data } = await supabase.from('whatsapp_gateway_config').select('config').eq('id', 'default').maybeSingle();
    if (data && data.config) {
      return res.json(data.config);
    }
  } catch (_) {}
  return res.json(SetupController.getWhatsAppConfig());
});

setupRouter.put('/whatsapp-config', async (req, res) => {
  const updated = SetupController.updateWhatsAppConfig(req.body);
  try {
    await supabase.from('whatsapp_gateway_config').upsert({
      id: 'default',
      config: updated,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to sync whatsapp_gateway_config to Supabase:', e);
  }
  return res.json(updated);
});

// Thermal Barcode & QR Label Designer Settings
setupRouter.get('/thermal-config', async (req, res) => {
  try {
    const cfg = await SetupService.getThermalBarcodeConfig();
    if (cfg) return res.json({ success: true, data: cfg });
  } catch (_) {}
  return res.json({ success: true, data: null });
});

setupRouter.put('/thermal-config', async (req, res) => {
  try {
    await SetupService.updateThermalBarcodeConfig(req.body);
    return res.json({ success: true, data: req.body });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Security Master PIN (Encrypted / Admin PIN)
setupRouter.get('/master-pin', async (req, res) => {
  try {
    const pin = await SetupService.getMasterPin();
    return res.json({ success: true, pin });
  } catch (_) {
    return res.json({ success: true, pin: '9988' });
  }
});

setupRouter.put('/master-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || String(pin).trim().length < 4) {
    return res.status(400).json({ success: false, error: 'PIN must be at least 4 digits' });
  }
  try {
    await SetupService.updateMasterPin(String(pin).trim());
    return res.json({ success: true, pin: String(pin).trim() });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Google Gemini Vision / OCR API Key Config (SQL Persistent)
setupRouter.get('/gemini-key', async (req, res) => {
  let pgClient: Client | null = null;
  try {
    pgClient = await getPgClient();
    if (pgClient) {
      const dbRes = await pgClient.query(`
        SELECT id, api_key, model, status, updated_at
        FROM gemini_api_config
        WHERE id = 'default'
        LIMIT 1;
      `);
      if (dbRes.rows && dbRes.rows.length > 0 && dbRes.rows[0].api_key) {
        const row = dbRes.rows[0];
        return res.json({
          success: true,
          apiKey: row.api_key,
          model: row.model || 'gemini-3.6',
          status: row.status || 'ACTIVE',
          updatedAt: row.updated_at,
          configured: true
        });
      }
    }
  } catch (dbErr) {
    console.warn('[Setup Routes] PG gemini-key select warning:', dbErr);
  } finally {
    if (pgClient) {
      try { await pgClient.end(); } catch {}
    }
  }

  // Fallback to env or SetupService
  try {
    const config = await SetupService.getGeminiApiConfig();
    return res.json({ success: true, ...config });
  } catch (_) {
    const envKey = process.env.GEMINI_API_KEY || '';
    return res.json({ success: true, apiKey: envKey, model: 'gemini-3.6', configured: Boolean(envKey) });
  }
});

setupRouter.put('/gemini-key', async (req, res) => {
  const { apiKey, model } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ success: false, error: 'API key must be at least 8 characters' });
  }
  const cleanKey = apiKey.trim();
  const selectedModel = (model || 'gemini-3.6').trim();

  let pgClient: Client | null = null;
  let savedRecord = null;
  try {
    pgClient = await getPgClient();
    if (pgClient) {
      // Ensure table exists
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS gemini_api_config (
          id VARCHAR(64) PRIMARY KEY,
          api_key TEXT NOT NULL,
          model VARCHAR(64) DEFAULT 'gemini-2.5-flash',
          status VARCHAR(64) DEFAULT 'ACTIVE',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Execute SQL UPSERT: INSERT ... ON CONFLICT (id) DO UPDATE ... RETURNING *
      const upsertResult = await pgClient.query(`
        INSERT INTO gemini_api_config (id, api_key, model, status, updated_at)
        VALUES ('default', $1, $2, 'ACTIVE', NOW())
        ON CONFLICT (id) DO UPDATE
        SET api_key = EXCLUDED.api_key,
            model = COALESCE(EXCLUDED.model, gemini_api_config.model),
            status = 'ACTIVE',
            updated_at = NOW()
        RETURNING id, api_key, model, status, updated_at;
      `, [cleanKey, selectedModel]);

      if (upsertResult.rows && upsertResult.rows.length > 0) {
        savedRecord = upsertResult.rows[0];
      }
    }
  } catch (err: any) {
    console.error('[Setup Routes] Failed to UPSERT into gemini_api_config:', err);
  } finally {
    if (pgClient) {
      try { await pgClient.end(); } catch {}
    }
  }

  // Update in-memory runtime environment variable for active node process
  process.env.GEMINI_API_KEY = cleanKey;

  if (savedRecord) {
    return res.json({
      success: true,
      message: '✓ Gemini API Key successfully saved and persisted in PostgreSQL database (gemini_api_config)!',
      apiKey: savedRecord.api_key,
      model: savedRecord.model,
      status: savedRecord.status,
      updatedAt: savedRecord.updated_at,
      configured: true
    });
  }

  // Fallback if PG pooler was unreachable: try SetupService
  try {
    await SetupService.updateGeminiApiKey(cleanKey, selectedModel);
    return res.json({
      success: true,
      message: '✓ Gemini API Key updated successfully.',
      apiKey: cleanKey,
      model: selectedModel,
      configured: true
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message || 'Database error saving Gemini API key' });
  }
});

setupRouter.post('/gemini-key/test', async (req, res) => {
  let keyToTest = (req.body?.apiKey || '').trim();
  const selectedModel = (req.body?.model || 'gemini-3.6').trim();

  if (!keyToTest) {
    // Attempt to read from PostgreSQL database
    let pgClient: Client | null = null;
    try {
      pgClient = await getPgClient();
      if (pgClient) {
        const dbRes = await pgClient.query(`SELECT api_key FROM gemini_api_config WHERE id = 'default' LIMIT 1;`);
        if (dbRes.rows && dbRes.rows.length > 0) {
          keyToTest = dbRes.rows[0].api_key;
        }
      }
    } catch {} finally {
      if (pgClient) {
        try { await pgClient.end(); } catch {}
      }
    }
    if (!keyToTest) {
      keyToTest = (process.env.GEMINI_API_KEY || '').trim();
    }
  }

  if (!keyToTest || keyToTest.length < 8) {
    return res.status(400).json({ success: false, valid: false, error: 'No valid Gemini API key found to test.' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToTest}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        valid: false,
        error: `Google API rejected the key (${response.status}): ${errText.slice(0, 150)}`
      });
    }
    const data = await response.json();
    return res.json({
      success: true,
      valid: true,
      model: selectedModel,
      message: `Successfully connected to Google Gemini AI! Available models: ${data.models?.length || 0}`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, valid: false, error: err?.message || 'Network error connecting to Google AI' });
  }
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

