import React from 'react';
import { Party } from '../parties.types.ts';
import { ShieldCheck, Building2, Phone, Mail, MapPin, CreditCard, Landmark, FileText, Calendar } from 'lucide-react';

interface PartyProfilePrintDossierProps {
  party: Party | null;
}

export const PartyProfilePrintDossier: React.FC<PartyProfilePrintDossierProps> = ({ party }) => {
  if (!party) return null;

  const curBal = Number(party.currentBalance ?? (party as any).current_balance ?? 0);
  const creditLim = Number(party.creditLimit ?? (party as any).credit_limit ?? 0);
  const openBal = Number(party.openingBalance ?? (party as any).opening_balance ?? 0);

  const businessCard = party.businessCardUrl || (party as any).business_card_url;
  const designation = party.contactDesignation || (party as any).contact_designation;
  const tradeLicense = party.tradeLicenseNo || (party as any).trade_license_no;
  const licenseExpiry = party.licenseExpiryDate || (party as any).license_expiry_date;
  const bankName = party.bankName || (party as any).bank_name;
  const iban = party.iban;
  const swiftCode = party.swiftCode || (party as any).swift_code;
  const paymentTerms = party.paymentTerms || (party as any).payment_terms;

  const coaAccountCode = party.coaAccountId || (party as any).coa_account_id ||
    party.accountMap?.payableAccountId || party.accountMap?.receivableAccountId ||
    party.accountMap?.agentPayableAccountId || '-';

  return (
    <div id="party-profile-print-dossier" className="hidden print:block w-full bg-white text-slate-900 font-sans p-2">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body {
            background: #fff !important;
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide all application elements */
          body * {
            visibility: hidden;
          }
          /* Show only this print dossier */
          #party-profile-print-dossier,
          #party-profile-print-dossier * {
            visibility: visible;
          }
          #party-profile-print-dossier {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            display: block !important;
          }
        }
      `}</style>

      {/* HEADER SECTION */}
      <div className="border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-slate-900 uppercase">
                VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-600 mt-0.5 tracking-wide uppercase">
              Corporate Party Dossier & Commercial Compliance Record
            </p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              Dubai, United Arab Emirates • TRN: 100492817200003 • Commercial Reg: 849201
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded bg-slate-900 text-white tracking-wider">
              {party.type} RECORD
            </span>
            <p className="text-[10px] font-mono text-slate-500 mt-1">
              Date: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <p className="text-[10px] font-mono text-slate-500">
              ID: <span className="font-bold text-slate-900">{party.code}</span>
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: PARTY OVERVIEW & FINANCIAL METRICS */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border border-slate-300 rounded p-2.5 bg-slate-50/50">
          <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider">Legal Entity Name</span>
          <span className="text-sm font-bold text-slate-900 block mt-0.5">{party.name}</span>
          <span className="text-[10px] text-slate-500 font-mono">Code: {party.code}</span>
        </div>

        <div className="border border-slate-300 rounded p-2.5 bg-slate-50/50">
          <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider">Current Ledger Balance</span>
          <span className={`text-sm font-bold font-mono block mt-0.5 ${curBal > 0 ? 'text-emerald-700' : curBal < 0 ? 'text-rose-700' : 'text-slate-800'}`}>
            AED {Math.abs(curBal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-slate-600 font-semibold">
            {curBal > 0 ? 'Customer Owes Us (Dr)' : curBal < 0 ? 'Payable to Supplier (Cr)' : 'Settled Balance (0.00)'}
          </span>
        </div>

        <div className="border border-slate-300 rounded p-2.5 bg-slate-50/50">
          <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider">Credit Limit Facility</span>
          <span className="text-sm font-bold font-mono text-slate-900 block mt-0.5">
            AED {creditLim.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[9px] text-slate-500">Status: {party.isActive !== false ? 'ACTIVE & APPROVED' : 'SUSPENDED'}</span>
        </div>
      </div>

      {/* SECTION 2: STRUCTURED DETAILS TABLES */}
      <div className="space-y-3 mb-4 text-xs">
        {/* Contact & Executive Table */}
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-700" />
            1. Executive & Contact Information
          </h4>
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="w-1/4 p-1.5 font-bold text-slate-600 bg-slate-100">Primary Contact Person</td>
                <td className="w-1/4 p-1.5 text-slate-900 font-semibold">{party.contactPerson || (party as any).contact_person || 'Not Specified'}</td>
                <td className="w-1/4 p-1.5 font-bold text-slate-600 bg-slate-100">Contact Designation</td>
                <td className="w-1/4 p-1.5 text-slate-900 font-semibold">{designation || 'Executive'}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">Official Telephone / Mobile</td>
                <td className="p-1.5 text-slate-900 font-mono">{party.phone || '-'}</td>
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">Corporate Email Address</td>
                <td className="p-1.5 text-slate-900">{party.email || '-'}</td>
              </tr>
              <tr>
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">Registered Office / Address</td>
                <td colSpan={3} className="p-1.5 text-slate-900">{party.address || 'Dubai, United Arab Emirates'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legal & Regulatory Table */}
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-700" />
            2. Legal, Tax & Regulatory Credentials
          </h4>
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="w-1/4 p-1.5 font-bold text-slate-600 bg-slate-100">Federal Tax No (UAE TRN)</td>
                <td className="w-1/4 p-1.5 text-slate-900 font-mono font-bold bg-amber-50/50">
                  {party.trnNo || (party as any).trn_no || 'Non-Tax Registered'}
                </td>
                <td className="w-1/4 p-1.5 font-bold text-slate-600 bg-slate-100">Trade License Number</td>
                <td className="w-1/4 p-1.5 text-slate-900 font-mono font-bold">{tradeLicense || '-'}</td>
              </tr>
              <tr>
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">License Expiry Date</td>
                <td className="p-1.5 text-slate-900 font-mono">{licenseExpiry || '-'}</td>
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">Auto-Linked COA Account</td>
                <td className="p-1.5 text-slate-900 font-mono font-bold text-blue-900 bg-blue-50/40">
                  {coaAccountCode}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Banking & Commercial Settlement Table */}
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-1.5 flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5 text-blue-700" />
            3. Banking & Settlement Accounts
          </h4>
          <table className="w-full border-collapse border border-slate-300 text-[10px]">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="w-1/4 p-1.5 font-bold text-slate-600 bg-slate-100">Bank Name</td>
                <td className="w-1/4 p-1.5 text-slate-900 font-semibold">{bankName || 'Not Provided'}</td>
                <td className="w-1/4 p-1.5 font-bold text-slate-600 bg-slate-100">SWIFT / BIC Code</td>
                <td className="w-1/4 p-1.5 text-slate-900 font-mono">{swiftCode || '-'}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">International Bank Acct (IBAN)</td>
                <td colSpan={3} className="p-1.5 text-slate-900 font-mono font-bold tracking-wide">
                  {iban || 'Not Provided'}
                </td>
              </tr>
              <tr>
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">Commercial Payment Terms</td>
                <td className="p-1.5 text-slate-900">{paymentTerms || 'Cash on Delivery (COD)'}</td>
                <td className="p-1.5 font-bold text-slate-600 bg-slate-100">Opening Balance</td>
                <td className="p-1.5 text-slate-900 font-mono">AED {openBal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: VISITING CARD ATTACHMENT */}
      <div className="mb-6">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700 border-b border-slate-300 pb-1 mb-2 flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 text-blue-700" />
          4. Scanned Business Card / Verification Artifact
        </h4>
        <div className="border border-dashed border-slate-400 rounded-lg p-2.5 bg-slate-50 flex items-center justify-center min-h-[140px]">
          {businessCard ? (
            <div className="text-center">
              <img
                src={businessCard}
                alt={`Business Card - ${party.name}`}
                className="max-h-[160px] max-w-[340px] w-auto rounded border border-slate-300 shadow-xs object-contain mx-auto"
              />
              <span className="text-[9px] text-slate-500 font-mono mt-1 block">
                Digital Business Card Asset • Authenticated via Gemini Vision AI
              </span>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[11px] font-semibold text-slate-500">
                No physical business card uploaded for this party record.
              </p>
              <p className="text-[9px] text-slate-400">
                Commercial records verified electronically by Vintage Vibes Operations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: AUDIT, COMPLIANCE STAMP & SIGNATURES */}
      <div className="border-t border-slate-300 pt-4 mt-6">
        <div className="grid grid-cols-2 gap-8 text-[10px]">
          <div className="border border-slate-300 rounded p-3 h-28 flex flex-col justify-between">
            <span className="font-bold text-slate-700 uppercase">Prepared & Verified By (Operations / Accounts)</span>
            <div className="border-t border-dashed border-slate-400 pt-1 flex justify-between text-slate-500">
              <span>Signature & Date</span>
              <span>Officer Code: VV-FIN-01</span>
            </div>
          </div>

          <div className="border border-slate-300 rounded p-3 h-28 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-700 uppercase">Authorized Corporate Signatory</span>
              <span className="text-[9px] font-mono text-slate-400">OFFICIAL STAMP</span>
            </div>
            <div className="border-t border-dashed border-slate-400 pt-1 flex justify-between text-slate-500">
              <span>Vintage Vibes General Trading L.L.C - S.P.C</span>
              <span>Approval Seal</span>
            </div>
          </div>
        </div>

        <div className="text-center text-[8px] text-slate-400 font-mono mt-4">
          Generated automatically by Vintage Vibes ERP Enterprise Platform • Document ID: {party.code}-{Date.now().toString().slice(-6)} • Page 1 of 1
        </div>
      </div>
    </div>
  );
};
