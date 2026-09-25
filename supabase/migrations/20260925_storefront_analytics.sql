-- ==============================================================================
-- MIGRATION: 20260925_storefront_analytics.sql
-- PURPOSE: Storefront Analytics & Traffic Engine Schema with RLS
-- SECURITY: Anonymous INSERT allowed, Authenticated ERP users SELECT only
-- ==============================================================================

-- 1. Create table storefront_analytics
CREATE TABLE IF NOT EXISTS public.storefront_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID NOT NULL,
    ip_address VARCHAR(100),
    country VARCHAR(100),
    city VARCHAR(100),
    device_type VARCHAR(50), -- Mobile / Desktop / Tablet
    os VARCHAR(50),
    browser VARCHAR(50),
    page_visited VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create high-performance indices for fast aggregation & range pagination
CREATE INDEX IF NOT EXISTS idx_storefront_analytics_visitor_id ON public.storefront_analytics (visitor_id);
CREATE INDEX IF NOT EXISTS idx_storefront_analytics_created_at ON public.storefront_analytics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_analytics_country ON public.storefront_analytics (country);
CREATE INDEX IF NOT EXISTS idx_storefront_analytics_city ON public.storefront_analytics (city);
CREATE INDEX IF NOT EXISTS idx_storefront_analytics_device_type ON public.storefront_analytics (device_type);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE public.storefront_analytics ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing policies
DROP POLICY IF EXISTS "Allow anonymous insert to storefront_analytics" ON public.storefront_analytics;
DROP POLICY IF EXISTS "Allow authenticated read to storefront_analytics" ON public.storefront_analytics;

-- 5. Policy 1: Allow anonymous (and authenticated) visitors to INSERT tracking records
CREATE POLICY "Allow anonymous insert to storefront_analytics"
    ON public.storefront_analytics
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- 6. Policy 2: Allow authenticated ERP users and service role to SELECT analytics data
CREATE POLICY "Allow authenticated read to storefront_analytics"
    ON public.storefront_analytics
    FOR SELECT
    TO authenticated
    USING (true);
