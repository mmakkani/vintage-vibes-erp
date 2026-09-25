/**
 * WhatsApp Gateway & "Dhamaka 1" Enterprise Service
 * -------------------------------------------------
 * Handles Meta Official WhatsApp Cloud API communication, automated tax invoice dispatch,
 * and Dhamaka 1 AI Sales Agent integrations.
 */

import { supabase } from '../supabaseClient.ts';

export interface InvoiceNotificationPayload {
  invoiceNo: string;
  type?: 'SALES' | 'PURCHASE';
  customerName?: string;
  customerPhone?: string;
  totalAmount: number;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  invoiceDate?: string;
  items?: Array<{
    name?: string;
    item_name?: string;
    description?: string;
    quantity?: number;
    qty?: number;
    price?: number;
    unit_price?: number;
    total?: number;
  }>;
}

export interface WhatsAppSendResult {
  success: boolean;
  message?: string;
  messageId?: string;
  error?: string;
}

export class WhatsAppService {
  /**
   * Cleans and formats phone numbers to international standard digits (e.g., 971554186086)
   */
  public static sanitizePhoneNumber(phone?: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    // If number starts with 0 and looks like UAE mobile (050, 055, etc.), prepend 971
    if (digits.startsWith('0') && digits.length === 10) {
      return `971${digits.slice(1)}`;
    }
    // UAE 9-digit local number without leading 0 (50xxxxxxx, 55xxxxxxx, 52xxxxxxx)
    if (digits.length === 9 && (digits.startsWith('50') || digits.startsWith('52') || digits.startsWith('54') || digits.startsWith('55') || digits.startsWith('56') || digits.startsWith('58'))) {
      return `971${digits}`;
    }
    return digits;
  }

  /**
   * Fetches the current WhatsApp Gateway configuration from PostgreSQL / Serverless API
   */
  public static async getGatewayConfig(): Promise<any> {
    try {
      const res = await fetch('/api/marketing/whatsapp/config', { credentials: 'include' });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}

    // Fallback: check Supabase config table
    try {
      const { data } = await supabase
        .from('whatsapp_gateway_config')
        .select('config')
        .eq('id', 'default')
        .maybeSingle();
      if (data?.config) return data.config;
    } catch (_) {}

    return null;
  }

  /**
   * Formats a branded WhatsApp receipt text for Posted Invoices
   */
  public static formatInvoiceMessage(payload: InvoiceNotificationPayload): string {
    const isSales = payload.type !== 'PURCHASE';
    const currency = (payload.currency || 'AED').toUpperCase();
    const formattedTotal = Number(payload.totalAmount || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const dateStr = payload.invoiceDate || new Date().toISOString().slice(0, 10);
    const partyLabel = isSales ? 'Customer' : 'Supplier';
    const partyName = payload.customerName || (isSales ? 'Valued Collector' : 'Trade Partner');

    let itemLines = '';
    if (Array.isArray(payload.items) && payload.items.length > 0) {
      itemLines = '\n📦 *Items Summary:*\n' + payload.items.slice(0, 8).map(item => {
        const name = item.name || item.item_name || item.description || 'Vintage Garment';
        const qty = item.quantity || item.qty || 1;
        const price = Number(item.price || item.unit_price || item.total || 0).toFixed(2);
        return `• ${qty}x ${name} - ${currency} ${price}`;
      }).join('\n');
      if (payload.items.length > 8) {
        itemLines += `\n_...and ${payload.items.length - 8} more item(s)_`;
      }
    }

    const subtotalLine = payload.subtotal ? `*Subtotal:* ${currency} ${Number(payload.subtotal).toFixed(2)}\n` : '';
    const vatLine = payload.taxAmount ? `*VAT (5%):* ${currency} ${Number(payload.taxAmount).toFixed(2)}\n` : '';

    return `🧾 *VINTAGE VIBES DUBAI — OFFICIAL TAX INVOICE*
━━━━━━━━━━━━━━━━━━━━━━━━━━
*Invoice No:* #${payload.invoiceNo}
*Date:* ${dateStr}
*${partyLabel}:* ${partyName}
━━━━━━━━━━━━━━━━━━━━━━━━━━${itemLines}
${subtotalLine}${vatLine}*TOTAL AMOUNT:* *${currency} ${formattedTotal}*
━━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you for choosing Vintage Vibes Dubai! 🛍️
For inquiries or support, contact +971 55 418 6086 or visit @vintagevibes_official.`;
  }

  /**
   * Sends an automated WhatsApp Invoice Receipt (Dhamaka 1 Auto-Invoicing)
   */
  public static async sendInvoiceNotification(payload: InvoiceNotificationPayload): Promise<WhatsAppSendResult> {
    try {
      const cleanPhone = this.sanitizePhoneNumber(payload?.customerPhone);
      if (!cleanPhone || cleanPhone.length < 8) {
        console.warn('[WhatsAppService] Skipping invoice notification: recipient phone number is missing or invalid.');
        return { success: false, error: 'Recipient phone number is missing or invalid.' };
      }

      // Check whether Meta Official WhatsApp Cloud API is configured in this environment
      const envMetaToken =
        (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_META_WA_TOKEN || (import.meta as any).env?.VITE_WHATSAPP_TOKEN)) ||
        (typeof process !== 'undefined' && (process.env?.META_WA_TOKEN || process.env?.WHATSAPP_ACCESS_TOKEN || process.env?.WHATSAPP_API_TOKEN));

      const gatewayConfig = await this.getGatewayConfig().catch(() => null);
      const hasActiveCredentials = Boolean(
        envMetaToken ||
        gatewayConfig?.accessToken ||
        gatewayConfig?.metaCloudToken ||
        gatewayConfig?.apiKey ||
        gatewayConfig?.token
      );

      // If credentials are not configured, suppress network error and return early
      if (!hasActiveCredentials) {
        console.warn('[WhatsAppService] Meta Cloud WhatsApp API credentials not configured in environment. Skipping automatic invoice dispatch.');
        return { success: false, message: 'WhatsApp API credentials not configured in environment.' };
      }

      const formattedText = this.formatInvoiceMessage(payload);

      // 1. Primary: Dispatch via dedicated serverless backend route
      const res = await fetch('/api/marketing/whatsapp/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: cleanPhone,
          text: formattedText,
          invoiceNo: payload.invoiceNo,
          customerName: payload.customerName,
          totalAmount: payload.totalAmount,
          currency: payload.currency || 'AED'
        })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[WhatsAppService] Successfully dispatched invoice #${payload.invoiceNo} to ${cleanPhone} via Meta Cloud API.`);
        return { success: true, message: data.message, messageId: data.messageId };
      }

      // 2. Fallback: try Meta Cloud send endpoint directly
      const fallbackRes = await fetch('/api/marketing/whatsapp/meta-cloud-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: cleanPhone,
          text: formattedText
        })
      }).catch(() => null);

      if (fallbackRes && fallbackRes.ok) {
        const data = await fallbackRes.json().catch(() => ({}));
        return { success: true, message: data.message, messageId: data.metaData?.messages?.[0]?.id };
      }

      const errData = res ? await res.json().catch(() => ({})) : {};
      const errorMsg = errData.error || errData.message || 'WhatsApp gateway inactive or unconfigured';
      console.warn(`[WhatsAppService] WhatsApp invoice notification skipped: ${errorMsg}`);
      return { success: false, error: errorMsg };
    } catch (err: any) {
      console.warn('[WhatsAppService] Silent catch: Could not send WhatsApp invoice:', err?.message || err);
      return { success: false, error: err?.message || 'Silent error' };
    }
  }

  /**
   * Alias for sendInvoiceNotification for receipt distribution
   */
  public static async sendReceipt(payload: InvoiceNotificationPayload): Promise<WhatsAppSendResult> {
    return this.sendInvoiceNotification(payload);
  }

  /**
   * Dispatches a direct text message via Meta Cloud API
   */
  public static async sendTextMessage(to: string, text: string): Promise<WhatsAppSendResult> {
    try {
      const cleanPhone = this.sanitizePhoneNumber(to);
      if (!cleanPhone) {
        return { success: false, error: 'Valid recipient phone number is required.' };
      }

      const envMetaToken =
        (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_META_WA_TOKEN || (import.meta as any).env?.VITE_WHATSAPP_TOKEN)) ||
        (typeof process !== 'undefined' && (process.env?.META_WA_TOKEN || process.env?.WHATSAPP_ACCESS_TOKEN));

      if (!envMetaToken) {
        console.warn('[WhatsAppService] Meta Cloud WhatsApp API token not present in environment. Skipping text dispatch.');
        return { success: false, message: 'WhatsApp token missing in environment.' };
      }

      const res = await fetch('/api/marketing/whatsapp/meta-cloud-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: cleanPhone, text })
      }).catch(() => null);

      if (!res) {
        return { success: false, error: 'Network request failed' };
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { success: true, message: data.message, messageId: data.metaData?.messages?.[0]?.id };
      }
      return { success: false, error: data.error || 'Failed to send WhatsApp message' };
    } catch (err: any) {
      console.warn('[WhatsAppService] Silent catch sending text WhatsApp:', err?.message);
      return { success: false, error: err?.message || 'Network error' };
    }
  }
}

export default WhatsAppService;
