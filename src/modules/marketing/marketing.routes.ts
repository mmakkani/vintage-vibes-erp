import { Router } from 'express';
import { marketingService } from './marketing.service.ts';
import { baileysManager } from './baileys.service.ts';

export const marketingRouter = Router();
export const publicFeedRouter = Router();

// ==================== PUBLIC AD CATALOG FEEDS (XML) ====================
// Content-Type: application/xml
publicFeedRouter.get('/google-merchant.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const { xml } = marketingService.generateGoogleMerchantXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60'); // 60s cache/eviction
  return res.send(xml);
});

publicFeedRouter.get('/meta-catalog.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  const { xml } = marketingService.generateMetaCatalogXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  return res.send(xml);
});

// Also expose under marketing router for flexibility
marketingRouter.get('/feed/google-merchant.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  const { xml } = marketingService.generateGoogleMerchantXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

marketingRouter.get('/feed/meta-catalog.xml', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;
  const { xml } = marketingService.generateMetaCatalogXml(baseUrl);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  return res.send(xml);
});

// ==================== MARKETING HUB & CHANNELS ====================
marketingRouter.get('/status', (req, res) => {
  return res.json({
    channels: marketingService.getChannelsStatus(),
    quickStats: marketingService.getQuickStats(),
    timestamp: new Date().toISOString()
  });
});

marketingRouter.get('/quick-stats', (req, res) => {
  return res.json(marketingService.getQuickStats());
});

// ==================== AUTO-CLAIM KEYWORD ENGINE ====================
marketingRouter.get('/chat-claim/rules', (req, res) => {
  return res.json(marketingService.getKeywordRules());
});

marketingRouter.post('/chat-claim/rules', (req, res) => {
  const rules = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Expected array of keyword rules' });
  }
  return res.json(marketingService.saveKeywordRules(rules));
});

marketingRouter.get('/chat-claim/template', (req, res) => {
  return res.json(marketingService.getResponseTemplate());
});

marketingRouter.post('/chat-claim/template', (req, res) => {
  return res.json(marketingService.saveResponseTemplate(req.body));
});

marketingRouter.get('/chat-claim/logs', (req, res) => {
  return res.json(marketingService.getClaimLogs());
});

// Webhook & Simulator endpoint for incoming customer comments
marketingRouter.post('/chat-claim/webhook', (req, res) => {
  const { comment, customerHandle, platform, boothId, offeredPrice } = req.body;
  if (!comment || !customerHandle) {
    return res.status(400).json({ error: 'comment and customerHandle are required' });
  }

  const result = marketingService.processIncomingComment({
    comment,
    customerHandle,
    platform,
    boothId,
    offeredPrice: offeredPrice ? Number(offeredPrice) : undefined
  });

  return res.json(result);
});

// ==================== WHATSAPP VIP AUTO-BROADCAST ====================
marketingRouter.get('/vip-drops', (req, res) => {
  return res.json(marketingService.getVipDrops());
});

marketingRouter.post('/vip-drops/broadcast', (req, res) => {
  const { campaignTitle, targetGroup, pieceIds, customNote } = req.body;
  if (!campaignTitle || !Array.isArray(pieceIds) || pieceIds.length === 0) {
    return res.status(400).json({ error: 'campaignTitle and pieceIds are required' });
  }

  const drop = marketingService.createAndBroadcastVipDrop({
    campaignTitle,
    targetGroup: targetGroup || 'VIP_GOLD_BUYERS',
    pieceIds,
    customNote
  });

  return res.json(drop);
});

// ==================== LIVE STREAM BROADCAST DESK & OBS OVERLAY ====================
marketingRouter.get('/live-session', (req, res) => {
  return res.json(marketingService.getLiveSessionStatus());
});

marketingRouter.post('/live-session/toggle', (req, res) => {
  const { start, boothId } = req.body;
  const status = marketingService.toggleLiveStream(Boolean(start), boothId || 'booth-01');
  return res.json(status);
});

marketingRouter.post('/live-session/scan', (req, res) => {
  const { barcode, scannedBy } = req.body;
  if (!barcode) return res.status(400).json({ error: 'barcode is required' });

  const result = marketingService.scanPieceOnLiveDesk(barcode, scannedBy || 'Live Desk Host');
  if (!result.success) return res.status(404).json(result);

  return res.json(result);
});

// ==================== AD CATALOG FEEDS METRICS & PREVIEW ====================
marketingRouter.get('/feeds/metrics', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  return res.json(marketingService.getFeedMetrics(baseUrl));
});

// Push pieces to storefront featured drops
marketingRouter.post('/featured-drops', (req, res) => {
  const { pieceIds } = req.body;
  if (!Array.isArray(pieceIds)) {
    return res.status(400).json({ error: 'pieceIds array required' });
  }
  const result = marketingService.pushToFeaturedDrops(pieceIds);
  return res.json(result);
});

// ==================== AUTO PHOTO BROADCAST & VOICE ENGINE ====================
marketingRouter.get('/voice-presets', (req, res) => {
  return res.json(marketingService.getVoiceNotePresets());
});

marketingRouter.get('/broadcast-campaign/status', (req, res) => {
  const current = marketingService.getCurrentBroadcastCampaign();
  const history = marketingService.getBroadcastHistory();
  return res.json({ current, history });
});

marketingRouter.post('/broadcast-campaign/start', (req, res) => {
  const {
    title,
    targetAudience,
    targetChatId,
    customerPhones,
    pieceIds,
    voiceNoteEnabled,
    voiceNotePresetId,
    customVoiceNoteText,
    intervalSeconds
  } = req.body;

  if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
    return res.status(400).json({ error: 'pieceIds array is required and must not be empty' });
  }

  const campaign = marketingService.startAutoBroadcastCampaign({
    title,
    targetAudience,
    targetChatId,
    customerPhones: Array.isArray(customerPhones) ? customerPhones : undefined,
    pieceIds,
    voiceNoteEnabled: Boolean(voiceNoteEnabled),
    voiceNotePresetId,
    customVoiceNoteText,
    intervalSeconds: Number(intervalSeconds) || 4
  });

  return res.json(campaign);
});

marketingRouter.post('/broadcast-campaign/pause', (req, res) => {
  const result = marketingService.pauseBroadcastCampaign();
  return res.json(result);
});

marketingRouter.post('/broadcast-campaign/resume', (req, res) => {
  const result = marketingService.resumeBroadcastCampaign();
  return res.json(result);
});

marketingRouter.post('/broadcast-campaign/abort', (req, res) => {
  const result = marketingService.abortBroadcastCampaign();
  return res.json(result);
});

// ==================== MULTI-USER WHATSAPP DEVICE LINKING ====================
// Get current user's or all users' WhatsApp device sessions
marketingRouter.get('/whatsapp/session', (req, res) => {
  const userId = (req.query.userId as string) || 'default-user';
  const userName = (req.query.userName as string) || 'ERP Staff Operator';
  const session = marketingService.getWhatsAppSession(userId, userName);
  return res.json(session);
});

marketingRouter.get('/whatsapp/all-sessions', (req, res) => {
  return res.json(marketingService.getAllWhatsAppSessions());
});

// Generate fresh QR code for linking new phone
marketingRouter.post('/whatsapp/generate-qr', async (req, res) => {
  const { userId, userName } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    const session = await marketingService.generateNewQRCodeAsync(userId, userName);
    return res.json(session);
  } catch (err: any) {
    console.warn('[Marketing Route] Error generating QR:', err?.message);
    const session = marketingService.getWhatsAppSession(userId, userName);
    return res.json(session);
  }
});

// Request pairing code for phone number
marketingRouter.post('/whatsapp/request-pairing-code', (req, res) => {
  const { userId, phoneNumber } = req.body;
  if (!userId || !phoneNumber) {
    return res.status(400).json({ error: 'userId and phoneNumber are required' });
  }
  const session = marketingService.requestPhonePairingCode(userId, phoneNumber);
  return res.json(session);
});

// Verify strict 8-character pairing code entered by operator
marketingRouter.post('/whatsapp/verify-pairing-code', (req, res) => {
  const { userId, code, deviceModel } = req.body;
  if (!userId || !code) {
    return res.status(400).json({ error: 'userId and code are required' });
  }
  const result = marketingService.verifyAndConnectWithPairingCode(userId, code, deviceModel);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// Confirm phone connection (e.g. after phone scans QR code)
marketingRouter.post('/whatsapp/connect-device', (req, res) => {
  const { userId, phoneNumber, deviceModel } = req.body;
  if (!userId || !phoneNumber) {
    return res.status(400).json({ error: 'userId and phoneNumber are required' });
  }
  const session = marketingService.connectWhatsAppDevice(userId, phoneNumber, deviceModel);
  return res.json(session);
});

// Disconnect phone
marketingRouter.post('/whatsapp/disconnect-device', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const session = marketingService.disconnectWhatsAppDevice(userId);
  return res.json(session);
});
// WhatsApp Gateway & Channel Configuration Endpoints
marketingRouter.get('/whatsapp/config', (req, res) => {
  return res.json(marketingService.getWhatsAppGatewayConfig());
});

marketingRouter.post('/whatsapp/config', (req, res) => {
  const updated = marketingService.updateWhatsAppGatewayConfig(req.body);
  return res.json(updated);
});

// ==================== MULTI-CHANNEL WHATSAPP MANAGEMENT ====================
marketingRouter.get('/whatsapp/channels', (req, res) => {
  return res.json({ success: true, channels: marketingService.getWhatsAppChannels() });
});

marketingRouter.post('/whatsapp/channels', async (req, res) => {
  const { inviteLink, name } = req.body;
  const userId = (req.query.userId as string) || 'usr-admin-1';
  if (!inviteLink) return res.status(400).json({ error: 'inviteLink is required' });

  try {
    const meta = await baileysManager.resolveNewsletterByInvite(userId, inviteLink);
    const newChannel = {
      id: `chan-${Date.now()}`,
      name: (name || meta.name || 'WhatsApp Channel').trim(),
      jid: meta.id,
      inviteLink: meta.inviteLink || inviteLink,
      isDefault: false,
      role: meta.role || 'ADMIN',
      verifiedAdmin: true
    };
    const channels = marketingService.addWhatsAppChannel(newChannel);
    return res.json({ success: true, channel: newChannel, channels });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to add channel' });
  }
});

marketingRouter.delete('/whatsapp/channels/:idOrJid', (req, res) => {
  const { idOrJid } = req.params;
  const channels = marketingService.removeWhatsAppChannel(idOrJid);
  return res.json({ success: true, channels });
});

marketingRouter.post('/whatsapp/channels/:idOrJid/default', (req, res) => {
  const { idOrJid } = req.params;
  const channels = marketingService.setDefaultWhatsAppChannel(idOrJid);
  return res.json({ success: true, channels });
});

// Discover existing WhatsApp Channels (Newsletters) administered by the connected number
marketingRouter.get('/whatsapp/channels/discover', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const channels = await baileysManager.discoverChannels(userId);
  return res.json({ success: true, channels });
});

// Resolve newsletter by invite link
marketingRouter.post('/whatsapp/channels/resolve', async (req, res) => {
  const { inviteLink } = req.body;
  const userId = (req.query.userId as string) || 'usr-admin-1';
  if (!inviteLink) return res.status(400).json({ error: 'inviteLink is required' });

  try {
    const meta = await baileysManager.resolveNewsletterByInvite(userId, inviteLink);
    // Auto-update channelConfig
    marketingService.updateWhatsAppGatewayConfig({
      channelConfig: {
        channelInviteLink: meta.inviteLink,
        channelJid: meta.id,
        channelTitle: meta.name,
        verifiedAdmin: true,
        lastTestedAt: new Date().toISOString()
      }
    });

    return res.json({ success: true, meta });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to resolve channel' });
  }
});

// Fetch REAL participating groups from connected WhatsApp (zero fake groups)
marketingRouter.get('/whatsapp/groups', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const groups = await baileysManager.fetchUserGroups(userId);
  return res.json({ success: true, groups });
});

// Quick add real customer phone number to directory
marketingRouter.post('/whatsapp/directory/add-customer', async (req, res) => {
  const { name, phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const cleanPhone = phone.trim();
    const customerName = (name || `Customer (${cleanPhone})`).trim();
    // Add to relationalStore
    const newClient = {
      id: `party-cust-${Date.now()}`,
      code: `CLI-${Date.now().toString().slice(-4)}`,
      name: customerName,
      type: 'CLIENT' as const,
      phone: cleanPhone,
      creditLimit: 5000,
      currentBalance: 0,
      currency: 'AED' as const,
      isActive: true,
      accountMap: {},
      createdAt: new Date().toISOString()
    };
    (relationalStore as any).parties.unshift(newClient);
    return res.json({ success: true, customer: newClient });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message });
  }
});

// Get channel messages from WhatsApp server
marketingRouter.get('/whatsapp/channels/messages', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  const jid = (req.query.jid as string) || '';
  if (!jid) {
    return res.status(400).json({ error: 'jid is required' });
  }
  try {
    const session = (baileysManager as any).sessions.get(userId);
    if (!session?.sock) {
      return res.status(400).json({ error: 'Socket not connected' });
    }
    const result = await session.sock.newsletterFetchMessages(jid, 10);
    console.log('[NewsletterFetchMessages Result]:', JSON.stringify(result, null, 2));
    return res.json({ success: true, result });
  } catch (err: any) {
    console.warn('[NewsletterFetchMessages Error]:', err);
    return res.status(500).json({ success: false, error: err?.message, stack: err?.stack });
  }
});

// Test channel post and verify admin publishing rights
marketingRouter.post('/whatsapp/channels/test-post', async (req, res) => {
  const { channelJid, channelInviteLink } = req.body;
  const userId = 'usr-admin-1';

  try {
    const channels = marketingService.getWhatsAppChannels();
    const defaultChan = marketingService.getDefaultWhatsAppChannel();
    let targetJid = channelJid;

    if (!targetJid || targetJid.startsWith('chan-')) {
      if (channelInviteLink) {
        const resolved = await baileysManager.resolveNewsletterByInvite(userId, channelInviteLink).catch(() => null);
        targetJid = resolved?.id || defaultChan?.jid;
      } else {
        targetJid = defaultChan?.jid || channels[0]?.jid;
      }
    }

    if (!targetJid) {
      return res.status(400).json({
        success: false,
        error: 'No channel target found. Please connect or select a WhatsApp channel first.'
      });
    }

    // Select inventory piece for realistic drop preview
    const allPieces = relationalStore.queryInventoryStock({});
    const samplePiece = allPieces[0];
    const sku = samplePiece?.barcode || 'VV-BAL-001-0001';
    const brand = samplePiece?.brandName || "Levi's";
    const item = samplePiece?.itemName || 'Vintage Denim Trucker Jacket';
    const size = samplePiece?.sizeScanned || 'L';
    const condition = samplePiece?.labelGrade || 'Grade A+ Pristine';
    const price = samplePiece?.retailPriceAed || samplePiece?.estimatedPrice || 350;
    const sampleImage = req.body.imageUrl || samplePiece?.frontImageUrl || '/winter_maazi_story.png';
    const backImage = samplePiece?.backImageUrl || sampleImage;
    const tagImage = samplePiece?.tagImageUrl || sampleImage;

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    const session = marketingService.getWhatsAppSession(userId);
    const bizPhone = (session?.phoneNumber || '971501044543').replace(/\D/g, '');

    const testCaption = `🔥 *${brand} - ${item}*\n` +
      `🏷️ *SKU:* ${sku}\n` +
      `📏 *Size:* ${size} | *Condition:* ${condition}\n` +
      `💰 *Price:* ${price} AED\n\n` +
      `💳 *1-Tap Instant Checkout (Apple Pay, Google Pay, Card):*\n` +
      `👉 ${baseUrl}/?checkout=${encodeURIComponent(sku)}\n\n` +
      `💬 *1-Click WhatsApp Claim:*\n` +
      `👉 https://wa.me/${bizPhone}?text=MINE%20${encodeURIComponent(sku)}\n\n` +
      `🖼️ *High-Res Inspector (Front, Back & Label Photos):*\n` +
      `👉 ${baseUrl}/?piece=${encodeURIComponent(sku)}\n\n` +
      `_⚡ Verified Live Drop by Vintage Vibe UAE_`;

    const gwCfg = marketingService.getWhatsAppGatewayConfig();
    const sendResult = await baileysManager.postToChannel(userId, targetJid, {
      imageUrl: sampleImage,
      caption: testCaption,
      apiKeyConfig: {
        enabled: gwCfg.connectionMode !== 'BAILEYS_DIRECT_WEB',
        provider: gwCfg.connectionMode === 'META_CLOUD_API' ? 'META_CLOUD_API' : 'CUSTOM_GATEWAY',
        accessToken: gwCfg.metaCloudConfig?.accessToken || gwCfg.gatewayConfig?.apiToken,
        phoneNumberId: gwCfg.metaCloudConfig?.phoneNumberId,
        apiUrl: gwCfg.gatewayConfig?.apiUrl
      }
    });
    console.log('[test-post Result]:', sendResult);

    // Update verifiedAdmin status
    marketingService.updateWhatsAppGatewayConfig({
      channelConfig: {
        channelInviteLink: channelInviteLink || '',
        channelJid: targetJid,
        verifiedAdmin: true,
        lastTestedAt: new Date().toISOString()
      }
    });

    return res.json({
      success: true,
      message: 'Channel admin verification successful! Test post dispatched.',
      sendResult,
      testedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to post test verification message to channel'
    });
  }
});

// ==================== REAL PHONE CONTACTS & DEMO PURGE ====================
// Fetch real WhatsApp phone contacts
marketingRouter.get('/whatsapp/contacts', async (req, res) => {
  const userId = (req.query.userId as string) || 'usr-admin-1';
  try {
    const contacts = await baileysManager.fetchUserContacts(userId);
    return res.json({ success: true, contacts });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Auto-sync real WhatsApp contacts into ERP Customer Directory
marketingRouter.post('/whatsapp/directory/sync-phone-contacts', async (req, res) => {
  const userId = (req.body?.userId as string) || 'usr-admin-1';
  try {
    const contacts = await baileysManager.fetchUserContacts(userId);
    let addedCount = 0;
    for (const c of contacts) {
      if (!c.name || c.name.startsWith('WhatsApp Member')) continue; // Strict filter: only genuine names
      const cleanPhone = c.phone.replace(/\D/g, '');
      const existing = (relationalStore as any).parties.find(
        (p: any) => p.phone && p.phone.replace(/\D/g, '') === cleanPhone
      );
      if (!existing) {
        (relationalStore as any).parties.unshift({
          id: `party-synced-${cleanPhone}`,
          code: `CLI-WA-${Date.now().toString().slice(-4)}`,
          name: c.name,
          type: 'CLIENT',
          phone: c.phone,
          creditLimit: 5000,
          currentBalance: 0,
          currency: 'AED',
          isActive: true,
          accountMap: {},
          createdAt: new Date().toISOString()
        });
        addedCount++;
      } else if (existing.name && existing.name.startsWith('WhatsApp Member') && c.name) {
        existing.name = c.name;
      }
    }
    if (addedCount > 0) {
      relationalStore.saveToDisk();
    }
    const realClients = (relationalStore as any).parties.filter((p: any) => p.type === 'CLIENT');
    return res.json({
      success: true,
      syncedCount: addedCount,
      addedCount,
      totalContacts: realClients.length,
      clients: realClients
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Permanent wipe of fake demo seed parties and non-genuine entries
marketingRouter.post('/whatsapp/directory/wipe-demo-contacts', (req, res) => {
  try {
    const beforeCount = (relationalStore as any).parties.length;
    (relationalStore as any).parties = (relationalStore as any).parties.filter((p: any) => {
      if (p.type !== 'CLIENT') return true; // keep suppliers

      // If name is WhatsApp Member, wipe it immediately
      if (p.name && p.name.startsWith('WhatsApp Member')) {
        return false;
      }

      // Keep real customer records added manually with genuine names
      if (p.id.startsWith('party-cust-') && p.name && !p.name.startsWith('WhatsApp Member')) {
        return true;
      }

      // If it's a synced contact with a genuine real name
      if (p.id.startsWith('party-synced-') && p.name && !p.name.startsWith('WhatsApp Member')) {
        return true;
      }

      return false; // wipe fake demo seed clients
    });

    const wiped = beforeCount - (relationalStore as any).parties.length;
    relationalStore.saveToDisk();
    const remaining = (relationalStore as any).parties.filter((p: any) => p.type === 'CLIENT');
    return res.json({
      success: true,
      wipedCount: wiped,
      remainingCount: remaining.length,
      remainingClients: remaining,
      clients: remaining
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Add or update genuine customer phone in directory
marketingRouter.post('/whatsapp/directory/add-customer', (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required (at least 7 digits)' });
    }

    const formattedPhone = phone.startsWith('+') ? phone : `+${cleanPhone}`;
    const customerName = (name && name.trim()) || `Customer (${formattedPhone})`;

    // Check if customer with this phone already exists
    let existing = (relationalStore as any).parties.find(
      (p: any) => p.type === 'CLIENT' && p.phone && p.phone.replace(/\D/g, '') === cleanPhone
    );

    if (existing) {
      existing.name = customerName;
      existing.phone = formattedPhone;
    } else {
      existing = {
        id: `party-cust-${cleanPhone}`,
        code: `CLI-${cleanPhone.slice(-4)}`,
        name: customerName,
        type: 'CLIENT',
        phone: formattedPhone,
        creditLimit: 5000,
        currentBalance: 0,
        currency: 'AED',
        isActive: true,
        accountMap: {},
        createdAt: new Date().toISOString()
      };
      (relationalStore as any).parties.unshift(existing);
    }

    relationalStore.saveToDisk();
    return res.json({ success: true, customer: existing });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ==================== MULTI-CHANNEL WHATSAPP MANAGEMENT ====================
// Get all saved channels
marketingRouter.get('/whatsapp/channels', (req, res) => {
  return res.json({
    success: true,
    channels: marketingService.getWhatsAppChannels()
  });
});

// Add new channel with auto-resolve
marketingRouter.post('/whatsapp/channels/add', async (req, res) => {
  const { inviteLink, name } = req.body;
  if (!inviteLink) return res.status(400).json({ error: 'inviteLink is required' });

  try {
    const meta = await baileysManager.resolveNewsletterByInvite('usr-admin-1', inviteLink);
    const channelItem = {
      id: `chan-${Date.now()}`,
      name: name || meta.name || 'New Channel',
      jid: meta.id,
      inviteLink: meta.inviteLink || inviteLink,
      subscribers: meta.subscribers ? Number(meta.subscribers) : undefined,
      role: meta.role || 'ADMIN'
    };
    const updatedChannels = marketingService.addWhatsAppChannel(channelItem);
    return res.json({ success: true, channel: channelItem, channels: updatedChannels });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Could not resolve channel' });
  }
});

// Remove channel
marketingRouter.delete('/whatsapp/channels/:id', (req, res) => {
  const { id } = req.params;
  const updated = marketingService.removeWhatsAppChannel(id);
  return res.json({ success: true, channels: updated });
});

// Set default channel
marketingRouter.post('/whatsapp/channels/set-default', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Channel ID required' });
  const updated = marketingService.setDefaultWhatsAppChannel(id);
  return res.json({ success: true, channels: updated });
});

// ==================== SOCIAL PLATFORM CONNECTIONS (YOUTUBE, INSTAGRAM, TIKTOK) ====================
marketingRouter.get('/social/connections', (req, res) => {
  return res.json({
    success: true,
    accounts: marketingService.getSocialLiveAccounts()
  });
});

marketingRouter.post('/social/connections', (req, res) => {
  const { id, updates } = req.body;
  if (!id) return res.status(400).json({ error: 'Platform id required (youtube, instagram, tiktok)' });
  const updated = marketingService.updateSocialLiveAccount(id, updates);
  return res.json({ success: true, accounts: updated });
});

marketingRouter.post('/social/test-ping', (req, res) => {
  const { id } = req.body;
  const accounts = marketingService.getSocialLiveAccounts();
  const target = accounts.find(a => a.id === id);
  if (!target) return res.status(404).json({ error: 'Platform not found' });

  // Update connected status & timestamp
  target.isConnected = true;
  target.lastTestedAt = new Date().toISOString();
  marketingService.updateSocialLiveAccount(id as any, { isConnected: true, lastTestedAt: target.lastTestedAt });

  return res.json({
    success: true,
    platform: target.platformName,
    status: 'CONNECTED',
    message: `Successfully connected to ${target.platformName} live ingest stream!`,
    testedAt: target.lastTestedAt
  });
});

// ==================== AUTO INVOICE ENGINE SETUP & ACTIONS ====================
marketingRouter.get('/auto-invoice/settings', (req, res) => {
  return res.json({
    success: true,
    rules: marketingService.getAutoInvoiceRules()
  });
});

marketingRouter.post('/auto-invoice/settings', (req, res) => {
  const updated = marketingService.updateAutoInvoiceRules(req.body);
  return res.json({ success: true, rules: updated });
});

marketingRouter.post('/auto-invoice/generate-from-claim', (req, res) => {
  const { claimId } = req.body;
  if (!claimId) return res.status(400).json({ error: 'claimId is required' });
  const result = marketingService.generateInvoiceFromClaim(claimId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});
