-- ============================================================================
-- OPERATORS & ACCESS CONTROL SCHEMA (Supabase PostgreSQL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'operator',
  pin TEXT,
  permissions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.operators DISABLE ROW LEVEL SECURITY;

-- Ensure default admin is present in the table
INSERT INTO public.operators (username, password_hash, display_name, role, is_active)
VALUES ('admin', 'admin123', 'Master Admin', 'superadmin', true)
ON CONFLICT (username) DO NOTHING;
