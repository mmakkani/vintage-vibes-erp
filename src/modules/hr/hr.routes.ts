import { Router } from 'express';
import { HRController } from './hr.controller.ts';

export const hrRouter = Router();

hrRouter.get('/employees', (req, res) => {
  return res.json(HRController.getEmployees());
});

hrRouter.post('/employees', (req, res) => {
  return res.json(HRController.addEmployee(req.body));
});

hrRouter.put('/employees/:id', (req, res) => {
  const { id } = req.params;
  return res.json(HRController.updateEmployee(id, req.body));
});

hrRouter.post('/employees/:id/post', (req, res) => {
  const { id } = req.params;
  const result = HRController.postEmployee(id);
  if (!result.success) return res.status(400).json({ error: result.error });
  return res.json(result);
});

hrRouter.post('/employees/:id/unpost', (req, res) => {
  const { id } = req.params;
  const result = HRController.unpostEmployee(id);
  if (!result.success) return res.status(400).json({ error: result.error });
  return res.json(result);
});

hrRouter.delete('/employees/:id', (req, res) => {
  const { id } = req.params;
  const result = HRController.deleteEmployee(id);
  if (!result.success) return res.status(400).json({ error: result.error });
  return res.json(result);
});

hrRouter.get('/attendance/sheets', (req, res) => {
  return res.json(HRController.getAttendanceSheetsLog());
});

hrRouter.get('/attendance', (req, res) => {
  const { month } = req.query as { month?: string };
  const monthYear = month || new Date().toISOString().slice(0, 7);
  return res.json(HRController.getAttendance(monthYear));
});

hrRouter.put('/attendance/:id', (req, res) => {
  const { id } = req.params;
  const { daysWorked, overtimeHours } = req.body;
  return res.json(HRController.updateAttendance(id, Number(daysWorked), Number(overtimeHours)));
});

hrRouter.post('/attendance/create-sheet', (req, res) => {
  const { month } = req.body;
  if (!month) {
    return res.status(400).json({ error: 'Month is required (e.g. 2026-09)' });
  }
  const result = HRController.createAttendanceSheet(month);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.delete(['/attendance/sheet', '/attendance/:month'], (req, res) => {
  const month = req.params.month || req.body?.month || (req.query?.month as string);
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }
  const result = HRController.deleteAttendanceSheet(month);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.post('/attendance/post', (req, res) => {
  const { month, postedBy } = req.body;
  const result = HRController.postAttendanceSheet(month, postedBy || 'HR Manager');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.post('/attendance/unpost', (req, res) => {
  const { month } = req.body;
  const result = HRController.unpostAttendanceSheet(month);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.get('/payroll/sheets', (req, res) => {
  return res.json(HRController.getPayrollSheetsLog());
});

hrRouter.get('/payroll', (req, res) => {
  const { month } = req.query as { month?: string };
  const monthYear = month || new Date().toISOString().slice(0, 7);
  return res.json(HRController.getPayroll(monthYear));
});

hrRouter.post('/payroll/run', (req, res) => {
  const { month } = req.body;
  const result = HRController.runPayroll(month);
  if (!result.success) {
    return res.status(400).json({ error: result.errors?.join(', ') || 'Failed to calculate payroll' });
  }
  return res.json(result);
});

hrRouter.delete(['/payroll/sheet', '/payroll/:month'], (req, res) => {
  const month = req.params.month || req.body?.month || (req.query?.month as string);
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }
  const result = HRController.deletePayroll(month);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.put('/payroll/:id/deductions', (req, res) => {
  const { advanceDeduction, loanEmiDeduction } = req.body;
  const result = HRController.updatePayrollDeductions(req.params.id, advanceDeduction, loanEmiDeduction);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.post(['/payroll/post', '/payroll/:id/post'], (req, res) => {
  const { month, postedBy, paymentMethod, bankAccountId } = req.body;
  const target = req.params.id || month;
  const result = HRController.postPayroll(target, postedBy || 'HR Director', paymentMethod, bankAccountId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.post(['/payroll/unpost', '/payroll/:id/unpost'], (req, res) => {
  const { month } = req.body;
  const target = req.params.id || month;
  const result = HRController.unpostPayroll(target);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

// Employee Loans & Advances (EMI)
hrRouter.get('/loans', (req, res) => {
  const { employeeId } = req.query as { employeeId?: string };
  return res.json(HRController.getEmployeeLoans(employeeId));
});

hrRouter.post('/loans', (req, res) => {
  const result = HRController.createEmployeeLoan(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

hrRouter.delete('/loans/:id', (req, res) => {
  const result = HRController.deleteEmployeeLoan(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

// AI OCR Document Scanning Endpoints
hrRouter.get('/ocr/status', (req, res) => {
  return res.json(HRController.getOcrConfigStatus());
});

hrRouter.post('/ocr/scan', async (req, res) => {
  try {
    const { documentType, imageBase64, secondaryImageBase64, apiKey } = req.body;
    const headerKey = req.headers['x-gemini-api-key'] as string;
    const effectiveApiKey = (apiKey && typeof apiKey === 'string' && apiKey.trim())
      ? apiKey.trim()
      : (headerKey && headerKey.trim() ? headerKey.trim() : undefined);

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
