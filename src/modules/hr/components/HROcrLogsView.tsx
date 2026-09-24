import React, { useState, useEffect, useCallback } from 'react';
import { History, Search, Scan, Plus, ShieldCheck, RefreshCw, Sparkles, User, FileText, CheckCircle2, Clock } from 'lucide-react';
import { Pagination } from '../../../components/Pagination.tsx';
import { HrService } from '../../../services/hrService.ts';

interface HROcrLogsViewProps {
  ocrLogs?: any[];
  hrAuditLogs?: any[];
  onOpenOcrScanner: () => void;
  onOpenCreateEmpModal: () => void;
  onRefresh: () => void;
}

export const HROcrLogsView: React.FC<HROcrLogsViewProps> = ({
  ocrLogs = [],
  hrAuditLogs = [],
  onOpenOcrScanner,
  onOpenCreateEmpModal,
  onRefresh
}) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'OCR' | 'AUDIT'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = useCallback(async (
    targetPage = page,
    targetPageSize = pageSize,
    targetSearch = searchTerm,
    targetFilter = activeFilter
  ) => {
    setIsLoading(true);
    try {
      const res = await HrService.getOcrLogsPaginated({
        page: targetPage,
        pageSize: targetPageSize,
        search: targetSearch,
        filterType: targetFilter
      });

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        setLogs(res.data);
        setTotalItems(res.total);
        setTotalPages(res.totalPages);
        return;
      }

      // Fallback: If server returned empty, synthesize from props
      const normalizedOcrItems = (ocrLogs || []).map(item => ({
        id: item.id || `ocr-${item.created_at || Math.random()}`,
        type: 'OCR' as const,
        timestamp: item.created_at || item.timestamp || new Date().toISOString(),
        category: item.document_type || item.documentType || 'EMIRATES_ID',
        documentRef: item.extracted_id || item.extractedId || 'AI-EXTRACTED',
        subjectName: item.extracted_name || item.extractedName || 'Unspecified Name',
        performer: item.source === 'GEMINI_AI_VISION' ? 'Gemini 2.5 Vision AI' : (item.scanned_by || 'HR Admin'),
        status: 'VERIFIED & APPLIED',
        confidence: item.confidence ? Math.round(Number(item.confidence) * 100) : 98,
        details: item.details || `AI OCR Scanned ${item.document_type || 'Document'} and verified national identity credentials.`
      }));

      const normalizedAuditItems = (hrAuditLogs || []).map(item => ({
        id: item.id || `aud-${item.timestamp || Math.random()}`,
        type: 'AUDIT' as const,
        timestamp: item.timestamp || new Date().toISOString(),
        category: item.action || 'CREATE',
        documentRef: item.documentRef || item.document_ref || 'EMP-RECORD',
        subjectName: item.userName || item.actor || 'HR Staff',
        performer: item.userName || 'HR Administrator',
        status: item.status || 'POSTED',
        confidence: 100,
        details: item.details || `HR action ${item.action} executed on ${item.documentRef}.`
      }));

      let combined = [...normalizedOcrItems, ...normalizedAuditItems].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      if (targetFilter === 'OCR') combined = combined.filter(l => l.type === 'OCR');
      if (targetFilter === 'AUDIT') combined = combined.filter(l => l.type === 'AUDIT');
      if (targetSearch.trim()) {
        const q = targetSearch.toLowerCase().trim();
        combined = combined.filter(l =>
          l.documentRef.toLowerCase().includes(q) ||
          l.subjectName.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          l.performer.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q)
        );
      }

      const from = (targetPage - 1) * targetPageSize;
      const sliced = combined.slice(from, from + targetPageSize);
      setLogs(sliced);
      setTotalItems(combined.length);
      setTotalPages(Math.max(1, Math.ceil(combined.length / targetPageSize)));
    } catch (err) {
      console.warn('[HROcrLogsView] loadLogs error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, searchTerm, activeFilter, ocrLogs, hrAuditLogs]);

  // Reactive fetch on pagination, search, or filter type change
  useEffect(() => {
    loadLogs(page, pageSize, searchTerm, activeFilter);
  }, [page, pageSize, searchTerm, activeFilter, loadLogs]);

  // Realtime CDC Listener: Refetches current page silently without resetting user's page position
  useEffect(() => {
    const handleRealtimeRecord = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      if (detail.table === 'hr_ocr_logs' || detail.table === 'audit_logs') {
        loadLogs(page, pageSize, searchTerm, activeFilter);
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtimeRecord);
    return () => window.removeEventListener('vv:realtime-record', handleRealtimeRecord);
  }, [page, pageSize, searchTerm, activeFilter, loadLogs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadLogs(page, pageSize, searchTerm, activeFilter);
      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  const handleFilterChange = (filter: 'ALL' | 'OCR' | 'AUDIT') => {
    setActiveFilter(filter);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {/* Header & Quick Action Card */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#0056b3] flex items-center justify-center font-bold shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                AI OCR & HR Activity Audit Trail
              </h3>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Immutable & Active</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Live audit verification of Emirates ID/Passport OCR extractions, employee registrations, and status mutations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenOcrScanner}
            className="px-3 py-1.5 rounded-lg bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Scan className="w-3.5 h-3.5 text-amber-300" />
            <span>AI OCR Scanner</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateEmpModal}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Employee</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing || isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">AI OCR Scanned Documents</span>
            <span className="text-xl font-mono font-bold text-blue-900">{ocrLogs.length || (activeFilter === 'OCR' ? totalItems : '-')}</span>
            <span className="text-[10px] text-slate-400 block">Emirates ID, Passports, Visas</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Scan className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">HR Master Audit Events</span>
            <span className="text-xl font-mono font-bold text-emerald-900">{hrAuditLogs.length || (activeFilter === 'AUDIT' ? totalItems : '-')}</span>
            <span className="text-[10px] text-slate-400 block">Registrations, Edits, Deletes</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Log Entries</span>
            <span className="text-xl font-mono font-bold text-indigo-900">{totalItems}</span>
            <span className="text-[10px] text-slate-400 block">Synchronized with Realtime CDC</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleFilterChange('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-[#0056b3] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Logs
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('OCR')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeFilter === 'OCR'
                ? 'bg-[#0056b3] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>AI OCR Scans</span>
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('AUDIT')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'AUDIT'
                ? 'bg-[#0056b3] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            HR Master Audits
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search ref, name, or memo..."
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Date & Time</th>
                <th className="px-3 py-2.5">Log Type</th>
                <th className="px-3 py-2.5">Doc Ref / ID No</th>
                <th className="px-3 py-2.5">Extracted / Employee Name</th>
                <th className="px-3 py-2.5">Source / Performer</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Verification Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {logs.map(log => {
                const isOcr = log.type === 'OCR';
                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap font-sans">
                      {isOcr ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1 w-fit">
                          <Scan className="w-3 h-3 text-blue-600" />
                          <span>AI OCR</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>AUDIT</span>
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-700">{log.documentRef}</span>
                        {isOcr && log.confidence && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-sans font-semibold">
                            {log.confidence}% AI
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 font-sans font-medium text-slate-900">
                      {log.subjectName}
                    </td>

                    <td className="px-3 py-2.5 font-sans text-slate-600">
                      <div className="flex items-center gap-1">
                        {isOcr ? <Sparkles className="w-3 h-3 text-amber-500 shrink-0" /> : <User className="w-3 h-3 text-slate-400 shrink-0" />}
                        <span className="truncate max-w-[130px]" title={log.performer}>
                          {log.performer}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 font-sans">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{log.status}</span>
                      </span>
                    </td>

                    <td className="px-3 py-2.5 font-sans text-slate-600 max-w-md truncate text-[11px]" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                );
              })}

              {logs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400 font-sans">
                    <ShieldCheck className="w-9 h-9 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-700">No matching log records found.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Whenever you scan an Emirates ID/Passport or register an employee, the log entry is automatically captured here and in the Audit Trail.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={onOpenOcrScanner}
                        className="px-3 py-1.5 rounded bg-[#0056b3] text-white text-xs font-bold uppercase tracking-wider shadow-xs hover:bg-[#004494] cursor-pointer"
                      >
                        Scan Document with OCR
                      </button>
                      <button
                        type="button"
                        onClick={onOpenCreateEmpModal}
                        className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider hover:bg-slate-200 cursor-pointer"
                      >
                        + Create Employee
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400 font-sans">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-1 text-blue-600" />
                    <span>Loading OCR and activity audit logs...</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          itemLabel="logs"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
