import { createClient } from '@supabase/supabase-js';
import { BotDetector } from '../../server/botDetector.ts';
import { withDb } from '../../db/pgPool.ts';
import { lookupGeo } from '../../server/geoLookup.ts';

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
    const cleanUser = (username || '').trim();

    // Accurate GeoIP lookup
    const geo = await lookupGeo(ip, req);

    try {
      const result = await withDb(async (client) => {
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
              SET last_active_at = NOW(),
                  install_status = 'BLOCKED',
                  bot_type = 'BAD_BOT',
                  city = COALESCE(city, $1),
                  country = COALESCE(country, $2),
                  block_reason = COALESCE($3, block_reason)
              WHERE device_id = $4;
            `, [geo.city, geo.countryCode, blockReason || 'Blocked by Automated Security', deviceId]);
            return {
              blocked: true,
              message: 'This device is blocked by Administrator / Automated Security.',
              reason: blockReason || row.block_reason
            };
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
                bot_type = $9,
                city = COALESCE(city, $10),
                country = COALESCE(country, $11)
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
            botType,
            geo.city,
            geo.countryCode
          ]);
          return {
            success: true,
            device: updated.rows[0],
            ip,
            isStandalone: Boolean(isStandalone)
          };
        }

        // 2. New Device Registration - Enforce Device Limit per Operator
        const maxLimit = 2;

        if (isBad) {
          const inserted = await client.query(`
            INSERT INTO device_installations (
              device_id, user_id, username, ip_address, device_type, device_model, user_agent, is_standalone, install_status, bot_type, block_reason, max_devices_limit, city, country, last_active_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BLOCKED', 'BAD_BOT', $9, 0, $10, $11, NOW())
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
            blockReason,
            geo.city,
            geo.countryCode
          ]);
          return {
            blocked: true,
            message: 'This device is blocked by Administrator / Automated Security.',
            reason: blockReason,
            device: inserted.rows[0]
          };
        }

        if (cleanUser && cleanUser !== 'Guest / Visitor' && cleanUser !== 'guest') {
          const userCountRes = await client.query(
            "SELECT COUNT(*) AS count FROM device_installations WHERE username = $1 AND install_status = 'ACTIVE';",
            [cleanUser]
          );
          const activeCount = parseInt(userCountRes.rows[0]?.count || '0', 10);
          if (activeCount >= maxLimit) {
            return {
              limitReached: true,
              message: `Device limit reached (${maxLimit} devices) for operator @${cleanUser}. Contact Administrator to authorize additional devices.`
            };
          }
        }

        // 3. Idempotent Insert / Upsert Device
        const insertQuery = `
          INSERT INTO device_installations (
            device_id, user_id, username, ip_address, device_type, device_model, user_agent, is_standalone, install_status, bot_type, block_reason, max_devices_limit, city, country, last_active_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          ON CONFLICT (device_id) DO UPDATE SET
            last_active_at = NOW(),
            ip_address = EXCLUDED.ip_address,
            is_standalone = EXCLUDED.is_standalone,
            username = COALESCE(NULLIF(EXCLUDED.username, ''), device_installations.username),
            user_id = COALESCE(NULLIF(EXCLUDED.user_id, ''), device_installations.user_id),
            device_type = COALESCE(NULLIF(EXCLUDED.device_type, ''), device_installations.device_type),
            device_model = COALESCE(NULLIF(EXCLUDED.device_model, ''), device_installations.device_model),
            user_agent = COALESCE(NULLIF(EXCLUDED.user_agent, ''), device_installations.user_agent),
            bot_type = EXCLUDED.bot_type,
            city = COALESCE(device_installations.city, EXCLUDED.city),
            country = COALESCE(device_installations.country, EXCLUDED.country)
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
          maxLimit,
          geo.city,
          geo.countryCode
        ]);
        return {
          success: true,
          device: inserted.rows[0],
          ip,
          isStandalone: Boolean(isStandalone)
        };
      });

      if (result.blocked) {
        return res.status(403).json({ success: false, blocked: true, message: result.message, reason: result.reason, device: result.device });
      }
      if (result.limitReached) {
        return res.status(403).json({ success: false, limitReached: true, message: result.message });
      }
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[Device Register Error]', err?.message);
      // Supabase fallback
      try {
        const { data: inserted } = await supabaseAdmin
          .from('device_installations')
          .upsert({
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
            city: geo.city,
            country: geo.countryCode,
            max_devices_limit: isBad ? 0 : 2
          }, { onConflict: 'device_id' })
          .select()
          .single();

        return res.status(200).json({ success: true, device: inserted, ip });
      } catch (fbErr: any) {
        return res.status(200).json({
          success: true,
          degraded: true,
          device: {
            device_id: deviceId,
            user_id: userId || null,
            username: username || 'Guest / Visitor',
            ip_address: ip,
            city: geo.city,
            country: geo.countryCode,
            install_status: 'ACTIVE',
            bot_type: botType || 'HUMAN'
          },
          ip
        });
      }
    }
  },

  async getDeviceCounts(req: any, res: any) {
    try {
      const counts = await withDb(async (client) => {
        const countsRes = await client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE bot_type != 'BAD_BOT' AND user_id IS NOT NULL AND user_id != 'guest') as staff,
            COUNT(*) FILTER (WHERE bot_type = 'BAD_BOT' OR install_status = 'BLOCKED') as bad_bots,
            COUNT(*) FILTER (WHERE bot_type = 'VERIFIED_BOT') as verified_bots,
            COUNT(*) FILTER (WHERE bot_type = 'HUMAN' AND (user_id IS NULL OR user_id = 'guest')) as visitors
          FROM device_installations;
        `);
        const row = countsRes.rows[0] || {};
        return {
          total: Number(row.total || 0),
          staff: Number(row.staff || 0),
          badBots: Number(row.bad_bots || 0),
          verifiedBots: Number(row.verified_bots || 0),
          visitors: Number(row.visitors || 0)
        };
      });
      return res.status(200).json(counts);
    } catch (err: any) {
      console.warn('[getDeviceCounts Error, falling back to Supabase]:', err?.message);
      try {
        const [allRes, staffRes, badRes, verifiedRes, visitorRes] = await Promise.all([
          supabaseAdmin.from('device_installations').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('device_installations').select('id', { count: 'exact', head: true }).neq('bot_type', 'BAD_BOT').neq('username', 'Guest / Visitor').not('username', 'ilike', '[BAD BOT]%'),
          supabaseAdmin.from('device_installations').select('id', { count: 'exact', head: true }).or('bot_type.eq.BAD_BOT,install_status.eq.BLOCKED'),
          supabaseAdmin.from('device_installations').select('id', { count: 'exact', head: true }).eq('bot_type', 'VERIFIED_BOT'),
          supabaseAdmin.from('device_installations').select('id', { count: 'exact', head: true }).or('username.eq.Guest / Visitor,username.is.null').neq('bot_type', 'BAD_BOT').neq('bot_type', 'VERIFIED_BOT')
        ]);

        return res.status(200).json({
          total: allRes.count || 0,
          staff: staffRes.count || 0,
          badBots: badRes.count || 0,
          verifiedBots: verifiedRes.count || 0,
          visitors: visitorRes.count || 0
        });
      } catch (supaErr: any) {
        return res.status(500).json({ success: false, error: supaErr?.message });
      }
    }
  },

  async listDevices(req: any, res: any) {
    const isPaginated = req.query.page !== undefined || req.query.pageSize !== undefined;
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Math.floor(Number(req.query.pageSize) || 10)));
    const filterTab = String(req.query.filterTab || 'all').toLowerCase();
    const search = req.query.search ? String(req.query.search).trim() : '';
    const offset = (page - 1) * pageSize;

    try {
      const response = await withDb(async (client) => {
        if (!isPaginated) {
          const result = await client.query(
            'SELECT * FROM device_installations ORDER BY last_active_at DESC, id DESC LIMIT 100;'
          );
          // Enrich missing locations
          for (const row of result.rows) {
            if ((!row.city || row.city === 'Global' || !row.country || row.country === 'Global') && row.ip_address) {
              const g = await lookupGeo(row.ip_address);
              row.city = row.city && row.city !== 'Global' ? row.city : g.city;
              row.country = row.country && row.country !== 'Global' ? row.country : g.countryCode;
            }
          }
          return { data: result.rows || [], rawArray: true };
        }

        const whereClauses: string[] = ['1=1'];
        const params: any[] = [];
        let pIdx = 1;

        if (filterTab === 'operators') {
          whereClauses.push(`(bot_type != 'BAD_BOT' AND user_id IS NOT NULL AND user_id != 'guest')`);
        } else if (filterTab === 'bad_bots') {
          whereClauses.push(`(bot_type = 'BAD_BOT' OR install_status = 'BLOCKED')`);
        } else if (filterTab === 'verified_bots') {
          whereClauses.push(`bot_type = 'VERIFIED_BOT'`);
        } else if (filterTab === 'visitors') {
          whereClauses.push(`(bot_type = 'HUMAN' AND (user_id IS NULL OR user_id = 'guest'))`);
        }

        if (search) {
          whereClauses.push(`(ip_address ILIKE $${pIdx} OR username ILIKE $${pIdx} OR device_model ILIKE $${pIdx} OR device_type ILIKE $${pIdx})`);
          params.push(`%${search}%`);
          pIdx++;
        }

        const whereSql = whereClauses.join(' AND ');
        const countRes = await client.query(`SELECT COUNT(*) as total FROM device_installations WHERE ${whereSql};`, params);
        const total = Number(countRes.rows[0]?.total || 0);

        const dataRes = await client.query(`
          SELECT * FROM device_installations
          WHERE ${whereSql}
          ORDER BY last_active_at DESC, id DESC
          LIMIT $${pIdx} OFFSET $${pIdx + 1};
        `, [...params, pageSize, offset]);

        const rows = dataRes.rows || [];
        for (const row of rows) {
          if ((!row.city || row.city === 'Global' || !row.country || row.country === 'Global') && row.ip_address) {
            const g = await lookupGeo(row.ip_address);
            row.city = row.city && row.city !== 'Global' ? row.city : g.city;
            row.country = row.country && row.country !== 'Global' ? row.country : g.countryCode;
          }
        }

        return {
          data: rows,
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
          rawArray: false
        };
      });

      if (response.rawArray) {
        return res.status(200).json(response.data);
      }
      return res.status(200).json(response);
    } catch (err: any) {
      console.warn('[listDevices Error, falling back to Supabase]:', err?.message);
      try {
        if (!isPaginated) {
          const { data } = await supabaseAdmin
            .from('device_installations')
            .select('*')
            .order('last_active_at', { ascending: false })
            .limit(100);
          return res.status(200).json(data || []);
        }

        let query = supabaseAdmin.from('device_installations').select('*', { count: 'exact' });
        if (filterTab === 'operators') {
          query = query.neq('bot_type', 'BAD_BOT').neq('user_id', 'guest').not('user_id', 'is', null);
        } else if (filterTab === 'bad_bots') {
          query = query.or('bot_type.eq.BAD_BOT,install_status.eq.BLOCKED');
        } else if (filterTab === 'verified_bots') {
          query = query.eq('bot_type', 'VERIFIED_BOT');
        } else if (filterTab === 'visitors') {
          query = query.eq('bot_type', 'HUMAN').or('user_id.is.null,user_id.eq.guest');
        }

        if (search) {
          query = query.or(`ip_address.ilike.%${search}%,username.ilike.%${search}%,device_model.ilike.%${search}%,device_type.ilike.%${search}%`);
        }

        query = query
          .order('last_active_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const total = count || 0;
        return res.status(200).json({
          data: data || [],
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize))
        });
      } catch (supaErr: any) {
        return res.status(500).json({ success: false, error: supaErr?.message });
      }
    }
  },

  async getThreatLogs(req: any, res: any) {
    const ip = req.query.ip ? String(req.query.ip).trim() : '';
    try {
      const logs = await withDb(async (client) => {
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
        return result.rows || [];
      });
      return res.status(200).json(logs);
    } catch (err: any) {
      console.warn('[getThreatLogs Error, falling back to Supabase]:', err?.message);
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
      } catch (supaErr: any) {
        return res.status(500).json({ success: false, error: supaErr?.message });
      }
    }
  },

  async toggleDeviceStatus(req: any, res: any) {
    const { deviceId, status, ipAddress } = req.body || {};
    const normStatus = String(status || '').toUpperCase();
    if (!deviceId || !['ACTIVE', 'BLOCKED'].includes(normStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid deviceId or status' });
    }

    const isUnblock = normStatus === 'ACTIVE';
    const targetIp = (ipAddress || '').trim();

    try {
      const updatedDevice = await withDb(async (client) => {
        let updated: any = null;

        if (isUnblock) {
          // 1. Restore device installation
          const q = await client.query(`
            UPDATE device_installations
            SET install_status = 'active',
                bot_type = 'HUMAN',
                block_reason = NULL,
                last_active_at = NOW()
            WHERE device_id = $1 OR ($2::text != '' AND ip_address = $2)
            RETURNING *;
          `, [deviceId, targetIp]);
          updated = q.rows[0];

          // 2. Prune security_threat_logs for this device's IP so it no longer appears as quarantined
          const resolvedIp = targetIp || updated?.ip_address || (deviceId.includes('.') ? deviceId : null);
          if (resolvedIp) {
            await client.query('DELETE FROM security_threat_logs WHERE ip_address = $1;', [resolvedIp]);
            // In-memory unban
            BotDetector.unbanIp(resolvedIp);
          }
        } else {
          // Block device
          const q = await client.query(`
            UPDATE device_installations
            SET install_status = 'BLOCKED',
                bot_type = 'BAD_BOT',
                block_reason = 'Blocked by Administrator',
                last_active_at = NOW()
            WHERE device_id = $1 OR ($2::text != '' AND ip_address = $2)
            RETURNING *;
          `, [deviceId, targetIp]);
          updated = q.rows[0];
        }

        return updated;
      });

      // Also unban in-memory for targetIp
      if (isUnblock && targetIp) {
        BotDetector.unbanIp(targetIp);
      }

      return res.status(200).json({ success: true, device: updatedDevice });
    } catch (err: any) {
      console.error('[toggleDeviceStatus Error]:', err?.message);
      // Supabase fallback
      try {
        const updatePayload = isUnblock
          ? { install_status: 'active', bot_type: 'HUMAN', block_reason: null }
          : { install_status: 'BLOCKED', bot_type: 'BAD_BOT', block_reason: 'Blocked by Administrator' };

        const { data } = await supabaseAdmin
          .from('device_installations')
          .update(updatePayload)
          .eq('device_id', deviceId)
          .select()
          .single();

        if (isUnblock) {
          const ipToUnban = targetIp || data?.ip_address;
          if (ipToUnban) {
            BotDetector.unbanIp(ipToUnban);
            await supabaseAdmin.from('security_threat_logs').delete().eq('ip_address', ipToUnban);
          }
        }

        return res.status(200).json({ success: true, device: data });
      } catch (fbErr: any) {
        return res.status(500).json({ success: false, error: fbErr?.message });
      }
    }
  },

  async unblockIp(req: any, res: any) {
    const ip = String(req.body?.ip || req.query?.ip || '').trim();
    if (!ip) {
      return res.status(400).json({ success: false, error: 'IP address is required' });
    }

    try {
      // 1. Unban in-memory immediately
      BotDetector.unbanIp(ip);

      // 2. Unban in PostgreSQL & prune threat logs
      await withDb(async (client) => {
        await client.query(`
          UPDATE device_installations
          SET install_status = 'active',
              bot_type = 'HUMAN',
              block_reason = NULL,
              last_active_at = NOW()
          WHERE ip_address = $1;
        `, [ip]);

        await client.query('DELETE FROM security_threat_logs WHERE ip_address = $1;', [ip]);
      });

      // 3. Fallback prune on Supabase
      try {
        await supabaseAdmin.from('security_threat_logs').delete().eq('ip_address', ip);
        await supabaseAdmin.from('device_installations')
          .update({ install_status: 'active', bot_type: 'HUMAN', block_reason: null })
          .eq('ip_address', ip);
      } catch (_) {}

      return res.status(200).json({
        success: true,
        message: `Host IP "${ip}" unblocked and restored to ACTIVE across Security Sentinel.`,
        ip
      });
    } catch (err: any) {
      console.error('[unblockIp Error]:', err?.message);
      return res.status(500).json({ success: false, error: err?.message });
    }
  },

  async updateDeviceLimit(req: any, res: any) {
    const { deviceId, maxLimit } = req.body || {};
    const limitNum = parseInt(maxLimit, 10);
    if (!deviceId || isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({ success: false, error: 'Invalid deviceId or maxLimit' });
    }

    try {
      const updated = await withDb(async (client) => {
        const q = await client.query(
          'UPDATE device_installations SET max_devices_limit = $1 WHERE device_id = $2 RETURNING *;',
          [limitNum, deviceId]
        );
        return q.rows[0];
      });
      return res.status(200).json({ success: true, device: updated });
    } catch (err: any) {
      try {
        const { data, error } = await supabaseAdmin
          .from('device_installations')
          .update({ max_devices_limit: limitNum })
          .eq('device_id', deviceId)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ success: true, device: data });
      } catch (fbErr: any) {
        return res.status(500).json({ success: false, error: fbErr?.message });
      }
    }
  },

  async deleteDevice(req: any, res: any) {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Device identifier required' });

    try {
      await withDb(async (client) => {
        // Fetch IP first to clean up related threat records & unban
        const existing = await client.query(
          'SELECT ip_address FROM device_installations WHERE device_id = $1 OR id::text = $1 LIMIT 1;',
          [id]
        );
        const targetIp = existing.rows[0]?.ip_address;

        await client.query(
          'DELETE FROM device_installations WHERE device_id = $1 OR id::text = $1;',
          [id]
        );

        if (targetIp) {
          await client.query('DELETE FROM security_threat_logs WHERE ip_address = $1;', [targetIp]);
          BotDetector.unbanIp(targetIp);
        }
      });

      try {
        await supabaseAdmin
          .from('device_installations')
          .delete()
          .or(`device_id.eq.${id},id.eq.${id}`);
      } catch (_) {}

      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message });
    }
  }
};
