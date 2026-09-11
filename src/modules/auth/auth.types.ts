import { RoleType, ModuleType, ActionType } from '../../types/common.types.ts';

export interface UserPermission {
  id: string;
  userId: string;
  module: ModuleType;
  canView?: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPost: boolean;
  canUnpost: boolean;
}

export interface User {
  id: string;
  username?: string;
  password?: string;
  email: string;
  name: string;
  role: RoleType;
  assignedShopId?: string;
  isActive: boolean;
  permissions: UserPermission[];
  createdAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
}
