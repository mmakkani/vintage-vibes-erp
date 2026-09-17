import React, { useRef } from 'react';
import {
  Award,
  CheckCircle2,
  Printer,
  Share2,
  X,
  Copy,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  QrCode
} from 'lucide-react';
import { RoyalWaxSeal } from './RoyalWaxSeal.tsx';

export interface GrailCertificateData {
  certId?: string;
  itemTitle: string;
  brand: string;
  era: string; // e.g. "1994 Fall/Winter"
  provenance: string; // e.g. "Single Stitch, Brockum Tag, Made in USA"
  category: string;
  grade: string; // e.g. "Grade A - Vintage Grail"
  estimatedValueAed: number;
  frontImageUrl?: string;
  tagImageUrl?: string;
  buyerName?: string;
  verifiedDate?: string;
  aiConfidenceScore?: number; // e.g. 99.4
}

interface VintageGrailCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  data?: GrailCertificateData | null;
}

export const VintageGrailCertificateModal: React.FC<VintageGrailCertificateModalProps> = ({
  isOpen,
  onClose,
  data
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const cert = data || {
    certId: 'VV-GRAIL-94021-DXB',
    itemTitle: '1994 Nirvana In Utero Original World Tour Tee',
    brand: 'Giant by Tee Jays / Brockum',
    era: '1994 Spring/Summer',
    provenance: 'Single Stitch Hem & Sleeves, Made in USA, Authentic Screenprint',
    category: 'Vintage Band Grails',
    grade: 'Holy Grail (Museum Grade 9.8)',
    estimatedValueAed: 850,
    frontImageUrl: '',
    tagImageUrl: '',
    buyerName: 'Private Collector',
    verifiedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    aiConfidenceScore: 99.8
  };

  const certId = cert.certId || 'VV-GRAIL-94021-DXB';

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    const url = `https://vintagevibe.ae/vault/verify/${certId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      alert('Authenticity Verification Link copied to clipboard: ' + url);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `📜 *VINTAGE VIBES DUBAI - CERTIFICATE OF AUTHENTICITY*\n\n` +
      `Item: *${cert.itemTitle}*\n` +
      `Era: ${cert.era}\n` +
      `Provenance: ${cert.provenance}\n` +
      `Valuation: AED ${cert.estimatedValueAed}\n` +
      `Certificate ID: ${certId}\n\n` +
      `Verify Live: https://vintagevibe.ae/vault/verify/${certId}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="max-w-2xl w-full bg-stone-950 border-2 border-amber-400/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col my-auto">
        {/* Top Modal Bar */}
        <div className="px-5 py-3 bg-gradient-to-r from-stone-900 via-stone-950 to-stone-900 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="font-cinzel text-xs uppercase tracking-widest text-amber-300 font-bold">
              AI Vintage Grail Passport & Certificate of Authenticity
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Print Certificate"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="p-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 transition-colors cursor-pointer"
              title="Share via WhatsApp"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Physical Certificate Parchment Canvas */}
        <div
          ref={printRef}
          id="grail-certificate-print-area"
          className="p-6 sm:p-8 bg-gradient-to-b from-[#0d0f17] via-[#111624] to-[#0c0d12] border-8 border-double border-amber-500/30 m-4 rounded-xl relative shadow-inner space-y-6"
        >
          {/* Certificate Watermark and Radial Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(217,119,6,0.08)_0%,transparent_70%)] pointer-events-none" />

          {/* Certificate Header */}
          <div className="text-center relative border-b-2 border-amber-500/30 pb-4">
            <span className="text-[9.5px] font-mono tracking-[0.3em] uppercase text-amber-400 font-bold block mb-1">
              UNITED ARAB EMIRATES • DUBAI HERITAGE ARCHIVES
            </span>
            <h2 className="font-cinzel text-xl sm:text-2xl font-black text-amber-200 tracking-wider uppercase">
              Certificate of Authenticity
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-1">
              VINTAGE VIBES VAULT PROTOCOL • VERIFIED HISTORICAL ARTIFACT
            </p>
            <div className="inline-block mt-2 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/40 font-mono text-[10px] text-amber-300 font-black">
              CERTIFICATE #{certId}
            </div>
          </div>

          {/* Item Meta & Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="sm:col-span-2 space-y-3">
              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Item Identified</span>
                <span className="font-bold text-sm text-white">{cert.itemTitle}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Brand & Manufacturer</span>
                  <span className="text-amber-300 font-bold">{cert.brand}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Circa / Vintage Era</span>
                  <span className="text-white font-bold">{cert.era}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase text-slate-400 block">Provenance & Stitching</span>
                <span className="text-slate-300">{cert.provenance}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Archive Grade</span>
                  <span className="text-emerald-400 font-black">{cert.grade}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Market Appraisal</span>
                  <span className="text-amber-400 font-black text-sm">AED {cert.estimatedValueAed}.00</span>
                </div>
              </div>
            </div>

            {/* Right Seal & Verification Column */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-stone-900/60 border border-amber-500/20 text-center relative">
              <RoyalWaxSeal
                sealText="AUTHENTIC"
                subText="VINTAGE VIBES"
                size="md"
                isAnimated={true}
              />
              <span className="text-[9px] font-mono text-emerald-400 font-bold mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>AI Confidence: {cert.aiConfidenceScore || 99.8}%</span>
              </span>
              <span className="text-[8.5px] font-mono text-slate-500 mt-0.5">
                Stamper: Al Ain Vault #01
              </span>
            </div>
          </div>

          {/* Bottom Security Bar & Cryptographic Proof */}
          <div className="border-t border-amber-500/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded bg-white p-1 text-slate-950 flex items-center justify-center shrink-0">
                <QrCode className="w-7 h-7" />
              </div>
              <div>
                <span className="text-slate-300 font-bold block">Scan to Verify Digital Passport</span>
                <span className="text-slate-500 text-[9px]">https://vintagevibe.ae/vault/verify/{certId}</span>
              </div>
            </div>

            <div className="text-right sm:text-right">
              <span className="text-slate-300 font-bold block">Date of Attestation</span>
              <span>{cert.verifiedDate || '17 September 2026'}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-stone-900 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-amber-400" />
            <span>Copy Live Pass Link</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share via WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VintageGrailCertificateModal;
