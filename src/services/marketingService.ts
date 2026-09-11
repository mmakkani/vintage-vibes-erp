import { supabase } from '../supabaseClient.ts';

export interface MarketingCampaign {
  id?: string;
  campaign_name: string;
  channel: 'whatsapp' | 'sms' | 'email';
  target_audience?: string;
  message_template: string;
  scheduled_at?: string | null;
  sent_count?: number;
  delivered_count?: number;
  status?: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  created_at?: string;
}

export interface MarketingAutomation {
  id?: string;
  automation_name: string;
  trigger_event: string;
  action_type: string;
  template_id?: string | null;
  is_active?: boolean;
  updated_at?: string;
}

export interface Coupon {
  id?: string;
  coupon_code: string;
  discount_type?: 'percentage' | 'fixed_amount';
  discount_value: number;
  min_order_amount?: number;
  valid_until?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface MarketingAudience {
  id?: string;
  segment_name: string;
  criteria?: any;
  total_members?: number;
  created_at?: string;
}

export class MarketingService {
  // 1. Broadcast Campaigns (WhatsApp & SMS)
  public static async getCampaigns(): Promise<MarketingCampaign[]> {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching marketing campaigns:', error);
      return [];
    }
    return data || [];
  }

  public static async createCampaign(campaign: Omit<MarketingCampaign, 'id' | 'created_at'>): Promise<MarketingCampaign> {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .insert({
        ...campaign,
        sent_count: campaign.sent_count ?? 0,
        delivered_count: campaign.delivered_count ?? 0,
        status: campaign.status || 'draft'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async updateCampaign(id: string, updates: Partial<MarketingCampaign>): Promise<MarketingCampaign> {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating campaign:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async deleteCampaign(id: string): Promise<void> {
    const { error } = await supabase
      .from('marketing_campaigns')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting campaign:', error);
      throw new Error(error.message);
    }
  }

  // 2. Automated Triggers
  public static async getAutomations(): Promise<MarketingAutomation[]> {
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching automations:', error);
      return [];
    }
    return data || [];
  }

  public static async createAutomation(auto: Omit<MarketingAutomation, 'id' | 'updated_at'>): Promise<MarketingAutomation> {
    const { data, error } = await supabase
      .from('marketing_automations')
      .insert({
        ...auto,
        is_active: auto.is_active !== false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating automation:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async toggleAutomation(id: string, isActive: boolean): Promise<MarketingAutomation> {
    const { data, error } = await supabase
      .from('marketing_automations')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error toggling automation:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async deleteAutomation(id: string): Promise<void> {
    const { error } = await supabase
      .from('marketing_automations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting automation:', error);
      throw new Error(error.message);
    }
  }

  // 3. Discount Coupons
  public static async getCoupons(): Promise<Coupon[]> {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching coupons:', error);
      return [];
    }
    return data || [];
  }

  public static async createCoupon(coupon: Omit<Coupon, 'id' | 'created_at'>): Promise<Coupon> {
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        ...coupon,
        coupon_code: coupon.coupon_code.toUpperCase().trim(),
        is_active: coupon.is_active !== false
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating coupon:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async toggleCoupon(id: string, isActive: boolean): Promise<Coupon> {
    const { data, error } = await supabase
      .from('coupons')
      .update({ is_active: isActive })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error toggling coupon:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async deleteCoupon(id: string): Promise<void> {
    const { error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting coupon:', error);
      throw new Error(error.message);
    }
  }

  // 4. Audience Segments
  public static async getAudiences(): Promise<MarketingAudience[]> {
    const { data, error } = await supabase
      .from('marketing_audiences')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching audiences:', error);
      return [];
    }
    return data || [];
  }

  public static async createAudience(audience: Omit<MarketingAudience, 'id' | 'created_at'>): Promise<MarketingAudience> {
    const { data, error } = await supabase
      .from('marketing_audiences')
      .insert({
        ...audience,
        total_members: audience.total_members ?? 0,
        criteria: audience.criteria || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating audience:', error);
      throw new Error(error.message);
    }
    return data;
  }

  public static async deleteAudience(id: string): Promise<void> {
    const { error } = await supabase
      .from('marketing_audiences')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting audience:', error);
      throw new Error(error.message);
    }
  }

  // Quick stats loader directly from Supabase
  public static async getMarketingOverviewStats(): Promise<{
    activeCampaigns: number;
    activeAutomations: number;
    activeCoupons: number;
    totalAudienceMembers: number;
    inStockProducts: number;
  }> {
    try {
      const [campRes, autoRes, coupRes, audRes, itemRes] = await Promise.all([
        supabase.from('marketing_campaigns').select('id', { count: 'exact', head: true }),
        supabase.from('marketing_automations').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('marketing_audiences').select('total_members'),
        supabase.from('inventory_items').select('id', { count: 'exact', head: true }).gt('stock_quantity', 0)
      ]);

      const totalAudience = (audRes.data || []).reduce((acc: number, curr: any) => acc + (curr.total_members || 0), 0);

      return {
        activeCampaigns: campRes.count || 0,
        activeAutomations: autoRes.count || 0,
        activeCoupons: coupRes.count || 0,
        totalAudienceMembers: totalAudience,
        inStockProducts: itemRes.count || 0
      };
    } catch (e) {
      console.error('Error fetching marketing overview stats:', e);
      return {
        activeCampaigns: 0,
        activeAutomations: 0,
        activeCoupons: 0,
        totalAudienceMembers: 0,
        inStockProducts: 0
      };
    }
  }
}
export default MarketingService;
