import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { BotDetector } from '../../server/botDetector.ts';

const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://wjjelqsrivnyiybarfmo.supabase.co';
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supaUrl, supaKey || 'anon-key');

export function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         '127.0.0.1';
}

async function getPgClient(): Promise<Client | null> {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  try {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    return client;
  } catch (err) {
    console.warn('[Devices Controller PG Notice]:', err);
    return null;
  }
}

export const DevicesController = {
  async registerDevice(req: any, res: any) {
    const ip = getClientIp(req);
    const {
      deviceId,
      userId,
      username,
      deviceType,
      deviceModel,
      userAgent,
      isStandalone
    } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'Device ID is required' });
    }

    // Automated Bad Bot Detection
    const botAnalysis = BotDetector.analyze(req);
    const isBad = botAnalysis.isBadBot;
    const isVerified = botAnalysis.isVerifiedBot;
    const botType = isBad ? 'BAD_BOT' : (isVerified ? 'VERIFIED_BOT' : 'HUMAN');
    const installStatus = isBad ? 'BLOCKED' : 'ACTIVE';
    const blockReason = isBad ? botAnalysis.reason : null;

    const client = await getPgClient();
    if (client) {
      try {
        // 1. Check if device already registered
        const existing = await client.query(
          'SELECT * FROM device_installations WHERE device_id = $1 LIMIT 1;',
          [deviceId]
        );

        if (existing.rows && existing.rows.length > 0) {
          const row = existing.rows[0];
          if (row.install_status === 'BLOCKED' || isBad) {
            await client.query(`
              UPDATE device_installations
              SET last_active_at = NOW(), install_status = 'BLOCKED', bot_type = 'BAD_BOT', block_reason = COALESCE($1, block_reason)
              WHERE device_id = $2;
            `, [blockReason || 'Blocked by Automated Security', deviceId]);
            await client.end();
            return res.status(403).json({
              success: false,
              blocked: true,
              message: 'This device is blocked by Administrator / Automated Security.',
              reason: blockReason || row.block_reason
            });
          }

          const updateQuery = `
            UPDATE device_installations
            SET ip_address = $1,
                is_standalone = $2,
                last_active_at = NOW(),
                username = COALESCE(NULLIF($3, ''), username),
                user_id = COALESCE(NULLIF($4, ''), user_id),
                device_type = COALESCE(NULLIF($5, ''), device_type),
                device_model = COALESCE(NULLIF($6, ''), device_model),
                user_agent = COALESCE(NULLIF($7, ''), user_agent),
                bot_type = $9
            WHERE device_id = $8
            RETURNING *;
          `;
          const updated = await client.query(updateQuery, [
            ip,
            Boolean(isStandalone),
            username || null,
            userId || null,
            deviceType || null,
            deviceModel || null,
            userAgent || null,
            deviceId,
            botType
          ]);
          await client.end();
          return res.status(200).json({
            success: true,
            device: updated.rows[0],
            ip,
            isStandalone: Boolean(isStandalone)
          });
        }

        // 2. New Device Registration - Enforce Device Limit per Operator
        const cleanUser = (username || '').trim();
        const maxLimit = 2; // Default maximum authorized devices per operator

        if (isBad) {
          const inserted = await client.query(`
            INSERT INTO device_installations (
              device_id, user_id, username, ip_address, device_type, device_model, user_agent, is_standalone, install_status, bot_type, block_reason, max_devices_limit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BLOCKED', 'BAD_BOT', $9, 0)
            RETURNING *;
          `, [
            deviceId,
            userId || null,
            `[BAD BOT] ${cleanUser || botAnalysis.botName}`,
            ip,
            deviceType || 'Bad Bot / Scanner',
            deviceModel || botAnalysis.botName,
            userAgent || '',
            Boolean(isStandalone),
            blockReason
          ]);
          await client.end();
          return res.status(403).json({
            success: false,
            blocked: true,
            message: 'This device is blocked by Administrator / Automated Security.',
            reason: blockReason,
            device: inserted.rows[0]
          });
        }

        if (cleanUser && cleanUser !== 'Guest / Visitor' && cleanUser !== 'guest') {
          const userCountRes = await client.query(
            "SELECT COUNT(*) AS count FROM device_installations WHERE username = $1 AND install_status = 'ACTIVE';",
            [cleanUser]
          );
          const activeCount = parseInt(userCountRes.rows[0]?.count || '0', 10);
          if (activeCount >= maxLimit) {
            await client.end();
            return res.status(403).json({
              success: false,
              limitReached: true,
              message: `Device limit reached (${maxLimit} devices) for operator @${cleanUser}. Contact Administrator to authorize additional devices.`
            });
          }
        }

        // 3. Insert New Device
        const insertQuery = `
          INSERT INTO device_installations (
            device_id, user_id, username, ip_address, device_type, device_model, user_agent, is_standalone, install_status, bot_type, block_reason, max_devices_limit
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *;
        `;
        const inserted = await client.query(insertQuery, [
          deviceId,
          userId || null,
          cleanUser || 'Guest / Visitor',
          ip,
          deviceType || 'Unknown',
          deviceModel || 'Unknown Device',
          userAgent || '',
          Boolean(isStandalone),
          installStatus,
          botType,
          blockReason,
          maxLimit
        ]);
        await client.end();
        return res.status(201).json({
          success: true,
          device: inserted.rows[0],
          ip,
          isStandalone: Boolean(isStandalone)
        });

      } catch (err: any) {
        try { await client.end(); } catch (_) {}
        console.error('[Device Register Error]:', err);
        return res.status(500).json({ success: false, error: err?.message || 'Database error' });
      }
    }

    // Fallback to Supabase JS client
    try {
      const { data: existing } = await supabaseAdmin
        .from('device_installations')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (existing) {
        if (existing.install_status === 'BLOCKED' || isBad) {
          await supabaseAdmin
            .from('device_installations')
            .update({
              install_status: 'BLOCKED',
              bot_type: 'BAD_BOT',
              block_reason: blockReason || existing.block_reason || 'Blocked by Automated Security',
              last_active_at: new Date().toISOString()
            })
            .eq('device_id', deviceId);
          return res.status(403).json({ success: false, blocked: true, message: 'This device is blocked by Administrator / Automated Security.', reason: blockReason || existing.block_reason });
        }
        const { data: updated } = await supabaseAdmin
          .from('device_installations')
          .update({
            ip_address: ip,
            is_standalone: Boolean(isStandalone),
            last_active_at: new Date().toISOString(),
            username: username || existing.username,
            bot_type: botType
          })
          .eq('device_id', deviceId)
          .select()
          .single();

        return res.status(200).json({ success: true, device: updated, ip });
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('device_installations')
        .insert({
          device_id: deviceId,
          user_id: userId || null,
          username: isBad ? `[BAD BOT] ${username || botAnalysis.botName}` : (username || 'Guest / Visitor'),
          ip_address: ip,
          device_type: deviceType || (isBad ? 'Bad Bot / Scanner' : 'Unknown'),
          device_model: deviceModel || (isBad ? botAnalysis.botName : 'Unknown Device'),
          user_agent: userAgent || '',
          is_standalone: Boolean(isStandalone),
          install_status: installStatus,
          bot_type: botType,
          block_reason: blockReason,
          max_devices_limit: isBad ? 0 : 2
        })
        .select()
        .single();

      if (insErr) throw insErr;
      if (isBad) {
        return res.status(403).json({ success: false, blocked: true, message: 'This device is blocked by Administrator / Automated Security.', reason: blockReason, device: inserted });
      }
      return res.status(201).json({ success: true, device: inserted, ip });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Supabase error' });
    }
  },

  async listDevices(req: any, res: any) {
    const client = await getPgClient();
    if (client) {
      try {
        const result = await client.query(
          'SELECT * FROM device_installations ORDER BY last_active_at DESC LIMIT 100;'
        );
        await client.end();
        return res.status(200).json(result.rows || []);
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
      }
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('device_installations')
        .select('*')
        .order('last_active_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  },

  async getThreatLogs(req: any, res: any) {
    const ip = req.query.ip ? String(req.query.ip).trim() : '';
    const client = await getPgClient();
    if (client) {
      try {
        let result;
        if (ip) {
          result = await client.query(
            'SELECT * FROM security_threat_logs WHERE ip_address = $1 ORDER BY created_at DESC LIMIT 50;',
            [ip]
          );
        } else {
          result = await client.query(
            'SELECT * FROM security_threat_logs ORDER BY created_at DESC LIMIT 100;'
          );
        }
        await client.end();
        return res.status(200).json(result.rows || []);
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
      }
    }

    try {
      let query = supabaseAdmin
        .from('security_threat_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (ip) {
        query = query.eq('ip_address', ip);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  },

  async toggleDeviceStatus(req: any, res: any) {
    const { deviceId, status } = req.body || {};
    if (!deviceId || !['ACTIVE', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid deviceId or status' });
    }

    const client = await getPgClient();
    if (client) {
      try {
        const q = await client.query(
          'UPDATE device_installations SET install_status = $1 WHERE device_id = $2 RETURNING *;',
          [status, deviceId]
        );
        await client.end();
        const updatedDevice = q.rows[0];
        if (status === 'ACTIVE' && updatedDevice?.ip_address) {
          BotDetector.unbanIp(updatedDevice.ip_address);
        }
        return res.status(200).json({ success: true, device: updatedDevice });
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
      }
    }

    const { data, error } = await supabaseAdmin
      .from('device_installations')
      .update({ install_status: status })
      .eq('device_id', deviceId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (status === 'ACTIVE' && data?.ip_address) {
      BotDetector.unbanIp(data.ip_address);
    }
    return res.status(200).json({ success: true, device: data });
  },

  async updateDeviceLimit(req: any, res: any) {
    const { deviceId, maxLimit } = req.body || {};
    const limitNum = parseInt(maxLimit, 10);
    if (!deviceId || isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({ success: false, error: 'Invalid deviceId or maxLimit' });
    }

    const client = await getPgClient();
    if (client) {
      try {
        const q = await client.query(
          'UPDATE device_installations SET max_devices_limit = $1 WHERE device_id = $2 RETURNING *;',
          [limitNum, deviceId]
        );
        await client.end();
        return res.status(200).json({ success: true, device: q.rows[0] });
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
      }
    }

    const { data, error } = await supabaseAdmin
      .from('device_installations')
      .update({ max_devices_limit: limitNum })
      .eq('device_id', deviceId)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, device: data });
  },

  async deleteDevice(req: any, res: any) {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Device identifier required' });

    const client = await getPgClient();
    if (client) {
      try {
        await client.query(
          'DELETE FROM device_installations WHERE device_id = $1 OR id::text = $1;',
          [id]
        );
        await client.end();
        return res.status(200).json({ success: true });
      } catch (err: any) {
        try { await client.end(); } catch (_) {}
      }
    }

    const { error } = await supabaseAdmin
      .from('device_installations')
      .delete()
      .or(`device_id.eq.${id},id.eq.${id}`);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }
};
