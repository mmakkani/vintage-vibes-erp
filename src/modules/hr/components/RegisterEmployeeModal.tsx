import React, { useState, useRef } from 'react';
import { User, Shield, CreditCard, Building2, DollarSign, Upload, Scan, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import { autoCropAndResizeDocument } from '../../../utils/documentCropper.ts';
import { AIOcrScannerModal } from './AIOcrScannerModal.tsx';

interface RegisterEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fetchEmployees: () => void;
  editingEmployee?: any;
}

export const RegisterEmployeeModal: React.FC<RegisterEmployeeModalProps> = ({
  isOpen,
  onClose,
  fetchEmployees,
  editingEmployee
}) => {
  const defaultEmpForm = {
    name: '',
    nameArabic: '',
    designation: 'Senior Sorter & OCR Specialist',
    department: 'Plant Sortery',
    nationality: 'United Arab Emirates',
    gender: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER',
    dob: '1995-01-01',
    joiningDate: new Date().toISOString().slice(0, 10),
    baseSalary: 4000,
    housingAllow: 1000,
    transportAllow: 400,
    workingHoursPerDay: 8,
    emiratesId: '',
    idCardNo: '',
    emiratesIdExpiry: '',
    idFrontImageUrl: '',
    idBackImageUrl: '',
    passportNo: '',
    passportCountry: 'United Arab Emirates',
    passportIssueDate: '',
    passportExpiry: '',
    passportImageUrl: '',
    residencyCardNo: '',
    uidNo: '',
    residencyProfession: 'Senior Sorter',
    residencySponsor: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    residencyIssueDate: '',
    residencyExpiryDate: '',
    residencyImageUrl: '',
    photoUrl: ''
  };

  const [form, setForm] = useState(editingEmployee || defaultEmpForm);
  const [showAIOcrModal, setShowAIOcrModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const frontIdRef = useRef<HTMLInputElement>(null);
  const backIdRef = useRef<HTMLInputElement>(null);
  const passportDocRef = useRef<HTMLInputElement>(null);
  const residencyDocRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const raw = reader.result;
          try {
            const docType = (fieldName === 'passportImageUrl')
              ? 'PASSPORT'
              : (fieldName === 'residencyImageUrl')
              ? 'RESIDENCY_VISA'
              : 'EMIRATES_ID';
            const { croppedImageUrl } = await autoCropAndResizeDocument(raw, { docType });
            setForm((prev: any) => ({ ...prev, [fieldName]: croppedImageUrl }));
          } catch (_) {
            setForm((prev: any) => ({ ...prev, [fieldName]: raw }));
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyOcrData = (data: any) => {
    setForm((prev: any) => ({
      ...prev,
      name: data.name || prev.name,
      nameArabic: data.nameArabic || prev.nameArabic,
      designation: data.designation || data.residencyProfession || prev.designation,
      nationality: data.nationality || data.passportCountry || prev.nationality,
      gender: data.gender || prev.gender,
      dob: data.dob || prev.dob,
      emiratesId: data.emiratesId || prev.emiratesId,
      idCardNo: data.idCardNo || prev.idCardNo,
      emiratesIdExpiry: data.emiratesIdExpiry || prev.emiratesIdExpiry,
      passportNo: data.passportNo || prev.passportNo,
      passportCountry: data.passportCountry || prev.passportCountry,
      passportIssueDate: data.passportIssueDate || prev.passportIssueDate,
      passportExpiry: data.passportExpiry || prev.passportExpiry,
      residencyCardNo: data.residencyCardNo || prev.residencyCardNo,
      uidNo: data.uidNo || prev.uidNo,
      residencyProfession: data.residencyProfession || prev.residencyProfession,
      residencySponsor: data.residencySponsor || prev.residencySponsor,
      residencyIssueDate: data.residencyIssueDate || prev.residencyIssueDate,
      residencyExpiryDate: data.residencyExpiryDate || prev.residencyExpiryDate,
      idFrontImageUrl: data.idFrontImageUrl || prev.idFrontImageUrl,
      idBackImageUrl: data.idBackImageUrl || prev.idBackImageUrl,
      passportImageUrl: data.passportImageUrl || prev.passportImageUrl,
      residencyImageUrl: data.residencyImageUrl || prev.residencyImageUrl
    }));
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 1. Safe Image Processing: Bypass/Safe Storage Uploads
      const safeIdFrontImageUrl = typeof form.idFrontImageUrl === 'string' ? form.idFrontImageUrl : '';
      const safeIdBackImageUrl = typeof form.idBackImageUrl === 'string' ? form.idBackImageUrl : '';
      const safePassportImageUrl = typeof form.passportImageUrl === 'string' ? form.passportImageUrl : '';
      const safeResidencyImageUrl = typeof form.residencyImageUrl === 'string' ? form.residencyImageUrl : '';
      const safePhotoUrl = typeof form.photoUrl === 'string' ? form.photoUrl : '';

      // 2. Ensure full_name is NEVER null and numbers are properly converted
      const resolvedFullName = 
        (form as any).full_name || 
        (form as any).fullName || 
        (form as any).fullNameEnglish || 
        form.name || 
        (form as any).full_name_english || 
        'Staff Member';

      const basic_salary = Number(form.baseSalary || (form as any).basic_salary || 0);
      const housing_allowance = Number(form.housingAllow || (form as any).housing_allowance || 0);
      const transport_allowance = Number(form.transportAllow || (form as any).transport_allowance || 0);
      const total_package = basic_salary + housing_allowance + transport_allowance;
      const working_hours_per_day = Number(form.workingHoursPerDay || (form as any).working_hours_per_day || 8);

      const payload = {
        ...form,
        name: resolvedFullName,
        full_name: resolvedFullName,
        name_arabic: form.nameArabic || (form as any).full_name_arabic || (form as any).fullNameArabic || '',
        full_name_arabic: form.nameArabic || (form as any).full_name_arabic || (form as any).fullNameArabic || '',
        idFrontImageUrl: safeIdFrontImageUrl,
        idBackImageUrl: safeIdBackImageUrl,
        passportImageUrl: safePassportImageUrl,
        residencyImageUrl: safeResidencyImageUrl,
        photoUrl: safePhotoUrl,
        basic_salary,
        housing_allowance,
        transport_allowance,
        total_package,
        base_salary: basic_salary,
        baseSalary: basic_salary,
        housing_allow: housing_allowance,
        housingAllow: housing_allowance,
        transport_allow: transport_allowance,
        transportAllow: transport_allowance,
        totalPackage: total_package,
        working_hours_per_day,
        workingHoursPerDay: working_hours_per_day
      };

      const url = editingEmployee?.id ? `/api/hr/employees/${editingEmployee.id}` : '/api/hr/employees';
      const method = editingEmployee?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      // 3. Clear browser alert wrapper
      if (!res.ok || (data && data.success === false) || data?.error) {
        const errorMsg = data?.error || res.statusText || 'Database request failed';
        alert("Error saving employee: " + errorMsg);
      } else {
        alert("Employee registered successfully!");
        fetchEmployees();
        onClose();
      }
    } catch (error: any) {
      alert("Error saving employee: " + (error?.message || String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-4xl w-full p-5 shadow-2xl border border-slate-200 text-xs my-auto max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0056b3] text-white flex items-center justify-center font-bold shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-wider flex items-center gap-2">
                <span>{editingEmployee?.id ? 'Edit UAE Employee Legal Record' : 'Register New UAE Employee & Legal Documents'}</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded border border-blue-200">
                  UAE Standard Format
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 uppercase">
                Emirates ID (Front & Back), International Passport & Residency Visa Registry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
        </div>

        {/* AI OCR Scanner Quick Action Bar */}
        <div className="mb-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Scan className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                <span>AI OCR Live Document Scanner (Gemini Vision)</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-300">
                  Active
                </span>
              </div>
              <p className="text-[10px] text-blue-700">
                Scan ID Front & Back photos, Passport or Residency card to auto-extract all fields.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAIOcrModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-sm flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Scan ID / Documents with OCR</span>
          </button>
        </div>

        <form onSubmit={handleSaveEmployee} className="space-y-4 overflow-y-auto flex-1 pr-1">
          {/* SECTION 1: PERSONAL PROFILE */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>1. Personal Profile & Employment Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Full Name (English) *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-sans text-xs focus:ring-1 focus:ring-blue-500 bg-white"
                  placeholder="e.g. Saeed Bin Haider Al-Nuaimi"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Full Name (Arabic / الاسم بالعربية)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.nameArabic}
                  onChange={e => setForm({ ...form, nameArabic: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-sans text-xs bg-white text-slate-900"
                  placeholder="سعيد بن حيدر النعيمي"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Nationality *</label>
                <input
                  type="text"
                  required
                  value={form.nationality}
                  onChange={e => setForm({ ...form, nationality: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  placeholder="e.g. United Arab Emirates"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Date of Birth *</label>
                <input
                  type="date"
                  required
                  value={form.dob}
                  onChange={e => setForm({ ...form, dob: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Gender *</label>
                <select
                  value={form.gender}
                  onChange={e => setForm({ ...form, gender: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                >
                  <option value="MALE">Male (ذكر)</option>
                  <option value="FEMALE">Female (أنثى)</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Designation *</label>
                <input
                  type="text"
                  required
                  value={form.designation}
                  onChange={e => setForm({ ...form, designation: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  placeholder="e.g. Senior Sorter & Inspector"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Department *</label>
                <input
                  type="text"
                  required
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  placeholder="e.g. Plant Sortery"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Joining Date *</label>
                <input
                  type="date"
                  required
                  value={form.joiningDate}
                  onChange={e => setForm({ ...form, joiningDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Daily Working Hours</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={form.workingHoursPerDay}
                  onChange={e => setForm({ ...form, workingHoursPerDay: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: EMIRATES ID */}
          <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
            <div className="text-[11px] font-bold text-blue-900 uppercase flex items-center justify-between border-b border-blue-200 pb-1.5">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>2. Emirates ID Card (National Identity)</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Emirates ID Number *</label>
                <input
                  type="text"
                  required
                  value={form.emiratesId}
                  onChange={e => setForm({ ...form, emiratesId: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-blue-900 bg-white"
                  placeholder="784-YYYY-XXXXXXX-X"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Card Serial No (Back)</label>
                <input
                  type="text"
                  value={form.idCardNo}
                  onChange={e => setForm({ ...form, idCardNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                  placeholder="EID-..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Emirates ID Expiry Date</label>
                <input
                  type="date"
                  value={form.emiratesIdExpiry}
                  onChange={e => setForm({ ...form, emiratesIdExpiry: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-14 h-10 rounded bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {form.idFrontImageUrl ? (
                      <img src={form.idFrontImageUrl} alt="Front" className="w-full h-full object-contain" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-[10px] text-slate-700">ID Card Front</div>
                    <div className="text-[10px] text-slate-400">{form.idFrontImageUrl ? 'Attached' : 'Empty'}</div>
                  </div>
                </div>
                <input ref={frontIdRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, 'idFrontImageUrl')} className="hidden" />
                <button type="button" onClick={() => frontIdRef.current?.click()} className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]">
                  Upload
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-14 h-10 rounded bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {form.idBackImageUrl ? (
                      <img src={form.idBackImageUrl} alt="Back" className="w-full h-full object-contain" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-[10px] text-slate-700">ID Card Back</div>
                    <div className="text-[10px] text-slate-400">{form.idBackImageUrl ? 'Attached' : 'Empty'}</div>
                  </div>
                </div>
                <input ref={backIdRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, 'idBackImageUrl')} className="hidden" />
                <button type="button" onClick={() => backIdRef.current?.click()} className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]">
                  Upload
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 3: PASSPORT & RESIDENCY */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 space-y-3">
              <div className="text-[11px] font-bold text-amber-950 uppercase border-b border-amber-200 pb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-700" />
                <span>3. Passport Details</span>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Passport Number</label>
                <input
                  type="text"
                  value={form.passportNo}
                  onChange={e => setForm({ ...form, passportNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                  placeholder="A1234567"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">{form.passportImageUrl ? 'Passport Scan attached' : 'No photo'}</span>
                <input ref={passportDocRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, 'passportImageUrl')} className="hidden" />
                <button type="button" onClick={() => passportDocRef.current?.click()} className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]">
                  Upload
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3">
              <div className="text-[11px] font-bold text-emerald-950 uppercase border-b border-emerald-200 pb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>4. Residency Visa Details</span>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Residency Card / File No</label>
                <input
                  type="text"
                  value={form.residencyCardNo}
                  onChange={e => setForm({ ...form, residencyCardNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                  placeholder="201/..."
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">{form.residencyImageUrl ? 'Residency Scan attached' : 'No photo'}</span>
                <input ref={residencyDocRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e, 'residencyImageUrl')} className="hidden" />
                <button type="button" onClick={() => residencyDocRef.current?.click()} className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px]">
                  Upload
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 5: WPS PAYROLL & SALARY STRUCTURE */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>5. Wages Protection System (WPS) & Compensation (AED)</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Total Package: <strong className="text-slate-900">AED {(Number(form.baseSalary || 0) + Number(form.housingAllow || 0) + Number(form.transportAllow || 0)).toLocaleString()}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Base Salary (AED) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={form.baseSalary}
                  onChange={e => setForm({ ...form, baseSalary: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Housing Allowance (AED)</label>
                <input
                  type="number"
                  min="0"
                  value={form.housingAllow}
                  onChange={e => setForm({ ...form, housingAllow: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Transport Allowance (AED)</label>
                <input
                  type="number"
                  min="0"
                  value={form.transportAllow}
                  onChange={e => setForm({ ...form, transportAllow: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <div className="text-[10px] text-slate-500">
              All legal identifiers and photos are encrypted and saved safely.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-md hover:shadow-lg transition-all"
              >
                {isSubmitting ? 'Saving...' : (editingEmployee?.id ? 'Update Employee Record' : 'Save Employee & Legal IDs')}
              </button>
            </div>
          </div>
        </form>
      </div>

      <AIOcrScannerModal
        isOpen={showAIOcrModal}
        onClose={() => setShowAIOcrModal(false)}
        onApplyData={handleApplyOcrData}
      />
    </div>
  );
};
