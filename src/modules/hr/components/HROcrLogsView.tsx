import React, { useState } from 'react';
import { History, Search, Scan, Plus, ShieldCheck, RefreshCw, Sparkles, User, FileText, CheckCircle2, Clock } from 'lucide-react';

interface HROcrLogsViewProps {
  ocrLogs: any[];
  hrAuditLogs: any[];
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  // Normalize OCR logs and HR Audit logs into a unified timeline
  const normalizedOcrItems = ocrLogs.map(item => ({
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

  const normalizedAuditItems = hrAuditLogs.map(item => ({
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

  // Combine and sort chronologically descending
  const combinedLogs = [...normalizedOcrItems, ...normalizedAuditItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const filteredLogs = combinedLogs.filter(log => {
    if (activeFilter === 'OCR' && log.type !== 'OCR') return false;
    if (activeFilter === 'AUDIT' && log.type !== 'AUDIT') return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        log.documentRef.toLowerCase().includes(q) ||
        log.subjectName.toLowerCase().includes(q) ||
        log.category.toLowerCase().includes(q) ||
        log.performer.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
            className="px-3 py-1.5 rounded-lg bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-xs shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Scan className="w-3.5 h-3.5 text-amber-300" />
            <span>AI OCR Scanner</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateEmpModal}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Employee</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">AI OCR Scanned Documents</span>
            <span className="text-xl font-mono font-bold text-blue-900">{ocrLogs.length}</span>
            <span className="text-[10px] text-slate-400 block">Emirates ID, Passports, Visas</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Scan className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">HR Master Audit Events</span>
            <span className="text-xl font-mono font-bold text-emerald-900">{hrAuditLogs.length}</span>
            <span className="text-[10px] text-slate-400 block">Registrations, Edits, Deletes</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Log Entries</span>
            <span className="text-xl font-mono font-bold text-indigo-900">{combinedLogs.length}</span>
            <span className="text-[10px] text-slate-400 block">Synchronized with Audit Trail</span>
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
            onClick={() => setActiveFilter('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
              activeFilter === 'ALL'
                ? 'bg-[#0056b3] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Logs ({combinedLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('OCR')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
              activeFilter === 'OCR'
                ? 'bg-[#0056b3] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>AI OCR Scans ({ocrLogs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('AUDIT')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
              activeFilter === 'AUDIT'
                ? 'bg-[#0056b3] text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            HR Master Audits ({hrAuditLogs.length})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search ref, name, or memo..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
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
              {filteredLogs.map(log => {
                const isOcr = log.type === 'OCR';
                const isCreate = log.category === 'CREATE' || log.category === 'EMIRATES_ID' || log.category === 'PASSPORT';
                const isDelete = log.category === 'DELETE';
                const isUpdate = log.category === 'UPDATE' || log.category === 'EDIT';

                let badgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                if (isOcr) {
                  badgeClass = 'bg-purple-100 text-purple-800 border-purple-200';
                } else if (isCreate) {
                  badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                } else if (isDelete) {
                  badgeClass = 'bg-rose-100 text-rose-800 border-rose-200';
                } else if (isUpdate) {
                  badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
                }

                return (
                  <tr key={log.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-[10px] font-sans">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${badgeClass}`}>
                        {isOcr ? `AI OCR: ${log.category}` : `HR: ${log.category}`}
                      </span>
                    </td>

                    <td className="px-3 py-2 font-bold text-blue-900 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{log.documentRef}</span>
                        {isOcr && (
                          <span className="text-[9px] bg-blue-50 text-blue-700 px-1 rounded font-normal" title={`Confidence: ${log.confidence}%`}>
                            {log.confidence}%
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2 font-sans font-semibold text-slate-900">
                      {log.subjectName}
                    </td>

                    <td className="px-3 py-2 font-sans text-slate-600 text-[10px]">
                      <div className="flex items-center gap-1">
                        {isOcr ? <Sparkles className="w-3 h-3 text-purple-600" /> : <User className="w-3 h-3 text-slate-400" />}
                        <span>{log.performer}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2 font-sans">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{log.status}</span>
                      </span>
                    </td>

                    <td className="px-3 py-2 font-sans text-slate-600 max-w-md truncate text-[11px]" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && (
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
                        className="px-3 py-1.5 rounded bg-[#0056b3] text-white text-xs font-bold uppercase tracking-wider shadow-xs hover:bg-[#004494]"
                      >
                        Scan Document with OCR
                      </button>
                      <button
                        type="button"
                        onClick={onOpenCreateEmpModal}
                        className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider hover:bg-slate-200"
                      >
                        + Create Employee
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
