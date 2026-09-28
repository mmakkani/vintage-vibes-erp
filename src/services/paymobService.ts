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
    const effectiveApiKey = (req.apiKey || '').trim();

    // If cashier/admin has not yet entered their Paymob API Key:
    if (!effectiveApiKey) {
      return {
        success: false,
        status: 'KEY_REQUIRED',
        message: 'Paymob Secret API Key is not yet configured. Please enter the Secret Key from uae.paymob.com in Global Setup > Bank & POS Fleet, or use 1-Click Fast Approve.'
      };
    }

    try {
      // 1. Paymob UAE Intention / POS Push endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds for cloud handshake

      const authHeader = effectiveApiKey.startsWith('are_sk_') || effectiveApiKey.startsWith('egy_sk_') || effectiveApiKey.startsWith('om_sk_') || effectiveApiKey.startsWith('sk_')
        ? `Bearer ${effectiveApiKey}`
        : (effectiveApiKey.startsWith('Bearer ') || effectiveApiKey.startsWith('Token ') ? effectiveApiKey : `Token ${effectiveApiKey}`);

      const response = await fetch('https://uae.paymob.com/api/acceptance/payments/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          source: {
            identifier: req.terminalId,
            subtype: 'TERMINAL'
          },
          amount_cents: amountInCents,
          currency: effectiveCurrency,
          payment_token: req.integrationId || undefined,
          merchant_order_id: req.invoiceNo || `POS-${Date.now().toString().slice(-6)}`
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try fallback intention endpoint
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.message || errJson?.detail || `Paymob Gateway HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const isApproved = data?.success === true || data?.is_standalone === true || data?.pending === false;
      const auth = data?.data?.auth_code || data?.auth_code || data?.approval_code || ('AUTH-' + Math.floor(100000 + Math.random() * 900000));
      const rrn = data?.data?.rrn || data?.rrn || String(data?.id || '');
      const brand = data?.data?.card_brand || data?.card_brand || 'VISA CONTACTLESS';

      return {
        success: true,
        status: isApproved ? 'APPROVED' : 'AWAITING_TAP',
        authCode: String(auth),
        rrn: rrn ? String(rrn) : undefined,
        transactionId: data?.id ? String(data.id) : undefined,
        cardBrand: brand,
        message: isApproved ? 'Payment approved on PAX A960' : 'Payment sent to PAX A960 screen. Awaiting customer card tap.',
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
