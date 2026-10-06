import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Download,
  Printer,
  Lock,
  Unlock,
  Calculator,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building,
  DollarSign,
  TrendingUp,
  Scale,
  RefreshCw,
  FileText,
  HelpCircle,
  Check,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { printVat201ReturnA4, Vat201ReturnPrintData } from '../utils/printVat201ReturnA4.ts';

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

const getQuarterPresets = (year: number) => [
  { id: `${year}-Q1`, label: `Q1 ${year}`, range: `Jan 01 - Mar 31, ${year}`, start: `${year}-01-01`, end: `${year}-03-31`, due: `${year}-04-28` },
  { id: `${year}-Q2`, label: `Q2 ${year}`, range: `Apr 01 - Jun 30, ${year}`, start: `${year}-04-01`, end: `${year}-06-30`, due: `${year}-07-28` },
  { id: `${year}-Q3`, label: `Q3 ${year}`, range: `Jul 01 - Sep 30, ${year}`, start: `${year}-07-01`, end: `${year}-09-30`, due: `${year}-10-28` },
  { id: `${year}-Q4`, label: `Q4 ${year}`, range: `Oct 01 - Dec 31, ${year}`, start: `${year}-10-01`, end: `${year}-12-31`, due: `${year + 1}-01-28` },
  { id: 'CUSTOM', label: 'Custom Window', range: 'User Range', start: '', end: '', due: '' }
];

export const TaxComplianceView: React.FC<TaxComplianceViewProps> = ({ onRefreshAll }) => {
  // Tax Year & Quarter state (Default 2026-Q3 where live purchase invoice PUR-09-2026-0005 exists)
  const [vatYear, setVatYear] = useState<number>(2026);
  const [selectedQuarter, setSelectedQuarter] = useState<string>('2026-Q3');
  const [startDate, setStartDate] = useState<string>('2026-07-01');
  const [endDate, setEndDate] = useState<string>('2026-09-30');

  const quarterPresets = getQuarterPresets(vatYear);

  // VAT 201 Return Data
  const [loadingVat, setLoadingVat] = useState<boolean>(false);
  const [vatData, setVatData] = useState<Vat201ReturnPrintData | null>(null);

  // Closing & Reopen dialog states
  const [closingModalOpen, setClosingModalOpen] = useState<boolean>(false);
  const [executingClose, setExecutingClose] = useState<boolean>(false);
  const [reopenModalOpen, setReopenModalOpen] = useState<boolean>(false);
  const [reopenPin, setReopenPin] = useState<string>('');
  const [executingReopen, setExecutingReopen] = useState<boolean>(false);

  // FTA FAF State
  const [loadingFaf, setLoadingFaf] = useState<boolean>(false);
  const [fafSummary, setFafSummary] = useState<FafSummary | null>(null);

  // Corporate Tax State
  const [taxYear, setTaxYear] = useState<number>(2026);
  const [loadingEstimate, setLoadingEstimate] = useState<boolean>(false);
  const [estimate, setEstimate] = useState<CorporateTaxEstimate | null>(null);
  const [postingProvision, setPostingProvision] = useState<boolean>(false);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch Live VAT 201 Return from Postgres
  const fetchVat201Return = async () => {
    try {
      setLoadingVat(true);
      const res = await fetch(`/api/finance/vat-return-201?quarter=${selectedQuarter}&startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setVatData(json.data);
        }
      }
    } catch (err: any) {
      console.error('Failed to load VAT 201 Return data:', err);
    } finally {
      setLoadingVat(false);
    }
  };

  // Fetch corporate tax estimate from Postgres
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

  // Preview FTA audit file stats from Postgres
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

  // Initial & Dependency Load
  useEffect(() => {
    fetchVat201Return();
    previewFaf();
  }, [selectedQuarter, startDate, endDate]);

  useEffect(() => {
    fetchEstimate();
  }, [taxYear]);

  // Handle Year Change
  const handleYearChange = (newYear: number) => {
    setVatYear(newYear);
    const qSuffix = selectedQuarter.includes('-Q') ? selectedQuarter.split('-Q')[1] : '3';
    const newQId = `${newYear}-Q${qSuffix}`;
    setSelectedQuarter(newQId);
    const presets = getQuarterPresets(newYear);
    const found = presets.find(q => q.id === newQId);
    if (found) {
      setStartDate(found.start);
      setEndDate(found.end);
    }
  };

  // Handle Quarter Selection Change
  const handleSelectQuarter = (qid: string) => {
    setSelectedQuarter(qid);
    const found = quarterPresets.find(q => q.id === qid);
    if (found && found.id !== 'CUSTOM') {
      setStartDate(found.start);
      setEndDate(found.end);
    }
  };

  // Execute Quarterly VAT Period Closing
  const handleExecuteClosing = async () => {
    try {
      setExecutingClose(true);
      const res = await fetch('/api/finance/vat-closing/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarter: selectedQuarter,
          startDate,
          endDate,
          closedBy: 'Tax Compliance Director',
          notes: `Official UAE FTA Form VAT 201 Quarterly Settlement Filed for ${selectedQuarter}`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          type: 'success',
          text: `Quarter ${selectedQuarter} closed successfully! Generated Settlement Voucher ${data.data?.voucherNo}.`
        });
        setClosingModalOpen(false);
        fetchVat201Return();
        onRefreshAll();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to close quarterly VAT period.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error executing VAT period closing.' });
    } finally {
      setExecutingClose(false);
    }
  };

  // Reopen Quarter (Requires Master PIN 0099)
  const handleReopenPeriod = async () => {
    if (reopenPin !== '0099') {
      setStatusMessage({ type: 'error', text: 'Invalid Master Security PIN. Override requires 0099.' });
      return;
    }
    try {
      setExecutingReopen(true);
      const res = await fetch('/api/finance/vat-closing/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarter: selectedQuarter,
          pin: reopenPin
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({
          type: 'success',
          text: `Period ${selectedQuarter} has been unlocked and re-opened for adjustments.`
        });
        setReopenModalOpen(false);
        setReopenPin('');
        fetchVat201Return();
        onRefreshAll();
      } else {
        setStatusMessage({ type: 'error', text: data.error || 'Failed to reopen period.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error reopening period.' });
    } finally {
      setExecutingReopen(false);
    }
  };

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
        link.setAttribute('download', data.fileName || `FTA_FAF_AUDIT_${startDate}_${endDate}.csv`);
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
          text: `Posted Journal Voucher ${data.voucher?.voucherNo} for AED ${data.voucher?.totalDebit?.toFixed(2)} into General Ledger!`
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
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="text-xs font-semibold">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs font-bold underline cursor-pointer ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: UAE FTA FORM VAT 201 QUARTERLY RETURN & PERIOD CLOSING HUB     */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs p-6 space-y-6">
        {/* Hub Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-900 flex items-center justify-center text-amber-300 font-black text-sm">
                FTA
              </div>
              <h2 className="text-lg font-black text-stone-900 tracking-tight">
                UAE FTA Form VAT 201: Quarterly Return & Period Closing
              </h2>
              {vatData?.period.isClosed ? (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-700" />
                  FILED & LOCKED ({vatData.period.closingVoucherNo})
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-900 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                  <Unlock className="w-3 h-3 text-amber-700" />
                  DRAFT / OPEN FOR FILING (Due: {vatData?.period.dueDate || '28th'})
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Federal Decree-Law No. (8) of 2017 on Value Added Tax. Official 3-month filing breakdown, General Ledger cross-check, and automated settlement closing.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              onClick={() => vatData && printVat201ReturnA4(vatData)}
              disabled={!vatData}
              className="flex-1 lg:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-amber-300 font-bold text-xs rounded-lg shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-50"
              title="Print official FTA Form VAT 201 standard A4 declaration"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print Official VAT 201 Return (A4)</span>
            </button>

            {vatData?.period.isClosed ? (
              <button
                onClick={() => setReopenModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs rounded-lg transition-all cursor-pointer"
                title="Master PIN 0099 required to unlock closed quarter"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Re-open Period (0099)</span>
              </button>
            ) : (
              <button
                onClick={() => setClosingModalOpen(true)}
                disabled={!vatData}
                className="flex-1 lg:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs rounded-lg shadow hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4 text-emerald-200" />
                <span>Execute Quarterly VAT Closing</span>
              </button>
            )}

            <button
              onClick={fetchVat201Return}
              className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loadingVat ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quarter Selection Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 mr-1 bg-white px-2 py-1 rounded-lg border border-stone-200">
              <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                Year:
              </span>
              <select
                value={vatYear}
                onChange={e => handleYearChange(Number(e.target.value))}
                className="bg-transparent font-bold text-xs text-stone-900 cursor-pointer focus:outline-none"
              >
                <option value={2023}>2023</option>
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
                <option value={2028}>2028</option>
                <option value={2029}>2029</option>
                <option value={2030}>2030</option>
              </select>
            </div>
            {quarterPresets.map((q) => (
              <button
                key={q.id}
                onClick={() => handleSelectQuarter(q.id)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  selectedQuarter === q.id
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-stone-700 hover:bg-stone-200 border border-stone-200'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-stone-500 text-[11px]">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setSelectedQuarter('CUSTOM');
              }}
              className="bg-white border border-stone-300 rounded px-2 py-1 text-xs font-mono"
            />
            <label className="text-stone-500 text-[11px]">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setSelectedQuarter('CUSTOM');
              }}
              className="bg-white border border-stone-300 rounded px-2 py-1 text-xs font-mono"
            />
          </div>
        </div>

        {/* 4 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-800 flex justify-between">
              <span>Box 8: Output VAT (5%)</span>
              <span className="text-amber-600 font-mono">Sales</span>
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              AED {(vatData?.boxes.box1_outputVat || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-stone-500 mt-1">
              Supplies: AED {(vatData?.boxes.box1_standardRatedSupplies || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800 flex justify-between">
              <span>Box 11: Recoverable Input VAT</span>
              <span className="text-emerald-600 font-mono">Purchases</span>
            </div>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              AED {(vatData?.boxes.box9_recoverableInputVat || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-700 mt-1">
              Purchases: AED {(vatData?.boxes.box9_standardRatedPurchases || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className={`p-4 rounded-xl border ${
            vatData?.boxes.isRefundable
              ? 'bg-blue-50/70 border-blue-200'
              : 'bg-stone-50 border-stone-300'
          }`}>
            <div className={`text-[10.5px] font-bold uppercase tracking-wider ${
              vatData?.boxes.isRefundable ? 'text-blue-800' : 'text-stone-700'
            }`}>
              Box 14: Net VAT Due / (Refundable)
            </div>
            <div className={`text-2xl font-black mt-1 ${
              vatData?.boxes.isRefundable ? 'text-blue-900' : 'text-stone-900'
            }`}>
              AED {Math.abs(vatData?.boxes.box16_netVatPayableOrRefundable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className={`text-[11px] font-semibold mt-1 ${
              vatData?.boxes.isRefundable ? 'text-blue-700' : 'text-stone-600'
            }`}>
              {vatData?.boxes.isRefundable ? 'Refund Due from Federal Tax Authority' : 'Payable to Federal Tax Authority'}
            </div>
          </div>

          <div className={`p-4 rounded-xl border ${
            vatData?.reconciliation.isReconciled
              ? 'bg-emerald-50/50 border-emerald-200'
              : 'bg-rose-50/50 border-rose-200'
          }`}>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-stone-700 flex justify-between">
              <span>General Ledger Match</span>
              {vatData?.reconciliation.isReconciled ? (
                <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                  <Check className="w-3 h-3" /> Reconciled
                </span>
              ) : (
                <span className="text-rose-700 font-bold flex items-center gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Check Variance
                </span>
              )}
            </div>
            <div className="text-xs font-mono mt-2 space-y-1">
              <div className="flex justify-between text-stone-600">
                <span>Output (2140-01):</span>
                <span className="font-bold">AED {(vatData?.reconciliation.glOutputBalance || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Input (2140-02):</span>
                <span className="font-bold">AED {(vatData?.reconciliation.glInputBalance || 0).toFixed(2)}</span>
              </div>
            </div>
            <div className="text-[10px] text-stone-500 mt-1">
              Variance: AED {(Math.abs(vatData?.reconciliation.outputVariance || 0) + Math.abs(vatData?.reconciliation.inputVariance || 0)).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Official FTA VAT 201 Form Grid (Boxes 1 to 16) */}
        <div className="border border-stone-300 rounded-xl overflow-hidden shadow-2xs">
          <div className="bg-stone-800 text-stone-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="bg-amber-400 text-stone-950 font-black text-xs px-2 py-0.5 rounded">
                FORM VAT 201
              </span>
              <span className="font-bold text-xs uppercase tracking-wide">
                Federal Tax Authority Return Declaration
              </span>
            </div>
            <span className="text-[11px] text-stone-400 font-mono">
              TRN: {vatData?.company.trn || '100482910300003'} | Currency: AED
            </span>
          </div>

          <div className="divide-y divide-stone-200 text-xs">
            {/* SECTION 1: SUPPLIES / OUTPUT VAT */}
            <div className="bg-amber-50/40 px-4 py-2 font-bold text-amber-950 uppercase tracking-wide flex justify-between items-center">
              <span>Section 1: VAT on Supplies (المخرجات - ضريبة المبيعات)</span>
              <span className="text-[11px] font-normal text-amber-800">Standard Rate: 5%</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-700 text-[11px] font-bold border-b border-stone-200">
                    <th className="py-2 px-3 w-16">Box #</th>
                    <th className="py-2 px-3">Description (الوصف)</th>
                    <th className="py-2 px-3 text-right">Taxable Amount (AED)</th>
                    <th className="py-2 px-3 text-right">VAT Amount (AED)</th>
                    <th className="py-2 px-3 text-right">Adjustments (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono">
                  {/* Emirate breakdown */}
                  {vatData?.boxes.box1_emirates?.map((em, idx) => (
                    <tr key={em.code} className="hover:bg-amber-50/20 text-stone-800">
                      <td className="py-2 px-3 font-bold text-amber-900">1{String.fromCharCode(97 + idx)}</td>
                      <td className="py-2 px-3 font-sans">
                        Standard rated supplies in {em.emirate} ({em.code})
                      </td>
                      <td className="py-2 px-3 text-right">{em.netAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-bold text-amber-950">{em.vatAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-stone-400">0.00</td>
                    </tr>
                  ))}
                  <tr className="hover:bg-stone-50 text-stone-700">
                    <td className="py-2 px-3 font-bold">2</td>
                    <td className="py-2 px-3 font-sans">Tax Refunds provided to Tourists Scheme</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right text-stone-400">0.00</td>
                  </tr>
                  <tr className="hover:bg-stone-50 text-stone-700">
                    <td className="py-2 px-3 font-bold">3</td>
                    <td className="py-2 px-3 font-sans">Supplies subject to reverse charge provisions</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right text-stone-400">0.00</td>
                  </tr>
                  <tr className="hover:bg-stone-50 text-stone-700">
                    <td className="py-2 px-3 font-bold">4</td>
                    <td className="py-2 px-3 font-sans">Zero rated supplies (Exports & International)</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className="py-2 px-3 text-right text-stone-400">-</td>
                  </tr>
                  <tr className="hover:bg-stone-50 text-stone-700">
                    <td className="py-2 px-3 font-bold">5</td>
                    <td className="py-2 px-3 font-sans">Exempt supplies</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right">-</td>
                    <td className="py-2 px-3 text-right text-stone-400">-</td>
                  </tr>
                  {/* Total Box 8 */}
                  <tr className="bg-amber-100/70 font-bold text-amber-950 border-t-2 border-amber-300">
                    <td className="py-2 px-3">8</td>
                    <td className="py-2 px-3 font-sans uppercase">Total Output Tax Due (إجمالي ضريبة المخرجات)</td>
                    <td className="py-2 px-3 text-right font-black">
                      {(vatData?.boxes.box1_standardRatedSupplies || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-amber-950">
                      {(vatData?.boxes.box1_outputVat || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right">0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTION 2: EXPENSES / INPUT VAT RECOVERABLE */}
            <div className="bg-emerald-50/40 px-4 py-2 font-bold text-emerald-950 uppercase tracking-wide flex justify-between items-center">
              <span>Section 2: VAT on Expenses and All Other Inputs (المدخلات - ضريبة المشتريات المستردة)</span>
              <span className="text-[11px] font-normal text-emerald-800">Standard Recoverable: 5%</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-700 text-[11px] font-bold border-b border-stone-200">
                    <th className="py-2 px-3 w-16">Box #</th>
                    <th className="py-2 px-3">Description (الوصف)</th>
                    <th className="py-2 px-3 text-right">Taxable Amount (AED)</th>
                    <th className="py-2 px-3 text-right">Recoverable VAT (AED)</th>
                    <th className="py-2 px-3 text-right">Adjustments (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono">
                  <tr className="hover:bg-emerald-50/20 text-stone-800">
                    <td className="py-2 px-3 font-bold text-emerald-900">9</td>
                    <td className="py-2 px-3 font-sans">
                      Standard rated expenses & imports (Inward bales, shipping & containers)
                    </td>
                    <td className="py-2 px-3 text-right">
                      {(vatData?.boxes.box9_standardRatedPurchases || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-950">
                      {(vatData?.boxes.box9_recoverableInputVat || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right text-stone-400">0.00</td>
                  </tr>
                  <tr className="hover:bg-stone-50 text-stone-700">
                    <td className="py-2 px-3 font-bold">10</td>
                    <td className="py-2 px-3 font-sans">Supplies subject to the reverse charge provisions</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right">0.00</td>
                    <td className="py-2 px-3 text-right text-stone-400">0.00</td>
                  </tr>
                  {/* Total Box 11 */}
                  <tr className="bg-emerald-100/70 font-bold text-emerald-950 border-t-2 border-emerald-300">
                    <td className="py-2 px-3">11</td>
                    <td className="py-2 px-3 font-sans uppercase">Total Recoverable Tax (إجمالي الضريبة القابلة للاسترداد)</td>
                    <td className="py-2 px-3 text-right font-black">
                      {(vatData?.boxes.box9_standardRatedPurchases || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-emerald-950">
                      {(vatData?.boxes.box9_recoverableInputVat || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right">0.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTION 3: NET VAT DUE & DECLARATION */}
            <div className="bg-stone-100 px-4 py-2 font-bold text-stone-900 uppercase tracking-wide">
              Section 3: Net VAT Due and Other Reporting Obligations (صافي الضريبة المستحقة)
            </div>

            <div className="p-4 bg-stone-50/50 space-y-3 font-sans">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <div className="text-[11px] text-stone-500">Box 12: Total Output VAT Due:</div>
                  <div className="font-mono font-bold text-base text-stone-900 mt-1">
                    AED {(vatData?.boxes.box12_totalDueTax || 0).toFixed(2)}
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-stone-200">
                  <div className="text-[11px] text-stone-500">Box 13: Total Recoverable Input VAT:</div>
                  <div className="font-mono font-bold text-base text-emerald-800 mt-1">
                    AED {(vatData?.boxes.box13_totalRecoverableTax || 0).toFixed(2)}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border ${
                  vatData?.boxes.isRefundable
                    ? 'bg-blue-100/80 border-blue-300 text-blue-950'
                    : 'bg-amber-100/80 border-amber-300 text-amber-950'
                }`}>
                  <div className="text-[11px] font-bold">
                    Box 14: Net VAT {vatData?.boxes.isRefundable ? 'Refundable' : 'Payable'}:
                  </div>
                  <div className="font-mono font-black text-lg mt-1">
                    AED {Math.abs(vatData?.boxes.box16_netVatPayableOrRefundable || 0).toFixed(2)}
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-80">
                    {vatData?.boxes.isRefundable ? 'Excess recoverable tax credit' : 'Direct statutory liability to FTA'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-2 border-t border-stone-200 text-xs text-stone-600">
                <div>
                  <span className="font-bold text-stone-800">Box 15:</span> Do you produce, import or release excise goods? <span className="font-mono font-bold text-stone-900 ml-1">NO</span>
                </div>
                <div>
                  <span className="font-bold text-stone-800">Box 16:</span> Request refund of excess recoverable VAT? <span className="font-mono font-bold text-emerald-800 ml-1">{vatData?.boxes.isRefundable ? 'YES' : 'NO'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: UAE FTA AUDIT FILE (FAF v1.0) EXPORTER                         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-base text-stone-900">
                UAE Federal Tax Authority (FTA) Audit File (FAF v1.0)
              </h3>
              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                Official E-Audit CSV
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Live audit data extraction covering Tax Registration (TRN), General Ledger, Sales Supplies (Output VAT 5%), and Purchases (Input VAT Recoverable).
            </p>
          </div>

          <button
            onClick={downloadFafFile}
            disabled={loadingFaf}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-stone-950 font-bold text-xs rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{loadingFaf ? 'Generating...' : 'Download Live FTA FAF (.CSV)'}</span>
          </button>
        </div>

        {/* Live Tax Summary Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Output VAT (Sales 5%)
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
              Recoverable Input VAT (Purchases 5%)
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
              Net VAT Payable / (Refundable)
            </div>
            <div className="text-2xl font-black text-stone-900 mt-1">
              AED {(fafSummary?.netVatPayable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-stone-500 mt-1">
              {fafSummary?.glLinesCount || 0} live GL audit lines extracted
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: UAE CORPORATE TAX (9%) STATUTORY ACCRUAL ENGINE               */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs p-6 space-y-5">
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
              <span className="text-stone-600">Total Commercial Revenue (COA 4000 series):</span>
              <span className="font-mono font-bold text-stone-900">
                AED {(estimate?.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-stone-200">
              <span className="text-stone-600">Less: Allowable Business Expenses (COA 5000 series):</span>
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

      {/* ========================================================================= */}
      {/* MODAL: EXECUTE QUARTERLY VAT SETTLEMENT CLOSING                           */}
      {/* ========================================================================= */}
      {closingModalOpen && vatData && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-300 space-y-4">
            <div className="flex items-center space-x-2 text-stone-900">
              <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <h3 className="font-black text-base">
                Confirm VAT Period Closing: {selectedQuarter}
              </h3>
            </div>

            <div className="text-xs text-stone-600 space-y-2">
              <p>
                Executing this closing will formally settle and lock the tax period{' '}
                <strong>{vatData.period.startDate} to {vatData.period.endDate}</strong> in accordance with UAE FTA Executive Regulations.
              </p>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 font-mono space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-stone-500">Box 8 Output Tax:</span>
                  <span className="font-bold">AED {vatData.boxes.box1_outputVat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Box 11 Recoverable Input Tax:</span>
                  <span className="font-bold text-emerald-700">AED {vatData.boxes.box9_recoverableInputVat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-stone-300 pt-1 font-bold text-amber-950">
                  <span>Box 14 Net {vatData.boxes.isRefundable ? 'Refund Due' : 'Payable'}:</span>
                  <span>AED {Math.abs(vatData.boxes.box16_netVatPayableOrRefundable).toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200 text-amber-900 text-[11px]">
                <strong>Automated Double-Entry Balanced Voucher:</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  {vatData.boxes.box1_outputVat > 0 && (
                    <li>Dr 2140-01 (Output VAT 5%): AED {vatData.boxes.box1_outputVat.toFixed(2)} (Clears sales tax)</li>
                  )}
                  {vatData.boxes.box9_recoverableInputVat > 0 && (
                    <li>Cr 2140-02 (Input VAT 5%): AED {vatData.boxes.box9_recoverableInputVat.toFixed(2)} (Clears purchases tax)</li>
                  )}
                  {vatData.boxes.isRefundable ? (
                    <li>Dr 1320-01 (FTA Net Refund Receivable): AED {Math.abs(vatData.boxes.box16_netVatPayableOrRefundable).toFixed(2)}</li>
                  ) : (
                    <li>Cr 2140-99 (FTA Net VAT Settlement Payable): AED {vatData.boxes.box16_netVatPayableOrRefundable.toFixed(2)}</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-200">
              <button
                onClick={() => setClosingModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteClosing}
                disabled={executingClose}
                className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow hover:shadow-md cursor-pointer flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{executingClose ? 'Executing Settlement...' : 'Confirm & Lock Quarter'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RE-OPEN QUARTER (MASTER PIN 0099 REQUIRED)                         */}
      {/* ========================================================================= */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-rose-300 space-y-4">
            <div className="flex items-center space-x-2 text-rose-900">
              <Unlock className="w-5 h-5 text-rose-600" />
              <h3 className="font-black text-base">Re-open Closed Tax Period</h3>
            </div>

            <p className="text-xs text-stone-600">
              Re-opening period <strong>{selectedQuarter}</strong> will reverse the settlement voucher and allow modifications. This action is audited and strictly requires Master Security PIN:
            </p>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Enter Master PIN Override:</label>
              <input
                type="password"
                maxLength={4}
                value={reopenPin}
                onChange={e => setReopenPin(e.target.value)}
                placeholder="0099"
                className="w-full text-center text-xl tracking-widest font-mono font-bold bg-stone-50 border border-stone-300 rounded-lg p-2 text-stone-900 focus:outline-rose-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-200">
              <button
                onClick={() => {
                  setReopenModalOpen(false);
                  setReopenPin('');
                }}
                className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReopenPeriod}
                disabled={executingReopen || reopenPin.length !== 4}
                className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs shadow hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {executingReopen ? 'Unlocking...' : 'Authorize Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
