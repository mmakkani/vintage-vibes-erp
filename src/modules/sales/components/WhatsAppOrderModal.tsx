import React, { useState } from 'react';
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
  Package
} from 'lucide-react';

interface WhatsAppOrderModalProps {
  invoice: SalesInvoice;
  onClose: () => void;
}

export const WhatsAppOrderModal: React.FC<WhatsAppOrderModalProps> = ({
  invoice,
  onClose
}) => {
  const [phone, setPhone] = useState(invoice.customerPhone || '');
  const [copied, setCopied] = useState(false);

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

  const handleOpenWhatsApp = () => {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const encoded = encodeURIComponent(messageText);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-emerald-300 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500 text-white shadow-sm">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>WhatsApp Order Confirmation & Slip</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-100 text-emerald-800 font-bold">
                  {invoice.invoiceNo}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Pre-formatted customer message with waybill, DHL tracking & billing summary
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
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

        {/* Message Preview Box */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
            <span>Generated WhatsApp Message</span>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Ready to Send
            </span>
          </label>
          <div className="bg-[#e7f8ee] p-3.5 rounded-xl border border-emerald-300/80 font-mono text-xs whitespace-pre-wrap text-[#075e54] leading-relaxed max-h-72 overflow-y-auto shadow-inner select-text">
            {messageText}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <button
            onClick={handleCopy}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-600" />
                <span>Copy Message Text</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleOpenWhatsApp}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
