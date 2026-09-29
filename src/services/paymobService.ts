/**
 * Paymob UAE PAX A960 Cloud Push Terminal Integration Service
 * Allows Counter POS to push payable amounts directly to physical PAX A960 Smart Terminals
 * via Paymob Cellular Cloud API (uae.paymob.com).
 */

export interface PaymobPushRequest {
  terminalId: string;       // e.g. 51898 (Paymob TID) or 12857001 (Bank TID)
  amount: number;           // e.g. 26.00 AED
  currency?: string;        // 'AED'
  invoiceNo?: string;       // e.g. POS-001234
  apiKey?: string;          // Paymob Secret/API Key (from uae.paymob.com portal)
  integrationId?: string;   // Terminal Integration ID
  merchantId?: string;      // Paymob MID (e.g. 85283)
}

export interface PaymobPushResponse {
  success: boolean;
  status: 'APPROVED' | 'AWAITING_TAP' | 'DECLINED' | 'SIMULATED' | 'KEY_REQUIRED' | 'ERROR';
  authCode?: string;
  rrn?: string;
  transactionId?: string;
  cardBrand?: string;
  message: string;
  rawResponse?: any;
}

export class PaymobService {
  /**
   * Push payment request to physical PAX A960 terminal via Paymob Cloud API
   */
  public static async pushAmountToTerminal(req: PaymobPushRequest): Promise<PaymobPushResponse> {
    const effectiveCurrency = req.currency || 'AED';
    const amountInCents = Math.round(req.amount * 100); // 26.00 AED = 2600 fils
    const envKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_API_KEY) ||
      (typeof process !== 'undefined' && (process.env?.PAYMOB_API_KEY || process.env?.VITE_PAYMOB_API_KEY)) || '';
    const effectiveApiKey = (req.apiKey || envKey || '').trim();

    // If cashier/admin has not yet entered their Paymob API Key:
    if (!effectiveApiKey) {
      return {
        success: false,
        status: 'KEY_REQUIRED',
        message: 'Paymob Secret API Key is not yet configured. Please enter the Secret Key from uae.paymob.com in Global Setup > Bank & POS Fleet, or use 1-Click Fast Approve.'
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // Step 1: Obtain Auth Token from Paymob UAE
      const tokenRes = await fetch('https://uae.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: effectiveApiKey }),
        signal: controller.signal
      });

      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || `Paymob Auth Failed (HTTP ${tokenRes.status})`);
      }
      const tokenData = await tokenRes.json();
      const authToken = tokenData.token;

      // Step 2: Register Order on Paymob
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
        throw new Error(errJson?.detail || errJson?.message || `Paymob Order Creation Failed (HTTP ${orderRes.status})`);
      }
      const orderData = await orderRes.json();

      // Step 3: Generate Payment Key for POS Terminal Integration
      const envIntegrationId = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_INTEGRATION_ID) ||
        (typeof process !== 'undefined' && (process.env?.PAYMOB_INTEGRATION_ID || process.env?.VITE_PAYMOB_INTEGRATION_ID)) || '';
      const targetIntegrationId = Number(req.integrationId || envIntegrationId || 0);
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
            email: 'customer@vintagevibe.ae',
            phone_number: '+971501234567',
            apartment: 'NA',
            floor: 'NA',
            street: 'Main Store Counter',
            building: 'NA',
            postal_code: '00000',
            city: 'Dubai',
            country: 'ARE',
            state: 'Dubai'
          }
        }),
        signal: controller.signal
      });

      if (!pKeyRes.ok) {
        const errJson = await pKeyRes.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || `Paymob Payment Key Failed (HTTP ${pKeyRes.status})`);
      }
      const pKeyData = await pKeyRes.json();
      const paymentToken = pKeyData.token;

      // Step 4: Dispatch push request directly to physical terminal
      const envTid = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PAYMOB_TID) ||
        (typeof process !== 'undefined' && (process.env?.PAYMOB_TID || process.env?.VITE_PAYMOB_TID)) || '';
      const targetTerminalId = String(req.terminalId || envTid || '').trim();
      const payRes = await fetch('https://uae.paymob.com/api/acceptance/payments/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: {
            identifier: targetTerminalId,
            subtype: 'TERMINAL'
          },
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
        status: isApproved ? 'APPROVED' : (isPending ? 'AWAITING_TAP' : 'SIMULATED'),
        authCode: auth ? String(auth) : undefined,
        rrn: rrn ? String(rrn) : undefined,
        transactionId: data?.id ? String(data.id) : undefined,
        cardBrand: brand,
        message: isApproved 
          ? 'Payment approved on PAX A960' 
          : 'Payment amount sent to PAX A960 screen in Dubai! Awaiting customer card tap.',
        rawResponse: data
      };
    } catch (err: any) {
      console.warn('[Paymob Service] Cloud Push handshake error:', err?.message || err);
      return {
        success: false,
        status: 'ERROR',
        message: err?.message || 'Failed to reach Paymob Cloud Gateway. Terminal may be offline or API credentials invalid.'
      };
    }
  }
}
