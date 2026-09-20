import { HrService } from './hrService.ts';
import { PayrollRecord } from '../modules/hr/hr.types.ts';
import { supabase } from '../lib/supabaseClient.ts';

export class PayrollService {
  /**
   * Fetch payroll slips for a given month (or all if omitted).
   */
  public static async getPayroll(monthYear?: string): Promise<PayrollRecord[]> {
    return HrService.getPayroll(monthYear);
  }

  /**
   * Fetch all payroll sheets summary logs.
   */
  public static async getPayrollSheets(): Promise<any[]> {
    return HrService.getPayrollSheets();
  }

  /**
   * Rebuild or sync payroll slips directly from the latest posted attendance sheet for that month.
   * Ensures all active employees present in the attendance sheet are merged or created with exact
   * days worked, earned basic ((baseSalary / 30) * daysWorked), allowances, and loan/advance cuts.
   */
  public static async syncPayrollFromAttendance(monthYear: string): Promise<PayrollRecord[]> {
    try {
      const res = await fetch('/api/hr/payroll/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthYear, force: true })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.records) && data.records.length > 0) {
        return data.records;
      }
    } catch (err) {
      console.warn('[PayrollService] API payroll run notice, falling back to client-side recalculation:', err);
    }

    // Direct client-side engine fallback using HrService & Supabase
    return HrService.runPayroll(monthYear);
  }

  /**
   * Calculate payroll for a month.
   */
  public static async runPayroll(monthYear: string): Promise<PayrollRecord[]> {
    return this.syncPayrollFromAttendance(monthYear);
  }

  /**
   * Update advance & loan deductions on a single slip.
   */
  public static async updateDeductions(slipId: string, advanceDeduction: number, loanEmiDeduction: number): Promise<void> {
    const res = await fetch(`/api/hr/payroll/${slipId}/deductions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advanceDeduction, loanEmiDeduction })
    });
    if (!res.ok) {
      // Fallback update directly to Supabase if API endpoint fails
      try {
        await HrService.updatePayrollSlipDeductions(slipId, advanceDeduction, loanEmiDeduction);
      } catch (e) {
        console.error('[PayrollService] Deduction update failed:', e);
        throw new Error('Failed to update payroll deductions');
      }
    }
  }

  /**
   * Post payroll sheet for month to General Ledger.
   */
  public static async postPayrollSheet(monthYear: string, postedBy: string = 'Finance & HR Controller'): Promise<void> {
    const res = await fetch('/api/hr/payroll/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: monthYear, postedBy })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      // Client-side fallback
      await HrService.postPayrollSheet(monthYear, { postedBy });
    }
  }

  /**
   * Unpost payroll sheet.
   */
  public static async unpostPayrollSheet(monthYear: string): Promise<void> {
    const res = await fetch('/api/hr/payroll/unpost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: monthYear })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      await HrService.unpostPayrollSheet(monthYear);
    }
  }

  /**
   * Delete draft payroll sheet and slips.
   */
  public static async deletePayroll(monthYear: string): Promise<void> {
    const res = await fetch('/api/hr/payroll/sheet', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: monthYear })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      await HrService.deletePayroll(monthYear);
    }
  }
}
