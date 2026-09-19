import { Router } from 'express';
import { Client } from 'pg';
import { SalesController } from './sales.controller.ts';
import { SalesService } from '../../services/salesService.ts';

export const salesRouter = Router();

const getDbClient = async (): Promise<Client> => {
  const DEFAULT_DB_URL = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || DEFAULT_DB_URL;
  try {
    const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
    if (match) {
      let [_, user, rawPwd, host, port, rest] = match;
      if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
      dbUrl = `postgresql://${user}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
    }
  } catch (_) {}
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
};

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

// ==========================================
// OMNICHANNEL SALES SETTINGS & DISPATCH APIS
// ==========================================

// GET /api/sales/settings
salesRouter.get('/settings', async (req, res) => {
  let client;
  try {
    client = await getDbClient();
    const result = await client.query(`
      SELECT 
        s.id,
        s.setting_key as "settingKey",
        s.account_code as "accountCode",
        s.description,
        s.updated_at as "updatedAt",
        COALESCE(c.name, a.account_name, '') as "accountName",
        COALESCE(c.account_type, at.type_name, 'ASSET') as "accountType"
      FROM sales_channel_settings s
      LEFT JOIN chart_of_accounts c ON c.code = s.account_code
      LEFT JOIN accounts a ON a.account_code = s.account_code
      LEFT JOIN account_types at ON at.type_id = a.account_type_id
      ORDER BY s.setting_key;
    `);
    return res.json({ success: true, settings: result.rows });
  } catch (err: any) {
    console.error('Error fetching sales_channel_settings:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch settings' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/sales/settings
salesRouter.post('/settings', async (req, res) => {
  const { settingKey, accountCode } = req.body;
  if (!settingKey || !accountCode) {
    return res.status(400).json({ success: false, error: 'settingKey and accountCode are required' });
  }
  let client;
  try {
    client = await getDbClient();
    const result = await client.query(`
      UPDATE sales_channel_settings
      SET account_code = $1, updated_at = NOW()
      WHERE setting_key = $2
      RETURNING *;
    `, [accountCode, settingKey]);
    return res.json({ success: true, setting: result.rows[0] });
  } catch (err: any) {
    console.error('Error updating sales_channel_settings:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to update setting' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/sales/settings/reset
salesRouter.post('/settings/reset', async (req, res) => {
  let client;
  try {
    client = await getDbClient();
    const defaults = [
      ['cogs_account', '5100-02', 'Cost of Goods Sold - Finished Goods'],
      ['finished_goods_inventory', '1160-01', 'Finished Goods Inventory Asset'],
      ['courier_cod_clearing', '1128-01', 'Courier COD Clearing (Pending Remittance)'],
      ['courier_payable', '2120-01', 'Courier Delivery & Commission Payable'],
      ['delivery_expense', '5140-01', 'Company Borne Delivery Expense'],
      ['pos_cash_drawer', '1110-01', 'POS Cash Drawer'],
      ['pos_terminal_clearing', '1125-01', 'POS Card / Terminal Clearing'],
      ['live_sales_clearing', '1130-02', 'LIVE SALES Control Khata'],
      ['ecommerce_sales_clearing', '1130-03', 'E-COMMERCE SALES Control Khata'],
      ['pos_sales_clearing', '1130-04', 'POS SALES Control Khata'],
      ['b2b_sales_receivable', '1130-01', 'Default B2B Wholesale Receivable'],
      ['b2b_revenue', '4110-05', 'B2B Wholesale Revenue'],
      ['omnichannel_retail_revenue', '4110-01', 'POS, Live & E-Commerce Revenue']
    ];
    for (const [key, code, desc] of defaults) {
      await client.query(`
        INSERT INTO sales_channel_settings (setting_key, account_code, description, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (setting_key) DO UPDATE
        SET account_code = $2, description = $3, updated_at = NOW();
      `, [key, code, desc]);
    }
    return res.json({ success: true, message: 'Settings reset to standard defaults' });
  } catch (err: any) {
    console.error('Error resetting sales_channel_settings:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to reset settings' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// GET /api/sales/accounts (for settings dropdowns)
salesRouter.get('/accounts', async (req, res) => {
  let client;
  try {
    client = await getDbClient();
    const result = await client.query(`
      SELECT 
        c.id,
        c.code,
        c.name,
        COALESCE(c.account_type, 'ASSET') as "accountType",
        COALESCE(c.current_balance, 0) as "currentBalance",
        COALESCE(a.is_transactional, true) as "isTransactional"
      FROM chart_of_accounts c
      LEFT JOIN accounts a ON a.account_code = c.code
      WHERE COALESCE(a.is_transactional, true) = true
      ORDER BY c.code ASC;
    `);
    return res.json({ success: true, accounts: result.rows });
  } catch (err: any) {
    console.error('Error fetching accounts for sales settings:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch accounts' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/sales/dispatch
salesRouter.post('/dispatch', async (req, res) => {
  const { orderId, channel, clientId, courierPartyId, courierPartnerId, shippingFee, shippingBearer } = req.body;
  if (!orderId || !channel) {
    return res.status(400).json({ success: false, error: 'orderId and channel are required' });
  }
  let client;
  try {
    client = await getDbClient();
    const resolvedCourier = courierPartyId || (courierPartnerId !== undefined && courierPartnerId !== null ? String(courierPartnerId) : null);
    const rpcRes = await client.query(
      'SELECT post_sales_dispatch_and_cogs_voucher($1, $2, $3, $4, $5, $6) as result;',
      [
        orderId,
        channel,
        clientId || null,
        resolvedCourier,
        Number(shippingFee || 0),
        shippingBearer || 'Customer Bears'
      ]
    );
    return res.json(rpcRes.rows[0]?.result);
  } catch (err: any) {
    console.error('Error running post_sales_dispatch_and_cogs_voucher:', err);
    return res.status(400).json({ success: false, error: err.message || 'Dispatch failed' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/sales/courier-settlement
salesRouter.post('/courier-settlement', async (req, res) => {
  const {
    courierPartyId,
    bankAccountId,
    grossCodCleared,
    courierFeeDeducted,
    netBankReceived,
    referenceNo,
    bankRemittanceCode,
    accountantPinVerified,
    pinCode
  } = req.body;

  if (!courierPartyId || !bankAccountId || grossCodCleared === undefined || netBankReceived === undefined) {
    return res.status(400).json({ success: false, error: 'courierPartyId, bankAccountId, grossCodCleared, and netBankReceived are required' });
  }

  const remittanceCode = bankRemittanceCode || referenceNo;
  const isPinVerified = accountantPinVerified === true || Boolean(pinCode);

  if (!isPinVerified || !remittanceCode || !remittanceCode.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Security Exception: Remittance settlement requires valid Bank PIN / Transaction Reference verification.'
    });
  }

  let client;
  try {
    client = await getDbClient();
    const rpcRes = await client.query(
      'SELECT settle_courier_cod_remittance($1, $2, $3, $4, $5, $6, $7) as result;',
      [
        courierPartyId,
        bankAccountId,
        Number(grossCodCleared),
        Number(courierFeeDeducted || 0),
        Number(netBankReceived),
        remittanceCode,
        isPinVerified
      ]
    );
    return res.json(rpcRes.rows[0]?.result);
  } catch (err: any) {
    console.error('Error running settle_courier_cod_remittance:', err);
    return res.status(400).json({ success: false, error: err.message || 'Settlement failed' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// POST /api/sales/grail-bounties
salesRouter.post('/grail-bounties', async (req, res) => {
  let client;
  try {
    const { customerName, customerPhone, whatsappPhone, customerEmail, desiredBrand, desiredCategory, desiredSize, preferredSize, maxBudgetAed, notes, eraNotes } = req.body;
    const phone = whatsappPhone || customerPhone || req.body.phone;
    const name = customerName || req.body.name;
    const brand = desiredBrand || req.body.brand;
    if (!name || !phone || !brand) {
      return res.status(400).json({ success: false, error: 'Customer name, phone and desired brand are required' });
    }

    client = await getDbClient();
    const id = req.body.id || `bounty-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const size = preferredSize || desiredSize || 'L';
    const era = eraNotes || notes || '';

    const insRes = await client.query(`
      INSERT INTO grail_bounties (
        id, customer_name, customer_phone, whatsapp_phone, customer_email, 
        desired_brand, desired_category, desired_size, preferred_size, 
        max_budget_aed, notes, era_notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'OPEN', NOW(), NOW())
      RETURNING *;
    `, [id, name, phone, whatsappPhone || phone, customerEmail || '', brand, desiredCategory || 'T-Shirts', size, size, Number(maxBudgetAed || 0), era, era]);

    return res.status(201).json({
      success: true,
      bounty: insRes.rows[0],
      bountyId: id,
      message: `Grail bounty registered! We will notify ${phone} as soon as a matching ${brand} is scanned in a bale.`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to create grail bounty' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// GET /api/sales/grail-bounties
salesRouter.get('/grail-bounties', async (req, res) => {
  let client;
  try {
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';
    client = await getDbClient();

    let query = 'SELECT * FROM grail_bounties WHERE 1=1';
    const params: any[] = [];
    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (desired_brand ILIKE $${params.length} OR customer_name ILIKE $${params.length} OR customer_phone ILIKE $${params.length} OR whatsapp_phone ILIKE $${params.length})`;
    }
    query += ' ORDER BY created_at DESC LIMIT 200';

    const result = await client.query(query, params);
    return res.json({ success: true, bounties: result.rows || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch grail bounties' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// PATCH /api/sales/grail-bounties/:id/status
salesRouter.patch('/grail-bounties/:id/status', async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { status, matchedBarcode, matchedPieceId } = req.body;
    client = await getDbClient();

    await client.query(`
      UPDATE grail_bounties 
      SET status = COALESCE($1, status),
          matched_barcode = COALESCE($2, matched_barcode),
          matched_piece_id = COALESCE($3, matched_piece_id),
          updated_at = NOW()
      WHERE id = $4
    `, [status, matchedBarcode || null, matchedPieceId || null, id]);

    return res.json({ success: true, message: `Bounty ${id} updated to ${status}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update bounty' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// DELETE /api/sales/grail-bounties/:id
salesRouter.delete('/grail-bounties/:id', async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    client = await getDbClient();
    await client.query('DELETE FROM grail_bounties WHERE id = $1', [id]);
    return res.json({ success: true, message: `Bounty ${id} deleted successfully` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to delete bounty' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// GET /api/sales/grail-bounties/auto-match
salesRouter.get('/grail-bounties/auto-match', async (req, res) => {
  let client;
  try {
    const brand = (req.query.brand as string) || '';
    const category = (req.query.category as string) || '';
    client = await getDbClient();

    let query = `
      SELECT barcode, brand_name, item_name, style, size_scanned, estimated_price, retail_price_aed, status
      FROM inventory_pieces 
      WHERE (is_sold = false OR is_sold IS NULL) 
        AND (status IS NULL OR status = 'AVAILABLE' OR status = 'IN_VAULT')
    `;
    const params: any[] = [];
    if (brand) {
      params.push(`%${brand}%`);
      query += ` AND (brand_name ILIKE $${params.length} OR item_name ILIKE $${params.length} OR style ILIKE $${params.length})`;
    }
    if (category && category !== 'ALL') {
      params.push(`%${category}%`);
      query += ` AND (item_name ILIKE $${params.length} OR style ILIKE $${params.length})`;
    }
    query += ' ORDER BY created_at DESC LIMIT 20';

    const result = await client.query(query, params);
    return res.json({ success: true, matches: result.rows || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to match inventory' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});
