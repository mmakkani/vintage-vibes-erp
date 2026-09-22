import { supabase } from '../supabaseClient.ts';
import { Employee, AttendanceRecord, EmployeeLoan, PayrollRecord } from '../modules/hr/hr.types.ts';
import { AuditService } from './auditService.ts';
import { FinanceService } from './financeService.ts';
import { applyPagination, buildPaginatedResponse, PaginatedResponse } from '../utils/paginationHelper.ts';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanDate(d: any): string | null {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  if (!trimmed || trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function isValidUuid(id: any): boolean {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

const LOCAL_STORAGE_EMPLOYEES_KEY = 'vintage_vibes_employees_db';

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
  // 1. EMPLOYEES (public.employees strictly)
  // ==========================================
  public static readonly EMPLOYEES_GRID_COLUMNS = 'id, emp_code, employee_code, name, full_name, first_name, last_name, designation, department, basic_salary, base_salary, salary, housing_allowance, housing_allow, transport_allowance, transport_allow, other_allow, total_package, gross_salary, working_hours_per_day, is_active, is_deleted, joining_date, status, emirates_id, emirates_id_no, nationality, gender, dob, emirates_id_expiry, id_card_no, passport_no, passport_number, passport_expiry, created_at, updated_at';

  public static mapEmployeeRow(row: any): Employee {
    const empCode = row.emp_code || row.employee_code || '';
    const fullName = (row.name || `${row.first_name || ''} ${row.last_name || ''}`).trim() || row.full_name || 'Staff Member';
    const basicSal = Number(row.basic_salary || row.base_salary || row.salary || 0);
    const housingAllow = Number(row.housing_allowance || row.housing_allow || 0);
    const transAllow = Number(row.transport_allowance || row.transport_allow || 0);
    const otherAllow = Number(row.other_allow || 0);
    const totPkg = Number(row.total_package || row.gross_salary || (basicSal + housingAllow + transAllow + otherAllow));

    return {
      id: String(row.id),
      code: empCode,
      empCode: empCode,
      employee_code: empCode,
      emp_code: empCode,
      name: fullName,
      fullName: fullName,
      full_name: fullName,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      designation: row.designation || 'Staff',
      department: row.department || 'Operations',
      baseSalary: basicSal,
      basic_salary: basicSal,
      base_salary: basicSal,
      salary: basicSal,
      housingAllow: housingAllow,
      housing_allow: housingAllow,
      housing_allowance: housingAllow,
      transportAllow: transAllow,
      transport_allow: transAllow,
      transport_allowance: transAllow,
      otherAllow: otherAllow,
      other_allow: otherAllow,
      totalPackage: totPkg,
      gross_salary: totPkg,
      total_package: totPkg,
      workingHoursPerDay: Number(row.working_hours_per_day || 8),
      working_hours_per_day: Number(row.working_hours_per_day || 8),
      isActive: row.is_active !== false && row.is_deleted !== true && row.status !== 'DELETED',
      is_active: row.is_active !== false && row.is_deleted !== true && row.status !== 'DELETED',
      is_deleted: row.is_deleted === true || row.status === 'DELETED',
      isDeleted: row.is_deleted === true || row.status === 'DELETED',
      updated_at: row.updated_at || '',
      joiningDate: row.joining_date || new Date().toISOString().slice(0, 10),
      joining_date: row.joining_date || new Date().toISOString().slice(0, 10),
      status: row.status || 'POSTED',
      emiratesId: row.emirates_id || row.emirates_id_no || '',
      emirates_id: row.emirates_id || row.emirates_id_no || '',
      residencyCardNo: row.residency_card_no || row.residency_no || '',
      residency_card_no: row.residency_card_no || row.residency_no || '',
      passportNo: row.passport_no || row.passport_number || '',
      passport_no: row.passport_no || row.passport_number || '',
      idFrontImageUrl: row.id_front_image_url || '',
      id_front_image_url: row.id_front_image_url || '',
      idBackImageUrl: row.id_back_image_url || '',
      id_back_image_url: row.id_back_image_url || '',
      nameArabic: row.name_arabic || row.arabic_name || '',
      name_arabic: row.name_arabic || row.arabic_name || '',
      arabic_name: row.name_arabic || row.arabic_name || '',
      nationality: row.nationality || '',
      gender: row.gender || 'MALE',
      dob: row.dob || '',
      emiratesIdExpiry: row.emirates_id_expiry || '',
      emirates_id_expiry: row.emirates_id_expiry || '',
      idCardNo: row.id_card_no || '',
      id_card_no: row.id_card_no || '',
      passportExpiry: row.passport_expiry || row.passport_expiry_date || '',
      passport_expiry: row.passport_expiry || row.passport_expiry_date || '',
      passportIssueDate: row.passport_issue_date || '',
      passport_issue_date: row.passport_issue_date || '',
      passportCountry: row.passport_country || '',
      passport_country: row.passport_country || '',
      passportImageUrl: row.passport_image_url || '',
      passport_image_url: row.passport_image_url || '',
      uidNo: row.uid_no || row.visa_uid || '',
      visaUid: row.uid_no || row.visa_uid || '',
      uid_no: row.uid_no || row.visa_uid || '',
      visa_uid: row.uid_no || row.visa_uid || '',
      residencyIssueDate: row.residency_issue_date || row.visa_issue_date || '',
      residency_issue_date: row.residency_issue_date || row.visa_issue_date || '',
      residencyExpiryDate: row.residency_expiry_date || row.visa_expiry_date || '',
      residency_expiry_date: row.residency_expiry_date || row.visa_expiry_date || '',
      residencySponsor: row.residency_sponsor || row.sponsor || '',
      residency_sponsor: row.residency_sponsor || row.sponsor || '',
      residencyProfession: row.residency_profession || row.profession_on_visa || '',
      residency_profession: row.residency_profession || row.profession_on_visa || '',
      residencyImageUrl: row.residency_image_url || row.visa_image_url || '',
      residency_image_url: row.residency_image_url || row.visa_image_url || '',
      photoUrl: row.photo_url || '',
      photo_url: row.photo_url || ''
    };
  }

  public static async getEmployeeById(id: string): Promise<Employee | null> {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .or(`id.eq.${id},emp_code.eq.${id}`)
        .maybeSingle();

      if (error || !data) return null;
      return this.mapEmployeeRow(data);
    } catch (_) {
      return null;
    }
  }

  public static async getEmployees(
    forceRefresh: boolean = false,
    options?: { limit?: number; offset?: number; page?: number; full?: boolean }
  ): Promise<Employee[]> {
    const isDefaultFetch = !options || (!options.limit && !options.offset && !options.page && !options.full);
    if (!forceRefresh && isDefaultFetch && this.cachedEmployees && (Date.now() - this.lastEmployeesFetched < this.EMPLOYEES_TTL_MS)) {
      return this.cachedEmployees;
    }
    if (isDefaultFetch && this.employeesPromise) {
      return this.employeesPromise;
    }

    const runFetch = async (): Promise<Employee[]> => {
      // Purge stale local storage cache
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(LOCAL_STORAGE_EMPLOYEES_KEY);
        }
      } catch (_) {}

      // SSOT: Query ONLY public.employees master table
      // Strict filter: WHERE COALESCE(is_deleted, false) = false AND COALESCE(is_active, true) = true

      // 1. Try fetching from direct API endpoint first (PostgreSQL Pooler)
      if (isDefaultFetch) {
        try {
          const fetchFn = (typeof window !== 'undefined' && (window as any).__originalFetch) || (typeof fetch !== 'undefined' ? fetch : null);
          if (fetchFn) {
            const res = await fetchFn('/api/hr/employees');
            if (res.ok) {
              const json = await res.json();
              const rawList = Array.isArray(json) ? json : (json?.employees || json?.data || []);
              if (Array.isArray(rawList)) {
                const list = rawList.filter((e: any) =>
                  (e.is_deleted === false || e.is_deleted == null) &&
                  (e.is_active === true || e.is_active == null) &&
                  e.status !== 'DELETED'
                );
                this.cachedEmployees = list;
                this.lastEmployeesFetched = Date.now();
                return list;
              }
            }
          }
        } catch (_) {}
      }

      // 2. Direct Supabase Query strictly on public.employees
      try {
        const selectCols = options?.full ? '*' : HrService.EMPLOYEES_GRID_COLUMNS;
        let query = supabase
          .from('employees')
          .select(selectCols)
          .or('is_deleted.is.null,is_deleted.eq.false')
          .or('is_active.is.null,is_active.eq.true')
          .neq('status', 'DELETED')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });

        if (options?.limit) {
          const limit = options.limit;
          const offset = options.offset ?? (options.page ? (options.page - 1) * limit : 0);
          query = query.range(offset, offset + limit - 1);
        } else if (isDefaultFetch) {
          query = query.range(0, 49);
        }

        const { data, error } = await query;

        if (!error && Array.isArray(data)) {
          const mapped = data
            .map((row: any) => this.mapEmployeeRow(row))
            .filter((e: any) =>
              (e.is_deleted === false || e.is_deleted == null) &&
              (e.is_active === true || e.is_active == null) &&
              e.status !== 'DELETED'
            );

          if (isDefaultFetch) {
            this.cachedEmployees = mapped;
            this.lastEmployeesFetched = Date.now();
          }
          return mapped;
        }

        if (error) {
          console.warn('Supabase fetch employees error:', error.message);
        }
      } catch (err) {
        console.warn('Supabase fetch employees failed:', err);
      }

      // If force refresh was requested, return empty array rather than stale cache
      if (forceRefresh) {
        return [];
      }
      return (this.cachedEmployees || []).filter((e: any) =>
        (e.is_deleted === false || e.is_deleted == null) &&
        (e.is_active === true || e.is_active == null) &&
        e.status !== 'DELETED'
      );
    };

    if (isDefaultFetch) {
      this.employeesPromise = runFetch();
      try {
        return await this.employeesPromise;
      } finally {
        this.employeesPromise = null;
      }
    } else {
      return await runFetch();
    }
  }

  public static async getEmployeesPaginated(
    page: number = 1,
    pageSize: number = 10,
    search?: string
  ): Promise<PaginatedResponse<Employee>> {
    try {
      let query = supabase
        .from('employees')
        .select(HrService.EMPLOYEES_GRID_COLUMNS, { count: 'exact' })
        .or('is_deleted.is.null,is_deleted.eq.false')
        .or('is_active.is.null,is_active.eq.true')
        .neq('status', 'DELETED');

      if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,emp_code.ilike.%${s}%,designation.ilike.%${s}%,department.ilike.%${s}%`);
      }

      query = applyPagination(query, page, pageSize, {
        orderBy: 'created_at',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;
      if (error) {
        console.warn('[HrService] getEmployeesPaginated query notice:', error.message);
        const all = await this.getEmployees();
        const filtered = search && search.trim()
          ? all.filter(e =>
              (e.name || '').toLowerCase().includes(search.toLowerCase()) ||
              (e.empCode || '').toLowerCase().includes(search.toLowerCase()) ||
              (e.designation || '').toLowerCase().includes(search.toLowerCase()) ||
              (e.department || '').toLowerCase().includes(search.toLowerCase())
            )
          : all;
        const from = (page - 1) * pageSize;
        return buildPaginatedResponse(filtered.slice(from, from + pageSize), filtered.length, page, pageSize);
      }

      const mapped = (data || []).map((row: any) => this.mapEmployeeRow(row));
      return buildPaginatedResponse(mapped, count ?? mapped.length, page, pageSize);
    } catch (err: any) {
      console.warn('[HrService] getEmployeesPaginated exception:', err?.message);
      return buildPaginatedResponse([], 0, page, pageSize);
    }
  }

  public static async createEmployee(emp: Partial<Employee>): Promise<Employee> {
    this.clearEmployeeCache();
    const fallbackId = generateId('emp');
    const empCode = emp.empCode || (emp as any).emp_code || (emp as any).employee_code || `EMP-${Date.now().toString().slice(-4)}`;

    const basicSalary = Number(emp.basic_salary ?? emp.baseSalary ?? emp.base_salary ?? 0);
    const housingAllowance = Number(emp.housing_allowance ?? emp.housingAllow ?? emp.housing_allow ?? 0);
    const transportAllowance = Number(emp.transport_allowance ?? emp.transportAllow ?? emp.transport_allow ?? 0);
    const otherAllowance = Number((emp as any).other_allow ?? emp.otherAllow ?? 0);
    const totalPackage = Number(emp.total_package ?? emp.totalPackage ?? (basicSalary + housingAllowance + transportAllowance + otherAllowance));
    const workingHoursPerDay = Number((emp as any).working_hours_per_day ?? emp.workingHoursPerDay ?? 8);

    const resolvedFullName =
      (emp as any).full_name ||
      (emp as any).fullName ||
      (emp as any).fullNameEnglish ||
      emp.name ||
      (emp as any).full_name_english ||
      'Staff Member';

    const firstName = resolvedFullName.split(' ')[0] || resolvedFullName;
    const lastName = resolvedFullName.split(' ').slice(1).join(' ') || '';

    const resolvedArabicName =
      emp.nameArabic ||
      (emp as any).full_name_arabic ||
      (emp as any).fullNameArabic ||
      (emp as any).name_arabic ||
      '';

    const safeJoiningDate = cleanDate(emp.joiningDate || (emp as any).joining_date) || new Date().toISOString().slice(0, 10);

    const payload: any = {
      employee_code: empCode,
      emp_code: empCode,
      first_name: firstName,
      last_name: lastName,
      name: resolvedFullName,
      full_name: resolvedFullName,
      name_arabic: resolvedArabicName,
      arabic_name: resolvedArabicName,
      full_name_arabic: resolvedArabicName,
      designation: emp.designation || 'Staff',
      department: emp.department || 'Operations',
      basic_salary: basicSalary,
      base_salary: basicSalary,
      salary: basicSalary,
      housing_allowance: housingAllowance,
      housing_allow: housingAllowance,
      transport_allowance: transportAllowance,
      transport_allow: transportAllowance,
      other_allow: otherAllowance,
      total_package: totalPackage,
      gross_salary: totalPackage,
      working_hours_per_day: workingHoursPerDay,
      is_active: emp.isActive !== false,
      joining_date: safeJoiningDate,
      date_of_joining: safeJoiningDate,
      status: emp.status || 'POSTED',
      emirates_id: emp.emiratesId || (emp as any).emirates_id || '',
      emirates_id_no: emp.emiratesId || (emp as any).emirates_id || '',
      id_card_no: emp.idCardNo || (emp as any).id_card_no || '',
      passport_no: emp.passportNo || (emp as any).passport_no || (emp as any).passport_number || '',
      passport_number: emp.passportNo || (emp as any).passport_no || (emp as any).passport_number || '',
      passport_country: emp.passportCountry || (emp as any).passport_country || '',
      residency_card_no: emp.residencyCardNo || (emp as any).residency_card_no || (emp as any).residency_no || '',
      residency_no: emp.residencyCardNo || (emp as any).residency_card_no || (emp as any).residency_no || '',
      uid_no: emp.uidNo || (emp as any).uid_no || (emp as any).visa_uid || '',
      visa_uid: emp.uidNo || (emp as any).uid_no || (emp as any).visa_uid || '',
      residency_sponsor: emp.residencySponsor || (emp as any).residency_sponsor || (emp as any).sponsor || '',
      sponsor: emp.residencySponsor || (emp as any).residency_sponsor || (emp as any).sponsor || '',
      residency_profession: emp.residencyProfession || (emp as any).residency_profession || (emp as any).profession_on_visa || '',
      profession_on_visa: emp.residencyProfession || (emp as any).residency_profession || (emp as any).profession_on_visa || '',
      nationality: emp.nationality || (emp as any).nationality || '',
      gender: emp.gender || (emp as any).gender || 'MALE',
      email: emp.email || (emp as any).email || '',
      address: emp.address || (emp as any).address || '',
      notes: emp.notes || (emp as any).notes || '',
      id_front_image_url: typeof emp.idFrontImageUrl === 'string' ? emp.idFrontImageUrl : ((emp as any).id_front_image_url || ''),
      id_back_image_url: typeof emp.idBackImageUrl === 'string' ? emp.idBackImageUrl : ((emp as any).id_back_image_url || ''),
      passport_image_url: typeof emp.passportImageUrl === 'string' ? emp.passportImageUrl : ((emp as any).passport_image_url || ''),
      residency_image_url: typeof emp.residencyImageUrl === 'string' ? emp.residencyImageUrl : ((emp as any).residency_image_url || ''),
      visa_image_url: typeof emp.residencyImageUrl === 'string' ? emp.residencyImageUrl : ((emp as any).residency_image_url || ''),
      photo_url: typeof emp.photoUrl === 'string' ? emp.photoUrl : ((emp as any).photo_url || ''),

      // Cleaned dates (strictly YYYY-MM-DD or null)
      dob: cleanDate(emp.dob || (emp as any).dob || (emp as any).date_of_birth),
      date_of_birth: cleanDate(emp.dob || (emp as any).dob || (emp as any).date_of_birth),
      emirates_id_expiry: cleanDate(emp.emiratesIdExpiry || (emp as any).emirates_id_expiry),
      passport_expiry: cleanDate(emp.passportExpiry || (emp as any).passport_expiry || (emp as any).passport_expiry_date),
      passport_expiry_date: cleanDate(emp.passportExpiry || (emp as any).passport_expiry || (emp as any).passport_expiry_date),
      passport_issue_date: cleanDate(emp.passportIssueDate || (emp as any).passport_issue_date),
      residency_issue_date: cleanDate(emp.residencyIssueDate || (emp as any).residency_issue_date || (emp as any).visa_issue_date),
      visa_issue_date: cleanDate(emp.residencyIssueDate || (emp as any).residency_issue_date || (emp as any).visa_issue_date),
      residency_expiry_date: cleanDate(emp.residencyExpiryDate || (emp as any).residency_expiry_date || (emp as any).visa_expiry_date),
      visa_expiry_date: cleanDate(emp.residencyExpiryDate || (emp as any).residency_expiry_date || (emp as any).visa_expiry_date)
    };

    // Only include id if it's already a valid UUID
    if (isValidUuid(emp.id)) {
      payload.id = emp.id;
    }

    let savedEmp: Employee = {
      ...emp,
      id: isValidUuid(emp.id) ? emp.id : fallbackId,
      empCode,
      name: resolvedFullName,
      nameArabic: resolvedArabicName,
      designation: emp.designation || 'Staff',
      department: emp.department || 'Operations',
      baseSalary: basicSalary,
      housingAllow: housingAllowance,
      transportAllow: transportAllowance,
      otherAllow: otherAllowance,
      workingHoursPerDay,
      isActive: emp.isActive !== false,
      joiningDate: safeJoiningDate,
      status: emp.status || 'POSTED',
      emiratesId: payload.emirates_id,
      residencyCardNo: payload.residency_card_no,
      passportNo: payload.passport_no,
      idFrontImageUrl: payload.id_front_image_url,
      idBackImageUrl: payload.id_back_image_url,
      nationality: payload.nationality,
      gender: payload.gender,
      dob: payload.dob || '',
      emiratesIdExpiry: payload.emirates_id_expiry || '',
      idCardNo: payload.id_card_no,
      passportExpiry: payload.passport_expiry || '',
      passportIssueDate: payload.passport_issue_date || '',
      passportCountry: payload.passport_country,
      passportImageUrl: payload.passport_image_url,
      uidNo: payload.uid_no,
      residencyIssueDate: payload.residency_issue_date || '',
      residencyExpiryDate: payload.residency_expiry_date || '',
      residencySponsor: payload.residency_sponsor,
      residencyProfession: payload.residency_profession,
      residencyImageUrl: payload.residency_image_url,
      photoUrl: payload.photo_url,
      email: payload.email,
      address: payload.address,
      notes: payload.notes
    } as Employee;

    try {
      let { data, error } = await supabase
        .from('employees')
        .insert(payload)
        .select()
        .single();

      // If schema cache was stale for working_hours_per_day, strip it and retry automatically
      if (error && (error.message?.includes('working_hours_per_day') || error.code === 'PGRST204')) {
        console.warn('PostgREST schema cache notice for working_hours_per_day, retrying payload...');
        const retryPayload = { ...payload };
        delete retryPayload.working_hours_per_day;
        const retryRes = await supabase
          .from('employees')
          .insert(retryPayload)
          .select()
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      if (!error && data) {
        savedEmp.id = String(data.id);
        savedEmp.empCode = data.emp_code || data.employee_code || empCode;
      } else if (error) {
        console.warn('Supabase create employee warning response:', error);
      }
    } catch (err) {
      console.warn('Supabase create employee failed:', err);
    }

    // Purge local storage cache so remote state remains single source of truth
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_EMPLOYEES_KEY);
      }
    } catch (_) {}

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
      payload.first_name = nameVal.split(' ')[0] || nameVal;
      payload.last_name = nameVal.split(' ').slice(1).join(' ') || '';
    }
    if (updates.nameArabic !== undefined || (updates as any).full_name_arabic !== undefined || (updates as any).fullNameArabic !== undefined) {
      const arabicVal = updates.nameArabic || (updates as any).full_name_arabic || (updates as any).fullNameArabic || '';
      payload.name_arabic = arabicVal;
      payload.arabic_name = arabicVal;
      payload.full_name_arabic = arabicVal;
    }
    if (updates.designation !== undefined) payload.designation = updates.designation;
    if (updates.department !== undefined) payload.department = updates.department;
    if (updates.baseSalary !== undefined || (updates as any).basic_salary !== undefined) {
      const val = Number(updates.baseSalary ?? (updates as any).basic_salary ?? 0);
      payload.base_salary = val;
      payload.basic_salary = val;
      payload.salary = val;
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
    payload.gross_salary = payload.total_package;
    if (updates.otherAllow !== undefined) payload.other_allow = Number(updates.otherAllow);
    if (updates.workingHoursPerDay !== undefined) payload.working_hours_per_day = Number(updates.workingHoursPerDay);
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.joiningDate !== undefined) {
      const jd = cleanDate(updates.joiningDate);
      if (jd) {
        payload.joining_date = jd;
        payload.date_of_joining = jd;
      }
    }
    if (updates.dob !== undefined) {
      const cd = cleanDate(updates.dob);
      payload.dob = cd;
      payload.date_of_birth = cd;
    }
    if (updates.gender !== undefined) payload.gender = updates.gender;
    if (updates.nationality !== undefined) payload.nationality = updates.nationality;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    // Legal Document IDs & Images
    if (updates.emiratesId !== undefined) {
      payload.emirates_id = updates.emiratesId;
      payload.emirates_id_no = updates.emiratesId;
    }
    if (updates.idCardNo !== undefined) payload.id_card_no = updates.idCardNo;
    if (updates.emiratesIdExpiry !== undefined) payload.emirates_id_expiry = cleanDate(updates.emiratesIdExpiry);
    if (updates.passportNo !== undefined) {
      payload.passport_no = updates.passportNo;
      payload.passport_number = updates.passportNo;
    }
    if (updates.passportCountry !== undefined) payload.passport_country = updates.passportCountry;
    if (updates.passportIssueDate !== undefined) payload.passport_issue_date = cleanDate(updates.passportIssueDate);
    if (updates.passportExpiry !== undefined) {
      const pe = cleanDate(updates.passportExpiry);
      payload.passport_expiry = pe;
      payload.passport_expiry_date = pe;
    }
    if (updates.residencyCardNo !== undefined) {
      payload.residency_card_no = updates.residencyCardNo;
      payload.residency_no = updates.residencyCardNo;
    }
    if (updates.uidNo !== undefined) {
      payload.uid_no = updates.uidNo;
      payload.visa_uid = updates.uidNo;
    }
    if (updates.residencyProfession !== undefined) {
      payload.residency_profession = updates.residencyProfession;
      payload.profession_on_visa = updates.residencyProfession;
    }
    if (updates.residencySponsor !== undefined) {
      payload.residency_sponsor = updates.residencySponsor;
      payload.sponsor = updates.residencySponsor;
    }
    if (updates.residencyIssueDate !== undefined) {
      const ri = cleanDate(updates.residencyIssueDate);
      payload.residency_issue_date = ri;
      payload.visa_issue_date = ri;
    }
    if (updates.residencyExpiryDate !== undefined) {
      const re = cleanDate(updates.residencyExpiryDate);
      payload.residency_expiry_date = re;
      payload.visa_expiry_date = re;
    }
    if (updates.idFrontImageUrl !== undefined) payload.id_front_image_url = updates.idFrontImageUrl;
    if (updates.idBackImageUrl !== undefined) payload.id_back_image_url = updates.idBackImageUrl;
    if (updates.passportImageUrl !== undefined) payload.passport_image_url = updates.passportImageUrl;
    if (updates.residencyImageUrl !== undefined) {
      payload.residency_image_url = updates.residencyImageUrl;
      payload.visa_image_url = updates.residencyImageUrl;
    }
    if (updates.photoUrl !== undefined) payload.photo_url = updates.photoUrl;

    payload.updated_at = new Date().toISOString();

    try {
      let errRes: any = null;
      if (isValidUuid(id)) {
        const { error } = await supabase.from('employees').update(payload).eq('id', id);
        errRes = error;
      } else {
        const { error } = await supabase.from('employees').update(payload).or(`emp_code.eq.${id},employee_code.eq.${id}`);
        errRes = error;
      }

      if (errRes && (errRes.message?.includes('working_hours_per_day') || errRes.code === 'PGRST204')) {
        const retryPayload = { ...payload };
        delete retryPayload.working_hours_per_day;
        if (isValidUuid(id)) {
          await supabase.from('employees').update(retryPayload).eq('id', id);
        } else {
          await supabase.from('employees').update(retryPayload).or(`emp_code.eq.${id},employee_code.eq.${id}`);
        }
      }
    } catch (err) {
      console.warn('Supabase update employee error:', err);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_EMPLOYEES_KEY);
      }
    } catch (_) {}

    try {
      AuditService.addAuditLog({
        module: 'HR',
        action: 'UPDATE',
        documentRef: String(id),
        status: 'POSTED',
        userName: 'HR Administrator',
        details: `Updated employee record for ID ${id}`
      });
    } catch (_) {}
  }

  public static async deleteEmployee(id: string): Promise<void> {
    this.clearEmployeeCache();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_EMPLOYEES_KEY);
      }
    } catch (_) {}

    const now = new Date().toISOString();
    try {
      // Strict Soft Delete on public.employees using exact id (UUID)
      // Table Isolation: DO NOT touch employee_attendance, staff_attendance, employee_payroll, payroll_records, employee_documents, hr_attendance_sheets
      const { error } = await supabase
        .from('employees')
        .update({
          is_deleted: true,
          is_active: false,
          status: 'DELETED',
          updated_at: now
        })
        .eq('id', String(id));

      if (error) {
        console.warn('Supabase soft delete employee error:', error);
        throw new Error(`DB Error: ${error.message} | Details: ${error.details || ''}`);
      }
    } catch (err: any) {
      console.warn('Soft delete employee failed:', err);
      throw err;
    }

    try {
      AuditService.addAuditLog({
        module: 'HR',
        action: 'DELETE',
        documentRef: String(id),
        status: 'UNPOSTED',
        userName: 'HR Administrator',
        details: `Soft-deleted employee record with ID ${id}`
      });
    } catch (_) {}
  }

  // ==========================================
  // 2. ATTENDANCE (public.employee_attendance & hr_attendance_sheets)
  // ==========================================
  public static readonly ATTENDANCE_GRID_COLUMNS = 'id, employee_id, employee_name, emp_code, month_year, days_worked, overtime_hours, status, locked_at, locked_by, created_at';

  public static async getAttendance(
    monthYear?: string,
    options?: { limit?: number; offset?: number; page?: number }
  ): Promise<AttendanceRecord[]> {
    let query = supabase
      .from('employee_attendance')
      .select(HrService.ATTENDANCE_GRID_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (monthYear) {
      query = query.eq('month_year', monthYear);
    }

    if (options?.limit) {
      const limit = options.limit;
      const offset = options.offset ?? (options.page ? (options.page - 1) * limit : 0);
      query = query.range(offset, offset + limit - 1);
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

  public static async getAttendancePaginated(
    monthYear?: string,
    page: number = 1,
    pageSize: number = 10,
    search?: string
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    try {
      let query = supabase
        .from('employee_attendance')
        .select(HrService.ATTENDANCE_GRID_COLUMNS, { count: 'exact' });

      if (monthYear) {
        query = query.eq('month_year', monthYear);
      }
      if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`employee_name.ilike.%${s}%,emp_code.ilike.%${s}%`);
      }

      query = applyPagination(query, page, pageSize, {
        orderBy: 'created_at',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;
      if (error) {
        console.warn('[HrService] getAttendancePaginated notice:', error.message);
        const all = await this.getAttendance(monthYear);
        const filtered = search && search.trim()
          ? all.filter(a =>
              (a.employeeName || '').toLowerCase().includes(search.toLowerCase()) ||
              (a.empCode || '').toLowerCase().includes(search.toLowerCase())
            )
          : all;
        const from = (page - 1) * pageSize;
        return buildPaginatedResponse(filtered.slice(from, from + pageSize), filtered.length, page, pageSize);
      }

      const mapped = (data || []).map((row: any) => ({
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

      return buildPaginatedResponse(mapped, count ?? mapped.length, page, pageSize);
    } catch (err: any) {
      console.warn('[HrService] getAttendancePaginated exception:', err?.message);
      return buildPaginatedResponse([], 0, page, pageSize);
    }
  }

  public static async createAttendanceSheet(monthYear: string): Promise<AttendanceRecord[]> {
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(e => {
      const isDeleted = (e as any).is_deleted === true || (e as any).isDeleted === true;
      const isActive = e.isActive !== false && (e as any).is_active !== false;
      const notTerminated = (e as any).status !== 'TERMINATED' && (e as any).status !== 'INACTIVE';
      return !isDeleted && isActive && notTerminated;
    });

    const records: any[] = activeEmployees.map(emp => ({
      id: generateId('att'),
      employee_id: String(emp.id),
      employee_name: emp.name || (emp as any).fullName || 'Staff Member',
      emp_code: emp.empCode || (emp as any).code || '',
      month_year: monthYear,
      days_worked: 30,
      overtime_hours: 0,
      status: 'DRAFT',
      locked_at: null,
      locked_by: null,
      created_at: new Date().toISOString()
    }));

    // 1. Delete any existing attendance records for this month to guarantee clean slate
    await supabase
      .from('employee_attendance')
      .delete()
      .eq('month_year', monthYear);

    if (records.length > 0) {
      const { error } = await supabase
        .from('employee_attendance')
        .insert(records);

      if (error) {
        console.error('Error inserting attendance records:', error);
      }
    }

    // 2. Upsert sheet log with hardcoded DRAFT status
    await supabase.from('hr_attendance_sheets').upsert({
      id: `att-sheet-${monthYear}`,
      month_year: monthYear,
      total_employees: activeEmployees.length,
      status: 'DRAFT',
      created_at: new Date().toISOString()
    });

    return this.getAttendance(monthYear);
  }

  public static async syncMissingEmployeesToAttendance(monthYear: string): Promise<AttendanceRecord[]> {
    const employees = await this.getEmployees();
    const activeEmployees = employees.filter(e => {
      const isDeleted = (e as any).is_deleted === true || (e as any).isDeleted === true;
      const isActive = e.isActive !== false && (e as any).is_active !== false;
      const notTerminated = (e as any).status !== 'TERMINATED' && (e as any).status !== 'INACTIVE';
      return !isDeleted && isActive && notTerminated;
    });

    const currentAttendance = await this.getAttendance(monthYear);
    const existingEmpIds = new Set(currentAttendance.map(a => String(a.employeeId || (a as any).employee_id || '')));
    const existingCodes = new Set(currentAttendance.map(a => String(a.empCode || (a as any).emp_code || '').trim().toLowerCase()));

    const missing = activeEmployees.filter(emp => {
      const idStr = String(emp.id);
      const codeStr = String(emp.empCode || (emp as any).code || (emp as any).employee_code || '').trim().toLowerCase();
      const hasId = idStr && existingEmpIds.has(idStr);
      const hasCode = codeStr && existingCodes.has(codeStr);
      return !hasId && !hasCode;
    });

    if (missing.length > 0) {
      const newRecords: any[] = missing.map(emp => ({
        id: generateId('att'),
        employee_id: String(emp.id),
        employee_name: emp.name || (emp as any).fullName || `${(emp as any).first_name || ''} ${(emp as any).last_name || ''}`.trim() || 'Staff Member',
        emp_code: emp.empCode || (emp as any).code || (emp as any).employee_code || '',
        month_year: monthYear,
        days_worked: 30,
        overtime_hours: 0,
        status: 'DRAFT',
        created_at: new Date().toISOString()
      }));

      try {
        const { error } = await supabase
          .from('employee_attendance')
          .insert(newRecords);

        if (error) {
          console.warn('[HrService] Error inserting synced missing attendance records to Supabase:', error);
        }
      } catch (insertErr) {
        console.warn('[HrService] Supabase attendance insert error:', insertErr);
      }

      try {
        await supabase.from('hr_attendance_sheets').upsert({
          id: `sheet-${monthYear}`,
          month_year: monthYear,
          total_employees: currentAttendance.length + newRecords.length
        });
      } catch (_) {}

      return this.getAttendance(monthYear);
    }

    return currentAttendance;
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
        id: `att-sheet-${monthYear}`,
        month_year: monthYear,
        status: 'POSTED'
      });

    // Generate draft payroll slips and sheet for this posted attendance month if not already posted
    const { data: paySheet } = await supabase
      .from('hr_payroll_sheets')
      .select('status, voucher_id')
      .eq('month_year', monthYear)
      .maybeSingle();

    if (!paySheet || (paySheet.status !== 'POSTED' && !paySheet.voucher_id)) {
      try {
        await this.runPayroll(monthYear);
      } catch (err) {
        console.warn('[HrService] Auto-generating payroll on post attendance notice:', err);
      }
    }
  }

  public static async unpostAttendanceSheet(monthYear: string): Promise<void> {
    const { data: paySheet } = await supabase
      .from('hr_payroll_sheets')
      .select('status, voucher_id')
      .eq('month_year', monthYear)
      .maybeSingle();

    if (paySheet && (paySheet.status === 'POSTED' || paySheet.voucher_id)) {
      throw new Error(`Cannot unpost attendance for ${monthYear} because payroll has already been POSTED to General Ledger. Please unpost payroll first.`);
    }

    await supabase
      .from('employee_attendance')
      .update({ status: 'DRAFT', locked_at: null, locked_by: null })
      .eq('month_year', monthYear);

    await supabase
      .from('hr_attendance_sheets')
      .upsert({
        id: `att-sheet-${monthYear}`,
        month_year: monthYear,
        status: 'DRAFT'
      });
  }

  public static async getAttendanceSheets(options?: { limit?: number; offset?: number; page?: number }): Promise<any[]> {
    const limit = options?.limit || 50;
    const offset = options?.offset ?? (options?.page ? (options.page - 1) * limit : 0);

    const { data, error } = await supabase
      .from('hr_attendance_sheets')
      .select('id, month_year, total_employees, status, created_at')
      .order('month_year', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.warn('[HrService] getAttendanceSheets fallback:', error.message);
      return relationalStore.getAttendanceSheetsLog();
    }
    return (data || []).map((row: any) => ({
      id: row.id,
      monthYear: row.month_year,
      totalEmployees: Number(row.total_employees || 0),
      totalStaff: Number(row.total_employees || 0),
      status: row.status,
      createdAt: row.created_at
    }));
  }

  public static async getAttendanceSheetsPaginated(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<any>> {
    try {
      let query = supabase
        .from('hr_attendance_sheets')
        .select('id, month_year, total_employees, status, created_at', { count: 'exact' });

      query = applyPagination(query, page, pageSize, {
        orderBy: 'month_year',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;
      if (error) {
        console.warn('[HrService] getAttendanceSheetsPaginated notice:', error.message);
        const all = await this.getAttendanceSheets();
        const from = (page - 1) * pageSize;
        return buildPaginatedResponse(all.slice(from, from + pageSize), all.length, page, pageSize);
      }

      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        monthYear: row.month_year,
        totalEmployees: Number(row.total_employees || 0),
        totalStaff: Number(row.total_employees || 0),
        status: row.status,
        createdAt: row.created_at
      }));

      return buildPaginatedResponse(mapped, count ?? mapped.length, page, pageSize);
    } catch (err: any) {
      console.warn('[HrService] getAttendanceSheetsPaginated exception:', err?.message);
      return buildPaginatedResponse([], 0, page, pageSize);
    }
  }

  public static async deleteAttendanceSheet(sheetIdOrMonthYear: string): Promise<void> {
    if (!sheetIdOrMonthYear) {
      throw new Error('sheetId or monthYear is required to delete attendance sheet');
    }

    const rawInput = String(sheetIdOrMonthYear).trim();

    // 1. Resolve the Target Month (month_year)
    let resolvedMonthYear = '';

    // Query hr_attendance_sheets to resolve the exact month_year
    try {
      const { data: sheetRow } = await supabase
        .from('hr_attendance_sheets')
        .select('month_year')
        .or(`id.eq.${rawInput},month_year.eq.${rawInput}`)
        .maybeSingle();

      if (sheetRow?.month_year) {
        resolvedMonthYear = String(sheetRow.month_year).trim();
      }
    } catch (_) {}

    // Fallback: strip prefixes if not resolved from DB query
    if (!resolvedMonthYear) {
      resolvedMonthYear = rawInput.replace(/^(att-sheet-|sheet-)/, '');
    }

    // 2. Execute Deletion in Strict Order (Using month_year)
    // Step A: Delete child records: DELETE FROM public.employee_attendance WHERE month_year = '<resolved_month_year>'
    const { error: childErr } = await supabase
      .from('employee_attendance')
      .delete()
      .eq('month_year', resolvedMonthYear);

    if (childErr) {
      console.error("Supabase Deletion Error (employee_attendance):", childErr);
      throw new Error(`DB Error: ${childErr.message} | Details: ${childErr.details || ''}`);
    }

    // Step B: Delete parent record: DELETE FROM public.hr_attendance_sheets WHERE month_year = '<resolved_month_year>'
    const { error: parentErr } = await supabase
      .from('hr_attendance_sheets')
      .delete()
      .eq('month_year', resolvedMonthYear);

    if (parentErr) {
      console.error("Supabase Deletion Error (hr_attendance_sheets):", parentErr);
      throw new Error(`DB Error: ${parentErr.message} | Details: ${parentErr.details || ''}`);
    }

    // Also clean up by id if rawInput was a sheet id
    if (rawInput !== resolvedMonthYear) {
      try {
        await supabase
          .from('hr_attendance_sheets')
          .delete()
          .eq('id', rawInput);
      } catch (_) {}
    }

    // 3. Update local in-memory store
    try {
      relationalStore.deleteAttendanceSheet(resolvedMonthYear);
    } catch (_) {}

    // 4. Clear non-payroll activity logs referencing this attendance sheet
    try {
      await supabase
        .from('hr_activity_logs')
        .delete()
        .eq('month_year', resolvedMonthYear);
    } catch (_) {}

    // Audit log
    try {
      await AuditService.logAction({
        action: 'DELETE',
        entityType: 'ATTENDANCE',
        entityId: `ATT-${resolvedMonthYear}`,
        details: `Permanently deleted attendance sheet and child attendance records for ${resolvedMonthYear}`
      });
    } catch (_) {}
  }

  // ==========================================
  // 3. EMPLOYEE LOANS (public.employee_loans)
  // ==========================================
  public static async getLoans(): Promise<EmployeeLoan[]> {
    const { data, error } = await supabase
      .from('employee_loans')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

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

  public static async getLoansPaginated(
    page: number = 1,
    pageSize: number = 10,
    search?: string
  ): Promise<PaginatedResponse<EmployeeLoan>> {
    try {
      let query = supabase
        .from('employee_loans')
        .select('*', { count: 'exact' });

      if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`employee_name.ilike.%${s}%,emp_code.ilike.%${s}%,type.ilike.%${s}%`);
      }

      query = applyPagination(query, page, pageSize, {
        orderBy: 'created_at',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;
      if (error) {
        console.warn('[HrService] getLoansPaginated notice:', error.message);
        const all = await this.getLoans();
        const filtered = search && search.trim()
          ? all.filter(l =>
              (l.employeeName || '').toLowerCase().includes(search.toLowerCase()) ||
              (l.empCode || '').toLowerCase().includes(search.toLowerCase()) ||
              (l.type || '').toLowerCase().includes(search.toLowerCase())
            )
          : all;
        const from = (page - 1) * pageSize;
        return buildPaginatedResponse(filtered.slice(from, from + pageSize), filtered.length, page, pageSize);
      }

      const mapped = (data || []).map((row: any) => ({
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

      return buildPaginatedResponse(mapped, count ?? mapped.length, page, pageSize);
    } catch (err: any) {
      console.warn('[HrService] getLoansPaginated exception:', err?.message);
      return buildPaginatedResponse([], 0, page, pageSize);
    }
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
  public static readonly PAYROLL_GRID_COLUMNS = 'id, employee_id, employee_name, emp_code, designation, month_year, status, base_salary, allowances, daily_rate, hourly_rate, days_worked, overtime_hours, earned_basic, overtime_pay, gross_pay, advance_deduction, loan_emi_deduction, total_deductions, net_pay, payment_method, bank_account_id, bank_account_name, posted_at, posted_by, created_at';

  public static async getPayroll(
    monthYear?: string,
    options?: { limit?: number; offset?: number; page?: number }
  ): Promise<PayrollRecord[]> {
    let query = supabase
      .from('employee_payroll')
      .select(HrService.PAYROLL_GRID_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (monthYear) {
      query = query.eq('month_year', monthYear);
    }

    if (options?.limit) {
      const limit = options.limit;
      const offset = options.offset ?? (options.page ? (options.page - 1) * limit : 0);
      query = query.range(offset, offset + limit - 1);
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
    const activeEmployees = employees.filter(e => {
      const isDeleted = (e as any).is_deleted === true || (e as any).isDeleted === true;
      const isActive = e.isActive !== false && (e as any).is_active !== false;
      const notTerminated = (e as any).status !== 'TERMINATED' && (e as any).status !== 'INACTIVE';
      return !isDeleted && isActive && notTerminated;
    });

    const attendanceRecords = await this.getAttendance(monthYear);
    const loans = await this.getLoans();
    const activeLoans = loans.filter(l => l.status === 'ACTIVE' && l.remainingAmount > 0);

    // Build complete roster: all staff in attendance sheet for this month, plus any active employees
    const rosterMap = new Map<string, { emp?: Employee; att?: AttendanceRecord }>();

    // 1. Add all attendance records first
    for (const att of attendanceRecords) {
      const attEmpId = String(att.employeeId || '');
      const attCode = (att.empCode || '').trim().toLowerCase();
      const matchedEmp = employees.find(e =>
        (attEmpId && String(e.id) === attEmpId) ||
        (attCode && (e.empCode || (e as any).code || (e as any).employee_code || '').trim().toLowerCase() === attCode)
      );
      const key = attEmpId || attCode || att.id;
      rosterMap.set(key, { emp: matchedEmp, att });
    }

    // 2. Add any active employees not already in roster
    for (const emp of activeEmployees) {
      const empId = String(emp.id);
      const empCode = (emp.empCode || '').trim().toLowerCase();
      let foundKey: string | null = null;
      for (const [key, val] of rosterMap.entries()) {
        if (
          (val.emp && String(val.emp.id) === empId) ||
          (val.att && String(val.att.employeeId) === empId) ||
          (empCode && val.att && (val.att.empCode || '').trim().toLowerCase() === empCode)
        ) {
          foundKey = key;
          break;
        }
      }
      if (!foundKey) {
        rosterMap.set(empId, { emp, att: undefined });
      } else if (!rosterMap.get(foundKey)!.emp) {
        rosterMap.get(foundKey)!.emp = emp;
      }
    }

    const slips: any[] = Array.from(rosterMap.values()).map(({ emp, att }) => {
      const empId = emp ? String(emp.id) : String(att?.employeeId || '');
      const empCode = emp?.empCode || att?.empCode || '';
      const empName = emp?.name || att?.employeeName || 'Staff Member';
      const desig = emp?.designation || 'Staff';

      const daysWorked = att ? Number(att.daysWorked ?? 30) : 30;
      const otHours = att ? Number(att.overtimeHours ?? 0) : 0;

      const baseSalary = Number(emp?.baseSalary ?? (emp as any)?.basic_salary ?? 0);
      const allowances = Number(emp?.housingAllow ?? 0) + Number(emp?.transportAllow ?? 0) + Number(emp?.otherAllow ?? 0);
      const dailyRate = Math.round((baseSalary / 30) * 100) / 100;
      const workingHours = Number(emp?.workingHoursPerDay || 8);
      const hourlyRate = Math.round((dailyRate / workingHours) * 100) / 100;

      const earnedBasic = Math.round((dailyRate * daysWorked) * 100) / 100;
      const overtimePay = Math.round((hourlyRate * otHours * 1.5) * 100) / 100;
      const grossPay = earnedBasic + allowances + overtimePay;

      // Calculate loan/advance recovery
      const empLoans = activeLoans.filter(l =>
        (empId && String(l.employeeId) === empId) ||
        (empCode && (l.empCode || '').trim().toLowerCase() === empCode.trim().toLowerCase())
      );
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
        id: `pay-${empId || empCode}-${monthYear}`,
        employee_id: empId,
        employee_name: empName,
        emp_code: empCode,
        designation: desig,
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

  public static async postPayrollSheet(monthYear: string, disbursement?: { paymentMethod?: string; bankAccountId?: string; postedBy?: string }): Promise<void> {
    this.clearPayrollSheetsCache();
    const nowIso = new Date().toISOString();
    const postedBy = disbursement?.postedBy || 'Finance & HR Controller';

    // 1. Update employee_payroll records for this month
    await supabase
      .from('employee_payroll')
      .update({
        status: 'POSTED',
        payment_method: disbursement?.paymentMethod || 'BANK_TRANSFER',
        bank_account_id: disbursement?.bankAccountId || null,
        posted_at: nowIso,
        posted_by: postedBy
      })
      .eq('month_year', monthYear);

    // 2. Fetch employee_payroll to get accurate totals
    // 1. Check if payroll is already posted to prevent duplicate vouchers
    const { data: existingSheet } = await supabase
      .from('hr_payroll_sheets')
      .select('status, voucher_no, voucher_id')
      .eq('month_year', monthYear)
      .maybeSingle();

    if (existingSheet?.status === 'POSTED' && existingSheet?.voucher_id) {
      throw new Error(`Monthly payroll for ${monthYear} is already POSTED (Voucher: ${existingSheet.voucher_no || existingSheet.voucher_id}). Unpost first before regenerating.`);
    }

    // 2. Try Atomic PostgreSQL Stored Procedure first
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('post_payroll_batch_and_post_jv', {
        p_month_year: monthYear,
        p_posted_by: postedBy
      });

      if (!rpcErr && rpcData?.success) {
        try {
          FinanceService.clearCoaCache();
          await supabase.rpc('sync_coa_current_balances');
        } catch (_) {}

        try {
          await AuditService.logAction({
            action: 'POST',
            entityType: 'PAYROLL',
            entityId: `PAY-${monthYear}`,
            details: `Posted monthly payroll for ${monthYear} (${rpcData.total_employees || 1} staff). Recorded Journal Voucher ${rpcData.voucher_no}: Debit 5210-100 AED ${Number(rpcData.total_gross || 0).toFixed(2)}, Credit 2310-01 AED ${Number(rpcData.total_net || 0).toFixed(2)}`
          });
        } catch (_) {}

        return;
      }

      if (rpcErr && rpcErr.message?.includes('already posted')) {
        throw new Error(rpcErr.message);
      }
    } catch (rpcEx: any) {
      if (rpcEx.message?.includes('already posted')) throw rpcEx;
      console.warn('[HrService] RPC post_payroll_batch_and_post_jv fallback to client engine:', rpcEx?.message || rpcEx);
    }

    // 3. Fallback: Query employee payroll records
    const { data: records } = await supabase
      .from('employee_payroll')
      .select('*')
      .eq('month_year', monthYear);

    const slips = records || [];
    const totalGross = Number(slips.reduce((sum: number, s: any) => sum + (Number(s.earned_basic || s.gross_pay || s.grossPay || 0) + Number(s.allowances || 0) + Number(s.overtime_pay || s.otPay || 0)), 0).toFixed(2));
    const totalDeductions = Number(slips.reduce((sum: number, s: any) => sum + (Number(s.advance_deduction || s.advanceCut || 0) + Number(s.loan_emi_deduction || s.loanEmi || 0) + Number(s.total_deductions || s.deductions || 0)), 0).toFixed(2));
    const totalNet = Number(slips.reduce((sum: number, s: any) => sum + Number(s.net_pay || s.netPay || (s.earned_basic - totalDeductions)), 0).toFixed(2));

    const voucherNo = `JV-PAY-${monthYear}`;
    const voucherId = `vch-pay-${monthYear}`;
    const [yNum, mNum] = monthYear.split('-').map(Number);
    const lastDay = new Date(Date.UTC(yNum, mNum, 0)).getUTCDate();
    const voucherDate = `${monthYear}-${String(lastDay).padStart(2, '0')}`;

    // 4. Upsert hr_payroll_sheets with voucher tracking
    await supabase
      .from('hr_payroll_sheets')
      .upsert({
        id: `pay-sheet-${monthYear}`,
        month_year: monthYear,
        total_employees: slips.length,
        total_gross: totalGross,
        gross_total: totalGross,
        total_deductions: totalDeductions,
        total_net: totalNet,
        net_payable: totalNet,
        status: 'POSTED',
        voucher_id: voucherId,
        voucher_no: voucherNo,
        posted_at: nowIso
      });

    // 5. Double-Entry Journal Voucher in General Ledger & COA:
    // DEBIT:  5210-100 SALARY EXPNSE (totalGross)
    // CREDIT: 1135-01 Staff Advance & Loan Receivables (totalDeductions, if > 0)
    // CREDIT: 2310-01 Staff Salaries Payable (totalNet)
    if (totalGross > 0) {
      // 1. Dynamic UUID Lookup strictly from chart_of_accounts (No hardcoded UUIDs)
      let chartData: any[] | null = null;
      try {
        const { data, error } = await supabase
          .from('chart_of_accounts')
          .select('id, code, name')
          .in('code', ['5210-100', '5210-01', '2310-01', '1135-01']);
        if (!error && Array.isArray(data) && data.length > 0) {
          chartData = data;
        }
      } catch (_) {}

      // Fallback if direct query returns empty
      if (!chartData || chartData.length === 0) {
        chartData = await FinanceService.getCoaAccounts();
      }

      const expAcc = chartData?.find((a: any) => (a.code || a.account_code) === '5210-100') || chartData?.find((a: any) => (a.code || a.account_code) === '5210-01');
      if (!expAcc || !expAcc.id) {
        throw new Error("Account code 5210-100 not found in Chart of Accounts. Please create it first.");
      }

      const payAcc = chartData?.find((a: any) => (a.code || a.account_code) === '2310-01');
      if (!payAcc || !payAcc.id) {
        throw new Error("Account code 2310-01 not found in Chart of Accounts. Please create it first.");
      }

      const dedAcc = chartData?.find((a: any) => (a.code || a.account_code) === '1135-01');
      if (totalDeductions > 0 && (!dedAcc || !dedAcc.id)) {
        throw new Error("Account code 1135-01 not found in Chart of Accounts. Please create it first.");
      }

      // Clean up previous entries if re-posting
      try {
        await supabase.from('journal_entries').delete().or(`voucher_id.eq.${voucherNo},voucher_id.eq.${voucherId}`);
        await supabase.from('voucher_entries').delete().or(`voucher_no.eq.${voucherNo},voucher_id.eq.${voucherId}`);
        await supabase.from('general_ledger').delete().or(`voucher_no.eq.${voucherNo},voucher_id.eq.${voucherId}`);
        await supabase.from('ledgers').delete().or(`voucher_no.eq.${voucherNo},voucher_id.eq.${voucherId}`);
        await supabase.from('financial_vouchers').delete().or(`voucher_no.eq.${voucherNo},id.eq.${voucherId}`);
        await supabase.from('vouchers').delete().or(`voucher_no.eq.${voucherNo},id.eq.${voucherId}`);
      } catch (e) {
        console.warn('Voucher cleanup warning:', e);
      }

      const memo = `Monthly Payroll Expense & Accrual - ${monthYear} (${slips.length} Staff)`;

      const voucherLines: any[] = [
        {
          id: `vli-pay-dr-${monthYear}`,
          accountId: String(expAcc.id),
          accountCode: expAcc.code || '5210-100',
          accountName: expAcc.name || 'SALARY EXPNSE',
          debitAmount: totalGross,
          creditAmount: 0,
          memo: `Staff Salaries Expense for ${monthYear}`
        }
      ];

      if (totalDeductions > 0 && dedAcc) {
        voucherLines.push({
          id: `vli-pay-ded-${monthYear}`,
          accountId: String(dedAcc.id),
          accountCode: dedAcc.code || '1135-01',
          accountName: dedAcc.name || 'Staff Advance & Loan Receivables',
          debitAmount: 0,
          creditAmount: totalDeductions,
          memo: `Staff Loan & Advance Recoveries for ${monthYear}`
        });
      }

      voucherLines.push({
        id: `vli-pay-cr-${monthYear}`,
        accountId: String(payAcc.id),
        accountCode: payAcc.code || '2310-01',
        accountName: payAcc.name || 'Staff Salaries Payable',
        debitAmount: 0,
        creditAmount: totalNet,
        memo: `Accrued Salaries Payable for ${monthYear}`
      });

      await FinanceService.addVoucher({
        id: voucherId,
        voucherNo,
        date: voucherDate,
        type: 'JOURNAL',
        reference: `PAY-${monthYear}`,
        narration: memo,
        totalDebit: totalGross,
        totalCredit: totalGross,
        status: 'POSTED',
        createdBy: postedBy,
        lines: voucherLines
      });

      try {
        const journalLines: any[] = [
          {
            voucher_id: voucherId,
            account_id: String(expAcc.id),
            debit: totalGross,
            credit: 0,
            description: memo
          }
        ];
        if (totalDeductions > 0 && dedAcc) {
          journalLines.push({
            voucher_id: voucherId,
            account_id: String(dedAcc.id),
            debit: 0,
            credit: totalDeductions,
            description: memo
          });
        }
        journalLines.push({
          voucher_id: voucherId,
          account_id: String(payAcc.id),
          debit: 0,
          credit: totalNet,
          description: memo
        });
        await supabase.from('journal_entries').insert(journalLines);
      } catch (jeErr) {
        console.warn('[HrService] journal_entries insert warning:', jeErr);
      }

      try {
        FinanceService.clearCoaCache();
        await supabase.rpc('sync_coa_current_balances');
      } catch (_) {}

      try {
        await AuditService.logAction({
          action: 'POST',
          entityType: 'PAYROLL',
          entityId: `PAY-${monthYear}`,
          details: `Posted monthly payroll for ${monthYear} (${slips.length} staff). Recorded Journal Voucher ${voucherNo}: Debit 5210-100 AED ${totalGross.toFixed(2)}, Credit 2310-01 AED ${totalNet.toFixed(2)}`
        });
      } catch (_) {}
    }
  }

  public static async unpostPayrollSheet(monthYear: string): Promise<void> {
    this.clearPayrollSheetsCache();

    // 1. Try atomic PostgreSQL procedure
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('unpost_payroll_batch_and_reverse_jv', {
        p_month_year: monthYear
      });
      if (!rpcErr && rpcData?.success) {
        try {
          FinanceService.clearCoaCache();
          await supabase.rpc('sync_coa_current_balances');
        } catch (_) {}
        return;
      }
    } catch (_) {}

    // 2. Fallback direct update
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
        status: 'DRAFT',
        voucher_id: null,
        voucher_no: null,
        posted_at: null
      });

    // Remove the associated Journal Voucher and entries
    const voucherNo = `JV-PAY-${monthYear}`;
    const voucherId = `vch-pay-${monthYear}`;
    try {
      await supabase.from('journal_entries').delete().or(`voucher_id.eq.${voucherNo},voucher_id.eq.${voucherId}`);
      await supabase.from('voucher_entries').delete().or(`voucher_no.eq.${voucherNo},voucher_id.eq.${voucherId}`);
      await supabase.from('general_ledger').delete().or(`voucher_no.eq.${voucherNo},voucher_id.eq.${voucherId}`);
      await supabase.from('ledgers').delete().or(`voucher_no.eq.${voucherNo},voucher_id.eq.${voucherId}`);
      await supabase.from('financial_vouchers').delete().or(`voucher_no.eq.${voucherNo},id.eq.${voucherId}`);
      await supabase.from('vouchers').delete().or(`voucher_no.eq.${voucherNo},id.eq.${voucherId}`);
    } catch (e) {
      console.warn('Voucher deletion warning:', e);
    }

    try {
      FinanceService.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}

    try {
      await AuditService.logAction({
        action: 'UNPOST',
        entityType: 'PAYROLL',
        entityId: `PAY-${monthYear}`,
        details: `Unposted monthly payroll for ${monthYear} and reversed Journal Voucher ${voucherNo} from General Ledger`
      });
    } catch (_) {}
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

  public static async getPayrollSheets(
    forceRefresh: boolean = false,
    options?: { limit?: number; offset?: number; page?: number }
  ): Promise<any[]> {
    const isDefaultFetch = !options || (!options.limit && !options.offset && !options.page);
    if (!forceRefresh && isDefaultFetch && this.cachedPayrollSheets && (Date.now() - this.lastPayrollSheetsFetched < this.PAYROLL_SHEETS_TTL_MS)) {
      return this.cachedPayrollSheets;
    }
    if (isDefaultFetch && this.payrollSheetsPromise) {
      return this.payrollSheetsPromise;
    }

    const runFetch = async () => {
      try {
        const limit = options?.limit || 50;
        const offset = options?.offset ?? (options?.page ? (options.page - 1) * limit : 0);

        const { data, error } = await supabase
          .from('hr_payroll_sheets')
          .select('id, month_year, total_employees, total_gross, total_deductions, total_net, status, voucher_no, voucher_id, created_at')
          .order('month_year', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          if (this.cachedPayrollSheets && isDefaultFetch) return this.cachedPayrollSheets;
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
        if (isDefaultFetch) {
          this.cachedPayrollSheets = mapped;
          this.lastPayrollSheetsFetched = Date.now();
        }
        return mapped;
      } finally {
        if (isDefaultFetch) {
          this.payrollSheetsPromise = null;
        }
      }
    };

    if (isDefaultFetch) {
      this.payrollSheetsPromise = runFetch();
      return this.payrollSheetsPromise;
    } else {
      return await runFetch();
    }
  }

  public static async getPayrollSheetsPaginated(
    page: number = 1,
    pageSize: number = 10
  ): Promise<PaginatedResponse<any>> {
    try {
      let query = supabase
        .from('hr_payroll_sheets')
        .select('id, month_year, total_employees, total_gross, total_deductions, total_net, status, voucher_no, voucher_id, created_at', { count: 'exact' });

      query = applyPagination(query, page, pageSize, {
        orderBy: 'month_year',
        ascending: false,
        secondaryOrderBy: 'id',
        secondaryAscending: false
      });

      const { data, count, error } = await query;
      if (error) {
        console.warn('[HrService] getPayrollSheetsPaginated notice:', error.message);
        const all = await this.getPayrollSheets();
        const from = (page - 1) * pageSize;
        return buildPaginatedResponse(all.slice(from, from + pageSize), all.length, page, pageSize);
      }

      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        monthYear: row.month_year,
        totalEmployees: row.total_employees,
        totalGross: Number(row.total_gross || 0),
        totalDeductions: Number(row.total_deductions || 0),
        totalNet: Number(row.total_net || 0),
        status: row.status,
        voucherNo: row.voucher_no,
        voucherId: row.voucher_id,
        createdAt: row.created_at
      }));

      return buildPaginatedResponse(mapped, count ?? mapped.length, page, pageSize);
    } catch (err: any) {
      console.warn('[HrService] getPayrollSheetsPaginated exception:', err?.message);
      return buildPaginatedResponse([], 0, page, pageSize);
    }
  }

  public static async deletePayroll(monthYear: string): Promise<void> {
    return this.deletePayrollSheet(monthYear);
  }

  public static async deletePayrollSheet(monthYear: string): Promise<void> {
    if (!monthYear) {
      throw new Error('Month is required to delete payroll sheet');
    }

    this.clearPayrollSheetsCache();

    // 1. Validation: Verify sheet is not POSTED
    const { data: sheet } = await supabase
      .from('hr_payroll_sheets')
      .select('status, voucher_id, voucher_no')
      .eq('month_year', monthYear)
      .maybeSingle();

    if (sheet?.status === 'POSTED') {
      throw new Error(`Cannot delete payroll for ${monthYear}: Sheet is POSTED and recorded in General Ledger. Please unpost it first.`);
    }

    // 2. Delete employee payroll slips
    const { error: payErr } = await supabase
      .from('employee_payroll')
      .delete()
      .eq('month_year', monthYear);

    if (payErr) {
      console.error('[HrService] Error deleting employee_payroll from Supabase:', payErr);
      throw new Error(payErr.message || 'Failed to delete payroll records');
    }

    // 3. Delete payroll sheet
    const { error: sheetErr } = await supabase
      .from('hr_payroll_sheets')
      .delete()
      .eq('month_year', monthYear);

    if (sheetErr) {
      console.error('[HrService] Error deleting hr_payroll_sheets from Supabase:', sheetErr);
      throw new Error(sheetErr.message || 'Failed to delete payroll sheet');
    }

    // 4. Log audit action
    try {
      await AuditService.logAction({
        action: 'DELETE',
        entityType: 'PAYROLL',
        entityId: `PAY-${monthYear}`,
        details: `Permanently deleted draft payroll sheet and salary slips for ${monthYear}`
      });
    } catch (_) {}
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
      confidence_score: Number(log.confidence || 0.98),
      source: log.source || 'GEMINI_AI_VISION',
      scanned_by: log.scannedBy || 'HR Admin',
      details: log.details || '',
      extracted_data: {
        extractedName: log.extractedName || '',
        extractedId: log.extractedId || '',
        confidence: Number(log.confidence || 0.98),
        source: log.source || 'GEMINI_AI_VISION',
        scannedBy: log.scannedBy || 'HR Admin',
        details: log.details || ''
      },
      raw_response: log.details || '',
      created_at: new Date().toISOString()
    };

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('vintage_vibes_hr_ocr_logs');
      }
    } catch (_) {}

    try {
      const { error } = await supabase.from('hr_ocr_logs').insert(entry);
      if (error) {
        console.warn('Supabase ocr log insert warning:', error);
      }
    } catch (err) {
      console.warn('Supabase ocr log insert failed:', err);
    }

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

  public static readonly OCR_LOGS_GRID_COLUMNS = 'id, document_type, extracted_name, extracted_id, confidence, confidence_score, source, scanned_by, details, created_at';

  public static async getOcrLogs(options?: { limit?: number; offset?: number; page?: number }): Promise<any[]> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('vintage_vibes_hr_ocr_logs');
      }
    } catch (_) {}

    try {
      const limit = options?.limit || 50;
      const offset = options?.offset ?? (options?.page ? (options.page - 1) * limit : 0);

      const { data, error } = await supabase
        .from('hr_ocr_logs')
        .select(HrService.OCR_LOGS_GRID_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error && Array.isArray(data)) {
        return data;
      }
    } catch (err) {
      console.warn('Failed to fetch hr_ocr_logs from Supabase:', err);
    }

    return [];
  }
}
