import { Employee, AttendanceRecord, PayrollRecord, EmployeeLoan } from './hr.types.ts';

export class HREngine {
  /**
   * Core Payroll calculation formulas mandated by ERP specification:
   * Daily Rate = Base Salary / 30
   * Hourly Rate = Daily Rate / Working Hours
   */
  public static calculateEmployeePayroll(
    employee: Employee,
    attendance: AttendanceRecord,
    overtimeMultiplier: number = 1.5,
    advanceDeduction: number = 0,
    loanEmiDeduction: number = 0
  ): Omit<PayrollRecord, 'id' | 'status' | 'postedAt'> {
    const workingHours = employee.workingHoursPerDay > 0 ? employee.workingHoursPerDay : 8;

    // Daily Rate = Base Salary / 30
    const dailyRate = Number((employee.baseSalary / 30).toFixed(2));

    // Hourly Rate = Daily Rate / (Working Hours)
    const hourlyRate = Number((dailyRate / workingHours).toFixed(2));

    // Days worked pro-rated basic salary
    const earnedBasic = Number((dailyRate * Math.min(30, attendance.daysWorked)).toFixed(2));

    // Total fixed allowances
    const totalAllowances = Number((employee.housingAllow + employee.transportAllow).toFixed(2));

    // Overtime pay (1.5x rate)
    const overtimePay = Number((hourlyRate * attendance.overtimeHours * overtimeMultiplier).toFixed(2));

    // Gross Pay
    const grossPay = Number((earnedBasic + totalAllowances + overtimePay).toFixed(2));

    // Advance & Loan Deductions
    const safeAdv = Math.max(0, Number(advanceDeduction) || 0);
    const safeLoan = Math.max(0, Number(loanEmiDeduction) || 0);
    const totalDeductions = Number((safeAdv + safeLoan).toFixed(2));

    // Net Pay (Cannot fall below zero)
    const netPay = Math.max(0, Number((grossPay - totalDeductions).toFixed(2)));

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      empCode: employee.empCode,
      designation: employee.designation,
      monthYear: attendance.monthYear,
      baseSalary: employee.baseSalary,
      allowances: totalAllowances,
      dailyRate,
      hourlyRate,
      daysWorked: attendance.daysWorked,
      overtimeHours: attendance.overtimeHours,
      earnedBasic,
      overtimePay,
      grossPay,
      advanceDeduction: safeAdv,
      loanEmiDeduction: safeLoan,
      totalDeductions,
      netPay
    };
  }

  /**
   * Generates payroll run for all active employees based on posted attendance
   * and automatically deducts applicable advances and loan EMIs for that month.
   */
  public static generatePayrollRun(
    employees: Employee[],
    attendances: AttendanceRecord[],
    monthYear: string,
    loans: EmployeeLoan[] = []
  ): {
    records: PayrollRecord[];
    unpostedEmployees: string[];
  } {
    const records: PayrollRecord[] = [];
    const unpostedEmployees: string[] = [];

    const activeEmployees = employees.filter(e => e.isActive);

    activeEmployees.forEach(emp => {
      const att = attendances.find(a => a.employeeId === emp.id && a.monthYear === monthYear);
      if (!att) {
        unpostedEmployees.push(`${emp.name} (No Attendance Recorded)`);
        return;
      }

      if (att.status !== 'POSTED') {
        unpostedEmployees.push(`${emp.name} (Attendance is still DRAFT)`);
        return;
      }

      // Calculate auto advance & loan deductions for this employee
      const empActiveLoans = loans.filter(
        l => l.employeeId === emp.id && l.status === 'ACTIVE' && l.remainingAmount > 0
      );

      let autoAdvance = 0;
      let autoLoanEmi = 0;

      for (const loan of empActiveLoans) {
        if (loan.type === 'SALARY_ADVANCE') {
          // If startMonth matches or is earlier, deduct full remaining or up to principal
          if (loan.startMonth <= monthYear) {
            autoAdvance += loan.remainingAmount;
          }
        } else if (loan.type === 'INSTALLMENT_LOAN') {
          // If active in this month, deduct monthly installment
          if (loan.startMonth <= monthYear) {
            const emiToDeduct = Math.min(loan.emiAmount, loan.remainingAmount);
            autoLoanEmi += emiToDeduct;
          }
        }
      }

      const calculated = this.calculateEmployeePayroll(emp, att, 1.5, autoAdvance, autoLoanEmi);
      records.push({
        id: `pay-${emp.id}-${monthYear}`,
        ...calculated,
        status: 'DRAFT'
      });
    });

    return { records, unpostedEmployees };
  }
}
