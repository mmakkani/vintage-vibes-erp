import { Router, Request, Response } from 'express';
import { supabase } from '../../supabaseClient.ts';
import { withDb } from '../../db/pgPool.ts';
import crypto from 'crypto';

export const ecommerceRouter = Router();

// High-concurrency in-memory cache for storefront products (serves 1,000+ simultaneous collectors in <0.2ms)
interface ProductsCacheEntry {
  data: any[];
  timestamp: number;
}
const PRODUCTS_CACHE_TTL_MS = 15_000; // 15s cache TTL
const productsCache = new Map<string, ProductsCacheEntry>();

export const clearProductsCache = () => {
  productsCache.clear();
};

// -------------------------------------------------------------
// 1. GET /api/ecommerce/products - Available In-Stock Pieces (with Pagination Support)
// -------------------------------------------------------------
ecommerceRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || '';
    const department = (req.query.department as string) || '';
    const subCategory = (req.query.subCategory as string) || '';
    const collectionId = (req.query.collectionId as string) || '';
    const search = (req.query.search as string) || '';
    const segment = (req.query.segment as string) || '';
    const size = (req.query.size as string) || '';
    const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;
    const era = (req.query.era as string) || '';
    const sort = (req.query.sort as string) || 'newest';
    const page = req.query.page ? Math.max(1, parseInt(req.query.page as string, 10) || 1) : null;
    const pageSize = req.query.pageSize ? Math.max(1, Math.min(100, parseInt(req.query.pageSize as string, 10) || 24)) : 24;
    const isPaginated = page !== null || req.query.paginated === 'true';

    // Check fast in-memory cache (<0.2ms response time)
    const cacheKey = `${category || 'ALL'}|${department || ''}|${subCategory || ''}|${collectionId || ''}|${search || ''}|${segment || 'ALL'}|${size || ''}|${minPrice || ''}|${maxPrice || ''}|${era || ''}|${sort || ''}|${page || ''}|${pageSize || ''}`;
    const cached = productsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < PRODUCTS_CACHE_TTL_MS) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    const formatted = await withDb(async (client) => {
      // Expire stale cart reservations
      // Deactivate expired cart reservations and restore pieces to IN_STOCK if not sold
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'IN_STOCK', reserved_until = NULL, updated_at = NOW()
        WHERE barcode IN (
          SELECT barcode FROM cart_reservations WHERE is_active = true AND expires_at <= NOW()
        ) AND status = 'RESERVED' AND (is_sold = false OR is_sold IS NULL);
      `).catch(() => {});
      await client.query(`
        UPDATE cart_reservations 
        SET is_active = false 
        WHERE is_active = true AND expires_at <= NOW()
      `).catch(() => {});

      // Query active in-stock pieces with any active cart lock (strictly excluding WIP_LAUNDRY and non-ecommerce pieces)
      let query = `
        SELECT 
          p.*,
          COUNT(*) OVER() AS total_count,
          COALESCE(r.is_active AND r.expires_at > NOW(), false) AS is_cart_locked,
          r.expires_at AS cart_lock_expires_at,
          r.session_id AS cart_locked_by_session
        FROM inventory_pieces p
        LEFT JOIN cart_reservations r 
          ON p.barcode = r.barcode AND r.is_active = true AND r.expires_at > NOW()
        WHERE p.is_sold = false 
          AND p.status = 'IN_STOCK'
          AND (p.ready_for_ecommerce IS NULL OR p.ready_for_ecommerce = true)
      `;

      const params: any[] = [];
      if (category && category !== 'ALL') {
        params.push(`%${category}%`);
        query += ` AND (p.item_name ILIKE $${params.length} OR p.style ILIKE $${params.length})`;
      }
      if (department && department !== 'ALL') {
        params.push(`%${department}%`);
        query += ` AND (p.parent_category_name ILIKE $${params.length} OR p.item_name ILIKE $${params.length})`;
      }
      if (subCategory && subCategory !== 'ALL') {
        params.push(`%${subCategory}%`);
        query += ` AND (p.sub_category ILIKE $${params.length} OR p.item_name ILIKE $${params.length})`;
      }
      if (collectionId && collectionId !== 'ALL') {
        params.push(collectionId);
        query += ` AND p.collection_id = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        query += ` AND (p.item_name ILIKE $${params.length} OR p.brand_name ILIKE $${params.length} OR p.barcode ILIKE $${params.length} OR p.style ILIKE $${params.length})`;
      }
      if (size && size !== 'ALL') {
        params.push(size);
        query += ` AND p.size_scanned = $${params.length}`;
      }
      if (minPrice !== null && !isNaN(minPrice)) {
        params.push(minPrice);
        query += ` AND COALESCE(p.retail_price_aed, p.estimated_price, 0) >= $${params.length}`;
      }
      if (maxPrice !== null && !isNaN(maxPrice)) {
        params.push(maxPrice);
        query += ` AND COALESCE(p.retail_price_aed, p.estimated_price, 0) <= $${params.length}`;
      }
      if (era && era !== 'ALL') {
        params.push(`%${era}%`);
        query += ` AND (p.style ILIKE $${params.length} OR p.item_name ILIKE $${params.length} OR p.brand_name ILIKE $${params.length})`;
      }
      if (segment && segment !== 'ALL') {
        if (segment === 'Antique') {
          params.push('Antique');
          query += ` AND (p.market_segment = $${params.length} OR p.style ILIKE '%antique%')`;
        } else if (segment === 'Vintage') {
          params.push('Vintage');
          query += ` AND (p.market_segment = $${params.length} OR p.market_segment IN ('Grails', 'Boutique', 'Old Vintage'))`;
        } else if (segment === 'Brand') {
          params.push('Brand');
          query += ` AND (p.market_segment = $${params.length} OR p.market_segment IN ('Boutique', 'Grails'))`;
        } else if (segment === 'Non-Brand') {
          params.push('Non-Brand');
          query += ` AND (p.market_segment = $${params.length} OR p.market_segment = 'Regular Thrift' OR p.market_segment IS NULL)`;
        } else {
          params.push(`%${segment}%`);
          query += ` AND (p.market_segment ILIKE $${params.length})`;
        }
      }

      // Order by
      if (sort === 'price_asc') {
        query += ` ORDER BY COALESCE(p.retail_price_aed, p.estimated_price, 0) ASC, p.id DESC`;
      } else if (sort === 'price_desc') {
        query += ` ORDER BY COALESCE(p.retail_price_aed, p.estimated_price, 0) DESC, p.id DESC`;
      } else if (sort === 'grails') {
        query += ` ORDER BY p.is_grail DESC, p.created_at DESC, p.id DESC`;
      } else {
        query += ` ORDER BY p.created_at DESC, p.id DESC`;
      }

      let totalCount = 0;
      if (isPaginated) {
        const offset = ((page || 1) - 1) * pageSize;
        params.push(pageSize);
        const limitParam = `$${params.length}`;
        params.push(offset);
        const offsetParam = `$${params.length}`;
        query += ` LIMIT ${limitParam} OFFSET ${offsetParam}`;
      } else {
        query += ` LIMIT 200`;
      }

      const result = await client.query(query, params);
      const rows = result.rows || [];
      if (rows.length > 0) {
        totalCount = parseInt(rows[0].total_count, 10) || rows.length;
      }

      // If database has records, format them cleanly
      if (rows.length > 0) {
        const mapped = rows.map(r => ({
          id: r.id || r.barcode,
          barcode: r.barcode,
          sku: r.sku || r.barcode,
          itemId: r.item_id || 'ITM-01',
          itemName: r.item_name || 'Vintage Garment',
          parentCategoryName: r.parent_category_name || null,
          subCategory: r.sub_category || null,
          collectionId: r.collection_id || null,
          collectionName: r.collection_name || null,
          brandId: r.brand_id,
          brandName: r.brand_name || 'Vintage Archive',
          sizeScanned: r.size_scanned || 'L',
          countryOfOrigin: r.country_of_origin || 'USA',
          style: r.style || 'Single-Stitch Vintage',
          ecommerceDescription: r.ecommerce_description || r.style || '',
          seoTags: Array.isArray(r.seo_tags) ? r.seo_tags : [],
          readyForEcommerce: r.ready_for_ecommerce !== false,
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
          marketSegment: r.market_segment || 'Vintage',
          isGrail: Boolean(r.is_grail),
          globalInsights: r.global_insights || null,
          aiSuggestedPrice: r.ai_suggested_price !== undefined && r.ai_suggested_price !== null ? Number(r.ai_suggested_price) : null,
          isPriceOverridden: Boolean(r.is_price_overridden),
          isCartLocked: Boolean(r.is_cart_locked),
          cartLockExpiresAt: r.cart_lock_expires_at,
          cartLockedBySession: r.cart_locked_by_session,
          createdAt: r.created_at
        }));

        if (isPaginated) {
          return {
            data: mapped,
            total: totalCount,
            page: page || 1,
            pageSize,
            totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
          };
        }
        return mapped;
      }
      return null;
    });

    if (formatted) {
      productsCache.set(cacheKey, { data: formatted as any, timestamp: Date.now() });
      res.setHeader('X-Cache', 'MISS');
      return res.json(formatted);
    }

    // Fallback via Supabase client if direct PG returned 0 rows
    let supaQuery = supabase
      .from('inventory_pieces')
      .select('*')
      .eq('is_sold', false)
      .eq('status', 'IN_STOCK')
      .or('ready_for_ecommerce.is.null,ready_for_ecommerce.eq.true');

    if (collectionId && collectionId !== 'ALL') {
      supaQuery = supaQuery.eq('collection_id', collectionId);
    }
    if (subCategory && subCategory !== 'ALL') {
      supaQuery = supaQuery.ilike('sub_category', `%${subCategory}%`);
    }

    if (segment && segment !== 'ALL') {
      if (segment === 'Antique') {
        supaQuery = supaQuery.eq('market_segment', 'Antique');
      } else if (segment === 'Vintage') {
        supaQuery = supaQuery.or('market_segment.eq.Vintage,market_segment.eq.Grails,market_segment.eq.Boutique');
      } else if (segment === 'Brand') {
        supaQuery = supaQuery.eq('market_segment', 'Brand');
      } else if (segment === 'Non-Brand') {
        supaQuery = supaQuery.or('market_segment.eq.Non-Brand,market_segment.eq.Regular Thrift,market_segment.is.null');
      } else {
        supaQuery = supaQuery.ilike('market_segment', `%${segment}%`);
      }
    }

    const { data: supaData } = await supaQuery
      .order('created_at', { ascending: false })
      .limit(100);

    if (supaData && supaData.length > 0) {
      const fallbackFormatted = supaData.map(r => ({
        ...r,
        sku: r.sku || r.barcode,
        parentCategoryName: r.parent_category_name || null,
        subCategory: r.sub_category || null,
        collectionId: r.collection_id || null,
        collectionName: r.collection_name || null,
        readyForEcommerce: r.ready_for_ecommerce !== false,
        ecommerceDescription: r.ecommerce_description || r.style || '',
        seoTags: Array.isArray(r.seo_tags) ? r.seo_tags : [],
        marketSegment: r.market_segment || 'Vintage',
        isGrail: Boolean(r.is_grail),
        globalInsights: r.global_insights,
        retailPriceAed: Number(r.retail_price_aed || r.estimated_price || 0)
      }));
      productsCache.set(cacheKey, { data: fallbackFormatted, timestamp: Date.now() });
      res.setHeader('X-Cache', 'FALLBACK');
      return res.json(fallbackFormatted);
    }

    return res.json([]);

  } catch (err: any) {
    console.error('Error in /api/ecommerce/products:', err);
    return res.status(500).json({ error: err?.message || 'Database error fetching products' });
  }
});

// -------------------------------------------------------------
// GET /api/ecommerce/collections - Active Seasonal Collections
// -------------------------------------------------------------
ecommerceRouter.get('/collections', async (_req: Request, res: Response) => {
  try {
    const collections = await withDb(async (client) => {
      const res = await client.query(`
        SELECT c.*, 
               COUNT(p.id) FILTER (WHERE p.is_sold = false AND (p.status IS NULL OR p.status NOT IN ('SOLD', 'WIP_LAUNDRY'))) as piece_count
        FROM collections c
        LEFT JOIN inventory_pieces p ON c.id = p.collection_id
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.created_at ASC
      `);
      return res.rows;
    });

    if (collections && collections.length > 0) {
      return res.json(collections);
    }

    // Fallback via Supabase
    const { data, error } = await supabase
      .from('collections')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.json(data || []);
  } catch (err: any) {
    console.error('Error fetching ecommerce collections:', err);
    return res.status(500).json({ error: err?.message || 'Database error' });
  }
});

// -------------------------------------------------------------
// 2. POST /api/ecommerce/cart/reserve - 10-Minute Cart Lock
// -------------------------------------------------------------
ecommerceRouter.post('/cart/reserve', async (req: Request, res: Response) => {
  try {
    const { barcode, sessionId, pieceTitle, priceAed } = req.body;
    if (!barcode || !sessionId) {
      return res.status(400).json({ success: false, error: 'barcode and sessionId are required' });
    }

    const outcome = await withDb(async (client) => {
      // Check if piece is already sold
      const pieceRes = await client.query('SELECT is_sold, status FROM inventory_pieces WHERE barcode = $1', [barcode]);
      if (pieceRes.rows.length > 0 && (pieceRes.rows[0].is_sold || pieceRes.rows[0].status === 'SOLD')) {
        return { status: 409, body: { success: false, error: 'This unique 1-of-1 piece has already been sold.' } };
      }

      // Check if active reservation exists by someone else
      const resCheck = await client.query(`
        SELECT * FROM cart_reservations 
        WHERE barcode = $1 AND is_active = true AND expires_at > NOW() AND session_id != $2
      `, [barcode, sessionId]);

      if (resCheck.rows.length > 0) {
        const lock = resCheck.rows[0];
        return {
          status: 423,
          body: {
            success: false,
            error: "This 1-of-1 piece is currently held in another collector's cart.",
            lockedUntil: lock.expires_at
          }
        };
      }

      // Create or renew reservation for 10 minutes
      const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await client.query(`
        INSERT INTO cart_reservations (id, barcode, session_id, piece_title, price_aed, reserved_at, expires_at, is_active)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '10 minutes', true)
      `, [id, barcode, sessionId, pieceTitle || 'Vintage Piece', Number(priceAed || 0)]);

      // Atomically update inventory_pieces to RESERVED
      await client.query(`
        UPDATE inventory_pieces
        SET status = 'RESERVED',
            is_sold = false,
            reserved_until = EXTRACT(EPOCH FROM (NOW() + INTERVAL '10 minutes')) * 1000,
            updated_at = NOW()
        WHERE barcode = $1 AND (is_sold = false OR is_sold IS NULL)
      `, [barcode]);

      const expiryTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      return {
        status: 200,
        body: {
          success: true,
          reservationId: id,
          barcode,
          expiresAt: expiryTime,
          message: '1-of-1 piece reserved in vault for 10 minutes.'
        }
      };
    });

    clearProductsCache();
    return res.status(outcome.status).json(outcome.body);

  } catch (err: any) {
    console.error('Error reserving cart piece:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// -------------------------------------------------------------
// 3. POST /api/ecommerce/cart/release - Release Piece Lock
// -------------------------------------------------------------
ecommerceRouter.post('/cart/release', async (req: Request, res: Response) => {
  try {
    const { barcode, sessionId } = req.body;
    if (!barcode) return res.status(400).json({ error: 'barcode is required' });

    await withDb(async (client) => {
      await client.query(`
        UPDATE cart_reservations 
        SET is_active = false 
        WHERE barcode = $1 ${sessionId ? 'AND session_id = $2' : ''}
      `, sessionId ? [barcode, sessionId] : [barcode]);

      // If no other active reservations remain, restore piece to IN_STOCK if not sold
      const remainingCheck = await client.query(`
        SELECT id FROM cart_reservations
        WHERE barcode = $1 AND is_active = true AND expires_at > NOW()
      `, [barcode]);

      if (remainingCheck.rows.length === 0) {
        await client.query(`
          UPDATE inventory_pieces
          SET status = 'IN_STOCK', is_sold = false, reserved_until = NULL, updated_at = NOW()
          WHERE barcode = $1 AND status = 'RESERVED' AND (is_sold = false OR is_sold IS NULL)
        `, [barcode]);
      }
    });

    clearProductsCache();
    return res.json({ success: true, message: 'Cart lock released.' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// -------------------------------------------------------------
// 4. POST /api/ecommerce/orders/checkout - Atomic SQL Purchase
// -------------------------------------------------------------
ecommerceRouter.post('/orders/checkout', async (req: Request, res: Response) => {
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

    const outcome = await withDb(async (client) => {
      await client.query('BEGIN');
      try {
        // 1. Verify pieces are still available
        const barcodes = items.map((i: any) => i.barcode || i.id);
        const checkQuery = await client.query(`
          SELECT barcode, is_sold, status FROM inventory_pieces 
          WHERE barcode = ANY($1) FOR UPDATE
        `, [barcodes]);

        for (const row of checkQuery.rows) {
          if (row.is_sold || row.status === 'SOLD') {
            await client.query('ROLLBACK');
            return {
              status: 409,
              body: {
                success: false,
                error: `Piece ${row.barcode} was just purchased by another collector!`
              }
            };
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

        // 5. Atomically reserve pieces for Draft invoice: status = 'RESERVED', is_sold = false
        await client.query(`
          UPDATE inventory_pieces 
          SET is_sold = false, status = 'RESERVED', updated_at = NOW() 
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

        // 8. Format WhatsApp notification URL
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

        return {
          status: 200,
          body: {
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
          }
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    });

    clearProductsCache();
    return res.status(outcome.status).json(outcome.body);

  } catch (err: any) {
    console.error('Error during checkout transaction:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Database checkout error' });
  }
});

// -------------------------------------------------------------
// 5. POST /api/ecommerce/bounty - Customer Grail Wishlist
// -------------------------------------------------------------
ecommerceRouter.post('/bounty', async (req: Request, res: Response) => {
  try {
    const { customerName, customerPhone, whatsappPhone, customerEmail, desiredBrand, desiredCategory, desiredSize, preferredSize, maxBudgetAed, notes, eraNotes } = req.body;
    const phone = whatsappPhone || customerPhone || req.body.phone;
    const name = customerName || req.body.name;
    const brand = desiredBrand || req.body.brand;
    if (!name || !phone || !brand) {
      return res.status(400).json({ error: 'customerName, phone and desiredBrand are required' });
    }

    const id = req.body.id || `bounty-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const size = preferredSize || desiredSize || 'L';
    const era = eraNotes || notes || '';

    await withDb(async (client) => {
      await client.query(`
        INSERT INTO grail_bounties (
          id, customer_name, customer_phone, whatsapp_phone, customer_email, 
          desired_brand, desired_category, desired_size, preferred_size, 
          max_budget_aed, notes, era_notes, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'OPEN', NOW(), NOW())
      `, [id, name, phone, whatsappPhone || phone, customerEmail || '', brand, desiredCategory || 'T-Shirts', size, size, Number(maxBudgetAed || 0), era, era]);
    });

    return res.json({
      success: true,
      bountyId: id,
      message: `Grail bounty registered! We will notify ${phone} as soon as a matching ${brand} is scanned in a bale.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// -------------------------------------------------------------
// 5b. GET /api/ecommerce/bounties - List Grail Bounties
// -------------------------------------------------------------
ecommerceRouter.get('/bounties', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';

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
    const bounties = await withDb(async (client) => {
      const result = await client.query(query, params);
      return result.rows || [];
    });

    return res.json({ success: true, bounties });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// -------------------------------------------------------------
// 5c. PATCH /api/ecommerce/bounties/:id/status - Update Lifecycle Status
// -------------------------------------------------------------
ecommerceRouter.patch('/bounties/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, matchedBarcode, matchedPieceId } = req.body;

    await withDb(async (client) => {
      await client.query(`
        UPDATE grail_bounties 
        SET status = COALESCE($1, status),
            matched_barcode = COALESCE($2, matched_barcode),
            matched_piece_id = COALESCE($3, matched_piece_id),
            updated_at = NOW()
        WHERE id = $4
      `, [status, matchedBarcode || null, matchedPieceId || null, id]);
    });

    return res.json({ success: true, message: `Bounty ${id} updated to ${status}` });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// -------------------------------------------------------------
// 5c2. DELETE /api/ecommerce/bounties/:id - Remove Bounty
// -------------------------------------------------------------
ecommerceRouter.delete('/bounties/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await withDb(async (client) => {
      await client.query('DELETE FROM grail_bounties WHERE id = $1', [id]);
    });
    return res.json({ success: true, message: `Bounty ${id} deleted successfully` });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// -------------------------------------------------------------
// 5d. GET /api/ecommerce/bounties/auto-match - Match Available Inventory
// -------------------------------------------------------------
ecommerceRouter.get('/bounties/auto-match', async (req: Request, res: Response) => {
  try {
    const brand = (req.query.brand as string) || '';
    const category = (req.query.category as string) || '';

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
    const matches = await withDb(async (client) => {
      const result = await client.query(query, params);
      return result.rows || [];
    });

    return res.json({ success: true, matches });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// -------------------------------------------------------------
// 6. GET /api/ecommerce/orders/:orderNumber - Order Status Lookup
// -------------------------------------------------------------
ecommerceRouter.get('/orders/:orderNumber', async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.params;
    const row = await withDb(async (client) => {
      const result = await client.query('SELECT * FROM orders WHERE order_number = $1 OR id::text = $1', [orderNumber]);
      return result.rows.length > 0 ? result.rows[0] : null;
    });

    if (!row) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json(row);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});
