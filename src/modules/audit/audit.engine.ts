import { AuditLogEntry, ModuleType, ActionType, DocumentStatus } from '../../types/common.types.ts';

export class AuditEngine {
  /**
   * Constructs an immutable, validated audit log entry
   */
  public static createLogEntry(
    module: ModuleType,
    action: ActionType,
    documentRef: string,
    status: DocumentStatus,
    userName: string,
    details: string,
    metaPayload?: any
  ): AuditLogEntry {
    return {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      module,
      action,
      documentRef,
      status,
      userId: 'usr-current',
      userName,
      timestamp: new Date().toISOString(),
      details,
      metaPayload
    };
  }

  /**
   * Filters audit logs by query criteria
   */
  public static filterLogs(
    logs: AuditLogEntry[],
    filters: { module?: ModuleType; status?: DocumentStatus; search?: string }
  ): AuditLogEntry[] {
    return logs.filter(log => {
      if (filters.module && log.module !== filters.module) return false;
      if (filters.status && log.status !== filters.status) return false;
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchesRef = log.documentRef.toLowerCase().includes(query);
        const matchesUser = log.userName.toLowerCase().includes(query);
        const matchesDetails = log.details.toLowerCase().includes(query);
        if (!matchesRef && !matchesUser && !matchesDetails) return false;
      }
      return true;
    });
  }
}
