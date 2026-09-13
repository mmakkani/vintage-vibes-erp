import React, { useState, useEffect } from 'react';
import { COAAccount, BudgetLimit } from '../finance.types.ts';
import {
  Target,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Sparkles,
  PieChart,
  DollarSign,
  ArrowUpRight,
  HelpCircle
} from 'lucide-react';

interface BudgetingViewProps {
  accounts: COAAccount[];
  onRefreshFinance: () => void;
}

export const BudgetingView: React.FC<BudgetingViewProps> = ({ accounts, onRefreshFinance }) => {
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [budgets, setBudgets] = useState<BudgetLimit[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetLimit | null>(null);

  // Form State
  const [formAccountId, setFormAccountId] = useState('');
  const [formBudgetLimit, setFormBudgetLimit] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchBudgets = async (month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/budgets?period=${month}`);
      if (res.ok) {
        const data = await res.json();
        setBudgets(Array.isArray(data) ? data : (Array.isArray(data?.budgets) ? data.budgets : []));
      }
    } catch (err) {
      console.error('Failed to load budgets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets(selectedMonth);
  }, [selectedMonth]);

  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeBudgets = Array.isArray(budgets) ? budgets : [];

  const expenseAccounts = safeAccounts.filter(
    a => a && ((a.classification === 'EXPENSE' || (a.type && a.type.toUpperCase() === 'EXPENSE')) || (a.code && a.code.startsWith('5')))
  );

  const handleOpenAdd = () => {
    setEditingBudget(null);
    const firstAcc = expenseAccounts[0] || accounts[0];
    setFormAccountId(firstAcc?.id || '');
    setFormBudgetLimit('10000');
    setFormNotes('');
    setShowModal(true);
  };

  const handleOpenEdit = (b: BudgetLimit) => {
    setEditingBudget(b);
    setFormAccountId(b.accountId);
    setFormBudgetLimit(String(b.budgetLimitAed));
    setFormNotes(b.notes || '');
    setShowModal(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAccountId) {
      setFeedback({ type: 'error', text: 'Please select a Chart of Accounts head' });
      return;
    }
    const limit = Number(formBudgetLimit);
    if (isNaN(limit) || limit < 0) {
      setFeedback({ type: 'error', text: 'Please enter a valid positive budget amount' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/finance/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: formAccountId,
          periodMonth: selectedMonth,
          budgetLimitAed: limit,
          notes: formNotes
        })
      });

      if (res.ok) {
        setFeedback({ type: 'success', text: `Budget limit updated for ${selectedMonth}!` });
        setShowModal(false);
        fetchBudgets(selectedMonth);
        onRefreshFinance();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: err.error || 'Failed to save budget' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Network error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!window.confirm('Delete this budget limit?')) return;
    try {
      const res = await fetch(`/api/finance/budgets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Budget limit removed' });
        fetchBudgets(selectedMonth);
        onRefreshFinance();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to delete budget' });
    }
  };

  const handleSeedDefaults = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/budgets/seed-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: selectedMonth })
      });
      if (res.ok) {
        const data = await res.json();
        setBudgets(data);
        setFeedback({ type: 'success', text: `Standard monthly budgets seeded for ${selectedMonth}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to seed defaults' });
    } finally {
      setLoading(false);
    }
  };

  // Aggregates
  const totalBudgetAed = safeBudgets.reduce((sum, b) => sum + (Number(b?.budgetLimitAed) || 0), 0);
  const totalActualSpentAed = safeBudgets.reduce((sum, b) => sum + (Number(b?.actualSpentAed) || 0), 0);
  const totalVarianceAed = totalBudgetAed - totalActualSpentAed;
  const overallPercent = totalBudgetAed > 0 ? (totalActualSpentAed / totalBudgetAed) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-amber-200/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Monthly Expense & COGS Budgeting
              </h2>
              <p className="text-xs text-slate-500">
                Real-time tracking of Chart of Accounts budget ceilings vs posted General Ledger debits
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="2026-08">August 2026</option>
              <option value="2026-09">September 2026 (Active)</option>
              <option value="2026-10">October 2026</option>
              <option value="2026-11">November 2026</option>
              <option value="2026-12">December 2026</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={loading}
            className="btn-3d btn-3d-slate flex items-center gap-1.5 text-xs py-1.5 px-3 cursor-pointer"
            title="Populate standard operational expense targets"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Seed Standard Targets</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn-3d btn-3d-amber flex items-center gap-1.5 text-xs py-1.5 px-3.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Set Account Budget</span>
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

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Monthly Budget</span>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            AED {Number(totalBudgetAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Approved allocations for {selectedMonth}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Actual Real-Time Spend</span>
          <div className="text-xl font-extrabold text-amber-700 mt-1">
            AED {Number(totalActualSpentAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Posted GL debits to date</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Remaining Variance</span>
          <div className={`text-xl font-extrabold mt-1 ${totalVarianceAed >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            AED {Number(totalVarianceAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {totalVarianceAed >= 0 ? 'Surplus / Available buffer' : 'Over-budget deficit'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall Consumption</span>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xl font-extrabold ${overallPercent > 100 ? 'text-rose-600' : overallPercent >= 85 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {overallPercent.toFixed(1)}%
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
              overallPercent > 100 ? 'bg-rose-100 text-rose-800' : overallPercent >= 85 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {overallPercent > 100 ? 'Exceeded' : overallPercent >= 85 ? 'Warning' : 'On Track'}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overallPercent > 100 ? 'bg-rose-500' : overallPercent >= 85 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(overallPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Budget Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <span>Chart of Accounts Budget Variance Monitor ({budgets.length} Heads)</span>
          </div>
          <button
            onClick={() => fetchBudgets(selectedMonth)}
            className="text-xs font-semibold text-slate-500 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync GL</span>
          </button>
        </div>

        {safeBudgets.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Target className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-600" />
            <p className="text-sm font-semibold text-slate-600">No budget ceilings configured for {selectedMonth}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Click "Set Account Budget" to specify monthly limits for direct bales purchases, customs clearing, warehouse lease, or crew wages.
            </p>
            <button
              onClick={handleSeedDefaults}
              className="mt-4 btn-3d btn-3d-amber text-xs py-1.5 px-4 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Seed Default Dubai Vintage Operations Budgets</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3">COA Account Code & Head</th>
                  <th className="p-3 text-right">Budget Limit (AED)</th>
                  <th className="p-3 text-right">Actual Spent (AED)</th>
                  <th className="p-3 text-right">Variance / Buffer (AED)</th>
                  <th className="p-3 min-w-[180px]">Consumption Progress</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safeBudgets.map(b => {
                  const isExceeded = b.status === 'EXCEEDED';
                  const isWarning = b.status === 'WARNING';
                  return (
                    <tr key={b.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                            {b.accountCode}
                          </span>
                          <span>{b.accountName}</span>
                        </div>
                        {b.notes && (
                          <div className="text-[11px] text-slate-400 mt-0.5 italic">{b.notes}</div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">
                        AED {Number(b.budgetLimitAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-800">
                        AED {Number(b.actualSpentAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold ${b.varianceAed >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        AED {Number(b.varianceAed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-semibold">
                          <span className="text-slate-500 font-mono">{(Number(b.percentUsed) || 0).toFixed(1)}%</span>
                          <span className="text-slate-400 text-[10px]">
                            {b.varianceAed >= 0 ? `${(100 - (Number(b.percentUsed) || 0)).toFixed(1)}% free` : 'Deficit'}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isExceeded ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(b.percentUsed, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                            isExceeded
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isWarning
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {isExceeded && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                          {!isExceeded && !isWarning && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(b)}
                            className="p-1 rounded text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-all cursor-pointer"
                            title="Edit Budget Ceiling"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteBudget(b.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-all cursor-pointer"
                            title="Delete Budget"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Budget Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-amber-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-amber-50/80 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingBudget ? 'Edit Account Budget Limit' : 'Set Account Budget Limit'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="p-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Account (COA Head) *
                </label>
                <select
                  value={formAccountId}
                  onChange={e => setFormAccountId(e.target.value)}
                  disabled={!!editingBudget}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-semibold text-slate-800 bg-white"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      [{acc.code}] {acc.name} ({acc.classification})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Monthly Period
                  </label>
                  <input
                    type="text"
                    value={selectedMonth}
                    readOnly
                    className="w-full text-xs p-2 rounded-lg bg-slate-100 border border-slate-200 font-mono font-bold text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Budget Limit (AED) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    required
                    value={formBudgetLimit}
                    onChange={e => setFormBudgetLimit(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-amber-500 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Budget Notes & Purpose
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="e.g. Approved monthly expenditure ceiling for wholesale logistics..."
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-amber-500 text-slate-800"
                />
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
                  disabled={isSubmitting}
                  className="btn-3d btn-3d-amber text-xs py-1.5 px-4 cursor-pointer font-bold"
                >
                  {isSubmitting ? 'Saving...' : editingBudget ? 'Update Limit' : 'Save Budget Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
