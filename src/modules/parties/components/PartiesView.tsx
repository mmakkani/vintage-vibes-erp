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
  CreditCard
} from 'lucide-react';

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
      const res = await fetch('/api/parties');
      const data = await res.json();
      setParties(data);
      if (data.length > 0 && !selectedParty) {
        selectParty(data[0]);
      } else if (selectedParty) {
        const updated = data.find((p: Party) => p.id === selectedParty.id);
        if (updated) setSelectedParty(updated);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadCoaAccounts = async () => {
    try {
      const res = await fetch('/api/finance/coa');
      const data = await res.json();
      if (Array.isArray(data)) setCoaAccounts(data);
    } catch (err) {
      console.warn('Failed to load COA for party provisioning:', err);
    }
  };

  const selectParty = async (party: Party) => {
    setSelectedParty(party);
    try {
      const res = await fetch(`/api/parties/${party.id}/khata`);
      const logs = await res.json();
      setKhataLogs(logs);
    } catch (err) {
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
    try {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partyForm)
      });
      const data = await res.json();
      setShowNewPartyModal(false);
      showMsg(`Added ${data.name} (${data.code}) and auto-provisioned COA sub-accounts!`);
      loadParties();
      onRefreshAll();
    } catch (err) {
      showMsg('Failed to add party', 'error');
    }
  };

  const handleRecordTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;

    try {
      const res = await fetch(`/api/parties/${selectedParty.id}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to record transaction', 'error');
      } else {
        showMsg(`Recorded ${txForm.type} of AED ${txForm.amount}! Updated Khata statement.`);
        setShowTransactionModal(false);
        loadParties();
        selectParty(selectedParty);
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Transaction error', 'error');
    }
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
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                        <span className="text-amber-600">★</span> VIP Verified
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-xs mt-1 flex items-center gap-1">
                      <span>{party.name}</span>
                    </h4>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Khata Balance</div>
                    <div className={`font-mono font-bold text-xs ${
                      party.currentBalance > 0
                        ? 'text-emerald-700'
                        : party.currentBalance < 0
                        ? 'text-rose-700'
                        : 'text-slate-600'
                    }`}>
                      AED {Math.abs(party.currentBalance).toLocaleString()}
                      <span className="text-[10px] font-sans font-normal ml-1">
                        {party.currentBalance > 0 ? '(Rec)' : party.currentBalance < 0 ? '(Pay)' : '(Nil)'}
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

                {/* Provisioned COA Mapping preview */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>Linked COA: {party.accountMap.receivableAccountId || party.accountMap.payableAccountId || 'Direct mapped'}</span>
                  <span>Limit: AED {party.creditLimit.toLocaleString()}</span>
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
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedParty.address || 'Dubai Garment District'} • Contact: {selectedParty.contactPerson || 'General Manager'}
                  </p>
                </div>

                <button
                  id="btn-record-party-payment"
                  onClick={() => setShowTransactionModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold text-[10px] uppercase tracking-wider shadow-xs transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Record Settlement</span>
                </button>
              </div>

              {/* Running Balance Banner */}
              <div className="px-3 grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Ledger Net Balance</div>
                  <div className={`text-base font-mono font-bold mt-0.5 ${
                    selectedParty.currentBalance > 0 ? 'text-emerald-700' : selectedParty.currentBalance < 0 ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    AED {Math.abs(selectedParty.currentBalance).toLocaleString()}
                    <span className="text-[10px] font-sans font-normal ml-1">
                      {selectedParty.currentBalance > 0 ? 'Customer Owes Us (Dr)' : selectedParty.currentBalance < 0 ? 'We Owe Supplier (Cr)' : 'Settled'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credit Facility</div>
                  <div className="text-base font-mono font-bold text-slate-800 mt-0.5">
                    AED {selectedParty.creditLimit.toLocaleString()}
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
                            {log.debit > 0 ? `AED ${log.debit.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-rose-700">
                            {log.credit > 0 ? `AED ${log.credit.toLocaleString()}` : '-'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-slate-900">
                            AED {log.balance.toLocaleString()}
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
                  className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500"
                  required
                />
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
                    <select
                      value={partyForm.payableAccountId}
                      onChange={e => setPartyForm({ ...partyForm, payableAccountId: e.target.value })}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 bg-white"
                    >
                      {coaAccounts.filter(a => a.classification === 'LIABILITY').length > 0 ? (
                        coaAccounts
                          .filter(a => a.classification === 'LIABILITY')
                          .map(a => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.name}
                            </option>
                          ))
                      ) : (
                        <option value="2110-00">2110-00 - Accounts Payable - Trade</option>
                      )}
                    </select>
                    <span className="text-[9px] text-slate-500">Credited when purchasing raw bales on credit</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      2. Stock Bale Inventory / Goods Clearing (Asset):
                    </label>
                    <select
                      value={partyForm.clearingAccountId}
                      onChange={e => setPartyForm({ ...partyForm, clearingAccountId: e.target.value })}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 bg-white"
                    >
                      {coaAccounts.filter(a => a.classification === 'ASSET').length > 0 ? (
                        coaAccounts
                          .filter(a => a.classification === 'ASSET')
                          .map(a => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.name}
                            </option>
                          ))
                      ) : (
                        <option value="1310-00">1310-00 - Raw Material - Bulk Bales</option>
                      )}
                    </select>
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
                    <select
                      value={partyForm.receivableAccountId}
                      onChange={e => setPartyForm({ ...partyForm, receivableAccountId: e.target.value })}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 bg-white"
                    >
                      {coaAccounts.filter(a => a.classification === 'ASSET').length > 0 ? (
                        coaAccounts
                          .filter(a => a.classification === 'ASSET')
                          .map(a => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.name}
                            </option>
                          ))
                      ) : (
                        <option value="1120-00">1120-00 - Accounts Receivable - Trade</option>
                      )}
                    </select>
                    <span className="text-[9px] text-slate-500">Debited when client purchases vintage apparel on credit</span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-0.5">
                      2. Sales Revenue Account (Revenue):
                    </label>
                    <select
                      value={partyForm.revenueAccountId}
                      onChange={e => setPartyForm({ ...partyForm, revenueAccountId: e.target.value })}
                      className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-800 bg-white"
                    >
                      {coaAccounts.filter(a => a.classification === 'REVENUE').length > 0 ? (
                        coaAccounts
                          .filter(a => a.classification === 'REVENUE')
                          .map(a => (
                            <option key={a.code} value={a.code}>
                              {a.code} - {a.name}
                            </option>
                          ))
                      ) : (
                        <option value="4110-00">4110-00 - Wholesale Sales Revenue</option>
                      )}
                    </select>
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
    </div>
  );
};
