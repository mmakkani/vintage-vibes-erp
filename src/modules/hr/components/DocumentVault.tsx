import React, { useState, useEffect, useCallback } from 'react';
import { Employee } from '../hr.types.ts';
import { Shield, Lock, Search, ExternalLink, Calendar, RefreshCw, CheckCircle } from 'lucide-react';
import { Pagination } from '../../../components/Pagination.tsx';
import { HrService } from '../../../services/hrService.ts';

interface DocumentVaultProps {
  employees?: Employee[];
  onRefresh?: () => void;
}

export const DocumentVault: React.FC<DocumentVaultProps> = ({ onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocType, setSelectedDocType] = useState<'ALL' | 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_CARD'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Array<{
    id: string;
    employeeId: string;
    empCode: string;
    employeeName: string;
    docType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_CARD' | string;
    documentNo: string;
    expiryDate: string;
    ocrStatus: 'VERIFIED' | 'PENDING' | 'MANUAL_OVERRIDE';
    encryptedRef: string;
    fileUrl?: string;
  }>>([]);

  const loadDocuments = useCallback(async (
    targetPage = currentPage,
    targetPageSize = pageSize,
    targetSearch = searchTerm,
    targetDocType = selectedDocType
  ) => {
    setIsLoading(true);
    try {
      const res = await HrService.getDocumentsPaginated({
        page: targetPage,
        pageSize: targetPageSize,
        search: targetSearch,
        docType: targetDocType
      });
      setDocuments(Array.isArray(res?.data) ? res.data : []);
      setTotalItems(res?.total || 0);
      setTotalPages(res?.totalPages || 1);
    } catch (err) {
      console.warn('[DocumentVault] load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, selectedDocType]);

  // Reactive fetch on pagination, search, or document type filter change
  useEffect(() => {
    loadDocuments(currentPage, pageSize, searchTerm, selectedDocType);
  }, [currentPage, pageSize, searchTerm, selectedDocType, loadDocuments]);

  // Realtime CDC Listener: Refetches current page silently without resetting user's page position
  useEffect(() => {
    const handleRealtimeRecord = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.record) return;
      if (detail.table === 'employee_documents' || detail.table === 'employees') {
        loadDocuments(currentPage, pageSize, searchTerm, selectedDocType);
      }
    };
    window.addEventListener('vv:realtime-record', handleRealtimeRecord);
    return () => window.removeEventListener('vv:realtime-record', handleRealtimeRecord);
  }, [currentPage, pageSize, searchTerm, selectedDocType, loadDocuments]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleDocTypeChange = (val: any) => {
    setSelectedDocType(val);
    setCurrentPage(1);
  };

  const handleManualRefresh = async () => {
    await loadDocuments(currentPage, pageSize, searchTerm, selectedDocType);
    if (onRefresh) {
      onRefresh();
    }
  };

  return (
    <div className="space-y-3">
      {/* Vault Header & Controls */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded bg-slate-900 text-white flex items-center justify-center font-bold">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Secure HR Document Vault & Encrypted Storage</h3>
            <p className="text-[11px] text-slate-500">AES-256 encrypted employee legal identity documents, OCR validation metadata & expiry tracking</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search vault (Name, ID, Code)..."
              value={searchTerm}
              onChange={e => handleSearchChange(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-56 bg-slate-50 focus:bg-white"
            />
          </div>

          <select
            value={selectedDocType}
            onChange={e => handleDocTypeChange(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-semibold bg-slate-50"
          >
            <option value="ALL">All Document Types</option>
            <option value="EMIRATES_ID">Emirates IDs</option>
            <option value="RESIDENCY_CARD">Residency Cards</option>
            <option value="PASSPORT">Passports</option>
          </select>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            title="Refresh Vault"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Vault Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Encrypted Document Registry ({totalItems} items secured)</span>
          </div>
          <div className="text-[10px] text-slate-500">Zero-Knowledge Storage • SHA-256 Hashes</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Emp Code & Name</th>
                <th className="px-3 py-2">Document Type</th>
                <th className="px-3 py-2">Document No</th>
                <th className="px-3 py-2">Expiry Date</th>
                <th className="px-3 py-2">OCR Metadata Status</th>
                <th className="px-3 py-2">Encryption Reference Hash</th>
                <th className="px-3 py-2 text-right">Preview / Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {documents.map(doc => {
                const isExpiringSoon = doc.expiryDate ? new Date(doc.expiryDate) < new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) : false;
                return (
                  <tr key={doc.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-sans">
                      <div className="font-bold text-slate-900">{doc.employeeName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{doc.empCode}</div>
                    </td>
                    <td className="px-3 py-2 font-sans font-semibold text-blue-900">
                      {(doc.docType || '').replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-900">{doc.documentNo}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span className={isExpiringSoon ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                          {doc.expiryDate || 'N/A'}
                        </span>
                        {isExpiringSoon && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-sans">Renewal Due</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-sans">
                      {doc.ocrStatus === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3" /> OCR Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Manual Override
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500 truncate max-w-xs" title={doc.encryptedRef}>
                      {doc.encryptedRef}
                    </td>
                    <td className="px-3 py-2 text-right font-sans">
                      {doc.fileUrl ? (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold uppercase"
                        >
                          <span>View Doc</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No Scan Attached</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {documents.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500 font-sans italic">
                    No documents found matching the filter criteria.
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400 font-sans">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-1 text-blue-600" />
                    <span>Loading documents from encrypted vault...</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          itemLabel="documents"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
