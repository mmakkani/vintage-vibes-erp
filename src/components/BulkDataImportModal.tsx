import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Trash2,
  ArrowRight,
  Loader2
} from 'lucide-react';

interface BulkDataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  initialMode?: 'INVENTORY' | 'SALES';
}

export const BulkDataImportModal: React.FC<BulkDataImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'INVENTORY'
}) => {
  const [importMode, setImportMode] = useState<'INVENTORY' | 'SALES'>(initialMode);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Generate Sample CSVs
  const handleDownloadTemplate = () => {
    let csvContent = '';
    let downloadName = '';

    if (importMode === 'INVENTORY') {
      csvContent = 
`barcode,itemName,brandName,brandTier,labelGrade,shopLocation,weightKg,estimatedPrice,sizeScanned,countryOfOrigin,style
VV-IMP-001,Vintage 90s Big E Denim Jacket,Levi's,Vintage American Grail,Grade A+ (Pristine Cream),Central Warehouse (Al Quoz),0.95,350,XL,Made in USA,Type III Trucker
VV-IMP-002,Duck Blanket Lined Detroit Jacket,Carhartt,Workwear Heritage,Grade A (Clean Vintage),Deira Flagship,1.30,480,L,Made in USA,Detroit J97
VV-IMP-003,1993 3D Emblem Harley Eagle Tee,Harley Davidson,Band & Moto Grails,Grade A+ (Pristine Cream),Al Quoz Showroom,0.22,420,L,Made in USA,Single Stitch Tee
VV-IMP-004,Nuptse 700 Down Puffer Jacket,The North Face,Outdoor Archive,Grade A (Clean Vintage),Central Warehouse (Al Quoz),0.75,390,M,Made in Bangladesh,1996 Retro Nuptse
VV-IMP-005,Reverse Weave Heavyweight Crewneck,Champion,Sportswear Icons,Grade B+ (Distressed Charm),Deira Flagship,0.65,220,XL,Made in USA,Warmup 90s`;
      downloadName = 'VintageVibe_Inventory_Import_Template.csv';
    } else {
      csvContent = 
`clientName,date,amount,notes
The Dubai Mall Vintage Collective,2026-09-02,4800,Wholesale curated denim batch
Al Serkal Avenue Concept Boutique,2026-09-03,3200,Rare workwear jackets lot
Tokyo Heritage Retails FZ-LLC,2026-09-04,7500,Export consignment order
Boutique 971 Vintage Jumeirah,2026-09-05,2900,Walk-in wholesale assortment`;
      downloadName = 'VintageVibe_Sales_Import_Template.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', downloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Simple CSV parser
  const parseCSVText = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setParseErrors(['CSV file must contain a header row and at least one data row']);
      setParsedRows([]);
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows: any[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      // simple comma split taking care of potential quotes
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length < headers.length) {
        errors.push(`Row ${i + 1} has missing columns (${values.length} found, ${headers.length} expected)`);
        continue;
      }
      const rowObj: any = {};
      headers.forEach((h, idx) => {
        rowObj[h] = values[idx] || '';
      });
      rows.push(rowObj);
    }

    setParsedRows(rows);
    setParseErrors(errors);
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      setParseErrors(['Please select a valid .csv file']);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      if (content) {
        parseCSVText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Submit bulk import to backend
  const handleCommitImport = async () => {
    if (parsedRows.length === 0) return;
    setSubmitting(true);
    try {
      if (importMode === 'INVENTORY') {
        const res = await fetch('/api/setup/bulk-import-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pieces: parsedRows })
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(`Successfully imported ${data.count} inventory pieces into the warehouse inventory room!`);
          onClose();
        } else {
          setParseErrors([data.error || 'Failed to import inventory']);
        }
      } else {
        const res = await fetch('/api/setup/bulk-import-sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: parsedRows })
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(`Successfully committed ${data.count} sales transactions & invoices!`);
          onClose();
        } else {
          setParseErrors([data.error || 'Failed to import sales entries']);
        }
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setParseErrors([err.message || 'Error occurred while saving bulk records']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-3.5 bg-gradient-to-r from-slate-900 to-[#0056b3] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider">Bulk Data Import Engine</h2>
              <p className="text-[10px] text-white/80">CSV drag-and-drop ingestion for inventory stock and sales batches</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector & Action Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-[11px] text-slate-500 uppercase">Select Target:</span>
            <button
              type="button"
              onClick={() => {
                setImportMode('INVENTORY');
                setParsedRows([]);
                setFileName(null);
              }}
              className={`px-3 py-1 rounded text-xs uppercase tracking-wider transition-colors ${
                importMode === 'INVENTORY'
                  ? 'bg-[#0056b3] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              1. Inventory Pieces
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode('SALES');
                setParsedRows([]);
                setFileName(null);
              }}
              className={`px-3 py-1 rounded text-xs uppercase tracking-wider transition-colors ${
                importMode === 'SALES'
                  ? 'bg-[#0056b3] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              2. Sales Records
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Download Sample CSV</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
          {/* Dropzone */}
          <div
            id="csv-drag-drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-[#0056b3] flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-800">
                  {fileName ? fileName : 'Drag and drop your CSV file here, or browse'}
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Supports comma-delimited UTF-8 CSV with column headers
                </p>
              </div>
              <button
                type="button"
                className="mt-1 px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 font-bold hover:bg-slate-100 text-[11px]"
              >
                Choose Local CSV File
              </button>
            </div>
          </div>

          {/* Errors display */}
          {parseErrors.length > 0 && (
            <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-800 text-[11px] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                <span>Import Validation Notice:</span>
              </div>
              <ul className="list-disc pl-5 text-[10px] text-red-700 space-y-0.5">
                {parseErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview of Parsed Rows */}
          {parsedRows.length > 0 && (
            <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
              <div className="p-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-800">
                  Data Preview ({parsedRows.length} rows ready to commit)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setParsedRows([]);
                    setFileName(null);
                  }}
                  className="text-red-600 hover:text-red-800 flex items-center gap-1 text-[10px] font-bold"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>

              <div className="max-h-52 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-2.5 py-1.5">#</th>
                      {Object.keys(parsedRows[0] || {}).map(key => (
                        <th key={key} className="px-2.5 py-1.5 whitespace-nowrap font-mono">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-2.5 py-1 font-mono text-slate-400">{idx + 1}</td>
                        {Object.keys(row).map(key => (
                          <td key={key} className="px-2.5 py-1 whitespace-nowrap font-mono text-slate-800">
                            {String(row[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 15 && (
                  <div className="p-1.5 text-center text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
                    Showing first 15 of {parsedRows.length} rows
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[10px] text-slate-500">
            {parsedRows.length > 0
              ? `${parsedRows.length} records parsed and verified.`
              : 'Please drag & drop or choose a CSV file to begin.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              id="btn-commit-bulk-import"
              type="button"
              disabled={parsedRows.length === 0 || submitting}
              onClick={handleCommitImport}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider text-white shadow-xs transition-colors ${
                parsedRows.length === 0 || submitting
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Commit Import ({parsedRows.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
