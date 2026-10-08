import { RoleType, ModuleType, ActionType } from '../../types/common.types.ts';
import { User, UserPermission } from './auth.types.ts';

export class AuthEngine {
  /**
   * Evaluates if a user is permitted to perform an action on a specific module
   */
  public static canUserPerformAction(
    user: User,
    module: ModuleType,
    action: ActionType
  ): { allowed: boolean; reason?: string } {
    if (!user) {
      return { allowed: false, reason: 'Authentication required' };
    }

    if (!user.isActive) {
      return { allowed: false, reason: 'User account is inactive' };
    }

    const normalizedRole = String(user.role || '').toUpperCase();
    if (normalizedRole === 'ADMIN' || normalizedRole === 'SUPERADMIN') {
      return { allowed: true };
    }

    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    const permission = permissions.find(p => p && p.module === module);
    if (!permission) {
      return { allowed: false, reason: `No permissions configured for module ${module}` };
    }

    switch (action) {
      case 'CREATE':
        return permission.canCreate
          ? { allowed: true }
          : { allowed: false, reason: `Create permission denied for ${module}` };
      case 'EDIT':
        return permission.canEdit
          ? { allowed: true }
          : { allowed: false, reason: `Edit permission denied for ${module}` };
      case 'DELETE':
        return permission.canDelete
          ? { allowed: true }
          : { allowed: false, reason: `Delete permission denied for ${module}` };
      case 'POST':
        return permission.canPost
          ? { allowed: true }
          : { allowed: false, reason: `Posting permission denied for ${module}` };
      case 'UNPOST':
        return permission.canUnpost
          ? { allowed: true }
          : { allowed: false, reason: `Unposting permission denied for ${module}` };
      case 'VIEW':
        return permission.canView === true
          ? { allowed: true }
          : { allowed: false, reason: `View permission denied for ${module}` };
      default:
        return { allowed: false, reason: 'Unknown action type' };
    }
  }

  /**
   * Generates standard default permission matrix based on user role
   */
  public static generateDefaultPermissions(userId: string, role: RoleType): UserPermission[] {
    const modules: ModuleType[] = [
      'DASHBOARD', 'PURCHASE', 'INVENTORY', 'SALES', 'FINANCE', 'PARTIES', 'HR', 'SETUP', 'AUDIT', 'AUTH', 'MARKETING'
    ];

    const normalizedRole = String(role || '').toUpperCase();

    return modules.map(mod => {
      let canView = true;
      let canCreate = false;
      let canEdit = false;
      let canDelete = false;
      let canPost = false;
      let canUnpost = false;

      if (normalizedRole === 'ADMIN' || normalizedRole === 'SUPERADMIN') {
        canView = true;
        canCreate = true;
        canEdit = true;
        canDelete = true;
        canPost = true;
        canUnpost = true;
      } else {
        // Non-admin roles: SETUP, AUDIT, and AUTH are strictly hidden/denied by default
        if (['SETUP', 'AUDIT', 'AUTH'].includes(mod)) {
          canView = false;
        }

        if (normalizedRole === 'MANAGER') {
          canCreate = true;
          canEdit = true;
          canDelete = false;
          canPost = true;
          canUnpost = true;
        } else if (normalizedRole === 'ACCOUNTANT') {
          if (['FINANCE', 'PARTIES', 'SALES', 'PURCHASE', 'HR'].includes(mod)) {
            canCreate = true;
            canEdit = true;
            canDelete = false;
            canPost = true;
            canUnpost = mod === 'FINANCE';
          }
        } else if (normalizedRole === 'INVENTORY_SUPERVISOR') {
          if (['PURCHASE', 'INVENTORY'].includes(mod)) {
            canCreate = true;
            canEdit = true;
            canDelete = false;
            canPost = true;
            canUnpost = false;
          }
        } else if (normalizedRole === 'SALES_EXECUTIVE') {
          if (['SALES', 'PARTIES', 'MARKETING'].includes(mod)) {
            canCreate = true;
            canEdit = true;
            canDelete = false;
            canPost = true;
            canUnpost = false;
          }
        }
      }

      return {
        id: `perm-${userId}-${mod}`,
        userId,
        module: mod,
        canView,
        canCreate,
        canEdit,
        canDelete,
        canPost,
        canUnpost
      };
    });
  }
}
