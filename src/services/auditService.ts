import { supabase } from '../supabaseClient.ts';
import { AuditLogEntry } from '../types/common.types.ts';

const LOCAL_STORAGE_AUDIT_KEY = 'vintage_vibes_audit_logs';

function getLocalAuditLogs(): AuditLogEntry[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LOCAL_STORAGE_AUDIT_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch (_) {}
  return [];
}

function saveLocalAuditLogs(logs: AuditLogEntry[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_AUDIT_KEY, JSON.stringify(logs.slice(0, 300)));
    }
  } catch (_) {}
}

export class AuditService {
  public static async getAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped = data.map((row: any) => ({
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

        // Merge with local logs to ensure no logs are lost
        const localLogs = getLocalAuditLogs();
        const mergedMap = new Map<string, AuditLogEntry>();
        [...mapped, ...localLogs].forEach(l => mergedMap.set(l.id, l));
        const merged = Array.from(mergedMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        saveLocalAuditLogs(merged);
        return merged.slice(0, limit);
      }
    } catch (err) {
      console.warn('Supabase getAuditLogs failed, using local store:', err);
    }

    return getLocalAuditLogs().slice(0, limit);
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

    // 1. Immediately store in LocalStorage so Audit Log table never misses it
    const current = getLocalAuditLogs();
    saveLocalAuditLogs([normalizedEntry, ...current.filter(l => l.id !== id)]);

    // 2. Try persisting to Supabase in the background
    try {
      await supabase
        .from('audit_logs')
        .insert(payload);
    } catch (err) {
      console.warn('Supabase insert audit log warning (saved locally):', err);
    }
  }
}
