import { baileysManager } from '../modules/marketing/baileys.service.ts';
import { withDb } from '../db/pgPool.ts';

const DEDUP_TTL_MS = 15 * 60 * 1000;
const sentBookingMap = new Map<string, number>();
const sentPaymentMap = new Map<string, number>();
const sentSlipMap = new Map<string, number>();

function pruneMap(map: Map<string, number>) {
  if (map.size <= 300) return;
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [k, ts] of map.entries()) {
    if (ts < cutoff) map.delete(k);
  }
}

function claimDedupKey(map: Map<string, number>, key: string): boolean {
  const k = key.trim().toUpperCase();
  if (!k) return false;
  pruneMap(map);
  const last = map.get(k) || 0;
  if (last && Date.now() - last < DEDUP_TTL_MS) {
    return false;
  }
  map.set(k, Date.now());
  return true;
}

export function wasInvoiceSlipRecentlyDispatched(invoiceNo?: string): boolean {
  if (!invoiceNo) return false;
  const k = `SLIP:${String(invoiceNo).trim().toUpperCase()}`;
  const last = sentSlipMap.get(k) || 0;
  return Boolean(last && Date.now() - last < DEDUP_TTL_MS);
}

/**
 * Normalizes UAE and international WhatsApp numbers and rejects dummy/placeholder numbers.
 */
export function normalizeValidWhatsappPhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  let normalized = digits;

  if (digits.startsWith('00') && digits.length > 10) {
    normalized = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 10) {
    normalized = `971${digits.slice(1)}`;
  } else if (
    digits.length === 9 &&
    (digits.startsWith('50') ||
      digits.startsWith('52') ||
      digits.startsWith('54') ||
      digits.startsWith('55') ||
      digits.startsWith('56') ||
      digits.startsWith('58'))
  ) {
    normalized = `971${digits}`;
  }

  if (normalized.length < 8 || normalized.length > 15) return '';
  if (/^0+$/.test(normalized)) return '';
  if (new Set(normalized.split('')).size <= 1) return '';
  if (['12345678', '123456789', '1234567890', '987654321'].includes(normalized)) return '';

  const withoutCc = normalized.replace(/^(971|92|91|966|965|968|973|974|1|44)/, '').replace(/^0+/, '');
  if (!withoutCc || /^0+$/.test(withoutCc) || new Set(withoutCc.split('')).size <= 1) return '';
  if (/^5\d0{6,}$/.test(withoutCc) || /^3\d0{7,}$/.test(withoutCc)) return '';

  return normalized;
}

interface HydratedPieceMeta {
  barcode: string;
  brandName: string;
  itemName: string;
  size: string;
  priceAed: number;
  imageUrl?: string;
}

async function hydratePiecesFromDb(items: any[]): Promise<HydratedPieceMeta[]> {
  const safeItems = Array.isArray(items) ? items : [];
  const barcodes = safeItems
    .map(it => String(it?.barcode || it?.sku || '').trim())
    .filter(Boolean);

  const dbMap = new Map<string, any>();
  if (barcodes.length > 0) {
    try {
      await withDb(async client => {
        const r = await client.query(
          `SELECT barcode, sku, brand_name, item_name, style, size_scanned,
                  front_image_url, tag_image_url, retail_price_aed, estimated_price
           FROM public.inventory_pieces
           WHERE barcode = ANY($1::text[]) OR sku = ANY($1::text[])`,
          [barcodes]
        );
        for (const row of r.rows || []) {
          if (row.barcode) dbMap.set(String(row.barcode).toUpperCase(), row);
          if (row.sku) dbMap.set(String(row.sku).toUpperCase(), row);
        }
      });
    } catch (_) {}
  }

  return safeItems.map((it, idx) => {
    const code = String(it?.barcode || it?.sku || `ITEM-${idx + 1}`).trim();
    const db = dbMap.get(code.toUpperCase());
    const brandName = String(db?.brand_name || it?.brandName || '').trim();
    const itemName = String(
      db?.item_name || db?.style || it?.description || it?.itemName || it?.name || 'Vintage Piece'
    ).trim();
    const size = String(db?.size_scanned || it?.size || it?.sizeScanned || 'M').trim();
    const priceAed = Number(
      it?.finalAmount ?? it?.unitPrice ?? it?.price ?? db?.retail_price_aed ?? db?.estimated_price ?? 0
    );
    const imageUrl = String(
      db?.front_image_url || db?.tag_image_url || it?.frontImageUrl || it?.imageUrl || ''
    ).trim() || undefined;

    return {
      barcode: code,
      brandName,
      itemName,
      size,
      priceAed,
      imageUrl
    };
  });
}

async function dispatchWhatsappSafely(phone: string, text: string, imageUrl?: string | Buffer) {
  if (imageUrl) {
    const imgRes = await baileysManager.sendUnifiedMessage(phone, text, imageUrl);
    if (imgRes.success) return imgRes;
    // If image preparation failed, still deliver clean transactional text notice
    return await baileysManager.sendUnifiedMessage(phone, text);
  }
  return await baileysManager.sendUnifiedMessage(phone, text);
}

/**
 * Dispatches booked garment photo(s) + order summary when an order is booked
 * (Storefront Checkout or Live Claim Draft).
 */
export function notifyOrderBookedPiecesWhatsApp(params: {
  dedupOverrideKey?: string;
  orderNumber?: string;
  invoiceNo: string;
  customerName?: string;
  customerPhone?: string;
  items: any[];
  totalAmount: number;
  subtotal?: number;
  vatAmount?: number;
  shippingFee?: number;
  walletAmountUsed?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  shippingAddress?: string;
  channel?: string;
}): void {
  const cleanPhone = normalizeValidWhatsappPhone(params.customerPhone);
  const invNo = String(params.invoiceNo || params.orderNumber || '').trim();
  if (!cleanPhone || !invNo) return;

  const chUpper = String(params.channel || '').toUpperCase();
  if (chUpper === 'WHOLESALE_B2B' || invNo.startsWith('B2B-')) return;

  const dedupKey = params.dedupOverrideKey || `BOOK:${invNo}`;
  if (!claimDedupKey(sentBookingMap, dedupKey)) return;

  setImmediate(async () => {
    try {
      const hydrated = await hydratePiecesFromDb(params.items);
      const custName = String(params.customerName || 'Valued Collector').trim();
      const payStatusUpper = String(params.paymentStatus || '').toUpperCase();
      const payMethodUpper = String(params.paymentMethod || 'COD').toUpperCase();
      const isPaidVerified = payStatusUpper === 'PREPAID_VERIFIED' || payStatusUpper === 'PAID';
      const totalAmt = Number(params.totalAmount || 0);
      const refLabel = params.orderNumber && params.orderNumber !== invNo ? `${invNo} (Order #${params.orderNumber})` : invNo;

      if (isPaidVerified && !params.dedupOverrideKey) {
        sentPaymentMap.set(`PAY:${invNo.toUpperCase()}`, Date.now());
      }

      const itemLines =
        hydrated.length > 0
          ? hydrated
              .map(
                (p, i) =>
                  `${i + 1}. *[${p.barcode}]* ${p.brandName ? `${p.brandName} ` : ''}${p.itemName} (Size: ${p.size}) — AED ${p.priceAed.toFixed(2)}`
              )
              .join('\n')
          : '• Reserved Vintage Apparel Piece';

      const header = params.dedupOverrideKey
        ? `📦 *ADDITIONAL PIECE ADDED TO YOUR ORDER — VINTAGE VIBES UAE*`
        : isPaidVerified
        ? `✅ *ORDER BOOKED & PAYMENT CONFIRMED — VINTAGE VIBES UAE*`
        : `🛍️ *ORDER BOOKED — VINTAGE VIBES UAE*`;

      const amountLabel = isPaidVerified
        ? `*Paid Amount:* AED ${totalAmt.toFixed(2)} (${payMethodUpper})`
        : `*Payable (COD):* AED ${totalAmt.toFixed(2)}`;

      const caption =
        `${header}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Ref:* #${refLabel}\n` +
        `*Customer:* ${custName}\n` +
        `${amountLabel}\n` +
        (params.walletAmountUsed && params.walletAmountUsed > 0
          ? `*Store Credit Applied:* AED ${Number(params.walletAmountUsed).toFixed(2)}\n`
          : '') +
        (params.shippingAddress ? `*Delivery:* ${String(params.shippingAddress).trim()}\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Booked Piece(s):*\n${itemLines}\n\n` +
        `Thank you! Your garment(s) are locked and queued for dispatch.`;

      if (hydrated.length === 0) {
        await dispatchWhatsappSafely(cleanPhone, caption);
        return;
      }

      // Send 1st piece with full booking/confirmation caption
      const first = hydrated[0];
      const firstRes = await dispatchWhatsappSafely(cleanPhone, caption, first.imageUrl);
      if (!firstRes.success) {
        console.warn(`[TransactionalWA] Booking notice for ${invNo} skipped:`, firstRes.error);
        return;
      }

      // Send each remaining booked piece photo individually
      for (let i = 1; i < hydrated.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        const p = hydrated[i];
        const pieceCaption =
          `📦 *Booked Piece (${i + 1}/${hydrated.length}) — #${invNo}*\n` +
          `*[${p.barcode}]* ${p.brandName ? `${p.brandName} ` : ''}${p.itemName} (Size: ${p.size}) — *AED ${p.priceAed.toFixed(2)}*`;
        await dispatchWhatsappSafely(cleanPhone, pieceCaption, p.imageUrl);
      }
    } catch (err: any) {
      console.warn(`[TransactionalWA] notifyOrderBookedPiecesWhatsApp error for ${invNo}:`, err?.message || err);
    }
  });
}

/**
 * Dispatches Payment Confirmation message + Studio Receipt Slip PNG when payment is marked Paid & Verified.
 */
export function notifyPaymentConfirmedWhatsApp(params: {
  invoiceNo: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount: number;
  subtotal?: number;
  vatAmount?: number;
  shippingFee?: number;
  paymentMethod?: string;
  paymentReference?: string;
  items?: any[];
  channel?: string;
}): void {
  const cleanPhone = normalizeValidWhatsappPhone(params.customerPhone);
  const invNo = String(params.invoiceNo || '').trim();
  if (!cleanPhone || !invNo) return;

  const chUpper = String(params.channel || '').toUpperCase();
  if (chUpper === 'WHOLESALE_B2B' || invNo.startsWith('B2B-')) return;

  if (!claimDedupKey(sentPaymentMap, `PAY:${invNo}`)) return;

  setImmediate(async () => {
    try {
      const hydrated = await hydratePiecesFromDb(params.items || []);
      const custName = String(params.customerName || 'Valued Collector').trim();
      const totalAmt = Number(params.totalAmount || 0);
      const payMethod = String(params.paymentMethod || 'ONLINE').toUpperCase();

      const slipPng = await baileysManager.renderSaleInvoiceSlipPng({
        invoiceNo: invNo,
        customerName: custName,
        customerPhone: `+${cleanPhone}`,
        channel: params.channel || 'RETAIL STOREFRONT',
        paymentMethod: payMethod,
        paymentStatus: 'PAID & VERIFIED',
        items: params.items || [],
        subTotal: params.subtotal !== undefined ? Number(params.subtotal) : undefined,
        vatAmount: params.vatAmount !== undefined ? Number(params.vatAmount) : undefined,
        shippingAmount: params.shippingFee !== undefined ? Number(params.shippingFee) : undefined,
        totalAmount: totalAmt,
        currency: 'AED',
        garmentImageUrl: hydrated[0]?.imageUrl
      });

      const caption =
        `✅ *PAYMENT CONFIRMED — VINTAGE VIBES UAE*\n` +
        `Invoice: *#${invNo}*\n` +
        `Customer: ${custName}\n` +
        `Amount Received: *AED ${totalAmt.toFixed(2)}* (${payMethod})\n` +
        (params.paymentReference && !/^(PENDING|COD)/i.test(params.paymentReference)
          ? `Ref: \`${params.paymentReference}\`\n`
          : '') +
        `\nThank you! Your payment is verified and your booked piece(s) are queued for express courier dispatch.`;

      const res = await dispatchWhatsappSafely(cleanPhone, caption, slipPng || hydrated[0]?.imageUrl);
      if (!res.success) {
        console.warn(`[TransactionalWA] Payment confirmation for ${invNo} skipped:`, res.error);
      }
    } catch (err: any) {
      console.warn(`[TransactionalWA] notifyPaymentConfirmedWhatsApp error for ${invNo}:`, err?.message || err);
    }
  });
}

/**
 * Dispatches official Studio Sale Slip PNG (and Courier Waybill Slip PNG if AWB is set) when an order is POSTED.
 */
export function notifySalesSlipDispatchedWhatsApp(params: {
  invoiceNo: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount: number;
  subtotal?: number;
  vatAmount?: number;
  shippingFee?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  courierPartner?: string;
  trackingNumber?: string;
  city?: string;
  shippingAddress?: string;
  items?: any[];
  channel?: string;
}): void {
  const cleanPhone = normalizeValidWhatsappPhone(params.customerPhone);
  const invNo = String(params.invoiceNo || '').trim();
  if (!cleanPhone || !invNo) return;

  const chUpper = String(params.channel || '').toUpperCase();
  if (chUpper === 'WHOLESALE_B2B' || invNo.startsWith('B2B-')) return;

  if (!claimDedupKey(sentSlipMap, `SLIP:${invNo}`)) return;

  setImmediate(async () => {
    try {
      const hydrated = await hydratePiecesFromDb(params.items || []);
      const custName = String(params.customerName || 'Valued Collector').trim();
      const totalAmt = Number(params.totalAmount || 0);
      const payMethod = String(params.paymentMethod || 'COD').toUpperCase();
      const payStatus = String(params.paymentStatus || '').toUpperCase() || 'VERIFIED';

      const invoicePng = await baileysManager.renderSaleInvoiceSlipPng({
        invoiceNo: invNo,
        customerName: custName,
        customerPhone: `+${cleanPhone}`,
        channel: params.channel || 'RETAIL DISPATCH',
        paymentMethod: payMethod,
        paymentStatus: payStatus,
        items: params.items || [],
        subTotal: params.subtotal !== undefined ? Number(params.subtotal) : undefined,
        vatAmount: params.vatAmount !== undefined ? Number(params.vatAmount) : undefined,
        shippingAmount: params.shippingFee !== undefined ? Number(params.shippingFee) : undefined,
        totalAmount: totalAmt,
        currency: 'AED',
        garmentImageUrl: hydrated[0]?.imageUrl
      });

      const slipCaption =
        `🧾 *Official Sale Invoice — #${invNo}*\n` +
        `Customer: ${custName} • Total: *AED ${totalAmt.toFixed(2)}*`;

      const invRes = await dispatchWhatsappSafely(cleanPhone, slipCaption, invoicePng || hydrated[0]?.imageUrl);
      if (!invRes.success) {
        console.warn(`[TransactionalWA] Sale slip dispatch for ${invNo} skipped:`, invRes.error);
        return;
      }

      const tracking = String(params.trackingNumber || '').trim();
      if (tracking) {
        await new Promise(r => setTimeout(r, 700));
        const courierPng = await baileysManager.renderCourierDispatchSlipPng({
          awbNo: tracking,
          invoiceNo: invNo,
          courierPartner: params.courierPartner || 'UAE EXPRESS COURIER',
          customerName: custName,
          customerPhone: `+${cleanPhone}`,
          city: params.city || 'AL AIN / UAE',
          deliveryAddress: params.shippingAddress || 'Doorstep Express Delivery across UAE',
          items: params.items || [],
          totalAmount: totalAmt,
          paymentMethod: payMethod,
          garmentImageUrl: hydrated[0]?.imageUrl
        });
        if (courierPng) {
          await dispatchWhatsappSafely(
            cleanPhone,
            `🚚 *Courier Dispatch Slip — #${invNo}* (AWB: \`${tracking}\`)`,
            courierPng
          );
        }
      }
    } catch (err: any) {
      console.warn(`[TransactionalWA] notifySalesSlipDispatchedWhatsApp error for ${invNo}:`, err?.message || err);
    }
  });
}
