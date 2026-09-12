import fs from 'fs';
import path from 'path';
import os from 'os';
import { DocumentStatus, ModuleType, ActionType, AccountClassification } from '../types/common.types.ts';
import { User, UserPermission } from '../modules/auth/auth.types.ts';
import { AuthEngine } from '../modules/auth/auth.engine.ts';
import { CompanyProfile, CurrencyItem, ItemMaster, LabelGrade, BrandMaster, ShopMaster, CategoryMaster, SizeMaster, DailySummaryData, LiveStreamMulticastConfig, LiveBoothStreamConfig } from '../modules/setup/setup.types.ts';
import { COAAccount, Voucher, VoucherLine, LedgerEntry, BudgetLimit, CustomReportTemplate, RecurringVoucherTemplate, ExecutedCustomReport } from '../modules/finance/finance.types.ts';
import { FinanceEngine } from '../modules/finance/finance.engine.ts';
import { Party, PartyKhataLog } from '../modules/parties/parties.types.ts';
import { PartiesEngine } from '../modules/parties/parties.engine.ts';
import { Employee, AttendanceRecord, PayrollRecord, EmployeeLoan } from '../modules/hr/hr.types.ts';
import { HREngine } from '../modules/hr/hr.engine.ts';
import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem, InventoryFilterOptions } from '../modules/purchase/purchase.types.ts';
import { PurchaseEngine } from '../modules/purchase/purchase.engine.ts';
import { SalesGatePass, SalesInvoice, SalesInvoiceItem, ParcelReturnRecord, ParcelReturnItem } from '../modules/sales/sales.types.ts';
import { SalesEngine } from '../modules/sales/sales.engine.ts';
import { AuditLogEntry, AuditFilterOptions } from '../modules/audit/audit.types.ts';
import { AuditEngine } from '../modules/audit/audit.engine.ts';
import { eventHub } from '../server/events.ts';
import { validateWithZod, VoucherInputSchema } from '../validation/schemas.ts';

class RelationalStore {
  // Tables
  private users: User[] = [];
  private companyProfile: CompanyProfile;
  private currencies: CurrencyItem[] = [];
  private itemMasters: ItemMaster[] = [];
  private labelGrades: LabelGrade[] = [];
  private brandMasters: BrandMaster[] = [];
  private shopMasters: ShopMaster[] = [];
  private categories: CategoryMaster[] = [];
  private sizes: SizeMaster[] = [];
  private coaAccounts: COAAccount[] = [];
  private vouchers: Voucher[] = [];
  private ledgers: LedgerEntry[] = [];
  private budgets: {
    id: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    periodMonth: string;
    budgetLimitAed: number;
    notes?: string;
    updatedAt: string;
  }[] = [];
  private customReportTemplates: CustomReportTemplate[] = [];
  private recurringVoucherTemplates: RecurringVoucherTemplate[] = [];
  private parties: Party[] = [];
  private partyKhataLogs: PartyKhataLog[] = [];
  private employees: Employee[] = [];
  private employeeLoans: EmployeeLoan[] = [];
  private attendances: AttendanceRecord[] = [];
  private payrolls: PayrollRecord[] = [];
  private purchaseInvoices: PurchaseInvoice[] = [];
  private inwardGatePasses: InwardGatePass[] = [];
  private inventoryPieces: PieceBreakdownItem[] = [];
  private salesGatePasses: SalesGatePass[] = [];
  private salesInvoices: SalesInvoice[] = [];
  private parcelReturns: ParcelReturnRecord[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private liveMulticastConfig: LiveStreamMulticastConfig;
  private liveBoothConfigs: LiveBoothStreamConfig[] = [];
  private dataFilePath = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? path.join(os.tmpdir(), 'erp_database.json')
    : path.join(process.cwd(), '.data', 'erp_database.json');

  constructor() {
    this.companyProfile = {
      companyName: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      addressLine1: 'Plot 42, Industrial Zone 3, Al Quoz',
      addressLine2: 'Dubai Wholesale Garments Hub, UAE',
      trnTaxNo: 'TRN-100482910300003',
      defaultCurrency: 'AED',
      logoUrl: '/vintage_vibes_seal.svg',
      phone: '+971 4 883 9120',
      email: 'contact@vintagevibe.ae',
      vatRatePercent: 5.0,
      globalStockAlertThreshold: 5,
      bankQrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBE%20LLC%26bank%3DEMIRATES%20NBD',
      bankIban: 'AE24 0331 2345 6789 0123 456',
      bankName: 'Emirates NBD - Dubai Business Bay Branch',
      bankAccountTitle: 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
      enableCod: true,
      enableBankTransfer: true,
      enableCardPay: true,
      freeShippingThresholdAed: 350,
      standardShippingFeeAed: 25,
      whatsappOrderNumber: ''
    };

    this.liveMulticastConfig = {
      provider: 'RESTREAM',
      enabled: true,
      accountEmail: 'live@vintagevibe.ae',
      accountPassword: '••••••••••••',
      apiKey: 'rst_live_key_904812_vintage_dubai',
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
      lastSyncedAt: new Date().toISOString()
    };

    this.liveBoothConfigs = [
      {
        boothId: 'booth-1',
        boothName: 'Booth 1: Vintage Denim & Outerwear',
        category: 'Vintage Denim',
        provider: 'RESTREAM',
        enabled: true,
        accountEmail: 'booth1@vintagevibe.ae',
        accountPassword: '••••••••••••',
        apiKey: 'rst_booth1_live_key',
        masterIngestRtmpUrl: 'rtmp://live.restream.io/live',
        masterStreamKey: 're_booth1_sec_99182_dxb',
        autoRelayToTikTok: true,
        autoRelayToInstagram: true,
        autoRelayToFacebook: true,
        autoRelayToYouTube: true,
        tikTokStreamKey: 'live_tt_booth1_denim_grail',
        instagramStreamKey: 'live_ig_booth1_denim_vintage',
        facebookStreamKey: 'FB-live-booth1-991',
        youTubeStreamKey: 'yt_booth1_live_1080',
        status: 'CONNECTED',
        lastSyncedAt: new Date().toISOString()
      },
      {
        boothId: 'booth-2',
        boothName: 'Booth 2: Cream Quality / Ladies Vintage',
        category: 'Cream Grade',
        provider: 'RESTREAM',
        enabled: true,
        accountEmail: 'booth2@vintagevibe.ae',
        accountPassword: '••••••••••••',
        apiKey: 'rst_booth2_live_key',
        masterIngestRtmpUrl: 'rtmp://live.restream.io/live',
        masterStreamKey: 're_booth2_sec_44819_dxb',
        autoRelayToTikTok: true,
        autoRelayToInstagram: true,
        autoRelayToFacebook: true,
        autoRelayToYouTube: true,
        tikTokStreamKey: 'live_tt_booth2_cream_dresses',
        instagramStreamKey: 'live_ig_booth2_cream_chic',
        facebookStreamKey: 'FB-live-booth2-882',
        youTubeStreamKey: 'yt_booth2_live_1080',
        status: 'CONNECTED',
        lastSyncedAt: new Date().toISOString()
      },
      {
        boothId: 'booth-3',
        boothName: 'Booth 3: Branded Tees & Sportswear',
        category: 'Brand Tiers',
        provider: 'RESTREAM',
        enabled: true,
        accountEmail: 'booth3@vintagevibe.ae',
        accountPassword: '••••••••••••',
        apiKey: 'rst_booth3_live_key',
        masterIngestRtmpUrl: 'rtmp://live.restream.io/live',
        masterStreamKey: 're_booth3_sec_77211_dxb',
        autoRelayToTikTok: true,
        autoRelayToInstagram: true,
        autoRelayToFacebook: true,
        autoRelayToYouTube: true,
        tikTokStreamKey: 'live_tt_booth3_nike_carhartt',
        instagramStreamKey: 'live_ig_booth3_sportswear',
        facebookStreamKey: 'FB-live-booth3-773',
        youTubeStreamKey: 'yt_booth3_live_1080',
        status: 'CONNECTED',
        lastSyncedAt: new Date().toISOString()
      },
      {
        boothId: 'booth-4',
        boothName: 'Booth 4: Winter Overcoats & Leather',
        category: 'Winter Overcoats',
        provider: 'RESTREAM',
        enabled: true,
        accountEmail: 'booth4@vintagevibe.ae',
        accountPassword: '••••••••••••',
        apiKey: 'rst_booth4_live_key',
        masterIngestRtmpUrl: 'rtmp://live.restream.io/live',
        masterStreamKey: 're_booth4_sec_33910_dxb',
        autoRelayToTikTok: true,
        autoRelayToInstagram: true,
        autoRelayToFacebook: true,
        autoRelayToYouTube: true,
        tikTokStreamKey: 'live_tt_booth4_italian_wool',
        instagramStreamKey: 'live_ig_booth4_coats_leather',
        facebookStreamKey: 'FB-live-booth4-664',
        youTubeStreamKey: 'yt_booth4_live_1080',
        status: 'CONNECTED',
        lastSyncedAt: new Date().toISOString()
      },
      {
        boothId: 'booth-5',
        boothName: 'Booth 5: Shoes & Vintage Accessories',
        category: 'Shoes & Accessories',
        provider: 'RESTREAM',
        enabled: true,
        accountEmail: 'booth5@vintagevibe.ae',
        accountPassword: '••••••••••••',
        apiKey: 'rst_booth5_live_key',
        masterIngestRtmpUrl: 'rtmp://live.restream.io/live',
        masterStreamKey: 're_booth5_sec_11892_dxb',
        autoRelayToTikTok: true,
        autoRelayToInstagram: true,
        autoRelayToFacebook: true,
        autoRelayToYouTube: true,
        tikTokStreamKey: 'live_tt_booth5_retro_kicks',
        instagramStreamKey: 'live_ig_booth5_boots_caps',
        facebookStreamKey: 'FB-live-booth5-555',
        youTubeStreamKey: 'yt_booth5_live_1080',
        status: 'CONNECTED',
        lastSyncedAt: new Date().toISOString()
      }
    ];

    const loaded = this.loadFromDisk();
    if (!loaded) {
      this.seedAll();
    }
    this.ensureCategoriesAndSizes();
    this.ensureQualityGrades();
    this.syncBankAndPOSToCOA();
    this.saveToDisk();
  }

  public saveToDisk(): boolean {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const dump = {
        companyProfile: this.companyProfile,
        currencies: this.currencies,
        users: this.users,
        itemMasters: this.itemMasters,
        labelGrades: this.labelGrades,
        brandMasters: this.brandMasters,
        shopMasters: this.shopMasters,
        categories: this.categories,
        sizes: this.sizes,
        coaAccounts: this.coaAccounts,
        vouchers: this.vouchers,
        ledgers: this.ledgers,
        budgets: this.budgets,
        customReportTemplates: this.customReportTemplates,
        recurringVoucherTemplates: this.recurringVoucherTemplates,
        parties: this.parties,
        partyKhataLogs: this.partyKhataLogs,
        employees: this.employees,
        employeeLoans: this.employeeLoans,
        attendances: this.attendances,
        payrolls: this.payrolls,
        purchaseInvoices: this.purchaseInvoices,
        inwardGatePasses: this.inwardGatePasses,
        inventoryPieces: this.inventoryPieces,
        salesGatePasses: this.salesGatePasses,
        salesInvoices: this.salesInvoices,
        parcelReturns: this.parcelReturns,
        auditLogs: this.auditLogs,
        liveMulticastConfig: this.liveMulticastConfig,
        liveBoothConfigs: this.liveBoothConfigs,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.dataFilePath, JSON.stringify(dump, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to persist database to disk:', e);
      return false;
    }
  }

  public loadFromDisk(): boolean {
    try {
      if (!fs.existsSync(this.dataFilePath)) {
        return false;
      }
      const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.coaAccounts) || data.coaAccounts.length === 0) {
        return false;
      }
      if (data.companyProfile) this.companyProfile = data.companyProfile;
      if (Array.isArray(data.currencies)) this.currencies = data.currencies;
      if (Array.isArray(data.users)) this.users = data.users;
      if (Array.isArray(data.itemMasters)) this.itemMasters = data.itemMasters;
      if (Array.isArray(data.labelGrades)) this.labelGrades = data.labelGrades;
      if (Array.isArray(data.brandMasters)) this.brandMasters = data.brandMasters;
      if (Array.isArray(data.shopMasters)) this.shopMasters = data.shopMasters;
      if (Array.isArray(data.categories)) this.categories = data.categories;
      if (Array.isArray(data.sizes)) this.sizes = data.sizes;
      if (Array.isArray(data.coaAccounts)) this.coaAccounts = data.coaAccounts;
      if (Array.isArray(data.vouchers)) this.vouchers = data.vouchers;
      if (Array.isArray(data.ledgers)) this.ledgers = data.ledgers;
      if (Array.isArray(data.budgets)) this.budgets = data.budgets;
      if (Array.isArray(data.customReportTemplates)) this.customReportTemplates = data.customReportTemplates;
      if (Array.isArray(data.recurringVoucherTemplates)) this.recurringVoucherTemplates = data.recurringVoucherTemplates;
      if (Array.isArray(data.parties)) {
        this.parties = data.parties.map((p: any) => {
          if (p.code === 'SUP-001' && p.currentBalance === 5250) {
            return { ...p, currentBalance: 0 };
          }
          return p;
        });
      }
      if (Array.isArray(data.partyKhataLogs)) {
        this.partyKhataLogs = data.partyKhataLogs.filter((p: any) => !p.docRef?.includes('DEL-PUR-TEST-001'));
      }
      if (Array.isArray(data.employees) && data.employees.length > 0) {
        this.employees = data.employees.map((e: any) => ({ ...e, isActive: e.isActive !== false }));
      }
      this.ensureDefaultEmployees();
      if (Array.isArray(data.employeeLoans)) this.employeeLoans = data.employeeLoans;
      if (Array.isArray(data.attendances)) this.attendances = data.attendances;
      if (Array.isArray(data.payrolls)) this.payrolls = data.payrolls;
      if (Array.isArray(data.purchaseInvoices)) this.purchaseInvoices = data.purchaseInvoices;
      if (Array.isArray(data.inwardGatePasses)) {
        this.inwardGatePasses = data.inwardGatePasses.map((igp: any) => {
          const totalBaleCost = Number(igp.totalBaleCost || 35000);
          const totalBaleWeight = Number(igp.totalBaleWeight || 250);
          const costPerGram = Number(igp.costPerGram || (totalBaleWeight > 0 ? (totalBaleCost / (totalBaleWeight * 1000)).toFixed(6) : 0.14));
          const brokenDownWeight = Number(igp.brokenDownWeight ?? 7.42);
          const remainingWeight = Number(igp.remainingWeight ?? (totalBaleWeight - brokenDownWeight));

          const normalizedPieces = (igp.pieces || []).map((p: any) => {
            const weightGrams = Number(p.weightGrams || (p.weightKg ? Math.round(p.weightKg * 1000) : 500));
            const pCostPerGram = Number(p.costPerGram || costPerGram);
            const calculatedCostPrice = Number(p.calculatedCostPrice || Number((weightGrams * pCostPerGram).toFixed(2)));
            return {
              ...p,
              weightGrams,
              costPerGram: pCostPerGram,
              calculatedCostPrice,
              costPrice: Number(p.costPrice || calculatedCostPrice)
            };
          });

          return {
            ...igp,
            baleCode: igp.baleCode || 'VV-BAL-001',
            baleCategory: igp.baleCategory || '90s Vintage Denim & American Knitwear',
            totalBaleCost,
            totalBaleWeight,
            costPerGram,
            brokenDownWeight,
            remainingWeight,
            pieceCount: normalizedPieces.length || igp.pieceCount || 0,
            pieces: normalizedPieces
          };
        });
      }
      if (Array.isArray(data.inventoryPieces)) {
        this.inventoryPieces = data.inventoryPieces.map((p: any) => {
          const weightGrams = Number(p.weightGrams || (p.weightKg ? Math.round(p.weightKg * 1000) : 500));
          const costPerGram = Number(p.costPerGram || 0.14);
          const calculatedCostPrice = Number(p.calculatedCostPrice || Number((weightGrams * costPerGram).toFixed(2)));
          return {
            ...p,
            weightGrams,
            costPerGram,
            calculatedCostPrice,
            costPrice: Number(p.costPrice || calculatedCostPrice)
          };
        });
      }
      if (Array.isArray(data.salesGatePasses)) this.salesGatePasses = data.salesGatePasses;
      if (Array.isArray(data.salesInvoices)) this.salesInvoices = data.salesInvoices;
      if (Array.isArray(data.parcelReturns)) this.parcelReturns = data.parcelReturns;
      if (Array.isArray(data.auditLogs)) this.auditLogs = data.auditLogs;
      if (data.liveMulticastConfig) this.liveMulticastConfig = data.liveMulticastConfig;
      if (Array.isArray(data.liveBoothConfigs) && data.liveBoothConfigs.length > 0) {
        this.liveBoothConfigs = data.liveBoothConfigs;
      }
      return true;
    } catch (e) {
      console.error('Failed to load database from disk, using seed:', e);
      return false;
    }
  }

  public transaction<T>(action: () => T, eventMeta?: { module: 'FINANCE' | 'PURCHASE' | 'SALES' | 'PARTIES' | 'HR' | 'SETUP' | 'AUDIT' | 'AUTH' | 'ALL'; entity: string; action: 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'UNPOST' | 'BATCH'; documentRef?: string }): T {
    // Deep snapshot state for automatic atomic rollback on any runtime error
    const snapshot = {
      vouchers: JSON.parse(JSON.stringify(this.vouchers)),
      ledgers: JSON.parse(JSON.stringify(this.ledgers)),
      coaAccounts: JSON.parse(JSON.stringify(this.coaAccounts)),
      parties: JSON.parse(JSON.stringify(this.parties)),
      partyKhataLogs: JSON.parse(JSON.stringify(this.partyKhataLogs)),
      salesInvoices: JSON.parse(JSON.stringify(this.salesInvoices)),
      salesGatePasses: JSON.parse(JSON.stringify(this.salesGatePasses)),
      parcelReturns: JSON.parse(JSON.stringify(this.parcelReturns)),
      purchaseInvoices: JSON.parse(JSON.stringify(this.purchaseInvoices)),
      inwardGatePasses: JSON.parse(JSON.stringify(this.inwardGatePasses)),
      inventoryPieces: JSON.parse(JSON.stringify(this.inventoryPieces)),
      payrolls: JSON.parse(JSON.stringify(this.payrolls)),
      auditLogs: JSON.parse(JSON.stringify(this.auditLogs))
    };

    try {
      const result = action();
      this.saveToDisk();
      if (eventMeta) {
        eventHub.broadcast({
          type: 'ENTITY_MUTATED',
          module: eventMeta.module,
          entity: eventMeta.entity,
          action: eventMeta.action,
          documentRef: eventMeta.documentRef
        });
      }
      return result;
    } catch (err) {
      this.vouchers = snapshot.vouchers;
      this.ledgers = snapshot.ledgers;
      this.coaAccounts = snapshot.coaAccounts;
      this.parties = snapshot.parties;
      this.partyKhataLogs = snapshot.partyKhataLogs;
      this.salesInvoices = snapshot.salesInvoices;
      this.salesGatePasses = snapshot.salesGatePasses;
      this.parcelReturns = snapshot.parcelReturns;
      this.purchaseInvoices = snapshot.purchaseInvoices;
      this.inwardGatePasses = snapshot.inwardGatePasses;
      this.inventoryPieces = snapshot.inventoryPieces;
      this.payrolls = snapshot.payrolls;
      this.auditLogs = snapshot.auditLogs;
      console.error('Transaction rolled back due to error:', err);
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('AUDIT', 'EDIT', eventMeta?.documentRef || 'TXN-FAIL', 'DRAFT', 'System Engine', `Transaction rollback executed: ${err instanceof Error ? err.message : String(err)}`)
      );
      throw err;
    }
  }

  private seedAll() {
    // 1. Users with credentials & roles
    const u1: User = {
      id: 'usr-admin',
      username: 'admin',
      password: 'admin123',
      email: 'admin@vintagevibe.ae',
      name: 'Muhammad',
      role: 'ADMIN',
      assignedShopId: 'Al Ain Main Branch',
      isActive: true,
      permissions: AuthEngine.generateDefaultPermissions('usr-admin', 'ADMIN'),
      createdAt: '2026-01-10T08:00:00Z'
    };
    const u2: User = {
      id: 'usr-acct',
      username: 'accountant',
      password: 'acct123',
      email: 'accountant@vintagevibe.ae',
      name: 'Farhan Zaidi (Senior Accountant)',
      role: 'ACCOUNTANT',
      assignedShopId: 'Headquarters Office',
      isActive: true,
      permissions: AuthEngine.generateDefaultPermissions('usr-acct', 'ACCOUNTANT'),
      createdAt: '2026-01-15T09:00:00Z'
    };
    this.users = [u1, u2];

    // 2. Currencies
    this.currencies = [
      { id: 'cur-aed', code: 'AED', name: 'UAE Dirham', symbol: 'AED', exchangeRate: 1.0, isBase: true },
      { id: 'cur-usd', code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 0.272, isBase: false },
      { id: 'cur-eur', code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 0.25, isBase: false },
      { id: 'cur-gbp', code: 'GBP', name: 'British Pound', symbol: '£', exchangeRate: 0.21, isBase: false }
    ];

    this.itemMasters = [];
    this.labelGrades = [];
    this.brandMasters = [];
    this.shopMasters = [];

    // 3. Enterprise Chart of Accounts (Comprehensive 5 Pillars)
    this.coaAccounts = [];
    this.ensureStandardCOAAccounts();

    this.parties = [];
    this.partyKhataLogs = [];
    this.ensureDefaultEmployees();
    this.attendances = [];
    this.payrolls = [];
    this.purchaseInvoices = [];
    this.inwardGatePasses = [];
    this.inventoryPieces = [];
    this.salesGatePasses = [];
    this.salesInvoices = [];
    this.parcelReturns = [];
    this.auditLogs = [];
    this.vouchers = [];
    this.ledgers = [];
    this.budgets = [];
    this.customReportTemplates = [];
    this.recurringVoucherTemplates = [];
  }

  private ensureDefaultEmployees() {
    // Left clean and empty so no demo fake employees are injected automatically
  }

  // --- Auth & Users ---
  public getUsers(): User[] {
    return this.users;
  }

  public createUser(userData: {
    username: string;
    password?: string;
    name: string;
    email: string;
    role: any;
    assignedShopId?: string;
    isActive?: boolean;
    permissions?: UserPermission[];
  }): User {
    const id = `usr-${Date.now()}`;
    const perms = userData.permissions && userData.permissions.length > 0
      ? userData.permissions
      : AuthEngine.generateDefaultPermissions(id, userData.role);

    const newUser: User = {
      id,
      username: userData.username.trim().toLowerCase(),
      password: userData.password || 'vintage123',
      name: userData.name,
      email: userData.email,
      role: userData.role,
      assignedShopId: userData.assignedShopId || 'Al Quoz Sorting Hub',
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      permissions: perms,
      createdAt: new Date().toISOString()
    };

    this.users.push(newUser);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('AUTH', 'CREATE', `USER-${newUser.username}`, 'POSTED', 'System Admin', `Created system operator account: ${newUser.name} (@${newUser.username}) [${newUser.role}]`)
    );

    return newUser;
  }

  public updateUser(userId: string, updateData: Partial<User>): User | undefined {
    const user = this.users.find(u => u.id === userId);
    if (!user) return undefined;

    if (updateData.name) user.name = updateData.name;
    if (updateData.email) user.email = updateData.email;
    if (updateData.username) user.username = updateData.username.trim().toLowerCase();
    if (updateData.password) user.password = updateData.password;
    if (updateData.role) user.role = updateData.role;
    if (updateData.assignedShopId) user.assignedShopId = updateData.assignedShopId;
    if (updateData.isActive !== undefined) user.isActive = updateData.isActive;
    if (updateData.permissions) user.permissions = updateData.permissions;

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('AUTH', 'EDIT', `USER-${user.username || user.email}`, 'POSTED', 'System Admin', `Updated credentials / status for user: ${user.name}`)
    );

    this.saveToDisk();
    return user;
  }

  public deleteUser(userId: string): boolean {
    const idx = this.users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    const user = this.users[idx];
    this.users.splice(idx, 1);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('AUTH', 'DELETE', `USER-${user.username || user.email}`, 'POSTED', 'System Admin', `Removed system user account: ${user.name}`)
    );
    return true;
  }

  public loginUser(usernameOrEmail: string, password?: string): { success: boolean; user?: User; error?: string } {
    const term = (usernameOrEmail || '').trim().toLowerCase();
    const user = this.users.find(u =>
      (u.username && u.username.toLowerCase() === term) ||
      (u.email && u.email.toLowerCase() === term)
    );

    if (!user) {
      return { success: false, error: 'Operator credentials not found in system' };
    }

    if (!user.isActive) {
      return { success: false, error: 'User account has been deactivated by Administrator' };
    }

    if (password && user.password && user.password !== password) {
      return { success: false, error: 'Invalid password. Please check your credentials' };
    }

    return { success: true, user };
  }

  public updateUserPermissions(userId: string, permissions: UserPermission[], operatorName: string = 'Muhammad', operatorHandle?: string): User | undefined {
    const user = this.users.find(u => u.id === userId);
    if (!user) return undefined;
    user.permissions = permissions;
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);
    const targetHandle = user.username ? user.username : user.email.split('@')[0];
    const adminHandleClean = operatorHandle ? operatorHandle.replace(/^@/, '') : 'admin';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry(
        'AUTH',
        'EDIT',
        `USER-${targetHandle}`,
        'POSTED',
        operatorName,
        `Permissions modified for @${targetHandle} by @${adminHandleClean} on [${dateStr}]`
      )
    );
    this.saveToDisk();
    return user;
  }

  // --- Setup & Company ---
  public getCompanyProfile(): CompanyProfile {
    return this.companyProfile;
  }

  public updateCompanyProfile(profile: Partial<CompanyProfile>): CompanyProfile {
    this.companyProfile = { ...this.companyProfile, ...profile };
    this.syncBankAndPOSToCOA();
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'EDIT', 'COMP-PROFILE', 'POSTED', 'System Admin', 'Updated company profile, bank accounts, POS terminal link, or tax numbers')
    );
    this.saveToDisk();
    return this.companyProfile;
  }

  /**
   * Ensures the complete enterprise Chart of Accounts (5 Pillars) is fully populated
   * with all operational heads for bulk bale purchases, sorting WIP, finished goods inventory,
   * live streaming sales, walk-in POS counter sales, bank & clearing accounts, and essential expenses.
   */
  public ensureStandardCOAAccounts(): void {
    const defaultStandardAccounts: Array<{
      id: string;
      code: string;
      name: string;
      classification: AccountClassification;
      tierLevel: number;
      parentCode: string;
      currency: string;
      isSystem: boolean;
      isActive: boolean;
    }> = [
      // 1000 - ASSETS
      { id: 'acc-1000', code: '1000-00', name: 'Assets', classification: 'ASSET', tierLevel: 1, parentCode: '', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1110', code: '1110-00', name: 'Cash in Hand (Counter 1 POS Drawer)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1115', code: '1115-00', name: 'Cash in Vault (Main Safe Reserve)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1120', code: '1120-00', name: 'Primary Bank Account (Current Account)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1125', code: '1125-00', name: 'POS Terminal Card Clearing (Sunmi / PAX PED)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1128', code: '1128-00', name: 'Courier COD Clearing (Pending Remittance - Aramex / iMile / TCS)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1130', code: '1130-00', name: 'Accounts Receivable (Trade & Live Stream Claimants)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1135', code: '1135-00', name: 'Staff Advance & Loan Receivables', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1140', code: '1140-00', name: 'Inventory - Raw Bulk Bales (Unopened Sacks & Containers)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1150', code: '1150-00', name: 'Inventory - Sorting Work-in-Progress (WIP Bales Under Grading)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1160', code: '1160-00', name: 'Inventory - Sorted & Tagged Garments (Retail & Live Stream Ready)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1210', code: '1210-00', name: 'Security Deposits (Store & Warehouse Leases)', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-1220', code: '1220-00', name: 'Warehouse, Steaming & Sorting Equipment', classification: 'ASSET', tierLevel: 2, parentCode: '1000-00', currency: 'AED', isSystem: true, isActive: true },

      // 2000 - LIABILITIES
      { id: 'acc-2000', code: '2000-00', name: 'Liabilities', classification: 'LIABILITY', tierLevel: 1, parentCode: '', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-2110', code: '2110-00', name: 'Accounts Payable - Trade Suppliers (Bale Exporters)', classification: 'LIABILITY', tierLevel: 2, parentCode: '2000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-2120', code: '2120-00', name: 'Accounts Payable - Courier & Logistics Partners', classification: 'LIABILITY', tierLevel: 2, parentCode: '2000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-2140', code: '2140-00', name: 'UAE VAT Output Tax Payable (5% FTA)', classification: 'LIABILITY', tierLevel: 2, parentCode: '2000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-2150', code: '2150-00', name: 'UAE VAT Input Tax Recoverable (5% FTA)', classification: 'LIABILITY', tierLevel: 2, parentCode: '2000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-2310', code: '2310-00', name: 'Accrued Staff Payroll & End-of-Service Gratuity', classification: 'LIABILITY', tierLevel: 2, parentCode: '2000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-2410', code: '2410-00', name: 'Provision for UAE Corporate Tax (9% FTA)', classification: 'LIABILITY', tierLevel: 2, parentCode: '2000-00', currency: 'AED', isSystem: true, isActive: true },

      // 3000 - EQUITY
      { id: 'acc-3000', code: '3000-00', name: 'Equity', classification: 'EQUITY', tierLevel: 1, parentCode: '', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-3110', code: '3110-00', name: 'Owner / Partner Capital', classification: 'EQUITY', tierLevel: 2, parentCode: '3000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-3210', code: '3210-00', name: 'Retained Earnings / Accumulated Profit & Loss', classification: 'EQUITY', tierLevel: 2, parentCode: '3000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-3310', code: '3310-00', name: 'Current Year Net Profit / (Loss)', classification: 'EQUITY', tierLevel: 2, parentCode: '3000-00', currency: 'AED', isSystem: true, isActive: true },

      // 4000 - REVENUE
      { id: 'acc-4000', code: '4000-00', name: 'Revenue', classification: 'REVENUE', tierLevel: 1, parentCode: '', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-4110', code: '4110-00', name: 'Walk-in Counter POS Sales Revenue', classification: 'REVENUE', tierLevel: 2, parentCode: '4000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-4120', code: '4120-00', name: 'Live Streaming Sales Revenue (TikTok / IG / FB Drops)', classification: 'REVENUE', tierLevel: 2, parentCode: '4000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-4130', code: '4130-00', name: 'E-Commerce & Online Storefront Sales Revenue', classification: 'REVENUE', tierLevel: 2, parentCode: '4000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-4140', code: '4140-00', name: 'Wholesale B2B Bulk Sales Revenue', classification: 'REVENUE', tierLevel: 2, parentCode: '4000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-4210', code: '4210-00', name: 'Luxury Packaging & Gift Box Revenue', classification: 'REVENUE', tierLevel: 2, parentCode: '4000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-4310', code: '4310-00', name: 'Delivery & Shipping Fee Revenue', classification: 'REVENUE', tierLevel: 2, parentCode: '4000-00', currency: 'AED', isSystem: true, isActive: true },

      // 5000 - EXPENSES
      { id: 'acc-5000', code: '5000-00', name: 'Expenses', classification: 'EXPENSE', tierLevel: 1, parentCode: '', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5110', code: '5110-00', name: 'Cost of Goods Sold (COGS) - Finished Garments', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5120', code: '5120-00', name: 'Cost of Goods Sold (COGS) - Bulk Bales Sold', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5210', code: '5210-00', name: 'Ocean Freight & International Container Shipping', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5220', code: '5220-00', name: 'Customs Duty & Dubai Port Clearance Charges', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5230', code: '5230-00', name: 'Bale Sorting, Grading & Steaming Direct Labor', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5240', code: '5240-00', name: 'Courier Delivery & Last-Mile Shipping Expense', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5250', code: '5250-00', name: 'Packaging Supplies, Hang-Tags & Barcode Labels', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5310', code: '5310-00', name: 'Staff Salaries, Live Host Commissions & Overtime', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5410', code: '5410-00', name: 'Warehouse Rent, Retail Store Lease & Utilities (DEWA)', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5420', code: '5420-00', name: 'Payment Gateway & POS Card Terminal Fees (2%)', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true },
      { id: 'acc-5510', code: '5510-00', name: 'UAE Corporate Tax Provision Expense', classification: 'EXPENSE', tierLevel: 2, parentCode: '5000-00', currency: 'AED', isSystem: true, isActive: true }
    ];

    for (const def of defaultStandardAccounts) {
      const existing = this.coaAccounts.find(a => a.code === def.code || a.id === def.id);
      if (!existing) {
        this.coaAccounts.push({
          id: def.id,
          code: def.code,
          name: def.name,
          classification: def.classification,
          tierLevel: def.tierLevel,
          parentCode: def.parentCode,
          currency: def.currency,
          currentBalance: 0,
          isSystem: def.isSystem,
          isActive: def.isActive
        });
      } else {
        if (def.code === '1140-00' && existing.name.includes('Finished Garments & Bales')) {
          existing.name = def.name;
        }
        if (!existing.parentCode && def.parentCode) {
          existing.parentCode = def.parentCode;
        }
      }
    }

    // Sort accounts by code for pristine numerical hierarchy
    this.coaAccounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  /**
   * Automatically synchronizes Bank Accounts and POS Card Machine settings from Setup
   * into the Chart of Accounts (COA) under Assets (1000-00)
   */
  public syncBankAndPOSToCOA(): void {
    // 0. Ensure all standard accounts across 5 pillars exist
    this.ensureStandardCOAAccounts();

    // 1. Ensure master Assets folder 1000-00 exists
    let assetFolder = this.coaAccounts.find(a => a.code === '1000-00');
    if (!assetFolder) {
      assetFolder = {
        id: 'acc-1000',
        code: '1000-00',
        name: 'Assets',
        classification: 'ASSET',
        tierLevel: 1,
        currency: 'AED',
        currentBalance: 0,
        isSystem: true,
        isActive: true
      };
      this.coaAccounts.unshift(assetFolder);
    }

    // 2. Ensure Cash in Hand 1110-00 exists
    let cashAcc = this.coaAccounts.find(a => a.code === '1110-00' || a.code.startsWith('1110'));
    if (!cashAcc) {
      cashAcc = {
        id: 'acc-1110',
        code: '1110-00',
        name: 'Cash in Hand (Counter 1 Drawer)',
        classification: 'ASSET',
        tierLevel: 2,
        parentCode: '1000-00',
        currency: 'AED',
        currentBalance: 0,
        isSystem: true,
        isActive: true
      };
      this.coaAccounts.push(cashAcc);
    }

    // 3. Ensure POS Card Terminal Clearing 1125-00 exists and has machine label
    const posConfig = this.companyProfile.posTerminalConfig;
    const termLabel = posConfig?.terminalName || posConfig?.model || 'Smart PED Machine';
    let posAcc = this.coaAccounts.find(a => a.code === '1125-00' || a.code.startsWith('1125'));
    if (!posAcc) {
      posAcc = {
        id: 'acc-1125',
        code: '1125-00',
        name: `POS Terminal Card Clearing (${termLabel})`,
        classification: 'ASSET',
        tierLevel: 2,
        parentCode: '1000-00',
        currency: 'AED',
        currentBalance: 0,
        isSystem: true,
        isActive: true
      };
      this.coaAccounts.push(posAcc);
    } else {
      posAcc.name = `POS Terminal Card Clearing (${termLabel})`;
    }

    // 4. Normalize & Sync Bank Accounts
    if (!this.companyProfile.bankAccounts || this.companyProfile.bankAccounts.length === 0) {
      this.companyProfile.bankAccounts = [
        {
          id: 'bnk-primary',
          bankName: this.companyProfile.bankName || 'Emirates NBD',
          accountTitle: this.companyProfile.bankAccountTitle || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
          iban: this.companyProfile.bankIban || 'AE24 0331 2345 6789 0123 456',
          accountNumber: this.companyProfile.bankAccountNumber || '1048291029301',
          branchName: 'Business Bay / Downtown Dubai',
          swiftBic: 'EBILAEADXXX',
          currency: 'AED',
          qrCodeUrl: this.companyProfile.bankQrCodeUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=iban%3AAE240331234567890123456%26name%3DVINTAGE%20VIBE%20LLC%26bank%3DEMIRATES%20NBD',
          isPrimary: true,
          linkedPosTerminalId: posConfig?.id || 'pos-default-01',
          coaAccountCode: '1120-00',
          status: 'ACTIVE'
        }
      ];
    }

    // Sync each bank to COA
    this.companyProfile.bankAccounts.forEach((b, idx) => {
      const code = b.coaAccountCode || `112${idx}-00`;
      b.coaAccountCode = code;
      const bankNameFormatted = `Bank Account - ${b.bankName} (${b.currency || 'AED'})`;

      let coaAcc = this.coaAccounts.find(a => a.code === code || a.id === `acc-bank-${b.id}`);
      if (!coaAcc) {
        coaAcc = {
          id: `acc-bank-${b.id}`,
          code,
          name: bankNameFormatted,
          classification: 'ASSET',
          tierLevel: 2,
          parentCode: '1000-00',
          currency: b.currency || 'AED',
          currentBalance: 0,
          isSystem: true,
          isActive: b.status === 'ACTIVE'
        };
        this.coaAccounts.push(coaAcc);
      } else {
        coaAcc.name = bankNameFormatted;
        coaAcc.currency = b.currency || 'AED';
        coaAcc.isActive = b.status === 'ACTIVE';
      }
      b.coaAccountId = coaAcc.id;

      // If primary bank, reflect into top-level companyProfile fields
      if (b.isPrimary) {
        this.companyProfile.bankName = b.bankName;
        this.companyProfile.bankAccountTitle = b.accountTitle;
        this.companyProfile.bankIban = b.iban;
        this.companyProfile.bankAccountNumber = b.accountNumber;
        if (b.qrCodeUrl) this.companyProfile.bankQrCodeUrl = b.qrCodeUrl;
      }
    });

    // 5. Link POS Terminal settlement bank
    if (this.companyProfile.posTerminalConfig) {
      const primaryBank = this.companyProfile.bankAccounts.find(b => b.isPrimary) || this.companyProfile.bankAccounts[0];
      if (primaryBank) {
        if (!this.companyProfile.posTerminalConfig.linkedBankAccountId) {
          this.companyProfile.posTerminalConfig.linkedBankAccountId = primaryBank.id;
        }
        this.companyProfile.posTerminalConfig.linkedBankName = primaryBank.bankName;
        this.companyProfile.posTerminalConfig.settlementCoaAccountCode = primaryBank.coaAccountCode;
      }
    }
  }

  // --- Live Streaming Cloud / Multicast Configuration (Restream / Livepush / RTMP Gateway) ---
  public getLiveMulticastConfig(): LiveStreamMulticastConfig {
    return this.liveMulticastConfig;
  }

  public updateLiveMulticastConfig(updates: Partial<LiveStreamMulticastConfig>): LiveStreamMulticastConfig {
    this.liveMulticastConfig = {
      ...this.liveMulticastConfig,
      ...updates,
      lastSyncedAt: new Date().toISOString()
    };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'EDIT', 'LIVE-MULTICAST', 'POSTED', 'System Admin', `Updated Live Stream Multicast (${this.liveMulticastConfig.provider}) credentials & relay keys`)
    );
    this.saveToDisk();
    return this.liveMulticastConfig;
  }

  // --- Multi-Booth Live Stream Relays (Booth 1 to Booth 5) ---
  public getLiveBoothConfigs(): LiveBoothStreamConfig[] {
    return this.liveBoothConfigs;
  }

  public getLiveBoothConfig(boothId: string): LiveBoothStreamConfig | undefined {
    return this.liveBoothConfigs.find(b => b.boothId === boothId);
  }

  public updateLiveBoothConfig(boothId: string, updates: Partial<LiveBoothStreamConfig>): LiveBoothStreamConfig {
    const idx = this.liveBoothConfigs.findIndex(b => b.boothId === boothId);
    if (idx !== -1) {
      this.liveBoothConfigs[idx] = {
        ...this.liveBoothConfigs[idx],
        ...updates,
        lastSyncedAt: new Date().toISOString()
      };
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('SETUP', 'EDIT', 'BOOTH-STREAM-KEYS', 'POSTED', 'System Admin', `Updated live stream keys for ${this.liveBoothConfigs[idx].boothName}`)
      );
      this.saveToDisk();
      return this.liveBoothConfigs[idx];
    }
    const newCfg: LiveBoothStreamConfig = {
      boothId,
      boothName: updates.boothName || `Booth ${boothId}`,
      category: updates.category || 'Vintage Apparel',
      provider: updates.provider || 'RESTREAM',
      enabled: updates.enabled ?? true,
      apiKey: updates.apiKey || '',
      accountEmail: updates.accountEmail || '',
      accountPassword: updates.accountPassword || '',
      masterIngestRtmpUrl: updates.masterIngestRtmpUrl || 'rtmp://live.restream.io/live',
      masterStreamKey: updates.masterStreamKey || `key_${boothId}`,
      autoRelayToTikTok: updates.autoRelayToTikTok ?? true,
      autoRelayToInstagram: updates.autoRelayToInstagram ?? true,
      autoRelayToFacebook: updates.autoRelayToFacebook ?? true,
      autoRelayToYouTube: updates.autoRelayToYouTube ?? true,
      tikTokStreamKey: updates.tikTokStreamKey || '',
      instagramStreamKey: updates.instagramStreamKey || '',
      facebookStreamKey: updates.facebookStreamKey || '',
      youTubeStreamKey: updates.youTubeStreamKey || '',
      status: updates.status || 'CONNECTED',
      lastSyncedAt: new Date().toISOString()
    };
    this.liveBoothConfigs.push(newCfg);
    this.saveToDisk();
    return newCfg;
  }

  public getCurrencies(): CurrencyItem[] {
    return this.currencies;
  }

  public addCurrency(currency: { code: string; name: string; symbol: string; exchangeRate: number; isBase?: boolean }): CurrencyItem {
    const existing = this.currencies.find(c => c.code.toUpperCase() === currency.code.toUpperCase().trim());
    if (existing) {
      existing.name = currency.name;
      existing.symbol = currency.symbol;
      existing.exchangeRate = currency.exchangeRate;
      if (currency.isBase) {
        this.currencies.forEach(c => (c.isBase = c.code === existing.code));
      }
      return existing;
    }

    const newCur: CurrencyItem = {
      id: `cur-${Date.now()}`,
      code: currency.code.toUpperCase().trim() as any,
      name: currency.name,
      symbol: currency.symbol,
      exchangeRate: currency.exchangeRate,
      isBase: currency.isBase || false
    };

    if (newCur.isBase) {
      this.currencies.forEach(c => (c.isBase = false));
    }

    this.currencies.push(newCur);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', `CURR-${newCur.code}`, 'POSTED', 'Chief Accountant', `Added currency ${newCur.code} (${newCur.name}) with rate ${newCur.exchangeRate}`)
    );

    return newCur;
  }

  public updateCurrencyRate(code: any, rate: number): CurrencyItem[] {
    const cur = this.currencies.find(c => c.code === code);
    if (cur) cur.exchangeRate = rate;
    return this.currencies;
  }

  public deleteCurrency(code: string): boolean {
    const idx = this.currencies.findIndex(c => c.code === code);
    if (idx === -1) return false;
    if (this.currencies[idx].isBase) return false; // cannot delete base
    this.currencies.splice(idx, 1);
    return true;
  }

  public getItemMasters(): ItemMaster[] {
    return this.itemMasters;
  }

  public addItemMaster(item: Omit<ItemMaster, 'id'>): ItemMaster {
    const newItem: ItemMaster = {
      ...item,
      id: `itm-${Date.now()}`,
      status: item.status || 'POSTED',
      isActive: item.isActive !== undefined ? item.isActive : true
    };
    this.itemMasters.push(newItem);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', newItem.code, newItem.status || 'POSTED', 'System Admin', `Registered master item ${newItem.name}`)
    );
    return newItem;
  }

  public updateItemMaster(id: string, updates: Partial<ItemMaster>): ItemMaster | null {
    const index = this.itemMasters.findIndex(i => i.id === id);
    if (index === -1) return null;
    this.itemMasters[index] = { ...this.itemMasters[index], ...updates };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UPDATE', this.itemMasters[index].code, this.itemMasters[index].status || 'POSTED', 'System Admin', `Updated master item ${this.itemMasters[index].name}`)
    );
    return this.itemMasters[index];
  }

  public deleteItemMaster(id: string): boolean {
    const item = this.itemMasters.find(i => i.id === id);
    if (!item) return false;
    this.itemMasters = this.itemMasters.filter(i => i.id !== id);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'DELETE', item.code, 'POSTED', 'System Admin', `Deleted master item ${item.name}`)
    );
    return true;
  }

  public postItemMaster(id: string): ItemMaster | null {
    const item = this.itemMasters.find(i => i.id === id);
    if (!item) return null;
    item.status = 'POSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'POST', item.code, 'POSTED', 'System Admin', `Posted master item ${item.name}`)
    );
    return item;
  }

  public unpostItemMaster(id: string): ItemMaster | null {
    const item = this.itemMasters.find(i => i.id === id);
    if (!item) return null;
    item.status = 'UNPOSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UNPOST', item.code, 'UNPOSTED', 'System Admin', `Unposted master item ${item.name} to draft status`)
    );
    return item;
  }

  public ensureQualityGrades(): void {
    if (!this.labelGrades || this.labelGrades.length === 0) {
      this.labelGrades = [
        {
          id: 'lbl-1',
          code: 'CREAM',
          name: 'Super Cream (Mint / Luxury Vintage)',
          description: 'Top-tier pristine condition, flawless original tags/wash, highest retail margin',
          qualityTier: 'CREAM',
          priceMultiplier: 2.0,
          sortOrder: 1,
          status: 'POSTED',
          isActive: true
        },
        {
          id: 'lbl-2',
          code: 'GRADE-A-BRD',
          name: 'Grade A (Branded Vintage)',
          description: 'Famous heritage brands (Levi\'s, Carhartt, Nike, Ralph Lauren), pristine vintage condition',
          qualityTier: 'GRADE_A',
          priceMultiplier: 1.6,
          sortOrder: 2,
          status: 'POSTED',
          isActive: true
        },
        {
          id: 'lbl-3',
          code: 'GRADE-A-NB',
          name: 'Grade A (Non-Brand / High Street)',
          description: 'Clean, flawless wearable condition, unbranded cotton/denim/knitwear basics',
          qualityTier: 'NON_BRAND',
          priceMultiplier: 1.2,
          sortOrder: 3,
          status: 'POSTED',
          isActive: true
        },
        {
          id: 'lbl-4',
          code: 'GRADE-B',
          name: 'Grade B (Minor Flaws / Outlet Thrift)',
          description: 'Minor washable spots, faint signs of age, repairable buttons, discounted clearance',
          qualityTier: 'GRADE_B',
          priceMultiplier: 0.7,
          sortOrder: 4,
          status: 'POSTED',
          isActive: true
        },
        {
          id: 'lbl-5',
          code: 'REWORK',
          name: 'Grade C / Rework (Cutting & Rag)',
          description: 'Heavily distressed, repurposable denim/canvas, patchwork cutting fabric',
          qualityTier: 'REWORK',
          priceMultiplier: 0.3,
          sortOrder: 5,
          status: 'POSTED',
          isActive: true
        }
      ];
    }
  }

  public getLabelGrades(): LabelGrade[] {
    this.ensureQualityGrades();
    return this.labelGrades;
  }

  public addLabelGrade(label: Omit<LabelGrade, 'id'>): LabelGrade {
    this.ensureQualityGrades();
    const newLabel: LabelGrade = {
      ...label,
      id: `lbl-${Date.now()}`,
      status: label.status || 'POSTED',
      isActive: label.isActive !== undefined ? label.isActive : true,
      sortOrder: label.sortOrder || this.labelGrades.length + 1
    };
    this.labelGrades.push(newLabel);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', newLabel.code, newLabel.status || 'POSTED', 'System Admin', `Registered quality grade ${newLabel.name}`)
    );
    this.saveToDisk();
    return newLabel;
  }

  public updateLabelGrade(id: string, updates: Partial<LabelGrade>): LabelGrade | null {
    this.ensureQualityGrades();
    const index = this.labelGrades.findIndex(l => l.id === id);
    if (index === -1) return null;
    this.labelGrades[index] = { ...this.labelGrades[index], ...updates };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UPDATE', this.labelGrades[index].code, this.labelGrades[index].status || 'POSTED', 'System Admin', `Updated quality grade ${this.labelGrades[index].name}`)
    );
    this.saveToDisk();
    return this.labelGrades[index];
  }

  public deleteLabelGrade(id: string): boolean {
    this.ensureQualityGrades();
    const label = this.labelGrades.find(l => l.id === id);
    if (!label) return false;
    this.labelGrades = this.labelGrades.filter(l => l.id !== id);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'DELETE', label.code, 'POSTED', 'System Admin', `Deleted quality grade ${label.name}`)
    );
    this.saveToDisk();
    return true;
  }

  public postLabelGrade(id: string): LabelGrade | null {
    this.ensureQualityGrades();
    const label = this.labelGrades.find(l => l.id === id);
    if (!label) return null;
    label.status = 'POSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'POST', label.code, 'POSTED', 'System Admin', `Posted quality grade ${label.name}`)
    );
    this.saveToDisk();
    return label;
  }

  public unpostLabelGrade(id: string): LabelGrade | null {
    this.ensureQualityGrades();
    const label = this.labelGrades.find(l => l.id === id);
    if (!label) return null;
    label.status = 'UNPOSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UNPOST', label.code, 'UNPOSTED', 'System Admin', `Unposted quality grade ${label.name} to draft status`)
    );
    this.saveToDisk();
    return label;
  }

  public getBrandMasters(): BrandMaster[] {
    return this.brandMasters;
  }

  public addBrandMaster(brand: Omit<BrandMaster, 'id'>): BrandMaster {
    const newBrand: BrandMaster = {
      ...brand,
      id: `brd-${Date.now()}`,
      status: brand.status || 'POSTED'
    };
    this.brandMasters.push(newBrand);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', newBrand.name, newBrand.status || 'POSTED', 'System Admin', `Registered brand tier ${newBrand.name}`)
    );
    return newBrand;
  }

  public updateBrandMaster(id: string, updates: Partial<BrandMaster>): BrandMaster | null {
    const index = this.brandMasters.findIndex(b => b.id === id);
    if (index === -1) return null;
    this.brandMasters[index] = { ...this.brandMasters[index], ...updates };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UPDATE', this.brandMasters[index].name, this.brandMasters[index].status || 'POSTED', 'System Admin', `Updated brand tier ${this.brandMasters[index].name}`)
    );
    return this.brandMasters[index];
  }

  public deleteBrandMaster(id: string): boolean {
    const brand = this.brandMasters.find(b => b.id === id);
    if (!brand) return false;
    this.brandMasters = this.brandMasters.filter(b => b.id !== id);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'DELETE', brand.name, 'POSTED', 'System Admin', `Deleted brand tier ${brand.name}`)
    );
    return true;
  }

  public postBrandMaster(id: string): BrandMaster | null {
    const brand = this.brandMasters.find(b => b.id === id);
    if (!brand) return null;
    brand.status = 'POSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'POST', brand.name, 'POSTED', 'System Admin', `Posted brand tier ${brand.name}`)
    );
    return brand;
  }

  public unpostBrandMaster(id: string): BrandMaster | null {
    const brand = this.brandMasters.find(b => b.id === id);
    if (!brand) return null;
    brand.status = 'UNPOSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UNPOST', brand.name, 'UNPOSTED', 'System Admin', `Unposted brand tier ${brand.name} to draft status`)
    );
    return brand;
  }

  public getShopMasters(): ShopMaster[] {
    return this.shopMasters;
  }

  public addShopMaster(shop: Omit<ShopMaster, 'id'>): ShopMaster {
    const newShop: ShopMaster = {
      ...shop,
      id: `shp-${Date.now()}`,
      status: shop.status || 'POSTED',
      isActive: shop.isActive !== undefined ? shop.isActive : true
    };
    this.shopMasters.push(newShop);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', newShop.shopNo, newShop.status || 'POSTED', 'System Admin', `Registered shop & racks ${newShop.name}`)
    );
    return newShop;
  }

  public updateShopMaster(id: string, updates: Partial<ShopMaster>): ShopMaster | null {
    const index = this.shopMasters.findIndex(s => s.id === id);
    if (index === -1) return null;
    this.shopMasters[index] = { ...this.shopMasters[index], ...updates };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UPDATE', this.shopMasters[index].shopNo, this.shopMasters[index].status || 'POSTED', 'System Admin', `Updated shop & racks ${this.shopMasters[index].name}`)
    );
    return this.shopMasters[index];
  }

  public deleteShopMaster(id: string): boolean {
    const shop = this.shopMasters.find(s => s.id === id);
    if (!shop) return false;
    this.shopMasters = this.shopMasters.filter(s => s.id !== id);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'DELETE', shop.shopNo, 'POSTED', 'System Admin', `Deleted shop & racks ${shop.name}`)
    );
    return true;
  }

  public postShopMaster(id: string): ShopMaster | null {
    const shop = this.shopMasters.find(s => s.id === id);
    if (!shop) return null;
    shop.status = 'POSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'POST', shop.shopNo, 'POSTED', 'System Admin', `Posted shop & racks ${shop.name}`)
    );
    return shop;
  }

  public unpostShopMaster(id: string): ShopMaster | null {
    const shop = this.shopMasters.find(s => s.id === id);
    if (!shop) return null;
    shop.status = 'UNPOSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UNPOST', shop.shopNo, 'UNPOSTED', 'System Admin', `Unposted shop & racks ${shop.name} to draft status`)
    );
    return shop;
  }

  // --- Category Master ---
  public ensureCategoriesAndSizes(): void {
    if (!this.categories || this.categories.length < 18) {
      this.categories = [
        { id: 'cat-1', code: 'CAT-001', name: 'Vintage Denim Jeans (Cream Grade)', qualityTier: 'CREAM', description: 'Classic 90s & 80s blue/black denim, 501s Redline, Big E, Selvedge and worker jeans', sortOrder: 1, status: 'POSTED', isActive: true },
        { id: 'cat-2', code: 'CAT-002', name: 'Denim Jeans & Chinos (Non-Brand / Grade A)', qualityTier: 'NON_BRAND', description: 'High-street unbranded, modern everyday fit and regular thrift denim', sortOrder: 2, status: 'POSTED', isActive: true },
        { id: 'cat-3', code: 'CAT-003', name: 'Vintage Graphic & Band Tees (Super Cream)', qualityTier: 'CREAM', description: 'Single stitch, band tour, Harley-Davidson, anime and rare retro tees', sortOrder: 3, status: 'POSTED', isActive: true },
        { id: 'cat-4', code: 'CAT-004', name: 'Plain & Graphic T-Shirts (Non-Brand Basic)', qualityTier: 'NON_BRAND', description: 'Standard cotton tees, solid pocket tees, daily unbranded thrift basics', sortOrder: 4, status: 'POSTED', isActive: true },
        { id: 'cat-5', code: 'CAT-005', name: 'Luxury Knitwear & Coogi Sweaters (Cream Grade)', qualityTier: 'CREAM', description: 'Coogi style textured 3D knits, pure mohair, wool cardigans and crewneck sweaters', sortOrder: 5, status: 'POSTED', isActive: true },
        { id: 'cat-6', code: 'CAT-006', name: 'Knitwear & Everyday Pullovers (Non-Brand)', qualityTier: 'NON_BRAND', description: 'Everyday acrylic & cotton blend sweaters, basic crew pullovers', sortOrder: 6, status: 'POSTED', isActive: true },
        { id: 'cat-7', code: 'CAT-007', name: 'Vintage Jackets, Bombers & Varsity (Super Cream)', qualityTier: 'CREAM', description: 'Leather varsity, Carhartt duck canvas, Barbour and 90s windbreakers', sortOrder: 7, status: 'POSTED', isActive: true },
        { id: 'cat-8', code: 'CAT-008', name: 'Workwear & Canvas Utility Jackets (Non-Brand)', qualityTier: 'NON_BRAND', description: 'Heavy-duty unbranded worker chore coats, tactical zip utility jackets', sortOrder: 8, status: 'POSTED', isActive: true },
        { id: 'cat-9', code: 'CAT-009', name: 'Reverse Weave & Heavy Hoodies (Cream Vintage)', qualityTier: 'CREAM', description: 'Heavy blend reverse weave, 90s athletic hoodies and collegiate crewnecks', sortOrder: 9, status: 'POSTED', isActive: true },
        { id: 'cat-10', code: 'CAT-010', name: 'Casual Fleece & Hoodies (Non-Brand)', qualityTier: 'NON_BRAND', description: 'Basic fleece pullovers, zip-up unbranded hoodies and casual sweatshirts', sortOrder: 10, status: 'POSTED', isActive: true },
        { id: 'cat-11', code: 'CAT-011', name: 'Silk, Rayon & Hawaiian Floral Shirts (Cream Grade)', qualityTier: 'CREAM', description: 'Camp collar, 70s disco retro floral, bowling and silk rayon shirts', sortOrder: 11, status: 'POSTED', isActive: true },
        { id: 'cat-12', code: 'CAT-012', name: 'Casual Button-Down & Plaid Shirts (Non-Brand)', qualityTier: 'NON_BRAND', description: 'Flannels, everyday plaid, Oxford cotton and office casual shirts', sortOrder: 12, status: 'POSTED', isActive: true },
        { id: 'cat-13', code: 'CAT-013', name: 'Leather & Suede Biker Jackets (Cream Grade)', qualityTier: 'CREAM', description: 'Distressed biker leather, bomber suede and cafe racer jackets', sortOrder: 13, status: 'POSTED', isActive: true },
        { id: 'cat-14', code: 'CAT-014', name: '90s Track Tops & Sportswear (Cream Branded)', qualityTier: 'GRADE_A', description: 'Retro Nike, Adidas, Kappa, Umbro nylon track tops and warmup jerseys', sortOrder: 14, status: 'POSTED', isActive: true },
        { id: 'cat-15', code: 'CAT-015', name: 'Sportswear, Shorts & Training Tops (Non-Brand)', qualityTier: 'NON_BRAND', description: 'Generic workout tees, mesh athletic shorts, unbranded nylon track pants', sortOrder: 15, status: 'POSTED', isActive: true },
        { id: 'cat-16', code: 'CAT-016', name: 'Vintage Snapbacks & Wool Caps (Cream Grade)', qualityTier: 'CREAM', description: 'Pro-line embroidery, vintage NFL/NBA, wool baseball snapbacks', sortOrder: 16, status: 'POSTED', isActive: true },
        { id: 'cat-17', code: 'CAT-017', name: 'Hats, Beanies, Belts & Scarves (Non-Brand)', qualityTier: 'NON_BRAND', description: 'Generic knit beanies, genuine leather belts and winter scarves', sortOrder: 17, status: 'POSTED', isActive: true },
        { id: 'cat-18', code: 'CAT-018', name: 'Tailored Wool Coats & Retro Blazers (Cream Grade)', qualityTier: 'CREAM', description: 'Harris Tweed, wool trench coats, tailored retro blazers and formal overcoats', sortOrder: 18, status: 'POSTED', isActive: true },
        { id: 'cat-19', code: 'CAT-019', name: 'Prairie Dresses & Retro Skirts (Cream Grade)', qualityTier: 'CREAM', description: 'Vintage prairie dresses, pleated skirts and 70s/80s retro silhouettes', sortOrder: 19, status: 'POSTED', isActive: true },
        { id: 'cat-20', code: 'CAT-020', name: 'Rework, Flawed & Clearance Garments (Grade B)', qualityTier: 'GRADE_B', description: 'Minor washable marks, missing buttons, repairable flaws, outlet clearance', sortOrder: 20, status: 'POSTED', isActive: true }
      ];
    }
    if (!this.sizes || this.sizes.length === 0) {
      this.sizes = [
        { id: 'sz-1', code: 'XS', name: 'Extra Small (XS)', category: 'Tops / Universal', sortOrder: 1, status: 'POSTED', isActive: true },
        { id: 'sz-2', code: 'S', name: 'Small (S)', category: 'Tops / Universal', sortOrder: 2, status: 'POSTED', isActive: true },
        { id: 'sz-3', code: 'M', name: 'Medium (M)', category: 'Tops / Universal', sortOrder: 3, status: 'POSTED', isActive: true },
        { id: 'sz-4', code: 'L', name: 'Large (L)', category: 'Tops / Universal', sortOrder: 4, status: 'POSTED', isActive: true },
        { id: 'sz-5', code: 'XL', name: 'Extra Large (XL)', category: 'Tops / Universal', sortOrder: 5, status: 'POSTED', isActive: true },
        { id: 'sz-6', code: '2XL', name: 'Double Extra Large (2XL)', category: 'Tops / Universal', sortOrder: 6, status: 'POSTED', isActive: true },
        { id: 'sz-7', code: '3XL', name: 'Triple Extra Large (3XL)', category: 'Tops / Universal', sortOrder: 7, status: 'POSTED', isActive: true },
        { id: 'sz-8', code: 'Free Size', name: 'Free Size / One Size (OS)', category: 'Universal / Accessories', sortOrder: 8, status: 'POSTED', isActive: true },
        { id: 'sz-9', code: 'W28', name: 'Waist 28 (W28)', category: 'Bottoms / Denim', sortOrder: 9, status: 'POSTED', isActive: true },
        { id: 'sz-10', code: 'W30', name: 'Waist 30 (W30)', category: 'Bottoms / Denim', sortOrder: 10, status: 'POSTED', isActive: true },
        { id: 'sz-11', code: 'W32', name: 'Waist 32 (W32)', category: 'Bottoms / Denim', sortOrder: 11, status: 'POSTED', isActive: true },
        { id: 'sz-12', code: 'W34', name: 'Waist 34 (W34)', category: 'Bottoms / Denim', sortOrder: 12, status: 'POSTED', isActive: true },
        { id: 'sz-13', code: 'W36', name: 'Waist 36 (W36)', category: 'Bottoms / Denim', sortOrder: 13, status: 'POSTED', isActive: true },
        { id: 'sz-14', code: 'W38', name: 'Waist 38 (W38)', category: 'Bottoms / Denim', sortOrder: 14, status: 'POSTED', isActive: true },
        { id: 'sz-15', code: 'Adjustable', name: 'Adjustable Strap / OSFA', category: 'Caps & Accessories', sortOrder: 15, status: 'POSTED', isActive: true }
      ];
    }
  }

  public getCategories(): CategoryMaster[] {
    this.ensureCategoriesAndSizes();
    return this.categories;
  }

  public addCategory(cat: Omit<CategoryMaster, 'id'>): CategoryMaster {
    this.ensureCategoriesAndSizes();
    const nextIdx = this.categories.length + 1;
    const newCategory: CategoryMaster = {
      ...cat,
      id: `cat-${Date.now()}`,
      code: cat.code ? cat.code.trim().toUpperCase() : `CAT-${String(nextIdx).padStart(3, '0')}`,
      status: cat.status || 'POSTED',
      isActive: cat.isActive !== undefined ? cat.isActive : true,
      sortOrder: cat.sortOrder !== undefined ? Number(cat.sortOrder) : nextIdx
    };
    this.categories.push(newCategory);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', newCategory.code, newCategory.status || 'POSTED', 'System Admin', `Registered apparel category ${newCategory.name} (${newCategory.code})`)
    );
    this.saveToDisk();
    return newCategory;
  }

  public updateCategory(id: string, updates: Partial<CategoryMaster>): CategoryMaster | null {
    this.ensureCategoriesAndSizes();
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) return null;
    this.categories[index] = { ...this.categories[index], ...updates };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UPDATE', this.categories[index].code, this.categories[index].status || 'POSTED', 'System Admin', `Updated apparel category ${this.categories[index].name}`)
    );
    this.saveToDisk();
    return this.categories[index];
  }

  public deleteCategory(id: string): boolean {
    this.ensureCategoriesAndSizes();
    const cat = this.categories.find(c => c.id === id);
    if (!cat) return false;
    this.categories = this.categories.filter(c => c.id !== id);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'DELETE', cat.code, 'POSTED', 'System Admin', `Deleted apparel category ${cat.name}`)
    );
    this.saveToDisk();
    return true;
  }

  public postCategory(id: string): CategoryMaster | null {
    this.ensureCategoriesAndSizes();
    const cat = this.categories.find(c => c.id === id);
    if (!cat) return null;
    cat.status = 'POSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'POST', cat.code, 'POSTED', 'System Admin', `Posted apparel category ${cat.name}`)
    );
    this.saveToDisk();
    return cat;
  }

  public unpostCategory(id: string): CategoryMaster | null {
    this.ensureCategoriesAndSizes();
    const cat = this.categories.find(c => c.id === id);
    if (!cat) return null;
    cat.status = 'UNPOSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UNPOST', cat.code, 'UNPOSTED', 'System Admin', `Unposted apparel category ${cat.name} to draft status`)
    );
    this.saveToDisk();
    return cat;
  }

  // --- Size Master ---
  public getSizes(): SizeMaster[] {
    this.ensureCategoriesAndSizes();
    return this.sizes;
  }

  public addSize(size: Omit<SizeMaster, 'id'>): SizeMaster {
    this.ensureCategoriesAndSizes();
    const nextIdx = this.sizes.length + 1;
    const newSize: SizeMaster = {
      ...size,
      id: `sz-${Date.now()}`,
      code: size.code ? size.code.trim().toUpperCase() : `SZ-${String(nextIdx).padStart(2, '0')}`,
      status: size.status || 'POSTED',
      isActive: size.isActive !== undefined ? size.isActive : true,
      sortOrder: size.sortOrder !== undefined ? Number(size.sortOrder) : nextIdx
    };
    this.sizes.push(newSize);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'CREATE', newSize.code, newSize.status || 'POSTED', 'System Admin', `Registered apparel size ${newSize.name} (${newSize.code})`)
    );
    this.saveToDisk();
    return newSize;
  }

  public updateSize(id: string, updates: Partial<SizeMaster>): SizeMaster | null {
    this.ensureCategoriesAndSizes();
    const index = this.sizes.findIndex(s => s.id === id);
    if (index === -1) return null;
    this.sizes[index] = { ...this.sizes[index], ...updates };
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UPDATE', this.sizes[index].code, this.sizes[index].status || 'POSTED', 'System Admin', `Updated apparel size ${this.sizes[index].name}`)
    );
    this.saveToDisk();
    return this.sizes[index];
  }

  public deleteSize(id: string): boolean {
    this.ensureCategoriesAndSizes();
    const size = this.sizes.find(s => s.id === id);
    if (!size) return false;
    this.sizes = this.sizes.filter(s => s.id !== id);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'DELETE', size.code, 'POSTED', 'System Admin', `Deleted apparel size ${size.name}`)
    );
    this.saveToDisk();
    return true;
  }

  public postSize(id: string): SizeMaster | null {
    this.ensureCategoriesAndSizes();
    const size = this.sizes.find(s => s.id === id);
    if (!size) return null;
    size.status = 'POSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'POST', size.code, 'POSTED', 'System Admin', `Posted apparel size ${size.name}`)
    );
    this.saveToDisk();
    return size;
  }

  public unpostSize(id: string): SizeMaster | null {
    this.ensureCategoriesAndSizes();
    const size = this.sizes.find(s => s.id === id);
    if (!size) return null;
    size.status = 'UNPOSTED';
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SETUP', 'UNPOST', size.code, 'UNPOSTED', 'System Admin', `Unposted apparel size ${size.name} to draft status`)
    );
    this.saveToDisk();
    return size;
  }

  public calculateDailySummary(): DailySummaryData {
    const totalPurchasesAmount = this.purchaseInvoices.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalPurchasedWeightKg = this.inwardGatePasses.reduce((sum, g) => sum + g.totalBaleWeight, 0);
    const totalPiecesBrokenDown = this.inventoryPieces.length;
    const totalSalesAmount = this.salesInvoices.reduce((sum, s) => sum + s.totalAmount, 0);
    const vatCollectedAmount = this.salesInvoices.reduce((sum, s) => sum + s.vatAmount, 0);
    const openReceivablesTotal = this.parties.filter(p => p.type === 'CLIENT').reduce((sum, c) => sum + Math.max(0, c.currentBalance), 0);
    const activeEmployeesWorked = this.employees.filter(e => e.isActive).length;

    return {
      date: new Date().toISOString().slice(0, 10),
      totalPurchasesAmount,
      totalPurchasedWeightKg,
      totalPiecesBrokenDown,
      totalSalesAmount,
      vatCollectedAmount,
      openReceivablesTotal,
      activeEmployeesWorked
    };
  }

  // --- Finance & COA ---
  public getCOA(): COAAccount[] {
    this.ensureStandardCOAAccounts();
    return this.coaAccounts;
  }

  public getOrCreateAccount(codePrefix: string, fallbackName: string, classification: AccountClassification): COAAccount {
    this.ensureStandardCOAAccounts();
    let acc = this.coaAccounts.find(a => a.code === codePrefix || a.code.startsWith(codePrefix));
    if (!acc) {
      acc = this.addCOAAccount({
        code: codePrefix.includes('-') ? codePrefix : `${codePrefix}-00`,
        name: fallbackName,
        classification,
        tierLevel: 2,
        parentCode: `${codePrefix.charAt(0)}000-00`,
        currency: 'AED',
        currentBalance: 0,
        isSystem: true,
        isActive: true
      });
    }
    return acc;
  }

  public addCOAAccount(acc: Partial<COAAccount> & { code: string; name: string; classification: any }): COAAccount {
    const newAcc: COAAccount = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: acc.code.trim(),
      name: acc.name.trim(),
      classification: acc.classification,
      tierLevel: acc.tierLevel || 3,
      parentCode: acc.parentCode,
      currency: (acc.currency as any) || 'AED',
      currentBalance: Number(acc.currentBalance) || 0,
      isSystem: acc.isSystem !== undefined ? acc.isSystem : false,
      isActive: acc.isActive !== undefined ? acc.isActive : true
    };
    this.coaAccounts.push(newAcc);
    this.coaAccounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('FINANCE', 'CREATE', newAcc.code, 'POSTED', 'System Accountant', `Added COA Account ${newAcc.name} (${newAcc.code} - ${newAcc.classification})`)
    );
    this.saveToDisk();
    return newAcc;
  }

  public getVouchers(): Voucher[] {
    return this.vouchers;
  }

  public createVoucher(voucherData: Omit<Voucher, 'id' | 'voucherNo'> & { voucherNo?: string }): Voucher {
    // Runtime schema validation using Zod
    const validation = validateWithZod(VoucherInputSchema, voucherData);
    if (validation.success === false) {
      throw new Error(validation.error);
    }

    const nextIdx = this.vouchers.length + 1;
    const voucherNo = voucherData.voucherNo || `${voucherData.type}-2026-${String(nextIdx).padStart(4, '0')}`;
    const newVoucher: Voucher = {
      ...voucherData,
      id: `vch-${Date.now()}`,
      voucherNo,
      status: voucherData.status || 'DRAFT'
    };

    return this.transaction(() => {
      this.vouchers.unshift(newVoucher);
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('FINANCE', 'CREATE', newVoucher.voucherNo, 'DRAFT', 'System Accountant', `Created draft voucher ${newVoucher.voucherNo}`)
      );
      return newVoucher;
    }, { module: 'FINANCE', entity: 'VOUCHER', action: 'CREATE', documentRef: newVoucher.voucherNo });
  }

  public postVoucher(voucherId: string, postedBy: string): { success: boolean; error?: string } {
    const voucher = this.vouchers.find(v => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (voucher.status === 'POSTED') return { success: false, error: 'Voucher is already POSTED' };

    const validation = FinanceEngine.validateDoubleEntry(voucher);
    if (!validation.isValid) return { success: false, error: validation.error };

    return this.transaction(() => {
      const { newLedgers, updatedAccounts } = FinanceEngine.postVoucherToLedger(
        voucher,
        this.coaAccounts,
        this.ledgers
      );

      this.ledgers.push(...newLedgers);
      this.coaAccounts = updatedAccounts;

      voucher.status = 'POSTED';
      voucher.postedAt = new Date().toISOString();
      voucher.postedBy = postedBy;

      this.auditLogs.unshift(
        AuditEngine.createLogEntry('FINANCE', 'POST', voucher.voucherNo, 'POSTED', postedBy, `Approved and posted voucher ${voucher.voucherNo} into dual-entry general ledger`)
      );

      return { success: true };
    }, { module: 'FINANCE', entity: 'VOUCHER', action: 'POST', documentRef: voucher.voucherNo });
  }

  public unpostVoucher(voucherId: string): { success: boolean; error?: string } {
    const voucher = this.vouchers.find(v => v.id === voucherId);
    if (!voucher) return { success: false, error: 'Voucher not found' };
    if (voucher.status !== 'POSTED') return { success: false, error: 'Only POSTED vouchers can be unposted' };

    return this.transaction(() => {
      const { remainingLedgers, updatedAccounts } = FinanceEngine.unpostVoucherFromLedger(
        voucherId,
        this.coaAccounts,
        this.ledgers
      );

      this.ledgers = remainingLedgers;
      this.coaAccounts = updatedAccounts;

      voucher.status = 'UNPOSTED';

      this.auditLogs.unshift(
        AuditEngine.createLogEntry('FINANCE', 'UNPOST', voucher.voucherNo, 'UNPOSTED', 'System Accountant', `Unposted voucher ${voucher.voucherNo} and reversed ledger entries`)
      );

      return { success: true };
    }, { module: 'FINANCE', entity: 'VOUCHER', action: 'UNPOST', documentRef: voucher.voucherNo });
  }

  public getLedgers(): LedgerEntry[] {
    return this.ledgers;
  }

  // --- Parties Khata ---
  public getParties(): Party[] {
    return this.parties;
  }

  public addParty(partyData: Omit<Party, 'id' | 'code' | 'currentBalance' | 'accountMap' | 'createdAt'>): Party {
    const prefix = partyData.type === 'CLIENT' ? 'CLI' : partyData.type === 'SUPPLIER' ? 'SUP' : 'AGT';
    const sameTypeCount = this.parties.filter(p => p.type === partyData.type).length + 1;
    const code = `${prefix}-${String(sameTypeCount).padStart(3, '0')}`;

    // Auto-provision COA Accounts
    const { generatedAccounts, accountMap } = PartiesEngine.provisionPartyCOAAccounts(partyData, sameTypeCount);
    generatedAccounts.forEach(acc => {
      this.addCOAAccount(acc);
    });

    const newParty: Party = {
      ...partyData,
      id: `pty-${Date.now()}`,
      code,
      currentBalance: 0,
      accountMap,
      createdAt: new Date().toISOString()
    };

    this.parties.push(newParty);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PARTIES', 'CREATE', newParty.code, 'POSTED', 'System CRM', `Added party ${newParty.name} (${newParty.type}) and auto-provisioned COA accounts`)
    );

    return newParty;
  }

  public getPartyKhataLogs(partyId: string): PartyKhataLog[] {
    return this.partyKhataLogs.filter(p => p.partyId === partyId);
  }

  public recordPartyPayment(partyId: string, payload: {
    amount: number;
    type: 'RECEIPT' | 'PAYMENT';
    docRef: string;
    description: string;
  }): { success: boolean; khataLog?: PartyKhataLog; error?: string } {
    const party = this.parties.find(p => p.id === partyId);
    if (!party) return { success: false, error: 'Party not found' };

    const debit = payload.type === 'PAYMENT' ? payload.amount : 0;
    const credit = payload.type === 'RECEIPT' ? payload.amount : 0;

    const newBalance = Number((party.currentBalance + debit - credit).toFixed(2));
    party.currentBalance = newBalance;

    const log: PartyKhataLog = {
      id: `pkl-${Date.now()}`,
      partyId,
      date: new Date().toISOString().slice(0, 10),
      docType: payload.type,
      docRef: payload.docRef,
      debit,
      credit,
      balance: newBalance,
      description: payload.description
    };

    this.partyKhataLogs.push(log);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PARTIES', 'CREATE', payload.docRef, 'POSTED', 'Cashier', `Recorded ${payload.type} of AED ${payload.amount} for party ${party.name}`)
    );

    return { success: true, khataLog: log };
  }

  // --- HR & Payroll ---
  public getEmployees(): Employee[] {
    return this.employees;
  }

  public addEmployee(empData: Omit<Employee, 'id' | 'empCode'>): Employee {
    const code = `EMP-${String(this.employees.length + 1).padStart(3, '0')}`;
    const newEmp: Employee = {
      ...empData,
      id: `emp-${Date.now()}`,
      empCode: code,
      isActive: empData.isActive !== false,
      status: empData.status || 'POSTED'
    };
    this.employees.push(newEmp);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'CREATE', newEmp.empCode, 'POSTED', 'HR Dept', `Registered new employee ${newEmp.name} (${newEmp.designation})`)
    );
    return newEmp;
  }

  public updateEmployee(id: string, empData: Partial<Employee>): Employee {
    const emp = this.employees.find(e => e.id === id);
    if (!emp) throw new Error('Employee not found');
    Object.assign(emp, empData);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'UPDATE', emp.empCode, 'POSTED', 'HR Dept', `Updated employee record for ${emp.name}`)
    );
    return emp;
  }

  public postEmployee(id: string): { success: boolean; error?: string } {
    const emp = this.employees.find(e => e.id === id);
    if (!emp) return { success: false, error: 'Employee not found' };
    emp.status = 'POSTED';
    emp.isActive = true;
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'POST', emp.empCode, 'POSTED', 'HR Director', `Posted employee record for ${emp.name}`)
    );
    return { success: true };
  }

  public unpostEmployee(id: string): { success: boolean; error?: string } {
    const emp = this.employees.find(e => e.id === id);
    if (!emp) return { success: false, error: 'Employee not found' };
    emp.status = 'UNPOSTED';
    emp.isActive = false;
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'UNPOST', emp.empCode, 'UNPOSTED', 'HR Director', `Unposted employee record for ${emp.name}`)
    );
    return { success: true };
  }

  public deleteEmployee(id: string): { success: boolean; error?: string } {
    const idx = this.employees.findIndex(e => e.id === id);
    if (idx === -1) return { success: false, error: 'Employee not found' };
    const emp = this.employees[idx];
    this.employees.splice(idx, 1);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'DELETE', emp.empCode, 'POSTED', 'HR Director', `Deleted employee record for ${emp.name}`)
    );
    return { success: true };
  }

  public getAttendance(monthYear: string): AttendanceRecord[] {
    return this.attendances.filter(a => a.monthYear === monthYear);
  }

  public getPayroll(monthYear: string): PayrollRecord[] {
    return this.payrolls.filter(p => p.monthYear === monthYear);
  }

  public getAttendanceSheetsLog(): {
    monthYear: string;
    totalStaff: number;
    totalDaysWorked: number;
    totalOvertimeHours: number;
    status: 'DRAFT' | 'POSTED';
    lockedAt?: string;
    lockedBy?: string;
    hasPayroll: boolean;
    payrollStatus?: 'DRAFT' | 'POSTED';
  }[] {
    const months = Array.from(new Set(this.attendances.map(a => a.monthYear))).sort().reverse();
    return months.map(m => {
      const records = this.attendances.filter(a => a.monthYear === m);
      const isPosted = records.length > 0 && records.every(a => a.status === 'POSTED');
      const payrolls = this.payrolls.filter(p => p.monthYear === m);
      const hasPayroll = payrolls.length > 0;
      const payrollPosted = hasPayroll && payrolls.every(p => p.status === 'POSTED');

      return {
        monthYear: m,
        totalStaff: records.length,
        totalDaysWorked: records.reduce((sum, r) => sum + r.daysWorked, 0),
        totalOvertimeHours: records.reduce((sum, r) => sum + r.overtimeHours, 0),
        status: isPosted ? 'POSTED' : 'DRAFT',
        lockedAt: records[0]?.lockedAt,
        lockedBy: records[0]?.lockedBy,
        hasPayroll,
        payrollStatus: hasPayroll ? (payrollPosted ? 'POSTED' : 'DRAFT') : undefined
      };
    });
  }

  public getPayrollSheetsLog(): {
    monthYear: string;
    totalEmployees: number;
    totalGrossPay: number;
    totalDeductions: number;
    totalNetPay: number;
    status: 'DRAFT' | 'POSTED';
    postedAt?: string;
    postedBy?: string;
    paymentMethod?: 'CASH' | 'BANK_TRANSFER';
    bankAccountName?: string;
  }[] {
    const months = Array.from(new Set(this.payrolls.map(p => p.monthYear))).sort().reverse();
    return months.map(m => {
      const records = this.payrolls.filter(p => p.monthYear === m);
      const isPosted = records.length > 0 && records.every(p => p.status === 'POSTED');
      const totalGross = records.reduce((sum, r) => sum + (r.grossPay || 0), 0);
      const totalDeds = records.reduce((sum, r) => sum + (r.totalDeductions || 0), 0);
      const totalNet = records.reduce((sum, r) => sum + (r.netPay || 0), 0);
      const first = records[0];

      return {
        monthYear: m,
        totalEmployees: records.length,
        totalGrossPay: Number(totalGross.toFixed(2)),
        totalDeductions: Number(totalDeds.toFixed(2)),
        totalNetPay: Number(totalNet.toFixed(2)),
        status: isPosted ? 'POSTED' : 'DRAFT',
        postedAt: first?.postedAt,
        postedBy: first?.postedBy,
        paymentMethod: first?.paymentMethod,
        bankAccountName: first?.bankAccountName
      };
    });
  }

  public createAttendanceSheet(monthYear: string): { success: boolean; records: AttendanceRecord[]; error?: string } {
    const existing = this.attendances.filter(a => a.monthYear === monthYear);
    if (existing.length > 0) {
      return { success: true, records: existing };
    }

    const activeEmployees = this.employees.filter(e => e.isActive !== false && e.status !== 'UNPOSTED');
    if (activeEmployees.length === 0) {
      return { success: false, records: [], error: 'No active employees found to create attendance sheet.' };
    }

    const newRecords: AttendanceRecord[] = activeEmployees.map(emp => ({
      id: `att-${emp.id}-${monthYear}`,
      employeeId: emp.id,
      employeeName: emp.name,
      empCode: emp.empCode,
      monthYear,
      daysWorked: 30,
      overtimeHours: 0,
      status: 'DRAFT'
    }));

    this.attendances.push(...newRecords);
    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'CREATE', `ATT-${monthYear}`, 'DRAFT', 'HR Manager', `Created attendance sheet for ${monthYear} (${newRecords.length} active staff)`)
    );
    return { success: true, records: newRecords };
  }

  public deleteAttendanceSheet(monthYear: string): { success: boolean; error?: string } {
    const payrollExists = this.payrolls.some(p => p.monthYear === monthYear);
    if (payrollExists) {
      return {
        success: false,
        error: `Cannot delete attendance for ${monthYear}: Payroll records already exist for this month. Please delete or unpost payroll first.`
      };
    }

    const beforeCount = this.attendances.length;
    this.attendances = this.attendances.filter(a => a.monthYear !== monthYear);
    const deletedCount = beforeCount - this.attendances.length;

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'DELETE', `ATT-${monthYear}`, 'POSTED', 'HR Lead', `Deleted attendance sheet for ${monthYear} (${deletedCount} records removed)`)
    );
    return { success: true };
  }

  public updateAttendance(recordId: string, daysWorked: number, overtimeHours: number): AttendanceRecord {
    const rec = this.attendances.find(a => a.id === recordId);
    if (!rec) throw new Error('Attendance record not found');
    if (rec.status === 'POSTED') throw new Error('Cannot edit a POSTED attendance record. Unpost it first.');
    rec.daysWorked = Math.max(0, Math.min(31, daysWorked));
    rec.overtimeHours = Math.max(0, overtimeHours);
    return rec;
  }

  public postAttendanceSheet(monthYear: string, postedBy: string): { success: boolean; count: number; error?: string } {
    const list = this.attendances.filter(a => a.monthYear === monthYear);
    if (list.length === 0) {
      return { success: false, count: 0, error: `No attendance records found for ${monthYear}. Please create attendance sheet first.` };
    }
    list.forEach(a => {
      a.status = 'POSTED';
      a.lockedAt = new Date().toISOString();
      a.lockedBy = postedBy;
    });

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'POST', `ATT-${monthYear}`, 'POSTED', postedBy, `Locked and posted monthly attendance sheet for ${monthYear} (${list.length} staff)`)
    );

    // Auto-initialize DRAFT payroll so it's ready in Payroll Log
    this.runPayrollCalculation(monthYear);

    return { success: true, count: list.length };
  }

  public unpostAttendanceSheet(monthYear: string): { success: boolean; error?: string } {
    const payrollPosted = this.payrolls.some(p => p.monthYear === monthYear && p.status === 'POSTED');
    if (payrollPosted) {
      return { success: false, error: `Cannot unpost attendance for ${monthYear} because payroll has already been POSTED. Please unpost payroll first.` };
    }

    const list = this.attendances.filter(a => a.monthYear === monthYear);
    list.forEach(a => {
      a.status = 'UNPOSTED';
      a.lockedAt = undefined;
    });

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'UNPOST', `ATT-${monthYear}`, 'UNPOSTED', 'HR Lead', `Unlocked attendance sheet for ${monthYear}`)
    );

    return { success: true };
  }

  // --- Employee Advances & Loans (EMI) Management ---
  public getEmployeeLoans(employeeId?: string): EmployeeLoan[] {
    if (employeeId) {
      return this.employeeLoans.filter(l => l.employeeId === employeeId);
    }
    return this.employeeLoans;
  }

  public createEmployeeLoan(data: {
    employeeId: string;
    type: 'SALARY_ADVANCE' | 'INSTALLMENT_LOAN';
    principalAmount: number;
    totalMonths?: number;
    startMonth: string;
    disbursementAccount?: string;
    disbursementMethod?: 'CASH' | 'BANK_TRANSFER';
    notes?: string;
  }): { success: boolean; loan?: EmployeeLoan; error?: string } {
    const emp = this.employees.find(e => e.id === data.employeeId);
    if (!emp) return { success: false, error: 'Employee not found' };

    const principal = Number(data.principalAmount) || 0;
    if (principal <= 0) return { success: false, error: 'Principal amount must be greater than zero.' };

    const months = data.type === 'SALARY_ADVANCE' ? 1 : Math.max(1, Number(data.totalMonths) || 1);
    const emi = Number((principal / months).toFixed(2));

    const loan: EmployeeLoan = {
      id: `loan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      empCode: emp.empCode,
      type: data.type,
      principalAmount: principal,
      emiAmount: emi,
      totalMonths: months,
      startMonth: data.startMonth || new Date().toISOString().slice(0, 7),
      remainingAmount: principal,
      status: 'ACTIVE',
      disbursementAccount: data.disbursementAccount,
      disbursementMethod: data.disbursementMethod || 'BANK_TRANSFER',
      notes: data.notes,
      createdAt: new Date().toISOString()
    };

    this.employeeLoans.unshift(loan);

    // Optional General Ledger Entry on Disbursement:
    // Debit: 1135-00 Staff Advance & Loan Receivables
    // Credit: Bank or Cash
    const loanAssetAcc = this.coaAccounts.find(a => a.code === '1135-00') || this.coaAccounts.find(a => a.name.toLowerCase().includes('advance'));
    const sourceAcc = data.disbursementAccount
      ? this.coaAccounts.find(a => a.id === data.disbursementAccount || a.code === data.disbursementAccount)
      : (data.disbursementMethod === 'CASH'
          ? this.coaAccounts.find(a => a.code === '1110-00')
          : this.coaAccounts.find(a => a.code === '1120-00'));

    if (loanAssetAcc && sourceAcc) {
      this.vouchers.push({
        id: `vch-loan-${loan.id}`,
        voucherNo: `JV-LOAN-${Date.now().toString().slice(-6)}`,
        type: 'JOURNAL',
        status: 'POSTED',
        date: new Date().toISOString().slice(0, 10),
        narration: `Issued ${data.type === 'SALARY_ADVANCE' ? 'Salary Advance' : 'Staff Loan'} to ${emp.name} (${emp.empCode}) via ${sourceAcc.name}`,
        totalDebit: principal,
        totalCredit: principal,
        currency: 'AED',
        exchangeRate: 1.0,
        lines: [
          {
            id: `vli-loan-deb-${Date.now()}`,
            accountId: loanAssetAcc.id,
            accountCode: loanAssetAcc.code,
            accountName: loanAssetAcc.name,
            debitAmount: principal,
            creditAmount: 0
          },
          {
            id: `vli-loan-crd-${Date.now()}`,
            accountId: sourceAcc.id,
            accountCode: sourceAcc.code,
            accountName: sourceAcc.name,
            debitAmount: 0,
            creditAmount: principal
          }
        ],
        postedAt: new Date().toISOString(),
        postedBy: 'HR Manager',
        documentRef: loan.id
      });
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'CREATE', `LOAN-${emp.empCode}`, 'POSTED', 'HR Manager', `Issued ${data.type} of AED ${principal} to ${emp.name}`)
    );

    this.saveToDisk();
    return { success: true, loan };
  }

  public deleteEmployeeLoan(loanId: string): { success: boolean; error?: string } {
    const idx = this.employeeLoans.findIndex(l => l.id === loanId);
    if (idx === -1) return { success: false, error: 'Loan not found' };
    const loan = this.employeeLoans[idx];
    if (loan.remainingAmount < loan.principalAmount) {
      return { success: false, error: 'Cannot delete a loan that has already started receiving repayment deductions.' };
    }
    this.employeeLoans.splice(idx, 1);
    this.saveToDisk();
    return { success: true };
  }

  public updatePayrollSlipDeductions(
    slipId: string,
    advanceDeduction: number,
    loanEmiDeduction: number
  ): { success: boolean; slip?: PayrollRecord; error?: string } {
    const slip = this.payrolls.find(p => p.id === slipId);
    if (!slip) return { success: false, error: 'Payroll slip not found' };
    if (slip.status === 'POSTED') return { success: false, error: 'Cannot modify deductions on a POSTED slip. Unpost payroll first.' };

    const safeAdv = Math.max(0, Number(advanceDeduction) || 0);
    const safeLoan = Math.max(0, Number(loanEmiDeduction) || 0);
    const totalDeds = Number((safeAdv + safeLoan).toFixed(2));

    if (totalDeds > slip.grossPay) {
      return { success: false, error: `Total deductions (AED ${totalDeds}) cannot exceed gross pay (AED ${slip.grossPay}).` };
    }

    slip.advanceDeduction = safeAdv;
    slip.loanEmiDeduction = safeLoan;
    slip.totalDeductions = totalDeds;
    slip.netPay = Number((slip.grossPay - totalDeds).toFixed(2));

    this.saveToDisk();
    return { success: true, slip };
  }

  public runPayrollCalculation(monthYear: string): { success: boolean; records?: PayrollRecord[]; errors?: string[] } {
    const attList = this.attendances.filter(a => a.monthYear === monthYear);
    if (attList.length === 0) {
      return { success: false, errors: [`No attendance records found for ${monthYear}. Please create and post attendance first.`] };
    }
    const hasDraft = attList.some(a => a.status !== 'POSTED');
    if (hasDraft) {
      return { success: false, errors: [`Cannot run payroll: Attendance sheet for ${monthYear} is still in DRAFT. Please verify and POST attendance first.`] };
    }

    // Pass active loans to auto-populate deductions
    const result = HREngine.generatePayrollRun(this.employees, this.attendances, monthYear, this.employeeLoans);
    if (result.unpostedEmployees.length > 0) {
      return { success: false, errors: result.unpostedEmployees };
    }

    // Replace draft records for this month
    this.payrolls = this.payrolls.filter(p => p.monthYear !== monthYear || p.status === 'POSTED');
    this.payrolls.push(...result.records);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'CREATE', `PAY-${monthYear}`, 'DRAFT', 'HR Payroll Engine', `Processed payroll calculations for ${monthYear}`)
    );

    this.saveToDisk();
    return { success: true, records: result.records };
  }

  public deletePayroll(monthYear: string): { success: boolean; error?: string } {
    const hasPosted = this.payrolls.some(p => p.monthYear === monthYear && p.status === 'POSTED');
    if (hasPosted) {
      return { success: false, error: `Cannot delete payroll for ${monthYear}: Payroll slips are already POSTED. Unpost them first.` };
    }

    const before = this.payrolls.length;
    this.payrolls = this.payrolls.filter(p => p.monthYear !== monthYear);
    const removed = before - this.payrolls.length;

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'DELETE', `PAY-${monthYear}`, 'POSTED', 'HR Lead', `Deleted draft payroll for ${monthYear} (${removed} records removed)`)
    );
    this.saveToDisk();
    return { success: true };
  }

  public postPayroll(
    identifier: string,
    postedBy: string,
    paymentMethod: 'CASH' | 'BANK_TRANSFER' = 'BANK_TRANSFER',
    bankAccountId?: string
  ): { success: boolean; error?: string } {
    const single = this.payrolls.find(p => p.id === identifier);
    if (single) {
      single.status = 'POSTED';
      single.postedAt = new Date().toISOString();
      single.paymentMethod = paymentMethod;
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('HR', 'POST', `PAY-SLIP-${single.empCode}`, 'POSTED', postedBy, `Approved and posted payroll slip for ${single.employeeName}`)
      );
      this.saveToDisk();
      return { success: true };
    }

    const list = this.payrolls.filter(p => p.monthYear === identifier);
    if (list.length === 0) return { success: false, error: 'No payroll records found for this month or slip ID. Run payroll calculation first.' };

    const chosenBank = bankAccountId ? this.coaAccounts.find(a => a.id === bankAccountId || a.code === bankAccountId) : null;
    const defaultBank = this.coaAccounts.find(a => a.code === '1120-00') || this.coaAccounts.find(a => a.classification === 'ASSET' && a.name.toLowerCase().includes('bank'));
    const defaultCash = this.coaAccounts.find(a => a.code === '1110-00') || this.coaAccounts.find(a => a.classification === 'ASSET' && a.name.toLowerCase().includes('cash'));

    const payableAcc = this.coaAccounts.find(a => a.code === '2310-00') || this.coaAccounts.find(a => a.classification === 'LIABILITY' && a.name.toLowerCase().includes('payroll'));
    const expenseAcc = this.coaAccounts.find(a => a.code === '5310-00') || this.coaAccounts.find(a => a.classification === 'EXPENSE' && a.name.toLowerCase().includes('salar'));
    const loanAssetAcc = this.coaAccounts.find(a => a.code === '1135-00') || this.coaAccounts.find(a => a.name.toLowerCase().includes('advance'));

    list.forEach(p => {
      p.status = 'POSTED';
      p.postedAt = new Date().toISOString();
      p.paymentMethod = paymentMethod;
      p.bankAccountId = payableAcc?.id;
      p.bankAccountName = payableAcc?.name;

      // Update remaining amounts on active loans
      const totalDed = (Number(p.advanceDeduction) || 0) + (Number(p.loanEmiDeduction) || 0);
      if (totalDed > 0) {
        const empLoans = this.employeeLoans.filter(l => l.employeeId === p.employeeId && l.status === 'ACTIVE');
        let remainingToDeduct = totalDed;
        for (const l of empLoans) {
          if (remainingToDeduct <= 0) break;
          const cut = Math.min(l.remainingAmount, remainingToDeduct);
          l.remainingAmount = Number((l.remainingAmount - cut).toFixed(2));
          if (l.remainingAmount <= 0) {
            l.status = 'PAID';
          }
          remainingToDeduct -= cut;
        }
      }
    });

    const totalGross = list.reduce((sum, p) => sum + p.grossPay, 0);
    const totalDeductions = list.reduce((sum, p) => sum + (Number(p.totalDeductions) || 0), 0);
    const totalNet = list.reduce((sum, p) => sum + p.netPay, 0);

    // Double Entry Journal Voucher in General Ledger:
    // Debit: 5310-00 Staff Salaries Expense (Total Gross)
    // Credit: 1135-00 Staff Advance & Loan Receivables (Total Deductions recovered)
    // Credit: 2310-00 Accrued Staff Payroll & End-of-Service Gratuity (Total Net Payable)
    const voucherLines: VoucherLine[] = [
      {
        id: `vli-${Date.now()}-1-${Math.random().toString(36).substring(2, 7)}`,
        accountId: expenseAcc?.id || 'acc-5310',
        accountCode: expenseAcc?.code || '5310-00',
        accountName: expenseAcc?.name || 'Staff Salaries, Live Host Commissions & Overtime',
        debitAmount: totalGross,
        creditAmount: 0
      }
    ];

    if (totalDeductions > 0 && loanAssetAcc) {
      voucherLines.push({
        id: `vli-${Date.now()}-ded-${Math.random().toString(36).substring(2, 7)}`,
        accountId: loanAssetAcc.id,
        accountCode: loanAssetAcc.code,
        accountName: loanAssetAcc.name,
        debitAmount: 0,
        creditAmount: totalDeductions
      });
    }

    voucherLines.push({
      id: `vli-${Date.now()}-2-${Math.random().toString(36).substring(2, 7)}`,
      accountId: payableAcc?.id || 'acc-2310',
      accountCode: payableAcc?.code || '2310-00',
      accountName: payableAcc?.name || 'Accrued Staff Payroll & End-of-Service Gratuity',
      debitAmount: 0,
      creditAmount: totalNet
    });

    this.vouchers.push({
      id: `vch-${Date.now()}`,
      voucherNo: `JV-PAY-${identifier}`,
      type: 'JOURNAL',
      status: 'POSTED',
      date: new Date().toISOString().slice(0, 10),
      narration: `Monthly payroll salary accrual for ${identifier} (Gross: AED ${totalGross.toFixed(2)}, Advances/Loans Recovered: AED ${totalDeductions.toFixed(2)}, Accrued Salaries Payable: AED ${totalNet.toFixed(2)})`,
      totalDebit: totalGross,
      totalCredit: totalGross,
      currency: 'AED',
      exchangeRate: 1.0,
      lines: voucherLines,
      postedAt: new Date().toISOString(),
      postedBy,
      documentRef: `PAY-${identifier}`
    });

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'POST', `PAY-${identifier}`, 'POSTED', postedBy, `Posted payroll for ${identifier} (Gross: AED ${totalGross.toFixed(2)}, Net: AED ${totalNet.toFixed(2)}) and linked to General Ledger (Debit 5310-00, Credit 2310-00)`)
    );

    this.saveToDisk();
    return { success: true };
  }

  public unpostPayroll(identifier: string): { success: boolean; error?: string } {
    const single = this.payrolls.find(p => p.id === identifier);
    if (single) {
      single.status = 'UNPOSTED';
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('HR', 'UNPOST', `PAY-SLIP-${single.empCode}`, 'UNPOSTED', 'HR Director', `Unposted payroll slip for ${single.employeeName}`)
      );
      this.saveToDisk();
      return { success: true };
    }

    const list = this.payrolls.filter(p => p.monthYear === identifier);
    list.forEach(p => {
      // Revert deduction recovery on unposting
      const totalDed = (Number(p.advanceDeduction) || 0) + (Number(p.loanEmiDeduction) || 0);
      if (totalDed > 0) {
        const empLoans = this.employeeLoans.filter(l => l.employeeId === p.employeeId);
        let remainingToRevert = totalDed;
        for (const l of empLoans) {
          if (remainingToRevert <= 0) break;
          const space = l.principalAmount - l.remainingAmount;
          const restore = Math.min(space, remainingToRevert);
          l.remainingAmount = Number((l.remainingAmount + restore).toFixed(2));
          if (l.remainingAmount > 0) {
            l.status = 'ACTIVE';
          }
          remainingToRevert -= restore;
        }
      }
      p.status = 'UNPOSTED';
    });

    // Remove the associated Journal Voucher so GL stays balanced
    this.vouchers = this.vouchers.filter(v => v.documentRef !== `PAY-${identifier}`);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('HR', 'UNPOST', `PAY-${identifier}`, 'UNPOSTED', 'HR Director', `Unposted payroll run for ${identifier} and reversed advance/loan repayments`)
    );

    this.saveToDisk();
    return { success: true };
  }

  // --- Purchase & OCR Sack Breakdown ---
  public getPurchaseInvoices(): PurchaseInvoice[] {
    return this.purchaseInvoices;
  }

  public createPurchaseInvoice(data: any): PurchaseInvoice {
    const nextIdx = this.purchaseInvoices.length + 1;
    const invoiceNo = data.invoiceNo || `PUR-2026-${String(nextIdx).padStart(4, '0')}`;
    const applyVat = data.applyVat !== false;
    const vatRate = applyVat ? (data.vatRatePercent !== undefined ? data.vatRatePercent : (this.companyProfile.vatRatePercent || 5)) : 0;
    let subTotal = Number(data.subTotal) || 0;
    if (subTotal === 0 && Array.isArray(data.items) && data.items.length > 0) {
      subTotal = data.items.reduce((sum: number, item: any) => sum + (Number(item.lineTotal) || 0), 0);
    }
    if (subTotal === 0 && Number(data.totalAmount) > 0) {
      subTotal = Number(data.totalAmount);
    }
    const freight = Number(data.freightAmount) || 0;
    const customs = Number(data.customsDutyAmount) || 0;
    const handling = Number(data.terminalHandlingAmount) || 0;
    const taxableAmount = subTotal + freight + handling;
    const vatAmount = applyVat ? Number(((taxableAmount * vatRate) / 100).toFixed(2)) : 0;
    const totalAmount = Number(data.totalAmount) > 0 && subTotal === Number(data.totalAmount) && freight === 0 && customs === 0 && handling === 0 && !applyVat
      ? Number(data.totalAmount)
      : Number((subTotal + freight + customs + handling + vatAmount).toFixed(2));
    const exchangeRate = Number(data.exchangeRate) || 1.0;
    const grandTotalAed = data.currency === 'AED' ? totalAmount : Number((totalAmount * exchangeRate).toFixed(2));

    const invoice: PurchaseInvoice = {
      id: `pur-${Date.now()}`,
      invoiceNo,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      supplierTrn: data.supplierTrn,
      date: data.date || new Date().toISOString().slice(0, 10),
      dueDate: data.dueDate,
      status: data.status || 'DRAFT',
      currency: data.currency || 'AED',
      exchangeRate,
      subTotal,
      applyVat,
      vatRatePercent: vatRate,
      vatAmount,
      totalAmount,
      notes: data.notes,
      convertedToInward: false,
      items: data.items || [],
      containerNo: data.containerNo,
      blAirwayBillNo: data.blAirwayBillNo,
      portOfEntry: data.portOfEntry,
      freightAmount: freight,
      customsDutyAmount: customs,
      terminalHandlingAmount: handling,
      totalBalesCount: data.totalBalesCount,
      totalGrossWeightKg: data.totalGrossWeightKg,
      grandTotalAed
    };

    this.purchaseInvoices.unshift(invoice);

    // If created directly in POSTED status, immediately post to supplier Khata in base currency AED
    if (invoice.status === 'POSTED') {
      const supplier = this.parties.find(p => p.id === invoice.supplierId) ||
                       this.parties.find(p => p.name.toLowerCase() === (invoice.supplierName || '').toLowerCase());
      if (supplier) {
        supplier.currentBalance = Number((supplier.currentBalance - grandTotalAed).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-pur-${invoice.id}-${Date.now()}`,
          partyId: supplier.id,
          date: invoice.date,
          docType: 'INVOICE',
          docRef: invoice.invoiceNo,
          debit: 0,
          credit: grandTotalAed,
          balance: supplier.currentBalance,
          description: `Purchased bulk bales on invoice ${invoice.invoiceNo} (${invoice.currency} ${invoice.totalAmount} @ ${invoice.exchangeRate})`
        });
      }
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'CREATE', invoice.invoiceNo, invoice.status, 'Procurement Officer', `Created Purchase Invoice ${invoice.invoiceNo} from supplier ${invoice.supplierName} (Total: AED ${grandTotalAed}, VAT: ${applyVat ? 'AED ' + vatAmount : 'Exempt'})`)
    );

    return invoice;
  }

  public updatePurchaseInvoice(invoiceId: string, data: any): { success: boolean; invoice?: PurchaseInvoice; error?: string } {
    const invoice = this.purchaseInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    // Check if any sorting has started for bales of this invoice
    const relatedBales = this.inwardGatePasses.filter(
      b => b.purchaseInvoiceId === invoiceId || b.purchaseInvoiceNo === invoice.invoiceNo
    );

    const check = PurchaseEngine.validateInvoiceModification(invoice, relatedBales);
    if (!check.canEdit) {
      return { success: false, error: check.error };
    }

    const previousTotalAed = invoice.grandTotalAed || (invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2)));
    const previousStatus = invoice.status;

    const applyVat = data.applyVat !== undefined ? Boolean(data.applyVat) : (invoice.applyVat !== undefined ? invoice.applyVat : true);
    const vatRate = applyVat ? (data.vatRatePercent !== undefined ? data.vatRatePercent : (invoice.vatRatePercent || this.companyProfile.vatRatePercent || 5)) : 0;
    
    let subTotal = Number(data.subTotal) || 0;
    if (subTotal === 0 && Array.isArray(data.items) && data.items.length > 0) {
      subTotal = data.items.reduce((sum: number, item: any) => sum + (Number(item.lineTotal) || 0), 0);
    }
    if (subTotal === 0 && Number(data.totalAmount) > 0) {
      subTotal = Number(data.totalAmount);
    }

    const freight = data.freightAmount !== undefined ? Number(data.freightAmount) : (invoice.freightAmount || 0);
    const customs = data.customsDutyAmount !== undefined ? Number(data.customsDutyAmount) : (invoice.customsDutyAmount || 0);
    const handling = data.terminalHandlingAmount !== undefined ? Number(data.terminalHandlingAmount) : (invoice.terminalHandlingAmount || 0);
    const taxableAmount = subTotal + freight + handling;
    const vatAmount = applyVat ? Number(((taxableAmount * vatRate) / 100).toFixed(2)) : 0;
    const totalAmount = Number((subTotal + freight + customs + handling + vatAmount).toFixed(2));
    const exchangeRate = Number(data.exchangeRate) || invoice.exchangeRate || 1.0;
    const newGrandTotalAed = (data.currency || invoice.currency) === 'AED' ? totalAmount : Number((totalAmount * exchangeRate).toFixed(2));

    // Update invoice fields
    if (data.invoiceNo) invoice.invoiceNo = data.invoiceNo;
    if (data.supplierId) invoice.supplierId = data.supplierId;
    if (data.supplierName) invoice.supplierName = data.supplierName;
    if (data.supplierTrn !== undefined) invoice.supplierTrn = data.supplierTrn;
    if (data.date) invoice.date = data.date;
    if (data.dueDate !== undefined) invoice.dueDate = data.dueDate;
    if (data.currency) invoice.currency = data.currency;
    invoice.exchangeRate = exchangeRate;
    invoice.subTotal = subTotal;
    invoice.applyVat = applyVat;
    invoice.vatRatePercent = vatRate;
    invoice.vatAmount = vatAmount;
    invoice.totalAmount = totalAmount;
    invoice.freightAmount = freight;
    invoice.customsDutyAmount = customs;
    invoice.terminalHandlingAmount = handling;
    invoice.grandTotalAed = newGrandTotalAed;
    if (data.notes !== undefined) invoice.notes = data.notes;
    if (data.containerNo !== undefined) invoice.containerNo = data.containerNo;
    if (data.blAirwayBillNo !== undefined) invoice.blAirwayBillNo = data.blAirwayBillNo;
    if (data.portOfEntry !== undefined) invoice.portOfEntry = data.portOfEntry;
    if (data.totalBalesCount !== undefined) invoice.totalBalesCount = data.totalBalesCount;
    if (data.totalGrossWeightKg !== undefined) invoice.totalGrossWeightKg = data.totalGrossWeightKg;
    if (data.items) invoice.items = data.items;

    // Adjust supplier ledger if invoice was POSTED
    if (previousStatus === 'POSTED') {
      const diffAed = Number((newGrandTotalAed - previousTotalAed).toFixed(2));
      if (Math.abs(diffAed) > 0.001) {
        const supplier = this.parties.find(p => p.id === invoice.supplierId) ||
                         this.parties.find(p => p.name.toLowerCase() === (invoice.supplierName || '').toLowerCase());
        if (supplier) {
          supplier.currentBalance = Number((supplier.currentBalance - diffAed).toFixed(2));
          this.partyKhataLogs.push({
            id: `pkl-adj-${invoice.id}-${Date.now()}`,
            partyId: supplier.id,
            date: invoice.date,
            docType: 'JV',
            docRef: `ADJ-${invoice.invoiceNo}`,
            debit: diffAed < 0 ? Math.abs(diffAed) : 0,
            credit: diffAed > 0 ? diffAed : 0,
            balance: supplier.currentBalance,
            description: `Adjustment on edited invoice ${invoice.invoiceNo} (Diff: AED ${diffAed})`
          });
        }
      }
    }

    // Update related unopened bales' metadata if present
    relatedBales.forEach(b => {
      b.supplierId = invoice.supplierId;
      b.supplierName = invoice.supplierName;
      b.purchaseInvoiceNo = invoice.invoiceNo;
    });

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'EDIT', invoice.invoiceNo, invoice.status, 'Procurement Lead', `Updated Purchase Invoice ${invoice.invoiceNo} details (Total: AED ${newGrandTotalAed}, VAT: ${applyVat ? 'AED ' + vatAmount : 'Exempt'})`)
    );

    return { success: true, invoice };
  }

  public deletePurchaseInvoice(invoiceId: string): { success: boolean; error?: string } {
    const invoice = this.purchaseInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    // Check all related bales for sorting activity
    const relatedBales = this.inwardGatePasses.filter(
      b => b.purchaseInvoiceId === invoiceId || b.purchaseInvoiceNo === invoice.invoiceNo
    );

    const check = PurchaseEngine.validateInvoiceDeletion(invoice, relatedBales);
    if (!check.canDelete) return { success: false, error: check.error };

    // If was POSTED, reverse supplier balance
    if (invoice.status === 'POSTED') {
      const totalAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
      const supplier = this.parties.find(p => p.id === invoice.supplierId) ||
                       this.parties.find(p => p.name.toLowerCase() === (invoice.supplierName || '').toLowerCase());
      if (supplier) {
        supplier.currentBalance = Number((supplier.currentBalance + totalAed).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-rev-${invoice.id}-${Date.now()}`,
          partyId: supplier.id,
          date: new Date().toISOString().slice(0, 10),
          docType: 'JV',
          docRef: `DEL-${invoice.invoiceNo}`,
          debit: totalAed,
          credit: 0,
          balance: supplier.currentBalance,
          description: `Reversal on deletion of invoice ${invoice.invoiceNo}`
        });
      }
    }

    // Cleanly remove any unopened / 0-piece bales linked to this deleted invoice
    this.inwardGatePasses = this.inwardGatePasses.filter(
      b => b.purchaseInvoiceId !== invoiceId && b.purchaseInvoiceNo !== invoice.invoiceNo
    );

    this.purchaseInvoices = this.purchaseInvoices.filter(i => i.id !== invoiceId);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'DELETE', invoice.invoiceNo, 'UNPOSTED', 'Procurement Mgr', `Deleted purchase invoice ${invoice.invoiceNo} and cleared associated un-sorted bales`)
    );

    return { success: true };
  }

  public postPurchaseInvoice(invoiceId: string, postedBy: string): { success: boolean; error?: string } {
    const invoice = this.purchaseInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status === 'POSTED') return { success: false, error: 'Invoice already posted' };

    invoice.status = 'POSTED';

    // Update supplier khata in base currency AED
    const totalAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
    const supplier = this.parties.find(p => p.id === invoice.supplierId) ||
                     this.parties.find(p => p.name.toLowerCase() === (invoice.supplierName || '').toLowerCase());
    if (supplier) {
      supplier.currentBalance = Number((supplier.currentBalance - totalAed).toFixed(2));
      this.partyKhataLogs.push({
        id: `pkl-pur-${invoice.id}-${Date.now()}`,
        partyId: supplier.id,
        date: invoice.date,
        docType: 'INVOICE',
        docRef: invoice.invoiceNo,
        debit: 0,
        credit: totalAed,
        balance: supplier.currentBalance,
        description: `Purchased bulk bales on invoice ${invoice.invoiceNo} (${invoice.currency} ${invoice.totalAmount} @ ${invoice.exchangeRate})`
      });
    }

    // 2. Automated Balanced Dual-Entry COA Voucher for Bulk Bale Purchase
    // Debit: 1140-00 (Inventory - Raw Bulk Bales)
    // Credit: 2110-00 (Accounts Payable - Trade Suppliers)
    const rawBaleInvAcc = this.getOrCreateAccount('1140', 'Inventory - Raw Bulk Bales (Unopened Sacks & Containers)', 'ASSET');
    const apAcc = this.getOrCreateAccount('2110', 'Accounts Payable - Trade Suppliers (Bale Exporters)', 'LIABILITY');

    const nextIdx = this.vouchers.length + 1;
    const voucherNo = `JV-PUR-${String(nextIdx).padStart(4, '0')}`;
    const voucherId = `vch-pur-${invoice.id}`;
    const voucher: Voucher = {
      id: voucherId,
      voucherNo,
      voucherType: 'JOURNAL',
      date: invoice.date || new Date().toISOString().slice(0, 10),
      currency: 'AED',
      exchangeRate: 1.0,
      referenceNo: invoice.invoiceNo,
      narration: `Bulk Bale Purchase Invoice ${invoice.invoiceNo} from ${invoice.supplierName || 'Trade Supplier'}`,
      status: 'POSTED',
      postedAt: new Date().toISOString(),
      postedBy,
      lines: [
        {
          id: `line-pur-${invoice.id}-dr`,
          accountId: rawBaleInvAcc.id,
          accountCode: rawBaleInvAcc.code,
          accountName: rawBaleInvAcc.name,
          debitAmount: totalAed,
          creditAmount: 0,
          narration: `Raw Bulk Bale Inward: Invoice ${invoice.invoiceNo}`
        },
        {
          id: `line-pur-${invoice.id}-cr`,
          accountId: supplier?.accountMap?.payableAccountId || apAcc.id,
          accountCode: apAcc.code,
          accountName: supplier ? `Accounts Payable - ${supplier.name}` : apAcc.name,
          debitAmount: 0,
          creditAmount: totalAed,
          narration: `Trade Supplier Payable: Invoice ${invoice.invoiceNo}`
        }
      ]
    };

    const { newLedgers, updatedAccounts } = FinanceEngine.postVoucherToLedger(
      voucher,
      this.coaAccounts,
      this.ledgers
    );
    this.vouchers.unshift(voucher);
    this.ledgers.push(...newLedgers);
    this.coaAccounts = updatedAccounts;

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'POST', invoice.invoiceNo, 'POSTED', postedBy, `Approved and posted Purchase Invoice ${invoice.invoiceNo}; updated supplier AP (AED ${totalAed}) and Raw Bale Inventory (1140-00)`)
    );

    return { success: true };
  }

  public unpostPurchaseInvoice(invoiceId: string): { success: boolean; error?: string } {
    const invoice = this.purchaseInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.convertedToInward) return { success: false, error: 'Cannot unpost invoice that has already been converted into an Inward Gate Pass' };

    invoice.status = 'UNPOSTED';

    // Reverse COA Voucher if posted
    const existingVoucher = this.vouchers.find(v => v.referenceNo === invoice.invoiceNo || v.id === `vch-pur-${invoice.id}`);
    if (existingVoucher && existingVoucher.status === 'POSTED') {
      this.unpostVoucher(existingVoucher.id);
    }

    // Reverse supplier AP in base currency AED
    const totalAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
    const supplier = this.parties.find(p => p.id === invoice.supplierId) ||
                     this.parties.find(p => p.name.toLowerCase() === (invoice.supplierName || '').toLowerCase());
    if (supplier) {
      supplier.currentBalance = Number((supplier.currentBalance + totalAed).toFixed(2));
      this.partyKhataLogs.push({
        id: `pkl-rev-${invoice.id}-${Date.now()}`,
        partyId: supplier.id,
        date: new Date().toISOString().slice(0, 10),
        docType: 'JV',
        docRef: `UNPOST-${invoice.invoiceNo}`,
        debit: totalAed,
        credit: 0,
        balance: supplier.currentBalance,
        description: `Unposted purchase invoice ${invoice.invoiceNo} reversal`
      });
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'UNPOST', invoice.invoiceNo, 'UNPOSTED', 'Procurement Lead', `Unposted purchase invoice ${invoice.invoiceNo}`)
    );

    return { success: true };
  }

  public setPurchaseInvoiceStatus(invoiceId: string, newStatus: DocumentStatus, updatedBy: string = 'Procurement Lead'): { success: boolean; error?: string } {
    const invoice = this.purchaseInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status === newStatus) return { success: true };

    if (invoice.convertedToInward && (newStatus === 'DRAFT' || newStatus === 'UNPOSTED')) {
      return { success: false, error: 'Cannot unpost or draft an invoice that has already been converted to an Inward Gate Pass' };
    }

    const previousStatus = invoice.status;
    const totalAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
    const supplier = this.parties.find(p => p.id === invoice.supplierId) ||
                     this.parties.find(p => p.name.toLowerCase() === (invoice.supplierName || '').toLowerCase());

    // Synchronize AP Khata ledger if switching to or from POSTED
    if (newStatus === 'POSTED' && previousStatus !== 'POSTED') {
      if (supplier) {
        supplier.currentBalance = Number((supplier.currentBalance - totalAed).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-pur-${invoice.id}-${Date.now()}`,
          partyId: supplier.id,
          date: invoice.date,
          docType: 'INVOICE',
          docRef: invoice.invoiceNo,
          debit: 0,
          credit: totalAed,
          balance: supplier.currentBalance,
          description: `Purchased bulk stock on invoice ${invoice.invoiceNo} (State: POSTED)`
        });
      }
    } else if (previousStatus === 'POSTED' && newStatus !== 'POSTED') {
      if (supplier) {
        supplier.currentBalance = Number((supplier.currentBalance + totalAed).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-rev-${invoice.id}-${Date.now()}`,
          partyId: supplier.id,
          date: new Date().toISOString().slice(0, 10),
          docType: 'JV',
          docRef: `REV-${invoice.invoiceNo}`,
          debit: totalAed,
          credit: 0,
          balance: supplier.currentBalance,
          description: `Reversal on status change from POSTED to ${newStatus}`
        });
      }
    }

    invoice.status = newStatus;

    this.auditLogs.unshift(
      AuditEngine.createLogEntry(
        'PURCHASE',
        newStatus === 'POSTED' ? 'POST' : newStatus === 'UNPOSTED' ? 'UNPOST' : 'EDIT',
        invoice.invoiceNo,
        newStatus,
        updatedBy,
        `Toggled batch status indicator from ${previousStatus} to ${newStatus}`
      )
    );

    return { success: true };
  }

  public convertInvoiceToInwardGatePass(invoiceId: string): {
    success: boolean;
    gatePass?: InwardGatePass;
    bales?: InwardGatePass[];
    error?: string;
  } {
    const invoice = this.purchaseInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.convertedToInward) return { success: false, error: 'Invoice already converted to an Inward Gate Pass' };
    if (invoice.status !== 'POSTED') return { success: false, error: 'Invoice must be in POSTED status before converting into Inward Gate Pass' };

    const cleanInvoiceNo = invoice.invoiceNo.replace(/[^a-zA-Z0-9]/g, '');
    const invItems = invoice.items || [];
    const totalInvoiceCostAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
    const createdBales: InwardGatePass[] = [];
    let globalIndex = 1;

    if (invItems.length > 0) {
      invItems.forEach(line => {
        const count = Number(line.packageCount) || 1;
        const weightPerBale = Number(((Number(line.totalWeight) || 45) / count).toFixed(2));
        const lineTotalAed = invoice.currency === 'AED' ? Number(line.lineTotal) : Number(((Number(line.lineTotal) || 0) * (invoice.exchangeRate || 1.0)).toFixed(2));
        const costPerBale = Number((lineTotalAed / count).toFixed(2));
        const costPerGram = weightPerBale > 0 ? Number((costPerBale / (weightPerBale * 1000)).toFixed(6)) : 0;

        for (let i = 1; i <= count; i++) {
          const nextIdx = this.inwardGatePasses.length + 1;
          const gatePassNo = `IGP-2026-${String(nextIdx).padStart(4, '0')}`;
          const padded = String(globalIndex).padStart(3, '0');
          const baleCode = `BAL-${cleanInvoiceNo}-${padded}`;

          const bale: InwardGatePass = {
            id: `igp-${Date.now()}-${globalIndex}`,
            gatePassNo,
            baleCode,
            baleCategory: line.itemName || 'Vintage Bulk Bale',
            purchaseInvoiceId: invoice.id,
            purchaseInvoiceNo: invoice.invoiceNo,
            supplierId: invoice.supplierId,
            supplierName: invoice.supplierName,
            date: new Date().toISOString().slice(0, 10),
            status: 'UNOPENED',
            sortingStatus: 'UNOPENED',
            totalBaleCost: costPerBale,
            totalBaleWeight: weightPerBale,
            costPerGram,
            brokenDownWeight: 0,
            remainingWeight: weightPerBale,
            pieceCount: 0,
            pieces: []
          };

          this.inwardGatePasses.unshift(bale);
          createdBales.push(bale);
          globalIndex++;
        }
      });
    } else {
      const nextIdx = this.inwardGatePasses.length + 1;
      const gatePassNo = `IGP-2026-${String(nextIdx).padStart(4, '0')}`;
      const baleCode = `BAL-${cleanInvoiceNo}-001`;
      const wt = Number(invoice.totalGrossWeightKg) || 45.0;
      const costPerGram = wt > 0 ? Number((totalInvoiceCostAed / (wt * 1000)).toFixed(6)) : 0;

      const bale: InwardGatePass = {
        id: `igp-${Date.now()}-1`,
        gatePassNo,
        baleCode,
        baleCategory: 'Vintage Bulk Bale',
        purchaseInvoiceId: invoice.id,
        purchaseInvoiceNo: invoice.invoiceNo,
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        date: new Date().toISOString().slice(0, 10),
        status: 'UNOPENED',
        sortingStatus: 'UNOPENED',
        totalBaleCost: totalInvoiceCostAed,
        totalBaleWeight: wt,
        costPerGram,
        brokenDownWeight: 0,
        remainingWeight: wt,
        pieceCount: 0,
        pieces: []
      };
      this.inwardGatePasses.unshift(bale);
      createdBales.push(bale);
    }

    invoice.convertedToInward = true;
    invoice.inwardGatePassId = createdBales[0]?.id;

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'CREATE', invoice.invoiceNo, 'POSTED', 'Sortery Supervisor', `Converted Purchase Invoice ${invoice.invoiceNo} into ${createdBales.length} individual inward bale gate passes with barcodes`)
    );

    return { success: true, gatePass: createdBales[0], bales: createdBales };
  }

  public getInwardGatePasses(): InwardGatePass[] {
    return this.inwardGatePasses.map(b => {
      const totalBaleCost = Number(b.totalBaleCost ?? 0);
      const totalBaleWeight = Number(b.totalBaleWeight ?? 0);
      const costPerGram = b.costPerGram || (totalBaleWeight > 0 ? Number((totalBaleCost / (totalBaleWeight * 1000)).toFixed(6)) : 0);
      return {
        ...b,
        totalBaleCost,
        totalBaleWeight,
        costPerGram,
        brokenDownWeight: Number(b.brokenDownWeight ?? 0),
        remainingWeight: Number(b.remainingWeight ?? totalBaleWeight),
        pieceCount: b.pieces?.length || b.pieceCount || 0,
        pieces: b.pieces || []
      };
    });
  }

  public createBaleInward(data: {
    purchaseInvoiceNo: string;
    supplierName: string;
    supplierId?: string;
    totalBaleCostAed: number;
    totalBaleWeightKg: number;
    baleCategory: string;
    baleNumber?: string;
    vehicleNo?: string;
    containerNo?: string;
    notes?: string;
  }): { success: boolean; bale: InwardGatePass } {
    return this.transaction(() => {
      const nextIdx = this.inwardGatePasses.length + 1;
      const baleCode = data.baleNumber?.trim() || `BAL-2026-${String(nextIdx).padStart(3, '0')}`;
      const gatePassNo = `IGP-2026-${String(nextIdx).padStart(4, '0')}`;

      const totalCost = Number(data.totalBaleCostAed) || 0;
      const totalWeight = Number(data.totalBaleWeightKg) || 0;
      const costPerGram = PurchaseEngine.calculateCostPerGram(totalCost, totalWeight);

      let invoice = this.purchaseInvoices.find(p => p.invoiceNo.toLowerCase() === data.purchaseInvoiceNo.trim().toLowerCase());
      if (!invoice) {
        invoice = {
          id: `pur-${Date.now()}`,
          invoiceNo: data.purchaseInvoiceNo.trim(),
          supplierId: data.supplierId || 'pty-sup-01',
          supplierName: data.supplierName.trim(),
          date: new Date().toISOString().slice(0, 10),
          status: 'POSTED',
          currency: 'AED',
          exchangeRate: 1.0,
          subTotal: totalCost,
          vatAmount: Number((totalCost * 0.05).toFixed(2)),
          totalAmount: Number((totalCost * 1.05).toFixed(2)),
          convertedToInward: true,
          notes: `Bale Inward ${baleCode} - ${data.baleCategory} (${totalWeight} kg)`
        };
        this.purchaseInvoices.unshift(invoice);
      }

      const bale: InwardGatePass = {
        id: `bale-${Date.now()}`,
        gatePassNo,
        baleCode,
        baleCategory: data.baleCategory || 'Vintage Mix',
        purchaseInvoiceId: invoice.id,
        purchaseInvoiceNo: invoice.invoiceNo,
        supplierId: data.supplierId || invoice.supplierId,
        supplierName: data.supplierName || invoice.supplierName,
        date: new Date().toISOString().slice(0, 10),
        status: 'UNOPENED',
        sortingStatus: 'UNOPENED',
        totalBaleCost: totalCost,
        totalBaleWeight: totalWeight,
        costPerGram,
        brokenDownWeight: 0,
        remainingWeight: totalWeight,
        pieceCount: 0,
        vehicleNo: data.vehicleNo || 'DXB-C-98210',
        containerNo: data.containerNo || 'MSCU-902184-7',
        pieces: [],
        lastSavedAt: new Date().toISOString()
      };

      invoice.inwardGatePassId = bale.id;
      this.inwardGatePasses.unshift(bale);

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'PURCHASE',
          'CREATE',
          bale.baleCode || bale.gatePassNo,
          'UNOPENED',
          'Warehouse Inward Manager',
          `Registered Bale Inward ${bale.baleCode} (${bale.baleCategory}, ${bale.totalBaleWeight} KG, Cost/g: AED ${bale.costPerGram})`
        )
      );

      return { success: true, bale };
    }, {
      module: 'PURCHASE',
      entity: 'BALE_INWARD',
      action: 'CREATE',
      documentRef: data.purchaseInvoiceNo
    });
  }

  public addPieceToGatePass(gatePassId: string, pieceData: Partial<PieceBreakdownItem>): {
    success: boolean;
    piece?: PieceBreakdownItem;
    gatePass?: InwardGatePass;
    error?: string;
  } {
    const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };
    if (gatePass.status === 'POSTED') return { success: false, error: 'Cannot modify a POSTED Inward Gate Pass. Unpost it first.' };

    const barcode = pieceData.barcode || PurchaseEngine.generatePieceBarcode(gatePass.baleCode || gatePass.gatePassNo, gatePass.pieces.length + 1);

    // Support both gram weight input and KG input
    let weightGrams = Number(pieceData.weightGrams);
    let weightKg = Number(pieceData.weightKg);
    if (weightGrams && weightGrams > 0) {
      weightKg = Number((weightGrams / 1000).toFixed(3));
    } else if (weightKg && weightKg > 0) {
      weightGrams = Math.round(weightKg * 1000);
    } else {
      weightGrams = 285;
      weightKg = 0.285;
    }

    // Costing calculation: Cost_per_Gram = Total_Bale_Cost / (Total_Bale_Weight_KG * 1000)
    let costPerGram = gatePass.costPerGram;
    if (!costPerGram && gatePass.totalBaleCost && gatePass.totalBaleWeight) {
      costPerGram = PurchaseEngine.calculateCostPerGram(gatePass.totalBaleCost, gatePass.totalBaleWeight);
      gatePass.costPerGram = costPerGram;
    } else if (!costPerGram) {
      costPerGram = 0.05; // default fallback (AED 50 / KG)
      gatePass.costPerGram = costPerGram;
    }

    // Piece_Cost = Piece_Weight_Grams * Cost_per_Gram
    const calculatedCostPrice = pieceData.calculatedCostPrice || PurchaseEngine.calculatePieceCost(weightGrams, costPerGram);
    const estimatedPrice = Number(pieceData.estimatedPrice) || Math.max(120, Math.round(calculatedCostPrice * 3));

    const newPiece: PieceBreakdownItem = {
      id: `pie-${Date.now()}-${gatePass.pieces.length + 1}`,
      gatePassId,
      barcode,
      itemId: pieceData.itemId || 'itm-01',
      itemName: pieceData.itemName || 'Vintage Denim Trucker Jackets',
      brandName: pieceData.brandName || "Levi's",
      brandTier: pieceData.brandTier || 'Vintage American Grail',
      labelGrade: pieceData.labelGrade || 'Grade A+ (Pristine Cream)',
      shopLocation: pieceData.shopLocation || 'Central Warehouse (Al Quoz)',
      weightKg,
      weightGrams,
      costPerGram,
      calculatedCostPrice,
      costPrice: calculatedCostPrice,
      estimatedPrice,
      sizeScanned: pieceData.sizeScanned || 'L',
      countryOfOrigin: pieceData.countryOfOrigin || 'Made in USA',
      style: pieceData.style || 'Classic Vintage Trucker',
      frontImageUrl: pieceData.frontImageUrl,
      backImageUrl: pieceData.backImageUrl,
      tagImageUrl: pieceData.tagImageUrl,
      isSold: false,
      status: 'IN_STOCK',
      createdAt: new Date().toISOString()
    };

    gatePass.pieces.push(newPiece);

    // Sorted pieces immediately join active stock (Inventory - Finished Goods)
    const existingInvIdx = this.inventoryPieces.findIndex(p => p.barcode === newPiece.barcode);
    if (existingInvIdx >= 0) {
      this.inventoryPieces[existingInvIdx] = newPiece;
    } else {
      this.inventoryPieces.unshift(newPiece);
    }

    // Recalculate weights & depletion
    const depletion = PurchaseEngine.calculateBaleDepletion(gatePass.totalBaleWeight, gatePass.pieces);
    gatePass.brokenDownWeight = depletion.brokenDownWeightKg;
    gatePass.remainingWeight = depletion.remainingWeightKg;
    gatePass.pieceCount = gatePass.pieces.length;
    gatePass.sortingStatus = depletion.sortingStatus;
    gatePass.status = depletion.sortingStatus === 'FULLY_SORTED' ? 'FULLY_SORTED' : 'PARTIALLY_SORTED';

    return { success: true, piece: newPiece, gatePass };
  }

  public deletePieceFromGatePass(gatePassId: string, pieceId: string): { success: boolean; gatePass?: InwardGatePass; error?: string } {
    const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };
    if (gatePass.status === 'POSTED') return { success: false, error: 'Cannot delete piece from a POSTED gate pass' };

    const pieceIdx = gatePass.pieces.findIndex(p => p.id === pieceId);
    if (pieceIdx === -1) return { success: false, error: 'Piece not found' };

    const [deleted] = gatePass.pieces.splice(pieceIdx, 1);
    this.inventoryPieces = this.inventoryPieces.filter(p => p.barcode !== deleted.barcode);

    // Recalculate weights & depletion
    const depletion = PurchaseEngine.calculateBaleDepletion(gatePass.totalBaleWeight, gatePass.pieces);
    gatePass.brokenDownWeight = depletion.brokenDownWeightKg;
    gatePass.remainingWeight = depletion.remainingWeightKg;
    gatePass.pieceCount = gatePass.pieces.length;
    gatePass.sortingStatus = depletion.sortingStatus;
    gatePass.status = depletion.sortingStatus === 'FULLY_SORTED' ? 'FULLY_SORTED' : (depletion.pieceCount > 0 ? 'PARTIALLY_SORTED' : 'UNOPENED');

    return { success: true, gatePass };
  }

  public saveGatePassPartial(gatePassId: string, savedBy: string): {
    success: boolean;
    gatePass?: InwardGatePass;
    error?: string;
  } {
    return this.transaction(() => {
      const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
      if (!gatePass) return { success: false, error: 'Gate pass not found' };

      const depletion = PurchaseEngine.calculateBaleDepletion(gatePass.totalBaleWeight, gatePass.pieces);
      gatePass.brokenDownWeight = depletion.brokenDownWeightKg;
      gatePass.remainingWeight = depletion.remainingWeightKg;
      gatePass.pieceCount = gatePass.pieces.length;
      gatePass.sortingStatus = depletion.sortingStatus;
      gatePass.status = 'PARTIALLY_SORTED';
      gatePass.lastSavedAt = new Date().toISOString();

      // Ensure all already-sorted pieces have barcodes and enter inventory immediately
      gatePass.pieces.forEach(p => {
        p.status = p.status || 'IN_STOCK';
        const existingIdx = this.inventoryPieces.findIndex(existing => existing.barcode === p.barcode);
        if (existingIdx >= 0) {
          this.inventoryPieces[existingIdx] = { ...this.inventoryPieces[existingIdx], ...p };
        } else {
          this.inventoryPieces.push({ ...p, status: 'IN_STOCK' });
        }
      });

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'PURCHASE',
          'UPDATE',
          gatePass.gatePassNo,
          'PARTIALLY_SORTED',
          savedBy,
          `Saved Gate Pass ${gatePass.gatePassNo} midway as Partially Sorted: ${gatePass.pieces.length} pieces registered to inventory, ${gatePass.remainingWeight} KG remaining`
        )
      );

      return { success: true, gatePass };
    });
  }

  public batchAddPiecesToGatePass(gatePassId: string, pieces: Partial<PieceBreakdownItem>[]): {
    success: boolean;
    gatePass?: InwardGatePass;
    count: number;
    error?: string;
  } {
    const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, count: 0, error: 'Gate pass not found' };
    if (gatePass.status === 'POSTED') return { success: false, count: 0, error: 'Cannot modify a POSTED Inward Gate Pass' };

    pieces.forEach(p => {
      this.addPieceToGatePass(gatePassId, p);
    });

    return { success: true, gatePass, count: pieces.length };
  }

  public postInwardGatePass(gatePassId: string, postedBy: string): { success: boolean; error?: string } {
    const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };
    if (gatePass.status === 'POSTED') return { success: false, error: 'Gate pass already POSTED' };
    if (gatePass.pieces.length === 0) return { success: false, error: 'Cannot post an empty gate pass with 0 pieces' };

    gatePass.status = 'POSTED';
    gatePass.sortingStatus = 'FULLY_SORTED';
    gatePass.postedAt = new Date().toISOString();

    // Register pieces into real-time inventory room
    gatePass.pieces.forEach(p => {
      p.status = p.status || 'IN_STOCK';
      const existingIdx = this.inventoryPieces.findIndex(existing => existing.barcode === p.barcode);
      if (existingIdx >= 0) {
        this.inventoryPieces[existingIdx] = { ...this.inventoryPieces[existingIdx], ...p };
      } else {
        this.inventoryPieces.push({ ...p, status: 'IN_STOCK' });
      }
    });

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'POST', gatePass.gatePassNo, 'POSTED', postedBy, `Approved Inward Gate Pass ${gatePass.gatePassNo}; registered ${gatePass.pieces.length} piece barcodes into Active Inventory`)
    );

    return { success: true };
  }

  public unpostInwardGatePass(gatePassId: string): { success: boolean; error?: string } {
    const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };

    // Check if any piece from this gate pass is already sold
    const anyPieceSold = gatePass.pieces.some(p => p.isSold);
    if (anyPieceSold) {
      return { success: false, error: 'Cannot unpost gate pass because one or more pieces have already been sold on a Sales Invoice' };
    }

    gatePass.status = 'UNPOSTED';

    // Remove from active inventory room
    const pieceIds = new Set(gatePass.pieces.map(p => p.id));
    this.inventoryPieces = this.inventoryPieces.filter(p => !pieceIds.has(p.id));

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('PURCHASE', 'UNPOST', gatePass.gatePassNo, 'UNPOSTED', 'Sortery Lead', `Unposted Inward Gate Pass ${gatePass.gatePassNo}`)
    );

    return { success: true };
  }

  public setInwardGatePassStatus(gatePassId: string, newStatus: DocumentStatus, updatedBy: string = 'Sortery Supervisor'): { success: boolean; error?: string } {
    const gatePass = this.inwardGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };
    if (gatePass.status === newStatus) return { success: true };

    if (newStatus === 'POSTED') {
      return this.postInwardGatePass(gatePassId, updatedBy);
    } else if (newStatus === 'UNPOSTED' || newStatus === 'DRAFT' || newStatus === 'ARCHIVED') {
      const prevStatus = gatePass.status;
      if (prevStatus === 'POSTED') {
        const unpostRes = this.unpostInwardGatePass(gatePassId);
        if (!unpostRes.success) return unpostRes;
      }
      gatePass.status = newStatus;
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('PURCHASE', 'EDIT', gatePass.gatePassNo, newStatus, updatedBy, `Toggled batch status indicator to ${newStatus}`)
      );
      return { success: true };
    }
    return { success: false, error: 'Unsupported status value' };
  }

  public getInventoryPieces(): PieceBreakdownItem[] {
    return this.inventoryPieces;
  }

  public queryInventoryStock(filters?: InventoryFilterOptions): PieceBreakdownItem[] {
    let pieces = [...this.inventoryPieces];
    if (!filters) return pieces;

    if (filters.soldStatus === 'IN_STOCK') {
      pieces = pieces.filter(p => !p.isSold && p.status !== 'SOLD');
    } else if (filters.soldStatus === 'SOLD') {
      pieces = pieces.filter(p => p.isSold || p.status === 'SOLD');
    }

    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      pieces = pieces.filter(p =>
        p.barcode.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        p.brandName.toLowerCase().includes(q) ||
        p.brandTier?.toLowerCase().includes(q) ||
        p.style?.toLowerCase().includes(q)
      );
    }

    if (filters.searchBarcode) {
      pieces = pieces.filter(p => p.barcode.toLowerCase().includes(filters.searchBarcode!.toLowerCase()));
    }

    if (filters.brandName && filters.brandName !== 'ALL') {
      pieces = pieces.filter(p => p.brandName === filters.brandName);
    }

    if (filters.labelGrade && filters.labelGrade !== 'ALL') {
      pieces = pieces.filter(p => p.labelGrade === filters.labelGrade);
    }

    if (filters.category && filters.category !== 'ALL') {
      pieces = pieces.filter(p => p.itemId === filters.category || p.itemName.toLowerCase().includes(filters.category!.toLowerCase()));
    }

    if (filters.brandTier && filters.brandTier !== 'ALL') {
      pieces = pieces.filter(p => p.brandTier === filters.brandTier);
    }

    if (filters.size && filters.size !== 'ALL') {
      pieces = pieces.filter(p => p.sizeScanned === filters.size);
    }

    if (filters.shopLocation && filters.shopLocation !== 'ALL') {
      pieces = pieces.filter(p => p.shopLocation === filters.shopLocation);
    }

    return pieces;
  }

  public getDashboardKPIs() {
    const inStockPieces = this.inventoryPieces.filter(p => !p.isSold);
    const totalInventoryValue = inStockPieces.reduce((sum, p) => sum + (p.estimatedPrice || 0), 0);
    const totalInventoryCount = inStockPieces.length;

    const pendingSales = this.salesGatePasses.filter(sgp => sgp.status === 'DRAFT' || !sgp.isConverted);
    const pendingSalesCount = pendingSales.length;
    const pendingSalesAmount = pendingSales.reduce((sum, sgp) => sum + (sgp.estimatedAmount || 0), 0);

    const currentMonthRevenue = this.salesInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const currentMonthVat = this.salesInvoices.reduce((sum, inv) => sum + (inv.vatAmount || 0), 0);
    const currentMonthSubtotal = this.salesInvoices.reduce((sum, inv) => sum + (inv.subTotal || 0), 0);
    const totalSalesCount = this.salesInvoices.length;

    const totalPurchasesAmount = this.purchaseInvoices.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalPurchasesCount = this.purchaseInvoices.length;
    const openReceivables = this.parties.filter(p => p.type === 'CLIENT').reduce((sum, c) => sum + Math.max(0, c.currentBalance), 0);
    const activeStaffCount = this.employees.filter(e => e.isActive).length;

    // Urgent pending action telemetry
    const unpostedVouchersCount = this.vouchers.filter(v => v.status !== 'POSTED').length;
    const awaitingInwardGatePasses = this.inwardGatePasses.filter(igp => igp.status === 'DRAFT' || !igp.postedAt).length;
    const awaitingSalesGatePasses = this.salesGatePasses.filter(sgp => sgp.status === 'DRAFT' || !sgp.postedAt || !sgp.isConverted).length;
    const awaitingGatePassesCount = awaitingInwardGatePasses + awaitingSalesGatePasses;
    const draftSalesInvoicesCount = this.salesInvoices.filter(s => s.status === 'DRAFT').length;
    const unpostedPurchaseInvoicesCount = this.purchaseInvoices.filter(p => p.status === 'DRAFT').length;
    const expiredLiveClaimsCount = this.salesInvoices.filter(
      s => s.status === 'DRAFT' && s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()
    ).length;
    const pendingActionTotal = unpostedVouchersCount + awaitingGatePassesCount + expiredLiveClaimsCount + draftSalesInvoicesCount;

    return {
      totalInventoryValue,
      totalInventoryCount,
      pendingSalesCount,
      pendingSalesAmount,
      currentMonthRevenue,
      currentMonthSubtotal,
      currentMonthVat,
      totalSalesCount,
      totalPurchasesAmount,
      totalPurchasesCount,
      openReceivables,
      activeStaffCount,
      unpostedVouchersCount,
      awaitingGatePassesCount,
      awaitingInwardGatePasses,
      awaitingSalesGatePasses,
      draftSalesInvoicesCount,
      unpostedPurchaseInvoicesCount,
      expiredLiveClaimsCount,
      pendingActionTotal
    };
  }

  public globalSearch(query: string) {
    if (!query || query.trim().length === 0) return { results: [], total: 0 };
    const q = query.toLowerCase().trim();
    const results: Array<{
      category: 'INVOICES' | 'PARTIES' | 'INVENTORY';
      id: string;
      title: string;
      subtitle: string;
      status?: string;
      badge?: string;
      amount?: string;
      tab: 'purchase' | 'sales' | 'finance' | 'parties';
      data?: any;
    }> = [];

    // 1. Invoices & Gate Passes
    for (const inv of this.purchaseInvoices) {
      if (inv.invoiceNo.toLowerCase().includes(q) || inv.supplierName.toLowerCase().includes(q) || (inv.notes && inv.notes.toLowerCase().includes(q))) {
        results.push({
          category: 'INVOICES',
          id: inv.id,
          title: inv.invoiceNo,
          subtitle: `Purchase Invoice • ${inv.supplierName} • ${inv.date}`,
          status: inv.status,
          badge: 'PURCHASE',
          amount: `AED ${inv.totalAmount.toLocaleString()}`,
          tab: 'purchase',
          data: inv
        });
      }
    }
    for (const sinv of this.salesInvoices) {
      if (
        sinv.invoiceNo.toLowerCase().includes(q) ||
        sinv.customerName.toLowerCase().includes(q) ||
        sinv.items.some(it => it.description.toLowerCase().includes(q))
      ) {
        results.push({
          category: 'INVOICES',
          id: sinv.id,
          title: sinv.invoiceNo,
          subtitle: `Tax Sales Invoice • ${sinv.customerName} • ${sinv.date}`,
          status: sinv.status,
          badge: 'SALES',
          amount: `AED ${sinv.totalAmount.toLocaleString()}`,
          tab: 'sales',
          data: sinv
        });
      }
    }
    for (const igp of this.inwardGatePasses) {
      if (igp.gatePassNo.toLowerCase().includes(q) || igp.supplierName.toLowerCase().includes(q)) {
        results.push({
          category: 'INVOICES',
          id: igp.id,
          title: igp.gatePassNo,
          subtitle: `Inward Breakdown Gate Pass • ${igp.supplierName} • ${igp.pieceCount} pieces`,
          status: igp.status,
          badge: 'INWARD',
          tab: 'purchase',
          data: igp
        });
      }
    }
    for (const sgp of this.salesGatePasses) {
      if (sgp.gatePassNo.toLowerCase().includes(q) || sgp.customerName.toLowerCase().includes(q)) {
        results.push({
          category: 'INVOICES',
          id: sgp.id,
          title: sgp.gatePassNo,
          subtitle: `Sales Outward Gate Pass • ${sgp.customerName} • ${sgp.items.length} pieces`,
          status: sgp.status,
          badge: 'OUTWARD',
          amount: `AED ${sgp.estimatedAmount.toLocaleString()}`,
          tab: 'sales',
          data: sgp
        });
      }
    }

    // 2. Parties (Suppliers, Clients, Agents)
    for (const p of this.parties) {
      if (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.address && p.address.toLowerCase().includes(q))
      ) {
        results.push({
          category: 'PARTIES',
          id: p.id,
          title: p.name,
          subtitle: `${p.code} • ${p.type} • ${p.address || 'UAE'} • ${p.phone || ''}`,
          badge: p.type,
          amount: `Balance: AED ${p.currentBalance.toLocaleString()}`,
          tab: 'parties',
          data: p
        });
      }
    }

    // 3. Inventory Pieces & Stock
    for (const piece of this.inventoryPieces) {
      if (
        piece.barcode.toLowerCase().includes(q) ||
        piece.itemName.toLowerCase().includes(q) ||
        piece.brandName.toLowerCase().includes(q) ||
        piece.shopLocation.toLowerCase().includes(q)
      ) {
        results.push({
          category: 'INVENTORY',
          id: piece.id,
          title: `${piece.brandName} - ${piece.itemName}`,
          subtitle: `Barcode: ${piece.barcode} • Size: ${piece.sizeScanned} • ${piece.shopLocation}`,
          status: piece.isSold ? 'SOLD' : 'IN_STOCK',
          badge: piece.brandTier,
          amount: `AED ${piece.estimatedPrice}`,
          tab: 'purchase',
          data: piece
        });
      }
    }

    return { results: results.slice(0, 30), total: results.length };
  }

  public bulkImportInventory(pieces: any[], importedBy: string = 'Operations Team') {
    const imported: PieceBreakdownItem[] = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const barcode = p.barcode && String(p.barcode).trim() !== ''
        ? String(p.barcode).trim()
        : `VV-IMP-${Date.now().toString().slice(-6)}-${String(i + 1).padStart(3, '0')}`;

      const newPiece: PieceBreakdownItem = {
        id: `pie-imp-${Date.now()}-${i + 1}`,
        gatePassId: p.gatePassId || (this.inwardGatePasses[0]?.id || 'igp-01'),
        barcode,
        itemId: p.itemId || 'itm-01',
        itemName: p.itemName || 'Vintage Apparel Piece',
        brandName: p.brandName || "Levi's",
        brandTier: p.brandTier || 'Vintage American Grail',
        labelGrade: p.labelGrade || 'Grade A+ (Pristine Cream)',
        shopLocation: p.shopLocation || 'Central Warehouse (Al Quoz)',
        weightKg: Number(p.weightKg) || 0.85,
        estimatedPrice: Number(p.estimatedPrice) || 280,
        sizeScanned: p.sizeScanned || 'L',
        countryOfOrigin: p.countryOfOrigin || 'Made in USA',
        style: p.style || 'Vintage Classic',
        isSold: false,
        createdAt: timestamp
      };

      this.inventoryPieces.unshift(newPiece);
      imported.push(newPiece);
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry(
        'INVENTORY',
        'CREATE',
        `BULK-INV-${imported.length}PCS`,
        'POSTED',
        importedBy,
        `Bulk CSV import: added ${imported.length} authenticated vintage inventory pieces`
      )
    );

    return { success: true, count: imported.length, items: imported };
  }

  public bulkImportSales(salesRecords: any[], importedBy: string = 'Sales Team') {
    const createdInvoices: SalesInvoice[] = [];
    const defaultClient = this.parties.find(p => p.type === 'CLIENT') || this.parties[0];

    for (let i = 0; i < salesRecords.length; i++) {
      const r = salesRecords[i];
      const nextIdx = this.salesInvoices.length + 1;
      const invoiceNo = `SINV-2026-IMP-${String(nextIdx).padStart(4, '0')}`;
      const subTotal = Number(r.subTotal || r.amount || r.totalAmount || 500);
      const vatAmount = Number(((subTotal * (this.companyProfile.vatRatePercent || 5)) / 100).toFixed(2));
      const totalAmount = Number((subTotal + vatAmount).toFixed(2));

      const matchedClient = this.parties.find(
        p => p.name.toLowerCase() === String(r.clientName || '').toLowerCase()
      ) || defaultClient;

      const inv: SalesInvoice = {
        id: `sinv-imp-${Date.now()}-${i}`,
        invoiceNo,
        salesGatePassId: `sgp-imp-${i + 1}`,
        salesGatePassNo: `SGP-IMP-${i + 1}`,
        customerId: matchedClient ? matchedClient.id : 'party-client-01',
        customerName: matchedClient ? matchedClient.name : (r.clientName || 'Walk-in Boutique Client'),
        date: r.date || new Date().toISOString().slice(0, 10),
        status: 'POSTED',
        currency: 'AED',
        exchangeRate: 1.0,
        subTotal,
        discountAmount: 0,
        vatAmount,
        totalAmount,
        paymentMethod: 'CREDIT_ACCOUNT',
        items: [
          {
            id: `sii-imp-${i + 1}`,
            barcode: `VV-BULK-SLS-${i + 1}`,
            description: r.notes || 'CSV imported sales lot',
            weightKg: 1.0,
            unitPrice: subTotal,
            discount: 0,
            finalAmount: subTotal
          }
        ]
      };

      this.salesInvoices.unshift(inv);
      createdInvoices.push(inv);

      // Update client khata balance
      if (matchedClient) {
        matchedClient.currentBalance = Number((matchedClient.currentBalance + totalAmount).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-sinv-imp-${inv.id}`,
          partyId: matchedClient.id,
          date: inv.date,
          docType: 'INVOICE',
          docRef: inv.invoiceNo,
          debit: totalAmount,
          credit: 0,
          balance: matchedClient.currentBalance,
          description: `Bulk CSV imported sales tax invoice ${inv.invoiceNo}`
        });
      }
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry(
        'SALES',
        'CREATE',
        `BULK-SALE-${createdInvoices.length}TXN`,
        'POSTED',
        importedBy,
        `Bulk CSV import: committed ${createdInvoices.length} sales tax invoices`
      )
    );

    return { success: true, count: createdInvoices.length, invoices: createdInvoices };
  }

  // --- Sales & Invoicing ---
  public getSalesGatePasses(): SalesGatePass[] {
    return this.salesGatePasses;
  }

  public createSalesGatePass(data: any): SalesGatePass {
    const nextIdx = this.salesGatePasses.length + 1;
    const gatePassNo = `SGP-2026-${String(nextIdx).padStart(4, '0')}`;

    const customer = this.parties.find(p => p.id === data.customerId);

    const gatePass: SalesGatePass = {
      id: `sgp-${Date.now()}`,
      gatePassNo,
      customerId: data.customerId,
      customerName: customer ? customer.name : (data.customerName || 'Walk-in Boutique Client'),
      date: data.date || new Date().toISOString().slice(0, 10),
      status: 'DRAFT',
      totalPieces: 0,
      totalWeight: 0,
      estimatedAmount: 0,
      isConverted: false,
      items: []
    };

    this.salesGatePasses.unshift(gatePass);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SALES', 'CREATE', gatePass.gatePassNo, 'DRAFT', 'Sales Executive', `Initiated Sales Gate Pass ${gatePass.gatePassNo} for customer ${gatePass.customerName}`)
    );

    return gatePass;
  }

  public scanBarcodeToSalesGatePass(gatePassId: string, barcode: string): {
    success: boolean;
    gatePass?: SalesGatePass;
    error?: string;
  } {
    const gatePass = this.salesGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Sales Gate Pass not found' };
    if (gatePass.status === 'POSTED') return { success: false, error: 'Cannot modify a POSTED Sales Gate Pass' };

    const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === barcode.toLowerCase().trim());
    if (!piece) return { success: false, error: `Barcode ${barcode} not found in Inventory Room stock` };
    if (piece.isSold) return { success: false, error: `Piece ${barcode} is already marked SOLD` };

    if (gatePass.items.some(i => i.barcode.toLowerCase() === barcode.toLowerCase().trim())) {
      return { success: false, error: `Barcode ${barcode} is already added to this gate pass` };
    }

    const item = {
      id: `sgpi-${Date.now()}`,
      pieceId: piece.id,
      barcode: piece.barcode,
      itemName: piece.itemName,
      brandName: piece.brandName,
      size: piece.sizeScanned,
      weightKg: piece.weightKg,
      unitPrice: piece.estimatedPrice,
      discountPercent: 0,
      netPrice: piece.estimatedPrice
    };

    gatePass.items.push(item);
    gatePass.totalPieces = gatePass.items.length;
    gatePass.totalWeight = Number(gatePass.items.reduce((sum, i) => sum + i.weightKg, 0).toFixed(2));
    gatePass.estimatedAmount = Number(gatePass.items.reduce((sum, i) => sum + i.netPrice, 0).toFixed(2));

    return { success: true, gatePass };
  }

  public postSalesGatePass(gatePassId: string, postedBy: string): { success: boolean; error?: string } {
    const gatePass = this.salesGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };
    if (gatePass.status === 'POSTED') return { success: false, error: 'Gate pass already POSTED' };
    if (gatePass.items.length === 0) return { success: false, error: 'Cannot post an empty Sales Gate Pass with 0 pieces' };

    gatePass.status = 'POSTED';
    gatePass.postedAt = new Date().toISOString();

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SALES', 'POST', gatePass.gatePassNo, 'POSTED', postedBy, `Verified and posted Sales Gate Pass ${gatePass.gatePassNo} (${gatePass.totalPieces} pieces)`)
    );

    return { success: true };
  }

  public unpostSalesGatePass(gatePassId: string): { success: boolean; error?: string } {
    const gatePass = this.salesGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };
    if (gatePass.isConverted) return { success: false, error: 'Cannot unpost gate pass that has already been converted into a Sales Invoice' };

    gatePass.status = 'UNPOSTED';

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SALES', 'UNPOST', gatePass.gatePassNo, 'UNPOSTED', 'Sales Manager', `Unposted Sales Gate Pass ${gatePass.gatePassNo}`)
    );

    return { success: true };
  }

  public convertSalesGatePassToInvoice(gatePassId: string): {
    success: boolean;
    invoice?: SalesInvoice;
    error?: string;
  } {
    const gatePass = this.salesGatePasses.find(g => g.id === gatePassId);
    if (!gatePass) return { success: false, error: 'Gate pass not found' };

    const customer = this.parties.find(p => p.id === gatePass.customerId);
    if (!customer) return { success: false, error: 'Customer not found in Parties Khata' };

    const nextIdx = this.salesInvoices.length + 1;
    const invoiceNo = `SLS-2026-${String(nextIdx).padStart(4, '0')}`;

    const result = SalesEngine.convertGatePassToInvoice(
      gatePass,
      customer,
      invoiceNo,
      this.companyProfile.vatRatePercent || 5.0
    );

    if (!result.canConvert || !result.invoice) {
      return { success: false, error: result.error };
    }

    gatePass.isConverted = true;
    gatePass.salesInvoiceId = result.invoice.id;

    this.salesInvoices.unshift(result.invoice);

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SALES', 'CREATE', result.invoice.invoiceNo, 'DRAFT', 'Sales Engine', `1-Click Converted Sales Gate Pass ${gatePass.gatePassNo} into Sales Invoice ${result.invoice.invoiceNo}`)
    );

    return { success: true, invoice: result.invoice };
  }

  public getSalesInvoices(): SalesInvoice[] {
    return this.salesInvoices;
  }

  public createLiveSellingInvoice(data: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    channel?: string;
    paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT' | 'CARD_POS' | 'COD' | string;
    discountAmount?: number;
    items: {
      pieceId?: string;
      barcode: string;
      description: string;
      weightKg: number;
      unitPrice: number;
      discount: number;
      finalAmount: number;
    }[];
  }): { success: boolean; invoice?: SalesInvoice; error?: string } {
    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'Live selling basket cannot be empty' };
    }

    const nextIdx = this.salesInvoices.length + 1;
    const invoiceNo = `SLS-LIVE-2026-${String(nextIdx).padStart(4, '0')}`;
    const subTotal = data.items.reduce((s, i) => s + (i.unitPrice || 0), 0);
    const discountAmount = data.discountAmount || data.items.reduce((s, i) => s + (i.discount || 0), 0);
    const taxableAmount = Math.max(0, subTotal - discountAmount);
    const vatRate = this.companyProfile.vatRatePercent || 5.0;
    const vatAmount = Number(((taxableAmount * vatRate) / 100).toFixed(2));
    const totalAmount = Number((taxableAmount + vatAmount).toFixed(2));

    const invoice: SalesInvoice = {
      id: `sls-inv-live-${Date.now()}`,
      invoiceNo,
      customerId: data.customerId || `cust-live-${Date.now()}`,
      customerName: data.customerName,
      customerPhone: data.customerPhone || '',
      date: new Date().toISOString().slice(0, 10),
      status: 'POSTED',
      currency: 'AED',
      exchangeRate: 1.0,
      subTotal: Number(subTotal.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      vatAmount,
      totalAmount,
      items: data.items.map((it, idx) => ({
        id: `sii-live-${Date.now()}-${idx}`,
        barcode: it.barcode,
        description: it.description,
        weightKg: it.weightKg || 0.5,
        unitPrice: it.unitPrice,
        discount: it.discount || 0,
        finalAmount: it.finalAmount,
        lineTotal: it.finalAmount
      })),
      postedAt: new Date().toISOString(),
      postedBy: `Live Host (${data.channel || 'Live Stream'})`,
      paymentMethod: (data.paymentMethod as any) || 'CASH'
    };

    return this.transaction(() => {
      // Mark matched pieces as sold in inventory
      for (const item of data.items) {
        const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === item.barcode.toLowerCase());
        if (piece) {
          piece.isSold = true;
          piece.status = 'SOLD';
          piece.soldInvoiceId = invoice.id;
          piece.soldPriceAed = item.finalAmount;
        }
      }

      this.salesInvoices.unshift(invoice);

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'POST',
          invoice.invoiceNo,
          'POSTED',
          `Live Host (${data.channel || 'Live Stream'})`,
          `Live Selling Instant Checkout: ${invoice.invoiceNo} for ${data.customerName} (${invoice.items.length} items, AED ${invoice.totalAmount})`
        )
      );

      return { success: true, invoice };
    });
  }

  public claimPieceAtomically(params: {
    barcode: string;
    buyerHandle: string;
    buyerPhone?: string;
    channel?: string;
    boothId?: string;
    offeredPrice?: number;
    lockDurationSeconds?: number;
    reservationTimeoutMinutes?: number;
  }): { success: boolean; piece?: PieceBreakdownItem; error?: string } {
    return this.transaction(() => {
      const now = Date.now();
      const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === params.barcode.trim().toLowerCase());
      if (!piece) {
        return { success: false, error: `SKU "${params.barcode}" does not exist in inventory.` };
      }
      if (piece.isSold || piece.status === 'SOLD') {
        return { success: false, error: `SKU ${params.barcode} has already been sold on invoice ${piece.soldInvoiceId || 'PREV'}.` };
      }
      // Check if locked by someone else and lock has not expired
      if (
        piece.status === 'CLAIMED_PENDING' &&
        piece.lockExpiresAt &&
        piece.lockExpiresAt > now &&
        piece.lockedByBuyer?.toLowerCase() !== params.buyerHandle.toLowerCase()
      ) {
        const remainingSec = Math.ceil((piece.lockExpiresAt - now) / 1000);
        const boothOrigin = piece.lockedByBooth ? `by [${piece.lockedByBooth.toUpperCase()}]` : '';
        return {
          success: false,
          error: `SKU ${params.barcode} is currently LOCKED ${boothOrigin} for ${piece.lockedByBuyer} (${remainingSec}s lock remaining). Concurrency lock preserved.`
        };
      }

      // Lock item with booth affinity & reservation timeout
      const lockSeconds = params.lockDurationSeconds || 180; // 3 minutes fast claim hold
      const timeoutMin = params.reservationTimeoutMinutes || 120; // 2 hours reservation
      piece.status = 'CLAIMED_PENDING';
      piece.lockedByBuyer = params.buyerHandle;
      piece.lockedByBooth = params.boothId || 'booth-01';
      piece.lockedChannel = params.channel || 'Multistream Live';
      piece.lockExpiresAt = now + lockSeconds * 1000;
      piece.reservedUntil = now + timeoutMin * 60 * 1000;
      if (params.offeredPrice !== undefined) {
        piece.lockedPrice = params.offeredPrice;
      }

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'UPDATE',
          piece.barcode,
          'DRAFT',
          params.buyerHandle,
          `Atomic SKU Lock: ${piece.barcode} (${piece.brandName} ${piece.itemName}) locked for ${params.buyerHandle} at [${piece.lockedByBooth}] on ${params.channel || 'Live'}`
        )
      );

      return { success: true, piece };
    });
  }

  public releasePieceLock(barcode: string, boothId?: string): { success: boolean; piece?: PieceBreakdownItem; error?: string } {
    return this.transaction(() => {
      const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === barcode.trim().toLowerCase());
      if (!piece) return { success: false, error: `SKU ${barcode} not found.` };
      if (piece.status === 'SOLD' || piece.isSold) return { success: false, error: `Cannot release sold item.` };

      const prevBuyer = piece.lockedByBuyer;
      const prevBooth = piece.lockedByBooth || boothId;

      piece.status = 'IN_STOCK';
      piece.lockedByBuyer = undefined;
      piece.lockedByBooth = undefined;
      piece.lockedChannel = undefined;
      piece.lockExpiresAt = undefined;
      piece.reservedUntil = undefined;
      piece.lockedPrice = undefined;

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'UPDATE',
          piece.barcode,
          'DRAFT',
          prevBuyer || 'OPERATOR',
          `Fast Drop / Re-Auction: ${piece.barcode} released by [${prevBooth || 'STUDIO'}] back to available stock`
        )
      );

      return { success: true, piece };
    });
  }

  // Reservation Timeout Engine: automatically sweep expired reservations back into stock
  public sweepExpiredReservations(maxMinutes?: number): { sweptCount: number; sweptBarcodes: string[] } {
    return this.transaction(() => {
      const now = Date.now();
      const sweptBarcodes: string[] = [];

      for (const piece of this.inventoryPieces) {
        if (piece.status === 'CLAIMED_PENDING' || piece.status === 'RESERVED') {
          const isHoldExpired = piece.lockExpiresAt && piece.lockExpiresAt < now;
          const isReservationExpired = piece.reservedUntil && piece.reservedUntil < now;
          
          if (isHoldExpired || isReservationExpired) {
            sweptBarcodes.push(piece.barcode);
            piece.status = 'IN_STOCK';
            piece.lockedByBuyer = undefined;
            piece.lockedByBooth = undefined;
            piece.lockedChannel = undefined;
            piece.lockExpiresAt = undefined;
            piece.reservedUntil = undefined;
            piece.lockedPrice = undefined;
          }
        }
      }

      return { sweptCount: sweptBarcodes.length, sweptBarcodes };
    });
  }

  public getLiveClaimedPool(boothId?: string): {
    buyerHandle: string;
    channel: string;
    boothId: string;
    itemsCount: number;
    totalWeightKg: number;
    subTotalAed: number;
    vatAed: number;
    shippingAed: number;
    grandTotalAed: number;
    items: PieceBreakdownItem[];
  }[] {
    const now = Date.now();
    const map = new Map<string, {
      buyerHandle: string;
      channel: string;
      boothId: string;
      items: PieceBreakdownItem[];
    }>();

    for (const p of this.inventoryPieces) {
      if (p.status === 'CLAIMED_PENDING' && p.lockedByBuyer) {
        // Filter by booth if requested
        if (boothId && p.lockedByBooth && p.lockedByBooth !== boothId) {
          continue;
        }

        // Check if expired
        if ((p.lockExpiresAt && p.lockExpiresAt < now) || (p.reservedUntil && p.reservedUntil < now)) {
          // auto release expired lock
          p.status = 'IN_STOCK';
          p.lockedByBuyer = undefined;
          p.lockedByBooth = undefined;
          p.lockExpiresAt = undefined;
          p.reservedUntil = undefined;
          continue;
        }

        const bId = p.lockedByBooth || 'booth-01';
        const key = `${bId}__${p.lockedByBuyer.toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            buyerHandle: p.lockedByBuyer,
            channel: p.lockedChannel || 'Multistream',
            boothId: bId,
            items: []
          });
        }
        map.get(key)!.items.push(p);
      }
    }

    const vatRate = (this.companyProfile.vatRatePercent || 5.0) / 100;

    return Array.from(map.values()).map(pool => {
      const totalWeightKg = pool.items.reduce((s, i) => s + (i.weightKg || 0.45), 0);
      const subTotalAed = pool.items.reduce((s, i) => s + (i.lockedPrice || i.estimatedPrice || i.retailPriceAed || 120), 0);
      const vatAed = Number((subTotalAed * vatRate).toFixed(2));
      const shippingAed = subTotalAed >= 500 ? 0 : 25; // Free shipping over 500 AED
      const grandTotalAed = Number((subTotalAed + vatAed + shippingAed).toFixed(2));

      return {
        buyerHandle: pool.buyerHandle,
        channel: pool.channel,
        boothId: pool.boothId,
        itemsCount: pool.items.length,
        totalWeightKg: Number(totalWeightKg.toFixed(2)),
        subTotalAed: Number(subTotalAed.toFixed(2)),
        vatAed,
        shippingAed,
        grandTotalAed,
        items: pool.items
      };
    });
  }

  public finalizeBuyerLiveSession(params: {
    buyerHandle: string;
    customerPhone?: string;
    paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT';
    shippingAddress?: string;
  }): {
    success: boolean;
    invoice?: SalesInvoice;
    whatsAppMessage?: string;
    thermalStickers?: any[];
    error?: string;
  } {
    return this.transaction(() => {
      const pool = this.getLiveClaimedPool().find(p => p.buyerHandle.toLowerCase() === params.buyerHandle.toLowerCase());
      if (!pool || pool.items.length === 0) {
        return { success: false, error: `No active claimed items found for buyer "${params.buyerHandle}".` };
      }

      // Create SalesInvoice
      const nextIdx = this.salesInvoices.length + 1;
      const invoiceNo = `SLS-LIVE-2026-${String(nextIdx).padStart(4, '0')}`;

      const invoice: SalesInvoice = {
        id: `sls-live-${Date.now()}`,
        invoiceNo,
        customerId: `cust-live-${Date.now()}`,
        customerName: params.buyerHandle,
        customerPhone: params.customerPhone || '+971 50 892 4110',
        date: new Date().toISOString().slice(0, 10),
        status: 'POSTED',
        currency: 'AED',
        exchangeRate: 1.0,
        subTotal: pool.subTotalAed,
        discountAmount: 0,
        vatAmount: pool.vatAed,
        totalAmount: pool.grandTotalAed,
        items: pool.items.map((it, idx) => ({
          id: `sii-live-${Date.now()}-${idx}`,
          barcode: it.barcode,
          description: `${it.brandName} ${it.itemName} (${it.sizeScanned || 'M'})`,
          weightKg: it.weightKg || 0.45,
          unitPrice: it.lockedPrice || it.estimatedPrice || it.retailPriceAed || 120,
          discount: 0,
          finalAmount: it.lockedPrice || it.estimatedPrice || it.retailPriceAed || 120,
          lineTotal: it.lockedPrice || it.estimatedPrice || it.retailPriceAed || 120
        })),
        postedAt: new Date().toISOString(),
        postedBy: `Live Auction Host (${pool.channel})`,
        paymentMethod: params.paymentMethod
      };

      // Mark pieces as SOLD
      for (const item of pool.items) {
        const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === item.barcode.toLowerCase());
        if (piece) {
          piece.isSold = true;
          piece.status = 'SOLD';
          piece.soldInvoiceId = invoice.id;
          piece.soldPriceAed = item.lockedPrice || item.estimatedPrice || item.retailPriceAed || 120;
          piece.lockedByBuyer = undefined;
          piece.lockExpiresAt = undefined;
        }
      }

      this.salesInvoices.unshift(invoice);

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'POST',
          invoice.invoiceNo,
          'POSTED',
          `Live Host (${pool.channel})`,
          `Live Auction Session Finalized: ${invoice.invoiceNo} for ${params.buyerHandle} (${pool.items.length} items, AED ${invoice.totalAmount})`
        )
      );

      // Consolidated WhatsApp advice message
      const itemsList = pool.items
        .map((it, i) => `${i + 1}. *${it.brandName}* ${it.itemName} [${it.sizeScanned || 'M'}] - AED ${(it.lockedPrice || it.estimatedPrice || it.retailPriceAed || 120).toFixed(2)} (SKU: ${it.barcode})`)
        .join('\n');

      const whatsAppMessage = `🏷️ *VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C • LIVE AUCTION ORDER ADVICE*\n\n` +
        `Hello ${params.buyerHandle}!\n` +
        `Thank you for participating in our Live Drop!\n\n` +
        `📄 *Invoice No:* ${invoice.invoiceNo}\n` +
        `📅 *Date:* ${invoice.date}\n` +
        `📦 *Total Garments:* ${pool.items.length} Pieces (${pool.totalWeightKg} KG)\n\n` +
        `*Items Won:*\n${itemsList}\n\n` +
        `💵 *Subtotal:* AED ${pool.subTotalAed.toFixed(2)}\n` +
        `🇦🇪 *UAE VAT (5%):* AED ${pool.vatAed.toFixed(2)}\n` +
        `🚚 *Express UAE Courier:* ${pool.shippingAed === 0 ? 'FREE (Orders > AED 500)' : `AED ${pool.shippingAed.toFixed(2)}`}\n` +
        `💰 *GRAND TOTAL:* AED ${pool.grandTotalAed.toFixed(2)}\n\n` +
        `💳 *Payment Method:* ${params.paymentMethod}\n` +
        `📍 *Dispatch Hub:* Vintage Vibes Main Facility, Al Jimi, Al Ain, Abu Dhabi, UAE.\n\n` +
        `Your parcel is pre-labeled with thermal barcode stickers and will dispatch via overnight courier!`;

      // Thermal barcode packing stickers
      const thermalStickers = pool.items.map((it, idx) => ({
        pieceId: it.id,
        barcode: it.barcode,
        brandName: it.brandName,
        itemName: it.itemName,
        size: it.sizeScanned || 'M',
        baleNumber: it.barcode.split('-').slice(0, 3).join('-') || 'VV-BAL-001',
        buyerHandle: params.buyerHandle,
        invoiceNo: invoice.invoiceNo,
        packageSequence: `${idx + 1}/${pool.items.length}`,
        totalWeightKg: it.weightKg || 0.45
      }));

      return {
        success: true,
        invoice,
        whatsAppMessage,
        thermalStickers
      };
    });
  }

  // ==================== FAST MOBILE CONFIRMED LIVE SALE & COA LEDGER POSTING ====================
  public confirmLiveSaleAndPostCOA(params: {
    barcode: string;
    buyerHandle: string;
    buyerPhone?: string;
    boothId: string;
    finalSellingPrice: number;
    channel?: string;
    shippingAddress?: string;
    notes?: string;
    paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT';
  }): {
    success: boolean;
    invoice?: SalesInvoice;
    voucher?: Voucher;
    piece?: PieceBreakdownItem;
    accountingEntry?: {
      arDebit: number;
      salesCredit: number;
      cogsDebit: number;
      inventoryCredit: number;
    };
    error?: string;
  } {
    return this.transaction(() => {
      const barcodeNorm = params.barcode.trim().toLowerCase();
      const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === barcodeNorm);
      if (!piece) {
        return { success: false, error: `SKU "${params.barcode}" does not exist in inventory.` };
      }
      if (piece.isSold || piece.status === 'SOLD') {
        return { success: false, error: `SKU "${params.barcode}" has already been sold on invoice ${piece.soldInvoiceId || 'PREV'}. Duplicate sale prevented.` };
      }

      const now = Date.now();
      // Check if locked by someone else and lock has not expired
      if (
        piece.status === 'CLAIMED_PENDING' &&
        piece.lockExpiresAt &&
        piece.lockExpiresAt > now &&
        piece.lockedByBuyer &&
        piece.lockedByBuyer.toLowerCase() !== params.buyerHandle.toLowerCase()
      ) {
        const remainingSec = Math.ceil((piece.lockExpiresAt - now) / 1000);
        return {
          success: false,
          error: `SKU ${params.barcode} is currently locked by ${piece.lockedByBuyer} at ${piece.lockedByBooth || 'another booth'} (${remainingSec}s lock remaining).`
        };
      }

      // Mark piece as SOLD
      const sellingPrice = Number(params.finalSellingPrice) || piece.retailPriceAed || 120;
      piece.isSold = true;
      piece.status = 'SOLD';
      piece.soldPriceAed = sellingPrice;
      piece.lockedByBuyer = undefined;
      piece.lockedByBooth = undefined;
      piece.lockExpiresAt = undefined;
      piece.reservedUntil = undefined;
      piece.lockedChannel = undefined;

      // Derived Gram-weight cost from source bale
      const grams = piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000);
      const cogsCost = piece.calculatedCostPrice || piece.costPrice || (piece.costPerGram && grams ? Number((grams * piece.costPerGram).toFixed(2)) : (piece.weightKg ? Number((piece.weightKg * 20).toFixed(2)) : 18.50));

      // Customer account resolution
      let customer = this.parties.find(p => p.name.toLowerCase() === params.buyerHandle.toLowerCase() || p.code.toLowerCase() === params.buyerHandle.toLowerCase());
      if (!customer) {
        // Auto-create live buyer profile in party ledger
        const custIdx = this.parties.filter(p => p.type === 'CLIENT').length + 1;
        customer = {
          id: `pty-cust-${Date.now()}`,
          code: `CLI-LIVE-${String(custIdx).padStart(3, '0')}`,
          name: params.buyerHandle,
          type: 'CLIENT',
          phone: params.buyerPhone || '+971 50 892 4110',
          creditLimit: 25000,
          currentBalance: 0,
          currency: 'AED',
          isActive: true,
          accountMap: {
            receivableAccountId: 'acc-1130',
            revenueAccountId: 'acc-4120'
          },
          createdAt: new Date().toISOString()
        };
        this.parties.push(customer);
      }

      // Create POSTED SalesInvoice
      const nextIdx = this.salesInvoices.length + 1;
      const invoiceNo = `SLS-LIVE-2026-${String(nextIdx).padStart(4, '0')}`;
      const invoiceId = `sls-live-${Date.now()}`;
      piece.soldInvoiceId = invoiceId;

      const invoice: SalesInvoice = {
        id: invoiceId,
        invoiceNo,
        customerId: customer.id,
        customerName: params.buyerHandle,
        customerPhone: params.buyerPhone || customer.phone || '+971 50 892 4110',
        date: new Date().toISOString().slice(0, 10),
        status: 'POSTED',
        currency: 'AED',
        exchangeRate: 1.0,
        subTotal: sellingPrice,
        discountAmount: 0,
        vatAmount: 0, // Live streaming direct export net
        totalAmount: sellingPrice,
        items: [{
          id: `sii-live-${Date.now()}`,
          barcode: piece.barcode,
          description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'M'})`,
          weightKg: piece.weightKg || 0.45,
          unitPrice: sellingPrice,
          discount: 0,
          finalAmount: sellingPrice,
          lineTotal: sellingPrice
        }],
        postedAt: new Date().toISOString(),
        postedBy: `Live Host [${params.boothId.toUpperCase()}]`,
        paymentMethod: params.paymentMethod || 'CASH'
      };
      this.salesInvoices.unshift(invoice);

      // Automated ERP & Chart of Accounts (COA) Integration:
      // Debit: Accounts Receivable / Buyer Account (Final Selling Price)
      // Credit: Sales Revenue (Final Selling Price)
      // Debit: Cost of Goods Sold (Piece Gram-Weight Cost derived from source bale)
      // Credit: Inventory - Finished Goods (Piece Gram-Weight Cost)
      const arAcc = this.getOrCreateAccount('1130', 'Accounts Receivable (Trade & Live Stream Claimants)', 'ASSET');
      const revAcc = this.getOrCreateAccount('4120', 'Live Streaming Sales Revenue (TikTok / IG / FB Drops)', 'REVENUE');
      const cogsAcc = this.getOrCreateAccount('5110', 'Cost of Goods Sold (COGS) - Finished Garments', 'EXPENSE');
      const invAcc = this.getOrCreateAccount('1160', 'Inventory - Sorted & Tagged Garments (Retail & Live Stream Ready)', 'ASSET');

      const voucherLines: VoucherLine[] = [
        {
          id: `line-${Date.now()}-1`,
          accountId: arAcc.id,
          accountCode: arAcc.code,
          accountName: arAcc.name,
          debitAmount: sellingPrice,
          creditAmount: 0,
          narration: `AR Live Claim: ${params.buyerHandle} on SKU ${piece.barcode}`
        },
        {
          id: `line-${Date.now()}-2`,
          accountId: revAcc.id,
          accountCode: revAcc.code,
          accountName: revAcc.name,
          debitAmount: 0,
          creditAmount: sellingPrice,
          narration: `Live Stream Sales Revenue: ${piece.brandName} ${piece.itemName} [${params.boothId}]`
        },
        {
          id: `line-${Date.now()}-3`,
          accountId: cogsAcc.id,
          accountCode: cogsAcc.code,
          accountName: cogsAcc.name,
          debitAmount: cogsCost,
          creditAmount: 0,
          narration: `COGS derived from source bale (${grams}g @ ${piece.barcode.split('-').slice(0, 3).join('-') || 'VV-BAL-001'})`
        },
        {
          id: `line-${Date.now()}-4`,
          accountId: invAcc.id,
          accountCode: invAcc.code,
          accountName: invAcc.name,
          debitAmount: 0,
          creditAmount: cogsCost,
          narration: `Finished Goods Asset Relief for SKU ${piece.barcode}`
        }
      ];

      const voucherId = `vouch-live-${Date.now()}`;
      const voucherNo = `JV-LIVE-${String(nextIdx).padStart(4, '0')}`;
      const voucher: Voucher = {
        id: voucherId,
        voucherNo,
        type: 'JOURNAL',
        status: 'POSTED',
        date: new Date().toISOString().slice(0, 10),
        narration: `Live Selling Sale & Cost Posting: SKU ${piece.barcode} to ${params.buyerHandle} via ${params.boothId}`,
        totalDebit: Number((sellingPrice + cogsCost).toFixed(2)),
        totalCredit: Number((sellingPrice + cogsCost).toFixed(2)),
        currency: 'AED',
        exchangeRate: 1.0,
        lines: voucherLines,
        postedAt: new Date().toISOString(),
        postedBy: `Live Operator (${params.boothId})`,
        documentRef: invoice.invoiceNo
      };

      // Post directly to General Ledger
      const { newLedgers, updatedAccounts } = FinanceEngine.postVoucherToLedger(
        voucher,
        this.coaAccounts,
        this.ledgers
      );
      this.ledgers.push(...newLedgers);
      this.coaAccounts = updatedAccounts;
      this.vouchers.unshift(voucher);

      // Update customer khata
      customer.currentBalance = Number((customer.currentBalance + sellingPrice).toFixed(2));
      this.partyKhataLogs.push({
        id: `pkl-live-${invoice.id}`,
        partyId: customer.id,
        date: invoice.date,
        docType: 'INVOICE',
        docRef: invoice.invoiceNo,
        debit: sellingPrice,
        credit: 0,
        balance: customer.currentBalance,
        description: `Live Stream Instant Sale: ${piece.brandName} ${piece.itemName} (SKU ${piece.barcode}) at ${params.boothId}`
      });

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'POST',
          invoice.invoiceNo,
          'POSTED',
          `Host [${params.boothId}]`,
          `Live Confirmed Sale & COA Ledger Posted: ${invoice.invoiceNo} (AED ${sellingPrice}, COGS AED ${cogsCost}) for ${params.buyerHandle}. SKU ${piece.barcode} locked & deducted.`
        )
      );

      return {
        success: true,
        invoice,
        voucher,
        piece,
        accountingEntry: {
          arDebit: sellingPrice,
          salesCredit: sellingPrice,
          cogsDebit: cogsCost,
          inventoryCredit: cogsCost
        }
      };
    }, {
      module: 'SALES',
      entity: 'LIVE_SALE',
      action: 'POST',
      documentRef: params.barcode
    });
  }

  /**
   * High-Speed Walk-in Counter Sale (POS) Checkout:
   * - Scans multiple pieces simultaneously
   * - Atomically marks pieces as SOLD and removes from stock & e-commerce
   * - Computes 5% UAE VAT and cumulative COGS from individual garment gram weights
   * - Generates POSTED SalesInvoice and Balanced Double-Entry Journal Voucher (Debit = Credit)
   * - Automatically updates Income Statement (Gross Profit, Net Margin) and Balance Sheet (Cash/Card, Inventory relief)
   */
  public confirmMultiItemCounterSaleAndPostCOA(params: {
    items: Array<{
      barcode: string;
      unitPrice?: number;
      discount?: number;
    }>;
    paymentMethod: 'CASH' | 'CARD_POS' | 'BANK_QR' | 'SPLIT' | 'CREDIT_ACCOUNT';
    splitBreakdown?: {
      cashAmount?: number;
      cardAmount?: number;
      qrAmount?: number;
    };
    cashTendered?: number;
    changeDue?: number;
    posMachineDetails?: {
      terminalName?: string;
      terminalId?: string;
      authCode?: string;
      cardBrand?: string;
      rrn?: string;
    };
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    operatorName?: string;
    counterStationId?: string;
    discountTotal?: number;
    notes?: string;
    giftBoxFee?: number;
  }): {
    success: boolean;
    invoice?: SalesInvoice;
    voucher?: Voucher;
    piecesSold?: PieceBreakdownItem[];
    cogsSummary?: {
      totalRevenueAed: number;
      subTotalAed: number;
      vatAmountAed: number;
      totalCogsAed: number;
      grossProfitAed: number;
      grossMarginPercent: number;
    };
    error?: string;
  } {
    return this.transaction(() => {
      if (!params.items || params.items.length === 0) {
        return { success: false, error: 'Cannot checkout: Basket is empty. Please scan at least 1 garment.' };
      }

      // 1. Verify all pieces exist in inventory and are NOT sold
      const matchedPieces: Array<{ piece: PieceBreakdownItem; sellingPrice: number; cogsCost: number }> = [];

      for (const item of params.items) {
        const normBarcode = item.barcode.trim().toLowerCase();
        const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === normBarcode);

        if (!piece) {
          return { success: false, error: `SKU "${item.barcode}" does not exist in inventory database.` };
        }

        if (piece.isSold || piece.status === 'SOLD') {
          return {
            success: false,
            error: `SKU "${piece.barcode}" (${piece.brandName} ${piece.itemName}) has already been sold on invoice ${piece.soldInvoiceId || 'PREV'}.`
          };
        }

        // Selling price override (preserves 0 for complimentary/promotional gift pieces)
        const sellingPrice = (item.unitPrice !== undefined && item.unitPrice !== null)
          ? Number(item.unitPrice)
          : (piece.retailPriceAed || piece.estimatedPrice || 120);

        // Cumulative Piece COGS calculation derived from garment gram-weight and source bale cost-per-gram
        const grams = piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000);
        const cogsCost = piece.calculatedCostPrice ||
          piece.costPrice ||
          (piece.costPerGram && grams ? Number((grams * piece.costPerGram).toFixed(2)) : (piece.weightKg ? Number((piece.weightKg * 20).toFixed(2)) : 18.50));

        matchedPieces.push({ piece, sellingPrice, cogsCost });
      }

      // 2. Financial totals
      const subTotal = Number(matchedPieces.reduce((sum, p) => sum + p.sellingPrice, 0).toFixed(2));
      const totalCogs = Number(matchedPieces.reduce((sum, p) => sum + p.cogsCost, 0).toFixed(2));
      const discount = Number(params.discountTotal || 0);
      const discountedSubtotal = Math.max(0, Number((subTotal - discount).toFixed(2)));
      const vatRate = Number(this.companyProfile.vatRatePercent || 5.0) / 100;
      const vatAmount = Number((discountedSubtotal * vatRate).toFixed(2));
      const giftBoxFee = Number(params.giftBoxFee || 0);
      const grandTotal = Number((discountedSubtotal + vatAmount + giftBoxFee).toFixed(2));
      const grossProfit = Number((discountedSubtotal - totalCogs).toFixed(2));
      const grossMarginPercent = discountedSubtotal > 0 ? Number(((grossProfit / discountedSubtotal) * 100).toFixed(1)) : 0;

      // 3. Resolve Customer (Walk-In or Selected Party)
      let customer = params.customerId ? this.parties.find(p => p.id === params.customerId) : null;
      if (!customer && params.customerName && params.customerName.trim()) {
        customer = this.parties.find(p => p.name.toLowerCase() === params.customerName!.trim().toLowerCase());
      }
      if (!customer) {
        let walkIn = this.parties.find(p => p.code === 'CLI-WALKIN');
        if (!walkIn) {
          walkIn = {
            id: 'pty-walkin-01',
            code: 'CLI-WALKIN',
            name: params.customerName || 'Walk-In Retail Customer',
            type: 'CLIENT',
            phone: params.customerPhone || '+971 50 000 0000',
            creditLimit: 0,
            currentBalance: 0,
            currency: 'AED',
            isActive: true,
            accountMap: {
              receivableAccountId: 'acc-1130',
              revenueAccountId: 'acc-4110'
            },
            createdAt: new Date().toISOString()
          };
          this.parties.push(walkIn);
        }
        customer = walkIn;
      }

      // 4. Generate POSTED Sales Invoice
      const nextIdx = this.salesInvoices.length + 1;
      const invoiceNo = `INV-POS-2026-${String(nextIdx).padStart(4, '0')}`;
      const invoiceId = `inv-pos-${Date.now()}`;
      const dateStr = new Date().toISOString().slice(0, 10);

      const invoiceItems: SalesInvoiceItem[] = matchedPieces.map((mp, i) => {
        const itemObj: SalesInvoiceItem = {
          id: `sii-pos-${Date.now()}-${i}`,
          barcode: mp.piece.barcode,
          description: `${mp.piece.brandName} ${mp.piece.itemName} (${mp.piece.sizeScanned || 'M'} - ${mp.piece.labelGrade || 'Grade A'})`,
          weightKg: mp.piece.weightKg || 0.45,
          unitPrice: mp.sellingPrice,
          discount: 0,
          finalAmount: mp.sellingPrice,
          lineTotal: mp.sellingPrice
        };
        return itemObj;
      });

      const invoice: SalesInvoice = {
        id: invoiceId,
        invoiceNo,
        customerId: customer.id,
        customerName: params.customerName || customer.name,
        customerPhone: params.customerPhone || customer.phone,
        date: dateStr,
        status: 'POSTED',
        currency: 'AED',
        exchangeRate: 1.0,
        subTotal: discountedSubtotal,
        discountAmount: discount,
        vatAmount,
        totalAmount: grandTotal,
        items: invoiceItems,
        notes: params.notes || `Counter Retail POS Sale (${matchedPieces.length} garments)`,
        postedAt: new Date().toISOString(),
        postedBy: params.operatorName || 'Counter POS Cashier',
        paymentMethod: params.paymentMethod === 'CARD_POS' ? 'CARD_MACHINE' : params.paymentMethod
      };

      this.salesInvoices.unshift(invoice);

      // 5. Mark all inventory pieces as SOLD
      matchedPieces.forEach(mp => {
        mp.piece.isSold = true;
        mp.piece.status = 'SOLD';
        mp.piece.soldPriceAed = mp.sellingPrice;
        mp.piece.soldInvoiceId = invoiceId;
        mp.piece.lockedByBuyer = undefined;
        mp.piece.lockedByBooth = undefined;
        mp.piece.lockExpiresAt = undefined;
        mp.piece.reservedUntil = undefined;
        mp.piece.lockedChannel = undefined;
      });

      // 6. Automated Balanced Double-Entry Journal Voucher (COA)
      // Accounts:
      // Debit: Cash in Hand (1110) / POS Card Clearing (1125) / Bank (1120) / AR (1130) -> (Grand Total)
      // Credit: Retail Garment Sales Revenue (4110) -> (Subtotal)
      // Credit: VAT Output Tax Payable (2140) -> (VAT Amount)
      // Debit: Cost of Goods Sold - Finished Garments (5110) -> (Total COGS)
      // Credit: Finished Garments Inventory (1140) -> (Total COGS)
      const cashAcc = this.getOrCreateAccount('1110', 'Cash in Hand (Counter 1 POS Drawer)', 'ASSET');
      const cardClearingAcc = this.getOrCreateAccount('1125', 'POS Terminal Card Clearing (Sunmi / PAX PED)', 'ASSET');
      const bankAcc = this.getOrCreateAccount('1120', 'Primary Bank Account (Current Account)', 'ASSET');
      const arAcc = this.getOrCreateAccount('1130', 'Accounts Receivable (Trade & Live Stream Claimants)', 'ASSET');
      const revAcc = this.getOrCreateAccount('4110', 'Walk-in Counter POS Sales Revenue', 'REVENUE');
      const giftRevAcc = this.getOrCreateAccount('4210', 'Luxury Packaging & Gift Box Revenue', 'REVENUE');
      const vatAcc = this.getOrCreateAccount('2140', 'UAE VAT Output Tax Payable (5% FTA)', 'LIABILITY');
      const cogsAcc = this.getOrCreateAccount('5110', 'Cost of Goods Sold (COGS) - Finished Garments', 'EXPENSE');
      const invAcc = this.getOrCreateAccount('1160', 'Inventory - Sorted & Tagged Garments (Retail & Live Stream Ready)', 'ASSET');

      const voucherLines: VoucherLine[] = [];
      let lineCounter = 1;

      // A. Payment Debit Lines
      if (params.paymentMethod === 'CASH') {
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: cashAcc.id,
          accountCode: cashAcc.code,
          accountName: cashAcc.name,
          debitAmount: grandTotal,
          creditAmount: 0,
          narration: `Counter Cash Sale: Invoice ${invoiceNo}`
        });
      } else if (params.paymentMethod === 'CARD_POS') {
        const terminalInfo = params.posMachineDetails?.terminalName || 'POS Terminal';
        const authRef = params.posMachineDetails?.authCode ? ` [Auth: ${params.posMachineDetails.authCode}]` : '';
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: cardClearingAcc.id,
          accountCode: cardClearingAcc.code,
          accountName: cardClearingAcc.name,
          debitAmount: grandTotal,
          creditAmount: 0,
          narration: `NFC/Card Machine Sale (${terminalInfo}${authRef}): Invoice ${invoiceNo}`
        });
      } else if (params.paymentMethod === 'BANK_QR') {
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: bankAcc.id,
          accountCode: bankAcc.code,
          accountName: bankAcc.name,
          debitAmount: grandTotal,
          creditAmount: 0,
          narration: `Direct Bank QR / Mobile Wallet Transfer: Invoice ${invoiceNo}`
        });
      } else if (params.paymentMethod === 'SPLIT') {
        const cashAmt = Number(params.splitBreakdown?.cashAmount || 0);
        const cardAmt = Number(params.splitBreakdown?.cardAmount || 0);
        const qrAmt = Number(params.splitBreakdown?.qrAmount || 0);

        if (cashAmt > 0) {
          voucherLines.push({
            id: `line-${Date.now()}-${lineCounter++}`,
            accountId: cashAcc.id,
            accountCode: cashAcc.code,
            accountName: cashAcc.name,
            debitAmount: cashAmt,
            creditAmount: 0,
            narration: `Split Payment - Cash Component: Invoice ${invoiceNo}`
          });
        }
        if (cardAmt > 0) {
          voucherLines.push({
            id: `line-${Date.now()}-${lineCounter++}`,
            accountId: cardClearingAcc.id,
            accountCode: cardClearingAcc.code,
            accountName: cardClearingAcc.name,
            debitAmount: cardAmt,
            creditAmount: 0,
            narration: `Split Payment - Card POS Component: Invoice ${invoiceNo}`
          });
        }
        if (qrAmt > 0) {
          voucherLines.push({
            id: `line-${Date.now()}-${lineCounter++}`,
            accountId: bankAcc.id,
            accountCode: bankAcc.code,
            accountName: bankAcc.name,
            debitAmount: qrAmt,
            creditAmount: 0,
            narration: `Split Payment - Bank QR Component: Invoice ${invoiceNo}`
          });
        }
      } else {
        // Credit account / Khata
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: arAcc.id,
          accountCode: arAcc.code,
          accountName: arAcc.name,
          debitAmount: grandTotal,
          creditAmount: 0,
          narration: `Khata Credit Sale to ${customer.name}: Invoice ${invoiceNo}`
        });
      }

      // B. Sales Revenue & VAT Output Tax Credit Lines
      voucherLines.push({
        id: `line-${Date.now()}-${lineCounter++}`,
        accountId: revAcc.id,
        accountCode: revAcc.code,
        accountName: revAcc.name,
        debitAmount: 0,
        creditAmount: discountedSubtotal,
        narration: `Retail Garments Sales Revenue (${matchedPieces.length} pcs): Invoice ${invoiceNo}`
      });

      if (vatAmount > 0) {
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: vatAcc.id,
          accountCode: vatAcc.code,
          accountName: vatAcc.name,
          debitAmount: 0,
          creditAmount: vatAmount,
          narration: `UAE VAT 5% Output Tax Collected: Invoice ${invoiceNo}`
        });
      }

      if (giftBoxFee > 0) {
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: giftRevAcc.id,
          accountCode: giftRevAcc.code,
          accountName: giftRevAcc.name,
          debitAmount: 0,
          creditAmount: giftBoxFee,
          narration: `Luxury Gift Box & Ribbon Packaging Fee: Invoice ${invoiceNo}`
        });
      }

      // C. Cost of Goods Sold (COGS) & Inventory Relief Lines
      if (totalCogs > 0) {
        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: cogsAcc.id,
          accountCode: cogsAcc.code,
          accountName: cogsAcc.name,
          debitAmount: totalCogs,
          creditAmount: 0,
          narration: `Cost of Goods Sold (COGS) for ${matchedPieces.length} garments: Invoice ${invoiceNo}`
        });

        voucherLines.push({
          id: `line-${Date.now()}-${lineCounter++}`,
          accountId: invAcc.id,
          accountCode: invAcc.code,
          accountName: invAcc.name,
          debitAmount: 0,
          creditAmount: totalCogs,
          narration: `Inventory Asset Relief (${matchedPieces.length} garments): Invoice ${invoiceNo}`
        });
      }

      // Post Balanced Journal Voucher
      const voucherNo = `JV-POS-${String(nextIdx).padStart(4, '0')}`;
      const voucherId = `vouch-pos-${Date.now()}`;
      const voucher: Voucher = {
        id: voucherId,
        voucherNo,
        voucherType: 'JOURNAL',
        date: dateStr,
        currency: 'AED',
        exchangeRate: 1.0,
        referenceNo: invoiceNo,
        narration: `Automated POS Counter Checkout: Invoice ${invoiceNo} (${matchedPieces.length} garments)`,
        status: 'POSTED',
        lines: voucherLines,
        postedAt: new Date().toISOString(),
        postedBy: params.operatorName || 'POS Terminal Cashier'
      };

      const { newLedgers, updatedAccounts } = FinanceEngine.postVoucherToLedger(
        voucher,
        this.coaAccounts,
        this.ledgers
      );
      this.ledgers.push(...newLedgers);
      this.coaAccounts = updatedAccounts;
      this.vouchers.unshift(voucher);

      // Customer Khata Ledger Entry
      if (params.paymentMethod === 'CREDIT_ACCOUNT') {
        customer.currentBalance = Number((customer.currentBalance + grandTotal).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-pos-${invoice.id}`,
          partyId: customer.id,
          date: invoice.date,
          docType: 'INVOICE',
          docRef: invoice.invoiceNo,
          debit: grandTotal,
          credit: 0,
          balance: customer.currentBalance,
          description: `Counter POS Credit Sale: ${matchedPieces.length} garments (${matchedPieces.map(m => m.piece.barcode).join(', ')})`
        });
      }

      // Enterprise Immutable Audit Log
      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'POST',
          invoice.invoiceNo,
          'POSTED',
          params.operatorName || 'Cashier',
          `POS Counter Sale Confirmed: ${invoice.invoiceNo} (${matchedPieces.length} garments). Gross AED ${subTotal}, COGS AED ${totalCogs}, Gross Margin AED ${grossProfit} (${grossMarginPercent}%). Paid via ${params.paymentMethod}.`
        )
      );

      return {
        success: true,
        invoice,
        voucher,
        piecesSold: matchedPieces.map(m => m.piece),
        cogsSummary: {
          totalRevenueAed: grandTotal,
          subTotalAed: discountedSubtotal,
          vatAmountAed: vatAmount,
          totalCogsAed: totalCogs,
          grossProfitAed: grossProfit,
          grossMarginPercent
        }
      };
    }, {
      module: 'SALES',
      entity: 'COUNTER_SALE',
      action: 'POST',
      documentRef: `POS-${Date.now()}`
    });
  }

  // Atomically lock SKU across all 10 booths and generate an instant Draft Sales Invoice
  public draftLiveClaimInvoice(params: {
    barcode: string;
    buyerHandle: string;
    boothId: string;
    offeredPrice?: number;
    channel?: string;
  }): {
    success: boolean;
    piece?: PieceBreakdownItem;
    draftInvoice?: SalesInvoice;
    error?: string;
  } {
    return this.transaction(() => {
      const lockRes = this.claimPieceAtomically({
        barcode: params.barcode,
        buyerHandle: params.buyerHandle,
        boothId: params.boothId,
        channel: params.channel || 'Multistream Live',
        offeredPrice: params.offeredPrice
      });

      if (!lockRes.success || !lockRes.piece) {
        return { success: false, error: lockRes.error };
      }

      const piece = lockRes.piece;
      const price = params.offeredPrice || piece.lockedPrice || piece.retailPriceAed || 120;
      const nextIdx = this.salesInvoices.length + 1;
      const invoiceNo = `SLS-DRAFT-LIVE-${String(nextIdx).padStart(4, '0')}`;

      const pieceCost = piece.calculatedCostPrice || piece.costPrice || (piece.weightGrams && piece.costPerGram ? Number((piece.weightGrams * piece.costPerGram).toFixed(2)) : 25);
      const grossProfitAed = Number((price - pieceCost).toFixed(2));
      const grossProfitPercent = price > 0 ? Math.round((grossProfitAed / price) * 100) : 0;
      const shippingFee = 25;
      const trackingNumber = `DHL-AE-${Math.floor(10000000 + Math.random() * 90000000)}`;

      const draftInvoice: SalesInvoice = {
        id: `sls-draft-${Date.now()}`,
        invoiceNo,
        customerId: `cust-${params.buyerHandle.replace(/[^a-zA-Z0-9]/g, '')}`,
        customerName: params.buyerHandle,
        customerPhone: '+971 50 ' + Math.floor(1000000 + Math.random() * 9000000),
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        boothId: params.boothId,
        hostName: `Booth ${params.boothId.replace(/[^0-9]/g, '') || '01'} Host`,
        socialPlatform: ((params.channel?.toUpperCase() as any) || 'TIKTOK'),
        buyerHandle: params.buyerHandle,
        status: 'DRAFT',
        currency: 'AED',
        exchangeRate: 1.0,
        subTotal: price,
        discountAmount: 0,
        vatAmount: 0,
        totalAmount: Number((price + shippingFee).toFixed(2)),
        courierPartner: 'DHL',
        trackingNumber,
        shippingBearer: 'CUSTOMER',
        shippingCharge: shippingFee,
        shippingFeeAed: shippingFee,
        paymentStatus: 'UNPAID_PENDING_COD',
        paymentMethod: 'COD',
        paymentReference: '',
        grossProfitAed,
        grossProfitPercent,
        items: [{
          id: `sii-draft-${Date.now()}`,
          barcode: piece.barcode,
          description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'M'})`,
          weightKg: piece.weightKg || 0.45,
          weightGrams: piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000),
          costPerGram: piece.costPerGram || 0.085,
          calculatedCostPrice: pieceCost,
          unitPrice: price,
          discount: 0,
          finalAmount: price,
          lineTotal: price
        }]
      };

      this.salesInvoices.unshift(draftInvoice);

      return {
        success: true,
        piece,
        draftInvoice
      };
    }, {
      module: 'SALES',
      entity: 'LIVE_CLAIM',
      action: 'CREATE',
      documentRef: params.barcode
    });
  }

  public updateDraftSalesInvoice(invoiceId: string, updates: any): { success: boolean; invoice?: SalesInvoice; error?: string } {
    return this.transaction(() => {
      const invoice = this.salesInvoices.find(i => i.id === invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found' };
      if (invoice.status === 'POSTED' && (updates.additionalBarcode || updates.removeBarcode)) {
        return { success: false, error: 'Cannot add or remove SKUs from a POSTED invoice. Logistics and payment details can still be updated.' };
      }

      if (updates.courierPartner !== undefined) invoice.courierPartner = updates.courierPartner;
      if (updates.trackingNumber !== undefined) invoice.trackingNumber = updates.trackingNumber;
      if (updates.shippingBearer !== undefined) invoice.shippingBearer = updates.shippingBearer;
      if (updates.shippingFeeAed !== undefined || updates.shippingCharge !== undefined) {
        const fee = Number(updates.shippingFeeAed !== undefined ? updates.shippingFeeAed : updates.shippingCharge) || 0;
        invoice.shippingFeeAed = fee;
        invoice.shippingCharge = fee;
      }
      if (updates.paymentStatus !== undefined) invoice.paymentStatus = updates.paymentStatus;
      if (updates.paymentMethod !== undefined) invoice.paymentMethod = updates.paymentMethod;
      if (updates.paymentReference !== undefined) invoice.paymentReference = updates.paymentReference;
      if (updates.customerPhone !== undefined) invoice.customerPhone = updates.customerPhone;
      if (updates.shippingAddress !== undefined) invoice.shippingAddress = updates.shippingAddress;
      if (updates.buyerHandle !== undefined) {
        invoice.buyerHandle = updates.buyerHandle;
        invoice.customerName = updates.buyerHandle;
      }

      // If bundling an additional SKU
      if (updates.additionalBarcode) {
        const barcodeToBundle = updates.additionalBarcode.trim();
        const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === barcodeToBundle.toLowerCase());
        if (!piece) {
          return { success: false, error: `Barcode ${barcodeToBundle} not found in inventory` };
        }
        if (piece.isSold) {
          return { success: false, error: `Piece ${barcodeToBundle} is already sold` };
        }
        if (invoice.items.some(it => it.barcode.toLowerCase() === barcodeToBundle.toLowerCase())) {
          return { success: false, error: `Barcode ${barcodeToBundle} already included in this invoice` };
        }
        const itemPrice = piece.estimatedPrice || piece.retailPriceAed || 120;
        const itemCost = piece.calculatedCostPrice || piece.costPrice || 25;
        const newItem: SalesInvoiceItem = {
          id: `sii-bundle-${Date.now()}`,
          barcode: piece.barcode,
          description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'M'})`,
          weightKg: piece.weightKg || 0.45,
          weightGrams: piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000),
          costPerGram: piece.costPerGram || 0.085,
          calculatedCostPrice: itemCost,
          unitPrice: itemPrice,
          discount: 0,
          finalAmount: itemPrice,
          lineTotal: itemPrice
        };
        invoice.items.push(newItem);
        piece.status = 'CLAIMED_PENDING';
        piece.lockedByBuyer = invoice.customerName;
      }

      // If removing an item from the draft
      if (updates.removeBarcode) {
        const removeCode = updates.removeBarcode.trim().toLowerCase();
        invoice.items = invoice.items.filter(it => it.barcode.toLowerCase() !== removeCode);
        const unlockedPiece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === removeCode);
        if (unlockedPiece && !unlockedPiece.isSold) {
          unlockedPiece.status = 'IN_STOCK';
          unlockedPiece.lockedByBuyer = undefined;
          unlockedPiece.lockedByBooth = undefined;
        }
      }

      // Recalculate invoice totals
      const subTotal = Number(invoice.items.reduce((sum, it) => sum + (it.finalAmount || it.unitPrice || 0), 0).toFixed(2));
      const totalCOGS = Number(invoice.items.reduce((sum, it) => sum + (it.calculatedCostPrice || 20), 0).toFixed(2));
      invoice.subTotal = subTotal;
      invoice.grossProfitAed = Number((subTotal - totalCOGS).toFixed(2));
      invoice.grossProfitPercent = subTotal > 0 ? Math.round(((subTotal - totalCOGS) / subTotal) * 100) : 0;

      const shippingFee = invoice.shippingFeeAed !== undefined ? invoice.shippingFeeAed : (invoice.shippingCharge || 0);
      if (invoice.shippingBearer === 'CUSTOMER') {
        invoice.totalAmount = Number((subTotal + (invoice.vatAmount || 0) + shippingFee).toFixed(2));
      } else {
        invoice.totalAmount = Number((subTotal + (invoice.vatAmount || 0)).toFixed(2));
      }

      return { success: true, invoice };
    }, {
      module: 'SALES',
      entity: 'DRAFT_INVOICE',
      action: 'UPDATE',
      documentRef: invoiceId
    });
  }

  public cancelSalesInvoice(invoiceId: string, cancelledBy: string = 'Operator'): { success: boolean; error?: string } {
    return this.transaction(() => {
      const invoice = this.salesInvoices.find(i => i.id === invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found' };
      if (invoice.status === 'POSTED') return { success: false, error: 'Cannot cancel a POSTED invoice. Create a return/RTO instead.' };

      invoice.status = 'CANCELLED';
      invoice.items.forEach(it => {
        const piece = this.inventoryPieces.find(p => p.barcode === it.barcode);
        if (piece && !piece.isSold) {
          piece.status = 'IN_STOCK';
          piece.lockedByBuyer = undefined;
          piece.lockedByBooth = undefined;
          piece.lockExpiresAt = undefined;
        }
      });

      this.auditLogs.unshift(
        AuditEngine.createLogEntry('SALES', 'DELETE', invoice.invoiceNo, 'CANCELLED', cancelledBy, `Cancelled draft sales invoice ${invoice.invoiceNo}; released ${invoice.items.length} items back to active stock`)
      );

      return { success: true };
    });
  }

  public postSalesInvoice(invoiceId: string, postedBy: string): { success: boolean; error?: string } {
    const invoice = this.salesInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (invoice.status === 'POSTED') return { success: false, error: 'Invoice already POSTED' };

    invoice.status = 'POSTED';
    invoice.postedAt = new Date().toISOString();
    invoice.postedBy = postedBy;

    // 1. Stock Deduction: mark all pieces as sold and calculate total COGS from gram costing
    let totalCOGS = 0;
    invoice.items.forEach(item => {
      const piece = this.inventoryPieces.find(p => p.barcode === item.barcode);
      if (piece) {
        piece.isSold = true;
        piece.status = 'SOLD';
        piece.soldInvoiceId = invoice.id;
        piece.soldPriceAed = item.finalAmount || item.unitPrice;
        const itemCost = piece.calculatedCostPrice || piece.costPrice || (piece.weightGrams && piece.costPerGram ? Number((piece.weightGrams * piece.costPerGram).toFixed(2)) : (item.weightKg ? Number((item.weightKg * 20).toFixed(2)) : 15));
        totalCOGS += itemCost;
      } else {
        const itemCost = item.calculatedCostPrice || (item.weightKg ? Number((item.weightKg * 20).toFixed(2)) : 15);
        totalCOGS += itemCost;
      }
    });

    totalCOGS = Number(totalCOGS.toFixed(2));

    // 2. Dual-entry COA Postings with automated COGS and Inventory Asset relief
    const customer = this.parties.find(p => p.id === invoice.customerId);
    const codAcc = this.getOrCreateAccount('1128', 'Courier COD Clearing (Pending Remittance - Aramex / iMile / TCS)', 'ASSET');
    const bankAcc = this.getOrCreateAccount('1120', 'Primary Bank Account (Current Account)', 'ASSET');
    const cardClearingAcc = this.getOrCreateAccount('1125', 'POS Terminal Card Clearing (Sunmi / PAX PED)', 'ASSET');
    const cashAcc = this.getOrCreateAccount('1110', 'Cash in Hand (Counter 1 POS Drawer)', 'ASSET');
    const arAcc = this.getOrCreateAccount('1130', 'Accounts Receivable (Trade & Live Stream Claimants)', 'ASSET');

    // Differentiate revenue based on sales channel (POS vs Live Stream vs Ecom vs Wholesale)
    const isLive = invoice.notes?.toLowerCase().includes('live') || invoice.customerName?.toLowerCase().includes('live') || (invoice as any).channel === 'LIVE_STREAM';
    const isEcom = (invoice as any).channel === 'ECOMMERCE' || invoice.notes?.toLowerCase().includes('ecom') || invoice.notes?.toLowerCase().includes('storefront');
    const isWholesale = (invoice as any).channel === 'WHOLESALE' || invoice.notes?.toLowerCase().includes('wholesale');

    const revAcc = isLive
      ? this.getOrCreateAccount('4120', 'Live Streaming Sales Revenue (TikTok / IG / FB Drops)', 'REVENUE')
      : isEcom
      ? this.getOrCreateAccount('4130', 'E-Commerce & Online Storefront Sales Revenue', 'REVENUE')
      : isWholesale
      ? this.getOrCreateAccount('4140', 'Wholesale B2B Bulk Sales Revenue', 'REVENUE')
      : this.getOrCreateAccount('4110', 'Walk-in Counter POS Sales Revenue', 'REVENUE');

    const cogsAcc = this.getOrCreateAccount('5110', 'Cost of Goods Sold (COGS) - Finished Garments', 'EXPENSE');
    const invAcc = this.getOrCreateAccount('1160', 'Inventory - Sorted & Tagged Garments (Retail & Live Stream Ready)', 'ASSET');
    const vatAcc = this.getOrCreateAccount('2140', 'UAE VAT Output Tax Payable (5% FTA)', 'LIABILITY');
    const shipExpAcc = this.getOrCreateAccount('5240', 'Courier Delivery & Last-Mile Shipping Expense', 'EXPENSE');
    const courierPayAcc = this.getOrCreateAccount('2120', 'Accounts Payable - Courier & Logistics Partners', 'LIABILITY');

    const voucherData = SalesEngine.generateComprehensiveCOASalesVoucher(
      invoice,
      totalCOGS,
      {
        receivableAccountId: customer?.accountMap?.receivableAccountId || arAcc.id,
        cashAccountId: cashAcc.id,
        codReceivableAccountId: codAcc.id,
        bankAccountId: bankAcc.id,
        cardClearingAccountId: cardClearingAcc.id,
        salesRevenueAccountId: customer?.accountMap?.revenueAccountId || revAcc.id,
        cogsAccountId: cogsAcc.id,
        inventoryAssetAccountId: invAcc.id,
        vatPayableAccountId: vatAcc.id,
        shippingExpenseAccountId: shipExpAcc.id,
        courierPayableAccountId: courierPayAcc.id
      }
    );

    const voucher = this.createVoucher({ ...voucherData, status: 'DRAFT' });
    this.postVoucher(voucher.id, postedBy);

    // 3. Update Customer Khata
    if (customer) {
      customer.currentBalance = Number((customer.currentBalance + invoice.totalAmount).toFixed(2));
      this.partyKhataLogs.push({
        id: `pkl-sls-${invoice.id}`,
        partyId: customer.id,
        date: invoice.date,
        docType: 'INVOICE',
        docRef: invoice.invoiceNo,
        debit: invoice.totalAmount,
        credit: 0,
        balance: customer.currentBalance,
        description: `Sales Invoice ${invoice.invoiceNo} for ${invoice.items.length} vintage pieces (COGS AED ${totalCOGS})`
      });
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SALES', 'POST', invoice.invoiceNo, 'POSTED', postedBy, `Finalized Sales Invoice ${invoice.invoiceNo}; deducted stock barcodes and dispatched double-entry COA ledger (COGS: AED ${totalCOGS}, Revenue: AED ${invoice.netAmount})`)
    );

    // 4. WhatsApp Dispatch Notification to Customer
    const customerPhone = invoice.customerPhone;
    if (customerPhone) {
      const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 9) {
        const jid = `${cleanPhone}@s.whatsapp.net`;
        const courier = invoice.courierPartner || 'Emirates Post';
        const tracking = invoice.trackingNumber || `AWB-${Math.floor(10000000 + Math.random() * 90000000)}`;
        const trackingUrl = `https://track.vintagevibe.ae/?awb=${encodeURIComponent(tracking)}`;

        const dispatchText = `🚀 *Your Order is On Its Way!*\n` +
          `*Courier:* ${courier}\n` +
          `*Tracking Number:* ${tracking}\n` +
          `*Track Your Parcel:* ${trackingUrl}\n\n` +
          `Thank you for shopping with us!`;

        // Non-blocking dispatch via Baileys
        import('../modules/marketing/baileys.service.ts').then(({ baileysManager }) => {
          baileysManager.sendMessage('usr-admin-1', jid, dispatchText).catch(() => {});
        }).catch(() => {});
      }
    }

    return { success: true };
  }

  public unpostSalesInvoice(invoiceId: string): { success: boolean; error?: string } {
    const invoice = this.salesInvoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, error: 'Invoice not found' };

    invoice.status = 'UNPOSTED';

    // 1. Restore piece inventory
    invoice.items.forEach(item => {
      const piece = this.inventoryPieces.find(p => p.barcode === item.barcode);
      if (piece) {
        piece.isSold = false;
        piece.status = 'IN_STOCK';
        piece.soldInvoiceId = undefined;
      }
    });

    // 2. Reverse customer khata
    const customer = this.parties.find(p => p.id === invoice.customerId);
    if (customer) {
      customer.currentBalance = Number((customer.currentBalance - invoice.totalAmount).toFixed(2));
    }

    // 3. Unpost associated voucher
    const voucher = this.vouchers.find(v => v.documentRef === invoice.invoiceNo);
    if (voucher) {
      this.unpostVoucher(voucher.id);
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('SALES', 'UNPOST', invoice.invoiceNo, 'UNPOSTED', 'Accounts Lead', `Unposted Sales Invoice ${invoice.invoiceNo}, restored pieces to stock, and reversed ledger debits/credits`)
    );

    return { success: true };
  }

  // --- B2B Custom Corporate & Wholesale Sales Engine ---
  public getAvailableRawBales(): InwardGatePass[] {
    return this.inwardGatePasses.filter(
      b => b.status !== 'SOLD_AS_BALE' && (b.sortingStatus === 'UNOPENED' || (b.pieces && b.pieces.length === 0))
    );
  }

  public createOrUpdateCustomB2BSaleInvoice(invoiceData: Partial<SalesInvoice>): {
    success: boolean;
    invoice?: SalesInvoice;
    error?: string;
  } {
    return this.transaction(() => {
      let invoice: SalesInvoice | undefined;
      if (invoiceData.id) {
        invoice = this.salesInvoices.find(i => i.id === invoiceData.id);
      }

      const nextIdx = this.salesInvoices.length + 1;
      const invoiceNo = invoiceData.invoiceNo || `INV-B2B-2026-${String(nextIdx).padStart(4, '0')}`;
      const nowStr = new Date().toISOString();

      if (!invoice) {
        invoice = {
          id: `sls-b2b-${Date.now()}`,
          invoiceNo,
          customerId: invoiceData.customerId || '',
          customerName: invoiceData.customerName || '',
          customerPhone: invoiceData.customerPhone || '',
          customerTrn: invoiceData.customerTrn || '',
          customerAddress: invoiceData.customerAddress || '',
          date: invoiceData.date || nowStr.slice(0, 10),
          time: invoiceData.time || nowStr.slice(11, 16),
          status: 'DRAFT',
          currency: invoiceData.currency || 'AED',
          exchangeRate: Number(invoiceData.exchangeRate || 1.0),
          subTotal: Number(invoiceData.subTotal || 0),
          discountAmount: Number(invoiceData.discountAmount || 0),
          vatAmount: Number(invoiceData.vatAmount || 0),
          totalAmount: Number(invoiceData.totalAmount || 0),
          items: invoiceData.items || [],
          paymentMethod: invoiceData.paymentMethod || 'CREDIT_ACCOUNT',
          paymentStatus: invoiceData.paymentStatus || 'PARTIAL_ADVANCE',
          isB2BCustomSale: true,
          taxType: invoiceData.taxType || 'MAINLAND_5_VAT',
          exportCustomsDeclarationNo: invoiceData.exportCustomsDeclarationNo,
          otherCharges: invoiceData.otherCharges || [],
          advanceAmountPaid: Number(invoiceData.advanceAmountPaid || 0),
          creditAmountDue: Number(invoiceData.creditAmountDue || 0),
          pdcChequeNo: invoiceData.pdcChequeNo,
          pdcChequeDate: invoiceData.pdcChequeDate,
          salespersonOrBroker: invoiceData.salespersonOrBroker,
          brokerCommissionPercent: Number(invoiceData.brokerCommissionPercent || 0),
          brokerCommissionAmount: Number(invoiceData.brokerCommissionAmount || 0),
          packingListNotes: invoiceData.packingListNotes,
          grossProfitAed: Number(invoiceData.grossProfitAed || 0),
          grossProfitPercent: Number(invoiceData.grossProfitPercent || 0)
        };
        this.salesInvoices.unshift(invoice);
      } else {
        if (invoice.status === 'POSTED') {
          return { success: false, error: 'Cannot edit a POSTED invoice. Please UNPOST it first.' };
        }
        Object.assign(invoice, invoiceData, { isB2BCustomSale: true });
      }

      return { success: true, invoice };
    }, { module: 'SALES', entity: 'CUSTOM_B2B_INVOICE', action: 'UPDATE' });
  }

  public postCustomB2BSaleInvoice(invoiceId: string, postedBy: string): {
    success: boolean;
    invoice?: SalesInvoice;
    voucher?: Voucher;
    error?: string;
  } {
    return this.transaction(() => {
      const invoice = this.salesInvoices.find(i => i.id === invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found' };
      if (invoice.status === 'POSTED') return { success: false, error: 'Invoice is already POSTED' };
      if (!invoice.items || invoice.items.length === 0) return { success: false, error: 'Cannot post an empty invoice with 0 items' };

      // 1. Validate items and compute COGS
      let baleCogsTotal = 0;
      let piecesCogsTotal = 0;

      for (const item of invoice.items) {
        if (item.isRawBale) {
          const bale = this.inwardGatePasses.find(
            b => (b.baleCode && b.baleCode.toLowerCase() === item.barcode.toLowerCase()) ||
                 b.gatePassNo.toLowerCase() === item.barcode.toLowerCase() ||
                 b.id === item.barcode
          );
          if (!bale) {
            return { success: false, error: `Raw Bale "${item.barcode}" not found in warehouse inventory` };
          }
          if (bale.status === 'SOLD_AS_BALE') {
            return { success: false, error: `Raw Bale "${bale.baleCode || bale.gatePassNo}" is already marked as SOLD` };
          }
          const baleCost = Number(bale.totalBaleCost || (bale.totalBaleWeight ? bale.totalBaleWeight * 40 : 1500));
          item.calculatedCostPrice = baleCost;
          baleCogsTotal += baleCost;
          // Mark bale as sold
          bale.status = 'SOLD_AS_BALE';
          bale.sortingStatus = 'FULLY_SORTED';
        } else {
          const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === item.barcode.toLowerCase());
          if (!piece) {
            return { success: false, error: `Garment piece "${item.barcode}" not found in inventory` };
          }
          if (piece.isSold || piece.status === 'SOLD') {
            return { success: false, error: `Garment piece "${item.barcode}" is already marked as SOLD` };
          }
          const grams = piece.weightGrams || Math.round((piece.weightKg || 0.45) * 1000);
          const pieceCost = piece.calculatedCostPrice || piece.costPrice || (piece.costPerGram ? Number((grams * piece.costPerGram).toFixed(2)) : 18.5);
          item.calculatedCostPrice = pieceCost;
          piecesCogsTotal += pieceCost;
          // Mark piece as sold
          piece.isSold = true;
          piece.status = 'SOLD';
          piece.soldInvoiceId = invoice.id;
          piece.soldPriceAed = item.finalAmount || item.unitPrice;
        }
      }

      baleCogsTotal = Number(baleCogsTotal.toFixed(2));
      piecesCogsTotal = Number(piecesCogsTotal.toFixed(2));
      const totalCOGS = Number((baleCogsTotal + piecesCogsTotal).toFixed(2));

      invoice.grossProfitAed = Number((invoice.subTotal - totalCOGS).toFixed(2));
      invoice.grossProfitPercent = invoice.subTotal > 0 ? Math.round(((invoice.subTotal - totalCOGS) / invoice.subTotal) * 100) : 0;
      invoice.status = 'POSTED';
      invoice.postedAt = new Date().toISOString();
      invoice.postedBy = postedBy;

      // 2. Customer Khata update (AED conversion)
      const totalAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
      const customer = this.parties.find(p => p.id === invoice.customerId) ||
                       this.parties.find(p => p.name.toLowerCase() === invoice.customerName.toLowerCase());
      if (customer) {
        customer.currentBalance = Number((customer.currentBalance + totalAed).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-b2b-${invoice.id}-${Date.now()}`,
          partyId: customer.id,
          date: invoice.date,
          docType: 'INVOICE',
          docRef: invoice.invoiceNo,
          debit: totalAed,
          credit: 0,
          balance: customer.currentBalance,
          description: `Custom B2B Sale Invoice ${invoice.invoiceNo} (${invoice.items.length} items - TRN: ${invoice.customerTrn || 'N/A'})`
        });
      }

      // 3. Automated Dual-Entry COA Journal Voucher
      const arAcc = this.getOrCreateAccount('1130', 'Accounts Receivable (Trade & Live Stream Claimants)', 'ASSET');
      const b2bRevAcc = this.getOrCreateAccount('4140', 'Wholesale B2B Bulk Sales Revenue', 'REVENUE');
      const otherChargesRevAcc = this.getOrCreateAccount('4310', 'Delivery & Shipping Fee Revenue', 'REVENUE');
      const vatAcc = this.getOrCreateAccount('2140', 'UAE VAT Output Tax Payable (5% FTA)', 'LIABILITY');
      const cogsBaleAcc = this.getOrCreateAccount('5120', 'Cost of Goods Sold (COGS) - Bulk Bales Sold', 'EXPENSE');
      const cogsPieceAcc = this.getOrCreateAccount('5110', 'Cost of Goods Sold (COGS) - Finished Garments', 'EXPENSE');
      const invBaleAcc = this.getOrCreateAccount('1140', 'Inventory - Raw Bulk Bales (Unopened Sacks & Containers)', 'ASSET');
      const invPieceAcc = this.getOrCreateAccount('1160', 'Inventory - Sorted & Tagged Garments (Retail & Live Stream Ready)', 'ASSET');

      const nextVchIdx = this.vouchers.length + 1;
      const voucherNo = `JV-B2B-${String(nextVchIdx).padStart(4, '0')}`;
      const voucherLines: VoucherLine[] = [];
      let lCounter = 1;

      // Debit Customer Khata
      voucherLines.push({
        id: `vl-b2b-${invoice.id}-${lCounter++}`,
        accountId: customer?.accountMap?.receivableAccountId || arAcc.id,
        accountCode: customer?.accountMap?.receivableAccountId ? (this.coaAccounts.find(a => a.id === customer.accountMap?.receivableAccountId)?.code || arAcc.code) : arAcc.code,
        accountName: customer ? `Accounts Receivable - ${customer.name}` : arAcc.name,
        debitAmount: totalAed,
        creditAmount: 0,
        narration: `B2B Wholesale Invoice ${invoice.invoiceNo}`
      });

      // Calculate other charges sum
      const otherChargesSum = Number(((invoice.otherCharges || []).reduce((sum, oc) => sum + (Number(oc.amount) || 0), 0) * (invoice.exchangeRate || 1.0)).toFixed(2));
      const netItemsSubtotal = Number((totalAed - (invoice.vatAmount || 0) - otherChargesSum).toFixed(2));

      // Credit B2B Revenue
      voucherLines.push({
        id: `vl-b2b-${invoice.id}-${lCounter++}`,
        accountId: b2bRevAcc.id,
        accountCode: b2bRevAcc.code,
        accountName: b2bRevAcc.name,
        debitAmount: 0,
        creditAmount: netItemsSubtotal,
        narration: `Wholesale B2B Sales Revenue (${invoice.items.length} items): Invoice ${invoice.invoiceNo}`
      });

      // Credit Other Charges Revenue
      if (otherChargesSum > 0) {
        voucherLines.push({
          id: `vl-b2b-${invoice.id}-${lCounter++}`,
          accountId: otherChargesRevAcc.id,
          accountCode: otherChargesRevAcc.code,
          accountName: otherChargesRevAcc.name,
          debitAmount: 0,
          creditAmount: otherChargesSum,
          narration: `Additional Services & Freight Charges: Invoice ${invoice.invoiceNo}`
        });
      }

      // Credit VAT Output Tax if mainland 5%
      const vatAed = Number(((invoice.vatAmount || 0) * (invoice.exchangeRate || 1.0)).toFixed(2));
      if (vatAed > 0) {
        voucherLines.push({
          id: `vl-b2b-${invoice.id}-${lCounter++}`,
          accountId: vatAcc.id,
          accountCode: vatAcc.code,
          accountName: vatAcc.name,
          debitAmount: 0,
          creditAmount: vatAed,
          narration: `UAE VAT 5% Output Tax (TRN: ${invoice.customerTrn || 'B2B'}): Invoice ${invoice.invoiceNo}`
        });
      }

      // COGS and Inventory Relief - Bales
      if (baleCogsTotal > 0) {
        voucherLines.push({
          id: `vl-b2b-${invoice.id}-${lCounter++}`,
          accountId: cogsBaleAcc.id,
          accountCode: cogsBaleAcc.code,
          accountName: cogsBaleAcc.name,
          debitAmount: baleCogsTotal,
          creditAmount: 0,
          narration: `COGS for Bulk Bales Sold: Invoice ${invoice.invoiceNo}`
        });
        voucherLines.push({
          id: `vl-b2b-${invoice.id}-${lCounter++}`,
          accountId: invBaleAcc.id,
          accountCode: invBaleAcc.code,
          accountName: invBaleAcc.name,
          debitAmount: 0,
          creditAmount: baleCogsTotal,
          narration: `Inventory Relief for Raw Bulk Bales: Invoice ${invoice.invoiceNo}`
        });
      }

      // COGS and Inventory Relief - Pieces
      if (piecesCogsTotal > 0) {
        voucherLines.push({
          id: `vl-b2b-${invoice.id}-${lCounter++}`,
          accountId: cogsPieceAcc.id,
          accountCode: cogsPieceAcc.code,
          accountName: cogsPieceAcc.name,
          debitAmount: piecesCogsTotal,
          creditAmount: 0,
          narration: `COGS for Sorted Garment Pieces Sold: Invoice ${invoice.invoiceNo}`
        });
        voucherLines.push({
          id: `vl-b2b-${invoice.id}-${lCounter++}`,
          accountId: invPieceAcc.id,
          accountCode: invPieceAcc.code,
          accountName: invPieceAcc.name,
          debitAmount: 0,
          creditAmount: piecesCogsTotal,
          narration: `Inventory Relief for Sorted Garments: Invoice ${invoice.invoiceNo}`
        });
      }

      const voucher: Voucher = {
        id: `vch-b2b-${invoice.id}`,
        voucherNo,
        voucherType: 'JOURNAL',
        date: invoice.date,
        currency: 'AED',
        exchangeRate: 1.0,
        referenceNo: invoice.invoiceNo,
        documentRef: invoice.invoiceNo,
        narration: `Automated B2B Corporate Sale: Invoice ${invoice.invoiceNo} to ${invoice.customerName}`,
        status: 'POSTED',
        postedAt: new Date().toISOString(),
        postedBy,
        lines: voucherLines
      };

      const { newLedgers, updatedAccounts } = FinanceEngine.postVoucherToLedger(
        voucher,
        this.coaAccounts,
        this.ledgers
      );

      this.vouchers.unshift(voucher);
      this.ledgers.push(...newLedgers);
      this.coaAccounts = updatedAccounts;

      this.auditLogs.unshift(
        AuditEngine.createLogEntry('SALES', 'POST', invoice.invoiceNo, 'POSTED', postedBy, `Posted Custom B2B Sale ${invoice.invoiceNo} (${invoice.items.length} items: ${baleCogsTotal > 0 ? 'Bales ' : ''}${piecesCogsTotal > 0 ? 'Pieces' : ''}) for ${invoice.customerName}`)
      );

      return { success: true, invoice, voucher };
    }, { module: 'SALES', entity: 'CUSTOM_B2B_INVOICE', action: 'POST', documentRef: invoiceId });
  }

  public unpostCustomB2BSaleInvoice(invoiceId: string): { success: boolean; error?: string } {
    return this.transaction(() => {
      const invoice = this.salesInvoices.find(i => i.id === invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found' };
      if (invoice.status !== 'POSTED') return { success: false, error: 'Only POSTED invoices can be unposted' };

      invoice.status = 'UNPOSTED';

      // 1. Restore raw bales
      invoice.items.forEach(item => {
        if (item.isRawBale) {
          const bale = this.inwardGatePasses.find(
            b => (b.baleCode && b.baleCode.toLowerCase() === item.barcode.toLowerCase()) ||
                 b.gatePassNo.toLowerCase() === item.barcode.toLowerCase() ||
                 b.id === item.barcode
          );
          if (bale) {
            bale.status = 'UNOPENED';
            bale.sortingStatus = 'UNOPENED';
          }
        } else {
          const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === item.barcode.toLowerCase());
          if (piece) {
            piece.isSold = false;
            piece.status = 'IN_STOCK';
            piece.soldInvoiceId = undefined;
          }
        }
      });

      // 2. Reverse customer khata
      const totalAed = invoice.currency === 'AED' ? invoice.totalAmount : Number((invoice.totalAmount * (invoice.exchangeRate || 1.0)).toFixed(2));
      const customer = this.parties.find(p => p.id === invoice.customerId) ||
                       this.parties.find(p => p.name.toLowerCase() === invoice.customerName.toLowerCase());
      if (customer) {
        customer.currentBalance = Number((customer.currentBalance - totalAed).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-rev-${invoice.id}-${Date.now()}`,
          partyId: customer.id,
          date: new Date().toISOString().slice(0, 10),
          docType: 'JV',
          docRef: `UNPOST-${invoice.invoiceNo}`,
          debit: 0,
          credit: totalAed,
          balance: customer.currentBalance,
          description: `Unposted B2B Wholesale Invoice ${invoice.invoiceNo} reversal`
        });
      }

      // 3. Unpost associated COA voucher
      const voucher = this.vouchers.find(v => v.documentRef === invoice.invoiceNo || v.id === `vch-b2b-${invoice.id}`);
      if (voucher && voucher.status === 'POSTED') {
        this.unpostVoucher(voucher.id);
      }

      this.auditLogs.unshift(
        AuditEngine.createLogEntry('SALES', 'UNPOST', invoice.invoiceNo, 'UNPOSTED', 'Accounts Lead', `Unposted B2B Wholesale Invoice ${invoice.invoiceNo}, restored raw bales and garments to stock`)
      );

      return { success: true };
    }, { module: 'SALES', entity: 'CUSTOM_B2B_INVOICE', action: 'UNPOST', documentRef: invoiceId });
  }

  public deleteDraftCustomB2BSaleInvoice(invoiceId: string): { success: boolean; error?: string } {
    return this.transaction(() => {
      const idx = this.salesInvoices.findIndex(i => i.id === invoiceId);
      if (idx === -1) return { success: false, error: 'Invoice not found' };
      const invoice = this.salesInvoices[idx];
      if (invoice.status === 'POSTED') {
        return { success: false, error: 'Cannot delete a POSTED invoice. Please UNPOST it first.' };
      }

      this.salesInvoices.splice(idx, 1);
      this.auditLogs.unshift(
        AuditEngine.createLogEntry('SALES', 'DELETE', invoice.invoiceNo, 'DRAFT', 'Sales Mgr', `Deleted draft B2B invoice ${invoice.invoiceNo}`)
      );
      return { success: true };
    }, { module: 'SALES', entity: 'CUSTOM_B2B_INVOICE', action: 'DELETE', documentRef: invoiceId });
  }

  // --- Parcel Return & RTO Management ---
  public getParcelReturns(): ParcelReturnRecord[] {
    return this.parcelReturns;
  }

  public getParcelByTrackingOrInvoice(query: string): {
    found: boolean;
    invoice?: SalesInvoice;
    customer?: Party;
    items: {
      piece?: PieceBreakdownItem;
      invoiceItem: SalesInvoice['items'][0];
      barcode: string;
      description: string;
      weightGrams: number;
      weightKg: number;
      costPerGram: number;
      calculatedCostPrice: number;
      salePrice: number;
      isReturned: boolean;
    }[];
    error?: string;
  } {
    const q = (query || '').trim().toLowerCase();
    if (!q) return { found: false, items: [], error: 'Please enter a Tracking Number, Invoice Number, or Barcode' };

    // Search by tracking number or invoice number
    let invoice = this.salesInvoices.find(
      i => (i.trackingNumber && i.trackingNumber.toLowerCase() === q) ||
           i.invoiceNo.toLowerCase() === q ||
           i.id.toLowerCase() === q
    );

    // If not found, search by item barcode
    if (!invoice) {
      invoice = this.salesInvoices.find(i => i.items.some(it => it.barcode.toLowerCase() === q));
    }

    if (!invoice) {
      return { found: false, items: [], error: `No dispatched parcel or sales invoice found matching "${query}"` };
    }

    const customer = this.parties.find(p => p.id === invoice.customerId);

    const items = invoice.items.map(it => {
      const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === it.barcode.toLowerCase());
      const weightGrams = piece?.weightGrams || Math.round((it.weightKg || 0.4) * 1000);
      const weightKg = piece?.weightKg || it.weightKg || Number((weightGrams / 1000).toFixed(3));
      const costPerGram = piece?.costPerGram || (piece?.calculatedCostPrice ? Number((piece.calculatedCostPrice / weightGrams).toFixed(6)) : 0.05);
      const calculatedCostPrice = piece?.calculatedCostPrice || piece?.costPrice || Number((weightGrams * costPerGram).toFixed(2));
      const salePrice = it.finalAmount || it.unitPrice || 120;

      return {
        piece,
        invoiceItem: it,
        barcode: it.barcode,
        description: it.description || piece?.itemName || 'Vintage Garment',
        weightGrams,
        weightKg,
        costPerGram,
        calculatedCostPrice,
        salePrice,
        isReturned: it.isReturned || false
      };
    });

    return {
      found: true,
      invoice,
      customer,
      items
    };
  }

  public processParcelReturn(params: {
    invoiceId: string;
    returnedBarcodes: string[];
    returnReason: 'REJECTED_AT_DOORSTEP' | 'WRONG_ITEM' | 'CUSTOMER_UNAVAILABLE' | 'DAMAGED_TRANSIT' | 'BUYER_CANCELLED';
    courierPartner: string;
    courierReturnCharge: number;
    processedBy: string;
    notes?: string;
  }): {
    success: boolean;
    returnRecord?: ParcelReturnRecord;
    voucher?: Voucher;
    error?: string;
  } {
    return this.transaction(() => {
      const invoice = this.salesInvoices.find(i => i.id === params.invoiceId);
      if (!invoice) return { success: false, error: 'Original Sales Invoice not found' };

      if (!params.returnedBarcodes || params.returnedBarcodes.length === 0) {
        return { success: false, error: 'Please select at least one garment barcode to return' };
      }

      const returnedItems: ParcelReturnItem[] = [];
      let totalSaleRefunded = 0;
      let totalCOGSReversed = 0;

      for (const barcode of params.returnedBarcodes) {
        const invItem = invoice.items.find(it => it.barcode.toLowerCase() === barcode.toLowerCase());
        if (!invItem) continue;

        invItem.isReturned = true;

        // Restore piece to inventory room with exact original gram-weight cost
        const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === barcode.toLowerCase());
        const weightGrams = piece?.weightGrams || Math.round((invItem.weightKg || 0.4) * 1000);
        const weightKg = piece?.weightKg || invItem.weightKg || Number((weightGrams / 1000).toFixed(3));
        const costPerGram = piece?.costPerGram || 0.05;
        const calculatedCostPrice = piece?.calculatedCostPrice || piece?.costPrice || Number((weightGrams * costPerGram).toFixed(2));
        const salePrice = invItem.finalAmount || invItem.unitPrice || 120;

        if (piece) {
          piece.isSold = false;
          piece.status = 'IN_STOCK';
          piece.soldInvoiceId = undefined;
          piece.soldPriceAed = undefined;
        }

        totalSaleRefunded += salePrice;
        totalCOGSReversed += calculatedCostPrice;

        returnedItems.push({
          barcode: invItem.barcode,
          description: invItem.description,
          weightGrams,
          weightKg,
          costPerGram,
          calculatedCostPrice,
          salePrice
        });
      }

      totalSaleRefunded = Number(totalSaleRefunded.toFixed(2));
      totalCOGSReversed = Number(totalCOGSReversed.toFixed(2));
      const courierFee = Number(Number(params.courierReturnCharge || 0).toFixed(2));

      // Determine return status of invoice
      const allItemsReturned = invoice.items.every(it => it.isReturned);
      invoice.returnStatus = allItemsReturned ? 'FULL_RTO' : 'PARTIAL_RETURN';
      invoice.isReturned = true;

      const returnNo = `RTO-2026-${String(this.parcelReturns.length + 1).padStart(4, '0')}`;
      const customer = this.parties.find(p => p.id === invoice.customerId);

      // Automated COA Dual-Entry Voucher
      const voucherData = SalesEngine.generateCOAReturnVoucher({
        returnNo,
        invoiceNo: invoice.invoiceNo,
        customerName: invoice.customerName,
        date: new Date().toISOString().split('T')[0],
        totalSaleRefunded,
        totalCOGSReversed,
        courierReturnCharge: courierFee,
        courierPartner: params.courierPartner || 'Aramex Express',
        accounts: {
          receivableAccountId: customer?.accountMap?.receivableAccountId || 'acc-1130',
          salesRevenueAccountId: 'acc-4120',
          cogsAccountId: 'acc-5110',
          inventoryAssetAccountId: 'acc-1200',
          shippingExpenseAccountId: 'acc-5420',
          courierPayableAccountId: 'acc-2120'
        }
      });

      const voucher = this.createVoucher({ ...voucherData, status: 'DRAFT' });
      this.postVoucher(voucher.id, params.processedBy || 'RTO Specialist');

      // Update Customer Khata balance
      if (customer && totalSaleRefunded > 0) {
        customer.currentBalance = Number((customer.currentBalance - totalSaleRefunded).toFixed(2));
        this.partyKhataLogs.push({
          id: `pkl-rto-${returnNo}`,
          partyId: customer.id,
          date: new Date().toISOString().split('T')[0],
          docType: 'RETURN',
          docRef: returnNo,
          debit: 0,
          credit: totalSaleRefunded,
          balance: customer.currentBalance,
          description: `Parcel Return / RTO ${returnNo} (Invoice: ${invoice.invoiceNo}, ${returnedItems.length} items restored to stock)`
        });
      }

      const returnRecord: ParcelReturnRecord = {
        id: `ret-${Date.now()}`,
        returnNo,
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        trackingNumber: invoice.trackingNumber || invoice.invoiceNo,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        returnDate: new Date().toISOString().split('T')[0],
        reason: params.returnReason,
        courierPartner: params.courierPartner,
        courierReturnCharge: courierFee,
        returnedItems,
        totalSaleRefunded,
        totalCOGSReversed,
        voucherId: voucher.id,
        voucherNo: voucher.voucherNo,
        status: 'COMPLETED',
        processedBy: params.processedBy || 'Returns Officer',
        processedAt: new Date().toISOString(),
        notes: params.notes
      };

      this.parcelReturns.unshift(returnRecord);
      invoice.rtoVoucherId = voucher.id;

      this.auditLogs.unshift(
        AuditEngine.createLogEntry(
          'SALES',
          'RETURN',
          returnNo,
          'POSTED',
          params.processedBy || 'Returns Officer',
          `Processed Parcel Return ${returnNo} for ${invoice.customerName}: restored ${returnedItems.length} garments to stock, reversed AED ${totalCOGSReversed} COGS & AED ${totalSaleRefunded} revenue, booked AED ${courierFee} courier charge`
        )
      );

      return {
        success: true,
        returnRecord,
        voucher
      };
    });
  }

  public createDraftLiveInvoice(params: {
    boothId?: string;
    pieceBarcode?: string;
    barcode?: string;
    buyerHandle: string;
    customerPhone?: string;
    trackingNumber?: string;
    shippingCharge?: number;
    shippingFeeAed?: number;
    shippingBearer?: 'COMPANY' | 'CUSTOMER';
    offeredPrice?: number;
    paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CREDIT_ACCOUNT' | 'COD' | 'CARD_POS';
    paymentStatus?: 'UNPAID_PENDING_COD' | 'PREPAID_VERIFIED' | 'PARTIAL_ADVANCE';
    courierPartner?: string;
    shippingAddress?: string;
    channel?: string;
    expiresAt?: string;
    autoPost?: boolean;
    createdBy?: string;
  }): {
    success: boolean;
    invoice?: SalesInvoice;
    voucher?: Voucher;
    error?: string;
  } {
    return this.transaction(() => {
      const barcodeToSearch = (params.pieceBarcode || params.barcode || '').trim();
      const piece = this.inventoryPieces.find(p => p.barcode.toLowerCase() === barcodeToSearch.toLowerCase());
      if (!piece) return { success: false, error: `Piece with barcode ${barcodeToSearch} not found in inventory` };
      if (piece.isSold) return { success: false, error: `Piece ${barcodeToSearch} is already marked as SOLD` };

      // Ensure customer exists or create/get party
      let customer = this.parties.find(p => p.name.toLowerCase() === params.buyerHandle.toLowerCase() || (params.customerPhone && p.phone === params.customerPhone));
      if (!customer) {
        customer = {
          id: `pty-live-${Date.now()}`,
          code: `CLT-${Date.now().toString().slice(-4)}`,
          name: params.buyerHandle,
          type: 'CLIENT',
          phone: params.customerPhone || '+971 50 123 4567',
          email: `${params.buyerHandle.toLowerCase().replace(/[^a-z0-9]/g, '')}@live.vintagevibe.ae`,
          address: params.shippingAddress || 'UAE Delivery Address',
          currency: 'AED',
          creditLimit: 5000,
          currentBalance: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
          accountMap: {
            receivableAccountId: 'acc-1130',
            revenueAccountId: 'acc-4120'
          }
        };
        this.parties.push(customer);
      }

      const salePrice = params.offeredPrice || piece.retailPriceAed || piece.estimatedPrice || 150;
      const vatAmount = Number((salePrice * 0.05).toFixed(2));
      const shippingCharge = Number(params.shippingFeeAed !== undefined ? params.shippingFeeAed : (params.shippingCharge || 0));
      const shippingBearer = params.shippingBearer || 'CUSTOMER';
      const customerShippingFee = shippingBearer === 'CUSTOMER' ? shippingCharge : 0;
      const totalAmount = Number((salePrice + vatAmount + customerShippingFee).toFixed(2));

      const courierPartner = params.courierPartner || 'DHL Express';
      const trackingNumber = params.trackingNumber || `DHL-${Math.floor(100000000 + Math.random() * 900000000)}`;
      const paymentMethod = params.paymentMethod || 'COD';
      const paymentStatus = params.paymentStatus || (paymentMethod === 'COD' ? 'UNPAID_PENDING_COD' : 'PREPAID_VERIFIED');

      const invoiceItem: SalesInvoice['items'][0] = {
        id: `sii-${Date.now()}`,
        barcode: piece.barcode,
        description: `${piece.brandName} ${piece.itemName} (${piece.sizeScanned || 'M'})`,
        weightKg: piece.weightKg || 0.4,
        weightGrams: piece.weightGrams || Math.round((piece.weightKg || 0.4) * 1000),
        costPerGram: piece.costPerGram || 0.05,
        calculatedCostPrice: piece.calculatedCostPrice || piece.costPrice || 20,
        unitPrice: salePrice,
        discount: 0,
        finalAmount: salePrice,
        lineTotal: salePrice,
        quantity: 1
      };

      const invoiceNo = `SLS-LIVE-${new Date().getFullYear()}-${String(this.salesInvoices.length + 1).padStart(4, '0')}`;
      const shouldPost = params.autoPost === true; // Default to DRAFT so it cleanly lands in Draft Invoices & Bundling

      const invoice: SalesInvoice = {
        id: `sls-inv-${Date.now()}`,
        invoiceNo,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: params.customerPhone || customer.phone,
        shippingAddress: params.shippingAddress || customer.address,
        buyerHandle: params.buyerHandle,
        boothId: params.boothId || 'booth-01',
        socialPlatform: (params.channel as any) || 'TIKTOK',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        status: shouldPost ? 'POSTED' : 'DRAFT',
        currency: 'AED',
        exchangeRate: 1.0,
        subTotal: salePrice,
        discountAmount: 0,
        vatAmount,
        totalAmount,
        netAmount: salePrice,
        grossAmount: totalAmount,
        items: [invoiceItem],
        paymentMethod: paymentMethod as any,
        paymentStatus: paymentStatus as any,
        trackingNumber,
        shippingCharge,
        shippingFeeAed: shippingCharge,
        shippingBearer,
        courierPartner,
        grossProfitAed: Number((salePrice - (invoiceItem.calculatedCostPrice || 20)).toFixed(2)),
        grossProfitPercent: salePrice > 0 ? Math.round(((salePrice - (invoiceItem.calculatedCostPrice || 20)) / salePrice) * 100) : 0,
        expiresAt: params.expiresAt,
        postedAt: shouldPost ? new Date().toISOString() : undefined,
        postedBy: shouldPost ? (params.createdBy || `Live Streamer (${params.boothId || 'Booth 1'})`) : undefined
      };

      if (shouldPost) {
        piece.isSold = true;
        piece.status = 'SOLD';
        piece.soldInvoiceId = invoice.id;
        piece.soldPriceAed = salePrice;

        const pieceCost = piece.calculatedCostPrice || piece.costPrice || (piece.weightKg ? Number((piece.weightKg * 20).toFixed(2)) : 15);
        const voucherData = SalesEngine.generateComprehensiveCOASalesVoucher(
          invoice,
          pieceCost,
          {
            receivableAccountId: customer.accountMap?.receivableAccountId || 'acc-1130',
            cashAccountId: 'acc-1110',
            salesRevenueAccountId: 'acc-4120',
            cogsAccountId: 'acc-5110',
            inventoryAssetAccountId: 'acc-1200',
            vatPayableAccountId: 'acc-2210',
            shippingExpenseAccountId: 'acc-5420',
            courierPayableAccountId: 'acc-2120'
          }
        );

        const voucher = this.createVoucher({ ...voucherData, status: 'DRAFT' });
        this.postVoucher(voucher.id, params.createdBy || 'Live Sale Host');

        this.salesInvoices.unshift(invoice);

        this.auditLogs.unshift(
          AuditEngine.createLogEntry(
            'SALES',
            'POST',
            invoice.invoiceNo,
            'POSTED',
            params.createdBy || 'Live Sale Host',
            `Live Sale Confirmed: Generated Invoice ${invoice.invoiceNo} for ${customer.name}, linked COA ledger (COGS: AED ${pieceCost}, Revenue: AED ${salePrice}), Tracking: ${trackingNumber}`
          )
        );

        return { success: true, invoice, voucher };
      } else {
        piece.status = 'CLAIMED_PENDING';
        piece.lockedByBuyer = customer.name;
        piece.lockedByBooth = params.boothId || 'booth-01';
        this.salesInvoices.unshift(invoice);
        return { success: true, invoice };
      }
    });
  }

  // --- Audit Logs ---
  public getAuditLogs(filters?: AuditFilterOptions): AuditLogEntry[] {
    return AuditEngine.filterLogs(this.auditLogs, filters || {});
  }

  public addAuditLog(
    module: ModuleType,
    action: ActionType,
    documentRef: string,
    status: DocumentStatus,
    userName: string,
    details: string,
    metaPayload?: any
  ): AuditLogEntry {
    const entry = AuditEngine.createLogEntry(module, action, documentRef, status, userName, details, metaPayload);
    this.auditLogs.unshift(entry);
    this.saveToDisk();
    return entry;
  }

  // --- Budgets ---
  public getBudgets(periodMonth: string = '2026-09'): BudgetLimit[] {
    let periodBudgets = this.budgets.filter(b => b.periodMonth === periodMonth);
    if (periodBudgets.length === 0) {
      this.seedDefaultBudgets(periodMonth);
      periodBudgets = this.budgets.filter(b => b.periodMonth === periodMonth);
    }

    return periodBudgets.map(b => {
      const monthLedgers = this.ledgers.filter(
        l => l.accountId === b.accountId && l.date.startsWith(periodMonth)
      );
      const account = this.coaAccounts.find(a => a.id === b.accountId);
      let actualSpentAed = 0;
      if (account?.classification === 'EXPENSE') {
        actualSpentAed = monthLedgers.reduce((sum, l) => sum + (l.debit - l.credit), 0);
      } else {
        actualSpentAed = monthLedgers.reduce((sum, l) => sum + Math.abs(l.debit - l.credit), 0);
      }
      actualSpentAed = Math.max(0, Number(actualSpentAed.toFixed(2)));

      const varianceAed = Number((b.budgetLimitAed - actualSpentAed).toFixed(2));
      const percentUsed = b.budgetLimitAed > 0
        ? Number(((actualSpentAed / b.budgetLimitAed) * 100).toFixed(1))
        : 0;

      const status: 'ON_TRACK' | 'WARNING' | 'EXCEEDED' =
        percentUsed > 100 ? 'EXCEEDED' : percentUsed >= 85 ? 'WARNING' : 'ON_TRACK';

      return {
        id: b.id,
        accountId: b.accountId,
        accountCode: b.accountCode,
        accountName: b.accountName,
        periodMonth: b.periodMonth,
        budgetLimitAed: b.budgetLimitAed,
        notes: b.notes,
        actualSpentAed,
        varianceAed,
        percentUsed,
        status,
        updatedAt: b.updatedAt
      };
    });
  }

  public setBudget(data: {
    accountId: string;
    periodMonth: string;
    budgetLimitAed: number;
    notes?: string;
  }): BudgetLimit {
    const account = this.coaAccounts.find(a => a.id === data.accountId);
    if (!account) throw new Error('Account not found in COA');

    const existingIndex = this.budgets.findIndex(
      b => b.accountId === data.accountId && b.periodMonth === data.periodMonth
    );

    const now = new Date().toISOString();
    let budgetRecord: any;

    if (existingIndex >= 0) {
      this.budgets[existingIndex] = {
        ...this.budgets[existingIndex],
        budgetLimitAed: Number(data.budgetLimitAed) || 0,
        notes: data.notes || this.budgets[existingIndex].notes,
        updatedAt: now
      };
      budgetRecord = this.budgets[existingIndex];
    } else {
      budgetRecord = {
        id: `bdg-${Date.now()}`,
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        periodMonth: data.periodMonth,
        budgetLimitAed: Number(data.budgetLimitAed) || 0,
        notes: data.notes,
        updatedAt: now
      };
      this.budgets.push(budgetRecord);
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('FINANCE', 'UPDATE', budgetRecord.accountCode, 'POSTED', 'Farhan Zaidi', `Configured monthly budget limit of AED ${data.budgetLimitAed} for ${account.name} (${data.periodMonth})`)
    );

    const allBudgets = this.getBudgets(data.periodMonth);
    return allBudgets.find(b => b.id === budgetRecord.id)!;
  }

  public deleteBudget(budgetId: string): { success: boolean; error?: string } {
    const idx = this.budgets.findIndex(b => b.id === budgetId);
    if (idx === -1) return { success: false, error: 'Budget record not found' };
    this.budgets.splice(idx, 1);
    return { success: true };
  }

  public seedDefaultBudgets(periodMonth: string): BudgetLimit[] {
    const defaultTemplates = [
      { code: '5110-00', limit: 75000, notes: 'Direct bales cost budget' },
      { code: '5210-00', limit: 12000, notes: 'Port duties and clearance' },
      { code: '5310-00', limit: 25000, notes: 'Staff salaries and sorting labor' },
      { code: '5410-00', limit: 18000, notes: 'Warehouse & retail showroom leases' }
    ];

    for (const dt of defaultTemplates) {
      const acc = this.coaAccounts.find(a => a.code === dt.code);
      if (acc && !this.budgets.some(b => b.accountId === acc.id && b.periodMonth === periodMonth)) {
        this.budgets.push({
          id: `bdg-${Date.now()}-${acc.code}-${Math.random().toString(36).substring(2, 7)}`,
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          periodMonth,
          budgetLimitAed: dt.limit,
          notes: dt.notes,
          updatedAt: new Date().toISOString()
        });
      }
    }

    return this.getBudgets(periodMonth);
  }

  // --- Custom Report Templates ---
  public getCustomReportTemplates(): CustomReportTemplate[] {
    return this.customReportTemplates;
  }

  public saveCustomReportTemplate(templateData: Partial<CustomReportTemplate>): CustomReportTemplate {
    const id = templateData.id || `crt-${Date.now()}`;
    const existingIndex = this.customReportTemplates.findIndex(t => t.id === id);

    const template: CustomReportTemplate = {
      id,
      name: templateData.name || 'Untitled Custom Statement',
      description: templateData.description || 'Customized Income Statement breakdown',
      sections: templateData.sections || [],
      createdAt: templateData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.customReportTemplates[existingIndex] = template;
    } else {
      this.customReportTemplates.push(template);
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('FINANCE', 'CREATE', template.id, 'POSTED', 'Farhan Zaidi', `Saved Custom Income Statement template: "${template.name}" with ${template.sections.length} sections`)
    );

    return template;
  }

  public deleteCustomReportTemplate(templateId: string): { success: boolean; error?: string } {
    const idx = this.customReportTemplates.findIndex(t => t.id === templateId);
    if (idx === -1) return { success: false, error: 'Custom report template not found' };
    this.customReportTemplates.splice(idx, 1);
    return { success: true };
  }

  public executeCustomReport(templateId: string): ExecutedCustomReport {
    const template = this.customReportTemplates.find(t => t.id === templateId);
    if (!template) throw new Error('Custom report template not found');

    const executedSections = template.sections.map(sec => {
      const sectionAccounts = (sec.accountIds || []).map(accId => {
        const acc = this.coaAccounts.find(a => a.id === accId);
        if (!acc) return null;
        return {
          id: acc.id,
          code: acc.code,
          name: acc.name,
          balance: acc.currentBalance
        };
      }).filter(Boolean) as { id: string; code: string; name: string; balance: number }[];

      const subtotal = sectionAccounts.reduce((sum, a) => sum + a.balance, 0);

      return {
        id: sec.id,
        title: sec.title,
        type: sec.type,
        accounts: sectionAccounts,
        subtotal: Number(subtotal.toFixed(2))
      };
    });

    const totalRevenue = executedSections
      .filter(s => s.type === 'REVENUE')
      .reduce((sum, s) => sum + s.subtotal, 0);

    const totalCOGS = executedSections
      .filter(s => s.type === 'COGS')
      .reduce((sum, s) => sum + s.subtotal, 0);

    const grossProfit = Number((totalRevenue - totalCOGS).toFixed(2));

    const totalExpenses = executedSections
      .filter(s => s.type === 'EXPENSE')
      .reduce((sum, s) => sum + s.subtotal, 0);

    const netOperatingIncome = Number((grossProfit - totalExpenses).toFixed(2));

    return {
      templateId: template.id,
      templateName: template.name,
      sections: executedSections,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalCOGS: Number(totalCOGS.toFixed(2)),
      grossProfit,
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netOperatingIncome,
      generatedAt: new Date().toISOString()
    };
  }

  // --- Recurring Vouchers ---
  public getRecurringVoucherTemplates(): RecurringVoucherTemplate[] {
    return this.recurringVoucherTemplates;
  }

  public saveRecurringVoucherTemplate(templateData: Partial<RecurringVoucherTemplate>): RecurringVoucherTemplate {
    const id = templateData.id || `rvt-${Date.now()}`;
    const existingIndex = this.recurringVoucherTemplates.findIndex(t => t.id === id);

    const lines = templateData.lines || [];
    const totalAmount = lines.reduce((sum, l) => sum + (Number(l.debitAmount) || 0), 0);

    const template: RecurringVoucherTemplate = {
      id,
      title: templateData.title || 'Untitled Recurring Voucher',
      voucherType: templateData.voucherType || 'BPV',
      frequency: templateData.frequency || 'MONTHLY',
      dayOfMonth: templateData.dayOfMonth || 1,
      narration: templateData.narration || '',
      currency: templateData.currency || 'AED',
      exchangeRate: templateData.exchangeRate || 1.0,
      lines,
      totalAmount: Number(totalAmount.toFixed(2)),
      isActive: templateData.isActive !== undefined ? templateData.isActive : true,
      lastRunDate: templateData.lastRunDate,
      nextDueDate: templateData.nextDueDate || new Date().toISOString().split('T')[0],
      createdAt: templateData.createdAt || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      this.recurringVoucherTemplates[existingIndex] = template;
    } else {
      this.recurringVoucherTemplates.push(template);
    }

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('FINANCE', 'CREATE', template.id, 'POSTED', 'Farhan Zaidi', `Configured Recurring Voucher Template: "${template.title}" (AED ${template.totalAmount} ${template.frequency})`)
    );

    return template;
  }

  public deleteRecurringVoucherTemplate(id: string): { success: boolean; error?: string } {
    const idx = this.recurringVoucherTemplates.findIndex(t => t.id === id);
    if (idx === -1) return { success: false, error: 'Recurring template not found' };
    this.recurringVoucherTemplates.splice(idx, 1);
    return { success: true };
  }

  public runRecurringVoucher(templateId: string, runDate?: string): {
    success: boolean;
    voucher?: Voucher;
    error?: string;
  } {
    const template = this.recurringVoucherTemplates.find(t => t.id === templateId);
    if (!template) return { success: false, error: 'Template not found' };

    const executionDate = runDate || new Date().toISOString().split('T')[0];
    const voucherNo = `${template.voucherType}-REC-${Math.floor(1000 + Math.random() * 9000)}`;

    const totalDebit = template.lines.reduce((sum, l) => sum + (Number(l.debitAmount) || 0), 0);
    const totalCredit = template.lines.reduce((sum, l) => sum + (Number(l.creditAmount) || 0), 0);

    const voucher: Voucher = {
      id: `vch-rec-${Date.now()}`,
      voucherNo,
      type: template.voucherType as any,
      status: 'POSTED',
      date: executionDate,
      narration: `[Recurring Auto-Run] ${template.title}: ${template.narration}`,
      totalDebit,
      totalCredit,
      currency: template.currency,
      exchangeRate: template.exchangeRate,
      documentRef: `REC-${template.id}`,
      postedAt: new Date().toISOString(),
      postedBy: 'Automated Recurring Engine',
      lines: template.lines.map((l, i) => ({
        ...l,
        id: `vl-rec-${Date.now()}-${i}`
      }))
    };

    // Post to General Ledger
    this.vouchers.push(voucher);
    const postRes = FinanceEngine.postVoucherToLedger(voucher, this.coaAccounts, this.ledgers);
    this.ledgers.push(...postRes.newLedgers);

    // Update template state
    template.lastRunDate = executionDate;
    const curDate = new Date(executionDate);
    curDate.setMonth(curDate.getMonth() + 1);
    template.nextDueDate = curDate.toISOString().split('T')[0];

    this.auditLogs.unshift(
      AuditEngine.createLogEntry('FINANCE', 'POST', voucher.voucherNo, 'POSTED', 'Recurring Engine', `Executed & posted recurring voucher "${template.title}" for AED ${totalDebit}`)
    );

    return { success: true, voucher };
  }

  public runAllDueRecurringVouchers(runDate?: string): {
    success: boolean;
    executedCount: number;
    vouchers: Voucher[];
  } {
    const today = runDate || new Date().toISOString().split('T')[0];
    const dueTemplates = this.recurringVoucherTemplates.filter(
      t => t.isActive && (!t.lastRunDate || t.lastRunDate.slice(0, 7) !== today.slice(0, 7))
    );

    const generatedVouchers: Voucher[] = [];
    for (const t of dueTemplates) {
      const res = this.runRecurringVoucher(t.id, today);
      if (res.success && res.voucher) {
        generatedVouchers.push(res.voucher);
      }
    }

    return {
      success: true,
      executedCount: generatedVouchers.length,
      vouchers: generatedVouchers
    };
  }
  // UAE FTA Audit File (FAF v1.0) Official Tax File Generation
  public generateFtaAuditFile(startDate?: string, endDate?: string): {
    success: boolean;
    fileName: string;
    csvContent: string;
    summary: {
      totalOutputVat: number;
      totalInputVat: number;
      netVatPayable: number;
      salesCount: number;
      purchaseCount: number;
      glLinesCount: number;
    };
  } {
    const prof = this.companyProfile;
    const start = startDate || '2026-01-01';
    const end = endDate || new Date().toISOString().split('T')[0];

    // Filter relevant records within date range
    const relevantLedgers = this.ledgers.filter(l => l.date >= start && l.date <= end);
    const relevantSales = this.salesInvoices.filter(s => s.date >= start && s.date <= end);
    const relevantPurchases = this.purchaseInvoices.filter(p => p.date >= start && p.date <= end);

    const totalOutputVat = relevantSales.reduce((sum, s) => sum + (Number(s.vatAmount) || 0), 0);
    const totalInputVat = relevantPurchases.reduce((sum, p) => sum + (Number(p.vatAmount) || 0), 0);
    const netVatPayable = totalOutputVat - totalInputVat;

    // Build Federal Tax Authority Standard FAF CSV
    const lines: string[] = [];

    // Section 1: Company Profile (Header)
    lines.push('=== FEDERAL TAX AUTHORITY (FTA) UAE - VAT AUDIT FILE (FAF v1.0) ===');
    lines.push(`Taxable Person Name (EN),${prof.companyName.replace(/,/g, ' ')}`);
    lines.push(`Taxable Person Name (AR),فينتيج فايبز للتجارة العامة ذ.م.م`);
    lines.push(`Tax Registration Number (TRN),${prof.trnTaxNo}`);
    lines.push(`Tax Agency Name,Federal Tax Authority - UAE`);
    lines.push(`Audit Period Start,${start}`);
    lines.push(`Audit Period End,${end}`);
    lines.push(`Functional Currency,AED`);
    lines.push(`FAF Export Timestamp,${new Date().toISOString()}`);
    lines.push('');

    // Section 2: General Ledger Transactions
    lines.push('--- SECTION 1: GENERAL LEDGER TRANSACTIONS ---');
    lines.push('TransactionDate,VoucherNumber,AccountCode,AccountName,DebitAmountAED,CreditAmountAED,BalanceAED,Narration');
    for (const l of relevantLedgers) {
      lines.push([
        l.date,
        l.voucherNo,
        l.accountCode,
        `"${(l.accountName || '').replace(/"/g, '""')}"`,
        l.debitAmount.toFixed(2),
        l.creditAmount.toFixed(2),
        l.balanceAfter.toFixed(2),
        `"${(l.narration || '').replace(/"/g, '""')}"`
      ].join(','));
    }
    lines.push('');

    // Section 3: Sales Invoices (Supply Ledger - Output VAT)
    lines.push('--- SECTION 2: SALES SUPPLY LEDGER (OUTPUT VAT) ---');
    lines.push('InvoiceDate,InvoiceNumber,CustomerName,CustomerTRN,LineDescription,TaxableAmountAED,VATRatePercent,VATAmountAED,GrossAmountAED');
    for (const inv of relevantSales) {
      for (const item of inv.items) {
        const itemVat = item.lineTotal * 0.05;
        lines.push([
          inv.date,
          inv.invoiceNo,
          `"${(inv.clientName || '').replace(/"/g, '""')}"`,
          inv.clientTrn || 'UNREGISTERED',
          `"${(item.description || '').replace(/"/g, '""')}"`,
          item.lineTotal.toFixed(2),
          '5.00',
          itemVat.toFixed(2),
          (item.lineTotal + itemVat).toFixed(2)
        ].join(','));
      }
    }
    lines.push('');

    // Section 4: Purchase Invoices (Input VAT Recoverable)
    lines.push('--- SECTION 3: PURCHASE LEDGER (INPUT VAT RECOVERABLE) ---');
    lines.push('InvoiceDate,InvoiceNumber,SupplierName,SupplierTRN,Description,TaxableAmountAED,VATRatePercent,VATAmountAED,GrossAmountAED');
    for (const pinv of relevantPurchases) {
      lines.push([
        pinv.date,
        pinv.invoiceNo,
        `"${(pinv.supplierName || '').replace(/"/g, '""')}"`,
        pinv.supplierTrn || 'IMPORT-REVERSE-CHARGE',
        `"${(pinv.notes || 'Bulk Vintage Bale Inward Purchase').replace(/"/g, '""')}"`,
        pinv.netAmount.toFixed(2),
        '5.00',
        pinv.vatAmount.toFixed(2),
        pinv.grossAmount.toFixed(2)
      ].join(','));
    }
    lines.push('');

    // Section 5: VAT Summary
    lines.push('--- SECTION 4: FTA VAT RETURN BOX SUMMARY ---');
    lines.push(`Box 1a: Standard Rated Supplies Total (AED),${relevantSales.reduce((s, i) => s + i.netAmount, 0).toFixed(2)}`);
    lines.push(`Box 1b: Output VAT Total (AED),${totalOutputVat.toFixed(2)}`);
    lines.push(`Box 9a: Standard Rated Purchases Total (AED),${relevantPurchases.reduce((s, i) => s + i.netAmount, 0).toFixed(2)}`);
    lines.push(`Box 9b: Recoverable Input VAT Total (AED),${totalInputVat.toFixed(2)}`);
    lines.push(`Box 14: Net VAT Payable/(Refundable) to FTA (AED),${netVatPayable.toFixed(2)}`);

    const csvContent = lines.join('\r\n');
    const fileName = `FTA_FAF_AUDIT_${prof.trnTaxNo}_${start}_${end}.csv`;

    return {
      success: true,
      fileName,
      csvContent,
      summary: {
        totalOutputVat,
        totalInputVat,
        netVatPayable,
        salesCount: relevantSales.length,
        purchaseCount: relevantPurchases.length,
        glLinesCount: relevantLedgers.length
      }
    };
  }

  // UAE Corporate Tax (9% on profit > AED 375,000) Estimator & Provision
  public calculateCorporateTaxEstimate(taxYear: number = 2026): {
    taxYear: number;
    totalRevenue: number;
    totalExpenses: number;
    accountingNetProfit: number;
    statutoryExemptionThreshold: number;
    qualifyingTaxableProfit: number;
    taxRatePercent: number;
    estimatedCorporateTaxAed: number;
    existingProvisionBalance: number;
    additionalProvisionRequired: number;
    applicableTaxBracket: string;
  } {
    // Ensure Corporate Tax accounts exist in COA
    this.ensureCorporateTaxAccounts();

    const revenues = this.coaAccounts
      .filter(a => a.classification === 'REVENUE')
      .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

    const expenses = this.coaAccounts
      .filter(a => a.classification === 'EXPENSE' && a.code !== '5510-00')
      .reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

    const accountingNetProfit = Math.max(0, revenues - expenses);
    const statutoryExemptionThreshold = 375000; // UAE Federal Decree-Law No. 47 of 2022
    const qualifyingTaxableProfit = Math.max(0, accountingNetProfit - statutoryExemptionThreshold);
    const taxRatePercent = qualifyingTaxableProfit > 0 ? 9.0 : 0.0;
    const estimatedCorporateTaxAed = Math.round(qualifyingTaxableProfit * 0.09 * 100) / 100;

    const existingProvisionAcc = this.coaAccounts.find(a => a.code === '2410-00');
    const existingProvisionBalance = existingProvisionAcc ? existingProvisionAcc.currentBalance : 0;
    const additionalProvisionRequired = Math.max(0, estimatedCorporateTaxAed - existingProvisionBalance);

    const applicableTaxBracket = accountingNetProfit <= statutoryExemptionThreshold
      ? '0% Bracket (Within AED 375,000 Small Business Exemption)'
      : '9% Standard UAE Corporate Tax on Profit > AED 375,000';

    return {
      taxYear,
      totalRevenue: revenues,
      totalExpenses: expenses,
      accountingNetProfit,
      statutoryExemptionThreshold,
      qualifyingTaxableProfit,
      taxRatePercent,
      estimatedCorporateTaxAed,
      existingProvisionBalance,
      additionalProvisionRequired,
      applicableTaxBracket
    };
  }

  private ensureCorporateTaxAccounts() {
    let provAcc = this.coaAccounts.find(a => a.code === '2410-00');
    if (!provAcc) {
      this.coaAccounts.push({
        id: 'acc-2410',
        code: '2410-00',
        name: 'Provision for UAE Corporate Tax (9% FTA)',
        classification: 'LIABILITY',
        tierLevel: 2,
        currency: 'AED',
        currentBalance: 0,
        isSystem: true,
        isActive: true
      });
    }

    let expAcc = this.coaAccounts.find(a => a.code === '5510-00');
    if (!expAcc) {
      this.coaAccounts.push({
        id: 'acc-5510',
        code: '5510-00',
        name: 'UAE Corporate Tax Provision Expense',
        classification: 'EXPENSE',
        tierLevel: 2,
        currency: 'AED',
        currentBalance: 0,
        isSystem: true,
        isActive: true
      });
    }
  }

  public postCorporateTaxProvision(taxYear: number = 2026, postedBy: string = 'Tax Compliance Officer'): {
    success: boolean;
    error?: string;
    voucher?: Voucher;
    estimate?: any;
  } {
    return this.transaction(() => {
      this.ensureCorporateTaxAccounts();
      const estimate = this.calculateCorporateTaxEstimate(taxYear);

      if (estimate.additionalProvisionRequired <= 0) {
        return {
          success: false,
          error: estimate.accountingNetProfit <= 375000
            ? 'Net profit is within the 0% UAE Small Business Relief threshold (<= AED 375,000). No tax liability provision required.'
            : 'Corporate tax provision is already fully funded for this tax period.',
          estimate
        };
      }

      const amount = estimate.additionalProvisionRequired;
      const expenseAcc = this.coaAccounts.find(a => a.code === '5510-00')!;
      const liabilityAcc = this.coaAccounts.find(a => a.code === '2410-00')!;

      const voucherNo = `JV-CT-${taxYear}-${Math.floor(1000 + Math.random() * 9000)}`;
      const voucher: Voucher = {
        id: `vch-ct-${Date.now()}`,
        voucherNo,
        type: 'JOURNAL',
        status: 'POSTED',
        date: new Date().toISOString().split('T')[0],
        narration: `Accrual of UAE Corporate Tax (9%) for Tax Year ${taxYear}. Profit: AED ${estimate.accountingNetProfit.toLocaleString()}, Taxable: AED ${estimate.qualifyingTaxableProfit.toLocaleString()}`,
        totalDebit: amount,
        totalCredit: amount,
        currency: 'AED',
        exchangeRate: 1.0,
        documentRef: `CT-PROVISION-${taxYear}`,
        postedAt: new Date().toISOString(),
        postedBy,
        lines: [
          {
            id: `vl-ct-dr-${Date.now()}`,
            accountId: expenseAcc.id,
            accountCode: expenseAcc.code,
            accountName: expenseAcc.name,
            debitAmount: amount,
            creditAmount: 0,
            narration: `UAE Corporate Tax Expense 9% - Year ${taxYear}`
          },
          {
            id: `vl-ct-cr-${Date.now()}`,
            accountId: liabilityAcc.id,
            accountCode: liabilityAcc.code,
            accountName: liabilityAcc.name,
            debitAmount: 0,
            creditAmount: amount,
            narration: `Provision for UAE Corporate Tax Liability - Year ${taxYear}`
          }
        ]
      };

      this.vouchers.push(voucher);
      const postRes = FinanceEngine.postVoucherToLedger(voucher, this.coaAccounts, this.ledgers);
      this.ledgers.push(...postRes.newLedgers);

      this.auditLogs.unshift(
        AuditEngine.createLogEntry('FINANCE', 'POST', voucher.voucherNo, 'POSTED', postedBy, `Posted UAE Corporate Tax provision of AED ${amount.toFixed(2)} for Tax Year ${taxYear}`)
      );

      return {
        success: true,
        voucher,
        estimate
      };
    });
  }

  // Bale Yield & Container ROI Analytics
  public getBaleYieldAnalytics() {
    const passes = this.inwardGatePasses;
    const pieces = this.inventoryPieces;

    const baleDetails = passes.map(gp => {
      const gpPieces = pieces.filter(p => p.gatePassId === gp.id);
      const totalPiecesCount = gpPieces.length;
      const soldPieces = gpPieces.filter(p => p.status === 'SOLD');
      const inStockPieces = gpPieces.filter(p => p.status === 'IN_STOCK');
      const reservedPieces = gpPieces.filter(p => p.status === 'RESERVED');

      // Financials
      const baleCostAed = Number(gp.totalWeightKg) > 0 ? (Number(gp.totalWeightKg) * 8.5) : 3500; // Average bale landed cost
      const totalPiecesRetailValue = gpPieces.reduce((s, p) => s + (Number(p.retailPriceAed) || 0), 0);
      const soldRevenueAed = soldPieces.reduce((s, p) => s + (Number(p.soldPriceAed || p.retailPriceAed) || 0), 0);
      const inStockValueAed = inStockPieces.reduce((s, p) => s + (Number(p.retailPriceAed) || 0), 0);

      const estimatedCostOfSold = totalPiecesCount > 0 ? (soldPieces.length / totalPiecesCount) * baleCostAed : 0;
      const grossMarginAed = soldRevenueAed - estimatedCostOfSold;
      const grossMarginPercent = soldRevenueAed > 0 ? (grossMarginAed / soldRevenueAed) * 100 : 0;
      const realizedRoiPercent = baleCostAed > 0 ? ((soldRevenueAed + inStockValueAed - baleCostAed) / baleCostAed) * 100 : 0;

      // Quality Breakdown
      const gradeCount: Record<string, number> = {};
      gpPieces.forEach(p => {
        const g = p.grade || 'Standard';
        gradeCount[g] = (gradeCount[g] || 0) + 1;
      });

      return {
        gatePassId: gp.id,
        gatePassNo: gp.gatePassNo,
        date: gp.date,
        baleBatchNo: gp.baleBatchNo,
        containerNo: gp.containerNo || 'N/A',
        originCountry: gp.supplierName?.includes('Rotterdam') ? 'Netherlands' : (gp.containerNo?.includes('US') ? 'USA' : 'Global Import'),
        totalBales: gp.totalBales,
        totalWeightKg: gp.totalWeightKg,
        baleCostAed,
        totalPiecesCount,
        soldPiecesCount: soldPieces.length,
        inStockPiecesCount: inStockPieces.length,
        soldRevenueAed,
        inStockValueAed,
        totalPiecesRetailValue,
        grossMarginAed,
        grossMarginPercent,
        realizedRoiPercent,
        gradeCount
      };
    });

    const totalBalesProcessed = passes.reduce((s, gp) => s + gp.totalBales, 0);
    const totalPiecesRealized = pieces.length;
    const totalPiecesSold = pieces.filter(p => p.status === 'SOLD').length;
    const overallSoldRevenue = pieces.filter(p => p.status === 'SOLD').reduce((s, p) => s + (Number(p.soldPriceAed || p.retailPriceAed) || 0), 0);
    const overallStockValue = pieces.filter(p => p.status === 'IN_STOCK').reduce((s, p) => s + (Number(p.retailPriceAed) || 0), 0);

    return {
      totalBalesProcessed,
      totalPiecesRealized,
      totalPiecesSold,
      overallSoldRevenue,
      overallStockValue,
      baleDetails
    };
  }
}

export const relationalStore = new RelationalStore();
