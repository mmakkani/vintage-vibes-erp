import { supabase } from '../supabaseClient.ts';
import { Employee, AttendanceRecord, EmployeeLoan, PayrollRecord } from '../modules/hr/hr.types.ts';
import { AuditService } from './auditService.ts';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const LOCAL_STORAGE_EMPLOYEES_KEY = 'vintage_vibes_employees_db';

function getLocalEmployees(): Employee[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LOCAL_STORAGE_EMPLOYEES_KEY);
      if (saved) return JSON.parse(saved);
    }
  } catch (_) {}
  return [];
}

function saveLocalEmployees(list: Employee[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_EMPLOYEES_KEY, JSON.stringify(list));
    }
  } catch (_) {}
}

export class HrService {
  private static cachedEmployees: Employee[] | null = null;
  private static employeesPromise: Promise<Employee[]> | null = null;
  private static lastEmployeesFetched: number = 0;
  private static readonly EMPLOYEES_TTL_MS = 5 * 60 * 1000; // 5 mins cache

  private static cachedPayrollSheets: any[] | null = null;
  private static payrollSheetsPromise: Promise<any[]> | null = null;
  private static lastPayrollSheetsFetched: number = 0;
  private static readonly PAYROLL_SHEETS_TTL_MS = 5 * 60 * 1000; // 5 mins cache

  public static clearEmployeeCache(): void {
    this.cachedEmployees = null;
    this.employeesPromise = null;
    this.lastEmployeesFetched = 0;
  }

  public static clearPayrollSheetsCache(): void {
    this.cachedPayrollSheets = null;
    this.payrollSheetsPromise = null;
    this.lastPayrollSheetsFetched = 0;
  }

  // ==========================================
  // 1. EMPLOYEES (public.employees + localStorage offline fallback)
  // ==========================================
  public static async getEmployees(forceRefresh: boolean = false): Promise<Employee[]> {
    if (!forceRefresh && this.cachedEmployees && (Date.now() - this.lastEmployeesFetched < this.EMPLOYEES_TTL_MS)) {
      return this.cachedEmployees;
    }
    if (this.employeesPromise) {
      return this.employeesPromise;
    }

    this.employeesPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          const mapped = data.map((row: any) => ({
            id: String(row.id),
            empCode: row.emp_code || '',
            name: row.name || '',
            designation: row.designation || '',
            department: row.department || '',
            baseSalary: Number(row.base_salary || 0),
            housingAllow: Number(row.housing_allow || 0),
            transportAllow: Number(row.transport_allow || 0),
            workingHoursPerDay: Number(row.working_hours_per_day || 8),
            isActive: row.is_active !== false,
            joiningDate: row.joining_date || new Date().toISOString().slice(0, 10),
            status: row.status || 'POSTED',
            emiratesId: row.emirates_id || '',
            residencyCardNo: row.residency_card_no || '',
            passportNo: row.passport_no || '',
            idFrontImageUrl: row.id_front_image_url || '',
            idBackImageUrl: row.id_back_image_url || '',
            nameArabic: row.name_arabic || '',
            nationality: row.nationality || '',
            gender: row.gender || 'MALE',
            dob: row.dob || '',
            emiratesIdExpiry: row.emirates_id_expiry || '',
            idCardNo: row.id_card_no || '',
            passportExpiry: row.passport_expiry || '',
            passportIssueDate: row.passport_issue_date || '',
            passportCountry: row.passport_country || '',
            passportImageUrl: row.passport_image_url || '',
            uidNo: row.uid_no || '',
            residencyIssueDate: row.residency_issue_date || '',
            residencyExpiryDate: row.residency_expiry_date || '',
            residencySponsor: row.residency_sponsor || '',
            residencyProfession: row.residency_profession || '',
            residencyImageUrl: row.residency_image_url || '',
            photoUrl: row.photo_url || ''
          }));
          saveLocalEmployees(mapped);
          this.cachedEmployees = mapped;
          this.lastEmployeesFetched = Date.now();
          return mapped;
        }

        // Return stored local employees if Supabase is offline/anon placeholder
        const fallback = getLocalEmployees();
        this.cachedEmployees = fallback;
        this.lastEmployeesFetched = Date.now();
        return fallback;
      } catch (err) {
        console.warn('Supabase fetch employees failed, falling back to local store:', err);
        const fallback = getLocalEmployees();
        this.cachedEmployees = fallback;
        this.lastEmployeesFetched = Date.now();
        return fallback;
      } finally {
        this.employeesPromise = null;
      }
    })();

    return this.employeesPromise;
  }

  public static async createEmployee(emp: Partial<Employee>): Promise<Employee> {
    this.clearEmployeeCache();
    const id = emp.id ? String(emp.id) : generateId('emp');
    const empCode = emp.empCode || `EMP-${Date.now().toString().slice(-4)}`;

    const basicSalary = Number(emp.basic_salary ?? emp.baseSalary ?? emp.base_salary ?? 0);
    const housingAllowance = Number(emp.housing_allowance ?? emp.housingAllow ?? emp.housing_allow ?? 0);
    const transportAllowance = Number(emp.transport_allowance ?? emp.transportAllow ?? emp.transport_allow ?? 0);
    const totalPackage = Number(emp.total_package ?? emp.totalPackage ?? (basicSalary + housingAllowance + transportAllowance));

    const resolvedFullName = 
      (emp as any).full_name || 
      (emp as any).fullName || 
      (emp as any).fullNameEnglish || 
      emp.name || 
      (emp as any).full_name_english || 
      'Staff Member';

    const resolvedArabicName = 
      emp.nameArabic || 
      (emp as any).full_name_arabic || 
      (emp as any).fullNameArabic || 
      '';

    const payload = {
      id,
      emp_code: empCode,
      name: resolvedFullName,
      full_name: resolvedFullName,
      name_arabic: resolvedArabicName,
      full_name_arabic: resolvedArabicName,
      designation: emp.designation || 'Staff',
      department: emp.department || 'Operations',
      basic_salary: basicSalary,
      base_salary: basicSalary,
      housing_allowance: housingAllowance,
      housing_allow: housingAllowance,
      transport_allowance: transportAllowance,
      transport_allow: transportAllowance,
      total_package: totalPackage,
      other_allow: Number(emp.otherAllow || 0),
      working_hours_per_day: Number(emp.workingHoursPerDay || 8),
      is_active: emp.isActive !== false,
      joining_date: emp.joiningDate || new Date().toISOString().slice(0, 10),
      status: emp.status || 'POSTED',
      emirates_id: emp.emiratesId || '',
      residency_card_no: emp.residencyCardNo || '',
      passport_no: emp.passportNo || '',
      id_front_image_url: emp.idFrontImageUrl || '',
      id_back_image_url: emp.idBackImageUrl || '',
      nationality: emp.nationality || '',
      gender: emp.gender || 'MALE',
      dob: emp.dob || null,
      emirates_id_expiry: emp.emiratesIdExpiry || null,
      id_card_no: emp.idCardNo || '',
      passport_expiry: emp.passportExpiry || null,
      passport_issue_date: emp.passportIssueDate || null,
      passport_country: emp.passportCountry || '',
      passport_image_url: emp.passportImageUrl || '',
      uid_no: emp.uidNo || '',
      residency_issue_date: emp.residencyIssueDate || null,
      residency_expiry_date: emp.residencyExpiryDate || null,
      residency_sponsor: emp.residencySponsor || '',
      residency_profession: emp.residencyProfession || '',
      residency_image_url: emp.residencyImageUrl || '',
      photo_url: emp.photoUrl || '',
      email: emp.email || '',
      address: emp.address || '',
      notes: emp.notes || ''
    };

    let savedEmp: Employee = {
      ...emp,
      id,
      empCode,
      name: emp.name || 'Unnamed Employee',
      designation: emp.designation || 'Staff',
      department: emp.department || 'Operations',
      baseSalary: Number(emp.baseSalary || 0),
      housingAllow: Number(emp.housingAllow || 0),
      transportAllow: Number(emp.transportAllow || 0),
      otherAllow: Number(emp.otherAllow || 0),
      workingHoursPerDay: Number(emp.workingHoursPerDay || 8),
      isActive: emp.isActive !== false,
      joiningDate: emp.joiningDate || new Date().toISOString().slice(0, 10),
      status: emp.status || 'POSTED',
      emiratesId: emp.emiratesId || '',
      residencyCardNo: emp.residencyCardNo || '',
      passportNo: emp.passportNo || '',
      idFrontImageUrl: emp.idFrontImageUrl || '',
      idBackImageUrl: emp.idBackImageUrl || '',
      nameArabic: emp.nameArabic || '',
      nationality: emp.nationality || '',
      gender: emp.gender || 'MALE',
      dob: emp.dob || '',
      emiratesIdExpiry: emp.emiratesIdExpiry || '',
      idCardNo: emp.idCardNo || '',
      passportExpiry: emp.passportExpiry || '',
      passportIssueDate: emp.passportIssueDate || '',
      passportCountry: emp.passportCountry || '',
      passportImageUrl: emp.passportImageUrl || '',
      uidNo: emp.uidNo || '',
      residencyIssueDate: emp.residencyIssueDate || '',
      residencyExpiryDate: emp.residencyExpiryDate || '',
      residencySponsor: emp.residencySponsor || '',
      residencyProfession: emp.residencyProfession || '',
      residencyImageUrl: emp.residencyImageUrl || '',
      photoUrl: emp.photoUrl || '',
      email: emp.email || '',
      address: emp.address || '',
      notes: emp.notes || ''
    } as Employee;

    try {
      const { data, error } = await supabase
        .from('employees')
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        savedEmp.id = String(data.id);
        savedEmp.empCode = data.emp_code || empCode;
      }
    } catch (err) {
      console.warn('Supabase create employee failed, saved locally:', err);
    }

    // Always update local storage so UI never shows 0 employees
    const currentList = getLocalEmployees();
    const updatedList = [savedEmp, ...currentList.filter(e => e.id !== savedEmp.id)];
    saveLocalEmployees(updatedList);

    // Record immutable audit log entry in Audit Trail
    try {
      AuditService.addAuditLog({
        module: 'HR',
        action: 'CREATE',
        documentRef: savedEmp.empCode,
        status: savedEmp.status || 'POSTED',
        userName: 'HR Administrator',
        details: `Registered employee ${savedEmp.name} (${savedEmp.designation}) with UAE Legal IDs (EID: ${savedEmp.emiratesId || 'N/A'}, Pass: ${savedEmp.passportNo || 'N/A'})`
      });
    } catch (_) {}

    return savedEmp;
  }

  public static async updateEmployee(id: string, updates: Partial<Employee>): Promise<void> {
    this.clearEmployeeCache();
    const payload: any = {};
    if (updates.name !== undefined || (updates as any).full_name !== undefined || (updates as any).fullName !== undefined) {
      const nameVal = updates.name || (updates as any).full_name || (updates as any).fullName || '';
      payload.name = nameVal;
      payload.full_name = nameVal;
    }
    if (updates.nameArabic !== undefined || (updates as any).full_name_arabic !== undefined || (updates as any).fullNameArabic !== undefined) {
      const arabicVal = updates.nameArabic || (updates as any).full_name_arabic || (updates as any).fullNameArabic || '';
      payload.name_arabic = arabicVal;
      payload.full_name_arabic = arabicVal;
    }
    if (updates.designation !== undefined) payload.designation = updates.designation;
    if (updates.baseSalary !== undefined || (updates as any).basic_salary !== undefined) {
      const val = Number(updates.baseSalary ?? (updates as any).basic_salary ?? 0);
      payload.base_salary = val;
      payload.basic_salary = val;
    }
    if (updates.housingAllow !== undefined || (updates as any).housing_allowance !== undefined) {
      const val = Number(updates.housingAllow ?? (updates as any).housing_allowance ?? 0);
      payload.housing_allow = val;
      payload.housing_allowance = val;
    }
    if (updates.transportAllow !== undefined || (updates as any).transport_allowance !== undefined) {
      const val = Number(updates.transportAllow ?? (updates as any).transport_allowance ?? 0);
      payload.transport_allow = val;
      payload.transport_allowance = val;
    }
    const currentBase = Number(payload.base_salary ?? payload.basic_salary ?? 0);
    const currentHousing = Number(payload.housing_allow ?? payload.housing_allowance ?? 0);
    const currentTransport = Number(payload.transport_allow ?? payload.transport_allowance ?? 0);
    payload.total_package = currentBase + currentHousing + currentTransport;
    if (updates.otherAllow !== undefined) payload.other_allow = Number(updates.otherAllow);
    if (updates.workingHoursPerDay !== undefined) payload.working_hours_per_day = Number(updates.workingHoursPerDay);
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.joiningDate !== undefined) payload.joining_date = updates.joiningDate;
    if (updates.dob !== undefined) payload.dob = updates.dob || null;
    if (updates.gender !== undefined) payload.gender = updates.gender;
    if (updates.nationality !== undefined) payload.nationality = updates.nationality;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    // Legal Document IDs & Images
    if (updates.emiratesId !== undefined) payload.emirates_id = updates.emiratesId;
    if (updates.idCardNo !== undefined) payload.id_card_no = updates.idCardNo;
    if (updates.emiratesIdExpiry !== undefined) payload.emirates_id_expiry = updates.emiratesIdExpiry || null;
    if (updates.passportNo !== undefined) payload.passport_no = updates.passportNo;
    if (updates.passportCountry !== undefined) payload.passport_country = updates.passportCountry;
    if (updates.passportIssueDate !== undefined) payload.passport_issue_date = updates.passportIssueDate || null;
    if (updates.passportExpiry !== undefined) payload.passport_expiry = updates.passportExpiry || null;
    if (updates.residencyCardNo !== undefined) payload.residency_card_no = updates.residencyCardNo;
    if (updates.uidNo !== undefined) payload.uid_no = updates.uidNo;
    if (updates.residencyProfession !== undefined) payload.residency_profession = updates.residencyProfession;
    if (updates.residencySponsor !== undefined) payload.residency_sponsor = updates.residencySponsor;
    if (updates.residencyIssueDate !== undefined) payload.residency_issue_date = updates.residencyIssueDate || null;
    if (updates.residencyExpiryDate !== undefined) payload.residency_expiry_date = updates.residencyExpiryDate || null;
    if (updates.idFrontImageUrl !== undefined) payload.id_front_image_url = updates.idFrontImageUrl;
    if (updates.idBackImageUrl !== undefined) payload.id_back_image_url = updates.idBackImageUrl;
    if (updates.passportImageUrl !== undefined) payload.passport_image_url = updates.passportImageUrl;
    if (updates.residencyImageUrl !== undefined) payload.residency_image_url = updates.residencyImageUrl;
    if (updates.photoUrl !== undefined) payload.photo_url = updates.photoUrl;

    payload.updated_at = new Date().toISOString();

    try {
      await supabase
        .from('employees')
        .update(payload)
        .eq('id', String(id));
    } catch (err) {
      console.warn('Supabase update employee error, proceeding with local update:', err);
    }

    // Always update local list
    const list = getLocalEmployees();
    const idx = list.findIndex(e => e.id === String(id));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      saveLocalEmployees(list);

      try {
        AuditService.addAuditLog({
          module: 'HR',
          action: 'UPDATE',
          documentRef: list[idx].empCode || String(id),
          status: list[idx].status || 'POSTED',
          userName: 'HR Administrator',
          details: `Updated employee record for ${list[idx].name}`
        });
      } catch (_) {}
    }
  }

  public static async deleteEmployee(id: string): Promise<void> {
    this.clearEmployeeCache();
    try {
      await supabase
        .from('employees')
        .delete()
        .eq('id', String(id));
    } catch (err) {
      console.warn('Supabase delete employee error:', err);
    }

    const list = getLocalEmployees();
    const target = list.find(e => e.id === String(id));
    saveLocalEmployees(list.filter(e => e.id !== String(id)));

    if (target) {
      try {
        AuditService.addAuditLog({
          module: 'HR',
          action: 'DELETE',
          documentRef: target.empCode || String(id),
          status: 'UNPOSTED',
          userName: 'HR Administrator',
          details: `Deleted employee record ${target.name} (${target.empCode})`
        });
      } catch (_) {}
    }
  }

  // ==========================================
  // 2. ATTENDANCE (public.employee_attendance & hr_attendance_sheets)
  // ==========================================
  public static async getAttendance(monthYear?: string): Promise<AttendanceRecord[]> {
    let query = supabase
      .from('employee_attendance')
      .select('*')
      .order('created_at', { ascending: false });

    if (monthYear) {
      query = query.eq('month_year', monthYear);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Supabase error fetching attendance:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      employeeName: row.employee_name || '',
      empCode: row.emp_code || '',
      monthYear: row.month_year || '',
      daysWorked: Number(row.days_worked || 0),
      overtimeHours: Number(row.overtime_hours || 0),
      status: row.status || 'DRAFT',
      lockedAt: row.locked_at || '',
      lockedBy: row.locked_by || ''
    }));
  }

  public static async createAttendanceSheet(monthYear: string): Promise<AttendanceRecord[]> {
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(e => e.isActive);

    const records: any[] = activeEmployees.map(emp => ({
      id: generateId('att'),
      employee_id: String(emp.id),
      employee_name: emp.name,
      emp_code: emp.empCode,
      month_year: monthYear,
      days_worked: 30,
      overtime_hours: 0,
      status: 'DRAFT',
      created_at: new Date().toISOString()
    }));

    if (records.length > 0) {
      // Delete any existing draft for this month first
      await supabase
        .from('employee_attendance')
        .delete()
        .eq('month_year', monthYear)
        .eq('status', 'DRAFT');

      const { error } = await supabase
        .from('employee_attendance')
        .insert(records);

      if (error) {
        console.error('Error inserting attendance records:', error);
      }
    }

    // Upsert sheet log
    await supabase.from('hr_attendance_sheets').upsert({
      id: `sheet-${monthYear}`,
      month_year: monthYear,
      total_employees: activeEmployees.length,
      status: 'DRAFT'
    });

    return this.getAttendance(monthYear);
  }

  public static async updateAttendance(id: string, updates: { daysWorked?: number; overtimeHours?: number }): Promise<void> {
    const payload: any = {};
    if (updates.daysWorked !== undefined) payload.days_worked = Number(updates.daysWorked);
    if (updates.overtimeHours !== undefined) payload.overtime_hours = Number(updates.overtimeHours);

    const { error } = await supabase
      .from('employee_attendance')
      .update(payload)
      .eq('id', String(id));

    if (error) {
      console.error('Error updating attendance:', error);
      throw new Error(error.message);
    }
  }

  public static async postAttendanceSheet(monthYear: string): Promise<void> {
    await supabase
      .from('employee_attendance')
      .update({ status: 'POSTED', locked_at: new Date().toISOString(), locked_by: 'HR Manager' })
      .eq('month_year', monthYear);

    await supabase
      .from('hr_attendance_sheets')
      .upsert({
        id: `sheet-${monthYear}`,
        month_year: monthYear,
        status: 'POSTED'
      });
  }

  public static async unpostAttendanceSheet(monthYear: string): Promise<void> {
    await supabase
      .from('employee_attendance')
      .update({ status: 'DRAFT', locked_at: null, locked_by: null })
      .eq('month_year', monthYear);

    await supabase
      .from('hr_attendance_sheets')
      .upsert({
        id: `sheet-${monthYear}`,
        month_year: monthYear,
        status: 'DRAFT'
      });
  }

  public static async getAttendanceSheets(): Promise<any[]> {
    const { data, error } = await supabase
      .from('hr_attendance_sheets')
      .select('*')
      .order('month_year', { ascending: false });

    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id,
      monthYear: row.month_year,
      totalEmployees: row.total_employees,
      status: row.status,
      createdAt: row.created_at
    }));
  }

  // ==========================================
  // 3. EMPLOYEE LOANS (public.employee_loans)
  // ==========================================
  public static async getLoans(): Promise<EmployeeLoan[]> {
    const { data, error } = await supabase
      .from('employee_loans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching loans:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      employeeName: row.employee_name || '',
      empCode: row.emp_code || '',
      type: row.type || 'SALARY_ADVANCE',
      principalAmount: Number(row.principal_amount || 0),
      emiAmount: Number(row.emi_amount || 0),
      totalMonths: Number(row.total_months || 1),
      startMonth: row.start_month || '',
      remainingAmount: Number(row.remaining_amount || 0),
      status: row.status || 'ACTIVE',
      disbursementAccount: row.disbursement_account || '',
      disbursementMethod: row.disbursement_method || 'BANK_TRANSFER',
      notes: row.notes || '',
      createdAt: row.created_at || new Date().toISOString()
    }));
  }

  public static async createLoan(loan: Partial<EmployeeLoan>): Promise<EmployeeLoan> {
    const id = loan.id ? String(loan.id) : generateId('loan');
    const payload = {
      id,
      employee_id: String(loan.employeeId || ''),
      employee_name: loan.employeeName || '',
      emp_code: loan.empCode || '',
      type: loan.type || 'SALARY_ADVANCE',
      principal_amount: Number(loan.principalAmount || 0),
      emi_amount: Number(loan.emiAmount || 0),
      total_months: Number(loan.totalMonths || 1),
      start_month: loan.startMonth || new Date().toISOString().slice(0, 7),
      remaining_amount: Number(loan.principalAmount || 0),
      status: 'ACTIVE',
      disbursement_account: loan.disbursementAccount || '',
      disbursement_method: loan.disbursementMethod || 'BANK_TRANSFER',
      notes: loan.notes || '',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('employee_loans')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error creating loan:', error);
      throw new Error(error.message);
    }

    return {
      ...loan,
      id: String(data.id),
      remainingAmount: Number(data.remaining_amount)
    } as EmployeeLoan;
  }

  public static async deleteLoan(id: string): Promise<void> {
    const { error } = await supabase
      .from('employee_loans')
      .delete()
      .eq('id', String(id));

    if (error) {
      console.error('Error deleting loan:', error);
      throw new Error(error.message);
    }
  }

  // ==========================================
  // 4. PAYROLL (public.employee_payroll & hr_payroll_sheets)
  // ==========================================
  public static async getPayroll(monthYear?: string): Promise<PayrollRecord[]> {
    let query = supabase
      .from('employee_payroll')
      .select('*')
      .order('created_at', { ascending: false });

    if (monthYear) {
      query = query.eq('month_year', monthYear);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching payroll:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      employeeName: row.employee_name || '',
      empCode: row.emp_code || '',
      designation: row.designation || '',
      monthYear: row.month_year || '',
      status: row.status || 'DRAFT',
      baseSalary: Number(row.base_salary || 0),
      allowances: Number(row.allowances || 0),
      dailyRate: Number(row.daily_rate || 0),
      hourlyRate: Number(row.hourly_rate || 0),
      daysWorked: Number(row.days_worked || 30),
      overtimeHours: Number(row.overtime_hours || 0),
      earnedBasic: Number(row.earned_basic || 0),
      overtimePay: Number(row.overtime_pay || 0),
      grossPay: Number(row.gross_pay || 0),
      advanceDeduction: Number(row.advance_deduction || 0),
      loanEmiDeduction: Number(row.loan_emi_deduction || 0),
      totalDeductions: Number(row.total_deductions || 0),
      netPay: Number(row.net_pay || 0),
      paymentMethod: row.payment_method || 'BANK_TRANSFER',
      bankAccountId: row.bank_account_id || '',
      bankAccountName: row.bank_account_name || '',
      postedAt: row.posted_at || '',
      postedBy: row.posted_by || ''
    }));
  }

  public static async runPayroll(monthYear: string): Promise<PayrollRecord[]> {
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(e => e.isActive);
    const attendanceRecords = await this.getAttendance(monthYear);
    const loans = await this.getLoans();
    const activeLoans = loans.filter(l => l.status === 'ACTIVE' && l.remainingAmount > 0);

    const slips: any[] = activeEmployees.map(emp => {
      const att = attendanceRecords.find(a => String(a.employeeId) === String(emp.id));
      const daysWorked = att ? att.daysWorked : 30;
      const otHours = att ? att.overtimeHours : 0;

      const baseSalary = emp.baseSalary;
      const allowances = emp.housingAllow + emp.transportAllow;
      const dailyRate = Math.round((baseSalary / 30) * 100) / 100;
      const hourlyRate = Math.round((dailyRate / (emp.workingHoursPerDay || 8)) * 100) / 100;

      const earnedBasic = Math.round((dailyRate * daysWorked) * 100) / 100;
      const overtimePay = Math.round((hourlyRate * otHours * 1.5) * 100) / 100;
      const grossPay = earnedBasic + allowances + overtimePay;

      // Calculate loan/advance recovery
      const empLoans = activeLoans.filter(l => String(l.employeeId) === String(emp.id));
      let advanceDeduction = 0;
      let loanEmiDeduction = 0;

      for (const l of empLoans) {
        if (l.type === 'SALARY_ADVANCE') {
          advanceDeduction += Math.min(l.remainingAmount, l.principalAmount);
        } else {
          loanEmiDeduction += Math.min(l.remainingAmount, l.emiAmount);
        }
      }

      const totalDeductions = advanceDeduction + loanEmiDeduction;
      const netPay = Math.max(0, grossPay - totalDeductions);

      return {
        id: generateId('pay'),
        employee_id: String(emp.id),
        employee_name: emp.name,
        emp_code: emp.empCode,
        designation: emp.designation,
        month_year: monthYear,
        status: 'DRAFT',
        base_salary: baseSalary,
        allowances,
        daily_rate: dailyRate,
        hourly_rate: hourlyRate,
        days_worked: daysWorked,
        overtime_hours: otHours,
        earned_basic: earnedBasic,
        overtime_pay: overtimePay,
        gross_pay: grossPay,
        advance_deduction: advanceDeduction,
        loan_emi_deduction: loanEmiDeduction,
        total_deductions: totalDeductions,
        net_pay: netPay,
        payment_method: 'BANK_TRANSFER',
        created_at: new Date().toISOString()
      };
    });

    if (slips.length > 0) {
      await supabase
        .from('employee_payroll')
        .delete()
        .eq('month_year', monthYear)
        .eq('status', 'DRAFT');

      const { error } = await supabase
        .from('employee_payroll')
        .insert(slips);

      if (error) {
        console.error('Error saving payroll slips:', error);
      }
    }

    const totalGross = slips.reduce((sum, s) => sum + s.gross_pay, 0);
    const totalDeductions = slips.reduce((sum, s) => sum + s.total_deductions, 0);
    const totalNet = slips.reduce((sum, s) => sum + s.net_pay, 0);

    this.clearPayrollSheetsCache();
    await supabase.from('hr_payroll_sheets').upsert({
      id: `pay-sheet-${monthYear}`,
      month_year: monthYear,
      total_employees: slips.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      status: 'DRAFT'
    });

    return this.getPayroll(monthYear);
  }

  public static async postPayrollSheet(monthYear: string, disbursement?: { paymentMethod: string; bankAccountId?: string }): Promise<void> {
    this.clearPayrollSheetsCache();
    await supabase
      .from('employee_payroll')
      .update({
        status: 'POSTED',
        payment_method: disbursement?.paymentMethod || 'BANK_TRANSFER',
        bank_account_id: disbursement?.bankAccountId || null,
        posted_at: new Date().toISOString(),
        posted_by: 'Finance & HR Controller'
      })
      .eq('month_year', monthYear);

    await supabase
      .from('hr_payroll_sheets')
      .upsert({
        id: `pay-sheet-${monthYear}`,
        month_year: monthYear,
        status: 'POSTED',
        posted_at: new Date().toISOString()
      });
  }

  public static async unpostPayrollSheet(monthYear: string): Promise<void> {
    this.clearPayrollSheetsCache();
    await supabase
      .from('employee_payroll')
      .update({
        status: 'DRAFT',
        posted_at: null,
        posted_by: null
      })
      .eq('month_year', monthYear);

    await supabase
      .from('hr_payroll_sheets')
      .upsert({
        id: `pay-sheet-${monthYear}`,
        month_year: monthYear,
        status: 'DRAFT'
      });
  }

  public static async updatePayrollDeductions(id: string, deductions: { advanceDeduction?: number; loanEmiDeduction?: number }): Promise<void> {
    const { data: current } = await supabase
      .from('employee_payroll')
      .select('gross_pay')
      .eq('id', String(id))
      .single();

    if (current) {
      const adv = Number(deductions.advanceDeduction || 0);
      const loan = Number(deductions.loanEmiDeduction || 0);
      const total = adv + loan;
      const net = Math.max(0, Number(current.gross_pay || 0) - total);

      await supabase
        .from('employee_payroll')
        .update({
          advance_deduction: adv,
          loan_emi_deduction: loan,
          total_deductions: total,
          net_pay: net
        })
        .eq('id', String(id));
    }
  }

  public static async getPayrollSheets(forceRefresh: boolean = false): Promise<any[]> {
    if (!forceRefresh && this.cachedPayrollSheets && (Date.now() - this.lastPayrollSheetsFetched < this.PAYROLL_SHEETS_TTL_MS)) {
      return this.cachedPayrollSheets;
    }
    if (this.payrollSheetsPromise) {
      return this.payrollSheetsPromise;
    }

    this.payrollSheetsPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('hr_payroll_sheets')
          .select('*')
          .order('month_year', { ascending: false });

        if (error) {
          if (this.cachedPayrollSheets) return this.cachedPayrollSheets;
          return [];
        }
        const mapped = (data || []).map((row: any) => ({
          id: row.id,
          monthYear: row.month_year,
          totalEmployees: row.total_employees,
          totalGross: Number(row.total_gross || 0),
          totalDeductions: Number(row.total_deductions || 0),
          totalNet: Number(row.total_net || 0),
          status: row.status,
          createdAt: row.created_at
        }));
        this.cachedPayrollSheets = mapped;
        this.lastPayrollSheetsFetched = Date.now();
        return mapped;
      } finally {
        this.payrollSheetsPromise = null;
      }
    })();

    return this.payrollSheetsPromise;
  }

  // ==========================================
  // 6. OCR AUDIT LOGS (public.hr_ocr_logs)
  // ==========================================
  public static async saveOcrLog(log: {
    documentType: string;
    extractedName?: string;
    extractedId?: string;
    confidence?: number;
    source?: string;
    scannedBy?: string;
    details?: string;
  }): Promise<void> {
    const entry = {
      id: generateId('ocr-log'),
      document_type: log.documentType,
      extracted_name: log.extractedName || '',
      extracted_id: log.extractedId || '',
      confidence: Number(log.confidence || 0.98),
      source: log.source || 'GEMINI_AI_VISION',
      scanned_by: log.scannedBy || 'HR Admin',
      details: log.details || '',
      created_at: new Date().toISOString()
    };

    try {
      await supabase.from('hr_ocr_logs').insert(entry);
    } catch (err) {
      console.warn('Supabase ocr log insert failed, saving to local store:', err);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const key = 'vintage_vibes_hr_ocr_logs';
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([entry, ...saved.slice(0, 49)]));
      }
    } catch (_) {}

    // Record immutable audit log entry in Enterprise Audit Trail
    try {
      await AuditService.addAuditLog({
        module: 'HR',
        action: 'CREATE',
        documentRef: log.extractedId || entry.id,
        status: 'POSTED',
        userName: log.scannedBy || 'HR Admin',
        details: `AI OCR Document: [${log.documentType}] Name: ${log.extractedName || 'N/A'}, ID: ${log.extractedId || 'N/A'}. ${log.details || ''}`
      });
    } catch (_) {}
  }

  public static async getOcrLogs(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('hr_ocr_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (_) {}

    try {
      if (typeof localStorage !== 'undefined') {
        return JSON.parse(localStorage.getItem('vintage_vibes_hr_ocr_logs') || '[]');
      }
    } catch (_) {}
    return [];
  }
}
