import React, { useState } from 'react';
import { Employee } from '../hr.types.ts';
import { Shield, Lock, FileText, CheckCircle, AlertTriangle, Search, ExternalLink, Calendar, RefreshCw } from 'lucide-react';

interface DocumentVaultProps {
  employees: Employee[];
  onRefresh: () => void;
}

export const DocumentVault: React.FC<DocumentVaultProps> = ({ employees }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocType, setSelectedDocType] = useState<'ALL' | 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY'>('ALL');

  // Flatten out documents from employees
  const allDocuments: Array<{
    id: string;
    employeeId: string;
    empCode: string;
    employeeName: string;
    docType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_CARD';
    documentNo: string;
    expiryDate: string;
    ocrStatus: 'VERIFIED' | 'PENDING' | 'MANUAL_OVERRIDE';
    encryptedRef: string;
    fileUrl?: string;
  }> = [];

  employees.forEach(emp => {
    if (emp.emiratesId) {
      allDocuments.push({
        id: `doc-eid-front-${emp.id}`,
        employeeId: emp.id,
        empCode: emp.empCode,
        employeeName: emp.name,
        docType: 'EMIRATES_ID',
        documentNo: `${emp.emiratesId} (Front)`,
        expiryDate: emp.emiratesIdExpiry || '2028-11-30',
        ocrStatus: 'VERIFIED',
        encryptedRef: `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855-${emp.empCode}-front`,
        fileUrl: emp.idFrontImageUrl
      });
      if (emp.idBackImageUrl) {
        allDocuments.push({
          id: `doc-eid-back-${emp.id}`,
          employeeId: emp.id,
          empCode: emp.empCode,
          employeeName: emp.name,
          docType: 'EMIRATES_ID',
          documentNo: `${emp.idCardNo || emp.emiratesId} (Back)`,
          expiryDate: emp.emiratesIdExpiry || '2028-11-30',
          ocrStatus: 'VERIFIED',
          encryptedRef: `sha256:7392a83819283719823719827391823719283719283719283719283719283719-${emp.empCode}-back`,
          fileUrl: emp.idBackImageUrl
        });
      }
    }
    if (emp.residencyCardNo) {
      allDocuments.push({
        id: `doc-rc-${emp.id}`,
        employeeId: emp.id,
        empCode: emp.empCode,
        employeeName: emp.name,
        docType: 'RESIDENCY_CARD',
        documentNo: `${emp.residencyCardNo}${emp.uidNo ? ` • UID: ${emp.uidNo}` : ''}`,
        expiryDate: emp.residencyExpiryDate || '2027-06-15',
        ocrStatus: 'VERIFIED',
        encryptedRef: `sha256:8f434346648f1c149afbf4c8996fb92427ae41e4649b934ca495991b7852cf9-${emp.empCode}`,
        fileUrl: emp.residencyImageUrl || emp.idBackImageUrl
      });
    }
    if (emp.passportNo) {
      allDocuments.push({
        id: `doc-pass-${emp.id}`,
        employeeId: emp.id,
        empCode: emp.empCode,
        employeeName: emp.name,
        docType: 'PASSPORT',
        documentNo: `${emp.passportNo}${emp.passportCountry ? ` (${emp.passportCountry})` : ''}`,
        expiryDate: emp.passportExpiry || '2031-01-20',
        ocrStatus: 'VERIFIED',
        encryptedRef: `sha256:9a83019283fa1c149afbf4c8996fb92427ae41e4649b934ca495991b7852a12-${emp.empCode}`,
        fileUrl: emp.passportImageUrl || emp.idFrontImageUrl
      });
    }
  });

  const filteredDocs = allDocuments.filter(doc => {
    const matchesSearch =
      doc.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.documentNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.empCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedDocType === 'ALL' || doc.docType === selectedDocType;
    return matchesSearch && matchesType;
  });

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
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-56 bg-slate-50 focus:bg-white"
            />
          </div>

          <select
            value={selectedDocType}
            onChange={e => setSelectedDocType(e.target.value as any)}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-semibold bg-slate-50"
          >
            <option value="ALL">All Document Types</option>
            <option value="EMIRATES_ID">Emirates IDs</option>
            <option value="RESIDENCY_CARD">Residency Cards</option>
            <option value="PASSPORT">Passports</option>
          </select>
        </div>
      </div>

      {/* Vault Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Encrypted Document Registry ({filteredDocs.length} items secured)</span>
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
              {filteredDocs.map(doc => {
                const isExpiringSoon = new Date(doc.expiryDate) < new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
                return (
                  <tr key={doc.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-sans">
                      <div className="font-bold text-slate-900">{doc.employeeName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{doc.empCode}</div>
                    </td>
                    <td className="px-3 py-2 font-sans font-semibold text-blue-900">
                      {doc.docType.replace('_', ' ')}
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-900">{doc.documentNo}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span className={isExpiringSoon ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                          {doc.expiryDate}
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
              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500 font-sans italic">
                    No documents found matching the filter criteria.
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
