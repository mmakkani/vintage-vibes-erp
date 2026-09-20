import { getClientIp } from '../devices/devices.controller.ts';
import { getPgClient } from '../../db/pgPool.ts';

export const PresenceController = {
  async heartbeat(req: any, res: any) {
    const ip = getClientIp(req);
    const { sessionId, userId, username, displayName, role, deviceType } = req.body || {};

    const safeSessionId = sessionId || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const safeUsername = (username || 'operator').trim();

    const client = await getPgClient();
    if (client) {
      try {
        // Upsert presence heartbeat
        await client.query(`
          INSERT INTO user_presences (session_id, user_id, username, display_name, role, device_type, ip_address, last_heartbeat)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (session_id) DO UPDATE
          SET last_heartbeat = NOW(),
              username = EXCLUDED.username,
              display_name = EXCLUDED.display_name,
              role = EXCLUDED.role,
              device_type = EXCLUDED.device_type,
              ip_address = EXCLUDED.ip_address;
        `, [
          safeSessionId,
          userId || null,
          safeUsername,
          displayName || safeUsername,
          role || 'OPERATOR',
          deviceType || 'Web Client',
          ip
        ]);

        // Clean up stale sessions (> 45s)
        await client.query("DELETE FROM user_presences WHERE last_heartbeat < NOW() - INTERVAL '45 seconds';").catch(() => {});

        // Fetch active online users
        const activeRes = await client.query(`
          SELECT session_id, user_id, username, display_name, role, device_type, ip_address, last_heartbeat
          FROM user_presences
          WHERE last_heartbeat > NOW() - INTERVAL '45 seconds'
          ORDER BY last_heartbeat DESC;
        `);
        await client.end();

        return res.status(200).json({
          success: true,
          onlineCount: activeRes.rows.length,
          users: activeRes.rows
        });
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
        const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        console.error('[Presence Heartbeat Error]', {
          correlationId,
          endpoint: '/api/presence/heartbeat',
          method: 'POST',
          userId: (req as any).user?.id || 'unauthenticated',
          clientReportedId: userId || null,
          errorCode: err?.code || 'PG_ERROR',
          errorMessage: err?.message
        });
        return res.status(503).json({
          success: false,
          degraded: true,
          error: 'Presence heartbeat database write failed. Database service temporarily unavailable.',
          correlationId
        });
      }
    }

    const fallbackCorrelationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return res.status(503).json({
      success: false,
      degraded: true,
      error: 'Presence heartbeat service unavailable.',
      correlationId: fallbackCorrelationId
    });
  },

  async getOnlineUsers(req: any, res: any) {
    const client = await getPgClient();
    if (client) {
      try {
        await client.query("DELETE FROM user_presences WHERE last_heartbeat < NOW() - INTERVAL '45 seconds';").catch(() => {});
        const activeRes = await client.query(`
          SELECT session_id, user_id, username, display_name, role, device_type, ip_address, last_heartbeat
          FROM user_presences
          WHERE last_heartbeat > NOW() - INTERVAL '45 seconds'
          ORDER BY last_heartbeat DESC;
        `);
        await client.end();
        return res.status(200).json({
          success: true,
          onlineCount: activeRes.rows.length,
          users: activeRes.rows
        });
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
        const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        console.error('[Presence getOnlineUsers Error]', {
          correlationId,
          endpoint: '/api/presence/users',
          method: 'GET',
          errorCode: err?.code || 'PG_ERROR',
          errorMessage: err?.message
        });
        return res.status(503).json({
          success: false,
          degraded: true,
          error: 'Presence query database error. Service temporarily unavailable.',
          correlationId,
          users: []
        });
      }
    }
    const correlationId = (req as any).correlationId || (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return res.status(503).json({
      success: false,
      degraded: true,
      error: 'Presence service unavailable.',
      correlationId,
      users: []
    });
  },

  async logout(req: any, res: any) {
    const { sessionId, username } = req.body || {};
    const client = await getPgClient();
    if (client) {
      try {
        if (sessionId) {
          await client.query('DELETE FROM user_presences WHERE session_id = $1;', [sessionId]);
        } else if (username) {
          await client.query('DELETE FROM user_presences WHERE username = $1;', [username]);
        }
        await client.end();
        return res.status(200).json({ success: true });
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
      }
    }
    return res.status(200).json({ success: true });
  }
};
