import { HrService } from './hrService.ts';
import { AttendanceRecord, Employee } from '../modules/hr/hr.types.ts';

export class AttendanceService {
  /**
   * Fetch attendance records for a specific month (or all if omitted).
   */
  public static async getAttendance(monthYear?: string): Promise<AttendanceRecord[]> {
    return HrService.getAttendance(monthYear);
  }

  /**
   * Compare all active employees against the attendance roster for the specified month.
   * If any active employees are missing from the sheet, automatically append them with
   * default values (daysWorked: 30, overtimeHours: 0, status: 'DRAFT') and persist them.
   */
  public static async syncMissingEmployees(monthYear: string): Promise<AttendanceRecord[]> {
    return HrService.syncMissingEmployeesToAttendance(monthYear);
  }

  /**
   * Initialize a new monthly attendance sheet with all active employees.
   */
  public static async createAttendanceSheet(monthYear: string): Promise<AttendanceRecord[]> {
    return HrService.createAttendanceSheet(monthYear);
  }

  /**
   * Update days worked and overtime hours for an employee attendance row.
   */
  public static async updateAttendance(id: string, updates: { daysWorked?: number; overtimeHours?: number }): Promise<void> {
    return HrService.updateAttendance(id, updates);
  }

  /**
   * Lock & POST attendance sheet for the given month.
   */
  public static async postAttendanceSheet(monthYear: string): Promise<void> {
    return HrService.postAttendanceSheet(monthYear);
  }

  /**
   * Unlock & UNPOST attendance sheet for the given month back to DRAFT.
   */
  public static async unpostAttendanceSheet(monthYear: string): Promise<void> {
    return HrService.unpostAttendanceSheet(monthYear);
  }

  /**
   * Retrieve all attendance sheet summary logs.
   */
  public static async getAttendanceSheets(): Promise<any[]> {
    return HrService.getAttendanceSheets();
  }
}
