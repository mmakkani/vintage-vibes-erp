import { Router } from 'express';
import { HRController } from './hr.controller.ts';
import { SetupService } from '../../services/setupService.ts';
import { Employee, AttendanceRecord, PayrollRecord, EmployeeLoan } from './hr.types.ts';
import { getPgClient, withDb } from '../../db/pgPool.ts';
import { verifyAuthToken, checkModulePermission } from '../../server/authValidator.ts';

export const hrRouter = Router();

// Helper: strictly format valid ISO date (YYYY-MM-DD) or return null for PostgreSQL date columns
function cleanDate(d: any): string | null {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  if (!trimmed || trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  return !isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function formatDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

// Clean nullable unique string (avoids PostgreSQL duplicate key violations on empty strings)
function cleanNullableUnique(val: any): string | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Map PostgreSQL `employees` row to frontend `Employee` interface with full casing support
function mapEmployeeRow(row: any): Employee {
  const basicSalary = Number(row.basic_salary ?? row.base_salary ?? row.salary ?? 0);
  const housingAllow = Number(row.housing_allowance ?? row.housing_allow ?? 0);
  const transportAllow = Number(row.transport_allowance ?? row.transport_allow ?? 0);
  const otherAllow = Number(row.other_allow ?? 0);
  const totalPackage = Number(row.total_package ?? row.gross_salary ?? (basicSalary + housingAllow + transportAllow + otherAllow));

  const empCode = row.employee_code || row.emp_code || 'EMP-0786';
  const fullName = (`${row.first_name || ''} ${row.last_name || ''}`).trim() || row.full_name || row.name || 'Staff Member';
  const firstName = row.first_name || fullName.split(' ')[0] || '';
  const lastName = row.last_name || fullName.split(' ').slice(1).join(' ') || '';
  const arabicName = row.name_arabic || row.arabic_name || row.full_name_arabic || '';

  return {
    id: String(row.id),
    code: empCode,
    empCode: empCode,
    employee_code: empCode,
    emp_code: empCode,
    name: fullName,
    fullName: fullName,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    name_arabic: arabicName,
    nameArabic: arabicName,
    arabic_name: arabicName,
    designation: row.designation || 'Staff',
    department: row.department || 'Operations',
    baseSalary: basicSalary,
    basic_salary: basicSalary,
    base_salary: basicSalary,
    salary: basicSalary,
    housingAllow: housingAllow,
    housing_allow: housingAllow,
    housing_allowance: housingAllow,
    transportAllow: transportAllow,
    transport_allow: transportAllow,
    transport_allowance: transportAllow,
    otherAllow: otherAllow,
    other_allow: otherAllow,
    totalPackage: totalPackage,
    gross_salary: totalPackage,
    total_package: totalPackage,
    workingHoursPerDay: Number(row.working_hours_per_day || 8),
    working_hours_per_day: Number(row.working_hours_per_day || 8),
    isActive: row.is_active !== false,
    is_active: row.is_active !== false,
    joiningDate: formatDateStr(row.joining_date || row.date_of_joining) || new Date().toISOString().slice(0, 10),
    joining_date: formatDateStr(row.joining_date || row.date_of_joining) || new Date().toISOString().slice(0, 10),
    status: (row.status || 'POSTED') as any,
    emiratesId: row.emirates_id || row.emirates_id_no || '',
    emirates_id: row.emirates_id || row.emirates_id_no || '',
    idCardNo: row.id_card_no || '',
    id_card_no: row.id_card_no || '',
    emiratesIdExpiry: formatDateStr(row.emirates_id_expiry),
    emirates_id_expiry: formatDateStr(row.emirates_id_expiry),
    passportNo: row.passport_no || row.passport_number || '',
    passport_no: row.passport_no || row.passport_number || '',
    passportCountry: row.passport_country || '',
    passport_country: row.passport_country || '',
    passportIssueDate: formatDateStr(row.passport_issue_date),
    passport_issue_date: formatDateStr(row.passport_issue_date),
    passportExpiry: formatDateStr(row.passport_expiry || row.passport_expiry_date),
    passport_expiry: formatDateStr(row.passport_expiry || row.passport_expiry_date),
    passportImageUrl: row.passport_image_url || '',
    passport_image_url: row.passport_image_url || '',
    residencyCardNo: row.residency_card_no || row.residency_no || '',
    residency_card_no: row.residency_card_no || row.residency_no || '',
    uidNo: row.uid_no || row.visa_uid || '',
    visaUid: row.uid_no || row.visa_uid || '',
    uid_no: row.uid_no || row.visa_uid || '',
    visa_uid: row.uid_no || row.visa_uid || '',
    residencyProfession: row.residency_profession || row.profession_on_visa || '',
    residency_profession: row.residency_profession || row.profession_on_visa || '',
    residencySponsor: row.residency_sponsor || row.sponsor || '',
    residency_sponsor: row.residency_sponsor || row.sponsor || '',
    residencyIssueDate: formatDateStr(row.residency_issue_date || row.visa_issue_date),
    residency_issue_date: formatDateStr(row.residency_issue_date || row.visa_issue_date),
    residencyExpiryDate: formatDateStr(row.residency_expiry_date || row.visa_expiry_date),
    residency_expiry_date: formatDateStr(row.residency_expiry_date || row.visa_expiry_date),
    residencyImageUrl: row.residency_image_url || row.visa_image_url || '',
    residency_image_url: row.residency_image_url || row.visa_image_url || '',
    photoUrl: row.photo_url || '',
    photo_url: row.photo_url || '',
    idFrontImageUrl: row.id_front_image_url || '',
    id_front_image_url: row.id_front_image_url || '',
    idBackImageUrl: row.id_back_image_url || '',
    id_back_image_url: row.id_back_image_url || '',
    nationality: row.nationality || '',
    gender: row.gender || 'MALE',
    dob: formatDateStr(row.dob || row.date_of_birth),
    email: row.email || '',
    address: row.address || '',
    notes: row.notes || ''
  };
}

// Map PostgreSQL `employee_attendance` row
function mapAttendanceRow(row: any): AttendanceRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: row.employee_name || '',
    empCode: row.emp_code || '',
    monthYear: row.month_year || '',
    daysWorked: Number(row.days_worked || 0),
    overtimeHours: Number(row.overtime_hours || 0),
    status: (row.status || 'DRAFT') as any,
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : undefined,
    lockedBy: row.locked_by || undefined
  };
}

// Map PostgreSQL `employee_payroll` row
function mapPayrollRow(row: any): PayrollRecord {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: row.employee_name || '',
    empCode: row.emp_code || '',
    designation: row.designation || '',
    monthYear: row.month_year || '',
    status: (row.status || 'DRAFT') as any,
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
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : undefined,
    postedBy: row.posted_by || undefined
  };
}

// Map PostgreSQL `employee_loans` row
function mapLoanRow(row: any): EmployeeLoan {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    employeeName: row.employee_name || '',
    empCode: row.emp_code || '',
    type: row.type || 'LOAN',
    principalAmount: Number(row.principal_amount || 0),
    emiAmount: Number(row.emi_amount || 0),
    totalMonths: Number(row.total_months || 0),
    startMonth: row.start_month || '',
    remainingAmount: Number(row.remaining_amount || 0),
    status: row.status || 'ACTIVE',
    disbursementAccount: row.disbursement_account || '',
    disbursementMethod: row.disbursement_method || 'BANK_TRANSFER',
    notes: row.notes || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
  };
}

// Auto-generate sequentially increasing EMP code (e.g., EMP-0787, EMP-0788)
async function generateNextEmpCode(client: Client): Promise<string> {
  const res = await client.query(`
    SELECT emp_code, employee_code FROM employees 
    WHERE emp_code LIKE 'EMP-%' OR employee_code LIKE 'EMP-%'
    ORDER BY created_at DESC LIMIT 50;
  `);
  let maxNum = 0;
  for (const row of res.rows) {
    const code = row.emp_code || row.employee_code || '';
    const match = code.match(/EMP-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `EMP-${String(maxNum + 1).padStart(4, '0')}`;
}

// =============================================================
// 1. EMPLOYEES LIFECYCLE (Direct PostgreSQL Persistence)
// =============================================================

// GET /api/hr/employees - Retrieve all employees from PostgreSQL
hrRouter.get('/employees', async (req, res) => {
  const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  const authHeader = (req.headers.authorization as string) || (req.headers['authorization'] as string) || '';
  const authResult = await verifyAuthToken(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: authResult.error || 'Unauthorized. Valid cryptographic authorization token is required to access employee records.',
      correlationId
    });
  }

  const perm = checkModulePermission(authResult.user, 'HR');
  if (!perm.allowed) {
    return res.status(403).json({
      success: false,
      error: perm.reason || 'Forbidden: Insufficient privileges to access employee records.',
      correlationId
    });
  }

  try {
    const data = await withDb(async (client) => {
      // Ensure existing empty string emails are converted to NULL to prevent unique index conflicts
      await client.query("UPDATE employees SET email = NULL WHERE email = '' OR email = ' ';").catch(() => {});

      let result: any;
      try {
        result = await client.query(`
          SELECT * FROM public.employees 
          WHERE is_deleted IS NOT TRUE 
          ORDER BY created_at DESC;
        `);
      } catch (colErr: any) {
        console.warn('[HR Routes] Column query failed, falling back to SELECT *:', colErr?.message);
        try {
          result = await client.query('SELECT * FROM public.employees ORDER BY id DESC;');
        } catch {
          result = await client.query('SELECT * FROM public.employees;');
        }
      }
      return result.rows.map(mapEmployeeRow);
    });
    return res.json(data);
  } catch (err: any) {
    console.error("Database query failed:", err);
    return res.status(200).json({
      success: false,
      diagnostic_error: err?.message || String(err),
      detail: err?.detail,
      stack: err?.stack,
      has_db_url: !!process.env.DATABASE_URL,
      employees: []
    });
  }
});

// POST /api/hr/employees - Register new employee into PostgreSQL
hrRouter.post('/employees', async (req, res) => {
  try {
    const emp = req.body;
    const saved = await withDb(async (client) => {
      // Clean any stale empty email records
      await client.query("UPDATE employees SET email = NULL WHERE email = '' OR email = ' ';").catch(() => {});

      let empCode = (emp.empCode || emp.emp_code || emp.employee_code || '').trim();
      if (!empCode) {
        empCode = await generateNextEmpCode(client);
      }

      const basicSalary = Number(emp.basic_salary ?? emp.baseSalary ?? emp.base_salary ?? 0);
      const housingAllowance = Number(emp.housing_allowance ?? emp.housingAllow ?? emp.housing_allow ?? 0);
      const transportAllowance = Number(emp.transport_allowance ?? emp.transportAllow ?? emp.transport_allow ?? 0);
      const otherAllowance = Number(emp.other_allow ?? emp.otherAllow ?? 0);
      const totalPackage = Number(emp.total_package ?? emp.totalPackage ?? (basicSalary + housingAllowance + transportAllowance + otherAllowance));
      const workingHoursPerDay = Number(emp.working_hours_per_day ?? emp.workingHoursPerDay ?? 8);

      const resolvedFullName = 
        emp.full_name || 
        emp.fullName || 
        emp.fullNameEnglish || 
        emp.name || 
        emp.full_name_english || 
        'Staff Member';

      const firstName = resolvedFullName.split(' ')[0] || resolvedFullName;
      const lastName = resolvedFullName.split(' ').slice(1).join(' ') || '';

      const resolvedArabicName = 
        emp.nameArabic || 
        emp.full_name_arabic || 
        emp.fullNameArabic || 
        emp.name_arabic || 
        '';

      const safeJoiningDate = cleanDate(emp.joiningDate || emp.joining_date) || new Date().toISOString().slice(0, 10);
      const cleanEmail = cleanNullableUnique(emp.email);

      const cols = [
        'emp_code', 'employee_code', 'name', 'full_name', 'first_name', 'last_name',
        'name_arabic', 'arabic_name', 'full_name_arabic',
        'designation', 'department',
        'base_salary', 'basic_salary', 'salary',
        'housing_allow', 'housing_allowance',
        'transport_allow', 'transport_allowance',
        'other_allow', 'total_package', 'gross_salary',
        'working_hours_per_day', 'is_active', 'status',
        'joining_date', 'date_of_joining',
        'dob', 'date_of_birth',
        'emirates_id', 'emirates_id_no', 'id_card_no', 'emirates_id_expiry',
        'passport_no', 'passport_number', 'passport_country', 'passport_issue_date', 'passport_expiry', 'passport_expiry_date',
        'residency_card_no', 'residency_no', 'uid_no', 'visa_uid',
        'residency_sponsor', 'sponsor', 'residency_profession', 'profession_on_visa',
        'residency_issue_date', 'visa_issue_date', 'residency_expiry_date', 'visa_expiry_date',
        'nationality', 'gender', 'email', 'address', 'notes',
        'id_front_image_url', 'id_back_image_url', 'passport_image_url', 'residency_image_url', 'visa_image_url', 'photo_url',
        'created_at', 'updated_at'
      ];

      const values = [
        empCode, empCode, resolvedFullName, resolvedFullName, firstName, lastName,
        resolvedArabicName, resolvedArabicName, resolvedArabicName,
        emp.designation || 'Staff', emp.department || 'Operations',
        basicSalary, basicSalary, basicSalary,
        housingAllowance, housingAllowance,
        transportAllowance, transportAllowance,
        otherAllowance, totalPackage, totalPackage,
        workingHoursPerDay, emp.isActive !== false, emp.status || 'POSTED',
        safeJoiningDate, safeJoiningDate,
        cleanDate(emp.dob || emp.date_of_birth), cleanDate(emp.dob || emp.date_of_birth),
        emp.emiratesId || emp.emirates_id || '', emp.emiratesId || emp.emirates_id || '', emp.idCardNo || emp.id_card_no || '', cleanDate(emp.emiratesIdExpiry || emp.emirates_id_expiry),
        emp.passportNo || emp.passport_no || '', emp.passportNo || emp.passport_no || '', emp.passportCountry || emp.passport_country || '', cleanDate(emp.passportIssueDate || emp.passport_issue_date), cleanDate(emp.passportExpiry || emp.passport_expiry), cleanDate(emp.passportExpiry || emp.passport_expiry),
        emp.residencyCardNo || emp.residency_card_no || '', emp.residencyCardNo || emp.residency_card_no || '', emp.uidNo || emp.uid_no || '', emp.uidNo || emp.uid_no || '',
        emp.residencySponsor || emp.residency_sponsor || '', emp.residencySponsor || emp.residency_sponsor || '', emp.residencyProfession || emp.residency_profession || '', emp.residencyProfession || emp.residency_profession || '',
        cleanDate(emp.residencyIssueDate || emp.residency_issue_date), cleanDate(emp.residencyIssueDate || emp.residency_issue_date), cleanDate(emp.residencyExpiryDate || emp.residency_expiry_date), cleanDate(emp.residencyExpiryDate || emp.residency_expiry_date),
        emp.nationality || '', emp.gender || 'MALE', cleanEmail, emp.address || '', emp.notes || '',
        emp.idFrontImageUrl || emp.id_front_image_url || '', emp.idBackImageUrl || emp.id_back_image_url || '', emp.passportImageUrl || emp.passport_image_url || '', emp.residencyImageUrl || emp.residency_image_url || '', emp.residencyImageUrl || emp.residency_image_url || '', emp.photoUrl || emp.photo_url || '',
        new Date(), new Date()
      ];

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *;`;

      const result = await client.query(query, values);
      return mapEmployeeRow(result.rows[0]);
    });

    return res.json(saved);
  } catch (err: any) {
    console.warn('[HR Routes] Error registering employee:', err?.message);
    return res.status(400).json({ success: false, error: err?.message || 'Failed to save employee' });
  }
});

// PUT /api/hr/employees/:id - Update existing employee in PostgreSQL
hrRouter.put('/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const emp = req.body;
    const updated = await withDb(async (client) => {
      const sets: string[] = [];
      const values: any[] = [];
      let idx = 1;

      const addCol = (colName: string, val: any) => {
        if (val !== undefined) {
          sets.push(`${colName} = $${idx++}`);
          values.push(val);
        }
      };

      const resolvedName = emp.full_name || emp.fullName || emp.name;
      if (resolvedName !== undefined) {
        addCol('name', resolvedName);
        addCol('full_name', resolvedName);
        addCol('first_name', resolvedName.split(' ')[0] || resolvedName);
        addCol('last_name', resolvedName.split(' ').slice(1).join(' ') || '');
      }

      const resolvedArabic = emp.nameArabic || emp.full_name_arabic || emp.name_arabic;
      if (resolvedArabic !== undefined) {
        addCol('name_arabic', resolvedArabic);
        addCol('arabic_name', resolvedArabic);
        addCol('full_name_arabic', resolvedArabic);
      }

      if (emp.empCode !== undefined || emp.emp_code !== undefined) {
        const c = emp.empCode || emp.emp_code;
        addCol('emp_code', c);
        addCol('employee_code', c);
      }

      if (emp.designation !== undefined) addCol('designation', emp.designation);
      if (emp.department !== undefined) addCol('department', emp.department);

      const basicSal = emp.basic_salary ?? emp.baseSalary ?? emp.base_salary;
      if (basicSal !== undefined) {
        const num = Number(basicSal);
        addCol('base_salary', num);
        addCol('basic_salary', num);
        addCol('salary', num);
      }

      const houseAllow = emp.housing_allowance ?? emp.housingAllow ?? emp.housing_allow;
      if (houseAllow !== undefined) {
        const num = Number(houseAllow);
        addCol('housing_allow', num);
        addCol('housing_allowance', num);
      }

      const transAllow = emp.transport_allowance ?? emp.transportAllow ?? emp.transport_allow;
      if (transAllow !== undefined) {
        const num = Number(transAllow);
        addCol('transport_allow', num);
        addCol('transport_allowance', num);
      }

      const totPkg = emp.total_package ?? emp.totalPackage;
      if (totPkg !== undefined) {
        const num = Number(totPkg);
        addCol('total_package', num);
        addCol('gross_salary', num);
      }

      if (emp.workingHoursPerDay !== undefined || emp.working_hours_per_day !== undefined) {
        addCol('working_hours_per_day', Number(emp.workingHoursPerDay || emp.working_hours_per_day || 8));
      }

      if (emp.isActive !== undefined || emp.is_active !== undefined) {
        addCol('is_active', (emp.isActive ?? emp.is_active) !== false);
      }

      if (emp.status !== undefined) addCol('status', emp.status);

      if (emp.joiningDate !== undefined || emp.joining_date !== undefined) {
        const jd = cleanDate(emp.joiningDate || emp.joining_date);
        addCol('joining_date', jd);
        addCol('date_of_joining', jd);
      }

      if (emp.dob !== undefined || emp.date_of_birth !== undefined) {
        const dob = cleanDate(emp.dob || emp.date_of_birth);
        addCol('dob', dob);
        addCol('date_of_birth', dob);
      }

      if (emp.emiratesId !== undefined || emp.emirates_id !== undefined) {
        const eid = emp.emiratesId || emp.emirates_id;
        addCol('emirates_id', eid);
        addCol('emirates_id_no', eid);
      }

      if (emp.idCardNo !== undefined || emp.id_card_no !== undefined) {
        addCol('id_card_no', emp.idCardNo || emp.id_card_no);
      }

      if (emp.emiratesIdExpiry !== undefined || emp.emirates_id_expiry !== undefined) {
        const eidExp = cleanDate(emp.emiratesIdExpiry || emp.emirates_id_expiry);
        addCol('emirates_id_expiry', eidExp);
      }

      if (emp.passportNo !== undefined || emp.passport_no !== undefined) {
        const pNo = emp.passportNo || emp.passport_no;
        addCol('passport_no', pNo);
        addCol('passport_number', pNo);
      }

      if (emp.passportCountry !== undefined || emp.passport_country !== undefined) {
        addCol('passport_country', emp.passportCountry || emp.passport_country);
      }

      if (emp.passportIssueDate !== undefined || emp.passport_issue_date !== undefined) {
        const pIssue = cleanDate(emp.passportIssueDate || emp.passport_issue_date);
        addCol('passport_issue_date', pIssue);
      }

      if (emp.passportExpiry !== undefined || emp.passport_expiry !== undefined) {
        const pExp = cleanDate(emp.passportExpiry || emp.passport_expiry);
        addCol('passport_expiry', pExp);
        addCol('passport_expiry_date', pExp);
      }

      if (emp.residencyCardNo !== undefined || emp.residency_card_no !== undefined) {
        const rNo = emp.residencyCardNo || emp.residency_card_no;
        addCol('residency_card_no', rNo);
        addCol('residency_no', rNo);
      }

      if (emp.uidNo !== undefined || emp.uid_no !== undefined) {
        const uNo = emp.uidNo || emp.uid_no;
        addCol('uid_no', uNo);
        addCol('visa_uid', uNo);
      }

      if (emp.residencySponsor !== undefined || emp.residency_sponsor !== undefined) {
        const sp = emp.residencySponsor || emp.residency_sponsor;
        addCol('residency_sponsor', sp);
        addCol('sponsor', sp);
      }

      if (emp.residencyProfession !== undefined || emp.residency_profession !== undefined) {
        const pr = emp.residencyProfession || emp.residency_profession;
        addCol('residency_profession', pr);
        addCol('profession_on_visa', pr);
      }

      if (emp.residencyIssueDate !== undefined || emp.residency_issue_date !== undefined) {
        const rIssue = cleanDate(emp.residencyIssueDate || emp.residency_issue_date);
        addCol('residency_issue_date', rIssue);
        addCol('visa_issue_date', rIssue);
      }

      if (emp.residencyExpiryDate !== undefined || emp.residency_expiry_date !== undefined) {
        const rExp = cleanDate(emp.residencyExpiryDate || emp.residency_expiry_date);
        addCol('residency_expiry_date', rExp);
        addCol('visa_expiry_date', rExp);
      }

      if (emp.nationality !== undefined) addCol('nationality', emp.nationality);
      if (emp.gender !== undefined) addCol('gender', emp.gender);
      if (emp.email !== undefined) addCol('email', cleanNullableUnique(emp.email));
      if (emp.address !== undefined) addCol('address', emp.address);
      if (emp.notes !== undefined) addCol('notes', emp.notes);

      if (emp.idFrontImageUrl !== undefined || emp.id_front_image_url !== undefined) {
        addCol('id_front_image_url', emp.idFrontImageUrl || emp.id_front_image_url);
      }
      if (emp.idBackImageUrl !== undefined || emp.id_back_image_url !== undefined) {
        addCol('id_back_image_url', emp.idBackImageUrl || emp.id_back_image_url);
      }
      if (emp.passportImageUrl !== undefined || emp.passport_image_url !== undefined) {
        addCol('passport_image_url', emp.passportImageUrl || emp.passport_image_url);
      }
      if (emp.residencyImageUrl !== undefined || emp.residency_image_url !== undefined) {
        const img = emp.residencyImageUrl || emp.residency_image_url;
        addCol('residency_image_url', img);
        addCol('visa_image_url', img);
      }
      if (emp.photoUrl !== undefined || emp.photo_url !== undefined) {
        addCol('photo_url', emp.photoUrl || emp.photo_url);
      }

      sets.push('updated_at = NOW()');
      values.push(id);

      const query = `
        UPDATE employees 
        SET ${sets.join(', ')} 
        WHERE id::text = $${idx} OR emp_code = $${idx} OR employee_code = $${idx} 
        RETURNING *;
      `;

      const result = await client.query(query, values);
      if (result.rows.length === 0) {
        throw new Error('Employee record not found in database');
      }
      return mapEmployeeRow(result.rows[0]);
    });

    return res.json(updated);
  } catch (err: any) {
    console.warn('[HR Routes] Fallback updating employee:', err?.message);
    return res.json(HRController.updateEmployee(id, req.body));
  }
});

// POST /api/hr/employees/:id/post - Post/Approve employee in PostgreSQL
hrRouter.post('/employees/:id/post', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await withDb(async (client) => {
      const result = await client.query(`
        UPDATE employees 
        SET status = 'POSTED', updated_at = NOW() 
        WHERE id::text = $1 OR emp_code = $1 OR employee_code = $1 
        RETURNING *;
      `, [id]);
      if (result.rows.length === 0) throw new Error('Employee not found');
      return mapEmployeeRow(result.rows[0]);
    });
    return res.json({ success: true, employee: updated });
  } catch (_) {
    const result = HRController.postEmployee(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// POST /api/hr/employees/:id/unpost - Unpost/Draft employee in PostgreSQL
hrRouter.post('/employees/:id/unpost', async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await withDb(async (client) => {
      const result = await client.query(`
        UPDATE employees 
        SET status = 'DRAFT', updated_at = NOW() 
        WHERE id::text = $1 OR emp_code = $1 OR employee_code = $1 
        RETURNING *;
      `, [id]);
      if (result.rows.length === 0) throw new Error('Employee not found');
      return mapEmployeeRow(result.rows[0]);
    });
    return res.json({ success: true, employee: updated });
  } catch (_) {
    const result = HRController.unpostEmployee(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// DELETE /api/hr/employees/:id - Delete employee from PostgreSQL
hrRouter.delete('/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await withDb(async (client) => {
      await client.query(`DELETE FROM employee_attendance WHERE employee_id = $1 OR emp_code = $1;`, [id]).catch(() => {});
      await client.query(`DELETE FROM employee_loans WHERE employee_id = $1 OR emp_code = $1;`, [id]).catch(() => {});
      await client.query(`DELETE FROM employee_payroll WHERE employee_id = $1 OR emp_code = $1;`, [id]).catch(() => {});
      await client.query(`DELETE FROM employees WHERE id::text = $1 OR emp_code = $1 OR employee_code = $1;`, [id]);
    });
    return res.json({ success: true });
  } catch (err: any) {
    const result = HRController.deleteEmployee(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// =============================================================
// 2. ATTENDANCE (Direct PostgreSQL Persistence)
// =============================================================

// GET /api/hr/attendance/sheets - Attendance sheets log
hrRouter.get('/attendance/sheets', async (req, res) => {
  try {
    const data = await withDb(async (client) => {
      const result = await client.query(`SELECT * FROM hr_attendance_sheets ORDER BY created_at DESC;`);
      return result.rows.map(r => ({
        id: r.id,
        monthYear: r.month_year,
        totalEmployees: Number(r.total_employees || 0),
        status: r.status,
        createdAt: r.created_at
      }));
    });
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getAttendanceSheetsLog());
  }
});

// GET /api/hr/attendance - Attendance records for selected month (auto-syncs missing active employees)
hrRouter.get('/attendance', async (req, res) => {
  const { month } = req.query as { month?: string };
  const monthYear = month || new Date().toISOString().slice(0, 7);
  try {
    const data = await withDb(async (client) => {
      const result = await client.query(`
        SELECT * FROM employee_attendance 
        WHERE month_year = $1 
        ORDER BY emp_code ASC;
      `, [monthYear]);

      let records = result.rows.map(mapAttendanceRow);
      const isPosted = records.length > 0 && records.every(r => r.status === 'POSTED');

      if (!isPosted) {
        const empRes = await client.query(`
          SELECT * FROM employees 
          WHERE is_deleted IS NOT TRUE 
            AND (is_active IS NULL OR is_active IS NOT FALSE)
            AND (status IS NULL OR status NOT IN ('TERMINATED', 'INACTIVE'))
          ORDER BY emp_code ASC;
        `);

        const activeEmps = empRes.rows;
        const existingEmpIds = new Set(records.map(r => String(r.employeeId)));
        const existingCodes = new Set(records.map(r => String(r.empCode).trim().toLowerCase()));

        const missing = activeEmps.filter(e => {
          const idStr = String(e.id);
          const codeStr = String(e.emp_code || e.employee_code || '').trim().toLowerCase();
          const hasId = idStr && existingEmpIds.has(idStr);
          const hasCode = codeStr && existingCodes.has(codeStr);
          return !hasId && !hasCode;
        });

        if (missing.length > 0) {
          for (const emp of missing) {
            const empId = String(emp.id);
            const empCode = emp.emp_code || emp.employee_code || '';
            const empName = emp.full_name || emp.name || 'Staff Member';
            const attId = `att-${empId}-${monthYear}`;

            await client.query(`
              INSERT INTO employee_attendance (id, employee_id, employee_name, emp_code, month_year, days_worked, overtime_hours, status, created_at)
              VALUES ($1, $2, $3, $4, $5, 30, 0, 'DRAFT', NOW())
              ON CONFLICT (id) DO NOTHING;
            `, [attId, empId, empName, empCode, monthYear]);

            records.push({
              id: attId,
              employeeId: empId,
              employeeName: empName,
              empCode: empCode,
              monthYear: monthYear,
              daysWorked: 30,
              overtimeHours: 0,
              status: 'DRAFT'
            });
          }

          await client.query(`
            INSERT INTO hr_attendance_sheets (id, month_year, total_employees, status, created_at)
            VALUES ($1, $2, $3, 'DRAFT', NOW())
            ON CONFLICT (id) DO UPDATE SET total_employees = hr_attendance_sheets.total_employees + $4;
          `, [`att-sheet-${monthYear}`, monthYear, records.length, missing.length]);
        }
      }

      return records;
    });
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getAttendance(monthYear));
  }
});

// POST /api/hr/attendance/sync-missing - Force sync missing active employees
hrRouter.post('/attendance/sync-missing', async (req, res) => {
  const { month } = req.body;
  const monthYear = month || new Date().toISOString().slice(0, 7);
  try {
    const synced = await withDb(async (client) => {
      const empRes = await client.query(`
        SELECT * FROM employees 
        WHERE is_deleted IS NOT TRUE 
          AND (is_active IS NULL OR is_active IS NOT FALSE)
          AND (status IS NULL OR status NOT IN ('TERMINATED', 'INACTIVE'))
        ORDER BY emp_code ASC;
      `);
      const existingRes = await client.query(`SELECT * FROM employee_attendance WHERE month_year = $1;`, [monthYear]);
      const existingEmpIds = new Set(existingRes.rows.map(r => String(r.employee_id)));
      const existingCodes = new Set(existingRes.rows.map(r => String(r.emp_code || '').trim().toLowerCase()));

      const missing = empRes.rows.filter(e => {
        const idStr = String(e.id);
        const codeStr = String(e.emp_code || e.employee_code || '').trim().toLowerCase();
        return (!idStr || !existingEmpIds.has(idStr)) && (!codeStr || !existingCodes.has(codeStr));
      });

      for (const emp of missing) {
        const empId = String(emp.id);
        const empCode = emp.emp_code || emp.employee_code || '';
        const empName = emp.full_name || emp.name || 'Staff Member';
        const attId = `att-${empId}-${monthYear}`;

        await client.query(`
          INSERT INTO employee_attendance (id, employee_id, employee_name, emp_code, month_year, days_worked, overtime_hours, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 30, 0, 'DRAFT', NOW())
          ON CONFLICT (id) DO NOTHING;
        `, [attId, empId, empName, empCode, monthYear]);
      }

      if (missing.length > 0) {
        await client.query(`
          INSERT INTO hr_attendance_sheets (id, month_year, total_employees, status, created_at)
          VALUES ($1, $2, $3, 'DRAFT', NOW())
          ON CONFLICT (id) DO UPDATE SET total_employees = hr_attendance_sheets.total_employees + $4;
        `, [`att-sheet-${monthYear}`, monthYear, existingRes.rows.length + missing.length, missing.length]);
      }

      const updatedRes = await client.query(`SELECT * FROM employee_attendance WHERE month_year = $1 ORDER BY emp_code ASC;`, [monthYear]);
      return updatedRes.rows.map(mapAttendanceRow);
    });
    return res.json({ success: true, records: synced });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message });
  }
});

// PUT /api/hr/attendance/:id - Update days worked & overtime hours
hrRouter.put('/attendance/:id', async (req, res) => {
  const { id } = req.params;
  const { daysWorked, overtimeHours } = req.body;
  try {
    await withDb(async (client) => {
      await client.query(`
        UPDATE employee_attendance 
        SET days_worked = $1, overtime_hours = $2 
        WHERE id = $3;
      `, [Number(daysWorked || 0), Number(overtimeHours || 0), id]);
    });
    return res.json({ success: true });
  } catch (_) {
    return res.json(HRController.updateAttendance(id, Number(daysWorked), Number(overtimeHours)));
  }
});

// POST /api/hr/attendance/create-sheet - Initialize monthly attendance sheet
hrRouter.post('/attendance/create-sheet', async (req, res) => {
  const { month } = req.body;
  if (!month) {
    return res.status(400).json({ error: 'Month is required (e.g. 2026-09)' });
  }
  try {
    const records = await withDb(async (client) => {
      const empRes = await client.query(`
        SELECT * FROM employees 
        WHERE is_active IS NOT FALSE AND is_deleted IS NOT TRUE 
        ORDER BY emp_code ASC;
      `);
      const employees = empRes.rows;

      for (const emp of employees) {
        const empId = String(emp.id);
        const empCode = emp.emp_code || emp.employee_code || '';
        const empName = emp.full_name || emp.name || '';
        const attId = `att-${empId}-${month}`;

        await client.query(`
          INSERT INTO employee_attendance (id, employee_id, employee_name, emp_code, month_year, days_worked, overtime_hours, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 30, 0, 'DRAFT', NOW())
          ON CONFLICT (id) DO UPDATE SET employee_name = EXCLUDED.employee_name, emp_code = EXCLUDED.emp_code;
        `, [attId, empId, empName, empCode, month]);
      }

      const sheetId = `att-sheet-${month}`;
      await client.query(`
        INSERT INTO hr_attendance_sheets (id, month_year, total_employees, status, created_at)
        VALUES ($1, $2, $3, 'DRAFT', NOW())
        ON CONFLICT (id) DO UPDATE SET total_employees = EXCLUDED.total_employees;
      `, [sheetId, month, employees.length]);

      const attRes = await client.query(`
        SELECT * FROM employee_attendance 
        WHERE month_year = $1 
        ORDER BY emp_code ASC;
      `, [month]);

      return attRes.rows.map(mapAttendanceRow);
    });
    return res.json({ success: true, records });
  } catch (err: any) {
    const result = HRController.createAttendanceSheet(month);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// DELETE /api/hr/attendance/sheet - Delete attendance sheet & records
hrRouter.delete(['/attendance/sheet', '/attendance/:month'], async (req, res) => {
  const month = req.params.month || req.body?.month || (req.query?.month as string);
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }
  try {
    await withDb(async (client) => {
      await client.query(`DELETE FROM employee_attendance WHERE month_year = $1;`, [month]);
      await client.query(`DELETE FROM hr_attendance_sheets WHERE month_year = $1;`, [month]);
    });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deleteAttendanceSheet(month);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// Helper function to rebuild draft payroll slips from attendance records for a month
async function rebuildPayrollFromAttendance(client: any, month: string) {
  const attRes = await client.query(`
    SELECT * FROM employee_attendance 
    WHERE month_year = $1 
    ORDER BY emp_code ASC;
  `, [month]);
  const attendanceRows = attRes.rows || [];
  if (attendanceRows.length === 0) return [];

  const empRes = await client.query(`
    SELECT * FROM employees 
    WHERE is_active IS NOT FALSE AND is_deleted IS NOT TRUE 
    ORDER BY emp_code ASC;
  `).catch(() => ({ rows: [] }));
  const employees = empRes.rows || [];

  const loanRes = await client.query(`
    SELECT * FROM employee_loans 
    WHERE status = 'ACTIVE' AND remaining_amount > 0;
  `).catch(() => ({ rows: [] }));
  const loans = loanRes.rows || [];

  // Clear stale DRAFT slips for this month
  await client.query(`
    DELETE FROM employee_payroll 
    WHERE month_year = $1 AND (status = 'DRAFT' OR status IS NULL);
  `, [month]).catch(() => {});

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const att of attendanceRows) {
    const attEmpId = String(att.employee_id || '');
    const attCode = String(att.emp_code || '').trim().toLowerCase();
    const emp = employees.find((e: any) => 
      (attEmpId && String(e.id) === attEmpId) || 
      (attCode && (e.emp_code || e.employee_code || '').trim().toLowerCase() === attCode)
    );

    const empId = emp ? String(emp.id) : attEmpId;
    const empCode = (emp?.emp_code || emp?.employee_code || att.emp_code || '').trim();
    const empName = (emp?.full_name || emp?.name || att.employee_name || 'Staff Member').trim();
    const desig = emp?.designation || 'Staff';

    const daysWorked = Number(att.days_worked ?? 30);
    const otHours = Number(att.overtime_hours ?? 0);

    const baseSalary = Number(emp?.basic_salary ?? emp?.base_salary ?? 0);
    const allowances = Number(emp?.housing_allowance ?? emp?.housing_allow ?? 0) + 
                       Number(emp?.transport_allowance ?? emp?.transport_allow ?? 0) + 
                       Number(emp?.other_allowances ?? emp?.other_allow ?? 0);
    const dailyRate = Math.round((baseSalary / 30) * 100) / 100;
    const workingHours = Number(emp?.working_hours_per_day || 8);
    const hourlyRate = Math.round((dailyRate / workingHours) * 100) / 100;

    const earnedBasic = Math.round((dailyRate * daysWorked) * 100) / 100;
    const overtimePay = Math.round((hourlyRate * otHours * 1.5) * 100) / 100;
    const grossPay = earnedBasic + allowances + overtimePay;

    const empLoans = loans.filter((l: any) => 
      (empId && String(l.employee_id) === empId) || 
      (empCode && (l.emp_code || '').trim().toLowerCase() === empCode.toLowerCase())
    );
    let advanceDeduction = 0;
    let loanEmiDeduction = 0;
    for (const l of empLoans) {
      const rem = Number(l.remaining_amount || 0);
      if (l.type === 'SALARY_ADVANCE') {
        advanceDeduction += Math.min(rem, Number(l.principal_amount || rem));
      } else {
        loanEmiDeduction += Math.min(rem, Number(l.emi_amount || rem));
      }
    }

    const slipDeductions = advanceDeduction + loanEmiDeduction;
    const netPay = Math.max(0, grossPay - slipDeductions);

    totalGross += grossPay;
    totalDeductions += slipDeductions;
    totalNet += netPay;

    const slipId = `pay-${empId || att.id}-${month}`;
    await client.query(`
      INSERT INTO employee_payroll (
        id, employee_id, employee_name, emp_code, designation, month_year, status,
        base_salary, allowances, daily_rate, hourly_rate, days_worked, overtime_hours,
        earned_basic, overtime_pay, gross_pay, advance_deduction, loan_emi_deduction,
        total_deductions, net_pay, payment_method, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'DRAFT',
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        $18, $19, 'BANK_TRANSFER', NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        employee_name = EXCLUDED.employee_name,
        emp_code = EXCLUDED.emp_code,
        designation = EXCLUDED.designation,
        base_salary = EXCLUDED.base_salary,
        allowances = EXCLUDED.allowances,
        daily_rate = EXCLUDED.daily_rate,
        hourly_rate = EXCLUDED.hourly_rate,
        days_worked = EXCLUDED.days_worked,
        overtime_hours = EXCLUDED.overtime_hours,
        earned_basic = EXCLUDED.earned_basic,
        overtime_pay = EXCLUDED.overtime_pay,
        gross_pay = EXCLUDED.gross_pay,
        advance_deduction = EXCLUDED.advance_deduction,
        loan_emi_deduction = EXCLUDED.loan_emi_deduction,
        total_deductions = EXCLUDED.total_deductions,
        net_pay = EXCLUDED.net_pay;
    `, [
      slipId, empId, empName, empCode, desig, month,
      baseSalary, allowances, dailyRate, hourlyRate, daysWorked, otHours,
      earnedBasic, overtimePay, grossPay, advanceDeduction, loanEmiDeduction,
      slipDeductions, netPay
    ]);
  }

  const sheetId = `pay-sheet-${month}`;
  await client.query(`
    INSERT INTO hr_payroll_sheets (
      id, month_year, total_employees, total_gross, gross_total, total_deductions, total_net, net_payable, status, created_at
    ) VALUES (
      $1, $2, $3, $4, $4, $5, $6, $6, 'DRAFT', NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      total_employees = EXCLUDED.total_employees,
      total_gross = EXCLUDED.total_gross,
      gross_total = EXCLUDED.gross_total,
      total_deductions = EXCLUDED.total_deductions,
      total_net = EXCLUDED.total_net,
      net_payable = EXCLUDED.net_payable;
  `, [sheetId, month, attendanceRows.length, totalGross, totalDeductions, totalNet]);

  const slipRes = await client.query(`
    SELECT * FROM employee_payroll 
    WHERE month_year = $1 
    ORDER BY emp_code ASC;
  `, [month]);

  return slipRes.rows;
}

// POST /api/hr/attendance/post - Lock & Post attendance sheet & auto-rebuild draft payroll
hrRouter.post('/attendance/post', async (req, res) => {
  const { month, postedBy } = req.body;
  try {
    await withDb(async (client) => {
      await client.query(`
        UPDATE employee_attendance 
        SET status = 'POSTED', locked_at = NOW(), locked_by = $2 
        WHERE month_year = $1;
      `, [month, postedBy || 'HR Manager']);
      await client.query(`
        UPDATE hr_attendance_sheets 
        SET status = 'POSTED' 
        WHERE month_year = $1;
      `, [month]);

      // Auto-rebuild draft payroll for this month so all 4 employees appear in payroll
      const sheetCheck = await client.query(`SELECT status FROM hr_payroll_sheets WHERE month_year = $1;`, [month]).catch(() => ({ rows: [] }));
      if (sheetCheck.rows[0]?.status !== 'POSTED') {
        await rebuildPayrollFromAttendance(client, month);
      }
    });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.postAttendanceSheet(month, postedBy || 'HR Manager');
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// POST /api/hr/attendance/unpost - Unlock & Unpost attendance sheet
hrRouter.post('/attendance/unpost', async (req, res) => {
  const { month } = req.body;
  try {
    await withDb(async (client) => {
      await client.query(`
        UPDATE employee_attendance 
        SET status = 'DRAFT', locked_at = NULL, locked_by = NULL 
        WHERE month_year = $1;
      `, [month]);
      await client.query(`
        UPDATE hr_attendance_sheets 
        SET status = 'DRAFT' 
        WHERE month_year = $1;
      `, [month]);
    });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.unpostAttendanceSheet(month);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// =============================================================
// 3. PAYROLL (Direct PostgreSQL Persistence & Precision Computations)
// =============================================================

// GET /api/hr/payroll/sheets - Payroll sheets log
hrRouter.get('/payroll/sheets', async (req, res) => {
  try {
    const data = await withDb(async (client) => {
      const result = await client.query(`
        SELECT 
          s.*,
          COALESCE(NULLIF(s.total_gross, 0), NULLIF(s.gross_total, 0), ep.calc_gross, 0) as calc_gross_pay,
          COALESCE(s.total_deductions, ep.calc_deductions, 0) as calc_deductions_val,
          COALESCE(NULLIF(s.total_net, 0), NULLIF(s.net_payable, 0), ep.calc_net, 0) as calc_net_pay,
          COALESCE(NULLIF(s.total_employees, 0), ep.emp_count, 0) as calc_emp_count
        FROM hr_payroll_sheets s
        LEFT JOIN (
          SELECT month_year, COUNT(*) as emp_count, SUM(gross_pay) as calc_gross, SUM(total_deductions) as calc_deductions, SUM(net_pay) as calc_net
          FROM employee_payroll
          GROUP BY month_year
        ) ep ON ep.month_year = s.month_year
        ORDER BY s.created_at DESC;
      `);
      return result.rows.map(r => {
        const gross = Number(r.calc_gross_pay ?? r.total_gross ?? r.gross_total ?? 0);
        const deductions = Number(r.calc_deductions_val ?? r.total_deductions ?? 0);
        const net = Number(r.calc_net_pay ?? r.total_net ?? r.net_payable ?? 0);
        const employees = Number(r.calc_emp_count ?? r.total_employees ?? 0);
        return {
          id: r.id,
          monthYear: r.month_year,
          totalEmployees: employees,
          totalGross: gross,
          totalGrossPay: gross,
          grossTotal: gross,
          totalDeductions: deductions,
          totalNet: net,
          totalNetPay: net,
          netPayable: net,
          status: r.status,
          postedAt: r.posted_at,
          voucherNo: r.voucher_no,
          voucherId: r.voucher_id,
          createdAt: r.created_at
        };
      });
    });
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getPayrollSheetsLog());
  }
});

// GET /api/hr/payroll - Individual employee payroll slips for month
hrRouter.get('/payroll', async (req, res) => {
  const { month } = req.query as { month?: string };
  const monthYear = month || new Date().toISOString().slice(0, 7);
  try {
    const data = await withDb(async (client) => {
      let result = await client.query(`
        SELECT * FROM employee_payroll 
        WHERE month_year = $1 
        ORDER BY emp_code ASC;
      `, [monthYear]);

      // Check if attendance has more records than current draft payroll slips
      const attCountRes = await client.query(`
        SELECT COUNT(*) as count FROM employee_attendance 
        WHERE month_year = $1;
      `, [monthYear]).catch(() => ({ rows: [{ count: 0 }] }));
      const attCount = Number(attCountRes.rows[0]?.count || 0);

      const isAllDraft = result.rows.length === 0 || result.rows.every((r: any) => r.status === 'DRAFT' || !r.status);
      if (attCount > 0 && result.rows.length < attCount && isAllDraft) {
        await rebuildPayrollFromAttendance(client, monthYear);
        result = await client.query(`
          SELECT * FROM employee_payroll 
          WHERE month_year = $1 
          ORDER BY emp_code ASC;
        `, [monthYear]);
      }

      return result.rows.map(mapPayrollRow);
    });
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getPayroll(monthYear));
  }
});

// POST /api/hr/payroll/run & /api/hr/payroll/sync-attendance - Run or force-sync payroll calculation for month
hrRouter.post(['/payroll/run', '/payroll/sync-attendance'], async (req, res) => {
  const { month } = req.body;
  try {
    const slips = await withDb(async (client) => {
      const rows = await rebuildPayrollFromAttendance(client, month);
      return rows.map(mapPayrollRow);
    });

    return res.json({ success: true, records: slips });
  } catch (err: any) {
    const result = HRController.runPayroll(month);
    if (!result.success) return res.status(400).json({ error: result.errors?.join(', ') || 'Failed to calculate payroll' });
    return res.json(result);
  }
});

// DELETE /api/hr/payroll/sheet - Delete payroll sheet & records
hrRouter.delete(['/payroll/sheet', '/payroll/:month'], async (req, res) => {
  const month = req.params.month || req.body?.month || (req.query?.month as string);
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }
  try {
    await withDb(async (client) => {
      await client.query(`DELETE FROM employee_payroll WHERE month_year = $1;`, [month]);
      await client.query(`DELETE FROM hr_payroll_sheets WHERE month_year = $1;`, [month]);
    });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deletePayroll(month);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// PUT /api/hr/payroll/:id/deductions - Update deductions on single slip
hrRouter.put('/payroll/:id/deductions', async (req, res) => {
  const { advanceDeduction, loanEmiDeduction } = req.body;
  try {
    await withDb(async (client) => {
      const pRes = await client.query(`SELECT * FROM employee_payroll WHERE id = $1;`, [req.params.id]);
      if (pRes.rows.length === 0) throw new Error('Payroll slip not found');
      const row = pRes.rows[0];
      const adv = Number(advanceDeduction ?? row.advance_deduction ?? 0);
      const loan = Number(loanEmiDeduction ?? row.loan_emi_deduction ?? 0);
      const totalDed = adv + loan;
      const gross = Number(row.gross_pay || 0);
      const net = Math.max(0, gross - totalDed);

      await client.query(`
        UPDATE employee_payroll 
        SET advance_deduction = $1, loan_emi_deduction = $2, total_deductions = $3, net_pay = $4 
        WHERE id = $5;
      `, [adv, loan, totalDed, net, req.params.id]);

      const totalsRes = await client.query(`
        SELECT SUM(gross_pay) as gross, SUM(total_deductions) as deductions, SUM(net_pay) as net 
        FROM employee_payroll 
        WHERE month_year = $1;
      `, [row.month_year]);

      if (totalsRes.rows[0]) {
        await client.query(`
          UPDATE hr_payroll_sheets 
          SET total_gross = $1, gross_total = $1, total_deductions = $2, total_net = $3, net_payable = $3 
          WHERE month_year = $4;
        `, [
          Number(totalsRes.rows[0].gross || 0),
          Number(totalsRes.rows[0].deductions || 0),
          Number(totalsRes.rows[0].net || 0),
          row.month_year
        ]);
      }
    });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.updatePayrollDeductions(req.params.id, advanceDeduction, loanEmiDeduction);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// POST /api/hr/payroll/post & /api/hr/payroll/:id/post - Lock & Post payroll
hrRouter.post(['/payroll/post', '/payroll/:id/post'], async (req, res) => {
  const { month, postedBy, paymentMethod, bankAccountId } = req.body;
  const target = req.params.id || month;
  try {
    const rpcRes = await withDb(async (client) => {
      if (target && target.includes('-') && target.length === 7) {
        const r = await client.query('SELECT public.post_payroll_batch_and_post_jv($1, $2) as result;', [target, postedBy || 'HR Director']);
        return r.rows[0]?.result || { success: true };
      } else {
        await client.query(`
          UPDATE employee_payroll 
          SET status = 'POSTED', posted_at = NOW(), posted_by = $2, payment_method = COALESCE($3, payment_method), bank_account_id = COALESCE($4, bank_account_id)
          WHERE id = $1;
        `, [target, postedBy || 'HR Director', paymentMethod, bankAccountId]);
        return { success: true };
      }
    });
    return res.json(rpcRes || { success: true });
  } catch (err: any) {
    const result = HRController.postPayroll(target, postedBy || 'HR Director', paymentMethod, bankAccountId);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// POST /api/hr/payroll/unpost & /api/hr/payroll/:id/unpost - Unlock & Unpost payroll
hrRouter.post(['/payroll/unpost', '/payroll/:id/unpost'], async (req, res) => {
  const { month } = req.body;
  const target = req.params.id || month;
  try {
    const rpcRes = await withDb(async (client) => {
      if (target && target.includes('-') && target.length === 7) {
        const r = await client.query('SELECT public.unpost_payroll_batch_and_reverse_jv($1) as result;', [target]);
        return r.rows[0]?.result || { success: true };
      } else {
        await client.query(`
          UPDATE employee_payroll 
          SET status = 'DRAFT', posted_at = NULL, posted_by = NULL 
          WHERE id = $1;
        `, [target]);
        return { success: true };
      }
    });
    return res.json(rpcRes || { success: true });
  } catch (err: any) {
    const result = HRController.unpostPayroll(target);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// =============================================================
// 4. EMPLOYEE LOANS & ADVANCES (Direct PostgreSQL Persistence)
// =============================================================

// GET /api/hr/loans - List employee loans
hrRouter.get('/loans', async (req, res) => {
  try {
    const { employeeId } = req.query as { employeeId?: string };
    const data = await withDb(async (client) => {
      let query = `SELECT * FROM employee_loans`;
      const params: any[] = [];
      if (employeeId) {
        query += ` WHERE employee_id = $1 OR emp_code = $1`;
        params.push(employeeId);
      }
      query += ` ORDER BY created_at DESC;`;
      const result = await client.query(query, params);
      return result.rows.map(mapLoanRow);
    });
    return res.json(data);
  } catch (_) {
    const { employeeId } = req.query as { employeeId?: string };
    return res.json(HRController.getEmployeeLoans(employeeId));
  }
});

// POST /api/hr/loans - Create new employee loan / advance
hrRouter.post('/loans', async (req, res) => {
  try {
    const loan = await withDb(async (client) => {
      const { employeeId, type, principalAmount, emiAmount, totalMonths, startMonth, disbursementAccount, disbursementMethod, notes } = req.body;
      const empRes = await client.query(`SELECT * FROM employees WHERE id::text = $1 OR emp_code = $1;`, [employeeId]);
      const emp = empRes.rows[0];
      const id = `loan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const result = await client.query(`
        INSERT INTO employee_loans (
          id, employee_id, employee_name, emp_code, type, principal_amount, emi_amount,
          total_months, start_month, remaining_amount, status, disbursement_account,
          disbursement_method, notes, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12, $13, NOW()
        ) RETURNING *;
      `, [
        id,
        emp ? String(emp.id) : employeeId,
        emp ? (emp.full_name || emp.name) : 'Staff Member',
        emp ? (emp.emp_code || emp.employee_code) : '',
        type || 'LOAN',
        Number(principalAmount || 0),
        Number(emiAmount || 0),
        Number(totalMonths || 1),
        startMonth || new Date().toISOString().slice(0, 7),
        Number(principalAmount || 0),
        disbursementAccount || '',
        disbursementMethod || 'BANK_TRANSFER',
        notes || ''
      ]);
      return mapLoanRow(result.rows[0]);
    });
    return res.json({ success: true, loan });
  } catch (err: any) {
    const result = HRController.createEmployeeLoan(req.body);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// DELETE /api/hr/loans/:id - Delete employee loan
hrRouter.delete('/loans/:id', async (req, res) => {
  try {
    await withDb(async (client) => {
      await client.query(`DELETE FROM employee_loans WHERE id = $1;`, [req.params.id]);
    });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deleteEmployeeLoan(req.params.id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

// =============================================================
// 5. AI OCR DOCUMENT SCANNING & OCR LOGS
// =============================================================

// GET /api/hr/ocr/status - AI OCR Configuration Status
hrRouter.get('/ocr/status', async (req, res) => {
  const status = HRController.getOcrConfigStatus();
  if (status.configured) return res.json(status);
  try {
    const config = await SetupService.getGeminiApiConfig();
    if (config.configured) {
      return res.json({ configured: true, model: config.model || 'gemini-3.7-flash' });
    }
  } catch (_) {}
  return res.json(status);
});

// GET /api/hr/ocr/logs - Recent OCR Scans History
hrRouter.get(['/ocr/logs', '/hr/ocr/logs'], async (req, res) => {
  const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  const authHeader = (req.headers.authorization as string) || (req.headers['authorization'] as string) || '';
  const authResult = await verifyAuthToken(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: authResult.error || 'Unauthorized. Valid cryptographic authorization token is required to access OCR logs.',
      correlationId
    });
  }

  const perm = checkModulePermission(authResult.user, 'HR');
  if (!perm.allowed) {
    return res.status(403).json({
      success: false,
      error: perm.reason || 'Forbidden: Insufficient privileges to access HR OCR scan logs.',
      correlationId
    });
  }

  try {
    const logs = await withDb(async (client) => {
      const result = await client.query(`SELECT * FROM hr_ocr_logs ORDER BY created_at DESC LIMIT 50;`);
      return result.rows.map(r => ({
        id: r.id,
        employeeId: r.employee_id,
        documentType: r.document_type,
        confidenceScore: Number(r.confidence_score ?? r.confidence ?? 0),
        confidence: Number(r.confidence_score ?? r.confidence ?? 0),
        extractedData: r.extracted_data,
        rawResponse: r.raw_response,
        extractedName: r.extracted_name,
        extractedId: r.extracted_id,
        source: r.source,
        scannedBy: r.scanned_by,
        details: r.details,
        createdAt: r.created_at
      }));
    });
    return res.json(logs);
  } catch (_) {
    return res.json([]);
  }
});

// POST /api/hr/ocr/scan - Perform AI OCR scan and log history
hrRouter.post('/ocr/scan', async (req, res) => {
  try {
    const { documentType, imageBase64, secondaryImageBase64, apiKey } = req.body;
    const headerKey = req.headers['x-gemini-api-key'] as string;
    let effectiveApiKey = (apiKey && typeof apiKey === 'string' && apiKey.trim())
      ? apiKey.trim()
      : (headerKey && headerKey.trim() ? headerKey.trim() : undefined);

    if (!effectiveApiKey) {
      try {
        const config = await SetupService.getGeminiApiConfig();
        if (config.configured && config.apiKey) {
          effectiveApiKey = config.apiKey;
        }
      } catch (_) {}
    }

    const result = await HRController.performAIOCRScan({
      documentType: documentType || 'AUTO_DETECT',
      imageBase64,
      secondaryImageBase64,
      apiKey: effectiveApiKey
    });

    if (result.success) {
      withDb(async (client) => {
        const logId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(`
          INSERT INTO hr_ocr_logs (
            id, document_type, confidence_score, confidence, extracted_data,
            extracted_name, extracted_id, source, scanned_by, details, created_at
          ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, NOW());
        `, [
          logId,
          result.documentType,
          result.confidence || 95,
          JSON.stringify(result),
          result.name || '',
          result.emiratesId || result.passportNo || result.residencyCardNo || '',
          result.source || 'GEMINI_AI_VISION',
          'HR Admin',
          `Scanned ${result.documentType} for ${result.name || 'Staff'}`
        ]);
      }).catch(() => {});
    }

    return res.json(result);
  } catch (error: any) {
    console.error('HR OCR Scan Route Error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to scan document'
    });
  }
});
