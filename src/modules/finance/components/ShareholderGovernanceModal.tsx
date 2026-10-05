import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  X,
  Save,
  ShieldCheck,
  Scale,
  Landmark
} from 'lucide-react';
import { FinanceService } from '../../../services/financeService.ts';

export interface CompanyShareholder {
  id: string;
  name: string;
  designation: string;
  shares_count: number;
  capital_aed: number;
  ownership_percent: number;
  passport_or_eid?: string;
  coa_account_code?: string;
  display_order?: number;
}

interface ShareholderGovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShareholdersUpdated?: (list: CompanyShareholder[]) => void;
}

export const ShareholderGovernanceModal: React.FC<ShareholderGovernanceModalProps> = ({
  isOpen,
  onClose,
  onShareholdersUpdated
}) => {
  const [shareholders, setShareholders] = useState<CompanyShareholder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('Managing Partner / Director');
  const [sharesCount, setSharesCount] = useState<number>(100);
  const [capitalAed, setCapitalAed] = useState<number>(100000);
  const [ownershipPercent, setOwnershipPercent] = useState<number>(100);
  const [passportOrEid, setPassportOrEid] = useState('');
  const [coaCode, setCoaCode] = useState('3100-01');

  useEffect(() => {
    if (isOpen) {
      loadShareholders();
    }
  }, [isOpen]);

  const loadShareholders = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await FinanceService.getShareholders();
      setShareholders(data);
      if (onShareholdersUpdated) onShareholdersUpdated(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load shareholders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = (s: CompanyShareholder) => {
    setEditingId(s.id);
    setName(s.name);
    setDesignation(s.designation);
    setSharesCount(Number(s.shares_count));
    setCapitalAed(Number(s.capital_aed));
    setOwnershipPercent(Number(s.ownership_percent));
    setPassportOrEid(s.passport_or_eid || '');
    setCoaCode(s.coa_account_code || '3100-01');
  };

  const handleResetForm = () => {
    setEditingId(null);
    setName('');
    setDesignation('Partner / Director');
    setSharesCount(50);
    setCapitalAed(50000);
    setOwnershipPercent(50);
    setPassportOrEid('');
    setCoaCode(`3100-0${shareholders.length + 1}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Shareholder name is required');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await FinanceService.saveShareholder({
        id: editingId || undefined,
        name: name.trim(),
        designation: designation.trim(),
        sharesCount: Number(sharesCount),
        capitalAed: Number(capitalAed),
        ownershipPercent: Number(ownershipPercent),
        passportOrEid: passportOrEid.trim(),
        coaAccountCode: coaCode.trim()
      });

      setSuccessMsg(editingId ? 'Shareholder updated successfully!' : 'New shareholder registered and linked to COA!');
      handleResetForm();
      await loadShareholders();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save shareholder');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, sName: string) => {
    if (shareholders.length <= 1) {
      setErrorMsg('At least one shareholder must remain registered for corporate governance.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove shareholder "${sName}"?`)) return;

    try {
      await FinanceService.deleteShareholder(id);
      await loadShareholders();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete shareholder');
    }
  };

  if (!isOpen) return null;

  const totalCapital = shareholders.reduce((s, sh) => s + Number(sh.capital_aed || 0), 0);
  const totalPercent = shareholders.reduce((s, sh) => s + Number(sh.ownership_percent || 0), 0);
  const totalShares = shareholders.reduce((s, sh) => s + Number(sh.shares_count || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border-2 border-amber-300 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-amber-950 p-5 text-white flex items-center justify-between border-b border-amber-500/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-black text-lg text-white">
                Shareholders & Equity Governance Hub
              </h3>
              <p className="text-xs text-slate-300 font-sans">
                Corporate ownership structure linked with Chart of Accounts (COA 3100) & Statutory Dossier.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2 font-sans">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-sans">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Registered Shareholders Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-serif font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-600" />
                <span>Registered Corporate Shareholders ({shareholders.length})</span>
              </h4>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md font-bold ${
                Math.abs(totalPercent - 100) < 0.1 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}>
                Total Ownership: {totalPercent.toFixed(1)}% {Math.abs(totalPercent - 100) < 0.1 ? '✓ (100% Balanced)' : '⚠ (Must equal 100%)'}
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left font-sans text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Shareholder Name</th>
                    <th className="py-2.5 px-3">Designation</th>
                    <th className="py-2.5 px-3 text-center">Shares</th>
                    <th className="py-2.5 px-3 text-right">Capital (AED)</th>
                    <th className="py-2.5 px-3 text-center">Ownership %</th>
                    <th className="py-2.5 px-3 text-center">COA Code</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {shareholders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 font-sans">
                        No shareholder records registered.
                      </td>
                    </tr>
                  ) : (
                    shareholders.map((s) => (
                      <tr key={s.id} className="hover:bg-amber-50/40 transition">
                        <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                          {s.name}
                          {s.passport_or_eid && (
                            <span className="block text-[10px] text-slate-500 font-mono font-normal">
                              EID/Passport: {s.passport_or_eid}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-slate-700">{s.designation}</td>
                        <td className="py-2.5 px-3 text-center">{Number(s.shares_count).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          AED {Number(s.capital_aed).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold">
                            {Number(s.ownership_percent).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-[10px] text-slate-500">
                          {s.coa_account_code || '3100-01'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(s)}
                              className="p-1 text-slate-600 hover:text-amber-700 hover:bg-amber-100 rounded transition cursor-pointer"
                              title="Edit Shareholder"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(s.id, s.name)}
                              className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-100 rounded transition cursor-pointer"
                              title="Remove Shareholder"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {shareholders.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-300 font-mono text-xs">
                    <tr>
                      <td colSpan={2} className="py-2.5 px-3 font-sans uppercase">
                        Total Registered Capital
                      </td>
                      <td className="py-2.5 px-3 text-center">{totalShares.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-slate-900">
                        AED {totalCapital.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-center">{totalPercent.toFixed(1)}%</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Add / Edit Shareholder Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h5 className="font-bold font-sans text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                {editingId ? <Edit2 className="w-3.5 h-3.5 text-amber-600" /> : <Plus className="w-3.5 h-3.5 text-emerald-600" />}
                <span>{editingId ? 'Edit Shareholder Record' : 'Register New Partner / Shareholder'}</span>
              </h5>
              {editingId && (
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="text-xs text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 font-sans text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mr. Hassan Askari Hussain"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Designation / Role</label>
                <select
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs"
                >
                  <option value="Sole Proprietor / Director">Sole Proprietor / Director</option>
                  <option value="Managing Partner / Director">Managing Partner / Director</option>
                  <option value="Partner / Director">Partner / Director</option>
                  <option value="Shareholder / Partner">Shareholder / Partner</option>
                  <option value="Authorized Signatory">Authorized Signatory</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Emirates ID / Passport</label>
                <input
                  type="text"
                  placeholder="784-XXXX-XXXXXXX-X"
                  value={passportOrEid}
                  onChange={(e) => setPassportOrEid(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Shares Count</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={sharesCount}
                  onChange={(e) => setSharesCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Paid Capital (AED) *</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  required
                  value={capitalAed}
                  onChange={(e) => setCapitalAed(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Ownership % *</label>
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  required
                  value={ownershipPercent}
                  onChange={(e) => setOwnershipPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs font-mono font-bold text-amber-900"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-2 flex items-center gap-2 text-slate-500 font-mono text-[11px] pt-1">
                <Landmark className="w-4 h-4 text-slate-400" />
                <span>Synchronized with COA Account: <strong>{coaCode}</strong> (Share Capital)</span>
              </div>

              <div className="flex items-end justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : (editingId ? 'Update Record' : 'Add Shareholder')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-sans">
          <span>Updates immediately reflect on Page 1 of the Executive Dossier and Page 4 Board Signatures.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
