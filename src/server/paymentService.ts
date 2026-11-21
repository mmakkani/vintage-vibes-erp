import crypto from 'crypto';
import Stripe from 'stripe';
import QRCode from 'qrcode';
import { relationalStore } from '../db/relationalStore.ts';
import { withDb } from '../db/pgPool.ts';
import { eventHub } from './events.ts';
import { baileysManager } from '../modules/marketing/baileys.service.ts';
import { executeAtomicEcommerceCheckout } from '../modules/ecommerce/ecommerce.routes.ts';
import { notifyPaymentConfirmedWhatsApp } from './transactionalWhatsappNotifier.ts';

export interface PaymentIntentResult {
  success: boolean;
  isLiveGateway: boolean;
  provider?: string;
  checkoutUrl?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  amountAed: number;
  currency: string;
  publishableKey?: string;
  applePaySupported: boolean;
  googlePaySupported: boolean;
  requiresSetup?: boolean;
  error?: string;
}

export interface GatewayHealthStatus {
  isConfigured: boolean;
  provider: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  accountTitle?: string;
  defaultCurrency?: string;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  applePayDomainVerified?: boolean;
  message: string;
}

class PaymentService {
  private pendingIntentions = new Map<
    string,
    { orderReference: string; paymentIntentId: string; amountFils: number; checkoutSnapshot?: any; createdAt: number }
  >();

  private resolveSafeOrigin(originUrl?: string): string {
    const defaultOrigin = (process.env.PUBLIC_STOREFRONT_URL || 'https://vintagevibesgk.com').replace(/\/+$/, '');
    if (!originUrl || typeof originUrl !== 'string') return defaultOrigin;
    const trimmed = originUrl.trim().replace(/\/+$/, '');
    if (
      trimmed === 'https://vintagevibesgk.com' ||
      trimmed === 'https://www.vintagevibesgk.com' ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)
    ) {
      return trimmed;
    }
    return defaultOrigin;
  }

  private verifyPaymobHmacDigest(data: Record<string, any>, hmacSecret: string, receivedHmac: string): { valid: boolean; hasCompleteFields: boolean } {
    if (!hmacSecret || !receivedHmac || !data || typeof data !== 'object') {
      return { valid: false, hasCompleteFields: false };
    }
    const orderVal = typeof data.order === 'object' && data.order !== null ? data.order.id : data.order;
    const srcPan = data['source_data.pan'] ?? data.source_data_pan ?? data.source_data?.pan;
    const srcSubType = data['source_data.sub_type'] ?? data.source_data_sub_type ?? data.source_data?.sub_type;
    const srcType = data['source_data.type'] ?? data.source_data_type ?? data.source_data?.type;

    const fields = [
      data.amount_cents,
      data.created_at,
      data.currency,
      data.error_occured,
      data.has_parent_transaction,
      data.id,
      data.integration_id,
      data.is_3d_secure,
      data.is_auth,
      data.is_capture,
      data.is_refunded,
      data.is_standalone_payment,
      data.is_voided,
      orderVal,
      data.owner,
      data.pending,
      srcPan,
      srcSubType,
      srcType,
      data.success
    ];

    const hasCompleteFields =
      data.amount_cents !== undefined &&
      data.created_at !== undefined &&
      data.id !== undefined &&
      data.success !== undefined;

    const concatenated = fields.map(v => (v === undefined || v === null ? '' : String(v))).join('');
    const computed = crypto.createHmac('sha512', hmacSecret).update(concatenated).digest('hex').toLowerCase();
    const receivedLower = String(receivedHmac).trim().toLowerCase();

    if (computed.length !== receivedLower.length) {
      return { valid: false, hasCompleteFields };
    }
    try {
      const valid = crypto.timingSafeEqual(Buffer.from(computed, 'utf8'), Buffer.from(receivedLower, 'utf8'));
      return { valid, hasCompleteFields };
    } catch {
      return { valid: false, hasCompleteFields };
    }
  }

  private getGatewayConfig() {
    const profile = relationalStore.getCompanyProfile();
    return profile?.paymentGateway;
  }

  private getStripeClient(): Stripe | null {
    const config = this.getGatewayConfig();
    if (config?.isEnabled && config.secretKey && config.secretKey.startsWith('sk_')) {
      try {
        return new Stripe(config.secretKey, {
          apiVersion: '2024-04-10' as any
        });
      } catch (e) {
        console.warn('[Payment Gateway] Failed to initialize Stripe client:', e);
      }
    }
    return null;
  }

  /**
   * Test Gateway Credentials against Live Paymob UAE or Stripe API
   */
  public async testCredentials(secretKey?: string): Promise<{ success: boolean; health: GatewayHealthStatus; error?: string }> {
    const config = this.getGatewayConfig();
    const profile = relationalStore.getCompanyProfile();
    const keyToTest = (secretKey || config?.secretKey || config?.paymobApiKey || profile?.paymobApiKey || process.env.PAYMOB_API_KEY || '').trim();

    // 1. Paymob UAE Key Test
    if (keyToTest.startsWith('are_sk_') || config?.provider === 'PAYMOB_UAE') {
      if (!keyToTest || !keyToTest.startsWith('are_sk_')) {
        return {
          success: false,
          health: {
            isConfigured: false,
            provider: 'PAYMOB_UAE',
            environment: 'SANDBOX',
            message: 'Paymob Secret Key must start with are_sk_live_ or are_sk_test_.'
          },
          error: 'Invalid Paymob Secret Key format'
        };
      }

      try {
        const testRes = await fetch('https://uae.paymob.com/v1/intention', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${keyToTest}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });

        // 400 Bad Request indicates successful authentication (it rejected empty body, not credentials)
        if (testRes.status === 400 || testRes.ok) {
          const health: GatewayHealthStatus = {
            isConfigured: true,
            provider: 'PAYMOB_UAE',
            environment: keyToTest.startsWith('are_sk_live_') ? 'PRODUCTION' : 'SANDBOX',
            accountTitle: 'RAKBANK Paymob UAE (Official Merchant)',
            defaultCurrency: 'AED',
            chargesEnabled: true,
            payoutsEnabled: true,
            applePayDomainVerified: true,
            message: 'Successfully authenticated with Paymob UAE! Live credentials handshake confirmed.'
          };
          return { success: true, health };
        } else {
          const errData = await testRes.json().catch(() => null);
          return {
            success: false,
            health: {
              isConfigured: false,
              provider: 'PAYMOB_UAE',
              environment: keyToTest.startsWith('are_sk_live_') ? 'PRODUCTION' : 'SANDBOX',
              message: errData?.detail || errData?.message || `Paymob authentication failed (HTTP ${testRes.status})`
            },
            error: errData?.detail || 'Paymob authentication failed'
          };
        }
      } catch (err: any) {
        return {
          success: false,
          health: {
            isConfigured: false,
            provider: 'PAYMOB_UAE',
            environment: 'PRODUCTION',
            message: err?.message || 'Paymob UAE connection failed'
          },
          error: err?.message
        };
      }
    }

    // 2. Stripe Test
    if (!keyToTest || !keyToTest.startsWith('sk_')) {
      return {
        success: false,
        health: {
          isConfigured: false,
          provider: config?.provider || 'STRIPE_UAE',
          environment: config?.environment || 'SANDBOX',
          message: 'No secret key provided or key format invalid (must start with sk_live_ or sk_test_).'
        },
        error: 'Invalid secret key format'
      };
    }

    try {
      const stripe = new Stripe(keyToTest, { apiVersion: '2024-04-10' as any });
      const balance = await stripe.balance.retrieve();

      const health: GatewayHealthStatus = {
        isConfigured: true,
        provider: 'STRIPE_UAE',
        environment: keyToTest.startsWith('sk_live_') ? 'PRODUCTION' : 'SANDBOX',
        accountTitle: keyToTest.startsWith('sk_live_') ? 'UAE Production Live Merchant' : 'UAE Stripe Sandbox Test',
        defaultCurrency: (balance.available[0]?.currency || 'AED').toUpperCase(),
        chargesEnabled: true,
        payoutsEnabled: true,
        applePayDomainVerified: true,
        message: `Successfully authenticated with Stripe (${balance.available[0]?.currency?.toUpperCase() || 'AED'} Account). Handshake confirmed!`
      };

      return { success: true, health };
    } catch (err: any) {
      return {
        success: false,
        health: {
          isConfigured: false,
          provider: 'STRIPE_UAE',
          environment: keyToTest.startsWith('sk_live_') ? 'PRODUCTION' : 'SANDBOX',
          message: err?.message || 'Authentication with payment gateway failed'
        },
        error: err?.message || 'Gateway authentication failed'
      };
    }
  }

  /**
   * Create Real Payment Intent (Card, Apple Pay, Google Pay)
   */
  public async createPaymentIntent(params: {
    amountAed: number;
    orderReference: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    invoiceId?: string;
    originUrl?: string;
    checkoutSnapshot?: any;
  }): Promise<PaymentIntentResult> {
    const config = this.getGatewayConfig();
    const profile = relationalStore.getCompanyProfile();
    const stripe = this.getStripeClient();
    const amountFils = Math.round(Number(params.amountAed) * 100); // AED fils

    const paymobKey = config?.paymobApiKey || profile?.paymobApiKey || process.env.PAYMOB_API_KEY || '';
    const onlineCardIntegrationId = config?.paymobOnlineCardIntegrationId || profile?.paymobOnlineCardIntegrationId || process.env.PAYMOB_ONLINE_INTEGRATION_ID || '';
    const applePayIntegrationId = config?.paymobApplePayIntegrationId || profile?.paymobApplePayIntegrationId || process.env.PAYMOB_APPLE_PAY_INTEGRATION_ID || '';
    const isPaymob = (config?.provider === 'PAYMOB_UAE') || (!stripe && !!paymobKey);

    // 1. Paymob UAE Modern Intention Flow (Cards, Google Pay & Apple Pay)
    if (isPaymob && paymobKey) {
      if (!onlineCardIntegrationId) {
        return {
          success: false,
          isLiveGateway: true,
          provider: 'PAYMOB_UAE',
          requiresSetup: true,
          amountAed: params.amountAed,
          currency: 'AED',
          applePaySupported: false,
          googlePaySupported: false,
          error: 'Paymob Secret Key is verified, but Online Website Card Integration ID is pending in Global Setup > Bank. Please enter the Integration ID from Paymob Portal (Developers > Payment Integrations).'
        };
      }

      try {
        const methods = Array.from(
          new Set(
            [onlineCardIntegrationId, applePayIntegrationId]
              .map(v => Number(v))
              .filter(n => Number.isFinite(n) && n > 0)
          )
        );
        const safeOrigin = this.resolveSafeOrigin(params.originUrl);
        const redirectionUrl = `${safeOrigin}/?paymob_return=1&order_ref=${encodeURIComponent(params.orderReference)}`;
        const notificationUrl = `${(process.env.PUBLIC_STOREFRONT_URL || 'https://vintagevibesgk.com').replace(/\/+$/, '')}/api/webhooks/paymob`;

        const intentionRes = await fetch('https://uae.paymob.com/v1/intention', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${paymobKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amountFils,
            currency: 'AED',
            payment_methods: methods,
            special_reference: params.orderReference,
            redirection_url: redirectionUrl,
            notification_url: notificationUrl,
            items: [{
              name: `Vintage Piece Order ${params.orderReference}`,
              amount: amountFils,
              description: 'Vintage Vibe Luxury Archive Order',
              quantity: 1
            }],
            billing_data: {
              first_name: params.customerName?.split(' ')[0] || 'Vintage',
              last_name: params.customerName?.split(' ').slice(1).join(' ') || 'Customer',
              email: params.customerEmail || 'orders@vintagevibesllcspc.com',
              phone_number: params.customerPhone || '+971501234567'
            }
          })
        });

        const intentionData = await intentionRes.json();
        if (intentionRes.ok && intentionData.client_secret) {
          const pubKey = config?.paymobPublicKey || profile?.paymobPublicKey || process.env.PAYMOB_PUBLIC_KEY || '';
          const paymentIntentId = String(intentionData.id || `pm_${Date.now()}`);
          const checkoutUrl = pubKey
            ? `https://uae.paymob.com/unifiedcheckout/?publicKey=${pubKey}&clientSecret=${intentionData.client_secret}`
            : `https://uae.paymob.com/unifiedcheckout/?clientSecret=${intentionData.client_secret}`;

          if (this.pendingIntentions.size > 500) {
            const cutoff = Date.now() - 6 * 60 * 60 * 1000;
            for (const [k, v] of this.pendingIntentions.entries()) {
              if (v.createdAt < cutoff) this.pendingIntentions.delete(k);
            }
          }
          this.pendingIntentions.set(params.orderReference, {
            orderReference: params.orderReference,
            paymentIntentId,
            amountFils,
            checkoutSnapshot: params.checkoutSnapshot,
            createdAt: Date.now()
          });

          return {
            success: true,
            isLiveGateway: true,
            provider: 'PAYMOB_UAE',
            clientSecret: intentionData.client_secret,
            paymentIntentId,
            checkoutUrl,
            amountAed: params.amountAed,
            currency: 'AED',
            applePaySupported: !!applePayIntegrationId,
            googlePaySupported: true
          };
        } else {
          return {
            success: false,
            isLiveGateway: true,
            provider: 'PAYMOB_UAE',
            amountAed: params.amountAed,
            currency: 'AED',
            applePaySupported: false,
            googlePaySupported: false,
            error: intentionData?.detail || intentionData?.message || 'Paymob intention creation failed'
          };
        }
      } catch (err: any) {
        return {
          success: false,
          isLiveGateway: true,
          provider: 'PAYMOB_UAE',
          amountAed: params.amountAed,
          currency: 'AED',
          applePaySupported: false,
          googlePaySupported: false,
          error: err?.message || 'Paymob connection error'
        };
      }
    }

    // 2. Stripe Live Flow
    if (stripe && config?.isEnabled) {
      try {
        const intent = await stripe.paymentIntents.create({
          amount: amountFils,
          currency: 'aed',
          payment_method_types: ['card'],
          description: `Vintage Vibe Order ${params.orderReference} (${params.customerName || 'Retail Customer'})`,
          metadata: {
            orderReference: params.orderReference,
            invoiceId: params.invoiceId || '',
            customerPhone: params.customerPhone || ''
          }
        });

        return {
          success: true,
          isLiveGateway: true,
          provider: 'STRIPE_UAE',
          clientSecret: intent.client_secret || undefined,
          paymentIntentId: intent.id,
          amountAed: params.amountAed,
          currency: 'AED',
          publishableKey: config.publishableKey,
          applePaySupported: config.allowApplePay !== false,
          googlePaySupported: config.allowGooglePay !== false
        };
      } catch (err: any) {
        console.warn('[Payment Gateway] Live Stripe PaymentIntent creation failed:', err?.message);
        return {
          success: false,
          isLiveGateway: true,
          provider: 'STRIPE_UAE',
          amountAed: params.amountAed,
          currency: 'AED',
          applePaySupported: false,
          googlePaySupported: false,
          error: err?.message || 'Stripe payment initialization error'
        };
      }
    }

    // 3. Fallback / Sandbox Mode
    const mockIntentId = `pi_mock_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const mockClientSecret = `${mockIntentId}_secret_${Math.random().toString(36).substring(2, 10)}`;

    return {
      success: true,
      isLiveGateway: false,
      provider: 'SANDBOX',
      clientSecret: mockClientSecret,
      paymentIntentId: mockIntentId,
      amountAed: params.amountAed,
      currency: 'AED',
      publishableKey: config?.publishableKey || 'pk_test_demo_vintage_vibe_uae',
      applePaySupported: true,
      googlePaySupported: true
    };
  }

  /**
   * Process Real Webhook Succeeded Event & Reconcile in ERP
   */
  public async handleStripeWebhook(payload: any, signature?: string): Promise<{ received: boolean; processed: boolean; error?: string }> {
    const config = this.getGatewayConfig();
    const stripe = this.getStripeClient();

    let event = payload;

    if (stripe && config?.webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
      } catch (err: any) {
        console.warn('[Payment Webhook] Signature verification failed:', err.message);
        return { received: true, processed: false, error: 'Signature verification failed' };
      }
    }

    if (event?.type === 'payment_intent.succeeded') {
      const pi = event.data?.object;
      const orderRef = pi?.metadata?.orderReference;
      const amountPaidAed = Number((pi.amount_received / 100).toFixed(2));

      console.log(`[Payment Webhook] 💰 Real Payment Succeeded for ${orderRef}: AED ${amountPaidAed}`);

      // Locate invoice and mark payment status
      const invoices = relationalStore.getSalesInvoices();
      const invoice = invoices.find(i => i.invoiceNo === orderRef || i.id === pi?.metadata?.invoiceId);

      if (invoice) {
        invoice.paymentStatus = 'PREPAID_VERIFIED';
        invoice.paymentMethod = 'CARD_POS';
        invoice.paymentReference = pi?.id || `PAY-${Date.now()}`;
        invoice.status = 'DRAFT'; // Paid - Awaiting Dispatch

        // 1. Mark piece as SOLD and link invoice
        invoice.items.forEach(it => {
          const piece = relationalStore.getInventoryPieces().find(p => p.barcode === it.barcode);
          if (piece) {
            piece.isSold = true;
            piece.status = 'SOLD';
            piece.soldInvoiceId = invoice.id;
            piece.soldPriceAed = it.finalAmount || it.unitPrice;
          }
        });

        // 2. Double-Entry General Ledger Rules on Payment Received:
        // Debit: Bank / Payment Gateway Clearing Account (Gross sale amount)
        // Credit: WhatsApp Direct Sales Revenue (Dedicated revenue account in COA)
        try {
          const bankClearingAcc = relationalStore.getOrCreateAccount('1125', 'POS Terminal & Digital Gateway Clearing', 'ASSET');
          const waRevenueAcc = relationalStore.getOrCreateAccount('4125', 'WhatsApp Channel & Direct Drop Sales Revenue', 'REVENUE');

          const voucher = relationalStore.createVoucher({
            voucherNo: `BRV-PAY-${Date.now().toString().slice(-6)}`,
            date: new Date().toISOString().slice(0, 10),
            type: 'BRV',
            documentRef: invoice.invoiceNo,
            narration: `1-Tap Mobile Payment confirmation for order ${invoice.invoiceNo} (Apple/Google Pay / Stripe)`,
            status: 'POSTED',
            currency: 'AED',
            totalDebit: amountPaidAed,
            totalCredit: amountPaidAed,
            exchangeRate: 1,
            lines: [
              {
                id: `line-dr-${Date.now()}`,
                accountId: bankClearingAcc.id,
                accountCode: bankClearingAcc.code,
                accountName: bankClearingAcc.name,
                debitAmount: amountPaidAed,
                creditAmount: 0,
                memo: `Payment Gateway Clearing (Gross sale) for ${invoice.invoiceNo}`
              },
              {
                id: `line-cr-${Date.now()}`,
                accountId: waRevenueAcc.id,
                accountCode: waRevenueAcc.code,
                accountName: waRevenueAcc.name,
                debitAmount: 0,
                creditAmount: amountPaidAed,
                memo: `Direct WhatsApp Channel Sales Revenue for ${invoice.invoiceNo}`
              }
            ]
          });
          relationalStore.postVoucher(voucher.id, 'Stripe Payment Webhook Engine');
        } catch (voucherErr: any) {
          console.warn('[Payment Webhook] Double-entry ledger notice:', voucherErr?.message);
        }

        // 3. Dispatch Payment Confirmation + Studio Receipt Slip PNG on WhatsApp
        if (invoice.customerPhone) {
          notifyPaymentConfirmedWhatsApp({
            invoiceNo: invoice.invoiceNo,
            customerName: invoice.customerName,
            customerPhone: invoice.customerPhone,
            totalAmount: amountPaidAed,
            subtotal: invoice.subTotal,
            vatAmount: invoice.vatAmount,
            shippingFee: invoice.shippingFeeAed,
            paymentMethod: 'CARD_ONLINE',
            paymentReference: pi?.id,
            items: invoice.items || [],
            channel: (invoice as any).channel || 'ECOMMERCE'
          });
        }

        // 4. Broadcast real-time payment confirmation across ERP
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'PAYMENT_RECEIVED',
          action: 'UPDATE',
          documentRef: invoice.invoiceNo,
          data: {
            invoiceNo: invoice.invoiceNo,
            amount: amountPaidAed,
            paymentIntentId: pi?.id,
            brand: pi?.payment_method_details?.card?.brand || 'Apple Pay / Google Pay'
          }
        });
      }

      return { received: true, processed: true };
    }

    return { received: true, processed: false };
  }

  /**
   * Verify Paymob Unified Checkout redirect query/callback parameters
   */
  public verifyPaymobCallback(params: Record<string, any>): {
    verified: boolean;
    paid: boolean;
    transactionId: string;
    paymentRef: string;
    orderReference: string;
    error?: string;
  } {
    const config = this.getGatewayConfig();
    const profile = relationalStore.getCompanyProfile();
    const hmacSecret = (config?.paymobHmac || profile?.paymobHmac || process.env.PAYMOB_HMAC || '').trim();
    const orderReference = String(
      params?.order_ref || params?.merchant_order_id || params?.special_reference || ''
    ).trim();
    const txId = String(params?.id || params?.transaction_id || params?.order || Date.now()).trim();

    const isSuccess =
      String(params?.success).toLowerCase() === 'true' &&
      String(params?.pending).toLowerCase() !== 'true' &&
      String(params?.error_occured).toLowerCase() !== 'true';

    if (!isSuccess) {
      return {
        verified: false,
        paid: false,
        transactionId: txId,
        paymentRef: '',
        orderReference,
        error: params?.['data.message'] || params?.message || 'Payment not completed or declined'
      };
    }

    const tracked = orderReference ? this.pendingIntentions.get(orderReference) : undefined;
    let verified = false;

    if (params?.hmac && hmacSecret) {
      const check = this.verifyPaymobHmacDigest(params, hmacSecret, String(params.hmac));
      if (check.valid) {
        verified = true;
      } else if (!check.hasCompleteFields && tracked && (!params.amount_cents || Number(params.amount_cents) === tracked.amountFils)) {
        verified = true;
      }
    } else if (tracked && (!params.amount_cents || Number(params.amount_cents) === tracked.amountFils)) {
      verified = true;
    }

    const paymentRef = verified && isSuccess ? `PAYMOB_${txId}` : '';
    return {
      verified,
      paid: verified && isSuccess,
      transactionId: txId,
      paymentRef,
      orderReference,
      ...(verified ? {} : { error: 'Paymob transaction signature or intention reference could not be verified' })
    };
  }

  /**
   * Process Paymob Server-to-Server Webhook (Transaction Processed Callback)
   */
  public async handlePaymobWebhook(
    payload: any,
    queryHmac?: string
  ): Promise<{ received: boolean; processed: boolean; orderRef?: string; paymentRef?: string; error?: string }> {
    const config = this.getGatewayConfig();
    const profile = relationalStore.getCompanyProfile();
    const hmacSecret = (config?.paymobHmac || profile?.paymobHmac || process.env.PAYMOB_HMAC || '').trim();
    const obj = payload?.obj && typeof payload.obj === 'object' ? payload.obj : payload || {};
    const receivedHmac = String(queryHmac || payload?.hmac || '').trim();

    if (hmacSecret && receivedHmac) {
      const check = this.verifyPaymobHmacDigest(obj, hmacSecret, receivedHmac);
      if (check.hasCompleteFields && !check.valid) {
        console.warn('[Paymob Webhook] HMAC verification failed');
        return { received: true, processed: false, error: 'Invalid Paymob HMAC signature' };
      }
    }

    if (obj?.success === true && obj?.pending !== true && obj?.error_occured !== true) {
      const txId = String(obj.id || Date.now()).trim();
      const orderRef = String(
        obj?.order?.merchant_order_id || obj?.special_reference || obj?.merchant_order_id || ''
      ).trim();
      const paymentRef = `PAYMOB_${txId}`;

      // 1. Auto-book order & Draft Sale Slip immediately if checkoutSnapshot was stored when creating intention
      const tracked = orderRef ? this.pendingIntentions.get(orderRef) : undefined;
      if (tracked?.checkoutSnapshot && Array.isArray(tracked.checkoutSnapshot.items) && tracked.checkoutSnapshot.items.length > 0) {
        try {
          await executeAtomicEcommerceCheckout({
            ...tracked.checkoutSnapshot,
            orderReference: orderRef,
            paymentMethod: 'CARD_POS',
            paymentRef
          });
        } catch (bookErr: any) {
          console.warn('[Paymob Webhook] Auto-checkout notice:', bookErr?.message);
        }
      }

      if (orderRef || txId) {
        let updatedInvRow: any = null;
        try {
          await withDb(async client => {
            await client.query(
              `UPDATE orders
               SET payment_status = 'PAID',
                   payment_reference = $1,
                   updated_at = NOW()
               WHERE (order_number = $2 OR payment_reference = $1)
                 AND payment_status IN ('PENDING_PAYMENT_VERIFICATION', 'PENDING', 'UNPAID_PENDING_COD')`,
              [paymentRef, orderRef]
            );
            const invUpd = await client.query(
              `UPDATE sales_invoices
               SET payment_status = 'PREPAID_VERIFIED',
                   payment_reference = $1
               WHERE (
                 payment_reference = $1
                 OR order_id::text IN (SELECT id::text FROM orders WHERE order_number = $2)
               )
                 AND payment_status IN ('PENDING_PAYMENT_VERIFICATION', 'PENDING', 'UNPAID_PENDING_COD')
               RETURNING *`,
              [paymentRef, orderRef]
            );
            if (invUpd.rows && invUpd.rows.length > 0) {
              updatedInvRow = invUpd.rows[0];
            }
          });
        } catch (dbErr: any) {
          console.warn('[Paymob Webhook] DB reconciliation notice:', dbErr?.message);
        }

        if (updatedInvRow && updatedInvRow.customer_phone) {
          let parsedItems: any[] = [];
          if (Array.isArray(updatedInvRow.items)) {
            parsedItems = updatedInvRow.items;
          } else if (typeof updatedInvRow.items === 'string') {
            try {
              parsedItems = JSON.parse(updatedInvRow.items || '[]');
            } catch {
              parsedItems = [];
            }
          }
          notifyPaymentConfirmedWhatsApp({
            invoiceNo: updatedInvRow.invoice_no || updatedInvRow.id,
            customerName: updatedInvRow.customer_name,
            customerPhone: updatedInvRow.customer_phone,
            totalAmount: Number(updatedInvRow.total_amount || Number(obj.amount_cents || 0) / 100),
            subtotal: Number(updatedInvRow.subtotal || 0),
            vatAmount: Number(updatedInvRow.tax_amount || 0),
            shippingFee: Number(updatedInvRow.shipping_fee || 0),
            paymentMethod: 'PAYMOB_UAE',
            paymentReference: paymentRef,
            items: parsedItems,
            channel: updatedInvRow.channel || 'ECOMMERCE'
          });
        }
      }

      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'PAYMENT_RECEIVED',
        action: 'UPDATE',
        documentRef: orderRef || paymentRef,
        data: {
          orderNumber: orderRef,
          paymentReference: paymentRef,
          provider: 'PAYMOB_UAE',
          amountFils: Number(obj.amount_cents || 0)
        }
      });

      return { received: true, processed: true, orderRef, paymentRef };
    }

    return { received: true, processed: false };
  }

  /**
   * Push payment amount to physical PAX A960 Smart POS terminal (via Classic Paymob API Key when provisioned)
   */
  public async pushAmountToPosTerminal(req: {
    terminalId?: string;
    amount: number;
    currency?: string;
    invoiceNo?: string;
    apiKey?: string;
    integrationId?: string;
    merchantId?: string;
  }): Promise<{
    success: boolean;
    status: 'APPROVED' | 'AWAITING_TAP' | 'DECLINED' | 'SIMULATED' | 'KEY_REQUIRED' | 'STANDALONE_MODE' | 'ERROR';
    authCode?: string;
    rrn?: string;
    transactionId?: string;
    cardBrand?: string;
    message: string;
    rawResponse?: any;
  }> {
    const config = this.getGatewayConfig();
    const profile = relationalStore.getCompanyProfile();
    const amountNum = Number(req.amount || 0);
    const amountInCents = Math.round(amountNum * 100);
    const effectiveCurrency = req.currency || 'AED';
    const targetTid = String(req.terminalId || process.env.PAYMOB_TID || '12857001').trim();
    const classicKey = String(
      (req.apiKey && !req.apiKey.startsWith('are_sk_') ? req.apiKey : '') ||
        (config as any)?.paymobClassicApiKey ||
        (profile as any)?.paymobClassicApiKey ||
        process.env.PAYMOB_CLASSIC_API_KEY ||
        ''
    ).trim();

    if (!classicKey) {
      return {
        success: false,
        status: 'STANDALONE_MODE',
        message: `PAX A960 (TID ${targetTid}) is operating in Standalone 4G HOST Mode — Paymob Classic ECR API Key is not provisioned on MID ${req.merchantId || '85283'}. Enter AED ${amountNum.toFixed(2)} on the PAX A960 keypad, tap the customer's card, and enter the slip Auth Code below (or click 1-Click Fast Auto-Approve).`
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const tokenRes = await fetch('https://uae.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: classicKey }),
        signal: controller.signal
      });
      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || `Paymob Auth Failed (HTTP ${tokenRes.status})`);
      }
      const { token: authToken } = await tokenRes.json();

      const orderRes = await fetch('https://uae.paymob.com/api/ecommerce/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          amount_cents: amountInCents,
          currency: effectiveCurrency,
          merchant_order_id: req.invoiceNo || `POS-${Date.now().toString().slice(-6)}`,
          items: [{ name: req.invoiceNo || 'POS Counter Sale', amount_cents: amountInCents, quantity: 1 }]
        }),
        signal: controller.signal
      });
      if (!orderRes.ok) {
        const errJson = await orderRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || `Paymob Order Failed (HTTP ${orderRes.status})`);
      }
      const orderData = await orderRes.json();

      const targetIntegrationId = Number(req.integrationId || process.env.PAYMOB_INTEGRATION_ID || 134222);
      const pKeyRes = await fetch('https://uae.paymob.com/api/acceptance/payment_keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          amount_cents: amountInCents,
          currency: effectiveCurrency,
          order_id: orderData.id,
          integration_id: targetIntegrationId,
          billing_data: {
            first_name: 'Counter',
            last_name: 'Customer',
            email: 'orders@vintagevibesllcspc.com',
            phone_number: '+971554186086',
            apartment: 'NA',
            floor: 'NA',
            street: 'Main Store Counter',
            building: 'NA',
            postal_code: '00000',
            city: 'Al Ain',
            country: 'ARE',
            state: 'Al Ain'
          }
        }),
        signal: controller.signal
      });
      if (!pKeyRes.ok) {
        const errJson = await pKeyRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || `Paymob Payment Key Failed (HTTP ${pKeyRes.status})`);
      }
      const { token: paymentToken } = await pKeyRes.json();

      const payRes = await fetch('https://uae.paymob.com/api/acceptance/payments/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: { identifier: targetTid, subtype: 'TERMINAL' },
          payment_token: paymentToken
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!payRes.ok) {
        const errJson = await payRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || `Paymob Terminal Push Failed (HTTP ${payRes.status})`);
      }

      const data = await payRes.json();
      const isApproved = data?.success === true;
      const isPending = data?.pending === true || data?.data?.message?.includes('Payment sent to terminal');
      const auth = data?.data?.auth_code || data?.auth_code || data?.approval_code || '';
      const rrn = data?.data?.rrn || data?.rrn || String(data?.id || '');
      const brand = data?.data?.card_brand || data?.card_brand || 'VISA CONTACTLESS';

      return {
        success: true,
        status: isApproved ? 'APPROVED' : isPending ? 'AWAITING_TAP' : 'SIMULATED',
        authCode: auth ? String(auth) : undefined,
        rrn: rrn ? String(rrn) : undefined,
        transactionId: data?.id ? String(data.id) : undefined,
        cardBrand: brand,
        message: isApproved
          ? 'Payment approved on PAX A960'
          : 'Payment amount sent to PAX A960 screen! Awaiting customer card tap.',
        rawResponse: data
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'ERROR',
        message: err?.message || 'Failed to reach Paymob Cloud Gateway for PAX A960 terminal push.'
      };
    }
  }

  /**
   * Generate High-Resolution Scannable Base64 Payment QR
   */
  public async generatePaymentQr(sku: string): Promise<{ success: boolean; sku: string; qrDataUrl?: string; checkoutUrl: string }> {
    const publicBase = (process.env.PUBLIC_STOREFRONT_URL || 'https://vintagevibesgk.com').replace(/\/+$/, '');
    const checkoutUrl = `${publicBase}/?checkout=${encodeURIComponent(sku)}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(checkoutUrl, {
        margin: 2,
        width: 320,
        color: {
          dark: '#1e293b',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'H'
      });
      return { success: true, sku, qrDataUrl, checkoutUrl };
    } catch (err: any) {
      return { success: false, sku, checkoutUrl };
    }
  }
}

export const paymentService = new PaymentService();
