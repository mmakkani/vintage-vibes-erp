import { supabase } from '../supabaseClient.ts';
import { AuditLogEntry } from '../modules/audit/audit.types.ts';

export class AuditService {
  public static async getAuditLogs(limit = 200): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase error on audit_logs:', error);
      throw new Error(error.message || 'Database error occurred reading audit logs');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      module: row.module,
      action: row.action,
      documentRef: row.document_ref || row.documentRef || '',
      status: row.status || 'POSTED',
      actor: row.actor,
      details: row.details || '',
      timestamp: row.timestamp || new Date().toISOString()
    }));
  }

  public static async addAuditLog(entry: Partial<AuditLogEntry>): Promise<void> {
    const id = entry.id || `aud-${Date.now()}`;
    const payload = {
      id,
      module: entry.module || 'SYSTEM',
      action: entry.action || 'UPDATE',
      document_ref: entry.documentRef || '',
      status: entry.status || 'POSTED',
      actor: entry.actor || 'System',
      details: entry.details || '',
      timestamp: entry.timestamp || new Date().toISOString()
    };

    const { error } = await supabase
      .from('audit_logs')
      .insert(payload);

    if (error) {
      console.error('Supabase error on audit_logs:', error);
    }
  }
}
