/**
 * Pure Frontend API Client for Omnichannel E-Commerce & B2B Engine
 * Strictly decoupled from server-side drivers (No pg, No Buffer leaks)
 */

export interface WholesaleBaleItem {
  bale_id: string;
  weight_kg: number;
  total_grams: number;
  status: string;
  bale_category?: string;
  bale_tag_no?: string;
  gate_pass_no?: string;
  wholesale_price_aed: number;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  totalAmount: number;
  subtotal: number;
  deliveryFee: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  items: any[];
  createdAt: string;
  trackingNumber?: string;
  courierName?: string;
  trackingUrl?: string;
}

export class EcommerceService {
  /**
   * Submits an atomic e-commerce / B2B order checkout request to the secure Express backend
   */
  public static async checkout(payload: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    shippingAddress: string;
    city?: string;
    country?: string;
    items: any[];
    paymentMethod: string;
    paymentRef?: string;
    sessionId?: string;
    customerId?: string;
    customerType?: 'RETAIL' | 'B2B_RESELLER';
    walletAmountUsed?: number;
  }): Promise<any> {
    const res = await fetch('/api/ecommerce/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to complete order checkout.');
    }
    return data;
  }

  /**
   * Fetches available unopened wholesale bales for verified B2B Resellers
   */
  public static async getWholesaleBales(): Promise<WholesaleBaleItem[]> {
    try {
      const res = await fetch('/api/ecommerce/wholesale-bales');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[EcommerceService] Failed to load wholesale bales:', err);
      return [];
    }
  }

  /**
   * Fetches order history and live courier tracking status for the customer portal
   */
  public static async getCustomerOrders(params: {
    customerId?: string;
    phone?: string;
    email?: string;
  }): Promise<CustomerOrderSummary[]> {
    try {
      const query = new URLSearchParams();
      if (params.customerId) query.set('customerId', params.customerId);
      if (params.phone) query.set('phone', params.phone);
      if (params.email) query.set('email', params.email);

      const targetUrl = params.customerId
        ? `/api/ecommerce/orders/customer/${encodeURIComponent(params.customerId)}?${query.toString()}`
        : `/api/ecommerce/orders/customer/by-contact?${query.toString()}`;

      const res = await fetch(targetUrl);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[EcommerceService] Failed to load customer orders:', err);
      return [];
    }
  }
}
