import { AuditLogEntry, ModuleType, ActionType, DocumentStatus } from '../../types/common.types.ts';

export interface AuditFilterOptions {
  module?: ModuleType;
  documentRef?: string;
  status?: DocumentStatus;
  search?: string;
}

export type { AuditLogEntry };
