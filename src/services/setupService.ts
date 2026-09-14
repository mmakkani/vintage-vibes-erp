import { supabase } from '../supabaseClient.ts';
import {
  CurrencyItem,
  CategoryMaster,
  SizeMaster,
  LabelGrade,
  BrandMaster,
  ShopMaster,
  ItemMaster,
  LiveStreamMulticastConfig,
  LiveBoothStreamConfig
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
      .order('shop_no', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Supabase error on shop_masters:', error);
      throw new Error(error.message || 'Database error occurred reading shops');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      shopNo: r.shop_no || r.shopNo || r.id,
      name: r.name,
      location: r.location || '',
      city: r.city || '',
      type: r.type || 'RETAIL',
      manager: r.manager || r.manager_name || '',
      managerName: r.manager_name || r.manager || '',
      rackCount: Number(r.rack_count ?? r.rackCount ?? 10),
      status: r.status || 'POSTED',
      isActive: r.is_active !== false,
      isWarehouse: Boolean(r.is_warehouse ?? r.isWarehouse)
    }));
  }

  public static async addShop(item: Partial<ShopMaster>): Promise<ShopMaster> {
    const id = item.id || `sh-${Date.now()}`;
    const payload = {
      id,
      shop_no: item.shopNo || item.id || `SHP-${Date.now().toString().slice(-2)}`,
      name: item.name || '',
      location: item.location || '',
      city: item.city || '',
      type: item.type || 'RETAIL',
      manager: item.manager || item.managerName || '',
      manager_name: item.managerName || item.manager || '',
      rack_count: Number(item.rackCount ?? 10),
      is_warehouse: Boolean(item.isWarehouse || item.type === 'WAREHOUSE'),
      status: item.status || 'POSTED',
      is_active: item.isActive !== false
    };

    const { data, error } = await supabase
      .from('shop_masters')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on shop_masters:', error);
      throw new Error(error.message || 'Failed to add shop');
    }

    return {
      id: data.id,
      shopNo: data.shop_no,
      name: data.name,
      location: data.location,
      city: data.city,
      type: data.type,
      manager: data.manager,
      managerName: data.manager_name,
      rackCount: Number(data.rack_count),
      isWarehouse: Boolean(data.is_warehouse),
      status: data.status,
      isActive: data.is_active
    };
  }

  public static async updateShop(id: string, updates: Partial<ShopMaster>): Promise<void> {
    const payload: any = {};
    if (updates.shopNo !== undefined) payload.shop_no = updates.shopNo;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.city !== undefined) payload.city = updates.city;
    if (updates.type !== undefined) payload.type = updates.type;
    if (updates.manager !== undefined) {
      payload.manager = updates.manager;
      payload.manager_name = updates.manager;
    }
    if (updates.managerName !== undefined) {
      payload.manager = updates.managerName;
      payload.manager_name = updates.managerName;
    }
    if (updates.rackCount !== undefined) payload.rack_count = Number(updates.rackCount);
    if (updates.isWarehouse !== undefined) payload.is_warehouse = updates.isWarehouse;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

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

  // --- Live Streaming Multicast Gateway ---
  public static async getLiveMulticastConfig(): Promise<LiveStreamMulticastConfig> {
    const { data, error } = await supabase
      .from('live_stream_multicast_config')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error || !data) {
      return {
        provider: 'RESTREAM',
        enabled: true,
        accountEmail: 'live@vintagevibe.ae',
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
        status: 'CONNECTED'
      };
    }

    return {
      provider: data.provider || 'RESTREAM',
      enabled: data.enabled !== false,
      accountEmail: data.account_email,
      accountPassword: data.account_password,
      apiKey: data.api_key,
      masterIngestRtmpUrl: data.master_ingest_rtmp_url,
      masterStreamKey: data.master_stream_key,
      autoRelayToTikTok: data.auto_relay_to_tiktok !== false,
      autoRelayToInstagram: data.auto_relay_to_instagram !== false,
      autoRelayToFacebook: data.auto_relay_to_facebook !== false,
      autoRelayToYouTube: data.auto_relay_to_youtube !== false,
      tikTokStreamKey: data.tiktok_stream_key,
      instagramStreamKey: data.instagram_stream_key,
      facebookStreamKey: data.facebook_stream_key,
      youTubeStreamKey: data.youtube_stream_key,
      status: data.status || 'CONNECTED',
      lastSyncedAt: data.last_synced_at
    };
  }

  public static async updateLiveMulticastConfig(cfg: Partial<LiveStreamMulticastConfig>): Promise<LiveStreamMulticastConfig> {
    const payload = {
      id: 'default',
      provider: cfg.provider || 'RESTREAM',
      enabled: cfg.enabled !== false,
      account_email: cfg.accountEmail,
      account_password: cfg.accountPassword,
      api_key: cfg.apiKey,
      master_ingest_rtmp_url: cfg.masterIngestRtmpUrl,
      master_stream_key: cfg.masterStreamKey,
      auto_relay_to_tiktok: cfg.autoRelayToTikTok !== false,
      auto_relay_to_instagram: cfg.autoRelayToInstagram !== false,
      auto_relay_to_facebook: cfg.autoRelayToFacebook !== false,
      auto_relay_to_youtube: cfg.autoRelayToYouTube !== false,
      tiktok_stream_key: cfg.tikTokStreamKey,
      instagram_stream_key: cfg.instagramStreamKey,
      facebook_stream_key: cfg.facebookStreamKey,
      youtube_stream_key: cfg.youTubeStreamKey,
      status: cfg.status || 'CONNECTED',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('live_stream_multicast_config')
      .upsert(payload);

    if (error) {
      console.error('Supabase error on live_stream_multicast_config:', error);
      throw new Error(error.message || 'Failed to update live multicast config');
    }

    return this.getLiveMulticastConfig();
  }

  // --- Live Broadcaster Booths (Booths 1-5) ---
  public static async getLiveBoothConfigs(): Promise<LiveBoothStreamConfig[]> {
    const { data, error } = await supabase
      .from('live_stream_booths')
      .select('*')
      .order('booth_id');

    if (error || !data || data.length === 0) {
      return [];
    }

    return data.map((r: any) => ({
      boothId: r.booth_id,
      boothName: r.booth_name,
      category: r.category || 'Vintage Apparel',
      provider: r.provider || 'RESTREAM',
      enabled: r.enabled !== false,
      accountEmail: r.account_email,
      accountPassword: r.account_password,
      apiKey: r.api_key,
      masterIngestRtmpUrl: r.master_ingest_rtmp_url,
      masterStreamKey: r.master_stream_key,
      autoRelayToTikTok: r.auto_relay_to_tiktok !== false,
      autoRelayToInstagram: r.auto_relay_to_instagram !== false,
      autoRelayToFacebook: r.auto_relay_to_facebook !== false,
      autoRelayToYouTube: r.auto_relay_to_youtube !== false,
      tiktokStreamKey: r.tiktok_stream_key,
      instagramStreamKey: r.instagram_stream_key,
      facebookStreamKey: r.facebook_stream_key,
      youTubeStreamKey: r.youtube_stream_key,
      status: r.status || 'CONNECTED',
      lastSyncedAt: r.last_synced_at
    }));
  }

  public static async getLiveBoothConfig(boothId: string): Promise<LiveBoothStreamConfig | undefined> {
    const list = await this.getLiveBoothConfigs();
    return list.find(b => b.boothId === boothId);
  }

  public static async updateLiveBoothConfig(boothId: string, updates: Partial<LiveBoothStreamConfig>): Promise<LiveBoothStreamConfig> {
    const payload: any = {
      booth_id: boothId,
      updated_at: new Date().toISOString()
    };
    if (updates.boothName !== undefined) payload.booth_name = updates.boothName;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.provider !== undefined) payload.provider = updates.provider;
    if (updates.enabled !== undefined) payload.enabled = updates.enabled;
    if (updates.accountEmail !== undefined) payload.account_email = updates.accountEmail;
    if (updates.accountPassword !== undefined) payload.account_password = updates.accountPassword;
    if (updates.apiKey !== undefined) payload.api_key = updates.apiKey;
    if (updates.masterIngestRtmpUrl !== undefined) payload.master_ingest_rtmp_url = updates.masterIngestRtmpUrl;
    if (updates.masterStreamKey !== undefined) payload.master_stream_key = updates.masterStreamKey;
    if (updates.autoRelayToTikTok !== undefined) payload.auto_relay_to_tiktok = updates.autoRelayToTikTok;
    if (updates.autoRelayToInstagram !== undefined) payload.auto_relay_to_instagram = updates.autoRelayToInstagram;
    if (updates.autoRelayToFacebook !== undefined) payload.auto_relay_to_facebook = updates.autoRelayToFacebook;
    if (updates.autoRelayToYouTube !== undefined) payload.auto_relay_to_youtube = updates.autoRelayToYouTube;
    if (updates.tiktokStreamKey !== undefined) payload.tiktok_stream_key = updates.tiktokStreamKey;
    if (updates.instagramStreamKey !== undefined) payload.instagram_stream_key = updates.instagramStreamKey;
    if (updates.facebookStreamKey !== undefined) payload.facebook_stream_key = updates.facebookStreamKey;
    if (updates.youTubeStreamKey !== undefined) payload.youtube_stream_key = updates.youTubeStreamKey;
    if (updates.status !== undefined) payload.status = updates.status;
    payload.last_synced_at = new Date().toISOString();

    const { error } = await supabase
      .from('live_stream_booths')
      .upsert(payload);

    if (error) {
      console.error(`Supabase error on booth ${boothId}:`, error);
      throw new Error(error.message || 'Failed to update live booth config');
    }

    const updated = await this.getLiveBoothConfig(boothId);
    return updated!;
  }

  // --- Thermal Barcode & QR Configuration ---
  public static async getThermalBarcodeConfig(): Promise<any> {
    const { data, error } = await supabase
      .from('thermal_barcode_configs')
      .select('config')
      .eq('id', 'default')
      .maybeSingle();

    if (error || !data) return null;
    return data.config;
  }

  public static async updateThermalBarcodeConfig(config: any): Promise<void> {
    await supabase
      .from('thermal_barcode_configs')
      .upsert({
        id: 'default',
        config,
        updated_at: new Date().toISOString()
      });
  }

  // --- Master Security PIN ---
  public static async getMasterPin(): Promise<string> {
    const { data, error } = await supabase
      .from('security_master_pins')
      .select('pin')
      .eq('id', 'default')
      .maybeSingle();

    if (error || !data || !data.pin) return '9988';
    return data.pin;
  }

  public static async updateMasterPin(pin: string): Promise<void> {
    await supabase
      .from('security_master_pins')
      .upsert({
        id: 'default',
        pin: pin.trim(),
        updated_at: new Date().toISOString()
      });
  }

  // --- Google Gemini AI API Key Config ---
  public static async getGeminiApiConfig(): Promise<{ apiKey: string; model: string; configured: boolean; updatedAt?: string }> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/setup/gemini-key');
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && data.apiKey) {
            return {
              apiKey: data.apiKey,
              model: data.model || 'gemini-2.5-flash',
              status: data.status || 'ACTIVE',
              configured: true,
              updatedAt: data.updatedAt
            } as any;
          }
        }
      } catch {}
      const localKey = (typeof localStorage !== 'undefined' ? (localStorage.getItem('vintage_gemini_api_key') || '') : '').trim();
      return {
        apiKey: localKey,
        model: 'gemini-2.5-flash',
        configured: Boolean(localKey)
      };
    }

    // Node environment
    const envKey = (process.env.GEMINI_API_KEY || '').trim();
    if (envKey) {
      return {
        apiKey: envKey,
        model: 'gemini-2.5-flash',
        configured: true
      };
    }

    try {
      const { data, error } = await supabase
        .from('gemini_api_config')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data && data.api_key) {
        return {
          apiKey: data.api_key,
          model: data.model || 'gemini-2.5-flash',
          configured: true,
          updatedAt: data.updated_at
        };
      }
    } catch {}

    return {
      apiKey: '',
      model: 'gemini-2.5-flash',
      configured: false
    };
  }

  public static async updateGeminiApiKey(apiKey: string, model: string = 'gemini-2.5-flash'): Promise<{ success: boolean; message: string }> {
    const trimmed = apiKey.trim();

    if (typeof window !== 'undefined') {
      const response = await fetch('/api/setup/gemini-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed, model: model || 'gemini-2.5-flash' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to persist Gemini API key to database');
      }
      try {
        localStorage.setItem('vintage_gemini_api_key', trimmed);
      } catch {}
      return { success: true, message: data.message || 'Gemini API key successfully saved.' };
    }

    // Node environment
    process.env.GEMINI_API_KEY = trimmed;
    try {
      await supabase
        .from('gemini_api_config')
        .upsert({
          id: 'default',
          api_key: trimmed,
          model: model || 'gemini-2.5-flash',
          status: 'ACTIVE',
          updated_at: new Date().toISOString()
        });
    } catch {}

    return { success: true, message: 'Gemini API key saved to runtime.' };
  }
}
