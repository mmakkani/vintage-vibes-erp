import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, MapPin, Building, ShieldCheck, Loader2, Save, Tag } from 'lucide-react';
import { PartiesService } from '../../../services/partiesService.ts';
import { Party } from '../../../types.ts';

interface EditRetailCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Party | null;
  onSuccess: (updatedParty: Party) => void;
}

export const EditRetailCustomerModal: React.FC<EditRetailCustomerModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [customerType, setCustomerType] = useState<'RETAIL' | 'B2B_RESELLER'>('RETAIL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setCompany(customer.company_name || (customer as any).company || '');
      setAddress(customer.address || '');
      const type = (customer as any).customer_type || (customer as any).party_type;
      setCustomerType(type === 'B2B_RESELLER' ? 'B2B_RESELLER' : 'RETAIL');
      setErrorMsg(null);
    }
  }, [customer, isOpen]);

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Customer name is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const updated = await PartiesService.updateRetailCustomer(customer.id, {
        name: cleanName,
        phone: phone.trim(),
        email: email.trim(),
        company: company.trim() || cleanName,
        address: address.trim(),
        customer_type: customerType
      });

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update retail customer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-lg shadow-inner">
              ✏️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Edit Retail Customer</h2>
                <span className="font-mono text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded border border-white/20">
                  {customer.code || `CRM-${String(customer.id).slice(0, 6).toUpperCase()}`}
                </span>
              </div>
              <p className="text-xs text-slate-300">Update customer details, contact info, and categorization</p>
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

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Customer Full Name *</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Tariq Mansoor"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>WhatsApp / Mobile Phone</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+971 50 123 4567"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>Email Address</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="customer@domain.com"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>Company / Nickname</span>
              </label>
              <input
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="Optional company or label"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Location / City</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Dubai, UAE"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 bg-slate-50 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Customer Type */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-500" />
              <span>Customer Classification</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCustomerType('RETAIL')}
                className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center justify-center transition cursor-pointer ${
                  customerType === 'RETAIL'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-800 ring-1 ring-emerald-600'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🛍️ Retail Counter</span>
                <span className="text-[10px] font-normal text-slate-500 mt-0.5">Control Account 1130-05</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerType('B2B_RESELLER')}
                className={`p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center justify-center transition cursor-pointer ${
                  customerType === 'B2B_RESELLER'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-800 ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🏢 B2B Reseller</span>
                <span className="text-[10px] font-normal text-slate-500 mt-0.5">Trade Receivable 1130-01</span>
              </button>
            </div>
          </div>

          {/* COA Notice */}
          <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-900 leading-relaxed">
              <span className="font-bold">Enterprise Integrity:</span> Editing updates CRM contact details immediately across POS and Statements while preserving core Chart of Accounts isolation.
            </div>
          </div>

          {/* FOOTER */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
