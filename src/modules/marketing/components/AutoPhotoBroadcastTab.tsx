import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Mic,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Layers,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Flame,
  Radio,
  Users,
  UserCheck,
  UserPlus,
  Plus,
  Megaphone,
  Globe,
  Trash2,
  Tv,
  Key,
  Lock,
  Zap,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { PieceBreakdownItem, InwardGatePass } from '../../purchase/purchase.types.ts';
import { Party } from '../../parties/parties.types.ts';
import { AutoBroadcastCampaign, WhatsAppDeviceSession, WhatsAppChannelItem } from '../marketing.types.ts';
import { WhatsAppDeviceModal } from './WhatsAppDeviceModal.tsx';
import { SocialLiveConnectModal } from './SocialLiveConnectModal.tsx';

export const AutoPhotoBroadcastTab: React.FC = () => {
  // Wizard Setup State
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [campaignTitle, setCampaignTitle] = useState('🔥 Dubai Vault Hype Drop • 90s Outerwear');
  const [selectedBaleId, setSelectedBaleId] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPieceSkus, setSelectedPieceSkus] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<string>('CHANNEL');
  const [customChatId, setCustomChatId] = useState<string>('');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(8);

  // Delivery Engine Mode: Free (Baileys Linked Phone) vs API Key Mode (Meta Cloud API / Gateway)
  const [deliveryEngineMode, setDeliveryEngineMode] = useState<'FREE_BAILEYS' | 'META_CLOUD_API' | 'CUSTOM_GATEWAY'>('FREE_BAILEYS');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [metaWabaId, setMetaWabaId] = useState<string>('');
  const [gatewayApiUrl, setGatewayApiUrl] = useState<string>('');
  const [gatewayApiToken, setGatewayApiToken] = useState<string>('');
  const [isSavingGatewayConfig, setIsSavingGatewayConfig] = useState<boolean>(false);

  // WhatsApp Multi-User Linked Phone State
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);
  const [linkedDevice, setLinkedDevice] = useState<WhatsAppDeviceSession | null>(null);

  // Audience Mode: Channel vs Groups vs Direct Customer Phone Directory
  const [audienceMode, setAudienceMode] = useState<'GROUPS' | 'CUSTOMER_DIRECTORY' | 'CHANNEL'>('CHANNEL');
  const [channelConfig, setChannelConfig] = useState<{
    channelInviteLink: string;
    channelJid: string;
    channelTitle?: string;
    verifiedAdmin?: boolean;
  } | null>(null);
  const [channels, setChannels] = useState<WhatsAppChannelItem[]>([]);
  const [selectedChannelJid, setSelectedChannelJid] = useState<string>('');
  const [isAddingNewChannel, setIsAddingNewChannel] = useState<boolean>(false);
  const [newChannelLink, setNewChannelLink] = useState<string>('');
  const [newChannelTitle, setNewChannelTitle] = useState<string>('');
  const [isAddingChannelLoading, setIsAddingChannelLoading] = useState<boolean>(false);
  const [isEditingChannel, setIsEditingChannel] = useState<boolean>(false);
  const [tempChannelLink, setTempChannelLink] = useState<string>('');
  const [isResolvingChannel, setIsResolvingChannel] = useState<boolean>(false);
  const [isTestingChannelPost, setIsTestingChannelPost] = useState<boolean>(false);

  // Social Channels Connect Modal (YouTube, Instagram, TikTok)
  const [isSocialModalOpen, setIsSocialModalOpen] = useState<boolean>(false);

  // Customer Directory State (Zero fake demo contacts)
  const [customers, setCustomers] = useState<Party[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isAddingContact, setIsAddingContact] = useState<boolean>(false);
  const [newContactName, setNewContactName] = useState<string>('');
  const [newContactPhone, setNewContactPhone] = useState<string>('');
  const [hideDemoContacts, setHideDemoContacts] = useState<boolean>(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState<boolean>(false);
  const [isWipingDemo, setIsWipingDemo] = useState<boolean>(false);

  // Real WhatsApp Participating Groups State (Zero fake groups)
  const [realGroups, setRealGroups] = useState<Array<{ id: string; name: string; size: number }>>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState<string>('');
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);

  // Data State
  const [pieces, setPieces] = useState<PieceBreakdownItem[]>([]);
  const [bales, setBales] = useState<InwardGatePass[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<AutoBroadcastCampaign | null>(null);
  const [campaignHistory, setCampaignHistory] = useState<AutoBroadcastCampaign[]>([]);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const fetchInitialData = async () => {
    try {
      const [piecesRes, balesRes, campRes, deviceRes, partiesRes, configRes, groupsRes, channelsRes] = await Promise.all([
        fetch('/api/purchase/pieces'),
        fetch('/api/purchase/gate-passes'),
        fetch('/api/marketing/broadcast-campaign/status'),
        fetch('/api/marketing/whatsapp/session?userId=usr-admin-1&userName=Dubai%20HQ%20Operator'),
        fetch('/api/parties'),
        fetch('/api/marketing/whatsapp/config'),
        fetch('/api/marketing/whatsapp/groups?userId=usr-admin-1'),
        fetch('/api/marketing/whatsapp/channels')
      ]);

      if (channelsRes.ok) {
        const cData = await channelsRes.json();
        const chList: WhatsAppChannelItem[] = cData.channels || [];
        setChannels(chList);
        const def = chList.find(c => c.isDefault) || chList[0];
        if (def) {
          const resolvedJid = def.jid || def.inviteLink || def.id;
          setSelectedChannelJid(resolvedJid);
          setChannelConfig({
            channelInviteLink: def.inviteLink,
            channelJid: resolvedJid,
            channelTitle: def.name,
            verifiedAdmin: def.verifiedAdmin
          });
          setTempChannelLink(def.inviteLink);
        }
      }

      if (configRes.ok) {
        const cfg = await configRes.json();
        if (cfg.connectionMode) {
          setDeliveryEngineMode(cfg.connectionMode);
        }
        if (cfg.metaCloudConfig) {
          setMetaPhoneNumberId(cfg.metaCloudConfig.phoneNumberId || '');
          setMetaAccessToken(cfg.metaCloudConfig.accessToken || '');
          setMetaWabaId(cfg.metaCloudConfig.wabaId || '');
        }
        if (cfg.gatewayConfig) {
          setGatewayApiUrl(cfg.gatewayConfig.apiUrl || '');
          setGatewayApiToken(cfg.gatewayConfig.apiToken || '');
        }
        if (cfg.channelConfig && (!channelConfig || !channelConfig.channelJid)) {
          setChannelConfig(cfg.channelConfig);
          if (cfg.channelConfig.channelInviteLink) {
            setTempChannelLink(cfg.channelConfig.channelInviteLink);
          }
        }
      }

      if (groupsRes.ok) {
        const gData = await groupsRes.json();
        setRealGroups(gData.groups || []);
      }

      if (partiesRes.ok) {
        const partiesData = await partiesRes.json();
        const clientList = (partiesData || []).filter((p: Party) => p.type === 'CLIENT');
        setCustomers(clientList);
        // Default select all active customer phones
        setSelectedCustomerIds(clientList.map((c: Party) => c.id));
      }

      if (deviceRes.ok) {
        const d = await deviceRes.json();
        setLinkedDevice(d);
      }

      if (piecesRes.ok) {
        const pData = await piecesRes.json();
        const inStock = (pData || []).filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
        setPieces(inStock);
        if (inStock.length > 0 && selectedPieceSkus.length === 0) {
          // Pre-select first 6 pieces for convenience
          setSelectedPieceSkus(inStock.slice(0, 6).map((p: PieceBreakdownItem) => p.barcode));
        }
      }

      if (balesRes.ok) {
        setBales(await balesRes.json());
      }

      if (campRes.ok) {
        const cData = await campRes.json();
        setActiveCampaign(cData.current);
        setCampaignHistory(cData.history || []);
      }
    } catch (err) {
      console.warn('Error loading broadcast tab data:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();
    // Fast 2-second polling to update live dispatch queue progress and WhatsApp connection status
    const interval = setInterval(async () => {
      try {
        const [campRes, devRes] = await Promise.all([
          fetch('/api/marketing/broadcast-campaign/status'),
          fetch('/api/marketing/whatsapp/session?userId=usr-admin-1&userName=Dubai%20HQ%20Operator')
        ]);
        if (campRes.ok) {
          const data = await campRes.json();
          setActiveCampaign(data.current);
          if (data.history) setCampaignHistory(data.history);
        }
        if (devRes.ok) {
          const dev = await devRes.json();
          setLinkedDevice(dev);
        }
      } catch {}
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Filter pieces by bale, brand, category, search
  const filteredPieces = pieces.filter(p => {
    if (selectedBaleId !== 'ALL' && p.gatePassId !== selectedBaleId && p.baleCode !== selectedBaleId) {
      return false;
    }
    if (brandFilter !== 'ALL' && p.brandName.toLowerCase() !== brandFilter.toLowerCase()) {
      return false;
    }
    if (categoryFilter !== 'ALL' && (p.style || '').toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.itemName.toLowerCase().includes(q) ||
        p.brandName.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const uniqueBrands = Array.from(new Set(pieces.map(p => p.brandName).filter(Boolean)));

  // Save Delivery Engine Config (Free Mode vs Meta Cloud API vs Custom Gateway)
  const handleSaveDeliveryEngine = async () => {
    setIsSavingGatewayConfig(true);
    try {
      const payload = {
        connectionMode: deliveryEngineMode,
        metaCloudConfig: {
          enabled: deliveryEngineMode === 'META_CLOUD_API',
          phoneNumberId: metaPhoneNumberId.trim(),
          accessToken: metaAccessToken.trim(),
          wabaId: metaWabaId.trim()
        },
        gatewayConfig: {
          enabled: deliveryEngineMode === 'CUSTOM_GATEWAY',
          apiUrl: gatewayApiUrl.trim(),
          apiToken: gatewayApiToken.trim()
        }
      };

      const res = await fetch('/api/marketing/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(
          deliveryEngineMode === 'META_CLOUD_API'
            ? '✅ Official Meta Cloud API Mode Activated!\n\nNative photo cards will now be rendered directly on WhatsApp Channel with 100% verified CDN delivery.'
            : deliveryEngineMode === 'CUSTOM_GATEWAY'
            ? '✅ Custom WhatsApp Gateway Mode Activated!'
            : '✅ Free Direct Mode (Baileys Linked Phone) Active!\n\nZero monthly subscription or per-message charges.'
        );
      } else {
        alert('Failed to save delivery engine configuration.');
      }
    } catch (err: any) {
      alert(`Error saving engine configuration: ${err.message}`);
    } finally {
      setIsSavingGatewayConfig(false);
    }
  };

  // Quick Resolve & Save Channel Link inline
  const handleSaveQuickChannel = async () => {
    if (!tempChannelLink.trim()) return;
    setIsResolvingChannel(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/channels/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteLink: tempChannelLink.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.meta) {
          setChannelConfig({
            channelInviteLink: data.meta.inviteLink,
            channelJid: data.meta.id,
            channelTitle: data.meta.name,
            verifiedAdmin: true
          });
          setIsEditingChannel(false);
        }
      }
    } catch (err) {
      console.warn('Error resolving channel link:', err);
    } finally {
      setIsResolvingChannel(false);
    }
  };

  // Select active WhatsApp Channel
  const handleSelectChannel = (jid: string) => {
    setSelectedChannelJid(jid);
    const target = channels.find(c => c.id === jid || c.jid === jid);
    if (target) {
      const realJid = target.jid || target.inviteLink || target.id;
      setChannelConfig({
        channelInviteLink: target.inviteLink,
        channelJid: realJid,
        channelTitle: target.name,
        verifiedAdmin: target.verifiedAdmin
      });
      setTempChannelLink(target.inviteLink);
    }
  };

  // Test Channel Post & Verify Admin Access
  const handleTestChannelPost = async () => {
    setIsTestingChannelPost(true);
    try {
      const activeJid = channelConfig?.channelJid || selectedChannelJid || '';
      const samplePiece = pieces.find(p => selectedPieceSkus.includes(p.barcode)) || pieces[0];
      const res = await fetch('/api/marketing/whatsapp/channels/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelJid: activeJid,
          channelInviteLink: channelConfig?.channelInviteLink || tempChannelLink || '',
          imageUrl: samplePiece?.frontImageUrl || '/winter_maazi_story.png'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Test Post with Photo Successfully Dispatched to WhatsApp Channel "${channelConfig?.channelTitle || 'Vintage'}"!\n\nOpen WhatsApp on your phone and check the Updates/Channels tab to see your post.`);
      } else {
        alert(`Channel Test Error: ${data.error || 'Failed to dispatch post'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsTestingChannelPost(false);
    }
  };

  // Add Another WhatsApp Channel
  const handleAddNewChannel = async () => {
    if (!newChannelLink.trim()) {
      alert('Please enter a WhatsApp Channel invite link (e.g. https://whatsapp.com/channel/...)');
      return;
    }
    setIsAddingChannelLoading(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteLink: newChannelLink.trim(),
          name: newChannelTitle.trim() || undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.channel) {
          setChannels(data.channels || []);
          const chosenJid = data.channel.jid || data.channel.id;
          setSelectedChannelJid(chosenJid);
          setChannelConfig({
            channelInviteLink: data.channel.inviteLink,
            channelJid: chosenJid,
            channelTitle: data.channel.name,
            verifiedAdmin: data.channel.verifiedAdmin
          });
          setNewChannelLink('');
          setNewChannelTitle('');
          setIsAddingNewChannel(false);
          alert(`✅ WhatsApp Channel "${data.channel.name}" connected successfully!`);
        }
      } else {
        const err = await res.json();
        alert(`Failed to add channel: ${err.error || 'Invalid link'}`);
      }
    } catch (err: any) {
      alert(`Error connecting channel: ${err.message}`);
    } finally {
      setIsAddingChannelLoading(false);
    }
  };

  // Remove WhatsApp Channel
  const handleDeleteChannel = async (jid: string) => {
    if (!confirm('Are you sure you want to remove this channel?')) return;
    try {
      const res = await fetch(`/api/marketing/whatsapp/channels/${encodeURIComponent(jid)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        if (selectedChannelJid === jid && data.channels && data.channels.length > 0) {
          handleSelectChannel(data.channels[0].id);
        }
      }
    } catch (err) {
      console.warn('Error deleting channel:', err);
    }
  };

  // Set Default Broadcast Channel
  const handleSetDefaultChannel = async (jid: string) => {
    try {
      const res = await fetch(`/api/marketing/whatsapp/channels/${encodeURIComponent(jid)}/default`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        handleSelectChannel(jid);
      }
    } catch (err) {
      console.warn('Error setting default channel:', err);
    }
  };

  // Sync Real Contacts from Connected WhatsApp Phone
  const handleSyncPhoneContacts = async () => {
    setIsSyncingContacts(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/directory/sync-phone-contacts', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ WhatsApp Phone Sync Complete!\n\nImported/Updated: ${data.syncedCount} authentic contacts directly from your connected WhatsApp account.`);
        const partiesRes = await fetch('/api/parties');
        if (partiesRes.ok) {
          const partiesData = await partiesRes.json();
          const clientList = (partiesData || []).filter((p: Party) => p.type === 'CLIENT');
          setCustomers(clientList);
          setSelectedCustomerIds(clientList.map((c: Party) => c.id));
        }
      } else {
        alert(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error syncing phone contacts: ${err.message}`);
    } finally {
      setIsSyncingContacts(false);
    }
  };

  // Wipe All Demo Seed Contacts
  const handleWipeDemoContacts = async () => {
    if (!confirm('Are you sure you want to permanently purge all fake/demo contacts? Real WhatsApp contacts will remain.')) return;
    setIsWipingDemo(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/directory/wipe-demo-contacts', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Demo Contacts Purged!\n\nWiped ${data.wipedCount} demo seed contacts. Total authentic customer contacts remaining: ${data.remainingCount}.`);
        const partiesRes = await fetch('/api/parties');
        if (partiesRes.ok) {
          const partiesData = await partiesRes.json();
          const clientList = (partiesData || []).filter((p: Party) => p.type === 'CLIENT');
          setCustomers(clientList);
          setSelectedCustomerIds(clientList.map((c: Party) => c.id));
        }
      }
    } catch (err: any) {
      alert(`Error wiping demo contacts: ${err.message}`);
    } finally {
      setIsWipingDemo(false);
    }
  };

  // Add Real Customer Phone
  const handleAddNewCustomerPhone = async () => {
    if (!newContactPhone.trim()) {
      alert('Please enter a phone number (e.g. +971501234567)');
      return;
    }
    try {
      const res = await fetch('/api/marketing/whatsapp/directory/add-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContactName.trim() || `Customer (${newContactPhone.trim()})`,
          phone: newContactPhone.trim()
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.customer) {
          setCustomers(prev => [data.customer, ...prev]);
          setSelectedCustomerIds(prev => [data.customer.id, ...prev]);
          setNewContactName('');
          setNewContactPhone('');
          setIsAddingContact(false);
        }
      }
    } catch (err) {
      console.warn('Error adding contact:', err);
    }
  };

  // 1-Click Add Operator's Linked WhatsApp Phone
  const handleAddMyLinkedPhone = async () => {
    const myPhone = linkedDevice?.phoneNumber;
    if (!myPhone) {
      alert('Please link your WhatsApp phone first using the "Link Phone" button.');
      return;
    }
    try {
      const res = await fetch('/api/marketing/whatsapp/directory/add-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `My Linked Phone (${myPhone})`,
          phone: myPhone
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.customer) {
          setCustomers(prev => [data.customer, ...prev.filter(c => c.phone !== myPhone)]);
          setSelectedCustomerIds(prev => [...new Set([data.customer.id, ...prev])]);
        }
      }
    } catch (err) {
      console.warn('Error adding linked phone:', err);
    }
  };

  // Start Automated Broadcast
  const handleStartBroadcast = async () => {
    if (selectedPieceSkus.length === 0) return;
    if (audienceMode === 'CUSTOMER_DIRECTORY' && selectedCustomerIds.length === 0) {
      alert('Please select at least one customer phone to broadcast to.');
      return;
    }
    setIsProcessingAction(true);

    try {
      const selectedCustomerList = customers.filter(c => selectedCustomerIds.includes(c.id));
      const targetAudienceLabel = audienceMode === 'CHANNEL'
        ? `Official WhatsApp Drop Channel (${channelConfig?.channelTitle || 'Vintage Vibes Drops'})`
        : audienceMode === 'CUSTOMER_DIRECTORY'
        ? `VIP Phone Directory (${selectedCustomerList.length} Customers)`
        : (customChatId || 'VIP Group');

      const activeChannelJid = (channelConfig?.channelJid && channelConfig.channelJid.includes('@newsletter'))
        ? channelConfig.channelJid
        : (selectedChannelJid && selectedChannelJid.includes('@newsletter'))
        ? selectedChannelJid
        : (channels[0]?.jid || '');

      if (audienceMode === 'CHANNEL' && (!activeChannelJid || !activeChannelJid.includes('@newsletter'))) {
        alert('Please connect or select a valid WhatsApp Channel before broadcasting.');
        setIsProcessingAction(false);
        return;
      }

      const targetDestinationId = audienceMode === 'CHANNEL'
        ? activeChannelJid
        : audienceMode === 'CUSTOMER_DIRECTORY'
        ? (selectedCustomerList.length === 1 ? (selectedCustomerList[0].phone || selectedCustomerList[0].id) : `Multi-Direct (${selectedCustomerList.length} Phones)`)
        : customChatId;

      const customerPhones = audienceMode === 'CUSTOMER_DIRECTORY'
        ? selectedCustomerList.map(c => c.phone).filter(Boolean) as string[]
        : undefined;

      const res = await fetch('/api/marketing/broadcast-campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: campaignTitle,
          targetAudience: targetAudienceLabel,
          targetChatId: targetDestinationId,
          customerPhones,
          pieceIds: selectedPieceSkus,
          intervalSeconds
        })
      });

      if (res.ok) {
        const campaign = await res.json();
        setActiveCampaign(campaign);
        alert(`🚀 Broadcast Started Successfully!\n\nDispatched to: ${targetAudienceLabel}\nTotal pieces in queue: ${selectedPieceSkus.length}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Broadcast Notice: ${errData.error || 'Failed to start broadcast'}`);
      }
    } catch (err: any) {
      alert(`Network error starting broadcast: ${err?.message}`);
      console.warn('Error starting broadcast campaign:', err);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Pause
  const handlePause = async () => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/marketing/broadcast-campaign/pause', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.campaign) setActiveCampaign(data.campaign);
      }
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Resume
  const handleResume = async () => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/marketing/broadcast-campaign/resume', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.campaign) setActiveCampaign(data.campaign);
      }
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Abort
  const handleAbort = async () => {
    if (!confirm('Are you sure you want to abort the current photo broadcast?')) return;
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/marketing/broadcast-campaign/abort', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.campaign) setActiveCampaign(data.campaign);
      }
    } finally {
      setIsProcessingAction(false);
    }
  };

  const isCampaignRunning = activeCampaign?.status === 'RUNNING';
  const isCampaignPaused = activeCampaign?.status === 'PAUSED';
  const isCampaignActive = isCampaignRunning || isCampaignPaused;
  const progressPercent = activeCampaign && activeCampaign.totalCount > 0
    ? Math.round((activeCampaign.sentCount / activeCampaign.totalCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 1. TOP STATUS BANNER */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-amber-950 border border-emerald-500/40 rounded-xl p-5 text-emerald-100 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0 text-emerald-300 shadow-md">
            <Smartphone className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif font-bold text-base sm:text-lg text-white">
                Automated WhatsApp Photo-by-Photo Broadcaster & Delivery Engine
              </h3>
              <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold">
                Anti-Spam Throttled
              </span>
            </div>
            <p className="text-xs text-emerald-200/80 mt-1 max-w-2xl">
              Sequentially transmits high-res garment photos with 1-tap checkout, direct claim links, and full photo inspector. Supports Free Direct Mode (Baileys) and Official Meta Cloud API Mode.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 self-end md:self-center shrink-0">
          <button
            type="button"
            onClick={() => setIsSocialModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 bg-gradient-to-r from-red-600 via-pink-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white border border-pink-400/50"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>🌐 Connect Live (YouTube • IG • TikTok)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDeviceModalOpen(true)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 border ${
              linkedDevice?.isConnected
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-900/30'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-600 animate-pulse'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {linkedDevice?.isConnected ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
                <span>🟢 Connected: {linkedDevice.phoneNumber || 'Active'}</span>
              </span>
            ) : (
              <span>📲 Link Phone (Scan QR)</span>
            )}
          </button>

          <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold flex items-center gap-1.5 border ${
            linkedDevice?.isConnected
              ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
              : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${linkedDevice?.isConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
            {linkedDevice?.isConnected ? '🟢 WhatsApp Engine Online' : 'WhatsApp Engine Ready'}
          </span>
        </div>
      </div>

      {/* 2. REAL-TIME DISPATCH EXECUTION HUD (WHEN CAMPAIGN ACTIVE) */}
      {activeCampaign && (
        <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-xl p-5 text-white shadow-2xl space-y-4 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-3 h-3 rounded-full ${
                  isCampaignRunning ? 'bg-emerald-400 animate-ping' : isCampaignPaused ? 'bg-amber-400' : 'bg-slate-500'
                }`}
              />
              <div>
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider block">
                  ACTIVE BROADCAST CAMPAIGN: {activeCampaign.title}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Target: {activeCampaign.targetAudience} ({activeCampaign.targetChatId}) • Safe Delay: {activeCampaign.intervalSeconds}s
                </span>
              </div>
            </div>

            {/* Campaign Controls */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              {isCampaignRunning ? (
                <button
                  type="button"
                  onClick={handlePause}
                  disabled={isProcessingAction}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </button>
              ) : isCampaignPaused ? (
                <button
                  type="button"
                  onClick={handleResume}
                  disabled={isProcessingAction}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </button>
              ) : null}

              {isCampaignActive && (
                <button
                  type="button"
                  onClick={handleAbort}
                  disabled={isProcessingAction}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Abort</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                Dispatching: <strong className="text-white">{activeCampaign.sentCount}</strong> of{' '}
                <strong className="text-white">{activeCampaign.totalCount}</strong> pieces
              </span>
              <span className="font-bold text-amber-400 text-sm">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400 h-full transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Voice Note Status Badge */}
          {activeCampaign.voiceNoteEnabled && (
            <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-200">Opening Hype Voice Note:</span>
                <span className="font-bold text-white italic">"{activeCampaign.voiceNoteText.slice(0, 70)}..."</span>
              </div>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 border border-emerald-400/40">
                {activeCampaign.voiceNoteStatus === 'SENT' ? '✅ VOICE NOTE SENT' : '⏳ PENDING DISPATCH'}
              </span>
            </div>
          )}

          {/* Completion Celebration Banner */}
          {activeCampaign.status === 'COMPLETED' && (
            <div className="p-3 bg-emerald-500/20 border-2 border-emerald-400 rounded-xl text-emerald-200 text-xs font-bold flex items-center justify-between animate-bounce">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>🎉 Entire VIP Photo Drop Successfully Delivered ({activeCampaign.sentCount} Photos)!</span>
              </span>
              <span className="font-mono text-[11px] text-white">
                Completed: {activeCampaign.completedAt ? new Date(activeCampaign.completedAt).toLocaleTimeString() : 'Just now'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3. CAMPAIGN SETUP WIZARD (4 STEPS) */}
      <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs space-y-5">
        <div className="border-b border-amber-100 pb-3 flex items-center justify-between flex-wrap gap-2">
          <h4 className="font-serif font-bold text-slate-900 text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Campaign Setup Wizard</span>
          </h4>

          {/* Step Badges */}
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className={`px-3 py-1 rounded-full font-bold transition cursor-pointer ${
                wizardStep === 1 ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
              }`}
            >
              1. Source Selection
            </button>
            <button
              type="button"
              onClick={() => setWizardStep(2)}
              className={`px-3 py-1 rounded-full font-bold transition cursor-pointer ${
                wizardStep === 2 ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
              }`}
            >
              2. Target Audience
            </button>
            <button
              type="button"
              onClick={() => setWizardStep(3)}
              className={`px-3 py-1 rounded-full font-bold transition cursor-pointer ${
                wizardStep === 3 ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
              }`}
            >
              3. Delivery Engine Mode
            </button>
            <button
              type="button"
              onClick={() => setWizardStep(4)}
              className={`px-3 py-1 rounded-full font-bold transition cursor-pointer ${
                wizardStep === 4 ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
              }`}
            >
              4. Dispatch Controls
            </button>
          </div>
        </div>

        {/* STEP 1: SOURCE SELECTION */}
        {wizardStep === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Step 1: Select Inward Bale or Filter Pieces for Broadcast
                </h5>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick specific pieces or select all sorted garments from an unsealed container bale.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPieceSkus.length === filteredPieces.length) {
                      setSelectedPieceSkus([]);
                    } else {
                      setSelectedPieceSkus(filteredPieces.map(p => p.barcode));
                    }
                  }}
                  className="text-xs text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                >
                  {selectedPieceSkus.length === filteredPieces.length ? 'Deselect All' : 'Select All Filtered'}
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Filter by Bale:</label>
                <select
                  value={selectedBaleId}
                  onChange={e => setSelectedBaleId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All Available Bales</option>
                  {bales.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.gatePassNo} ({b.baleCode || 'Bale'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Filter by Brand:</label>
                <select
                  value={brandFilter}
                  onChange={e => setBrandFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                >
                  <option value="ALL">All Brands</option>
                  {uniqueBrands.map(br => (
                    <option key={br} value={br}>{br}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Search Pieces:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by title, SKU, or era..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Pieces Selectable Grid */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100">
              {filteredPieces.map(piece => {
                const isSelected = selectedPieceSkus.includes(piece.barcode);
                return (
                  <div
                    key={piece.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedPieceSkus(prev => prev.filter(s => s !== piece.barcode));
                      } else {
                        setSelectedPieceSkus(prev => [...prev, piece.barcode]);
                      }
                    }}
                    className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition ${
                      isSelected ? 'bg-amber-50/80 text-amber-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      />
                      <img
                        src={piece.frontImageUrl || '/vintage_vibes_seal.svg'}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                      />
                      <div>
                        <span className="font-mono text-slate-900 font-bold block">{piece.barcode}</span>
                        <span className="text-[11px] text-slate-600 truncate max-w-[280px] block">
                          {piece.itemName} ({piece.brandName}) • Size: {piece.sizeScanned}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <span className="font-bold text-emerald-700 block">
                        AED {piece.retailPriceAed || piece.estimatedPrice}
                      </span>
                      <span className="text-[10px] text-slate-400">{piece.labelGrade || 'Grade A'}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono font-bold text-slate-700">
                {selectedPieceSkus.length} pieces selected for automated photo broadcast
              </span>
              <button
                type="button"
                onClick={() => setWizardStep(2)}
                disabled={selectedPieceSkus.length === 0}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                Proceed to Step 2: Target Audience →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: TARGET AUDIENCE */}
        {wizardStep === 2 && (
          <div className="space-y-4 animate-fade-in max-w-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Step 2: Select Target Audience & Recipient List
                </h5>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose between your registered ERP Customer Phone Directory or VIP WhatsApp Broadcast Groups.
                </p>
              </div>

              {/* Audience Mode Switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setAudienceMode('CHANNEL')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                    audienceMode === 'CHANNEL'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-950" />
                  <span>📢 Official Drop Channel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceMode('CUSTOMER_DIRECTORY')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                    audienceMode === 'CUSTOMER_DIRECTORY'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Phone Directory ({customers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudienceMode('GROUPS')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                    audienceMode === 'GROUPS'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>WhatsApp Groups ({realGroups.length})</span>
                </button>
              </div>
            </div>

            {/* OPTION A: OFFICIAL WHATSAPP DROP CHANNELS (MULTI-CHANNEL SUPPORT) */}
            {audienceMode === 'CHANNEL' ? (
              <div className="bg-gradient-to-br from-amber-500/10 via-emerald-500/5 to-slate-900/5 border border-amber-400/40 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-300/40 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xl shadow-md shrink-0">
                      📢
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h6 className="font-bold text-slate-900 text-sm">
                          {channelConfig?.channelTitle || 'Vintage'}
                        </h6>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Live Channel Active
                        </span>
                        {channels.length > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {channels.length} Channels Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Broadcast luxury drop feeds directly to your WhatsApp Channel subscribers.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleTestChannelPost}
                      disabled={isTestingChannelPost}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isTestingChannelPost ? 'Dispatching...' : '🚀 Test Post to Channel'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAddingNewChannel(!isAddingNewChannel)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAddingNewChannel ? 'Close Channel Input' : '➕ Add Another Channel'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDeviceModalOpen(true)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg shadow-2xs transition cursor-pointer shrink-0"
                    >
                      ⚙️ WhatsApp Engine
                    </button>
                  </div>
                </div>

                {/* Inline Add Another Channel Form */}
                {isAddingNewChannel && (
                  <div className="bg-white border-2 border-emerald-400 rounded-xl p-4 space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <h6 className="font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Add Another WhatsApp Channel</span>
                      </h6>
                      <span className="text-[11px] text-slate-500 font-mono">Auto-resolves via Baileys API</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                          WhatsApp Channel Invite Link *
                        </label>
                        <input
                          type="text"
                          value={newChannelLink}
                          onChange={e => setNewChannelLink(e.target.value)}
                          placeholder="https://whatsapp.com/channel/0029Vb..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                          Channel Display Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={newChannelTitle}
                          onChange={e => setNewChannelTitle(e.target.value)}
                          placeholder="e.g. VIP Grails Archive Channel"
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingNewChannel(false)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddNewChannel}
                        disabled={isAddingChannelLoading}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isAddingChannelLoading ? 'Connecting...' : '⚡ Verify & Connect Channel'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Multi-Channel Switcher Tabs if multiple channels exist */}
                {channels.length > 1 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Connected Channels ({channels.length}) — Click to Switch Active Target:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {channels.map(ch => {
                        const isSelected = selectedChannelJid === ch.id;
                        return (
                          <div
                            key={ch.id}
                            onClick={() => handleSelectChannel(ch.id)}
                            className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-2 ${
                              isSelected
                                ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300 shadow-xs'
                                : 'bg-white hover:bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div>
                                <span className="font-bold text-xs text-slate-900 block">{ch.name}</span>
                                <span className="text-[10px] font-mono text-slate-500 break-all block">
                                  {ch.id}
                                </span>
                              </div>
                              {isSelected ? (
                                <span className="text-[9px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full shrink-0">
                                  ✓ Target
                                </span>
                              ) : ch.isDefault ? (
                                <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded shrink-0">
                                  Default
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                              {!ch.isDefault && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetDefaultChannel(ch.id);
                                  }}
                                  className="text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                                >
                                  Make Default
                                </button>
                              )}
                              {channels.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteChannel(ch.id);
                                  }}
                                  className="text-rose-600 hover:text-rose-800 font-semibold ml-auto cursor-pointer"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="bg-white/85 border border-slate-200 rounded-lg p-3 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Target Channel Address (JID)
                    </span>
                    <span className="font-mono font-bold text-slate-800 text-[11px] block break-all">
                      {channelConfig?.channelJid || 'No channel connected yet'}
                    </span>
                  </div>

                  <div className="bg-white/85 border border-slate-200 rounded-lg p-3 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Public Channel Invite Link
                    </span>
                    {channelConfig?.channelInviteLink ? (
                      <a
                        href={channelConfig.channelInviteLink}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-bold text-amber-700 hover:text-amber-800 text-[11px] block break-all underline"
                      >
                        {channelConfig.channelInviteLink}
                      </a>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px] block">No channel invite link configured</span>
                    )}
                  </div>
                </div>

                {/* Conversion Features Info */}
                <div className="bg-emerald-50/90 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold block">1-Tap Channel Conversion Template:</span>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      Every piece photo transmitted to this channel automatically includes brand, size, condition, price, <strong>1-Click WhatsApp Claim link</strong> (<code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono">wa.me/?text=MINE%20{'{SKU}'}</code>), and <strong>Instant Mobile Checkout</strong> (Apple Pay / Google Pay / Dynamic QR).
                    </p>
                  </div>
                </div>
              </div>
            ) : audienceMode === 'CUSTOMER_DIRECTORY' ? (
              /* OPTION B: CUSTOMER PHONE DIRECTORY (SEND TO ALL OR SELECT INDIVIDUAL) */
              <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                {/* Real Contact Management Action Bar */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSyncPhoneContacts}
                      disabled={isSyncingContacts}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContacts ? 'animate-spin' : ''}`} />
                      <span>{isSyncingContacts ? 'Syncing...' : '🔄 Auto-Sync WhatsApp Contacts from Phone'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleWipeDemoContacts}
                      disabled={isWipingDemo}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>{isWipingDemo ? 'Purging...' : '🗑️ Wipe Demo Contacts'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsAddingContact(!isAddingContact)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAddingContact ? 'Close Input' : '➕ Add Customer Phone'}</span>
                    </button>

                    {linkedDevice?.phoneNumber && (
                      <button
                        type="button"
                        onClick={handleAddMyLinkedPhone}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>📲 Add Linked Phone ({linkedDevice.phoneNumber})</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold font-mono">
                      ✓ Real Synced Contacts: {customers.length.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Inline Add Contact Form */}
                {isAddingContact && (
                  <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xl space-y-2">
                    <h6 className="font-bold text-xs text-slate-900">Add New WhatsApp Recipient</h6>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newContactName}
                        onChange={e => setNewContactName(e.target.value)}
                        placeholder="Customer Name (e.g. Tariq / Hamdan)"
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        value={newContactPhone}
                        onChange={e => setNewContactPhone(e.target.value)}
                        placeholder="Phone (e.g. +971501234567)"
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingContact(false)}
                        className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddNewCustomerPhone}
                        className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                      >
                        Save to Phone Directory
                      </button>
                    </div>
                  </div>
                )}

                {/* Header Actions: Send to All vs Select/Deselect */}
                {(() => {
                  const filteredList = customers.filter(c => {
                    if (hideDemoContacts) {
                      if (c.id.startsWith('cust-demo-') || c.id.startsWith('cust_seed_')) return false;
                    }
                    if (!customerSearch.trim()) return true;
                    const q = customerSearch.toLowerCase();
                    return (
                      (c.name || '').toLowerCase().includes(q) ||
                      (c.phone || '').toLowerCase().includes(q) ||
                      ((c as any).handle || '').toLowerCase().includes(q) ||
                      (c.address || (c as any).city || '').toLowerCase().includes(q)
                    );
                  });

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                        <div>
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-emerald-600" />
                            Recipient Selection Mode
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            {selectedCustomerIds.length === filteredList.length && filteredList.length > 0
                              ? `✨ Sending to ALL (${filteredList.length}) customer phones in directory`
                              : `Selected ${selectedCustomerIds.filter(id => filteredList.some(c => c.id === id)).length} of ${filteredList.length} customers`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerIds(filteredList.map(c => c.id))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                              selectedCustomerIds.length === filteredList.length && filteredList.length > 0
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>✨ Send Them All ({filteredList.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedCustomerIds([])}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      {/* Filter and Search Bar for Specific Customer Selection */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          placeholder="Search customers by name, phone (+92302..., +971...), or handle..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* Customer List with Checkboxes */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
                        {filteredList.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            No matching customers found. Click <strong>"➕ Add Real Customer Phone"</strong> above to add numbers.
                          </div>
                        ) : (
                          filteredList.map(cust => {
                            const isSelected = selectedCustomerIds.includes(cust.id);
                            const isReal = !cust.id.startsWith('cust-demo-');
                            return (
                              <div
                                key={cust.id}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedCustomerIds(prev => prev.filter(id => id !== cust.id));
                                  } else {
                                    setSelectedCustomerIds(prev => [...prev, cust.id]);
                                  }
                                }}
                                className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition ${
                                  isSelected ? 'bg-amber-50/90 text-amber-950 font-medium' : 'hover:bg-white text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                                  />
                                  <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-[10px] text-slate-700 shrink-0">
                                    {cust.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-900">{cust.name}</span>
                                      {isReal && (
                                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                          Real Contact
                                        </span>
                                      )}
                                      {(cust as any).handle && (
                                        <span className="text-[10px] text-amber-700 font-mono">
                                          {(cust as any).handle.startsWith('@') ? (cust as any).handle : `@${(cust as any).handle}`}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-mono text-emerald-800 block">
                                      {cust.phone || 'No phone recorded'}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                    {cust.address || (cust as any).city || 'Direct Recipient'}
                                  </span>
                                  {cust.currentBalance !== undefined && (
                                    <span className={`text-[10px] font-mono font-semibold ${cust.currentBalance > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                      Khata: AED {cust.currentBalance}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <span className="font-mono text-slate-600">
                          Targeting: <strong className="text-slate-900">{selectedCustomerIds.length}</strong> recipients
                        </span>
                        {selectedCustomerIds.length === filteredList.length && filteredList.length > 0 ? (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            ✓ "Send Them All" Active
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                            ✓ Custom Selected List Active
                          </span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              /* OPTION C: REAL WHATSAPP GROUPS (NO FAKE DATA) */
              <div className="space-y-3">
                {/* Search Bar for 214 Groups */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={groupSearchQuery}
                    onChange={e => setGroupSearchQuery(e.target.value)}
                    placeholder={`Search ${realGroups.length} connected WhatsApp groups by name or JID...`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {realGroups.length > 0 ? (
                  (() => {
                    const filteredGroups = realGroups.filter(g =>
                      !groupSearchQuery.trim() ||
                      (g.name || '').toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                      (g.id || '').toLowerCase().includes(groupSearchQuery.toLowerCase())
                    );

                    return (
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100 bg-white">
                        {filteredGroups.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">
                            No matching WhatsApp groups found for "{groupSearchQuery}".
                          </div>
                        ) : (
                          filteredGroups.map(group => {
                            const isSelected = targetAudience === group.id;
                            return (
                              <label
                                key={group.id}
                                className={`p-3 flex items-center justify-between cursor-pointer transition ${
                                  isSelected
                                    ? 'bg-amber-50/90 text-amber-950 font-medium'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <input
                                    type="radio"
                                    name="targetAudience"
                                    checked={isSelected}
                                    onChange={() => {
                                      setTargetAudience(group.id);
                                      setCustomChatId(group.id);
                                    }}
                                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                                  />
                                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                                    👥
                                  </div>
                                  <div>
                                    <span className="font-bold text-xs text-slate-900 block">{group.name}</span>
                                    <span className="text-[11px] text-slate-500">
                                      {group.size || 0} Members • Real WhatsApp Group
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {group.id}
                                  </span>
                                  {isSelected && (
                                    <span className="block text-[10px] font-bold text-emerald-700 mt-1">
                                      ✓ Active Target
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xl mx-auto">
                      👥
                    </div>
                    <div>
                      <h6 className="font-bold text-slate-800 text-sm">No WhatsApp Groups Found on Linked Account</h6>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        Your connected phone (<strong>{linkedDevice?.phoneNumber || 'No phone linked'}</strong>) is not currently an admin of any private VIP broadcast groups.
                      </p>
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setAudienceMode('CHANNEL')}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Megaphone className="w-4 h-4" />
                        <span>📢 Switch to Official WhatsApp Channel (Recommended)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sender Device Info Card */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-300 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                    Dispatched From Linked Phone:
                  </span>
                  <span className="font-mono text-xs font-black text-emerald-950">
                    {linkedDevice?.isConnected ? linkedDevice.phoneNumber : 'No phone linked (Click to pair)'}
                  </span>
                  <span className="text-[10px] text-emerald-700 block">
                    {linkedDevice?.isConnected ? `${linkedDevice.deviceModel} • ${linkedDevice.userName}` : 'Requires WhatsApp scan'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDeviceModalOpen(true)}
                className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold text-xs rounded-lg shadow-2xs transition cursor-pointer"
              >
                {linkedDevice?.isConnected ? 'Switch Phone' : 'Scan Phone QR'}
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                Campaign Title / Identifier:
              </label>
              <input
                type="text"
                value={campaignTitle}
                onChange={e => setCampaignTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                className="text-xs text-slate-600 hover:text-slate-900 font-bold"
              >
                ← Back to Source
              </button>
              <button
                type="button"
                onClick={() => setWizardStep(3)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition cursor-pointer"
              >
                Proceed to Step 3: Delivery Engine Mode →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: DELIVERY ENGINE MODE (FREE LINKED PHONE VS API KEY MODE) */}
        {wizardStep === 3 && (
          <div className="space-y-4 animate-fade-in max-w-2xl">
            <div>
              <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" />
                <span>Step 3: Delivery Engine Mode (Free vs Official API Key)</span>
              </h5>
              <p className="text-xs text-slate-500 mt-1">
                Choose how drop photos and messages are delivered to your WhatsApp Channel & VIP audience.
              </p>
            </div>

            {/* Mode Option Cards */}
            <div className="space-y-3">
              {/* Option 1: 100% Free Mode (Baileys Direct Linked Phone) */}
              <label
                className={`p-4 rounded-xl border-2 transition cursor-pointer block ${
                  deliveryEngineMode === 'FREE_BAILEYS'
                    ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-300/50 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="deliveryEngineMode"
                      checked={deliveryEngineMode === 'FREE_BAILEYS'}
                      onChange={() => setDeliveryEngineMode('FREE_BAILEYS')}
                      className="w-4 h-4 accent-emerald-600 mt-1 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          Mode 1: 100% Free Direct Mode (Baileys Linked Phone)
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                          Free Forever • Zero Cost
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Dispatches directly from your paired WhatsApp phone (<strong>{linkedDevice?.phoneNumber || 'No phone linked'}</strong>). 
                        Transmits formatted drop cards with direct 1-tap mobile checkout, WhatsApp claim CTAs, and instant photo viewer links with guaranteed delivery.
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-emerald-800">
                        <span>✓ No credit card required</span>
                        <span>✓ No monthly Meta fees</span>
                        <span>✓ Unlimited broadcasts</span>
                      </div>
                    </div>
                  </div>
                  {deliveryEngineMode === 'FREE_BAILEYS' && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full shrink-0">
                      ✓ Active
                    </span>
                  )}
                </div>
              </label>

              {/* Option 2: Official Meta Cloud API (API Key Mode) */}
              <label
                className={`p-4 rounded-xl border-2 transition cursor-pointer block ${
                  deliveryEngineMode === 'META_CLOUD_API'
                    ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-300/50 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="deliveryEngineMode"
                      checked={deliveryEngineMode === 'META_CLOUD_API'}
                      onChange={() => setDeliveryEngineMode('META_CLOUD_API')}
                      className="w-4 h-4 accent-amber-600 mt-1 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          Mode 2: Official Meta Cloud API (Native Channel Photos)
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full border border-amber-400">
                          Official Gateway • Direct Image CDN
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Uploads media directly to Meta's verified WhatsApp CDN servers. <strong>100% solves native photo rendering</strong> in WhatsApp Channel feeds without being dropped by WhatsApp newsletter security policies.
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-[11px] font-mono text-amber-900">
                        <span>✓ Native photo cards</span>
                        <span>✓ Verified channel rendering</span>
                        <span>✓ Enterprise grade stability</span>
                      </div>
                    </div>
                  </div>
                  {deliveryEngineMode === 'META_CLOUD_API' && (
                    <span className="text-xs font-bold text-amber-800 bg-amber-200 px-2.5 py-1 rounded-full shrink-0">
                      ✓ Active
                    </span>
                  )}
                </div>

                {/* API Key Credentials Inputs if Meta Cloud API is Selected */}
                {deliveryEngineMode === 'META_CLOUD_API' && (
                  <div className="mt-4 pt-3 border-t border-amber-200 space-y-3" onClick={e => e.stopPropagation()}>
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">
                      Enter Meta WhatsApp Cloud API Credentials (from developers.facebook.com):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">
                          Phone Number ID:
                        </label>
                        <input
                          type="text"
                          value={metaPhoneNumberId}
                          onChange={e => setMetaPhoneNumberId(e.target.value)}
                          placeholder="e.g. 104928472918234"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">
                          WABA Account ID (Optional):
                        </label>
                        <input
                          type="text"
                          value={metaWabaId}
                          onChange={e => setMetaWabaId(e.target.value)}
                          placeholder="e.g. 293847192837482"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">
                        System User Access Token (Bearer):
                      </label>
                      <input
                        type="password"
                        value={metaAccessToken}
                        onChange={e => setMetaAccessToken(e.target.value)}
                        placeholder="EAABwz..."
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-slate-500">
                        Credentials are encrypted and saved to your local backend.
                      </p>
                      <button
                        type="button"
                        onClick={handleSaveDeliveryEngine}
                        disabled={isSavingGatewayConfig}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {isSavingGatewayConfig ? 'Saving...' : '💾 Save Meta API Key'}
                      </button>
                    </div>
                  </div>
                )}
              </label>

              {/* Option 3: Custom Third-Party Gateway (Green-API / UltraMsg / Custom) */}
              <label
                className={`p-4 rounded-xl border-2 transition cursor-pointer block ${
                  deliveryEngineMode === 'CUSTOM_GATEWAY'
                    ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-300/50 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="deliveryEngineMode"
                      checked={deliveryEngineMode === 'CUSTOM_GATEWAY'}
                      onChange={() => setDeliveryEngineMode('CUSTOM_GATEWAY')}
                      className="w-4 h-4 accent-blue-600 mt-1 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-xs text-slate-900 block">
                        Mode 3: Custom Third-Party Gateway (Green-API / UltraMsg)
                      </span>
                      <p className="text-xs text-slate-600 mt-1">
                        Connect any HTTP WhatsApp gateway endpoint with API token.
                      </p>
                    </div>
                  </div>
                  {deliveryEngineMode === 'CUSTOM_GATEWAY' && (
                    <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full shrink-0">
                      ✓ Active
                    </span>
                  )}
                </div>

                {deliveryEngineMode === 'CUSTOM_GATEWAY' && (
                  <div className="mt-4 pt-3 border-t border-blue-200 space-y-3" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">
                          Gateway API Endpoint URL:
                        </label>
                        <input
                          type="text"
                          value={gatewayApiUrl}
                          onChange={e => setGatewayApiUrl(e.target.value)}
                          placeholder="https://api.green-api.com/waInstance..."
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">
                          API Token / Key:
                        </label>
                        <input
                          type="password"
                          value={gatewayApiToken}
                          onChange={e => setGatewayApiToken(e.target.value)}
                          placeholder="Token string..."
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveDeliveryEngine}
                        disabled={isSavingGatewayConfig}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {isSavingGatewayConfig ? 'Saving...' : '💾 Save Gateway Settings'}
                      </button>
                    </div>
                  </div>
                )}
              </label>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setWizardStep(2)}
                className="text-xs text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
              >
                ← Back to Audience
              </button>
              <button
                type="button"
                onClick={() => setWizardStep(4)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition cursor-pointer"
              >
                Proceed to Step 4: Dispatch Controls →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: DISPATCH CONTROLS & START */}
        {wizardStep === 4 && (
          <div className="space-y-4 animate-fade-in max-w-2xl">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Step 4: Dispatch Interval & Anti-Spam Safety Controls
            </h5>

            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Safe Inter-Picture Delay (Seconds):
                </label>
                <span className="font-mono text-sm font-black text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded">
                  {intervalSeconds} Seconds / Photo
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={15}
                step={1}
                value={intervalSeconds}
                onChange={e => setIntervalSeconds(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>3s (Aggressive)</span>
                <span className="font-bold text-emerald-700">4s (Direct Phones)</span>
                <span className="font-bold text-amber-800">8s - 12s (Channel Drop Ideal)</span>
                <span>15s (Maximum Protection)</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Guarantees WhatsApp rate safety. If temporary throttling or socket disconnect occurs, the engine pauses 15s and auto-retries without losing the queue.
              </p>
            </div>

            {/* Campaign Summary Box */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Photos to Transmit:</span>
                <strong className="text-slate-900 font-mono">{selectedPieceSkus.length} Pieces</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Audience:</span>
                <strong className="text-slate-900 font-mono">
                  {audienceMode === 'CUSTOMER_DIRECTORY'
                    ? `VIP Customer Directory (${selectedCustomerIds.length} Customers)`
                    : audienceMode === 'CHANNEL'
                    ? `📢 Official WhatsApp Channel (${channelConfig?.channelTitle || 'Vintage Vibes Official Drop Channel'})`
                    : customChatId}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Engine Mode:</span>
                <strong className="font-mono font-bold text-emerald-800">
                  {deliveryEngineMode === 'META_CLOUD_API'
                    ? '⚡ Meta Cloud API (Official Native Image Gateway)'
                    : deliveryEngineMode === 'CUSTOM_GATEWAY'
                    ? '🌐 Custom Gateway API'
                    : '🟢 Free Direct Mode (Baileys Linked Phone)'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estimated Total Duration:</span>
                <strong className="text-amber-800 font-mono">
                  ~{Math.round((selectedPieceSkus.length * intervalSeconds) / 60)} minutes
                </strong>
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setWizardStep(3)}
                className="text-xs text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
              >
                ← Back to Delivery Mode
              </button>
              <button
                type="button"
                onClick={handleStartBroadcast}
                disabled={isProcessingAction || selectedPieceSkus.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>🚀 Start Automated Photo Broadcast</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. LIVE CAMPAIGN LOGS & REAL-TIME FEEDBACK TABLE */}
      {activeCampaign && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-amber-100 flex items-center justify-between bg-amber-50/40">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-700" />
              <h4 className="font-bold text-sm text-slate-900">Live Photo Queue Dispatch Telemetry</h4>
              <span className="text-xs bg-amber-200 text-amber-900 font-mono px-2 py-0.5 rounded-full font-bold">
                {activeCampaign.items.length} Items in Queue
              </span>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Auto-Refresh Active • Non-Blocking Stream
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Piece Thumbnail</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Brand & Title</th>
                  <th className="py-2.5 px-3">Price</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Sent Timestamp</th>
                  <th className="py-2.5 px-3">WhatsApp Caption Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {activeCampaign.items.map((item, idx) => (
                  <tr key={item.piece.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <img
                        src={item.imageMediaUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-white"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.piece.barcode}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold block text-slate-800">{item.piece.itemName}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{item.piece.brandName} • Size: {item.piece.sizeScanned}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                      AED {item.piece.retailPriceAed || item.piece.estimatedPrice}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          item.status === 'SENT'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : item.status === 'SENDING'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {item.status === 'SENT' ? '✓ SENT' : item.status === 'SENDING' ? '⏳ SENDING...' : 'PENDING'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {item.sentAt || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] font-mono text-slate-500 max-w-xs truncate" title={item.caption}>
                      {item.caption.replace(/\n/g, ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. RECENT CAMPAIGN HISTORY */}
      {campaignHistory.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-xs">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider mb-3">
            Past Automated Broadcast History
          </h4>
          <div className="space-y-2 text-xs">
            {campaignHistory.map(camp => (
              <div key={camp.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="font-bold text-slate-900 block">{camp.title}</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {camp.targetAudience} • {camp.sentCount} of {camp.totalCount} sent • {camp.intervalSeconds}s delay
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {camp.status}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {camp.completedAt ? new Date(camp.completedAt).toLocaleTimeString() : camp.startedAt}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. MULTI-USER WHATSAPP DEVICE LINKING MODAL */}
      <WhatsAppDeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        currentUserId="usr-admin-1"
        currentUserName="Dubai HQ Operator"
        onDeviceConnected={session => setLinkedDevice(session)}
      />

      {/* 7. SOCIAL LIVE STREAMS CONNECT MODAL (YOUTUBE, INSTAGRAM, TIKTOK) */}
      <SocialLiveConnectModal
        isOpen={isSocialModalOpen}
        onClose={() => setIsSocialModalOpen(false)}
      />
    </div>
  );
};
