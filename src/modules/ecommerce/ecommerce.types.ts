export interface StorefrontFilter {
  category: string;
  brand?: string;
  size?: string;
  searchQuery?: string;
  maxPrice?: number;
}

export type PaymentMethod = 'APPLE_GOOGLE_PAY' | 'BANK_QR' | 'CREDIT_CARD' | 'COD';

export interface CheckoutCustomerInfo {
  name: string;
  phone: string;
  email?: string;
  shippingAddress: string;
  city: string;
  emirate: string;
}
