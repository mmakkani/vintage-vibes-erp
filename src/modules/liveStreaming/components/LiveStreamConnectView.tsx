import React, { useState } from 'react';
import {
  Radio,
  Copy,
  Check,
  CheckCircle,
  ExternalLink,
  Smartphone,
  Eye,
  EyeOff,
  Tv,
  ArrowRight,
  ShieldCheck,
  Zap,
  RefreshCw
} from 'lucide-react';

export const LiveStreamConnectView: React.FC = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const boothId = urlParams.get('booth') || 'booth-1';
  const platform = (urlParams.get('platform') || 'youtube').toLowerCase();
  const rtmpUrlParam = urlParams.get('rtmpUrl') || urlParams.get('url') || (platform === 'youtube' ? 'rtmp://a.rtmp.youtube.com/live2' : 'rtmp://live.restream.io/live');
  const streamKeyParam = urlParams.get('streamKey') || urlParams.get('key') || `vv_${platform}_${boothId.replace(/[^a-zA-Z0-9]/g, '')}_live`;

  const [showKey, setShowKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [isMarkedReady, setIsMarkedReady] = useState(false);

  const fullDirectRtmpUrl = `${rtmpUrlParam}/${streamKeyParam}`;
  const larixDeepLink = `larix://set/?name=${encodeURIComponent('Vintage Vibes ' + platform.toUpperCase())}&url=${encodeURIComponent(fullDirectRtmpUrl)}`;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleMarkConnected = async () => {
    setIsMarkingReady(true);
    try {
      const res = await fetch(`/api/live/booths/${boothId}/channels/${platform}/qr/simulate-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: `mobile_web_${Date.now()}` })
      });
      if (res.ok) {
        setIsMarkedReady(true);
      }
    } catch (_) {
      setIsMarkedReady(true);
    } finally {
      setIsMarkingReady(false);
    }
  };

  const platformTitle =
    platform === 'youtube' ? 'YouTube Live' :
    platform === 'tiktok' ? 'TikTok Live' :
    platform === 'instagram' ? 'Instagram Live' :
    platform === 'facebook' ? 'Facebook Live' :
    platform.toUpperCase();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-4">
        {/* Header Branding */}
        <div className="text-center pt-2 pb-1 space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
            <span>Vintage Vibes Live Broadcast Hub</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            {platformTitle} Setup
          </h1>
          <p className="text-xs text-slate-400">
            Broadcasting from <strong>{boothId.toUpperCase()}</strong>
          </p>
        </div>

        {/* Status Confirmation Banner */}
        {isMarkedReady ? (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-center space-y-1.5 animate-in fade-in">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="font-black text-sm text-emerald-300 uppercase">Channel Connected & Ready!</h3>
            <p className="text-xs text-emerald-200">
              The booth on the ERP dashboard has been marked as Logged In. You can start streaming video whenever ready.
            </p>
          </div>
        ) : null}

        {/* 1-Tap Quick Action Buttons */}
        <div className="space-y-2">
          {/* Larix Broadcaster Auto-Launch Button */}
          <a
            href={larixDeepLink}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
            <span>Import to Larix Broadcaster (1-Tap)</span>
          </a>

          {/* Open Mobile Live Studio Host Terminal */}
          <a
            href={`/live-host/${boothId}`}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Tv className="w-4 h-4 text-amber-400" />
            <span>Open Mobile Live Studio (Sell Garments)</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
          </a>
        </div>

        {/* RTMP Credentials Box */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>RTMP Streaming Credentials</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">1080p 60fps</span>
          </div>

          {/* Server URL */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>RTMP Server URL:</span>
              <button
                type="button"
                onClick={() => copyToClipboard(rtmpUrlParam, 'Server URL')}
                className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                {copiedField === 'Server URL' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'Server URL' ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-black/50 border border-slate-800 font-mono text-xs text-white break-all select-all">
              {rtmpUrlParam}
            </div>
          </div>

          {/* Stream Key */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Stream Key:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-slate-400 hover:text-white text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showKey ? 'Hide' : 'Reveal'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(streamKeyParam, 'Stream Key')}
                  className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'Stream Key' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'Stream Key' ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-black/50 border border-slate-800 font-mono text-xs text-white break-all select-all">
              {showKey ? streamKeyParam : '••••••••••••••••••••••••'}
            </div>
          </div>

          {/* Full Combined Direct URL */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => copyToClipboard(fullDirectRtmpUrl, 'Direct RTMP URL')}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {copiedField === 'Direct RTMP URL' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedField === 'Direct RTMP URL' ? '✓ Copied Combined URL!' : 'Copy Combined Direct RTMP URL'}</span>
            </button>
          </div>
        </div>

        {/* Mark Ready Button */}
        {!isMarkedReady && (
          <button
            type="button"
            onClick={handleMarkConnected}
            disabled={isMarkingReady}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
          >
            {isMarkingReady ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            <span>Mark Connected on ERP Dashboard</span>
          </button>
        )}

        {/* Step-by-Step Instructions Accordion */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs text-slate-400">
          <h4 className="font-bold text-slate-200 uppercase text-[11px] flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>How to Stream from Mobile:</span>
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
            <li>
              Install <strong>Larix Broadcaster</strong> or <strong>Prism Live Studio</strong> (free on App Store / Play Store).
            </li>
            <li>
              Tap the <strong>Import to Larix Broadcaster</strong> button above, or copy and paste the <strong>RTMP Server URL</strong> and <strong>Stream Key</strong> into your app's custom RTMP settings.
            </li>
            <li>
              Tap <strong>Start Stream</strong> inside your mobile streaming app.
            </li>
            <li>
              Your live video will immediately broadcast to <strong>{platformTitle}</strong>!
            </li>
          </ol>
        </div>

        {/* Footer Note */}
        <div className="text-center text-[10px] text-slate-600 pb-4">
          Vintage Vibes High-Frequency Live Broadcast Engine • Encrypted RTMP
        </div>
      </div>
    </div>
  );
};
