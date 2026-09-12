import { Router } from 'express';
import { AuditController } from './audit.controller.ts';
import { AuditService } from '../../services/auditService.ts';

export const auditRouter = Router();

auditRouter.get('/', async (req, res) => {
  const filters = req.query as any;
  try {
    const logs = await AuditService.getAuditLogs(filters);
    return res.json(logs);
  } catch (_) {
    return res.json(AuditController.getLogs(filters));
  }
});

auditRouter.get('/logs', async (req, res) => {
  const filters = req.query as any;
  try {
    const logs = await AuditService.getAuditLogs(filters);
    return res.json(logs);
  } catch (_) {
    return res.json(AuditController.getLogs(filters));
  }
});

auditRouter.post(['/', '/log'], async (req, res) => {
  try {
    await AuditService.addAuditLog(req.body);
    return res.json({ success: true, log: req.body });
  } catch (_) {
    const entry = AuditController.addLog(req.body);
    return res.json({ success: true, log: entry });
  }
});
