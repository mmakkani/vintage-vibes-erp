import { Router } from 'express';
import { streamController } from '../../server/streamController.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { eventHub } from '../../server/events.ts';
import { tikTokSocketService } from '../../server/tiktokSocketService.ts';

export const liveStreamingRouter = Router();

// ======================== MASTER ADMIN OVERVIEW & MULTI-BOOTH LIST ========================
liveStreamingRouter.get('/booths', (req, res) => {
  return res.json(streamController.getAllBoothsOverview());
});

liveStreamingRouter.get('/booths/:boothId', (req, res) => {
  const booth = streamController.getBooth(req.params.boothId);
  if (!booth) return res.status(404).json({ error: 'Booth not found' });
  return res.json(booth);
});

// Update Booth RTMP, Social stream keys, and TikTok chat handle
liveStreamingRouter.post('/booths/:boothId/settings', (req, res) => {
  const { boothId } = req.params;
  const result = streamController.updateBoothSettings(boothId, req.body);
  if (!result.success) return res.status(400).json({ error: result.error });

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: boothId,
    data: result.booth
  });

  return res.json(result);
});

// Broadcast controls per booth
liveStreamingRouter.post('/booths/:boothId/broadcast/start', (req, res) => {
  const { boothId } = req.params;
  const result = streamController.startBroadcast(boothId);
  if (!result.success) return res.status(400).json({ error: result.error });

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: `${boothId}_START`,
    data: result.booth
  });

  return res.json(result);
});

liveStreamingRouter.post('/booths/:boothId/broadcast/stop', (req, res) => {
  const { boothId } = req.params;
  const result = streamController.stopBroadcast(boothId);
  if (!result.success) return res.status(400).json({ error: result.error });

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_STREAM',
    action: 'UPDATE',
    documentRef: `${boothId}_STOP`,
    data: result.booth
  });

  return res.json(result);
});

// Booth Comments
liveStreamingRouter.get('/booths/:boothId/comments', (req, res) => {
  const { boothId } = req.params;
  return res.json(streamController.getComments(boothId));
});

liveStreamingRouter.post('/booths/:boothId/comments', (req, res) => {
  const { boothId } = req.params;
  const { comment, platform, username } = req.body;
  if (!comment || !username) {
    return res.status(400).json({ error: 'Missing comment or username' });
  }

  const newComment = streamController.addComment(boothId, comment, platform || 'tiktok', username);
  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_COMMENT',
    action: 'CREATE',
    documentRef: newComment.id,
    data: newComment
  });

  return res.json(newComment);
});

// ======================== INSTANT CONFIRMED SALE & COA LEDGER POSTING ========================
liveStreamingRouter.post('/confirm-sale', (req, res) => {
  const { barcode, buyerHandle, buyerPhone, boothId, finalSellingPrice, channel, shippingAddress, paymentMethod } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'barcode and buyerHandle are required' });
  }
  const bId = boothId || 'booth-01';
  const result = relationalStore.confirmLiveSaleAndPostCOA({
    barcode,
    buyerHandle,
    buyerPhone,
    boothId: bId,
    finalSellingPrice: Number(finalSellingPrice) || 120,
    channel: channel || 'Multistream Live',
    shippingAddress,
    paymentMethod: paymentMethod || 'CASH'
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Update booth metrics
  streamController.recordClaim(bId, barcode, Number(finalSellingPrice) || 120);

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_SALE',
    action: 'POST',
    documentRef: result.invoice?.invoiceNo || barcode,
    data: {
      ...result,
      boothId: bId
    }
  });

  return res.json(result);
});

liveStreamingRouter.post('/booths/:boothId/confirm-sale', (req, res) => {
  const { boothId } = req.params;
  const { barcode, buyerHandle, buyerPhone, finalSellingPrice, channel, shippingAddress, paymentMethod } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'barcode and buyerHandle are required' });
  }
  const result = relationalStore.confirmLiveSaleAndPostCOA({
    barcode,
    buyerHandle,
    buyerPhone,
    boothId,
    finalSellingPrice: Number(finalSellingPrice) || 120,
    channel: channel || 'Multistream Live',
    shippingAddress,
    paymentMethod: paymentMethod || 'CASH'
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  streamController.recordClaim(boothId, barcode, Number(finalSellingPrice) || 120);

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_SALE',
    action: 'POST',
    documentRef: result.invoice?.invoiceNo || barcode,
    data: {
      ...result,
      boothId
    }
  });

  return res.json(result);
});

// Inline 'Lock / Claim' that generates an instant Draft Sales Invoice
liveStreamingRouter.post('/lock-and-draft', (req, res) => {
  const { barcode, buyerHandle, boothId, offeredPrice, channel } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'barcode and buyerHandle are required' });
  }
  const bId = boothId || 'booth-01';
  const result = relationalStore.draftLiveClaimInvoice({
    barcode,
    buyerHandle,
    boothId: bId,
    offeredPrice: offeredPrice ? Number(offeredPrice) : undefined,
    channel: channel || 'Multistream Live'
  });

  if (!result.success) {
    return res.status(409).json({ error: result.error });
  }

  const price = offeredPrice || result.piece?.lockedPrice || result.piece?.retailPriceAed || 120;
  streamController.recordClaim(bId, barcode, price);

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'CREATE',
    documentRef: barcode,
    data: {
      ...result,
      boothId: bId
    }
  });

  return res.json(result);
});

// Backward compatibility telemetry
liveStreamingRouter.get('/telemetry', (req, res) => {
  const boothId = (req.query.boothId as string) || 'booth-01';
  return res.json(streamController.getTelemetry(boothId));
});

liveStreamingRouter.post('/broadcast/start', (req, res) => {
  const boothId = req.body.boothId || 'booth-01';
  return res.json(streamController.startBroadcast(boothId));
});

liveStreamingRouter.post('/broadcast/stop', (req, res) => {
  const boothId = req.body.boothId || 'booth-01';
  return res.json(streamController.stopBroadcast(boothId));
});

liveStreamingRouter.post('/destinations', (req, res) => {
  const { destinations, boothId } = req.body;
  const bId = boothId || 'booth-01';
  return res.json(streamController.updateDestinations(destinations, bId));
});

liveStreamingRouter.get('/comments', (req, res) => {
  const boothId = (req.query.boothId as string) || 'booth-01';
  return res.json(streamController.getComments(boothId));
});

liveStreamingRouter.post('/comments', (req, res) => {
  const { comment, platform, username, boothId } = req.body;
  const bId = boothId || 'booth-01';
  const newComment = streamController.addComment(bId, comment, platform || 'tiktok', username);
  return res.json(newComment);
});

// ======================== ATOMIC SKU LOCK ENGINE & POOL ========================
liveStreamingRouter.get('/pool', (req, res) => {
  const boothId = req.query.boothId as string | undefined;
  const pool = relationalStore.getLiveClaimedPool(boothId);
  return res.json(pool);
});

liveStreamingRouter.post('/claim', (req, res) => {
  const { barcode, buyerHandle, buyerPhone, channel, boothId, offeredPrice, lockDurationSeconds, reservationTimeoutMinutes } = req.body;
  if (!barcode || !buyerHandle) {
    return res.status(400).json({ error: 'Barcode and buyerHandle are required' });
  }

  const bId = boothId || 'booth-01';

  const result = relationalStore.claimPieceAtomically({
    barcode,
    buyerHandle,
    buyerPhone,
    channel,
    boothId: bId,
    offeredPrice,
    lockDurationSeconds: lockDurationSeconds || 180,
    reservationTimeoutMinutes: reservationTimeoutMinutes || 120
  });

  if (!result.success) {
    return res.status(409).json({ error: result.error });
  }

  // Update booth stats
  const price = result.piece?.lockedPrice || result.piece?.estimatedPrice || result.piece?.retailPriceAed || 120;
  streamController.recordClaim(bId, barcode, price);

  // Broadcast to all active clients for instant real-time HUD updates
  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'UPDATE',
    documentRef: barcode,
    data: { piece: result.piece, boothId: bId }
  });

  return res.json(result);
});

// Fast Drop / Re-Auction Action
liveStreamingRouter.post('/release-lock', (req, res) => {
  const { barcode, boothId } = req.body;
  if (!barcode) return res.status(400).json({ error: 'Barcode required' });

  const bId = boothId || 'booth-01';
  const result = relationalStore.releasePieceLock(barcode, bId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const price = result.piece?.lockedPrice || result.piece?.estimatedPrice || result.piece?.retailPriceAed || 120;
  streamController.recordRelease(bId, barcode, price);

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_CLAIM',
    action: 'UPDATE',
    documentRef: barcode,
    data: { piece: result.piece, boothId: bId }
  });

  return res.json(result);
});

// Reservation Timeout Engine: sweep expired reservations
liveStreamingRouter.post('/sweep-reservations', (req, res) => {
  const result = relationalStore.sweepExpiredReservations();
  if (result.sweptCount > 0) {
    eventHub.broadcast({
      type: 'ENTITY_MUTATED',
      module: 'SALES',
      entity: 'LIVE_CLAIM',
      action: 'UPDATE',
      documentRef: 'SWEEP',
      data: result
    });
  }
  return res.json(result);
});

// Finalize live session per buyer
liveStreamingRouter.post('/finalize-session', (req, res) => {
  const { buyerHandle, customerPhone, paymentMethod, shippingAddress, boothId } = req.body;
  if (!buyerHandle) {
    return res.status(400).json({ error: 'buyerHandle is required' });
  }

  const result = relationalStore.finalizeBuyerLiveSession({
    buyerHandle,
    customerPhone,
    paymentMethod: paymentMethod || 'CASH',
    shippingAddress
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  eventHub.broadcast({
    type: 'ENTITY_MUTATED',
    module: 'SALES',
    entity: 'LIVE_SESSION',
    action: 'POST',
    documentRef: result.invoice?.invoiceNo || buyerHandle,
    data: { ...result, boothId }
  });

  return res.json(result);
});

// ======================== SMART WHATSAPP ADDRESS PARSER ========================
liveStreamingRouter.post('/parse-address', (req, res) => {
  const { rawText } = req.body;
  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'rawText string is required' });
  }

  const parsed = parseWhatsAppAddress(rawText);
  return res.json(parsed);
});

// Helper for parsing raw WhatsApp customer delivery details
export function parseWhatsAppAddress(rawText: string) {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Phone regex for UAE / international (+971, 05x, etc.)
  const phoneRegex = /(?:\+?971|00971|0)?\s*(?:50|52|54|55|56|58|2|3|4|6|7|9)\s*\d{3}\s*\d{4}|\+?\d{9,14}/;
  
  let phone = '';
  let name = '';
  let city = 'Dubai';
  let country = 'United Arab Emirates';
  const addressParts: string[] = [];

  const knownCities = [
    'Dubai',
    'Abu Dhabi',
    'Sharjah',
    'Ajman',
    'Ras Al Khaimah',
    'Fujairah',
    'Umm Al Quwain',
    'Al Ain',
    'Riyadh',
    'Jeddah',
    'Doha',
    'Kuwait'
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for phone
    const phoneMatch = line.match(phoneRegex);
    if (phoneMatch && !phone) {
      phone = phoneMatch[0].replace(/\s+/g, '');
      const lineWithoutPhone = line.replace(phoneRegex, '').replace(/phone|mobile|tel|whatsapp/gi, '').trim();
      if (lineWithoutPhone.length > 2 && !name) {
        name = lineWithoutPhone.replace(/^[:\-\s]+/, '');
      }
      continue;
    }

    // Check for explicit labels
    if (/^name\s*[:\-]/i.test(line)) {
      name = line.replace(/^name\s*[:\-]\s*/i, '');
      continue;
    }
    if (/^(?:address|delivery|location)\s*[:\-]/i.test(line)) {
      addressParts.push(line.replace(/^(?:address|delivery|location)\s*[:\-]\s*/i, ''));
      continue;
    }
    if (/^(?:city|emirate)\s*[:\-]/i.test(line)) {
      city = line.replace(/^(?:city|emirate)\s*[:\-]\s*/i, '');
      continue;
    }

    // Detect known UAE cities in line
    for (const kc of knownCities) {
      if (new RegExp(`\\b${kc}\\b`, 'i').test(line)) {
        city = kc;
      }
    }

    // If first line and looks like a name
    if (i === 0 && !name && !line.match(/\d{3,}/)) {
      name = line.replace(/[^\w\s\u0600-\u06FF]/g, '').trim();
      continue;
    }

    addressParts.push(line);
  }

  if (!name) name = 'Live Auction Customer';
  if (!phone) phone = '+971 50 000 0000';
  const fullAddress = addressParts.join(', ') || 'Al Quoz Industrial Area, Dubai';

  return {
    name,
    phone,
    streetAddress: fullAddress,
    city,
    country,
    courierNote: 'Handle with Care: Fragile Vintage Relove Apparel',
    parsedAt: new Date().toISOString()
  };
}

// Mobile Pairing Token endpoint
liveStreamingRouter.get('/pair-qr', (req, res) => {
  const boothId = (req.query.boothId as string) || 'booth-01';
  const token = `VV-${boothId.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const pairUrl = `${protocol}://${host}?mobileCamPair=${token}&booth=${boothId}`;

  return res.json({
    token,
    pairUrl,
    boothId,
    ipAddress: '192.168.1.144',
    resolution: '1080p60 FHD',
    protocol: 'WebRTC Ultra-Low Latency (Sub-200ms)',
    expiresInSeconds: 600
  });
});

// ======================== REAL TIKTOK LIVE WEBSOCKET CONNECTOR ========================
liveStreamingRouter.get('/tiktok-socket/status', (req, res) => {
  return res.json(tikTokSocketService.getStatus());
});

liveStreamingRouter.post('/tiktok-socket/connect', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'TikTok username is required' });
  }
  const result = await tikTokSocketService.connect(username);
  return res.json(result);
});

liveStreamingRouter.post('/tiktok-socket/disconnect', async (req, res) => {
  const result = await tikTokSocketService.disconnect();
  return res.json(result);
});

liveStreamingRouter.post('/tiktok-socket/config', (req, res) => {
  const profile = relationalStore.getCompanyProfile();
  if (!profile) return res.status(500).json({ error: 'Company profile not found' });

  profile.tiktokLiveSocket = {
    ...(profile.tiktokLiveSocket || {
      enabled: true,
      tiktokUsername: '',
      autoReconnect: true,
      connectionStatus: 'DISCONNECTED',
      claimKeywords: ['CLAIM', 'MINE', 'BIN', 'TAKE', 'BUY'],
      autoLockPieces: true,
      defaultLockDurationSeconds: 900
    }),
    ...req.body
  };

  relationalStore.updateCompanyProfile(profile);
  return res.json({ success: true, config: profile.tiktokLiveSocket });
});

