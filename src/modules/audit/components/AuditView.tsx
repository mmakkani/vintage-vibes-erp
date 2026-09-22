import React, { useState, useEffect, useCallback } from 'react';
import { AuditLogEntry } from '../audit.types.ts';
import { AuditService } from '../../../services/auditService.ts';
import { History, Search, ShieldCheck, Filter, Clock, User, RefreshCw } from 'lucide-react';
import { Pagination } from '../../../components/Pagination.tsx';

interface AuditViewProps {
  onRefreshAll?: () => void;
  currentUserRole?: string;
}

export const AuditView: React.FC<AuditViewProps> = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filterModule, setFilterModule] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const loadLogs = useCallback(async (
    targetPage = currentPage,
    targetPageSize = pageSize,
    targetModule = filterModule,
    targetSearch = searchTerm
  ) => {
    setIsLoading(true);
    try {
      const res = await AuditService.getAuditLogsPaginated({
        page: targetPage,
        pageSize: targetPageSize,
        module: targetModule,
        search: targetSearch
      });
      setLogs(Array.isArray(res?.data) ? res.data : []);
      setTotalItems(res?.total || 0);
      setTotalPages(res?.totalPages || 1);
    } catch (err) {
      console.error('[AuditView] loadLogs error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, filterModule, searchTerm]);

  // Reactive fetch on pagination, search, or module filter change
  useEffect(() => {
    loadLogs(currentPage, pageSize, filterModule, searchTerm);
  }, [currentPage, pageSize, filterModule, searchTerm, loadLogs]);

  // Realtime CDC Listener: Refetches current page silently without resetting user's page position
  useEffect(() => {
    const handleRealtimeRecord = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      if (detail.table === 'audit_logs') {
        loadLogs(currentPage, pageSize, filterModule, searchTerm);
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtimeRecord);
    return () => window.removeEventListener('vv:realtime-record', handleRealtimeRecord);
  }, [currentPage, pageSize, filterModule, searchTerm, loadLogs]);

  const handleFilterModuleChange = (newModule: string) => {
    setFilterModule(newModule);
    setCurrentPage(1);
  };

  const handleSearchChange = (newSearch: string) => {
    setSearchTerm(newSearch);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="bg-white p-2.5 sm:p-3 rounded border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-4 h-4 text-[#0056b3]" />
            <span>Immutable Enterprise Audit Trail</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Chronological audit verification for every Document Status change (Draft, Posted, Unposted)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search ref, user, or action..."
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:border-blue-500"
            />
          </div>

          <select
            value={filterModule}
            onChange={e => handleFilterModuleChange(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-700 bg-white focus:border-blue-500"
          >
            <option value="ALL">All Modules</option>
            <option value="PURCHASE">Purchase</option>
            <option value="INVENTORY">Inventory</option>
            <option value="SALES">Sales</option>
            <option value="FINANCE">Finance</option>
            <option value="HR">HR Payroll</option>
            <option value="PARTIES">Parties</option>
            <option value="SETUP">Setup</option>
          </select>

          <button
            type="button"
            onClick={() => loadLogs(currentPage, pageSize, filterModule, searchTerm)}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-bold text-[#0056b3] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh enterprise audit logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Document Ref</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Performed By</th>
                <th className="px-3 py-2">Details / Memo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {logs.map(log => {
                const isPost = log.action === 'POST';
                const isUnpost = log.action === 'UNPOST';
                const isDelete = log.action === 'DELETE';

                const actionBadgeClass = isPost
                  ? 'bg-emerald-100 text-emerald-800'
                  : isUnpost
                  ? 'bg-amber-100 text-amber-800'
                  : isDelete
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-blue-100 text-blue-800';

                return (
                  <tr key={log.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap text-[10px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 font-sans font-semibold text-slate-800">{log.module}</td>
                    <td className="px-3 py-1.5 font-bold text-blue-900">
                      <div className="flex items-center gap-1.5">
                        <span>{log.documentRef}</span>
                        <span className="text-[8px] font-mono font-normal px-1 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200" title="Cryptographically Sealed Node">
                          #SEC
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 font-sans">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${actionBadgeClass}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-sans">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-sans font-medium text-slate-700">
                      {log.userName}
                    </td>
                    <td className="px-3 py-1.5 font-sans text-slate-600 max-w-sm truncate text-[11px]">
                      {log.details || '-'}
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No audit log records found.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Actions in Purchase, Inventory, Sales, HR (Employees, OCR Scans, Payroll), and Finance are automatically recorded here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div className="p-2.5 sm:p-3 border-t border-slate-200 bg-slate-50/50">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={(p) => setCurrentPage(p)}
              onPageSizeChange={(sz) => {
                setPageSize(sz);
                setCurrentPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
              isLoading={isLoading}
              itemLabel="audit logs"
            />
          </div>
        )}
      </div>
    </div>
  );
};
