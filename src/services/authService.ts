import { supabase } from '../supabaseClient.ts';
import { User } from '../modules/auth/auth.types.ts';
import { AuthEngine } from '../modules/auth/auth.engine.ts';

export class AuthService {
  public static async getUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error on users:', error);
      throw new Error(error.message || 'Database error occurred reading users');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role || 'STAFF',
      assignedShopId: row.assigned_shop_id || row.assignedShopId,
      isActive: row.is_active !== false && row.isActive !== false,
      permissions: row.permissions || AuthEngine.generateDefaultPermissions(row.id, row.role || 'STAFF'),
      createdAt: row.created_at
    }));
  }

  public static async authenticate(usernameOrEmail: string, passwordHash?: string): Promise<User | null> {
    const term = usernameOrEmail.trim().toLowerCase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.ilike.${term},email.ilike.${term}`)
      .limit(1);

    if (error) {
      console.error('Supabase error on users auth:', error);
      throw new Error(error.message || 'Database error occurred authenticating user');
    }

    if (!data || data.length === 0) {
      return null;
    }

    const row = data[0];
    if (!row.is_active) {
      throw new Error('User account has been deactivated. Contact System Admin.');
    }

    if (passwordHash && row.password_hash && row.password_hash !== passwordHash) {
      throw new Error('Invalid credentials provided. Check username and password.');
    }

    return {
      id: row.id,
      username: row.username,
      name: row.name,
      email: row.email,
      role: row.role || 'ADMIN',
      assignedShopId: row.assigned_shop_id,
      isActive: row.is_active,
      permissions: row.permissions || AuthEngine.generateDefaultPermissions(row.id, row.role || 'ADMIN'),
      createdAt: row.created_at
    };
  }

  public static async updateUserPermissions(userId: string, permissions: any): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ permissions })
      .eq('id', userId);

    if (error) {
      console.error('Supabase error on users update:', error);
      throw new Error(error.message || 'Failed to update user permissions');
    }
  }
}
