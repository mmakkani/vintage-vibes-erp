import React, { useState, useEffect, useRef } from 'react';
import { Employee, AttendanceRecord, PayrollRecord, EmployeeLoan } from '../hr.types.ts';
import { StatusBadge } from '../../../components/StatusBadge.tsx';
import { QuickAttendanceSummary } from './QuickAttendanceSummary.tsx';
import { DocumentVault } from './DocumentVault.tsx';
import { AIOcrScannerModal } from './AIOcrScannerModal.tsx';
import { HROcrLogsView } from './HROcrLogsView.tsx';
import { RoyalWaxSeal } from '../../../components/RoyalWaxSeal.tsx';
import { useSync } from '../../../context/SyncContext.tsx';
import { HrService } from '../../../services/hrService.ts';
import { autoCropAndResizeDocument } from '../../../utils/documentCropper.ts';
import {
  Briefcase,
  Plus,
  Clock,
  Calendar,
  DollarSign,
  CheckCircle,
  XCircle,
  FileText,
  Printer,
  Users,
  User,
  Scan,
  Shield,
  Trash2,
  Edit2,
  Eye,
  Check,
  Upload,
  Camera,
  Key,
  Globe,
  Building2,
  CreditCard,
  Sparkles,
  ExternalLink,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  HandCoins,
  Wallet,
  History,
  Bell,
  AlertCircle
} from 'lucide-react';

interface HRViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

const safeFormatAed = (val: any, decimals: number = 2): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const safeFormatNum = (val: any): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString();
};

const safeFixed = (val: any, decimals: number = 2): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return (0).toFixed(decimals);
  return num.toFixed(decimals);
};

export const HRView: React.FC<HRViewProps> = ({ onRefreshAll }) => {
  const { syncVersion, acquireLock, releaseLock, notifyMutation } = useSync();
  const [subTab, setSubTabState] = useState<'payroll' | 'attendance' | 'employees' | 'loans' | 'vault' | 'ocr-logs'>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sub = urlParams.get('hrSubTab') as any;
      if (sub && ['payroll', 'attendance', 'employees', 'loans', 'vault', 'ocr-logs'].includes(sub)) {
        return sub;
      }
      const saved = localStorage.getItem('vintage_hr_subtab') as any;
      if (saved && ['payroll', 'attendance', 'employees', 'loans', 'vault', 'ocr-logs'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'payroll';
  });

  const setSubTab = (tab: 'payroll' | 'attendance' | 'employees' | 'loans' | 'vault' | 'ocr-logs') => {
    setSubTabState(tab);
    try {
      localStorage.setItem('vintage_hr_subtab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('hrSubTab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [payrollSlips, setPayrollSlips] = useState<PayrollRecord[]>([]);
  const [ocrLogs, setOcrLogs] = useState<any[]>([]);
  const [hrAuditLogs, setHrAuditLogs] = useState<any[]>([]);

  // Selected payroll slip for payslip modal
  const [selectedSlip, setSelectedSlip] = useState<PayrollRecord | null>(null);

  // Employee Create / Edit Modal state
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  
  // AI OCR Scanner Modal state
  const [showAIOcrModal, setShowAIOcrModal] = useState(false);

  // Comprehensive UAE Legal Employee Form
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
    // Emirates ID
    emiratesId: '',
    idCardNo: '',
    emiratesIdExpiry: '',
    idFrontImageUrl: '',
    idBackImageUrl: '',
    // Passport
    passportNo: '',
    passportCountry: 'United Arab Emirates',
    passportIssueDate: '',
    passportExpiry: '',
    passportImageUrl: '',
    // UAE Residency Visa & UID
    residencyCardNo: '',
    uidNo: '',
    residencyProfession: 'Senior Sorter',
    residencySponsor: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    residencyIssueDate: '',
    residencyExpiryDate: '',
    residencyImageUrl: '',
    photoUrl: ''
  };

  const [empForm, setEmpForm] = useState(defaultEmpForm);

  const frontIdRef = useRef<HTMLInputElement>(null);
  const backIdRef = useRef<HTMLInputElement>(null);
  const passportDocRef = useRef<HTMLInputElement>(null);
  const residencyDocRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof typeof defaultEmpForm) => {
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
            setEmpForm(prev => ({ ...prev, [fieldName]: croppedImageUrl }));
            showMsg('Photo automatically cropped & resized to card boundaries! (Surroundings removed)');
          } catch (_) {
            setEmpForm(prev => ({ ...prev, [fieldName]: raw }));
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };


  // Month selector
  const [selectedMonth, setSelectedMonth] = useState('2026-09');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Attendance Sheet modal
  const [showCreateAttModal, setShowCreateAttModal] = useState(false);
  const [newAttMonth, setNewAttMonth] = useState('2026-09');

  // Monthly Attendance Sheets Log (Screen par yeh Log show hoga)
  const [attendanceSheetsLog, setAttendanceSheetsLog] = useState<any[]>([]);

  // Monthly Payroll Sheets Log (Screen par yeh Log show hoga)
  const [payrollSheetsLog, setPayrollSheetsLog] = useState<any[]>([]);

  // Dedicated Sheet Window / Modal (Screen par nahi khulegi, new window me khulegi wahi se post hoga)
  const [activeAttendanceSheetMonth, setActiveAttendanceSheetMonth] = useState<string | null>(null);
  const [sheetWindowAttendance, setSheetWindowAttendance] = useState<AttendanceRecord[]>([]);

  // Dedicated Monthly Payroll Register Window (Puri month ki file window me khulay gi)
  const [showPayrollRegisterWindow, setShowPayrollRegisterWindow] = useState(false);
  const [activePayrollSheetMonth, setActivePayrollSheetMonth] = useState<string | null>(null);

  // Employee Loans & Advances state
  const [employeeLoans, setEmployeeLoans] = useState<EmployeeLoan[]>([]);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanForm, setLoanForm] = useState({
    employeeId: '',
    type: 'INSTALLMENT_LOAN' as 'SALARY_ADVANCE' | 'INSTALLMENT_LOAN',
    principalAmount: 3000,
    totalMonths: 3,
    startMonth: '2026-09',
    disbursementMethod: 'BANK_TRANSFER' as 'CASH' | 'BANK_TRANSFER',
    disbursementAccount: '',
    notes: ''
  });

  // General Ledger COA Accounts
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [empRes, attRes, payRes, coaRes, sheetsLogRes, loansRes, paySheetsLogRes, ocrLogsRes, auditLogsRes] = await Promise.all([
        fetch('/api/hr/employees')
          .then(r => r.ok ? r.json() : [])
          .catch(err => {
            console.warn('[HRView] Fetch employees notice:', err);
            return [];
          }),
        fetch(`/api/hr/attendance?month=${selectedMonth}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/hr/payroll?month=${selectedMonth}`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/finance/coa').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/hr/attendance/sheets').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/hr/loans').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/hr/payroll/sheets').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/hr/ocr/logs').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/audit').then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      if (Array.isArray(empRes)) {
        setEmployees(empRes);
      }
      setAttendance(Array.isArray(attRes) ? attRes : []);
      setPayrollSlips(Array.isArray(payRes) ? payRes : []);
      setAttendanceSheetsLog(Array.isArray(sheetsLogRes) ? sheetsLogRes : []);
      setEmployeeLoans(Array.isArray(loansRes) ? loansRes : []);
      setPayrollSheetsLog(Array.isArray(paySheetsLogRes) ? paySheetsLogRes : []);
      setOcrLogs(Array.isArray(ocrLogsRes) ? ocrLogsRes : []);
      const hrLogs = Array.isArray(auditLogsRes) ? auditLogsRes.filter((l: any) => l.module === 'HR') : [];
      setHrAuditLogs(hrLogs);
      const coaList = Array.isArray(coaRes) ? coaRes : (coaRes?.data || coaRes?.accounts || []);
      setCoaAccounts(Array.isArray(coaList) ? coaList : []);
    } catch (err) {
      console.warn('[HRView] Safe loadData notice:', err);
    }
  };

  const loadSheetWindowData = async (month: string) => {
    try {
      const res = await fetch(`/api/hr/attendance?month=${month}`);
      const data = await res.json().catch(() => []);
      setSheetWindowAttendance(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMonthData = async (month: string) => {
    try {
      const [attRes, payRes] = await Promise.all([
        fetch(`/api/hr/attendance?month=${month}`).then(r => r.json()),
        fetch(`/api/hr/payroll?month=${month}`).then(r => r.json())
      ]);
      setAttendance(Array.isArray(attRes) ? attRes : []);
      setPayrollSlips(Array.isArray(payRes) ? payRes : []);
    } catch (err) {
      console.error(err);
    }
  };

  // 1. Initial full data fetch on mount only: runs ONCE
  useEffect(() => {
    loadData();
  }, []);

  // 2. Month selector switch: ONLY re-fetches attendance and payroll for that specific month
  const isFirstMonthMount = useRef(true);
  useEffect(() => {
    if (isFirstMonthMount.current) {
      isFirstMonthMount.current = false;
      return;
    }
    loadMonthData(selectedMonth);
  }, [selectedMonth]);

  // 3. Dedicated Sheet Window: only re-fetches when active sheet month changes
  useEffect(() => {
    if (activeAttendanceSheetMonth) {
      loadSheetWindowData(activeAttendanceSheetMonth);
    }
  }, [activeAttendanceSheetMonth]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 6000);
  };

  // Status checks for currently selected month
  const isAttendanceMissing = attendance.length === 0;
  const isAttendanceDraft = attendance.length > 0 && attendance.some(a => a.status === 'DRAFT');
  const isAttendancePosted = attendance.length > 0 && attendance.every(a => a.status === 'POSTED');

  const isPayrollMissing = payrollSlips.length === 0;
  const isPayrollDraft = payrollSlips.length > 0 && payrollSlips.some(p => p.status === 'DRAFT');
  const isPayrollPosted = payrollSlips.length > 0 && payrollSlips.every(p => p.status === 'POSTED');

  // Status checks for currently opened window sheet
  const isWindowSheetPosted = sheetWindowAttendance.length > 0 && sheetWindowAttendance.every(a => a.status === 'POSTED');

  // Create attendance sheet and open in new window
  const handleCreateAttendanceSheet = async (monthTarget: string) => {
    try {
      const res = await fetch('/api/hr/attendance/create-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthTarget })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Could not create attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${monthTarget} created! Opening attendance window...`);
        setSelectedMonth(monthTarget);
        setShowCreateAttModal(false);
        setActiveAttendanceSheetMonth(monthTarget);
        notifyMutation('HR', 'ATTENDANCE', 'CREATE', monthTarget);
        loadData();
      }
    } catch (err: any) {
      showMsg(err?.message || 'Failed to create attendance sheet', 'error');
    }
  };

  // Open an existing sheet window from the log
  const handleOpenAttendanceSheetWindow = (month: string) => {
    setSelectedMonth(month);
    setActiveAttendanceSheetMonth(month);
  };

  // Open dedicated payroll register window for any month
  const handleOpenPayrollRegisterWindow = async (month: string) => {
    setSelectedMonth(month);
    setActivePayrollSheetMonth(month);
    setShowPayrollRegisterWindow(true);
  };

  // Update attendance inside the window
  const handleUpdateWindowAttendance = async (attId: string, daysWorked: number, overtimeHours: number) => {
    try {
      const res = await fetch(`/api/hr/attendance/${attId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysWorked, overtimeHours })
      });
      if (res.ok) {
        if (activeAttendanceSheetMonth) {
          loadSheetWindowData(activeAttendanceSheetMonth);
        }
        loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Set 30 days for all staff inside window
  const handleWindowSetAllDays = async (days: number) => {
    if (isWindowSheetPosted) {
      showMsg('Attendance sheet is locked & POSTED. Unpost it first to edit days.', 'error');
      return;
    }
    try {
      await Promise.all(
        sheetWindowAttendance.map(a =>
          fetch(`/api/hr/attendance/${a.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ daysWorked: days, overtimeHours: a.overtimeHours })
          })
        )
      );
      showMsg(`Updated all staff attendance to ${days} days.`);
      if (activeAttendanceSheetMonth) {
        loadSheetWindowData(activeAttendanceSheetMonth);
      }
      loadData();
    } catch (err) {
      showMsg('Failed to batch update attendance', 'error');
    }
  };

  // POST attendance sheet directly from inside the window (Wahi say post ho ga!)
  const handleWindowPostAttendanceSheet = async () => {
    if (!activeAttendanceSheetMonth) return;
    try {
      const res = await fetch('/api/hr/attendance/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: activeAttendanceSheetMonth, postedBy: 'HR Manager' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to post attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${activeAttendanceSheetMonth} locked and POSTED! DRAFT Payroll has been initialized and is ready in Payroll tab.`);
        notifyMutation('HR', 'ATTENDANCE', 'POST', activeAttendanceSheetMonth);
        loadSheetWindowData(activeAttendanceSheetMonth);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to post attendance sheet', 'error');
    }
  };

  // Unpost attendance sheet from inside the window
  const handleWindowUnpostAttendanceSheet = async () => {
    if (!activeAttendanceSheetMonth) return;
    try {
      const res = await fetch('/api/hr/attendance/unpost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: activeAttendanceSheetMonth })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to unlock attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${activeAttendanceSheetMonth} unlocked back to DRAFT.`);
        notifyMutation('HR', 'ATTENDANCE', 'UNPOST', activeAttendanceSheetMonth);
        loadSheetWindowData(activeAttendanceSheetMonth);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to unlock attendance sheet', 'error');
    }
  };

  // Delete attendance sheet from the Log
  const handleDeleteSheetFromLog = async (month: string, hasPayroll: boolean) => {
    if (hasPayroll) {
      showMsg(`Cannot delete attendance for ${month}: Payroll records already exist for this month. Please delete or unpost payroll first.`, 'error');
      return;
    }
    if (!confirm(`Are you sure you want to delete the attendance sheet for ${month}?`)) return;
    try {
      const res = await fetch('/api/hr/attendance/sheet', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to delete attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${month} deleted.`);
        if (activeAttendanceSheetMonth === month) {
          setActiveAttendanceSheetMonth(null);
        }
        notifyMutation('HR', 'ATTENDANCE', 'DELETE', month);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to delete attendance sheet', 'error');
    }
  };

  // Save attendance as draft
  const handleSaveAttendanceDraft = () => {
    showMsg(`Attendance sheet for ${selectedMonth} is saved in DRAFT. Note: Payroll cannot be generated until attendance is POSTED.`);
  };

  // Batch set all days worked
  const handleSetAllDays = async (days: number) => {
    if (isAttendancePosted) {
      showMsg('Attendance sheet is locked & POSTED. Unpost it first to edit days.', 'error');
      return;
    }
    try {
      await Promise.all(
        attendance.map(a =>
          fetch(`/api/hr/attendance/${a.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ daysWorked: days, overtimeHours: a.overtimeHours })
          })
        )
      );
      showMsg(`Updated all staff attendance to ${days} days.`);
      loadData();
    } catch (err) {
      showMsg('Failed to batch update attendance', 'error');
    }
  };

  // Post attendance sheet (locks it and initializes draft payroll)
  const handlePostAttendanceSheet = async () => {
    try {
      const res = await fetch('/api/hr/attendance/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, postedBy: 'HR Manager' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to post attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${selectedMonth} locked and POSTED! DRAFT Payroll is ready in the Payroll tab.`);
        notifyMutation('HR', 'ATTENDANCE', 'POST', selectedMonth);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to post attendance sheet', 'error');
    }
  };

  // Unpost attendance sheet (unlocks it if payroll not posted)
  const handleUnpostAttendanceSheet = async () => {
    try {
      const res = await fetch('/api/hr/attendance/unpost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to unlock attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${selectedMonth} unlocked back to DRAFT.`);
        notifyMutation('HR', 'ATTENDANCE', 'UNPOST', selectedMonth);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to unlock attendance sheet', 'error');
    }
  };

  // Delete attendance sheet (blocks if payroll exists)
  const handleDeleteAttendanceSheet = async () => {
    if (payrollSlips.length > 0) {
      showMsg(`Cannot delete attendance: Payroll records exist for ${selectedMonth}. Please delete the payroll records first.`, 'error');
      return;
    }
    if (!confirm(`Are you sure you want to delete the attendance sheet for ${selectedMonth}?`)) return;
    try {
      const res = await fetch('/api/hr/attendance/sheet', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to delete attendance sheet', 'error');
      } else {
        showMsg(`Attendance sheet for ${selectedMonth} deleted.`);
        notifyMutation('HR', 'ATTENDANCE', 'DELETE', selectedMonth);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to delete attendance sheet', 'error');
    }
  };

  // Run Monthly Payroll Engine
  const handleRunPayrollEngine = async () => {
    if (isAttendanceDraft || isAttendanceMissing) {
      showMsg(`Cannot calculate payroll: Attendance for ${selectedMonth} must be POSTED first.`, 'error');
      return;
    }
    try {
      const res = await fetch('/api/hr/payroll/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Payroll engine failed', 'error');
      } else {
        showMsg(`Formula-based payroll engine calculated ${data.records?.length || 0} employee salary slips for ${selectedMonth}!`);
        notifyMutation('HR', 'PAYROLL', 'CREATE', selectedMonth);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Payroll engine error', 'error');
    }
  };

  // Delete Draft Payroll
  const handleDeleteDraftPayroll = async () => {
    if (isPayrollPosted) {
      showMsg(`Cannot delete POSTED payroll slips for ${selectedMonth}. Unpost slips first.`, 'error');
      return;
    }
    if (!confirm(`Delete DRAFT payroll for ${selectedMonth}? This will unlock attendance deletion and editing.`)) return;
    try {
      const res = await fetch('/api/hr/payroll/sheet', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to delete payroll', 'error');
      } else {
        showMsg(`Draft payroll for ${selectedMonth} deleted.`);
        HrService.clearPayrollSheetsCache();
        notifyMutation('HR', 'PAYROLL', 'DELETE', selectedMonth);
        loadData();
        onRefreshAll?.();
      }
    } catch (err) {
      showMsg('Failed to delete payroll', 'error');
    }
  };

  // Post Monthly Payroll directly to General Ledger: hits Salary Expense (5210-100) & Staff Salaries Payable (2310-01)
  const handleConfirmPostMonthlyPayroll = async (targetMonthOverride?: string) => {
    const targetMonth = targetMonthOverride || activePayrollSheetMonth || selectedMonth;
    try {
      const res = await fetch('/api/hr/payroll/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: targetMonth,
          postedBy: 'Finance & HR Controller'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Could not post monthly payroll', 'error');
      } else {
        showMsg(`Monthly payroll for ${targetMonth} POSTED! Recorded in General Ledger & COA: Debit 5210-100 (SALARY EXPNSE) & Credit 2310-01 (Staff Salaries Payable).`);
        HrService.clearPayrollSheetsCache();
        notifyMutation('HR', 'PAYROLL', 'POST', targetMonth);
        loadData();
        onRefreshAll?.();
      }
    } catch (err) {
      showMsg('Monthly payroll posting error', 'error');
    }
  };

  // Post / Unpost Payroll Slip
  const handlePostSlip = async (slipId: string) => {
    try {
      const res = await fetch(`/api/hr/payroll/${slipId}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postedBy: 'HR Director' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Could not post payslip', 'error');
      } else {
        showMsg('Salary slip approved and posted!');
        notifyMutation('HR', 'PAYROLL', 'POST', slipId);
        loadData();
        onRefreshAll?.();
      }
    } catch (err) {
      showMsg('Posting error', 'error');
    }
  };

  // Update employee payroll slip deductions (Advance & Loan EMI)
  const handleUpdateDeductions = async (slipId: string, advanceDeduction: number, loanEmiDeduction: number) => {
    try {
      const res = await fetch(`/api/hr/payroll/${slipId}/deductions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceDeduction, loanEmiDeduction })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to update deductions', 'error');
      } else {
        showMsg('Salary slip deductions updated.');
        loadData();
      }
    } catch (err) {
      showMsg('Failed to update deductions', 'error');
    }
  };

  // Unpost entire monthly payroll run
  const handleUnpostMonthlyPayroll = async (targetMonth?: string) => {
    const month = targetMonth || activePayrollSheetMonth || selectedMonth;
    try {
      const res = await fetch('/api/hr/payroll/unpost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Could not unpost monthly payroll', 'error');
      } else {
        showMsg(`Monthly payroll for ${month} unposted back to DRAFT. General Ledger voucher reversed.`);
        HrService.clearPayrollSheetsCache();
        notifyMutation('HR', 'PAYROLL', 'UNPOST', month);
        loadData();
        onRefreshAll?.();
      }
    } catch (err) {
      showMsg('Unposting error', 'error');
    }
  };

  // Delete draft payroll from the Log
  const handleDeletePayrollFromLog = async (month: string, isPosted: boolean) => {
    if (isPosted) {
      showMsg(`Cannot delete payroll for ${month}: Sheet is POSTED and recorded in GL. Please unpost it first.`, 'error');
      return;
    }
    if (!confirm(`Are you sure you want to delete the DRAFT payroll sheet for ${month}?`)) return;
    try {
      const res = await fetch('/api/hr/payroll/sheet', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to delete payroll sheet', 'error');
      } else {
        showMsg(`Draft payroll for ${month} deleted.`);
        if (activePayrollSheetMonth === month) {
          setShowPayrollRegisterWindow(false);
          setActivePayrollSheetMonth(null);
        }
        notifyMutation('HR', 'PAYROLL', 'DELETE', month);
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to delete payroll sheet', 'error');
    }
  };

  // Create new Loan or Salary Advance
  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.employeeId) {
      showMsg('Please select an employee.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/hr/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to issue loan/advance', 'error');
      } else {
        showMsg(`Successfully issued ${loanForm.type === 'SALARY_ADVANCE' ? 'Salary Advance' : 'Loan'} of AED ${loanForm.principalAmount}!`);
        setShowLoanModal(false);
        setLoanForm({
          employeeId: '',
          type: 'INSTALLMENT_LOAN',
          principalAmount: 3000,
          totalMonths: 3,
          startMonth: selectedMonth,
          disbursementMethod: 'BANK_TRANSFER',
          disbursementAccount: '',
          notes: ''
        });
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Loan creation error', 'error');
    }
  };

  // Delete an active loan/advance
  const handleDeleteLoan = async (loanId: string) => {
    if (!confirm('Are you sure you want to delete this loan/advance record?')) return;
    try {
      const res = await fetch(`/api/hr/loans/${loanId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.error || 'Failed to delete loan', 'error');
      } else {
        showMsg('Loan record deleted.');
        loadData();
        onRefreshAll();
      }
    } catch (err) {
      showMsg('Failed to delete loan', 'error');
    }
  };

  // Update employee attendance inline
  const handleUpdateAttendance = async (attId: string, daysWorked: number, overtimeHours: number) => {
    try {
      const res = await fetch(`/api/hr/attendance/${attId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysWorked, overtimeHours })
      });
      if (res.ok) {
        loadData();
        showMsg('Attendance updated. Recalculate payroll to update salary slips.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save / Submit Employee Form
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const fetchEmployees = () => {
      HrService.clearEmployeeCache();
      loadData();
      fetch('/api/hr/employees')
        .then(r => r.ok ? r.json() : [])
        .then(list => {
          if (Array.isArray(list) && list.length > 0) {
            setEmployees(list);
          }
        })
        .catch(err => console.warn('[HRView] fetchEmployees direct sync notice:', err));
      onRefreshAll?.();
    };
    const onClose = () => {
      setShowEmpModal(false);
      setEditingEmpId(null);
    };

    try {
      // 1. Remove any blocking/failing image upload logic; use safe Data URLs or skip storage upload
      const safeIdFrontImageUrl = typeof empForm.idFrontImageUrl === 'string' ? empForm.idFrontImageUrl : '';
      const safeIdBackImageUrl = typeof empForm.idBackImageUrl === 'string' ? empForm.idBackImageUrl : '';
      const safePassportImageUrl = typeof empForm.passportImageUrl === 'string' ? empForm.passportImageUrl : '';
      const safeResidencyImageUrl = typeof empForm.residencyImageUrl === 'string' ? empForm.residencyImageUrl : '';
      const safePhotoUrl = typeof empForm.photoUrl === 'string' ? empForm.photoUrl : '';

      // 2. Ensure full_name is NEVER null and numbers are properly converted
      const resolvedFullName = 
        (empForm as any).full_name || 
        (empForm as any).fullName || 
        (empForm as any).fullNameEnglish || 
        empForm.name || 
        (empForm as any).full_name_english || 
        'Staff Member';

      const cleanDateVal = (d: any) => {
        if (!d || typeof d !== 'string') return null;
        const trimmed = d.trim();
        if (!trimmed || trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = new Date(trimmed);
        return !isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
      };

      const basic_salary = Number(empForm.baseSalary || (empForm as any).basic_salary || 0);
      const housing_allowance = Number(empForm.housingAllow || (empForm as any).housing_allowance || 0);
      const transport_allowance = Number(empForm.transportAllow || (empForm as any).transport_allowance || 0);
      const total_package = basic_salary + housing_allowance + transport_allowance;
      const working_hours_per_day = Number(empForm.workingHoursPerDay || (empForm as any).working_hours_per_day || 8);

      const payload = {
        ...empForm,
        name: resolvedFullName,
        full_name: resolvedFullName,
        name_arabic: empForm.nameArabic || (empForm as any).full_name_arabic || (empForm as any).fullNameArabic || '',
        full_name_arabic: empForm.nameArabic || (empForm as any).full_name_arabic || (empForm as any).fullNameArabic || '',
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
        workingHoursPerDay: working_hours_per_day,
        dob: cleanDateVal(empForm.dob),
        joining_date: cleanDateVal(empForm.joiningDate) || new Date().toISOString().slice(0, 10),
        emirates_id_expiry: cleanDateVal(empForm.emiratesIdExpiry),
        passport_expiry: cleanDateVal(empForm.passportExpiry),
        passport_issue_date: cleanDateVal(empForm.passportIssueDate),
        residency_issue_date: cleanDateVal(empForm.residencyIssueDate),
        residency_expiry_date: cleanDateVal(empForm.residencyExpiryDate)
      };

      const url = editingEmpId ? `/api/hr/employees/${editingEmpId}` : '/api/hr/employees';
      const method = editingEmpId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      // 3. Wrap with clear browser alert
      if (!res.ok || (data && data.success === false) || data?.error) {
        const errorMsg = data?.error || res.statusText || 'Database request failed';
        alert("Error saving employee: " + errorMsg);
        showMsg("Error saving employee: " + errorMsg, 'error');
      } else {
        alert("Employee registered successfully!");
        showMsg(editingEmpId ? 'Employee record updated & audit log registered!' : 'Employee registered successfully!');
        notifyMutation('HR', 'EMPLOYEES', editingEmpId ? 'EDIT' : 'CREATE', empForm.name);

        // Optimistic State Update: Append or update newly created employee immediately in local state
        const savedEmp: Employee | null = (data && data.id) ? data : (data?.employee || null);
        if (savedEmp) {
          setEmployees(prev => {
            if (editingEmpId) {
              return prev.map(e => (e.id === editingEmpId || e.empCode === editingEmpId) ? { ...e, ...savedEmp } : e);
            } else {
              const filtered = prev.filter(e => e.id !== savedEmp.id && e.empCode !== savedEmp.empCode);
              return [savedEmp, ...filtered];
            }
          });
        }

        fetchEmployees();
        onClose();
      }
    } catch (error: any) {
      alert("Error saving employee: " + (error?.message || String(error)));
      showMsg("Error saving employee: " + (error?.message || String(error)), 'error');
    }
  };

  const handlePostEmployee = async (id: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${id}/post`, { method: 'POST' });
      if (res.ok) {
        showMsg('Employee record posted and activated.');
        HrService.clearEmployeeCache();
        loadData();
      }
    } catch (err) {
      showMsg('Error posting employee', 'error');
    }
  };

  const handleUnpostEmployee = async (id: string) => {
    try {
      const res = await fetch(`/api/hr/employees/${id}/unpost`, { method: 'POST' });
      if (res.ok) {
        showMsg('Employee record unposted.');
        HrService.clearEmployeeCache();
        loadData();
      }
    } catch (err) {
      showMsg('Error unposting employee', 'error');
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Are you sure you want to delete this employee record?')) return;
    try {
      const res = await fetch(`/api/hr/employees/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMsg('Employee record deleted.');
        HrService.clearEmployeeCache();
        loadData();
      }
    } catch (err) {
      showMsg('Error deleting employee', 'error');
    }
  };

  // Multi-document AI OCR Scanner Integration
  const handleOpenOcrScanner = () => {
    setShowAIOcrModal(true);
  };

  const handleApplyOcrData = (data: any) => {
    setEmpForm(prev => ({
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
    loadData();
    showMsg(`AI OCR verified and populated legal identity records for ${data.name || 'employee'}! Scan log registered.`);
  };

  const totalPayrollCost = (payrollSlips || []).reduce((sum, s) => sum + (Number(s?.netPay) || 0), 0);

  return (
    <div className="space-y-3">
      {/* Quick Attendance Summary Widget */}
      <QuickAttendanceSummary
        employees={employees}
        attendance={attendance}
        payrollSlips={payrollSlips}
        selectedMonth={selectedMonth}
        onNavigateTab={tab => setSubTab(tab)}
      />

      {/* Sub navigation buttons & Month selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            id="subtab-payroll-slips"
            onClick={() => setSubTab('payroll')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
              subTab === 'payroll' ? 'bg-[#0056b3] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1. Monthly Payroll Sheets ({payrollSheetsLog.length})
          </button>
          <button
            id="subtab-attendance-grid"
            onClick={() => setSubTab('attendance')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
              subTab === 'attendance' ? 'bg-[#0056b3] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2. Attendance Grid ({attendance.length})
          </button>
          <button
            id="subtab-employee-master"
            onClick={() => setSubTab('employees')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
              subTab === 'employees' ? 'bg-[#0056b3] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            3. Employee Master ({employees.length})
          </button>
          <button
            id="subtab-advance-loans"
            onClick={() => setSubTab('loans')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'loans' ? 'bg-[#0056b3] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>4. Advance & Loans ({employeeLoans.filter(l => l.status === 'ACTIVE').length})</span>
          </button>
          <button
            id="subtab-document-vault"
            onClick={() => setSubTab('vault')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
              subTab === 'vault' ? 'bg-[#0056b3] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>5. Document Vault</span>
          </button>
          <button
            id="subtab-ocr-logs"
            onClick={() => setSubTab('ocr-logs')}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              subTab === 'ocr-logs' ? 'bg-[#0056b3] text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>6. AI OCR & HR Activity Logs ({ocrLogs.length + hrAuditLogs.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded border border-slate-200 text-xs font-mono font-bold text-slate-800">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-xs"
            />
          </div>

          {subTab === 'attendance' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="btn-create-attendance-sheet"
                onClick={() => {
                  setNewAttMonth(selectedMonth);
                  setShowCreateAttModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Attendance Sheet</span>
              </button>
            </div>
          )}

          {subTab === 'payroll' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="btn-run-payroll-engine"
                onClick={handleRunPayrollEngine}
                disabled={isAttendanceDraft || isAttendanceMissing}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider shadow-xs transition-colors ${
                  isAttendanceDraft || isAttendanceMissing
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-[#0056b3] hover:bg-[#004494] text-white'
                }`}
                title={
                  isAttendanceDraft || isAttendanceMissing
                    ? 'Attendance must be POSTED before running payroll'
                    : 'Calculate formula payroll for selected month'
                }
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Calculate Payroll</span>
              </button>
            </div>
          )}

          {subTab === 'loans' && (
            <button
              id="btn-issue-loan-advance"
              onClick={() => {
                setLoanForm({
                  employeeId: employees[0]?.id || '',
                  type: 'INSTALLMENT_LOAN',
                  principalAmount: 3000,
                  totalMonths: 3,
                  startMonth: selectedMonth,
                  disbursementMethod: 'BANK_TRANSFER',
                  disbursementAccount: '',
                  notes: ''
                });
                setShowLoanModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Issue Advance / Loan (EMI)</span>
            </button>
          )}

          {subTab === 'employees' && (
            <button
              id="btn-create-employee"
              onClick={() => {
                setEditingEmpId(null);
                setEmpForm(defaultEmpForm);
                setShowEmpModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Employee Record</span>
            </button>
          )}

          {subTab === 'ocr-logs' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleOpenOcrScanner}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
              >
                <Scan className="w-3.5 h-3.5 text-amber-300" />
                <span>Scan with OCR</span>
              </button>
              <button
                type="button"
                onClick={loadData}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                title="Refresh logs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-2.5 rounded text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ===================== SUBTAB 1: MONTHLY PAYROLL SHEETS LOG / REGISTER ===================== */}
      {subTab === 'payroll' && (
        <div className="space-y-3">
          {/* Payroll Lifecycle Alert Banner */}
          {isAttendanceMissing && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold">No Attendance Sheet for {selectedMonth}:</span> Please create and POST an attendance sheet first before calculating payroll.
                </div>
              </div>
              <button
                onClick={() => {
                  setSubTab('attendance');
                  setNewAttMonth(selectedMonth);
                  setShowCreateAttModal(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold uppercase text-[10px] tracking-wider shrink-0 shadow-xs"
              >
                <span>Create Attendance</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {isAttendanceDraft && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold">Attendance Sheet in DRAFT:</span> Attendance for {selectedMonth} must be verified and POSTED before generating or disbursing payroll slips (UAE WPS Compliance).
                </div>
              </div>
              <button
                onClick={() => setSubTab('attendance')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold uppercase text-[10px] tracking-wider shrink-0 shadow-xs"
              >
                <span>Open Attendance Grid</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Payroll KPI Summary Strip from Log */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Total Payroll Sheets</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {payrollSheetsLog.length} Months
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Current Month Status</span>
              <div className="text-base font-bold font-mono mt-0.5">
                {payrollSlips.length > 0 ? (
                  isPayrollPosted ? (
                    <span className="text-emerald-700">POSTED & PAID</span>
                  ) : (
                    <span className="text-blue-700">DRAFT READY</span>
                  )
                ) : (
                  <span className="text-slate-400">Not Generated</span>
                )}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">{selectedMonth} Net Pay</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                AED {safeFormatAed(totalPayrollCost)}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">General Ledger Link</span>
              <div className="mt-1">
                {isPayrollPosted ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                    <CheckCircle className="w-3 h-3" />
                    <span>GL Voucher Linked</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                    Awaiting Post
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main Monthly Payroll Sheets Log Table */}
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                  <span>Monthly Payroll Sheets Log / Register</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Full monthly payroll files. Click "Open Sheet" to inspect staff details, adjust advance & loan cuts, and post to General Ledger.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loadData();
                    showMsg('Payroll log refreshed');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  id="btn-run-payroll-engine-main"
                  onClick={handleRunPayrollEngine}
                  disabled={isAttendanceDraft || isAttendanceMissing}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-xs transition-colors ${
                    isAttendanceDraft || isAttendanceMissing
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#0056b3] hover:bg-[#004494] text-white'
                  }`}
                  title={
                    isAttendanceDraft || isAttendanceMissing
                      ? 'Attendance must be POSTED before calculating payroll'
                      : `Calculate payroll for ${selectedMonth}`
                  }
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Calculate Payroll ({selectedMonth})</span>
                </button>
              </div>
            </div>

            {payrollSheetsLog.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="font-bold text-sm text-slate-800 uppercase tracking-wide">
                  No Monthly Payroll Sheets Generated Yet
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {isAttendancePosted
                    ? `Attendance for ${selectedMonth} is POSTED. Click "Calculate Payroll (${selectedMonth})" to generate the monthly sheet.`
                    : 'Create and POST attendance sheet first, then calculate payroll.'}
                </p>
                {isAttendancePosted && (
                  <button
                    onClick={handleRunPayrollEngine}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-colors"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Generate {selectedMonth} Payroll</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Month</th>
                      <th className="px-3 py-2.5">Employees</th>
                      <th className="px-3 py-2.5">Gross Total</th>
                      <th className="px-3 py-2.5 text-rose-700">Total Deductions</th>
                      <th className="px-3 py-2.5 font-bold text-emerald-800">Net Payable</th>
                      <th className="px-3 py-2.5">Disbursement & GL</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {payrollSheetsLog.map(sheet => (
                      <tr key={sheet.monthYear} className="hover:bg-blue-50/40 transition-colors font-sans">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-900 text-xs">
                          {sheet.monthYear}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">
                          {sheet.totalEmployees} Staff
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-800 font-medium">
                          AED {safeFormatAed(sheet.totalGrossPay)}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-rose-700 font-bold">
                          {(Number(sheet.totalDeductions) || 0) > 0 ? `-AED ${safeFormatAed(sheet.totalDeductions)}` : 'AED 0.00'}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-800 text-xs">
                          AED {safeFormatAed(sheet.totalNetPay)}
                        </td>
                        <td className="px-3 py-2.5">
                          {sheet.status === 'POSTED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-700 font-medium">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">
                                {sheet.paymentMethod || 'BANK'}
                              </span>
                              <span className="truncate max-w-[130px]">{sheet.bankAccountName || 'Cash in Hand'}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Select upon posting</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {sheet.status === 'POSTED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />
                              <span>POSTED & Linked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
                              <span>DRAFT (Editable)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPayrollRegisterWindow(sheet.monthYear)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold uppercase tracking-wider transition-colors border border-blue-200"
                              title="Open Full Month Payroll Sheet in Dedicated Window"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Sheet</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePayrollFromLog(sheet.monthYear, sheet.status === 'POSTED')}
                              disabled={sheet.status === 'POSTED'}
                              className={`p-1 rounded text-[11px] font-bold transition-colors ${
                                sheet.status === 'POSTED'
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-rose-600 hover:bg-rose-50 hover:text-rose-800'
                              }`}
                              title={sheet.status === 'POSTED' ? 'Cannot delete: Payroll is POSTED and recorded in GL (Unpost first)' : 'Delete Draft Payroll Sheet'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ===================== SUBTAB 2: ATTENDANCE SHEETS LOG / REGISTER ===================== */}
      {subTab === 'attendance' && (
        <div className="space-y-3">
          {/* Attendance KPI Summary Strip from Log */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Total Sheets Created</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {attendanceSheetsLog.length} Months
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Active Staff in Org</span>
              <div className="text-base font-bold font-mono text-blue-900 mt-0.5">
                {employees.filter(e => e.isActive !== false).length} Employees
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Current Month ({selectedMonth})</span>
              <div className="text-base font-bold font-mono text-emerald-700 mt-0.5">
                {attendance.length > 0 ? (
                  isAttendancePosted ? (
                    <span className="text-emerald-700">POSTED & LOCKED</span>
                  ) : (
                    <span className="text-amber-700">DRAFT</span>
                  )
                ) : (
                  <span className="text-slate-400">Not Created</span>
                )}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Payroll Link Status</span>
              <div className="mt-1">
                {isPayrollPosted ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                    <CheckCircle className="w-3 h-3" />
                    <span>Disbursed & Paid</span>
                  </span>
                ) : isPayrollDraft ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                    Draft Ready
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                    Awaiting Post
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main Attendance Sheets Log Table */}
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Monthly Attendance Sheets Log / Register</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select or open any month's sheet to edit attendance in a dedicated window and post to unlock payroll.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loadData();
                    showMsg('Attendance log refreshed');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  id="btn-create-new-attendance-sheet"
                  onClick={() => {
                    setNewAttMonth(selectedMonth);
                    setShowCreateAttModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Attendance Sheet</span>
                </button>
              </div>
            </div>

            {attendanceSheetsLog.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="font-bold text-sm text-slate-800 uppercase tracking-wide">
                  No Attendance Sheets Created Yet
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Click "+ New Attendance Sheet" to select a month, populate active employees, and open the attendance window.
                </p>
                <button
                  onClick={() => {
                    setNewAttMonth(selectedMonth);
                    setShowCreateAttModal(true);
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Attendance Sheet</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Salary Month</th>
                      <th className="px-3 py-2.5">Active Staff</th>
                      <th className="px-3 py-2.5">Total Present Days</th>
                      <th className="px-3 py-2.5">Total Overtime</th>
                      <th className="px-3 py-2.5">Attendance Status</th>
                      <th className="px-3 py-2.5">Payroll Engine Link</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {attendanceSheetsLog.map(sheet => (
                      <tr key={sheet.monthYear} className="hover:bg-blue-50/40 transition-colors font-sans">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-900 text-xs">
                          {sheet.monthYear}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">
                          {sheet.totalStaff} Employees
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-700">
                          {sheet.totalDaysWorked} Days
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">
                          {sheet.totalOvertimeHours} Hours
                        </td>
                        <td className="px-3 py-2.5">
                          {sheet.status === 'POSTED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Lock className="w-3 h-3" />
                              <span>POSTED & Locked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              <span>DRAFT (Editable)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {sheet.payrollStatus === 'POSTED' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Disbursed & Paid
                            </span>
                          ) : sheet.hasPayroll ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                              Draft Ready in Payroll
                            </span>
                          ) : sheet.status === 'POSTED' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                              Ready for Payroll
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-50 text-slate-400">
                              Locked (Requires Post)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenAttendanceSheetWindow(sheet.monthYear)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold uppercase tracking-wider transition-colors border border-blue-200"
                              title="Open Attendance Sheet in Dedicated Window"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Sheet</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSheetFromLog(sheet.monthYear, sheet.hasPayroll)}
                              disabled={sheet.hasPayroll}
                              className={`p-1 rounded text-[11px] font-bold transition-colors ${
                                sheet.hasPayroll
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : 'text-rose-600 hover:bg-rose-50 hover:text-rose-800'
                              }`}
                              title={sheet.hasPayroll ? 'Cannot delete: Payroll exists for this month' : 'Delete Attendance Sheet'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== SUBTAB 3: EMPLOYEE MASTER ===================== */}
      {subTab === 'employees' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Employee Master Directory & Legal IDs</h3>
              <p className="text-[11px] text-slate-500">Emirates ID, Residency Card, Passport details, and secure document records</p>
            </div>
          </div>

          {/* Expiry Alarms Summary Banner */}
          {(() => {
            const now = new Date();
            const alerts: Array<{ empName: string; docType: string; docNo: string; expiry: string; daysLeft: number; isExpired: boolean }> = [];
            employees.forEach(emp => {
              const checkExpiry = (docType: string, docNo: string, expStr?: string) => {
                if (!expStr) return;
                const exp = new Date(expStr);
                if (isNaN(exp.getTime())) return;
                const diffTime = exp.getTime() - now.getTime();
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (daysLeft <= 90) {
                  alerts.push({ empName: emp.name, docType, docNo, expiry: expStr, daysLeft, isExpired: daysLeft < 0 });
                }
              };
              checkExpiry('Emirates ID', emp.emiratesId || '', emp.emiratesIdExpiry);
              checkExpiry('Passport', emp.passportNo || '', emp.passportExpiry);
              checkExpiry('Residency Visa', emp.residencyCardNo || emp.uidNo || '', emp.residencyExpiryDate);
            });

            if (alerts.length === 0) return null;

            return (
              <div className="bg-rose-50 border-b border-rose-200 p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center animate-pulse">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-rose-950 text-xs flex items-center gap-1.5">
                      <span>DOCUMENT EXPIRY ALARMS ({alerts.length} Warnings)</span>
                      <span className="text-[9px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded-full font-bold">Action Required</span>
                    </div>
                    <p className="text-[10px] text-rose-700">
                      Employees with Passport, UAE Visa, or Emirates ID expiring soon or already expired.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {alerts.slice(0, 4).map((a, i) => (
                    <div key={i} className={`px-2 py-1 rounded text-[10px] font-bold border flex items-center gap-1.5 ${
                      a.isExpired ? 'bg-rose-100 border-rose-300 text-rose-950' : 'bg-amber-100 border-amber-300 text-amber-950'
                    }`}>
                      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                      <span>{a.empName} • {a.docType}:</span>
                      <span className="font-mono">{a.isExpired ? `EXPIRED (${a.expiry})` : `${a.daysLeft}d left (${a.expiry})`}</span>
                    </div>
                  ))}
                  {alerts.length > 4 && (
                    <span className="text-[10px] font-bold text-rose-800 self-center">+{alerts.length - 4} more</span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Employee & Arabic Name</th>
                  <th className="px-3 py-2.5">Designation & Dept</th>
                  <th className="px-3 py-2.5 bg-blue-50/50 border-x border-blue-100 text-blue-900">1. Emirates ID (Identity)</th>
                  <th className="px-3 py-2.5 bg-indigo-50/50 border-r border-indigo-100 text-indigo-900">2. Passport (Travel Doc)</th>
                  <th className="px-3 py-2.5 bg-emerald-50/50 border-r border-emerald-100 text-emerald-900">3. Residency Visa & UID</th>
                  <th className="px-3 py-2.5">Salary Package</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {employees.map(emp => {
                  const now = new Date();
                  
                  // Helper for expiry alarm status
                  const getAlarmStatus = (expDateStr?: string) => {
                    if (!expDateStr) return null;
                    const d = new Date(expDateStr);
                    if (isNaN(d.getTime())) return null;
                    const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (days < 0) {
                      return { text: `EXPIRED (${Math.abs(days)}d ago)`, color: 'bg-rose-600 text-white font-bold animate-pulse' };
                    }
                    if (days <= 30) {
                      return { text: `CRITICAL (${days}d left)`, color: 'bg-rose-100 text-rose-900 border border-rose-300 font-bold' };
                    }
                    if (days <= 90) {
                      return { text: `EXPIRING (${days}d left)`, color: 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' };
                    }
                    return { text: `Valid (${days}d)`, color: 'bg-emerald-50 text-emerald-800 border border-emerald-200' };
                  };

                  const eidAlarm = getAlarmStatus(emp.emiratesIdExpiry);
                  const passAlarm = getAlarmStatus(emp.passportExpiry);
                  const resAlarm = getAlarmStatus(emp.residencyExpiryDate);

                  return (
                    <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2 font-bold text-blue-900">{emp.empCode}</td>
                      <td className="px-3 py-2 font-sans font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          {emp.idFrontImageUrl ? (
                            <img src={emp.idFrontImageUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-300 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {emp.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900">{emp.name}</div>
                            {emp.nameArabic && (
                              <div className="text-[10px] text-slate-500 font-normal font-sans" dir="rtl">{emp.nameArabic}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-600">
                        <div className="font-medium text-slate-800">{emp.designation}</div>
                        <div className="text-[10px] text-slate-400">{emp.department} • {emp.nationality || 'Pakistan'}</div>
                      </td>

                      {/* 1. EMIRATES ID COLUMN */}
                      <td className="px-3 py-2 text-[10px] bg-blue-50/30 border-x border-blue-100">
                        <div className="font-bold font-mono text-blue-950 flex items-center gap-1">
                          <CreditCard className="w-3 h-3 text-blue-700 shrink-0" />
                          <span>{emp.emiratesId || 'N/A'}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                          Card No: <strong>{emp.idCardNo || 'N/A'}</strong>
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {emp.emiratesIdExpiry && (
                            <span className="text-[9px] text-slate-600 font-mono">
                              Exp: {emp.emiratesIdExpiry}
                            </span>
                          )}
                          {eidAlarm && (
                            <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase tracking-wider ${eidAlarm.color}`}>
                              {eidAlarm.text}
                            </span>
                          )}
                        </div>
                        {(emp.idFrontImageUrl || emp.idBackImageUrl) && (
                          <div className="flex items-center gap-1 mt-1">
                            {emp.idFrontImageUrl && (
                              <a href={emp.idFrontImageUrl} target="_blank" rel="noreferrer" className="text-[8px] bg-blue-100 hover:bg-blue-200 text-blue-800 px-1 py-0.2 rounded border border-blue-200 font-bold">
                                Front Photo ↗
                              </a>
                            )}
                            {emp.idBackImageUrl && (
                              <a href={emp.idBackImageUrl} target="_blank" rel="noreferrer" className="text-[8px] bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-1 py-0.2 rounded border border-indigo-200 font-bold">
                                Back Photo ↗
                              </a>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 2. PASSPORT COLUMN */}
                      <td className="px-3 py-2 text-[10px] bg-indigo-50/30 border-r border-indigo-100">
                        <div className="font-bold font-mono text-indigo-950 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-indigo-700 shrink-0" />
                          <span>{emp.passportNo || 'N/A'}</span>
                          {emp.passportCountry && <span className="text-slate-400 font-normal">({emp.passportCountry})</span>}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                          Issue: {emp.passportIssueDate || 'N/A'}
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {emp.passportExpiry && (
                            <span className="text-[9px] text-slate-600 font-mono">
                              Exp: {emp.passportExpiry}
                            </span>
                          )}
                          {passAlarm && (
                            <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase tracking-wider ${passAlarm.color}`}>
                              {passAlarm.text}
                            </span>
                          )}
                        </div>
                        {emp.passportImageUrl && (
                          <div className="mt-1">
                            <a href={emp.passportImageUrl} target="_blank" rel="noreferrer" className="text-[8px] bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-1 py-0.2 rounded border border-indigo-200 font-bold">
                              Bio Page Scan ↗
                            </a>
                          </div>
                        )}
                      </td>

                      {/* 3. RESIDENCY VISA & UID COLUMN */}
                      <td className="px-3 py-2 text-[10px] bg-emerald-50/30 border-r border-emerald-100">
                        <div className="font-bold font-mono text-emerald-950 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-emerald-700 shrink-0" />
                          <span>File: {emp.residencyCardNo || 'N/A'}</span>
                        </div>
                        <div className="text-[9px] text-slate-600 font-mono mt-0.5">
                          UID: <strong>{emp.uidNo || 'N/A'}</strong>
                        </div>
                        <div className="text-[9px] text-slate-500 truncate max-w-[150px]" title={emp.residencySponsor || ''}>
                          {emp.residencySponsor || 'Sponsor N/A'}
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {emp.residencyExpiryDate && (
                            <span className="text-[9px] text-slate-600 font-mono">
                              Exp: {emp.residencyExpiryDate}
                            </span>
                          )}
                          {resAlarm && (
                            <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase tracking-wider ${resAlarm.color}`}>
                              {resAlarm.text}
                            </span>
                          )}
                        </div>
                        {emp.residencyImageUrl && (
                          <div className="mt-1">
                            <a href={emp.residencyImageUrl} target="_blank" rel="noreferrer" className="text-[8px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-1 py-0.2 rounded border border-emerald-200 font-bold">
                              Visa Photo ↗
                            </a>
                          </div>
                        )}
                      </td>

                      {/* SALARY PACKAGE */}
                      <td className="px-3 py-2 text-[10px]">
                        <div className="font-bold text-slate-900 font-mono">
                          AED {(Number(emp.baseSalary || 0) + Number(emp.housingAllow || 0) + Number(emp.transportAllow || 0)).toLocaleString()}
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          Base: AED {Number(emp.baseSalary || 0).toLocaleString()}
                        </div>
                      </td>

                      {/* STATUS */}
                      <td className="px-3 py-2 font-sans">
                        <StatusBadge status={emp.status || 'POSTED'} size="sm" />
                      </td>

                      {/* ACTIONS */}
                      <td className="px-3 py-2 text-right space-x-1 font-sans whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingEmpId(emp.id);
                          setEmpForm({
                            name: emp.name,
                            nameArabic: emp.nameArabic || '',
                            designation: emp.designation,
                            department: emp.department,
                            nationality: emp.nationality || 'United Arab Emirates',
                            gender: emp.gender || 'MALE',
                            dob: emp.dob || '1995-01-01',
                            baseSalary: emp.baseSalary,
                            housingAllow: emp.housingAllow,
                            transportAllow: emp.transportAllow,
                            workingHoursPerDay: emp.workingHoursPerDay,
                            joiningDate: emp.joiningDate,
                            emiratesId: emp.emiratesId || '',
                            idCardNo: emp.idCardNo || '',
                            emiratesIdExpiry: emp.emiratesIdExpiry || '',
                            idFrontImageUrl: emp.idFrontImageUrl || '',
                            idBackImageUrl: emp.idBackImageUrl || '',
                            passportNo: emp.passportNo || '',
                            passportCountry: emp.passportCountry || emp.nationality || 'United Arab Emirates',
                            passportIssueDate: emp.passportIssueDate || '',
                            passportExpiry: emp.passportExpiry || '',
                            passportImageUrl: emp.passportImageUrl || '',
                            residencyCardNo: emp.residencyCardNo || '',
                            uidNo: emp.uidNo || '',
                            residencyProfession: emp.residencyProfession || emp.designation,
                            residencySponsor: emp.residencySponsor || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
                            residencyIssueDate: emp.residencyIssueDate || '',
                            residencyExpiryDate: emp.residencyExpiryDate || '',
                            residencyImageUrl: emp.residencyImageUrl || '',
                            photoUrl: emp.photoUrl || ''
                          });
                          setShowEmpModal(true);
                        }}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                        title="Edit Employee"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {emp.status !== 'POSTED' && (
                        <button
                          onClick={() => handlePostEmployee(emp.id)}
                          className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[10px] uppercase"
                        >
                          Post
                        </button>
                      )}

                      {emp.status === 'POSTED' && (
                        <button
                          onClick={() => handleUnpostEmployee(emp.id)}
                          className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[10px] uppercase"
                        >
                          Unpost
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteEmployee(emp.id)}
                        className="p-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700"
                        title="Delete Employee"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2 font-sans">
                        <Users className="w-8 h-8 text-slate-300" />
                        <span className="font-bold text-slate-600 text-xs">No Employee Records Found</span>
                        <span className="text-[11px] text-slate-400 max-w-sm">
                          Click <strong>+ Create Employee Record</strong> above or use <strong>Scan ID/Passport with AI</strong> to register legal UAE staff documents.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEmpId(null);
                            setEmpForm({
                              name: '',
                              designation: 'Operations Sorter',
                              department: 'Sorting & Grading',
                              baseSalary: 2500,
                              housingAllow: 0,
                              transportAllow: 0,
                              otherAllow: 0,
                              workingHoursPerDay: 8,
                              isActive: true,
                              joiningDate: new Date().toISOString().slice(0, 10),
                              status: 'POSTED',
                              emiratesId: '',
                              residencyCardNo: '',
                              passportNo: '',
                              idFrontImageUrl: '',
                              idBackImageUrl: '',
                              nameArabic: '',
                              nationality: 'United Arab Emirates',
                              gender: 'MALE',
                              dob: '',
                              emiratesIdExpiry: '',
                              idCardNo: '',
                              passportExpiry: '',
                              passportIssueDate: '',
                              passportCountry: 'United Arab Emirates',
                              passportImageUrl: '',
                              uidNo: '',
                              residencyIssueDate: '',
                              residencyExpiryDate: '',
                              residencySponsor: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
                              residencyProfession: '',
                              residencyImageUrl: '',
                              photoUrl: '',
                              email: '',
                              address: '',
                              notes: ''
                            });
                            setShowEmpModal(true);
                          }}
                          className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-all shadow-xs"
                        >
                          + Create Employee Record
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== SUBTAB 4: ADVANCE & LOANS (EMI) REGISTER ===================== */}
      {subTab === 'loans' && (
        <div className="space-y-3">
          {/* Loans KPI Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Active Loans & Advances</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {employeeLoans.filter(l => l.status === 'ACTIVE').length} Records
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Total Disbursed</span>
              <div className="text-base font-bold font-mono text-blue-900 mt-0.5">
                AED {safeFormatAed((employeeLoans || []).reduce((sum, l) => sum + (Number(l.principalAmount) || 0), 0))}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Outstanding Receivables</span>
              <div className="text-base font-bold font-mono text-rose-700 mt-0.5">
                AED {safeFormatAed((employeeLoans || []).filter(l => l.status === 'ACTIVE').reduce((sum, l) => sum + (Number(l.remainingAmount) || 0), 0))}
              </div>
            </div>
            <div className="bg-white p-2.5 rounded border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">General Ledger Account</span>
              <div className="text-xs font-mono font-bold text-slate-800 mt-1">
                1135-00 Staff Receivables
              </div>
            </div>
          </div>

          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <HandCoins className="w-3.5 h-3.5 text-blue-600" />
                  <span>Employee Salary Advances & Loan (EMI) Register</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Track employee advances, installment EMI plans, remaining balances, and monthly salary deductions.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLoanForm({
                    employeeId: employees[0]?.id || '',
                    type: 'INSTALLMENT_LOAN',
                    principalAmount: 3000,
                    totalMonths: 3,
                    startMonth: selectedMonth,
                    disbursementMethod: 'BANK_TRANSFER',
                    disbursementAccount: '',
                    notes: ''
                  });
                  setShowLoanModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white text-xs font-bold uppercase tracking-wider shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Issue Advance / Loan</span>
              </button>
            </div>

            {employeeLoans.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <div className="font-bold text-sm text-slate-800 uppercase tracking-wide">
                  No Active Advances or Loans
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Click "+ Issue Advance / Loan" to provide a staff advance (single salary cut) or an installment loan with monthly EMI recovery.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Emp Code</th>
                      <th className="px-3 py-2.5">Employee Name</th>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Principal (AED)</th>
                      <th className="px-3 py-2.5">Monthly EMI</th>
                      <th className="px-3 py-2.5">Tenure / Months</th>
                      <th className="px-3 py-2.5">Start Month</th>
                      <th className="px-3 py-2.5 text-rose-700">Remaining Balance</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {employeeLoans.map(loan => (
                      <tr key={loan.id} className="hover:bg-blue-50/40 transition-colors font-sans">
                        <td className="px-3 py-2.5 font-mono font-bold text-blue-900">{loan.empCode}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{loan.employeeName}</td>
                        <td className="px-3 py-2.5 font-sans">
                          {loan.type === 'SALARY_ADVANCE' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                              Salary Advance
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-800 border border-blue-200">
                              Installment Loan (EMI)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                          AED {safeFormatAed(loan.principalAmount)}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">
                          AED {safeFormatAed(loan.emiAmount)}/mo
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{loan.totalMonths} Months</td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{loan.startMonth}</td>
                        <td className="px-3 py-2.5 font-mono font-bold text-rose-700">
                          AED {safeFormatAed(loan.remainingAmount)}
                        </td>
                        <td className="px-3 py-2.5 font-sans">
                          {loan.status === 'PAID' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Fully Repaid
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              Active Recovery
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => handleDeleteLoan(loan.id)}
                            disabled={loan.remainingAmount < loan.principalAmount}
                            className={`p-1 rounded text-[11px] font-bold transition-colors ${
                              loan.remainingAmount < loan.principalAmount
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-rose-600 hover:bg-rose-50 hover:text-rose-800'
                            }`}
                            title={loan.remainingAmount < loan.principalAmount ? 'Cannot delete: deductions already applied' : 'Delete Loan'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== SUBTAB 5: DOCUMENT VAULT ===================== */}
      {subTab === 'vault' && (
        <DocumentVault employees={employees} onRefresh={loadData} />
      )}

      {/* ===================== SUBTAB 6: AI OCR & HR ACTIVITY LOGS ===================== */}
      {subTab === 'ocr-logs' && (
        <HROcrLogsView
          ocrLogs={ocrLogs}
          hrAuditLogs={hrAuditLogs}
          onOpenOcrScanner={handleOpenOcrScanner}
          onOpenCreateEmpModal={() => {
            setEditingEmpId(null);
            setEmpForm(defaultEmpForm);
            setShowEmpModal(true);
          }}
          onRefresh={loadData}
        />
      )}

      {/* CREATE / EDIT EMPLOYEE MODAL WITH LIVE OCR SCAN */}
      {showEmpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full p-5 shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#0056b3] text-white flex items-center justify-center font-bold shadow-xs">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-wider flex items-center gap-2">
                    <span>{editingEmpId ? 'Edit UAE Employee Legal Record' : 'Register New UAE Employee & Legal Documents'}</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded border border-blue-200">
                      UAE Standard Format
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase">
                    Emirates ID (Front & Back), International Passport & Residency Visa Registry
                  </p>
                </div>
              </div>
              <button onClick={() => setShowEmpModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
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
                onClick={handleOpenOcrScanner}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider text-[11px] shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Scan ID / Documents with OCR</span>
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4 overflow-y-auto flex-1 pr-1">
              
              {/* SECTION 1: PERSONAL PROFILE & EMPLOYMENT INFORMATION */}
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
                      value={empForm.name}
                      onChange={e => setEmpForm({ ...empForm, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-sans text-xs focus:ring-1 focus:ring-blue-500 bg-white"
                      placeholder="e.g. Saeed Bin Haider Al-Nuaimi"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Full Name (Arabic / الاسم بالعربية)</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={empForm.nameArabic}
                      onChange={e => setEmpForm({ ...empForm, nameArabic: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-sans text-xs bg-white text-slate-900"
                      placeholder="سعيد بن حيدر النعيمي"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Nationality *</label>
                    <input
                      type="text"
                      required
                      value={empForm.nationality}
                      onChange={e => setEmpForm({ ...empForm, nationality: e.target.value })}
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
                      value={empForm.dob}
                      onChange={e => setEmpForm({ ...empForm, dob: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Gender *</label>
                    <select
                      value={empForm.gender}
                      onChange={e => setEmpForm({ ...empForm, gender: e.target.value as any })}
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
                      value={empForm.designation}
                      onChange={e => setEmpForm({ ...empForm, designation: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      placeholder="e.g. Senior Sorter & Sacks Inspector"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Department *</label>
                    <input
                      type="text"
                      required
                      value={empForm.department}
                      onChange={e => setEmpForm({ ...empForm, department: e.target.value })}
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
                      value={empForm.joiningDate}
                      onChange={e => setEmpForm({ ...empForm, joiningDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Daily Working Hours</label>
                    <input
                      type="number"
                      min="1"
                      max="16"
                      value={empForm.workingHoursPerDay}
                      onChange={e => setEmpForm({ ...empForm, workingHoursPerDay: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: EMIRATES ID (FEDERAL IDENTITY) & FRONT/BACK PHOTOS */}
              <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/30 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-200 pb-1.5">
                  <div className="text-[11px] font-bold text-blue-900 uppercase flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>2. Emirates ID Card (National Identity)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenOcrScanner}
                    className="text-[10px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 underline"
                  >
                    <Scan className="w-3 h-3" />
                    <span>Scan Emirates ID (Front & Back)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Emirates ID Number *</label>
                    <input
                      type="text"
                      required
                      value={empForm.emiratesId}
                      onChange={e => setEmpForm({ ...empForm, emiratesId: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-blue-900 bg-white"
                      placeholder="784-YYYY-XXXXXXX-X"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Card Serial / Number (Back)</label>
                    <input
                      type="text"
                      value={empForm.idCardNo}
                      onChange={e => setEmpForm({ ...empForm, idCardNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                      placeholder="EID-..."
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase">Emirates ID Expiry Date</label>
                      {empForm.emiratesIdExpiry && (() => {
                        const days = Math.ceil((new Date(empForm.emiratesIdExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return days < 0 ? (
                          <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded animate-pulse">ALARM: EXPIRED</span>
                        ) : days <= 90 ? (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.2 rounded">ALARM: {days}d left</span>
                        ) : (
                          <span className="text-[9px] text-emerald-700 font-bold font-mono">Valid ({days}d)</span>
                        );
                      })()}
                    </div>
                    <input
                      type="date"
                      value={empForm.emiratesIdExpiry}
                      onChange={e => setEmpForm({ ...empForm, emiratesIdExpiry: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>
                </div>

                {/* ID Front & Back Photo Cards Side by Side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Front Side */}
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 uppercase">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-blue-600" />
                        ID Card Front Side Photo
                      </span>
                      {empForm.idFrontImageUrl && (
                        <button
                          type="button"
                          onClick={() => setEmpForm({ ...empForm, idFrontImageUrl: '' })}
                          className="text-[9px] text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="aspect-[85.6/53.98] rounded bg-slate-900/5 border border-slate-200 overflow-hidden flex items-center justify-center relative">
                      {empForm.idFrontImageUrl ? (
                        <>
                          <img src={empForm.idFrontImageUrl} alt="Front ID" className="w-full h-full object-contain p-0.5" />
                          <div className="absolute top-1 left-1 bg-emerald-600/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                            Auto-Cropped ✓
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-2 text-slate-400">
                          <Upload className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                          <div className="text-[10px]">No Front Image Attached</div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        ref={frontIdRef}
                        type="file"
                        accept="image/*"
                        onChange={e => handlePhotoUpload(e, 'idFrontImageUrl')}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => frontIdRef.current?.click()}
                        className="w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center gap-1"
                      >
                        <Camera className="w-3 h-3" />
                        <span>{empForm.idFrontImageUrl ? 'Change Front Photo' : 'Upload Front Photo'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Back Side */}
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 uppercase">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-indigo-600" />
                        ID Card Back Side Photo
                      </span>
                      {empForm.idBackImageUrl && (
                        <button
                          type="button"
                          onClick={() => setEmpForm({ ...empForm, idBackImageUrl: '' })}
                          className="text-[9px] text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="aspect-[85.6/53.98] rounded bg-slate-900/5 border border-slate-200 overflow-hidden flex items-center justify-center relative">
                      {empForm.idBackImageUrl ? (
                        <>
                          <img src={empForm.idBackImageUrl} alt="Back ID" className="w-full h-full object-contain p-0.5" />
                          <div className="absolute top-1 left-1 bg-emerald-600/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                            Auto-Cropped ✓
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-2 text-slate-400">
                          <Upload className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                          <div className="text-[10px]">No Back Image Attached</div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        ref={backIdRef}
                        type="file"
                        accept="image/*"
                        onChange={e => handlePhotoUpload(e, 'idBackImageUrl')}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => backIdRef.current?.click()}
                        className="w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center gap-1"
                      >
                        <Camera className="w-3 h-3" />
                        <span>{empForm.idBackImageUrl ? 'Change Back Photo' : 'Upload Back Photo'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: INTERNATIONAL PASSPORT RECORD */}
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-200 pb-1.5">
                  <div className="text-[11px] font-bold text-indigo-950 uppercase flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-600" />
                    <span>3. International Passport Information</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenOcrScanner}
                    className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 underline"
                  >
                    <Scan className="w-3 h-3" />
                    <span>Scan Passport Bio Page</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Passport Number *</label>
                    <input
                      type="text"
                      required
                      value={empForm.passportNo}
                      onChange={e => setEmpForm({ ...empForm, passportNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-indigo-900 bg-white"
                      placeholder="e.g. UAE3610301"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Issuing Country</label>
                    <input
                      type="text"
                      value={empForm.passportCountry}
                      onChange={e => setEmpForm({ ...empForm, passportCountry: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      placeholder="United Arab Emirates"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Issue Date</label>
                    <input
                      type="date"
                      value={empForm.passportIssueDate}
                      onChange={e => setEmpForm({ ...empForm, passportIssueDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase">Expiry Date</label>
                      {empForm.passportExpiry && (() => {
                        const days = Math.ceil((new Date(empForm.passportExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return days < 0 ? (
                          <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded animate-pulse">ALARM: EXPIRED</span>
                        ) : days <= 90 ? (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.2 rounded">ALARM: {days}d left</span>
                        ) : (
                          <span className="text-[9px] text-emerald-700 font-bold font-mono">Valid ({days}d)</span>
                        );
                      })()}
                    </div>
                    <input
                      type="date"
                      value={empForm.passportExpiry}
                      onChange={e => setEmpForm({ ...empForm, passportExpiry: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>
                </div>

                {/* Passport Bio Photo Card */}
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-12 rounded bg-slate-900/5 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0 relative">
                      {empForm.passportImageUrl ? (
                        <>
                          <img src={empForm.passportImageUrl} alt="Passport" className="w-full h-full object-contain p-0.5" />
                          <div className="absolute top-0.5 left-0.5 bg-emerald-600 text-white text-[7px] font-bold px-1 rounded">✓</div>
                        </>
                      ) : (
                        <FileText className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-[10px] text-slate-700 uppercase">Passport Bio Page Scan</div>
                      <div className="text-[10px] text-slate-400">
                        {empForm.passportImageUrl ? 'Document image attached' : 'No document image uploaded'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={passportDocRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handlePhotoUpload(e, 'passportImageUrl')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => passportDocRef.current?.click()}
                      className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{empForm.passportImageUrl ? 'Change Passport Image' : 'Upload Passport Image'}</span>
                    </button>
                    {empForm.passportImageUrl && (
                      <button
                        type="button"
                        onClick={() => setEmpForm({ ...empForm, passportImageUrl: '' })}
                        className="text-[10px] text-rose-600 hover:underline px-1"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 4: UAE RESIDENCY VISA & UNIFIED REGISTRY */}
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-1.5">
                  <div className="text-[11px] font-bold text-emerald-950 uppercase flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>4. UAE Residency Visa & Unified Number (UID)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenOcrScanner}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 underline"
                  >
                    <Scan className="w-3 h-3" />
                    <span>Scan Residency Visa / Card</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Residency File / Card No *</label>
                    <input
                      type="text"
                      required
                      value={empForm.residencyCardNo}
                      onChange={e => setEmpForm({ ...empForm, residencyCardNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-emerald-900 bg-white"
                      placeholder="201/YYYY/..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Unified Number (UID No)</label>
                    <input
                      type="text"
                      value={empForm.uidNo}
                      onChange={e => setEmpForm({ ...empForm, uidNo: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                      placeholder="9-digit UID"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Visa Profession</label>
                    <input
                      type="text"
                      value={empForm.residencyProfession}
                      onChange={e => setEmpForm({ ...empForm, residencyProfession: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      placeholder="e.g. Sorter / Inspector"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Sponsor / Employer Name</label>
                    <input
                      type="text"
                      value={empForm.residencySponsor}
                      onChange={e => setEmpForm({ ...empForm, residencySponsor: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Residency Issue Date</label>
                    <input
                      type="date"
                      value={empForm.residencyIssueDate}
                      onChange={e => setEmpForm({ ...empForm, residencyIssueDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase">Residency Expiry Date</label>
                      {empForm.residencyExpiryDate && (() => {
                        const days = Math.ceil((new Date(empForm.residencyExpiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return days < 0 ? (
                          <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded animate-pulse">ALARM: EXPIRED</span>
                        ) : days <= 90 ? (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.2 rounded">ALARM: {days}d left</span>
                        ) : (
                          <span className="text-[9px] text-emerald-700 font-bold font-mono">Valid ({days}d)</span>
                        );
                      })()}
                    </div>
                    <input
                      type="date"
                      value={empForm.residencyExpiryDate}
                      onChange={e => setEmpForm({ ...empForm, residencyExpiryDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>
                </div>

                {/* Residency Document Photo Card */}
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-12 rounded bg-slate-900/5 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0 relative">
                      {empForm.residencyImageUrl ? (
                        <>
                          <img src={empForm.residencyImageUrl} alt="Residency" className="w-full h-full object-contain p-0.5" />
                          <div className="absolute top-0.5 left-0.5 bg-emerald-600 text-white text-[7px] font-bold px-1 rounded">✓</div>
                        </>
                      ) : (
                        <FileText className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-[10px] text-slate-700 uppercase">Residency Visa / Card Document</div>
                      <div className="text-[10px] text-slate-400">
                        {empForm.residencyImageUrl ? 'Residency file attached' : 'No document image uploaded'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={residencyDocRef}
                      type="file"
                      accept="image/*"
                      onChange={e => handlePhotoUpload(e, 'residencyImageUrl')}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => residencyDocRef.current?.click()}
                      className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{empForm.residencyImageUrl ? 'Change Visa Photo' : 'Upload Visa Photo'}</span>
                    </button>
                    {empForm.residencyImageUrl && (
                      <button
                        type="button"
                        onClick={() => setEmpForm({ ...empForm, residencyImageUrl: '' })}
                        className="text-[10px] text-rose-600 hover:underline px-1"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 5: WPS PAYROLL & SALARY STRUCTURE (AED) */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>5. Wages Protection System (WPS) & Compensation (AED)</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Total Package: <strong className="text-slate-900">AED {safeFormatNum(Number(empForm.baseSalary || 0) + Number(empForm.housingAllow || 0) + Number(empForm.transportAllow || 0))}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Base Salary (AED) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={empForm.baseSalary}
                      onChange={e => setEmpForm({ ...empForm, baseSalary: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs font-bold text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Housing Allow (AED)</label>
                    <input
                      type="number"
                      min="0"
                      value={empForm.housingAllow}
                      onChange={e => setEmpForm({ ...empForm, housingAllow: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Transport Allow (AED)</label>
                    <input
                      type="number"
                      min="0"
                      value={empForm.transportAllow}
                      onChange={e => setEmpForm({ ...empForm, transportAllow: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
                  <span className="px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-600">
                    Daily Rate: AED {safeFixed(Number(empForm.baseSalary || 0) / 30, 2)}
                  </span>
                  <span className="px-2 py-1 bg-white border border-slate-200 rounded font-mono text-slate-600">
                    Hourly Rate: AED {safeFixed((Number(empForm.baseSalary || 0) / 30) / (Number(empForm.workingHoursPerDay) > 0 ? Number(empForm.workingHoursPerDay) : 8), 2)}
                  </span>
                  <span className="text-slate-400">Calculated strictly as per UAE Labour Law 30-day base calendar.</span>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                <div className="text-[10px] text-slate-500">
                  All legal identifiers and photos are encrypted and synced to Document Vault.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEmpModal(false)}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-md hover:shadow-lg transition-all"
                  >
                    {editingEmpId ? 'Update Employee Record' : 'Save Employee & Legal IDs'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MULTI-DOCUMENT AI OCR SCANNER MODAL */}
      <AIOcrScannerModal
        isOpen={showAIOcrModal}
        onClose={() => setShowAIOcrModal(false)}
        onApplyData={handleApplyOcrData}
      />

      {/* INDIVIDUAL PAYSLIP MODAL */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-md w-full p-5 shadow-2xl border border-slate-200 text-xs animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-wider">VINTAGE VIBE ERP</h3>
                <p className="text-[10px] text-slate-500 uppercase">Official Salary Pay Slip • Month: {selectedSlip.monthYear}</p>
              </div>
              <button
                onClick={() => setSelectedSlip(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex justify-between">
                <span>Employee Code: <strong>{selectedSlip.empCode}</strong></span>
                <span>Status: <StatusBadge status={selectedSlip.status} size="sm" /></span>
              </div>
              <div className="font-sans border-b border-slate-200 pb-2">
                <div className="font-bold text-xs text-slate-900">{selectedSlip.employeeName}</div>
                <div className="text-[10px] text-slate-500">{selectedSlip.designation}</div>
              </div>

              {/* Formula Details */}
              <div className="space-y-1 py-1 text-slate-700 text-[11px]">
                <div className="flex justify-between">
                  <span>Standard Monthly Base:</span>
                  <span>AED {safeFixed(selectedSlip.baseSalary, 2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Daily Rate (Base / 30):</span>
                  <span>AED {safeFixed(selectedSlip.dailyRate, 2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Hourly Rate (Daily / 8):</span>
                  <span>AED {safeFixed(selectedSlip.hourlyRate, 2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-100">
                  <span>Earned Basic ({Number(selectedSlip.daysWorked) || 0} days):</span>
                  <span>AED {safeFixed(selectedSlip.earnedBasic, 2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Allowances (Housing & Transport):</span>
                  <span>+AED {safeFixed(selectedSlip.allowances, 2)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Overtime Pay ({Number(selectedSlip.overtimeHours) || 0} hrs @ 1.5x):</span>
                  <span>+AED {safeFixed(selectedSlip.overtimePay, 2)}</span>
                </div>
                {(Number(selectedSlip.advanceDeduction) || 0) > 0 && (
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>Salary Advance Recovery:</span>
                    <span>-AED {safeFixed(selectedSlip.advanceDeduction, 2)}</span>
                  </div>
                )}
                {(Number(selectedSlip.loanEmiDeduction) || 0) > 0 && (
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>Installment Loan (EMI) Recovery:</span>
                    <span>-AED {safeFixed(selectedSlip.loanEmiDeduction, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-emerald-800 pt-2 border-t-2 border-slate-200 relative">
                  {/* Official HR Wage Protection Seal */}
                  <div className="absolute left-2 -top-1 pointer-events-none">
                    <RoyalWaxSeal
                      sealText="WPS VERIFIED"
                      subText="UAE MOHRE DISBURSED"
                      size="sm"
                      date={new Date().toISOString().slice(0, 10)}
                      approver="HR DEPT"
                    />
                  </div>
                  <span>NET PAYABLE:</span>
                  <span>AED {safeFixed(selectedSlip.netPay, 2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-2.5">
              <button
                onClick={() => setSelectedSlip(null)}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-[11px] shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Attendance Sheet */}
      {showCreateAttModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Create New Attendance Sheet</h3>
              </div>
              <button
                onClick={() => setShowCreateAttModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Select Salary Month
                </label>
                <input
                  type="month"
                  value={newAttMonth}
                  onChange={e => setNewAttMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="bg-blue-50/60 border border-blue-100 rounded p-3 text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>Active Staff Auto-Population</span>
                </div>
                <p className="text-[11px] text-blue-800">
                  Creating this sheet will automatically load all active employees with default 30 days present and 0 overtime hours in DRAFT state.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-[11px] text-amber-900">
                <span className="font-bold">Workflow Protection:</span> Attendance is saved as <span className="font-bold">DRAFT</span>. In DRAFT, payroll calculation is strictly locked. Once verified, click <span className="font-bold">POST</span> to lock attendance and generate payroll slips.
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateAttModal(false)}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-create-attendance-sheet"
                onClick={() => handleCreateAttendanceSheet(newAttMonth)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-xs shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== DEDICATED ATTENDANCE SHEET WINDOW / MODAL ===================== */}
      {/* "new attandence sheet new window may khulay screen par nahi cheya screen par sirf is ka log chaeyajab screen khulay gi wahi say post ho ga" */}
      {activeAttendanceSheetMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Window Header */}
            <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm sm:text-base tracking-wide">
                      Monthly Attendance Sheet — {activeAttendanceSheetMonth}
                    </h2>
                    {isWindowSheetPosted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <Lock className="w-3 h-3" />
                        <span>POSTED & LOCKED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <span>DRAFT (Editable)</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isWindowSheetPosted
                      ? '🔒 Sheet is POSTED and locked. Draft payroll has been initialized in the Payroll tab.'
                      : '✏️ Enter present days (0-30) and overtime hours below, then click POST directly from this window to lock and prepare Payroll.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveAttendanceSheetMonth(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
                title="Close Window"
              >
                ✕
              </button>
            </div>

            {/* Window KPI Strip */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Active Staff in Sheet</span>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                  {sheetWindowAttendance.length} Employees
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Total Present Days</span>
                <div className="text-sm font-bold font-mono text-blue-900 mt-0.5">
                  {sheetWindowAttendance.reduce((sum, a) => sum + (Number(a.daysWorked) || 0), 0)} Days
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Total Overtime Hours</span>
                <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
                  {sheetWindowAttendance.reduce((sum, a) => sum + (Number(a.overtimeHours) || 0), 0)} Hours
                </div>
              </div>
              <div className="flex items-center justify-end sm:justify-start gap-1">
                {!isWindowSheetPosted && (
                  <button
                    type="button"
                    onClick={() => handleWindowSetAllDays(30)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-blue-50 text-blue-700 border border-slate-300 hover:border-blue-300 text-[10px] font-bold uppercase tracking-wider transition-colors shadow-2xs"
                  >
                    <CheckCircle className="w-3 h-3 text-blue-600" />
                    <span>Set 30 Days All</span>
                  </button>
                )}
              </div>
            </div>

            {/* Window Employee Attendance Table */}
            <div className="overflow-y-auto p-4 flex-1">
              {sheetWindowAttendance.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-xs">No attendance entries found for this month.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Code</th>
                        <th className="px-3.5 py-2.5">Employee Name</th>
                        <th className="px-3.5 py-2.5">Days Worked (0-30)</th>
                        <th className="px-3.5 py-2.5">Overtime Hours</th>
                        <th className="px-3.5 py-2.5">Status</th>
                        <th className="px-3.5 py-2.5 text-right">Lock State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {sheetWindowAttendance.map(att => (
                        <tr key={att.id} className="hover:bg-blue-50/40 transition-colors font-sans">
                          <td className="px-3.5 py-2 font-mono font-bold text-blue-900">{att.empCode}</td>
                          <td className="px-3.5 py-2 font-semibold text-slate-800">
                            <div>{att.employeeName}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{att.monthYear}</div>
                          </td>
                          <td className="px-3.5 py-2">
                            <input
                              type="number"
                              min="0"
                              max="30"
                              disabled={isWindowSheetPosted}
                              value={att.daysWorked}
                              onChange={e => handleUpdateWindowAttendance(att.id, Number(e.target.value), att.overtimeHours)}
                              className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
                                isWindowSheetPosted
                                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                                  : 'bg-white text-slate-900 border-slate-300 focus:ring-2 focus:ring-blue-500'
                              }`}
                            />
                          </td>
                          <td className="px-3.5 py-2">
                            <input
                              type="number"
                              min="0"
                              disabled={isWindowSheetPosted}
                              value={att.overtimeHours}
                              onChange={e => handleUpdateWindowAttendance(att.id, att.daysWorked, Number(e.target.value))}
                              className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
                                isWindowSheetPosted
                                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 focus:ring-2 focus:ring-emerald-500'
                              }`}
                            />
                          </td>
                          <td className="px-3.5 py-2 font-sans">
                            <StatusBadge status={att.status} size="sm" />
                          </td>
                          <td className="px-3.5 py-2 text-right font-sans">
                            {isWindowSheetPosted ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                <Lock className="w-3 h-3" />
                                <span>Locked</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 font-medium">Editable (Draft)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Window Footer Action Bar ("jab screen khulay gi wahi say post ho ga") */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                {isWindowSheetPosted ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Attendance is POSTED. Switch to Payroll tab to review or disburse salaries.</span>
                  </span>
                ) : (
                  <span className="text-amber-800 font-medium">
                    ⚠️ Sheet is in DRAFT. Click POST below to lock days and generate DRAFT payroll.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAttendanceSheetMonth(null)}
                  className="px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold uppercase tracking-wider text-xs transition-colors"
                >
                  Close Window
                </button>

                {!isWindowSheetPosted ? (
                  <>
                    <button
                      type="button"
                      onClick={() => showMsg(`Attendance sheet for ${activeAttendanceSheetMonth} saved in DRAFT.`)}
                      className="px-3.5 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold uppercase tracking-wider text-xs transition-colors shadow-2xs"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      id="btn-post-attendance-sheet-from-window"
                      onClick={handleWindowPostAttendanceSheet}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs shadow-xs transition-colors"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>POST Attendance Sheet</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleWindowUnpostAttendanceSheet}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold uppercase tracking-wider text-xs transition-colors border border-amber-300"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Unpost (Unlock for Editing)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Payroll Payment & General Ledger Settlement */}


      {/* ===================== MODAL: ISSUE SALARY ADVANCE OR INSTALLMENT LOAN (EMI) ===================== */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HandCoins className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Issue Staff Advance / Installment Loan (EMI)</h3>
              </div>
              <button
                onClick={() => setShowLoanModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLoan} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Select Active Employee
                </label>
                <select
                  value={loanForm.employeeId}
                  onChange={e => setLoanForm(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.filter(e => e.isActive !== false).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.empCode} - {e.name} ({e.designation} • Base: AED {safeFormatNum(e.baseSalary)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Advance / Loan Type
                  </label>
                  <select
                    value={loanForm.type}
                    onChange={e => {
                      const t = e.target.value as any;
                      setLoanForm(prev => ({
                        ...prev,
                        type: t,
                        totalMonths: t === 'SALARY_ADVANCE' ? 1 : Math.max(2, prev.totalMonths)
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="INSTALLMENT_LOAN">Installment Loan (Monthly EMI)</option>
                    <option value="SALARY_ADVANCE">Salary Advance (1-Time Deduction)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Deduction Start Month
                  </label>
                  <input
                    type="month"
                    value={loanForm.startMonth}
                    onChange={e => setLoanForm(prev => ({ ...prev, startMonth: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Principal Amount (AED)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="50"
                    value={loanForm.principalAmount}
                    onChange={e => setLoanForm(prev => ({ ...prev, principalAmount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Tenure / Months
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    disabled={loanForm.type === 'SALARY_ADVANCE'}
                    value={loanForm.totalMonths}
                    onChange={e => setLoanForm(prev => ({ ...prev, totalMonths: Math.max(1, Number(e.target.value)) }))}
                    className={`w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                      loanForm.type === 'SALARY_ADVANCE' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'
                    }`}
                  />
                </div>
              </div>

              {/* Automatic EMI Calculator Strip */}
              <div className="bg-blue-50/80 border border-blue-200 rounded p-3 text-xs space-y-1 text-blue-950">
                <div className="flex justify-between items-center font-bold">
                  <span>Monthly EMI Deduction:</span>
                  <span className="text-sm font-mono text-blue-900">
                    AED {safeFixed(Number(loanForm.principalAmount || 0) / (loanForm.type === 'SALARY_ADVANCE' ? 1 : Math.max(1, Number(loanForm.totalMonths) || 1)), 2)} / month
                  </span>
                </div>
                <div className="text-[11px] text-blue-800">
                  {loanForm.type === 'SALARY_ADVANCE'
                    ? `Full amount of AED ${safeFormatNum(loanForm.principalAmount)} will be auto-deducted from ${loanForm.startMonth} salary.`
                    : `AED ${safeFixed(Number(loanForm.principalAmount || 0) / Math.max(1, Number(loanForm.totalMonths) || 1), 2)} will be auto-deducted each month across ${loanForm.totalMonths} months starting from ${loanForm.startMonth}.`}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Disbursement Account (Cash or Corporate Bank)
                </label>
                <select
                  value={loanForm.disbursementAccount}
                  onChange={e => setLoanForm(prev => ({ ...prev, disbursementAccount: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Default Operating Bank / Main Cash</option>
                  {coaAccounts
                    .filter(a => a.classification === 'ASSET' && (a.code.startsWith('111') || a.code.startsWith('112') || a.name.toLowerCase().includes('bank')))
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Reason / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Emergency family expense, rent deposit advance"
                  value={loanForm.notes}
                  onChange={e => setLoanForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-slate-800 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowLoanModal(false)}
                  className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold uppercase tracking-wider text-xs shadow-xs transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Issue & Record Voucher</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== DEDICATED MONTHLY PAYROLL REGISTER WINDOW / MODAL ===================== */}
      {/* "payroll may single person ki na banay attandence may jitni bhi ho puri ek fil us month ki banay or un post ho view karnay par new window khula takay jin ki bhi salary ho woh puri list nazar ayen advance ya loan ho woh bhi nazar ayetakay advance and loan kat sakay" */}
      {showPayrollRegisterWindow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Register Window Header */}
            <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm sm:text-base tracking-wide">
                      Monthly Payroll Register & Salary Sheet — {selectedMonth}
                    </h2>
                    {isPayrollPosted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle className="w-3 h-3" />
                        <span>POSTED & DISBURSED</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        <span>DRAFT (Editable Deductions)</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isPayrollPosted
                      ? '🔒 This payroll sheet is POSTED and recorded in General Ledger (JV-PAY). Unpost to unlock adjustments.'
                      : '✏️ Adjust Advance & Loan EMI cuts for any employee below before final posting and disbursement.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPayrollRegisterWindow(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
                title="Close Window"
              >
                ✕
              </button>
            </div>

            {/* Register Window KPI Strip */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Total Active Employees</span>
                <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                  {payrollSlips.length} Staff
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Gross Payroll</span>
                <div className="text-sm font-bold font-mono text-slate-800 mt-0.5">
                  AED {safeFormatAed((payrollSlips || []).reduce((sum, p) => sum + (Number(p?.grossPay) || 0), 0))}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Total Advance & Loans Cut</span>
                <div className="text-sm font-bold font-mono text-rose-700 mt-0.5">
                  -AED {safeFormatAed((payrollSlips || []).reduce((sum, p) => sum + (Number(p?.totalDeductions) || 0), 0))}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Net Payable Amount</span>
                <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
                  AED {safeFormatAed(totalPayrollCost)}
                </div>
              </div>
            </div>

            {/* Employee Full Register Table */}
            <div className="overflow-y-auto p-4 flex-1">
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Code</th>
                      <th className="px-3 py-2.5">Employee Name</th>
                      <th className="px-3 py-2.5">Base (AED)</th>
                      <th className="px-3 py-2.5">Days</th>
                      <th className="px-3 py-2.5">Earned Basic</th>
                      <th className="px-3 py-2.5">OT Pay</th>
                      <th className="px-3 py-2.5">Allowances</th>
                      <th className="px-3 py-2.5 text-rose-700 bg-rose-50/60">Advance Cut (AED)</th>
                      <th className="px-3 py-2.5 text-rose-700 bg-rose-50/60">Loan EMI (AED)</th>
                      <th className="px-3 py-2.5 font-bold text-emerald-800 bg-emerald-50/40">Net Pay (AED)</th>
                      <th className="px-3 py-2.5 text-right">Slip Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {payrollSlips.map(slip => (
                      <tr key={slip.id} className="hover:bg-blue-50/40 transition-colors font-sans">
                        <td className="px-3 py-2 font-mono font-bold text-blue-900">{slip.empCode}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">
                          <div>{slip.employeeName}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{slip.designation}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">AED {safeFormatNum(slip.baseSalary)}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{slip.daysWorked}/30</td>
                        <td className="px-3 py-2 font-mono text-slate-800">AED {safeFixed(slip.earnedBasic, 2)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-700">+AED {safeFixed(slip.overtimePay, 2)}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">+AED {safeFixed(slip.allowances, 2)}</td>

                        {/* Advance Cut Input */}
                        <td className="px-3 py-2 bg-rose-50/30">
                          <input
                            type="number"
                            min="0"
                            step="10"
                            disabled={isPayrollPosted}
                            value={slip.advanceDeduction || 0}
                            onChange={e => handleUpdateDeductions(slip.id, Number(e.target.value), slip.loanEmiDeduction || 0)}
                            className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
                              isPayrollPosted
                                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-rose-800 border-rose-300 focus:ring-2 focus:ring-rose-500'
                            }`}
                          />
                        </td>

                        {/* Loan EMI Input */}
                        <td className="px-3 py-2 bg-rose-50/30">
                          <input
                            type="number"
                            min="0"
                            step="10"
                            disabled={isPayrollPosted}
                            value={slip.loanEmiDeduction || 0}
                            onChange={e => handleUpdateDeductions(slip.id, slip.advanceDeduction || 0, Number(e.target.value))}
                            className={`w-20 px-2 py-1 border rounded font-mono font-bold text-xs ${
                              isPayrollPosted
                                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                                : 'bg-white text-rose-800 border-rose-300 focus:ring-2 focus:ring-rose-500'
                            }`}
                          />
                        </td>

                        {/* Net Pay Result */}
                        <td className="px-3 py-2 font-mono font-bold text-emerald-800 bg-emerald-50/30 text-xs">
                          AED {safeFormatAed(slip.netPay)}
                        </td>

                        <td className="px-3 py-2 text-right font-sans">
                          <StatusBadge status={slip.status} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Register Window Footer Actions */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                {isPayrollPosted ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>POSTED to General Ledger (Debit 5210-100 / Credit 2310-01). Click "Unpost Month" if adjustments are required.</span>
                  </span>
                ) : (
                  <span className="text-amber-800 font-medium">
                    ⚠️ Review deductions above, then click "Post Month & Link GL" to record Salary Expense (5210-100) & Staff Salaries Payable (2310-01) in General Ledger.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold uppercase tracking-wider text-xs transition-colors shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-600" />
                  <span>Print Sheet</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPayrollRegisterWindow(false)}
                  className="px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold uppercase tracking-wider text-xs transition-colors"
                >
                  Close Window
                </button>

                {!isPayrollPosted ? (
                  <button
                    type="button"
                    id="btn-confirm-post-payroll"
                    onClick={() => handleConfirmPostMonthlyPayroll()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs shadow-xs transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Post Month & Link GL</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUnpostMonthlyPayroll();
                      setShowPayrollRegisterWindow(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold uppercase tracking-wider text-xs transition-colors border border-amber-300"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unpost Month</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== AI OCR SCANNER MODAL ===================== */}
      {showAIOcrModal && (
        <AIOcrScannerModal
          isOpen={showAIOcrModal}
          onClose={() => setShowAIOcrModal(false)}
          onApplyData={handleApplyOcrData}
        />
      )}
    </div>
  );
};
