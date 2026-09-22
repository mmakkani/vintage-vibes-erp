import { Router } from 'express';
import { SetupController } from './setup.controller.ts';
import { CompanyProfileService } from '../../services/companyProfileService.ts';
import { SetupService } from '../../services/setupService.ts';
import { supabase } from '../../supabaseClient.ts';
import { getPgClient, withDb } from '../../db/pgPool.ts';

export const setupRouter = Router();

// Company profile (supports both /company and /company-profile)
setupRouter.get(['/company', '/company-profile'], async (req, res) => {
  try {
    const data = await CompanyProfileService.getCompanyProfile();
    return res.json(data);
  } catch (_) {
    return res.json(SetupController.getCompanyProfile());
  }
});

setupRouter.put(['/company', '/company-profile'], async (req, res) => {
  try {
    const updated = await CompanyProfileService.updateCompanyProfile(req.body);
    return res.json(updated);
  } catch (_) {
    return res.json(SetupController.updateCompanyProfile(req.body));
  }
});

// Live Streaming Multicast Gateway (Restream / Livepush / Ingest Key)
setupRouter.get('/live-multicast', async (req, res) => {
  const client = await getPgClient();
  if (client) {
    try {
      const q = await client.query("SELECT * FROM live_stream_multicast_config WHERE id = 'default' LIMIT 1;");
      await client.end();
      if (q.rows.length > 0) {
        const r = q.rows[0];
        return res.json({
          success: true,
          data: {
            provider: r.provider || 'RESTREAM',
            enabled: Boolean(r.enabled),
            accountEmail: r.account_email || 'live@vintagevibe.ae',
            accountPassword: r.account_password || '',
            apiKey: r.api_key || '',
            masterIngestRtmpUrl: r.master_ingest_rtmp_url || 'rtmp://live.restream.io/live',
            backupServerUrl: r.backup_server_url || 'rtmp://live-backup.restream.io/live',
            masterStreamKey: r.master_stream_key || 're_live_sec_10482_vv_dxb_773',
            autoRelayToTikTok: Boolean(r.auto_relay_to_tiktok),
            autoRelayToInstagram: Boolean(r.auto_relay_to_instagram),
            autoRelayToFacebook: Boolean(r.auto_relay_to_facebook),
            autoRelayToYouTube: Boolean(r.auto_relay_to_youtube),
            tikTokStreamKey: r.tiktok_stream_key || '',
            instagramStreamKey: r.instagram_stream_key || '',
            facebookStreamKey: r.facebook_stream_key || '',
            youTubeStreamKey: r.youtube_stream_key || '',
            status: r.status || 'CONNECTED',
            lastSyncedAt: r.last_synced_at
          }
        });
      }
    } catch (_) {
      try { await client.end(); } catch (_) {}
    }
  }

  try {
    const data = await SetupService.getLiveMulticastConfig();
    return res.json({ success: true, data });
  } catch (_) {
    return res.json({ success: true, data: SetupController.getLiveMulticastConfig() });
  }
});

setupRouter.put('/live-multicast', async (req, res) => {
  const cfg = req.body || {};
  const client = await getPgClient();
  if (client) {
    try {
      await client.query(`
        INSERT INTO live_stream_multicast_config (
          id, provider, enabled, account_email, account_password, api_key,
          master_ingest_rtmp_url, backup_server_url, master_stream_key,
          auto_relay_to_tiktok, auto_relay_to_instagram, auto_relay_to_facebook, auto_relay_to_youtube,
          tiktok_stream_key, instagram_stream_key, facebook_stream_key, youtube_stream_key,
          status, last_synced_at, updated_at
        ) VALUES (
          'default', $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, NOW(), NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          provider = EXCLUDED.provider,
          enabled = EXCLUDED.enabled,
          account_email = EXCLUDED.account_email,
          account_password = COALESCE(EXCLUDED.account_password, live_stream_multicast_config.account_password),
          api_key = COALESCE(EXCLUDED.api_key, live_stream_multicast_config.api_key),
          master_ingest_rtmp_url = EXCLUDED.master_ingest_rtmp_url,
          backup_server_url = EXCLUDED.backup_server_url,
          master_stream_key = EXCLUDED.master_stream_key,
          auto_relay_to_tiktok = EXCLUDED.auto_relay_to_tiktok,
          auto_relay_to_instagram = EXCLUDED.auto_relay_to_instagram,
          auto_relay_to_facebook = EXCLUDED.auto_relay_to_facebook,
          auto_relay_to_youtube = EXCLUDED.auto_relay_to_youtube,
          tiktok_stream_key = EXCLUDED.tiktok_stream_key,
          instagram_stream_key = EXCLUDED.instagram_stream_key,
          facebook_stream_key = EXCLUDED.facebook_stream_key,
          youtube_stream_key = EXCLUDED.youtube_stream_key,
          status = EXCLUDED.status,
          last_synced_at = NOW(),
          updated_at = NOW();
      `, [
        cfg.provider || 'RESTREAM',
        cfg.enabled !== false,
        cfg.accountEmail || '',
        cfg.accountPassword || '',
        cfg.apiKey || '',
        cfg.masterIngestRtmpUrl || 'rtmp://live.restream.io/live',
        cfg.backupServerUrl || 'rtmp://live-backup.restream.io/live',
        cfg.masterStreamKey || '',
        cfg.autoRelayToTikTok !== false,
        cfg.autoRelayToInstagram !== false,
        cfg.autoRelayToFacebook !== false,
        cfg.autoRelayToYouTube !== false,
        cfg.tikTokStreamKey || '',
        cfg.instagramStreamKey || '',
        cfg.facebookStreamKey || '',
        cfg.youTubeStreamKey || '',
        cfg.status || 'CONNECTED'
      ]);
      await client.end();
    } catch (_) {
      try { await client.end(); } catch (_) {}
    }
  }

  try {
    const data = await SetupService.updateLiveMulticastConfig(req.body);
    SetupController.updateLiveMulticastConfig(req.body);
    return res.json({ success: true, data });
  } catch (_) {
    return res.json({ success: true, data: SetupController.updateLiveMulticastConfig(req.body) });
  }
});

// Multi-Booth Live Stream Relays: Full PostgreSQL CRUD (/api/setup/live-booths)
setupRouter.get('/live-booths', async (req, res) => {
  const client = await getPgClient();
  if (client) {
    try {
      const boothsQ = await client.query("SELECT * FROM live_stream_booths ORDER BY booth_id ASC;");
      const channelsQ = await client.query("SELECT * FROM booth_social_channels;");
      await client.end();

      const channelsByBooth = new Map<string, any[]>();
      for (const ch of channelsQ.rows) {
        const list = channelsByBooth.get(ch.booth_id) || [];
        list.push(ch);
        channelsByBooth.set(ch.booth_id, list);
      }

      const booths = boothsQ.rows.map(r => {
        const chs = channelsByBooth.get(r.booth_id) || [];
        const activePlatforms = chs.filter(c => c.is_active).map(c => c.platform);
        const ttCh = chs.find(c => c.platform === 'tiktok');
        const igCh = chs.find(c => c.platform === 'instagram');
        const fbCh = chs.find(c => c.platform === 'facebook');
        const ytCh = chs.find(c => c.platform === 'youtube');
        const thCh = chs.find(c => c.platform === 'threads');

        return {
          boothId: r.booth_id,
          boothName: r.booth_name,
          category: r.category || 'Vintage Goods',
          hostName: r.host_name || 'Broadcaster Host',
          hostHandle: r.host_handle || ttCh?.account_username || `@host_${r.booth_id}`,
          accountEmail: r.account_email || '',
          provider: r.provider || 'RESTREAM',
          enabled: Boolean(r.enabled),
          masterIngestRtmpUrl: r.master_ingest_rtmp_url || 'rtmp://live.restream.io/live',
          backupServerUrl: r.backup_server_url || 'rtmp://live-backup.restream.io/live',
          masterStreamKey: r.master_stream_key || '',
          activePlatforms: activePlatforms.length > 0 ? activePlatforms : ['tiktok', 'instagram', 'facebook', 'youtube', 'threads'],
          autoRelayToTikTok: Boolean(r.auto_relay_to_tiktok),
          autoRelayToInstagram: Boolean(r.auto_relay_to_instagram),
          autoRelayToFacebook: Boolean(r.auto_relay_to_facebook),
          autoRelayToYouTube: Boolean(r.auto_relay_to_youtube),
          autoRelayToThreads: Boolean(r.auto_relay_to_threads),
          tiktokAccountHandle: ttCh?.account_username || r.tiktok_stream_key || '',
          instagramAccountHandle: igCh?.account_username || '',
          facebookAccountHandle: fbCh?.account_username || '',
          youTubeAccountHandle: ytCh?.account_username || '',
          threadsAccountHandle: thCh?.account_username || r.threads_account_handle || '',
          tiktokStreamKey: r.tiktok_stream_key || '',
          instagramStreamKey: r.instagram_stream_key || '',
          facebookStreamKey: r.facebook_stream_key || '',
          youtubeStreamKey: r.youtube_stream_key || '',
          threadsStreamKey: r.threads_stream_key || '',
          status: r.status || 'STANDBY',
          socialChannels: chs
        };
      });

      return res.status(200).json({ success: true, booths });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Fallback to Supabase client
  try {
    const { data, error } = await supabase.from('live_stream_booths').select('*').order('booth_id');
    if (!error && Array.isArray(data)) {
      return res.json({ success: true, booths: data });
    }
  } catch (_) {}
  return res.json({ success: true, booths: [] });
});

setupRouter.get('/live-booths/:boothId', async (req, res) => {
  const targetId = req.params.boothId;
  const client = await getPgClient();
  if (client) {
    try {
      const q = await client.query("SELECT * FROM live_stream_booths WHERE booth_id = $1 LIMIT 1;", [targetId]);
      await client.end();
      if (q.rows.length > 0) return res.json({ success: true, booth: q.rows[0] });
      return res.status(404).json({ success: false, error: 'Booth not found' });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  return res.status(404).json({ success: false, error: 'Database unavailable' });
});

// Create new live booth in PostgreSQL
setupRouter.post('/live-booths', async (req, res) => {
  const b = req.body || {};
  let boothId = b.boothId ? String(b.boothId).trim().toLowerCase() : '';
  const client = await getPgClient();

  if (client) {
    try {
      if (!boothId) {
        const countQ = await client.query("SELECT COUNT(*) FROM live_stream_booths;");
        const nextNum = (parseInt(countQ.rows[0].count, 10) || 0) + 1;
        boothId = `booth-${nextNum}`;
      }

      const boothName = b.boothName || `Booth ${boothId.replace(/^booth[-_]?0*/i, '')}: Live Auction`;
      const category = b.category || 'Vintage Apparel';
      const hostName = b.hostName || 'Broadcaster Host';
      const hostHandle = b.hostHandle || `@host_${boothId.replace('-', '')}`;
      const accountEmail = b.accountEmail || `${boothId.replace('-', '')}@vintagevibe.ae`;
      const activePlatforms: string[] = Array.isArray(b.activePlatforms) && b.activePlatforms.length > 0
        ? b.activePlatforms
        : ['tiktok', 'instagram', 'facebook', 'youtube', 'threads'];

      await client.query(`
        INSERT INTO live_stream_booths (
          booth_id, booth_name, category, host_name, host_handle, account_email, provider, enabled,
          auto_relay_to_tiktok, auto_relay_to_instagram, auto_relay_to_facebook, auto_relay_to_youtube, auto_relay_to_threads,
          threads_account_handle, threads_stream_key, master_ingest_rtmp_url, backup_server_url, master_stream_key, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'RESTREAM', true,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, 'STANDBY', NOW(), NOW()
        ) ON CONFLICT (booth_id) DO UPDATE SET
          booth_name = EXCLUDED.booth_name,
          category = EXCLUDED.category,
          host_name = EXCLUDED.host_name,
          host_handle = EXCLUDED.host_handle,
          account_email = EXCLUDED.account_email,
          backup_server_url = EXCLUDED.backup_server_url,
          master_stream_key = EXCLUDED.master_stream_key,
          updated_at = NOW();
      `, [
        boothId, boothName, category, hostName, hostHandle, accountEmail,
        activePlatforms.includes('tiktok'), activePlatforms.includes('instagram'),
        activePlatforms.includes('facebook'), activePlatforms.includes('youtube'),
        activePlatforms.includes('threads'),
        b.threadsAccountHandle || `@${boothId.replace('-', '')}_threads`,
        b.threadsStreamKey || '',
        b.masterIngestRtmpUrl || 'rtmp://live.restream.io/live',
        b.backupServerUrl || 'rtmp://live-backup.restream.io/live',
        b.masterStreamKey || `stream_key_${boothId}`,
      ]);

      await client.query(`
        INSERT INTO live_booth_metrics (
          booth_id, booth_name, host_name, category, is_broadcasting, viewer_count, items_claimed,
          net_revenue_aed, items_sold_per_min, conversion_rate_pct, stream_health, updated_at
        ) VALUES (
          $1, $2, $3, $4, false, 0, 0, 0, 0, 0, 'OFFLINE', NOW()
        ) ON CONFLICT (booth_id) DO UPDATE SET
          booth_name = EXCLUDED.booth_name,
          host_name = EXCLUDED.host_name,
          category = EXCLUDED.category,
          updated_at = NOW();
      `, [boothId, boothName, hostName, category]);

      const legacyId = `booth_${boothId.replace(/^booth[-_]?0*/i, '').padStart(2, '0')}`;
      try {
        await client.query(`
          INSERT INTO live_booths (id, booth_name, host_operator_name, is_broadcasting, viewer_count, camera_source, current_deal_price, updated_at)
          VALUES ($1, $2, $3, false, 0, 'Webcam / OBS', 0, NOW())
          ON CONFLICT (id) DO UPDATE SET
            booth_name = EXCLUDED.booth_name,
            host_operator_name = EXCLUDED.host_operator_name,
            updated_at = NOW();
        `, [legacyId, boothName, hostName]);
      } catch (_) {}

      const allPlats = ['tiktok', 'instagram', 'facebook', 'youtube', 'threads', 'custom'];
      for (const plat of allPlats) {
        const isActive = activePlatforms.includes(plat);
        const platHandle = plat === 'tiktok' ? (b.tiktokAccountHandle || `@${boothId.replace('-', '')}_tt`) :
                           plat === 'instagram' ? (b.instagramAccountHandle || `@${boothId.replace('-', '')}_ig`) :
                           plat === 'facebook' ? (b.facebookAccountHandle || `Vintage Vibes Floor ${boothId.replace('booth-', '')}`) :
                           plat === 'youtube' ? (b.youTubeAccountHandle || `Vintage Vibes Studio ${boothId.replace('booth-', '')}`) :
                           plat === 'threads' ? (b.threadsAccountHandle || `@${boothId.replace('-', '')}_threads`) :
                           `@${boothId.replace('-', '')}_custom`;

        await client.query(`
          INSERT INTO booth_social_channels (id, booth_id, platform, account_username, auth_status, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'IDLE', $5, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            account_username = COALESCE(EXCLUDED.account_username, booth_social_channels.account_username),
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
        `, [`${boothId}_${plat}`, boothId, plat, platHandle, isActive]);
      }

      await client.end();
      return res.status(201).json({
        success: true,
        booth: {
          boothId,
          boothName,
          category,
          hostName,
          hostHandle,
          accountEmail,
          activePlatforms,
          enabled: true
        }
      });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(500).json({ success: false, error: 'Database connection unavailable' });
});

// Update live booth in PostgreSQL
setupRouter.put('/live-booths/:boothId', async (req, res) => {
  const targetId = req.params.boothId;
  const b = req.body || {};
  const client = await getPgClient();

  const getAliases = (bid: string): string[] => {
    const m = String(bid).match(/^booth[-_]?0*(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const p = n < 10 ? `0${n}` : `${n}`;
      return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
    }
    return [String(bid)];
  };
  const aliases = getAliases(targetId);

  if (client) {
    try {
      await client.query(`
        UPDATE live_stream_booths SET
          booth_name = COALESCE($2, booth_name),
          category = COALESCE($3, category),
          host_name = COALESCE($4, host_name),
          host_handle = COALESCE($5, host_handle),
          account_email = COALESCE($6, account_email),
          master_ingest_rtmp_url = COALESCE($7, master_ingest_rtmp_url),
          backup_server_url = COALESCE($8, backup_server_url),
          master_stream_key = COALESCE($9, master_stream_key),
          auto_relay_to_tiktok = COALESCE($10, auto_relay_to_tiktok),
          auto_relay_to_instagram = COALESCE($11, auto_relay_to_instagram),
          auto_relay_to_facebook = COALESCE($12, auto_relay_to_facebook),
          auto_relay_to_youtube = COALESCE($13, auto_relay_to_youtube),
          auto_relay_to_threads = COALESCE($14, auto_relay_to_threads),
          tiktok_stream_key = COALESCE($15, tiktok_stream_key),
          instagram_stream_key = COALESCE($16, instagram_stream_key),
          facebook_stream_key = COALESCE($17, facebook_stream_key),
          youtube_stream_key = COALESCE($18, youtube_stream_key),
          threads_stream_key = COALESCE($19, threads_stream_key),
          threads_account_handle = COALESCE($20, threads_account_handle),
          enabled = COALESCE($21, enabled),
          updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [
        aliases, b.boothName, b.category, b.hostName, b.hostHandle,
        b.accountEmail, b.masterIngestRtmpUrl, b.backupServerUrl, b.masterStreamKey,
        b.autoRelayToTikTok, b.autoRelayToInstagram, b.autoRelayToFacebook, b.autoRelayToYouTube, b.autoRelayToThreads,
        b.tiktokStreamKey, b.instagramStreamKey, b.facebookStreamKey, b.youtubeStreamKey, b.threadsStreamKey,
        b.threadsAccountHandle, b.enabled
      ]);

      await client.query(`
        UPDATE live_booth_metrics SET
          booth_name = COALESCE($2, booth_name),
          host_name = COALESCE($3, host_name),
          category = COALESCE($4, category),
          updated_at = NOW()
        WHERE booth_id = ANY($1::text[]);
      `, [aliases, b.boothName, b.hostName, b.category]);

      if (Array.isArray(b.activePlatforms)) {
        const allPlats = ['tiktok', 'instagram', 'facebook', 'youtube', 'threads', 'custom'];
        for (const plat of allPlats) {
          const isActive = b.activePlatforms.includes(plat);
          const platHandle = plat === 'tiktok' ? b.tiktokAccountHandle :
                             plat === 'instagram' ? b.instagramAccountHandle :
                             plat === 'facebook' ? b.facebookAccountHandle :
                             plat === 'youtube' ? b.youTubeAccountHandle :
                             plat === 'threads' ? b.threadsAccountHandle : undefined;
          await client.query(`
            INSERT INTO booth_social_channels (id, booth_id, platform, account_username, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (id) DO UPDATE SET
              account_username = COALESCE(EXCLUDED.account_username, booth_social_channels.account_username),
              is_active = EXCLUDED.is_active,
              updated_at = NOW();
          `, [`${targetId}_${plat}`, targetId, plat, platHandle, isActive]);
        }
      }

      await client.end();
      return res.status(200).json({ success: true, message: 'Booth updated successfully' });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(500).json({ success: false, error: 'Database connection unavailable' });
});

// Delete live booth permanently from PostgreSQL
setupRouter.delete('/live-booths/:boothId', async (req, res) => {
  const targetId = req.params.boothId;
  const client = await getPgClient();

  const getAliases = (bid: string): string[] => {
    const m = String(bid).match(/^booth[-_]?0*(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const p = n < 10 ? `0${n}` : `${n}`;
      return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
    }
    return [String(bid)];
  };
  const aliases = getAliases(targetId);

  if (client) {
    try {
      await client.query("DELETE FROM booth_social_channels WHERE booth_id = ANY($1::text[]);", [aliases]);
      await client.query("DELETE FROM live_booth_metrics WHERE booth_id = ANY($1::text[]);", [aliases]);
      await client.query("DELETE FROM live_stream_booths WHERE booth_id = ANY($1::text[]);", [aliases]);
      try {
        await client.query("DELETE FROM live_booths WHERE id = ANY($1::text[]);", [aliases]);
      } catch (_) {}
      await client.end();
      return res.status(200).json({ success: true, message: `Booth ${targetId} permanently deleted from SQL database` });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(500).json({ success: false, error: 'Database connection unavailable' });
});

// Currencies & FX (supports both /currencies and /currency)
setupRouter.get(['/currencies', '/currency'], async (req, res) => {
  try {
    const list = await SetupService.getCurrencies();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getCurrencies());
  }
});

setupRouter.post(['/currencies', '/currency'], async (req, res) => {
  try {
    const created = await SetupService.addCurrency(req.body);
    SetupController.addCurrency(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addCurrency(req.body));
  }
});

setupRouter.put('/currency', async (req, res) => {
  const { code, exchangeRate, rate } = req.body;
  const numRate = Number(exchangeRate ?? rate);
  try {
    await SetupService.updateCurrencyRate(code, numRate);
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  } catch (_) {
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  }
});

setupRouter.put('/currencies/:code', async (req, res) => {
  const { code } = req.params;
  const { rate, exchangeRate } = req.body;
  const numRate = Number(rate ?? exchangeRate);
  try {
    await SetupService.updateCurrencyRate(code, numRate);
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  } catch (_) {
    return res.json(SetupController.updateCurrencyRate(code, numRate));
  }
});

setupRouter.delete(['/currencies/:code', '/currency/:code'], async (req, res) => {
  const { code } = req.params;
  try {
    await SetupService.deleteCurrency(code);
    const success = SetupController.deleteCurrency(code);
    return res.json({ success });
  } catch (_) {
    const success = SetupController.deleteCurrency(code);
    return res.json({ success });
  }
});

setupRouter.get(['/items', '/item-master'], async (req, res) => {
  try {
    const list = await SetupService.getItems();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getItemMasters());
  }
});

setupRouter.post(['/items', '/item-master'], async (req, res) => {
  try {
    const created = await SetupService.addItem(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addItemMaster(req.body));
  }
});

setupRouter.put(['/items/:id', '/item-master/:id'], async (req, res) => {
  try {
    await SetupService.updateItem(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateItemMaster(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Item not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/items/:id', '/item-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteItem(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteItemMaster(req.params.id);
    return res.json({ success });
  }
});

setupRouter.post(['/items/:id/post', '/item-master/:id/post'], (req, res) => {
  const updated = SetupController.postItemMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Item not found' });
  return res.json(updated);
});

setupRouter.post(['/items/:id/unpost', '/item-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostItemMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Item not found' });
  return res.json(updated);
});

// Labels
setupRouter.get(['/labels', '/label-grade', '/labels-grade'], async (req, res) => {
  try {
    const list = await SetupService.getLabelGrades();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getLabelGrades());
  }
});

setupRouter.post(['/labels', '/label-grade', '/labels-grade'], async (req, res) => {
  try {
    const created = await SetupService.addLabelGrade(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addLabelGrade(req.body));
  }
});

setupRouter.put(['/labels/:id', '/label-grade/:id'], async (req, res) => {
  try {
    await SetupService.updateLabelGrade(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateLabelGrade(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Label grade not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/labels/:id', '/label-grade/:id'], async (req, res) => {
  try {
    await SetupService.deleteLabelGrade(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteLabelGrade(req.params.id);
    return res.json({ success });
  }
});

setupRouter.post(['/labels/:id/post', '/label-grade/:id/post'], (req, res) => {
  const updated = SetupController.postLabelGrade(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Label grade not found' });
  return res.json(updated);
});

setupRouter.post(['/labels/:id/unpost', '/label-grade/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostLabelGrade(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Label grade not found' });
  return res.json(updated);
});

// Brands
setupRouter.get(['/brands', '/brand-master'], async (req, res) => {
  try {
    const list = await SetupService.getBrands();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getBrandMasters());
  }
});

setupRouter.post(['/brands', '/brand-master'], async (req, res) => {
  try {
    const created = await SetupService.addBrand(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addBrandMaster(req.body));
  }
});

setupRouter.put(['/brands/:id', '/brand-master/:id'], async (req, res) => {
  try {
    await SetupService.updateBrand(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateBrandMaster(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/brands/:id', '/brand-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteBrand(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteBrandMaster(req.params.id);
    return res.json({ success });
  }
});

setupRouter.post(['/brands/:id/post', '/brand-master/:id/post'], (req, res) => {
  const updated = SetupController.postBrandMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
  return res.json(updated);
});

setupRouter.post(['/brands/:id/unpost', '/brand-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostBrandMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Brand tier not found' });
  return res.json(updated);
});

// Shops & Racks
setupRouter.get(['/shops', '/shop-master'], async (req, res) => {
  try {
    const list = await SetupService.getShops();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getShopMasters());
  }
});

setupRouter.post(['/shops', '/shop-master'], async (req, res) => {
  try {
    const created = await SetupService.addShop(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addShopMaster(req.body));
  }
});

setupRouter.put(['/shops/:id', '/shop-master/:id'], async (req, res) => {
  try {
    await SetupService.updateShop(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateShopMaster(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Shop not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/shops/:id', '/shop-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteShop(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteShopMaster(req.params.id);
    return res.json({ success });
  }
});

setupRouter.post(['/shops/:id/post', '/shop-master/:id/post'], (req, res) => {
  const updated = SetupController.postShopMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Shop not found' });
  return res.json(updated);
});

setupRouter.post(['/shops/:id/unpost', '/shop-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostShopMaster(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Shop not found' });
  return res.json(updated);
});

// Garment Categories
setupRouter.get(['/categories', '/category-master'], async (req, res) => {
  try {
    const list = await SetupService.getCategories();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getCategories());
  }
});

setupRouter.post(['/categories', '/category-master'], async (req, res) => {
  try {
    const created = await SetupService.addCategory(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addCategory(req.body));
  }
});

setupRouter.put(['/categories/:id', '/category-master/:id'], async (req, res) => {
  try {
    await SetupService.updateCategory(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateCategory(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/categories/:id', '/category-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteCategory(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteCategory(req.params.id);
    return res.json({ success });
  }
});

setupRouter.post(['/categories/:id/post', '/category-master/:id/post'], (req, res) => {
  const updated = SetupController.postCategory(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Category not found' });
  return res.json(updated);
});

setupRouter.post(['/categories/:id/unpost', '/category-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostCategory(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Category not found' });
  return res.json(updated);
});

// Garment Sizes
setupRouter.get(['/sizes', '/size-master'], async (req, res) => {
  try {
    const list = await SetupService.getSizes();
    return res.json(list);
  } catch (_) {
    return res.json(SetupController.getSizes());
  }
});

setupRouter.post(['/sizes', '/size-master'], async (req, res) => {
  try {
    const created = await SetupService.addSize(req.body);
    return res.json(created);
  } catch (_) {
    return res.json(SetupController.addSize(req.body));
  }
});

setupRouter.put(['/sizes/:id', '/size-master/:id'], async (req, res) => {
  try {
    await SetupService.updateSize(req.params.id, req.body);
    return res.json({ success: true, id: req.params.id, ...req.body });
  } catch (_) {
    const updated = SetupController.updateSize(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Size not found' });
    return res.json(updated);
  }
});

setupRouter.delete(['/sizes/:id', '/size-master/:id'], async (req, res) => {
  try {
    await SetupService.deleteSize(req.params.id);
    return res.json({ success: true });
  } catch (_) {
    const success = SetupController.deleteSize(req.params.id);
    return res.json({ success });
  }
});

setupRouter.post(['/sizes/:id/post', '/size-master/:id/post'], (req, res) => {
  const updated = SetupController.postSize(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Size not found' });
  return res.json(updated);
});

setupRouter.post(['/sizes/:id/unpost', '/size-master/:id/unpost'], (req, res) => {
  const updated = SetupController.unpostSize(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Size not found' });
  return res.json(updated);
});

setupRouter.get('/whatsapp-report', (req, res) => {
  return res.json(SetupController.getWhatsAppDailyReport());
});

// WhatsApp Dual-Engine Architecture Config (Baileys vs Meta Cloud API)
setupRouter.get('/whatsapp-config', async (req, res) => {
  try {
    const { data } = await supabase.from('whatsapp_gateway_config').select('config').eq('id', 'default').maybeSingle();
    if (data && data.config) {
      return res.json(data.config);
    }
  } catch (_) {}
  return res.json(SetupController.getWhatsAppConfig());
});

setupRouter.put('/whatsapp-config', async (req, res) => {
  const updated = SetupController.updateWhatsAppConfig(req.body);
  try {
    await supabase.from('whatsapp_gateway_config').upsert({
      id: 'default',
      config: updated,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Failed to sync whatsapp_gateway_config to Supabase:', e);
  }
  return res.json(updated);
});

// Thermal Barcode & QR Label Designer Settings
setupRouter.get('/thermal-config', async (req, res) => {
  try {
    const cfg = await SetupService.getThermalBarcodeConfig();
    if (cfg) return res.json({ success: true, data: cfg });
  } catch (_) {}
  return res.json({ success: true, data: null });
});

setupRouter.put('/thermal-config', async (req, res) => {
  try {
    await SetupService.updateThermalBarcodeConfig(req.body);
    return res.json({ success: true, data: req.body });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Security Master PIN (Encrypted / Admin PIN)
setupRouter.get('/master-pin', async (req, res) => {
  try {
    const pin = await SetupService.getMasterPin();
    return res.json({ success: true, pin });
  } catch (_) {
    return res.json({ success: true, pin: '9988' });
  }
});

setupRouter.put('/master-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || String(pin).trim().length < 4) {
    return res.status(400).json({ success: false, error: 'PIN must be at least 4 digits' });
  }
  try {
    await SetupService.updateMasterPin(String(pin).trim());
    return res.json({ success: true, pin: String(pin).trim() });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Google Gemini Vision / OCR API Key Config (SQL Persistent)
setupRouter.get('/gemini-key', async (req, res) => {
  try {
    const config = await withDb(async (client) => {
      const dbRes = await client.query(`
        SELECT id, api_key, model, status, updated_at
        FROM gemini_api_config
        WHERE id = 'default'
        LIMIT 1;
      `);
      if (dbRes.rows && dbRes.rows.length > 0 && dbRes.rows[0].api_key) {
        const row = dbRes.rows[0];
        return {
          success: true,
          configured: true,
          model: row.model || 'gemini-3.7-flash',
          status: row.status || 'ACTIVE',
          updatedAt: row.updated_at
        };
      }
      return null;
    });
    if (config) return res.json(config);
  } catch (dbErr: any) {
    console.warn('[Setup Routes] PG gemini-key select warning:', dbErr?.message);
  }

  // Fallback to env
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  return res.json({
    success: true,
    configured: Boolean(envKey),
    model: 'gemini-3.7-flash',
    status: envKey ? 'ACTIVE' : 'NOT_CONFIGURED',
    updatedAt: envKey ? new Date().toISOString() : null
  });
});

setupRouter.put('/gemini-key', async (req, res) => {
  const { apiKey, model } = req.body;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ success: false, error: 'API key must be at least 8 characters' });
  }
  const cleanKey = apiKey.trim();
  const selectedModel = (model || 'gemini-3.7-flash').trim();

  let savedRecord = null;
  try {
    savedRecord = await withDb(async (client) => {
      // Execute SQL UPSERT: INSERT ... ON CONFLICT (id) DO UPDATE ... RETURNING *
      const upsertResult = await client.query(`
        INSERT INTO gemini_api_config (id, api_key, model, status, updated_at)
        VALUES ('default', $1, $2, 'ACTIVE', NOW())
        ON CONFLICT (id) DO UPDATE
        SET api_key = EXCLUDED.api_key,
            model = COALESCE(EXCLUDED.model, gemini_api_config.model),
            status = 'ACTIVE',
            updated_at = NOW()
        RETURNING id, api_key, model, status, updated_at;
      `, [cleanKey, selectedModel]);

      return upsertResult.rows?.[0] || null;
    });
  } catch (err: any) {
    console.error('[Setup Routes] Failed to UPSERT into gemini_api_config:', err?.message);
  }

  // Update in-memory runtime environment variable for active node process
  process.env.GEMINI_API_KEY = cleanKey;

  if (savedRecord) {
    return res.json({
      success: true,
      configured: true,
      model: savedRecord.model || selectedModel,
      status: savedRecord.status || 'ACTIVE',
      updatedAt: savedRecord.updated_at || new Date().toISOString(),
      message: '✓ Gemini API Key successfully saved and persisted in PostgreSQL database (gemini_api_config)!'
    });
  }

  // Fallback if PG pooler was unreachable: try SetupService
  try {
    await SetupService.updateGeminiApiKey(cleanKey, selectedModel);
    return res.json({
      success: true,
      configured: true,
      model: selectedModel,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString(),
      message: '✓ Gemini API Key updated successfully.'
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message || 'Database error saving Gemini API key' });
  }
});

setupRouter.post('/gemini-key/test', async (req, res) => {
  let keyToTest = (req.body?.apiKey || '').trim();
  const selectedModel = (req.body?.model || 'gemini-3.6').trim();

  if (!keyToTest) {
    // Attempt to read from PostgreSQL database
    try {
      const dbKey = await withDb(async (client) => {
        const dbRes = await client.query(`SELECT api_key FROM gemini_api_config WHERE id = 'default' LIMIT 1;`);
        return dbRes.rows?.[0]?.api_key || null;
      });
      if (dbKey) {
        keyToTest = dbKey;
      }
    } catch {}
    if (!keyToTest) {
      keyToTest = (process.env.GEMINI_API_KEY || '').trim();
    }
  }

  if (!keyToTest || keyToTest.length < 8) {
    return res.status(400).json({ success: false, valid: false, error: 'No valid Gemini API key found to test.' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToTest)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        valid: false,
        error: `Google API rejected the key (${response.status}). Please verify the key in Google AI Studio.`
      });
    }
    const data = await response.json();
    return res.json({
      success: true,
      valid: true,
      model: selectedModel,
      message: `Successfully connected to Google Gemini AI! Available models: ${data.models?.length || 0}`
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, valid: false, error: 'Network error connecting to Google AI' });
  }
});

// Top-level Dashboard KPIs (Live Database Aggregations)
setupRouter.get('/dashboard-kpis', async (req, res) => {
  try {
    const kpis = await withDb(async (client) => {
      // 1. Payables Khata: Sum current_balance from chart_of_accounts where parent_code is 2110-00 or 2120-00
      const payablesRes = await client.query(`
        SELECT COALESCE(SUM(ABS(COALESCE(current_balance, 0))), 0) AS total_payables
        FROM chart_of_accounts
        WHERE parent_code IN ('2110-00', '2120-00')
           OR code LIKE '2110-%'
           OR code LIKE '2120-%';
      `);
      const payablesKhata = Number(payablesRes.rows[0]?.total_payables || 0);

      // 2. Receivables Khata: Sum current_balance from chart_of_accounts where parent_code is 1130-00
      const receivablesRes = await client.query(`
        SELECT COALESCE(SUM(ABS(COALESCE(current_balance, 0))), 0) AS total_receivables
        FROM chart_of_accounts
        WHERE parent_code = '1130-00'
           OR code LIKE '1130-%';
      `);
      const receivablesKhata = Number(receivablesRes.rows[0]?.total_receivables || 0);

      // 3. Inventory Value: Landed costs from inward_gate_passes (unopened) + inventory_pieces (sorted)
      const balesRes = await client.query(`
        SELECT 
          COUNT(*) as total_bales,
          COALESCE(SUM(COALESCE(total_bale_cost, cost_price, 0)), 0) AS total_bale_value
        FROM inward_gate_passes
        WHERE status != 'FULLY_SORTED' OR status IS NULL;
      `);
      const unopenedBalesValue = Number(balesRes.rows[0]?.total_bale_value || 0);
      const totalBalesInStock = Number(balesRes.rows[0]?.total_bales || 0);

      const piecesRes = await client.query(`
        SELECT 
          COUNT(*) as total_pieces,
          COALESCE(SUM(COALESCE(cost_price, estimated_price, retail_price_aed, 0)), 0) AS total_piece_value
        FROM inventory_pieces
        WHERE is_sold = false OR is_sold IS NULL;
      `);
      const sortedPiecesValue = Number(piecesRes.rows[0]?.total_piece_value || 0);
      const totalSortedPcs = Number(piecesRes.rows[0]?.total_pieces || 0);

      const totalInventoryValue = unopenedBalesValue + sortedPiecesValue;

      // 4. Month Revenue: Sum credits from journal_entries for current month
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      const startDateStr = startOfMonth.slice(0, 10);
      const endDateStr = endOfMonth.slice(0, 10);

      let monthRevenue = 0;
      try {
        const revenueRes = await client.query(`
          SELECT COALESCE(SUM(COALESCE(credit, 0)), 0) AS month_revenue
          FROM journal_entries
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz;
        `, [startOfMonth, endOfMonth]);
        monthRevenue = Number(revenueRes.rows[0]?.month_revenue || 0);
      } catch (e: any) {
        console.warn('[dashboard-kpis] journal_entries query notice:', e?.message);
      }

      if (monthRevenue === 0) {
        try {
          const salesRes = await client.query(`
            SELECT COALESCE(SUM(COALESCE(total_amount, 0)), 0) AS sales_revenue
            FROM sales_invoices
            WHERE invoice_date >= $1 AND invoice_date <= $2;
          `, [startDateStr, endDateStr]);
          monthRevenue = Number(salesRes.rows[0]?.sales_revenue || 0);
        } catch (e: any) {
          console.warn('[dashboard-kpis] sales_invoices query notice:', e?.message);
        }
      }

      const pendingVouchersRes = await client.query(`
        SELECT COUNT(*) as cnt FROM financial_vouchers WHERE status = 'DRAFT';
      `);
      const unpostedVouchersCount = Number(pendingVouchersRes.rows[0]?.cnt || 0);

      const pendingPassesRes = await client.query(`
        SELECT COUNT(*) as cnt FROM inward_gate_passes WHERE status = 'DRAFT' OR status = 'UNOPENED';
      `);
      const awaitingGatePassesCount = Number(pendingPassesRes.rows[0]?.cnt || 0);

      return {
        totalInventoryValue,
        totalInventoryCount: totalSortedPcs,
        totalBalesInStock,
        totalSortedPcs,
        monthRevenue,
        currentMonthRevenue: monthRevenue,
        currentMonthSubtotal: monthRevenue,
        currentMonthVat: 0,
        openReceivables: receivablesKhata,
        receivablesKhataAED: receivablesKhata,
        payablesKhataAED: payablesKhata,
        totalPurchasesAmount: payablesKhata,
        netWorkingCapitalAED: totalInventoryValue + receivablesKhata - payablesKhata,
        unpostedVouchersCount,
        awaitingGatePassesCount,
        pendingActionTotal: unpostedVouchersCount + awaitingGatePassesCount,
        activeStaffCount: 1
      };
    });

    if (kpis) {
      return res.json(kpis);
    }
  } catch (err: any) {
    console.warn('[dashboard-kpis] withDb query notice:', err?.message);
  }
  return res.json(SetupController.getDashboardKPIs());
});

// Global Search
setupRouter.get('/search', (req, res) => {
  const query = (req.query.q as string) || '';
  return res.json(SetupController.globalSearch(query));
});

// Bulk Imports
setupRouter.post('/bulk-import-inventory', (req, res) => {
  const { pieces, importedBy } = req.body;
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return res.status(400).json({ error: 'pieces must be a non-empty array' });
  }
  return res.json(SetupController.bulkImportInventory(pieces, importedBy));
});

setupRouter.post('/bulk-import-sales', (req, res) => {
  const { records, sales, importedBy } = req.body;
  const list = Array.isArray(records) ? records : Array.isArray(sales) ? sales : [];
  if (list.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }
  return res.json(SetupController.bulkImportSales(list, importedBy));
});

// ======================== LIVE BOOTHS CRUD ========================
setupRouter.get('/live-booths', async (req, res) => {
  const client = await getPgClient();
  if (client) {
    try {
      const boothsQ = await client.query("SELECT * FROM live_stream_booths ORDER BY booth_id ASC;");
      const channelsQ = await client.query("SELECT * FROM booth_social_channels;");
      await client.end();

      const channelsByBooth = new Map<string, any[]>();
      for (const ch of channelsQ.rows) {
        const list = channelsByBooth.get(ch.booth_id) || [];
        list.push(ch);
        channelsByBooth.set(ch.booth_id, list);
      }

      const booths = boothsQ.rows.map(r => {
        const chs = channelsByBooth.get(r.booth_id) || [];
        const activePlatforms = chs.filter(c => c.is_active).map(c => c.platform);
        const ttCh = chs.find(c => c.platform === 'tiktok');
        const igCh = chs.find(c => c.platform === 'instagram');
        const fbCh = chs.find(c => c.platform === 'facebook');
        const ytCh = chs.find(c => c.platform === 'youtube');
        const thCh = chs.find(c => c.platform === 'threads');

        return {
          boothId: r.booth_id,
          boothName: r.booth_name,
          category: r.category || 'Vintage Goods',
          hostName: r.host_name || 'Broadcaster Host',
          hostHandle: r.host_handle || ttCh?.account_username || '@vintage_dubai',
          accountEmail: r.account_email || '',
          provider: r.provider || 'RESTREAM',
          enabled: Boolean(r.enabled),
          masterIngestRtmpUrl: r.master_ingest_rtmp_url || 'rtmp://live.restream.io/live',
          masterStreamKey: r.master_stream_key || '',
          activePlatforms: activePlatforms.length > 0 ? activePlatforms : ['tiktok', 'instagram', 'facebook', 'youtube', 'threads'],
          autoRelayToTikTok: Boolean(r.auto_relay_to_tiktok),
          autoRelayToInstagram: Boolean(r.auto_relay_to_instagram),
          autoRelayToFacebook: Boolean(r.auto_relay_to_facebook),
          autoRelayToYouTube: Boolean(r.auto_relay_to_youtube),
          autoRelayToThreads: Boolean(r.auto_relay_to_threads),
          tiktokAccountHandle: ttCh?.account_username || r.tiktok_stream_key || '',
          instagramAccountHandle: igCh?.account_username || '',
          facebookAccountHandle: fbCh?.account_username || '',
          youTubeAccountHandle: ytCh?.account_username || '',
          threadsAccountHandle: thCh?.account_username || r.threads_account_handle || '',
          tiktokStreamKey: r.tiktok_stream_key || '',
          instagramStreamKey: r.instagram_stream_key || '',
          facebookStreamKey: r.facebook_stream_key || '',
          youtubeStreamKey: r.youtube_stream_key || '',
          threadsStreamKey: r.threads_stream_key || '',
          status: r.status || 'STANDBY',
          socialChannels: chs
        };
      });

      return res.json({ success: true, booths });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  return res.json({ success: true, booths: [] });
});

setupRouter.post('/live-booths', async (req, res) => {
  const b = req.body || {};
  let boothId = b.boothId ? String(b.boothId).trim().toLowerCase() : '';
  const client = await getPgClient();
  if (client) {
    try {
      if (!boothId) {
        const countQ = await client.query("SELECT COUNT(*) FROM live_stream_booths;");
        const nextNum = (parseInt(countQ.rows[0].count, 10) || 0) + 1;
        boothId = `booth-${nextNum}`;
      }

      const boothName = b.boothName || `Booth ${boothId.replace(/^booth[-_]?0*/i, '')}: Live Auction`;
      const category = b.category || 'Vintage Apparel';
      const hostName = b.hostName || 'Broadcaster Host';
      const hostHandle = b.hostHandle || `@host_${boothId.replace('-', '')}`;
      const accountEmail = b.accountEmail || `${boothId.replace('-', '')}@vintagevibe.ae`;
      const activePlatforms: string[] = Array.isArray(b.activePlatforms) && b.activePlatforms.length > 0 
        ? b.activePlatforms 
        : ['tiktok', 'instagram', 'facebook', 'youtube', 'threads'];

      await client.query(`
        INSERT INTO live_stream_booths (
          booth_id, booth_name, category, host_name, host_handle, account_email, provider, enabled,
          auto_relay_to_tiktok, auto_relay_to_instagram, auto_relay_to_facebook, auto_relay_to_youtube, auto_relay_to_threads,
          threads_account_handle, threads_stream_key, master_ingest_rtmp_url, master_stream_key, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'RESTREAM', true,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, 'STANDBY', NOW(), NOW()
        ) ON CONFLICT (booth_id) DO UPDATE SET
          booth_name = EXCLUDED.booth_name,
          category = EXCLUDED.category,
          host_name = EXCLUDED.host_name,
          host_handle = EXCLUDED.host_handle,
          account_email = EXCLUDED.account_email,
          updated_at = NOW();
      `, [
        boothId, boothName, category, hostName, hostHandle, accountEmail,
        activePlatforms.includes('tiktok'), activePlatforms.includes('instagram'),
        activePlatforms.includes('facebook'), activePlatforms.includes('youtube'),
        activePlatforms.includes('threads'),
        b.threadsAccountHandle || `@${boothId.replace('-', '')}_threads`,
        b.threadsStreamKey || '',
        b.masterIngestRtmpUrl || 'rtmp://live.restream.io/live',
        b.masterStreamKey || `stream_key_${boothId}`,
      ]);

      const legacyId = `booth_${boothId.replace(/^booth[-_]?0*/i, '').padStart(2, '0')}`;
      await client.query(`
        INSERT INTO live_booths (id, booth_name, host_operator_name, is_broadcasting, viewer_count, camera_source, current_deal_price, updated_at)
        VALUES ($1, $2, $3, false, 0, 'Webcam / OBS', 0, NOW())
        ON CONFLICT (id) DO UPDATE SET
          booth_name = EXCLUDED.booth_name,
          host_operator_name = EXCLUDED.host_operator_name,
          updated_at = NOW();
      `, [legacyId, boothName, hostName]);

      const allPlats = ['tiktok', 'instagram', 'facebook', 'youtube', 'threads', 'custom'];
      for (const plat of allPlats) {
        const isActive = activePlatforms.includes(plat);
        const platHandle = plat === 'tiktok' ? (b.tiktokAccountHandle || `@${boothId.replace('-', '')}_tt`) :
                           plat === 'instagram' ? (b.instagramAccountHandle || `@${boothId.replace('-', '')}_ig`) :
                           plat === 'facebook' ? (b.facebookAccountHandle || `Vintage Vibes Floor ${boothId.replace('booth-', '')}`) :
                           plat === 'youtube' ? (b.youTubeAccountHandle || `Vintage Vibes Studio ${boothId.replace('booth-', '')}`) :
                           plat === 'threads' ? (b.threadsAccountHandle || `@${boothId.replace('-', '')}_threads`) :
                           `@${boothId.replace('-', '')}_custom`;

        await client.query(`
          INSERT INTO booth_social_channels (id, booth_id, platform, account_username, auth_status, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'IDLE', $5, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            account_username = COALESCE(EXCLUDED.account_username, booth_social_channels.account_username),
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
        `, [`${boothId}_${plat}`, boothId, plat, platHandle, isActive]);
      }

      await client.end();
      return res.status(201).json({
        success: true,
        booth: {
          boothId,
          boothName,
          category,
          hostName,
          hostHandle,
          accountEmail,
          activePlatforms,
          enabled: true
        }
      });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  return res.json({ success: true });
});

setupRouter.delete('/live-booths/:id', async (req, res) => {
  const targetBoothId = req.params.id;
  const client = await getPgClient();
  const aliases = (function(b: string) {
    const m = String(b).match(/^booth[-_]?0*(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      const p = n < 10 ? `0${n}` : `${n}`;
      return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
    }
    return [String(b)];
  })(targetBoothId);

  if (client) {
    try {
      await client.query("DELETE FROM booth_social_channels WHERE booth_id = ANY($1::text[]);", [aliases]);
      await client.query("DELETE FROM live_stream_booths WHERE booth_id = ANY($1::text[]);", [aliases]);
      await client.query("DELETE FROM live_booths WHERE id = ANY($1::text[]);", [aliases]);
      await client.end();
      return res.json({ success: true, message: `Booth ${targetBoothId} deleted` });
    } catch (err: any) {
      try { await client.end(); } catch (_) {}
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  return res.json({ success: true });
});

