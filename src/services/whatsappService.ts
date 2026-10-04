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
  imageUrl?: string;
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
   * Validates if a phone number is an authentic dialable number (rejects all-zeros, dummy walk-in placeholders)
   */
  public static isValidPhoneNumber(phone?: string | null): boolean {
    if (!phone) return false;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return false;
    if (/^0+$/.test(digits)) return false;
    if (new Set(digits.split('')).size <= 1) return false;

    // Strip common country code prefixes
    const withoutCc = digits.replace(/^(971|92|91|966|965|968|973|974|1|44)/, '').replace(/^0+/, '');
    if (!withoutCc || /^0+$/.test(withoutCc) || new Set(withoutCc.split('')).size <= 1) return false;

    // Check if remaining payload has too many trailing zeros (e.g. 500000000 -> 50 followed by 7 zeros)
    if (/^5\d0{6,}$/.test(withoutCc)) return false;
    if (/^3\d0{7,}$/.test(withoutCc)) return false;

    if (['12345678', '123456789', '1234567890', '987654321'].includes(digits)) return false;
    return true;
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

    return `🧾 *VINTAGE VIBES — OFFICIAL TAX INVOICE*
━━━━━━━━━━━━━━━━━━━━━━━━━━
*Invoice No:* #${payload.invoiceNo}
*Date:* ${dateStr}
*${partyLabel}:* ${partyName}
━━━━━━━━━━━━━━━━━━━━━━━━━━${itemLines}
${subtotalLine}${vatLine}*TOTAL AMOUNT:* *${currency} ${formattedTotal}*
━━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you for choosing Vintage Vibes! 🛍️
For inquiries or support, contact +971 55 418 6086 or visit @vintagevibes_official.`;
  }

  /**
   * Sends an automated WhatsApp Invoice Receipt (Dhamaka 1 Auto-Invoicing)
   */
  public static async sendInvoiceNotification(payload: InvoiceNotificationPayload): Promise<WhatsAppSendResult> {
    try {
      const cleanPhone = this.sanitizePhoneNumber(payload?.customerPhone);
      if (!cleanPhone || !this.isValidPhoneNumber(cleanPhone)) {
        console.warn('[WhatsAppService] Skipping invoice notification: recipient phone number is missing, placeholder, or invalid:', payload?.customerPhone);
        return { success: false, error: 'Recipient phone number is missing, placeholder, or invalid.' };
      }

      const formattedText = this.formatInvoiceMessage(payload);

      // 1. Primary: Dispatch via Unified WhatsApp Engine (Baileys Linked Phone or Meta Cloud Fallback)
      // When imageUrl (Option 2 digital slip) is present, do NOT pass text as caption to avoid duplicate message under image
      const res = await fetch('/api/marketing/whatsapp/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: cleanPhone,
          text: payload.imageUrl ? '' : formattedText,
          caption: '',
          invoiceNo: payload.invoiceNo,
          customerName: payload.customerName,
          totalAmount: payload.totalAmount,
          currency: payload.currency || 'AED',
          imageUrl: payload.imageUrl
        })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[WhatsAppService] Successfully dispatched invoice #${payload.invoiceNo} to ${cleanPhone} via Unified WhatsApp.`);
        return { success: true, message: data.message, messageId: data.messageId };
      }

      // 2. Fallback: try Meta Cloud send endpoint directly if available
      const fallbackRes = await fetch('/api/marketing/whatsapp/meta-cloud-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: cleanPhone,
          text: payload.imageUrl ? '' : formattedText,
          mediaUrl: payload.imageUrl,
          imageUrl: payload.imageUrl
        })
      }).catch(() => null);

      if (fallbackRes && fallbackRes.ok) {
        const data = await fallbackRes.json().catch(() => ({}));
        return { success: true, message: data.message, messageId: data.metaData?.messages?.[0]?.id };
      }

      const errData = res ? await res.json().catch(() => ({})) : {};
      const errorMsg = errData.error || errData.message || 'WhatsApp gateway inactive or device not linked';
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
   * Dispatches a direct text message or photo via Unified WhatsApp Gateway
   */
  public static async sendTextMessage(to: string, text: string, imageUrl?: string): Promise<WhatsAppSendResult> {
    try {
      const cleanPhone = this.sanitizePhoneNumber(to);
      if (!cleanPhone || !this.isValidPhoneNumber(cleanPhone)) {
        return { success: false, error: 'Valid recipient phone number is required (placeholder/dummy numbers are rejected).' };
      }

      const res = await fetch('/api/marketing/whatsapp/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: cleanPhone, text, imageUrl })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: true, message: data.message, messageId: data.messageId };
      }

      // Fallback to meta-cloud-send if available
      const fallbackRes = await fetch('/api/marketing/whatsapp/meta-cloud-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: cleanPhone, text })
      }).catch(() => null);

      if (fallbackRes && fallbackRes.ok) {
        const data = await fallbackRes.json().catch(() => ({}));
        return { success: true, message: data.message, messageId: data.metaData?.messages?.[0]?.id };
      }

      return { success: false, error: 'Failed to send WhatsApp message. Device not linked.' };
    } catch (err: any) {
      console.warn('[WhatsAppService] Silent catch sending text WhatsApp:', err?.message);
      return { success: false, error: err?.message || 'Network error' };
    }
  }

  /**
   * Check connection status of Unified WhatsApp Socket
   */
  public static async getWhatsAppStatus(): Promise<{ connected: boolean; phoneNumber?: string; status: string }> {
    try {
      const res = await fetch('/api/marketing/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        return {
          connected: Boolean(data.connected),
          phoneNumber: data.phoneNumber || undefined,
          status: data.status || 'DISCONNECTED'
        };
      }
    } catch (_) {}
    return { connected: false, status: 'DISCONNECTED' };
  }

  /**
   * Sends customer storefront inquiry with garment photo without requiring visitor to log into WhatsApp Web
   */
  public static async sendStorefrontInquiry(payload: {
    customerName: string;
    customerPhone: string;
    message: string;
    pieceId?: string;
    pieceTitle?: string;
    piecePrice?: number;
    imageUrl?: string;
  }): Promise<WhatsAppSendResult> {
    try {
      const cleanPhone = this.sanitizePhoneNumber(payload.customerPhone);
      if (!cleanPhone || cleanPhone.length < 7) {
        return { success: false, error: 'Valid phone number is required.' };
      }

      const res = await fetch('/api/marketing/whatsapp/storefront-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          customerPhone: cleanPhone
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { success: true, message: data.message || 'Inquiry dispatched to concierge desk.' };
      }
      return { success: false, error: data.error || 'Failed to submit inquiry' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error submitting inquiry' };
    }
  }

  /**
   * Fetches the comprehensive Executive Daily Digest (Purchases, Multi-Channel Sales, Liquidity & Courier Liabilities)
   */
  public static async getDailyDigestReport(): Promise<{
    success: boolean;
    reportText: string;
    metrics?: any;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/setup/whatsapp-report');
      const data = await res.json().catch(() => ({}));
      const text = data.reportText || data.messageText || (typeof data.data === 'string' ? data.data : '') || '';
      if (res.ok && text) {
        return {
          success: true,
          reportText: text,
          metrics: data.metrics
        };
      }
      return {
        success: false,
        reportText: text || '',
        error: data.error || 'Failed to fetch daily digest report'
      };
    } catch (err: any) {
      return {
        success: false,
        reportText: '',
        error: err?.message || 'Network error fetching daily digest'
      };
    }
  }

  /**
   * Sends the Executive Daily Digest directly to Admin WhatsApp
   */
  public static async sendDailyDigest(reportText: string, to?: string): Promise<WhatsAppSendResult> {
    try {
      const res = await fetch('/api/marketing/whatsapp/send-daily-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText, to })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { success: true, message: 'Daily digest dispatched to WhatsApp!' };
      }
      return { success: false, error: data.error || 'Failed to send daily digest' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error sending daily digest' };
    }
  }
}

export default WhatsAppService;
