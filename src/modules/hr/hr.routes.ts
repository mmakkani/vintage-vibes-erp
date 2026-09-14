import { Router } from 'express';
import { HRController } from './hr.controller.ts';
import { HrService } from '../../services/hrService.ts';
import { SetupService } from '../../services/setupService.ts';

export const hrRouter = Router();

hrRouter.get('/employees', async (req, res) => {
  try {
    const data = await HrService.getEmployees();
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getEmployees());
  }
});

hrRouter.post('/employees', async (req, res) => {
  try {
    const data = await HrService.createEmployee(req.body);
    return res.json(data);
  } catch (_) {
    return res.json(HRController.addEmployee(req.body));
  }
});

hrRouter.put('/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await HrService.updateEmployee(id, req.body);
    return res.json(data);
  } catch (_) {
    return res.json(HRController.updateEmployee(id, req.body));
  }
});

hrRouter.post('/employees/:id/post', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await HrService.updateEmployee(id, { status: 'POSTED' as any });
    return res.json({ success: true, employee: data });
  } catch (_) {
    const result = HRController.postEmployee(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

hrRouter.post('/employees/:id/unpost', async (req, res) => {
  const { id } = req.params;
  try {
    const data = await HrService.updateEmployee(id, { status: 'DRAFT' as any });
    return res.json({ success: true, employee: data });
  } catch (_) {
    const result = HRController.unpostEmployee(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

hrRouter.delete('/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await HrService.deleteEmployee(id);
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deleteEmployee(id);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json(result);
  }
});

hrRouter.get('/attendance/sheets', async (req, res) => {
  try {
    const data = await HrService.getAttendanceSheets();
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getAttendanceSheetsLog());
  }
});

hrRouter.get('/attendance', async (req, res) => {
  const { month } = req.query as { month?: string };
  const monthYear = month || new Date().toISOString().slice(0, 7);
  try {
    const data = await HrService.getAttendance(monthYear);
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getAttendance(monthYear));
  }
});

hrRouter.put('/attendance/:id', async (req, res) => {
  const { id } = req.params;
  const { daysWorked, overtimeHours } = req.body;
  try {
    await HrService.updateAttendance(id, { daysWorked: Number(daysWorked), overtimeHours: Number(overtimeHours) });
    return res.json({ success: true });
  } catch (_) {
    return res.json(HRController.updateAttendance(id, Number(daysWorked), Number(overtimeHours)));
  }
});

hrRouter.post('/attendance/create-sheet', async (req, res) => {
  const { month } = req.body;
  if (!month) {
    return res.status(400).json({ error: 'Month is required (e.g. 2026-09)' });
  }
  try {
    const records = await HrService.createAttendanceSheet(month);
    return res.json({ success: true, records });
  } catch (_) {
    const result = HRController.createAttendanceSheet(month);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.delete(['/attendance/sheet', '/attendance/:month'], async (req, res) => {
  const month = req.params.month || req.body?.month || (req.query?.month as string);
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }
  try {
    await HrService.deleteAttendanceSheet(month);
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deleteAttendanceSheet(month);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.post('/attendance/post', async (req, res) => {
  const { month, postedBy } = req.body;
  try {
    await HrService.postAttendanceSheet(month);
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.postAttendanceSheet(month, postedBy || 'HR Manager');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.post('/attendance/unpost', async (req, res) => {
  const { month } = req.body;
  try {
    await HrService.unpostAttendanceSheet(month);
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.unpostAttendanceSheet(month);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.get('/payroll/sheets', async (req, res) => {
  try {
    const data = await HrService.getPayrollSheets();
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getPayrollSheetsLog());
  }
});

hrRouter.get('/payroll', async (req, res) => {
  const { month } = req.query as { month?: string };
  const monthYear = month || new Date().toISOString().slice(0, 7);
  try {
    const data = await HrService.getPayroll(monthYear);
    return res.json(data);
  } catch (_) {
    return res.json(HRController.getPayroll(monthYear));
  }
});

hrRouter.post('/payroll/run', async (req, res) => {
  const { month } = req.body;
  try {
    const slips = await HrService.runPayroll(month);
    return res.json({ success: true, records: slips });
  } catch (_) {
    const result = HRController.runPayroll(month);
    if (!result.success) {
      return res.status(400).json({ error: result.errors?.join(', ') || 'Failed to calculate payroll' });
    }
    return res.json(result);
  }
});

hrRouter.delete(['/payroll/sheet', '/payroll/:month'], async (req, res) => {
  const month = req.params.month || req.body?.month || (req.query?.month as string);
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }
  try {
    await HrService.deletePayrollSheet(month);
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deletePayroll(month);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.put('/payroll/:id/deductions', async (req, res) => {
  const { advanceDeduction, loanEmiDeduction } = req.body;
  try {
    await HrService.updatePayrollDeductions(req.params.id, { advanceDeduction, loanEmiDeduction });
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.updatePayrollDeductions(req.params.id, advanceDeduction, loanEmiDeduction);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.post(['/payroll/post', '/payroll/:id/post'], async (req, res) => {
  const { month, postedBy, paymentMethod, bankAccountId } = req.body;
  const target = req.params.id || month;
  try {
    await HrService.postPayrollSheet(target, { postedBy, paymentMethod, bankAccountId });
    return res.json({ success: true });
  } catch (err: any) {
    const result = HRController.postPayroll(target, postedBy || 'HR Director', paymentMethod, bankAccountId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.post(['/payroll/unpost', '/payroll/:id/unpost'], async (req, res) => {
  const { month } = req.body;
  const target = req.params.id || month;
  try {
    await HrService.unpostPayrollSheet(target);
    return res.json({ success: true });
  } catch (err: any) {
    const result = HRController.unpostPayroll(target);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

// Employee Loans & Advances (EMI)
hrRouter.get('/loans', async (req, res) => {
  try {
    const data = await HrService.getLoans();
    return res.json(data);
  } catch (_) {
    const { employeeId } = req.query as { employeeId?: string };
    return res.json(HRController.getEmployeeLoans(employeeId));
  }
});

hrRouter.post('/loans', async (req, res) => {
  try {
    const loan = await HrService.createLoan(req.body);
    return res.json({ success: true, loan });
  } catch (_) {
    const result = HRController.createEmployeeLoan(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

hrRouter.delete('/loans/:id', async (req, res) => {
  try {
    await HrService.deleteLoan(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const result = HRController.deleteEmployeeLoan(req.params.id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

// AI OCR Document Scanning Endpoints
hrRouter.get('/ocr/status', async (req, res) => {
  const status = HRController.getOcrConfigStatus();
  if (status.configured) return res.json(status);
  try {
    const config = await SetupService.getGeminiApiConfig();
    if (config.configured) {
      return res.json({ configured: true, model: config.model || 'gemini-2.5-flash' });
    }
  } catch (_) {}
  return res.json(status);
});

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

    return res.json(result);
  } catch (error: any) {
    console.error('HR OCR Scan Route Error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to scan document'
    });
  }
});
