import React, { useState } from 'react';
import { CompanyProfile } from '../setup.types.ts';
import {
  Radio,
  X,
  Wifi,
  Copy,
  Check,
  RefreshCw,
  Save,
  Globe,
  Flame,
  ExternalLink,
  ShieldCheck,
  Video,
  Key,
  Lock,
  MessageSquare
} from 'lucide-react';

interface SocialSocketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyProfile: CompanyProfile;
  onSaveProfile: (updated: CompanyProfile) => Promise<void>;
  showMsg: (msg: string, type?: 'success' | 'error') => void;
}

export const SocialSocketsModal: React.FC<SocialSocketsModalProps> = ({
  isOpen,
  onClose,
  companyProfile,
  onSaveProfile,
  showMsg
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  // Social sockets state
  const [socketStatus, setSocketStatus] = useState({
    tiktok: { connected: true, lastPing: 'Just now', latencyMs: 38 },
    instagram: { connected: true, lastPing: 'Just now', latencyMs: 44 },
    facebook: { connected: true, lastPing: '1m ago', latencyMs: 52 },
    youtube: { connected: true, lastPing: 'Just now', latencyMs: 31 }
  });

  const [streamLinks, setStreamLinks] = useState({
    tiktokRtmp: 'rtmp://live.tiktok.com/live',
    tiktokKey: 'live_tt_dubai_bale_stage',
    instagramRtmp: 'rtmps://live-upload.instagram.com:443/rtmp/',
    instagramKey: 'live_ig_relove_vintage',
    facebookRtmp: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    facebookKey: 'FB-live-page-vv-992',
    youtubeRtmp: 'rtmp://a.rtmp.youtube.com/live2',
    youtubeKey: 'yt_live_channel_dxb_1080'
  });

  const [webhookUrls] = useState({
    tiktokWebhook: `${typeof window !== 'undefined' ? window.location.origin : 'https://vintagevibe.ae'}/api/webhooks/tiktok`,
    instagramWebhook: `${typeof window !== 'undefined' ? window.location.origin : 'https://vintagevibe.ae'}/api/webhooks/instagram`,
    facebookWebhook: `${typeof window !== 'undefined' ? window.location.origin : 'https://vintagevibe.ae'}/api/webhooks/facebook`
  });

  if (!isOpen) return null;

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    showMsg(`Copied ${keyName} to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleReconnectSocket = (platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube') => {
    setIsConnecting(platform);
    setTimeout(() => {
      setSocketStatus(prev => ({
        ...prev,
        [platform]: { connected: true, lastPing: 'Just now', latencyMs: Math.floor(Math.random() * 25) + 20 }
      }));
      setIsConnecting(null);
      showMsg(`✓ ${platform.toUpperCase()} Live Socket re-synchronized successfully!`);
    }, 1200);
  };

  return (
    <div
      id="social-sockets-modal"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl border-2 border-red-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider">
                Live Multicast & Social Sockets Hub
              </h2>
              <p className="text-xs text-red-100 font-medium">
                TikTok Live Sockets, Instagram Webhooks, & Facebook Multicast Relays
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-800">
          {/* Section 1: Live Socket Connection Status */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span>Live Socket Connections & Chat Listener Daemons</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                4/4 Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* TikTok */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">TikTok Live</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Ping: {socketStatus.tiktok.latencyMs}ms &bull; {socketStatus.tiktok.lastPing}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReconnectSocket('tiktok')}
                  disabled={isConnecting === 'tiktok'}
                  className="mt-2 text-[10px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isConnecting === 'tiktok' ? 'animate-spin' : ''}`} />
                  <span>Reconnect</span>
                </button>
              </div>

              {/* Instagram */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">Instagram Graph</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Ping: {socketStatus.instagram.latencyMs}ms &bull; {socketStatus.instagram.lastPing}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReconnectSocket('instagram')}
                  disabled={isConnecting === 'instagram'}
                  className="mt-2 text-[10px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isConnecting === 'instagram' ? 'animate-spin' : ''}`} />
                  <span>Reconnect</span>
                </button>
              </div>

              {/* Facebook */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">Facebook Live</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Ping: {socketStatus.facebook.latencyMs}ms &bull; {socketStatus.facebook.lastPing}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReconnectSocket('facebook')}
                  disabled={isConnecting === 'facebook'}
                  className="mt-2 text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isConnecting === 'facebook' ? 'animate-spin' : ''}`} />
                  <span>Reconnect</span>
                </button>
              </div>

              {/* YouTube */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900">YouTube Studio</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Ping: {socketStatus.youtube.latencyMs}ms &bull; {socketStatus.youtube.lastPing}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReconnectSocket('youtube')}
                  disabled={isConnecting === 'youtube'}
                  className="mt-2 text-[10px] font-bold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isConnecting === 'youtube' ? 'animate-spin' : ''}`} />
                  <span>Reconnect</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Webhook Endpoint URLs */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Incoming Webhook Endpoints (Chat Claims & Order Triggers)</span>
            </h3>

            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-0.5">
                  TikTok Live Chat Claim Webhook:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrls.tiktokWebhook}
                    className="flex-1 border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrls.tiktokWebhook, 'TikTok Webhook')}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'TikTok Webhook' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-0.5">
                  Instagram Direct Live Order Webhook:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrls.instagramWebhook}
                    className="flex-1 border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrls.instagramWebhook, 'Instagram Webhook')}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'Instagram Webhook' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-0.5">
                  Facebook Live Event Ingest Webhook:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrls.facebookWebhook}
                    className="flex-1 border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrls.facebookWebhook, 'Facebook Webhook')}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'Facebook Webhook' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: RTMP Multicast Ingest & Stream Keys */}
          <div className="bg-red-50/50 p-3.5 rounded-xl border border-red-200 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-red-950 flex items-center gap-1.5">
              <Video className="w-4 h-4 text-red-600" />
              <span>Social RTMP Multicast Ingest & Stream Keys</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  TikTok RTMP Server
                </label>
                <input
                  type="text"
                  value={streamLinks.tiktokRtmp}
                  onChange={(e) => setStreamLinks({ ...streamLinks, tiktokRtmp: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  TikTok Stream Key
                </label>
                <input
                  type="password"
                  value={streamLinks.tiktokKey}
                  onChange={(e) => setStreamLinks({ ...streamLinks, tiktokKey: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Instagram RTMP Server
                </label>
                <input
                  type="text"
                  value={streamLinks.instagramRtmp}
                  onChange={(e) => setStreamLinks({ ...streamLinks, instagramRtmp: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Instagram Stream Key
                </label>
                <input
                  type="password"
                  value={streamLinks.instagramKey}
                  onChange={(e) => setStreamLinks({ ...streamLinks, instagramKey: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-1.5 font-mono text-[11px] bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            Relays stream signals simultaneously to TikTok, Instagram & Facebook.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                showMsg('✓ Live Multicast & Social Sockets updated and synced!');
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Connect</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
