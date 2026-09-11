import React, { useState, useEffect } from 'react';
import { CompanyProfile, TikTokLiveSocketConfig } from '../setup.types.ts';
import {
  Wifi,
  Radio,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Tag,
  Clock,
  ExternalLink,
  MessageSquare,
  Flame,
  Users,
  Eye,
  Check,
  Play,
  Square,
  Sparkles
} from 'lucide-react';
import { useSync } from '../../../context/SyncContext.tsx';

interface TikTokSocketSetupCardProps {
  companyProfile: CompanyProfile;
  onSaveProfile: (updated: CompanyProfile) => Promise<void>;
  showMsg: (msg: string, type?: 'success' | 'error') => void;
}

export const TikTokSocketSetupCard: React.FC<TikTokSocketSetupCardProps> = ({
  companyProfile,
  onSaveProfile,
  showMsg
}) => {
  const { syncVersion } = useSync();

  const defaultSocketConfig: TikTokLiveSocketConfig = {
    enabled: true,
    tiktokUsername: '@vintage_dubai_live',
    autoReconnect: true,
    connectionStatus: 'DISCONNECTED',
    claimKeywords: ['CLAIM', 'MINE', 'BIN', 'TAKE', 'BUY'],
    autoLockPieces: true,
    defaultLockDurationSeconds: 900
  };

  const [socketConfig, setSocketConfig] = useState<TikTokLiveSocketConfig>(() => {
    return companyProfile.tiktokLiveSocket || defaultSocketConfig;
  });

  const [liveStats, setLiveStats] = useState<{
    username: string;
    roomId?: string;
    status: string;
    viewerCount: number;
    totalLikes: number;
    totalDiamonds: number;
    commentsCount: number;
    claimsCount: number;
    isRealConnection: boolean;
    errorMessage?: string;
  }>({
    username: '',
    status: 'DISCONNECTED',
    viewerCount: 0,
    totalLikes: 0,
    totalDiamonds: 0,
    commentsCount: 0,
    claimsCount: 0,
    isRealConnection: true
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Poll live socket status from backend
  const fetchSocketStatus = async () => {
    try {
      const res = await fetch('/api/live-stream/tiktok-socket/status');
      if (res.ok) {
        const data = await res.json();
        setLiveStats(data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchSocketStatus();
    const interval = setInterval(fetchSocketStatus, 2500);
    return () => clearInterval(interval);
  }, [syncVersion]);

  const handleConnectSocket = async () => {
    if (!socketConfig.tiktokUsername) {
      showMsg('Please enter a valid TikTok username (e.g. @vintage_dubai_live)', 'error');
      return;
    }

    setIsConnecting(true);
    try {
      const res = await fetch('/api/live-stream/tiktok-socket/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: socketConfig.tiktokUsername })
      });
      const data = await res.json();

      if (data.success) {
        setLiveStats(data.stats);
        showMsg(`🟢 Real TikTok Live WebSocket connected to ${socketConfig.tiktokUsername}!`);
      } else {
        showMsg(`Could not connect: ${data.error || 'Stream may be offline'}`, 'error');
      }
    } catch (err: any) {
      showMsg('Failed to trigger TikTok socket connection', 'error');
    } finally {
      setIsConnecting(false);
      fetchSocketStatus();
    }
  };

  const handleDisconnectSocket = async () => {
    try {
      const res = await fetch('/api/live-stream/tiktok-socket/disconnect', { method: 'POST' });
      const data = await res.json();
      setLiveStats(data.stats);
      showMsg('TikTok Live WebSocket disconnected.');
    } catch {
      showMsg('Disconnect failed', 'error');
    }
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim().toUpperCase();
    if (!trimmed) return;
    if (!socketConfig.claimKeywords.includes(trimmed)) {
      setSocketConfig({
        ...socketConfig,
        claimKeywords: [...socketConfig.claimKeywords, trimmed]
      });
    }
    setNewKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setSocketConfig({
      ...socketConfig,
      claimKeywords: socketConfig.claimKeywords.filter(k => k !== kw)
    });
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const updated: CompanyProfile = {
        ...companyProfile,
        tiktokLiveSocket: socketConfig
      };
      await onSaveProfile(updated);
      showMsg('TikTok Live Socket configuration saved!');
    } catch {
      showMsg('Failed to save socket settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isLive = liveStats.status === 'LIVE' || liveStats.status === 'CONNECTED';

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 p-4 rounded-lg text-white border border-purple-800/50 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-wide uppercase">Real TikTok Live WebSocket Connector</h2>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 ${isLive ? 'bg-emerald-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-white' : 'bg-slate-400'}`}></span>
                {liveStats.status}
              </span>
            </div>
            <p className="text-xs text-purple-200 mt-0.5">
              Direct WebSocket scraper bridge: Connects to your real TikTok Live room without API keys to pull live viewer chat, gifts, and auto-detect item claims in real time!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          {isLive ? (
            <button
              type="button"
              onClick={handleDisconnectSocket}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white shadow-xs transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectSocket}
              disabled={isConnecting || !socketConfig.tiktokUsername}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-xs transition-colors"
            >
              <Play className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
              <span>{isConnecting ? 'Connecting...' : 'Connect Live Room'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-xs transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Live Telemetry KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Live Viewers</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900">{liveStats.viewerCount.toLocaleString()}</div>
          <span className="text-[10px] text-slate-500">TikTok room audience</span>
        </div>

        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Comments Ingested</span>
            <MessageSquare className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-black text-purple-900">{liveStats.commentsCount.toLocaleString()}</div>
          <span className="text-[10px] text-slate-500">Real-time WebSocket chat</span>
        </div>

        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Auto-Claim Intents</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600">{liveStats.claimsCount.toLocaleString()}</div>
          <span className="text-[10px] text-slate-500">Keyword-matched claims</span>
        </div>

        <div className="bg-white p-3 rounded border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Diamonds / Gifts</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-700">{liveStats.totalDiamonds.toLocaleString()}</div>
          <span className="text-[10px] text-slate-500">Total diamonds earned</span>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Connection Details */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2 border-slate-100">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-purple-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Live Room Connection</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-500">Protobuf WebSocket Bridge</span>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">TikTok Creator Username</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="@username (e.g. @vintage_dubai_live)"
                value={socketConfig.tiktokUsername}
                onChange={e => setSocketConfig({ ...socketConfig, tiktokUsername: e.target.value })}
                className="flex-1 text-xs font-mono font-bold border border-slate-300 rounded p-2 focus:ring-1 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={handleConnectSocket}
                disabled={isConnecting || !socketConfig.tiktokUsername}
                className="px-3 py-1.5 rounded text-xs font-black bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white transition-colors"
              >
                {isLive ? 'Re-Connect' : 'Connect'}
              </button>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Enter the exact TikTok username currently broadcasting live. No app password or developer approval needed.
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-bold text-slate-800">Auto-Reconnect on network drop</span>
              <input
                type="checkbox"
                checked={socketConfig.autoReconnect}
                onChange={e => setSocketConfig({ ...socketConfig, autoReconnect: e.target.checked })}
                className="rounded text-purple-600"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-bold text-slate-800">Auto-lock garment on live claim</span>
              <input
                type="checkbox"
                checked={socketConfig.autoLockPieces}
                onChange={e => setSocketConfig({ ...socketConfig, autoLockPieces: e.target.checked })}
                className="rounded text-purple-600"
              />
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Garment Reservation Lock Duration
            </label>
            <select
              value={socketConfig.defaultLockDurationSeconds || 900}
              onChange={e => setSocketConfig({ ...socketConfig, defaultLockDurationSeconds: Number(e.target.value) })}
              className="w-full text-xs font-medium border border-slate-300 rounded p-2 focus:ring-1 focus:ring-purple-500 bg-white"
            >
              <option value="300">5 Minutes (Ultra-Fast Flash Sale)</option>
              <option value="600">10 Minutes</option>
              <option value="900">15 Minutes (Recommended Live Drop Standard)</option>
              <option value="1800">30 Minutes</option>
              <option value="3600">60 Minutes</option>
            </select>
            <span className="text-[10px] text-slate-400">Time given to live buyer to complete WhatsApp / Web payment before item releases back to stream.</span>
          </div>
        </div>

        {/* Card 2: AI Claim Keywords Filter */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2 border-slate-100">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Live Claim Keywords</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-500">Regex NLP Parser</span>
          </div>

          <p className="text-[11px] text-slate-600">
            When a live viewer comments any of these trigger words (e.g. <code>"CLAIM VV-BAL-001"</code> or <code>"MINE"</code>), the socket recognizes the claim intent:
          </p>

          <div className="flex flex-wrap gap-1.5 min-h-[50px] p-2 bg-slate-50 rounded border border-slate-200">
            {socketConfig.claimKeywords.map(kw => (
              <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-100 text-purple-900 text-xs font-bold border border-purple-200">
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw)}
                  className="text-purple-500 hover:text-rose-700 ml-0.5"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add custom keyword (e.g. TAKE, DIB)"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); } }}
              className="flex-1 text-xs border border-slate-300 rounded p-2 uppercase font-bold"
            />
            <button
              type="button"
              onClick={handleAddKeyword}
              className="px-3 py-1.5 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white"
            >
              Add Tag
            </button>
          </div>

          <div className="p-3 bg-purple-50/70 rounded border border-purple-200 text-purple-950 text-[11px] space-y-1">
            <p className="font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-700" />
              <span>Instant Auto-Detection:</span>
            </p>
            <p className="text-[10px] text-purple-900 leading-relaxed">
              If a buyer comments <b>"CLAIM [BARCODE]"</b>, the socket automatically pairs the piece in inventory with their TikTok username, reserves the item on the live broadcaster's screen, and displays their sticker for thermal printing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
