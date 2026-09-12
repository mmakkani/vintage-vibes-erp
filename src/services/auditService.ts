import { supabase } from '../supabaseClient.ts';
import { AuditLogEntry } from '../types/common.types.ts';

const LOCAL_STORAGE_AUDIT_KEY = 'vintage_vibes_audit_logs';

export class AuditService {
  public static async getAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
    // Purge stale local cache so direct DB deletes reflect immediately
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_AUDIT_KEY);
      }
    } catch (_) {}

    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data)) {
        if (data.length === 0) {
          return [];
        }

        return data.map((row: any) => ({
          id: row.id,
          module: row.module || 'HR',
          action: row.action || 'POST',
          documentRef: row.document_ref || row.documentRef || '',
          status: row.status || 'POSTED',
          userId: row.user_id || row.userId || 'usr-admin',
          userName: row.user_name || row.userName || row.actor || 'HR Department',
          details: row.details || '',
          timestamp: row.timestamp || new Date().toISOString()
        } as AuditLogEntry));
      }

      if (error) {
        console.warn('Supabase getAuditLogs error:', error.message);
      }
    } catch (err) {
      console.warn('Supabase getAuditLogs failed:', err);
    }

    return [];
  }

  public static async addAuditLog(entry: Partial<AuditLogEntry> & { actor?: string; userName?: string }): Promise<void> {
    const id = entry.id || `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const effectiveUserName = entry.userName || entry.actor || 'HR Department';
    const timestamp = entry.timestamp || new Date().toISOString();

    const normalizedEntry: AuditLogEntry = {
      id,
      module: (entry.module as any) || 'HR',
      action: (entry.action as any) || 'CREATE',
      documentRef: entry.documentRef || '',
      status: (entry.status as any) || 'POSTED',
      userId: entry.userId || 'usr-admin',
      userName: effectiveUserName,
      details: entry.details || '',
      timestamp
    };

    const payload = {
      id,
      module: normalizedEntry.module,
      action: normalizedEntry.action,
      document_ref: normalizedEntry.documentRef,
      status: normalizedEntry.status,
      actor: effectiveUserName,
      details: normalizedEntry.details,
      timestamp
    };

    // Strictly persist to Supabase PostgreSQL (public.audit_logs)
    try {
      await supabase
        .from('audit_logs')
        .insert(payload);
    } catch (err) {
      console.warn('Supabase insert audit log warning:', err);
    }

    // Ensure stale local cache is cleared
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_AUDIT_KEY);
      }
    } catch (_) {}
  }
}
