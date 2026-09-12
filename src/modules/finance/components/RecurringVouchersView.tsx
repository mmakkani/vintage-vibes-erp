import React, { useState, useEffect } from 'react';
import { COAAccount, RecurringVoucherTemplate, Voucher } from '../finance.types.ts';
import {
  Repeat,
  Plus,
  Play,
  Trash2,
  Edit2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  FileText,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building
} from 'lucide-react';

interface RecurringVouchersViewProps {
  accounts: COAAccount[];
  onRefreshFinance: () => void;
  onNavigateToVouchers?: () => void;
}

export const RecurringVouchersView: React.FC<RecurringVouchersViewProps> = ({
  accounts,
  onRefreshFinance,
  onNavigateToVouchers
}) => {
  const [templates, setTemplates] = useState<RecurringVoucherTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RecurringVoucherTemplate | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'BPV' | 'CPV' | 'JV'>('BPV');
  const [formFrequency, setFormFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'WEEKLY' | 'BI_WEEKLY'>('MONTHLY');
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formNarration, setFormNarration] = useState('');
  const [formLines, setFormLines] = useState<
    { id: string; accountId: string; accountCode: string; accountName: string; debitAmount: number; creditAmount: number; memo: string }[]
  >([]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/recurring-vouchers');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load recurring vouchers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setFormTitle('Monthly DEWA Warehouse Utilities');
    setFormType('BPV');
    setFormFrequency('MONTHLY');
    setFormDayOfMonth(5);
    setFormNarration('Monthly DEWA electricity and water utility payment for Plot 42 Warehouse');
    
    // Default 2-line template
    const expAcc = accounts.find(a => a.classification === 'EXPENSE') || accounts[0];
    const bankAcc = accounts.find(a => a.code.startsWith('1120')) || accounts[1];

    setFormLines([
      {
        id: '1',
        accountId: expAcc?.id || '',
        accountCode: expAcc?.code || '',
        accountName: expAcc?.name || '',
        debitAmount: 3200,
        creditAmount: 0,
        memo: 'DEWA utility bill charges'
      },
      {
        id: '2',
        accountId: bankAcc?.id || '',
        accountCode: bankAcc?.code || '',
        accountName: bankAcc?.name || '',
        debitAmount: 0,
        creditAmount: 3200,
        memo: 'Corporate bank settlement'
      }
    ]);
    setShowModal(true);
  };

  const handleOpenEdit = (t: RecurringVoucherTemplate) => {
    setEditingTemplate(t);
    setFormTitle(t.title);
    setFormType(t.voucherType as any);
    setFormFrequency(t.frequency);
    setFormDayOfMonth(t.dayOfMonth);
    setFormNarration(t.narration);
    setFormLines(JSON.parse(JSON.stringify(t.lines)));
    setShowModal(true);
  };

  const handleAddLine = () => {
    const acc = accounts[0];
    setFormLines([
      ...formLines,
      {
        id: String(Date.now()),
        accountId: acc?.id || '',
        accountCode: acc?.code || '',
        accountName: acc?.name || '',
        debitAmount: 0,
        creditAmount: 0,
        memo: ''
      }
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (formLines.length <= 2) {
      setFeedback({ type: 'error', text: 'Recurring vouchers require at least 2 balanced lines' });
      return;
    }
    setFormLines(formLines.filter((_, i) => i !== idx));
  };

  const handleUpdateLine = (idx: number, field: string, value: any) => {
    const copy = [...formLines];
    if (field === 'accountId') {
      const acc = accounts.find(a => a.id === value);
      if (acc) {
        copy[idx].accountId = acc.id;
        copy[idx].accountCode = acc.code;
        copy[idx].accountName = acc.name;
      }
    } else {
      (copy[idx] as any)[field] = value;
    }
    setFormLines(copy);
  };

  const totalDebits = formLines.reduce((sum, l) => sum + (Number(l.debitAmount) || 0), 0);
  const totalCredits = formLines.reduce((sum, l) => sum + (Number(l.creditAmount) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFeedback({ type: 'error', text: 'Template title is required' });
      return;
    }
    if (!isBalanced) {
      setFeedback({ type: 'error', text: `Unbalanced entry: Total debits (AED ${totalDebits}) must equal total credits (AED ${totalCredits})` });
      return;
    }

    try {
      const res = await fetch('/api/finance/recurring-vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTemplate ? editingTemplate.id : undefined,
          title: formTitle.trim(),
          voucherType: formType,
          frequency: formFrequency,
          dayOfMonth: Number(formDayOfMonth) || 1,
          narration: formNarration.trim(),
          currency: 'AED',
          exchangeRate: 1.0,
          lines: formLines
        })
      });

      if (res.ok) {
        setFeedback({ type: 'success', text: `Recurring template "${formTitle}" saved!` });
        setShowModal(false);
        fetchTemplates();
        onRefreshFinance();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: err.error || 'Failed to save template' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error saving template' });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this recurring voucher template?')) return;
    try {
      const res = await fetch(`/api/finance/recurring-vouchers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Template deleted' });
        fetchTemplates();
        onRefreshFinance();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to delete template' });
    }
  };

  const handleRunTemplate = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/finance/recurring-vouchers/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runDate: new Date().toISOString().split('T')[0] })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: `Generated & posted Voucher ${data.voucher?.voucherNo} for "${title}"!`
        });
        fetchTemplates();
        onRefreshFinance();
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to run recurring voucher' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network error triggering voucher' });
    }
  };

  const handleRunAllDue = async () => {
    try {
      const res = await fetch('/api/finance/recurring-vouchers/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runDate: new Date().toISOString().split('T')[0] })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: `Executed ${data.executedCount} due recurring vouchers and posted to General Ledger!`
        });
        fetchTemplates();
        onRefreshFinance();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to run due vouchers' });
    }
  };

  const totalMonthlyCommitments = templates.reduce((sum, t) => sum + t.totalAmount, 0);

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-amber-200/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Automated Recurring Vouchers
            </h2>
            <p className="text-xs text-slate-500">
              Automate routine repetitive entries for warehouse leases, sorter payroll, and utilities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRunAllDue}
            className="btn-3d btn-3d-slate flex items-center gap-1.5 text-xs py-1.5 px-3 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>Auto-Run All Due This Month</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn-3d btn-3d-amber flex items-center gap-1.5 text-xs py-1.5 px-3.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Recurring Template</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-rose-50 text-rose-800 border border-rose-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Templates</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{templates.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Automated accounting routines</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Monthly Committed Posting</div>
          <div className="text-xl font-extrabold text-amber-700 mt-1">
            AED {Number(totalMonthlyCommitments || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Recurring dual-entry volume</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Automation Engine</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5" />
            <span>Ready & Active</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Direct GL dual-entry ledger posting</div>
        </div>
      </div>

      {/* Templates List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(t => (
          <div
            key={t.id}
            className="bg-white rounded-xl border border-slate-200 hover:border-amber-300 shadow-xs p-4 space-y-3 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-100 text-amber-900 border border-amber-200">
                    {t.voucherType}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                    Day {t.dayOfMonth} / {t.frequency}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-1.5">{t.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{t.narration}</p>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-slate-500 uppercase">Amount</div>
                <div className="text-base font-extrabold text-slate-900 font-mono">
                  AED {Number(t.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Line items mini breakdown */}
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1 text-xs">
              {t.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="truncate max-w-[200px]">
                    <span className="font-mono text-amber-700 mr-1">[{l.accountCode}]</span>
                    <span className="text-slate-700 font-medium">{l.accountName}</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {l.debitAmount > 0 ? `DR: ${l.debitAmount}` : `CR: ${l.creditAmount}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Timing & Action Row */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Next due: <strong className="text-slate-800">{t.nextDueDate || 'Monthly'}</strong></span>
                {t.lastRunDate && (
                  <span className="text-slate-400">(Last: {t.lastRunDate})</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRunTemplate(t.id, t.title)}
                  className="btn-3d btn-3d-amber flex items-center gap-1 text-[11px] py-1 px-2.5 cursor-pointer font-bold"
                  title="Generate and post this voucher to GL now"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>Run Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(t)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  title="Edit Template"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(t.id)}
                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="Delete Template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-amber-200 max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-amber-50/80 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingTemplate ? 'Edit Recurring Voucher Template' : 'Create Recurring Voucher Template'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Template Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="e.g. Al Jimi Warehouse Facility Lease Rent"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-amber-500 font-bold text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Type
                    </label>
                    <select
                      value={formType}
                      onChange={e => setFormType(e.target.value as any)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-bold"
                    >
                      <option value="BPV">BPV (Bank Payment)</option>
                      <option value="CPV">CPV (Cash Payment)</option>
                      <option value="JV">JV (Journal Voucher)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Day of Month
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={formDayOfMonth}
                      onChange={e => setFormDayOfMonth(Number(e.target.value))}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Default Voucher Narration
                </label>
                <textarea
                  rows={2}
                  value={formNarration}
                  onChange={e => setFormNarration(e.target.value)}
                  placeholder="e.g. Monthly automated rental remittance for warehouse facility..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-amber-500 text-slate-800"
                />
              </div>

              {/* Dual-entry line items */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Double-Entry Lines ({formLines.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs text-amber-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Entry Line</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formLines.map((line, idx) => (
                    <div key={line.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-6">
                          <select
                            value={line.accountId}
                            onChange={e => handleUpdateLine(idx, 'accountId', e.target.value)}
                            className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white font-semibold text-slate-800"
                          >
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>
                                [{a.code}] {a.name} ({a.classification})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="number"
                            min={0}
                            step="10"
                            placeholder="Debit"
                            value={line.debitAmount || ''}
                            onChange={e => {
                              handleUpdateLine(idx, 'debitAmount', Number(e.target.value));
                              if (Number(e.target.value) > 0) handleUpdateLine(idx, 'creditAmount', 0);
                            }}
                            className="w-full text-xs p-1.5 rounded border border-slate-300 font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="number"
                            min={0}
                            step="10"
                            placeholder="Credit"
                            value={line.creditAmount || ''}
                            onChange={e => {
                              handleUpdateLine(idx, 'creditAmount', Number(e.target.value));
                              if (Number(e.target.value) > 0) handleUpdateLine(idx, 'debitAmount', 0);
                            }}
                            className="w-full text-xs p-1.5 rounded border border-slate-300 font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Line description / memo..."
                        value={line.memo}
                        onChange={e => handleUpdateLine(idx, 'memo', e.target.value)}
                        className="w-full text-xs p-1 rounded border border-slate-200 text-slate-700 bg-white"
                      />
                    </div>
                  ))}
                </div>

                {/* Balance validation bar */}
                <div className={`p-2.5 rounded-lg text-xs font-bold flex items-center justify-between ${
                  isBalanced ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {isBalanced ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                    <span>Total Debits: AED {Number(totalDebits || 0).toLocaleString()} | Total Credits: AED {Number(totalCredits || 0).toLocaleString()}</span>
                  </div>
                  <span>{isBalanced ? 'BALANCED' : `DIFF: AED ${Math.abs(totalDebits - totalCredits).toFixed(2)}`}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-3d btn-3d-slate text-xs py-1.5 px-3 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced}
                  className={`btn-3d text-xs py-1.5 px-4 cursor-pointer font-bold ${
                    isBalanced ? 'btn-3d-emerald' : 'opacity-50 cursor-not-allowed bg-slate-300 text-slate-600'
                  }`}
                >
                  Save Recurring Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
