import React, { useState, useEffect, useRef } from 'react';
import { Zap, Camera, Bot, ExternalLink, Play, Square, SkipForward, Sparkles, RotateCcw, Mic, Video } from 'lucide-react';

interface NextGenLiveControlPanelProps {
  boothId: string;
  activePiece?: any;
  isBroadcasting?: boolean;
  onPinSkuOnDesk?: (sku: string) => void;
}

export const NextGenLiveControlPanel: React.FC<NextGenLiveControlPanelProps> = ({
  boothId,
  activePiece,
  isBroadcasting,
  onPinSkuOnDesk
}) => {
  const cleanBooth = String(boothId || 'booth-1').trim() || 'booth-1';
  const [status, setStatus] = useState<any>(null);
  const [skuOverride, setSkuOverride] = useState<string>('');
  const [priceDraft, setPriceDraft] = useState<string>('25');
  const [durSec, setDurSec] = useState<number>(15);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchBusy, setMatchBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [cloneDrawerOpen, setCloneDrawerOpen] = useState(false);
  const [hostDisplayName, setHostDisplayName] = useState('Vintage Vibes Filipina Host');
  const [sourceAudioB64, setSourceAudioB64] = useState('');
  const [consentAudioB64, setConsentAudioB64] = useState('');
  const [recordingSlot, setRecordingSlot] = useState<'source' | 'consent' | null>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string>('');
  const matchInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const srcAudioInputRef = useRef<HTMLInputElement | null>(null);
  const conAudioInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);

  const activeSku = String(activePiece?.barcode || activePiece?.sku || '').trim();
  const effectiveSku = skuOverride.trim() || activeSku;

  useEffect(() => {
    if (activePiece?.estimatedPrice && !skuOverride.trim()) {
      setPriceDraft(String(Math.max(10, Math.round(Number(activePiece.estimatedPrice) || 25))));
    }
  }, [activePiece?.barcode, activePiece?.estimatedPrice, skuOverride]);

  const fetchStatus = async () => {
    try {
      const r = await fetch(`/api/live/nextgen/status?boothId=${encodeURIComponent(cleanBooth)}`);
      if (r.ok) setStatus(await r.json());
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 2500);
    return () => clearInterval(t);
  }, [cleanBooth]);

  const apiPost = async (url: string, body?: any) => {
    setActionMsg('');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok && d?.error) setActionMsg(String(d.error));
      await fetchStatus();
      return d;
    } catch (e: any) {
      setActionMsg(e?.message || 'Request failed');
      return null;
    }
  };

  const handleStartBid = (overrideSku?: string) => {
    const skuToUse = String(overrideSku || effectiveSku || '').trim();
    if (!skuToUse) {
      setActionMsg('Pehle koi SKU select ya scan karein.');
      return;
    }
    if (overrideSku && onPinSkuOnDesk) onPinSkuOnDesk(overrideSku);
    apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/whatnot-auction/start`, {
      sku: skuToUse,
      startPriceAed: Number(priceDraft) || 25,
      durationSec: durSec
    });
  };

  const handleVisualMatchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatchBusy(true);
    setActionMsg('');
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onloadend = () => resolve(String(rd.result || ''));
        rd.onerror = reject;
        rd.readAsDataURL(file);
      });
      const r = await fetch(`/api/live/booths/${encodeURIComponent(cleanBooth)}/visual-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: b64, topK: 3, isCameraFrame: true })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(d.matches)) {
        setMatches(d.matches);
      } else {
        setActionMsg(d?.error || 'Match failed');
      }
    } catch (err: any) {
      setActionMsg(err?.message || 'Match error');
    } finally {
      setMatchBusy(false);
      e.target.value = '';
    }
  };

  const handleUploadHostPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setActionMsg('');
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onloadend = () => resolve(String(rd.result || ''));
        rd.onerror = reject;
        rd.readAsDataURL(file);
      });
      const d = await apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/upload-avatar`, {
        mediaBase64: b64,
        mimeType: file.type || ''
      });
      if (d?.ok) {
        setActionMsg(
          d.avatarType === 'video'
            ? '✅ Hubahu 10s Video Host Twin baked & ready!'
            : '✅ 1-Photo Virtual AI Host avatar updated!'
        );
      }
    } finally {
      setAvatarBusy(false);
      e.target.value = '';
    }
  };

  const handleCaptureLiveHost = async () => {
    setCaptureBusy(true);
    setActionMsg('');
    try {
      const d = await apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/capture-live-host`);
      if (d?.ok) setActionMsg('✅ Live stream se real host ka video twin capture ho gaya!');
    } finally {
      setCaptureBusy(false);
    }
  };

  const handleVoicePresetChange = async (preset: string) => {
    const d = await apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/voice-preset`, {
      voicePreset: preset
    });
    if (d?.ok) setActionMsg(`✅ Host voice set to ${preset}`);
  };

  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, slot: 'source' | 'consent') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await new Promise<string>((resolve, reject) => {
      const rd = new FileReader();
      rd.onloadend = () => resolve(String(rd.result || ''));
      rd.onerror = reject;
      rd.readAsDataURL(file);
    });
    if (slot === 'source') setSourceAudioB64(b64);
    else setConsentAudioB64(b64);
    e.target.value = '';
  };

  const handleToggleMicRecord = async (slot: 'source' | 'consent') => {
    if (recordingSlot === slot && mediaRecRef.current) {
      mediaRecRef.current.stop();
      setRecordingSlot(null);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setActionMsg('Browser mic unavailable — please upload an audio file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const b64 = await new Promise<string>((resolve, reject) => {
          const rd = new FileReader();
          rd.onloadend = () => resolve(String(rd.result || ''));
          rd.onerror = reject;
          rd.readAsDataURL(blob);
        });
        if (slot === 'source') setSourceAudioB64(b64);
        else setConsentAudioB64(b64);
      };
      mediaRecRef.current = rec;
      rec.start();
      setRecordingSlot(slot);
    } catch (err: any) {
      setActionMsg(err?.message || 'Mic permission denied');
    }
  };

  const handleCloneVoice = async () => {
    if (!sourceAudioB64 || !consentAudioB64) {
      setActionMsg('Dono audio clips zaroori hain: (1) 15s speaking sample aur (2) 5s consent clip.');
      return;
    }
    setCloneBusy(true);
    setActionMsg('');
    try {
      const d = await apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/clone-voice`, {
        sourceAudioBase64: sourceAudioB64,
        consentAudioBase64: consentAudioB64,
        displayName: hostDisplayName
      });
      if (d?.ok) {
        setActionMsg(`✅ Real host ki exact voice clone ready! (${d.voiceId})`);
        setCloneDrawerOpen(false);
      }
    } finally {
      setCloneBusy(false);
    }
  };

  const auc = status?.whatnotAuction;
  const aiHost = status?.aiNightHost;
  const mtx = status?.mediamtx;
  const vm = status?.visualMatcher;

  return (
    <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-4 text-white shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-black">
            <Sparkles className="w-3.5 h-3.5" /> NEXT-GEN VIRTUAL AI &amp; WHATNOT HUB
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${mtx?.running ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
            ⚡ 0.3s WebRTC: {mtx?.running ? 'ON' : 'STANDBY'}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 border border-slate-700 text-sky-300">
            📷 Visual Index: {vm?.indexedCount ?? 0} SKUs
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${status?.tryOn?.ready ? 'bg-violet-950/70 border-violet-500/60 text-violet-300' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
            👗 AI Try-On: {status?.tryOn?.ready ? 'READY' : 'OFF'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a href="/live/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 text-xs font-bold">
            Buyer Room (/live) <ExternalLink className="w-3 h-3" />
          </a>
          <a href="/live/desk.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold">
            Live Desk <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {actionMsg && (
        <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-amber-950/70 border border-amber-500/40 text-amber-200">
          {actionMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. WHATNOT 10s SUDDEN-DEATH BIDDING */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4" /> Whatnot Live Auction
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {auc?.status && auc.status !== 'IDLE' ? `${auc.status} • AED ${auc.currentBidAed} (${Math.ceil((auc.remainingMs || 0) / 1000)}s)` : 'IDLE'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <input
              value={skuOverride}
              onChange={(e) => setSkuOverride(e.target.value)}
              placeholder={activeSku || 'SKU...'}
              className="col-span-1 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
            />
            <input
              type="number"
              min={5}
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
              placeholder="AED"
            />
            <select
              value={durSec}
              onChange={(e) => setDurSec(Number(e.target.value))}
              className="px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-white"
            >
              <option value={10}>10s</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => handleStartBid()} className="flex-1 py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-600 text-white text-xs font-black cursor-pointer">
              ⚡ Start Bid
            </button>
            <button type="button" onClick={() => apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/whatnot-auction/end`)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold cursor-pointer">
              End
            </button>
            <button type="button" onClick={() => apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/whatnot-auction/reset`)} className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs cursor-pointer" title="Reset">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. ZERO-CLICK VISUAL GARMENT MATCHER */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <Camera className="w-4 h-4" /> Zero-Click Garment Match
            </span>
            <input ref={matchInputRef} type="file" accept="image/*" className="hidden" onChange={handleVisualMatchFile} />
            <button
              type="button"
              disabled={matchBusy}
              onClick={() => matchInputRef.current?.click()}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-black cursor-pointer disabled:opacity-50"
            >
              {matchBusy ? 'Matching...' : '📷 Match Photo'}
            </button>
          </div>
          {matches.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              Kisi bhi kapre ki photo select karein — AI 15ms mein {vm?.indexedCount ?? 860} ERP pieces mein se exact SKU dhoondh kar Pin + Bid kar dega.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {matches.map((m) => (
                <div key={m.sku} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                  <img src={m.frontImageUrl || '/app-icon.png'} alt={m.sku} className="w-8 h-9 rounded object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-white truncate">{m.title}</div>
                    <div className="text-[10px] text-slate-400">{m.sku} • {m.confidencePct}% • AED {m.retailPriceAed}</div>
                  </div>
                  <button type="button" onClick={() => handleStartBid(m.sku)} className="px-2 py-1 rounded bg-amber-500 text-slate-950 text-[10px] font-black cursor-pointer shrink-0">
                    Pin &amp; Bid
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. HUBAHU FILIPINA AI LIVE HOST TWIN (10s VIDEO + VOICE CLONE) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img src={aiHost?.avatarUrl || '/assets/models/vintage_vibes_master_host.png'} alt="AI Host" className="w-7 h-7 rounded-full object-cover border border-emerald-500/60 shrink-0" />
              <span className="text-xs font-black text-emerald-300 flex items-center gap-1 truncate">
                <Bot className="w-3.5 h-3.5 shrink-0" /> 🇵🇭 Virtual AI Host Twin
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black border shrink-0 ${aiHost?.avatarType === 'video' ? 'bg-sky-950/70 border-sky-500/50 text-sky-300' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
                {aiHost?.avatarType === 'video' ? 'VIDEO TWIN' : 'PHOTO TWIN'}
              </span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${aiHost?.active ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' : 'bg-slate-800 text-slate-400'}`}>
              {aiHost?.active ? (aiHost.liveTalkingRunning ? '🎥 TALKING LIVE' : `LIVE (${aiHost.currentSku || 'ACTIVE'})`) : (aiHost?.liveTalkingInstalled ? 'READY' : 'STUDIO')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-2">
            {aiHost?.active && aiHost?.currentScriptEn
              ? aiHost.currentScriptEn
              : isBroadcasting
              ? 'Human broadcast ON hai — live host capture karke hubahu Filipina AI Twin tayyar kar sakte hain.'
              : 'Host ki 10s video (ya photo) + Filipino voice lagayein — bilkul wohi larki live host karegi.'}
          </p>
          <input ref={avatarInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleUploadHostPhoto} />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              title="Real host ki 8–12s MP4/WebM video ya clear photo upload karein"
            >
              <Video className="w-3 h-3 shrink-0" /> {avatarBusy ? 'Baking...' : '🎬 10s Video / Photo'}
            </button>
            <button
              type="button"
              disabled={captureBusy}
              onClick={handleCaptureLiveHost}
              className="px-2 py-1.5 rounded-lg bg-sky-900/70 hover:bg-sky-800 border border-sky-500/40 text-sky-200 text-[11px] font-bold cursor-pointer disabled:opacity-50"
              title="Live chalte stream se seedha host ki video capture karein"
            >
              {captureBusy ? 'Capturing...' : '📸 Capture Live Host'}
            </button>
          </div>
          <div className="flex gap-1.5 items-center">
            <select
              value={aiHost?.voicePreset || 'ph_female_en'}
              onChange={(e) => handleVoicePresetChange(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white font-semibold"
            >
              <option value="ph_female_en">🇵🇭 Filipino Female (Rosa EN)</option>
              <option value="ph_female_tl">🇵🇭 Taglish / Filipino (Blessica)</option>
              <option value="gemini_clone" disabled={!aiHost?.geminiVoiceCloned}>
                🎤 Exact Cloned Host Voice {aiHost?.geminiVoiceCloned ? '✓' : '(Clone First)'}
              </option>
            </select>
            <button
              type="button"
              onClick={() => setCloneDrawerOpen((v) => !v)}
              className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0 ${cloneDrawerOpen ? 'bg-violet-600/30 border-violet-400 text-violet-200' : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-violet-300'}`}
            >
              <Mic className="w-3 h-3" /> Clone Voice
            </button>
          </div>

          {cloneDrawerOpen && (
            <div className="bg-slate-950/90 border border-violet-500/40 rounded-lg p-2.5 space-y-2 text-[11px]">
              <div className="text-violet-200 font-bold">🎤 Exact Host Voice Cloning (Gemini 3.8 TTS)</div>
              <div className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 rounded p-1.5">
                Consent clip mein host se yeh jumla bulwayein: <span className="text-emerald-300 italic">&ldquo;I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.&rdquo;</span>
              </div>
              <input
                value={hostDisplayName}
                onChange={(e) => setHostDisplayName(e.target.value)}
                placeholder="Host Name (e.g. Ate Joy)"
                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-white"
              />
              <input ref={srcAudioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleAudioFileSelect(e, 'source')} />
              <input ref={conAudioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleAudioFileSelect(e, 'consent')} />
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-slate-900 border border-slate-800 rounded p-1.5 space-y-1">
                  <div className="text-[10px] font-bold text-slate-300">1. 15s Speaking Sample {sourceAudioB64 ? '✅' : ''}</div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleToggleMicRecord('source')} className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer ${recordingSlot === 'source' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                      {recordingSlot === 'source' ? '⏹ Stop' : '🎙️ Rec'}
                    </button>
                    <button type="button" onClick={() => srcAudioInputRef.current?.click()} className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer">
                      📁
                    </button>
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded p-1.5 space-y-1">
                  <div className="text-[10px] font-bold text-slate-300">2. 5s Consent Clip {consentAudioB64 ? '✅' : ''}</div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleToggleMicRecord('consent')} className={`flex-1 py-1 rounded text-[10px] font-bold cursor-pointer ${recordingSlot === 'consent' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
                      {recordingSlot === 'consent' ? '⏹ Stop' : '🎙️ Rec'}
                    </button>
                    <button type="button" onClick={() => conAudioInputRef.current?.click()} className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer">
                      📁
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={cloneBusy || !sourceAudioB64 || !consentAudioB64}
                onClick={handleCloneVoice}
                className="w-full py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-black cursor-pointer disabled:opacity-50"
              >
                {cloneBusy ? 'Cloning with Gemini 3.8...' : '✨ Clone Exact Voice'}
              </button>
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/start`, { cycleSec: 35 })}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <Play className="w-3 h-3" /> Start AI Live
            </button>
            <button
              type="button"
              onClick={() => apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/next`)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <SkipForward className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => apiPost(`/api/live/booths/${encodeURIComponent(cleanBooth)}/ai-night-host/stop`)}
              className="px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Square className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
