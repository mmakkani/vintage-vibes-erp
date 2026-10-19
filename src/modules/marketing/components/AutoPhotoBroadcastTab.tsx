import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Play,
  Pause,
  Square,
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Layers,
  Sparkles,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Radio,
  Users,
  UserCheck,
  UserPlus,
  Plus,
  Megaphone,
  Globe,
  Trash2,
  Zap,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  MapPin
} from 'lucide-react';
import { PieceBreakdownItem, InwardGatePass } from '../../purchase/purchase.types.ts';
import { AutoBroadcastCampaign, WhatsAppDeviceSession, WhatsAppChannelItem } from '../marketing.types.ts';
import { WhatsAppDeviceModal } from './WhatsAppDeviceModal.tsx';
import { SocialLiveConnectModal } from './SocialLiveConnectModal.tsx';
import { PurchaseService } from '../../../services/purchaseService.ts';
import { WhatsAppService } from '../../../services/whatsappService.ts';
import { supabase } from '../../../supabaseClient.ts';

export interface MarketingDirectoryContact {
  id: string;
  name: string;
  phone: string;
  formattedPhone?: string;
  networkDetail?: string;
  companyName?: string;
  email?: string;
  source: 'CRM_CUSTOMER' | 'WHATSAPP_NAMED' | 'WHATSAPP_PHONE';
  badgeLabel: string;
  city?: string;
  country?: string;
  ordersCount?: number;
  totalSpentAed?: number;
  lastActivity?: string;
}

export const AutoPhotoBroadcastTab: React.FC = () => {
  const currentOperator = WhatsAppService.getCurrentOperator();

  // Direct Broadcast Campaign State (No Multi-Step Wizard)
  const [campaignTitle, setCampaignTitle] = useState('🔥 Dubai Vault Hype Drop • 3-Photo Garment Cards');
  const [selectedBaleId, setSelectedBaleId] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPieceSkus, setSelectedPieceSkus] = useState<string[]>([]);
  const [customChatId, setCustomChatId] = useState<string>('');
  const [intervalSeconds, setIntervalSeconds] = useState<number>(6);

  // Pagination States (4 photos per page so 6 photos = 2 pages!)
  const [piecesPage, setPiecesPage] = useState<number>(1);
  const PIECES_PER_PAGE = 4;

  const [contactsPage, setContactsPage] = useState<number>(1);
  const CONTACTS_PER_PAGE = 20;
  const [contactSourceFilter, setContactSourceFilter] = useState<'ALL' | 'CRM_AND_NAMED' | 'UAE_ONLY' | 'INTL_ONLY'>('ALL');

  const [queuePage, setQueuePage] = useState<number>(1);
  const QUEUE_PER_PAGE = 4;

  const [historyPage, setHistoryPage] = useState<number>(1);
  const HISTORY_PER_PAGE = 5;

  // WhatsApp Multi-User Linked Phone State
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState<boolean>(false);
  const [linkedDevice, setLinkedDevice] = useState<WhatsAppDeviceSession | null>(null);

  // Direct Audience Mode: Channel vs Direct Phone & CRM Directory vs WhatsApp Groups
  const [audienceMode, setAudienceMode] = useState<'CHANNEL' | 'CUSTOMER_DIRECTORY' | 'GROUPS'>('CUSTOMER_DIRECTORY');
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

  // WhatsApp AI Mode Switch (Trial Support Mode vs Live Sales & Item Photos Mode)
  const [aiSalesAndPhotosEnabled, setAiSalesAndPhotosEnabled] = useState<boolean>(false);
  const [isTogglingAiMode, setIsTogglingAiMode] = useState<boolean>(false);

  const handleToggleAiSalesMode = async (targetEnabled: boolean) => {
    setIsTogglingAiMode(true);
    try {
      const res = await fetch('/api/marketing/ai-sales-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: targetEnabled,
          updatedBy: currentOperator.name || currentOperator.username || 'ERP Dashboard'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSalesAndPhotosEnabled(Boolean(data.aiSalesAndPhotosEnabled));
      }
    } catch (err) {
      console.warn('Failed to toggle WhatsApp AI sales mode:', err);
    } finally {
      setIsTogglingAiMode(false);
    }
  };

  // Unified WhatsApp Phone + CRM Customer Directory State (Zero COA / System Accounts)
  const [directoryContacts, setDirectoryContacts] = useState<MarketingDirectoryContact[]>([]);
  const [directorySummary, setDirectorySummary] = useState<{
    totalCount: number;
    crmCount: number;
    namedWaCount: number;
    phoneWaCount: number;
  }>({ totalCount: 0, crmCount: 0, namedWaCount: 0, phoneWaCount: 0 });
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isAddingContact, setIsAddingContact] = useState<boolean>(false);
  const [newContactName, setNewContactName] = useState<string>('');
  const [newContactPhone, setNewContactPhone] = useState<string>('');
  const [newContactCity, setNewContactCity] = useState<string>('Dubai');
  const [isSyncingContacts, setIsSyncingContacts] = useState<boolean>(false);

  // Real WhatsApp Participating Groups State
  const [realGroups, setRealGroups] = useState<Array<{ id: string; name: string; size: number }>>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState<string>('');
  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);

  // Data State
  const [pieces, setPieces] = useState<PieceBreakdownItem[]>([]);
  const [bales, setBales] = useState<InwardGatePass[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<AutoBroadcastCampaign | null>(null);
  const activeCampaignRef = useRef<AutoBroadcastCampaign | null>(null);
  useEffect(() => {
    activeCampaignRef.current = activeCampaign;
  }, [activeCampaign]);
  const [campaignHistory, setCampaignHistory] = useState<AutoBroadcastCampaign[]>([]);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const loadUnifiedDirectory = async (autoSelectDefault = false) => {
    try {
      const dirRes = await fetch(`/api/marketing/whatsapp/directory?userId=${encodeURIComponent(currentOperator.id)}`);
      if (dirRes.ok) {
        const dirData = await dirRes.json();
        const list: MarketingDirectoryContact[] = dirData.contacts || [];
        setDirectoryContacts(list);
        setDirectorySummary({
          totalCount: dirData.totalCount || list.length,
          crmCount: dirData.crmCount || list.filter(c => c.source === 'CRM_CUSTOMER').length,
          namedWaCount: dirData.namedWaCount || list.filter(c => c.source === 'WHATSAPP_NAMED').length,
          phoneWaCount: dirData.phoneWaCount || list.filter(c => c.source === 'WHATSAPP_PHONE').length
        });
        if (autoSelectDefault && selectedCustomerIds.length === 0 && list.length > 0) {
          const namedOrCrm = list.filter(c => c.source === 'CRM_CUSTOMER' || c.source === 'WHATSAPP_NAMED');
          if (namedOrCrm.length > 0) {
            setSelectedCustomerIds(namedOrCrm.map(c => c.id));
          } else {
            setSelectedCustomerIds(list.slice(0, 10).map(c => c.id));
          }
        }
      }
    } catch (err) {
      console.warn('Error loading unified WhatsApp & CRM directory:', err);
    }
  };

  const fetchInitialData = async () => {
    try {
      // 1. Load Inventory Pieces & Bales
      try {
        const [piecesData, balesData] = await Promise.all([
          PurchaseService.getInventoryPieces(),
          PurchaseService.getGatePasses()
        ]);

        if (piecesData) {
          const inStock = (piecesData || []).filter(
            (p: PieceBreakdownItem) => !p.isSold && (p.status === 'IN_STOCK' || p.status === 'AVAILABLE')
          );
          setPieces(inStock);
          if (inStock.length > 0 && selectedPieceSkus.length === 0) {
            setSelectedPieceSkus(inStock.map((p: PieceBreakdownItem) => p.barcode));
          }
        }

        if (balesData) {
          setBales(balesData);
        }
      } catch (dbErr) {
        console.warn('Database entities load error in AutoPhotoBroadcastTab:', dbErr);
      }

      // 2. Load Unified WhatsApp Phone + CRM Directory
      await loadUnifiedDirectory(true);

      // 3. Load WhatsApp session, channels, groups, AI sales mode, and active campaign status
      const [campRes, deviceRes, configRes, groupsRes, channelsRes, aiModeRes] = await Promise.all([
        fetch('/api/marketing/broadcast-campaign/status').catch(() => null),
        fetch(
          `/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentOperator.id)}&userName=${encodeURIComponent(
            currentOperator.name || currentOperator.username
          )}`
        ).catch(() => null),
        fetch('/api/marketing/whatsapp/config').catch(() => null),
        fetch(`/api/marketing/whatsapp/groups?userId=${encodeURIComponent(currentOperator.id)}`).catch(() => null),
        fetch('/api/marketing/whatsapp/channels').catch(() => null),
        fetch('/api/marketing/ai-sales-mode').catch(() => null)
      ]);

      if (aiModeRes && aiModeRes.ok) {
        const modeData = await aiModeRes.json();
        if (typeof modeData.aiSalesAndPhotosEnabled === 'boolean') {
          setAiSalesAndPhotosEnabled(modeData.aiSalesAndPhotosEnabled);
        }
      }

      if (channelsRes && channelsRes.ok) {
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

      if (configRes && configRes.ok) {
        const cfg = await configRes.json();
        if (cfg.channelConfig && (!channelConfig || !channelConfig.channelJid)) {
          setChannelConfig(cfg.channelConfig);
          if (cfg.channelConfig.channelInviteLink) {
            setTempChannelLink(cfg.channelConfig.channelInviteLink);
          }
        }
      }

      if (groupsRes && groupsRes.ok) {
        const gData = await groupsRes.json();
        setRealGroups(gData.groups || []);
      }

      if (deviceRes && deviceRes.ok) {
        const d = await deviceRes.json();
        setLinkedDevice(d);
      }

      if (campRes && campRes.ok) {
        const cData = await campRes.json();
        const histList = cData.history || [];
        setCampaignHistory(histList);
        setActiveCampaign(cData.current || histList[0] || null);
      }
    } catch (err) {
      console.warn('Error loading broadcast tab data:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events/subscribe');
      es.onmessage = event => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload.module === 'MARKETING' ||
            payload.entity === 'BROADCAST_PROGRESS' ||
            payload.entity === 'BROADCAST_CAMPAIGN_STARTED' ||
            payload.entity === 'BROADCAST_CAMPAIGN_PAUSED' ||
            payload.entity === 'BROADCAST_CAMPAIGN_RESUMED' ||
            payload.entity === 'BROADCAST_CAMPAIGN_ABORTED' ||
            payload.entity === 'BROADCAST_COMPLETED' ||
            payload.entity === 'WHATSAPP_DEVICE'
          ) {
            fetch('/api/marketing/broadcast-campaign/status')
              .then(res => res.json())
              .then(data => {
                const histList = data.history || [];
                setCampaignHistory(histList);
                setActiveCampaign(prev => data.current || prev || histList[0] || null);
              })
              .catch(() => {});
          }
        } catch (_) {}
      };
    } catch (_) {}

    const channel = supabase
      .channel('broadcast-tab-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_broadcast_campaigns' }, () => {
        fetch('/api/marketing/broadcast-campaign/status')
          .then(res => res.json())
          .then(data => {
            const histList = data.history || [];
            setCampaignHistory(histList);
            setActiveCampaign(prev => data.current || prev || histList[0] || null);
          })
          .catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_channels' }, () => {
        fetch('/api/marketing/whatsapp/channels')
          .then(res => res.json())
          .then(data => {
            if (data.channels) setChannels(data.channels);
          })
          .catch(() => {});
      })
      .subscribe();

    let pollCount = 0;
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      pollCount++;
      const isRunning = activeCampaignRef.current?.status === 'RUNNING';
      if (!isRunning && pollCount % 5 !== 0) return;

      try {
        const [campRes, devRes] = await Promise.all([
          fetch('/api/marketing/broadcast-campaign/status'),
          fetch(
            `/api/marketing/whatsapp/session?userId=${encodeURIComponent(currentOperator.id)}&userName=${encodeURIComponent(
              currentOperator.name || currentOperator.username
            )}`
          )
        ]);
        if (campRes.ok) {
          const data = await campRes.json();
          const histList = data.history || [];
          setCampaignHistory(histList);
          setActiveCampaign(prev => data.current || prev || histList[0] || null);
        }
        if (devRes.ok) {
          const dev = await devRes.json();
          setLinkedDevice(dev);
        }
      } catch {}
    }, 3000);

    return () => {
      if (es) es.close();
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
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

  const totalPiecesPages = Math.max(1, Math.ceil(filteredPieces.length / PIECES_PER_PAGE));
  const safePiecesPage = Math.min(piecesPage, totalPiecesPages);
  const paginatedPieces = filteredPieces.slice(
    (safePiecesPage - 1) * PIECES_PER_PAGE,
    safePiecesPage * PIECES_PER_PAGE
  );

  const uniqueBrands = Array.from(new Set(pieces.map(p => p.brandName).filter(Boolean)));

  // Filter Unified WhatsApp Phone + CRM Contacts
  const filteredDirectoryContacts = directoryContacts.filter(c => {
    if (contactSourceFilter === 'CRM_AND_NAMED' && c.source === 'WHATSAPP_PHONE') {
      return false;
    }
    if (contactSourceFilter === 'UAE_ONLY' && !c.phone.startsWith('+971')) {
      return false;
    }
    if (contactSourceFilter === 'INTL_ONLY' && c.phone.startsWith('+971')) {
      return false;
    }
    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.formattedPhone || '').toLowerCase().includes(q) ||
        (c.networkDetail || '').toLowerCase().includes(q) ||
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.badgeLabel || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalContactsPages = Math.max(1, Math.ceil(filteredDirectoryContacts.length / CONTACTS_PER_PAGE));
  const safeContactsPage = Math.min(contactsPage, totalContactsPages);
  const paginatedContacts = filteredDirectoryContacts.slice(
    (safeContactsPage - 1) * CONTACTS_PER_PAGE,
    safeContactsPage * CONTACTS_PER_PAGE
  );

  // Reset pagination when filters change
  useEffect(() => {
    setPiecesPage(1);
  }, [selectedBaleId, brandFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    setContactsPage(1);
  }, [contactSourceFilter, customerSearch]);

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

  const handleTestChannelPost = async () => {
    setIsTestingChannelPost(true);
    try {
      const activeJid =
        channelConfig?.channelJid && !channelConfig.channelJid.includes('0029VbEAAML89indIXn39f00')
          ? channelConfig.channelJid
          : selectedChannelJid && !selectedChannelJid.includes('0029VbEAAML89indIXn39f00')
          ? selectedChannelJid
          : '120363431101986513@newsletter';
      const samplePiece = pieces.find(p => selectedPieceSkus.includes(p.barcode)) || pieces[0];
      let img = samplePiece?.frontImageUrl || (samplePiece as any)?.front_image || '/winter_maazi_story.png';
      if (img.startsWith('/')) img = `https://vintagevibesgk.com${img}`;

      const res = await fetch('/api/marketing/whatsapp/channels/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelJid: activeJid,
          channelInviteLink:
            channelConfig?.channelInviteLink || tempChannelLink || 'https://whatsapp.com/channel/0029VbEAAML89indIXn39f00',
          imageUrl: img,
          caption:
            `🔥 *${samplePiece?.brandName || 'Vintage Archive'} - ${samplePiece?.itemName || samplePiece?.style || 'Curated Garment'}* (${samplePiece?.sizeScanned || 'L'})\n` +
            `💰 *AED ${samplePiece?.retailPriceAed || samplePiece?.estimatedPrice || 150}*\n\n` +
            `💳 *Instant Storefront Checkout:*\n` +
            `👉 https://vintagevibesgk.com/?checkout=${encodeURIComponent(samplePiece?.barcode || 'VV-TEST-001')}`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(
          `✅ Test Post Dispatched to WhatsApp Channel "${channelConfig?.channelTitle || 'Vintage'}"!\n\nChannel: ${
            data.channelJid || activeJid
          }`
        );
      } else {
        alert(`Channel Test Notice: ${data.error || 'Failed to dispatch post'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsTestingChannelPost(false);
    }
  };

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

  // Sync All Real WhatsApp Phone Numbers + CRM Customers
  const handleSyncPhoneContacts = async () => {
    setIsSyncingContacts(true);
    try {
      const res = await fetch('/api/marketing/whatsapp/directory/sync-phone-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentOperator.id })
      });
      const data = await res.json();
      await loadUnifiedDirectory(false);
      if (res.ok) {
        alert(
          `✅ WhatsApp Phone & CRM Directory Synced!\n\nTotal Ready Contacts: ${
            data.totalContacts || directoryContacts.length
          } numbers from your linked WhatsApp phone (${linkedDevice?.phoneNumber || '+971 55 418 6086'}) and CRM database.`
        );
      } else {
        alert(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error syncing phone contacts: ${err.message}`);
    } finally {
      setIsSyncingContacts(false);
    }
  };

  // Add New Customer to CRM & WhatsApp Directory
  const handleAddNewCustomerPhone = async () => {
    if (!newContactPhone.trim()) {
      alert('Please enter a valid WhatsApp phone number (e.g. +971501234567)');
      return;
    }
    try {
      const res = await fetch('/api/marketing/whatsapp/directory/add-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContactName.trim() || `VIP Customer (${newContactPhone.trim()})`,
          phone: newContactPhone.trim(),
          city: newContactCity.trim() || 'Dubai'
        })
      });
      const data = await res.json();
      if (res.ok && data.customer) {
        const added: MarketingDirectoryContact = data.customer;
        setDirectoryContacts(prev => [added, ...prev.filter(c => c.phone !== added.phone)]);
        setSelectedCustomerIds(prev => [...new Set([added.id, ...prev])]);
        setNewContactName('');
        setNewContactPhone('');
        setIsAddingContact(false);
      } else {
        alert(data.error || 'Could not add customer');
      }
    } catch (err: any) {
      alert(`Error adding contact: ${err.message || err}`);
    }
  };

  // Start Direct Automated 3-Photo Broadcast
  const handleStartBroadcast = async () => {
    if (selectedPieceSkus.length === 0) {
      alert('Please select at least 1 garment to broadcast.');
      return;
    }
    if (audienceMode === 'CUSTOMER_DIRECTORY' && selectedCustomerIds.length === 0) {
      alert('Please select at least 1 WhatsApp phone or CRM customer from the directory.');
      return;
    }
    if (audienceMode === 'GROUPS' && !customChatId) {
      alert('Please select a WhatsApp group first.');
      return;
    }

    setIsProcessingAction(true);

    try {
      const selectedCustomerList = directoryContacts.filter(c => selectedCustomerIds.includes(c.id));
      const targetAudienceLabel =
        audienceMode === 'CHANNEL'
          ? `Official WhatsApp Drop Channel (${channelConfig?.channelTitle || 'Vintage Vibes Drops'})`
          : audienceMode === 'CUSTOMER_DIRECTORY'
          ? `Direct WhatsApp & CRM (${selectedCustomerList.length} Contacts)`
          : realGroups.find(g => g.id === customChatId)?.name || customChatId || 'VIP WhatsApp Group';

      const matchedChannel =
        channels.find(c => c.id === selectedChannelJid || c.jid === selectedChannelJid) ||
        channels.find(c => c.isDefault) ||
        channels[0];
      const activeChannelJid =
        matchedChannel?.jid && matchedChannel.jid.includes('@newsletter') && !matchedChannel.jid.includes('120363000000000000')
          ? matchedChannel.jid
          : channelConfig?.channelJid &&
            !channelConfig.channelJid.includes('0029VbEAAML89indIXn39f00') &&
            !channelConfig.channelJid.includes('120363000000000000') &&
            channelConfig.channelJid.includes('@newsletter')
          ? channelConfig.channelJid
          : '120363431101986513@newsletter';

      const targetDestinationId =
        audienceMode === 'CHANNEL'
          ? activeChannelJid
          : audienceMode === 'CUSTOMER_DIRECTORY'
          ? selectedCustomerList.length === 1
            ? selectedCustomerList[0].phone
            : `Multi-Direct (${selectedCustomerList.length} Phones)`
          : customChatId;

      const customerPhones =
        audienceMode === 'CUSTOMER_DIRECTORY'
          ? selectedCustomerList.map(c => c.phone).filter(Boolean)
          : undefined;

      // Send full 3-photo metadata (frontImageUrl, backImageUrl, tagImageUrl) for ALL selected pieces
      const selectedPieceObjects = pieces.filter(p => selectedPieceSkus.includes(p.barcode));
      const targetPieces = selectedPieceObjects.length > 0 ? selectedPieceObjects : pieces;
      const piecesData = targetPieces.map(p => ({
        id: p.id,
        barcode: p.barcode,
        sku: p.barcode,
        itemName: p.itemName || p.style || 'Vintage Garment',
        brandName: p.brandName || 'Vintage',
        sizeScanned: p.sizeScanned || 'L',
        labelGrade: p.labelGrade || 'Grade A',
        retailPriceAed: p.retailPriceAed || p.estimatedPrice || 120,
        frontImageUrl: p.frontImageUrl || (p as any).front_image_url || '',
        backImageUrl: p.backImageUrl || (p as any).back_image_url || p.frontImageUrl || '',
        tagImageUrl: p.tagImageUrl || (p as any).tag_image_url || p.frontImageUrl || ''
      }));

      const res = await fetch('/api/marketing/broadcast-campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: campaignTitle,
          targetAudience: targetAudienceLabel,
          targetChatId: targetDestinationId,
          customerPhones,
          pieceIds: selectedPieceSkus,
          piecesData,
          intervalSeconds
        })
      });

      if (res.ok) {
        const campaign = await res.json();
        setActiveCampaign(campaign);
        setQueuePage(1);
        alert(
          `🚀 Direct 3-Photo WhatsApp Broadcast Started!\n\n` +
            `• Target: ${targetAudienceLabel}\n` +
            `• Queued Garments: ${campaign.totalCount || selectedPieceSkus.length} Pieces (3-Photo Front + Back + Tag Cards)\n` +
            `• Anti-Spam Delay: ${intervalSeconds}s per garment`
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Broadcast Notice: ${errData.error || 'Failed to start broadcast'}`);
      }
    } catch (err: any) {
      alert(`Network error starting broadcast: ${err?.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

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
  const progressPercent =
    activeCampaign && activeCampaign.totalCount > 0
      ? Math.round((activeCampaign.sentCount / activeCampaign.totalCount) * 100)
      : 0;

  // Paginated Live / Sent Queue Items (falls back to latest history campaign with items or selected pieces preview)
  const campaignWithItems =
    (activeCampaign?.items && activeCampaign.items.length > 0 ? activeCampaign : null) ||
    campaignHistory.find(h => Array.isArray(h.items) && h.items.length > 0) ||
    activeCampaign;

  const fallbackPreviewItems = pieces
    .filter(p => selectedPieceSkus.includes(p.barcode))
    .map(p => ({
      piece: p,
      status: 'PENDING' as const,
      caption: `${p.brandName} - ${p.itemName}`,
      imageMediaUrl: p.frontImageUrl || (p as any).front_image_url || '/winter_maazi_story.png'
    }));

  const queueItems =
    campaignWithItems?.items && campaignWithItems.items.length > 0
      ? campaignWithItems.items
      : fallbackPreviewItems;

  const totalQueuePages = Math.max(1, Math.ceil(queueItems.length / QUEUE_PER_PAGE));
  const safeQueuePage = Math.min(queuePage, totalQueuePages);
  const paginatedQueueItems = queueItems.slice(
    (safeQueuePage - 1) * QUEUE_PER_PAGE,
    safeQueuePage * QUEUE_PER_PAGE
  );

  // Paginated Campaign History
  const totalHistoryPages = Math.max(1, Math.ceil(campaignHistory.length / HISTORY_PER_PAGE));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedHistory = campaignHistory.slice(
    (safeHistoryPage - 1) * HISTORY_PER_PAGE,
    safeHistoryPage * HISTORY_PER_PAGE
  );

  return (
    <div className="space-y-6">
      {/* 1. TOP DIRECT STATUS BANNER */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-amber-950 border border-emerald-500/40 rounded-xl p-5 text-emerald-100 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0 text-emerald-300 shadow-md">
            <Smartphone className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif font-bold text-base sm:text-lg text-white">
                Direct WhatsApp 3-Photo Garment Broadcaster & CRM Marketing Desk
              </h3>
              <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold">
                Direct Linked WhatsApp • Zero Wizard
              </span>
            </div>
            <p className="text-xs text-emerald-200/80 mt-1 max-w-2xl">
              Directly dispatches stitched <strong>3-Photo Storefront Garment Cards (Front + Back + Tag/Label)</strong> with 1-tap checkout & claim links to your <strong>{directorySummary.totalCount.toLocaleString()}+ Linked WhatsApp Contacts & CRM Buyers</strong>, Groups, or Official Channel.
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
              <span>📱 Linked: {linkedDevice.phoneNumber}</span>
            ) : (
              <span>📲 Link My WhatsApp Phone</span>
            )}
          </button>
        </div>
      </div>

      {/* 1B. WHATSAPP AI MODE CONTROL BANNER (TRIAL SUPPORT MODE vs LIVE SALES & ITEM PHOTOS MODE) */}
      <div
        className={`rounded-xl p-4 border shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition ${
          aiSalesAndPhotosEnabled
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100'
            : 'bg-amber-950/90 border-amber-500/50 text-amber-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              aiSalesAndPhotosEnabled
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
            }`}
          >
            {aiSalesAndPhotosEnabled ? <ShoppingBag className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-serif font-bold text-sm text-white">
                {aiSalesAndPhotosEnabled
                  ? '🛍️ WhatsApp AI Mode: LIVE SELLING & ITEM PHOTOS ON (Go-Ahead Active)'
                  : '🛡️ WhatsApp AI Mode: TRIAL / CONVERSATION & PROBLEM SOLVING ONLY (Item Photos OFF)'}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                  aiSalesAndPhotosEnabled
                    ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
                    : 'bg-amber-500/30 border-amber-400 text-amber-200'
                }`}
              >
                {aiSalesAndPhotosEnabled ? 'SALES & PHOTOS: ACTIVE' : 'TRIAL MODE: NO SELLING / NO PHOTOS'}
              </span>
            </div>
            <p className="text-xs opacity-90 mt-1">
              {aiSalesAndPhotosEnabled ? (
                <>
                  AI is actively pitching categories, showing <strong>3-Photo Garment Cards</strong>, and sending checkout links. (You can also send <strong>"AI SALES OFF"</strong> or <strong>"TRIAL MODE"</strong> on WhatsApp anytime).
                </>
              ) : (
                <>
                  AI will <strong>ONLY converse politely & solve customer problems</strong> (orders, parcels, invoices, support). It will <strong>NOT</strong> ask <em>"Aap ko kya chahiye?"</em> or send any item pictures until you give the go-ahead. (You can also send <strong>"AI SALES ON"</strong> or <strong>"GO AHEAD"</strong> on WhatsApp).
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            disabled={isTogglingAiMode}
            onClick={() => handleToggleAiSalesMode(!aiSalesAndPhotosEnabled)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md active:scale-95 border ${
              aiSalesAndPhotosEnabled
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>
              {isTogglingAiMode
                ? 'Switching Mode...'
                : aiSalesAndPhotosEnabled
                ? '⏸️ Switch to Trial / Support Only Mode'
                : '🚀 Give Go-Ahead: Activate AI Selling & Photos'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. MAIN DIRECT WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN (7 Cols): DIRECT GARMENT SELECTION + DIRECT CRM/WHATSAPP DIRECTORY + DIRECT LAUNCH BAR */}
        <div className="lg:col-span-7 space-y-6">
          {/* SECTION A: CAMPAIGN TITLE & GARMENT SELECTION (3-PHOTO CARD PREVIEW + PAGINATION) */}
          <div className="bg-white border border-stone-200/80 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-stone-200 bg-stone-900 text-white flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <h4 className="font-serif font-bold text-sm">
                  1. Select Garments for 3-Photo Card Broadcast (Front + Back + Label)
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold">
                  {selectedPieceSkus.length} of {pieces.length} Selected
                </span>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Campaign Title Input */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Broadcast Drop Title
                  </label>
                  <input
                    type="text"
                    value={campaignTitle}
                    onChange={e => setCampaignTitle(e.target.value)}
                    disabled={isCampaignActive}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:border-amber-600 disabled:bg-stone-100 font-medium text-stone-800"
                    placeholder="e.g., 🔥 Dubai Vault Hype Drop • 90s Outerwear"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Search SKU / Brand / Garment
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      disabled={isCampaignActive}
                      placeholder="Filter by SKU or brand..."
                      className="w-full pl-8 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:border-amber-600"
                    />
                  </div>
                </div>
              </div>

              {/* Filter Bar + Select All / Clear */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 p-2.5 rounded-lg border border-stone-200/80">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedBaleId}
                    onChange={e => setSelectedBaleId(e.target.value)}
                    disabled={isCampaignActive}
                    className="px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
                  >
                    <option value="ALL">All Bales ({pieces.length})</option>
                    {bales.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.gatePassNumber} — {b.supplierName}
                      </option>
                    ))}
                  </select>

                  <select
                    value={brandFilter}
                    onChange={e => setBrandFilter(e.target.value)}
                    disabled={isCampaignActive}
                    className="px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white text-stone-700"
                  >
                    <option value="ALL">All Brands</option>
                    {uniqueBrands.map(b => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isCampaignActive}
                    onClick={() => setSelectedPieceSkus(filteredPieces.map(p => p.barcode))}
                    className="text-[11px] font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-900 hover:bg-amber-200 transition cursor-pointer"
                  >
                    Select All ({filteredPieces.length})
                  </button>
                  <button
                    type="button"
                    disabled={isCampaignActive}
                    onClick={() => setSelectedPieceSkus([])}
                    className="text-[11px] font-bold px-2.5 py-1 rounded bg-stone-200 text-stone-700 hover:bg-stone-300 transition cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Garment Grid with 3-Photo Thumbnails (Front + Back + Tag) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {paginatedPieces.map(piece => {
                  const isSelected = selectedPieceSkus.includes(piece.barcode);
                  const frontImg = piece.frontImageUrl || (piece as any).front_image_url || '/winter_maazi_story.png';
                  const backImg = piece.backImageUrl || (piece as any).back_image_url || frontImg;
                  const tagImg = piece.tagImageUrl || (piece as any).tag_image_url || frontImg;

                  return (
                    <label
                      key={piece.barcode}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                        isSelected
                          ? 'bg-amber-50/90 border-amber-500 shadow-sm'
                          : 'bg-white border-stone-200 hover:bg-stone-50'
                      } ${isCampaignActive ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedPieceSkus(prev => [...new Set([...prev, piece.barcode])]);
                          } else {
                            setSelectedPieceSkus(prev => prev.filter(sku => sku !== piece.barcode));
                          }
                        }}
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 w-4 h-4 shrink-0"
                      />

                      {/* 3-Photo Mini Strip (Front + Back + Tag) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-stone-200 overflow-hidden border border-stone-300 relative" title="Front Photo">
                          <img src={frontImg} alt="Front" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[7px] text-white text-center font-mono">
                            FRONT
                          </span>
                        </div>
                        <div className="w-8 h-10 rounded-lg bg-stone-200 overflow-hidden border border-stone-300 relative" title="Back Photo">
                          <img src={backImg} alt="Back" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[7px] text-white text-center font-mono">
                            BACK
                          </span>
                        </div>
                        <div className="w-8 h-10 rounded-lg bg-stone-200 overflow-hidden border border-stone-300 relative" title="Label/Tag Photo">
                          <img src={tagImg} alt="Tag" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[7px] text-amber-300 text-center font-mono">
                            TAG
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-stone-800 truncate">
                          {piece.brandName} • {piece.itemName}
                        </div>
                        <div className="text-[10px] font-mono text-stone-500 truncate">{piece.barcode}</div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {piece.retailPriceAed || piece.estimatedPrice || 120} AED • {piece.sizeScanned || 'L'}
                          </span>
                          <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded">
                            3-Photo Card
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Garment Pagination Bar (Always Visible) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200 text-xs">
                <span className="text-[11px] text-stone-600 font-mono">
                  Showing{' '}
                  {filteredPieces.length === 0 ? 0 : (safePiecesPage - 1) * PIECES_PER_PAGE + 1}–
                  {Math.min(safePiecesPage * PIECES_PER_PAGE, filteredPieces.length)} of{' '}
                  <strong>{filteredPieces.length}</strong> Garments (Page {safePiecesPage} of {totalPiecesPages})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePiecesPage <= 1}
                    onClick={() => setPiecesPage(1)}
                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 text-[11px] font-mono font-bold cursor-pointer"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    disabled={safePiecesPage <= 1}
                    onClick={() => setPiecesPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  {Array.from({ length: totalPiecesPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPiecesPage(pageNum)}
                      className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition ${
                        pageNum === safePiecesPage
                          ? 'bg-stone-900 text-amber-300 border border-stone-900'
                          : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={safePiecesPage >= totalPiecesPages}
                    onClick={() => setPiecesPage(p => Math.min(totalPiecesPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safePiecesPage >= totalPiecesPages}
                    onClick={() => setPiecesPage(totalPiecesPages)}
                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 text-[11px] font-mono font-bold cursor-pointer"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION B: DIRECT TARGET AUDIENCE & UNIFIED WHATSAPP PHONE + CRM DIRECTORY (WITH PAGINATION) */}
          <div className="bg-white border border-stone-200/80 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-stone-200 bg-stone-900 text-white flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h4 className="font-serif font-bold text-sm">
                  2. Target Audience (WhatsApp Phone Contacts & CRM Directory • Channel • Groups)
                </h4>
              </div>
              <span className="text-[11px] font-mono text-emerald-300">
                {directorySummary.totalCount.toLocaleString()} Real Phone Numbers Ready
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* 3 Direct Audience Mode Tabs */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-stone-100 rounded-xl border border-stone-200">
                <button
                  type="button"
                  disabled={isCampaignActive}
                  onClick={() => setAudienceMode('CUSTOMER_DIRECTORY')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    audienceMode === 'CUSTOMER_DIRECTORY'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Phone & CRM ({directorySummary.totalCount.toLocaleString()})</span>
                </button>
                <button
                  type="button"
                  disabled={isCampaignActive}
                  onClick={() => setAudienceMode('CHANNEL')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    audienceMode === 'CHANNEL'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>Official Drop Channel</span>
                </button>
                <button
                  type="button"
                  disabled={isCampaignActive}
                  onClick={() => setAudienceMode('GROUPS')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    audienceMode === 'GROUPS'
                      ? 'bg-stone-900 text-amber-300 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>WhatsApp Groups ({realGroups.length})</span>
                </button>
              </div>

              {/* TAB 1: UNIFIED WHATSAPP PHONE & CRM CUSTOMER DIRECTORY (WITH PAGINATION) */}
              {audienceMode === 'CUSTOMER_DIRECTORY' && (
                <div className="border border-stone-200 rounded-xl p-3.5 bg-stone-50/70 space-y-3">
                  {/* Top Summary & Sync Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-stone-800 block">
                        Linked WhatsApp Phone ({linkedDevice?.phoneNumber || '+971 55 418 6086'}) & CRM Buyers Directory
                      </span>
                      <span className="text-[11px] text-stone-500">
                        <strong className="text-emerald-700">{selectedCustomerIds.length}</strong> selected •{' '}
                        {directorySummary.crmCount} CRM Buyers • {directorySummary.namedWaCount} Saved Contacts •{' '}
                        {directorySummary.phoneWaCount.toLocaleString()} Synced WhatsApp Phone Numbers
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={isCampaignActive || isSyncingContacts}
                        onClick={handleSyncPhoneContacts}
                        className="text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingContacts ? 'animate-spin' : ''}`} />
                        {isSyncingContacts ? 'Syncing Phone...' : '🔄 Sync WhatsApp Phone & CRM'}
                      </button>
                      <button
                        type="button"
                        disabled={isCampaignActive}
                        onClick={() => setIsAddingContact(!isAddingContact)}
                        className="text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 border border-amber-500/30 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <UserPlus className="w-3 h-3" /> + Add Customer
                      </button>
                    </div>
                  </div>

                  {/* Quick Add Customer Form */}
                  {isAddingContact && (
                    <div className="p-3 bg-white rounded-xl border border-amber-300 shadow-sm space-y-2">
                      <div className="text-[11px] font-bold text-stone-700">
                        Add Customer to CRM & WhatsApp Marketing Directory
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={newContactName}
                          onChange={e => setNewContactName(e.target.value)}
                          placeholder="Customer Name (e.g. Tariq Al-Mansoori)"
                          className="px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg focus:outline-none focus:border-amber-600"
                        />
                        <input
                          type="text"
                          value={newContactPhone}
                          onChange={e => setNewContactPhone(e.target.value)}
                          placeholder="WhatsApp Phone (e.g. +971501234567)"
                          className="px-2.5 py-1.5 text-xs font-mono border border-stone-300 rounded-lg focus:outline-none focus:border-amber-600"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={newContactCity}
                            onChange={e => setNewContactCity(e.target.value)}
                            placeholder="City (e.g. Dubai)"
                            className="w-full px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg focus:outline-none focus:border-amber-600"
                          />
                          <button
                            type="button"
                            onClick={handleAddNewCustomerPhone}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition cursor-pointer shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Source Filter Pills + Search Input */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setContactSourceFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          contactSourceFilter === 'ALL'
                            ? 'bg-stone-900 text-white'
                            : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        All ({directoryContacts.length.toLocaleString()})
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactSourceFilter('CRM_AND_NAMED')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          contactSourceFilter === 'CRM_AND_NAMED'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        CRM & Named ({directorySummary.crmCount + directorySummary.namedWaCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactSourceFilter('UAE_ONLY')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          contactSourceFilter === 'UAE_ONLY'
                            ? 'bg-amber-600 text-white'
                            : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        🇦🇪 UAE (+971) ({directoryContacts.filter(c => c.phone.startsWith('+971')).length.toLocaleString()})
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactSourceFilter('INTL_ONLY')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          contactSourceFilter === 'INTL_ONLY'
                            ? 'bg-blue-700 text-white'
                            : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        🌍 GCC & Intl ({directoryContacts.filter(c => !c.phone.startsWith('+971')).length.toLocaleString()})
                      </button>
                    </div>

                    <div className="relative flex-1 sm:max-w-xs">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        placeholder="Search name, +971 phone, city..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-amber-600"
                      />
                    </div>
                  </div>

                  {/* Quick Selection Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-stone-200 text-[11px]">
                    <span className="text-stone-600 font-medium">
                      Quick Select:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isCampaignActive}
                        onClick={() => {
                          const pageIds = paginatedContacts.map(c => c.id);
                          setSelectedCustomerIds(prev => [...new Set([...prev, ...pageIds])]);
                        }}
                        className="text-emerald-700 hover:underline font-bold cursor-pointer"
                      >
                        + Select This Page ({paginatedContacts.length})
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        disabled={isCampaignActive}
                        onClick={() => {
                          const crmAndNamedIds = directoryContacts
                            .filter(c => c.source === 'CRM_CUSTOMER' || c.source === 'WHATSAPP_NAMED')
                            .map(c => c.id);
                          setSelectedCustomerIds(crmAndNamedIds);
                        }}
                        className="text-amber-700 hover:underline font-bold cursor-pointer"
                      >
                        Select CRM & Named ({directorySummary.crmCount + directorySummary.namedWaCount})
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        disabled={isCampaignActive}
                        onClick={() => setSelectedCustomerIds(filteredDirectoryContacts.map(c => c.id))}
                        className="text-blue-700 hover:underline font-bold cursor-pointer"
                      >
                        Select All Filtered ({filteredDirectoryContacts.length.toLocaleString()})
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        type="button"
                        disabled={isCampaignActive}
                        onClick={() => setSelectedCustomerIds([])}
                        className="text-rose-600 hover:underline font-bold cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Paginated Contact Cards Grid (With Full Phone, Network, City & CRM Details) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {paginatedContacts.map(cust => {
                      const isSelected = selectedCustomerIds.includes(cust.id);
                      const isCrm = cust.source === 'CRM_CUSTOMER';
                      const isNamedWa = cust.source === 'WHATSAPP_NAMED';

                      return (
                        <label
                          key={cust.id}
                          className={`flex items-start justify-between p-3 rounded-xl border text-xs cursor-pointer transition select-none ${
                            isSelected
                              ? 'bg-emerald-50/90 border-emerald-500 text-emerald-950 shadow-sm'
                              : 'bg-white border-stone-200/90 text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isCampaignActive}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedCustomerIds(prev => [...new Set([...prev, cust.id])]);
                                } else {
                                  setSelectedCustomerIds(prev => prev.filter(id => id !== cust.id));
                                }
                              }}
                              className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 shrink-0 mt-0.5"
                            />
                            <div className="min-w-0 flex-1 space-y-0.5">
                              {/* Line 1: Contact Name */}
                              <div className="font-bold text-stone-900 truncate flex items-center gap-1.5">
                                <span className="truncate">{cust.name}</span>
                              </div>
                              {/* Line 2: Formatted Phone + Carrier/Network Detail */}
                              <div className="text-[11px] font-mono text-emerald-700 font-bold flex flex-wrap items-center gap-1.5">
                                <span>{cust.formattedPhone || cust.phone}</span>
                                {cust.networkDetail && (
                                  <span className="text-[9.5px] font-sans font-semibold bg-emerald-100/70 text-emerald-800 px-1.5 py-0.2 rounded">
                                    {cust.networkDetail}
                                  </span>
                                )}
                              </div>
                              {/* Line 3: Location / Company / CRM Order Detail */}
                              <div className="text-[10px] text-stone-500 flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="flex items-center gap-0.5 text-stone-600 font-medium">
                                  <MapPin className="w-2.5 h-2.5 text-amber-600 inline shrink-0" />
                                  {cust.city || (cust.phone.startsWith('+971') ? 'Dubai / UAE' : 'International')}
                                </span>
                                {cust.companyName && (
                                  <span className="text-stone-600 font-semibold truncate max-w-[130px]">
                                    • 🏢 {cust.companyName}
                                  </span>
                                )}
                                {cust.email && (
                                  <span className="text-stone-400 truncate max-w-[130px]">
                                    • ✉️ {cust.email}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 ml-2 flex flex-col items-end gap-1">
                            <span
                              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                isCrm
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : isNamedWa
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-stone-100 text-stone-600 border-stone-200'
                              }`}
                            >
                              {cust.badgeLabel}
                            </span>
                            {(cust.ordersCount || 0) > 0 || (cust.totalSpentAed || 0) > 0 ? (
                              <span className="text-[10px] font-mono font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <ShoppingBag className="w-2.5 h-2.5" />
                                {cust.ordersCount || 1} Ord • AED {Number(cust.totalSpentAed || 0).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-stone-400">
                                📱 WhatsApp Ready
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                    {paginatedContacts.length === 0 && (
                      <div className="col-span-2 text-center py-8 text-xs text-stone-400">
                        No WhatsApp or CRM contacts match your filter. Click "Sync WhatsApp Phone & CRM" above.
                      </div>
                    )}
                  </div>

                  {/* Directory Pagination Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200 text-xs">
                    <span className="text-[11px] text-stone-600 font-mono">
                      Showing{' '}
                      {filteredDirectoryContacts.length === 0
                        ? 0
                        : (safeContactsPage - 1) * CONTACTS_PER_PAGE + 1}
                      –{Math.min(safeContactsPage * CONTACTS_PER_PAGE, filteredDirectoryContacts.length)} of{' '}
                      <strong>{filteredDirectoryContacts.length.toLocaleString()}</strong> Contacts
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={safeContactsPage <= 1}
                        onClick={() => setContactsPage(1)}
                        className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 text-[11px] font-mono font-bold cursor-pointer"
                      >
                        First
                      </button>
                      <button
                        type="button"
                        disabled={safeContactsPage <= 1}
                        onClick={() => setContactsPage(p => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" /> Prev
                      </button>
                      <span className="px-3 py-1 rounded bg-emerald-900 text-white font-mono text-[11px] font-bold">
                        Page {safeContactsPage} of {totalContactsPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeContactsPage >= totalContactsPages}
                        onClick={() => setContactsPage(p => Math.min(totalContactsPages, p + 1))}
                        className="px-2.5 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                      >
                        Next <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={safeContactsPage >= totalContactsPages}
                        onClick={() => setContactsPage(totalContactsPages)}
                        className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 text-[11px] font-mono font-bold cursor-pointer"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: OFFICIAL WHATSAPP DROP CHANNEL */}
              {audienceMode === 'CHANNEL' && (
                <div className="border-2 border-emerald-500/40 rounded-xl p-4 bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-900 text-white space-y-3 shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shrink-0">
                        <Megaphone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-xs font-bold text-white">
                            {channelConfig?.channelTitle || 'Vintage Vibes Official Drop Channel'}
                          </h5>
                          <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold flex items-center gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" /> Direct 3-Photo Card Post
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-300 mt-0.5">
                          Each selected garment is stitched into a 3-Photo Card (Front + Back + Tag) and posted directly to your Channel.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isCampaignActive}
                      onClick={() => setIsAddingNewChannel(!isAddingNewChannel)}
                      className="text-[10px] font-mono bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-lg border border-emerald-400 transition shrink-0 cursor-pointer flex items-center gap-1 font-bold"
                    >
                      <Plus className="w-3 h-3" /> {isAddingNewChannel ? 'Cancel' : 'Add Channel'}
                    </button>
                  </div>

                  {channels.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {channels.map(chan => {
                        const isSelected =
                          selectedChannelJid === chan.jid ||
                          selectedChannelJid === chan.id ||
                          channelConfig?.channelJid === chan.jid;
                        return (
                          <div
                            key={chan.id}
                            onClick={() => !isCampaignActive && handleSelectChannel(chan.jid || chan.id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-900/50 border-emerald-400 text-white shadow-sm'
                                : 'bg-black/30 border-white/10 text-stone-300 hover:bg-black/50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="radio"
                                name="whatsapp_channel_select"
                                checked={isSelected}
                                onChange={() => handleSelectChannel(chan.jid || chan.id)}
                                className="text-emerald-500 focus:ring-emerald-500"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold truncate">{chan.name}</span>
                                  {chan.isDefault && (
                                    <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-400/40 px-1.5 py-0.2 rounded">
                                      DEFAULT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-emerald-300/80 truncate">{chan.inviteLink}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                              {!chan.isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleSetDefaultChannel(chan.jid || chan.id)}
                                  className="text-[9px] font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-stone-200 transition cursor-pointer"
                                >
                                  Set Default
                                </button>
                              )}
                              <a
                                href={chan.inviteLink}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-emerald-300 transition"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              {channels.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteChannel(chan.jid || chan.id)}
                                  className="p-1.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isAddingNewChannel && (
                    <div className="p-3 rounded-lg bg-black/50 border border-emerald-500/40 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={newChannelTitle}
                          onChange={e => setNewChannelTitle(e.target.value)}
                          placeholder="Channel Name (e.g. Vintage Vibes VIP)"
                          className="px-2.5 py-1.5 text-xs bg-stone-900 border border-stone-700 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                        />
                        <input
                          type="text"
                          value={newChannelLink}
                          onChange={e => setNewChannelLink(e.target.value)}
                          placeholder="https://whatsapp.com/channel/..."
                          className="px-2.5 py-1.5 text-xs font-mono bg-stone-900 border border-stone-700 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleAddNewChannel}
                          disabled={isAddingChannelLoading}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer"
                        >
                          {isAddingChannelLoading ? 'Connecting...' : 'Save & Connect Channel'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setIsEditingChannel(!isEditingChannel)}
                      className="text-[11px] font-mono text-stone-300 hover:text-white underline cursor-pointer"
                    >
                      {isEditingChannel ? 'Close Link Editor' : 'Change Channel Link'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestChannelPost}
                      disabled={isTestingChannelPost}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      {isTestingChannelPost ? 'Sending Test Drop...' : '⚡ Send Test Channel Post'}
                    </button>
                  </div>

                  {isEditingChannel && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={tempChannelLink}
                        onChange={e => setTempChannelLink(e.target.value)}
                        placeholder="Paste WhatsApp Channel link..."
                        className="flex-1 px-3 py-1.5 text-xs font-mono bg-stone-900 border border-stone-700 rounded-lg text-white"
                      />
                      <button
                        type="button"
                        onClick={handleSaveQuickChannel}
                        disabled={isResolvingChannel}
                        className="px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                      >
                        {isResolvingChannel ? 'Linking...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PARTICIPATING WHATSAPP GROUPS */}
              {audienceMode === 'GROUPS' && (
                <div className="border border-stone-200 rounded-xl p-3.5 bg-stone-50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700">
                      Participating WhatsApp Groups ({realGroups.length})
                    </span>
                    <button
                      type="button"
                      disabled={isLoadingGroups}
                      onClick={async () => {
                        setIsLoadingGroups(true);
                        try {
                          const r = await fetch(
                            `/api/marketing/whatsapp/groups?userId=${encodeURIComponent(currentOperator.id)}`
                          );
                          if (r.ok) {
                            const d = await r.json();
                            setRealGroups(d.groups || []);
                          }
                        } finally {
                          setIsLoadingGroups(false);
                        }
                      }}
                      className="text-[11px] bg-stone-800 hover:bg-stone-700 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingGroups ? 'animate-spin' : ''}`} /> Refresh Groups
                    </button>
                  </div>

                  <input
                    type="text"
                    value={groupSearchQuery}
                    onChange={e => setGroupSearchQuery(e.target.value)}
                    placeholder="Search WhatsApp groups..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg"
                  />

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {realGroups
                      .filter(g => !groupSearchQuery.trim() || g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()))
                      .map(group => {
                        const isSelected = customChatId === group.id;
                        return (
                          <label
                            key={group.id}
                            onClick={() => setCustomChatId(group.id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                              isSelected
                                ? 'bg-amber-50 border-amber-500 text-stone-900 font-bold'
                                : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <input
                                type="radio"
                                name="wa_group_target"
                                checked={isSelected}
                                onChange={() => setCustomChatId(group.id)}
                                className="text-amber-600"
                              />
                              <span className="truncate">{group.name}</span>
                            </div>
                            <span className="text-[10px] font-mono text-stone-500 shrink-0">{group.size} members</span>
                          </label>
                        );
                      })}
                    {realGroups.length === 0 && (
                      <div className="text-center py-6 text-xs text-stone-400">
                        No WhatsApp groups found on linked device.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION C: DIRECT LAUNCH & THROTTLE CONTROLS (NO WIZARD STEPS!) */}
          <div className="bg-gradient-to-r from-stone-900 via-stone-900 to-emerald-950 border border-emerald-500/40 rounded-xl p-5 text-white shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-serif font-bold text-sm text-amber-300 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  3. Direct 3-Photo Broadcast Launch & Anti-Spam Interval
                </h4>
                <p className="text-[11px] text-stone-300 mt-0.5">
                  Each piece is rendered into a high-conversion 3-Photo Card (Front + Back + Tag) and sent directly from{' '}
                  <strong className="text-emerald-300">{linkedDevice?.phoneNumber || '+971 55 418 6086'}</strong>.
                </p>
              </div>
              <div className="bg-black/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-right shrink-0">
                <span className="text-[10px] font-mono uppercase text-stone-400 block">Safe Delay Between Cards</span>
                <span className="text-sm font-mono font-bold text-emerald-400">{intervalSeconds} Seconds</span>
              </div>
            </div>

            <div className="space-y-1">
              <input
                type="range"
                min={4}
                max={20}
                value={intervalSeconds}
                onChange={e => setIntervalSeconds(Number(e.target.value))}
                disabled={isCampaignActive}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-stone-400">
                <span>4s (Fast Drop)</span>
                <span>8s (Recommended Safe Delay)</span>
                <span>20s (Ultra-Safe Drip)</span>
              </div>
            </div>

            {!isCampaignActive ? (
              <button
                type="button"
                onClick={handleStartBroadcast}
                disabled={selectedPieceSkus.length === 0 || isProcessingAction}
                className="w-full py-3.5 px-5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>
                  🚀 Start Direct 3-Photo Broadcast ({selectedPieceSkus.length} Garments ➔{' '}
                  {audienceMode === 'CUSTOMER_DIRECTORY'
                    ? `${selectedCustomerIds.length} Contacts`
                    : audienceMode === 'CHANNEL'
                    ? 'Official Channel'
                    : 'WhatsApp Group'}
                  )
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {isCampaignRunning ? (
                  <button
                    type="button"
                    onClick={handlePause}
                    disabled={isProcessingAction}
                    className="py-3 px-4 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Pause className="w-4 h-4" /> Pause Broadcast Queue
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={isProcessingAction}
                    className="py-3 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Play className="w-4 h-4" /> Resume Broadcast Queue
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAbort}
                  disabled={isProcessingAction}
                  className="py-3 px-4 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Square className="w-4 h-4" /> Abort Campaign
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): SENT & QUEUED 3-PHOTO CARDS TELEMETRY (PAGINATED) + PAST HISTORY (PAGINATED) */}
        <div className="lg:col-span-5 space-y-6">
          {/* SENT & QUEUED 3-PHOTO CARDS MONITOR (ALWAYS VISIBLE + PAGINATED) */}
          <div className="bg-white border border-stone-200/80 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h4 className="font-serif font-bold text-sm">
                  Sent & Queued 3-Photo Cards ({queueItems.length} Photos)
                </h4>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full uppercase ${
                  activeCampaign?.status === 'RUNNING'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                    : activeCampaign?.status === 'PAUSED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : activeCampaign?.status === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                }`}
              >
                {activeCampaign?.status || 'READY QUEUE'}
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Campaign Progress Header */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-stone-800">
                      {activeCampaign?.title || campaignTitle}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                      Target:{' '}
                      <span className="text-stone-700 font-semibold">
                        {activeCampaign?.targetAudience ||
                          (audienceMode === 'CUSTOMER_DIRECTORY'
                            ? `${selectedCustomerIds.length} Selected Contacts`
                            : audienceMode === 'CHANNEL'
                            ? 'Official WhatsApp Drop Channel'
                            : 'WhatsApp Group')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <span className="text-base font-bold text-emerald-700">
                      {activeCampaign ? activeCampaign.sentCount : 0}
                    </span>
                    <span className="text-xs text-stone-400">
                      {' '}
                      / {activeCampaign ? activeCampaign.totalCount : queueItems.length} Sent
                    </span>
                  </div>
                </div>

                <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-500 rounded-full"
                    style={{ width: `${activeCampaign ? progressPercent : 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
                  <span>Progress: {activeCampaign ? progressPercent : 0}%</span>
                  <span>
                    Page {safeQueuePage} of {totalQueuePages} ({QUEUE_PER_PAGE} Photos / Page)
                  </span>
                </div>
              </div>

              {/* Paginated Sent & Queued 3-Photo Cards Table */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-100 border-b border-stone-200 text-[10px] font-mono uppercase text-stone-500">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">3-Photo Garment Card (F/B/T)</th>
                      <th className="py-2 px-3">Price</th>
                      <th className="py-2 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {paginatedQueueItems.map((item, idx) => {
                      const globalIdx = (safeQueuePage - 1) * QUEUE_PER_PAGE + idx + 1;
                      const p = item.piece || ({} as any);
                      const fImg = p.frontImageUrl || item.imageMediaUrl || '/winter_maazi_story.png';
                      const bImg = p.backImageUrl || fImg;
                      const tImg = p.tagImageUrl || fImg;

                      return (
                        <tr
                          key={p.barcode || globalIdx}
                          className={item.status === 'SENDING' ? 'bg-amber-50/70' : 'bg-white'}
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-stone-500">
                            {globalIdx}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-0.5 shrink-0">
                                <img
                                  src={fImg}
                                  alt="Front"
                                  className="w-8 h-9 rounded object-cover border border-stone-300"
                                  title="Front View"
                                />
                                <img
                                  src={bImg}
                                  alt="Back"
                                  className="w-7 h-9 rounded object-cover border border-stone-300"
                                  title="Back View"
                                />
                                <img
                                  src={tImg}
                                  alt="Tag"
                                  className="w-7 h-9 rounded object-cover border border-stone-300"
                                  title="Label & Tag"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-stone-800 truncate max-w-[140px]">
                                  {p.brandName || 'Vintage'} • {p.itemName || 'Piece'}
                                </div>
                                <div className="text-[10px] font-mono text-stone-400 truncate max-w-[140px]">
                                  {p.barcode}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-stone-700 text-[11px]">
                            {p.retailPriceAed || p.estimatedPrice || 120} AED
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {item.status === 'SENT' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> SENT {item.sentAt ? `(${item.sentAt})` : ''}
                              </span>
                            )}
                            {item.status === 'SENDING' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                                <Clock className="w-3 h-3 animate-spin" /> SENDING 3-PHOTO
                              </span>
                            )}
                            {item.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
                                QUEUED
                              </span>
                            )}
                            {item.status === 'FAILED' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                <AlertCircle className="w-3 h-3" /> FAILED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {paginatedQueueItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-xs text-stone-400">
                          No garments selected. Select garments on the left to queue 3-Photo Cards.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Sent Photos Queue Pagination Controls (Always Visible) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200 text-xs">
                <span className="text-[11px] font-mono text-stone-600">
                  Photos{' '}
                  {queueItems.length === 0 ? 0 : (safeQueuePage - 1) * QUEUE_PER_PAGE + 1}–
                  {Math.min(safeQueuePage * QUEUE_PER_PAGE, queueItems.length)} of{' '}
                  <strong>{queueItems.length}</strong> (Page {safeQueuePage}/{totalQueuePages})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeQueuePage <= 1}
                    onClick={() => setQueuePage(1)}
                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 text-[10px] font-mono font-bold cursor-pointer"
                  >
                    First
                  </button>
                  <button
                    type="button"
                    disabled={safeQueuePage <= 1}
                    onClick={() => setQueuePage(p => Math.max(1, p - 1))}
                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 flex items-center gap-0.5 text-[11px] font-bold cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" /> Prev
                  </button>
                  {Array.from({ length: totalQueuePages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setQueuePage(pageNum)}
                      className={`px-2 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition ${
                        pageNum === safeQueuePage
                          ? 'bg-emerald-800 text-white border border-emerald-800'
                          : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={safeQueuePage >= totalQueuePages}
                    onClick={() => setQueuePage(p => Math.min(totalQueuePages, p + 1))}
                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 flex items-center gap-0.5 text-[11px] font-bold cursor-pointer"
                  >
                    Next <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={safeQueuePage >= totalQueuePages}
                    onClick={() => setQueuePage(totalQueuePages)}
                    className="px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 text-[10px] font-mono font-bold cursor-pointer"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* PAST AUTOMATED BROADCAST HISTORY (CLICKABLE TO VIEW SENT PHOTOS + ALWAYS-VISIBLE PAGINATION) */}
          {campaignHistory.length > 0 && (
            <div className="bg-white border border-stone-200/80 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Past Automated Broadcast History ({campaignHistory.length})
                </h5>
                <span className="text-[11px] font-mono text-stone-500">
                  Page {safeHistoryPage} of {totalHistoryPages}
                </span>
              </div>

              <div className="space-y-2">
                {paginatedHistory.map(hist => {
                  const isInspecting = activeCampaign?.id === hist.id;
                  return (
                    <div
                      key={hist.id}
                      onClick={() => {
                        setActiveCampaign(hist);
                        setQueuePage(1);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        isInspecting
                          ? 'bg-emerald-50/80 border-emerald-500 shadow-sm'
                          : 'bg-stone-50 border-stone-200/70 hover:bg-stone-100'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-stone-800 truncate">{hist.title}</div>
                        <div className="text-[11px] text-stone-500 truncate">
                          {hist.targetAudience} • <strong>{hist.sentCount}/{hist.totalCount}</strong> photos sent
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-emerald-700 font-bold underline">
                          {isInspecting ? 'Viewing' : 'View Photos'}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            hist.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {hist.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* History Pagination Controls (Always Visible) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200">
                <span className="text-[11px] font-mono text-stone-600">
                  Showing {(safeHistoryPage - 1) * HISTORY_PER_PAGE + 1}–
                  {Math.min(safeHistoryPage * HISTORY_PER_PAGE, campaignHistory.length)} of {campaignHistory.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeHistoryPage <= 1}
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setHistoryPage(pageNum)}
                      className={`px-2 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition ${
                        pageNum === safeHistoryPage
                          ? 'bg-stone-900 text-white'
                          : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={safeHistoryPage >= totalHistoryPages}
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-40 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multi-User WhatsApp Phone Link Modal */}
      <WhatsAppDeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        onSessionUpdate={s => setLinkedDevice(s)}
      />

      {/* Social Live Stream Connect Modal (YouTube, Instagram, TikTok) */}
      <SocialLiveConnectModal isOpen={isSocialModalOpen} onClose={() => setIsSocialModalOpen(false)} />
    </div>
  );
};
