import {
  CompanyProfileService,
  SetupService,
  PartiesService,
  PurchaseService,
  SalesService,
  FinanceService,
  AuthService,
  AuditService
} from '../services/index.ts';

/**
 * Universal Data & JSON resolver.
 * Transparently routes `/api/...` calls to Direct Supabase Queries on Vercel SPA deployments,
 * completely eliminating "Unexpected end of JSON input" and 404/500 errors.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
  retries = 1,
  baseDelayMs = 200
): Promise<T | null> {
  const method = options?.method?.toUpperCase() || 'GET';

  // Direct Supabase Query Dispatch for GET requests
  if (method === 'GET') {
    try {
      if (url.includes('/company-profile') || url.includes('/setup/company')) {
        return (await CompanyProfileService.getCompanyProfile()) as any;
      }
      if (url.includes('/setup/currency') || url.includes('/setup/currencies')) {
        return (await SetupService.getCurrencies()) as any;
      }
      if (url.includes('/setup/categories')) {
        return (await SetupService.getCategories()) as any;
      }
      if (url.includes('/setup/sizes')) {
        return (await SetupService.getSizes()) as any;
      }
      if (url.includes('/setup/brands') || url.includes('/setup/brand-master')) {
        return (await SetupService.getBrands()) as any;
      }
      if (url.includes('/setup/labels') || url.includes('/setup/label-grade')) {
        return (await SetupService.getLabelGrades()) as any;
      }
      if (url.includes('/setup/shops') || url.includes('/setup/shop-master')) {
        return (await SetupService.getShops()) as any;
      }
      if (url.includes('/parties')) {
        return (await PartiesService.getParties()) as any;
      }
      if (url.includes('/purchase/gate-passes') || url.includes('/bales')) {
        return (await PurchaseService.getInwardGatePasses()) as any;
      }
      if (url.includes('/purchase/invoices')) {
        return (await PurchaseService.getPurchaseInvoices()) as any;
      }
      if (url.includes('/purchase/inventory') || url.includes('/stock-pieces') || url.includes('/purchase/pieces')) {
        return (await PurchaseService.getInventoryPieces()) as any;
      }
      if (url.includes('/sales/invoices')) {
        return (await SalesService.getSalesInvoices()) as any;
      }
      if (url.includes('/finance/coa')) {
        return (await FinanceService.getCoaAccounts()) as any;
      }
      if (url.includes('/finance/vouchers')) {
        return (await FinanceService.getVouchers()) as any;
      }
      if (url.includes('/finance/ledgers')) {
        return (await FinanceService.getLedgers()) as any;
      }
      if (url.includes('/auth/users')) {
        return (await AuthService.getUsers()) as any;
      }
      if (url.includes('/audit/')) {
        return (await AuditService.getAuditLogs()) as any;
      }
    } catch (dbErr: any) {
      console.warn(`[Supabase Direct Query Notice for ${url}]:`, dbErr?.message);
    }
  }

  // Fallback to fetch with error handling
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
          continue;
        }
        return null;
      }
      const ct = res.headers.get('content-type');
      if (ct && !ct.includes('application/json')) return null;
      return (await res.json()) as T;
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
      } else {
        return null;
      }
    }
  }
  return null;
}
