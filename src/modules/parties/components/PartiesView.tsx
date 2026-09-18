import React, { useState, useEffect } from 'react';
import { Party, PartyKhataLog } from '../parties.types.ts';
import {
  Users,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Building,
  Phone,
  Mail,
  Receipt,
  FileCheck,
  CreditCard,
  Eye,
  Pencil,
  Trash2,
  Printer,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  FileText,
  Check,
  Shield
} from 'lucide-react';
import { PartiesService } from '../../../services/partiesService.ts';
import { FinanceService } from '../../../services/financeService.ts';
import { SearchableSelect } from '../../../components/SearchableSelect.tsx';

interface PartiesViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

export const PartiesView: React.FC<PartiesViewProps> = ({ onRefreshAll }) => {
  const [parties, setParties] = useState<Party[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');

  // Selected party for Khata statement
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [khataLogs, setKhataLogs] = useState<PartyKhataLog[]>([]);

  // Modals
  const [showNewPartyModal, setShowNewPartyModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);

  // View Party Profile Modal
  const [showViewPartyModal, setShowViewPartyModal] = useState(false);
  const [viewPartyData, setViewPartyData] = useState<any | null>(null);

  // Edit Party Modal
  const [showEditPartyModal, setShowEditPartyModal] = useState(false);
  const [editPartyForm, setEditPartyForm] = useState({
    id: '',
    code: '',
    name: '',
    type: 'CLIENT' as any,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    trnNo: '',
    creditLimit: 50000,
    isActive: true,
    payableAccountId: '2110-00',
    clearingAccountId: '1310-00',
    receivableAccountId: '1130-00',
    revenueAccountId: '4110-00'
  });

  // Delete Party Modal
  const [showDeletePartyModal, setShowDeletePartyModal] = useState(false);
  const [deletingParty, setDeletingParty] = useState<Party | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // New Party form
  const [partyForm, setPartyForm] = useState({
    name: '',
    type: 'CLIENT' as any,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    trnNo: '',
    creditLimit: 50000,
    currency: 'AED' as any,
    payableAccountId: '2110-00',
    clearingAccountId: '1310-00',
    receivableAccountId: '1120-00',
    revenueAccountId: '4110-00'
  });

  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  // New Payment/Receipt form
  const [txForm, setTxForm] = useState({
    type: 'RECEIPT' as 'RECEIPT' | 'PAYMENT',
    amount: 15000,
    docRef: 'REC-2026-0091',
    description: 'Direct bank transfer settlement against open invoice'
  });

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadParties = async () => {
    try {
      const data = await PartiesService.getParties();
      const safeData = (Array.isArray(data) ? data : []).map((p: any) => {
        const curBal = Number(p.currentBalance ?? p.current_balance ?? 0);
        const purC = Number(p.purchaseInvoicesCount ?? p.stats?.purchaseInvoicesCount ?? 0);
        const salC = Number(p.salesInvoicesCount ?? p.stats?.salesInvoicesCount ?? 0);
        const khtC = Number(p.khataLogsCount ?? p.stats?.khataTransactionsCount ?? 0);
        const glC = Number(p.glEntriesCount ?? p.stats?.glEntriesCount ?? 0);
        const totalEnt = Number(p.totalEntriesCount ?? (purC + salC + khtC + glC));
        const hasEnt = Boolean(p.hasEntries !== undefined ? p.hasEntries : (totalEnt > 0 || Math.abs(curBal) > 0.001));

        return {
          ...p,
          currentBalance: curBal,
          creditLimit: Number(p.creditLimit ?? p.credit_limit ?? 0),
          purchaseInvoicesCount: purC,
          salesInvoicesCount: salC,
          khataLogsCount: khtC,
          glEntriesCount: glC,
          totalEntriesCount: totalEnt,
          hasEntries: hasEnt
        };
      });
      setParties(safeData);
      if (safeData.length > 0 && !selectedParty) {
        selectParty(safeData[0]);
      } else if (selectedParty) {
        const updated = safeData.find((p: Party) => p.id === selectedParty.id);
        if (updated) setSelectedParty(updated);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadCoaAccounts = async () => {
    try {
      const data = await FinanceService.getCoaAccounts();
      if (Array.isArray(data)) setCoaAccounts(data);
    } catch (err: any) {
      console.warn('Failed to load COA for party provisioning:', err);
    }
  };

  const selectParty = async (party: Party) => {
    setSelectedParty(party);
    try {
      const logs = await PartiesService.getKhataLogs(party.id);
      setKhataLogs(logs);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadParties();
    loadCoaAccounts();
  }, []);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = partyForm.name.trim();
    if (!cleanName) {
      showMsg('Party / Company Name cannot be empty.', 'error');
      return;
    }

    const dup = parties.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (dup) {
      showMsg(`Duplicate Name: A party named "${cleanName}" already exists (${dup.code})! Duplicate client/supplier names are strictly prohibited.`, 'error');
      return;
    }

    try {
      const newParty = await PartiesService.addParty({ ...partyForm, name: cleanName });
      setShowNewPartyModal(false);
      showMsg(`Added ${newParty.name} (${newParty.code}) and auto-provisioned COA sub-accounts!`);
      loadParties();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to add party', 'error');
    }
  };

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;

    try {
      const isReceipt = txForm.type === 'RECEIPT';
      const debit = isReceipt ? 0 : Number(txForm.amount);
      const credit = isReceipt ? Number(txForm.amount) : 0;
      const newBal = (selectedParty.currentBalance || 0) + debit - credit;

      await PartiesService.addKhataLog({
        partyId: selectedParty.id,
        date: new Date().toISOString().slice(0, 10),
        reference: txForm.docRef,
        debit,
        credit,
        runningBalance: newBal,
        notes: txForm.description
      });

      await PartiesService.updateParty(selectedParty.id, {
        currentBalance: newBal
      });

      showMsg(`Recorded ${txForm.type} of AED ${txForm.amount}! Updated Khata statement.`);
      setShowTransactionModal(false);
      loadParties();
      selectParty({ ...selectedParty, currentBalance: newBal });
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Transaction error', 'error');
    }
  };

  // Open View Modal
  const handleOpenViewParty = async (party: Party) => {
    setViewPartyData(party);
    setShowViewPartyModal(true);
    try {
      const detailed = await PartiesService.getPartyById(party.id);
      if (detailed) setViewPartyData(detailed);
    } catch {}
  };

  // Open Edit Modal
  const handleOpenEditParty = (party: Party) => {
    setEditPartyForm({
      id: party.id,
      code: party.code,
      name: party.name,
      type: party.type as any,
      contactPerson: party.contactPerson || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      trnNo: party.trnNo || '',
      creditLimit: Number(party.creditLimit || 0),
      isActive: party.isActive !== false,
      payableAccountId: party.accountMap?.payableAccountId || (party.type === 'SUPPLIER' ? `2110-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : '2110-00'),
      clearingAccountId: party.accountMap?.clearingAccountId || '1310-00',
      receivableAccountId: party.accountMap?.receivableAccountId || (party.type === 'CLIENT' ? `1130-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : '1130-00'),
      revenueAccountId: party.accountMap?.revenueAccountId || '4110-00'
    });
    setShowEditPartyModal(true);
  };

  // Save Edit to SQL
  const handleSaveEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = editPartyForm.name.trim();
    if (!cleanName) {
      showMsg('Party / Company Name cannot be empty.', 'error');
      return;
    }

    const dup = parties.find(p => p.id !== editPartyForm.id && p.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (dup) {
      showMsg(`Duplicate Name: Another party named "${cleanName}" already exists in the system (${dup.code})! Duplicate client/supplier names are prohibited.`, 'error');
      return;
    }

    try {
      const updated = await PartiesService.updateParty(editPartyForm.id, {
        name: cleanName,
        type: editPartyForm.type,
        contactPerson: editPartyForm.contactPerson,
        phone: editPartyForm.phone,
        email: editPartyForm.email,
        address: editPartyForm.address,
        trnNo: editPartyForm.trnNo,
        creditLimit: editPartyForm.creditLimit,
        isActive: editPartyForm.isActive,
        accountMap: {
          payableAccountId: editPartyForm.payableAccountId,
          clearingAccountId: editPartyForm.clearingAccountId,
          receivableAccountId: editPartyForm.receivableAccountId,
          revenueAccountId: editPartyForm.revenueAccountId
        }
      });
      setShowEditPartyModal(false);
      showMsg(`Party "${updated.name}" (${updated.code}) updated in SQL database!`, 'success');
      loadParties();
      if (selectedParty?.id === updated.id) {
        setSelectedParty(updated);
      }
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to update party', 'error');
    }
  };

  // Open Delete Modal
  const handleOpenDeleteParty = async (party: Party) => {
    setDeletingParty(party);
    setDeleteError(null);
    setShowDeletePartyModal(true);
    try {
      const detailed = await PartiesService.getPartyById(party.id);
      if (detailed) {
        setDeletingParty(prev => (prev && prev.id === detailed.id ? { ...prev, ...detailed } : detailed));
      }
    } catch {}
  };

  // One-click Deactivate Party (recommended when party has financial entries)
  const handleDeactivateParty = async (party: Party) => {
    try {
      setIsDeleting(true);
      await PartiesService.updateParty(party.id, { isActive: false });
      setShowDeletePartyModal(false);
      showMsg(`Party "${party.name}" (${party.code}) has been set to Inactive. It is safely archived in accounting.`, 'success');
      setDeletingParty(null);
      await loadParties();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to deactivate party', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm Delete from SQL (strictly blocked if entries exist)
  const handleConfirmDeleteParty = async () => {
    if (!deletingParty) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await PartiesService.deleteParty(deletingParty.id);
      setShowDeletePartyModal(false);
      showMsg(`Party "${deletingParty.name}" (${deletingParty.code}) deleted from SQL database.`, 'success');
      setDeletingParty(null);
      await loadParties();
      if (selectedParty?.id === deletingParty.id) {
        setSelectedParty(null);
        setKhataLogs([]);
      }
      onRefreshAll();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete party');
    } finally {
      setIsDeleting(false);
    }
  };

  // Print Khata Statement
  const handlePrintKhata = () => {
    if (!selectedParty) return;
    window.print();
  };

  const filteredParties = parties.filter(p => {
    if (filterType === 'ALL') return true;
    return p.type === filterType;
  });

  return (
    <div className="space-y-3">
      {/* Top Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'CLIENT', 'SUPPLIER', 'AGENT'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                filterType === type
                  ? 'bg-[#0056b3] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {type === 'ALL' ? 'All Parties' : `${type}s`} ({parties.filter(p => type === 'ALL' || p.type === type).length})
            </button>
          ))}
        </div>

        <button
          id="btn-add-new-party"
          onClick={() => setShowNewPartyModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Party (COA Auto-Provision)</span>
        </button>
      </div>

      {actionMessage && (
        <div
          className={`p-2.5 rounded text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-800 border border-red-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* Main Grid: Directory on Left, Detailed Khata Ledger on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Parties List (5 cols) */}
        <div className="lg:col-span-5 space-y-2">
          {filteredParties.map(party => {
            const isSelected = selectedParty?.id === party.id;
            return (
              <div
                key={party.id}
                onClick={() => selectParty(party)}
                className={`p-3 rounded border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 ring-1 ring-blue-400/40 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[10px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {party.code}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                        {party.type}
                      </span>
                      {party.hasEntries ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-0.5" title="Financial history recorded - Protected from deletion">
                          🔒 {party.totalEntriesCount ? `${party.totalEntriesCount} Entries` : 'Active Khata'}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5" title="Clean record - 0 entries">
                          🟢 0 Entries
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 text-xs mt-1 flex items-center gap-1">
                      <span>{party.name}</span>
                    </h4>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Khata Balance</div>
                    <div className={`font-mono font-bold text-xs ${
                      Number(party.currentBalance || (party as any).current_balance || 0) > 0
                        ? 'text-emerald-700'
                        : Number(party.currentBalance || (party as any).current_balance || 0) < 0
                        ? 'text-rose-700'
                        : 'text-slate-600'
                    }`}>
                      AED {Math.abs(Number(party.currentBalance ?? (party as any).current_balance ?? 0)).toLocaleString()}
                      <span className="text-[10px] font-sans font-normal ml-1">
                        {Number(party.currentBalance || (party as any).current_balance || 0) > 0 ? '(Rec)' : Number(party.currentBalance || (party as any).current_balance || 0) < 0 ? '(Pay)' : '(Nil)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                  {party.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-blue-600" /> {party.phone}
                    </span>
                  )}
                  {party.trnNo && (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
                      TRN: {party.trnNo}
                    </span>
                  )}
                </div>

                {/* Provisioned COA Mapping preview & Quick Actions */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-600 font-bold">✓ COA:</span>
                    <span className="font-bold text-slate-800">
                      {party.accountMap?.payableAccountId || party.accountMap?.receivableAccountId || party.coaAccountId || (party.type === 'SUPPLIER' ? `2110-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}` : `1130-${(party.code || '').replace(/[^A-Za-z0-9]/g, '')}`)}
                    </span>
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenViewParty(party); }}
                      className="p-1 rounded bg-slate-100 hover:bg-blue-100 text-blue-700 transition-colors"
                      title="View Full Party Profile"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenEditParty(party); }}
                      className="p-1 rounded bg-slate-100 hover:bg-amber-100 text-amber-800 transition-colors"
                      title="Edit Party Details in SQL"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleOpenDeleteParty(party); }}
                      className={`p-1 rounded transition-colors ${
                        party.hasEntries
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 hover:bg-red-100 text-red-600'
                      }`}
                      title={party.hasEntries ? `Delete Blocked: Has ${party.totalEntriesCount || 'recorded'} entries` : 'Delete Clean Party from SQL'}
                    >
                      {party.hasEntries ? <Shield className="w-3 h-3 text-amber-700" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Khata Ledger Statement (7 cols) */}
        <div className="lg:col-span-7">
          {selectedParty ? (
            <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden space-y-3">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-blue-900 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] border border-blue-200">
                      {selectedParty.code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">{selectedParty.name}</h3>
                    {!selectedParty.isActive && (
                      <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded border border-red-200">
                        INACTIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedParty.address || 'Dubai Garment District'} • Contact: {selectedParty.contactPerson || 'General Manager'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => handleOpenViewParty(selectedParty)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-blue-50 text-blue-800 font-bold text-[10px] uppercase tracking-wider border border-blue-300 shadow-2xs transition-colors cursor-pointer"
                    title="View Full Profile & Accounting Information"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>View Profile</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditParty(selectedParty)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-amber-50 text-amber-900 font-bold text-[10px] uppercase tracking-wider border border-amber-300 shadow-2xs transition-colors cursor-pointer"
                    title="Edit Party Information in SQL Database"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-600" />
                    <span>Edit</span>
                  </button>

                  <button
                    id="btn-record-party-payment"
                    onClick={() => setShowTransactionModal(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold text-[10px] uppercase tracking-wider shadow-xs transition-colors cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Record Settlement</span>
                  </button>

                  <button
                    onClick={handlePrintKhata}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                    title="Print / Export Statement"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print</span>
                  </button>

                  <button
                    onClick={() => handleOpenDeleteParty(selectedParty)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded font-bold text-[10px] uppercase tracking-wider border shadow-2xs transition-colors cursor-pointer ${
                      selectedParty.hasEntries
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-white hover:bg-red-50 text-red-700 border-red-200'
                    }`}
                    title={selectedParty.hasEntries ? 'Delete Blocked: Party has active entries in database' : 'Delete Clean Party'}
                  >
                    {selectedParty.hasEntries ? <Shield className="w-3.5 h-3.5 text-amber-700" /> : <Trash2 className="w-3.5 h-3.5 text-red-600" />}
                    <span>{selectedParty.hasEntries ? 'Delete (Protected)' : 'Delete'}</span>
                  </button>
                </div>
              </div>

              {/* Linked Chart of Accounts Auto-Link Card */}
              <div className="mx-3 p-2 bg-amber-50/80 rounded border border-amber-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase">
                    Auto-Linked COA Khata
                  </span>
                  <span className="font-mono font-bold text-slate-800 text-[11px]">
                    {selectedParty.accountMap?.payableAccountId || selectedParty.accountMap?.receivableAccountId || selectedParty.coaAccountId || (selectedParty.type === 'SUPPLIER' ? `2110-${selectedParty.code.replace(/[^A-Za-z0-9]/g, '')}` : `1130-${selectedParty.code.replace(/[^A-Za-z0-9]/g, '')}`)} - {selectedParty.name} ({selectedParty.type === 'SUPPLIER' ? 'Supplier' : 'Customer'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'finance');
                    url.searchParams.set('financeSubTab', 'coa');
                    window.location.href = url.toString();
                  }}
                  className="text-[10px] font-bold text-amber-900 bg-white border border-amber-300 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  View in COA (5-Pillars) →
                </button>
              </div>

              {/* Running Balance Banner */}
              <div className="px-3 grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Ledger Net Balance</div>
                  <div className={`text-base font-mono font-bold mt-0.5 ${
                    Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) > 0 ? 'text-emerald-700' : Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) < 0 ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    AED {Math.abs(Number(selectedParty.currentBalance ?? (selectedParty as any).current_balance ?? 0)).toLocaleString()}
                    <span className="text-[10px] font-sans font-normal ml-1">
                      {Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) > 0 ? 'Customer Owes Us (Dr)' : Number(selectedParty.currentBalance || (selectedParty as any).current_balance || 0) < 0 ? 'We Owe Supplier (Cr)' : 'Settled'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credit Facility</div>
                  <div className="text-base font-mono font-bold text-slate-800 mt-0.5">
                    AED {Number(selectedParty.creditLimit ?? (selectedParty as any).credit_limit ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Doc Ref</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Debit (Dr)</th>
                      <th className="px-3 py-2 text-right">Credit (Cr)</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {khataLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400 font-sans text-xs">
                          No transaction history recorded yet for this party.
                        </td>
                      </tr>
                    ) : (
                      khataLogs.map(log => (
                        <tr key={log.id} className="hover:bg-blue-50/40">
                          <td className="px-3 py-1.5 text-slate-600">{log.date}</td>
                          <td className="px-3 py-1.5 font-bold text-blue-900">{log.docRef}</td>
                          <td className="px-3 py-1.5 font-sans text-slate-700 max-w-xs truncate">{log.description}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">
                            {Number(log.debit || 0) > 0 ? `AED ${Number(log.debit || 0).toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-rose-700">
                            {Number(log.credit || 0) > 0 ? `AED ${Number(log.credit || 0).toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-slate-900">
                            AED {Number(log.balance ?? (log as any).running_balance ?? (log as any).runningBalance ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded border border-slate-200 p-8 text-center text-slate-400 text-xs">
              Select a party from the directory to view their complete Khata ledger.
            </div>
          )}
        </div>
      </div>

      {/* NEW PARTY MODAL */}
      {showNewPartyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1">Add Party & Auto-Provision COA</h3>
            <p className="text-[11px] text-slate-500 mb-3">
              Automatically creates Accounts Receivable, Payable, or Clearing sub-accounts in the 5-Tier COA.
            </p>
            <form onSubmit={handleCreateParty} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Party Entity Type:</label>
                <select
                  value={partyForm.type}
                  onChange={e => setPartyForm({ ...partyForm, type: e.target.value as any })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                >
                  <option value="CLIENT">Client (Customer)</option>
                  <option value="SUPPLIER">Supplier (Vendor / Sorter)</option>
                  <option value="AGENT">Clearing & Commission Agent</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Company / Party Name:</label>
                <input
                  type="text"
                  value={partyForm.name}
                  onChange={e => setPartyForm({ ...partyForm, name: e.target.value })}
                  placeholder="e.g. Dubai Vintage Archive Ltd"
                  className={`w-full border rounded p-1.5 text-xs text-slate-800 ${
                    partyForm.name.trim() && parties.some(p => p.name.trim().toLowerCase() === partyForm.name.trim().toLowerCase())
                      ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                  required
                />
                {(() => {
                  const clean = partyForm.name.trim().toLowerCase();
                  if (!clean) return null;
                  const dup = parties.find(p => p.name.trim().toLowerCase() === clean);
                  if (dup) {
                    return (
                      <div className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-200">
                        <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                        <span>Duplicate Name: "{dup.name}" already exists ({dup.code}). Duplicate names are strictly prohibited.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Phone Number:</label>
                  <input
                    type="text"
                    value={partyForm.phone}
                    onChange={e => setPartyForm({ ...partyForm, phone: e.target.value })}
                    placeholder="+971 50 ..."
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">TRN Tax No:</label>
                  <input
                    type="text"
                    value={partyForm.trnNo}
                    onChange={e => setPartyForm({ ...partyForm, trnNo: e.target.value })}
                    placeholder="100..."
                    className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Address / Location:</label>
                <input
                  type="text"
                  value={partyForm.address}
                  onChange={e => setPartyForm({ ...partyForm, address: e.target.value })}
                  placeholder="Plot 12, Industrial Area, Dubai"
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Approved Credit Limit (AED):</label>
                <input
                  type="number"
                  value={partyForm.creditLimit}
                  onChange={e => setPartyForm({ ...partyForm, creditLimit: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:border-blue-500"
                />
              </div>

              {/* DUAL COA ACCOUNT SELECTION */}
              {partyForm.type === 'SUPPLIER' && (
                <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-amber-900 uppercase flex items-center justify-between">
                    <span>🛡️ Dual COA Accounting Link (Auto-Provisioned)</span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">SUPPLIER</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      1. Accounts Payable Account (Liability):
                    </label>
                    <SearchableSelect
                      value={partyForm.payableAccountId}
                      onChange={val => setPartyForm({ ...partyForm, payableAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'LIABILITY').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'LIABILITY'
                      }))}
                      placeholder="Select Payable Account (2110-00)..."
                      searchPlaceholder="Search liabilities / payables..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500">Credited when purchasing raw bales on credit</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      2. Stock Bale Inventory / Goods Clearing (Asset):
                    </label>
                    <SearchableSelect
                      value={partyForm.clearingAccountId}
                      onChange={val => setPartyForm({ ...partyForm, clearingAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'ASSET').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'ASSET'
                      }))}
                      placeholder="Select Inventory Asset Account..."
                      searchPlaceholder="Search inventory assets..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500">Debited to capitalize physical inward bales into inventory assets</span>
                  </div>
                </div>
              )}

              {partyForm.type === 'CLIENT' && (
                <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-blue-900 uppercase flex items-center justify-between">
                    <span>🛡️ Dual COA Accounting Link (Auto-Provisioned)</span>
                    <span className="text-[9px] bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-bold">CLIENT</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      1. Accounts Receivable Account (Asset):
                    </label>
                    <SearchableSelect
                      value={partyForm.receivableAccountId}
                      onChange={val => setPartyForm({ ...partyForm, receivableAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'ASSET').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'ASSET'
                      }))}
                      placeholder="Select Receivable Account (1120-00)..."
                      searchPlaceholder="Search trade receivables..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500">Debited when client purchases vintage apparel on credit</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      2. Sales Revenue Account (Revenue):
                    </label>
                    <SearchableSelect
                      value={partyForm.revenueAccountId}
                      onChange={val => setPartyForm({ ...partyForm, revenueAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'REVENUE').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'REVENUE'
                      }))}
                      placeholder="Select Sales Revenue Account..."
                      searchPlaceholder="Search revenue accounts..."
                      className="w-full bg-white"
                    />
                    <span className="text-[9px] text-slate-500">Credited when sales are finalized</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewPartyModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs"
                >
                  Register & Provision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD TRANSACTION MODAL */}
      {showTransactionModal && selectedParty && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1">Record Settlement / Khata Entry</h3>
            <p className="text-[11px] text-slate-500 mb-3">Party: {selectedParty.name}</p>

            <form onSubmit={handleRecordTransaction} className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Transaction Type:</label>
                <select
                  value={txForm.type}
                  onChange={e => setTxForm({ ...txForm, type: e.target.value as any })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                >
                  <option value="RECEIPT">Receipt from Customer (Dr Cash/Bank, Cr Khata)</option>
                  <option value="PAYMENT">Payment to Supplier / Agent (Dr Khata, Cr Cash/Bank)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Amount (AED):</label>
                <input
                  type="number"
                  value={txForm.amount}
                  onChange={e => setTxForm({ ...txForm, amount: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Document / Cheque / Wire Ref:</label>
                <input
                  type="text"
                  value={txForm.docRef}
                  onChange={e => setTxForm({ ...txForm, docRef: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Description / Memo:</label>
                <textarea
                  rows={2}
                  value={txForm.description}
                  onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs"
                >
                  Post to Khata
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW PARTY MODAL */}
      {showViewPartyModal && viewPartyData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{viewPartyData.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    viewPartyData.type === 'SUPPLIER' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                    viewPartyData.type === 'CLIENT' ? 'bg-blue-100 text-blue-900 border border-blue-300' :
                    'bg-purple-100 text-purple-900 border border-purple-300'
                  }`}>
                    {viewPartyData.type}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    viewPartyData.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {viewPartyData.isActive !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">Code: {viewPartyData.code} • ID: {viewPartyData.id}</p>
              </div>
              <button
                onClick={() => setShowViewPartyModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Balances Highlight */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Current Ledger Balance</span>
                  <span className={`text-lg font-mono font-bold block mt-1 ${
                    Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) > 0 ? 'text-emerald-700' :
                    Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) < 0 ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    AED {Math.abs(Number(viewPartyData.currentBalance ?? (viewPartyData as any).current_balance ?? 0)).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) > 0 ? 'Customer Owes Us (Dr)' :
                     Number(viewPartyData.currentBalance || (viewPartyData as any).current_balance || 0) < 0 ? 'We Owe Supplier (Cr)' : 'Settled (0.00)'}
                  </span>
                </div>

                <div className="p-3 rounded bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Credit Facility</span>
                  <span className="text-lg font-mono font-bold text-slate-800 block mt-1">
                    AED {Number(viewPartyData.creditLimit ?? (viewPartyData as any).credit_limit ?? 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500">Approved Credit Ceiling</span>
                </div>
              </div>

              {/* Details List */}
              <div className="bg-slate-50/60 rounded-md p-3 border border-slate-200/80 divide-y divide-slate-200/60 space-y-2 text-[11px]">
                <div className="flex justify-between items-center pt-1 first:pt-0">
                  <span className="font-semibold text-slate-500">Contact Person</span>
                  <span className="font-medium text-slate-800">{viewPartyData.contactPerson || '-'}</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Phone Number</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-800">{viewPartyData.phone || '-'}</span>
                    {viewPartyData.phone && (
                      <a
                        href={`https://wa.me/${viewPartyData.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold border border-emerald-200"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Email Address</span>
                  <span className="text-slate-800">{viewPartyData.email || '-'}</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Tax Registration Number (TRN)</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {viewPartyData.trnNo || '-'}
                  </span>
                </div>

                <div className="flex justify-between items-start pt-2">
                  <span className="font-semibold text-slate-500">Address / Location</span>
                  <span className="text-slate-800 text-right max-w-xs">{viewPartyData.address || '-'}</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-slate-500">Auto-Linked COA Code</span>
                  <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {viewPartyData.accountMap?.payableAccountId || viewPartyData.accountMap?.receivableAccountId || (viewPartyData.type === 'SUPPLIER' ? `2110-${viewPartyData.code.replace(/[^A-Za-z0-9]/g, '')}` : `1130-${viewPartyData.code.replace(/[^A-Za-z0-9]/g, '')}`)}
                  </span>
                </div>

                {(viewPartyData as any).purchaseInvoicesCount !== undefined && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-slate-500">Linked Purchase Invoices</span>
                    <span className="font-bold text-slate-800">{(viewPartyData as any).purchaseInvoicesCount} Invoices</span>
                  </div>
                )}

                {(viewPartyData as any).salesInvoicesCount !== undefined && (
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-semibold text-slate-500">Linked Sales Invoices</span>
                    <span className="font-bold text-slate-800">{(viewPartyData as any).salesInvoicesCount} Invoices</span>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewPartyModal(false);
                    handleOpenDeleteParty(viewPartyData);
                  }}
                  className="px-3 py-1.5 rounded text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5 border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Party</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewPartyModal(false);
                      handleOpenEditParty(viewPartyData);
                    }}
                    className="px-3.5 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5 border border-blue-300"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowViewPartyModal(false)}
                    className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PARTY MODAL */}
      {showEditPartyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Edit Party Profile & SQL Record
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">Code: {editPartyForm.code}</p>
              </div>
              <button
                onClick={() => setShowEditPartyModal(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditParty} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Party Entity Type:</label>
                  <select
                    value={editPartyForm.type}
                    onChange={e => setEditPartyForm({ ...editPartyForm, type: e.target.value as any })}
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500 bg-white"
                  >
                    <option value="CLIENT">Client (Customer)</option>
                    <option value="SUPPLIER">Supplier (Vendor / Sorter)</option>
                    <option value="AGENT">Clearing & Commission Agent</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Status:</label>
                  <div className="flex items-center gap-3 h-8">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPartyForm.isActive}
                        onChange={e => setEditPartyForm({ ...editPartyForm, isActive: e.target.checked })}
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Active in System</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Company / Party Name:</label>
                <input
                  type="text"
                  value={editPartyForm.name}
                  onChange={e => setEditPartyForm({ ...editPartyForm, name: e.target.value })}
                  placeholder="e.g. GOLDTEX FZC"
                  className={`w-full border rounded p-1.5 text-xs font-semibold text-slate-800 ${
                    editPartyForm.name.trim() && parties.some(p => p.id !== editPartyForm.id && p.name.trim().toLowerCase() === editPartyForm.name.trim().toLowerCase())
                      ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                  required
                />
                {(() => {
                  const clean = editPartyForm.name.trim().toLowerCase();
                  if (!clean) return null;
                  const dup = parties.find(p => p.id !== editPartyForm.id && p.name.trim().toLowerCase() === clean);
                  if (dup) {
                    return (
                      <div className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-200">
                        <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                        <span>Duplicate Name: Another party named "{dup.name}" is already registered as {dup.code} ({dup.type}). Cannot use this name.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Contact Person:</label>
                  <input
                    type="text"
                    value={editPartyForm.contactPerson}
                    onChange={e => setEditPartyForm({ ...editPartyForm, contactPerson: e.target.value })}
                    placeholder="Manager / Representative"
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Phone Number:</label>
                  <input
                    type="text"
                    value={editPartyForm.phone}
                    onChange={e => setEditPartyForm({ ...editPartyForm, phone: e.target.value })}
                    placeholder="+971 50 ..."
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Email Address:</label>
                  <input
                    type="email"
                    value={editPartyForm.email}
                    onChange={e => setEditPartyForm({ ...editPartyForm, email: e.target.value })}
                    placeholder="accountant@company.com"
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">TRN Tax Number:</label>
                  <input
                    type="text"
                    value={editPartyForm.trnNo}
                    onChange={e => setEditPartyForm({ ...editPartyForm, trnNo: e.target.value })}
                    placeholder="100..."
                    className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Address / Location:</label>
                <input
                  type="text"
                  value={editPartyForm.address}
                  onChange={e => setEditPartyForm({ ...editPartyForm, address: e.target.value })}
                  placeholder="Plot 12, Industrial Area, Dubai"
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Approved Credit Limit (AED):</label>
                <input
                  type="number"
                  value={editPartyForm.creditLimit}
                  onChange={e => setEditPartyForm({ ...editPartyForm, creditLimit: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs font-mono text-slate-800 focus:border-blue-500"
                />
              </div>

              {/* COA Accounts Mapping for Edit */}
              {editPartyForm.type === 'SUPPLIER' && (
                <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-amber-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold">SUPPLIER</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Payable Account (Liability):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.payableAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, payableAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'LIABILITY').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'LIABILITY'
                      }))}
                      placeholder="Select Payable Account (2110-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Stock Bale Inventory / Goods Clearing (Asset):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.clearingAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, clearingAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'ASSET').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'ASSET'
                      }))}
                      placeholder="Select Inventory Asset Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              {editPartyForm.type === 'CLIENT' && (
                <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 space-y-2 mt-2">
                  <div className="text-[10px] font-bold text-blue-900 uppercase flex items-center justify-between">
                    <span>🛡️ Linked COA Accounts</span>
                    <span className="text-[9px] bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-bold">CLIENT</span>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Accounts Receivable Account (Asset):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.receivableAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, receivableAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'ASSET').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'ASSET'
                      }))}
                      placeholder="Select Receivable Account (1130-00)..."
                      className="w-full bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      Sales Revenue Account (Revenue):
                    </label>
                    <SearchableSelect
                      value={editPartyForm.revenueAccountId}
                      onChange={val => setEditPartyForm({ ...editPartyForm, revenueAccountId: val })}
                      options={coaAccounts.filter(a => a.classification === 'REVENUE').map(a => ({
                        value: a.code,
                        label: `${a.code} - ${a.name}`,
                        badge: 'REVENUE'
                      }))}
                      placeholder="Select Sales Revenue Account..."
                      className="w-full bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEditPartyModal(false)}
                  className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE PARTY MODAL */}
      {showDeletePartyModal && deletingParty && (() => {
        const purCount = Number(deletingParty.purchaseInvoicesCount || (deletingParty as any).stats?.purchaseInvoicesCount || 0);
        const salesCount = Number(deletingParty.salesInvoicesCount || (deletingParty as any).stats?.salesInvoicesCount || 0);
        const khataCount = Number(deletingParty.khataLogsCount || (deletingParty as any).stats?.khataTransactionsCount || 0);
        const glCount = Number(deletingParty.glEntriesCount || (deletingParty as any).stats?.glEntriesCount || 0);
        const curBal = Number(deletingParty.currentBalance || (deletingParty as any).current_balance || 0);
        const totalEntries = purCount + salesCount + khataCount + glCount;
        const hasAnyEntries = Boolean(
          deletingParty.hasEntries ||
          totalEntries > 0 ||
          Math.abs(curBal) > 0.001
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              {hasAnyEntries ? (
                /* BLOCK DELETION: PARTY HAS FINANCIAL ENTRIES */
                <div>
                  <div className="flex items-center gap-3 text-amber-600 mb-3">
                    <div className="p-3 rounded-full bg-amber-100 border border-amber-300">
                      <Shield className="w-6 h-6 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Deletion Blocked (Financial Entries Exist)
                      </h3>
                      <p className="text-xs font-semibold text-amber-700">
                        اس پارٹی کے ریکارڈ میں انٹریز موجود ہیں — ڈیلیٹ ممنوع ہے
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-300 rounded-lg p-3.5 space-y-2.5 text-xs text-slate-800">
                    <p className="font-semibold text-slate-900">
                      Party <strong className="text-blue-900 underline">{deletingParty.name}</strong> ({deletingParty.code}) cannot be deleted because it contains recorded accounting transactions:
                    </p>

                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-white p-2.5 rounded border border-amber-200">
                      <div>• Purchase Invoices: <strong className="text-slate-900">{purCount}</strong></div>
                      <div>• Sales Invoices: <strong className="text-slate-900">{salesCount}</strong></div>
                      <div>• Khata Ledger Logs: <strong className="text-slate-900">{khataCount}</strong></div>
                      <div>• GL Vouchers: <strong className="text-slate-900">{glCount}</strong></div>
                      <div className="col-span-2 text-rose-700 font-bold border-t border-slate-100 pt-1">
                        • Current Khata Balance: AED {Math.abs(curBal).toLocaleString()} {curBal > 0 ? '(Dr - Receivable)' : curBal < 0 ? '(Cr - Payable)' : '(Settled)'}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                      اکاؤنٹنگ قوانین اور قانونی آڈٹ (VAT / Audit Integrity) کے تحت جس کسٹمر یا سپلائر کی کوئی بھی انٹری موجود ہو، اسے ڈیلیٹ نہیں کیا جا سکتا تاکہ آپ کا مالیاتی ریکارڈ محفوظ رہے۔ 
                    </p>
                    <p className="text-[11px] text-amber-900 font-bold bg-amber-100/70 p-2 rounded border border-amber-200">
                      💡 محفوظ حل: آپ اس پارٹی کو <strong>"Inactive"</strong> کر سکتے ہیں۔ اس سے یہ معمول کی سیلز یا پرچیز میں نظر نہیں آئے گی لیکن اس کا پچھلا کھاتہ اور انوائسز محفوظ رہیں گے۔
                    </p>
                  </div>

                  {deleteError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 leading-relaxed">
                      <strong className="block font-bold text-red-900 mb-1">Cannot Delete:</strong>
                      {deleteError}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeletePartyModal(false);
                        setDeleteError(null);
                      }}
                      className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                    >
                      Cancel (بند کریں)
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeactivateParty(deletingParty)}
                        disabled={isDeleting}
                        className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{isDeleting ? 'Archiving...' : 'Mark as Inactive (محفوظ رکھیں)'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={true}
                        className="px-3 py-1.5 rounded bg-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] cursor-not-allowed"
                        title="Deletion disabled because party has active entries"
                      >
                        Delete Blocked
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ALLOW DELETION: CLEAN PARTY WITH 0 ENTRIES */
                <div>
                  <div className="flex items-center gap-3 text-red-600 mb-3">
                    <div className="p-2.5 rounded-full bg-red-100">
                      <Trash2 className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Delete Clean Party</h3>
                      <p className="text-xs text-slate-500">Party has 0 transactions and can be safely removed</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Are you sure you want to permanently delete <strong className="text-slate-900 font-bold">{deletingParty.name}</strong> ({deletingParty.code})?
                  </p>

                  <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                    ✓ Verified: This party has <strong>0 invoices, 0 khata entries</strong>, and <strong>AED 0.00 balance</strong>. Deletion will safely remove this record from PostgreSQL.
                  </div>

                  {deleteError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 leading-relaxed">
                      <strong className="block font-bold text-red-900 mb-1">Cannot Delete:</strong>
                      {deleteError}
                    </div>
                  )}

                  <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeletePartyModal(false);
                        setDeleteError(null);
                      }}
                      disabled={isDeleting}
                      className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteParty}
                      disabled={isDeleting}
                      className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-xs flex items-center gap-1.5"
                    >
                      {isDeleting ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <span>Confirm Delete</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
