import http from 'http';
import net from 'net';
import tls from 'tls';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { withDb } from '../../db/pgPool.ts';
import { youTubeChatService } from './youtubeChatService.ts';
import { socialChatService } from './socialChatService.ts';
import { streamController } from '../../server/streamController.ts';
import { eventHub } from '../../server/events.ts';
import { decryptCredential } from '../../utils/encryption.ts';

interface ActiveRelay {
  connId: number;
  boothId: string;
  ffmpeg: ChildProcess | null;
  secondaryFfmpeg?: ChildProcess | null;
  secondaryFfmpegList?: ChildProcess[];
  ws: WebSocket;
  startedAt: number;
  bytesReceived: number;
  replaced?: boolean;
  keepAliveTimer?: ReturnType<typeof setInterval>;
  activeFbBroadcasts?: Array<{ id: string; token: string }>;
  webmHeaderPrefix?: Buffer | null;
}

const activeRelays = new Map<string, ActiveRelay>();
const realtimeViewerSockets = new Map<string, Set<WebSocket>>();
const disconnectGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const boothStartGraceUntil = new Map<string, number>();
const ALLOWED_LIVE_REACTIONS = new Set(['❤️', '🔥', '😍', '👏', '💎', '🎉']);
const boothReactionTotals = new Map<string, number>();

export function broadcastLiveClaimCelebration(
  boothId: string,
  payload: { buyerName: string; sku: string; itemName?: string; priceAed?: number }
) {
  broadcastRealtimeState(boothId, {
    type: 'CLAIM_CELEBRATION',
    buyerName: payload.buyerName,
    sku: payload.sku,
    itemName: payload.itemName || '',
    priceAed: payload.priceAed || 0,
    ts: Date.now()
  });
}

function broadcastRealtimeState(boothId: string, payload: Record<string, any>) {
  const bKey = normalizeBoothKey(boothId);
  const viewers = realtimeViewerSockets.get(bKey);
  if (!viewers || viewers.size === 0) return;
  const msg = JSON.stringify({ boothId: bKey, viewers: viewers.size, ...payload });
  for (const v of viewers) {
    if (v.readyState === WebSocket.OPEN) {
      try {
        v.send(msg);
      } catch (_) {}
    }
  }
}

function broadcastRealtimeChunk(boothId: string, buf: Buffer, webmHeaderPrefix?: Buffer | null) {
  const bKey = normalizeBoothKey(boothId);
  const viewers = realtimeViewerSockets.get(bKey);
  if (!viewers || viewers.size === 0 || !buf || buf.length === 0) return;
  const clusterMarker = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  for (const v of viewers) {
    if (v.readyState !== WebSocket.OPEN) continue;
    if (v.bufferedAmount >= 1048576) continue;
    try {
      if ((v as any).__awaitingCluster) {
        const cIdx = buf.indexOf(clusterMarker);
        if (cIdx !== -1 && webmHeaderPrefix && webmHeaderPrefix.length > 0) {
          (v as any).__awaitingCluster = false;
          v.send(webmHeaderPrefix);
          v.send(buf.subarray(cIdx));
        }
      } else {
        v.send(buf);
      }
    } catch (_) {}
  }
}

export function renderRealtimeLiveRoomHtml(req: any, res: any) {
  const rawBooth = String(req?.params?.boothId || req?.query?.boothId || 'booth-1').trim();
  const boothId = normalizeBoothKey(rawBooth);
  const boothJson = JSON.stringify(boothId);
  const diskCandidates = [
    path.join(process.cwd(), 'dist', 'live', 'index.html'),
    path.join(process.cwd(), 'public', 'live', 'index.html')
  ];
  for (const cand of diskCandidates) {
    try {
      if (fs.existsSync(cand)) {
        const diskHtml = fs.readFileSync(cand, 'utf8');
        if (diskHtml && diskHtml.includes('realtime-watch')) {
          const injected = diskHtml.replace(
            '</head>',
            `<script>window.__DEFAULT_BOOTH_ID__=${boothJson};</script>\n</head>`
          );
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.status(200).send(injected);
        }
      }
    } catch (_) {}
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <title>Vintage Vibes UAE — Live Auction Boutique (${boothId.toUpperCase()})</title>
  <meta name="description" content="Watch Vintage Vibes Al Ain Studio Live Auction in ~0.2s real-time. Claim 1-of-1 curated vintage garments with 1 tap." />
  <link rel="icon" type="image/png" href="/app-icon.png" />
  <style>
    :root {
      --bg: #07080d;
      --bg-elev: #0e111a;
      --card: #121723;
      --card-border: rgba(245, 196, 81, 0.22);
      --gold: #f5c451;
      --gold-2: #fde68a;
      --amber: #d97706;
      --crimson: #e11d48;
      --green: #10b981;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: radial-gradient(circle at 20% 0%, #17120a 0%, var(--bg) 52%); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif; -webkit-font-smoothing: antialiased; }
    body { min-height: 100dvh; display: flex; flex-direction: column; }
    header {
      position: sticky; top: 0; z-index: 30;
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
      padding: 10px 16px;
      background: rgba(10, 12, 19, 0.92);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--card-border);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    }
    .brand-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .brand-logo {
      width: 38px; height: 38px; border-radius: 999px; object-fit: cover;
      border: 1.5px solid rgba(245, 196, 81, 0.65);
      box-shadow: 0 0 16px rgba(245, 196, 81, 0.25);
      background: #0c0a09; flex-shrink: 0;
    }
    .brand-text { min-width: 0; }
    .brand-title {
      display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
      font-weight: 900; font-size: 14px; letter-spacing: 0.7px;
      background: linear-gradient(90deg, #fde68a, #f5c451, #fbbf24);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .brand-sub { font-size: 10px; color: var(--muted); font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .booth-tag {
      font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px;
      background: rgba(245, 196, 81, 0.14); border: 1px solid rgba(245, 196, 81, 0.35);
      color: var(--gold-2); -webkit-text-fill-color: var(--gold-2);
    }
    .header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .back-link {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 11px; border-radius: 999px; text-decoration: none;
      font-size: 11px; font-weight: 800; letter-spacing: 0.3px;
      color: #e2e8f0; background: #161c2c; border: 1px solid #2b354b;
      transition: all .15s ease;
    }
    .back-link:hover { border-color: var(--gold); color: var(--gold-2); background: #1c2233; }
    .pill {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 11px; font-weight: 800; padding: 5px 11px; border-radius: 999px;
      background: #161b26; color: #cbd5e1; border: 1px solid #2e3748;
      letter-spacing: 0.3px;
    }
    .pill.live {
      background: linear-gradient(135deg, rgba(225, 29, 72, 0.24), rgba(16, 185, 129, 0.18));
      color: #fde68a; border-color: rgba(244, 63, 94, 0.75);
      box-shadow: 0 0 18px rgba(225, 29, 72, 0.28);
    }
    .pill.wait { background: rgba(245, 196, 81, 0.12); color: var(--gold); border-color: rgba(245, 196, 81, 0.4); }
    .dot-live { width: 8px; height: 8px; border-radius: 999px; background: #fb7185; box-shadow: 0 0 8px #f43f5e; animation: pulseDot 1.2s infinite; }
    @keyframes pulseDot { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.45); opacity: 0.55; } }
    main {
      flex: 1; width: 100%; max-width: 1440px; margin: 0 auto;
      padding: 14px; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 14px;
      align-items: start;
    }
    @media (max-width: 960px) {
      main { grid-template-columns: 1fr; padding: 10px; gap: 10px; }
    }
    .left-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    .stage {
      position: relative; width: 100%; aspect-ratio: 16/9; background: #000;
      border-radius: 16px; overflow: hidden;
      border: 1.5px solid rgba(245, 196, 81, 0.35);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.65), 0 0 36px rgba(245, 196, 81, 0.08);
      display: flex; align-items: center; justify-content: center;
    }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .overlay-top {
      position: absolute; top: 12px; left: 12px; right: 12px; z-index: 15;
      display: flex; justify-content: space-between; align-items: center; gap: 8px; pointer-events: none;
    }
    .overlay-top > * { pointer-events: auto; }
    .stage-controls { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .ctrl-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(12, 15, 24, 0.84); backdrop-filter: blur(8px);
      color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.22);
      font-weight: 800; font-size: 12px; padding: 7px 12px; border-radius: 999px;
      cursor: pointer; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); transition: all .15s ease;
    }
    .ctrl-btn:hover { border-color: var(--gold); color: var(--gold-2); transform: translateY(-1px); }
    .unmute-btn {
      background: linear-gradient(135deg, #fde68a, #f59e0b); color: #111827; border: 1px solid #fef3c7;
      font-weight: 900; font-size: 12px; padding: 8px 15px; border-radius: 999px;
      cursor: pointer; box-shadow: 0 6px 20px rgba(245, 158, 11, 0.38); transition: all .15s ease;
    }
    .unmute-btn.on { background: rgba(16, 185, 129, 0.92); color: #052e16; border-color: #6ee7b7; box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35); }
    .wait-screen {
      position: absolute; inset: 0; z-index: 12;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: radial-gradient(circle at center, rgba(24, 19, 12, 0.92), rgba(7, 8, 13, 0.96));
      text-align: center; padding: 24px; gap: 12px;
    }
    .wait-seal { width: 72px; height: 72px; border-radius: 999px; border: 2px solid rgba(245, 196, 81, 0.55); box-shadow: 0 0 28px rgba(245, 196, 81, 0.25); }
    .wait-screen h2 { color: var(--gold-2); font-size: 19px; font-weight: 900; letter-spacing: 0.4px; }
    .wait-screen p { color: var(--muted); font-size: 13px; max-width: 390px; line-height: 1.5; }
    .wait-cta {
      margin-top: 4px; display: inline-flex; align-items: center; gap: 7px;
      padding: 10px 18px; border-radius: 999px; text-decoration: none;
      background: linear-gradient(135deg, #fde68a, #f59e0b); color: #111827;
      font-weight: 900; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px;
      box-shadow: 0 6px 22px rgba(245, 158, 11, 0.35);
    }
    .claim-deck {
      background: linear-gradient(145deg, #131826, #0d111b);
      border: 1px solid var(--card-border); border-radius: 16px;
      padding: 14px; display: flex; flex-direction: column; gap: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .claim-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .claim-title { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.7px; color: var(--gold); display: flex; align-items: center; gap: 6px; }
    .claim-toast { font-size: 12px; font-weight: 700; color: #34d399; min-height: 18px; }
    .claim-inputs { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; }
    @media (max-width: 640px) { .claim-inputs { grid-template-columns: 1fr; } }
    input {
      background: #0a0e17; color: #fff; border: 1px solid #2c364d; border-radius: 10px;
      padding: 10px 12px; font-size: 13px; width: 100%; outline: none; transition: border-color .15s;
    }
    input:focus { border-color: var(--gold); }
    input::placeholder { color: #64748b; }
    .btn-claim {
      background: linear-gradient(135deg, #10b981, #059669); color: #fff;
      border: 1px solid rgba(110, 231, 183, 0.5); border-radius: 10px;
      padding: 10px 18px; font-weight: 900; font-size: 13px; letter-spacing: 0.4px;
      cursor: pointer; white-space: nowrap; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
      transition: transform .12s ease, filter .15s ease;
    }
    .btn-claim:hover { filter: brightness(1.08); }
    .btn-claim:active { transform: scale(0.97); }
    .chips { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .chip-label { font-size: 11px; color: var(--muted); font-weight: 700; }
    .chip-btn {
      background: #1a2132; color: #e2e8f0; border: 1px solid #2e3850; border-radius: 999px;
      padding: 5px 11px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all .15s;
    }
    .chip-btn:hover { border-color: var(--gold); color: var(--gold-2); background: #222b40; }
    .chat-card {
      background: var(--card); border: 1px solid var(--card-border); border-radius: 16px;
      display: flex; flex-direction: column; height: calc(100dvh - 100px); min-height: 400px; max-height: 760px;
      overflow: hidden; box-shadow: 0 12px 35px rgba(0, 0, 0, 0.45);
    }
    @media (max-width: 960px) { .chat-card { height: 440px; max-height: none; } }
    .chat-head {
      padding: 12px 14px; border-bottom: 1px solid #1f2937;
      background: linear-gradient(90deg, rgba(245, 196, 81, 0.08), transparent);
      font-weight: 900; font-size: 13px; letter-spacing: 0.4px;
      display: flex; justify-content: space-between; align-items: center; color: var(--gold-2);
    }
    .chat-list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .chat-empty { color: #64748b; font-size: 12px; text-align: center; padding: 24px 12px; }
    .msg {
      background: #182032; padding: 9px 11px; border-radius: 11px; font-size: 13px; line-height: 1.45;
      border-left: 3px solid #475569; word-break: break-word;
    }
    .msg.host { border-left-color: var(--gold); background: linear-gradient(90deg, rgba(245, 196, 81, 0.14), #181f2e); }
    .msg.claim { border-left-color: var(--green); background: linear-gradient(90deg, rgba(16, 185, 129, 0.16), #15222a); }
    .msg-meta { display: inline-flex; align-items: center; gap: 5px; margin-right: 6px; vertical-align: baseline; }
    .plat-badge {
      display: inline-block; font-size: 9px; font-weight: 900; padding: 1px 6px; border-radius: 5px;
      letter-spacing: 0.4px; text-transform: uppercase;
    }
    .plat-host { background: rgba(245, 196, 81, 0.25); color: #fde68a; border: 1px solid rgba(245, 196, 81, 0.5); }
    .plat-live { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); }
    .plat-yt { background: rgba(239, 68, 68, 0.22); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.45); }
    .plat-fb { background: rgba(59, 130, 246, 0.22); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.45); }
    .plat-tt { background: rgba(236, 72, 153, 0.22); color: #f9a8d4; border: 1px solid rgba(236, 72, 153, 0.45); }
    .msg .u { font-weight: 800; color: var(--gold-2); }
    .composer { padding: 10px 12px; border-top: 1px solid #1f2937; background: #0c1018; display: flex; gap: 7px; }
    .btn-send {
      background: linear-gradient(135deg, #fde68a, #f59e0b); color: #111827;
      border: none; border-radius: 10px; padding: 10px 15px; font-weight: 900; font-size: 13px;
      cursor: pointer; white-space: nowrap;
    }
    .btn-send:hover { filter: brightness(1.06); }
  </style>
</head>
<body>
<header>
  <div class="brand-wrap">
    <img class="brand-logo" src="/app-icon.png" alt="Vintage Vibes Logo" onerror="this.onerror=null;this.src='/vintage_logo_gold_seal.png'" />
    <div class="brand-text">
      <div class="brand-title">
        <span>VINTAGE VIBES LIVE</span>
        <span class="booth-tag" id="boothLabel"></span>
      </div>
      <div class="brand-sub">General Trading L.L.C - S.P.C &bull; Al Ain, UAE</div>
    </div>
  </div>
  <div class="header-right">
    <a class="back-link" href="/">&larr; Back to Store</a>
    <span class="pill wait" id="statusPill">&#x23F3; CONNECTING...</span>
    <span class="pill" id="latencyPill">Latency: --</span>
    <span class="pill" id="viewerPill">&#x1F441; 1</span>
  </div>
</header>
<main>
  <div class="left-col">
    <section class="stage" id="stageBox">
      <video id="liveVideo" autoplay playsinline muted></video>
      <div class="overlay-top">
        <button class="unmute-btn" id="unmuteBtn" onclick="toggleMute()">&#x1F507; Tap for Live Sound</button>
        <div class="stage-controls">
          <button class="ctrl-btn" id="syncBtn" onclick="resyncLive()" title="Snap to live edge">&#x21BB; Sync Live</button>
          <button class="ctrl-btn" id="fsBtn" onclick="toggleFullscreen()" title="Toggle fullscreen">&#x26F6; Fullscreen</button>
        </div>
      </div>
      <div class="wait-screen" id="waitOverlay">
        <img class="wait-seal" src="/app-icon.png" alt="Vintage Vibes Seal" onerror="this.onerror=null;this.src='/vintage_logo_gold_seal.png'" />
        <h2>Studio Standby Lounge</h2>
        <p>Host jaise hi Go Live press karega, aapko bilkul ~0.2s real-time HD video bina kisi delay ke yahan khud start ho jayegi.</p>
        <a class="wait-cta" href="/">&#x1F6CD;&#xFE0F; Browse 1-of-1 Catalog</a>
      </div>
    </section>
    <section class="claim-deck">
      <div class="claim-top">
        <div class="claim-title">&#x26A1; Instant Live Auction Claim</div>
        <div class="claim-toast" id="claimToast"></div>
      </div>
      <div class="claim-inputs">
        <input id="buyerHandle" placeholder="Your @Name / WhatsApp (e.g. @Ali_055...)" maxlength="40" />
        <input id="skuInput" placeholder="SKU if visible (optional, e.g. VV-2601-0547)" maxlength="36" />
        <button class="btn-claim" id="claimBtn" onclick="sendClaim()">&#x26A1; 1-TAP CLAIM</button>
      </div>
      <div class="chips">
        <span class="chip-label">Quick Ask:</span>
        <button type="button" class="chip-btn" onclick="quickAsk('Fire piece!')">&#x1F525; Fire!</button>
        <button type="button" class="chip-btn" onclick="quickAsk('Price check please?')">&#x1F4B0; Price?</button>
        <button type="button" class="chip-btn" onclick="quickAsk('Size & condition check please?')">&#x1F4CF; Size check?</button>
        <button type="button" class="chip-btn" onclick="quickAsk('Next piece please!')">&#x23ED; Next piece!</button>
      </div>
    </section>
  </div>
  <aside class="chat-card">
    <div class="chat-head">
      <span>&#x1F4AC; Live Comments &amp; Claims</span>
      <span style="font-size:11px;color:#34d399;font-weight:700">&#x25CF; Live Sync</span>
    </div>
    <div class="chat-list" id="chatList">
      <div class="chat-empty">Comments &amp; SKU claims will appear here in real time.</div>
    </div>
    <div class="composer">
      <input id="chatInput" placeholder="Type SKU or question for host..." maxlength="200" onkeydown="if(event.key==='Enter')sendMsg()" />
      <button class="btn-send" onclick="sendMsg()">Send</button>
    </div>
  </aside>
</main>
<script>
(function () {
  var BOOTH_ID = ${boothJson};
  document.getElementById('boothLabel').textContent = BOOTH_ID.toUpperCase();
  var stageBox = document.getElementById('stageBox');
  var video = document.getElementById('liveVideo');
  var statusPill = document.getElementById('statusPill');
  var latencyPill = document.getElementById('latencyPill');
  var viewerPill = document.getElementById('viewerPill');
  var waitOverlay = document.getElementById('waitOverlay');
  var unmuteBtn = document.getElementById('unmuteBtn');
  var chatList = document.getElementById('chatList');
  var buyerInput = document.getElementById('buyerHandle');
  var skuInput = document.getElementById('skuInput');
  var chatInput = document.getElementById('chatInput');
  var claimToast = document.getElementById('claimToast');

  try { buyerInput.value = localStorage.getItem('vv_live_handle') || ''; } catch (_) {}
  buyerInput.addEventListener('change', function () {
    try { localStorage.setItem('vv_live_handle', buyerInput.value.trim()); } catch (_) {}
  });

  window.toggleMute = function () {
    video.muted = !video.muted;
    if (!video.muted) { video.play().catch(function () {}); }
    unmuteBtn.textContent = video.muted ? '\\uD83D\\uDD07 Tap for Live Sound' : '\\uD83D\\uDD0A Sound On';
    unmuteBtn.className = video.muted ? 'unmute-btn' : 'unmute-btn on';
  };

  window.toggleFullscreen = function () {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (stageBox.requestFullscreen) {
        stageBox.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch (_) {}
  };

  var mediaSource = null, sourceBuffer = null, msUrl = null;
  var pipelineGen = 0, msOpening = false, initAppended = false;
  var savedInitSegment = null;
  var awaitingKeyframeCluster = true;
  var syncRawChunks = [], syncRawBytes = 0;
  var appendQueue = [];
  var lastResetMs = 0;
  var streamLive = false;
  var ws = null;
  var reconnectTimer = null;

  function setStatusLive(isLive) {
    streamLive = isLive;
    if (isLive) {
      statusPill.innerHTML = '<span class="dot-live"></span> LIVE ON AIR';
      statusPill.className = 'pill live';
      waitOverlay.style.display = 'none';
    } else {
      statusPill.textContent = '\\u23F3 STANDBY (OFF AIR)';
      statusPill.className = 'pill wait';
      latencyPill.textContent = 'Latency: --';
      waitOverlay.style.display = 'flex';
      appendQueue = [];
      awaitingKeyframeCluster = true;
      syncRawChunks = [];
      syncRawBytes = 0;
    }
  }

  function concatUint8(chunks, totalBytes) {
    var out = new Uint8Array(totalBytes);
    var off = 0;
    for (var i = 0; i < chunks.length; i++) {
      out.set(chunks[i], off);
      off += chunks[i].length;
    }
    return out;
  }

  function indexOfMagic(buf, b0, b1, b2, b3, fromIdx) {
    var start = fromIdx || 0;
    var limit = buf.length - 4;
    for (var i = start; i <= limit; i++) {
      if (buf[i] === b0 && buf[i + 1] === b1 && buf[i + 2] === b2 && buf[i + 3] === b3) return i;
    }
    return -1;
  }

  function readEbmlVint(buf, pos, maskFirst) {
    if (pos >= buf.length) return null;
    var b0 = buf[pos];
    if (b0 === 0) return null;
    var len = 0, mask = 0x80;
    for (var k = 1; k <= 8; k++) {
      if ((b0 & mask) !== 0) { len = k; break; }
      mask >>= 1;
    }
    if (!len || pos + len > buf.length) return null;
    var val = maskFirst ? (b0 & (mask - 1)) : b0;
    var allOnes = maskFirst && (val === (mask - 1));
    for (var j = 1; j < len; j++) {
      var nb = buf[pos + j];
      if (nb !== 0xff) allOnes = false;
      val = val * 256 + nb;
    }
    return { len: len, val: allOnes ? -1 : val };
  }

  function findKeyframeClusterOffset(buf) {
    var clusterStarts = [];
    var pos = 0;
    while (pos <= buf.length - 4) {
      var idx = indexOfMagic(buf, 0x1f, 0x43, 0xb6, 0x75, pos);
      if (idx === -1) break;
      clusterStarts.push(idx);
      pos = idx + 4;
    }
    for (var c = clusterStarts.length - 1; c >= 0; c--) {
      var cOff = clusterStarts[c];
      var cEnd = (c + 1 < clusterStarts.length) ? clusterStarts[c + 1] : buf.length;
      var szInfo = readEbmlVint(buf, cOff + 4, true);
      if (!szInfo) continue;
      var p = cOff + 4 + szInfo.len;
      var seenVideo = false;
      while (p < cEnd - 6) {
        var idInfo = readEbmlVint(buf, p, false);
        if (!idInfo || idInfo.len > 4) break;
        var dSz = readEbmlVint(buf, p + idInfo.len, true);
        if (!dSz || dSz.val < 0) break;
        var payPos = p + idInfo.len + dSz.len;
        if (idInfo.len === 1 && buf[p] === 0xa3) {
          if (payPos + 6 > buf.length) break;
          if (buf[payPos] === 0x81) {
            var flags = buf[payPos + 3];
            var vp8Byte0 = buf[payPos + 4];
            if ((flags & 0x80) !== 0 && (vp8Byte0 & 0x01) === 0) {
              return cOff;
            }
            seenVideo = true;
            break;
          }
        }
        if (seenVideo) break;
        p = payPos + dSz.val;
      }
    }
    if (buf.length > 420000 && clusterStarts.length > 0) {
      return clusterStarts[clusterStarts.length - 1];
    }
    return -1;
  }

  function ensureMediaPipeline(forceMode) {
    if (typeof MediaSource === 'undefined') return;
    if (!forceMode && (sourceBuffer || msOpening)) return;
    if (forceMode === 'auto' && (Date.now() - lastResetMs < 1500)) return;
    lastResetMs = Date.now();

    var myGen = ++pipelineGen;
    msOpening = true;
    sourceBuffer = null;
    initAppended = false;
    appendQueue = [];
    awaitingKeyframeCluster = true;
    syncRawChunks = [];
    syncRawBytes = 0;

    if (msUrl) { try { URL.revokeObjectURL(msUrl); } catch (_) {} msUrl = null; }
    var localMs = new MediaSource();
    mediaSource = localMs;
    msUrl = URL.createObjectURL(localMs);
    video.src = msUrl;

    localMs.addEventListener('sourceopen', function () {
      if (myGen !== pipelineGen || localMs.readyState !== 'open') return;
      var mime = MediaSource.isTypeSupported('video/webm; codecs="vp8, opus"')
        ? 'video/webm; codecs="vp8, opus"'
        : (MediaSource.isTypeSupported('video/webm; codecs="vp8"') ? 'video/webm; codecs="vp8"' : 'video/webm');
      try {
        var sb = localMs.addSourceBuffer(mime);
        sb.mode = 'sequence';
        sourceBuffer = sb;
        msOpening = false;
        sb.addEventListener('updateend', function () {
          if (myGen === pipelineGen) flushQueue();
        });
        sb.addEventListener('error', function () {
          if (myGen === pipelineGen) ensureMediaPipeline('auto');
        });
        if (savedInitSegment && !initAppended) {
          appendQueue.unshift(savedInitSegment);
          initAppended = true;
        }
        flushQueue();
      } catch (e) {
        msOpening = false;
        console.warn('SourceBuffer init notice:', e);
      }
    }, { once: true });
  }

  function flushQueue() {
    if (!sourceBuffer || sourceBuffer.updating || appendQueue.length === 0) return;
    if (!mediaSource || mediaSource.readyState !== 'open') return;
    try {
      if (sourceBuffer.buffered.length > 0) {
        var end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
        var start = sourceBuffer.buffered.start(0);
        if (end - start > 14 && video.currentTime > start + 8) {
          sourceBuffer.remove(start, Math.max(start, end - 8));
          return;
        }
      }
      var next = appendQueue.shift();
      if (next) sourceBuffer.appendBuffer(next);
      if (video.paused && streamLive && sourceBuffer.buffered.length > 0) {
        video.play().catch(function () {});
      }
    } catch (e) {
      if (String(e && e.name) === 'QuotaExceededError') {
        try {
          if (sourceBuffer.buffered.length > 0) {
            var bEnd = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
            sourceBuffer.remove(sourceBuffer.buffered.start(0), Math.max(0, bEnd - 3));
          }
        } catch (_) {}
      } else {
        ensureMediaPipeline('auto');
      }
    }
  }

  setInterval(function () {
    if (!streamLive || !sourceBuffer || sourceBuffer.buffered.length === 0) return;
    var start = sourceBuffer.buffered.start(0);
    var end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
    var lag = end - video.currentTime;
    if (video.currentTime < start || lag > 0.55) {
      try { video.currentTime = Math.max(start, end - 0.12); } catch (_) {}
    } else if (lag > 0.24) {
      video.playbackRate = 1.05;
    } else {
      video.playbackRate = 1.0;
    }
    if (video.paused && streamLive) { video.play().catch(function () {}); }
    latencyPill.textContent = '\\u26A1 ' + Math.max(0.08, lag).toFixed(2) + 's';
  }, 250);

  function connectWs() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) {
      try { ws.onclose = null; ws.onerror = null; ws.close(); } catch (_) {}
      ws = null;
    }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/api/live/stream/realtime-watch?boothId=' + encodeURIComponent(BOOTH_ID));
    ws.binaryType = 'arraybuffer';
    ws.onmessage = function (evt) {
      if (typeof evt.data === 'string') {
        try {
          var msg = JSON.parse(evt.data);
          if (typeof msg.viewers === 'number') viewerPill.textContent = '\\uD83D\\uDC41 ' + msg.viewers;
          if (msg.type === 'STREAM_STATE') {
            setStatusLive(Boolean(msg.live));
            if (Boolean(msg.live)) ensureMediaPipeline(false);
          }
        } catch (_) {}
        return;
      }
      var u8 = new Uint8Array(evt.data);
      if (!u8.length) return;
      if (!streamLive) setStatusLive(true);
      ensureMediaPipeline(false);

      if (indexOfMagic(u8, 0x1a, 0x45, 0xdf, 0xa3, 0) === 0) {
        var firstCl = indexOfMagic(u8, 0x1f, 0x43, 0xb6, 0x75, 4);
        if (firstCl === -1) {
          savedInitSegment = u8;
          if (!initAppended) {
            appendQueue.unshift(savedInitSegment);
            initAppended = true;
            flushQueue();
          }
          return;
        } else {
          savedInitSegment = u8.subarray(0, firstCl);
          if (!initAppended) {
            appendQueue.unshift(savedInitSegment);
            initAppended = true;
          }
          u8 = u8.subarray(firstCl);
        }
      }

      if (awaitingKeyframeCluster) {
        syncRawChunks.push(u8);
        syncRawBytes += u8.length;
        if (syncRawBytes > 600000) {
          var trimmed = concatUint8(syncRawChunks, syncRawBytes);
          trimmed = trimmed.subarray(trimmed.length - 300000);
          syncRawChunks = [trimmed];
          syncRawBytes = trimmed.length;
        }
        var merged = concatUint8(syncRawChunks, syncRawBytes);
        var kfIdx = indexOfMagic(merged, 0x1f, 0x43, 0xb6, 0x75, 0);
        if (kfIdx !== -1) {
          awaitingKeyframeCluster = false;
          syncRawChunks = [];
          syncRawBytes = 0;
          if (savedInitSegment && !initAppended) {
            appendQueue.push(savedInitSegment);
            initAppended = true;
          }
          appendQueue.push(merged.subarray(kfIdx));
          flushQueue();
        }
        return;
      }

      if (appendQueue.length > 45) {
        appendQueue = [];
        awaitingKeyframeCluster = true;
        syncRawChunks = [u8];
        syncRawBytes = u8.length;
        return;
      }
      appendQueue.push(u8);
      flushQueue();
    };
    ws.onclose = function () {
      statusPill.textContent = '\\u23F3 RECONNECTING...';
      statusPill.className = 'pill wait';
      reconnectTimer = setTimeout(connectWs, 2000);
    };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }

  window.resyncLive = function () {
    ensureMediaPipeline('manual');
    connectWs();
  };

  ensureMediaPipeline('manual');
  connectWs();

  var toastTimer = null;
  function showToast(text) {
    claimToast.textContent = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { claimToast.textContent = ''; }, 3500);
  }

  var firstChatLoad = true;
  function getBadgeInfo(c, usr) {
    var p = String(c.platform || c.source || '').toLowerCase();
    if (usr.indexOf('Vintage Vibes Host') !== -1 || c.badge === 'ALL LIVE') return { cls: 'plat-host', label: '\\uD83D\\uDC51 HOST' };
    if (p === 'youtube') return { cls: 'plat-yt', label: '\\uD83D\\uDD34 YT' };
    if (p === 'facebook') return { cls: 'plat-fb', label: '\\uD83D\\uDD35 FB' };
    if (p === 'tiktok') return { cls: 'plat-tt', label: '\\uD83C\\uDFB5 TT' };
    if (p === 'instagram') return { cls: 'plat-tt', label: '\\uD83D\\uDCF8 IG' };
    return { cls: 'plat-live', label: '\\u26A1 LIVE' };
  }

  async function refreshComments() {
    try {
      var res = await fetch('/api/live/booths/' + encodeURIComponent(BOOTH_ID) + '/comments');
      if (!res.ok) return;
      var j = await res.json();
      var arr = Array.isArray(j) ? j : (j.comments || j.data || []);
      var tail = arr.slice(-45);
      var nearBottom = firstChatLoad || (chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 90);
      chatList.innerHTML = '';
      if (tail.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'chat-empty';
        empty.textContent = 'Comments & SKU claims will appear here in real time.';
        chatList.appendChild(empty);
        return;
      }
      for (var i = 0; i < tail.length; i++) {
        var c = tail[i];
        var div = document.createElement('div');
        var txt = String(c.comment || c.message || c.text || '');
        var usr = String(c.username || c.author || 'Viewer');
        var isHost = usr.indexOf('Vintage Vibes Host') !== -1 || c.badge === 'ALL LIVE';
        var isClaim = Boolean(c.isClaimIntent) || /\\b(claim|mine|book)\\b/i.test(txt);
        div.className = 'msg' + (isHost ? ' host' : (isClaim ? ' claim' : ''));
        var meta = document.createElement('span');
        meta.className = 'msg-meta';
        var bInfo = getBadgeInfo(c, usr);
        var bSpan = document.createElement('span');
        bSpan.className = 'plat-badge ' + bInfo.cls;
        bSpan.textContent = bInfo.label;
        var uSpan = document.createElement('span');
        uSpan.className = 'u';
        uSpan.textContent = usr + ':';
        meta.appendChild(bSpan);
        meta.appendChild(uSpan);
        var tSpan = document.createElement('span');
        tSpan.textContent = txt;
        div.appendChild(meta);
        div.appendChild(tSpan);
        chatList.appendChild(div);
      }
      if (nearBottom) chatList.scrollTop = chatList.scrollHeight;
      firstChatLoad = false;
    } catch (_) {}
  }
  refreshComments();
  setInterval(refreshComments, 2000);

  async function postComment(text) {
    var user = (buyerInput.value || '').trim() || ('@LiveBuyer_' + Math.floor(100 + Math.random() * 899));
    if (!buyerInput.value.trim()) buyerInput.value = user;
    try { localStorage.setItem('vv_live_handle', user); } catch (_) {}
    await fetch('/api/live/booths/' + encodeURIComponent(BOOTH_ID) + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, comment: text, platform: 'custom' })
    });
    firstChatLoad = true;
    refreshComments();
  }

  window.sendClaim = function () {
    var sku = (skuInput.value || '').trim() || chatInput.value.trim();
    var msg = sku ? ('CLAIM ' + sku) : 'CLAIM';
    skuInput.value = '';
    chatInput.value = '';
    postComment(msg);
    showToast('\\u2705 Claim sent to Studio Host!');
  };

  window.quickAsk = function (text) {
    postComment(text);
    showToast('\\u2705 Sent: ' + text);
  };

  window.sendMsg = function () {
    var t = chatInput.value.trim();
    if (!t) return;
    chatInput.value = '';
    postComment(t);
  };
})();
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.status(200).send(html);
}
const softwareLiveFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
const softwareIntendedLive = new Set<string>();

interface ActiveFbSession {
  fbLiveVideoId: string;
  baseUrl: string;
  streamKey: string;
  rawTargetUrl: string;
  fbAccessToken: string;
  createdAt: number;
}
const activeBoothFbSessions = new Map<string, ActiveFbSession>();
const fbSessionIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getActiveBoothFacebookSession(boothId: string): ActiveFbSession | undefined {
  return activeBoothFbSessions.get(normalizeBoothKey(boothId));
}

function cancelBoothFbIdleTimer(boothId: string) {
  const bKey = normalizeBoothKey(boothId);
  const t = fbSessionIdleTimers.get(bKey);
  if (t) {
    clearTimeout(t);
    fbSessionIdleTimers.delete(bKey);
  }
}

function endBoothFacebookSession(boothId: string) {
  const bKey = normalizeBoothKey(boothId);
  cancelBoothFbIdleTimer(bKey);
  const sess = activeBoothFbSessions.get(bKey);
  if (sess) {
    activeBoothFbSessions.delete(bKey);
    tryAutoEndFacebookBroadcast(sess.fbLiveVideoId, sess.fbAccessToken).catch(() => {});
  }
}

let relayConnSeq = 0;

function appendRelayLog(line: string) {
  try {
    const logPath = path.join(process.cwd(), 'rtmp_relay.log');
    const entry = `[${new Date().toISOString()}] ${line}\n`;
    fs.appendFileSync(logPath, entry);
  } catch (_) {}
}

function normalizeBoothKey(boothId: string): string {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const m = raw.match(/^booth[-_]?0*(\d+)$/i);
  return m ? `booth-${parseInt(m[1], 10)}` : raw;
}

function getBoothAliases(boothId: string): string[] {
  const raw = String(boothId || 'booth-1').trim().toLowerCase();
  const m = raw.match(/^booth[-_]?0*(\d+)$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const p = n < 10 ? `0${n}` : `${n}`;
    return [`booth-${n}`, `booth-${p}`, `booth_${n}`, `booth_${p}`];
  }
  return [raw];
}

export function markBoothStreamStarting(boothId: string = 'booth-1', graceMs: number = 20000): void {
  boothStartGraceUntil.set(normalizeBoothKey(boothId), Date.now() + graceMs);
}

export function isBoothActuallyStreamingOnServer(boothId: string = 'booth-1', includeGrace: boolean = true): boolean {
  const bKey = normalizeBoothKey(boothId);
  const directRelay = activeRelays.get(boothId) || activeRelays.get(bKey);
  if (directRelay && !directRelay.replaced) {
    if (
      (directRelay.ffmpeg && directRelay.ffmpeg.exitCode === null && !directRelay.ffmpeg.killed) ||
      Date.now() - directRelay.startedAt < 15000
    ) {
      return true;
    }
  }
  for (const [k, info] of activeRelays.entries()) {
    if (normalizeBoothKey(k) === bKey && info && !info.replaced) {
      if (
        (info.ffmpeg && info.ffmpeg.exitCode === null && !info.ffmpeg.killed) ||
        Date.now() - info.startedAt < 15000
      ) {
        return true;
      }
    }
  }
  if (autonomousBoothActive.has(bKey)) {
    const workersMap = autonomousBoothWorkers.get(bKey);
    if (workersMap) {
      for (const w of workersMap.values()) {
        if (w.status === 'STREAMING' || w.status === 'RECONNECTING') {
          return true;
        }
      }
    }
  }
  if (includeGrace && (boothStartGraceUntil.get(bKey) || 0) > Date.now()) {
    return true;
  }
  return false;
}

export async function syncBoothLiveToPostgres(boothId: string = 'booth-1'): Promise<void> {
  const bKey = normalizeBoothKey(boothId);
  const aliases = getBoothAliases(boothId);
  try {
    await withDb(async (client) => {
      await client.query(
        `INSERT INTO public.live_booth_metrics (booth_id, is_broadcasting, stream_health, viewer_count, updated_at)
         VALUES ($1, true, 'EXCELLENT', 750, NOW())
         ON CONFLICT (booth_id) DO UPDATE SET
           is_broadcasting = true,
           stream_health = 'EXCELLENT',
           viewer_count = GREATEST(live_booth_metrics.viewer_count, 750),
           updated_at = NOW()
         WHERE live_booth_metrics.is_broadcasting IS DISTINCT FROM true
            OR live_booth_metrics.stream_health IS DISTINCT FROM 'EXCELLENT'`,
        [bKey]
      ).catch(() => {});

      await client.query(
        `UPDATE public.live_stream_booths
         SET is_broadcasting = true, stream_health = 'EXCELLENT', updated_at = NOW()
         WHERE booth_id = ANY($1::text[])
           AND (is_broadcasting IS DISTINCT FROM true OR stream_health IS DISTINCT FROM 'EXCELLENT')`,
        [aliases]
      ).catch(() => {});

      await client.query(
        `UPDATE public.booth_social_channels
         SET stream_status = 'LIVE', updated_at = NOW()
         WHERE booth_id = ANY($1::text[])
           AND is_active = true
           AND (auth_status = 'LOGGED_IN' OR COALESCE(metadata->>'streamKey', '') <> '' OR COALESCE(metadata->>'fbAccessToken', '') <> '')
           AND stream_status IS DISTINCT FROM 'LIVE'`,
        [aliases]
      ).catch(() => {});
    });
  } catch (_) {}
}

export async function syncBoothStoppedToPostgres(boothId: string = 'booth-1'): Promise<void> {
  const aliases = getBoothAliases(boothId);
  try {
    await withDb(async (client) => {
      await client.query(
        `UPDATE public.live_booth_metrics
         SET is_broadcasting = false, stream_health = 'OFFLINE', updated_at = NOW()
         WHERE booth_id = ANY($1::text[])
           AND (is_broadcasting IS DISTINCT FROM false OR stream_health IS DISTINCT FROM 'OFFLINE')`,
        [aliases]
      ).catch(() => {});

      await client.query(
        `UPDATE public.live_stream_booths
         SET is_broadcasting = false, stream_health = 'OFFLINE', updated_at = NOW()
         WHERE booth_id = ANY($1::text[])
           AND (is_broadcasting IS DISTINCT FROM false OR stream_health IS DISTINCT FROM 'OFFLINE')`,
        [aliases]
      ).catch(() => {});

      await client.query(
        `UPDATE public.booth_social_channels
         SET stream_status = 'STANDBY', updated_at = NOW()
         WHERE booth_id = ANY($1::text[])
           AND stream_status IS DISTINCT FROM 'STANDBY'`,
        [aliases]
      ).catch(() => {});
    });
  } catch (_) {}
}

const DUMMY_KEYS = new Set([
  '••••••••',
  'ig_key',
  'tt_key',
  'fb_key',
  'th_key',
  'yt_key',
  'live_tt_alain_bale_stage',
  'live_ig_relove_vintage',
  'fb-live-page-vv-992',
  'yt_live_channel_dxb_1080',
  're_live_sec_10482_vv_dxb_773',
  'm@tti4102002',
  'mati@5566'
]);

export function isValidRtmpStreamKey(rawKey?: string | null, platform?: string): boolean {
  if (!rawKey) return false;
  const k = rawKey.trim();
  if (k.length < 6) return false;
  if (DUMMY_KEYS.has(k.toLowerCase())) return false;
  if (k.startsWith('OAUTH_') || k.startsWith('HANDLE_') || k.startsWith('enc:v1:') || k.startsWith('stream_key_booth')) {
    return false;
  }
  if (/^vv_[a-z]+_booth\d+_live$/i.test(k)) return false;
  const plat = String(platform || '').toLowerCase();
  if (plat === 'tiktok') {
    // Real TikTok stream keys either start with "stream-", contain query params (?expire= / &sign=), start with rtmp://, or are >= 16 chars without @
    const looksLikeTikTokKey =
      k.startsWith('stream-') ||
      k.startsWith('rtmp://') ||
      k.startsWith('rtmps://') ||
      k.includes('expire=') ||
      k.includes('sign=') ||
      (k.length >= 16 && !k.includes('@'));
    if (!looksLikeTikTokKey) return false;
  }
  if (plat === 'instagram') {
    if (k.length < 16 && !k.startsWith('IG-') && !k.startsWith('rtmp')) return false;
  }
  return true;
}

export function splitRtmpBaseAndStreamKey(
  rawBaseUrl: string,
  rawStreamKey: string,
  defaultBaseUrl: string
): { baseUrl: string; streamKey: string } {
  let b = String(rawBaseUrl || '').trim();
  let k = String(rawStreamKey || '').trim();

  // Case 1: User pasted the full rtmp://.../stream-... URL into the Stream Key field
  if (k.startsWith('rtmp://') || k.startsWith('rtmps://')) {
    const streamIdx = k.indexOf('/stream-');
    if (streamIdx !== -1) {
      return {
        baseUrl: k.slice(0, streamIdx).replace(/\/+$/, ''),
        streamKey: k.slice(streamIdx + 1)
      };
    }
    const lastSlash = k.lastIndexOf('/');
    if (lastSlash > 8) {
      return {
        baseUrl: k.slice(0, lastSlash).replace(/\/+$/, ''),
        streamKey: k.slice(lastSlash + 1)
      };
    }
  }

  // Case 2: User pasted the full rtmp://.../stream-... URL into the Server URL field
  if (b.includes('/stream-')) {
    const streamIdx = b.indexOf('/stream-');
    const extractedBase = b.slice(0, streamIdx).replace(/\/+$/, '');
    const extractedKey = b.slice(streamIdx + 1);
    return {
      baseUrl: extractedBase,
      streamKey: k && !DUMMY_KEYS.has(k.toLowerCase()) ? k : extractedKey
    };
  }

  const finalBase = (b.startsWith('rtmp://') || b.startsWith('rtmps://') ? b : defaultBaseUrl).replace(/\/+$/, '');
  return { baseUrl: finalBase, streamKey: k.replace(/^\/+/, '') };
}

const activeTlsBridges = new Map<string, Promise<number>>();

async function bridgeRtmpsUrlIfNeeded(targetUrl: string): Promise<string> {
  if (process.platform !== 'win32' || !targetUrl.toLowerCase().startsWith('rtmps://')) {
    return targetUrl;
  }
  try {
    const withoutProto = targetUrl.slice('rtmps://'.length);
    const slashIdx = withoutProto.indexOf('/');
    if (slashIdx === -1) return targetUrl;
    const hostPort = withoutProto.slice(0, slashIdx);
    const pathAndKey = withoutProto.slice(slashIdx); // starts with '/'
    const [remoteHost, portStr] = hostPort.split(':');
    const remotePort = parseInt(portStr || '443', 10) || 443;
    const cacheKey = `${remoteHost}:${remotePort}`;

    let portPromise = activeTlsBridges.get(cacheKey);
    if (!portPromise) {
      portPromise = new Promise<number>((resolve, reject) => {
        const srv = net.createServer((clientSocket) => {
          clientSocket.pause();
          const tlsSocket = tls.connect(
            {
              host: remoteHost,
              port: remotePort,
              servername: remoteHost,
              rejectUnauthorized: false
            },
            () => {
              clientSocket.pipe(tlsSocket);
              tlsSocket.pipe(clientSocket);
              clientSocket.resume();
            }
          );
          tlsSocket.on('error', () => clientSocket.destroy());
          clientSocket.on('error', () => tlsSocket.destroy());
          tlsSocket.on('close', () => clientSocket.destroy());
          clientSocket.on('close', () => tlsSocket.destroy());
        });
        srv.on('error', (err) => {
          activeTlsBridges.delete(cacheKey);
          reject(err);
        });
        srv.listen(0, '127.0.0.1', () => {
          const addr = srv.address();
          const localPort = typeof addr === 'object' && addr ? addr.port : 0;
          console.log(`[RtmpRelay] 🔒 OpenSSL RTMPS Bridge active: 127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}`);
          resolve(localPort);
        });
      });
      activeTlsBridges.set(cacheKey, portPromise);
    }

    const localPort = await portPromise;
    return `rtmp://127.0.0.1:${localPort}${pathAndKey}`;
  } catch (e) {
    return targetUrl;
  }
}

/**
 * Resolve path to ffmpeg executable
 */
export function getFfmpegPath(): string {
  const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidates = [
    process.env.FFMPEG_PATH || '',
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exeName),
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', exeName),
    'C:\\vintage-vibe\\node_modules\\ffmpeg-static\\ffmpeg.exe'
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }
  return 'ffmpeg';
}

let cachedNvencAvailable: boolean | null = null;
let cachedGpuName: string = 'CPU Fallback (libx264)';
let cachedGpuTelemetry: any = null;
let cachedGpuTelemetryAt = 0;

export function isNvidiaNvencAvailable(): boolean {
  if (cachedNvencAvailable !== null) return cachedNvencAvailable;
  try {
    const ffmpegExe = getFfmpegPath();
    execFileSync(
      ffmpegExe,
      ['-hide_banner', '-f', 'lavfi', '-i', 'nullsrc=s=256x256:d=0.05', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
      { stdio: 'ignore', timeout: 5000, windowsHide: true }
    );
    cachedNvencAvailable = true;
    try {
      const smi = execFileSync(
        'nvidia-smi',
        ['--query-gpu=name,memory.total', '--format=csv,noheader'],
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      ).trim();
      if (smi) cachedGpuName = smi.split('\n')[0].trim();
    } catch (_) {
      cachedGpuName = 'NVIDIA GeForce RTX GPU (NVENC)';
    }
    console.log(`[RtmpRelay] 🚀 NVIDIA GPU Hardware Acceleration (h264_nvenc) ACTIVE on ${cachedGpuName}!`);
  } catch (_) {
    cachedNvencAvailable = false;
  }
  return cachedNvencAvailable;
}

export function getGpuTelemetry() {
  const nvenc = isNvidiaNvencAvailable();
  if (cachedGpuTelemetry && Date.now() - cachedGpuTelemetryAt < 15000) {
    return {
      ...cachedGpuTelemetry,
      active_live_streams: Math.max(activeRelays.size, autonomousBoothActive.size)
    };
  }
  try {
    const raw = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    ).trim();
    const parts = raw.split(',').map((s) => s.trim());
    cachedGpuTelemetry = {
      gpu_available: true,
      gpu_name: parts[0] || cachedGpuName,
      vram_total_mb: Number(parts[1] || 8192),
      vram_used_mb: Number(parts[2] || 0),
      vram_free_mb: Number(parts[3] || 8192),
      utilization_pct: Number(parts[4] || 0),
      temperature_c: Number(parts[5] || 0),
      nvenc_active: nvenc,
      video_encoder: nvenc ? 'h264_nvenc (NVIDIA Hardware CUDA/NVENC)' : 'libx264 (CPU)',
      active_live_streams: Math.max(activeRelays.size, autonomousBoothActive.size)
    };
    cachedGpuTelemetryAt = Date.now();
    return cachedGpuTelemetry;
  } catch (_) {
    return {
      gpu_available: nvenc,
      gpu_name: cachedGpuName,
      vram_total_mb: nvenc ? 8192 : 0,
      vram_used_mb: 0,
      vram_free_mb: nvenc ? 8192 : 0,
      utilization_pct: 0,
      temperature_c: 0,
      nvenc_active: nvenc,
      video_encoder: nvenc ? 'h264_nvenc (NVIDIA Hardware CUDA/NVENC)' : 'libx264 (CPU)',
      active_live_streams: Math.max(activeRelays.size, autonomousBoothActive.size)
    };
  }
}

/**
 * Mount the RTMP Live Stream WebSocket Ingestion Relay onto the HTTP server
 */
export function setupRtmpRelayWebSocket(server: http.Server) {
  // Probe GPU NVENC capability on startup
  setImmediate(() => {
    try {
      isNvidiaNvencAvailable();
    } catch (_) {}
  });

  const wss = new WebSocketServer({ noServer: true });
  const viewerWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/live/stream/rtmp-relay' || url.pathname.endsWith('/stream/rtmp-relay')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (url.pathname === '/api/live/stream/realtime-watch' || url.pathname.endsWith('/stream/realtime-watch')) {
      viewerWss.handleUpgrade(request, socket, head, (vWs) => {
        viewerWss.emit('connection', vWs, request);
      });
    }
  });

  viewerWss.on('connection', (vWs: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const boothId = normalizeBoothKey(url.searchParams.get('boothId') || 'booth-1');
    let viewers = realtimeViewerSockets.get(boothId);
    if (!viewers) {
      viewers = new Set();
      realtimeViewerSockets.set(boothId, viewers);
    }
    (vWs as any).__awaitingCluster = true;
    viewers.add(vWs);

    const relay = activeRelays.get(boothId);
    const isLive = Boolean(relay && !relay.replaced);
    if (vWs.readyState === WebSocket.OPEN) {
      try {
        vWs.send(
          JSON.stringify({
            type: 'STREAM_STATE',
            boothId,
            live: isLive,
            viewers: viewers.size,
            totalReactions: boothReactionTotals.get(boothId) || 0
          })
        );
      } catch (_) {}
    }
    broadcastRealtimeState(boothId, { type: 'VIEWERS_UPDATE', live: isLive });

    vWs.on('message', (rawData: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (isBinary) return;
      try {
        const txt = rawData.toString();
        if (!txt || txt.length > 512) return;
        const msg = JSON.parse(txt);
        if (msg?.type === 'REACTION') {
          const now = Date.now();
          const rlWin = Number((vWs as any).__rlWin || 0);
          let rlCnt = Number((vWs as any).__rlCnt || 0);
          if (now - rlWin > 1000) {
            (vWs as any).__rlWin = now;
            rlCnt = 0;
          }
          rlCnt += 1;
          (vWs as any).__rlCnt = rlCnt;
          if (rlCnt > 8) return;

          const emoji = ALLOWED_LIVE_REACTIONS.has(String(msg.emoji)) ? String(msg.emoji) : '❤️';
          const totalReactions = (boothReactionTotals.get(boothId) || 0) + 1;
          boothReactionTotals.set(boothId, totalReactions);
          broadcastRealtimeState(boothId, { type: 'REACTION', emoji, totalReactions });
        }
      } catch (_) {}
    });

    const cleanupViewer = () => {
      const curSet = realtimeViewerSockets.get(boothId);
      if (curSet) {
        curSet.delete(vWs);
        if (curSet.size === 0) {
          realtimeViewerSockets.delete(boothId);
        } else {
          const curRelay = activeRelays.get(boothId);
          broadcastRealtimeState(boothId, { type: 'VIEWERS_UPDATE', live: Boolean(curRelay && !curRelay.replaced) });
        }
      }
    };
    vWs.on('close', cleanupViewer);
    vWs.on('error', cleanupViewer);
  });

  const finalizeRelayStop = (targetBoothId: string) => {
    const bKey = normalizeBoothKey(targetBoothId);
    disconnectGraceTimers.delete(targetBoothId);
    disconnectGraceTimers.delete(bKey);
    // Only stop broadcast if neither a new relay nor an autonomous broadcaster is actively streaming
    if (isBoothActuallyStreamingOnServer(bKey, false)) return;
    boothStartGraceUntil.delete(bKey);
    const vSet = realtimeViewerSockets.get(bKey);
    if (vSet) {
      for (const v of vSet) {
        (v as any).__awaitingCluster = true;
      }
    }
    broadcastRealtimeState(bKey, { type: 'STREAM_STATE', live: false });
    try {
      const ytStatus = youTubeChatService.getBoothChatStatus(targetBoothId);
      youTubeChatService.disconnectBooth(targetBoothId);
      socialChatService.disconnectAllBoothPlatforms(targetBoothId);
      const bRes = streamController.stopBroadcast(targetBoothId, ytStatus?.liveId);
      syncBoothStoppedToPostgres(targetBoothId).catch(() => {});
      eventHub.broadcast({
        type: 'ENTITY_MUTATED',
        module: 'SALES',
        entity: 'LIVE_STREAM',
        action: 'UPDATE',
        documentRef: `${targetBoothId}_STOP`,
        data: { ...(bRes.booth || {}), boothId: bKey, isBroadcasting: false }
      });
    } catch (_) {
      syncBoothStoppedToPostgres(targetBoothId).catch(() => {});
    }
  };

  const scheduleFinalizeRelayStop = (targetBoothId: string, delayMs: number = 6000) => {
    const bKey = normalizeBoothKey(targetBoothId);
    const existingTimer = disconnectGraceTimers.get(bKey);
    if (existingTimer) clearTimeout(existingTimer);
    disconnectGraceTimers.set(bKey, setTimeout(() => finalizeRelayStop(bKey), delayMs));
  };

  wss.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const boothId = normalizeBoothKey(url.searchParams.get('boothId') || 'booth-1');
    const connId = ++relayConnSeq;

    softwareIntendedLive.add(boothId);
    cancelBoothFbIdleTimer(boothId);
    const pendingFallback = softwareLiveFallbackTimers.get(boothId);
    if (pendingFallback) {
      clearTimeout(pendingFallback);
      softwareLiveFallbackTimers.delete(boothId);
    }

    // Cancel any pending disconnect grace timer for this booth so brief reconnects never interrupt the session
    const pendingGrace = disconnectGraceTimers.get(boothId) || disconnectGraceTimers.get(normalizeBoothKey(boothId));
    if (pendingGrace) {
      clearTimeout(pendingGrace);
      disconnectGraceTimers.delete(boothId);
      disconnectGraceTimers.delete(normalizeBoothKey(boothId));
    }

    console.log(`[RtmpRelay] 🎥 Client #${connId} connected for ${boothId}. Initializing RTMP stream pipe...`);
    appendRelayLog(`[RtmpRelay] 🎥 Client #${connId} connected for ${boothId}.`);

    // Clean up any stale relay for this booth IMMEDIATELY and notify it that it was superseded so it never auto-reconnects
    const existing = activeRelays.get(boothId);
    if (existing) {
      console.log(`[RtmpRelay] Superseding previous relay #${existing.connId} for ${boothId}`);
      existing.replaced = true;
      activeRelays.delete(boothId);
      if (existing.keepAliveTimer) {
        clearInterval(existing.keepAliveTimer);
      }
      try {
        existing.ffmpeg?.removeAllListeners('exit');
        existing.ffmpeg?.removeAllListeners('error');
        existing.ffmpeg?.stdin?.end();
        existing.ffmpeg?.kill('SIGTERM');
      } catch (_) {}
      try {
        existing.secondaryFfmpeg?.removeAllListeners('exit');
        existing.secondaryFfmpeg?.removeAllListeners('error');
        existing.secondaryFfmpeg?.stdin?.end();
        existing.secondaryFfmpeg?.kill('SIGTERM');
      } catch (_) {}
      if (existing.secondaryFfmpegList) {
        for (const sp of existing.secondaryFfmpegList) {
          try {
            sp?.removeAllListeners('exit');
            sp?.removeAllListeners('error');
            sp?.stdin?.end();
            sp?.kill('SIGTERM');
          } catch (_) {}
        }
      }
      try {
        existing.ws?.removeAllListeners('message');
        if (existing.ws?.readyState === WebSocket.OPEN) {
          existing.ws.send(JSON.stringify({ type: 'SUPERSEDED', reason: 'Superseded by newer stream connection' }));
          existing.ws.close(1000, 'Superseded by new stream');
        }
      } catch (_) {}
    }

    const relayInfo: ActiveRelay = {
      connId,
      boothId,
      ffmpeg: null,
      secondaryFfmpeg: null,
      ws,
      startedAt: Date.now(),
      bytesReceived: 0,
      replaced: false
    };
    activeRelays.set(boothId, relayInfo);

    // Buffer binary chunks immediately in case client sends anything while DB lookup runs
    const pendingChunks: Buffer[] = [];
    let pendingBytes = 0;
    let ffmpegProcess: ChildProcess | null = null;
    let secondaryFfmpegProcess: ChildProcess | null = null;
    let isSpawned = false;
    let isReadyToSpawn = false;
    let bytesReceived = 0;
    let chunkCount = 0;
    let lastStderr = '';
    let destinationRtmp = '';
    let allDestinations: string[] = [];
    const bridgedToRawMap = new Map<string, string>();
    const ffmpegExe = getFfmpegPath();
    const useNvenc = isNvidiaNvencAvailable();

    const videoCodecArgs = useNvenc
      ? [
          '-c:v', 'h264_nvenc',
          '-preset', 'p1',
          '-tune', 'ull',
          '-zerolatency', '1',
          '-rc-lookahead', '0',
          '-delay', '0',
          '-forced-idr', '1',
          '-profile:v', 'main',
          '-rc', 'cbr',
          '-g', '30',
          '-bf', '0',
          '-b:v', '2500k',
          '-minrate', '2500k',
          '-maxrate', '2500k',
          '-bufsize', '500k',
          '-pix_fmt', 'yuv420p'
        ]
      : [
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-profile:v', 'main',
          '-level', '3.1',
          '-g', '30',
          '-keyint_min', '30',
          '-sc_threshold', '0',
          '-b:v', '2500k',
          '-minrate', '2500k',
          '-maxrate', '2500k',
          '-bufsize', '500k',
          '-x264-params', 'nal-hrd=cbr:force-cfr=1:sliced-threads=1:rc-lookahead=0:sync-lookahead=0:bframes=0',
          '-pix_fmt', 'yuv420p',
          '-threads', '0'
        ];

    const buildEncodingArgs = (hasOpusAudio: boolean, hasVp8Video: boolean) => {
      const inDecoderArgs = hasVp8Video ? ['-c:v', 'libvpx'] : [];
      if (hasOpusAudio) {
        return [
          '-hide_banner',
          '-fflags', '+genpts+igndts',
          '-probesize', '65536',
          '-analyzeduration', '200000',
          '-thread_queue_size', '512',
          ...inDecoderArgs,
          '-f', 'webm',
          '-i', 'pipe:0',
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-vf', 'scale=1280:720:flags=fast_bilinear,format=yuv420p',
          '-r', '30',
          '-fps_mode', 'cfr',
          ...videoCodecArgs,
          '-flags', '+global_header+low_delay',
          '-max_muxing_queue_size', '512',
          '-af', 'aresample=async=1',
          '-c:a', 'aac',
          '-b:a', '160k',
          '-ar', '48000',
          '-ac', '2',
          '-flush_packets', '1'
        ];
      }
      return [
        '-hide_banner',
        '-fflags', '+genpts+igndts',
        '-probesize', '65536',
        '-analyzeduration', '200000',
        '-thread_queue_size', '512',
        ...inDecoderArgs,
        '-f', 'webm',
        '-i', 'pipe:0',
        '-f', 'lavfi',
        '-i', 'anullsrc=r=48000:cl=stereo',
        '-shortest',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-vf', 'scale=1280:720:flags=fast_bilinear,format=yuv420p',
        '-r', '30',
        '-fps_mode', 'cfr',
        ...videoCodecArgs,
        '-flags', '+global_header+low_delay',
        '-max_muxing_queue_size', '512',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-ar', '48000',
        '-ac', '2',
        '-flush_packets', '1'
      ];
    };

    const spawnFfmpeg = (initialChunk: Buffer) => {
      if (isSpawned || relayInfo.replaced) return;
      isSpawned = true;

      const hasOpusAudio = initialChunk.includes(Buffer.from('A_OPUS'));
      const hasVp8Video = initialChunk.includes(Buffer.from('V_VP8'));
      const dynamicEncodingArgs = buildEncodingArgs(hasOpusAudio, hasVp8Video);

      const primaryOrigRaw = bridgedToRawMap.get(destinationRtmp) || destinationRtmp;
      const primaryRtmpExtra: string[] = [];
      if (primaryOrigRaw.toLowerCase().startsWith('rtmps://')) {
        const rtmpIdx = primaryOrigRaw.indexOf('/rtmp/');
        const tcBase = rtmpIdx !== -1 ? primaryOrigRaw.slice(0, rtmpIdx + 6) : primaryOrigRaw.replace(/\/[^\/]+$/, '/');
        primaryRtmpExtra.push(
          '-rtmp_tcurl', tcBase,
          '-rtmp_app', 'rtmp/',
          '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)'
        );
      }

      // 1. PRIMARY FFMPEG PROCESS (100% Dedicated & Isolated for Primary/YouTube Live Stream — Zero Interference)
      const primaryFfmpegArgs = [
        ...dynamicEncodingArgs,
        ...primaryRtmpExtra,
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        destinationRtmp
      ];

      // 2. SECONDARY SIMULCAST FFMPEG PROCESS (For additional platforms 2..5: TikTok, Instagram, Facebook, Threads/Custom)
      const secondaryDestinations = allDestinations.filter(d => d !== destinationRtmp).slice(0, 4);

      const spawnMsg = `[RtmpRelay] 🎬 Spawning Primary HD 720p30 FFmpeg #${connId} (hasOpus=${hasOpusAudio}) + ${secondaryDestinations.length} Secondary Platform(s) with initial chunk (${initialChunk.length} bytes)...`;
      console.log(spawnMsg);
      appendRelayLog(spawnMsg);

      try {
        boothStartGraceUntil.delete(normalizeBoothKey(boothId));
        syncBoothLiveToPostgres(boothId).catch(() => {});
        const bRes = streamController.startBroadcast(boothId);
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: 'SALES',
          entity: 'LIVE_STREAM',
          action: 'UPDATE',
          documentRef: `${boothId}_START`,
          data: bRes.booth
        });
      } catch (_) {}

      try {
        stopAutonomousMarketingBroadcaster(boothId);
      } catch (_) {}

      try {
        ffmpegProcess = spawn(ffmpegExe, primaryFfmpegArgs, {
          stdio: ['pipe', 'ignore', 'pipe'],
          windowsHide: true
        });
        relayInfo.ffmpeg = ffmpegProcess;
      } catch (spawnErr: any) {
        console.error('[RtmpRelay] Failed to spawn Primary FFmpeg:', spawnErr);
        appendRelayLog(`[RtmpRelay] Failed to spawn Primary FFmpeg: ${spawnErr?.message}`);
        scheduleFinalizeRelayStop(boothId, 6000);
        if (!relayInfo.replaced && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to spawn FFmpeg: ${spawnErr.message}` }));
          ws.close(1011, 'FFmpeg spawn failed');
        }
        return;
      }

      if (ffmpegProcess.stderr) {
        ffmpegProcess.stderr.on('data', (data) => {
          const text = data.toString();
          lastStderr = (lastStderr + '\n' + text).slice(-3000);
          const lines = text.trim().split(/[\r\n]+/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              console.log(`[FFmpeg ${boothId}#${connId}] ${trimmed}`);
              appendRelayLog(`[FFmpeg ${boothId}#${connId}] ${trimmed}`);
            }
          }
        });
      }

      ffmpegProcess.on('exit', (code, signal) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) {
          return;
        }
        const exitMsg = `[RtmpRelay] FFmpeg #${connId} for ${boothId} exited with code=${code}, signal=${signal}. Stderr: ${lastStderr.slice(-400)}`;
        console.warn(exitMsg);
        appendRelayLog(exitMsg);
        activeRelays.delete(boothId);
        if (ws.readyState === WebSocket.OPEN) {
          const errDetail = signal ? `FFmpeg terminated by ${signal}` : `FFmpeg exited code ${code}`;
          try {
            ws.send(JSON.stringify({ type: 'STREAM_ENDED', code, signal, error: `${errDetail}: ${lastStderr.slice(-200)}` }));
            ws.close(1011, 'FFmpeg stream ended');
          } catch (_) {}
        }
        if (softwareIntendedLive.has(boothId)) {
          handleSoftwareBoothBroadcastToggle(boothId, true);
        }
        scheduleFinalizeRelayStop(boothId, 6000);
      });

      ffmpegProcess.on('error', (err) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) {
          return;
        }
        console.error(`[RtmpRelay] FFmpeg #${connId} process error for ${boothId}:`, err);
        appendRelayLog(`[RtmpRelay] FFmpeg #${connId} process error for ${boothId}: ${err?.message}`);
        activeRelays.delete(boothId);
        scheduleFinalizeRelayStop(boothId, 6000);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
          ws.close(1011, err.message);
        }
      });

      if (ffmpegProcess.stdin) {
        ffmpegProcess.stdin.on('error', (stdinErr: any) => {
          if (stdinErr?.code !== 'EPIPE' && stdinErr?.code !== 'EOF') {
            console.warn(`[RtmpRelay] FFmpeg #${connId} stdin notice for ${boothId}:`, stdinErr?.message || stdinErr);
          }
        });
      }

      try {
        ffmpegProcess.stdin?.write(initialChunk);
      } catch (writeErr) {
        console.warn(`[RtmpRelay] Initial chunk write error:`, writeErr);
      }

      // Spawn isolated secondary simulcast processes per platform (Instagram, TikTok, Facebook, Threads)
      const secProcs: ChildProcess[] = [];
      relayInfo.secondaryFfmpegList = secProcs;
      const webmClusterMagic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
      const firstClusterOffset = initialChunk.indexOf(webmClusterMagic);
      const webmHeaderPrefix = firstClusterOffset > 0 ? Buffer.from(initialChunk.subarray(0, firstClusterOffset)) : null;
      relayInfo.webmHeaderPrefix = webmHeaderPrefix;
      broadcastRealtimeState(boothId, { type: 'STREAM_STATE', live: true });
      broadcastRealtimeChunk(boothId, initialChunk, webmHeaderPrefix);

      const launchSecondaryProc = (secDest: string, origRaw: string, isRetry: boolean, retryAttempt: number) => {
        if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) return;
        const secStartedAt = Date.now();
        try {
          const rtmpExtra: string[] = [];
          if (origRaw.toLowerCase().startsWith('rtmps://')) {
            const rtmpIdx = origRaw.indexOf('/rtmp/');
            const tcBase = rtmpIdx !== -1 ? origRaw.slice(0, rtmpIdx + 6) : origRaw.replace(/\/[^\/]+$/, '/');
            rtmpExtra.push(
              '-rtmp_tcurl', tcBase,
              '-rtmp_app', 'rtmp/',
              '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)'
            );
          }
          const secondaryArgs = [
            ...dynamicEncodingArgs,
            ...rtmpExtra,
            '-f', 'flv',
            '-flvflags', 'no_duration_filesize',
            secDest
          ];

          const secProc = spawn(ffmpegExe, secondaryArgs, {
            stdio: ['pipe', 'ignore', 'pipe'],
            windowsHide: true
          });
          if (isRetry && webmHeaderPrefix) {
            (secProc as any).__awaitingWebmCluster = true;
            (secProc as any).__webmHeaderPrefix = webmHeaderPrefix;
          }
          secProcs.push(secProc);
          relayInfo.secondaryFfmpeg = secProc;

          secProc.stderr?.on('data', (d) => {
            const s = d.toString().trim();
            if (s && !s.startsWith('frame=')) {
              appendRelayLog(`[SecFFmpeg ${boothId}#${connId}] ${s.slice(0, 240)}`);
            }
          });
          secProc.on('error', (secErr) => {
            console.warn(`[RtmpRelay] Secondary Simulcast FFmpeg #${connId} notice:`, secErr?.message);
          });
          secProc.on('exit', (code) => {
            const sIdx = secProcs.indexOf(secProc);
            if (sIdx !== -1) secProcs.splice(sIdx, 1);
            const secExit = `[RtmpRelay] Secondary Simulcast FFmpeg #${connId} (${origRaw.slice(0, 36)}...) exited (code=${code}); primary stream unaffected.`;
            console.log(secExit);
            appendRelayLog(secExit);
            // Reset consecutive failure count if this secondary stream ran smoothly for >45s
            const effectiveRetry = Date.now() - secStartedAt > 45000 ? 0 : retryAttempt;
            if (!relayInfo.replaced && activeRelays.get(boothId) === relayInfo && webmHeaderPrefix && effectiveRetry < 6) {
              setTimeout(async () => {
                if (relayInfo.replaced || activeRelays.get(boothId) !== relayInfo) return;
                try {
                  if (origRaw.includes('facebook.com') && effectiveRetry >= 1 && Date.now() - secStartedAt < 15000) {
                    activeBoothFbSessions.delete(normalizeBoothKey(boothId));
                  }
                  const freshTargets = await resolveActiveBoothRtmpTargets(boothId);
                  const targetPlat = origRaw.includes('facebook.com')
                    ? 'facebook'
                    : origRaw.includes('tiktok')
                    ? 'tiktok'
                    : origRaw.includes('fbcdn') || origRaw.includes('instagram')
                    ? 'instagram'
                    : origRaw.includes('threads')
                    ? 'threads'
                    : '';
                  const matchedTarget = targetPlat
                    ? freshTargets.find((t) => t.platform === targetPlat)
                    : freshTargets.find((t) => t.rawTargetUrl === origRaw);
                  const nextBridged = matchedTarget?.bridgedTargetUrl || secDest;
                  const nextRaw = matchedTarget?.rawTargetUrl || origRaw;
                  bridgedToRawMap.set(nextBridged, nextRaw);
                  appendRelayLog(`[RtmpRelay] 🔁 Auto-retrying secondary stream (${targetPlat || 'secondary'}, attempt ${effectiveRetry + 1}/6) for ${boothId}...`);
                  launchSecondaryProc(nextBridged, nextRaw, true, effectiveRetry + 1);
                } catch (_) {}
              }, 6000);
            }
          });
          if (secProc.stdin) {
            secProc.stdin.on('error', () => {});
            if (!isRetry) {
              secProc.stdin.write(initialChunk);
            }
          }
        } catch (secSpawnErr: any) {
          console.warn(`[RtmpRelay] Secondary Simulcast spawn warning (Primary stream unaffected):`, secSpawnErr?.message);
        }
      };

      if (secondaryDestinations.length > 0) {
        for (const secDest of secondaryDestinations) {
          const origRaw = bridgedToRawMap.get(secDest) || secDest;
          launchSecondaryProc(secDest, origRaw, false, 0);
        }
      }
    };

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (relayInfo.replaced) return;

      // Ignore JSON text control messages (e.g. client PING) so they never corrupt the WebM binary pipe
      if (!isBinary) {
        try {
          const txt = data.toString();
          if (txt.startsWith('{')) {
            const parsed = JSON.parse(txt);
            if (parsed.type === 'PING' && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
            }
            return;
          }
        } catch (_) {
          return;
        }
      }

      let buf: Buffer;
      if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (Array.isArray(data)) {
        buf = Buffer.concat(data);
      } else {
        buf = Buffer.from(data);
      }

      bytesReceived += buf.length;
      relayInfo.bytesReceived = bytesReceived;
      chunkCount++;

      if (!isSpawned) {
        pendingChunks.push(buf);
        pendingBytes += buf.length;
        if (isReadyToSpawn && pendingChunks.length >= 1) {
          const combined = Buffer.concat(pendingChunks);
          const ebmlMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
          const clusterMagic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
          const ebmlIdx = combined.indexOf(ebmlMagic);
          const clusterIdx = combined.indexOf(clusterMagic);
          if ((ebmlIdx !== -1 && clusterIdx > ebmlIdx) || (ebmlIdx !== -1 && (combined.length >= 12288 || pendingChunks.length >= 3))) {
            const alignedBuffer = ebmlIdx > 0 ? combined.subarray(ebmlIdx) : combined;
            pendingChunks.length = 0;
            spawnFfmpeg(alignedBuffer);
          } else if (combined.length >= 16384 || pendingChunks.length >= 4) {
            pendingChunks.length = 0;
            spawnFfmpeg(combined);
          }
        }
      } else {
        broadcastRealtimeChunk(boothId, buf, relayInfo.webmHeaderPrefix);
        if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          try {
            ffmpegProcess.stdin.write(buf);
          } catch (writeErr) {
            console.warn(`[RtmpRelay] Error writing to FFmpeg stdin:`, writeErr);
          }
        }
        if (relayInfo.secondaryFfmpegList && relayInfo.secondaryFfmpegList.length > 0) {
          const clusterMarker = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
          for (const sp of relayInfo.secondaryFfmpegList) {
            if (sp && sp.stdin && sp.stdin.writable) {
              try {
                if ((sp as any).__awaitingWebmCluster) {
                  const cIdx = buf.indexOf(clusterMarker);
                  if (cIdx !== -1) {
                    (sp as any).__awaitingWebmCluster = false;
                    if ((sp as any).__webmHeaderPrefix) {
                      sp.stdin.write((sp as any).__webmHeaderPrefix);
                    }
                    sp.stdin.write(buf.subarray(cIdx));
                  }
                } else {
                  sp.stdin.write(buf);
                }
              } catch (_) {}
            }
          }
        }
      }
    });

    // 15-second WebSocket Keep-Alive Ping to prevent Cloudflare Tunnel / Proxy 100s timeout during 24/7 streams
    const keepAliveTimer = setInterval(() => {
      if (!relayInfo.replaced && ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
          ws.send(JSON.stringify({
            type: 'HEARTBEAT',
            uptimeSec: Math.floor((Date.now() - relayInfo.startedAt) / 1000),
            bytesReceived
          }));
        } catch (_) {}
      }
    }, 15000);
    relayInfo.keepAliveTimer = keepAliveTimer;

    ws.on('close', (code, reason) => {
      clearInterval(keepAliveTimer);
      const reasonStr = reason ? reason.toString() : '';
      console.log(`[RtmpRelay] ⏹️ Client #${connId} disconnected for ${boothId} (chunks=${chunkCount}, bytes=${(bytesReceived / 1024 / 1024).toFixed(2)} MB, code=${code}, reason=${reasonStr})`);
      relayInfo.replaced = true;
      try {
        ffmpegProcess?.removeAllListeners('exit');
        ffmpegProcess?.removeAllListeners('error');
        if (ffmpegProcess && ffmpegProcess.stdin && ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.end();
        }
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      try {
        secondaryFfmpegProcess?.removeAllListeners('exit');
        secondaryFfmpegProcess?.removeAllListeners('error');
        if (secondaryFfmpegProcess && secondaryFfmpegProcess.stdin && secondaryFfmpegProcess.stdin.writable) {
          secondaryFfmpegProcess.stdin.end();
        }
        secondaryFfmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      if (relayInfo.secondaryFfmpegList) {
        for (const sp of relayInfo.secondaryFfmpegList) {
          try {
            sp?.removeAllListeners('exit');
            sp?.removeAllListeners('error');
            if (sp && sp.stdin && sp.stdin.writable) sp.stdin.end();
            sp?.kill('SIGTERM');
          } catch (_) {}
        }
      }
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
        if (reasonStr.includes('User stopped')) {
          softwareIntendedLive.delete(boothId);
          boothStartGraceUntil.delete(normalizeBoothKey(boothId));
          stopAutonomousMarketingBroadcaster(boothId);
          endBoothFacebookSession(boothId);
          finalizeRelayStop(boothId);
        } else {
          if (softwareIntendedLive.has(boothId)) {
            handleSoftwareBoothBroadcastToggle(boothId, true);
          }
          // Keep the active Facebook Live Video alive for up to 120s across network/WS reconnects
          cancelBoothFbIdleTimer(boothId);
          const bKey = normalizeBoothKey(boothId);
          fbSessionIdleTimers.set(
            bKey,
            setTimeout(() => {
              fbSessionIdleTimers.delete(bKey);
              if (!activeRelays.has(bKey) && !autonomousBoothActive.has(bKey) && !softwareIntendedLive.has(bKey)) {
                endBoothFacebookSession(bKey);
              }
            }, 120000)
          );
          // 6-second grace period so auto-reconnects never tear down YouTube chat or trigger false disconnect logs
          scheduleFinalizeRelayStop(boothId, 6000);
        }
      }
    });

    ws.on('error', (err) => {
      clearInterval(keepAliveTimer);
      console.warn(`[RtmpRelay] WebSocket #${connId} error for ${boothId}:`, err);
      relayInfo.replaced = true;
      try {
        ffmpegProcess?.removeAllListeners('exit');
        ffmpegProcess?.removeAllListeners('error');
        ffmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      try {
        secondaryFfmpegProcess?.removeAllListeners('exit');
        secondaryFfmpegProcess?.removeAllListeners('error');
        secondaryFfmpegProcess?.kill('SIGTERM');
      } catch (_) {}
      if (activeRelays.get(boothId) === relayInfo) {
        activeRelays.delete(boothId);
        scheduleFinalizeRelayStop(boothId, 6000);
      }
    });

    // Lookup RTMP Ingest URL and Stream Key: query params first (ignoring retired hardcoded key), then DB/booth channels
    const rawQueryKey = url.searchParams.get('streamKey')?.trim() || '';
    const retiredDefaultKey = ['edu8', 'fpef', 'kc0c', 's9cs', 'dath'].join('-');
    const queryKey = rawQueryKey && rawQueryKey !== retiredDefaultKey ? rawQueryKey : '';
    const queryUrl = url.searchParams.get('rtmpUrl');
    const aliases = getBoothAliases(boothId);

    let rtmpUrl = queryUrl?.trim() || 'rtmp://a.rtmp.youtube.com/live2';
    let streamKey = queryKey;
    const extraRtmpTargets: string[] = [];

    try {
      const activeFbBroadcasts: Array<{ id: string; token: string }> = [];
      const resolvedTargets = await resolveActiveBoothRtmpTargets(boothId);
      for (const t of resolvedTargets) {
        extraRtmpTargets.push(t.rawTargetUrl);
        if (t.platform === 'facebook' && t.fbLiveVideoId && t.fbAccessToken) {
          activeFbBroadcasts.push({ id: t.fbLiveVideoId, token: t.fbAccessToken });
        }
        if (t.platform === 'instagram' && t.igBroadcastId && t.igCookieHeader) {
          const bId = t.igBroadcastId;
          const cHdr = t.igCookieHeader;
          setTimeout(() => {
            if (!relayInfo.replaced) {
              tryAutoStartInstagramBroadcast(bId, cHdr).catch(() => {});
            }
          }, 4000);
        }
      }
      if (activeFbBroadcasts.length > 0) {
        relayInfo.activeFbBroadcasts = activeFbBroadcasts;
      }

      if (!streamKey) {
        const ytTarget = resolvedTargets.find((t) => t.platform === 'youtube' && t.streamKey);
        if (ytTarget?.streamKey) {
          streamKey = ytTarget.streamKey.trim();
          if (ytTarget.baseUrl) rtmpUrl = ytTarget.baseUrl;
        }
      }

      await withDb(async (client) => {
        try {
          const boothRes = await client.query(
            `SELECT master_stream_key, master_ingest_rtmp_url, youtube_stream_key FROM public.live_stream_booths WHERE booth_id = ANY($1::text[]) LIMIT 1`,
            [aliases]
          );
          const boothRow = boothRes.rows?.[0];
          const dbYtRaw = String(boothRow?.youtube_stream_key || boothRow?.master_stream_key || '').trim();
          if (!streamKey && dbYtRaw) {
            const decryptedMaster = decryptCredential(dbYtRaw);
            if (isValidRtmpStreamKey(decryptedMaster, 'youtube')) {
              streamKey = decryptedMaster;
              if (boothRow?.master_ingest_rtmp_url) {
                rtmpUrl = boothRow.master_ingest_rtmp_url;
              }
            }
          }
        } catch (bErr: any) {
          console.warn(`[RtmpRelay] live_stream_booths lookup notice:`, bErr?.message);
        }
      });
    } catch (e: any) {
      console.warn(`[RtmpRelay] DB lookup warning for ${boothId}:`, e?.message);
    }

    if (relayInfo.replaced || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let safeRtmpUrl = rtmpUrl;
    if (safeRtmpUrl.startsWith('rtmp://live.restream.io')) {
      safeRtmpUrl = safeRtmpUrl.replace('rtmp://live.restream.io', 'rtmps://live.restream.io');
    }
    const cleanRtmpBase = safeRtmpUrl.replace(/\/+$/, '');
    const cleanKey = streamKey.trim();
    const rawCandidates = cleanKey ? [`${cleanRtmpBase}/${cleanKey}`, ...extraRtmpTargets] : [...extraRtmpTargets];
    const rawAllDests = Array.from(new Set(rawCandidates)).slice(0, 5);
    if (rawAllDests.length === 0) {
      console.warn(`[RtmpRelay] No configured RTMP stream key for ${boothId}`);
      try { ws.close(1008, 'No active RTMP destination configured'); } catch (_) {}
      return;
    }
    const rawPrimaryDest = rawAllDests[0];
    destinationRtmp = await bridgeRtmpsUrlIfNeeded(rawPrimaryDest);
    bridgedToRawMap.set(destinationRtmp, rawPrimaryDest);
    allDestinations = await Promise.all(
      rawAllDests.map(async (d) => {
        const b = await bridgeRtmpsUrlIfNeeded(d);
        bridgedToRawMap.set(b, d);
        return b;
      })
    );
    isReadyToSpawn = true;

    console.log(`[RtmpRelay] 🚀 Primary target #${connId}: ${cleanRtmpBase}/****${cleanKey.slice(-4)} (Total Simulcast Platforms: ${allDestinations.length})`);

    // Automatically attach YouTube Live Chat poller AND all 5 social platform listeners for this booth
    const chatStatus = youTubeChatService.getBoothChatStatus(boothId);
    if (!chatStatus.isConnected) {
      youTubeChatService.connectBoothToYouTubeChat(boothId).catch(() => {});
    }
    socialChatService.connectAllBoothPlatforms(boothId).catch(() => {});

    // Notify client that pipe is established and ready for webm chunks
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'READY_FOR_CHUNKS',
        boothId,
        destination: `${cleanRtmpBase}/****${cleanKey.slice(-4)}`,
        simulcastCount: allDestinations.length
      }));
    }

    if (!isSpawned && pendingChunks.length > 0) {
      const combined = Buffer.concat(pendingChunks);
      const ebmlMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      const clusterMagic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
      const ebmlIdx = combined.indexOf(ebmlMagic);
      const clusterIdx = combined.indexOf(clusterMagic);
      if (ebmlIdx !== -1 && (clusterIdx > ebmlIdx || combined.length >= 12288)) {
        const alignedBuffer = ebmlIdx > 0 ? combined.subarray(ebmlIdx) : combined;
        pendingChunks.length = 0;
        spawnFfmpeg(alignedBuffer);
      }
    }
  });

  return wss;
}

export interface ResolvedPlatformTarget {
  platform: string;
  baseUrl: string;
  streamKey: string;
  rawTargetUrl: string;
  bridgedTargetUrl: string;
  igBroadcastId?: string;
  igCookieHeader?: string;
  ttRoomId?: string;
  fbLiveVideoId?: string;
  fbAccessToken?: string;
}

interface AutonomousPlatformWorker {
  platform: string;
  rawTargetUrl: string;
  proc: ChildProcess | null;
  status: 'STREAMING' | 'RECONNECTING' | 'STOPPED' | 'CIRCUIT_BREAKER_TRIPPED';
  startedAt: number;
  consecutiveFastFailures?: number;
  lastError?: string;
  retryTimer?: ReturnType<typeof setTimeout>;
  igBroadcastId?: string;
  igCookieHeader?: string;
  ttRoomId?: string;
}

const autonomousBoothWorkers = new Map<string, Map<string, AutonomousPlatformWorker>>();
const autonomousBoothActive = new Set<string>();

async function tryAutoCreateInstagramBroadcast(cookieHeader: string): Promise<{ uploadUrl?: string; broadcastId?: string }> {
  try {
    const body = new URLSearchParams({
      preview_width: '720',
      preview_height: '1280',
      broadcast_message: 'Vintage Vibes Al Ain Live Drop',
      internal_only: '0'
    });
    const res = await fetch('https://i.instagram.com/api/v1/live/create/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookieHeader
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return {};
    const data: any = await res.json();
    if (data?.upload_url && data?.broadcast_id) {
      return { uploadUrl: String(data.upload_url), broadcastId: String(data.broadcast_id) };
    }
  } catch (_) {}
  return {};
}

async function tryAutoStartInstagramBroadcast(broadcastId: string, cookieHeader: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ should_send_notifications: '1' });
    const res = await fetch(`https://i.instagram.com/api/v1/live/${encodeURIComponent(broadcastId)}/start/`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: cookieHeader
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000)
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export async function tryAutoCreateFacebookBroadcast(
  fbAccessToken: string,
  fbTargetId: string = 'me',
  title: string = 'Vintage Vibes UAE - Live Sale',
  boothId: string = 'booth-1'
): Promise<{ baseUrl?: string; streamKey?: string; rawTargetUrl?: string; fbLiveVideoId?: string; error?: string }> {
  if (!fbAccessToken) return { error: 'Missing Facebook access token' };
  const bKey = normalizeBoothKey(boothId);
  const cached = activeBoothFbSessions.get(bKey);
  if (cached && Date.now() - cached.createdAt < 7.5 * 3600 * 1000) {
    let shouldReuse = false;
    let shouldDiscard = false;
    try {
      const chkRes = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(cached.fbLiveVideoId)}?fields=id,status&access_token=${encodeURIComponent(fbAccessToken)}`,
        { signal: AbortSignal.timeout(3500) }
      );
      const chkData: any = await chkRes.json().catch(() => null);
      if (chkRes.ok && chkData?.status && chkData.status !== 'VOD') {
        shouldReuse = true;
      } else if (chkData?.status === 'VOD' || chkRes.status === 400 || chkRes.status === 404) {
        shouldDiscard = true;
      }
    } catch (_) {
      // Network timeout checking Meta Graph -> preserve active broadcast session rather than creating duplicates
      shouldReuse = true;
    }
    if (shouldReuse) {
      console.log(`[Facebook Auto-Live] ♻️ Reusing active Facebook Live Video ${cached.fbLiveVideoId} for ${bKey}`);
      return {
        baseUrl: cached.baseUrl,
        streamKey: cached.streamKey,
        rawTargetUrl: cached.rawTargetUrl,
        fbLiveVideoId: cached.fbLiveVideoId
      };
    }
    if (shouldDiscard) {
      activeBoothFbSessions.delete(bKey);
    }
  }
  const target = fbTargetId.trim() || 'me';
  try {
    const listRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(target)}/live_videos?limit=3&fields=id,status,secure_stream_url,stream_url&access_token=${encodeURIComponent(fbAccessToken)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const listData: any = await listRes.json().catch(() => null);
    const existingLive = Array.isArray(listData?.data)
      ? listData.data.find(
          (v: any) =>
            v?.id &&
            (v.status === 'LIVE' || v.status === 'LIVE_STOPPED') &&
            (v.secure_stream_url || v.stream_url)
        )
      : null;
    if (existingLive) {
      const existUrl = String(existingLive.secure_stream_url || existingLive.stream_url || '').trim();
      const split = splitRtmpBaseAndStreamKey('', existUrl, 'rtmps://live-api-s.facebook.com:443/rtmp');
      if (split.baseUrl && split.streamKey) {
        const rawTargetUrl = `${split.baseUrl}/${split.streamKey}`;
        activeBoothFbSessions.set(bKey, {
          fbLiveVideoId: String(existingLive.id),
          baseUrl: split.baseUrl,
          streamKey: split.streamKey,
          rawTargetUrl,
          fbAccessToken,
          createdAt: Date.now()
        });
        console.log(`[Facebook Auto-Live] ♻️ Adopted existing remote ${existingLive.status} Facebook Live Video ${existingLive.id} for ${bKey}`);
        return {
          baseUrl: split.baseUrl,
          streamKey: split.streamKey,
          rawTargetUrl,
          fbLiveVideoId: String(existingLive.id)
        };
      }
    }
  } catch (_) {}
  try {
    const body = new URLSearchParams({
      status: 'LIVE_NOW',
      title,
      description: 'Vintage Vibes UAE — Original Branded Vintage Apparel Live Sale',
      access_token: fbAccessToken
    });
    if (target === 'me') {
      body.set('privacy', JSON.stringify({ value: 'EVERYONE' }));
    }
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(target)}/live_videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
      signal: AbortSignal.timeout(10000)
    });
    const data: any = await res.json().catch(() => null);
    const ingestUrl = String(data?.secure_stream_url || data?.stream_url || '').trim();
    if (res.ok && ingestUrl && data?.id) {
      const split = splitRtmpBaseAndStreamKey('', ingestUrl, 'rtmps://live-api-s.facebook.com:443/rtmp');
      if (split.baseUrl && split.streamKey) {
        const rawTargetUrl = `${split.baseUrl}/${split.streamKey}`;
        activeBoothFbSessions.set(bKey, {
          fbLiveVideoId: String(data.id),
          baseUrl: split.baseUrl,
          streamKey: split.streamKey,
          rawTargetUrl,
          fbAccessToken,
          createdAt: Date.now()
        });
        console.log(`[Facebook Auto-Live] ✅ Auto-created Facebook Live Video ${data.id} -> ${split.baseUrl}/****${split.streamKey.slice(-6)}`);
        return {
          baseUrl: split.baseUrl,
          streamKey: split.streamKey,
          rawTargetUrl,
          fbLiveVideoId: String(data.id)
        };
      }
    }
    const errMsg = data?.error?.message || `HTTP ${res.status}`;
    console.warn(`[Facebook Auto-Live] ⚠️ Graph API live create warning (${target}): ${errMsg}`);
    return { error: errMsg };
  } catch (e: any) {
    return { error: e?.message || 'Network error' };
  }
}

export async function tryAutoEndFacebookBroadcast(fbLiveVideoId: string, fbAccessToken: string): Promise<boolean> {
  if (!fbLiveVideoId || !fbAccessToken) return false;
  try {
    const body = new URLSearchParams({
      end_live_video: 'true',
      access_token: fbAccessToken
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(fbLiveVideoId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      console.log(`[Facebook Auto-Live] ⏹️ Auto-ended Facebook Live Video ${fbLiveVideoId}`);
    }
    return res.ok;
  } catch (_) {
    return false;
  }
}

export async function tryAutoCreateTikTokBroadcast(
  cookieHeader: string,
  title: string = 'Vintage Vibes Al Ain Live Drop'
): Promise<{ rtmpPushUrl?: string; baseUrl?: string; streamKey?: string; roomId?: string; error?: string }> {
  if (!cookieHeader || (!cookieHeader.includes('sessionid') && !cookieHeader.includes('sid_tt'))) {
    return { error: 'Missing TikTok sessionid cookie' };
  }

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const endpoints = [
    {
      url: 'https://webcast.tiktok.com/webcast/room/create/?aid=1988&app_name=tiktok_web&device_platform=web&region=AE&priority_region=AE',
      method: 'POST' as const,
      body: new URLSearchParams({
        title,
        live_studio: '1',
        gen_replay: 'true',
        chat_auth: '1',
        gift_auth: '1'
      }).toString()
    },
    {
      url: 'https://webcast.tiktok.com/webcast/room/info_by_scene/?aid=1988&app_name=tiktok_web&device_platform=web&scene=tiktok_web_live_studio&region=AE',
      method: 'GET' as const
    },
    {
      url: 'https://webcast16-normal-c-alisg.tiktokv.com/webcast/room/create/?aid=1233&app_name=musical_ly&device_platform=android&region=AE',
      method: 'POST' as const,
      body: new URLSearchParams({ title, live_agreement: '1' }).toString()
    }
  ];

  let lastErr = '';
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'User-Agent': ua,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: 'https://livecenter.tiktok.com/producer',
          Origin: 'https://livecenter.tiktok.com',
          Cookie: cookieHeader
        },
        body: ep.method === 'POST' ? ep.body : undefined,
        signal: AbortSignal.timeout(8000)
      });
      const data: any = await res.json().catch(() => null);
      const roomData = data?.data?.room || data?.data;
      const streamUrlObj = roomData?.stream_url || data?.data?.stream_url;
      const pushUrl = String(
        streamUrlObj?.rtmp_push_url ||
        streamUrlObj?.complete_push_urls?.[0] ||
        roomData?.rtmp_push_url ||
        ''
      ).trim();

      if (pushUrl && (pushUrl.startsWith('rtmp://') || pushUrl.startsWith('rtmps://'))) {
        const split = splitRtmpBaseAndStreamKey('', pushUrl, 'rtmp://push.tiktok.com/live');
        const roomId = String(roomData?.id_str || roomData?.room_id_str || roomData?.id || '');
        console.log(`[TikTok Auto-Live] ✅ Auto-created TikTok Live Room ${roomId} -> ${split.baseUrl}/****${split.streamKey.slice(-6)}`);
        return {
          rtmpPushUrl: pushUrl,
          baseUrl: split.baseUrl,
          streamKey: split.streamKey,
          roomId
        };
      }
      if (data?.data?.prompts || data?.data?.message || data?.extra?.now) {
        lastErr = String(data?.data?.prompts || data?.data?.message || `Status ${ data?.status_code ?? res.status }`);
      }
    } catch (e: any) {
      lastErr = e?.message || 'Network error';
    }
  }

  return { error: lastErr || 'Could not auto-create TikTok Live room from cookies' };
}

export async function resolveActiveBoothRtmpTargets(boothId: string = 'booth-1'): Promise<ResolvedPlatformTarget[]> {
  const aliases = getBoothAliases(boothId);
  const defaultIngests: Record<string, string> = {
    youtube: 'rtmp://a.rtmp.youtube.com/live2',
    tiktok: 'rtmp://push.tiktok.com/live',
    facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
    instagram: 'rtmps://edgetee-upload-kul2-2.xx.fbcdn.net:443/rtmp',
    threads: 'rtmps://live.threads.net:443/rtmp',
    custom: 'rtmps://live.restream.io/live'
  };

  const results: ResolvedPlatformTarget[] = [];
  const seenPlatforms = new Set<string>();

  try {
    await withDb(async (client) => {
      // 1. Check booth_social_channels first
      try {
        const chRes = await client.query(
          `SELECT platform, account_password, proxy_url, metadata, session_cookies FROM public.booth_social_channels WHERE booth_id = ANY($1::text[]) AND is_active = true ORDER BY updated_at DESC NULLS LAST`,
          [aliases]
        );
        for (const row of chRes.rows || []) {
          const plat = String(row.platform || '').toLowerCase();
          if (!plat || seenPlatforms.has(plat)) continue;

          let igBroadcastId: string | undefined;
          let igCookieHeader: string | undefined;

          if (plat === 'instagram' && Array.isArray(row.session_cookies)) {
            const realCookies = row.session_cookies.filter(
              (c: any) => c?.name && c?.value && !String(c.value).startsWith('sid_') && !String(c.value).startsWith('at_')
            );
            if (realCookies.some((c: any) => c.name === 'sessionid')) {
              igCookieHeader = realCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
              const created = await tryAutoCreateInstagramBroadcast(igCookieHeader);
              if (created.uploadUrl) {
                const idx = created.uploadUrl.indexOf('/rtmp/');
                if (idx !== -1) {
                  const baseUrl = created.uploadUrl.slice(0, idx + 5);
                  const streamKey = created.uploadUrl.slice(idx + 6);
                  const rawTargetUrl = `${baseUrl}/${streamKey}`;
                  const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
                  seenPlatforms.add(plat);
                  results.push({
                    platform: plat,
                    baseUrl,
                    streamKey,
                    rawTargetUrl,
                    bridgedTargetUrl,
                    igBroadcastId: created.broadcastId,
                    igCookieHeader
                  });
                  continue;
                }
              }
            }
          }

          // TikTok Auto-Create Live Broadcast via Session Cookies (if available)
          if (plat === 'tiktok') {
            let ttCookieHeader = String(row.metadata?.cookieHeader || '').trim();
            if (!ttCookieHeader && Array.isArray(row.session_cookies)) {
              const realTtCookies = row.session_cookies.filter(
                (c: any) => c?.name && c?.value && !String(c.value).startsWith('sid_') && !String(c.value).startsWith('at_')
              );
              if (realTtCookies.some((c: any) => c.name === 'sessionid' || c.name === 'sid_tt' || c.name === 'sessionid_ss')) {
                ttCookieHeader = realTtCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
              }
            }
            if (ttCookieHeader) {
              const ttCreated = await tryAutoCreateTikTokBroadcast(ttCookieHeader);
              if (ttCreated.baseUrl && ttCreated.streamKey) {
                const rawTargetUrl = `${ttCreated.baseUrl}/${ttCreated.streamKey}`;
                const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
                seenPlatforms.add(plat);
                results.push({
                  platform: plat,
                  baseUrl: ttCreated.baseUrl,
                  streamKey: ttCreated.streamKey,
                  rawTargetUrl,
                  bridgedTargetUrl,
                  ttRoomId: ttCreated.roomId
                });
                continue;
              }
            }
          }

          // Facebook Auto-Create Live Broadcast via Official Meta Graph API Token (when configured)
          if (plat === 'facebook') {
            const fbAccessToken = decryptCredential(String(row.metadata?.fbAccessToken || '').trim()).trim();
            const fbTargetId = String(row.metadata?.fbTargetId || 'me').trim() || 'me';
            if (fbAccessToken) {
              const fbCreated = await tryAutoCreateFacebookBroadcast(fbAccessToken, fbTargetId, 'Vintage Vibes UAE - Live Sale', boothId);
              if (fbCreated.baseUrl && fbCreated.streamKey && fbCreated.rawTargetUrl) {
                const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(fbCreated.rawTargetUrl);
                seenPlatforms.add(plat);
                results.push({
                  platform: plat,
                  baseUrl: fbCreated.baseUrl,
                  streamKey: fbCreated.streamKey,
                  rawTargetUrl: fbCreated.rawTargetUrl,
                  bridgedTargetUrl,
                  fbLiveVideoId: fbCreated.fbLiveVideoId,
                  fbAccessToken
                });
                continue;
              }
            }
          }

          // IMPORTANT: Always prefer metadata.streamKey OVER account_password so login passwords (e.g. M@tti4102002) never shadow real stream keys!
          const metaKey = decryptCredential(String(row.metadata?.streamKey || '').trim()).trim();
          const rawPwd = decryptCredential(String(row.account_password || '').trim()).trim();
          const chosenKey = isValidRtmpStreamKey(metaKey, plat)
            ? metaKey
            : isValidRtmpStreamKey(rawPwd, plat)
            ? rawPwd
            : '';

          const customBase = String(row.metadata?.rtmpUrl || row.proxy_url || '').trim();
          const split = splitRtmpBaseAndStreamKey(customBase, chosenKey, defaultIngests[plat] || '');

          if (!isValidRtmpStreamKey(split.streamKey, plat)) continue;

          if (split.baseUrl) {
            const rawTargetUrl = `${split.baseUrl}/${split.streamKey}`;
            const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
            seenPlatforms.add(plat);
            results.push({
              platform: plat,
              baseUrl: split.baseUrl,
              streamKey: split.streamKey,
              rawTargetUrl,
              bridgedTargetUrl,
              igBroadcastId,
              igCookieHeader
            });
          }
        }
      } catch (_) {}

      // 2. Check live_stream_booths for any platform not already found in booth_social_channels
      try {
        const boothRes = await client.query(
          `SELECT * FROM public.live_stream_booths WHERE booth_id = ANY($1::text[]) LIMIT 1`,
          [aliases]
        );
        const boothRow = boothRes.rows?.[0];
        if (boothRow) {
          const directCols: Array<{ plat: string; key?: string }> = [
            { plat: 'youtube', key: boothRow.youtube_stream_key || boothRow.master_stream_key },
            { plat: 'instagram', key: boothRow.instagram_stream_key },
            { plat: 'tiktok', key: boothRow.tiktok_stream_key },
            { plat: 'facebook', key: boothRow.facebook_stream_key },
            { plat: 'threads', key: boothRow.threads_stream_key }
          ];
          for (const item of directCols) {
            if (seenPlatforms.has(item.plat)) continue;
            const dec = decryptCredential(String(item.key || '').trim()).trim();
            const split = splitRtmpBaseAndStreamKey('', dec, defaultIngests[item.plat] || '');
            if (!isValidRtmpStreamKey(split.streamKey, item.plat)) continue;
            if (split.baseUrl) {
              const rawTargetUrl = `${split.baseUrl}/${split.streamKey}`;
              const bridgedTargetUrl = await bridgeRtmpsUrlIfNeeded(rawTargetUrl);
              seenPlatforms.add(item.plat);
              results.push({
                platform: item.plat,
                baseUrl: split.baseUrl,
                streamKey: split.streamKey,
                rawTargetUrl,
                bridgedTargetUrl
              });
            }
          }
        }
      } catch (_) {}
    });
  } catch (_) {}

  return results;
}

function resolveMarketingLoopVideoPath(): string {
  const candidates = [
    path.join(process.cwd(), 'public', 'generated_reels', 'Vintage_Vibes_Reel_BAL-09-2026-0001-MEN-TEE-P0003_73703.mp4'),
    path.join(process.cwd(), 'public', 'generated_reels', 'Vintage_Vibes_Reel_BAL-10-2026-0002-MEN-TEE-P0002_42729.mp4'),
    path.join(process.cwd(), 'public', 'mazi_video.mp4'),
    path.join(process.cwd(), 'dist', 'mazi_video.mp4'),
    path.join(process.cwd(), 'public', 'gemini_generated_video_92517395.mp4'),
    path.join(process.cwd(), 'dist', 'gemini_generated_video_92517395.mp4')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).size > 100000) {
        return c;
      }
    } catch (_) {}
  }
  return candidates[2];
}

function spawnPlatformMarketingWorker(boothId: string, target: ResolvedPlatformTarget) {
  const bKey = normalizeBoothKey(boothId);
  if (!autonomousBoothActive.has(bKey)) return;

  let workersMap = autonomousBoothWorkers.get(bKey);
  if (!workersMap) {
    workersMap = new Map();
    autonomousBoothWorkers.set(bKey, workersMap);
  }

  const prev = workersMap.get(target.platform);
  if (prev) {
    if (prev.retryTimer) clearTimeout(prev.retryTimer);
    try {
      prev.proc?.removeAllListeners('exit');
      prev.proc?.kill('SIGTERM');
    } catch (_) {}
  }

  const videoPath = resolveMarketingLoopVideoPath();
  const ffmpegExe = getFfmpegPath();
  const useNvenc = isNvidiaNvencAvailable();
  const isVertical = target.platform === 'instagram' || target.platform === 'tiktok' || target.platform === 'threads';

  // TikTok Anti-Ban Guard:
  // 1) Add subtle dynamic grain/noise (`noise=alls=2:allf=t`) so consecutive loop cycles never have identical frame hashes (prevents "Static/Pre-recorded Loop" detection)
  // 2) Replace dead-silent `anullsrc` with ultra-low-volume warm room tone (`anoisesrc=color=pink:r=44100:a=0.004`) if source video has no audio track (prevents "Silent Unattended Stream" flag)
  const scaleFilter = isVertical
    ? 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,noise=alls=2:allf=t,format=yuv420p'
    : 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,noise=alls=2:allf=t,format=yuv420p';

  const vCodec = useNvenc
    ? ['-c:v', 'h264_nvenc', '-preset', 'p2', '-rc', 'cbr', '-b:v', '2500k', '-minrate', '2500k', '-maxrate', '2500k', '-bufsize', '3000k', '-g', '60', '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '3000k', '-g', '60', '-pix_fmt', 'yuv420p'];

  const rtmpExtraOutArgs: string[] = [];
  if (target.rawTargetUrl.toLowerCase().startsWith('rtmps://')) {
    rtmpExtraOutArgs.push(
      '-rtmp_tcurl', `${target.baseUrl}/`,
      '-rtmp_app', 'rtmp/',
      '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)'
    );
  }

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-re',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-f', 'lavfi',
    '-i', 'anoisesrc=color=pink:r=44100:a=0.004',
    '-shortest',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-map', '1:a:0',
    '-vf', scaleFilter,
    '-r', '30',
    ...vCodec,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    ...rtmpExtraOutArgs,
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    target.bridgedTargetUrl
  ];

  console.log(`[LiveMarketing] 📡 Starting ${target.platform.toUpperCase()} Live Stream for ${bKey} -> ${target.baseUrl}/****${target.streamKey.slice(-6)} (source: ${path.basename(videoPath)})`);

  const prevFastFailures = prev?.consecutiveFastFailures || 0;
  const worker: AutonomousPlatformWorker = {
    platform: target.platform,
    rawTargetUrl: target.rawTargetUrl,
    proc: null,
    status: 'STREAMING',
    startedAt: Date.now(),
    consecutiveFastFailures: prevFastFailures,
    igBroadcastId: target.igBroadcastId,
    igCookieHeader: target.igCookieHeader
  };
  workersMap.set(target.platform, worker);

  try {
    const proc = spawn(ffmpegExe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    worker.proc = proc;

    if (target.platform === 'instagram' && target.igBroadcastId && target.igCookieHeader) {
      const bId = target.igBroadcastId;
      const cHdr = target.igCookieHeader;
      setTimeout(() => {
        if (worker.status === 'STREAMING') {
          tryAutoStartInstagramBroadcast(bId, cHdr).then((ok) => {
            if (ok) console.log(`[LiveMarketing] ✅ Instagram Auto-Go-Live triggered for broadcast ${bId}!`);
          });
        }
      }, 3500);
    }

    let stderrTail = '';
    proc.stderr?.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-500);
    });

    proc.on('exit', (code) => {
      if (!autonomousBoothActive.has(bKey) || workersMap?.get(target.platform) !== worker) {
        return;
      }
      const uptimeMs = Date.now() - worker.startedAt;
      const fastFail = uptimeMs < 25000;
      const nextFailures = fastFail ? (worker.consecutiveFastFailures || 0) + 1 : 0;
      worker.consecutiveFastFailures = nextFailures;
      worker.lastError = stderrTail.trim() || `Exited code ${code}`;

      // TikTok & Social RTMP Anti-Ban Circuit Breaker:
      // Never hammer TikTok's RTMP server in an infinite 8-second loop if the key is rejected/suspended!
      const maxFastFailures = target.platform === 'tiktok' ? 2 : 5;
      if (nextFailures >= maxFastFailures) {
        worker.status = 'CIRCUIT_BREAKER_TRIPPED';
        console.warn(
          `[LiveMarketing] 🛡️ CIRCUIT BREAKER TRIPPED for ${target.platform.toUpperCase()} (${bKey}) after ${nextFailures} rapid disconnects (${worker.lastError}). Stopping auto-reconnect to protect account from RTMP spam ban.`
        );
        return;
      }

      worker.status = 'RECONNECTING';
      const backoffMs = target.platform === 'tiktok' ? 30000 * Math.max(1, nextFailures) : 8000;
      worker.retryTimer = setTimeout(async () => {
        if (!autonomousBoothActive.has(bKey)) return;
        const freshTargets = await resolveActiveBoothRtmpTargets(bKey);
        const fresh = freshTargets.find((t) => t.platform === target.platform) || target;
        spawnPlatformMarketingWorker(bKey, fresh);
      }, backoffMs);
    });
  } catch (err: any) {
    worker.status = 'RECONNECTING';
    worker.lastError = err?.message;
  }
}

export async function startAutonomousMarketingBroadcaster(boothId: string = 'booth-1'): Promise<{
  success: boolean;
  boothId: string;
  videoSource: string;
  activePlatforms: Array<{ platform: string; target: string; status: string }>;
}> {
  const bKey = normalizeBoothKey(boothId);
  cancelBoothFbIdleTimer(bKey);
  autonomousBoothActive.add(bKey);
  const targets = await resolveActiveBoothRtmpTargets(bKey);

  try {
    streamController.startBroadcast(bKey);
  } catch (_) {}

  for (const t of targets) {
    spawnPlatformMarketingWorker(bKey, t);
  }

  const workersMap = autonomousBoothWorkers.get(bKey) || new Map();
  return {
    success: true,
    boothId: bKey,
    videoSource: path.basename(resolveMarketingLoopVideoPath()),
    activePlatforms: Array.from(workersMap.values()).map((w) => ({
      platform: w.platform,
      target: w.rawTargetUrl.replace(/\/([^\/]{6})[^\/]+$/, '/$1••••'),
      status: w.status
    }))
  };
}

export function stopAutonomousMarketingBroadcaster(boothId: string = 'booth-1') {
  const bKey = normalizeBoothKey(boothId);
  autonomousBoothActive.delete(bKey);
  const workersMap = autonomousBoothWorkers.get(bKey);
  if (workersMap) {
    for (const w of workersMap.values()) {
      w.status = 'STOPPED';
      if (w.retryTimer) clearTimeout(w.retryTimer);
      try {
        w.proc?.removeAllListeners('exit');
        w.proc?.kill('SIGTERM');
      } catch (_) {}
    }
    workersMap.clear();
  }
  return { success: true, boothId: bKey };
}

export function getAutonomousMarketingBroadcasterStatus(boothId: string = 'booth-1') {
  const bKey = normalizeBoothKey(boothId);
  const workersMap = autonomousBoothWorkers.get(bKey);
  const list = workersMap
    ? Array.from(workersMap.values()).map((w) => ({
        platform: w.platform,
        target: w.rawTargetUrl.replace(/\/([^\/]{6})[^\/]+$/, '/$1••••'),
        status: w.status,
        uptimeSeconds: Math.floor((Date.now() - w.startedAt) / 1000),
        lastError: w.lastError
      }))
    : [];
  return {
    boothId: bKey,
    isActive: autonomousBoothActive.has(bKey),
    videoSource: path.basename(resolveMarketingLoopVideoPath()),
    platforms: list
  };
}

export function handleSoftwareBoothBroadcastToggle(boothId: string = 'booth-1', isBroadcasting: boolean) {
  const bKey = normalizeBoothKey(boothId);
  const existingFallback = softwareLiveFallbackTimers.get(bKey);
  if (existingFallback) {
    clearTimeout(existingFallback);
    softwareLiveFallbackTimers.delete(bKey);
  }

  if (!isBroadcasting) {
    softwareIntendedLive.delete(bKey);
    boothStartGraceUntil.delete(bKey);
    appendRelayLog(`[SoftwareToggle] ⏹️ Software requested STOP for ${bKey}`);
    stopAutonomousMarketingBroadcaster(bKey);
    endBoothFacebookSession(bKey);
    syncBoothStoppedToPostgres(bKey).catch(() => {});
    const active = activeRelays.get(bKey);
    if (active) {
      active.replaced = true;
      activeRelays.delete(bKey);
      if (active.keepAliveTimer) clearInterval(active.keepAliveTimer);
      try {
        active.ffmpeg?.removeAllListeners('exit');
        active.ffmpeg?.kill('SIGTERM');
      } catch (_) {}
      if (active.secondaryFfmpegList) {
        for (const sp of active.secondaryFfmpegList) {
          try {
            sp?.removeAllListeners('exit');
            sp?.kill('SIGTERM');
          } catch (_) {}
        }
      }
      try {
        if (active.ws?.readyState === WebSocket.OPEN) {
          active.ws.close(1000, 'User stopped stream');
        }
      } catch (_) {}
    }
    return;
  }

  softwareIntendedLive.add(bKey);
  if (activeRelays.has(bKey) || autonomousBoothActive.has(bKey)) {
    return;
  }

  appendRelayLog(`[SoftwareToggle] 🔴 Software requested GO LIVE for ${bKey}; arming 2.5s multi-platform stream guarantee...`);
  const timer = setTimeout(() => {
    softwareLiveFallbackTimers.delete(bKey);
    if (!softwareIntendedLive.has(bKey)) return;
    if (activeRelays.has(bKey) || autonomousBoothActive.has(bKey)) return;
    appendRelayLog(`[SoftwareToggle] 🚀 Launching server multi-platform stream for ${bKey} (YouTube + Instagram + all configured keys)`);
    startAutonomousMarketingBroadcaster(bKey).catch(() => {});
    try {
      const chatStatus = youTubeChatService.getBoothChatStatus(bKey);
      if (!chatStatus.isConnected) {
        youTubeChatService.connectBoothToYouTubeChat(bKey).catch(() => {});
      }
      socialChatService.connectAllBoothPlatforms(bKey).catch(() => {});
    } catch (_) {}
  }, 2500);

  softwareLiveFallbackTimers.set(bKey, timer);
}

