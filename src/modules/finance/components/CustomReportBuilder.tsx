import React, { useState, useEffect } from 'react';
import { COAAccount, CustomReportTemplate, ExecutedCustomReport } from '../finance.types.ts';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Save,
  Printer,
  Sparkles,
  GripVertical,
  CheckCircle2,
  FolderTree,
  ChevronRight,
  TrendingUp,
  Layers,
  Search,
  Eye,
  ArrowRight,
  RefreshCw
} from 'lucide-react';

interface CustomReportBuilderProps {
  accounts: COAAccount[];
  onRefreshFinance: () => void;
}

export const CustomReportBuilder: React.FC<CustomReportBuilderProps> = ({ accounts, onRefreshFinance }) => {
  const [templates, setTemplates] = useState<CustomReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [executedReport, setExecutedReport] = useState<ExecutedCustomReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Template Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [sections, setSections] = useState<CustomReportTemplate['sections']>([]);
  const [searchAccountQuery, setSearchAccountQuery] = useState('');
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/custom-reports');
      if (res.ok) {
        const data: CustomReportTemplate[] = await res.json();
        setTemplates(data);
        if (data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load custom reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeReport = async (id: string) => {
    if (!id) return;
    setIsExecuting(true);
    try {
      const res = await fetch(`/api/finance/custom-reports/${id}/execute`);
      if (res.ok) {
        const data: ExecutedCustomReport = await res.json();
        setExecutedReport(data);
      }
    } catch (err) {
      console.error('Failed to execute custom report:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      executeReport(selectedTemplateId);
    }
  }, [selectedTemplateId]);

  const handleStartNew = () => {
    setEditTemplateId(`crt-${Date.now()}`);
    setTemplateName('Consignment Net Trading Statement');
    setTemplateDesc('Custom operational layout for vintage cargo shipments');
    setSections([
      {
        id: `sec-rev-${Date.now()}`,
        title: 'Core Apparel Revenues',
        type: 'REVENUE',
        accountIds: ['acc-4110']
      },
      {
        id: `sec-cogs-${Date.now()}`,
        title: 'Bale Consignment & Clearance',
        type: 'COGS',
        accountIds: ['acc-5110']
      },
      {
        id: `sec-exp-${Date.now()}`,
        title: 'Sorting & Facility Overheads',
        type: 'EXPENSE',
        accountIds: ['acc-5410']
      }
    ]);
    setIsEditing(true);
  };

  const handleStartEdit = (template: CustomReportTemplate) => {
    setEditTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDesc(template.description || '');
    setSections(JSON.parse(JSON.stringify(template.sections)));
    setIsEditing(true);
  };

  const handleAddSection = () => {
    const newSec: CustomReportTemplate['sections'][0] = {
      id: `sec-${Date.now()}`,
      title: 'New Statement Group',
      type: 'EXPENSE',
      accountIds: []
    };
    setSections([...sections, newSec]);
  };

  const handleRemoveSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const handleUpdateSection = (index: number, field: string, val: any) => {
    const copy = [...sections];
    (copy[index] as any)[field] = val;
    setSections(copy);
  };

  const handleAddAccountToSection = (sectionIndex: number, accountId: string) => {
    const copy = [...sections];
    if (!copy[sectionIndex].accountIds.includes(accountId)) {
      copy[sectionIndex].accountIds.push(accountId);
      setSections(copy);
    }
  };

  const handleRemoveAccountFromSection = (sectionIndex: number, accountId: string) => {
    const copy = [...sections];
    copy[sectionIndex].accountIds = copy[sectionIndex].accountIds.filter(id => id !== accountId);
    setSections(copy);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      setFeedback({ type: 'error', text: 'Please enter a name for the report template' });
      return;
    }
    if (sections.length === 0) {
      setFeedback({ type: 'error', text: 'Add at least one section to the report' });
      return;
    }

    try {
      const res = await fetch('/api/finance/custom-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTemplateId,
          name: templateName.trim(),
          description: templateDesc.trim(),
          sections
        })
      });

      if (res.ok) {
        const saved: CustomReportTemplate = await res.json();
        setFeedback({ type: 'success', text: `Saved custom report "${saved.name}"!` });
        setIsEditing(false);
        await fetchTemplates();
        setSelectedTemplateId(saved.id);
        onRefreshFinance();
      } else {
        setFeedback({ type: 'error', text: 'Failed to save template' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error saving template' });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this report template?')) return;
    try {
      const res = await fetch(`/api/finance/custom-reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Template deleted successfully' });
        const remaining = templates.filter(t => t.id !== id);
        setTemplates(remaining);
        if (remaining.length > 0) {
          setSelectedTemplateId(remaining[0].id);
        } else {
          setSelectedTemplateId('');
          setExecutedReport(null);
        }
        onRefreshFinance();
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Failed to delete template' });
    }
  };

  // Drag-and-drop handlers
  const onDragStart = (accountId: string) => {
    setDraggedAccountId(accountId);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (sectionIndex: number) => {
    if (draggedAccountId) {
      handleAddAccountToSection(sectionIndex, draggedAccountId);
      setDraggedAccountId(null);
    }
  };

  // Filter accounts in picker
  const filteredAccounts = accounts.filter(a => {
    if (!searchAccountQuery) return true;
    const q = searchAccountQuery.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.classification.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Top Header & Template Selector */}
      <div className="bg-white p-4 rounded-xl border border-amber-200/90 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Custom Income Statement Builder
            </h2>
            <p className="text-xs text-slate-500">
              Drag-and-drop or select Chart of Accounts heads to build tailored financial performance views
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isEditing && (
            <>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <span className="text-slate-400">Template:</span>
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer max-w-[220px] truncate"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedTemplateId && (
                <button
                  type="button"
                  onClick={() => {
                    const t = templates.find(item => item.id === selectedTemplateId);
                    if (t) handleStartEdit(t);
                  }}
                  className="btn-3d btn-3d-slate text-xs py-1.5 px-3 cursor-pointer"
                >
                  Edit Template
                </button>
              )}

              <button
                type="button"
                onClick={handleStartNew}
                className="btn-3d btn-3d-amber flex items-center gap-1.5 text-xs py-1.5 px-3.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Template</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="btn-3d btn-3d-slate flex items-center gap-1.5 text-xs py-1.5 px-3 cursor-pointer print:hidden"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Custom P&L</span>
              </button>
            </>
          )}

          {isEditing && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn-3d btn-3d-slate text-xs py-1.5 px-3 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="btn-3d btn-3d-emerald flex items-center gap-1.5 text-xs py-1.5 px-4 cursor-pointer font-bold"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Statement Template</span>
              </button>
            </div>
          )}
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

      {/* VIEW MODE: EXECUTED STATEMENT */}
      {!isEditing && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {executedReport ? (
            <div className="p-6 space-y-6">
              {/* Document Header */}
              <div className="border-b border-slate-200 pb-4 flex items-start justify-between">
                <div>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 mb-1">
                    Custom Tailored Income Statement
                  </div>
                  <h1 className="text-lg font-bold text-slate-900">{executedReport.templateName}</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live dynamic computation from General Ledger balances & COA account head mapping
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Generated On</div>
                  <div className="text-xs font-mono font-bold text-slate-700">
                    {new Date(executedReport.generatedAt).toLocaleString()}
                  </div>
                  <button
                    onClick={() => executeReport(selectedTemplateId)}
                    className="mt-1 text-[11px] text-amber-700 hover:underline flex items-center gap-1 font-semibold justify-end"
                  >
                    <RefreshCw className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
                    <span>Recalculate</span>
                  </button>
                </div>
              </div>

              {/* High Level KPI Ribbons */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">Gross Revenues</div>
                  <div className="text-base font-extrabold text-emerald-700 font-mono mt-0.5">
                    AED {executedReport.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">Total COGS / Cargo Costs</div>
                  <div className="text-base font-extrabold text-amber-700 font-mono mt-0.5">
                    AED {executedReport.totalCOGS.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">Calculated Gross Profit</div>
                  <div className={`text-base font-extrabold font-mono mt-0.5 ${executedReport.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    AED {executedReport.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">Net Operating Income</div>
                  <div className={`text-base font-extrabold font-mono mt-0.5 ${executedReport.netOperatingIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    AED {executedReport.netOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Sections Render */}
              <div className="space-y-6">
                {executedReport.sections.map((sec, idx) => (
                  <div key={sec.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className={`p-3 font-bold text-xs flex items-center justify-between uppercase tracking-wider ${
                      sec.type === 'REVENUE' ? 'bg-emerald-50 text-emerald-900 border-b border-emerald-200' :
                      sec.type === 'COGS' ? 'bg-amber-50 text-amber-900 border-b border-amber-200' :
                      'bg-slate-100 text-slate-800 border-b border-slate-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-white text-slate-700 flex items-center justify-center text-[10px] font-extrabold shadow-2xs">
                          {idx + 1}
                        </span>
                        <span>{sec.title}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/80 font-mono font-bold">
                        Category: {sec.type}
                      </span>
                    </div>

                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] font-bold uppercase">
                          <th className="p-2.5">Account Code & Description</th>
                          <th className="p-2.5 text-right">Account Head Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {sec.accounts.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="p-4 text-center text-slate-400 italic">
                              No account heads mapped to this section
                            </td>
                          </tr>
                        ) : (
                          sec.accounts.map(acc => (
                            <tr key={acc.id} className="hover:bg-slate-50/80">
                              <td className="p-2.5">
                                <span className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mr-2 font-semibold">
                                  {acc.code}
                                </span>
                                <span className="font-medium text-slate-800">{acc.name}</span>
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-800">
                                AED {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100/70 border-t border-slate-200 font-bold">
                          <td className="p-2.5 text-slate-700 uppercase tracking-wider text-[11px]">
                            Total {sec.title}
                          </td>
                          <td className="p-2.5 text-right font-mono text-sm text-slate-900">
                            AED {sec.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>

              {/* Statement Final Summary Line */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Net Custom Performance Surplus / (Deficit)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Gross Profit (AED {executedReport.grossProfit.toLocaleString()}) minus Overheads (AED {executedReport.totalExpenses.toLocaleString()})
                  </div>
                </div>
                <div className={`text-xl font-extrabold font-mono ${executedReport.netOperatingIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  AED {executedReport.netOperatingIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-600" />
              <p className="text-sm font-semibold text-slate-600">Select or create a Custom Report Template</p>
              <button
                onClick={handleStartNew}
                className="mt-3 btn-3d btn-3d-amber text-xs py-1.5 px-4 cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Custom Statement Template</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* EDIT MODE: DRAG AND DROP BUILDER */}
      {isEditing && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: Available COA Heads Drawer (Col 4) */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  COA Account Heads ({filteredAccounts.length})
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold">Drag or Click (+)</span>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchAccountQuery}
                onChange={e => setSearchAccountQuery(e.target.value)}
                placeholder="Search account code or name..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-amber-500 text-slate-800"
              />
            </div>

            {/* Accounts Draggable List */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredAccounts.map(acc => (
                <div
                  key={acc.id}
                  draggable
                  onDragStart={() => onDragStart(acc.id)}
                  className="p-2 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-amber-50/60 hover:border-amber-300 transition-all cursor-grab active:cursor-grabbing flex items-center justify-between gap-2 text-xs group"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 shrink-0" />
                    <span className="font-mono text-[11px] font-bold text-amber-800 bg-amber-100/60 px-1 py-0.5 rounded">
                      {acc.code}
                    </span>
                    <span className="font-medium text-slate-800 truncate" title={acc.name}>
                      {acc.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-400 uppercase font-mono">
                      {acc.classification.slice(0, 3)}
                    </span>
                    {sections.map((_, secIdx) => (
                      <button
                        key={secIdx}
                        type="button"
                        onClick={() => handleAddAccountToSection(secIdx, acc.id)}
                        className="px-1 py-0.5 text-[9px] font-bold rounded bg-amber-200/80 hover:bg-amber-300 text-amber-900 cursor-pointer"
                        title={`Add to section ${secIdx + 1}`}
                      >
                        +{secIdx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Template Structure Builder (Col 8) */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
            {/* Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-slate-200 pb-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Report Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g. Consignment Gross Margin Statement"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-amber-500 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description & Context
                </label>
                <input
                  type="text"
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                  placeholder="e.g. Highlights landing port customs and direct bales costs"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-amber-500 text-slate-800"
                />
              </div>
            </div>

            {/* Sections Builder */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Statement Sections ({sections.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="btn-3d btn-3d-slate flex items-center gap-1.5 text-xs py-1 px-2.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-600" />
                  <span>Add Custom Section</span>
                </button>
              </div>

              {sections.map((sec, secIdx) => (
                <div
                  key={sec.id}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(secIdx)}
                  className="p-3.5 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/20 hover:border-amber-400 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold">
                        {secIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={sec.title}
                        onChange={e => handleUpdateSection(secIdx, 'title', e.target.value)}
                        placeholder="Section Title..."
                        className="text-xs font-bold text-slate-900 bg-white p-1.5 rounded border border-slate-200 focus:border-amber-500 flex-1"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={sec.type}
                        onChange={e => handleUpdateSection(secIdx, 'type', e.target.value)}
                        className="text-xs font-bold bg-white border border-slate-200 rounded p-1.5 text-slate-700"
                      >
                        <option value="REVENUE">REVENUE (Income)</option>
                        <option value="COGS">COGS (Direct Landing Costs)</option>
                        <option value="EXPENSE">EXPENSE (Overheads & Labor)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveSection(secIdx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Delete Section"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Drop zone / Assigned Accounts */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 min-h-[50px]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Assigned Account Heads (Drop here):
                    </div>
                    {sec.accountIds.length === 0 ? (
                      <div className="text-xs text-slate-400 italic py-2 text-center">
                        Drop COA accounts here or click "+{secIdx + 1}" on the left drawer
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sec.accountIds.map(accId => {
                          const acc = accounts.find(a => a.id === accId);
                          return (
                            <div
                              key={accId}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-300/80"
                            >
                              <span className="font-mono text-[11px] font-bold">[{acc?.code || '...'}]</span>
                              <span>{acc?.name || accId}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveAccountFromSection(secIdx, accId)}
                                className="text-amber-700 hover:text-rose-700 font-bold ml-1 cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDeleteTemplate(editTemplateId)}
                className="text-xs text-rose-600 hover:underline font-semibold cursor-pointer"
              >
                Delete Template
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn-3d btn-3d-slate text-xs py-1.5 px-3 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="btn-3d btn-3d-emerald text-xs py-1.5 px-4 cursor-pointer font-bold"
                >
                  Save & Apply Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
