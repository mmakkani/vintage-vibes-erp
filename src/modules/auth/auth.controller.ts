import { User, UserPermission } from './auth.types.ts';
import { AuthEngine } from './auth.engine.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export class AuthController {
  public static login(identifier: string, password?: string): { success: boolean; user?: User; error?: string } {
    return relationalStore.loginUser(identifier, password);
  }

  public static createUser(userData: {
    username: string;
    password?: string;
    name: string;
    email: string;
    role: any;
    assignedShopId?: string;
    isActive?: boolean;
    permissions?: UserPermission[];
  }): { success: boolean; user?: User; error?: string } {
    if (!userData.username || !userData.username.trim()) {
      return { success: false, error: 'Username is mandatory' };
    }
    if (!userData.name || !userData.name.trim()) {
      return { success: false, error: 'Full name is mandatory' };
    }
    const cleanUsername = userData.username.trim().toLowerCase();
    const existing = relationalStore.getUsers().find(u => u.username?.toLowerCase() === cleanUsername);
    if (existing) {
      return { success: false, error: `Username '${cleanUsername}' already exists. Choose a different handle.` };
    }
    const user = relationalStore.createUser(userData);
    return { success: true, user };
  }

  public static updateUser(userId: string, updateData: Partial<User>): { success: boolean; user?: User; error?: string } {
    const user = relationalStore.updateUser(userId, updateData);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, user };
  }

  public static deleteUser(userId: string): { success: boolean; error?: string } {
    const success = relationalStore.deleteUser(userId);
    return { success, error: success ? undefined : 'User not found' };
  }

  public static updatePermissions(userId: string, permissions: UserPermission[], operatorName?: string, operatorHandle?: string): { success: boolean; user?: User } {
    const user = relationalStore.updateUserPermissions(userId, permissions, operatorName, operatorHandle);
    return { success: !!user, user };
  }

  public static listUsers(): User[] {
    return relationalStore.getUsers();
  }
}
