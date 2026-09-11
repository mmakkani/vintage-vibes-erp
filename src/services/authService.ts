import { supabase } from '../supabaseClient.ts';
import { User, UserPermission } from '../modules/auth/auth.types.ts';
import { AuthEngine } from '../modules/auth/auth.engine.ts';
import { RoleType } from '../types/common.types.ts';

function mapOperatorRowToUser(row: any): User {
  const rawRole = (row.role || 'operator').toUpperCase();
  let normalizedRole: RoleType = 'ADMIN';
  if (['ADMIN', 'SUPERADMIN'].includes(rawRole)) normalizedRole = 'ADMIN';
  else if (['MANAGER'].includes(rawRole)) normalizedRole = 'MANAGER';
  else if (['ACCOUNTANT'].includes(rawRole)) normalizedRole = 'ACCOUNTANT';
  else if (['INVENTORY_SUPERVISOR', 'INVENTORY'].includes(rawRole)) normalizedRole = 'INVENTORY_SUPERVISOR';
  else if (['SALES_EXECUTIVE', 'SALES', 'OPERATOR'].includes(rawRole)) normalizedRole = 'SALES_EXECUTIVE';

  let perms: UserPermission[] = [];
  if (Array.isArray(row.permissions) && row.permissions.length > 0) {
    perms = row.permissions;
  } else if (row.permissions && typeof row.permissions === 'object' && Object.keys(row.permissions).length > 0) {
    perms = Object.values(row.permissions) as UserPermission[];
  } else {
    perms = AuthEngine.generateDefaultPermissions(row.id, normalizedRole);
  }

  return {
    id: row.id,
    username: row.username,
    name: row.display_name || row.username || 'Operator',
    email: row.username.includes('@') ? row.username : `${row.username}@vintagevibe.ae`,
    role: normalizedRole,
    password: row.password_hash || '',
    isActive: row.is_active !== false,
    permissions: perms,
    createdAt: row.created_at || new Date().toISOString()
  };
}

export class AuthService {
  /**
   * Fetch all registered operators from public.operators
   */
  public static async getOperators(): Promise<User[]> {
    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error on operators:', error);
      throw new Error(error.message || 'Database error occurred reading operators');
    }

    return (data || []).map(mapOperatorRowToUser);
  }

  public static async getUsers(): Promise<User[]> {
    return this.getOperators();
  }

  /**
   * Add a new operator to public.operators
   */
  public static async addOperator(payload: Partial<User> & { password?: string; pin?: string }): Promise<User> {
    const newOperatorPayload = {
      username: (payload.username || '').trim(),
      password_hash: payload.password?.trim() || 'vintage123',
      display_name: (payload.name || payload.username || '').trim(),
      role: (payload.role || 'operator').toLowerCase(),
      pin: payload.pin || null,
      permissions: payload.permissions || AuthEngine.generateDefaultPermissions(payload.id || '', (payload.role as RoleType) || 'ADMIN'),
      is_active: payload.isActive !== false
    };

    const { data, error } = await supabase
      .from('operators')
      .insert([newOperatorPayload])
      .select();

    if (error) {
      console.error('Supabase error adding operator:', error);
      throw new Error(error.message || 'Failed to add operator');
    }

    if (!data || data.length === 0) {
      throw new Error('Operator was inserted but no record returned');
    }

    return mapOperatorRowToUser(data[0]);
  }

  /**
   * Update an existing operator in public.operators
   */
  public static async updateOperator(id: string, updates: Partial<User> & { password?: string; pin?: string }): Promise<User> {
    const payload: any = {};
    if (updates.username !== undefined) payload.username = updates.username.trim();
    if (updates.password !== undefined && updates.password.trim()) payload.password_hash = updates.password.trim();
    if (updates.name !== undefined) payload.display_name = updates.name.trim();
    if (updates.role !== undefined) payload.role = updates.role.toLowerCase();
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.pin !== undefined) payload.pin = updates.pin;
    if (updates.permissions !== undefined) payload.permissions = updates.permissions;

    const { data, error } = await supabase
      .from('operators')
      .update(payload)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Supabase error updating operator:', error);
      throw new Error(error.message || 'Failed to update operator');
    }

    if (!data || data.length === 0) {
      throw new Error('Operator record not found or update failed');
    }

    return mapOperatorRowToUser(data[0]);
  }

  /**
   * Delete an operator from public.operators
   */
  public static async deleteOperator(id: string): Promise<void> {
    const { error } = await supabase
      .from('operators')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error deleting operator:', error);
      throw new Error(error.message || 'Failed to delete operator');
    }
  }

  /**
   * Update operator permission matrix
   */
  public static async updateOperatorPermissions(userId: string, permissions: any): Promise<void> {
    const { error } = await supabase
      .from('operators')
      .update({ permissions })
      .eq('id', userId);

    if (error) {
      console.error('Supabase error updating operator permissions:', error);
      throw new Error(error.message || 'Failed to update operator permissions');
    }
  }

  public static async updateUserPermissions(userId: string, permissions: any): Promise<void> {
    return this.updateOperatorPermissions(userId, permissions);
  }

  /**
   * Authenticate user against operators table
   */
  public static async authenticate(usernameOrEmail: string, passwordHash?: string): Promise<User | null> {
    const term = usernameOrEmail.trim().toLowerCase();

    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .eq('username', term)
      .limit(1);

    if (!error && data && data.length > 0) {
      const row = data[0];
      if (!row.is_active) {
        throw new Error('Operator account has been deactivated. Contact System Admin.');
      }

      if (passwordHash && row.password_hash && row.password_hash !== passwordHash) {
        throw new Error('Invalid credentials provided. Check username and password.');
      }

      return mapOperatorRowToUser(row);
    }

    // Fallback: Check default hardcoded superadmin credentials
    if ((term === 'admin' || term === 'admin@vintagevibe.ae' || term === 'admin@vintagevibes.ae') &&
        (!passwordHash || passwordHash === 'admin123' || passwordHash === 'vintage2026')) {
      return {
        id: 'usr-admin-1',
        username: 'admin',
        name: 'Master Admin',
        email: 'admin@vintagevibes.ae',
        role: 'ADMIN',
        isActive: true,
        permissions: AuthEngine.generateDefaultPermissions('usr-admin-1', 'ADMIN'),
        createdAt: new Date().toISOString()
      };
    }

    return null;
  }
}
