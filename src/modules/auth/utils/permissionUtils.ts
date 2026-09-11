import { User } from '../auth.types.ts';
import { ModuleType } from '../../../types/common.types.ts';
import { ActiveTab } from '../../../components/Navigation.tsx';

/**
 * Checks whether an ActiveTab is accessible to a user.
 * If false, the tab MUST be completely omitted from the UI to avoid "Access Denied" frustration.
 */
export function isTabAccessible(tab: ActiveTab, user?: User | null): boolean {
  if (!user) return false;

  // Primary Admin has unrestricted access to all modules
  if (user.role === 'ADMIN') return true;

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const getModPerm = (mod: ModuleType) => permissions.find(p => p.module === mod);

  switch (tab) {
    case 'dashboard': {
      // Main Dashboard & Company Secrets
      const p = getModPerm('DASHBOARD');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return true; // Default viewable unless explicitly disabled by admin in Authority Matrix
    }

    case 'purchase': {
      const p = getModPerm('PURCHASE');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return ['MANAGER', 'INVENTORY_SUPERVISOR', 'ACCOUNTANT'].includes(user.role);
    }

    case 'sales': {
      const p = getModPerm('SALES');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return ['MANAGER', 'SALES_EXECUTIVE', 'ACCOUNTANT'].includes(user.role);
    }

    case 'marketing': {
      const p = getModPerm('MARKETING') || getModPerm('SALES');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return ['MANAGER', 'SALES_EXECUTIVE', 'INVENTORY_SUPERVISOR'].includes(user.role);
    }

    case 'finance':
    case 'ledger': {
      const p = getModPerm('FINANCE');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return ['MANAGER', 'ACCOUNTANT'].includes(user.role);
    }

    case 'parties': {
      const p = getModPerm('PARTIES');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return ['MANAGER', 'SALES_EXECUTIVE', 'ACCOUNTANT'].includes(user.role);
    }

    case 'hr': {
      const p = getModPerm('HR');
      if (p && p.canView !== undefined) {
        return p.canView;
      }
      return ['MANAGER', 'ACCOUNTANT'].includes(user.role);
    }

    case 'setup': {
      // Global Master Setup is restricted to Admin or users explicitly granted canView: true
      const p = getModPerm('SETUP');
      return p?.canView === true;
    }

    case 'audit': {
      // Audit Trail is restricted to Admin or users explicitly granted canView: true
      const p = getModPerm('AUDIT');
      return p?.canView === true;
    }

    case 'access': {
      // Access Control / RBAC is restricted to Admin or users explicitly granted canView: true
      const p = getModPerm('AUTH');
      return p?.canView === true;
    }

    default:
      return false;
  }
}

/**
 * Returns the ordered list of all accessible tabs for the given user.
 */
export function getAccessibleTabs(user?: User | null): ActiveTab[] {
  const allTabs: ActiveTab[] = [
    'dashboard',
    'purchase',
    'sales',
    'marketing',
    'finance',
    'ledger',
    'parties',
    'hr',
    'setup',
    'audit',
    'access'
  ];

  return allTabs.filter(tab => isTabAccessible(tab, user));
}
