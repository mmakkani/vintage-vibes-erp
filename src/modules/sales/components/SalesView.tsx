import React, { useState, useEffect } from 'react';
import { SalesGatePass, SalesInvoice } from '../sales.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { PieceBreakdownItem } from '../../purchase/purchase.types.ts';
import { StatusBadge } from '../../../components/StatusBadge.tsx';
import { ThermalBarcodeSticker, StickerData } from '../../../components/ThermalBarcodeSticker.tsx';
import { RoyalWaxSeal } from '../../../components/RoyalWaxSeal.tsx';
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner.ts';
import { LiveSellingStudio } from './LiveSellingStudio.tsx';
import { ParcelReturnProcessing } from './ParcelReturnProcessing.tsx';
import { DraftInvoicesManager } from './DraftInvoicesManager.tsx';
import { LiveSalesMasterLog } from './LiveSalesMasterLog.tsx';
import { CounterSalePOSTerminal } from './CounterSalePOSTerminal.tsx';
import { CounterSaleLogView } from './CounterSaleLogView.tsx';
import { CustomCompanySalesView } from './CustomCompanySalesView.tsx';
import { SalesChannelSettingsView } from './SalesChannelSettingsView.tsx';
import { useSync } from '../../../context/SyncContext.tsx';
import { SalesService } from '../../../services/salesService.ts';
import { PartiesService } from '../../../services/partiesService.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';
import {
  ShoppingCart,
  Store,
  ExternalLink,
  Plus,
  Barcode,
  CheckCircle,
  XCircle,
  ArrowRightCircle,
  Printer,
  Receipt,
  Search,
  UserCheck,
  FileText,
  BadgePercent,
  MessageCircle,
  Tag,
  Zap,
  RotateCcw,
  Building2,
  Settings
} from 'lucide-react';

interface SalesViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
  onSubTabChange?: (tab: string) => void;
}

export const SalesView: React.FC<SalesViewProps> = ({ onRefreshAll, currentUserRole, onSubTabChange }) => {
  const { syncVersion } = useSync();
  const [subTab, setSubTabState] = useState<'counterSale' | 'customSale' | 'liveSelling' | 'drafts' | 'masterLog' | 'returns' | 'salesSettings'>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sub = urlParams.get('subTab') as any;
      if (sub && ['counterSale', 'customSale', 'liveSelling', 'drafts', 'masterLog', 'returns', 'salesSettings'].includes(sub)) {
        return sub;
      }
      const saved = localStorage.getItem('vintage_sales_subtab') as any;
      if (saved && ['counterSale', 'customSale', 'liveSelling', 'drafts', 'masterLog', 'returns', 'salesSettings'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'counterSale';
  });

  const setSubTab = (tab: 'counterSale' | 'customSale' | 'liveSelling' | 'drafts' | 'masterLog' | 'returns' | 'salesSettings') => {
    setSubTabState(tab);
    try {
      localStorage.setItem('vintage_sales_subtab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('subTab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch {}
    if (onSubTabChange) onSubTabChange(tab);
  };

  const [gatePasses, setGatePasses] = useState<SalesGatePass[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [clients, setClients] = useState<Party[]>([]);
  const [stockPieces, setStockPieces] = useState<PieceBreakdownItem[]>([]);

  // Selected gate pass for scanning
  const [selectedGatePassId, setSelectedGatePassId] = useState<string>('');
  const [scanBarcodeInput, setScanBarcodeInput] = useState('');

  // Modals & form state
  const [showNewGatePassModal, setShowNewGatePassModal] = useState(false);
  const [newGatePassCustomer, setNewGatePassCustomer] = useState('');
  const [selectedInvoiceForReceipt, setSelectedInvoiceForReceipt] = useState<SalesInvoice | null>(null);
  const [selectedStickerData, setSelectedStickerData] = useState<StickerData | null>(null);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Universal USB/Bluetooth Laser Barcode Scanner Listener
  useBarcodeScanner({
    onScan: async (code) => {
      if (!selectedGatePassId) {
        showMsg(`Barcode Gun Scanned: "${code}". Please select an active Sales Gate Pass first!`, 'error');
        return;
      }
      try {
        const res = await fetch(`/api/sales/gate-passes/${selectedGatePassId}/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode: code.trim() })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showMsg(data.error || `Barcode ${code} scan failed`, 'error');
        } else {
          showMsg(`⚡ Gun Scanned: ${code} added to active dispatch!`);
          loadData();
          onRefreshAll();
        }
      } catch (err) {
        showMsg('Gun scanner network error', 'error');
      }
    }
  });

  const sendWhatsAppNotification = (inv: SalesInvoice) => {
    const client = (clients || []).find(c => c.id === inv.customerId);
    const phone = (client?.phone || inv.customerPhone || '').replace(/[^0-9]/g, '');
    const itemsCount = Array.isArray(inv?.items) ? inv.items.length : 0;
    const text = encodeURIComponent(
      `🚚 *VINTAGE VIBES DUBAI - B2B DISPATCH ADVICE*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📄 *Invoice No:* ${inv.invoiceNo}\n` +
      `🏢 *Client:* ${inv.customerName}\n` +
      `📅 *Date:* ${inv.date}\n` +
      `📦 *Items Dispatched:* ${itemsCount} Graded Garments\n` +
      `💰 *Total Amount:* AED ${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Incl. 5% UAE VAT)\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📍 *Warehouse:* Al Quoz Industrial 3, Dubai\n` +
      `📞 *Support:* +971 4 883 9120\n` +
      `Thank you for your valued business!`
    );
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const loadData = async (retries = 2) => {
    const safeFetch = async (url: string) => {
      for (let i = 0; i <= retries; i++) {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          return await r.json();
        } catch (e) {
          if (i < retries) {
            await new Promise(res => setTimeout(res, 500 * (i + 1)));
          }
        }
      }
      return [];
    };

    try {
      const [invRes, clientsRes, stockRes] = await Promise.all([
        SalesService.getSalesInvoices().catch(() => []),
        PartiesService.getParties().then(pts => pts.filter(p => p.type === 'CLIENT')).catch(() => []),
        PurchaseService.getInventoryPieces().then(pcs => pcs.filter(p => !p.isSold)).catch(() => [])
      ]);

      if (Array.isArray(invRes)) setInvoices(invRes);
      if (Array.isArray(clientsRes)) setClients(clientsRes);
      if (Array.isArray(stockRes)) setStockPieces(stockRes);

      if (Array.isArray(clientsRes) && clientsRes.length > 0 && !newGatePassCustomer) {
        setNewGatePassCustomer(clientsRes[0].id);
      }
    } catch (err) {
      console.warn('Sales sync warning:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [syncVersion]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // Create Sales Gate Pass
  const handleCreateGatePass = async (e: React.FormEvent) => {
    e.preventDefault();
    const customer = clients.find(c => c.id === newGatePassCustomer);
    try {
      const res = await fetch('/api/sales/gate-passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: newGatePassCustomer,
          customerName: customer?.name || 'Walk-in Boutique Client'
        })
      });
      const data = await res.json();
      setShowNewGatePassModal(false);
      showMsg(`Created Sales Gate Pass ${data.gatePassNo}`);
      setSelectedGatePassId(data.id);
      loadData();
      onRefreshAll();
    } catch (err) {
      showMsg('Failed to create sales gate pass', 'error');
    }
  };

  // Scan Barcode
  const handleScanBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanBarcodeInput.trim()) return;

    try {
      const res = await fetch(`/api/sales/gate-passes/${selectedGatePassId}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: scanBarcodeInput.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Barcode scan failed', 'error');
      } else {
        showMsg(`Scanned barcode ${scanBarcodeInput.trim()} into gate pass!`);
        setScanBarcodeInput('');
        loadData();
      }
    } catch (err) {
      showMsg('Scan error', 'error');
    }
  };

  // Post / Unpost Sales Gate Pass
  const handlePostGatePass = async (id: string) => {
    try {
      const res = await fetch(`/api/sales/gate-passes/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postedBy: 'Sales Floor Lead' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to post gate pass', 'error');
      } else {
        showMsg('Sales Gate Pass verified and POSTED!');
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Posting error', 'error');
    }
  };

  const handleUnpostGatePass = async (id: string) => {
    try {
      const res = await fetch(`/api/sales/gate-passes/${id}/unpost`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to unpost gate pass', 'error');
      } else {
        showMsg('Sales Gate Pass unposted.');
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Unposting error', 'error');
    }
  };

  // 1-Click Conversion: Gate Pass to Sales Invoice
  const handle1ClickConversion = async (id: string) => {
    try {
      const res = await fetch(`/api/sales/gate-passes/${id}/convert-invoice`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Conversion failed', 'error');
      } else {
        showMsg(`1-Click Converted to Sales Invoice ${data.invoice.invoiceNo}!`);
        setSubTab('invoices');
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Conversion error', 'error');
    }
  };

  // Post / Unpost Sales Invoice (Triggers automatic COA posting & stock deduction)
  const handlePostInvoice = async (id: string) => {
    try {
      await SalesService.updateSalesInvoice(id, { status: 'PAID' });
      showMsg('Sales Invoice posted! Deducted stock barcodes, updated customer khata, and dispatched dual-entry COA journal.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Posting error', 'error');
    }
  };

  const handleUnpostInvoice = async (id: string) => {
    try {
      await SalesService.updateSalesInvoice(id, { status: 'DRAFT' });
      showMsg('Sales Invoice unposted, stock barcodes restored, and COA journal reversed.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Unposting error', 'error');
    }
  };

  const activeGatePass = gatePasses.find(g => g.id === selectedGatePassId) || gatePasses[0];

  return (
    <div className="space-y-3">
      {/* Sub navigation buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              id="subtab-sales-counter-sale"
              onClick={() => setSubTab('counterSale')}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                subTab === 'counterSale'
                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/50'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>🛒 Counter Sale (POS)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const width = Math.min(window.screen.availWidth - 80, 1440);
                const height = Math.min(window.screen.availHeight - 80, 920);
                const left = Math.max(0, (window.screen.availWidth - width) / 2);
                const top = Math.max(0, (window.screen.availHeight - height) / 2);
                window.open(
                  '/?view=pos',
                  'VintagePOSRegister',
                  `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
                );
              }}
              title="Open Counter Sale in Standalone Pop-up Window"
              className="px-2 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline text-[10px]">Pop-up</span>
            </button>
          </div>
          <button
            id="subtab-sales-custom-b2b"
            onClick={() => setSubTab('customSale')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'customSale'
                ? 'bg-indigo-700 text-white shadow-sm ring-2 ring-indigo-400/50'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>🏢 Company / Custom Sales</span>
          </button>
          <button
            id="subtab-sales-live-selling"
            onClick={() => setSubTab('liveSelling')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'liveSelling'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span>🔴 Live Selling Studio</span>
          </button>
          <button
            id="subtab-sales-drafts"
            onClick={() => setSubTab('drafts')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'drafts'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 text-amber-700" />
            <span>📦 Live Drafts & Dispatch Hub ({invoices.filter(i => i.status === 'DRAFT').length})</span>
          </button>
          <button
            id="subtab-sales-master-log"
            onClick={() => setSubTab('masterLog')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'masterLog'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            <span>📋 Dispatched Sales Log ({invoices.filter(i => i.status === 'POSTED').length})</span>
          </button>
          <button
            id="subtab-sales-returns"
            onClick={() => setSubTab('returns')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'returns'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
            <span>🔄 Parcel Returns (RTO)</span>
          </button>
          <button
            id="subtab-sales-settings"
            onClick={() => setSubTab('salesSettings')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'salesSettings'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-purple-600" />
            <span>⚙️ Sales & COA Settings</span>
          </button>
        </div>

        {subTab === 'gatePasses' && (
          <button
            id="btn-new-sales-gatepass"
            onClick={() => setShowNewGatePassModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Sales Gate Pass</span>
          </button>
        )}
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

      {/* ===================== SUBTAB: COUNTER SALE POS & REGISTER LOGS ===================== */}
      {subTab === 'counterSale' && (
        <CounterSaleLogView
          invoices={invoices}
          stockPieces={stockPieces}
          clients={clients}
          currentUserRole={currentUserRole}
          onRefreshAll={() => {
            loadData();
            onRefreshAll();
          }}
          onSelectInvoiceForReceipt={(inv) => setSelectedInvoiceForReceipt(inv)}
        />
      )}

      {/* ===================== SUBTAB: CORPORATE & WHOLESALE B2B CUSTOM SALES ===================== */}
      {subTab === 'customSale' && (
        <CustomCompanySalesView
          clients={clients}
          currentUserRole={currentUserRole}
          onRefreshAll={() => {
            loadData();
            onRefreshAll();
          }}
          invoices={invoices}
        />
      )}

      {/* ===================== SUBTAB 0: LIVE SELLING & MULTISTREAM STUDIO ===================== */}
      {subTab === 'liveSelling' && (
        <LiveSellingStudio
          stockPieces={stockPieces}
          clients={clients}
          onRefreshAll={() => {
            loadData();
            onRefreshAll();
          }}
          onInvoiceCreated={(newInv) => {
            setInvoices(prev => [newInv, ...prev]);
            setSelectedInvoiceForReceipt(newInv);
          }}
        />
      )}

      {/* ===================== SUBTAB: LIVE SALES MASTER LOG ===================== */}
      {subTab === 'masterLog' && (
        <LiveSalesMasterLog
          invoices={invoices}
          onSelectInvoiceForReceipt={(inv) => setSelectedInvoiceForReceipt(inv)}
          onRefresh={loadData}
        />
      )}

      {/* ===================== SUBTAB: DRAFT INVOICES & BUNDLING ===================== */}
      {subTab === 'drafts' && (
        <DraftInvoicesManager
          invoices={invoices}
          stockPieces={stockPieces}
          clients={clients}
          onRefresh={() => {
            loadData();
            onRefreshAll();
          }}
          onPostSuccess={() => {
            loadData();
            onRefreshAll();
          }}
        />
      )}

      {/* ===================== SUBTAB: SALES & COA SETTINGS ===================== */}
      {subTab === 'salesSettings' && (
        <SalesChannelSettingsView
          onRefreshAll={() => {
            loadData();
            onRefreshAll();
          }}
        />
      )}

      {/* ===================== SUBTAB 1: SALES GATE PASS & RAPID SCANNER ===================== */}
      {subTab === 'gatePasses' && (
        <div className="space-y-3">
          {/* Active Gate pass selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Sales Pass:</span>
              <select
                id="select-active-sales-gatepass"
                value={selectedGatePassId}
                onChange={e => setSelectedGatePassId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500"
              >
                {(gatePasses || []).map(g => (
                  <option key={g.id} value={g.id}>
                    {g.gatePassNo} ({g.customerName}) — {g.status}
                  </option>
                ))}
              </select>
            </div>

            {activeGatePass && (
              <div className="flex items-center gap-1.5">
                <StatusBadge status={activeGatePass.status} />

                {activeGatePass.status === 'DRAFT' && (
                  <button
                    id="btn-post-sales-gatepass"
                    onClick={() => handlePostGatePass(activeGatePass.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase tracking-wider shadow-xs transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Post Gate Pass</span>
                  </button>
                )}

                {activeGatePass.status === 'POSTED' && (
                  <>
                    {!activeGatePass.isConverted && (
                      <button
                        id="btn-1click-convert-invoice"
                        onClick={() => handle1ClickConversion(activeGatePass.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-[11px] font-bold uppercase tracking-wider shadow-xs transition-colors"
                      >
                        <ArrowRightCircle className="w-3.5 h-3.5" />
                        <span>1-Click Convert to Sales Invoice</span>
                      </button>
                    )}

                    {!activeGatePass.isConverted && (
                      <button
                        id="btn-unpost-sales-gatepass"
                        onClick={() => handleUnpostGatePass(activeGatePass.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold uppercase tracking-wider border border-amber-300 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Unpost</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {activeGatePass && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer (Khata)</div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{activeGatePass.customerName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">Date: {activeGatePass.date}</div>
                </div>

                <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pieces & Weight</div>
                  <div className="text-lg font-mono font-bold text-blue-900 mt-0.5">
                    {activeGatePass.totalPieces} pcs <span className="text-xs text-slate-500 font-normal">({activeGatePass.totalWeight.toFixed(2)} KG)</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Subtotal</div>
                  <div className="text-lg font-mono font-black text-emerald-700 mt-0.5">
                    AED {activeGatePass.estimatedAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* RAPID BARCODE SCANNING INPUT */}
              {activeGatePass.status === 'DRAFT' && (
                <div className="bg-white rounded border border-slate-200 p-3.5 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-blue-700" />
                      <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                        Rapid Barcode Scanner (POS / Handheld Reader Input)
                      </span>
                    </div>

                    {stockPieces.length > 0 && (
                      <span className="text-[11px] text-slate-500 font-medium">
                        Available in Stock: <span className="font-bold font-mono text-blue-900">{stockPieces.length}</span> pieces
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleScanBarcode} className="flex gap-2">
                    <input
                      id="input-sales-scan-barcode"
                      type="text"
                      placeholder="Scan or type garment barcode (e.g. VV-IGP20260001-0003)..."
                      value={scanBarcodeInput}
                      onChange={e => setScanBarcodeInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500"
                    />
                    <button
                      id="btn-submit-barcode-scan"
                      type="submit"
                      className="px-3.5 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Scan & Add</span>
                    </button>
                  </form>

                  {/* Quick Click Available Barcodes from Inventory */}
                  {(stockPieces || []).length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Quick-Select Available Stock Barcodes:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(stockPieces || []).slice(0, 6).map(piece => (
                          <button
                            key={piece.id}
                            type="button"
                            onClick={() => setScanBarcodeInput(piece.barcode)}
                            className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded px-2 py-0.5 text-[10px] font-mono text-blue-800 transition-colors"
                          >
                            {piece.barcode} ({piece.brandName} - AED {piece.estimatedPrice})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SCANNED PIECES GRID */}
              <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Scanned Pieces on this Gate Pass ({(activeGatePass?.items || []).length} items)
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">Live Floor Verification</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Barcode</th>
                        <th className="px-3 py-2">Item Description</th>
                        <th className="px-3 py-2">Brand</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Weight</th>
                        <th className="px-3 py-2">Unit Price</th>
                        <th className="px-3 py-2">Disc %</th>
                        <th className="px-3 py-2">Net Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(activeGatePass?.items || []).map(item => (
                        <tr key={item.id} className="hover:bg-blue-50/40 font-mono">
                          <td className="px-3 py-1.5 font-bold text-blue-900">
                            <span className="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                              {item.barcode}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-sans text-slate-800">{item.itemName}</td>
                          <td className="px-3 py-1.5 font-sans font-semibold text-slate-900">{item.brandName}</td>
                          <td className="px-3 py-1.5 font-bold text-slate-700">{item.size}</td>
                          <td className="px-3 py-1.5 text-slate-700">{item.weightKg} KG</td>
                          <td className="px-3 py-1.5 font-medium text-slate-700">AED {item.unitPrice}</td>
                          <td className="px-3 py-1.5 text-slate-500">{item.discountPercent}%</td>
                          <td className="px-3 py-1.5 font-bold text-emerald-700">AED {item.netPrice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================== SUBTAB 2: FINALIZED SALES INVOICES & RECEIPTS ===================== */}
      {subTab === 'invoices' && (
        <div className="space-y-3">
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Finalized Sales Invoices & Customer Receipts</h3>
                <p className="text-[11px] text-slate-500">
                  Includes 5% UAE VAT, stock deduction, and automatic dual-entry COA ledger postings
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Invoice No</th>
                    <th className="px-3 py-2">Customer Name</th>
                    <th className="px-3 py-2">Gate Pass Ref</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Subtotal</th>
                    <th className="px-3 py-2">5% VAT</th>
                    <th className="px-3 py-2">Total (AED)</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(invoices || []).map(inv => (
                    <tr key={inv.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-blue-900">{inv.invoiceNo}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{inv.customerName}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{inv.salesGatePassNo || 'Direct'}</td>
                      <td className="px-3 py-2 text-slate-600">{inv.date}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-3 py-2 font-mono">AED {Number(inv?.subTotal ?? (inv as any)?.subtotal ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">AED {Number(inv?.vatAmount ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">
                        AED {Number(inv?.totalAmount ?? (inv as any)?.grand_total ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                        <button
                          id={`btn-view-receipt-${inv.id}`}
                          onClick={() => setSelectedInvoiceForReceipt(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider border border-slate-300 cursor-pointer"
                        >
                          <Receipt className="w-3 h-3 text-slate-600" />
                          <span>Receipt</span>
                        </button>

                        <button
                          id={`btn-whatsapp-invoice-${inv.id}`}
                          onClick={() => sendWhatsAppNotification(inv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider border border-emerald-300 cursor-pointer transition-colors"
                          title="Share Dispatch via WhatsApp"
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-600" />
                          <span>WhatsApp</span>
                        </button>

                        {inv.status === 'DRAFT' && (
                          <button
                            id={`btn-post-invoice-${inv.id}`}
                            onClick={() => handlePostInvoice(inv.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider shadow-xs transition-colors cursor-pointer"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Post & Journal</span>
                          </button>
                        )}

                        {inv.status === 'POSTED' && (
                          <button
                            id={`btn-unpost-invoice-${inv.id}`}
                            onClick={() => handleUnpostInvoice(inv.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] uppercase tracking-wider border border-amber-300 transition-colors"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Unpost</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: PARCEL RETURNS & RTO PROCESSING ENGINE */}
      {subTab === 'returns' && (
        <ParcelReturnProcessing
          onRefreshAll={() => {
            loadData();
            onRefreshAll();
          }}
          currentUserRole={currentUserRole}
        />
      )}

      {/* NEW SALES GATE PASS MODAL */}
      {showNewGatePassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Create New Sales Gate Pass</h3>
            <form onSubmit={handleCreateGatePass} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Select Client (Parties Khata):</label>
                <select
                  value={newGatePassCustomer}
                  onChange={e => setNewGatePassCustomer(e.target.value)}
                  className="w-full border border-slate-300 rounded p-2 text-xs text-slate-800 focus:border-blue-500"
                  required
                >
                  {(clients || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewGatePassModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs"
                >
                  Create Gate Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ITEMIZED CUSTOMER RECEIPT MODAL */}
      {selectedInvoiceForReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-lg w-full p-5 shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</h3>
                <p className="text-[10px] text-slate-500">Al Jimi, Al Ain, Abu Dhabi, UAE • TRN-100482910300003</p>
              </div>
              <button
                onClick={() => setSelectedInvoiceForReceipt(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between font-mono text-[11px]">
                <span>Invoice No: <strong className="text-blue-900">{selectedInvoiceForReceipt.invoiceNo}</strong></span>
                <span>Date: {selectedInvoiceForReceipt.date}</span>
              </div>
              <div className="border-b border-dashed border-slate-200 pb-2 text-[11px]">
                <div>Billed to: <strong className="text-slate-900">{selectedInvoiceForReceipt.customerName}</strong></div>
                {selectedInvoiceForReceipt.customerTrn && (
                  <div className="text-[10px] text-slate-500">TRN: {selectedInvoiceForReceipt.customerTrn}</div>
                )}
              </div>

              {/* Items */}
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-1">Barcode / Description</th>
                    <th className="py-1 text-right">Price</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedInvoiceForReceipt?.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-1 font-sans">
                        <div className="font-bold text-slate-900 text-xs">{it.description}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{it.barcode} ({it.weightKg} KG)</div>
                      </td>
                      <td className="py-1 text-right">AED {it.unitPrice}</td>
                      <td className="py-1 text-right font-bold text-slate-800">AED {it.finalAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="pt-2 border-t border-slate-200 space-y-1 font-mono text-right text-xs relative">
                {/* 3D Royal Gold Seal on Invoices */}
                <div className="absolute left-2 -top-1 pointer-events-none">
                  <RoyalWaxSeal
                    sealText="PAID & VERIFIED"
                    subText="DUBAI TRN VALIDATED"
                    size="sm"
                    date={selectedInvoiceForReceipt.date}
                    approver="SALES DESK"
                  />
                </div>

                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>AED {selectedInvoiceForReceipt.subTotal.toFixed(2)}</span>
                </div>
                {selectedInvoiceForReceipt.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount:</span>
                    <span>- AED {selectedInvoiceForReceipt.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>5% UAE VAT:</span>
                  <span>AED {selectedInvoiceForReceipt.vatAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-dashed border-slate-300">
                  <span>TOTAL BILLABLE:</span>
                  <span>AED {selectedInvoiceForReceipt.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <button
                onClick={() => sendWhatsAppNotification(selectedInvoiceForReceipt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-xs cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send via WhatsApp</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedInvoiceForReceipt(null)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px] cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold uppercase tracking-wider text-[11px] shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Print Tax Receipt</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL BARCODE STICKER MODAL */}
      {selectedStickerData && (
        <ThermalBarcodeSticker
          sticker={selectedStickerData}
          onClose={() => setSelectedStickerData(null)}
        />
      )}
    </div>
  );
};
