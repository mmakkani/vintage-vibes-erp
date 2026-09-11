import { DocumentStatus } from '../../types/common.types.ts';

export interface Employee {
  id: string;
  empCode: string; // "EMP-001"
  name: string;
  designation: string; // "Senior Sorter", "Bale Handler", "OCR Tag Inspector", "Accountant"
  department: string;
  baseSalary: number;
  housingAllow: number;
  transportAllow: number;
  workingHoursPerDay: number; // default 8 hours
  isActive: boolean;
  joiningDate: string;
  status: DocumentStatus; // 'POSTED' | 'DRAFT' | 'UNPOSTED'
  emiratesId: string; // e.g., "784-1992-1234567-1"
  residencyCardNo: string; // e.g., "RC-8839201" or file no
  passportNo: string; // e.g., "A9283746"
  idFrontImageUrl?: string;
  idBackImageUrl?: string;
  
  // Extended Emirates ID & Personal Details
  nameArabic?: string;
  nationality?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  dob?: string;
  emiratesIdExpiry?: string;
  idCardNo?: string; // Serial number on back of card
  
  // Passport Details
  passportExpiry?: string;
  passportIssueDate?: string;
  passportCountry?: string;
  passportImageUrl?: string;
  
  // UAE Residency Visa & UID Details
  uidNo?: string; // UAE Unified Number
  residencyIssueDate?: string;
  residencyExpiryDate?: string;
  residencySponsor?: string;
  residencyProfession?: string;
  residencyImageUrl?: string;
  
  // Photo preview / Avatar
  photoUrl?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  empCode: string;
  monthYear: string; // e.g. "2026-09"
  daysWorked: number; // 0 to 30
  overtimeHours: number;
  status: DocumentStatus; // DRAFT or POSTED
  lockedAt?: string;
  lockedBy?: string;
}

export interface EmployeeLoan {
  id: string;
  employeeId: string;
  employeeName: string;
  empCode: string;
  type: 'SALARY_ADVANCE' | 'INSTALLMENT_LOAN';
  principalAmount: number;
  emiAmount: number; // Monthly installment
  totalMonths: number;
  startMonth: string; // e.g. "2026-09"
  remainingAmount: number;
  status: 'ACTIVE' | 'PAID' | 'CANCELLED';
  disbursementAccount?: string; // COA Bank or Cash
  disbursementMethod?: 'CASH' | 'BANK_TRANSFER';
  notes?: string;
  createdAt: string;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  empCode: string;
  designation: string;
  monthYear: string;
  status: DocumentStatus;
  baseSalary: number;
  allowances: number;
  dailyRate: number; // baseSalary / 30
  hourlyRate: number; // dailyRate / workingHoursPerDay
  daysWorked: number;
  overtimeHours: number;
  earnedBasic: number; // (dailyRate * daysWorked)
  overtimePay: number; // (hourlyRate * overtimeHours * 1.5)
  grossPay: number; // earnedBasic + allowances + overtimePay
  advanceDeduction: number; // Salary advance recovery
  loanEmiDeduction: number; // Installment loan EMI recovery
  totalDeductions: number; // advanceDeduction + loanEmiDeduction
  netPay: number; // grossPay - totalDeductions
  paymentMethod?: 'CASH' | 'BANK_TRANSFER';
  bankAccountId?: string;
  bankAccountName?: string;
  postedAt?: string;
  postedBy?: string;
}

