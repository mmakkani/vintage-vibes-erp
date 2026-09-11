import { supabase } from '../supabaseClient.ts';
import {
  CurrencyItem,
  CategoryMaster,
  SizeMaster,
  LabelGrade,
  BrandMaster,
  ShopMaster,
  ItemMaster
} from '../modules/setup/setup.types.ts';

export class SetupService {
  // --- Currencies ---
  public static async getCurrencies(): Promise<CurrencyItem[]> {
    const { data, error } = await supabase
      .from('currencies')
      .select('*')
      .order('code');

    if (error) {
      console.error('Supabase error on currencies:', error);
      throw new Error(error.message || 'Database error occurred reading currencies');
    }

    return (data || []).map((row: any) => ({
      id: row.id || row.code,
      code: row.code,
      name: row.name,
      symbol: row.symbol,
      exchangeRate: Number(row.exchange_rate ?? row.exchangeRate ?? 1),
      isBase: Boolean(row.is_base ?? row.isBase)
    }));
  }

  public static async addCurrency(currency: {
    code: string;
    name: string;
    symbol: string;
    exchangeRate: number;
    isBase?: boolean;
  }): Promise<CurrencyItem> {
    const id = `curr-${currency.code.toLowerCase()}`;
    const payload = {
      id,
      code: currency.code.toUpperCase(),
      name: currency.name,
      symbol: currency.symbol,
      exchange_rate: Number(currency.exchangeRate),
      is_base: Boolean(currency.isBase)
    };

    const { data, error } = await supabase
      .from('currencies')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on currencies:', error);
      throw new Error(error.message || 'Failed to add currency');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      symbol: data.symbol,
      exchangeRate: Number(data.exchange_rate),
      isBase: Boolean(data.is_base)
    };
  }

  public static async updateCurrencyRate(code: string, rate: number): Promise<void> {
    const { error } = await supabase
      .from('currencies')
      .update({ exchange_rate: Number(rate) })
      .eq('code', code.toUpperCase());

    if (error) {
      console.error('Supabase error on currencies:', error);
      throw new Error(error.message || 'Failed to update currency rate');
    }
  }

  public static async deleteCurrency(code: string): Promise<void> {
    const { error } = await supabase
      .from('currencies')
      .delete()
      .eq('code', code.toUpperCase());

    if (error) {
      console.error('Supabase error on currencies:', error);
      throw new Error(error.message || 'Failed to delete currency');
    }
  }

  // --- Categories ---
  public static async getCategories(): Promise<CategoryMaster[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Supabase error on categories:', error);
      throw new Error(error.message || 'Database error occurred reading categories');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      code: r.code || r.id,
      name: r.name,
      description: r.description || '',
      qualityTier: r.quality_tier || r.qualityTier || 'CREAM',
      sortOrder: Number(r.sort_order ?? r.sortOrder ?? 1),
      status: r.status || 'POSTED',
      isActive: r.is_active ?? true
    }));
  }

  public static async addCategory(item: Partial<CategoryMaster>): Promise<CategoryMaster> {
    const id = item.id || `cat-${Date.now()}`;
    const payload = {
      id,
      name: item.name,
      code: item.code || item.name?.slice(0, 4).toUpperCase() || id,
      description: item.description || '',
      quality_tier: item.qualityTier || 'CREAM',
      sort_order: item.sortOrder || 1,
      status: item.status || 'POSTED',
      is_active: item.isActive !== false
    };

    const { data, error } = await supabase
      .from('categories')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on categories:', error);
      throw new Error(error.message || 'Failed to add category');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description,
      qualityTier: data.quality_tier,
      sortOrder: data.sort_order,
      status: data.status,
      isActive: data.is_active
    };
  }

  public static async updateCategory(id: string, updates: Partial<CategoryMaster>): Promise<void> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.qualityTier !== undefined) payload.quality_tier = updates.qualityTier;
    if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { error } = await supabase.from('categories').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on categories:', error);
      throw new Error(error.message || 'Failed to update category');
    }
  }

  public static async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on categories:', error);
      throw new Error(error.message || 'Failed to delete category');
    }
  }

  // --- Sizes ---
  public static async getSizes(): Promise<SizeMaster[]> {
    const { data, error } = await supabase
      .from('sizes')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Supabase error on sizes:', error);
      throw new Error(error.message || 'Database error occurred reading sizes');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      code: r.code || r.name,
      name: r.name,
      category: r.category || 'Tops / Universal',
      sortOrder: Number(r.sort_order ?? r.sortOrder ?? 1),
      status: r.status || 'POSTED',
      isActive: r.is_active ?? true
    }));
  }

  public static async addSize(item: Partial<SizeMaster>): Promise<SizeMaster> {
    const id = item.id || `sz-${Date.now()}`;
    const payload = {
      id,
      code: item.code || item.name,
      name: item.name || item.code,
      category: item.category || 'Tops / Universal',
      sort_order: item.sortOrder || 1,
      status: item.status || 'POSTED',
      is_active: item.isActive !== false
    };

    const { data, error } = await supabase
      .from('sizes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on sizes:', error);
      throw new Error(error.message || 'Failed to add size');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      category: data.category,
      sortOrder: data.sort_order,
      status: data.status,
      isActive: data.is_active
    };
  }

  public static async updateSize(id: string, updates: Partial<SizeMaster>): Promise<void> {
    const payload: any = {};
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { error } = await supabase.from('sizes').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on sizes:', error);
      throw new Error(error.message || 'Failed to update size');
    }
  }

  public static async deleteSize(id: string): Promise<void> {
    const { error } = await supabase.from('sizes').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on sizes:', error);
      throw new Error(error.message || 'Failed to delete size');
    }
  }

  // --- Label Grades ---
  public static async getLabelGrades(): Promise<LabelGrade[]> {
    const { data, error } = await supabase
      .from('label_grades')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Supabase error on label_grades:', error);
      throw new Error(error.message || 'Database error occurred reading label grades');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      code: r.code || r.id,
      name: r.name,
      description: r.description || '',
      qualityTier: r.quality_tier || r.qualityTier || 'CREAM',
      priceMultiplier: Number(r.price_multiplier ?? r.priceMultiplier ?? 1),
      sortOrder: Number(r.sort_order ?? r.sortOrder ?? 1),
      status: r.status || 'POSTED',
      isActive: r.is_active ?? true
    }));
  }

  public static async addLabelGrade(item: Partial<LabelGrade>): Promise<LabelGrade> {
    const id = item.id || `lbl-${Date.now()}`;
    const payload = {
      id,
      code: item.code || id,
      name: item.name,
      description: item.description || '',
      quality_tier: item.qualityTier || 'CREAM',
      price_multiplier: item.priceMultiplier || 1.0,
      sort_order: item.sortOrder || 1,
      status: item.status || 'POSTED',
      is_active: item.isActive !== false
    };

    const { data, error } = await supabase
      .from('label_grades')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on label_grades:', error);
      throw new Error(error.message || 'Failed to add label grade');
    }

    return {
      id: data.id,
      code: data.code || data.id,
      name: data.name,
      description: data.description,
      qualityTier: data.quality_tier,
      priceMultiplier: Number(data.price_multiplier),
      sortOrder: data.sort_order,
      status: data.status,
      isActive: data.is_active
    };
  }

  public static async updateLabelGrade(id: string, updates: Partial<LabelGrade>): Promise<void> {
    const payload: any = {};
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.qualityTier !== undefined) payload.quality_tier = updates.qualityTier;
    if (updates.priceMultiplier !== undefined) payload.price_multiplier = updates.priceMultiplier;
    if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { error } = await supabase.from('label_grades').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on label_grades:', error);
      throw new Error(error.message || 'Failed to update label grade');
    }
  }

  public static async deleteLabelGrade(id: string): Promise<void> {
    const { error } = await supabase.from('label_grades').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on label_grades:', error);
      throw new Error(error.message || 'Failed to delete label grade');
    }
  }

  // --- Brand Masters ---
  public static async getBrands(): Promise<BrandMaster[]> {
    const { data, error } = await supabase
      .from('brand_masters')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error on brand_masters:', error);
      throw new Error(error.message || 'Database error occurred reading brands');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      tier: r.tier || 'Grail',
      origin: r.origin || 'USA',
      era: r.era || '90s',
      status: r.status || 'POSTED'
    }));
  }

  public static async addBrand(item: Partial<BrandMaster>): Promise<BrandMaster> {
    const id = item.id || `br-${Date.now()}`;
    const payload = {
      id,
      name: item.name,
      tier: item.tier || 'Grail',
      origin: item.origin || 'USA',
      era: item.era || '90s',
      status: item.status || 'POSTED'
    };

    const { data, error } = await supabase
      .from('brand_masters')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on brand_masters:', error);
      throw new Error(error.message || 'Failed to add brand');
    }

    return {
      id: data.id,
      name: data.name,
      tier: data.tier,
      origin: data.origin,
      era: data.era,
      status: data.status
    };
  }

  public static async updateBrand(id: string, updates: Partial<BrandMaster>): Promise<void> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.tier !== undefined) payload.tier = updates.tier;
    if (updates.origin !== undefined) payload.origin = updates.origin;
    if (updates.era !== undefined) payload.era = updates.era;
    if (updates.status !== undefined) payload.status = updates.status;

    const { error } = await supabase.from('brand_masters').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on brand_masters:', error);
      throw new Error(error.message || 'Failed to update brand');
    }
  }

  public static async deleteBrand(id: string): Promise<void> {
    const { error } = await supabase.from('brand_masters').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on brand_masters:', error);
      throw new Error(error.message || 'Failed to delete brand');
    }
  }

  // --- Shop Masters ---
  public static async getShops(): Promise<ShopMaster[]> {
    const { data, error } = await supabase
      .from('shop_masters')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error on shop_masters:', error);
      throw new Error(error.message || 'Database error occurred reading shops');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      location: r.location || '',
      isWarehouse: Boolean(r.is_warehouse ?? r.isWarehouse)
    }));
  }

  public static async addShop(item: { name: string; location?: string; isWarehouse?: boolean }): Promise<ShopMaster> {
    const id = `sh-${Date.now()}`;
    const { data, error } = await supabase
      .from('shop_masters')
      .insert({
        id,
        name: item.name,
        location: item.location || '',
        is_warehouse: Boolean(item.isWarehouse)
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase error on shop_masters:', error);
      throw new Error(error.message || 'Failed to add shop');
    }

    return {
      id: data.id,
      name: data.name,
      location: data.location,
      isWarehouse: Boolean(data.is_warehouse)
    };
  }

  public static async updateShop(id: string, updates: Partial<ShopMaster>): Promise<void> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.isWarehouse !== undefined) payload.is_warehouse = updates.isWarehouse;

    const { error } = await supabase.from('shop_masters').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on shop_masters:', error);
      throw new Error(error.message || 'Failed to update shop');
    }
  }

  public static async deleteShop(id: string): Promise<void> {
    const { error } = await supabase.from('shop_masters').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on shop_masters:', error);
      throw new Error(error.message || 'Failed to delete shop');
    }
  }

  // --- Item Masters ---
  public static async getItems(): Promise<ItemMaster[]> {
    const { data, error } = await supabase
      .from('item_masters')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error on item_masters:', error);
      throw new Error(error.message || 'Database error occurred reading item masters');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category || 'Denim & Outerwear',
      description: r.description || '',
      basePrice: Number(r.base_price ?? 100),
      targetUom: r.target_uom || 'KG',
      weightKg: Number(r.weight_kg ?? 1),
      uom: r.uom || r.target_uom || 'KG',
      coaAccountId: r.coa_account_id,
      minStockThreshold: Number(r.min_stock_threshold ?? 5),
      status: r.status || 'POSTED',
      isActive: r.is_active ?? true
    }));
  }

  public static async addItem(item: Partial<ItemMaster>): Promise<ItemMaster> {
    const id = item.id || `itm-${Date.now()}`;
    const payload = {
      id,
      code: item.code || `ITM-${Date.now()}`,
      name: item.name || '',
      category: item.category || 'Denim & Outerwear',
      description: item.description || '',
      base_price: Number(item.basePrice ?? 100),
      target_uom: item.targetUom || 'KG',
      weight_kg: Number(item.weightKg ?? 1),
      uom: item.uom || item.targetUom || 'KG',
      coa_account_id: item.coaAccountId || null,
      min_stock_threshold: Number(item.minStockThreshold ?? 5),
      status: item.status || 'POSTED',
      is_active: item.isActive !== false
    };

    const { data, error } = await supabase
      .from('item_masters')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on item_masters:', error);
      throw new Error(error.message || 'Failed to add item master');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      category: data.category,
      description: data.description,
      basePrice: Number(data.base_price),
      targetUom: data.target_uom,
      weightKg: Number(data.weight_kg),
      minStockThreshold: Number(data.min_stock_threshold),
      status: data.status,
      isActive: data.is_active
    };
  }

  public static async updateItem(id: string, updates: Partial<ItemMaster>): Promise<void> {
    const payload: any = {};
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.basePrice !== undefined) payload.base_price = Number(updates.basePrice);
    if (updates.targetUom !== undefined) payload.target_uom = updates.targetUom;
    if (updates.weightKg !== undefined) payload.weight_kg = Number(updates.weightKg);
    if (updates.coaAccountId !== undefined) payload.coa_account_id = updates.coaAccountId;
    if (updates.minStockThreshold !== undefined) payload.min_stock_threshold = Number(updates.minStockThreshold);
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;
    payload.updated_at = new Date().toISOString();

    const { error } = await supabase.from('item_masters').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on item_masters:', error);
      throw new Error(error.message || 'Failed to update item master');
    }
  }

  public static async deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('item_masters').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on item_masters:', error);
      throw new Error(error.message || 'Failed to delete item master');
    }
  }
}
