import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle,
  Phone,
  Video,
  Paperclip,
  Mic,
  Square,
  Send,
  X,
  Download,
  FileText,
  Smile,
  MicOff,
  VideoOff,
  RefreshCw,
  PhoneOff,
  Crown,
  Eye,
  CornerUpLeft,
  Maximize2,
  Minimize2,
  MapPin,
  UserPlus,
  Camera,
  Headphones,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { CompanyProfile } from '../setup/setup.types.ts';

interface LivePrivateMessage {
  id: string;
  sender: 'buyer' | 'admin' | 'peer';
  senderName: string;
  text?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  attachment?: {
    url: string;
    kind: 'image' | 'video' | 'audio' | 'pdf' | 'document';
    name: string;
    mime: string;
    sizeBytes: number;
  };
  contactCard?: {
    name: string;
    phone: string;
  };
  locationPin?: {
    lat?: number;
    lng?: number;
    label?: string;
    mapsUrl?: string;
  };
  replyTo?: {
    id: string;
    senderName: string;
    preview: string;
  };
  callLog?: {
    mode: 'audio' | 'video';
    status: string;
    durationSec?: number;
  };
  pieceCard?: {
    sku: string;
    title: string;
    priceAed: number;
    frontImageUrl?: string;
  };
  createdAt?: string;
  ts?: string;
}

interface StoredCustomer {
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

interface CallState {
  callId: string;
  mode: 'audio' | 'video';
  phase: 'calling' | 'incoming' | 'active';
  peerName: string;
  statusSub?: string;
  muted: boolean;
  camOff: boolean;
  facing: 'user' | 'environment';
  connectedAt: number;
  fitContain?: boolean;
  pipSwapped?: boolean;
}

const QUICK_EMOJIS = ['😊', '👍', '❤️', '🔥', '🙌', '😍', '🙏', '✅', '✨', '👌', '🧥', '👖', '📦', '🎉'];

function loadStoredVipCustomer(): StoredCustomer | null {
  try {
    const raw1 = localStorage.getItem('vv_live_customer_v1');
    if (raw1) {
      const p = JSON.parse(raw1);
      if (p && p.name && String(p.phone || '').replace(/\D/g, '').length >= 7) {
        return { name: String(p.name).trim(), phone: String(p.phone).trim(), email: p.email || '', address: p.address || '' };
      }
    }
    const raw2 = localStorage.getItem('vv_customer_session');
    if (raw2) {
      const c = JSON.parse(raw2);
      if (c && c.name && String(c.phone || '').replace(/\D/g, '').length >= 7) {
        return { name: String(c.name).trim(), phone: String(c.phone).trim(), email: c.email || '', address: c.address || '' };
      }
    }
  } catch (_) {}
  return null;
}

function getThreadIdFromPhone(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? `wa_${digits}` : '';
}

function formatShortTime(ts?: string): string {
  if (!ts) return 'now';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'now';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return 'now';
  }
}

function formatBytes(n?: number): string {
  const b = Number(n || 0);
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

type PreparedAttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'document';

async function prepareAttachmentFile(file: File): Promise<{ dataUrl: string; mime: string; name: string; kind: PreparedAttachmentKind; sizeBytes: number }> {
  const fname = file.name || 'file';
  const mtype = file.type || '';
  const isImg = /^image\/(jpeg|png|webp|gif)$/i.test(mtype);
  const isVid = /^video\/(mp4|quicktime|webm)$/i.test(mtype) || /\.(mp4|mov|webm)$/i.test(fname);
  const isAud = /^audio\//i.test(mtype) || /\.(mp3|m4a|wav|ogg)$/i.test(fname);
  const isPdf = mtype === 'application/pdf' || /\.pdf$/i.test(fname);
  const isDoc = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|txt|csv)$/i.test(fname);
  if (!isImg && !isVid && !isAud && !isPdf && !isDoc) throw new Error('Unsupported file type. Max 20 MB.');
  if (file.size > 20 * 1024 * 1024) throw new Error('File must be 20 MB or smaller.');

  if (isImg && mtype !== 'image/gif') {
    const objUrl = URL.createObjectURL(file);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1600;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            const sc = Math.min(maxDim / w, maxDim / h);
            w = Math.max(1, Math.round(w * sc));
            h = Math.max(1, Math.round(h * sc));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = objUrl;
      });
      return { dataUrl, mime: 'image/jpeg', name: fname, kind: 'image', sizeBytes: file.size };
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const kind: PreparedAttachmentKind = isImg ? 'image' : (isVid ? 'video' : (isAud ? 'audio' : (isPdf ? 'pdf' : 'document')));
  return {
    dataUrl,
    mime: mtype || (isPdf ? 'application/pdf' : isVid ? 'video/mp4' : isAud ? 'audio/mpeg' : 'application/octet-stream'),
    name: fname,
    kind,
    sizeBytes: file.size
  };
}

export const StorefrontVipChatCallWidget: React.FC<{ companyProfile?: CompanyProfile | null }> = ({ companyProfile }) => {
  const [customer, setCustomer] = useState<StoredCustomer | null>(() => loadStoredVipCustomer());
  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupCity, setSetupCity] = useState('');
  const [setupErr, setSetupErr] = useState('');

  const [isOpen, setIsOpen] = useState(false);
  const [deskOnline, setDeskOnline] = useState(false);
  const [deskTyping, setDeskTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<LivePrivateMessage[]>([]);
  const [draftText, setDraftText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyQuote, setReplyQuote] = useState<{ id: string; senderName: string; preview: string } | null>(null);
  const [stagedAtt, setStagedAtt] = useState<{ dataUrl: string; mime: string; name: string; kind: PreparedAttachmentKind; sizeBytes: number } | null>(null);
  const [recordingSec, setRecordingSec] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const [drawerFullScreen, setDrawerFullScreen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [contactPhoneDraft, setContactPhoneDraft] = useState('');
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [locLabelDraft, setLocLabelDraft] = useState('');
  const [locFetching, setLocFetching] = useState(false);

  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; name: string } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [callElapsedSec, setCallElapsedSec] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const listRef = useRef<HTMLDivElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const camInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const attachWrapRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const callStateRef = useRef<CallState | null>(null);
  callStateRef.current = callState;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callRootRef = useRef<HTMLDivElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const cachedIceRef = useRef<RTCIceServer[]>([{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]);

  const threadId = getThreadIdFromPhone(customer?.phone);

  const playChime = useCallback((incomingCall = false) => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(incomingCall ? 640 : 587, ctx.currentTime);
      osc.frequency.setValueAtTime(incomingCall ? 880 : 880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.055, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (incomingCall ? 0.44 : 0.26));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.46);
      setTimeout(() => { try { ctx.close(); } catch (_) {} }, 650);
    } catch (_) {}
  }, []);

  const stopRing = useCallback(() => {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
  }, []);

  const startRing = useCallback((incoming: boolean) => {
    stopRing();
    playChime(incoming);
    ringIntervalRef.current = setInterval(() => playChime(incoming), 2600);
  }, [playChime, stopRing]);

  const cleanupCall = useCallback(() => {
    stopRing();
    if (durIntervalRef.current) { clearInterval(durIntervalRef.current); durIntervalRef.current = null; }
    if (pcRef.current) {
      try {
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.close();
      } catch (_) {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach((t) => t.stop()); } catch (_) {}
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (_) {}
    setCallState(null);
    setCallElapsedSec(0);
  }, [stopRing]);

  const loadIceServers = useCallback(async () => {
    try {
      const r = await fetch('/api/live/call/ice-config');
      const d = await r.json();
      if (d && Array.isArray(d.iceServers) && d.iceServers.length > 0) {
        cachedIceRef.current = d.iceServers;
      }
    } catch (_) {}
    return cachedIceRef.current;
  }, []);

  const flushPendingIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queue = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
  }, []);

  const buildPc = useCallback(async (callId: string) => {
    const iceServers = await loadIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((tr) => pc.addTrack(tr, localStreamRef.current!));
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ type: 'CALL_ICE', callId, candidate: ev.candidate })); } catch (_) {}
      }
    };
    pc.ontrack = (ev) => {
      const stream = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      remoteStreamRef.current = stream;
      const swapped = Boolean(callStateRef.current?.pipSwapped);
      const primaryEl = swapped ? localVideoRef.current : remoteVideoRef.current;
      const secondaryEl = swapped ? remoteVideoRef.current : localVideoRef.current;
      if (primaryEl && !swapped) {
        primaryEl.srcObject = stream;
        primaryEl.play().catch(() => {});
      } else if (secondaryEl && swapped) {
        secondaryEl.srcObject = stream;
        secondaryEl.play().catch(() => {});
      }
      setCallState((prev) => prev ? { ...prev } : prev);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        stopRing();
        setCallState((prev) => prev ? { ...prev, phase: 'active', connectedAt: prev.connectedAt || Date.now() } : prev);
        if (!durIntervalRef.current) {
          const started = Date.now();
          durIntervalRef.current = setInterval(() => {
            setCallElapsedSec(Math.max(0, Math.floor((Date.now() - started) / 1000)));
          }, 1000);
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupCall();
      }
    };
    return pc;
  }, [cleanupCall, loadIceServers, stopRing]);

  const loadThreadMessages = useCallback(async (tid: string, phone: string) => {
    try {
      const viewerParam = isOpenRef.current ? 'buyer' : 'peek';
      const r = await fetch(`/api/live/messenger/thread/${encodeURIComponent(tid)}?viewer=${viewerParam}&phone=${encodeURIComponent(phone)}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d?.thread) {
        setMessages(Array.isArray(d.thread.messages) ? d.thread.messages : []);
        if (!isOpenRef.current) {
          setUnreadCount(Number(d.thread.unreadByBuyer || 0));
        } else {
          setUnreadCount(0);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!threadId || !customer?.phone) return;
    loadThreadMessages(threadId, customer.phone);

    let disposed = false;
    const connect = () => {
      if (disposed) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const sock = new WebSocket(`${proto}//${window.location.host}/api/live/stream/messenger?boothId=booth-1&role=buyer&threadId=${encodeURIComponent(threadId)}`);
      wsRef.current = sock;
      sock.onmessage = async (ev) => {
        try {
          const j = JSON.parse(String(ev.data || '{}'));
          if (!j) return;
          if (j.type === 'PRESENCE_UPDATE') {
            setDeskOnline(Boolean(j.adminOnline));
          } else if (j.type === 'TYPING' && j.fromRole === 'admin') {
            setDeskTyping(true);
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setDeskTyping(false), 2500);
          } else if (j.type === 'PRIVATE_MSG' && j.message) {
            setDeskTyping(false);
            setMessages((prev) => prev.some((x) => x.id === j.message.id) ? prev : [...prev, j.message]);
            if (j.message.sender === 'admin') {
              playChime(false);
              if (!isOpenRef.current) setUnreadCount((u) => u + 1);
            }
          } else if (j.type === 'CALL_INVITE' && j.fromRole === 'admin') {
            if (callStateRef.current) {
              sock.send(JSON.stringify({ type: 'CALL_BUSY', callId: j.callId }));
              return;
            }
            const mode = j.mode === 'video' ? 'video' : 'audio';
            setIsOpen(true);
            setCallState({
              callId: j.callId,
              mode,
              phase: 'incoming',
              peerName: j.callerName || 'Vintage Vibes Desk',
              muted: false,
              camOff: false,
              facing: 'user',
              connectedAt: 0
            });
            startRing(true);
            sock.send(JSON.stringify({ type: 'CALL_RINGING', callId: j.callId }));
          } else if (j.type === 'CALL_ACCEPT' && callStateRef.current && j.callId === callStateRef.current.callId) {
            stopRing();
            setCallState((prev) => prev ? { ...prev, phase: 'active' } : prev);
            const pc = await buildPc(j.callId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sock.send(JSON.stringify({ type: 'CALL_OFFER', callId: j.callId, sdp: offer }));
          } else if (j.type === 'CALL_OFFER' && callStateRef.current && j.callId === callStateRef.current.callId && j.sdp) {
            const pc = pcRef.current || await buildPc(j.callId);
            await pc.setRemoteDescription(new RTCSessionDescription(j.sdp));
            await flushPendingIce();
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            sock.send(JSON.stringify({ type: 'CALL_ANSWER', callId: j.callId, sdp: ans }));
          } else if (j.type === 'CALL_ANSWER' && callStateRef.current && j.callId === callStateRef.current.callId && j.sdp && pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(j.sdp));
            await flushPendingIce();
          } else if (j.type === 'CALL_ICE' && callStateRef.current && j.callId === callStateRef.current.callId && j.candidate) {
            if (pcRef.current && pcRef.current.remoteDescription) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(j.candidate)); } catch (_) {}
            } else {
              pendingIceRef.current.push(j.candidate);
            }
          } else if ((j.type === 'CALL_REJECT' || j.type === 'CALL_BUSY' || j.type === 'CALL_UNAVAILABLE' || j.type === 'CALL_END') && callStateRef.current && j.callId === callStateRef.current.callId) {
            if (j.type === 'CALL_UNAVAILABLE' && j.reason) setStatusNotice(j.reason);
            else if (j.type === 'CALL_REJECT') setStatusNotice('Call declined by Desk.');
            cleanupCall();
          } else if (j.type === 'CALL_WAKE_SENT' && callStateRef.current && j.callId === callStateRef.current.callId) {
            setCallState((prev) => prev ? { ...prev, statusSub: '📲 Alerting Desk App & Phone...' } : prev);
          }
        } catch (_) {}
      };
      sock.onclose = () => {
        if (wsRef.current === sock) wsRef.current = null;
        if (!disposed) reconnectTimerRef.current = setTimeout(connect, 3500);
      };
      sock.onerror = () => { try { sock.close(); } catch (_) {} };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} wsRef.current = null; }
    };
  }, [threadId, customer?.phone, buildPc, cleanupCall, flushPendingIce, loadThreadMessages, playChime, startRing, stopRing]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    if (isOpen && threadId && customer?.phone && unreadCount > 0) {
      setUnreadCount(0);
      loadThreadMessages(threadId, customer.phone);
    }
  }, [isOpen, messages.length, threadId, customer?.phone, unreadCount, loadThreadMessages]);

  useEffect(() => {
    const rEl = remoteVideoRef.current;
    const lEl = localVideoRef.current;
    const swapped = Boolean(callState?.pipSwapped);
    const hasBoth = Boolean(localStreamRef.current && remoteStreamRef.current && callState?.mode === 'video');
    if (rEl) {
      const targetStream = (swapped && hasBoth) ? localStreamRef.current : remoteStreamRef.current;
      if (rEl.srcObject !== (targetStream || null)) {
        rEl.srcObject = targetStream || null;
      }
      rEl.muted = Boolean(swapped && hasBoth);
      if (targetStream) rEl.play().catch(() => {});
    }
    if (lEl && callState?.mode === 'video') {
      const pipStream = (swapped && hasBoth) ? remoteStreamRef.current : localStreamRef.current;
      if (lEl.srcObject !== (pipStream || null)) {
        lEl.srcObject = pipStream || null;
      }
      lEl.muted = !(swapped && hasBoth);
      if (pipStream) lEl.play().catch(() => {});
    }
  }, [callState]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDocDown = (ev: MouseEvent) => {
      if (attachWrapRef.current && !attachWrapRef.current.contains(ev.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [attachMenuOpen]);

  const handleSaveVipSetup = (e: React.FormEvent) => {
    e.preventDefault();
    const nm = setupName.trim();
    const ph = setupPhone.trim();
    if (nm.length < 2 || ph.replace(/\D/g, '').length < 7) {
      setSetupErr('Please enter your Name & valid WhatsApp number.');
      return;
    }
    const nextCust: StoredCustomer = { name: nm, phone: ph, address: setupCity.trim() };
    try { localStorage.setItem('vv_live_customer_v1', JSON.stringify(nextCust)); } catch (_) {}
    setSetupErr('');
    setCustomer(nextCust);
  };

  const sendPayload = async (payload: {
    text?: string;
    audioBase64?: string;
    audioMime?: string;
    audioDurationSec?: number;
    attachmentBase64?: string;
    attachmentMime?: string;
    attachmentName?: string;
    contactCard?: { name: string; phone: string };
    locationPin?: { lat?: number; lng?: number; label?: string; mapsUrl?: string };
  }) => {
    if (!customer || !threadId) return;
    setSending(true);
    try {
      const r = await fetch('/api/live/messenger/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          boothId: 'booth-1',
          sender: 'buyer',
          buyerName: customer.name,
          buyerPhone: customer.phone,
          buyerEmail: customer.email || '',
          buyerAddress: customer.address || '',
          text: payload.text || '',
          audioBase64: payload.audioBase64 || '',
          audioMime: payload.audioMime || '',
          audioDurationSec: payload.audioDurationSec || undefined,
          attachmentBase64: payload.attachmentBase64 || '',
          attachmentMime: payload.attachmentMime || '',
          attachmentName: payload.attachmentName || '',
          contactCard: payload.contactCard || undefined,
          locationPin: payload.locationPin || undefined,
          replyTo: replyQuote || undefined
        })
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.message) {
          setMessages((prev) => prev.some((x) => x.id === d.message.id) ? prev : [...prev, d.message]);
        }
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendContactCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const nm = contactNameDraft.trim();
    const ph = contactPhoneDraft.trim();
    if (!nm || ph.replace(/\D/g, '').length < 6) {
      setStatusNotice('Enter contact name and valid phone number.');
      return;
    }
    setContactModalOpen(false);
    setContactNameDraft('');
    setContactPhoneDraft('');
    await sendPayload({ contactCard: { name: nm, phone: ph } });
  };

  const handleSendGpsLocation = () => {
    if (!navigator.geolocation) {
      setStatusNotice('GPS unavailable; enter UAE address manually.');
      return;
    }
    setLocFetching(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setLocFetching(false);
      setLocModalOpen(false);
      await sendPayload({
        locationPin: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: locLabelDraft.trim() || 'Current GPS Location'
        }
      });
    }, () => {
      setLocFetching(false);
      setStatusNotice('Allow Location permission or enter UAE address manually.');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  const handleSendManualLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const lbl = locLabelDraft.trim();
    if (!lbl) return;
    setLocModalOpen(false);
    await sendPayload({ locationPin: { label: lbl } });
  };

  const handleSendText = async () => {
    if (!draftText.trim() && !stagedAtt) return;
    const t = draftText.trim();
    const a = stagedAtt;
    setDraftText('');
    setStagedAtt(null);
    setReplyQuote(null);
    setEmojiOpen(false);
    await sendPayload({
      text: t,
      attachmentBase64: a?.dataUrl,
      attachmentMime: a?.mime,
      attachmentName: a?.name
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const prepared = await prepareAttachmentFile(file);
      setStagedAtt(prepared);
      setStatusNotice('');
    } catch (err: any) {
      setStatusNotice(err?.message || 'Unsupported file.');
    }
  };

  const toggleVoiceRecord = async () => {
    if (recRef.current && recRef.current.state === 'recording') {
      try { recRef.current.stop(); } catch (_) {}
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunksRef.current = [];
      let sec = 0;
      setRecordingSec(0);
      const mimeCand = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = mimeCand ? new MediaRecorder(stream, { mimeType: mimeCand }) : new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recChunksRef.current.push(ev.data); };
      rec.onstop = () => {
        if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
        setRecordingSec(null);
        try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        const blob = new Blob(recChunksRef.current, { type: rec.mimeType || mimeCand || 'audio/webm' });
        recRef.current = null;
        if (blob.size < 200) return;
        const fr = new FileReader();
        fr.onloadend = () => {
          sendPayload({
            audioBase64: String(fr.result || ''),
            audioMime: blob.type || mimeCand || 'audio/webm',
            audioDurationSec: Math.max(1, sec)
          });
        };
        fr.readAsDataURL(blob);
      };
      rec.start();
      recTimerRef.current = setInterval(() => {
        sec += 1;
        setRecordingSec(sec);
        if (sec >= 30 && rec.state === 'recording') { try { rec.stop(); } catch (_) {} }
      }, 1000);
    } catch (_) {
      setStatusNotice('Allow Microphone access to record Voice Note.');
    }
  };

  const startCall = async (mode: 'audio' | 'video') => {
    if (!customer || !threadId) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatusNotice('Connecting line — tap again in 1 second.');
      return;
    }
    if (callStateRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: mode === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      localStreamRef.current = stream;
      const callId = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setCallState({
        callId,
        mode,
        phase: 'calling',
        peerName: companyProfile?.companyName || 'Vintage Vibes Desk',
        muted: false,
        camOff: false,
        facing: 'user',
        connectedAt: 0
      });
      startRing(false);
      wsRef.current.send(JSON.stringify({ type: 'CALL_INVITE', callId, mode, callerName: customer.name }));
      ringTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current?.phase === 'calling') {
          setStatusNotice('Desk did not answer — leave a Voice Note or Photo!');
          cleanupCall();
        }
      }, 45000);
    } catch (_) {
      setStatusNotice('Camera/Microphone access needed for call.');
    }
  };

  const acceptIncomingCall = async () => {
    const cur = callStateRef.current;
    if (!cur || cur.phase !== 'incoming') return;
    stopRing();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: cur.mode === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      localStreamRef.current = stream;
      setCallState((prev) => prev ? { ...prev, phase: 'active' } : prev);
      await buildPc(cur.callId);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CALL_ACCEPT', callId: cur.callId, mode: cur.mode }));
      }
    } catch (_) {
      setStatusNotice('Allow Mic/Camera to answer call.');
      declineIncomingCall();
    }
  };

  const declineIncomingCall = () => {
    const cur = callStateRef.current;
    if (cur && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'CALL_REJECT', callId: cur.callId })); } catch (_) {}
    }
    cleanupCall();
  };

  const endActiveCall = () => {
    const cur = callStateRef.current;
    if (cur && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'CALL_END', callId: cur.callId })); } catch (_) {}
    }
    cleanupCall();
  };

  const toggleCallMute = () => {
    const cur = callStateRef.current;
    if (!cur || !localStreamRef.current) return;
    const next = !cur.muted;
    localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setCallState((prev) => prev ? { ...prev, muted: next } : prev);
  };

  const toggleCallCam = () => {
    const cur = callStateRef.current;
    if (!cur || !localStreamRef.current) return;
    const next = !cur.camOff;
    localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setCallState((prev) => prev ? { ...prev, camOff: next } : prev);
  };

  const flipCallCam = async () => {
    const cur = callStateRef.current;
    if (!cur || !pcRef.current || !localStreamRef.current || cur.mode !== 'video') return;
    const nextFacing = cur.facing === 'user' ? 'environment' : 'user';
    try {
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing }, audio: false });
      const nt = ns.getVideoTracks()[0];
      if (!nt) return;
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
      localStreamRef.current.getVideoTracks().forEach((t) => { t.stop(); localStreamRef.current?.removeTrack(t); });
      localStreamRef.current.addTrack(nt);
      setCallState((prev) => prev ? { ...prev, facing: nextFacing } : prev);
    } catch (_) {}
  };

  const toggleCallNativeFs = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (callRootRef.current?.requestFullscreen) {
        callRootRef.current.requestFullscreen().catch(() => {});
      } else if (document.documentElement?.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (_) {}
  };

  return (
    <>
      {/* Floating Storefront VIP Chat & Call Launcher (Bottom Left — zero collision with Cart/WhatsApp on right) */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 flex items-center gap-2 bg-gradient-to-r from-[#0f172a] via-[#17223a] to-[#0f172a] text-amber-200 border border-amber-400/60 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
        aria-label="Open VIP Chat and Calls"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${deskOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-amber-400'}`} />
        <MessageCircle className="w-4 h-4 text-amber-300" />
        <span className="text-xs font-black tracking-wide">VIP Chat &amp; Call</span>
        {unreadCount > 0 && (
          <span className="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{unreadCount}</span>
        )}
      </button>

      {/* WhatsApp-Style Floating Drawer (Expandable Full-Screen) */}
      {isOpen && (
        <div className={drawerFullScreen
          ? 'fixed inset-0 z-[75] bg-[#0a0f1c] text-slate-100 flex flex-col overflow-hidden'
          : 'fixed bottom-4 left-4 right-4 sm:right-auto sm:w-[405px] h-[565px] max-h-[84dvh] z-[70] bg-[#0a0f1c] text-slate-100 border border-amber-400/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden'
        }>
          <div className="px-3.5 py-2.5 bg-[#111829] border-b border-amber-400/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-amber-200 truncate">Vintage Vibes VIP Desk</div>
                <div className="text-[10px] font-bold flex items-center gap-1.5 text-emerald-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${deskOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="truncate">{deskTyping ? 'typing...' : (deskOnline ? 'Desk Online • Ready for Calls' : 'Photos, Video, Docs & Calls')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href="/live/connect"
                target="_blank"
                rel="noopener noreferrer"
                title="Install VV Connect App for Background Calls & Contacts"
                className="px-2 py-1 rounded-lg bg-violet-500/20 border border-violet-400/50 text-violet-200 hover:bg-violet-500/30 text-[10px] font-black flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> App
              </a>
              {customer && (
                <>
                  <button type="button" onClick={() => startCall('audio')} title="Audio Call Desk" className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer">
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => startCall('video')} title="Video Call Desk" className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-400/50 text-blue-200 hover:bg-blue-500/30 cursor-pointer">
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setDrawerFullScreen((v) => !v)}
                title={drawerFullScreen ? 'Compact Drawer' : 'Full Screen Chat'}
                className="p-1.5 rounded-lg bg-slate-800 text-amber-200 hover:text-white cursor-pointer"
              >
                {drawerFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button type="button" onClick={() => { setIsOpen(false); setDrawerFullScreen(false); }} className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!customer ? (
            <form onSubmit={handleSaveVipSetup} className="p-4 flex-1 flex flex-col justify-center gap-3">
              <div className="text-sm font-black text-amber-200">Quick 5s VIP Chat &amp; Call Connect</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Apna naam aur WhatsApp number likhein taake aap seedha Storefront se Photo, PDF, Voice Note aur Audio/Video Call kar sakein.
              </p>
              {setupErr && <div className="text-xs text-rose-400 font-bold">{setupErr}</div>}
              <input
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                placeholder="Your Full Name *"
                required
                className="w-full px-3 py-2 rounded-xl bg-[#121a2d] border border-slate-700 text-sm text-white outline-none focus:border-amber-400"
              />
              <input
                value={setupPhone}
                onChange={(e) => setSetupPhone(e.target.value)}
                type="tel"
                placeholder="WhatsApp Number * (e.g. +971 50 ...)"
                required
                className="w-full px-3 py-2 rounded-xl bg-[#121a2d] border border-slate-700 text-sm text-white outline-none focus:border-amber-400"
              />
              <input
                value={setupCity}
                onChange={(e) => setSetupCity(e.target.value)}
                placeholder="City / Area (Optional)"
                className="w-full px-3 py-2 rounded-xl bg-[#121a2d] border border-slate-700 text-sm text-white outline-none focus:border-amber-400"
              />
              <button type="submit" className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-200 to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider cursor-pointer">
                Start VIP Chat &amp; Calls &rarr;
              </button>
            </form>
          ) : (
            <>
              {statusNotice && (
                <div className="px-3 py-1.5 bg-amber-500/15 border-b border-amber-400/30 text-[11px] font-bold text-amber-200 flex justify-between items-center">
                  <span>{statusNotice}</span>
                  <button type="button" onClick={() => setStatusNotice('')} className="text-amber-300 font-black cursor-pointer">&times;</button>
                </div>
              )}
              <div ref={listRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 bg-[#080d17]">
                {messages.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 my-auto px-4 leading-relaxed">
                    Welcome <strong className="text-amber-200">{customer.name}</strong>! Yahan se aap seedha Vintage Vibes Desk ko Text, Photo, PDF, Voice Note ya Audio/Video Call kar sakte hain.
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender !== 'admin';
                    return (
                      <div key={m.id} className={`flex flex-col max-w-[85%] ${mine ? 'self-end items-end' : 'self-start items-start'}`}>
                        <span className="text-[10px] font-bold text-slate-400 px-1 mb-0.5">
                          {mine ? 'You' : 'Vintage Vibes Desk'}
                        </span>
                        <div className={`px-3 py-2 rounded-2xl text-xs border ${mine ? 'bg-emerald-950/70 border-emerald-400/40 text-emerald-50 rounded-tr-xs' : 'bg-[#162033] border-amber-400/30 text-slate-100 rounded-tl-xs'}`}>
                          {m.replyTo && (
                            <div className="border-l-2 border-amber-400 bg-black/30 px-2 py-1 rounded mb-1.5 text-[10.5px]">
                              <div className="font-black text-amber-200">{m.replyTo.senderName}</div>
                              <div className="text-slate-300 truncate">{m.replyTo.preview}</div>
                            </div>
                          )}
                          {m.callLog && (
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/80 border border-blue-400/40 text-[10.5px] font-bold text-blue-200 mb-1">
                              {m.callLog.mode === 'video' ? '📹 Video Call' : '📞 Audio Call'} • {String(m.callLog.status || 'completed').toUpperCase()}
                              {m.callLog.durationSec ? ` (${formatDur(m.callLog.durationSec)})` : ''}
                            </div>
                          )}
                          {m.attachment?.url && m.attachment.kind === 'image' && (
                            <img
                              src={m.attachment.url}
                              alt={m.attachment.name}
                              onClick={() => setLightboxMedia({ url: m.attachment!.url, name: m.attachment!.name })}
                              className="max-w-[220px] max-h-[195px] rounded-lg border border-white/20 object-cover cursor-zoom-in mb-1.5"
                            />
                          )}
                          {m.attachment?.url && m.attachment.kind === 'video' && (
                            <video
                              controls
                              playsInline
                              preload="metadata"
                              src={m.attachment.url}
                              className="max-w-[235px] max-h-[210px] rounded-lg border border-white/20 bg-black mb-1.5"
                            />
                          )}
                          {m.attachment?.url && m.attachment.kind === 'audio' && (
                            <audio controls preload="metadata" src={m.attachment.url} className="w-52 max-w-full h-8 mb-1.5" />
                          )}
                          {m.attachment?.url && m.attachment.kind === 'pdf' && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-amber-400/40 mb-1.5 min-w-[190px]">
                              <FileText className="w-5 h-5 text-rose-300 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-amber-200 truncate">{m.attachment.name}</div>
                                <div className="text-[10px] text-slate-400">PDF • {formatBytes(m.attachment.sizeBytes)}</div>
                                <div className="flex gap-1.5 mt-1">
                                  <button type="button" onClick={() => setPdfPreview({ url: m.attachment!.url, name: m.attachment!.name })} className="px-2 py-0.5 rounded bg-slate-800 border border-amber-400/40 text-amber-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer">
                                    <Eye className="w-3 h-3" /> Preview
                                  </button>
                                  <a href={`${m.attachment.url}?download=1&name=${encodeURIComponent(m.attachment.name)}`} download={m.attachment.name} className="px-2 py-0.5 rounded bg-slate-800 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold flex items-center gap-1">
                                    <Download className="w-3 h-3" /> Save
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}
                          {m.attachment?.url && m.attachment.kind === 'document' && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-amber-400/40 mb-1.5 min-w-[190px]">
                              <FileText className="w-5 h-5 text-violet-300 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-amber-200 truncate">{m.attachment.name}</div>
                                <div className="text-[10px] text-slate-400">{formatBytes(m.attachment.sizeBytes)}</div>
                                <a href={`${m.attachment.url}?download=1&name=${encodeURIComponent(m.attachment.name)}`} download={m.attachment.name} className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold">
                                  <Download className="w-3 h-3" /> Download
                                </a>
                              </div>
                            </div>
                          )}
                          {m.contactCard && (
                            <div className="p-2 rounded-lg bg-black/40 border border-sky-400/40 mb-1.5 min-w-[185px]">
                              <div className="text-[11px] font-black text-amber-200">👤 {m.contactCard.name}</div>
                              <div className="text-[11px] text-slate-200 font-bold">{m.contactCard.phone}</div>
                              <a
                                href={`data:text/vcard;charset=utf-8,${encodeURIComponent(`BEGIN:VCARD\nVERSION:3.0\nFN:${m.contactCard.name}\nTEL:${m.contactCard.phone}\nEND:VCARD`)}`}
                                download={`${m.contactCard.name.replace(/[^a-z0-9]/gi, '_') || 'contact'}.vcf`}
                                className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-sky-400/40 text-sky-200 text-[10px] font-bold"
                              >
                                <Download className="w-3 h-3" /> Save .vcf
                              </a>
                            </div>
                          )}
                          {m.locationPin && (
                            <div className="p-2 rounded-lg bg-black/40 border border-emerald-400/40 mb-1.5 min-w-[190px]">
                              <div className="text-[11px] font-black text-emerald-300">📍 {m.locationPin.label || 'Shared Location'}</div>
                              {typeof m.locationPin.lat === 'number' && typeof m.locationPin.lng === 'number' && (
                                <div className="text-[10px] text-slate-400">{m.locationPin.lat.toFixed(5)}, {m.locationPin.lng.toFixed(5)}</div>
                              )}
                              <a
                                href={m.locationPin.mapsUrl || (typeof m.locationPin.lat === 'number' && typeof m.locationPin.lng === 'number' ? `https://maps.google.com/?q=${m.locationPin.lat},${m.locationPin.lng}` : `https://maps.google.com/?q=${encodeURIComponent(m.locationPin.label || 'Dubai UAE')}`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/30 border border-emerald-400/50 text-emerald-200 text-[10px] font-bold"
                              >
                                <MapPin className="w-3 h-3" /> Open Maps
                              </a>
                            </div>
                          )}
                          {m.text && <div className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</div>}
                          {m.audioUrl && (
                            <audio controls preload="metadata" src={m.audioUrl} className="w-52 max-w-full h-8 mt-1.5" />
                          )}
                          <div className="flex items-center justify-end gap-1.5 mt-1 text-[9.5px] text-slate-400">
                            <button
                              type="button"
                              onClick={() => setReplyQuote({ id: m.id, senderName: mine ? customer.name : 'Vintage Vibes Desk', preview: m.text || (m.attachment ? m.attachment.name : 'Media') })}
                              className="hover:text-amber-300 cursor-pointer"
                              title="Reply"
                            >
                              <CornerUpLeft className="w-3 h-3" />
                            </button>
                            <span>{formatShortTime(m.createdAt || m.ts)}</span>
                            {mine && <span className="text-sky-400 font-black">✓✓</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {replyQuote && (
                <div className="px-3 py-1.5 bg-[#11192d] border-t border-amber-400/30 flex items-center justify-between text-[11px]">
                  <div className="min-w-0">
                    <span className="font-black text-amber-200">Replying to {replyQuote.senderName}: </span>
                    <span className="text-slate-300 truncate">{replyQuote.preview}</span>
                  </div>
                  <button type="button" onClick={() => setReplyQuote(null)} className="text-slate-400 hover:text-white ml-2 cursor-pointer">&times;</button>
                </div>
              )}

              {stagedAtt && (
                <div className="px-3 py-1.5 bg-[#11192d] border-t border-amber-400/30 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {stagedAtt.kind === 'image' ? (
                      <img src={stagedAtt.dataUrl} alt="" className="w-8 h-8 rounded object-cover border border-amber-400" />
                    ) : (
                      <FileText className="w-5 h-5 text-amber-300 shrink-0" />
                    )}
                    <span className="text-amber-200 font-bold truncate">{stagedAtt.name} ({formatBytes(stagedAtt.sizeBytes)})</span>
                  </div>
                  <button type="button" onClick={() => setStagedAtt(null)} className="text-rose-300 font-bold cursor-pointer">Remove</button>
                </div>
              )}

              <div className="relative p-2 bg-[#0c1221] border-t border-slate-800 flex items-center gap-1.5">
                {emojiOpen && (
                  <div className="absolute bottom-full left-2 right-2 mb-2 p-2 rounded-xl bg-[#111829] border border-amber-400/50 grid grid-cols-7 gap-1 shadow-xl z-20">
                    {QUICK_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => { setDraftText((p) => p + em); setEmojiOpen(false); }}
                        className="text-lg p-1 rounded hover:bg-amber-400/20 cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
                <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv,application/pdf" className="hidden" onChange={handleFileChange} />
                <input ref={mediaInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleFileChange} />
                <input ref={camInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                <input ref={audioInputRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg" className="hidden" onChange={handleFileChange} />
                <div ref={attachWrapRef} className="relative shrink-0">
                  {attachMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-52 p-1.5 rounded-2xl bg-[#111829] border border-amber-400/50 shadow-2xl z-30 flex flex-col gap-0.5">
                      <button type="button" onClick={() => { setAttachMenuOpen(false); docInputRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-400/15 text-xs font-bold text-slate-100 cursor-pointer text-left">
                        <FileText className="w-4 h-4 text-violet-400" /> Document
                      </button>
                      <button type="button" onClick={() => { setAttachMenuOpen(false); mediaInputRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-400/15 text-xs font-bold text-slate-100 cursor-pointer text-left">
                        <ImageIcon className="w-4 h-4 text-blue-400" /> Photos &amp; videos
                      </button>
                      <button type="button" onClick={() => { setAttachMenuOpen(false); camInputRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-400/15 text-xs font-bold text-slate-100 cursor-pointer text-left">
                        <Camera className="w-4 h-4 text-pink-400" /> Camera
                      </button>
                      <button type="button" onClick={() => { setAttachMenuOpen(false); audioInputRef.current?.click(); }} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-400/15 text-xs font-bold text-slate-100 cursor-pointer text-left">
                        <Headphones className="w-4 h-4 text-orange-400" /> Audio
                      </button>
                      <button type="button" onClick={() => { setAttachMenuOpen(false); setContactModalOpen(true); }} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-400/15 text-xs font-bold text-slate-100 cursor-pointer text-left">
                        <UserPlus className="w-4 h-4 text-sky-400" /> Contact
                      </button>
                      <button type="button" onClick={() => { setAttachMenuOpen(false); setLocLabelDraft(customer?.address || ''); setLocModalOpen(true); }} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-amber-400/15 text-xs font-bold text-slate-100 cursor-pointer text-left">
                        <MapPin className="w-4 h-4 text-emerald-400" /> Location
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={() => setAttachMenuOpen((v) => !v)} title="Attach Document, Photos, Video, Camera, Audio, Contact, Location" className="p-2 rounded-xl bg-[#161f33] text-emerald-300 border border-emerald-400/40 cursor-pointer">
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleVoiceRecord}
                  title="Voice Note"
                  className={`p-2 rounded-xl border cursor-pointer shrink-0 flex items-center gap-1 text-[11px] font-bold ${recordingSec !== null ? 'bg-rose-600 text-white border-rose-300' : 'bg-[#161f33] text-amber-200 border-amber-400/40'}`}
                >
                  {recordingSec !== null ? <><Square className="w-3.5 h-3.5" /> 0:{recordingSec < 10 ? `0${recordingSec}` : recordingSec}</> : <Mic className="w-4 h-4" />}
                </button>
                <button type="button" onClick={() => setEmojiOpen((v) => !v)} className="p-2 rounded-xl bg-[#161f33] text-amber-200 border border-amber-400/40 cursor-pointer shrink-0">
                  <Smile className="w-4 h-4" />
                </button>
                <input
                  value={draftText}
                  onChange={(e) => {
                    setDraftText(e.target.value);
                    const nowT = Date.now();
                    if (wsRef.current?.readyState === WebSocket.OPEN && nowT - lastTypingSentRef.current > 1400) {
                      lastTypingSentRef.current = nowT;
                      try { wsRef.current.send(JSON.stringify({ type: 'TYPING' })); } catch (_) {}
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendText(); }}
                  placeholder="Type message..."
                  className="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-[#131b2e] border border-slate-700 text-xs text-white outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleSendText}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-amber-200 to-amber-500 text-slate-950 font-black cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxMedia && (
        <div onClick={() => setLightboxMedia(null)} className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 gap-3">
          <img src={lightboxMedia.url} alt={lightboxMedia.name} onClick={(e) => e.stopPropagation()} className="max-w-[92vw] max-h-[78dvh] rounded-xl border border-amber-400/60 object-contain" />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a href={`${lightboxMedia.url}?download=1&name=${encodeURIComponent(lightboxMedia.name)}`} download={lightboxMedia.name} className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Download
            </a>
            <button type="button" onClick={() => setLightboxMedia(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs cursor-pointer">Close</button>
          </div>
        </div>
      )}

      {/* Inline PDF Preview Modal */}
      {pdfPreview && (
        <div onClick={() => setPdfPreview(null)} className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl h-[84dvh] bg-[#0c111d] border border-amber-400/50 rounded-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 bg-[#111829] border-b border-slate-800 flex items-center justify-between gap-2">
              <span className="text-xs font-black text-amber-200 truncate">📄 {pdfPreview.name}</span>
              <div className="flex gap-2">
                <a href={`${pdfPreview.url}?download=1&name=${encodeURIComponent(pdfPreview.name)}`} download={pdfPreview.name} className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Save PDF
                </a>
                <button type="button" onClick={() => setPdfPreview(null)} className="px-3 py-1 rounded-lg bg-slate-800 text-white text-xs font-bold cursor-pointer">Close</button>
              </div>
            </div>
            <iframe src={pdfPreview.url} title={pdfPreview.name} className="flex-1 w-full border-0 bg-slate-900" />
          </div>
        </div>
      )}

      {/* Share Contact Modal */}
      {contactModalOpen && (
        <div onClick={() => setContactModalOpen(false)} className="fixed inset-0 z-[88] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSendContactCard} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#0c111d] border border-amber-400/50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-amber-200">👤 Share Contact Card</span>
              <button type="button" onClick={() => setContactModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">&times;</button>
            </div>
            <input value={contactNameDraft} onChange={(e) => setContactNameDraft(e.target.value)} placeholder="Contact Name *" required className="px-3 py-2 rounded-xl bg-[#131b2e] border border-slate-700 text-xs text-white outline-none focus:border-amber-400" />
            <input value={contactPhoneDraft} onChange={(e) => setContactPhoneDraft(e.target.value)} placeholder="Phone Number * (+971 5X ...)" required className="px-3 py-2 rounded-xl bg-[#131b2e] border border-slate-700 text-xs text-white outline-none focus:border-amber-400" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setContactModalOpen(false)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-bold text-slate-200 cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-black cursor-pointer">Send Contact</button>
            </div>
          </form>
        </div>
      )}

      {/* Share Location Modal */}
      {locModalOpen && (
        <div onClick={() => setLocModalOpen(false)} className="fixed inset-0 z-[88] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSendManualLocation} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#0c111d] border border-amber-400/50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-emerald-300">📍 Share Delivery Location</span>
              <button type="button" onClick={() => setLocModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">&times;</button>
            </div>
            <button type="button" onClick={handleSendGpsLocation} disabled={locFetching} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer disabled:opacity-60">
              {locFetching ? '📡 Getting GPS Pin...' : '📡 Send Current GPS Location'}
            </button>
            <input value={locLabelDraft} onChange={(e) => setLocLabelDraft(e.target.value)} placeholder="Or type UAE address / landmark..." className="px-3 py-2 rounded-xl bg-[#131b2e] border border-slate-700 text-xs text-white outline-none focus:border-amber-400" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setLocModalOpen(false)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-bold text-slate-200 cursor-pointer">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-black cursor-pointer">Send Pin</button>
            </div>
          </form>
        </div>
      )}

      {/* Storefront WebRTC HD Audio / Video Call Overlay (True 100% Edge-to-Edge Full Screen) */}
      {callState && (
        <div ref={callRootRef} className="fixed inset-0 z-[95] w-screen h-[100dvh] bg-[#02040a] flex flex-col justify-between overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`absolute inset-0 w-full h-full bg-[#02040a] ${callState.fitContain ? 'object-contain' : 'object-cover'}`}
          />
          {callState.mode === 'video' && callState.phase !== 'incoming' && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              onClick={() => setCallState((prev) => prev ? { ...prev, pipSwapped: !prev.pipSwapped } : prev)}
              title="Tap to swap camera view"
              className="absolute right-3.5 top-16 w-28 h-[148px] object-cover rounded-2xl border-2 border-amber-400 z-20 bg-slate-950 cursor-pointer shadow-2xl"
            />
          )}
          <div className="relative z-10 px-4 pt-4 pb-6 bg-gradient-to-b from-black/85 to-transparent flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-black text-amber-200 truncate">{callState.peerName}</div>
              <div className="text-xs font-bold text-emerald-300">
                {callState.phase === 'incoming'
                  ? `Incoming ${callState.mode === 'video' ? 'Video' : 'Audio'} Call...`
                  : callState.phase === 'calling'
                  ? (callState.statusSub || 'Ringing Vintage Vibes Desk...')
                  : `${callState.mode === 'video' ? 'HD Video' : 'HD Audio'} Connected`}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {callState.phase === 'active' && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-200 text-xs font-black">{formatDur(callElapsedSec)}</span>
              )}
              <button
                type="button"
                onClick={() => setCallState((prev) => prev ? { ...prev, fitContain: !prev.fitContain } : prev)}
                className="px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/20 text-white text-[11px] font-bold cursor-pointer"
              >
                {callState.fitContain ? 'Fill' : 'Fit'}
              </button>
              <button
                type="button"
                onClick={toggleCallNativeFs}
                title="Browser Full Screen"
                className="p-1.5 rounded-full bg-slate-900/80 border border-white/20 text-white cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {(callState.mode === 'audio' || callState.phase !== 'active') && (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center pointer-events-none px-4">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 text-slate-950 flex items-center justify-center shadow-[0_0_36px_rgba(245,196,81,0.45)] mb-3">
                <Crown className="w-10 h-10" />
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-200">Vintage Vibes Encrypted Concierge Line</div>
            </div>
          )}
          <div className="relative z-10 px-4 pt-4 pb-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-3 flex-wrap">
            {callState.phase === 'incoming' ? (
              <>
                <button type="button" onClick={acceptIncomingCall} className="px-5 py-3 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer">
                  <Phone className="w-4 h-4" /> Accept
                </button>
                <button type="button" onClick={declineIncomingCall} className="px-5 py-3 rounded-full bg-rose-600 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer">
                  <PhoneOff className="w-4 h-4" /> Decline
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={toggleCallMute} className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer border ${callState.muted ? 'bg-amber-400 text-slate-950 border-amber-200' : 'bg-slate-900/90 text-white border-white/20'}`}>
                  {callState.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {callState.muted ? 'Muted' : 'Mute'}
                </button>
                {callState.mode === 'video' && (
                  <>
                    <button type="button" onClick={toggleCallCam} className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer border ${callState.camOff ? 'bg-amber-400 text-slate-950 border-amber-200' : 'bg-slate-900/90 text-white border-white/20'}`}>
                      {callState.camOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />} Camera
                    </button>
                    <button type="button" onClick={flipCallCam} className="px-4 py-2.5 rounded-full bg-slate-900/90 text-white border border-white/20 text-xs font-bold flex items-center gap-1 cursor-pointer">
                      <RefreshCw className="w-4 h-4" /> Flip
                    </button>
                  </>
                )}
                <button type="button" onClick={endActiveCall} className="px-5 py-2.5 rounded-full bg-rose-600 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer">
                  <PhoneOff className="w-4 h-4" /> End Call
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
