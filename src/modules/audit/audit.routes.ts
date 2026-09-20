import { Router } from 'express';
import { AuditController } from './audit.controller.ts';
import { AuditService } from '../../services/auditService.ts';
import { withDb } from '../../db/pgPool.ts';
import { verifyAuthToken } from '../../server/authValidator.ts';

export const auditRouter = Router();

async function fetchAuditLogsFromPg(limit = 200) {
  return await withDb(async (client) => {
    const result = await client.query(`
      SELECT * FROM public.audit_logs
      ORDER BY "timestamp" DESC
      LIMIT $1;
    `, [limit]);
    return (result.rows || []).map((row: any) => ({
      id: row.id,
      module: row.module || 'HR',
      action: row.action || 'POST',
      documentRef: row.document_ref || row.documentRef || '',
      status: row.status || 'POSTED',
      userId: row.user_id || row.userId || 'usr-admin',
      userName: row.user_name || row.userName || row.actor || 'HR Department',
      details: row.details || '',
      timestamp: row.timestamp || new Date().toISOString()
    }));
  });
}

auditRouter.get(['/', '/logs'], async (req, res) => {
  const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;
  const filters = req.query as any;
  try {
    const pgLogs = await fetchAuditLogsFromPg(200);
    if (Array.isArray(pgLogs) && pgLogs.length > 0) {
      return res.json(pgLogs);
    }
  } catch (pgErr: any) {
    console.warn('[Audit Routes] PG direct query notice:', pgErr?.message);
  }

  try {
    const logs = await AuditService.getAuditLogs(filters);
    return res.json(logs);
  } catch (svcErr: any) {
    console.error('[Audit Routes] AuditService query error:', svcErr?.message);
    return res.status(503).json({
      success: false,
      degraded: true,
      error: 'Audit logs query failed. Service unavailable.',
      correlationId,
      logs: []
    });
  }
});

auditRouter.post(['/', '/log'], async (req, res) => {
  const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const authHeader = (req.headers.authorization as string) || (req.headers['authorization'] as string) || '';
  const authResult = await verifyAuthToken(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: authResult.error || 'Unauthorized. Valid cryptographic authorization token or session is required to record audit events.',
      correlationId
    });
  }

  const body = req.body || {};
  const targetId = body.id ? String(body.id).trim() : '';

  // Prevent arbitrary clients from overwriting existing audit records
  if (targetId) {
    try {
      const exists = await withDb(async (client) => {
        const check = await client.query('SELECT 1 FROM public.audit_logs WHERE id = $1 LIMIT 1;', [targetId]);
        return check.rows && check.rows.length > 0;
      });
      if (exists) {
        return res.status(409).json({
          success: false,
          error: 'Audit log records are immutable and cannot be overwritten.',
          correlationId
        });
      }
    } catch (_) {}
  }

  const id = targetId || `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Actor is strictly tied to the verified authenticated identity, not untrusted request body or headers
  const effectiveUserName = authResult.user.username || authResult.user.id || 'HR Department';
  const timestamp = body.timestamp || new Date().toISOString();

  try {
    await withDb(async (client) => {
      await client.query(`
        INSERT INTO public.audit_logs (id, module, action, document_ref, status, actor, details, "timestamp")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        id,
        body.module || 'HR',
        body.action || 'POST',
        body.documentRef || body.document_ref || '',
        body.status || 'POSTED',
        effectiveUserName,
        body.details || '',
        timestamp
      ]);
    });
    return res.status(200).json({ success: true, log: { ...body, id, timestamp }, correlationId });
  } catch (dbErr: any) {
    console.error('[Audit Routes] Database write failure:', dbErr?.message);
    try {
      await AuditService.addAuditLog({ ...body, id, timestamp });
      return res.status(200).json({ success: true, log: { ...body, id, timestamp }, correlationId });
    } catch (fallbackErr: any) {
      return res.status(503).json({
        success: false,
        degraded: true,
        error: 'Audit log service unavailable. Could not persist record.',
        correlationId
      });
    }
  }
});
