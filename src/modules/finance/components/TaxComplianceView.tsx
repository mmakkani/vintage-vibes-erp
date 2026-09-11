import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Calculator,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building,
  DollarSign,
  TrendingUp,
  Scale,
  RefreshCw,
  FileText
} from 'lucide-react';

interface TaxComplianceViewProps {
  onRefreshAll: () => void;
}

interface FafSummary {
  totalOutputVat: number;
  totalInputVat: number;
  netVatPayable: number;
  salesCount: number;
  purchaseCount: number;
  glLinesCount: number;
}

interface CorporateTaxEstimate {
  taxYear: number;
  totalRevenue: number;
  totalExpenses: number;
  accountingNetProfit: number;
  statutoryExemptionThreshold: number;
  qualifyingTaxableProfit: number;
  taxRatePercent: number;
  estimatedCorporateTaxAed: number;
  existingProvisionBalance: number;
  additionalProvisionRequired: number;
  applicableTaxBracket: string;
}

export const TaxComplianceView: React.FC<TaxComplianceViewProps> = ({ onRefreshAll }) => {
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [taxYear, setTaxYear] = useState<number>(2026);

  const [loadingFaf, setLoadingFaf] = useState<boolean>(false);
  const [fafSummary, setFafSummary] = useState<FafSummary | null>(null);

  const [loadingEstimate, setLoadingEstimate] = useState<boolean>(false);
  const [estimate, setEstimate] = useState<CorporateTaxEstimate | null>(null);
  const [postingProvision, setPostingProvision] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch corporate tax estimate
  const fetchEstimate = async () => {
    try {
      setLoadingEstimate(true);
      const res = await fetch(`/api/finance/corporate-tax/estimate?taxYear=${taxYear}`);
      if (res.ok) {
        const data = await res.json();
        setEstimate(data);
      }
    } catch (err) {
      console.error('Failed to load corporate tax estimate:', err);
    } finally {
      setLoadingEstimate(false);
    }
  };

  // Preview FTA audit file stats
  const previewFaf = async () => {
    try {
      setLoadingFaf(true);
      const res = await fetch(`/api/finance/fta-faf?startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const data = await res.json();
        setFafSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to preview FAF:', err);
    } finally {
      setLoadingFaf(false);
    }
  };

  useEffect(() => {
    fetchEstimate();
    previewFaf();
  }, [taxYear, startDate, endDate]);

  // Download official FTA FAF CSV file
  const downloadFafFile = async () => {
    try {
      setLoadingFaf(true);
      const res = await fetch(`/api/finance/fta-faf?startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', data.fileName || 'FTA_FAF_AUDIT_FILE.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusMessage({ type: 'success', text: `Downloaded official ${data.fileName} successfully.` });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to download FAF file.' });
    } finally {
      setLoadingFaf(false);
    }
  };

  // Post corporate tax provision journal voucher
  const handlePostProvision = async () => {
    if (!estimate || estimate.additionalProvisionRequired <= 0) return;
    try {
      setPostingProvision(true);
      const res = await fetch('/api/finance/corporate-tax/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxYear,
          postedBy: 'Tax Compliance Controller'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          type: 'success',
          text: `Posted Journal Voucher ${data.voucher?.voucherNo} for AED ${data.voucher?.totalDebit?.toFixed(2)} successfully into General Ledger!`
        });
        fetchEstimate();
        onRefreshAll();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to post tax provision.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error executing tax provision.' });
    } finally {
      setPostingProvision(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert banner if message exists */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600" />
            )}
            <span className="text-xs font-semibold">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: UAE FTA AUDIT FILE (FAF v1.0) EXPORTER */}
      <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-base text-stone-900">
                UAE Federal Tax Authority (FTA) Audit File (FAF v1.0)
              </h3>
              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                Official FTA Format
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Standardized e-Audit data extraction covering Tax Registration (TRN), General Ledger, Sales (Output VAT 5%), and Purchases (Input VAT Recoverable).
            </p>
          </div>

          <button
            onClick={downloadFafFile}
            disabled={loadingFaf}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-stone-950 font-bold text-xs rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{loadingFaf ? 'Generating...' : 'Download Official FTA FAF (.CSV)'}</span>
          </button>
        </div>

        {/* Date range filters */}
        <div className="flex flex-wrap items-center gap-4 bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-stone-500" />
            <span className="font-semibold text-stone-700">Audit Period:</span>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-stone-500">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs font-mono"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-stone-500">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-white border border-stone-300 rounded px-2.5 py-1 text-xs font-mono"
            />
          </div>
          <button
            onClick={previewFaf}
            className="px-3 py-1 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded font-semibold text-xs transition-colors"
          >
            Refresh Scope
          </button>
        </div>

        {/* Live Tax Summary Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Box 1b: Output VAT (Sales 5%)
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              AED {(fafSummary?.totalOutputVat || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-stone-500 mt-1">
              Across {fafSummary?.salesCount || 0} commercial sales invoices
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Box 9b: Recoverable Input VAT
            </div>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              AED {(fafSummary?.totalInputVat || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-700 mt-1">
              Across {fafSummary?.purchaseCount || 0} container & bale inward records
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 border border-stone-300">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
              Box 14: Net VAT Payable to FTA
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              AED {(fafSummary?.netVatPayable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-stone-500 mt-1">
              {fafSummary?.glLinesCount || 0} GL audit lines linked
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: UAE CORPORATE TAX (9%) STATUTORY ACCRUAL ENGINE */}
      <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <Calculator className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-base text-stone-900">
                UAE Corporate Tax (9%) Statutory Provision & Accrual
              </h3>
              <span className="bg-stone-100 text-stone-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-stone-300">
                Federal Decree-Law No. 47
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Automated corporate tax assessment applying the 0% bracket up to AED 375,000 threshold and 9% on qualifying taxable profit.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-stone-600">Tax Year:</span>
            <select
              value={taxYear}
              onChange={e => setTaxYear(Number(e.target.value))}
              className="bg-stone-50 border border-stone-300 rounded px-3 py-1.5 text-xs font-bold text-stone-800"
            >
              <option value={2026}>Tax Year 2026</option>
              <option value={2025}>Tax Year 2025</option>
              <option value={2024}>Tax Year 2024</option>
            </select>
            <button
              onClick={fetchEstimate}
              className="p-1.5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
              title="Recalculate Estimate"
            >
              <RefreshCw className={`w-4 h-4 ${loadingEstimate ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Calculation Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: P&L Walkthrough */}
          <div className="border border-stone-200 rounded-xl p-4 bg-stone-50/60 space-y-3 text-xs">
            <h4 className="font-bold text-stone-800 uppercase tracking-wide text-[11px]">
              Taxable Profit Walkthrough (AED)
            </h4>

            <div className="flex justify-between py-1.5 border-b border-stone-200">
              <span className="text-stone-600">Total Commercial Revenue:</span>
              <span className="font-mono font-bold text-stone-900">
                AED {(estimate?.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-stone-200">
              <span className="text-stone-600">Less: Allowable Business Expenses:</span>
              <span className="font-mono font-bold text-rose-700">
                - AED {(estimate?.totalExpenses || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-stone-200 font-semibold">
              <span className="text-stone-800">Accounting Net Profit (P&L):</span>
              <span className="font-mono font-bold text-stone-950">
                AED {(estimate?.accountingNetProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-stone-200 text-emerald-800">
              <span>Less: Statutory Relief Exemption Threshold:</span>
              <span className="font-mono font-bold">
                - AED {(estimate?.statutoryExemptionThreshold || 375000).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-2 bg-amber-100/60 px-2 rounded font-bold text-amber-950">
              <span>Qualifying Taxable Net Income:</span>
              <span className="font-mono">
                AED {(estimate?.qualifyingTaxableProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Right Column: Liability & Accrual Action */}
          <div className="border border-stone-200 rounded-xl p-4 bg-stone-50/60 space-y-4 text-xs flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-stone-800 uppercase tracking-wide text-[11px] mb-3">
                Corporate Tax Liability & Provision Status
              </h4>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-stone-600">Applicable Tax Bracket:</span>
                  <span className="font-bold text-stone-900">{estimate?.applicableTaxBracket}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Statutory Tax Rate:</span>
                  <span className="font-mono font-bold text-stone-900">{estimate?.taxRatePercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Total Estimated Tax Liability:</span>
                  <span className="font-mono font-bold text-stone-950">
                    AED {(estimate?.estimatedCorporateTaxAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Current Ledger Balance (2410-00):</span>
                  <span className="font-mono font-bold text-stone-700">
                    AED {(estimate?.existingProvisionBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t border-stone-300 font-black text-sm text-amber-900">
                  <span>Additional Provision Required:</span>
                  <span className="font-mono">
                    AED {(estimate?.additionalProvisionRequired || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Posting Action */}
            <div className="pt-2">
              <button
                onClick={handlePostProvision}
                disabled={postingProvision || !estimate || estimate.additionalProvisionRequired <= 0}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold text-xs shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <FileText className="w-4 h-4 text-amber-400" />
                <span>
                  {postingProvision
                    ? 'Posting Journal Voucher...'
                    : estimate && estimate.additionalProvisionRequired > 0
                    ? `Post Corporate Tax Provision (AED ${estimate.additionalProvisionRequired.toFixed(2)})`
                    : 'Tax Provision Already Fully Funded'}
                </span>
              </button>
              <div className="text-[10px] text-stone-500 text-center mt-1.5 font-mono">
                Posts Double-Entry JV: Dr 5510-00 Tax Expense | Cr 2410-00 Provision Payable
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
