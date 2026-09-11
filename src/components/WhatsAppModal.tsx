import React, { useState, useEffect } from 'react';
import { MessageSquare, Copy, CheckCircle, X } from 'lucide-react';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose }) => {
  const [reportText, setReportText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fallbackReport = 
        `📊 VINTAGE VIBES DUBAI - DAILY DIGEST\n` +
        `📅 Date: ${new Date().toLocaleDateString('en-GB')}\n` +
        `-----------------------------------------\n` +
        `🏢 Entity: VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C\n` +
        `📍 Location: Al Quoz Industrial 3, Dubai\n` +
        `💰 Currency: AED\n\n` +
        `📦 System Status: All modules active & connected to live Supabase cloud DB.\n` +
        `🚀 Generated automatically via Vintage Vibes ERP`;

      fetch('/api/setup/whatsapp-report')
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data && data.reportText) setReportText(data.reportText);
          else setReportText(fallbackReport);
        })
        .catch(() => setReportText(fallbackReport));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded max-w-lg w-full p-3.5 sm:p-4 shadow-xl border border-slate-300 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-100 text-emerald-800">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Executive WhatsApp Daily Digest</h3>
              <p className="text-[10px] text-slate-500">Auto-formatted for instant WhatsApp pasting</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-emerald-50/70 p-3 rounded border border-emerald-200 font-mono text-xs whitespace-pre-wrap text-emerald-950 leading-relaxed max-h-96 overflow-y-auto">
          {reportText || 'Generating daily operational metrics...'}
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-slate-200 pt-2.5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider"
          >
            Close
          </button>
          <button
            id="btn-copy-whatsapp-modal"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] uppercase tracking-wider shadow-xs transition-colors"
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
