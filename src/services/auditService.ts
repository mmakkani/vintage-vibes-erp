import { supabase } from '../supabaseClient.ts';
import { AuditLogEntry } from '../types/common.types.ts';
import { applyPagination, buildPaginatedResponse, PaginatedResponse } from '../utils/paginationHelper.ts';

const LOCAL_STORAGE_AUDIT_KEY = 'vintage_vibes_audit_logs';

export interface AuditLogsPaginatedOptions {
  page?: number;
  pageSize?: number;
  module?: string;
  search?: string;
}

export class AuditService {
  /**
   * Enforces server-side pagination with stable ordering: ORDER BY timestamp DESC, id DESC.
   */
  public static async getAuditLogsPaginated(
    options?: AuditLogsPaginatedOptions
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    const page = Math.max(1, Math.floor(Number(options?.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(options?.pageSize) || 10)));
    const filterModule = options?.module || 'ALL';
    const search = options?.search?.trim() || '';

    // Purge stale local cache so direct DB deletes reflect immediately
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_AUDIT_KEY);
      }
    } catch (_) {}

    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if (filterModule && filterModule !== 'ALL') {
        query = query.eq('module', filterModule);
      }

      if (search) {
        query = query.or(
          `document_ref.ilike.%${search}%,actor.ilike.%${search}%,action.ilike.%${search}%,details.ilike.%${search}%`
        );
      }

      query = applyPagination(query, page, pageSize, {
        orderBy: 'timestamp',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;

      if (!error && Array.isArray(data)) {
        const mapped: AuditLogEntry[] = data.map((row: any) => ({
          id: row.id,
          module: row.module || 'HR',
          action: row.action || 'POST',
          documentRef: row.document_ref || row.documentRef || '',
          status: row.status || 'POSTED',
          userId: row.user_id || row.userId || 'usr-admin',
          userName: row.user_name || row.userName || row.actor || 'HR Department',
          details: row.details || '',
          timestamp: row.timestamp || new Date().toISOString()
        }));

        return buildPaginatedResponse(mapped, count || 0, page, pageSize);
      }

      if (error) {
        console.warn('[AuditService] Supabase getAuditLogsPaginated notice:', error.message);
      }
    } catch (err: any) {
      console.warn('[AuditService] Supabase getAuditLogsPaginated failed:', err?.message || err);
    }

    // Direct API fallback if available
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(filterModule && filterModule !== 'ALL' ? { module: filterModule } : {}),
        ...(search ? { search } : {})
      });
      const res = await fetch(`/api/audit?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.data)) {
          return buildPaginatedResponse(json.data, json.total ?? json.data.length, json.page || page, json.pageSize || pageSize);
        } else if (Array.isArray(json)) {
          const from = (page - 1) * pageSize;
          return buildPaginatedResponse(json.slice(from, from + pageSize), json.length, page, pageSize);
        }
      }
    } catch (e: any) {
      console.error('[AuditService] Fallback getAuditLogsPaginated error:', e?.message || e);
    }

    return buildPaginatedResponse([], 0, page, pageSize);
  }

  public static async getAuditLogs(limitOrOptions: number | { limit?: number; module?: string; search?: string } = 200): Promise<AuditLogEntry[]> {
    // Purge stale local cache so direct DB deletes reflect immediately
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_AUDIT_KEY);
      }
    } catch (_) {}

    const limit = typeof limitOrOptions === 'number' ? limitOrOptions : (limitOrOptions?.limit || 200);
    const filterModule = typeof limitOrOptions === 'object' ? limitOrOptions?.module : undefined;
    const search = typeof limitOrOptions === 'object' ? limitOrOptions?.search : undefined;

    try {
      let query = supabase
        .from('audit_logs')
        .select('*');

      if (filterModule && filterModule !== 'ALL') {
        query = query.eq('module', filterModule);
      }

      if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`document_ref.ilike.%${s}%,actor.ilike.%${s}%,action.ilike.%${s}%,details.ilike.%${s}%`);
      }

      query = query
        .order('timestamp', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);

      const { data, error } = await query;

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
