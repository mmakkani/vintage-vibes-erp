import { AuditFilterOptions, AuditLogEntry } from './audit.types.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export class AuditController {
  public static getLogs(filters?: AuditFilterOptions): AuditLogEntry[] {
    return relationalStore.getAuditLogs(filters);
  }

  public static addLog(data: {
    module: any;
    action: any;
    documentRef: string;
    status: any;
    userName: string;
    details: string;
  }): AuditLogEntry {
    return relationalStore.addAuditLog(
      data.module || 'AUTH',
      data.action || 'POST',
      data.documentRef || 'AUD-REF',
      data.status || 'POSTED',
      data.userName || 'System',
      data.details || 'Audit Log'
    );
  }
}
