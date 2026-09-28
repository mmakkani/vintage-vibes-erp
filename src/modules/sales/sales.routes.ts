import { Router } from 'express';
import { Client } from 'pg';
import { SalesController } from './sales.controller.ts';
import { SalesService } from '../../services/salesService.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { withDb } from '../../db/pgPool.ts';
import { executePessimisticClaim, executeReleaseLock } from '../liveStreaming/liveStreaming.routes.ts';

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
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const query = `
      SELECT si.*,
             p.name as courier_partner_name,
             p.company_name as courier_company_name
      FROM sales_invoices si
      LEFT JOIN parties p ON (p.party_id = si.courier_partner_id OR p.id::text = si.courier_partner_id::text)
      ORDER BY si.created_at DESC;
    `;
    const result = await client.query(query);
    const rows = result.rows || [];
    const mapped = rows.map((row: any) => {
      let parsedItems: any[] = [];
      if (Array.isArray(row.items)) {
        parsedItems = row.items;
      } else if (typeof row.items === 'string') {
        try { parsedItems = JSON.parse(row.items); } catch (_) {}
      }
      const rawDate = row.invoice_date ? String(row.invoice_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const subVal = Number(row.subtotal ?? row.total_amount ?? 0);
      const vatVal = Number(row.tax_amount ?? 0);
      const totalVal = Number(row.total_amount ?? (subVal + vatVal));
      const courierName = row.courier_partner_name || row.courier_company_name || (row.courier_partner_id === 75 ? 'Banana Express' : (row.courier_partner_id ? `Courier #${row.courier_partner_id}` : undefined));

      return {
        id: row.id,
        invoiceNo: row.invoice_no,
        clientId: row.client_id,
        customerId: row.client_id || '',
        customerName: row.customer_name || 'Walk-in Guest',
        customerPhone: row.customer_phone || '',
        invoiceDate: rawDate,
        date: rawDate,
        time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '14:30',
        channel: row.channel || (row.invoice_no?.startsWith('LIVE-') ? 'LIVE_STREAM' : 'POS_COUNTER'),
        paymentMethod: row.payment_method || 'COD',
        paymentStatus: row.payment_status || (row.status === 'PAID' ? 'PAID' : 'UNPAID_PENDING_COD'),
        paymentReference: row.payment_reference || '',
        shippingAddress: row.shipping_address || '',
        city: row.city || '',
        courierPartyId: row.courier_party_id || row.courier_partner_id,
        courierPartnerId: row.courier_partner_id,
        courierPartner: courierName,
        trackingNumber: row.tracking_number || '',
        shippingFeeAed: Number(row.shipping_fee || 0),
        shippingBearer: row.shipping_bearer || 'CUSTOMER',
        buyerHandle: row.buyer_handle || (row.customer_name?.startsWith('@') ? row.customer_name : undefined),
        boothId: row.booth_id,
        subtotal: subVal,
        subTotal: subVal,
        discountAmount: Number(row.discount_amount || 0),
        taxAmount: vatVal,
        vatAmount: vatVal,
        totalAmount: totalVal,
        grandTotalAED: totalVal,
        status: row.status || 'DRAFT',
        items: parsedItems,
        createdAt: row.created_at
      };
    });
    // CRITICAL: Also merge in-memory/relationalStore sales invoices so live sales, drafts, and local POS invoices are never missing!
    const storeInvoices = SalesController.getInvoices();
    const existingNos = new Set(mapped.map(m => m.invoiceNo));
    const existingIds = new Set(mapped.map(m => String(m.id)));
    for (const sinv of storeInvoices) {
      if (!existingNos.has(sinv.invoiceNo) && !existingIds.has(String(sinv.id))) {
        mapped.push(sinv);
      }
    }
    return res.json(mapped);
  } catch (err) {
    try {
      const list = await SalesService.getSalesInvoices();
      const storeInvoices = SalesController.getInvoices();
      const existingNos = new Set(list.map(m => m.invoiceNo));
      const existingIds = new Set(list.map(m => String(m.id)));
      for (const sinv of storeInvoices) {
        if (!existingNos.has(sinv.invoiceNo) && !existingIds.has(String(sinv.id))) {
          list.push(sinv);
        }
      }
      return res.json(list);
    } catch (_) {
      return res.json(SalesController.getInvoices());
    }
  } finally {
    if (client) await client.end().catch(() => {});
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

salesRouter.get('/customer-history', async (req, res) => {
  const { partyId, phone, name } = req.query as { partyId?: string; phone?: string; name?: string };
  let client: Client | null = null;
  try {
    client = await getDbClient();
    const cleanPhone = (phone || '').replace(/\D/g, '');
    let query = 'SELECT * FROM sales_invoices WHERE 1=0';
    const params: any[] = [];
    if (partyId) {
      params.push(partyId);
      query += ` OR client_id = $${params.length}`;
    }
    if (cleanPhone && cleanPhone.length >= 7) {
      params.push(`%${cleanPhone.slice(-7)}%`);
      query += ` OR customer_phone LIKE $${params.length}`;
    }
    if (name && name.trim()) {
      params.push(`%${name.trim()}%`);
      query += ` OR customer_name ILIKE $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 100;';

    const result = await client.query(query, params);
    return res.json(result.rows || []);
  } catch (err: any) {
    return res.json([]);
  } finally {
    if (client) await client.end().catch(() => {});
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

salesRouter.post('/live-draft-invoice', async (req, res) => {
  const result = SalesController.createDraftLiveInvoice(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  const barcode = (req.body.pieceBarcode || req.body.barcode || '').trim();
  try {
    const client = await getDbClient();
    if (barcode) {
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'RESERVED',
            is_sold = false,
            locked_by_buyer = $1,
            locked_by_booth = $2,
            updated_at = NOW()
        WHERE (LOWER(barcode) = LOWER($3) OR LOWER(sku) = LOWER($3) OR id = $3)
          AND (status = 'IN_STOCK' OR status IS NULL OR status = 'AVAILABLE')
          AND (is_sold = false OR is_sold IS NULL)
      `, [req.body.buyerHandle || 'Live Stream Buyer', req.body.boothId || 'Booth 1', barcode]);
    }
    if (result.invoice) {
      const inv = result.invoice;
      await client.query(`
        INSERT INTO sales_invoices (
          id, invoice_no, customer_name, customer_phone, invoice_date,
          channel, payment_method, payment_status, shipping_address,
          subtotal, discount_amount, tax_amount, total_amount, status,
          items, shipping_fee, shipping_bearer, courier_partner_id,
          tracking_number, created_at
        ) VALUES (
          $1, $2, $3, $4, CURRENT_DATE,
          'LIVE_STREAM', $5, $6, $7,
          $8, 0, $9, $10, 'DRAFT',
          $11::jsonb, $12, $13, $14,
          $15, NOW()
        ) ON CONFLICT (id) DO UPDATE
        SET status = 'DRAFT', items = EXCLUDED.items, total_amount = EXCLUDED.total_amount;
      `, [
        inv.id,
        inv.invoiceNo,
        inv.customerName,
        inv.customerPhone,
        inv.paymentMethod || 'COD',
        inv.paymentStatus || 'UNPAID_PENDING_COD',
        inv.shippingAddress || 'Dubai, UAE Delivery',
        inv.subTotal,
        inv.vatAmount,
        inv.totalAmount,
        JSON.stringify(inv.items),
        inv.shippingFeeAed || 0,
        inv.shippingBearer || 'CUSTOMER',
        inv.courierPartnerId || null,
        inv.trackingNumber || ''
      ]);
    }
    await client.end().catch(() => {});
  } catch (_) {}
  return res.json(result);
});

const handleUpdateDraftInvoice = async (req: any, res: any) => {
  const { id } = req.params;
  const result = SalesController.updateDraftInvoice(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  try {
    const client = await getDbClient();
    if (req.body.additionalBarcode) {
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'RESERVED', is_sold = false, updated_at = NOW()
        WHERE (LOWER(barcode) = LOWER($1) OR LOWER(sku) = LOWER($1) OR id = $1)
          AND (status = 'IN_STOCK' OR status IS NULL OR status = 'AVAILABLE')
          AND (is_sold = false OR is_sold IS NULL)
      `, [req.body.additionalBarcode.trim()]);
    }
    if (req.body.removeBarcode) {
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'IN_STOCK', is_sold = false, locked_by_buyer = NULL, locked_by_booth = NULL, updated_at = NOW()
        WHERE LOWER(barcode) = LOWER($1) OR LOWER(sku) = LOWER($1) OR id = $1
      `, [req.body.removeBarcode.trim()]);
    }

    const updatedInv = result.invoice;
    if (updatedInv) {
      await client.query(`
        UPDATE sales_invoices
        SET items = $1::jsonb,
            subtotal = $2,
            tax_amount = $3,
            total_amount = $4,
            shipping_fee = $5,
            courier_partner_id = $6,
            tracking_number = $7,
            shipping_bearer = $8,
            payment_status = $9,
            payment_method = $10,
            payment_reference = $11,
            shipping_address = $12,
            customer_phone = $13,
            customer_name = $14,
            updated_at = NOW()
        WHERE id::text = $15 OR invoice_no = $15
      `, [
        JSON.stringify(updatedInv.items || []),
        Number(updatedInv.subtotal || updatedInv.subTotal || 0),
        Number(updatedInv.taxAmount || updatedInv.vatAmount || 0),
        Number(updatedInv.totalAmount || 0),
        Number(updatedInv.shippingFeeAed ?? updatedInv.shippingCharge ?? 0),
        updatedInv.courierPartnerId || updatedInv.courierPartyId || null,
        updatedInv.trackingNumber || '',
        updatedInv.shippingBearer || 'CUSTOMER',
        updatedInv.paymentStatus || 'UNPAID_PENDING_COD',
        updatedInv.paymentMethod || 'COD',
        updatedInv.paymentReference || '',
        updatedInv.shippingAddress || '',
        updatedInv.customerPhone || '',
        updatedInv.buyerHandle || updatedInv.customerName || 'Walk-in Guest',
        id
      ]);
    }

    await client.end().catch(() => {});
  } catch (err: any) {
    console.error('Error persisting draft invoice update to DB:', err);
  }
  return res.json(result);
};

salesRouter.put('/invoices/:id/draft', handleUpdateDraftInvoice);
salesRouter.post('/invoices/:id/draft', handleUpdateDraftInvoice);

salesRouter.post('/invoices/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const { cancelledBy } = req.body;
  const inv = relationalStore.getSalesInvoices().find(i => i.id === id);
  const result = SalesController.cancelInvoice(id, cancelledBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  if (inv && Array.isArray(inv.items) && inv.items.length > 0) {
    const barcodes = inv.items.map(it => it.barcode).filter(Boolean);
    try {
      const client = await getDbClient();
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'IN_STOCK', is_sold = false, locked_by_buyer = NULL, locked_by_booth = NULL, updated_at = NOW()
        WHERE barcode = ANY($1)
      `, [barcodes]);
      await client.end().catch(() => {});
    } catch (_) {}
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

salesRouter.post('/invoices/:id/post', async (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const inv = relationalStore.getSalesInvoices().find(i => i.id === id);
  const result = SalesController.postInvoice(id, postedBy || 'Accounts Lead');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  if (inv && Array.isArray(inv.items) && inv.items.length > 0) {
    const barcodes = inv.items.map(it => it.barcode).filter(Boolean);
    try {
      const client = await getDbClient();
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'SOLD', is_sold = true, updated_at = NOW()
        WHERE barcode = ANY($1)
      `, [barcodes]);
      await client.query(`
        UPDATE sales_invoices
        SET status = 'POSTED'
        WHERE id = $1 OR invoice_no = $1;
      `, [id]);
      await client.end().catch(() => {});
    } catch (_) {}
  }
  return res.json(result);
});

salesRouter.post('/invoices/:id/unpost', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;
  try {
    try {
      client = await getDbClient();
      const invRes = await client.query('SELECT * FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1', [id]);
      if (invRes.rowCount > 0) {
        const row = invRes.rows[0];
        const items = Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items) : []);
        const barcodes = items.map((it: any) => it.barcode).filter(Boolean);
        if (barcodes.length > 0) {
          await client.query(`UPDATE inventory_pieces SET status = 'IN_STOCK', is_sold = false, updated_at = NOW() WHERE barcode = ANY($1)`, [barcodes]);
        }
        await client.query(`UPDATE sales_invoices SET status = 'DRAFT' WHERE id = $1`, [row.id]);
        const vNo = `JV-SLS-${row.invoice_no || row.id}`;
        await client.query(`DELETE FROM voucher_entries WHERE voucher_no = $1 OR voucher_id = $2`, [vNo, row.id]);
        await client.query(`DELETE FROM financial_vouchers WHERE voucher_no = $1 OR reference = $2 OR reference_no = $2`, [vNo, row.invoice_no]);
      }
    } catch (dbErr) {
      console.warn('[salesRouter POST /invoices/:id/unpost] PostgreSQL notice:', dbErr);
    } finally {
      if (client) await client.end().catch(() => {});
    }

    const unpostResult = SalesController.unpostInvoice(id);
    if (!unpostResult.success) {
      return res.status(400).json({ success: false, error: unpostResult.error || 'Failed to unpost invoice' });
    }
    return res.json({ success: true, message: 'Sales invoice successfully unposted to DRAFT' });
  } catch (err: any) {
    console.error('Error during sales invoice unpost:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to unpost invoice' });
  }
});

salesRouter.delete('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;
  try {
    // 1. STRICT POST-LOCK CHECK: Verify in relationalStore
    const relInv = relationalStore.getSalesInvoices().find(
      i => i.id === id || i.invoiceNo === id || String(i.id) === String(id)
    );
    if (relInv && relInv.status === 'POSTED') {
      return res.status(400).json({
        success: false,
        error: `Strict Post-Lock: Invoice ${relInv.invoiceNo} is finalized and POSTED. You must UNPOST it to DRAFT before deleting.`
      });
    }

    // 2. STRICT POST-LOCK CHECK: Verify in PostgreSQL
    try {
      client = await getDbClient();
      const invRes = await client.query('SELECT * FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1', [id]);
      if (invRes.rowCount > 0) {
        const row = invRes.rows[0];
        if (row.status === 'POSTED') {
          return res.status(400).json({
            success: false,
            error: `Strict Post-Lock: Invoice ${row.invoice_no || id} is finalized and POSTED. You must UNPOST it to DRAFT before deleting.`
          });
        }
        const items = Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items) : []);
        const barcodes = items.map((it: any) => it.barcode).filter(Boolean);
        if (barcodes.length > 0) {
          await client.query(`
            UPDATE inventory_pieces
            SET status = 'IN_STOCK', locked_by_buyer = NULL, locked_by_booth = NULL, lock_expires_at = NULL, reserved_until = NULL, is_sold = false, updated_at = NOW()
            WHERE barcode = ANY($1)
          `, [barcodes]);
        }
        const vNo = `JV-SLS-${row.invoice_no || row.id}`;
        await client.query(`DELETE FROM voucher_entries WHERE voucher_no = $1 OR voucher_id = $2`, [vNo, row.id]);
        await client.query(`DELETE FROM financial_vouchers WHERE voucher_no = $1 OR reference = $2 OR reference_no = $2`, [vNo, row.invoice_no]);
        await client.query('DELETE FROM sales_invoices WHERE id = $1', [row.id]);
      }
    } catch (dbErr) {
      console.warn('[salesRouter DELETE /invoices/:id] PostgreSQL notice:', dbErr);
    } finally {
      if (client) await client.end().catch(() => {});
    }

    // 3. Purge from relationalStore
    SalesController.deleteInvoice(id);

    return res.json({ success: true, message: 'Draft invoice deleted and inventory released to stock' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to delete invoice' });
  }
});

salesRouter.post('/invoices/:id/delete', async (req, res) => {
  const { id } = req.params;
  let client: Client | null = null;
  try {
    // 1. STRICT POST-LOCK CHECK: Verify in relationalStore
    const relInv = relationalStore.getSalesInvoices().find(
      i => i.id === id || i.invoiceNo === id || String(i.id) === String(id)
    );
    if (relInv && relInv.status === 'POSTED') {
      return res.status(400).json({
        success: false,
        error: `Strict Post-Lock: Invoice ${relInv.invoiceNo} is finalized and POSTED. You must UNPOST it to DRAFT before deleting.`
      });
    }

    // 2. STRICT POST-LOCK CHECK: Verify in PostgreSQL
    try {
      client = await getDbClient();
      const invRes = await client.query('SELECT * FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1', [id]);
      if (invRes.rowCount > 0) {
        const row = invRes.rows[0];
        if (row.status === 'POSTED') {
          return res.status(400).json({
            success: false,
            error: `Strict Post-Lock: Invoice ${row.invoice_no || id} is finalized and POSTED. You must UNPOST it to DRAFT before deleting.`
          });
        }
        const items = Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items) : []);
        const barcodes = items.map((it: any) => it.barcode).filter(Boolean);
        if (barcodes.length > 0) {
          await client.query(`
            UPDATE inventory_pieces
            SET status = 'IN_STOCK', locked_by_buyer = NULL, locked_by_booth = NULL, lock_expires_at = NULL, reserved_until = NULL, is_sold = false, updated_at = NOW()
            WHERE barcode = ANY($1)
          `, [barcodes]);
        }
        const vNo = `JV-SLS-${row.invoice_no || row.id}`;
        await client.query(`DELETE FROM voucher_entries WHERE voucher_no = $1 OR voucher_id = $2`, [vNo, row.id]);
        await client.query(`DELETE FROM financial_vouchers WHERE voucher_no = $1 OR reference = $2 OR reference_no = $2`, [vNo, row.invoice_no]);
        await client.query('DELETE FROM sales_invoices WHERE id = $1', [row.id]);
      }
    } catch (dbErr) {
      console.warn('[salesRouter POST /invoices/:id/delete] PostgreSQL notice:', dbErr);
    } finally {
      if (client) await client.end().catch(() => {});
    }

    // 3. Purge from relationalStore
    SalesController.deleteInvoice(id);

    return res.json({ success: true, message: 'Draft invoice deleted and inventory released to stock' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to delete invoice' });
  }
});

// Retail POS Counter Sale Endpoints
salesRouter.post('/counter-sale/checkout', async (req, res) => {
  const result = SalesController.confirmCounterSale(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  if (Array.isArray(req.body.items) && req.body.items.length > 0) {
    const barcodes = req.body.items.map((it: any) => it.barcode).filter(Boolean);
    try {
      const client = await getDbClient();
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'SOLD', is_sold = true, updated_at = NOW()
        WHERE barcode = ANY($1)
      `, [barcodes]);
      await client.end().catch(() => {});
    } catch (_) {}
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
salesRouter.get('/custom-b2b/invoices', async (req, res) => {
  try {
    const client = await getDbClient();
    const [b2bRes, sinvRes] = await Promise.all([
      client.query(`SELECT * FROM b2b_sales ORDER BY created_at DESC;`),
      client.query(`SELECT * FROM sales_invoices WHERE channel = 'WHOLESALE_B2B' OR invoice_no ILIKE 'B2B-%' OR invoice_no ILIKE 'SLS-B2B%' ORDER BY created_at DESC;`)
    ]);
    await client.end().catch(() => {});

    const mappedMap = new Map<string, any>();

    // 1. Process sales_invoices
    for (const row of (sinvRes.rows || [])) {
      let parsedItems: any[] = [];
      if (Array.isArray(row.items)) parsedItems = row.items;
      else if (typeof row.items === 'string') {
        try { parsedItems = JSON.parse(row.items); } catch (_) {}
      }
      const invNo = row.invoice_no || `B2B-${row.id}`;
      const rawDate = row.invoice_date || (row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10));
      const subVal = Number(row.subtotal ?? row.total_amount ?? 0);
      const vatVal = Number(row.tax_amount ?? row.vat_amount ?? 0);
      const totalVal = Number(row.total_amount ?? (subVal + vatVal));

      mappedMap.set(invNo, {
        id: row.id,
        invoiceNo: invNo,
        clientId: row.client_id || '',
        customerName: row.customer_name || 'Wholesale Client',
        customerPhone: row.customer_phone || '',
        customerTrn: row.trn_no || '',
        invoiceDate: rawDate,
        date: rawDate,
        channel: 'WHOLESALE_B2B',
        isB2BCustomSale: true,
        paymentMethod: row.payment_method || 'CREDIT_ACCOUNT',
        paymentStatus: row.payment_status || (row.status === 'POSTED' ? 'PAID' : 'DRAFT'),
        subtotal: subVal,
        taxAmount: vatVal,
        vatAmount: vatVal,
        totalAmount: totalVal,
        grandTotalAED: totalVal,
        creditAmountDue: totalVal,
        status: String(row.status || 'DRAFT').toUpperCase(),
        items: parsedItems,
        shippingAddress: row.shipping_address || '',
        createdAt: row.created_at
      });
    }

    // 2. Overlay / add b2b_sales
    for (const b of (b2bRes.rows || [])) {
      const invNo = b.b2b_invoice_number || `B2B-${b.id}`;
      let parsedItems: any[] = [];
      if (Array.isArray(b.items)) parsedItems = b.items;
      else if (typeof b.items === 'string') {
        try { parsedItems = JSON.parse(b.items); } catch (_) {}
      }
      const rawDate = b.created_at ? String(b.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const totalVal = Number(b.total_amount || 0);
      const paidVal = Number(b.paid_amount || 0);
      const balVal = b.balance_due !== undefined ? Number(b.balance_due) : (totalVal - paidVal);
      const bStatus = String(b.credit_status || 'DRAFT').toUpperCase();

      if (mappedMap.has(invNo)) {
        const existing = mappedMap.get(invNo);
        existing.status = bStatus === 'POSTED' ? 'POSTED' : existing.status;
        existing.creditAmountDue = balVal;
        if (!existing.items || existing.items.length === 0) existing.items = parsedItems;
      } else {
        mappedMap.set(invNo, {
          id: b.id,
          invoiceNo: invNo,
          clientId: '',
          customerName: b.company_name || 'Wholesale Client',
          customerPhone: b.phone || '',
          customerTrn: b.trn_number || '',
          invoiceDate: rawDate,
          date: rawDate,
          channel: 'WHOLESALE_B2B',
          isB2BCustomSale: true,
          paymentMethod: 'CREDIT_ACCOUNT',
          paymentStatus: bStatus === 'POSTED' ? 'PAID' : 'DRAFT',
          subtotal: totalVal / 1.05,
          taxAmount: totalVal - (totalVal / 1.05),
          vatAmount: totalVal - (totalVal / 1.05),
          totalAmount: totalVal,
          grandTotalAED: totalVal,
          creditAmountDue: balVal,
          status: bStatus,
          items: parsedItems,
          shippingAddress: b.shipping_address || '',
          createdAt: b.created_at
        });
      }
    }

    return res.json(Array.from(mappedMap.values()));
  } catch (err: any) {
    console.error('Error fetching B2B invoices:', err);
    return res.json(SalesController.getB2BSalesInvoices?.() || []);
  }
});

salesRouter.get('/custom-b2b/available-bales', async (req, res) => {
  try {
    const client = await getDbClient();
    const balesRes = await client.query(`
      SELECT * FROM inward_gate_passes 
      WHERE status NOT IN ('SOLD_AS_BALE', 'CONSUMED_IN_SORTING')
      ORDER BY created_at DESC;
    `);
    await client.end().catch(() => {});
    if (balesRes.rows && balesRes.rows.length > 0) {
      const list = balesRes.rows.map(b => ({
        id: b.id,
        baleCode: b.bale_code || b.gate_pass_no,
        category: b.bale_category || 'Raw Garment Bale',
        grossWeightKg: Number(b.weight_kg || b.total_bale_weight || 45),
        landedCostAed: Number(b.total_bale_cost || 2000),
        supplierName: b.supplier_name || 'Direct Import',
        inwardDate: b.created_at ? new Date(b.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
      }));
      return res.json(list);
    }
  } catch (_) {}
  return res.json(SalesController.getAvailableRawBales());
});

salesRouter.get('/custom-b2b/scan/:barcode', async (req, res) => {
  const { barcode } = req.params;
  const norm = (barcode || '').trim();

  // 1. Direct PostgreSQL check
  try {
    const client = await getDbClient();
    // Check raw bale first
    const baleRes = await client.query(`
      SELECT * FROM inward_gate_passes 
      WHERE (bale_code ILIKE $1 OR gate_pass_no ILIKE $1 OR id::text = $1)
      LIMIT 1;
    `, [norm]);

    if (baleRes.rows && baleRes.rows.length > 0) {
      const b = baleRes.rows[0];
      await client.end().catch(() => {});
      if (b.status === 'SOLD_AS_BALE') {
        return res.status(400).json({ success: false, error: `Raw Bale "${b.bale_code || b.gate_pass_no}" is already marked as SOLD!` });
      }
      return res.json({
        success: true,
        isRawBale: true,
        bale: {
          id: b.id,
          baleCode: b.bale_code || b.gate_pass_no,
          category: b.bale_category || 'Raw Garment Bale',
          supplierName: b.supplier_name || 'Direct Import',
          grossWeightKg: Number(b.weight_kg || b.total_bale_weight || 45),
          costPerGram: Number(b.cost_per_gram || 0),
          landedCostAed: Number(b.total_bale_cost || 2000),
          suggestedPriceAed: Math.round(Number(b.total_bale_cost || 2000) * 1.35)
        }
      });
    }

    // Check sorted garment piece
    const pieceRes = await client.query(`
      SELECT * FROM inventory_pieces 
      WHERE barcode ILIKE $1 OR id::text = $1
      LIMIT 1;
    `, [norm]);

    if (pieceRes.rows && pieceRes.rows.length > 0) {
      const p = pieceRes.rows[0];
      await client.end().catch(() => {});
      if (p.is_sold || p.status === 'SOLD') {
        return res.status(400).json({ success: false, error: `Garment Piece "${p.barcode}" (${p.brand_name || ''} ${p.item_name || ''}) has already been SOLD!` });
      }
      const grams = p.weight_grams || Math.round((Number(p.weight_kg) || 0.45) * 1000);
      const cogs = Number(p.cost_price || (p.cost_per_gram ? Number((grams * Number(p.cost_per_gram)).toFixed(2)) : 18.5));
      return res.json({
        success: true,
        isRawBale: false,
        piece: {
          id: p.id,
          barcode: p.barcode,
          brandName: p.brand_name || '',
          itemName: p.item_name || 'Garment Piece',
          size: p.size_scanned || p.size || 'M',
          labelGrade: p.label_grade || 'A',
          weightGrams: grams,
          weightKg: Number(p.weight_kg || grams / 1000),
          calculatedCostPrice: cogs,
          suggestedPriceAed: Number(p.retail_price_aed || p.estimated_price || p.ai_suggested_price || Math.round(cogs * 2.5))
        }
      });
    }
    await client.end().catch(() => {});
  } catch (err: any) {
    console.warn('DB lookup error in /custom-b2b/scan:', err?.message);
  }

  // 2. RelationalStore fallback
  const result = SalesController.lookupB2BBarcode(barcode);
  if (!result.success) {
    return res.status(404).json({ success: false, error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/custom-b2b/save', async (req, res) => {
  const result = SalesController.createOrUpdateCustomB2BInvoice(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  if (Array.isArray(req.body.items) && req.body.items.length > 0) {
    const pieceBarcodes = req.body.items.filter((it: any) => !it.isRawBale).map((it: any) => it.barcode).filter(Boolean);
    if (pieceBarcodes.length > 0) {
      try {
        const client = await getDbClient();
        await client.query(`
          UPDATE inventory_pieces
          SET status = 'RESERVED', is_sold = false, updated_at = NOW()
          WHERE barcode = ANY($1) AND (is_sold = false OR is_sold IS NULL)
        `, [pieceBarcodes]);
        await client.end().catch(() => {});
      } catch (_) {}
    }
  }
  return res.json(result);
});

async function cascadeDeleteInvoiceVouchersPg(client: any, invoiceNo: string, invoiceId?: string) {
  if (!invoiceNo && !invoiceId) return;
  const no = (invoiceNo || '').trim();
  const id = (invoiceId || '').trim();

  // Find all matching vouchers
  const vRes = await client.query(
    `SELECT DISTINCT id, voucher_no FROM (
       SELECT id, voucher_no FROM financial_vouchers 
       WHERE reference = $1 OR reference_no = $1 OR reference = $2 OR reference_no = $2 
          OR narration ILIKE $3 OR narration ILIKE $4
       UNION
       SELECT id, voucher_no FROM vouchers 
       WHERE reference = $1 OR reference = $2 
          OR narration ILIKE $3 OR narration ILIKE $4
     ) matched`,
    [no, id, `%${no}%`, `%${id}%`]
  );

  const matched = vRes.rows || [];
  const vIds = matched.map((r: any) => r.id).filter(Boolean);
  const vNos = matched.map((r: any) => r.voucher_no).filter(Boolean);

  // Find affected account codes before deleting
  const accRes = await client.query(
    `SELECT DISTINCT account_code FROM (
       SELECT account_code FROM voucher_entries WHERE voucher_id = ANY($1::text[]) OR voucher_no = ANY($2::text[])
       UNION
       SELECT account_code FROM general_ledger WHERE voucher_id = ANY($1::text[]) OR voucher_no = ANY($2::text[]) OR narration ILIKE $3
       UNION
       SELECT account_code FROM ledgers WHERE voucher_id = ANY($1::text[]) OR voucher_no = ANY($2::text[]) OR narration ILIKE $3
     ) sub WHERE account_code IS NOT NULL`,
    [vIds, vNos, `%${no}%`]
  );
  const affectedCodes = (accRes.rows || []).map((r: any) => r.account_code).filter(Boolean);

  // 1. Delete voucher entries
  if (vIds.length > 0 || vNos.length > 0) {
    await client.query(`DELETE FROM voucher_entries WHERE voucher_id = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [vIds, vNos]);
    await client.query(`DELETE FROM journal_entries WHERE voucher_id = ANY($1::text[])`, [vIds]);
    await client.query(`DELETE FROM general_ledger WHERE voucher_id = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [vIds, vNos]);
    await client.query(`DELETE FROM ledgers WHERE voucher_id = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [vIds, vNos]);
    await client.query(`DELETE FROM financial_vouchers WHERE id = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [vIds, vNos]);
    await client.query(`DELETE FROM vouchers WHERE id = ANY($1::text[]) OR voucher_no = ANY($2::text[])`, [vIds, vNos]);
  }

  // 2. Extra safety: Purge any lingering ledger entries with narration mentioning invoiceNo
  if (no) {
    await client.query(`DELETE FROM journal_entries WHERE description ILIKE $1`, [`%${no}%`]);
    await client.query(`DELETE FROM general_ledger WHERE narration ILIKE $1`, [`%${no}%`]);
    await client.query(`DELETE FROM ledgers WHERE narration ILIKE $1`, [`%${no}%`]);
  }

  // 3. Recalculate balances for all affected accounts in coa_accounts and chart_of_accounts
  if (affectedCodes.length > 0) {
    for (const code of affectedCodes) {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) as net FROM general_ledger WHERE account_code = $1`,
        [code]
      );
      const net = Math.abs(Number(sumRes.rows[0]?.net || 0)).toFixed(2);
      await client.query(`UPDATE coa_accounts SET current_balance = $1 WHERE code = $2`, [net, code]);
      await client.query(`UPDATE chart_of_accounts SET current_balance = $1 WHERE code = $2`, [net, code]);
    }
  }
}

salesRouter.post('/custom-b2b/:id/post', async (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  try {
    return await withDb(async (client) => {
      // 1. Fetch invoice info
      const [b2bRes, sinvRes] = await Promise.all([
        client.query(`SELECT id, b2b_invoice_number, credit_status, items FROM b2b_sales WHERE id::text = $1 OR b2b_invoice_number = $1 LIMIT 1`, [id]),
        client.query(`SELECT id, invoice_no, status, items FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1`, [id])
      ]);

      const b2bRow = b2bRes.rows[0];
      const sinvRow = sinvRes.rows[0];
      const invNo = b2bRow?.b2b_invoice_number || sinvRow?.invoice_no || id;
      const invId = b2bRow?.id || sinvRow?.id || id;
      const currentStatus = String(b2bRow?.credit_status || sinvRow?.status || '').toUpperCase();

      if (currentStatus === 'POSTED') {
        return res.status(400).json({ success: false, error: `Invoice ${invNo} is already POSTED.` });
      }

      const relInv = relationalStore.getSalesInvoices().find(i => i.id === id || i.invoiceNo === id || i.invoiceNo === invNo);

      let rawItems = b2bRow?.items || sinvRow?.items || relInv?.items || [];
      if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (_) {}
      }
      if (!Array.isArray(rawItems)) rawItems = [];

      const pieceBarcodes = rawItems.filter((it: any) => !it.isRawBale).map((it: any) => it.barcode).filter(Boolean);
      const baleCodes = rawItems.filter((it: any) => it.isRawBale).map((it: any) => it.barcode).filter(Boolean);

      // 2. Mark status as POSTED in PostgreSQL
      await client.query(`UPDATE b2b_sales SET credit_status = 'POSTED' WHERE id::text = $1 OR b2b_invoice_number = $2`, [invId, invNo]);
      await client.query(`UPDATE sales_invoices SET status = 'POSTED' WHERE id::text = $1 OR invoice_no = $2`, [invId, invNo]);

      // 3. Mark pieces as SOLD
      if (pieceBarcodes.length > 0) {
        await client.query(`
          UPDATE inventory_pieces
          SET status = 'SOLD', is_sold = true, updated_at = NOW()
          WHERE barcode = ANY($1::text[])
        `, [pieceBarcodes]);
      }

      // 4. Mark bales as SOLD_AS_BALE
      if (baleCodes.length > 0) {
        await client.query(`
          UPDATE inward_gate_passes
          SET status = 'SOLD_AS_BALE', sorting_status = 'FULLY_SORTED', updated_at = NOW()
          WHERE bale_code = ANY($1::text[]) OR gate_pass_no = ANY($1::text[])
        `, [baleCodes]).catch(() => {});
        await client.query(`
          UPDATE raw_bales
          SET status = 'PROCESSED', updated_at = NOW()
          WHERE bale_code = ANY($1::text[])
        `, [baleCodes]).catch(() => {});
      }

      // 5. Post in relationalStore
      SalesController.postCustomB2BInvoice(invId, postedBy || 'Sales Lead');
      if (relInv && relInv.id !== invId) {
        SalesController.postCustomB2BInvoice(relInv.id, postedBy || 'Sales Lead');
      }

      return res.json({
        success: true,
        message: `Invoice ${invNo} successfully POSTED & DISPATCHED.`
      });
    });
  } catch (err: any) {
    console.error('[salesRouter POST /custom-b2b/:id/post] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to post invoice' });
  }
});

salesRouter.post('/custom-b2b/:id/unpost', async (req, res) => {
  const { id } = req.params;
  try {
    return await withDb(async (client) => {
      // 1. Fetch invoice info from database
      const [b2bRes, sinvRes] = await Promise.all([
        client.query(`SELECT id, b2b_invoice_number, credit_status, items FROM b2b_sales WHERE id::text = $1 OR b2b_invoice_number = $1 LIMIT 1`, [id]),
        client.query(`SELECT id, invoice_no, status, items FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1`, [id])
      ]);

      const b2bRow = b2bRes.rows[0];
      const sinvRow = sinvRes.rows[0];
      const invNo = b2bRow?.b2b_invoice_number || sinvRow?.invoice_no || id;
      const invId = b2bRow?.id || sinvRow?.id || id;

      const relInv = relationalStore.getSalesInvoices().find(i => i.id === id || i.invoiceNo === id || i.invoiceNo === invNo);

      // Collect items to restore
      let rawItems = b2bRow?.items || sinvRow?.items || relInv?.items || [];
      if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (_) {}
      }
      if (!Array.isArray(rawItems)) rawItems = [];

      const pieceBarcodes = rawItems.filter((it: any) => !it.isRawBale).map((it: any) => it.barcode).filter(Boolean);
      const baleCodes = rawItems.filter((it: any) => it.isRawBale).map((it: any) => it.barcode).filter(Boolean);

      // 1. Update status to DRAFT in PostgreSQL
      await client.query(`UPDATE b2b_sales SET credit_status = 'DRAFT' WHERE id::text = $1 OR b2b_invoice_number = $2`, [invId, invNo]);
      await client.query(`UPDATE sales_invoices SET status = 'DRAFT' WHERE id::text = $1 OR invoice_no = $2`, [invId, invNo]);

      // 2. Restore piece barcodes to IN_STOCK (not SOLD)
      if (pieceBarcodes.length > 0) {
        await client.query(`
          UPDATE inventory_pieces
          SET status = 'IN_STOCK', is_sold = false, updated_at = NOW()
          WHERE barcode = ANY($1::text[])
        `, [pieceBarcodes]);
      }

      // 3. Restore raw bales
      if (baleCodes.length > 0) {
        await client.query(`
          UPDATE inward_gate_passes
          SET status = 'AVAILABLE', sorting_status = 'UNOPENED', updated_at = NOW()
          WHERE bale_code = ANY($1::text[]) OR gate_pass_no = ANY($1::text[])
        `, [baleCodes]).catch(() => {});
        await client.query(`
          UPDATE raw_bales
          SET status = 'UNOPENED', updated_at = NOW()
          WHERE bale_code = ANY($1::text[])
        `, [baleCodes]).catch(() => {});
      }

      // 4. Cascade delete vouchers / journal entries / ledger entries
      await cascadeDeleteInvoiceVouchersPg(client, invNo, invId);

      // 5. Update relationalStore
      SalesController.unpostCustomB2BInvoice(invId);
      if (relInv && relInv.id !== invId) {
        SalesController.unpostCustomB2BInvoice(relInv.id);
      }

      return res.json({
        success: true,
        message: `Invoice ${invNo} successfully unposted. Stock restored and General Ledger JV reversed.`
      });
    });
  } catch (err: any) {
    console.error('[salesRouter POST /custom-b2b/:id/unpost] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to unpost invoice' });
  }
});

salesRouter.delete('/custom-b2b/:id', async (req, res) => {
  const { id } = req.params;
  try {
    return await withDb(async (client) => {
      // 1. Fetch invoice info from database
      const [b2bRes, sinvRes] = await Promise.all([
        client.query(`SELECT id, b2b_invoice_number, credit_status, items FROM b2b_sales WHERE id::text = $1 OR b2b_invoice_number = $1 LIMIT 1`, [id]),
        client.query(`SELECT id, invoice_no, status, items FROM sales_invoices WHERE id::text = $1 OR invoice_no = $1 LIMIT 1`, [id])
      ]);

      const b2bRow = b2bRes.rows[0];
      const sinvRow = sinvRes.rows[0];
      const invNo = b2bRow?.b2b_invoice_number || sinvRow?.invoice_no || id;
      const invId = b2bRow?.id || sinvRow?.id || id;
      const status = String(b2bRow?.credit_status || sinvRow?.status || '').toUpperCase();

      // Check in relationalStore as well
      const relInv = relationalStore.getSalesInvoices().find(i => i.id === id || i.invoiceNo === id || i.invoiceNo === invNo);
      const relStatus = String(relInv?.status || '').toUpperCase();

      // STRICT LOCK CHECK: Cannot delete a POSTED invoice
      if (status === 'POSTED' || relStatus === 'POSTED') {
        return res.status(400).json({
          success: false,
          error: `Cannot delete POSTED invoice ${invNo}. Please UNPOST it first to unlock and reverse accounting entries.`
        });
      }

      // Collect items to restore
      let rawItems = b2bRow?.items || sinvRow?.items || relInv?.items || [];
      if (typeof rawItems === 'string') {
        try { rawItems = JSON.parse(rawItems); } catch (_) {}
      }
      if (!Array.isArray(rawItems)) rawItems = [];

      const pieceBarcodes = rawItems.filter((it: any) => !it.isRawBale).map((it: any) => it.barcode).filter(Boolean);
      const baleCodes = rawItems.filter((it: any) => it.isRawBale).map((it: any) => it.barcode).filter(Boolean);

      // Restore piece barcodes to IN_STOCK
      if (pieceBarcodes.length > 0) {
        await client.query(`
          UPDATE inventory_pieces
          SET status = 'IN_STOCK', is_sold = false, updated_at = NOW()
          WHERE barcode = ANY($1::text[])
        `, [pieceBarcodes]);
      }

      // Restore raw bales to AVAILABLE
      if (baleCodes.length > 0) {
        await client.query(`
          UPDATE inward_gate_passes
          SET status = 'AVAILABLE', sorting_status = 'UNOPENED', updated_at = NOW()
          WHERE bale_code = ANY($1::text[]) OR gate_pass_no = ANY($1::text[])
        `, [baleCodes]).catch(() => {});
        await client.query(`
          UPDATE raw_bales
          SET status = 'UNOPENED', updated_at = NOW()
          WHERE bale_code = ANY($1::text[])
        `, [baleCodes]).catch(() => {});
      }

      // Delete from b2b_sales & sales_invoices
      await client.query(`DELETE FROM b2b_sales WHERE id::text = $1 OR b2b_invoice_number = $2`, [invId, invNo]);
      await client.query(`DELETE FROM sales_invoices WHERE id::text = $1 OR invoice_no = $2`, [invId, invNo]);

      // Cascade delete any vouchers / general ledger entries associated with this invoice
      await cascadeDeleteInvoiceVouchersPg(client, invNo, invId);

      // Purge from relationalStore
      SalesController.deleteDraftCustomB2BInvoice(invId);
      if (relInv && relInv.id !== invId) {
        SalesController.deleteDraftCustomB2BInvoice(relInv.id);
      }

      return res.json({
        success: true,
        message: `Draft invoice ${invNo} successfully deleted. Inventory items restored and accounting entries purged.`
      });
    });
  } catch (err: any) {
    console.error('[salesRouter DELETE /custom-b2b/:id] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to delete invoice' });
  }
});

// ==========================================
// OMNICHANNEL SALES SETTINGS & DISPATCH APIS
// ==========================================

// GET /api/sales/settings
salesRouter.get('/settings', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
      ['pos_sales_clearing', '1130-05', 'Walk In Customer (Customer) Control Khata'],
      ['vat_output_account', '2140-01', 'UAE VAT Output Tax (5%) Account'],
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
        AND status = 'IN_STOCK'
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

// ======================== LIVE STREAM CONCURRENCY & SIMULATOR ENDPOINTS ========================
salesRouter.post('/live/claim', async (req, res) => {
  const {
    barcode,
    buyerHandle,
    buyerPhone,
    channel,
    boothId,
    stationId,
    offeredPrice,
    lockDurationSeconds,
    reservationTimeoutMinutes
  } = req.body;

  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'Barcode and buyerHandle are required' });
  }

  const result = await executePessimisticClaim({
    barcode,
    buyerHandle,
    buyerPhone,
    channel,
    boothId: boothId || 'booth-1',
    stationId: stationId || 'Station 1',
    offeredPrice,
    lockDurationSeconds,
    reservationTimeoutMinutes
  });

  if (!result.success) {
    return res.status(result.statusCode || 409).json({
      success: false,
      error: result.error,
      lockedByStation: result.lockedByStation,
      lockedByBuyer: result.lockedByBuyer
    });
  }

  return res.json({
    success: true,
    piece: result.piece,
    stationId: stationId || 'Station 1',
    buyerHandle,
    message: `Locked by ${stationId || 'Station 1'} for ${buyerHandle}`
  });
});

salesRouter.post('/live/release-lock', async (req, res) => {
  const { barcode, boothId, stationId } = req.body;
  if (!barcode) return res.status(400).json({ error: 'Barcode required' });

  const result = await executeReleaseLock({
    barcode,
    boothId: boothId || 'booth-1',
    stationId: stationId || 'Station 1'
  });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

salesRouter.post('/live/simulate-comment', async (req, res) => {
  const { customerName, customerPhone, platform, commentText, stationId, boothId } = req.body;
  if (!customerName || !commentText) {
    return res.status(400).json({ success: false, error: 'Customer name and comment text are required' });
  }

  const bId = boothId || 'booth-1';
  const stId = stationId || 'Station 1';
  const cleanComment = String(commentText).trim();
  const cleanPlatform = String(platform || 'TikTok Live').trim();
  const cleanBuyer = String(customerName).trim().startsWith('@') ? customerName.trim() : `@${customerName.trim()}`;

  const claimRegex = /\b(?:claim|mine|bin|take|buy)\s+([A-Za-z0-9\-_]+)/i;
  const match = cleanComment.match(claimRegex);
  let targetSku = match ? match[1].trim() : null;

  if (!targetSku) {
    const skuPattern = /\b((?:VIN|VV|BAL|DXB)[A-Za-z0-9\-_]+)/i;
    const skuMatch = cleanComment.match(skuPattern);
    if (skuMatch) {
      targetSku = skuMatch[1].trim();
    }
  }

  if (!targetSku) {
    const client = await getDbClient();
    try {
      const findRes = await client.query(
        `SELECT barcode FROM inventory_pieces 
         WHERE status = 'IN_STOCK' 
           AND (is_sold = false OR is_sold IS NULL) 
         ORDER BY created_at DESC LIMIT 1;`
      );
      if (findRes.rows.length > 0) {
        targetSku = findRes.rows[0].barcode;
      }
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (!targetSku) {
    return res.status(404).json({
      success: false,
      isClaim: true,
      error: 'No active SKU found on air or available in stock to claim.'
    });
  }

  const claimResult = await executePessimisticClaim({
    stationId: stId,
    barcode: targetSku,
    buyerHandle: cleanBuyer,
    buyerPhone: customerPhone,
    channel: cleanPlatform,
    boothId: bId
  });

  if (!claimResult.success) {
    return res.status(claimResult.statusCode || 409).json({
      success: false,
      isClaim: true,
      attemptedSku: targetSku,
      error: claimResult.error,
      lockedByStation: claimResult.lockedByStation,
      lockedByBuyer: claimResult.lockedByBuyer
    });
  }

  return res.json({
    success: true,
    isClaim: true,
    claimedSku: targetSku,
    stationId: stId,
    buyerHandle: cleanBuyer,
    platform: cleanPlatform,
    piece: claimResult.piece,
    message: `✓ Concurrency Lock Acquired: Item ${targetSku} successfully claimed by ${stId} for ${cleanBuyer} via ${cleanPlatform}!`
  });
});

