-- ==============================================================================
-- MIGRATION: 20260920_hr_rls_policies.sql
-- PURPOSE: Proposed Row-Level Security (RLS) Policies for 11 HR & Payroll Tables
-- STATUS: PROPOSED / PREPARATION ONLY (DO NOT APPLY AUTOMATICALLY VIA APPLICATION CODE)
--
-- Single Source of Truth (SSOT) Architecture Mapping:
-- 1.  Employee Master:      public.employees
-- 2.  Attendance Header:    public.hr_attendance_sheets
-- 3.  Attendance Monthly:   public.employee_attendance
-- 4.  Attendance Daily:     public.staff_attendance
-- 5.  Attendance Legacy:    public.attendance_sheets (deprecated / isolated)
-- 6.  Payroll Header:       public.hr_payroll_sheets
-- 7.  Payroll Detail:       public.employee_payroll
-- 8.  Payroll Legacy:       public.payroll_records (deprecated / isolated)
-- 9.  Employee Loans/EMI:   public.employee_loans
-- 10. Employee Documents:   public.employee_documents
-- 11. AI OCR Audit Logs:    public.hr_ocr_logs
-- ==============================================================================

-- Helper function to extract user role from JWT claims or users table
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role',
    current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'role',
    (SELECT role FROM public.users WHERE id::text = auth.uid()::text LIMIT 1),
    'authenticated'
  );
$$;

-- Helper function to check if current user is an authorized HR/Admin actor
CREATE OR REPLACE FUNCTION public.is_hr_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (
    auth.role() = 'service_role' OR
    public.get_current_user_role() IN ('ADMIN', 'SUPERADMIN', 'DIRECTOR', 'HR_MANAGER', 'HR_ADMIN')
  );
$$;

-- Helper function to check if current user is authorized for Payroll & Accounting
CREATE OR REPLACE FUNCTION public.is_hr_finance()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (
    auth.role() = 'service_role' OR
    public.get_current_user_role() IN ('ADMIN', 'SUPERADMIN', 'DIRECTOR', 'HR_MANAGER', 'HR_ADMIN', 'ACCOUNTANT', 'FINANCE_MANAGER')
  );
$$;


-- ==============================================================================
-- 1. TABLE: public.employees (Employee Master SSOT)
-- ==============================================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_policy"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    public.is_hr_admin() OR 
    (auth.uid() IS NOT NULL AND COALESCE(is_deleted, false) = false)
  );

CREATE POLICY "employees_insert_policy"
  ON public.employees
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_hr_admin());

CREATE POLICY "employees_update_policy"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());

CREATE POLICY "employees_delete_policy"
  ON public.employees
  FOR DELETE
  TO authenticated
  USING (public.is_hr_admin());


-- ==============================================================================
-- 2. TABLE: public.hr_attendance_sheets (Attendance Header SSOT)
-- ==============================================================================
ALTER TABLE public.hr_attendance_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_attendance_sheets_select_policy"
  ON public.hr_attendance_sheets
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "hr_attendance_sheets_modify_policy"
  ON public.hr_attendance_sheets
  FOR ALL
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());


-- ==============================================================================
-- 3. TABLE: public.employee_attendance (Attendance Monthly Records SSOT)
-- ==============================================================================
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_attendance_select_policy"
  ON public.employee_attendance
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "employee_attendance_modify_policy"
  ON public.employee_attendance
  FOR ALL
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());


-- ==============================================================================
-- 4. TABLE: public.staff_attendance (Daily Attendance Logs SSOT)
-- ==============================================================================
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_attendance_select_policy"
  ON public.staff_attendance
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "staff_attendance_modify_policy"
  ON public.staff_attendance
  FOR ALL
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());


-- ==============================================================================
-- 5. TABLE: public.attendance_sheets (Legacy Duplicate - Isolated)
-- ==============================================================================
ALTER TABLE public.attendance_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_sheets_legacy_select_policy"
  ON public.attendance_sheets
  FOR SELECT
  TO authenticated
  USING (public.is_hr_admin());

CREATE POLICY "attendance_sheets_legacy_modify_policy"
  ON public.attendance_sheets
  FOR ALL
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());


-- ==============================================================================
-- 6. TABLE: public.hr_payroll_sheets (Payroll Header SSOT)
-- ==============================================================================
ALTER TABLE public.hr_payroll_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_sheets_select_policy"
  ON public.hr_payroll_sheets
  FOR SELECT
  TO authenticated
  USING (public.is_hr_finance());

CREATE POLICY "hr_payroll_sheets_modify_policy"
  ON public.hr_payroll_sheets
  FOR ALL
  TO authenticated
  USING (public.is_hr_finance())
  WITH CHECK (public.is_hr_finance());


-- ==============================================================================
-- 7. TABLE: public.employee_payroll (Payroll Detail SSOT)
-- ==============================================================================
ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_payroll_select_policy"
  ON public.employee_payroll
  FOR SELECT
  TO authenticated
  USING (public.is_hr_finance());

CREATE POLICY "employee_payroll_modify_policy"
  ON public.employee_payroll
  FOR ALL
  TO authenticated
  USING (public.is_hr_finance())
  WITH CHECK (public.is_hr_finance());


-- ==============================================================================
-- 8. TABLE: public.payroll_records (Legacy Duplicate - Isolated)
-- ==============================================================================
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_records_legacy_select_policy"
  ON public.payroll_records
  FOR SELECT
  TO authenticated
  USING (public.is_hr_finance());

CREATE POLICY "payroll_records_legacy_modify_policy"
  ON public.payroll_records
  FOR ALL
  TO authenticated
  USING (public.is_hr_finance())
  WITH CHECK (public.is_hr_finance());


-- ==============================================================================
-- 9. TABLE: public.employee_loans (Staff Advances & Installment Loans)
-- ==============================================================================
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_loans_select_policy"
  ON public.employee_loans
  FOR SELECT
  TO authenticated
  USING (public.is_hr_finance());

CREATE POLICY "employee_loans_modify_policy"
  ON public.employee_loans
  FOR ALL
  TO authenticated
  USING (public.is_hr_finance())
  WITH CHECK (public.is_hr_finance());


-- ==============================================================================
-- 10. TABLE: public.employee_documents (Legal Passport & Emirates ID Documents)
-- ==============================================================================
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_documents_select_policy"
  ON public.employee_documents
  FOR SELECT
  TO authenticated
  USING (public.is_hr_admin());

CREATE POLICY "employee_documents_modify_policy"
  ON public.employee_documents
  FOR ALL
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());


-- ==============================================================================
-- 11. TABLE: public.hr_ocr_logs (AI Vision Document Scanning Logs)
-- ==============================================================================
ALTER TABLE public.hr_ocr_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_ocr_logs_select_policy"
  ON public.hr_ocr_logs
  FOR SELECT
  TO authenticated
  USING (public.is_hr_admin());

CREATE POLICY "hr_ocr_logs_modify_policy"
  ON public.hr_ocr_logs
  FOR ALL
  TO authenticated
  USING (public.is_hr_admin())
  WITH CHECK (public.is_hr_admin());


-- ==============================================================================
-- GRANTS: Ensure service_role and authenticated users have base SQL permissions
-- ==============================================================================
GRANT ALL ON TABLE public.employees TO service_role;
GRANT ALL ON TABLE public.hr_attendance_sheets TO service_role;
GRANT ALL ON TABLE public.employee_attendance TO service_role;
GRANT ALL ON TABLE public.staff_attendance TO service_role;
GRANT ALL ON TABLE public.attendance_sheets TO service_role;
GRANT ALL ON TABLE public.hr_payroll_sheets TO service_role;
GRANT ALL ON TABLE public.employee_payroll TO service_role;
GRANT ALL ON TABLE public.payroll_records TO service_role;
GRANT ALL ON TABLE public.employee_loans TO service_role;
GRANT ALL ON TABLE public.employee_documents TO service_role;
GRANT ALL ON TABLE public.hr_ocr_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_attendance_sheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_sheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_payroll_sheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_payroll TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_loans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hr_ocr_logs TO authenticated;
