import { getClientIp } from '../devices/devices.controller.ts';
import { getPgClient } from '../../db/pgPool.ts';

export const PresenceController = {
  async heartbeat(req: any, res: any) {
    try {
      const ip = (req && req.headers) ? getClientIp(req) : '127.0.0.1';
      const { sessionId, userId, username, displayName, role, deviceType } = req?.body || {};

      const safeSessionId = sessionId || `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const safeUsername = (username || 'operator').trim();
      const safeDisplayName = displayName || safeUsername;
      const safeRole = role || 'OPERATOR';
      const safeDevice = deviceType || 'Web Client';

      let client: any = null;
      try {
        client = await getPgClient();
      } catch (poolErr) {
        console.warn('[Presence Heartbeat] DB pool unavailable, using fallback state');
      }

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
            safeDisplayName,
            safeRole,
            safeDevice,
            ip
          ]);

          // Clean up stale sessions (> 90s) - Throttled: only 5% of heartbeats trigger cleanup to prevent lock contention
          if (Math.random() < 0.05) {
            await client.query("DELETE FROM user_presences WHERE last_heartbeat < NOW() - INTERVAL '90 seconds';").catch(() => {});
          }

          // Fetch active online users
          const activeRes = await client.query(`
            SELECT session_id, user_id, username, display_name, role, device_type, ip_address, last_heartbeat
            FROM user_presences
            WHERE last_heartbeat > NOW() - INTERVAL '90 seconds'
            ORDER BY last_heartbeat DESC;
          `);

          return res.status(200).json({
            success: true,
            onlineCount: Math.max(1, activeRes.rows.length),
            users: activeRes.rows
          });
        } catch (err: any) {
          const correlationId = (req as any).correlationId || (req.headers?.['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          console.warn('[Presence Heartbeat Notice] Database busy/timeout, responding with degraded local presence state:', err?.message);
        }
      }

      const fallbackCorrelationId = (req as any).correlationId || (req.headers?.['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return res.status(200).json({
        success: true,
        degraded: true,
        onlineCount: 1,
        users: [{
          session_id: safeSessionId,
          user_id: userId || null,
          username: safeUsername,
          display_name: safeDisplayName,
          role: safeRole,
          device_type: safeDevice,
          ip_address: ip,
          last_heartbeat: new Date().toISOString()
        }],
        correlationId: fallbackCorrelationId
      });
    } catch (topErr: any) {
      console.warn('[Presence Heartbeat Top Catch]', topErr?.message);
      return res.status(200).json({
        success: true,
        degraded: true,
        onlineCount: 1,
        users: []
      });
    }
  },

  async getOnlineUsers(req: any, res: any) {
    try {
      const client = await getPgClient();
      if (client) {
        try {
          if (Math.random() < 0.05) {
            await client.query("DELETE FROM user_presences WHERE last_heartbeat < NOW() - INTERVAL '90 seconds';").catch(() => {});
          }
          const activeRes = await client.query(`
            SELECT session_id, user_id, username, display_name, role, device_type, ip_address, last_heartbeat
            FROM user_presences
            WHERE last_heartbeat > NOW() - INTERVAL '90 seconds'
            ORDER BY last_heartbeat DESC;
          `);
          return res.status(200).json({
            success: true,
            onlineCount: Math.max(1, activeRes.rows.length),
            users: activeRes.rows
          });
        } catch (err: any) {
          console.warn('[Presence getOnlineUsers DB Query Notice]:', err?.message);
        }
      }
    } catch (_) {}

    return res.status(200).json({
      success: true,
      degraded: true,
      onlineCount: 1,
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
        return res.status(200).json({ success: true });
      } catch (err: any) {
      }
    }
    return res.status(200).json({ success: true });
  }
};
