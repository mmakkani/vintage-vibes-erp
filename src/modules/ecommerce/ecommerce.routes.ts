import { Router, Request, Response } from 'express';
import { supabase } from '../../supabaseClient.ts';
import { Client } from 'pg';
import crypto from 'crypto';

export const ecommerceRouter = Router();

const getDbClient = async () => {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
};

// -------------------------------------------------------------
// 1. GET /api/ecommerce/products - Available In-Stock Pieces Array []
// -------------------------------------------------------------
ecommerceRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || '';
    const search = (req.query.search as string) || '';

    let client: Client | null = null;
    try {
      client = await getDbClient();

      // Expire stale cart reservations
      await client.query(`
        UPDATE cart_reservations 
        SET is_active = false 
        WHERE is_active = true AND expires_at <= NOW()
      `);

      // Query active in-stock pieces with any active cart lock
      let query = `
        SELECT 
          p.*,
          COALESCE(r.is_active AND r.expires_at > NOW(), false) AS is_cart_locked,
          r.expires_at AS cart_lock_expires_at,
          r.session_id AS cart_locked_by_session
        FROM inventory_pieces p
        LEFT JOIN cart_reservations r 
          ON p.barcode = r.barcode AND r.is_active = true AND r.expires_at > NOW()
        WHERE p.is_sold = false AND (p.status IS NULL OR p.status != 'SOLD')
      `;

      const params: any[] = [];
      if (category && category !== 'ALL') {
        params.push(`%${category}%`);
        query += ` AND (p.item_name ILIKE $${params.length} OR p.style ILIKE $${params.length})`;
      }
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (p.item_name ILIKE $${params.length} OR p.brand_name ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`;
      }

      query += ` ORDER BY p.created_at DESC LIMIT 100`;

      const result = await client.query(query, params);
      const rows = result.rows || [];

      // If database has records, format them cleanly
      if (rows.length > 0) {
        const formatted = rows.map(r => ({
          id: r.id || r.barcode,
          barcode: r.barcode,
          itemId: r.item_id || 'ITM-01',
          itemName: r.item_name || 'Vintage Garment',
          brandId: r.brand_id,
          brandName: r.brand_name || 'Vintage Archive',
          sizeScanned: r.size_scanned || 'L',
          countryOfOrigin: r.country_of_origin || 'USA',
          style: r.style || 'Single-Stitch Vintage',
          frontImageUrl: r.front_image_url || r.tag_image_url || '/studio_left_rack.png',
          backImageUrl: r.back_image_url || r.front_image_url || '/studio_backdrop_noboy.png',
          tagImageUrl: r.tag_image_url || '/studio_left_rack.png',
          labelGrade: r.label_grade || 'Grade A+ (Pristine)',
          brandTier: r.brand_tier || 'Grail',
          shopLocation: r.shop_name || r.shop_location || 'Al Ain Vintage Hub',
          pitToPitInches: r.pit_to_pit_inches ? Number(r.pit_to_pit_inches) : 22,
          lengthInches: r.length_inches ? Number(r.length_inches) : 29,
          weightKg: Number(r.weight_kg || 0.4),
          estimatedPrice: Number(r.estimated_price || r.retail_price_aed || 295),
          retailPriceAed: Number(r.retail_price_aed || r.estimated_price || 295),
          isSold: Boolean(r.is_sold),
          status: r.status || 'IN_STOCK',
          isCartLocked: Boolean(r.is_cart_locked),
          cartLockExpiresAt: r.cart_lock_expires_at,
          cartLockedBySession: r.cart_locked_by_session,
          createdAt: r.created_at
        }));
        return res.json(formatted);
      }
    } finally {
      if (client) await client.end().catch(() => {});
    }

    // Fallback via Supabase client if direct PG returned 0 rows
    const { data: supaData } = await supabase
      .from('inventory_pieces')
      .select('*')
      .eq('is_sold', false)
      .neq('status', 'SOLD')
      .order('created_at', { ascending: false })
      .limit(100);

    if (supaData && supaData.length > 0) {
      return res.json(supaData);
    }

    return res.json([]);

  } catch (err: any) {
    console.error('Error in /api/ecommerce/products:', err);
    return res.status(500).json({ error: err?.message || 'Database error fetching products' });
  }
});

// -------------------------------------------------------------
// 2. POST /api/ecommerce/cart/reserve - 10-Minute Cart Lock
// -------------------------------------------------------------
ecommerceRouter.post('/cart/reserve', async (req: Request, res: Response) => {
  let client: Client | null = null;
  try {
    const { barcode, sessionId, pieceTitle, priceAed } = req.body;
    if (!barcode || !sessionId) {
      return res.status(400).json({ success: false, error: 'barcode and sessionId are required' });
    }

    client = await getDbClient();

    // Check if piece is already sold
    const pieceRes = await client.query('SELECT is_sold, status FROM inventory_pieces WHERE barcode = $1', [barcode]);
    if (pieceRes.rows.length > 0 && (pieceRes.rows[0].is_sold || pieceRes.rows[0].status === 'SOLD')) {
      return res.status(409).json({ success: false, error: 'This unique 1-of-1 piece has already been sold.' });
    }

    // Check if active reservation exists by someone else
    const resCheck = await client.query(`
      SELECT * FROM cart_reservations 
      WHERE barcode = $1 AND is_active = true AND expires_at > NOW() AND session_id != $2
    `, [barcode, sessionId]);

    if (resCheck.rows.length > 0) {
      const lock = resCheck.rows[0];
      return res.status(423).json({
        success: false,
        error: "This 1-of-1 piece is currently held in another collector's cart.",
        lockedUntil: lock.expires_at
      });
    }

    // Create or renew reservation for 10 minutes
    const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(`
      INSERT INTO cart_reservations (id, barcode, session_id, piece_title, price_aed, reserved_at, expires_at, is_active)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '10 minutes', true)
    `, [id, barcode, sessionId, pieceTitle || 'Vintage Piece', Number(priceAed || 0)]);

    const expiryTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return res.json({
      success: true,
      reservationId: id,
      barcode,
      expiresAt: expiryTime,
      message: '1-of-1 piece reserved in vault for 10 minutes.'
    });

  } catch (err: any) {
    console.error('Error reserving cart piece:', err);
    return res.status(500).json({ success: false, error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 3. POST /api/ecommerce/cart/release - Release Piece Lock
// -------------------------------------------------------------
ecommerceRouter.post('/cart/release', async (req: Request, res: Response) => {
  let client: Client | null = null;
  try {
    const { barcode, sessionId } = req.body;
    if (!barcode) return res.status(400).json({ error: 'barcode is required' });

    client = await getDbClient();
    await client.query(`
      UPDATE cart_reservations 
      SET is_active = false 
      WHERE barcode = $1 ${sessionId ? 'AND session_id = $2' : ''}
    `, sessionId ? [barcode, sessionId] : [barcode]);

    return res.json({ success: true, message: 'Cart lock released.' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 4. POST /api/ecommerce/orders/checkout - Atomic SQL Purchase
// -------------------------------------------------------------
ecommerceRouter.post('/orders/checkout', async (req: Request, res: Response) => {
  let client: Client | null = null;
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      city,
      country,
      items,
      paymentMethod,
      paymentRef,
      sessionId
    } = req.body;

    if (!customerName || !customerPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Customer name, phone and items array are required.' });
    }

    client = await getDbClient();
    await client.query('BEGIN');

    // 1. Verify pieces are still available
    const barcodes = items.map((i: any) => i.barcode || i.id);
    const checkQuery = await client.query(`
      SELECT barcode, is_sold, status FROM inventory_pieces 
      WHERE barcode = ANY($1) FOR UPDATE
    `, [barcodes]);

    for (const row of checkQuery.rows) {
      if (row.is_sold || row.status === 'SOLD') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: `Piece ${row.barcode} was just purchased by another collector!`
        });
      }
    }

    // 2. Compute financial totals
    const subtotal = items.reduce((sum: number, item: any) => sum + Number(item.unitPrice || item.price || item.estimatedPrice || 0), 0);
    const deliveryFee = subtotal >= 350 ? 0 : 25; // Free delivery over 350 AED
    const totalAmount = subtotal + deliveryFee;
    const orderId = crypto.randomUUID();
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    // 3. Compute payment classification
    const isOnlinePaid = paymentMethod && paymentMethod !== 'COD' && paymentMethod !== 'CASH_ON_DELIVERY';
    const computedPaymentStatus = isOnlinePaid ? 'PAID' : 'UNPAID_PENDING_COD';
    const computedPaymentRef = isOnlinePaid
      ? (paymentRef || `TXN-${Date.now().toString().slice(-6)}`)
      : 'COD-PAY-ON-DELIVERY';

    // 4. Insert into orders table
    await client.query(`
      INSERT INTO orders (
        id, order_number, customer_name, customer_phone, customer_email, customer_address, 
        city, country, items, subtotal, delivery_fee, total_amount, currency, 
        payment_method, payment_status, payment_reference, order_status, source, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
    `, [
      orderId,
      orderNumber,
      customerName,
      customerPhone,
      customerEmail || '',
      shippingAddress || '',
      city || 'Dubai',
      country || 'UAE',
      JSON.stringify(items),
      subtotal,
      deliveryFee,
      totalAmount,
      'AED',
      paymentMethod || 'COD',
      computedPaymentStatus,
      computedPaymentRef,
      'CONFIRMED',
      'STOREFRONT',
      isOnlinePaid ? `Online Payment Ref: ${computedPaymentRef}` : `Cash on Delivery (Collect AED ${totalAmount.toFixed(2)})`
    ]);

    // 5. Atomically lock pieces: status = 'CLAIMED_PENDING', is_sold = true
    await client.query(`
      UPDATE inventory_pieces 
      SET is_sold = true, status = 'CLAIMED_PENDING' 
      WHERE barcode = ANY($1)
    `, [barcodes]);

    // 6. Deactivate cart reservations
    await client.query(`
      UPDATE cart_reservations 
      SET is_active = false 
      WHERE barcode = ANY($1)
    `, [barcodes]);

    // 7. Queue active DRAFT sales invoice in Dispatch Hub (DraftInvoicesManager)
    const invoiceId = `inv-${Date.now()}`;
    const invoiceNo = `SINV-${Date.now().toString().slice(-6)}`;
    await client.query(`
      INSERT INTO sales_invoices (
        id, invoice_no, customer_name, customer_phone, invoice_date, channel, 
        payment_method, payment_status, payment_reference, shipping_address, city,
        subtotal, discount_amount, tax_amount, total_amount, status, items, order_id, created_at
      ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'ECOMMERCE', $5, $6, $7, $8, $9, $10, 0, 0, $11, 'DRAFT', $12, $13, NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [
      invoiceId,
      invoiceNo,
      customerName,
      customerPhone,
      paymentMethod || 'COD',
      computedPaymentStatus,
      computedPaymentRef,
      shippingAddress || '',
      city || 'Dubai',
      subtotal,
      totalAmount,
      JSON.stringify(items),
      orderId
    ]);

    await client.query('COMMIT');

    // 7. Format WhatsApp notification URL
    const itemsList = items.map((it: any) => `• ${it.description || it.itemName || it.barcode} (AED ${it.unitPrice || it.price})`).join('\n');
    const waText = encodeURIComponent(
      `*Vintage Vibes Dubai - Order Confirmation*\n` +
      `Order Ref: *#${orderNumber}*\n` +
      `Customer: ${customerName}\n` +
      `Phone: ${customerPhone}\n` +
      `Address: ${shippingAddress || city}\n\n` +
      `*Items:*\n${itemsList}\n\n` +
      `*Total Payable:* AED ${totalAmount.toFixed(2)} (${paymentMethod})\n\n` +
      `Thank you for shopping authentic vintage!`
    );
    const whatsappUrl = `https://wa.me/971508839120?text=${waText}`;

    return res.json({
      success: true,
      order: {
        id: orderId,
        orderNumber,
        customerName,
        customerPhone,
        totalAmount,
        subtotal,
        deliveryFee,
        items,
        paymentMethod,
        orderStatus: 'CONFIRMED'
      },
      invoiceNo,
      whatsappUrl,
      message: `Order #${orderNumber} successfully confirmed and linked to SQL database!`
    });

  } catch (err: any) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Error during checkout transaction:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Database checkout error' });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 5. POST /api/ecommerce/bounty - Customer Grail Wishlist
// -------------------------------------------------------------
ecommerceRouter.post('/bounty', async (req: Request, res: Response) => {
  let client: Client | null = null;
  try {
    const { customerName, customerPhone, whatsappPhone, customerEmail, desiredBrand, desiredCategory, desiredSize, preferredSize, maxBudgetAed, notes, eraNotes } = req.body;
    const phone = whatsappPhone || customerPhone || req.body.phone;
    const name = customerName || req.body.name;
    const brand = desiredBrand || req.body.brand;
    if (!name || !phone || !brand) {
      return res.status(400).json({ error: 'customerName, phone and desiredBrand are required' });
    }

    client = await getDbClient();
    const id = req.body.id || `bounty-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const size = preferredSize || desiredSize || 'L';
    const era = eraNotes || notes || '';

    await client.query(`
      INSERT INTO grail_bounties (
        id, customer_name, customer_phone, whatsapp_phone, customer_email, 
        desired_brand, desired_category, desired_size, preferred_size, 
        max_budget_aed, notes, era_notes, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'OPEN', NOW(), NOW())
    `, [id, name, phone, whatsappPhone || phone, customerEmail || '', brand, desiredCategory || 'T-Shirts', size, size, Number(maxBudgetAed || 0), era, era]);

    return res.json({
      success: true,
      bountyId: id,
      message: `Grail bounty registered! We will notify ${phone} as soon as a matching ${brand} is scanned in a bale.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 5b. GET /api/ecommerce/bounties - List Grail Bounties
// -------------------------------------------------------------
ecommerceRouter.get('/bounties', async (req: Request, res: Response) => {
  let client: Client | null = null;
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
    return res.status(500).json({ error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 5c. PATCH /api/ecommerce/bounties/:id/status - Update Lifecycle Status
// -------------------------------------------------------------
ecommerceRouter.patch('/bounties/:id/status', async (req: Request, res: Response) => {
  let client: Client | null = null;
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
    return res.status(500).json({ error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 5d. GET /api/ecommerce/bounties/auto-match - Match Available Inventory
// -------------------------------------------------------------
ecommerceRouter.get('/bounties/auto-match', async (req: Request, res: Response) => {
  let client: Client | null = null;
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
    return res.status(500).json({ error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});

// -------------------------------------------------------------
// 6. GET /api/ecommerce/orders/:orderNumber - Order Status Lookup
// -------------------------------------------------------------
ecommerceRouter.get('/orders/:orderNumber', async (req: Request, res: Response) => {
  let client: Client | null = null;
  try {
    const { orderNumber } = req.params;
    client = await getDbClient();

    const result = await client.query('SELECT * FROM orders WHERE order_number = $1 OR id::text = $1', [orderNumber]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});
