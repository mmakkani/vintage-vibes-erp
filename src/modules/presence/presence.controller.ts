import { Client } from 'pg';
import { getClientIp } from '../devices/devices.controller.ts';

async function getPgClient(): Promise<Client | null> {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  try {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return client;
  } catch (err) {
    console.warn('[Presence PG Notice]:', err);
    return null;
  }
}

export const PresenceController = {
  async heartbeat(req: any, res: any) {
    const ip = getClientIp(req);
    const { sessionId, userId, username, displayName, role, deviceType } = req.body || {};

    if (!sessionId || !username) {
      return res.status(400).json({ success: false, error: 'Session ID and Username required' });
    }

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
          sessionId,
          userId || null,
          username,
          displayName || username,
          role || 'OPERATOR',
          deviceType || 'Web Client',
          ip
        ]);

        // Clean up stale sessions (> 45s)
        await client.query("DELETE FROM user_presences WHERE last_heartbeat < NOW() - INTERVAL '45 seconds';");

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
        console.error('[Presence Heartbeat Error]:', err);
        return res.status(500).json({ success: false, error: err?.message });
      }
    }

    return res.status(200).json({ success: true, onlineCount: 1, users: [] });
  },

  async getOnlineUsers(req: any, res: any) {
    const client = await getPgClient();
    if (client) {
      try {
        await client.query("DELETE FROM user_presences WHERE last_heartbeat < NOW() - INTERVAL '45 seconds';");
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
        return res.status(500).json({ success: false, error: err?.message });
      }
    }
    return res.status(200).json({ success: true, onlineCount: 1, users: [] });
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
