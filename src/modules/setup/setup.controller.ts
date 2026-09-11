import { CompanyProfile, CurrencyItem, ItemMaster, LabelGrade, BrandMaster, ShopMaster, CategoryMaster, SizeMaster, LiveStreamMulticastConfig, LiveBoothStreamConfig, WhatsAppGatewayConfig } from './setup.types.ts';
import { SetupEngine } from './setup.engine.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { marketingService } from '../marketing/marketing.service.ts';

export class SetupController {
  public static getCompanyProfile(): CompanyProfile {
    return relationalStore.getCompanyProfile();
  }

  public static updateCompanyProfile(profile: Partial<CompanyProfile>): CompanyProfile {
    return relationalStore.updateCompanyProfile(profile);
  }

  public static getLiveMulticastConfig(): LiveStreamMulticastConfig {
    return relationalStore.getLiveMulticastConfig();
  }

  public static updateLiveMulticastConfig(updates: Partial<LiveStreamMulticastConfig>): LiveStreamMulticastConfig {
    return relationalStore.updateLiveMulticastConfig(updates);
  }

  public static getLiveBoothConfigs(): LiveBoothStreamConfig[] {
    return relationalStore.getLiveBoothConfigs();
  }

  public static getLiveBoothConfig(boothId: string): LiveBoothStreamConfig | undefined {
    return relationalStore.getLiveBoothConfig(boothId);
  }

  public static updateLiveBoothConfig(boothId: string, updates: Partial<LiveBoothStreamConfig>): LiveBoothStreamConfig {
    return relationalStore.updateLiveBoothConfig(boothId, updates);
  }

  public static getCurrencies(): CurrencyItem[] {
    return relationalStore.getCurrencies();
  }

  public static addCurrency(currency: { code: string; name: string; symbol: string; exchangeRate: number; isBase?: boolean }): CurrencyItem {
    return relationalStore.addCurrency(currency);
  }

  public static updateCurrencyRate(code: any, rate: number): CurrencyItem[] {
    return relationalStore.updateCurrencyRate(code, rate);
  }

  public static deleteCurrency(code: string): boolean {
    return relationalStore.deleteCurrency(code);
  }

  public static getItemMasters(): ItemMaster[] {
    return relationalStore.getItemMasters();
  }

  public static addItemMaster(item: Omit<ItemMaster, 'id'>): ItemMaster {
    return relationalStore.addItemMaster(item);
  }

  public static updateItemMaster(id: string, updates: Partial<ItemMaster>): ItemMaster | null {
    return relationalStore.updateItemMaster(id, updates);
  }

  public static deleteItemMaster(id: string): boolean {
    return relationalStore.deleteItemMaster(id);
  }

  public static postItemMaster(id: string): ItemMaster | null {
    return relationalStore.postItemMaster(id);
  }

  public static unpostItemMaster(id: string): ItemMaster | null {
    return relationalStore.unpostItemMaster(id);
  }

  public static getLabelGrades(): LabelGrade[] {
    return relationalStore.getLabelGrades();
  }

  public static addLabelGrade(label: Omit<LabelGrade, 'id'>): LabelGrade {
    return relationalStore.addLabelGrade(label);
  }

  public static updateLabelGrade(id: string, updates: Partial<LabelGrade>): LabelGrade | null {
    return relationalStore.updateLabelGrade(id, updates);
  }

  public static deleteLabelGrade(id: string): boolean {
    return relationalStore.deleteLabelGrade(id);
  }

  public static postLabelGrade(id: string): LabelGrade | null {
    return relationalStore.postLabelGrade(id);
  }

  public static unpostLabelGrade(id: string): LabelGrade | null {
    return relationalStore.unpostLabelGrade(id);
  }

  public static getBrandMasters(): BrandMaster[] {
    return relationalStore.getBrandMasters();
  }

  public static addBrandMaster(brand: Omit<BrandMaster, 'id'>): BrandMaster {
    return relationalStore.addBrandMaster(brand);
  }

  public static updateBrandMaster(id: string, updates: Partial<BrandMaster>): BrandMaster | null {
    return relationalStore.updateBrandMaster(id, updates);
  }

  public static deleteBrandMaster(id: string): boolean {
    return relationalStore.deleteBrandMaster(id);
  }

  public static postBrandMaster(id: string): BrandMaster | null {
    return relationalStore.postBrandMaster(id);
  }

  public static unpostBrandMaster(id: string): BrandMaster | null {
    return relationalStore.unpostBrandMaster(id);
  }

  public static getShopMasters(): ShopMaster[] {
    return relationalStore.getShopMasters();
  }

  public static addShopMaster(shop: Omit<ShopMaster, 'id'>): ShopMaster {
    return relationalStore.addShopMaster(shop);
  }

  public static updateShopMaster(id: string, updates: Partial<ShopMaster>): ShopMaster | null {
    return relationalStore.updateShopMaster(id, updates);
  }

  public static deleteShopMaster(id: string): boolean {
    return relationalStore.deleteShopMaster(id);
  }

  public static postShopMaster(id: string): ShopMaster | null {
    return relationalStore.postShopMaster(id);
  }

  public static unpostShopMaster(id: string): ShopMaster | null {
    return relationalStore.unpostShopMaster(id);
  }

  // Categories
  public static getCategories(): CategoryMaster[] {
    return relationalStore.getCategories();
  }

  public static addCategory(category: Omit<CategoryMaster, 'id'>): CategoryMaster {
    return relationalStore.addCategory(category);
  }

  public static updateCategory(id: string, updates: Partial<CategoryMaster>): CategoryMaster | null {
    return relationalStore.updateCategory(id, updates);
  }

  public static deleteCategory(id: string): boolean {
    return relationalStore.deleteCategory(id);
  }

  public static postCategory(id: string): CategoryMaster | null {
    return relationalStore.postCategory(id);
  }

  public static unpostCategory(id: string): CategoryMaster | null {
    return relationalStore.unpostCategory(id);
  }

  // Sizes
  public static getSizes(): SizeMaster[] {
    return relationalStore.getSizes();
  }

  public static addSize(size: Omit<SizeMaster, 'id'>): SizeMaster {
    return relationalStore.addSize(size);
  }

  public static updateSize(id: string, updates: Partial<SizeMaster>): SizeMaster | null {
    return relationalStore.updateSize(id, updates);
  }

  public static deleteSize(id: string): boolean {
    return relationalStore.deleteSize(id);
  }

  public static postSize(id: string): SizeMaster | null {
    return relationalStore.postSize(id);
  }

  public static unpostSize(id: string): SizeMaster | null {
    return relationalStore.unpostSize(id);
  }

  public static getWhatsAppDailyReport() {
    const profile = relationalStore.getCompanyProfile();
    const summary = relationalStore.calculateDailySummary();
    return SetupEngine.generateWhatsAppSummaryReport(summary, profile.companyName);
  }

  public static getWhatsAppConfig(): WhatsAppGatewayConfig {
    return marketingService.getWhatsAppGatewayConfig();
  }

  public static updateWhatsAppConfig(updates: Partial<WhatsAppGatewayConfig>): WhatsAppGatewayConfig {
    return marketingService.updateWhatsAppGatewayConfig(updates);
  }

  public static getDashboardKPIs() {
    return relationalStore.getDashboardKPIs();
  }

  public static globalSearch(query: string) {
    return relationalStore.globalSearch(query);
  }

  public static bulkImportInventory(pieces: any[], importedBy?: string) {
    return relationalStore.bulkImportInventory(pieces, importedBy);
  }

  public static bulkImportSales(records: any[], importedBy?: string) {
    return relationalStore.bulkImportSales(records, importedBy);
  }
}
