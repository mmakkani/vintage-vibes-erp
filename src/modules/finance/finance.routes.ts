import { Router } from 'express';
import { FinanceController } from './finance.controller.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export const financeRouter = Router();

financeRouter.get('/coa', (req, res) => {
  return res.json(FinanceController.getCOA());
});

financeRouter.post('/coa', (req, res) => {
  return res.json(FinanceController.addAccount(req.body));
});

financeRouter.get('/vouchers', (req, res) => {
  return res.json(FinanceController.getVouchers());
});

financeRouter.post('/vouchers', (req, res) => {
  const result = FinanceController.createVoucher(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

financeRouter.post('/vouchers/:id/post', (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const result = FinanceController.postVoucher(id, postedBy || 'Admin');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

financeRouter.post('/vouchers/:id/unpost', (req, res) => {
  const { id } = req.params;
  const result = FinanceController.unpostVoucher(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

financeRouter.get('/ledgers', (req, res) => {
  const { accountId, partyId } = req.query as { accountId?: string; partyId?: string };
  return res.json(FinanceController.getLedger(accountId, partyId));
});

financeRouter.get('/reports', (req, res) => {
  return res.json(FinanceController.getFinancialStatements());
});

// --- Budgets ---
financeRouter.get('/budgets', (req, res) => {
  const period = (req.query.period as string) || '2026-09';
  return res.json(FinanceController.getBudgets(period));
});

financeRouter.post('/budgets', (req, res) => {
  try {
    const budget = FinanceController.setBudget(req.body);
    return res.json(budget);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

financeRouter.delete('/budgets/:id', (req, res) => {
  const result = FinanceController.deleteBudget(req.params.id);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

financeRouter.post('/budgets/seed-defaults', (req, res) => {
  const period = (req.body.period as string) || '2026-09';
  return res.json(FinanceController.seedDefaultBudgets(period));
});

// --- Custom Reports ---
financeRouter.get('/custom-reports', (req, res) => {
  return res.json(FinanceController.getCustomReports());
});

financeRouter.post('/custom-reports', (req, res) => {
  try {
    const template = FinanceController.saveCustomReport(req.body);
    return res.json(template);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

financeRouter.delete('/custom-reports/:id', (req, res) => {
  const result = FinanceController.deleteCustomReport(req.params.id);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

financeRouter.get('/custom-reports/:id/execute', (req, res) => {
  try {
    const result = FinanceController.executeCustomReport(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// --- Recurring Vouchers ---
financeRouter.get('/recurring-vouchers', (req, res) => {
  return res.json(FinanceController.getRecurringVouchers());
});

financeRouter.post('/recurring-vouchers', (req, res) => {
  try {
    const template = FinanceController.saveRecurringVoucher(req.body);
    return res.json(template);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

financeRouter.delete('/recurring-vouchers/:id', (req, res) => {
  const result = FinanceController.deleteRecurringVoucher(req.params.id);
  if (!result.success) return res.status(404).json(result);
  return res.json(result);
});

financeRouter.post('/recurring-vouchers/:id/run', (req, res) => {
  const result = FinanceController.runRecurringVoucher(req.params.id, req.body.runDate);
  if (!result.success) return res.status(400).json(result);
  return res.json(result);
});

financeRouter.post('/recurring-vouchers/run-all', (req, res) => {
  const result = FinanceController.runAllDueRecurringVouchers(req.body.runDate);
  return res.json(result);
});

// --- UAE FTA Audit File (FAF) ---
financeRouter.get('/fta-faf', (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
  const result = FinanceController.generateFtaAuditFile(startDate, endDate);
  return res.json(result);
});

// --- UAE Corporate Tax (9%) ---
financeRouter.get('/corporate-tax/estimate', (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : 2026;
  const result = FinanceController.calculateCorporateTaxEstimate(taxYear);
  return res.json(result);
});

financeRouter.post('/corporate-tax/provision', (req, res) => {
  const taxYear = req.body.taxYear ? Number(req.body.taxYear) : 2026;
  const postedBy = req.body.postedBy || 'Tax Compliance Officer';
  const result = FinanceController.postCorporateTaxProvision(taxYear, postedBy);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// --- Bale Yield & Container ROI Analytics ---
financeRouter.get('/yield-analytics', (req, res) => {
  return res.json(relationalStore.getBaleYieldAnalytics());
});


