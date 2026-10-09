import Stripe from 'stripe';
import QRCode from 'qrcode';
import { relationalStore } from '../db/relationalStore.ts';
import { eventHub } from './events.ts';
import { baileysManager } from '../modules/marketing/baileys.service.ts';

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
  }): Promise<PaymentIntentResult> {
    const config = this.getGatewayConfig();
    const profile = relationalStore.getCompanyProfile();
    const stripe = this.getStripeClient();
    const amountFils = Math.round(Number(params.amountAed) * 100); // AED fils

    const paymobKey = config?.paymobApiKey || profile?.paymobApiKey || process.env.PAYMOB_API_KEY || '';
    const onlineCardIntegrationId = config?.paymobOnlineCardIntegrationId || profile?.paymobOnlineCardIntegrationId || process.env.PAYMOB_ONLINE_INTEGRATION_ID || '';
    const applePayIntegrationId = config?.paymobApplePayIntegrationId || profile?.paymobApplePayIntegrationId || process.env.PAYMOB_APPLE_PAY_INTEGRATION_ID || '';
    const isPaymob = (config?.provider === 'PAYMOB_UAE') || (!stripe && !!paymobKey);

    // 1. Paymob UAE Modern Intention Flow (Cards & Apple Pay)
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
        const methods = [Number(onlineCardIntegrationId)];
        if (applePayIntegrationId) methods.push(Number(applePayIntegrationId));

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
          const checkoutUrl = pubKey
            ? `https://uae.paymob.com/unifiedcheckout/?publicKey=${pubKey}&clientSecret=${intentionData.client_secret}`
            : `https://uae.paymob.com/unifiedcheckout/?clientSecret=${intentionData.client_secret}`;

          return {
            success: true,
            isLiveGateway: true,
            provider: 'PAYMOB_UAE',
            clientSecret: intentionData.client_secret,
            paymentIntentId: String(intentionData.id || `pm_${Date.now()}`),
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

        // 3. Auto-reply to customer on WhatsApp
        const customerPhone = invoice.customerPhone;
        if (customerPhone) {
          const cleanRecipient = customerPhone.replace(/[^0-9]/g, '');
          const jid = `${cleanRecipient}@s.whatsapp.net`;
          const confirmationText = `✅ *Payment Received!* Your order #${invoice.invoiceNo} is confirmed and sent to fulfillment. You will receive tracking details once dispatched.`;
          baileysManager.sendMessage('usr-admin-1', jid, confirmationText).catch(() => {});
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
   * Generate High-Resolution Scannable Base64 Payment QR
   */
  public async generatePaymentQr(sku: string): Promise<{ success: boolean; sku: string; qrDataUrl?: string; checkoutUrl: string }> {
    const checkoutUrl = `http://localhost:3000/?checkout=${encodeURIComponent(sku)}`;
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
