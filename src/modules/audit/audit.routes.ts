import { Router } from 'express';
import { AuditController } from './audit.controller.ts';

export const auditRouter = Router();

auditRouter.get('/', (req, res) => {
  const filters = req.query as any;
  return res.json(AuditController.getLogs(filters));
});

auditRouter.get('/logs', (req, res) => {
  const filters = req.query as any;
  return res.json(AuditController.getLogs(filters));
});

auditRouter.post(['/', '/log'], (req, res) => {
  const entry = AuditController.addLog(req.body);
  return res.json({ success: true, log: entry });
});
