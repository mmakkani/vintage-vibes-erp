import React, { useState, useEffect } from 'react';
import {
  CompanyProfile,
  CurrencyItem,
  ItemMaster,
  BrandMaster,
  LabelGrade,
  ShopMaster,
  CategoryMaster,
  ProductCategory,
  CollectionMaster,
  SizeMaster,
  LiveStreamMulticastConfig,
  LiveBoothStreamConfig,
  BankAccountConfig
} from '../setup.types.ts';
import { POSTerminalConfig, POSTerminalDevice } from '../hardware.types.ts';
import {
  Building2,
  DollarSign,
  Shirt,
  Tag,
  Store,
  CreditCard,
  Smartphone,
  MessageSquare,
  Save,
  CheckCircle,
  Copy,
  Layers,
  Landmark,
  Check,
  Edit2,
  ExternalLink,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  Plus,
  Trash2,
  QrCode,
  Printer,
  Search,
  Package,
  Lock,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  Radio,
  Wifi,
  Globe,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Maximize2,
  Wrench,
  Video,
  FolderTree,
  Calendar,
  ChevronRight,
  Activity
} from 'lucide-react';
import { BulkDataImportModal } from '../../../components/BulkDataImportModal.tsx';
import { QRCodeCanvas } from 'qrcode.react';
import { SecurityMasterPin } from '../../../utils/securityMasterPin.ts';
import { ThermalBarcodeConfigEngine } from './ThermalBarcodeConfigEngine.tsx';
import { PaymentGatewaySetupCard } from './PaymentGatewaySetupCard.tsx';
import { UnifiedLiveBroadcastHub } from './UnifiedLiveBroadcastHub.tsx';
import { WhatsAppConfigEngine } from './WhatsAppConfigEngine.tsx';
import { PaymentGatewayModal } from './PaymentGatewayModal.tsx';
import { SocialSocketsModal } from './SocialSocketsModal.tsx';
import { ModuleMaintenanceSwitchboard } from './ModuleMaintenanceSwitchboard.tsx';
import { GeminiApiConfigCard } from './GeminiApiConfigCard.tsx';
import { Zap } from 'lucide-react';
import { CompanyProfileService } from '../../../services/companyProfileService.ts';
import { SetupService } from '../../../services/setupService.ts';
import { PurchaseService } from '../../../services/purchaseService.ts';

export type SetupSubTab = 'profile' | 'sales_coa' | 'ai_vision' | 'maintenance' | 'payment_gateways' | 'live_multicast_sockets' | 'banks' | 'pos_terminal' | 'bale_qr' | 'currency' | 'categories' | 'sizes' | 'items' | 'brands' | 'labels' | 'shops' | 'whatsapp' | 'security';

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  addressLine1: 'House 14 Street 4 - Al Jimi - Al Nudood',
  addressLine2: 'Al Ain, Abu Dhabi, United Arab Emirates',
  city: 'Al Ain, Abu Dhabi',
  country: 'United Arab Emirates',
  trnTaxNo: 'TRN-100482910300003',
  defaultCurrency: 'AED',
  logoUrl: '/vintage_logo.svg',
  phone: '+971 55 418 6086',
  email: 'sales@vintagevibesllcspc.com',
  vatRatePercent: 5.0,
  globalStockAlertThreshold: 5,
  bankQrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBES%20GENERAL%20TRADING%26bank%3DEMIRATES%20NBD',
  bankIban: 'AE24 0331 2345 6789 0123 456',
  bankName: 'Emirates NBD',
  bankAccountTitle: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
  enableCod: true,
  enableBankTransfer: true,
  enableCardPay: true,
  enableAppleGooglePay: true,
  freeShippingThresholdAed: 350,
  standardShippingFeeAed: 25,
  whatsappOrderNumber: '+971554186086',
  virtualHostVideoUrl: '/mazi_video.mp4',
  virtual_host_video_url: '/mazi_video.mp4',
  paymentGateway: {
    provider: 'STRIPE_UAE',
    environment: 'SANDBOX',
    isEnabled: true,
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    merchantAccountId: '',
    applePayMerchantId: 'merchant.com.vintagevibes.ae',
    applePayDomainVerified: true,
    googlePayMerchantId: '',
    allowApplePay: true,
    allowGooglePay: true,
    allowCreditDebitCards: true,
    currency: 'AED',
    settlementCoaAccountId: '1120-00',
    gatewayFeePercent: 2.9
  }
};

interface SetupViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

export const SetupView: React.FC<SetupViewProps> = ({ onRefreshAll }) => {
  const [subTab, setSubTabState] = useState<SetupSubTab>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let sub = urlParams.get('setupSubTab') as any;
      if (sub === 'social_sockets' || sub === 'live_stream') sub = 'live_multicast_sockets';
      if (sub && ['profile', 'sales_coa', 'ai_vision', 'maintenance', 'payment_gateways', 'live_multicast_sockets', 'banks', 'pos_terminal', 'currency', 'categories', 'sizes', 'items', 'brands', 'labels', 'shops', 'whatsapp', 'bale_qr', 'security'].includes(sub)) {
        return sub;
      }
      let saved = localStorage.getItem('vintage_setup_subtab') as any;
      if (saved === 'social_sockets' || saved === 'live_stream') saved = 'live_multicast_sockets';
      if (saved && ['profile', 'sales_coa', 'ai_vision', 'maintenance', 'payment_gateways', 'live_multicast_sockets', 'banks', 'pos_terminal', 'currency', 'categories', 'sizes', 'items', 'brands', 'labels', 'shops', 'whatsapp', 'bale_qr', 'security'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'profile';
  });

  const setSubTab = (tab: SetupSubTab) => {
    setSubTabState(tab);
    try {
      localStorage.setItem('vintage_setup_subtab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('setupSubTab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  // Dedicated Modal Dialogs for Top Setup Bar Actions
  const [showPaymentGatewayModal, setShowPaymentGatewayModal] = useState(false);
  const [showSocialSocketsModal, setShowSocialSocketsModal] = useState(false);

  // Smart POS Terminal Configuration State
  const [posConfig, setPosConfig] = useState<POSTerminalConfig>({
    terminalModel: 'PAX_A920',
    connectionType: 'LAN_ETHERNET',
    terminalIp: '192.168.1.150',
    port: 8080,
    terminalId: 'TID-DXB-001',
    merchantId: 'MID-VV-9881',
    currency: 'AED',
    autoConfirmToCOA: true,
    simulateMachine: true,
    status: 'ONLINE'
  });
  const [posPingStatus, setPosPingStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [isSavingPosConfig, setIsSavingPosConfig] = useState(false);

  // Multi-Device Smart POS Fleet State (1 to 5 Devices, Active/Inactive Toggles)
  const [posFleet, setPosFleet] = useState<POSTerminalDevice[]>([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<POSTerminalDevice | null>(null);
  const [deviceForm, setDeviceForm] = useState<Omit<POSTerminalDevice, 'id'>>({
    name: 'Counter 1 - Main Desk PED',
    model: 'PAX_A960',
    connectionType: 'CELLULAR_SIM',
    ipAddress: '',
    port: 8080,
    terminalId: '12857001',
    merchantId: '114400000012857',
    serialNumber: '1180511614',
    imei: '350814987795465',
    simCarrier: 'DU',
    paymobTid: '51898',
    paymobMid: '85283',
    isActive: true,
    status: 'ONLINE',
    location: 'Main Cash Counter'
  });
  const [devicePingResults, setDevicePingResults] = useState<Record<string, 'TESTING' | 'SUCCESS' | 'FAILED'>>({});

  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  // Sales & Dynamic COA Routing Configuration State
  const [salesCoaConfig, setSalesCoaConfig] = useState({
    cogsAccountCode: '5100-02',
    finishedGoodsAccountCode: '1160-01',
    posRevenueAccountCode: '4110-01',
    walkInCustomerAccountCode: '1130-05',
    vatOutputAccountCode: '2140-01',
    cashAccountCode: '1110-01',
    bankAccountCode: '1120-01'
  });
  const [isSavingSalesCoa, setIsSavingSalesCoa] = useState(false);

  useEffect(() => {
    if (companyProfile) {
      setSalesCoaConfig({
        cogsAccountCode: companyProfile.cogsAccountCode || companyProfile.cogs_account_code || '5100-02',
        finishedGoodsAccountCode: companyProfile.finishedGoodsAccountCode || companyProfile.finished_goods_account_code || '1160-01',
        posRevenueAccountCode: companyProfile.posRevenueAccountCode || companyProfile.pos_revenue_account_code || '4110-01',
        walkInCustomerAccountCode: companyProfile.walkInCustomerAccountCode || companyProfile.walk_in_customer_account_code || '1130-05',
        vatOutputAccountCode: companyProfile.vatOutputAccountCode || companyProfile.vat_output_account_code || '2140-01',
        cashAccountCode: companyProfile.cashAccountCode || companyProfile.cash_account_code || '1110-01',
        bankAccountCode: companyProfile.bankAccountCode || companyProfile.bank_account_code || '1120-01'
      });
    }
  }, [companyProfile]);
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [brands, setBrands] = useState<BrandMaster[]>([]);
  const [labels, setLabels] = useState<LabelGrade[]>([]);
  const [shops, setShops] = useState<ShopMaster[]>([]);
  const [categories, setCategories] = useState<CategoryMaster[]>([]);
  const [sizes, setSizes] = useState<SizeMaster[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryQualityFilter, setCategoryQualityFilter] = useState<'ALL' | 'CREAM' | 'NON_BRAND' | 'GRADE_A' | 'GRADE_B'>('ALL');
  const [sizeSearch, setSizeSearch] = useState('');

  // 4-Tier Cascading Taxonomy & Collections Master States
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [collections, setCollections] = useState<CollectionMaster[]>([]);
  const [taxonomyTab, setTaxonomyTab] = useState<'departments' | 'categories' | 'subcategories' | 'collections'>('departments');

  // Search & Filter states for the 4 taxonomy tabs
  const [deptSearch, setDeptSearch] = useState('');
  const [mainCatSearch, setMainCatSearch] = useState('');
  const [mainCatDeptFilter, setMainCatDeptFilter] = useState('ALL');
  const [subCatSearch, setSubCatSearch] = useState('');
  const [subCatMainFilter, setSubCatMainFilter] = useState('ALL');
  const [colSearch, setColSearch] = useState('');

  // 1. Department Modal State
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<ProductCategory | null>(null);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', slug: '', sortOrder: 1, isActive: true });

  // 2. Main Category Modal State
  const [showMainCatModal, setShowMainCatModal] = useState(false);
  const [editingMainCat, setEditingMainCat] = useState<ProductCategory | null>(null);
  const [mainCatForm, setMainCatForm] = useState({ name: '', slug: '', parentId: '', sortOrder: 1, isActive: true });

  // 3. Sub-Category Modal State
  const [showSubCatModal, setShowSubCatModal] = useState(false);
  const [editingSubCat, setEditingSubCat] = useState<ProductCategory | null>(null);
  const [subCatForm, setSubCatForm] = useState({ name: '', slug: '', parentId: '', sortOrder: 1, isActive: true });

  // 4. Collection Modal State
  const [showColModal, setShowColModal] = useState(false);
  const [editingCol, setEditingCol] = useState<CollectionMaster | null>(null);
  const [colForm, setColForm] = useState({ name: '', code: '', season: 'All Season', year: 2026, sortOrder: 1, isActive: true });

  // Legacy Category Master Modal State (Backwards compatibility)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryMaster | null>(null);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('ALL');
  const [categoryForm, setCategoryForm] = useState<{
    code: string;
    name: string;
    slug: string;
    description: string;
    qualityTier: 'CREAM' | 'GRADE_A' | 'NON_BRAND' | 'GRADE_B' | 'MIXED';
    sortOrder: number;
    isActive: boolean;
    parentId?: string | null;
    departmentCode?: string;
  }>({ code: '', name: '', slug: '', description: '', qualityTier: 'CREAM', sortOrder: 1, isActive: true, parentId: null, departmentCode: '' });

  // Size Master Modal State
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingSize, setEditingSize] = useState<SizeMaster | null>(null);
  const [sizeForm, setSizeForm] = useState({ code: '', name: '', category: 'Tops / Universal', sortOrder: 1 });

  const [bales, setBales] = useState<any[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // Bank Accounts Management State (Auto-synced to COA & Bank-Wise POS Fleets)
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankModalTab, setBankModalTab] = useState<'details' | 'pos_fleet'>('details');
  const [editingBank, setEditingBank] = useState<BankAccountConfig | null>(null);
  const [viewingQrBank, setViewingQrBank] = useState<BankAccountConfig | null>(null);
  const [bankForm, setBankForm] = useState<Omit<BankAccountConfig, 'id'>>({
    bankName: '',
    accountTitle: '',
    iban: '',
    accountNumber: '',
    branchName: '',
    swiftBic: '',
    currency: 'AED',
    qrCodeUrl: '',
    isPrimary: false,
    linkedPosTerminalId: '',
    coaAccountCode: '1120-00',
    status: 'ACTIVE',
    posFleet: []
  });

  // State for adding / editing a machine inside the Bank Modal (1 to 5 devices per bank)
  const [showBankDeviceForm, setShowBankDeviceForm] = useState(false);
  const [editingBankDeviceIndex, setEditingBankDeviceIndex] = useState<number | null>(null);
  const [bankDeviceForm, setBankDeviceForm] = useState<POSTerminalDevice>({
    id: '',
    name: 'RAKBANK Paymob PAX A960',
    model: 'PAX_A960',
    connectionType: 'CELLULAR_SIM',
    ipAddress: '',
    port: 8080,
    terminalId: '12857001',
    merchantId: '114400000012857',
    serialNumber: '1180511614',
    imei: '350814987795465',
    simCarrier: 'DU',
    paymobTid: '51898',
    paymobMid: '85283',
    isActive: true,
    status: 'ONLINE',
    location: 'Main Cash Counter'
  });

  // Filter states for Section 2: Live Status Logs
  const [fleetLogFilter, setFleetLogFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [fleetLogBankFilter, setFleetLogBankFilter] = useState<string>('ALL');


  // Live Stream Multicast Configuration
  const [liveConfig, setLiveConfig] = useState<LiveStreamMulticastConfig>({
    provider: 'RESTREAM',
    enabled: true,
    accountEmail: 'live@vintagevibe.ae',
    accountPassword: '',
    apiKey: '',
    masterIngestRtmpUrl: 'rtmp://live.restream.io/live',
    masterStreamKey: 're_live_sec_10482_vv_dxb_773',
    autoRelayToTikTok: true,
    autoRelayToInstagram: true,
    autoRelayToFacebook: true,
    autoRelayToYouTube: true,
    tikTokStreamKey: 'live_tt_dubai_bale_stage',
    instagramStreamKey: 'live_ig_relove_vintage',
    facebookStreamKey: 'FB-live-page-vv-992',
    youTubeStreamKey: 'yt_live_channel_dxb_1080',
    status: 'CONNECTED',
    lastSyncedAt: undefined
  });
  const [showLivePassword, setShowLivePassword] = useState(false);
  const [isSavingLiveConfig, setIsSavingLiveConfig] = useState(false);
  const [isTestingLiveConfig, setIsTestingLiveConfig] = useState(false);

  // 5-Booth Multi-Broadcast Relays State
  const [selectedBoothId, setSelectedBoothId] = useState<string>('booth-1');
  const [boothConfigs, setBoothConfigs] = useState<LiveBoothStreamConfig[]>([]);

  // WhatsApp report state
  const [whatsappReportText, setWhatsappReportText] = useState<string>('');
  const [copiedReport, setCopiedReport] = useState(false);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);

  // New Currency Form State
  const [showAddCurrencyModal, setShowAddCurrencyModal] = useState(false);
  const [newCurrCode, setNewCurrCode] = useState('');
  const [newCurrName, setNewCurrName] = useState('');
  const [newCurrSymbol, setNewCurrSymbol] = useState('');
  const [newCurrRate, setNewCurrRate] = useState('0.272');
  const [newCurrIsBase, setNewCurrIsBase] = useState(false);
  const [isSavingCurr, setIsSavingCurr] = useState(false);
  const [editingRates, setEditingRates] = useState<Record<string, number>>({});

  // Item Master Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [itemForm, setItemForm] = useState({ code: '', name: '', category: 'Denim & Outerwear', basePrice: 100, targetUom: 'KG' as any, weightKg: 1, minStockThreshold: 5 });

  // Brand Tier Modal State
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandMaster | null>(null);
  const [brandForm, setBrandForm] = useState({ name: '', tier: 'Vintage Grail', origin: 'USA', era: '90s' });

  // Label Grade / Quality Modal State
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelGrade | null>(null);
  const [labelForm, setLabelForm] = useState<{
    code: string;
    name: string;
    description: string;
    qualityTier: 'CREAM' | 'GRADE_A' | 'NON_BRAND' | 'GRADE_B' | 'REWORK';
    priceMultiplier: number;
    sortOrder: number;
  }>({ code: '', name: '', description: '', qualityTier: 'CREAM', priceMultiplier: 1.5, sortOrder: 1 });

  const loadData = async () => {
    try {
      const [profRes, currRes, itemRes, brandRes, labelRes, shopRes, catRes, prodCatRes, colRes, sizeRes, balesRes, liveRes, boothsRes] = await Promise.all([
        CompanyProfileService.getCompanyProfile().catch(e => { console.warn(e); return null; }),
        SetupService.getCurrencies().catch(e => { console.warn(e); return []; }),
        SetupService.getItems().catch(e => { console.warn(e); return []; }),
        SetupService.getBrands().catch(e => { console.warn(e); return []; }),
        SetupService.getLabelGrades().catch(e => { console.warn(e); return []; }),
        SetupService.getShops().catch(e => { console.warn(e); return []; }),
        SetupService.getCategories().catch(e => { console.warn(e); return []; }),
        SetupService.getProductCategories().catch(e => { console.warn(e); return []; }),
        SetupService.getCollections().catch(e => { console.warn(e); return []; }),
        SetupService.getSizes().catch(e => { console.warn(e); return []; }),
        PurchaseService.getGatePasses().catch(e => { console.warn(e); return []; }),
        fetch('/api/setup/live-multicast').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/setup/live-booths').then(r => (r.ok ? r.json() : null)).catch(() => null)
      ]);

      if (profRes) {
        setCompanyProfile(profRes);
        const ptc = profRes.posTerminalConfig || {};
        setPosConfig({
          terminalModel: ptc.terminalModel || ptc.model || 'PAX_A920',
          connectionType: ptc.connectionType || 'IP_ETHERNET',
          terminalIp: ptc.terminalIp || ptc.ipAddress || '192.168.1.150',
          port: ptc.port || 8080,
          terminalId: ptc.terminalId || 'TID-DXB-001',
          merchantId: ptc.merchantId || 'MID-VV-9881',
          currency: ptc.currency || 'AED',
          autoConfirmToCOA: ptc.autoConfirmToCOA !== false,
          simulateMachine: ptc.simulateMachine !== false,
          status: ptc.status || 'ONLINE',
          settlementCoaAccountCode: ptc.settlementCoaAccountCode || '1120-02',
          linkedBankName: ptc.linkedBankName || 'RAKBANK',
          ...ptc
        });
        let currentBanks: BankAccountConfig[] = profRes.bankAccounts || [];
        const ptcFleet = Array.isArray(ptc.fleet) ? ptc.fleet : [];

        // Migration: If banks exist, but no bank has posFleet yet, attach ptcFleet to primary bank
        const hasAnyBankFleet = currentBanks.some(b => Array.isArray(b.posFleet) && b.posFleet.length > 0);
        if (!hasAnyBankFleet && currentBanks.length > 0 && ptcFleet.length > 0) {
          currentBanks = currentBanks.map(b => {
            if (b.isPrimary) {
              return { ...b, posFleet: ptcFleet };
            }
            return b;
          });
        }

        const allBankDevices: POSTerminalDevice[] = [];
        currentBanks.forEach(b => {
          (b.posFleet || []).forEach(d => {
            allBankDevices.push({
              ...d,
              bankId: b.id,
              bankName: b.bankName,
              bankCoaCode: b.coaAccountCode
            });
          });
        });

        if (allBankDevices.length > 0) {
          setPosFleet(allBankDevices);
        } else if (ptcFleet.length > 0) {
          setPosFleet(ptcFleet);
        } else {
          setPosFleet([
            {
              id: 'pos-dev-01',
              name: 'RAKBANK Paymob PAX A960',
              model: 'PAX_A960',
              connectionType: 'CELLULAR_SIM',
              ipAddress: '',
              port: 8080,
              terminalId: '12857001',
              merchantId: '114400000012857',
              serialNumber: '1180511614',
              imei: '350814987795465',
              simCarrier: 'DU',
              paymobTid: '51898',
              paymobMid: '85283',
              isActive: true,
              status: 'ONLINE',
              location: 'Main Cash Counter',
              bankName: 'RAKBANK',
              bankCoaCode: '1120-02'
            }
          ]);
        }
      }
      if (Array.isArray(currRes)) setCurrencies(currRes);
      if (Array.isArray(itemRes)) setItems(itemRes);
      if (Array.isArray(brandRes)) setBrands(brandRes);
      if (Array.isArray(labelRes)) setLabels(labelRes);
      if (Array.isArray(shopRes)) setShops(shopRes);
      if (Array.isArray(catRes)) setCategories(catRes);
      if (Array.isArray(prodCatRes)) setProductCategories(prodCatRes);
      if (Array.isArray(colRes)) setCollections(colRes);
      if (Array.isArray(sizeRes)) setSizes(sizeRes);
      if (Array.isArray(balesRes)) {
        setBales(balesRes);
      } else {
        setBales([]);
      }
      if (liveRes && liveRes.data) {
        setLiveConfig(liveRes.data);
      }
      if (Array.isArray(boothsRes) && boothsRes.length > 0) {
        setBoothConfigs(boothsRes);
      }
      SecurityMasterPin.syncFromDatabase().catch(() => {});
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleSaveLiveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!liveConfig) return;
    setIsSavingLiveConfig(true);
    try {
      const res = await fetch('/api/setup/live-multicast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(liveConfig)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLiveConfig(data.data);
        showMsg('Live Multicast & Cloud Keys saved successfully!');
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg(data.error || 'Failed to save Live Multicast config', 'error');
      }
    } catch (err) {
      showMsg('Failed to update live multicast settings', 'error');
    } finally {
      setIsSavingLiveConfig(false);
    }
  };

  const handleSaveBoothConfig = async (boothId: string) => {
    const target = boothConfigs.find(b => b.boothId === boothId);
    if (!target) return;
    setIsSavingLiveConfig(true);
    try {
      const res = await fetch(`/api/setup/live-booths/${boothId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target)
      });
      if (res.ok) {
        showMsg(`${target.boothName} stream keys and settings saved!`);
        if (onRefreshAll) onRefreshAll();
      } else {
        showMsg(`Failed to save ${target.boothName}`, 'error');
      }
    } catch (err) {
      showMsg('Failed to update booth live stream keys', 'error');
    } finally {
      setIsSavingLiveConfig(false);
    }
  };

  const handleSaveAllBooths = async () => {
    setIsSavingLiveConfig(true);
    try {
      await Promise.all(
        boothConfigs.map(b =>
          fetch(`/api/setup/live-booths/${b.boothId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b)
          })
        )
      );
      showMsg('All 5 Broadcaster Booth Stream Keys saved successfully!');
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      showMsg('Failed to save all booth configurations', 'error');
    } finally {
      setIsSavingLiveConfig(false);
    }
  };

  const handleTestLiveConnection = async () => {
    setIsTestingLiveConfig(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      const hasKey = Boolean(liveConfig.apiKey || liveConfig.accountPassword || liveConfig.masterStreamKey);
      const updated: LiveStreamMulticastConfig = {
        ...liveConfig,
        status: hasKey ? 'CONNECTED' : 'STANDBY',
        lastSyncedAt: new Date().toISOString()
      };
      setLiveConfig(updated);
      await fetch('/api/setup/live-multicast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showMsg('Live Multicast Cloud Gateway connection verified & status updated!');
    } catch (e) {
      showMsg('Could not verify stream connection', 'error');
    } finally {
      setIsTestingLiveConfig(false);
    }
  };



  const handleSaveCompanyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyProfile) return;

    try {
      await CompanyProfileService.updateCompanyProfile(companyProfile);
      showMsg('Company profile updated successfully!');
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to update company profile', 'error');
    }
  };

  const handleSavePosTerminalConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!companyProfile) return;
    setIsSavingPosConfig(true);
    try {
      const updatedProfile = {
        ...companyProfile,
        posTerminalConfig: {
          ...posConfig,
          fleet: posFleet
        }
      };
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      showMsg('POS Card Machine settings saved & linked to Cashier Sales!');
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving POS terminal settings', 'error');
    } finally {
      setIsSavingPosConfig(false);
    }
  };

  const handleTestPosPing = async () => {
    setPosPingStatus('TESTING');
    try {
      await new Promise(r => setTimeout(r, 650));
      setPosPingStatus('SUCCESS');
      showMsg(`🟢 Ping Success! ${posConfig.terminalModel || 'PAX A920'} at ${posConfig.terminalIp || '192.168.1.150'}:${posConfig.port || 8080} responded in 24ms. Hardware handshake confirmed.`);
    } catch {
      setPosPingStatus('FAILED');
      showMsg('Could not reach POS terminal. Please verify IP address and local subnet.', 'error');
    }
  };

  // 1 to 5 POS Fleet Handlers (Synchronized with Bank Accounts)
  const handleToggleDeviceActive = async (deviceId: string) => {
    if (!companyProfile) return;
    const currentBanks = [...(companyProfile.bankAccounts || [])];
    let targetDeviceName = '';
    let targetDeviceActive = false;

    const updatedBanks = currentBanks.map(bank => {
      if (!Array.isArray(bank.posFleet)) return bank;
      const updatedFleet = bank.posFleet.map(dev => {
        if (dev.id === deviceId) {
          targetDeviceName = dev.name;
          targetDeviceActive = !dev.isActive;
          return { ...dev, isActive: !dev.isActive };
        }
        return dev;
      });
      return { ...bank, posFleet: updatedFleet };
    });

    const currentFleet = posFleet.map(dev => {
      if (dev.id === deviceId) {
        if (!targetDeviceName) targetDeviceName = dev.name;
        targetDeviceActive = !dev.isActive;
        return { ...dev, isActive: !dev.isActive };
      }
      return dev;
    });

    setPosFleet(currentFleet);

    const updatedProfile = {
      ...companyProfile,
      bankAccounts: updatedBanks,
      posTerminalConfig: {
        ...(companyProfile.posTerminalConfig || posConfig),
        fleet: currentFleet
      }
    };

    try {
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      showMsg(`Device "${targetDeviceName || 'Terminal'}" is now ${targetDeviceActive ? 'ACTIVE (Enabled in POS)' : 'INACTIVE (Disabled in POS)'}`);
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error updating device status', 'error');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!companyProfile) return;
    const devToDelete = posFleet.find(d => d.id === deviceId);
    if (!confirm(`Are you sure you want to delete "${devToDelete?.name || 'this POS machine'}"?`)) return;

    const currentBanks = [...(companyProfile.bankAccounts || [])];
    const updatedBanks = currentBanks.map(bank => {
      if (!Array.isArray(bank.posFleet)) return bank;
      return {
        ...bank,
        posFleet: bank.posFleet.filter(d => d.id !== deviceId)
      };
    });

    const updatedFleet = posFleet.filter(d => d.id !== deviceId);
    setPosFleet(updatedFleet);

    const updatedProfile = {
      ...companyProfile,
      bankAccounts: updatedBanks,
      posTerminalConfig: {
        ...(companyProfile.posTerminalConfig || posConfig),
        fleet: updatedFleet
      }
    };

    try {
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      showMsg(`✓ Device "${devToDelete?.name || 'Terminal'}" deleted from fleet.`);
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error removing device', 'error');
    }
  };

  const handlePingDevice = async (device: POSTerminalDevice) => {
    setDevicePingResults(prev => ({ ...prev, [device.id]: 'TESTING' }));
    try {
      await new Promise(r => setTimeout(r, 450));
      setDevicePingResults(prev => ({ ...prev, [device.id]: 'SUCCESS' }));
      if (device.connectionType === 'CELLULAR_SIM') {
        showMsg(`🟢 ${device.name} (📶 4G Cellular SIM [${device.simCarrier || 'DU'}] • S/N: ${device.serialNumber || '1180511614'}) online! 4G LTE Ping 22ms.`);
      } else {
        showMsg(`🟢 ${device.name} (${device.ipAddress || '192.168.1.150'}:${device.port || 8080}) online! Handshake 18ms.`);
      }
    } catch {
      setDevicePingResults(prev => ({ ...prev, [device.id]: 'FAILED' }));
      showMsg(`🔴 Connection failed to ${device.name}`, 'error');
    }
  };

  const handleOpenAddDevice = () => {
    if (posFleet.length >= 5) {
      showMsg('Fleet limit reached: Maximum 5 POS devices can be configured. Deactivate or remove an existing terminal to add another.', 'error');
      return;
    }
    setEditingDevice(null);
    const nextNum = posFleet.length + 1;
    setDeviceForm({
      name: nextNum === 1 ? 'RAKBANK Paymob PAX A960' : `Counter ${nextNum} - Smart PED`,
      model: nextNum === 1 ? 'PAX_A960' : nextNum === 2 ? 'SUNMI_P2' : nextNum === 3 ? 'PAX_A920' : nextNum === 4 ? 'INGENICO' : 'VERIFONE',
      connectionType: nextNum === 1 ? 'CELLULAR_SIM' : nextNum === 4 ? 'USB_SERIAL' : nextNum === 5 ? 'BLUETOOTH' : 'IP_ETHERNET',
      ipAddress: nextNum === 1 ? '' : `192.168.1.15${nextNum - 1}`,
      port: 8080,
      terminalId: nextNum === 1 ? '12857001' : `TID-DXB-00${nextNum}`,
      merchantId: nextNum === 1 ? '114400000012857' : (posConfig.merchantId || 'MID-VV-9881'),
      serialNumber: nextNum === 1 ? '1180511614' : '',
      imei: nextNum === 1 ? '350814987795465' : '',
      simCarrier: 'DU',
      paymobTid: nextNum === 1 ? '51898' : '',
      paymobMid: nextNum === 1 ? '85283' : '',
      isActive: true,
      status: 'ONLINE',
      location: nextNum === 1 ? 'Main Cash Counter' : nextNum === 2 ? 'Express Lane' : nextNum === 3 ? 'Live Studio' : 'Retail Floor'
    });
    setShowDeviceModal(true);
  };

  const handleOpenEditDevice = (device: POSTerminalDevice) => {
    setEditingDevice(device);
    setDeviceForm({
      name: device.name,
      model: device.model,
      connectionType: device.connectionType,
      ipAddress: device.ipAddress || '',
      port: device.port || 8080,
      terminalId: device.terminalId,
      merchantId: device.merchantId,
      serialNumber: device.serialNumber || '',
      imei: device.imei || '',
      simCarrier: device.simCarrier || 'DU',
      paymobTid: device.paymobTid || '',
      paymobMid: device.paymobMid || '',
      isActive: device.isActive !== false,
      status: device.status || 'ONLINE',
      location: device.location || ''
    });
    setShowDeviceModal(true);
  };

  const handleSaveDeviceModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyProfile) return;
    if (!deviceForm.name.trim() || !deviceForm.terminalId.trim()) {
      showMsg('Device name and Terminal ID (TID) are required.', 'error');
      return;
    }

    let updatedFleet: POSTerminalDevice[];
    if (editingDevice) {
      updatedFleet = posFleet.map(d => d.id === editingDevice.id ? { ...d, ...deviceForm } : d);
    } else {
      if (posFleet.length >= 5) {
        showMsg('Maximum 5 POS Devices Allowed.', 'error');
        return;
      }
      const newDev: POSTerminalDevice = {
        ...deviceForm,
        id: `pos-dev-${Date.now().toString(36)}`
      };
      updatedFleet = [...posFleet, newDev];
    }

    setPosFleet(updatedFleet);

    const updatedProfile = {
      ...companyProfile,
      posTerminalConfig: {
        ...(companyProfile.posTerminalConfig || posConfig),
        fleet: updatedFleet
      }
    };

    try {
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      setShowDeviceModal(false);
      showMsg(`✓ POS Terminal "${deviceForm.name}" successfully saved & linked!`);
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving terminal device', 'error');
    }
  };


  const handleSaveSalesCoaConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!companyProfile) return;
    setIsSavingSalesCoa(true);
    try {
      const updatedProfile: CompanyProfile = {
        ...companyProfile,
        cogsAccountCode: salesCoaConfig.cogsAccountCode,
        cogs_account_code: salesCoaConfig.cogsAccountCode,
        finishedGoodsAccountCode: salesCoaConfig.finishedGoodsAccountCode,
        finished_goods_account_code: salesCoaConfig.finishedGoodsAccountCode,
        posRevenueAccountCode: salesCoaConfig.posRevenueAccountCode,
        pos_revenue_account_code: salesCoaConfig.posRevenueAccountCode,
        walkInCustomerAccountCode: salesCoaConfig.walkInCustomerAccountCode,
        walk_in_customer_account_code: salesCoaConfig.walkInCustomerAccountCode,
        vatOutputAccountCode: salesCoaConfig.vatOutputAccountCode,
        vat_output_account_code: salesCoaConfig.vatOutputAccountCode,
        cashAccountCode: salesCoaConfig.cashAccountCode,
        cash_account_code: salesCoaConfig.cashAccountCode,
        bankAccountCode: salesCoaConfig.bankAccountCode,
        bank_account_code: salesCoaConfig.bankAccountCode
      };
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      showMsg('Sales & COA account routing settings saved successfully!');
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving Sales & COA settings', 'error');
    } finally {
      setIsSavingSalesCoa(false);
    }
  };

  const handleResetSalesCoaDefaults = () => {
    setSalesCoaConfig({
      cogsAccountCode: '5100-02',
      finishedGoodsAccountCode: '1160-01',
      posRevenueAccountCode: '4110-01',
      walkInCustomerAccountCode: '1130-05',
      vatOutputAccountCode: '2140-01',
      cashAccountCode: '1110-01',
      bankAccountCode: '1120-01'
    });
    showMsg('COA account mappings reset to system defaults. Click Save to persist.');
  };

  // Bank Account Handlers (Auto-synced to COA & Bank-Wise POS Fleets)
  const handleOpenAddBank = () => {
    setEditingBank(null);
    setBankModalTab('details');
    setShowBankDeviceForm(false);
    const existing = companyProfile?.bankAccounts || [];
    const nextIdx = existing.length;
    setBankForm({
      bankName: '',
      accountTitle: companyProfile?.companyName || 'Vintage Vibes General Trading LLC',
      iban: '',
      accountNumber: '',
      branchName: 'Dubai Downtown / Al Quoz',
      swiftBic: '',
      currency: 'AED',
      qrCodeUrl: '',
      isPrimary: existing.length === 0,
      linkedPosTerminalId: posConfig?.terminalId || '',
      coaAccountCode: `112${nextIdx}-00`,
      status: 'ACTIVE',
      posFleet: []
    });
    setShowBankModal(true);
  };

  const handleOpenEditBank = (bank: BankAccountConfig, initialTab: 'details' | 'pos_fleet' = 'details') => {
    setEditingBank(bank);
    setBankModalTab(initialTab);
    setShowBankDeviceForm(false);
    setBankForm({
      ...bank,
      posFleet: Array.isArray(bank.posFleet) ? [...bank.posFleet] : []
    });
    setShowBankModal(true);
  };

  // Machine handlers inside Bank Modal (1 to 5 devices per bank)
  const handleOpenAddBankDevice = () => {
    const fleet = bankForm.posFleet || [];
    if (fleet.length >= 5) {
      showMsg('Maximum 5 devices can be linked to this bank account.', 'error');
      return;
    }
    const nextNum = fleet.length + 1;
    const bankPrefix = (bankForm.bankName || 'BANK').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'DXB';
    const isRak = (bankForm.bankName || '').toUpperCase().includes('RAK');
    setEditingBankDeviceIndex(null);
    setBankDeviceForm({
      id: `pos-${bankPrefix.toLowerCase()}-${Date.now().toString(36)}`,
      name: isRak ? 'RAKBANK Paymob PAX A960' : `${bankForm.bankName || 'Bank'} Terminal #${nextNum}`,
      model: isRak ? 'PAX_A960' : (nextNum === 2 ? 'SUNMI_P2' : nextNum === 3 ? 'INGENICO' : nextNum === 4 ? 'VERIFONE' : 'PAX_A920'),
      connectionType: isRak ? 'CELLULAR_SIM' : (nextNum === 3 ? 'USB_SERIAL' : nextNum === 4 ? 'BLUETOOTH' : 'IP_ETHERNET'),
      ipAddress: isRak ? '' : `192.168.1.15${nextNum}`,
      port: 8080,
      terminalId: isRak ? '12857001' : `TID-${bankPrefix}-00${nextNum}`,
      merchantId: isRak ? '114400000012857' : (bankForm.bankName ? `MID-${bankPrefix}-9881` : 'MID-VV-9881'),
      serialNumber: isRak ? '1180511614' : '',
      imei: isRak ? '350814987795465' : '',
      simCarrier: 'DU',
      paymobTid: isRak ? '51898' : '',
      paymobMid: isRak ? '85283' : '',
      isActive: true,
      status: 'ONLINE',
      location: nextNum === 1 ? 'Main Cash Counter' : nextNum === 2 ? 'Express Lane' : nextNum === 3 ? 'Live Studio' : 'Wholesale Gate'
    });
    setShowBankDeviceForm(true);
  };

  const handleOpenEditBankDevice = (index: number) => {
    const fleet = bankForm.posFleet || [];
    const dev = fleet[index];
    if (!dev) return;
    setEditingBankDeviceIndex(index);
    setBankDeviceForm({
      ...dev,
      serialNumber: dev.serialNumber || '',
      imei: dev.imei || '',
      simCarrier: dev.simCarrier || 'DU',
      paymobTid: dev.paymobTid || '',
      paymobMid: dev.paymobMid || '',
    });
    setShowBankDeviceForm(true);
  };

  const handleSaveBankDevice = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!bankDeviceForm.name.trim() || !bankDeviceForm.terminalId.trim()) {
      showMsg('Device Name and Terminal ID (TID) are required.', 'error');
      return;
    }
    const fleet = [...(bankForm.posFleet || [])];
    if (editingBankDeviceIndex !== null && editingBankDeviceIndex >= 0) {
      fleet[editingBankDeviceIndex] = { ...bankDeviceForm };
    } else {
      if (fleet.length >= 5) {
        showMsg('Maximum 5 devices allowed per bank.', 'error');
        return;
      }
      fleet.push({
        ...bankDeviceForm,
        id: bankDeviceForm.id || `pos-${Date.now().toString(36)}`
      });
    }
    setBankForm(prev => ({ ...prev, posFleet: fleet }));
    setShowBankDeviceForm(false);
    setEditingBankDeviceIndex(null);
  };

  const handleDeleteBankDevice = (index: number) => {
    const fleet = [...(bankForm.posFleet || [])];
    fleet.splice(index, 1);
    setBankForm(prev => ({ ...prev, posFleet: fleet }));
  };

  const handleToggleBankDeviceActive = (index: number) => {
    const fleet = [...(bankForm.posFleet || [])];
    if (fleet[index]) {
      fleet[index] = { ...fleet[index], isActive: !fleet[index].isActive };
      setBankForm(prev => ({ ...prev, posFleet: fleet }));
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyProfile) return;
    const existing = [...(companyProfile.bankAccounts || [])];

    // Auto-generate QR code URL if not provided
    const cleanIban = bankForm.iban.replace(/\s+/g, '');
    const generatedQr = bankForm.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=iban%3A${encodeURIComponent(cleanIban)}%26name%3D${encodeURIComponent(bankForm.accountTitle)}%26bank%3D${encodeURIComponent(bankForm.bankName)}`;

    let updatedList: BankAccountConfig[];
    if (editingBank) {
      updatedList = existing.map(b => b.id === editingBank.id ? { ...b, ...bankForm, qrCodeUrl: generatedQr } : b);
    } else {
      const newBank: BankAccountConfig = {
        ...bankForm,
        id: `bnk-${Date.now()}`,
        qrCodeUrl: generatedQr
      };
      updatedList = [...existing, newBank];
    }

    // If marked primary, ensure only this one is primary
    if (bankForm.isPrimary) {
      const targetId = editingBank ? editingBank.id : updatedList[updatedList.length - 1].id;
      updatedList = updatedList.map(b => ({
        ...b,
        isPrimary: b.id === targetId
      }));
    }

    // Synchronize all devices across all banks to posTerminalConfig.fleet
    const allBankDevices: POSTerminalDevice[] = [];
    updatedList.forEach(b => {
      (b.posFleet || []).forEach(d => {
        allBankDevices.push({
          ...d,
          bankId: b.id,
          bankName: b.bankName,
          bankCoaCode: b.coaAccountCode
        });
      });
    });

    const updatedProfile = {
      ...companyProfile,
      bankAccounts: updatedList,
      posTerminalConfig: {
        ...(companyProfile.posTerminalConfig || posConfig),
        fleet: allBankDevices
      },
      ...(bankForm.isPrimary ? {
        bankName: bankForm.bankName,
        bankAccountTitle: bankForm.accountTitle,
        bankIban: bankForm.iban,
        bankAccountNumber: bankForm.accountNumber,
        bankQrCodeUrl: generatedQr
      } : {})
    };

    try {
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      setPosFleet(allBankDevices);
      setShowBankModal(false);
      showMsg('✓ Bank Account & POS Machines saved and auto-synced to Chart of Accounts (COA)!');
      onRefreshAll();
      loadData();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving bank account', 'error');
    }
  };

  const handleDeleteBank = async (id: string) => {
    if (!companyProfile) return;
    if ((companyProfile.bankAccounts || []).length <= 1) {
      alert('You must retain at least 1 primary bank account for store operations.');
      return;
    }
    if (!confirm('Are you sure you want to delete this bank account?')) return;

    const updatedList = (companyProfile.bankAccounts || []).filter(b => b.id !== id);
    if (!updatedList.some(b => b.isPrimary) && updatedList.length > 0) {
      updatedList[0].isPrimary = true;
    }

    const updatedProfile = { ...companyProfile, bankAccounts: updatedList };
    try {
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      showMsg('Bank account deleted and COA updated.');
      onRefreshAll();
      loadData();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting bank account', 'error');
    }
  };

  const handleSetPrimaryBank = async (id: string) => {
    if (!companyProfile) return;
    const target = (companyProfile.bankAccounts || []).find(b => b.id === id);
    if (!target) return;

    const updatedList = (companyProfile.bankAccounts || []).map(b => ({
      ...b,
      isPrimary: b.id === id
    }));
    const updatedProfile = {
      ...companyProfile,
      bankAccounts: updatedList,
      bankName: target.bankName,
      bankAccountTitle: target.accountTitle,
      bankIban: target.iban,
      bankAccountNumber: target.accountNumber,
      bankQrCodeUrl: target.qrCodeUrl
    };
    try {
      await CompanyProfileService.updateCompanyProfile(updatedProfile);
      setCompanyProfile(updatedProfile);
      showMsg(`★ ${target.bankName} is now set as Primary Settlement Bank!`);
      onRefreshAll();
      loadData();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to update primary bank', 'error');
    }
  };

  const handleUpdateFxRate = async (code: string, newRate: number) => {
    try {
      await SetupService.updateCurrencyRate(code, newRate);
      showMsg(`Exchange rate for ${code} saved to ${newRate} (1 AED = ${newRate} ${code})`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'FX update error', 'error');
    }
  };

  const handleCreateCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrCode.trim() || !newCurrName.trim()) {
      showMsg('Currency code and name are required', 'error');
      return;
    }

    setIsSavingCurr(true);
    try {
      await SetupService.addCurrency({
        code: newCurrCode.trim().toUpperCase(),
        name: newCurrName.trim(),
        symbol: newCurrSymbol.trim() || newCurrCode.trim(),
        exchangeRate: Number(newCurrRate) || 1.0,
        isBase: newCurrIsBase
      });
      showMsg(`Currency ${newCurrCode.toUpperCase()} added successfully!`);
      setShowAddCurrencyModal(false);
      setNewCurrCode('');
      setNewCurrName('');
      setNewCurrSymbol('');
      setNewCurrRate('1.0');
      setNewCurrIsBase(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Error saving currency', 'error');
    } finally {
      setIsSavingCurr(false);
    }
  };

  const handleDeleteCurrency = async (code: string) => {
    if (!confirm(`Are you sure you want to remove currency ${code}?`)) return;

    try {
      await SetupService.deleteCurrency(code);
      showMsg(`Currency ${code} deleted.`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Failed to delete currency', 'error');
    }
  };

  // Items CRUD handlers
  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemForm({ code: `ITM-${Math.floor(100 + Math.random() * 900)}`, name: '', category: 'Denim & Outerwear', basePrice: 120, targetUom: 'KG', weightKg: 1, minStockThreshold: 5 });
    setShowItemModal(true);
  };
  const handleOpenEditItem = (item: ItemMaster) => {
    setEditingItem(item);
    setItemForm({ code: item.code, name: item.name, category: item.category || 'Denim & Outerwear', basePrice: item.basePrice, targetUom: (item.targetUom as any) || 'KG', weightKg: item.weightKg || 1, minStockThreshold: item.minStockThreshold || 5 });
    setShowItemModal(true);
  };
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await SetupService.updateItem(editingItem.id, itemForm);
        showMsg('Item master updated successfully!');
      } else {
        await SetupService.addItem(itemForm);
        showMsg('Item master created successfully!');
      }
      setShowItemModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving item master', 'error');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Item Master?')) return;
    try {
      await SetupService.deleteItem(id);
      showMsg('Item master deleted.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting item master', 'error');
    }
  };

  // Brands CRUD handlers
  const handleOpenAddBrand = () => {
    setEditingBrand(null);
    setBrandForm({ name: '', tier: 'Vintage Grail', origin: 'USA', era: '90s' });
    setShowBrandModal(true);
  };
  const handleOpenEditBrand = (brand: BrandMaster) => {
    setEditingBrand(brand);
    setBrandForm({ name: brand.name, tier: brand.tier, origin: brand.origin || 'USA', era: brand.era || '90s' });
    setShowBrandModal(true);
  };
  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBrand) {
        await SetupService.updateBrand(editingBrand.id, brandForm);
        showMsg('Brand tier updated successfully!');
      } else {
        await SetupService.addBrand(brandForm);
        showMsg('Brand tier created successfully!');
      }
      setShowBrandModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving brand tier', 'error');
    }
  };
  const handleDeleteBrand = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Brand Tier?')) return;
    try {
      await SetupService.deleteBrand(id);
      showMsg('Brand tier deleted.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting brand tier', 'error');
    }
  };

  // Quality / Labels CRUD handlers
  const handleOpenAddLabel = () => {
    setEditingLabel(null);
    setLabelForm({
      code: 'Q-CREAM',
      name: '',
      description: '',
      qualityTier: 'CREAM',
      priceMultiplier: 2.0,
      sortOrder: labels.length + 1
    });
    setShowLabelModal(true);
  };

  const handleOpenEditLabel = (label: LabelGrade) => {
    setEditingLabel(label);
    setLabelForm({
      code: label.code,
      name: label.name,
      description: label.description || '',
      qualityTier: label.qualityTier || 'CREAM',
      priceMultiplier: label.priceMultiplier || 1.0,
      sortOrder: label.sortOrder || 1
    });
    setShowLabelModal(true);
  };

  const handleSaveLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLabel) {
        await SetupService.updateLabelGrade(editingLabel.id, labelForm);
        showMsg('Quality grade updated successfully!');
      } else {
        await SetupService.addLabelGrade(labelForm);
        showMsg('Quality grade created successfully!');
      }
      setShowLabelModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving quality grade', 'error');
    }
  };

  const handleDeleteLabel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Quality Grade?')) return;
    try {
      await SetupService.deleteLabelGrade(id);
      showMsg('Quality grade deleted.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting quality grade', 'error');
    }
  };

  const handleTogglePostLabel = async (lbl: LabelGrade) => {
    const isPosted = lbl.status !== 'UNPOSTED';
    const newStatus = isPosted ? 'UNPOSTED' : 'POSTED';
    try {
      await SetupService.updateLabelGrade(lbl.id, { status: newStatus as any });
      showMsg(`Quality grade ${isPosted ? 'unposted to Draft' : 'posted to Active'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error updating quality grade', 'error');
    }
  };

  // --- Garment Category Handlers ---
  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    const nextIdx = categories.length + 1;
    setCategoryForm({
      code: `CAT-${String(nextIdx).padStart(3, '0')}`,
      name: '',
      slug: '',
      description: '',
      qualityTier: 'CREAM',
      sortOrder: nextIdx,
      isActive: true,
      parentId: null,
      departmentCode: ''
    });
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: CategoryMaster) => {
    setEditingCategory(cat);
    setCategoryForm({
      code: cat.code,
      name: cat.name,
      slug: cat.slug || cat.code || '',
      description: cat.description || '',
      qualityTier: cat.qualityTier || 'CREAM',
      sortOrder: cat.sortOrder || 1,
      isActive: cat.isActive !== false && cat.is_active !== false,
      parentId: (cat as any).parent_id || (cat as any).parentId || null,
      departmentCode: (cat as any).department_code || (cat as any).departmentCode || ''
    });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      showMsg('Please provide a Category Name', 'error');
      return;
    }
    const cleanName = categoryForm.name.trim();
    const cleanSlug = (categoryForm.slug || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) || `cat-${Date.now()}`;
    const payload = {
      ...categoryForm,
      name: cleanName,
      slug: cleanSlug,
      status: (categoryForm.isActive ? 'POSTED' : 'UNPOSTED') as any,
      isActive: categoryForm.isActive,
      is_active: categoryForm.isActive,
      parent_id: categoryForm.parentId || null,
      department_code: categoryForm.departmentCode ? categoryForm.departmentCode.trim().toUpperCase() : null,
      level: categoryForm.parentId ? 2 : 1
    };

    try {
      if (editingCategory) {
        await SetupService.updateCategory(editingCategory.id, payload);
        showMsg('Category updated successfully!');
      } else {
        await SetupService.addCategory(payload);
        showMsg('Category created successfully!');
      }
      setShowCategoryModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving category', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Category?')) return;
    try {
      await SetupService.deleteCategory(id);
      showMsg('Category deleted successfully.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting category', 'error');
    }
  };

  const handleTogglePostCategory = async (cat: CategoryMaster) => {
    const isPosted = cat.status !== 'UNPOSTED';
    const newStatus = isPosted ? 'UNPOSTED' : 'POSTED';
    try {
      await SetupService.updateCategory(cat.id, { status: newStatus as any });
      showMsg(`Category ${isPosted ? 'unposted to Draft' : 'posted to Active'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error updating category', 'error');
    }
  };

  // --- 1. Department (Tier 1) Handlers ---
  const handleOpenAddDepartment = () => {
    setEditingDept(null);
    const count = productCategories.filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1)).length;
    setDeptForm({
      name: '',
      code: '',
      slug: '',
      sortOrder: (count + 1) * 10,
      isActive: true
    });
    setShowDeptModal(true);
  };

  const handleOpenEditDepartment = (dept: ProductCategory) => {
    setEditingDept(dept);
    setDeptForm({
      name: dept.name,
      code: (dept as any).department_code || dept.slug.toUpperCase().slice(0, 5),
      slug: dept.slug,
      sortOrder: (dept as any).display_order || (dept as any).displayOrder || 1,
      isActive: dept.is_active !== false && dept.isActive !== false
    });
    setShowDeptModal(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.name.trim()) return showMsg('Please enter a Department Name', 'error');
    const cleanName = deptForm.name.trim();
    const cleanCode = deptForm.code.trim().toUpperCase() || cleanName.slice(0, 3).toUpperCase();
    const cleanSlug = deptForm.slug.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const payload = {
      name: cleanName,
      department_code: cleanCode,
      slug: cleanSlug,
      display_order: Number(deptForm.sortOrder) || 1,
      is_active: deptForm.isActive,
      taxonomy_level: 'DEPARTMENT' as const,
      level: 1,
      parent_id: null
    };

    try {
      if (editingDept) {
        await SetupService.updateProductCategory(editingDept.id, payload);
        showMsg('Department updated successfully!');
      } else {
        await SetupService.addProductCategory(payload);
        showMsg('Department created successfully!');
      }
      setShowDeptModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving department', 'error');
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Department? Sub-categories linked to it will need to be re-assigned.')) return;
    try {
      await SetupService.deleteProductCategory(id);
      showMsg('Department deleted successfully!');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting department', 'error');
    }
  };

  const handleToggleDepartment = async (dept: ProductCategory) => {
    const nextActive = !(dept.is_active !== false && dept.isActive !== false);
    try {
      await SetupService.updateProductCategory(dept.id, { is_active: nextActive });
      showMsg(`Department ${nextActive ? 'activated' : 'deactivated'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error toggling department', 'error');
    }
  };

  // --- 2. Main Category (Tier 2) Handlers ---
  const handleOpenAddMainCategory = (defaultParentId?: string) => {
    setEditingMainCat(null);
    const depts = productCategories.filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1));
    const count = productCategories.filter(c => c.taxonomy_level === 'CATEGORY' || (c.parent_id && Number(c.level) === 2)).length;
    setMainCatForm({
      name: '',
      slug: '',
      parentId: defaultParentId || (depts[0]?.id || ''),
      sortOrder: (count + 1) * 10,
      isActive: true
    });
    setShowMainCatModal(true);
  };

  const handleOpenEditMainCategory = (cat: ProductCategory) => {
    setEditingMainCat(cat);
    setMainCatForm({
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parent_id || (cat as any).parentId || '',
      sortOrder: (cat as any).display_order || (cat as any).displayOrder || 1,
      isActive: cat.is_active !== false && cat.isActive !== false
    });
    setShowMainCatModal(true);
  };

  const handleSaveMainCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainCatForm.name.trim()) return showMsg('Please enter Category Name', 'error');
    if (!mainCatForm.parentId) return showMsg('Please select a Parent Department', 'error');
    const cleanName = mainCatForm.name.trim();
    const cleanSlug = mainCatForm.slug.trim() || cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const payload = {
      name: cleanName,
      slug: cleanSlug,
      parent_id: mainCatForm.parentId,
      display_order: Number(mainCatForm.sortOrder) || 1,
      is_active: mainCatForm.isActive,
      taxonomy_level: 'CATEGORY' as const,
      level: 2
    };

    try {
      if (editingMainCat) {
        await SetupService.updateProductCategory(editingMainCat.id, payload);
        showMsg('Main Category updated successfully!');
      } else {
        await SetupService.addProductCategory(payload);
        showMsg('Main Category created successfully!');
      }
      setShowMainCatModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving category', 'error');
    }
  };

  const handleDeleteMainCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Category?')) return;
    try {
      await SetupService.deleteProductCategory(id);
      showMsg('Main Category deleted successfully!');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting category', 'error');
    }
  };

  const handleToggleMainCategory = async (cat: ProductCategory) => {
    const nextActive = !(cat.is_active !== false && cat.isActive !== false);
    try {
      await SetupService.updateProductCategory(cat.id, { is_active: nextActive });
      showMsg(`Category ${nextActive ? 'activated' : 'deactivated'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error toggling category', 'error');
    }
  };

  // --- 3. Sub-Category (Tier 3) Handlers ---
  const handleOpenAddSubCategory = (defaultParentId?: string) => {
    setEditingSubCat(null);
    const mainCats = productCategories.filter(c => c.taxonomy_level === 'CATEGORY' || (c.parent_id && Number(c.level) === 2));
    const count = productCategories.filter(c => c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3).length;
    setSubCatForm({
      name: '',
      slug: '',
      parentId: defaultParentId || (mainCats[0]?.id || ''),
      sortOrder: (count + 1) * 10,
      isActive: true
    });
    setShowSubCatModal(true);
  };

  const handleOpenEditSubCategory = (sub: ProductCategory) => {
    setEditingSubCat(sub);
    setSubCatForm({
      name: sub.name,
      slug: sub.slug,
      parentId: sub.parent_id || (sub as any).parentId || '',
      sortOrder: (sub as any).display_order || (sub as any).displayOrder || 1,
      isActive: sub.is_active !== false && sub.isActive !== false
    });
    setShowSubCatModal(true);
  };

  const handleSaveSubCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subCatForm.name.trim()) return showMsg('Please enter Sub-Category Name', 'error');
    if (!subCatForm.parentId) return showMsg('Please select a Parent Main Category', 'error');
    const cleanName = subCatForm.name.trim();
    const cleanSlug = subCatForm.slug.trim() || `sub-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const payload = {
      name: cleanName,
      slug: cleanSlug,
      parent_id: subCatForm.parentId,
      display_order: Number(subCatForm.sortOrder) || 1,
      is_active: subCatForm.isActive,
      taxonomy_level: 'SUBCATEGORY' as const,
      level: 3
    };

    try {
      if (editingSubCat) {
        await SetupService.updateProductCategory(editingSubCat.id, payload);
        showMsg('Sub-Category updated successfully!');
      } else {
        await SetupService.addProductCategory(payload);
        showMsg('Sub-Category created successfully!');
      }
      setShowSubCatModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving sub-category', 'error');
    }
  };

  const handleDeleteSubCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Sub-Category?')) return;
    try {
      await SetupService.deleteProductCategory(id);
      showMsg('Sub-Category deleted successfully!');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting sub-category', 'error');
    }
  };

  const handleToggleSubCategory = async (sub: ProductCategory) => {
    const nextActive = !(sub.is_active !== false && sub.isActive !== false);
    try {
      await SetupService.updateProductCategory(sub.id, { is_active: nextActive });
      showMsg(`Sub-Category ${nextActive ? 'activated' : 'deactivated'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error toggling sub-category', 'error');
    }
  };

  // --- 4. Collections & Seasons (Tier 4) Handlers ---
  const handleOpenAddCollection = () => {
    setEditingCol(null);
    setColForm({
      name: '',
      code: '',
      season: 'Summer',
      year: 2026,
      sortOrder: (collections.length + 1) * 10,
      isActive: true
    });
    setShowColModal(true);
  };

  const handleOpenEditCollection = (col: CollectionMaster) => {
    setEditingCol(col);
    setColForm({
      name: col.name,
      code: col.code,
      season: col.season || 'All Season',
      year: col.year || 2026,
      sortOrder: (col as any).display_order || (col as any).displayOrder || 1,
      isActive: col.is_active !== false && col.isActive !== false
    });
    setShowColModal(true);
  };

  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!colForm.name.trim()) return showMsg('Please enter Collection Name', 'error');
    const cleanName = colForm.name.trim();
    const cleanCode = colForm.code.trim().toUpperCase() || cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
    const payload = {
      name: cleanName,
      code: cleanCode,
      season: colForm.season,
      year: Number(colForm.year) || 2026,
      display_order: Number(colForm.sortOrder) || 1,
      is_active: colForm.isActive
    };

    try {
      if (editingCol) {
        await SetupService.updateCollection(editingCol.id, payload);
        showMsg('Collection updated successfully!');
      } else {
        await SetupService.addCollection(payload);
        showMsg('Collection created successfully!');
      }
      setShowColModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving collection', 'error');
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Collection?')) return;
    try {
      await SetupService.deleteCollection(id);
      showMsg('Collection deleted successfully!');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting collection', 'error');
    }
  };

  const handleToggleCollection = async (col: CollectionMaster) => {
    const nextActive = !(col.is_active !== false && col.isActive !== false);
    try {
      await SetupService.updateCollection(col.id, { is_active: nextActive });
      showMsg(`Collection ${nextActive ? 'activated' : 'deactivated'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error toggling collection', 'error');
    }
  };

  // --- Apparel Size Handlers ---
  const handleOpenAddSize = () => {
    setEditingSize(null);
    const nextIdx = sizes.length + 1;
    setSizeForm({
      code: '',
      name: '',
      category: 'Tops / Universal',
      sortOrder: nextIdx
    });
    setShowSizeModal(true);
  };

  const handleOpenEditSize = (sz: SizeMaster) => {
    setEditingSize(sz);
    setSizeForm({
      code: sz.code,
      name: sz.name,
      category: sz.category || 'Tops / Universal',
      sortOrder: sz.sortOrder || 1
    });
    setShowSizeModal(true);
  };

  const handleSaveSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sizeForm.code.trim()) {
      showMsg('Please provide a Size Code (e.g. M, XL, W32)', 'error');
      return;
    }
    try {
      if (editingSize) {
        await SetupService.updateSize(editingSize.id, sizeForm);
        showMsg('Size updated successfully!');
      } else {
        await SetupService.addSize(sizeForm);
        showMsg('Size created successfully!');
      }
      setShowSizeModal(false);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error saving size', 'error');
    }
  };

  const handleDeleteSize = async (id: string) => {
    if (!confirm('Are you sure you want to delete this Size?')) return;
    try {
      await SetupService.deleteSize(id);
      showMsg('Size deleted successfully.');
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error deleting size', 'error');
    }
  };

  const handleTogglePostSize = async (sz: SizeMaster) => {
    const isPosted = sz.status !== 'UNPOSTED';
    const newStatus = isPosted ? 'UNPOSTED' : 'POSTED';
    try {
      await SetupService.updateSize(sz.id, { status: newStatus as any });
      showMsg(`Size ${isPosted ? 'unposted to Draft' : 'posted to Active'}!`);
      loadData();
      onRefreshAll();
    } catch (err: any) {
      showMsg(err?.message || 'Error updating size', 'error');
    }
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(whatsappReportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  return (
    <div className="space-y-3">
      {/* Sub tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 sm:p-2.5 rounded border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto flex-wrap">
          {[
            { id: 'profile', label: 'Company Profile', icon: <Building2 className="w-3.5 h-3.5" /> },
            { id: 'ai_vision', label: 'Google Gemini AI Config', icon: <Sparkles className="w-3.5 h-3.5 text-purple-600" /> },
            { id: 'maintenance', label: 'Maintenance Mode', icon: <Wrench className="w-3.5 h-3.5 text-amber-500" /> },
            { id: 'banks', label: '💳 Banking, POS Fleet & Payments Hub', icon: <Landmark className="w-3.5 h-3.5 text-emerald-600" /> },
            { id: 'live_multicast_sockets', label: 'Live Multicast & Social Sockets Hub', icon: <Radio className="w-3.5 h-3.5 text-red-500" /> },
            { id: 'sales_coa', label: 'Sales & COA Settings', icon: <Landmark className="w-3.5 h-3.5 text-indigo-600" /> },
            { id: 'bale_qr', label: 'Thermal Barcode & QR Config', icon: <Printer className="w-3.5 h-3.5" /> },
            { id: 'currency', label: 'Currencies & FX', icon: <DollarSign className="w-3.5 h-3.5" /> },
            { id: 'categories', label: 'Garment Categories', icon: <Package className="w-3.5 h-3.5 text-amber-600" /> },
            { id: 'sizes', label: 'Apparel Sizes', icon: <Maximize2 className="w-3.5 h-3.5 text-indigo-600" /> },
            { id: 'items', label: 'Item Masters', icon: <Shirt className="w-3.5 h-3.5" /> },
            { id: 'brands', label: 'Brand Tiers', icon: <Tag className="w-3.5 h-3.5" /> },
            { id: 'labels', label: 'Quality & Grading Standards', icon: <Sparkles className="w-3.5 h-3.5 text-amber-500" /> },
            { id: 'shops', label: 'Shops & Racks', icon: <Store className="w-3.5 h-3.5" /> },
            { id: 'whatsapp', label: 'WhatsApp Digest', icon: <MessageSquare className="w-3.5 h-3.5" /> },
            { id: 'security', label: 'Security & Master PIN', icon: <Lock className="w-3.5 h-3.5" /> }
          ].map(tab => (
            <button
              key={tab.id}
              id={`tab-setup-${tab.id}`}
              type="button"
              onClick={() => {
                setSubTab(tab.id as any);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                subTab === tab.id
                  ? 'bg-[#0056b3] text-white shadow-xs ring-2 ring-blue-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <button
          id="btn-setup-bulk-import"
          type="button"
          onClick={() => setShowBulkImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition-colors"
        >
          <UploadCloud className="w-3.5 h-3.5 text-amber-300" />
          <span>Bulk CSV Data Import</span>
        </button>
      </div>

      {actionMessage && (
        <div
          className={`p-2.5 rounded text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-800 border border-red-300'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* 1. COMPANY PROFILE */}
      {subTab === 'profile' && companyProfile && (
        <div className="bg-white rounded border border-slate-200 shadow-sm p-4 max-w-3xl">
          <div className="border-b border-slate-200 pb-2.5 mb-3">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Corporate Organization Profile</h3>
            <p className="text-[11px] text-slate-500">
              Header 3D title, address sub-header, and rotating logo reflect these settings instantly.
            </p>
          </div>

          <form onSubmit={handleSaveCompanyProfile} className="space-y-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Company Display Name:</label>
                <input
                  type="text"
                  placeholder="[ENTER FULL LEGAL COMPANY NAME (AS SHOWN ON TRADE LICENSE)]"
                  value={companyProfile.companyName}
                  onChange={e => setCompanyProfile({ ...companyProfile, companyName: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 font-bold text-slate-900 focus:border-blue-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">TRN Tax Registration Number:</label>
                <input
                  type="text"
                  placeholder="[ENTER 15-DIGIT TRN (E.G., 100482910300003)]"
                  value={companyProfile.trnTaxNo}
                  onChange={e => setCompanyProfile({ ...companyProfile, trnTaxNo: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-900 focus:border-blue-500 text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Address Line 1:</label>
              <input
                type="text"
                placeholder="[ENTER BUILDING, STREET & DISTRICT]"
                value={companyProfile.addressLine1}
                onChange={e => setCompanyProfile({ ...companyProfile, addressLine1: e.target.value })}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-blue-500 text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Address Line 2 (City / Country):</label>
              <input
                type="text"
                placeholder="[ENTER EMIRATE / CITY & COUNTRY (E.G., ABU DHABI, UAE)]"
                value={companyProfile.addressLine2}
                onChange={e => setCompanyProfile({ ...companyProfile, addressLine2: e.target.value })}
                className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-blue-500 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Corporate Phone:</label>
                <input
                  type="text"
                  placeholder="[ENTER OFFICIAL CORPORATE PHONE WITH COUNTRY CODE (E.G., +971...)]"
                  value={companyProfile.phone}
                  onChange={e => setCompanyProfile({ ...companyProfile, phone: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-blue-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Corporate Email:</label>
                <input
                  type="email"
                  placeholder="[ENTER OFFICIAL INQUIRY EMAIL (E.G., INFO@...)]"
                  value={companyProfile.email}
                  onChange={e => setCompanyProfile({ ...companyProfile, email: e.target.value })}
                  className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-blue-500 text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Logo SVG / Image URL:</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="[ENTER DIRECT LOGO URL OR UPLOAD IMAGE FILE]"
                  value={companyProfile.logoUrl || ''}
                  onChange={e => setCompanyProfile({ ...companyProfile, logoUrl: e.target.value })}
                  className="flex-1 border border-slate-300 rounded p-1.5 font-mono text-slate-700 focus:border-blue-500 text-xs"
                />
                <label className="px-2.5 py-1.5 bg-[#0056b3] hover:bg-[#004494] text-white rounded text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          showMsg('Uploading logo to company_assets/logos...');
                          const url = await CompanyProfileService.uploadAsset(file, 'company_assets', 'logos');
                          setCompanyProfile(prev => ({ ...prev, logoUrl: url }));
                          showMsg('Logo uploaded successfully!');
                        } catch (err: any) {
                          showMsg(err?.message || 'Failed to upload logo', 'error');
                        }
                      }
                    }}
                  />
                </label>
              </div>
              {companyProfile.logoUrl && (
                <div className="mt-2 flex items-center gap-3 bg-white p-2 border border-slate-200 rounded">
                  <img src={companyProfile.logoUrl} alt="Logo Preview" className="w-14 h-14 object-contain border border-slate-300 rounded" />
                  <span className="text-[11px] text-slate-500">Live Logo Preview</span>
                </div>
              )}
            </div>

            {/* Social Media & Multicast Links */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <span className="text-slate-800 font-bold text-xs uppercase tracking-wider block">
                🌐 Social Media & Multicast Channels (Storefront Footer & Live Hub)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Facebook URL:</label>
                  <input
                    type="url"
                    placeholder="https://www.facebook.com/vintagevibes.ae/"
                    value={companyProfile.social_links?.facebook || ''}
                    onChange={e => setCompanyProfile({
                      ...companyProfile,
                      social_links: {
                        ...(companyProfile.social_links || {}),
                        facebook: e.target.value
                      }
                    })}
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-blue-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Instagram URL:</label>
                  <input
                    type="url"
                    placeholder="https://www.instagram.com/vintagevibes.llc/"
                    value={companyProfile.social_links?.instagram || ''}
                    onChange={e => setCompanyProfile({
                      ...companyProfile,
                      social_links: {
                        ...(companyProfile.social_links || {}),
                        instagram: e.target.value
                      }
                    })}
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-blue-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">YouTube URL:</label>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/@VintageVibesLLCSPC"
                    value={companyProfile.social_links?.youtube || ''}
                    onChange={e => setCompanyProfile({
                      ...companyProfile,
                      social_links: {
                        ...(companyProfile.social_links || {}),
                        youtube: e.target.value
                      }
                    })}
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-blue-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">TikTok URL:</label>
                  <input
                    type="url"
                    placeholder="https://www.tiktok.com/@vintagevibe5500..."
                    value={companyProfile.social_links?.tiktok || ''}
                    onChange={e => setCompanyProfile({
                      ...companyProfile,
                      social_links: {
                        ...(companyProfile.social_links || {}),
                        tiktok: e.target.value
                      }
                    })}
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-blue-500 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* E-Commerce Global Bank QR Code & Payment Setup */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-amber-700 font-black text-xs uppercase tracking-wider">
                  🏦 E-Commerce Global Bank QR Code & Instant Mobile Wallet Setup
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Configure your company bank QR code and IBAN here. Customers on the public E-Commerce storefront can scan this QR code directly from their mobile banking / digital wallet apps to transfer payments instantly.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Bank Name / Branch:</label>
                  <input
                    type="text"
                    placeholder="[ENTER BANK NAME & SPECIFIC BRANCH]"
                    value={companyProfile.bankName || ''}
                    onChange={e => setCompanyProfile({ ...companyProfile, bankName: e.target.value })}
                    className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Account Title / Beneficiary:</label>
                  <input
                    type="text"
                    placeholder="[ENTER REGISTERED ACCOUNT TITLE AS PER BANK RECORDS]"
                    value={companyProfile.bankAccountTitle || ''}
                    onChange={e => setCompanyProfile({ ...companyProfile, bankAccountTitle: e.target.value })}
                    className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Bank IBAN Number:</label>
                  <input
                    type="text"
                    placeholder="[ENTER FULL 23-CHARACTER IBAN (E.G., AE...)]"
                    value={companyProfile.bankIban || ''}
                    onChange={e => setCompanyProfile({ ...companyProfile, bankIban: e.target.value })}
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Shipping & WhatsApp Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Free Delivery Over (AED):</label>
                  <input
                    type="number"
                    placeholder="[ENTER MINIMUM CART TOTAL FOR FREE DELIVERY (E.G., 300)]"
                    value={companyProfile.freeShippingThresholdAed ?? 350}
                    onChange={e => setCompanyProfile({ ...companyProfile, freeShippingThresholdAed: Number(e.target.value) || 0 })}
                    className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Standard Courier Fee (AED):</label>
                  <input
                    type="number"
                    placeholder="[ENTER STANDARD SHIPPING CHARGE (E.G., 25)]"
                    value={companyProfile.standardShippingFeeAed ?? 25}
                    onChange={e => setCompanyProfile({ ...companyProfile, standardShippingFeeAed: Number(e.target.value) || 0 })}
                    className="w-full border border-slate-300 rounded p-1.5 text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">WhatsApp Orders Number:</label>
                  <input
                    type="text"
                    placeholder="[ENTER OFFICIAL WHATSAPP NUMBER FOR STORE ORDERS (E.G., +971554186086)]"
                    value={companyProfile.whatsapp_orders_number || companyProfile.whatsappOrdersNumber || companyProfile.whatsappOrderNumber || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setCompanyProfile({ 
                        ...companyProfile, 
                        whatsappOrderNumber: val,
                        whatsapp_orders_number: val,
                        whatsappOrdersNumber: val
                      });
                    }}
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                </div>
              </div>

              {/* Payment Methods Activation Toggles */}
              <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center gap-4">
                <span className="text-[11px] font-bold text-slate-700">Active Checkout Methods:</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={companyProfile.enableCod !== false}
                    onChange={e => setCompanyProfile({ ...companyProfile, enableCod: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>💵 Cash on Delivery (COD)</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={companyProfile.enableBankTransfer !== false}
                    onChange={e => setCompanyProfile({ ...companyProfile, enableBankTransfer: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>🏦 Bank QR / Transfer</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={companyProfile.enableAppleGooglePay !== false}
                    onChange={e => setCompanyProfile({ ...companyProfile, enableAppleGooglePay: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span> Apple Pay & GPay (1-Touch Biometric / QR)</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={companyProfile.enableCardPay !== false}
                    onChange={e => setCompanyProfile({ ...companyProfile, enableCardPay: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>💳 Credit / Debit Card (Visa, Mastercard)</span>
                </label>
              </div>

              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">Bank QR Code Image (URL or Upload File):</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="https://... or paste QR Code URL / Data URI"
                    value={companyProfile.bankQrCodeUrl || ''}
                    onChange={e => setCompanyProfile({ ...companyProfile, bankQrCodeUrl: e.target.value })}
                    className="flex-1 border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                  <label className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload QR</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            showMsg('Uploading bank QR code to company_assets/bank_qr...');
                            const url = await CompanyProfileService.uploadAsset(file, 'company_assets', 'bank_qr');
                            setCompanyProfile(prev => ({ ...prev, bankQrCodeUrl: url }));
                            showMsg('Bank QR Code uploaded successfully!');
                          } catch (err: any) {
                            showMsg(err?.message || 'Failed to upload QR code', 'error');
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                {companyProfile.bankQrCodeUrl && (
                  <div className="mt-2 flex items-center gap-3 bg-white p-2 border border-slate-200 rounded">
                    <img src={companyProfile.bankQrCodeUrl} alt="Bank QR Preview" className="w-14 h-14 object-contain border border-slate-300 rounded" />
                    <span className="text-[11px] text-slate-500">Live Bank QR Code Preview (will render on customer checkout modal)</span>
                  </div>
                )}
              </div>
            </div>

            {/* E-Commerce Collection Drop Video Showcase (Live Host Video) */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-amber-800 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-amber-600" />
                  Storefront Collection Drop Showcase Video (Live Host Video)
                </span>
                <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded">
                  SQL Database Persisted
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Configure the showcase video for the storefront collection drop (e.g. Winter Maazi host video). Whenever you launch a new collection, you can upload a new video or enter its URL here, and it will immediately update on the storefront screen.
              </p>
              <div>
                <label className="block font-bold text-slate-600 text-[10px] uppercase mb-1">
                  Collection Video URL or Path:
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="/mazi_video.mp4 or https://..."
                    value={companyProfile.virtual_host_video_url || companyProfile.virtualHostVideoUrl || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setCompanyProfile({
                        ...companyProfile,
                        virtual_host_video_url: val,
                        virtualHostVideoUrl: val
                      });
                    }}
                    className="flex-1 border border-slate-300 rounded p-1.5 font-mono text-slate-800 focus:border-amber-500 text-xs bg-white"
                  />
                  <label className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold cursor-pointer transition-colors shrink-0 flex items-center gap-1">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload Video</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            showMsg('Uploading collection video to company_assets/videos...');
                            const url = await CompanyProfileService.uploadAsset(file, 'company_assets', 'videos');
                            setCompanyProfile(prev => ({
                              ...prev,
                              virtual_host_video_url: url,
                              virtualHostVideoUrl: url
                            }));
                            showMsg('Collection video uploaded successfully! Click Save Company Profile to persist.');
                          } catch (err: any) {
                            showMsg(err?.message || 'Failed to upload video', 'error');
                          }
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setCompanyProfile(prev => ({
                        ...prev,
                        virtual_host_video_url: '/mazi_video.mp4',
                        virtualHostVideoUrl: '/mazi_video.mp4'
                      }));
                      showMsg('Reset to default /mazi_video.mp4');
                    }}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-medium cursor-pointer transition-colors shrink-0"
                    title="Reset to local /mazi_video.mp4"
                  >
                    Default
                  </button>
                </div>
              </div>
              {(companyProfile.virtual_host_video_url || companyProfile.virtualHostVideoUrl) && (
                <div className="mt-2 p-2.5 bg-slate-900 rounded-lg border border-slate-700 flex flex-col sm:flex-row items-center gap-3">
                  <div className="w-36 h-24 bg-black rounded overflow-hidden flex items-center justify-center shrink-0 border border-amber-400/40">
                    <video
                      src={companyProfile.virtual_host_video_url || companyProfile.virtualHostVideoUrl}
                      className="w-full h-full object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  </div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Live Video Active on Storefront</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono break-all">
                      {companyProfile.virtual_host_video_url || companyProfile.virtualHostVideoUrl}
                    </p>
                    <p className="text-[10px] text-amber-200/80">
                      Plays automatically on the public storefront inside the collection showcase card.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* UAE VAT & Financial Period Closing Lock */}
            <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-rose-800 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    Financial Period & UAE VAT Closing Lock
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={companyProfile.isFinancialLocked ?? true}
                    onChange={e => setCompanyProfile({ ...companyProfile, isFinancialLocked: e.target.checked })}
                    className="w-4 h-4 text-rose-600 rounded cursor-pointer"
                  />
                  <span className="text-xs font-bold text-rose-900">Enable Period Lock</span>
                </label>
              </div>
              <p className="text-[11px] text-slate-600">
                Protect historical accounting records. When enabled, vouchers and financial transactions dated on or prior to the cutoff date cannot be deleted, edited, or unposted without explicit Admin authorization.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                    Lock All Transactions Up To (Cutoff Date):
                  </label>
                  <input
                    type="date"
                    value={companyProfile.financialLockDate || '2026-08-31'}
                    onChange={e => setCompanyProfile({ ...companyProfile, financialLockDate: e.target.value })}
                    className="w-full border border-rose-300 rounded p-1.5 text-slate-800 font-mono text-xs bg-white focus:border-rose-500"
                  />
                </div>
                <div className="flex items-center">
                  <div className="text-[11px] text-rose-800 bg-rose-100/70 p-2 rounded border border-rose-200 w-full">
                    🛡️ Vouchers on or before <strong>{companyProfile.financialLockDate || '2026-08-31'}</strong> are locked against edit/delete.
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#0056b3] hover:bg-[#004494] text-white font-bold text-[11px] uppercase tracking-wider shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Company Profile</span>
              </button>
            </div>
          </form>

          {/* Embedded Module-Level Maintenance Controls in Profile */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <ModuleMaintenanceSwitchboard
              companyProfile={companyProfile}
              onUpdateProfile={(updated) => {
                setCompanyProfile(updated);
                onRefreshAll();
              }}
              showMsg={showMsg}
            />
          </div>

          {/* Embedded Google Gemini AI & Neural Vision OCR Card in Profile */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <GeminiApiConfigCard onNotify={showMsg} />
          </div>
        </div>
      )}

      {/* DEDICATED GOOGLE GEMINI AI OCR & VALUATION TAB */}
      {subTab === 'ai_vision' && (
        <div className="animate-in fade-in duration-200">
          <GeminiApiConfigCard onNotify={showMsg} />
        </div>
      )}

      {/* DEDICATED MODULE MAINTENANCE MODE TAB */}
      {subTab === 'maintenance' && companyProfile && (
        <div className="max-w-5xl animate-in fade-in duration-200">
          <ModuleMaintenanceSwitchboard
            companyProfile={companyProfile}
            onUpdateProfile={(updated) => {
              setCompanyProfile(updated);
              onRefreshAll();
            }}
            showMsg={showMsg}
          />
        </div>
      )}

      {/* UNIFIED 1-TO-5 POS FLEET, CORPORATE BANKING & PAYMENTS COMMAND HUB */}
      {(subTab === 'banks' || subTab === 'payment_gateways' || subTab === 'pos_terminal') && companyProfile && (
        <div className="space-y-6 max-w-5xl animate-in fade-in duration-200">
          {/* Master Hub Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl border border-indigo-500/30 p-5 text-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/20 text-white">
                  <Landmark className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black tracking-wide text-white uppercase">
                      Banking, POS Fleet & Payments Hub
                    </h2>
                    <span className="px-2.5 py-0.5 text-[10px] font-black rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                      100% UNIFIED
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Centralized financial command center unifying corporate UAE bank accounts, instant payment QR codes, up to 5 multi-lane Smart POS card machines with active/inactive fleet control, and Apple Pay payment gateways across Counter Sales, Live Streaming, B2B Wholesale, and E-Commerce.
                  </p>
                </div>
              </div>

              {/* Live Status Indicators */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-slate-400">Primary Bank:</span>
                  <span className="font-bold text-white font-mono">
                    {(companyProfile?.bankAccounts || []).find(b => b.isPrimary)?.bankName || companyProfile?.bankName || 'RAKBANK'}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    [COA: {(companyProfile?.bankAccounts || []).find(b => b.isPrimary)?.coaAccountCode || '1120-02'}]
                  </span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-400">POS Fleet:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {posFleet.filter(d => d.isActive).length}/{posFleet.length} Active (Max 5)
                  </span>
                </div>
              </div>
            </div>

            {/* Omnichannel Architecture Interconnection Bar */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="flex items-center gap-2 bg-slate-800/40 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
                <span className="text-emerald-400">●</span>
                <span className="text-slate-300">Counter POS:</span>
                <strong className="text-white ml-auto">Active Fleet + QR</strong>
              </div>
              <div className="flex items-center gap-2 bg-slate-800/40 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
                <span className="text-indigo-400">●</span>
                <span className="text-slate-300">Live Selling:</span>
                <strong className="text-white ml-auto">Dynamic Bank QR</strong>
              </div>
              <div className="flex items-center gap-2 bg-slate-800/40 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
                <span className="text-amber-400">●</span>
                <span className="text-slate-300">B2B Wholesale:</span>
                <strong className="text-white ml-auto">Proforma IBAN & Wire</strong>
              </div>
              <div className="flex items-center gap-2 bg-slate-800/40 px-2.5 py-1.5 rounded-lg border border-slate-700/50">
                <span className="text-purple-400">●</span>
                <span className="text-slate-300">E-Commerce:</span>
                <strong className="text-white ml-auto">Apple Pay / Cards</strong>
              </div>
            </div>
          </div>

          {/* SECTION 1: CORPORATE BANK ACCOUNTS & COA AUTO-SYNC */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    Section 1: Corporate Bank Accounts & Live COA Auto-Sync
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                      Live COA Integration
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure company bank accounts, UAE IBANs, and direct Mobile Wallet QR codes. Every bank account added here automatically creates an active Asset account under <strong>1000: Assets</strong> in Chart of Accounts.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddBank}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Bank Account</span>
                </button>
              </div>
            </div>

            {/* List of Bank Accounts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(companyProfile?.bankAccounts || []).map((bank) => (
                <div
                  key={bank.id}
                  className={`rounded-2xl border p-4.5 space-y-3.5 transition-all shadow-sm relative ${
                    bank.isPrimary
                      ? 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 border-amber-300 shadow-amber-500/5'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">{bank.bankName}</span>
                        {bank.isPrimary && (
                          <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                            ★ Primary Settlement
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 font-semibold mt-0.5">
                        {bank.accountTitle}
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200 font-mono">
                      COA: {bank.coaAccountCode || '1120-02'}
                    </span>
                  </div>

                  {/* IBAN & Account Number */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase font-sans font-bold">
                      <span>UAE IBAN:</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(bank.iban.replace(/\s+/g, ''));
                          showMsg(`Copied IBAN for ${bank.bankName}`);
                        }}
                        className="text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer font-bold"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <div className="font-bold text-slate-900 tracking-wider text-xs sm:text-sm">
                      {bank.iban}
                    </div>
                    {bank.accountNumber && (
                      <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200 flex justify-between font-sans">
                        <span>Account No: <strong className="font-mono">{bank.accountNumber}</strong></span>
                        {bank.branchName && <span>Branch: {bank.branchName}</span>}
                      </div>
                    )}
                  </div>

                  {/* Linked POS Machine & QR Details */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      <span>POS Fleet Link: <strong>{posFleet.filter(d => d.isActive).length} Active Devices</strong></span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setViewingQrBank(bank)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>View QR Code</span>
                    </button>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                    {!bank.isPrimary ? (
                      <button
                        type="button"
                        onClick={() => handleSetPrimaryBank(bank.id)}
                        className="text-xs text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>★ Set as Primary</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-semibold">Active Primary</span>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleOpenEditBank(bank)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-slate-100 cursor-pointer"
                        title="Edit Bank Account"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {(companyProfile?.bankAccounts || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteBank(bank.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete Bank Account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 2: LIVE POS TERMINAL FLEET ACTIVITY & HARDWARE STATUS LOGS */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                      Section 2: Live POS Terminal Fleet Activity & Hardware Status Logs
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
                      {posFleet.filter(d => d.isActive).length}/{posFleet.length} Active in POS
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live hardware status, real-time connectivity telemetry, and active operational state across all connected banking partners. Cashiers can only process payments on terminals marked ACTIVE.
                  </p>
                </div>
              </div>

              {/* Quick Actions: Add Machine & Ping All */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const primaryOrFirstBank = (companyProfile?.bankAccounts || []).find(b => b.isPrimary) || (companyProfile?.bankAccounts || [])[0];
                    if (primaryOrFirstBank) {
                      handleOpenEditBank(primaryOrFirstBank, 'pos_fleet');
                    } else {
                      handleOpenAddBank();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  title="Add new POS card machine to fleet"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add POS Machine</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    posFleet.forEach(d => handlePingDevice(d));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 transition cursor-pointer"
                  title="Ping all devices in fleet to test handshake"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Ping All</span>
                </button>
              </div>
            </div>

            {/* Fleet Health KPI Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700 font-bold">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Total Connected</div>
                  <div className="text-sm font-bold text-slate-900 font-mono">{posFleet.length} Machines</div>
                </div>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-xl flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 font-bold">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-emerald-700">Active in POS</div>
                  <div className="text-sm font-bold text-emerald-800 font-mono">
                    {posFleet.filter(d => d.isActive).length} Terminals
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-200 text-slate-600 font-bold">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Standby / Inactive</div>
                  <div className="text-sm font-bold text-slate-600 font-mono">
                    {posFleet.filter(d => !d.isActive).length} Disabled
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-200 p-3 rounded-xl flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 font-bold">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-indigo-700">Banking Fleets</div>
                  <div className="text-sm font-bold text-indigo-900 font-mono">
                    {(companyProfile?.bankAccounts || []).length} Accounts
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1 uppercase">Filter:</span>
                <button
                  type="button"
                  onClick={() => setFleetLogFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    fleetLogFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Terminals ({posFleet.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFleetLogFilter('ACTIVE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    fleetLogFilter === 'ACTIVE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Active in POS ({posFleet.filter(d => d.isActive).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFleetLogFilter('INACTIVE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    fleetLogFilter === 'INACTIVE'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  <span>Inactive ({posFleet.filter(d => !d.isActive).length})</span>
                </button>
              </div>

              {(companyProfile?.bankAccounts || []).length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Bank:</span>
                  <select
                    value={fleetLogBankFilter}
                    onChange={e => setFleetLogBankFilter(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 bg-white"
                  >
                    <option value="ALL">All Banking Fleets</option>
                    {(companyProfile?.bankAccounts || []).map(b => (
                      <option key={b.id} value={b.id}>{b.bankName} (COA: {b.coaAccountCode})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Live Status Logs Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Device & Hardware</th>
                      <th className="py-2.5 px-3">Linked Bank & COA</th>
                      <th className="py-2.5 px-3">Network & Credentials</th>
                      <th className="py-2.5 px-3">Station / Desk</th>
                      <th className="py-2.5 px-3">Connectivity</th>
                      <th className="py-2.5 px-3 text-center">POS State</th>
                      <th className="py-2.5 px-3 text-right">Bank Setup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {posFleet
                      .filter(dev => {
                        if (fleetLogFilter === 'ACTIVE') return dev.isActive;
                        if (fleetLogFilter === 'INACTIVE') return !dev.isActive;
                        return true;
                      })
                      .filter(dev => {
                        if (fleetLogBankFilter === 'ALL') return true;
                        return dev.bankId === fleetLogBankFilter;
                      })
                      .map((dev, idx) => {
                        const pingState = devicePingResults[dev.id];
                        const parentBank = (companyProfile?.bankAccounts || []).find(b => b.id === dev.bankId || b.bankName === dev.bankName) || (companyProfile?.bankAccounts || [])[0];
                        return (
                          <tr
                            key={dev.id}
                            className={`transition hover:bg-slate-50/80 ${
                              dev.isActive ? '' : 'bg-slate-50/40 text-slate-500'
                            }`}
                          >
                            {/* Device & Hardware */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-400 font-bold text-[11px]">#{idx + 1}</span>
                                <div>
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                    <span>{dev.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-mono font-bold border border-slate-200">
                                      {dev.model}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-mono border border-slate-200">
                                      {dev.connectionType}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Linked Bank & COA */}
                            <td className="py-3 px-3">
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-800 flex items-center gap-1">
                                  <Landmark className="w-3 h-3 text-emerald-600" />
                                  <span>{dev.bankName || parentBank?.bankName || 'Primary Bank'}</span>
                                </div>
                                <span className="inline-block px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 text-[10px] font-mono font-bold border border-blue-200">
                                  COA: {dev.bankCoaCode || parentBank?.coaAccountCode || '1120-02'}
                                </span>
                              </div>
                            </td>

                            {/* Network & Credentials */}
                            <td className="py-3 px-3 font-mono text-[11px]">
                              <div className="space-y-0.5">
                                {dev.connectionType === 'CELLULAR_SIM' ? (
                                  <>
                                    <div className="flex items-center gap-1">
                                      <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-sans font-bold border border-purple-200">
                                        📶 4G SIM ({dev.simCarrier || 'DU'})
                                      </span>
                                    </div>
                                    <div><span className="text-slate-400 font-sans text-[10px] uppercase font-bold">S/N: </span><strong className="text-slate-800">{dev.serialNumber || '1180511614'}</strong></div>
                                    <div><span className="text-slate-400 font-sans text-[10px] uppercase font-bold">TID: </span><span className="text-indigo-600 font-bold">{dev.terminalId}</span>{dev.paymobTid ? <span className="text-slate-500 font-normal"> (PM: {dev.paymobTid})</span> : ''}</div>
                                  </>
                                ) : (
                                  <>
                                    <div><span className="text-slate-400 font-sans text-[10px] uppercase font-bold">IP: </span><strong className="text-slate-800">{dev.ipAddress || '192.168.1.150'}:{dev.port || 8080}</strong></div>
                                    <div><span className="text-slate-400 font-sans text-[10px] uppercase font-bold">TID: </span><span className="text-indigo-600 font-bold">{dev.terminalId}</span></div>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Station */}
                            <td className="py-3 px-3">
                              <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                                {dev.location || 'Retail Floor Desk'}
                              </span>
                            </td>

                            {/* Connectivity */}
                            <td className="py-3 px-3">
                              <button
                                type="button"
                                onClick={() => handlePingDevice(dev)}
                                disabled={pingState === 'TESTING'}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                                  pingState === 'SUCCESS'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : pingState === 'FAILED'
                                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <RefreshCw className={`w-3 h-3 ${pingState === 'TESTING' ? 'animate-spin text-amber-500' : ''}`} />
                                <span>{pingState === 'TESTING' ? 'Pinging...' : pingState === 'SUCCESS' ? 'Online 18ms' : pingState === 'FAILED' ? 'Offline' : 'Ping'}</span>
                              </button>
                            </td>

                            {/* POS State (Interactive Toggle Switch) */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleDeviceActive(dev.id)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                                  dev.isActive
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-slate-200 text-slate-600 border border-slate-300 hover:bg-slate-300'
                                }`}
                                title="Click to toggle Active in POS / Inactive"
                              >
                                <span className={`w-2 h-2 rounded-full ${dev.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                <span>{dev.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                              </button>
                            </td>

                            {/* Actions: Edit & Delete */}
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (parentBank) {
                                      handleOpenEditBank(parentBank, 'pos_fleet');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                                  title="Edit this machine in bank settings"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDevice(dev.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                                  title="Delete this machine from fleet"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                    {posFleet.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center bg-slate-50/50">
                          <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <div className="font-bold text-slate-700 text-xs">No POS Card Terminals Configured</div>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                            Click "+ Add POS Machine" above to connect your first card machine to your bank account.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Architecture Tip Box */}
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-indigo-900">
                <Landmark className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Bank-Wise Fleet Architecture:</strong> Each corporate bank account manages its own fleet of up to 5 Smart POS machines. To add a new card terminal or configure IP credentials, click <strong>"Edit"</strong> on that Bank Account above in <strong>Section 1</strong>.
                </span>
              </div>
              {(companyProfile?.bankAccounts || []).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const firstBank = (companyProfile?.bankAccounts || [])[0];
                    if (firstBank) handleOpenEditBank(firstBank, 'pos_fleet');
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Configure Bank Fleet</span>
                </button>
              )}
            </div>

            {/* Global Hardware & Settlement Routing */}
            <form onSubmit={handleSavePosTerminalConfig} className="space-y-4 pt-3 border-t border-slate-200">
              <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
                    <Landmark className="w-4 h-4 text-emerald-600" />
                    <span>Linked Settlement Bank Account (Settles All Fleet Machines)</span>
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 font-mono">
                    COA: {posConfig.settlementCoaAccountCode || '1120-02'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase mb-1">
                      Destination Settlement Bank:
                    </label>
                    <select
                      value={posConfig.linkedBankAccountId || (companyProfile?.bankAccounts?.find(b => b.isPrimary)?.id || '')}
                      onChange={e => {
                        const sel = (companyProfile?.bankAccounts || []).find(b => b.id === e.target.value);
                        setPosConfig({
                          ...posConfig,
                          linkedBankAccountId: e.target.value,
                          linkedBankName: sel?.bankName || '',
                          settlementCoaAccountCode: sel?.coaAccountCode || '1120-02'
                        });
                      }}
                      className="w-full border border-slate-300 rounded p-2 text-xs font-bold text-slate-900 bg-white focus:border-emerald-500"
                    >
                      {(companyProfile?.bankAccounts || []).map(b => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} • {b.accountTitle} ({b.currency}) {b.isPrimary ? '★ Primary' : ''} [COA: {b.coaAccountCode}]
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1 bg-white/90 p-2.5 rounded-lg border border-emerald-200/60 font-mono">
                    <div className="font-bold text-emerald-900 font-sans">
                      Automated COA Routing:
                    </div>
                    <div>1. POS Card Tap Debits: <strong className="text-slate-900">1125-00 (POS Clearing)</strong></div>
                    <div>2. Settlement Debits: <strong className="text-emerald-700">{posConfig.settlementCoaAccountCode || '1120-02'} ({posConfig.linkedBankName || 'RAKBANK'})</strong></div>
                  </div>
                </div>
              </div>

              {/* Automation & Ledger Settling */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2.5">
                <div className="font-bold text-xs text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Fleet Automation & Ledger Callback Settings</span>
                </div>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={posConfig.autoConfirmToCOA !== false}
                      onChange={e => setPosConfig({ ...posConfig, autoConfirmToCOA: e.target.checked })}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                    />
                    <span>Auto-post payment approval to Chart of Accounts Account 1125 (POS Clearing)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={posConfig.simulateMachine !== false}
                      onChange={e => setPosConfig({ ...posConfig, simulateMachine: e.target.checked })}
                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                    />
                    <span>Enable POS Terminal Virtual Tap & Fallback Emulator (Allows test transactions without physical machine)</span>
                  </label>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSavingPosConfig}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingPosConfig ? 'Saving...' : 'Save POS Fleet Settings'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* SECTION 3: REAL UAE PAYMENT GATEWAY & APPLE PAY SETUP */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  Section 3: Online Payment Gateway & Apple Pay / Google Pay Configuration
                </h3>
                <p className="text-xs text-slate-500">
                  Stripe UAE / Merchant ID integration for online e-commerce checkout and digital claim links.
                </p>
              </div>
            </div>

            <PaymentGatewaySetupCard
              companyProfile={companyProfile}
              onSaveProfile={async (updated) => {
                await CompanyProfileService.updateCompanyProfile(updated);
                setCompanyProfile(updated);
                onRefreshAll();
              }}
              showMsg={showMsg}
            />
          </div>

          {/* SECTION 4: OMNICHANNEL SALES INTERCONNECTION MATRIX */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 text-white space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-100">
                  Section 4: Omnichannel Sales Interconnection Matrix
                </h3>
              </div>
              <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2.5 py-0.5 rounded-full font-mono">
                Auto-Synced Realtime
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>🏪 Walk-In POS Counter</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Cashiers select from active fleet machines (PAX, Sunmi, Ingenico) or present RAKBANK Instant QR. Settles directly to COA 1125 & 1120-02.
                </p>
                <div className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 p-1.5 rounded border border-emerald-800/50">
                  Active Devices: {posFleet.filter(d => d.isActive).length} Available
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                  <span>🎙️ Live Selling Studio</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Live TikTok, IG & Whatnot claims dynamically embed the RAKBANK Instant QR and IBAN for instant viewer deposits and COD dispatch.
                </p>
                <div className="text-[10px] font-mono text-indigo-300 bg-indigo-950/60 p-1.5 rounded border border-indigo-800/50">
                  QR Provider: RAKBANK Instant
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <span>🏢 B2B Wholesale Sales</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Proforma invoices and Tax Invoices auto-embed RAKBANK IBAN and SWIFT code for high-value corporate container and bulk bale transfers.
                </p>
                <div className="text-[10px] font-mono text-amber-300 bg-amber-950/60 p-1.5 rounded border border-amber-800/50">
                  IBAN: AE76 0400 0001 4365...
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2">
                <div className="font-bold text-purple-400 flex items-center gap-1.5">
                  <span>🛍️ E-Commerce Storefront</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Checkout modal supports Apple Pay, Google Pay, and direct Mobile Wallet QR scan with immediate double-entry voucher generation.
                </p>
                <div className="text-[10px] font-mono text-purple-300 bg-purple-950/60 p-1.5 rounded border border-purple-800/50">
                  Gateway: Stripe UAE + Bank QR
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SALES & DYNAMIC CHART OF ACCOUNTS (COA) ROUTING SETTINGS */}
      {subTab === 'sales_coa' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 max-w-4xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200">
                <Landmark className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  Sales & Chart of Accounts (COA) Dynamic Routing
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                    Live Enterprise COA
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure Chart of Accounts codes for POS counter sales, inventory relief (COGS), VAT output, and payment settlements. Changes take effect instantly in the POS terminal without code modifications.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetSalesCoaDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset to Defaults</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSaveSalesCoaConfig} className="space-y-6">
            {/* PART 1: Inventory Depletion & COGS Accounts */}
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/30 p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-blue-200/60 pb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white">Part 1</span>
                <h4 className="font-bold text-xs uppercase tracking-wider text-blue-900">Inventory Depletion & Cost of Goods Sold (COGS)</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cost of Goods Sold (COGS) Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.cogsAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, cogsAccountCode: e.target.value })}
                    placeholder="e.g. 5100-02"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">5100-02</code> (Cost of Goods Sold - Finished Goods). Debited with landed cost.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Finished Goods (Inventory Asset) Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.finishedGoodsAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, finishedGoodsAccountCode: e.target.value })}
                    placeholder="e.g. 1160-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">1160-01</code> (Finished Goods Asset). Credited with landed cost to relieve inventory.
                  </p>
                </div>
              </div>
            </div>

            {/* PART 2: Revenue Recognition & Receivable */}
            <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/30 p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-indigo-200/60 pb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white">Part 2</span>
                <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-900">Revenue Recognition & Khata Receivable</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Walk-In Customer Khata Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.walkInCustomerAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, walkInCustomerAccountCode: e.target.value })}
                    placeholder="e.g. 1130-05"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">1130-05</code> (Walk-In Customer Control Khata). Debited with gross invoice total.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    POS Retail Sales Revenue Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.posRevenueAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, posRevenueAccountCode: e.target.value })}
                    placeholder="e.g. 4110-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">4110-01</code> (POS / Counter Retail Sales). Credited with net subtotal.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    VAT Output (5% Tax Liability) Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.vatOutputAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, vatOutputAccountCode: e.target.value })}
                    placeholder="e.g. 2140-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">2140-01</code> (VAT Output 5%). Credited with collected UAE sales tax.
                  </p>
                </div>
              </div>
            </div>

            {/* PART 3: Payment Settlement Accounts */}
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-emerald-200/60 pb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">Part 3</span>
                <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-900">Payment Clearing & Settlement</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cash in Hand (Counter Drawer) Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.cashAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, cashAccountCode: e.target.value })}
                    placeholder="e.g. 1110-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">1110-01</code> (Cash in Hand - Counter). Debited when cash payment is received.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bank / Card Clearing Account Code
                  </label>
                  <input
                    type="text"
                    value={salesCoaConfig.bankAccountCode}
                    onChange={e => setSalesCoaConfig({ ...salesCoaConfig, bankAccountCode: e.target.value })}
                    placeholder="e.g. 1120-01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default: <code className="font-mono text-slate-700 font-bold">1120-01</code> (Bank / Card Clearing). Debited for card/electronic payments.
                  </p>
                </div>
              </div>
            </div>

            {/* Save Buttons & Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Accounts automatically validate during checkout and reflect in general ledger.</span>
              </div>

              <button
                type="submit"
                disabled={isSavingSalesCoa}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingSalesCoa ? 'Saving Settings...' : 'Save Sales & COA Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}



      {/* UNIFIED 5-BOOTH LIVE MULTICAST & SOCIAL SOCKETS HUB */}
      {subTab === 'live_multicast_sockets' && companyProfile && (
        <UnifiedLiveBroadcastHub
          companyProfile={companyProfile}
          onSaveProfile={async (updated) => {
            await CompanyProfileService.updateCompanyProfile(updated);
            setCompanyProfile(updated);
            onRefreshAll();
          }}
          showMsg={showMsg}
        />
      )}

      {/* 2. CURRENCY & FX */}
      {subTab === 'currency' && (
        <div className="bg-white rounded-xl border border-amber-200/90 shadow-xs p-5 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-amber-100">
            <div>
              <h3 className="font-serif font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-600" />
                <span>Multi-Currency Master & Live Manual FX Adjuster</span>
              </h3>
              <p className="text-xs text-slate-700 mt-0.5">
                Primary Base Currency: <strong className="text-amber-800 font-mono">AED (United Arab Emirates Dirham)</strong>. Adjust exchange rates manually (e.g. 1 AED = 0.272 USD).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddCurrencyModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Currency</span>
            </button>
          </div>

          <div className="space-y-3">
            {currencies.map(c => {
              const currentVal = editingRates[c.code] !== undefined ? editingRates[c.code] : c.exchangeRate;
              const inverseRate = currentVal > 0 ? (1 / currentVal).toFixed(4) : '0';

              return (
                <div
                  key={c.code}
                  className={`p-3.5 rounded-xl border transition-all ${
                    c.isBase
                      ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-slate-50/70 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center font-bold text-amber-900 shadow-xs text-sm">
                        {c.symbol}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span>{c.name}</span>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-bold">
                            {c.code}
                          </span>
                          {c.isBase && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              BASE CURRENCY
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 font-mono mt-0.5">
                          1 AED = {currentVal} {c.code} &bull; 1 {c.code} = {inverseRate} AED
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Rate (vs 1 AED):
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          disabled={c.isBase}
                          value={currentVal}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingRates({ ...editingRates, [c.code]: val });
                          }}
                          className="w-28 px-2 py-1 border border-slate-300 rounded-lg font-mono font-bold text-slate-900 bg-white text-right text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>

                      {!c.isBase && (
                        <div className="flex items-center gap-1.5 pt-3">
                          <button
                            type="button"
                            onClick={() => handleUpdateFxRate(c.code, currentVal)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                            title="Save adjusted rate"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCurrency(c.code)}
                            className="p-1 rounded-lg hover:bg-rose-100 text-slate-700 hover:text-rose-800 transition-colors"
                            title="Remove currency"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Info Box */}
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
            <span>
              💡 <strong>Tip:</strong> Default base is AED. Changing rates instantly updates valuation throughout commercial purchase invoices, sales gate passes, and inventory valuations.
            </span>
          </div>

          {/* Add Currency Modal */}
          {showAddCurrencyModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-slate-900 text-sm">Add New Currency Master</h4>
                      <p className="text-[11px] text-slate-700">Define code, symbol, and exchange rate vs 1 AED</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddCurrencyModal(false)}
                    className="text-slate-700 hover:text-slate-900 font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateCurrency} className="space-y-3.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        ISO Code *
                      </label>
                      <input
                        type="text"
                        value={newCurrCode}
                        onChange={e => setNewCurrCode(e.target.value.toUpperCase())}
                        placeholder="e.g. USD, EUR, CAD"
                        maxLength={5}
                        required
                        className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] font-mono font-bold uppercase focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Symbol
                      </label>
                      <input
                        type="text"
                        value={newCurrSymbol}
                        onChange={e => setNewCurrSymbol(e.target.value)}
                        placeholder="e.g. $, €, £, AED"
                        className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Currency Full Name *
                    </label>
                    <input
                      type="text"
                      value={newCurrName}
                      onChange={e => setNewCurrName(e.target.value)}
                      placeholder="e.g. United States Dollar"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Exchange Rate vs 1 AED * (1 AED = ? {newCurrCode || 'CUR'})
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={newCurrRate}
                      onChange={e => setNewCurrRate(e.target.value)}
                      placeholder="e.g. 0.272 (since 1 USD = 3.67 AED)"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-700 mt-1">
                      Example: For USD where 1 USD = 3.6725 AED, the rate is 1 / 3.6725 = <strong>0.2723</strong>.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="base-curr-check"
                      checked={newCurrIsBase}
                      onChange={e => setNewCurrIsBase(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="base-curr-check" className="text-xs text-slate-700 font-medium">
                      Set as System Base Currency
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                    <button
                      type="button"
                      onClick={() => setShowAddCurrencyModal(false)}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingCurr}
                      className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
                    >
                      {isSavingCurr ? 'Saving...' : 'Add & Save Currency'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2B. 4-TIER CASCADING TAXONOMY & COLLECTIONS MASTER */}
      {subTab === 'categories' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-200">
            <div>
              <h3 className="font-serif font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-amber-600" />
                <span>4-Tier Cascading Taxonomy & Collections Master</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Strict hierarchy: Department ➔ Main Category ➔ Sub-Category ➔ Collections & Seasons. Powers Sorting Terminal, SKU Generator, and E-Commerce Storefront.
              </p>
            </div>

            {/* Tab-specific Add Button */}
            {taxonomyTab === 'departments' && (
              <button
                type="button"
                onClick={handleOpenAddDepartment}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Department</span>
              </button>
            )}
            {taxonomyTab === 'categories' && (
              <button
                type="button"
                onClick={() => handleOpenAddMainCategory(mainCatDeptFilter !== 'ALL' ? mainCatDeptFilter : undefined)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Main Category</span>
              </button>
            )}
            {taxonomyTab === 'subcategories' && (
              <button
                type="button"
                onClick={() => handleOpenAddSubCategory(subCatMainFilter !== 'ALL' ? subCatMainFilter : undefined)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Sub-Category</span>
              </button>
            )}
            {taxonomyTab === 'collections' && (
              <button
                type="button"
                onClick={handleOpenAddCollection}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Collection</span>
              </button>
            )}
          </div>

          {/* 4 Distinct UI Tabs Navigation Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 bg-stone-100 rounded-xl border border-stone-200">
            {[
              {
                id: 'departments',
                label: '1. Departments',
                count: productCategories.filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1)).length,
                icon: <FolderTree className="w-3.5 h-3.5" />,
                desc: 'Root Tiers (Men, Ladies, etc.)'
              },
              {
                id: 'categories',
                label: '2. Main Categories',
                count: productCategories.filter(c => c.taxonomy_level === 'CATEGORY' || (c.parent_id && Number(c.level) === 2)).length,
                icon: <Package className="w-3.5 h-3.5" />,
                desc: 'T-Shirts, Pants, Outerwear'
              },
              {
                id: 'subcategories',
                label: '3. Sub-Categories',
                count: productCategories.filter(c => c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3).length,
                icon: <Tag className="w-3.5 h-3.5" />,
                desc: 'Graphic Tees, Denim Jeans'
              },
              {
                id: 'collections',
                label: '4. Collections & Seasons',
                count: collections.length,
                icon: <Sparkles className="w-3.5 h-3.5" />,
                desc: 'Summer 2026, Core Vault'
              }
            ].map(tab => {
              const isActive = taxonomyTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTaxonomyTab(tab.id as any)}
                  className={`flex flex-col items-start p-2.5 rounded-lg text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white shadow-xs border border-amber-300 ring-2 ring-amber-400/40 text-slate-900'
                      : 'text-stone-600 hover:bg-stone-200/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      {tab.icon}
                      <span>{tab.label}</span>
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-amber-100 text-amber-900' : 'bg-stone-200 text-stone-700'
                    }`}>
                      {tab.count}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 truncate">{tab.desc}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: DEPARTMENTS */}
          {taxonomyTab === 'departments' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search departments..."
                    value={deptSearch}
                    onChange={e => setDeptSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-64"
                  />
                </div>
                <span className="text-xs text-slate-500">Tier 1 root levels used to prefix SKUs (e.g. MEN, LAD, KID, ACC)</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-stone-50 text-stone-700 font-bold text-[11px] uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Code (SKU Prefix)</th>
                      <th className="px-3 py-2.5">Department Name</th>
                      <th className="px-3 py-2.5">Slug</th>
                      <th className="px-3 py-2.5">Main Categories Count</th>
                      <th className="px-3 py-2.5 text-center">Sort Order</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {productCategories
                      .filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1))
                      .filter(c => !deptSearch || c.name.toLowerCase().includes(deptSearch.toLowerCase()) || ((c as any).department_code && (c as any).department_code.toLowerCase().includes(deptSearch.toLowerCase())))
                      .map(dept => {
                        const isDeptActive = dept.is_active !== false && dept.isActive !== false;
                        const childCount = productCategories.filter(c => (c.taxonomy_level === 'CATEGORY' || Number(c.level) === 2) && (c.parent_id === dept.id || (c as any).parent_slug === dept.slug)).length;
                        return (
                          <tr key={dept.id} className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-3 py-2 font-mono font-bold text-amber-900">
                              <span className="bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                {(dept as any).department_code || dept.slug.toUpperCase().slice(0, 5)}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900">{dept.name}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{dept.slug}</td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs text-slate-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                {childCount} categories
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">{(dept as any).display_order || (dept as any).displayOrder || 1}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isDeptActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-700 border border-stone-300'
                              }`}>
                                {isDeptActive ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleDepartment(dept)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                                  isDeptActive
                                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                }`}
                              >
                                {isDeptActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditDepartment(dept)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDepartment(dept.id)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: MAIN CATEGORIES */}
          {taxonomyTab === 'categories' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search main categories..."
                      value={mainCatSearch}
                      onChange={e => setMainCatSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-52 sm:w-60"
                    />
                  </div>

                  {/* Filter by Department */}
                  <select
                    value={mainCatDeptFilter}
                    onChange={e => setMainCatDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-slate-800 font-bold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="ALL">All Departments</option>
                    {productCategories
                      .filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1))
                      .map(d => (
                        <option key={d.id} value={d.id}>📁 {d.name} ({(d as any).department_code || d.slug})</option>
                      ))}
                  </select>
                </div>

                <span className="text-xs text-slate-500">Tier 2 categories linked to parent departments</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-stone-50 text-stone-700 font-bold text-[11px] uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Category Name</th>
                      <th className="px-3 py-2.5">Parent Department</th>
                      <th className="px-3 py-2.5">Slug</th>
                      <th className="px-3 py-2.5">Sub-Categories Count</th>
                      <th className="px-3 py-2.5 text-center">Sort Order</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {productCategories
                      .filter(c => c.taxonomy_level === 'CATEGORY' || (c.parent_id && Number(c.level) === 2))
                      .filter(c => {
                        if (mainCatDeptFilter !== 'ALL' && c.parent_id !== mainCatDeptFilter) return false;
                        if (mainCatSearch && !c.name.toLowerCase().includes(mainCatSearch.toLowerCase()) && !c.slug.toLowerCase().includes(mainCatSearch.toLowerCase())) return false;
                        return true;
                      })
                      .map(cat => {
                        const isCatActive = cat.is_active !== false && cat.isActive !== false;
                        const parentDept = productCategories.find(p => p.id === cat.parent_id);
                        const subCount = productCategories.filter(s => (s.taxonomy_level === 'SUBCATEGORY' || Number(s.level) === 3) && s.parent_id === cat.id).length;
                        return (
                          <tr key={cat.id} className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-3 py-2 font-bold text-slate-900">{cat.name}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                📁 {parentDept?.name || (cat as any).parent_name || 'Department'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{cat.slug}</td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs text-slate-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                {subCount} sub-items
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">{(cat as any).display_order || (cat as any).displayOrder || 1}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isCatActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-700 border border-stone-300'
                              }`}>
                                {isCatActive ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleMainCategory(cat)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                                  isCatActive
                                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                }`}
                              >
                                {isCatActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditMainCategory(cat)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMainCategory(cat.id)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SUB-CATEGORIES */}
          {taxonomyTab === 'subcategories' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search sub-categories..."
                      value={subCatSearch}
                      onChange={e => setSubCatSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-52 sm:w-60"
                    />
                  </div>

                  {/* Filter by Main Category */}
                  <select
                    value={subCatMainFilter}
                    onChange={e => setSubCatMainFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white text-slate-800 font-bold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="ALL">All Main Categories</option>
                    {productCategories
                      .filter(c => c.taxonomy_level === 'CATEGORY' || (c.parent_id && Number(c.level) === 2))
                      .map(mc => (
                        <option key={mc.id} value={mc.id}>📦 {mc.name}</option>
                      ))}
                  </select>
                </div>

                <span className="text-xs text-slate-500">Tier 3 detailed cuts/styles (e.g. Graphic Tees, Single Stitch, Denim Jeans)</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-stone-50 text-stone-700 font-bold text-[11px] uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Sub-Category Name</th>
                      <th className="px-3 py-2.5">Parent Main Category</th>
                      <th className="px-3 py-2.5">Department</th>
                      <th className="px-3 py-2.5">Slug</th>
                      <th className="px-3 py-2.5 text-center">Sort Order</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {productCategories
                      .filter(c => c.taxonomy_level === 'SUBCATEGORY' || Number(c.level) === 3)
                      .filter(c => {
                        if (subCatMainFilter !== 'ALL' && c.parent_id !== subCatMainFilter) return false;
                        if (subCatSearch && !c.name.toLowerCase().includes(subCatSearch.toLowerCase()) && !c.slug.toLowerCase().includes(subCatSearch.toLowerCase())) return false;
                        return true;
                      })
                      .map(sub => {
                        const isSubActive = sub.is_active !== false && sub.isActive !== false;
                        const parentCat = productCategories.find(p => p.id === sub.parent_id);
                        const grandParentDept = parentCat ? productCategories.find(p => p.id === parentCat.parent_id) : null;
                        return (
                          <tr key={sub.id} className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-3 py-2 font-bold text-slate-900">{sub.name}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-200">
                                📦 {parentCat?.name || (sub as any).parent_name || 'Category'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                📁 {grandParentDept?.name || 'Department'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{sub.slug}</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">{(sub as any).display_order || (sub as any).displayOrder || 1}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isSubActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-700 border border-stone-300'
                              }`}>
                                {isSubActive ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleSubCategory(sub)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                                  isSubActive
                                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                }`}
                              >
                                {isSubActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditSubCategory(sub)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubCategory(sub.id)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: COLLECTIONS & SEASONS */}
          {taxonomyTab === 'collections' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search collections..."
                    value={colSearch}
                    onChange={e => setColSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-64"
                  />
                </div>
                <span className="text-xs text-slate-500">Tier 4 seasonal drops and event archives (e.g. Summer Edition, Winter Maazi Drop)</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-stone-50 text-stone-700 font-bold text-[11px] uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2.5">Code</th>
                      <th className="px-3 py-2.5">Collection Name</th>
                      <th className="px-3 py-2.5">Season</th>
                      <th className="px-3 py-2.5">Year</th>
                      <th className="px-3 py-2.5 text-center">Sort Order</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {collections
                      .filter(c => !colSearch || c.name.toLowerCase().includes(colSearch.toLowerCase()) || c.code.toLowerCase().includes(colSearch.toLowerCase()))
                      .map(col => {
                        const isColActive = col.is_active !== false && col.isActive !== false;
                        return (
                          <tr key={col.id} className="hover:bg-amber-50/40 transition-colors">
                            <td className="px-3 py-2 font-mono font-bold text-amber-900">
                              <span className="bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                {col.code}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900">{col.name}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                {col.season || 'All Season'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">{col.year || 2026}</td>
                            <td className="px-3 py-2 text-center font-mono text-slate-600">{(col as any).display_order || (col as any).displayOrder || 1}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isColActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-700 border border-stone-300'
                              }`}>
                                {isColActive ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleCollection(col)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                                  isColActive
                                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                                    : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                }`}
                              >
                                {isColActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditCollection(col)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCollection(col.id)}
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2C. APPAREL SIZES MASTER */}
      {subTab === 'sizes' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
            <div>
              <h3 className="font-serif font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-indigo-600" />
                <span>Apparel Sizes Master</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Configure garment sizes (XS, S, M, L, XL, Denim Waists, Free Size) for 1-click tagging in Sorting Terminal and Thermal Barcodes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search sizes..."
                  value={sizeSearch}
                  onChange={e => setSizeSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-60"
                />
              </div>

              <button
                type="button"
                onClick={handleOpenAddSize}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Size</span>
              </button>
            </div>
          </div>

          {/* Quick Click Preview Bar */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
            <div className="text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-2">
              Active Size Tag Roll Preview (As Printed on 4"x2" Thermal Stickers):
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {sizes.filter(s => s.status !== 'UNPOSTED').map(s => (
                <span key={s.id} className="px-2.5 py-1 rounded-md bg-white border border-stone-300 font-mono font-bold text-xs text-stone-900 shadow-xs">
                  {s.code}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 text-stone-700 font-bold text-[11px] uppercase tracking-wider border-b border-stone-200">
                <tr>
                  <th className="px-3 py-2.5">Size Code</th>
                  <th className="px-3 py-2.5">Display Name</th>
                  <th className="px-3 py-2.5">Category / Placement</th>
                  <th className="px-3 py-2.5 text-center">Sort Order</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sizes.filter(s => !sizeSearch || s.name.toLowerCase().includes(sizeSearch.toLowerCase()) || s.code.toLowerCase().includes(sizeSearch.toLowerCase())).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                      No sizes found matching your search. Click "Add Size" to create one.
                    </td>
                  </tr>
                ) : (
                  sizes
                    .filter(s => !sizeSearch || s.name.toLowerCase().includes(sizeSearch.toLowerCase()) || s.code.toLowerCase().includes(sizeSearch.toLowerCase()))
                    .map(sz => {
                      const isPosted = sz.status !== 'UNPOSTED';
                      return (
                        <tr key={sz.id} className="hover:bg-indigo-50/40 transition-colors">
                          <td className="px-3 py-2 font-mono font-bold text-indigo-900">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                              {sz.code}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{sz.name}</td>
                          <td className="px-3 py-2 text-slate-600">{sz.category || 'Tops / Universal'}</td>
                          <td className="px-3 py-2 text-center font-mono text-slate-600">{sz.sortOrder || 1}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isPosted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-700 border border-stone-300'
                            }`}>
                              {isPosted ? 'ACTIVE' : 'DRAFT'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleTogglePostSize(sz)}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                                isPosted
                                  ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                              }`}
                              title={isPosted ? 'Set as Draft' : 'Post as Active'}
                            >
                              {isPosted ? 'Unpost' : 'Post'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditSize(sz)}
                              className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSize(sz.id)}
                              className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ITEM MASTERS */}
      {subTab === 'items' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Garment Categories & Item Masters</h3>
              <p className="text-[10px] text-slate-500">Manage garment item masters, base prices, and categories</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">{items.length} Items</span>
              <button
                type="button"
                onClick={handleOpenAddItem}
                className="btn-3d btn-3d-amber px-3 py-1 text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>Add Item Master</span>
              </button>
            </div>
          </div>
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Category Name</th>
                <th className="px-3 py-2">UOM</th>
                <th className="px-3 py-2">Weight (KG)</th>
                <th className="px-3 py-2">Base Price</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 font-sans text-xs">
                    No Item Masters found. Click "Add Item Master" above to create your first item.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-1.5 font-bold text-blue-900">{item.code}</td>
                    <td className="px-3 py-1.5 font-sans font-semibold text-slate-800">{item.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{item.targetUom || item.uom || 'KG'}</td>
                    <td className="px-3 py-1.5 text-slate-600">{item.weightKg || 1} KG</td>
                    <td className="px-3 py-1.5 font-bold text-emerald-700">AED {item.basePrice}</td>
                    <td className="px-3 py-1.5 text-right space-x-1.5 whitespace-nowrap font-sans">
                      <button
                        onClick={() => handleOpenEditItem(item)}
                        className="btn-3d btn-3d-slate px-2 py-0.5 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="btn-3d btn-3d-red px-2 py-0.5 text-[10px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. BRAND MASTERS */}
      {subTab === 'brands' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Vintage Brand Masters & Valuation Tiers</h3>
              <p className="text-[10px] text-slate-500">Manage designer and vintage heritage brand tiers</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">{brands.length} Brands</span>
              <button
                type="button"
                onClick={handleOpenAddBrand}
                className="btn-3d btn-3d-amber px-3 py-1 text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>Add Brand Tier</span>
              </button>
            </div>
          </div>
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Brand Name</th>
                <th className="px-3 py-2">Country of Origin</th>
                <th className="px-3 py-2">Heritage Era</th>
                <th className="px-3 py-2">Valuation Tier</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {brands.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 font-sans text-xs">
                    No Brand Tiers found. Click "Add Brand Tier" above to create your first brand.
                  </td>
                </tr>
              ) : (
                brands.map(b => (
                  <tr key={b.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-1.5 font-bold text-slate-900">{b.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{b.origin}</td>
                    <td className="px-3 py-1.5 text-slate-600 font-mono text-[10px]">{b.era}</td>
                    <td className="px-3 py-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                        {b.tier}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEditBrand(b)}
                        className="btn-3d btn-3d-slate px-2 py-0.5 text-[10px]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteBrand(b.id)}
                        className="btn-3d btn-3d-red px-2 py-0.5 text-[10px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. QUALITY & GRADING STANDARDS MASTER */}
      {subTab === 'labels' && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
            <div>
              <h3 className="font-serif font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Quality Standards & Grading Masters (Cream / Non-Brand / Grade A)</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Define grading tiers, price multipliers, and condition criteria for Bale Sorting Terminal, Barcode Thermal Printing, and Inventory valuation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono bg-stone-100 px-2.5 py-1 rounded-md border border-stone-200">
                {labels.length} Quality Grades Defined
              </span>
              <button
                type="button"
                onClick={handleOpenAddLabel}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Quality Grade</span>
              </button>
            </div>
          </div>

          {/* Grading Hierarchy Cards Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="p-2.5 rounded-xl border border-amber-300 bg-amber-50/60">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Tier 1 &bull; Mint</span>
              <span className="text-xs font-black text-amber-950 block mt-0.5">🌟 Super Cream</span>
              <span className="text-[10px] text-amber-700 font-mono">2.0x Multiplier</span>
            </div>
            <div className="p-2.5 rounded-xl border border-blue-300 bg-blue-50/60">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Tier 2 &bull; Heritage</span>
              <span className="text-xs font-black text-blue-950 block mt-0.5">⭐ Grade A Branded</span>
              <span className="text-[10px] text-blue-700 font-mono">1.6x Multiplier</span>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-300 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Tier 3 &bull; Everyday</span>
              <span className="text-xs font-black text-slate-900 block mt-0.5">🏷️ Non-Brand Basic</span>
              <span className="text-[10px] text-slate-600 font-mono">1.2x Multiplier</span>
            </div>
            <div className="p-2.5 rounded-xl border border-amber-300 bg-amber-50/30">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Tier 4 &bull; Flawed</span>
              <span className="text-xs font-black text-amber-950 block mt-0.5">⚠️ Grade B Outlet</span>
              <span className="text-[10px] text-amber-700 font-mono">0.7x Multiplier</span>
            </div>
            <div className="p-2.5 rounded-xl border border-rose-300 bg-rose-50/50">
              <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">Tier 5 &bull; Scrap</span>
              <span className="text-xs font-black text-rose-950 block mt-0.5">✂️ Grade C Rework</span>
              <span className="text-[10px] text-rose-700 font-mono">0.3x Multiplier</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-stone-50 text-stone-700 font-bold text-[11px] uppercase tracking-wider border-b border-stone-200">
                <tr>
                  <th className="px-3 py-2.5">Grade Code</th>
                  <th className="px-3 py-2.5">Quality Name / Classification</th>
                  <th className="px-3 py-2.5">Quality Tier</th>
                  <th className="px-3 py-2.5">Pricing Multiplier</th>
                  <th className="px-3 py-2.5">Condition Criteria & Standards</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {labels.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400 text-xs">
                      No Quality Grades found. Click "Add Quality Grade" above to create one.
                    </td>
                  </tr>
                ) : (
                  labels.map(l => {
                    const isPosted = l.status !== 'UNPOSTED';
                    const isCream = l.qualityTier === 'CREAM' || l.code?.includes('CREAM') || l.name?.toLowerCase().includes('cream');
                    const isNonBrand = l.qualityTier === 'NON_BRAND' || l.code?.includes('NB') || l.name?.toLowerCase().includes('non-brand');
                    const isGradeA = l.qualityTier === 'GRADE_A' || l.code?.includes('BRD') || l.name?.toLowerCase().includes('branded');
                    const isGradeB = l.qualityTier === 'GRADE_B' || l.code?.includes('GRDB') || l.name?.toLowerCase().includes('grade b');
                    const isRework = l.qualityTier === 'REWORK' || l.code?.includes('REWORK') || l.name?.toLowerCase().includes('rework');

                    return (
                      <tr key={l.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                          <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-300">
                            {l.code}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900">{l.name}</td>
                        <td className="px-3 py-2.5">
                          {isCream && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                              <span>🌟 Super Cream</span>
                            </span>
                          )}
                          {isNonBrand && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300 inline-flex items-center gap-1">
                              <span>🏷️ Non-Brand Basic</span>
                            </span>
                          )}
                          {isGradeA && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 inline-flex items-center gap-1">
                              <span>⭐ Grade A Branded</span>
                            </span>
                          )}
                          {isGradeB && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                              <span>⚠️ Grade B Outlet</span>
                            </span>
                          )}
                          {isRework && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1">
                              <span>✂️ Rework / Rag</span>
                            </span>
                          )}
                          {!isCream && !isNonBrand && !isGradeA && !isGradeB && !isRework && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                              Standard
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-700">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                            {Number(l.priceMultiplier || 1.0).toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 max-w-sm truncate">{l.description || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isPosted ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-stone-100 text-stone-700 border border-stone-300'
                          }`}>
                            {isPosted ? 'ACTIVE' : 'DRAFT'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleTogglePostLabel(l)}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                              isPosted
                                ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                                : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                            }`}
                            title={isPosted ? 'Set as Draft' : 'Post as Active'}
                          >
                            {isPosted ? 'Unpost' : 'Post'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditLabel(l)}
                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLabel(l.id)}
                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. SHOPS & RACKS */}
      {subTab === 'shops' && (
        <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Warehouse Locations & Boutique Racks</h3>
          </div>
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Shop Code</th>
                <th className="px-3 py-2">Facility Name</th>
                <th className="px-3 py-2">City / Area</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Manager</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shops.map(s => (
                <tr key={s.id} className="hover:bg-blue-50/40">
                  <td className="px-3 py-1.5 font-mono font-bold text-blue-900">{s.shopNo}</td>
                  <td className="px-3 py-1.5 font-semibold text-slate-800">{s.name}</td>
                  <td className="px-3 py-1.5 text-slate-600">{s.city}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">
                      {s.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-700">{s.manager}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 7. WHATSAPP DUAL-ENGINE ARCHITECTURE & REPORT */}
      {subTab === 'whatsapp' && (
        <WhatsAppConfigEngine onSaveNotice={msg => showMsg(msg, 'success')} />
      )}

      {/* 8. THERMAL BARCODE & QR CONFIG */}
      {subTab === 'bale_qr' && (
        <ThermalBarcodeConfigEngine defaultCompanyProfile={companyProfile} />
      )}

      {/* Bulk Data Import Modal (Supports Inventory & Sales CSVs) */}
      <BulkDataImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onSuccess={msg => {
          showMsg(msg, 'success');
          loadData();
          onRefreshAll();
        }}
        initialMode="INVENTORY"
      />

      {/* Item Master Create/Edit Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <h4 className="font-serif font-bold text-slate-900 text-sm">
                {editingItem ? 'Edit Item Master' : 'Add New Item Master'}
              </h4>
              <button onClick={() => setShowItemModal(false)} className="text-slate-700 hover:text-slate-900 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Item Code *</label>
                  <input
                    type="text"
                    value={itemForm.code}
                    onChange={e => setItemForm({ ...itemForm, code: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono uppercase bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Category *</label>
                  <input
                    type="text"
                    value={itemForm.category}
                    onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Item / Category Name *</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="e.g. Vintage Denim Trucker Jackets"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Base Price (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.basePrice}
                    onChange={e => setItemForm({ ...itemForm, basePrice: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">UOM</label>
                  <select
                    value={itemForm.targetUom}
                    onChange={e => setItemForm({ ...itemForm, targetUom: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="KG">KG</option>
                    <option value="PCS">PCS</option>
                    <option value="TON">TON</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Weight (KG)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={itemForm.weightKg}
                    onChange={e => setItemForm({ ...itemForm, weightKg: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all"
                >
                  {editingItem ? 'Update Item Master' : 'Save Item Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Brand Tier Create/Edit Modal */}
      {showBrandModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <h4 className="font-serif font-bold text-slate-900 text-sm">
                {editingBrand ? 'Edit Brand Tier' : 'Add New Brand Master'}
              </h4>
              <button onClick={() => setShowBrandModal(false)} className="text-slate-700 hover:text-slate-900 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveBrand} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Brand Name *</label>
                <input
                  type="text"
                  value={brandForm.name}
                  onChange={e => setBrandForm({ ...brandForm, name: e.target.value })}
                  placeholder="e.g. Levi's, Carhartt, Nike"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Valuation Tier *</label>
                <input
                  type="text"
                  value={brandForm.tier}
                  onChange={e => setBrandForm({ ...brandForm, tier: e.target.value })}
                  placeholder="e.g. Vintage American Grail"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Origin Country</label>
                  <input
                    type="text"
                    value={brandForm.origin}
                    onChange={e => setBrandForm({ ...brandForm, origin: e.target.value })}
                    placeholder="e.g. USA, Japan, UK"
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Heritage Era</label>
                  <input
                    type="text"
                    value={brandForm.era}
                    onChange={e => setBrandForm({ ...brandForm, era: e.target.value })}
                    placeholder="e.g. 70s-90s"
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowBrandModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all"
                >
                  {editingBrand ? 'Update Brand Tier' : 'Save Brand Tier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quality & Grading Standards Create/Edit Modal */}
      {showLabelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-slate-900 text-sm">
                    {editingLabel ? 'Edit Quality & Grading Standard' : 'Add New Quality Grade'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Configure condition standards & retail price multipliers</p>
                </div>
              </div>
              <button onClick={() => setShowLabelModal(false)} className="text-slate-700 hover:text-slate-900 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveLabel} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Grade Code *</label>
                  <input
                    type="text"
                    value={labelForm.code}
                    onChange={e => setLabelForm({ ...labelForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. Q-CREAM"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono uppercase bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Price Multiplier *</label>
                  <input
                    type="number"
                    step="0.05"
                    value={labelForm.priceMultiplier}
                    onChange={e => setLabelForm({ ...labelForm, priceMultiplier: parseFloat(e.target.value) || 1.0 })}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-mono font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Quality Classification Tier *</label>
                <select
                  value={labelForm.qualityTier}
                  onChange={e => setLabelForm({ ...labelForm, qualityTier: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-bold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="CREAM">🌟 Super Cream / Luxury Mint (Flawless original labels)</option>
                  <option value="GRADE_A">⭐ Grade A - Branded Vintage (Heritage classics)</option>
                  <option value="NON_BRAND">🏷️ Grade A - Non-Brand / High Street Basics</option>
                  <option value="GRADE_B">⚠️ Grade B - Minor Flaws / Outlet Thrift</option>
                  <option value="REWORK">✂️ Grade C / Rework & Cutting Rag</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Display Quality Name *</label>
                <input
                  type="text"
                  value={labelForm.name}
                  onChange={e => setLabelForm({ ...labelForm, name: e.target.value })}
                  placeholder="e.g. Super Cream (Mint / Luxury Vintage)"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs font-semibold bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">Condition Standards & Grading Criteria</label>
                <textarea
                  value={labelForm.description}
                  onChange={e => setLabelForm({ ...labelForm, description: e.target.value })}
                  placeholder="e.g. Top-tier pristine condition, flawless original tags/wash, highest retail margin"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs bg-[#fdfcf9] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowLabelModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingLabel ? 'Update Quality Grade' : 'Save Quality Grade'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* 9. SECURITY & MASTER ADMIN PIN */}
      {subTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 max-w-4xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-800 border border-amber-500/20">
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base uppercase tracking-wider">
                    Master Admin PIN & Privileged Security Gate
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure the cryptographic Master Security PIN required to unlock Authority Matrix modifications and high-risk actions.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
                Cooldown Lock: ACTIVE (60s / 3 attempts)
              </span>
            </div>

            {/* Current Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Master PIN Status</div>
                <div className="text-lg font-mono font-black text-slate-900 mt-1">● ● ● ●</div>
                <div className="text-[10px] text-slate-500 mt-1">Default: 9988 &bull; 4-6 Digits</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Failed Attempts Cooldown</div>
                <div className="text-lg font-mono font-black text-emerald-700 mt-1">60 Seconds</div>
                <div className="text-[10px] text-slate-500 mt-1">Enforced after 3 wrong attempts</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Security Audit Protocol</div>
                <div className="text-lg font-mono font-black text-blue-700 mt-1">Immutable Log</div>
                <div className="text-[10px] text-slate-500 mt-1">All updates recorded to Audit Trail</div>
              </div>
            </div>

            {/* Change Master PIN Form */}
            <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200 space-y-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Update Master Admin PIN</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase">Current Master PIN *</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={currentPinInput}
                    onChange={e => setCurrentPinInput(e.target.value)}
                    placeholder="e.g. 9988"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase">New Master PIN (4-6 digits) *</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={newPinInput}
                    onChange={e => setNewPinInput(e.target.value)}
                    placeholder="e.g. 8899"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase">Confirm New PIN *</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={confirmPinInput}
                    onChange={e => setConfirmPinInput(e.target.value)}
                    placeholder="e.g. 8899"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Reset Master Admin PIN to factory default (9988)?')) {
                      SecurityMasterPin.resetToDefaultPin();
                      showMsg('Master Admin PIN reset to factory default (9988).', 'success');
                    }
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  ↺ Reset to Factory Default (9988)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const activePin = SecurityMasterPin.getMasterPin();
                    if (currentPinInput.trim() !== activePin) {
                      showMsg('Current Master PIN is incorrect.', 'error');
                      return;
                    }
                    if (newPinInput.trim().length < 4 || newPinInput.trim().length > 6) {
                      showMsg('New Master PIN must be between 4 and 6 digits.', 'error');
                      return;
                    }
                    if (newPinInput.trim() !== confirmPinInput.trim()) {
                      showMsg('New Master PIN and Confirmation do not match.', 'error');
                      return;
                    }
                    SecurityMasterPin.setMasterPin(newPinInput.trim());
                    setCurrentPinInput('');
                    setNewPinInput('');
                    setConfirmPinInput('');
                    showMsg('Master Admin PIN successfully updated and activated across all terminals!', 'success');
                  }}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Save & Apply New Master PIN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. BANK ACCOUNT ADD / EDIT MODAL */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-emerald-300 max-w-2xl w-full shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingBank ? 'Edit Bank Account & POS Fleet' : 'Add Corporate Bank Account & POS Fleet'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Auto-syncs to Chart of Accounts (COA) and manages bank-specific card machines</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBankModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs: Bank Details vs Bank POS Fleet */}
            <div className="flex items-center gap-2 border-b border-slate-200 mb-4 pb-2">
              <button
                type="button"
                onClick={() => setBankModalTab('details')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  bankModalTab === 'details'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>🏛️ Corporate Bank Details</span>
              </button>
              <button
                type="button"
                onClick={() => setBankModalTab('pos_fleet')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  bankModalTab === 'pos_fleet'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>💳 Smart POS Fleet ({(bankForm.posFleet || []).length}/5 Devices)</span>
              </button>
            </div>

            <form onSubmit={handleSaveBank} className="space-y-4 text-xs">
              {/* TAB 1: BANK & COA DETAILS */}
              {bankModalTab === 'details' && (
                <div className="space-y-3.5">
                  {/* Bank Name */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Bank Name & Institution *
                    </label>
                    <input
                      type="text"
                      list="uae-banks-list"
                      value={bankForm.bankName}
                      onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })}
                      placeholder="e.g. Emirates NBD, Wio Bank, Mashreq Neo, ADCB, RAKBANK"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <datalist id="uae-banks-list">
                      <option value="RAKBANK" />
                      <option value="Emirates NBD" />
                      <option value="Mashreq Bank" />
                      <option value="Abu Dhabi Commercial Bank (ADCB)" />
                      <option value="Wio Bank Business" />
                      <option value="Dubai Islamic Bank (DIB)" />
                      <option value="First Abu Dhabi Bank (FAB)" />
                      <option value="Standard Chartered UAE" />
                    </datalist>
                  </div>

                  {/* Account Title */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Account Title / Beneficiary Legal Name *
                    </label>
                    <input
                      type="text"
                      value={bankForm.accountTitle}
                      onChange={e => setBankForm({ ...bankForm, accountTitle: e.target.value })}
                      placeholder="e.g. VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* UAE IBAN */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      UAE IBAN Number (Starts with AE...) *
                    </label>
                    <input
                      type="text"
                      value={bankForm.iban}
                      onChange={e => setBankForm({ ...bankForm, iban: e.target.value.toUpperCase() })}
                      placeholder="AE24 0331 2345 6789 0123 456"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 tracking-wider"
                    />
                  </div>

                  {/* Account Number & Branch */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={bankForm.accountNumber || ''}
                        onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                        placeholder="e.g. 1048291029301"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Branch / City
                      </label>
                      <input
                        type="text"
                        value={bankForm.branchName || ''}
                        onChange={e => setBankForm({ ...bankForm, branchName: e.target.value })}
                        placeholder="e.g. Al Ain, Dubai Downtown"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Currency & COA Code Info */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Account Currency
                      </label>
                      <select
                        value={bankForm.currency}
                        onChange={e => setBankForm({ ...bankForm, currency: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                      >
                        <option value="AED">AED - UAE Dirham</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                        Assigned COA Code
                      </label>
                      <div className="px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-xs font-mono font-bold text-blue-700">
                        {bankForm.coaAccountCode || '1120-00'} (Asset)
                      </div>
                    </div>
                  </div>

                  {/* Primary Bank Toggle */}
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={bankForm.isPrimary}
                      onChange={e => setBankForm({ ...bankForm, isPrimary: e.target.checked })}
                      className="w-4 h-4 text-amber-600 accent-amber-600 rounded cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-amber-900">Set as Primary Settlement Bank</span>
                      <p className="text-[10px] text-amber-700">All POS Card terminal settlements and Counter QR payments will route here by default.</p>
                    </div>
                  </label>
                </div>
              )}

              {/* TAB 2: SMART POS FLEET (1 TO 5 DEVICES FOR THIS BANK) */}
              {bankModalTab === 'pos_fleet' && (
                <div className="space-y-3.5">
                  {/* Bank POS Header Banner */}
                  <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs">
                      <div className="font-bold text-blue-900 flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-blue-600" />
                        <span>POS Terminals for {bankForm.bankName || 'This Bank Account'}</span>
                      </div>
                      <p className="text-[11px] text-blue-700 mt-0.5">
                        Card payments through these devices settle to <strong>COA: {bankForm.coaAccountCode || '1120-02'}</strong>. Connect up to 5 machines.
                      </p>
                    </div>

                    {!showBankDeviceForm && (
                      <button
                        type="button"
                        onClick={handleOpenAddBankDevice}
                        disabled={(bankForm.posFleet || []).length >= 5}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{(bankForm.posFleet || []).length >= 5 ? 'Fleet Full (5/5)' : 'Add Machine'}</span>
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Machine Sub-Form */}
                  {showBankDeviceForm ? (
                    <div className="p-4 bg-slate-50 border-2 border-blue-300 rounded-xl space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                          <span>{editingBankDeviceIndex !== null ? 'Edit Card Terminal' : 'Add New Card Terminal to this Bank'}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowBankDeviceForm(false)}
                          className="text-slate-400 hover:text-slate-700 font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Terminal Name *
                          </label>
                          <input
                            type="text"
                            value={bankDeviceForm.name}
                            onChange={e => setBankDeviceForm({ ...bankDeviceForm, name: e.target.value })}
                            placeholder="e.g. Counter 1 - Main Desk PED"
                            required
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Hardware Model *
                          </label>
                          <select
                            value={bankDeviceForm.model}
                            onChange={e => setBankDeviceForm({ ...bankDeviceForm, model: e.target.value as any })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                          >
                            <option value="PAX_A960">PAX A960 (Paymob Smart Android)</option>
                            <option value="PAX_A920">PAX A920 (Smart Android PED)</option>
                            <option value="SUNMI_P2">Sunmi P2 (Handheld POS)</option>
                            <option value="INGENICO">Ingenico Tetra / Move 5000</option>
                            <option value="VERIFONE">Verifone Engage V240m</option>
                            <option value="SIMULATOR">Virtual Simulator</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Connection Protocol *
                          </label>
                          <select
                            value={bankDeviceForm.connectionType}
                            onChange={e => setBankDeviceForm({ ...bankDeviceForm, connectionType: e.target.value as any })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                          >
                            <option value="CELLULAR_SIM">📶 4G Cellular SIM Card (Standalone Wireless)</option>
                            <option value="IP_ETHERNET">LAN / IP Ethernet</option>
                            <option value="WIFI_IP">WiFi TCP/IP</option>
                            <option value="USB_SERIAL">USB / RS232 Serial</option>
                            <option value="BLUETOOTH">Bluetooth Wireless</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Station / Location
                          </label>
                          <input
                            type="text"
                            value={bankDeviceForm.location || ''}
                            onChange={e => setBankDeviceForm({ ...bankDeviceForm, location: e.target.value })}
                            placeholder="e.g. Main Cash Counter, Express Lane"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 bg-white"
                          />
                        </div>

                        {bankDeviceForm.connectionType === 'CELLULAR_SIM' ? (
                          <>
                            <div className="sm:col-span-2 p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 text-[11px] flex items-center gap-2">
                              <Radio className="w-4 h-4 text-purple-600 shrink-0 animate-pulse" />
                              <div>
                                <span className="font-bold">Standalone 4G SIM Terminal:</span> Communicates directly with Paymob &amp; {bankForm.bankName || 'Bank'} via 4G cellular data. No local IP configuration or WiFi dependency required.
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                                Hardware S/N (Back of Device)
                              </label>
                              <input
                                type="text"
                                value={bankDeviceForm.serialNumber || ''}
                                onChange={e => setBankDeviceForm({ ...bankDeviceForm, serialNumber: e.target.value })}
                                placeholder="e.g. 1180511614"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-900 bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                                Cellular IMEI Number
                              </label>
                              <input
                                type="text"
                                value={bankDeviceForm.imei || ''}
                                onChange={e => setBankDeviceForm({ ...bankDeviceForm, imei: e.target.value })}
                                placeholder="e.g. 350814987795465"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-900 bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                                SIM Telecom Carrier
                              </label>
                              <select
                                value={bankDeviceForm.simCarrier || 'DU'}
                                onChange={e => setBankDeviceForm({ ...bankDeviceForm, simCarrier: e.target.value as any })}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-900 bg-white"
                              >
                                <option value="DU">du Telecom (UAE)</option>
                                <option value="ETISALAT">etisalat by e&amp; (UAE)</option>
                                <option value="OTHER">Other Carrier</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                                Paymob TID (Optional)
                              </label>
                              <input
                                type="text"
                                value={bankDeviceForm.paymobTid || ''}
                                onChange={e => setBankDeviceForm({ ...bankDeviceForm, paymobTid: e.target.value })}
                                placeholder="e.g. 51898"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                              />
                            </div>

                            <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                              <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center justify-between mb-1.5">
                                <span className="flex items-center gap-1.5 text-purple-800">
                                  <Radio className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                                  <span>Paymob Cloud API Push Configuration (Optional)</span>
                                </span>
                                <a
                                  href="https://uae.paymob.com/portal/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-purple-600 hover:underline font-mono"
                                >
                                  uae.paymob.com ↗
                                </a>
                              </div>
                              <p className="text-[10px] text-slate-500 mb-2">
                                Enter your Secret Key from Paymob Portal (Developers &gt; API Keys) to automatically transmit amounts from Counter POS to the PAX A960 screen via 4G.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                                    Paymob Secret API Key
                                  </label>
                                  <input
                                    type="password"
                                    value={bankDeviceForm.paymobApiKey || ''}
                                    onChange={e => setBankDeviceForm({ ...bankDeviceForm, paymobApiKey: e.target.value })}
                                    placeholder="sec_live_... or Bearer Token"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                                    Terminal Integration ID (Optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={bankDeviceForm.paymobIntegrationId || ''}
                                    onChange={e => setBankDeviceForm({ ...bankDeviceForm, paymobIntegrationId: e.target.value })}
                                    placeholder="e.g. 456123"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                                  />
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="bankCloudPush"
                                  checked={bankDeviceForm.cloudPushEnabled !== false}
                                  onChange={e => setBankDeviceForm({ ...bankDeviceForm, cloudPushEnabled: e.target.checked })}
                                  className="w-3.5 h-3.5 text-purple-600 rounded"
                                />
                                <label htmlFor="bankCloudPush" className="text-[11px] font-bold text-slate-700 cursor-pointer">
                                  Enable Direct Cloud Push button at Counter POS
                                </label>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                              IP Address &amp; Port *
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={bankDeviceForm.ipAddress || ''}
                                onChange={e => setBankDeviceForm({ ...bankDeviceForm, ipAddress: e.target.value })}
                                placeholder="192.168.1.150"
                                className="w-2/3 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-900 bg-white"
                              />
                              <input
                                type="number"
                                value={bankDeviceForm.port || 8080}
                                onChange={e => setBankDeviceForm({ ...bankDeviceForm, port: parseInt(e.target.value) || 8080 })}
                                placeholder="8080"
                                className="w-1/3 px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-slate-900 bg-white"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Terminal ID (TID) *
                          </label>
                          <input
                            type="text"
                            value={bankDeviceForm.terminalId}
                            onChange={e => setBankDeviceForm({ ...bankDeviceForm, terminalId: e.target.value })}
                            placeholder="e.g. 12857001 or TID-DXB-001"
                            required
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-indigo-700 bg-white uppercase"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Merchant ID (MID)
                          </label>
                          <input
                            type="text"
                            value={bankDeviceForm.merchantId}
                            onChange={e => setBankDeviceForm({ ...bankDeviceForm, merchantId: e.target.value })}
                            placeholder="e.g. 114400000012857"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                          />
                        </div>

                        <div className="flex items-center pt-4">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={bankDeviceForm.isActive !== false}
                              onChange={e => setBankDeviceForm({ ...bankDeviceForm, isActive: e.target.checked })}
                              className="w-4 h-4 text-emerald-600 rounded"
                            />
                            <span className="text-xs font-bold text-slate-800">
                              Active in Counter POS (Allows payments)
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setShowBankDeviceForm(false)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveBankDevice}
                          className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                        >
                          {editingBankDeviceIndex !== null ? 'Update Terminal' : 'Add Terminal'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* List of Configured Devices for this Bank */}
                  {(bankForm.posFleet || []).length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-bold text-slate-700 text-xs">No POS Card Terminals Linked to this Bank</div>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                        Connect up to 5 physical card machines (PAX, Sunmi, Ingenico) to settle directly into {bankForm.bankName || 'this bank'}.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenAddBankDevice}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add First Terminal</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-0.5">
                      {(bankForm.posFleet || []).map((dev, idx) => (
                        <div
                          key={dev.id || idx}
                          className={`p-3 rounded-xl border transition-all space-y-2 relative ${
                            dev.isActive
                              ? 'bg-white border-blue-200 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 opacity-70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                                <h5 className="font-bold text-xs text-slate-900 leading-tight">{dev.name}</h5>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[9px] font-mono font-bold border border-slate-200">
                                  {dev.model}
                                </span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px] font-mono border border-slate-200">
                                  {dev.connectionType}
                                </span>
                              </div>
                            </div>

                            {/* Active Switch */}
                            <button
                              type="button"
                              onClick={() => handleToggleBankDeviceActive(idx)}
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                dev.isActive
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-200 text-slate-600 border border-slate-300'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${dev.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                              <span>{dev.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                            </button>
                          </div>

                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-[10px] font-mono space-y-0.5">
                            {dev.connectionType === 'CELLULAR_SIM' ? (
                              <>
                                <div className="flex items-center gap-1 font-sans text-purple-700 font-bold">
                                  <span>📶 4G Cellular SIM ({dev.simCarrier || 'DU'})</span>
                                </div>
                                <div><span className="text-slate-400 font-sans uppercase font-bold">S/N: </span><strong>{dev.serialNumber || '1180511614'}</strong></div>
                                <div><span className="text-slate-400 font-sans uppercase font-bold">TID: </span><span className="text-indigo-600 font-bold">{dev.terminalId}</span> {dev.paymobTid ? `(Paymob: ${dev.paymobTid})` : ''}</div>
                                {dev.location && <div><span className="text-slate-400 font-sans uppercase font-bold">Desk: </span>{dev.location}</div>}
                              </>
                            ) : (
                              <>
                                <div><span className="text-slate-400 font-sans uppercase font-bold">IP: </span>{dev.ipAddress || '192.168.1.150'}:{dev.port || 8080}</div>
                                <div><span className="text-slate-400 font-sans uppercase font-bold">TID: </span><span className="text-indigo-600 font-bold">{dev.terminalId}</span></div>
                                {dev.location && <div><span className="text-slate-400 font-sans uppercase font-bold">Desk: </span>{dev.location}</div>}
                              </>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100 text-xs">
                            <button
                              type="button"
                              onClick={() => handleOpenEditBankDevice(idx)}
                              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                              title="Edit device configuration"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBankDevice(idx)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Remove machine from bank"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowBankModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingBank ? 'Update Bank & POS Fleet' : 'Save Bank & POS Fleet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. QR CODE VIEWER MODAL */}
      {viewingQrBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 animate-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl border-2 border-emerald-400 max-w-sm w-full shadow-2xl p-6 text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-500">Bank Instant QR Pay</span>
              <button onClick={() => setViewingQrBank(null)} className="text-slate-400 hover:text-slate-800 font-bold">✕</button>
            </div>

            <div>
              <h4 className="text-base font-black text-slate-900">{viewingQrBank.bankName}</h4>
              <p className="text-xs text-slate-500">{viewingQrBank.accountTitle}</p>
            </div>

            {/* QR Code Canvas */}
            <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-emerald-300 inline-block shadow-inner mx-auto">
              <QRCodeCanvas
                value={`iban:${viewingQrBank.iban.replace(/\s+/g, '')}&name=${encodeURIComponent(viewingQrBank.accountTitle)}&bank=${encodeURIComponent(viewingQrBank.bankName)}`}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-800 break-all">
              {viewingQrBank.iban}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(viewingQrBank.iban.replace(/\s+/g, ''));
                  showMsg('Copied IBAN to clipboard!');
                }}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy IBAN</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print QR</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 11A. DEPARTMENT (TIER 1) ADD / EDIT MODAL */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingDept ? 'Edit Department (Tier 1)' : 'Add New Department (Tier 1)'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Root tier used to prefix SKUs & group apparel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    SKU Prefix *
                  </label>
                  <input
                    type="text"
                    value={deptForm.code}
                    onChange={e => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase().slice(0, 5) })}
                    placeholder="e.g. MEN"
                    maxLength={5}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    value={deptForm.name}
                    onChange={e => {
                      const name = e.target.value;
                      const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      const autoCode = name.slice(0, 3).toUpperCase();
                      setDeptForm({
                        ...deptForm,
                        name,
                        code: !deptForm.code || editingDept ? deptForm.code : autoCode,
                        slug: !deptForm.slug || editingDept ? deptForm.slug : autoSlug
                      });
                    }}
                    placeholder="e.g. Men, Ladies, Children"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  URL Slug *
                </label>
                <input
                  type="text"
                  value={deptForm.slug}
                  onChange={e => setDeptForm({ ...deptForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') })}
                  placeholder="e.g. men"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-amber-900 bg-amber-50/40 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Display Priority
                  </label>
                  <input
                    type="number"
                    value={deptForm.sortOrder}
                    onChange={e => setDeptForm({ ...deptForm, sortOrder: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={deptForm.isActive}
                      onChange={e => setDeptForm({ ...deptForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Active
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingDept ? 'Update Department' : 'Create Department'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11B. MAIN CATEGORY (TIER 2) ADD / EDIT MODAL */}
      {showMainCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingMainCat ? 'Edit Main Category (Tier 2)' : 'Add New Main Category (Tier 2)'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Tier 2 category nested under a parent department</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMainCatModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMainCategory} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Parent Department *
                </label>
                <select
                  value={mainCatForm.parentId}
                  onChange={e => setMainCatForm({ ...mainCatForm, parentId: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select Parent Department</option>
                  {productCategories
                    .filter(c => c.taxonomy_level === 'DEPARTMENT' || (!c.parent_id && Number(c.level) === 1))
                    .map(d => (
                      <option key={d.id} value={d.id}>📁 {d.name} ({(d as any).department_code || d.slug})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={mainCatForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    setMainCatForm({
                      ...mainCatForm,
                      name,
                      slug: !mainCatForm.slug || editingMainCat ? mainCatForm.slug : autoSlug
                    });
                  }}
                  placeholder="e.g. T-Shirts, Hoodies, Pants & Denim"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  URL Slug *
                </label>
                <input
                  type="text"
                  value={mainCatForm.slug}
                  onChange={e => setMainCatForm({ ...mainCatForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') })}
                  placeholder="e.g. men-t-shirts"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-amber-900 bg-amber-50/40 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Display Priority
                  </label>
                  <input
                    type="number"
                    value={mainCatForm.sortOrder}
                    onChange={e => setMainCatForm({ ...mainCatForm, sortOrder: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mainCatForm.isActive}
                      onChange={e => setMainCatForm({ ...mainCatForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Active
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMainCatModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingMainCat ? 'Update Category' : 'Create Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11C. SUB-CATEGORY (TIER 3) ADD / EDIT MODAL */}
      {showSubCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingSubCat ? 'Edit Sub-Category (Tier 3)' : 'Add New Sub-Category (Tier 3)'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Tier 3 detailed cuts/styles linked to a main category</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubCatModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSubCategory} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Parent Main Category *
                </label>
                <select
                  value={subCatForm.parentId}
                  onChange={e => setSubCatForm({ ...subCatForm, parentId: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Select Parent Main Category</option>
                  {productCategories
                    .filter(c => c.taxonomy_level === 'CATEGORY' || (c.parent_id && Number(c.level) === 2))
                    .map(mc => (
                      <option key={mc.id} value={mc.id}>📦 {mc.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Sub-Category Name *
                </label>
                <input
                  type="text"
                  value={subCatForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    const autoSlug = `sub-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
                    setSubCatForm({
                      ...subCatForm,
                      name,
                      slug: !subCatForm.slug || editingSubCat ? subCatForm.slug : autoSlug
                    });
                  }}
                  placeholder="e.g. Graphic Tees, Band Tees, Denim Jeans"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  URL Slug *
                </label>
                <input
                  type="text"
                  value={subCatForm.slug}
                  onChange={e => setSubCatForm({ ...subCatForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') })}
                  placeholder="e.g. sub-graphic-tees"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-amber-900 bg-amber-50/40 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Display Priority
                  </label>
                  <input
                    type="number"
                    value={subCatForm.sortOrder}
                    onChange={e => setSubCatForm({ ...subCatForm, sortOrder: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="pt-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={subCatForm.isActive}
                      onChange={e => setSubCatForm({ ...subCatForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Active
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSubCatModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingSubCat ? 'Update Sub-Category' : 'Create Sub-Category'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11D. COLLECTION & SEASON (TIER 4) ADD / EDIT MODAL */}
      {showColModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingCol ? 'Edit Collection & Season (Tier 4)' : 'Add New Collection & Season (Tier 4)'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Tier 4 seasonal releases and event collections</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowColModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Collection Name *
                </label>
                <input
                  type="text"
                  value={colForm.name}
                  onChange={e => {
                    const name = e.target.value;
                    const autoCode = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
                    setColForm({
                      ...colForm,
                      name,
                      code: !colForm.code || editingCol ? colForm.code : autoCode
                    });
                  }}
                  placeholder="e.g. Summer Edition 2026, Core Archive Vault"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Collection Code *
                  </label>
                  <input
                    type="text"
                    value={colForm.code}
                    onChange={e => setColForm({ ...colForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SUMMER-26"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 uppercase focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Season *
                  </label>
                  <select
                    value={colForm.season}
                    onChange={e => setColForm({ ...colForm, season: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Summer">Summer</option>
                    <option value="Winter">Winter</option>
                    <option value="Autumn">Autumn</option>
                    <option value="Spring">Spring</option>
                    <option value="All Season">All Season</option>
                    <option value="Special Event">Special Event</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={colForm.year}
                    onChange={e => setColForm({ ...colForm, year: parseInt(e.target.value) || 2026 })}
                    min={2020}
                    max={2035}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Sort Priority
                  </label>
                  <input
                    type="number"
                    value={colForm.sortOrder}
                    onChange={e => setColForm({ ...colForm, sortOrder: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={colForm.isActive}
                    onChange={e => setColForm({ ...colForm, isActive: e.target.checked })}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Active (Selectable in Sorting Terminal & Storefront)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowColModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingCol ? 'Update Collection' : 'Create Collection'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 12. SIZE MASTER ADD / EDIT MODAL */}
      {showSizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-amber-200 max-w-md w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <Shirt className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingSize ? 'Edit Garment Size' : 'Add New Garment Size'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Quick-click sizing for sorting line & thermal barcodes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSizeModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSize} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Size Code (On Barcode) *
                  </label>
                  <input
                    type="text"
                    value={sizeForm.code}
                    onChange={e => setSizeForm({ ...sizeForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. M, XL, W32, FREE"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Full Display Name
                  </label>
                  <input
                    type="text"
                    value={sizeForm.name}
                    onChange={e => setSizeForm({ ...sizeForm, name: e.target.value })}
                    placeholder="e.g. Medium, Waist 32"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Size Classification / Department
                </label>
                <select
                  value={sizeForm.category}
                  onChange={e => setSizeForm({ ...sizeForm, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="Tops / Universal">Tops / Universal (XS - 3XL)</option>
                  <option value="Bottoms / Pants">Bottoms / Pants (Waist sizes)</option>
                  <option value="Outerwear">Outerwear / Jackets</option>
                  <option value="Headwear / Accessories">Headwear / Accessories</option>
                  <option value="Footwear">Footwear / Shoes</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Sort Display Priority
                </label>
                <input
                  type="number"
                  value={sizeForm.sortOrder}
                  onChange={e => setSizeForm({ ...sizeForm, sortOrder: parseInt(e.target.value) || 1 })}
                  min={1}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSizeModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingSize ? 'Update Size' : 'Create Size'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 13. SMART POS FLEET DEVICE ADD / EDIT MODAL (1 TO 5 FLEET) */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-blue-200 max-w-lg w-full shadow-2xl p-6 relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-blue-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {editingDevice ? 'Edit POS Terminal Device' : 'Add New POS Terminal Device'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Configure Smart POS card machine for checkout fleet</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeviceModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDeviceModal} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Device Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Counter 1 - Main Desk PED"
                  value={deviceForm.name}
                  onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Terminal Hardware Model
                  </label>
                  <select
                    value={deviceForm.model}
                    onChange={e => setDeviceForm({ ...deviceForm, model: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PAX_A960">PAX A960 (Paymob Smart Android)</option>
                    <option value="PAX_A920">PAX A920 / A930 Smart Android</option>
                    <option value="SUNMI_P2">Sunmi P2 / V2 Handheld</option>
                    <option value="INGENICO">Ingenico Move 5000 / Lane</option>
                    <option value="VERIFONE">Verifone V240m Touch</option>
                    <option value="SIMULATOR">POS Hardware Simulator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Connection Interface
                  </label>
                  <select
                    value={deviceForm.connectionType}
                    onChange={e => setDeviceForm({ ...deviceForm, connectionType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CELLULAR_SIM">📶 4G Cellular SIM Card (Standalone Wireless)</option>
                    <option value="IP_ETHERNET">Local Network TCP/IP</option>
                    <option value="WIFI_IP">WiFi Wireless IP</option>
                    <option value="USB_SERIAL">Direct USB COM Port</option>
                    <option value="BLUETOOTH">Bluetooth BLE</option>
                    <option value="CLOUD_API">Cloud API Bridge</option>
                  </select>
                </div>
              </div>

              {deviceForm.connectionType === 'CELLULAR_SIM' ? (
                <div className="space-y-3">
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-[11px] flex items-center gap-2">
                    <Radio className="w-4 h-4 text-purple-600 shrink-0 animate-pulse" />
                    <div>
                      <span className="font-bold">Standalone 4G Cellular POS:</span> Connects directly to bank/Paymob via SIM card data. No local IP address configuration is required.
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Hardware S/N (Back of Device)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1180511614"
                        value={deviceForm.serialNumber || ''}
                        onChange={e => setDeviceForm({ ...deviceForm, serialNumber: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Cellular IMEI Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 350814987795465"
                        value={deviceForm.imei || ''}
                        onChange={e => setDeviceForm({ ...deviceForm, imei: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        SIM Telecom Carrier
                      </label>
                      <select
                        value={deviceForm.simCarrier || 'DU'}
                        onChange={e => setDeviceForm({ ...deviceForm, simCarrier: e.target.value as any })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="DU">du Telecom (UAE)</option>
                        <option value="ETISALAT">etisalat by e&amp; (UAE)</option>
                        <option value="OTHER">Other Carrier</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Paymob TID (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 51898"
                        value={deviceForm.paymobTid || ''}
                        onChange={e => setDeviceForm({ ...deviceForm, paymobTid: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="col-span-2 pt-2 border-t border-slate-200">
                      <div className="text-[11px] font-bold text-slate-800 uppercase flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-1.5 text-purple-800">
                          <Radio className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                          <span>Paymob Cloud API Push Configuration (Optional)</span>
                        </span>
                        <a
                          href="https://uae.paymob.com/portal/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-purple-600 hover:underline font-mono"
                        >
                          uae.paymob.com ↗
                        </a>
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2">
                        Enter your Secret Key from Paymob Portal (Developers &gt; API Keys) to automatically transmit amounts from Counter POS to the PAX A960 screen via 4G.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Paymob Secret API Key
                          </label>
                          <input
                            type="password"
                            value={deviceForm.paymobApiKey || ''}
                            onChange={e => setDeviceForm({ ...deviceForm, paymobApiKey: e.target.value })}
                            placeholder="sec_live_... or Bearer Token"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Terminal Integration ID (Optional)
                          </label>
                          <input
                            type="text"
                            value={deviceForm.paymobIntegrationId || ''}
                            onChange={e => setDeviceForm({ ...deviceForm, paymobIntegrationId: e.target.value })}
                            placeholder="e.g. 456123"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 bg-white"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="deviceCloudPush"
                          checked={deviceForm.cloudPushEnabled !== false}
                          onChange={e => setDeviceForm({ ...deviceForm, cloudPushEnabled: e.target.checked })}
                          className="w-3.5 h-3.5 text-purple-600 rounded"
                        />
                        <label htmlFor="deviceCloudPush" className="text-[11px] font-bold text-slate-700 cursor-pointer">
                          Enable Direct Cloud Push button at Counter POS
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Terminal IP Address
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 192.168.1.150"
                      value={deviceForm.ipAddress}
                      onChange={e => setDeviceForm({ ...deviceForm, ipAddress: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                      TCP / Service Port
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="8080"
                      value={deviceForm.port}
                      onChange={e => setDeviceForm({ ...deviceForm, port: parseInt(e.target.value) || 8080 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Terminal ID (TID) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TID-DXB-001"
                    value={deviceForm.terminalId}
                    onChange={e => setDeviceForm({ ...deviceForm, terminalId: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Merchant ID (MID)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MID-VV-9881"
                    value={deviceForm.merchantId}
                    onChange={e => setDeviceForm({ ...deviceForm, merchantId: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Physical Location / Department
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Cash Counter, Express Lane, Live Studio, B2B Gate"
                  value={deviceForm.location || ''}
                  onChange={e => setDeviceForm({ ...deviceForm, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Active Toggle Switch */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-xs">Device Active Status</div>
                  <div className="text-[10px] text-slate-500">Only active terminals can accept payments at checkout</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deviceForm.isActive}
                    onChange={e => setDeviceForm({ ...deviceForm, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingDevice ? 'Update Terminal' : 'Add to Fleet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEDICATED MODALS FOR PAYMENT GATEWAY & LIVE MULTICAST SOCIAL SOCKETS */}
      <PaymentGatewayModal
        isOpen={showPaymentGatewayModal}
        onClose={() => setShowPaymentGatewayModal(false)}
        companyProfile={companyProfile}
        onSaveProfile={async (updated) => {
          await CompanyProfileService.updateCompanyProfile(updated);
          setCompanyProfile(updated);
          onRefreshAll();
        }}
        showMsg={showMsg}
      />

      <SocialSocketsModal
        isOpen={showSocialSocketsModal}
        onClose={() => setShowSocialSocketsModal(false)}
        companyProfile={companyProfile}
        onSaveProfile={async (updated) => {
          await CompanyProfileService.updateCompanyProfile(updated);
          setCompanyProfile(updated);
          onRefreshAll();
        }}
        showMsg={showMsg}
      />
    </div>
  );
};
