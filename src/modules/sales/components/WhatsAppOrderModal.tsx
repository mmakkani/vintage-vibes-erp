import React, { useState, useEffect } from 'react';
import { SalesInvoice } from '../sales.types.ts';
import {
  MessageSquare,
  Copy,
  CheckCircle,
  X,
  ExternalLink,
  Phone,
  Truck,
  DollarSign,
  Package,
  Send,
  Loader2,
  Image as ImageIcon,
  Zap,
  Download,
  FileText
} from 'lucide-react';
import { WhatsAppService } from '../../../services/whatsappService.ts';
import { supabase } from '../../../supabaseClient.ts';
import { generateCourierSlipPngDataUrl } from '../../../utils/courierSlipRenderer.ts';
import { generatePhotoInvoicePngDataUrl } from '../../../utils/photoInvoiceRenderer.ts';

interface WhatsAppOrderModalProps {
  invoice: SalesInvoice;
  onClose: () => void;
}

export const WhatsAppOrderModal: React.FC<WhatsAppOrderModalProps> = ({
  invoice,
  onClose
}) => {
  const initialPhone = WhatsAppService.isValidPhoneNumber(invoice.customerPhone)
    ? (invoice.customerPhone || '')
    : '';
  const [phone, setPhone] = useState(initialPhone);
  const [activeTab, setActiveTab] = useState<'PHOTO_INVOICE' | 'COURIER_SLIP' | 'TEXT'>('PHOTO_INVOICE');
  const [invoicePngUrl, setInvoicePngUrl] = useState<string | null>(null);
  const [slipPngUrl, setSlipPngUrl] = useState<string | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isGeneratingSlip, setIsGeneratingSlip] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Auto-generate PNG Photo Invoice & PNG Courier Waybill on modal open
  useEffect(() => {
    let isMounted = true;
    setIsGeneratingInvoice(true);
    setIsGeneratingSlip(true);

    // 1. Generate Photo Tax Invoice
    generatePhotoInvoicePngDataUrl(invoice)
      .then(pngData => {
        if (isMounted) setInvoicePngUrl(pngData);
      })
      .catch(err => {
        console.warn('[WhatsAppOrderModal] Error generating photo invoice PNG:', err);
      })
      .finally(() => {
        if (isMounted) setIsGeneratingInvoice(false);
      });

    // 2. Generate Courier Waybill Slip
    generateCourierSlipPngDataUrl(invoice)
      .then(pngData => {
        if (isMounted) setSlipPngUrl(pngData);
      })
      .catch(err => {
        console.warn('[WhatsAppOrderModal] Error generating slip PNG:', err);
      })
      .finally(() => {
        if (isMounted) setIsGeneratingSlip(false);
      });

    return () => {
      isMounted = false;
    };
  }, [invoice]);

  // Generate formatted WhatsApp message
  const generateMessage = () => {
    const courier = invoice.courierPartner || 'DHL Express UAE';
    const tracking = invoice.trackingNumber || 'Pending Dispatch';
    const isCustomerShipping = (invoice.shippingBearer || 'CUSTOMER') === 'CUSTOMER';
    const shippingAmount = invoice.shippingFeeAed ?? (invoice.shippingCharge ?? 25);
    const address = invoice.shippingAddress || 'Dubai / UAE Delivery';
    const paymentModeLabel =
      invoice.paymentMethod === 'COD'
        ? 'Cash on Delivery (COD)'
        : invoice.paymentMethod === 'BANK_TRANSFER'
        ? 'Bank Wire Transfer'
        : invoice.paymentMethod === 'CARD_POS'
        ? 'Card Payment Link / POS'
        : 'Cash';

    const paymentStatusLabel =
      invoice.paymentStatus === 'PREPAID_VERIFIED'
        ? '✅ PAID & VERIFIED'
        : invoice.paymentStatus === 'PARTIAL_ADVANCE'
        ? '⏳ PARTIAL ADVANCE'
        : '⚠️ TO BE COLLECTED ON DELIVERY';

    const itemsList = invoice.items
      .map(
        (item, idx) =>
          `${idx + 1}. *${item.description || item.itemName || 'Garment'}* [${item.barcode}]\n   Price: AED ${(
            item.finalAmount || item.unitPrice
          ).toFixed(2)}`
      )
      .join('\n');

    return `🌟 *VINTAGE VIBE - LIVE STREAM ORDER DISPATCH* 🌟
----------------------------------------
👤 *Customer:* ${invoice.customerName}
📄 *Invoice #:* ${invoice.invoiceNo}
🚚 *Courier Partner:* ${courier}
🏷️ *Waybill / Tracking:* ${tracking}
📍 *Delivery Address:* ${address}

🛍️ *CLAIMED VINTAGE PIECES:*
${itemsList}

💰 *PAYMENT & BILLING BREAKDOWN:*
• Subtotal (${invoice.items.length} Items): AED ${(invoice.subTotal || 0).toFixed(2)}
• Delivery Fee: ${isCustomerShipping ? `AED ${shippingAmount.toFixed(2)} (Customer)` : 'FREE (Absorbed by Company)'}
• 5% UAE FTA VAT: AED ${(invoice.vatAmount || 0).toFixed(2)}
----------------------------------------
⭐ *GRAND TOTAL TO PAY:* *AED ${(invoice.grandTotalAED || invoice.totalAmount || 0).toFixed(2)}*
💳 *Payment Mode:* ${paymentModeLabel}
📌 *Payment Status:* ${paymentStatusLabel}
----------------------------------------
🙏 *Thank you for streaming with Vintage Vibe!*
Please reply *"CONFIRMED"* or send your live Google Maps location pin so ${courier} can schedule immediate delivery.`;
  };

  const messageText = generateMessage();

  const handleCopy = () => {
    navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const updateCustomerPhoneInDb = async (cleanPhone: string) => {
    if (invoice.id || invoice.invoiceNo) {
      try {
        await supabase
          .from('sales_invoices')
          .update({ customer_phone: cleanPhone })
          .eq('invoice_no', invoice.invoiceNo);
        invoice.customerPhone = cleanPhone;
      } catch (_) {}
    }
  };

  // 1-Click Send BOTH Courier Waybill AND Professional Photo Invoice PNG
  const handleSendBothPng = async () => {
    const cleanPhone = WhatsAppService.sanitizePhoneNumber(phone);
    if (!cleanPhone || !WhatsAppService.isValidPhoneNumber(cleanPhone)) {
      alert('Please enter a valid phone number with country code (+971 / +92).');
      return;
    }
    setIsSending(true);
    setSendSuccess(null);
    try {
      const slipData = slipPngUrl || (await generateCourierSlipPngDataUrl(invoice));
      const invoiceData = invoicePngUrl || (await generatePhotoInvoicePngDataUrl(invoice));
      setSlipPngUrl(slipData);
      setInvoicePngUrl(invoiceData);

      const totalAmt = Number(invoice.totalAmount || invoice.grandTotalAED || 0);
      const res = await WhatsAppService.sendBothSlipAndInvoiceImages(
        cleanPhone,
        slipData,
        invoiceData,
        invoice.invoiceNo,
        invoice.courierPartner,
        totalAmt
      );

      if (res && res.success) {
        setSendSuccess('📸 Both Courier Waybill & Photo Tax Invoice dispatched to WhatsApp!');
        await updateCustomerPhoneInDb(cleanPhone);
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        alert(res?.error || 'Failed to dispatch documents to WhatsApp.');
      }
    } catch (err: any) {
      alert('Error rendering or dispatching PNGs: ' + (err?.message || err));
    } finally {
      setIsSending(false);
    }
  };

  // Send ONLY Professional Photo Invoice PNG
  const handleSendPhotoInvoicePng = async () => {
    const cleanPhone = WhatsAppService.sanitizePhoneNumber(phone);
    if (!cleanPhone || !WhatsAppService.isValidPhoneNumber(cleanPhone)) {
      alert('Please enter a valid phone number with country code (+971 / +92).');
      return;
    }
    setIsSending(true);
    setSendSuccess(null);
    try {
      const invoiceData = invoicePngUrl || (await generatePhotoInvoicePngDataUrl(invoice));
      setInvoicePngUrl(invoiceData);

      const res = await WhatsAppService.sendPhotoInvoiceImage(cleanPhone, invoiceData, '', invoice.invoiceNo);

      if (res && res.success) {
        setSendSuccess('📸 Professional Photo Tax Invoice dispatched to WhatsApp (Photo Only)!');
        await updateCustomerPhoneInDb(cleanPhone);
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        alert(res?.error || 'Failed to dispatch photo invoice to WhatsApp.');
      }
    } catch (err: any) {
      alert('Error rendering photo invoice PNG: ' + (err?.message || err));
    } finally {
      setIsSending(false);
    }
  };

  // Send ONLY Courier Shipping Waybill PNG
  const handleSendSlipPng = async () => {
    const cleanPhone = WhatsAppService.sanitizePhoneNumber(phone);
    if (!cleanPhone || !WhatsAppService.isValidPhoneNumber(cleanPhone)) {
      alert('Please enter a valid phone number with country code (+971 / +92).');
      return;
    }
    setIsSending(true);
    setSendSuccess(null);
    try {
      const pngData = slipPngUrl || (await generateCourierSlipPngDataUrl(invoice));
      setSlipPngUrl(pngData);

      const res = await WhatsAppService.sendCourierSlipAndInvoiceImage(cleanPhone, pngData, '', invoice.invoiceNo);
      if (res && res.success) {
        setSendSuccess('🚚 Courier Waybill Slip PNG dispatched to WhatsApp (Photo Only)!');
        await updateCustomerPhoneInDb(cleanPhone);
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        alert(res?.error || 'Failed to dispatch courier slip image to WhatsApp.');
      }
    } catch (err: any) {
      alert('Error rendering courier slip PNG: ' + (err?.message || err));
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(messageText);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-emerald-300 animate-in fade-in zoom-in-95 max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>WhatsApp Photo Invoice & Courier Slip</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  {invoice.invoiceNo}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Dispatches high-definition PNG photos directly into customer's WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Phone Input */}
        <div className="mb-3">
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
            <span>Customer WhatsApp Number</span>
            <span className="text-[10px] text-slate-400">Include country code e.g. +971501234567</span>
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5" />
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+971 50 123 4567"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('PHOTO_INVOICE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'PHOTO_INVOICE'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>📸 Photo Tax Invoice (Pictures)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('COURIER_SLIP')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'COURIER_SLIP'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>🚚 Courier Waybill (4x6 Slip)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('TEXT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'TEXT'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>📝 Text Summary</span>
          </button>
        </div>

        {/* Tab 1: Professional Photo Tax Invoice Preview */}
        {activeTab === 'PHOTO_INVOICE' && (
          <div className="flex-1 overflow-y-auto mb-3 bg-slate-900 rounded-xl p-3 border border-slate-800 flex flex-col items-center justify-center min-h-[240px]">
            {isGeneratingInvoice ? (
              <div className="flex flex-col items-center justify-center p-6 text-amber-400 gap-2">
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-xs font-mono font-medium">Fetching garment photos & rendering Photo Tax Invoice PNG...</span>
              </div>
            ) : invoicePngUrl ? (
              <div className="space-y-2 w-full text-center">
                <div className="relative group max-w-full inline-block">
                  <img
                    src={invoicePngUrl}
                    alt="Professional Picture-Based Tax Invoice"
                    className="max-h-[340px] max-w-full object-contain mx-auto rounded-lg shadow-xl border border-slate-700 bg-white"
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/80 p-1 rounded-md backdrop-blur-xs">
                    <button
                      onClick={() => downloadImage(invoicePngUrl, `Invoice_${invoice.invoiceNo}_Photo.png`)}
                      className="p-1 text-white hover:text-amber-300 transition-colors"
                      title="Download Photo Invoice PNG"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => window.open(invoicePngUrl, '_blank')}
                      className="p-1 text-white hover:text-amber-300 transition-colors"
                      title="Open full size in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-amber-300 font-medium">
                  📸 High-definition official Tax Invoice featuring real garment photos, Dubai TRN, Wax Seal & FTA QR Code!
                </p>
              </div>
            ) : (
              <div className="text-slate-400 text-xs">Failed to render photo invoice preview.</div>
            )}
          </div>
        )}

        {/* Tab 2: Courier Waybill Slip Preview */}
        {activeTab === 'COURIER_SLIP' && (
          <div className="flex-1 overflow-y-auto mb-3 bg-slate-900 rounded-xl p-3 border border-slate-800 flex flex-col items-center justify-center min-h-[240px]">
            {isGeneratingSlip ? (
              <div className="flex flex-col items-center justify-center p-6 text-emerald-400 gap-2">
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-xs font-mono font-medium">Rendering 4x6 Official Courier Waybill PNG...</span>
              </div>
            ) : slipPngUrl ? (
              <div className="space-y-2 w-full text-center">
                <div className="relative group max-w-full inline-block">
                  <img
                    src={slipPngUrl}
                    alt="Official Courier Waybill & Shipping Slip"
                    className="max-h-[340px] max-w-full object-contain mx-auto rounded-lg shadow-xl border border-slate-700 bg-white"
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/80 p-1 rounded-md backdrop-blur-xs">
                    <button
                      onClick={() => downloadImage(slipPngUrl, `Waybill_${invoice.invoiceNo}_Slip.png`)}
                      className="p-1 text-white hover:text-emerald-300 transition-colors"
                      title="Download Waybill Slip PNG"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => window.open(slipPngUrl, '_blank')}
                      className="p-1 text-white hover:text-emerald-300 transition-colors"
                      title="Open full size in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-300 font-medium">
                  🚚 4x6 Official DHL / Courier Shipping Waybill with barcode, QR code, and consignee details!
                </p>
              </div>
            ) : (
              <div className="text-slate-400 text-xs">Failed to render slip preview.</div>
            )}
          </div>
        )}

        {/* Tab 3: Text Message Preview */}
        {activeTab === 'TEXT' && (
          <div className="flex-1 overflow-y-auto mb-3">
            <div className="bg-[#e7f8ee] p-3.5 rounded-xl border border-emerald-300/80 font-mono text-xs whitespace-pre-wrap text-[#075e54] leading-relaxed max-h-60 overflow-y-auto shadow-inner select-text">
              {messageText}
            </div>
          </div>
        )}

        {/* Notification Banner */}
        {sendSuccess && (
          <div className="p-2.5 mb-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{sendSuccess}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              onClick={handleOpenWhatsApp}
              className="px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Open WhatsApp Web in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Web Chat</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSendPhotoInvoicePng}
              disabled={isSending || isGeneratingInvoice}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Dispatch only the Professional Picture-Based Tax Invoice PNG"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>📸 Invoice PNG</span>
            </button>

            <button
              onClick={handleSendSlipPng}
              disabled={isSending || isGeneratingSlip}
              className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="Dispatch only the Courier Shipping Waybill PNG"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>🚚 Slip PNG</span>
            </button>

            <button
              onClick={handleSendBothPng}
              disabled={isSending || isGeneratingInvoice || isGeneratingSlip}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              title="1-Click: Dispatches BOTH the Courier Waybill Slip AND Professional Photo Invoice PNG directly to customer's WhatsApp"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>⚡ 1-Click: Send Both (Slip + Photo Invoice)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
