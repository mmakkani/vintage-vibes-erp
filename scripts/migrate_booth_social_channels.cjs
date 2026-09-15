const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  
  await client.connect();
  console.log('[Migration] Connected to PostgreSQL database.');

  const ddl = `
    -- Create booth_social_channels table if not exists
    CREATE TABLE IF NOT EXISTS booth_social_channels (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      account_username TEXT,
      account_password TEXT,
      session_cookies JSONB DEFAULT '[]'::jsonb,
      auth_status TEXT DEFAULT 'IDLE' CHECK (auth_status IN ('IDLE', 'AUTHENTICATING', 'WAITING_OTP', 'LOGGED_IN', 'AUTH_FAILED')),
      last_login_at TIMESTAMPTZ,
      otp_required BOOLEAN DEFAULT false,
      proxy_url TEXT,
      is_active BOOLEAN DEFAULT true,
      stream_status TEXT DEFAULT 'STANDBY',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_booth_platform UNIQUE (booth_id, platform)
    );

    -- Index for fast lookup by booth
    CREATE INDEX IF NOT EXISTS idx_booth_social_booth_id ON booth_social_channels(booth_id);
    CREATE INDEX IF NOT EXISTS idx_booth_social_platform ON booth_social_channels(platform);

    -- Seed default 5 booths if empty
    INSERT INTO booth_social_channels (id, booth_id, platform, account_username, auth_status, is_active)
    VALUES
      ('b1_tiktok', 'booth-1', 'tiktok', '@vintage_dubai_b1', 'IDLE', true),
      ('b1_instagram', 'booth-1', 'instagram', '@vintage_dubai_b1_ig', 'IDLE', true),
      ('b1_facebook', 'booth-1', 'facebook', 'Vintage Vibes UAE - Floor 1', 'IDLE', true),
      ('b1_youtube', 'booth-1', 'youtube', 'Vintage Vibes Studio 1 Live', 'IDLE', true),
      ('b01_tiktok', 'booth-01', 'tiktok', '@vintage_dubai_b1', 'IDLE', true),
      ('b01_instagram', 'booth-01', 'instagram', '@vintage_dubai_b1_ig', 'IDLE', true),
      ('b01_facebook', 'booth-01', 'facebook', 'Vintage Vibes UAE - Floor 1', 'IDLE', true),
      ('b01_youtube', 'booth-01', 'youtube', 'Vintage Vibes Studio 1 Live', 'IDLE', true),
      ('b2_tiktok', 'booth-2', 'tiktok', '@vintage_sweats_b2', 'IDLE', true),
      ('b2_instagram', 'booth-2', 'instagram', '@vintage_sweats_b2_ig', 'IDLE', true),
      ('b2_facebook', 'booth-2', 'facebook', 'Vintage Vibes UAE - Floor 2', 'IDLE', true),
      ('b2_youtube', 'booth-2', 'youtube', 'Vintage Vibes Studio 2 Live', 'IDLE', true),
      ('b02_tiktok', 'booth-02', 'tiktok', '@vintage_sweats_b2', 'IDLE', true),
      ('b02_instagram', 'booth-02', 'instagram', '@vintage_sweats_b2_ig', 'IDLE', true),
      ('b02_facebook', 'booth-02', 'facebook', 'Vintage Vibes UAE - Floor 2', 'IDLE', true),
      ('b02_youtube', 'booth-02', 'youtube', 'Vintage Vibes Studio 2 Live', 'IDLE', true),
      ('b3_tiktok', 'booth-3', 'tiktok', '@vintage_vault_b3', 'IDLE', true),
      ('b3_instagram', 'booth-3', 'instagram', '@vintage_vault_b3_ig', 'IDLE', true),
      ('b3_facebook', 'booth-3', 'facebook', 'Vintage Vibes UAE - Floor 3', 'IDLE', true),
      ('b3_youtube', 'booth-3', 'youtube', 'Vintage Vibes Studio 3 Live', 'IDLE', true),
      ('b03_tiktok', 'booth-03', 'tiktok', '@vintage_vault_b3', 'IDLE', true),
      ('b03_instagram', 'booth-03', 'instagram', '@vintage_vault_b3_ig', 'IDLE', true),
      ('b03_facebook', 'booth-03', 'facebook', 'Vintage Vibes UAE - Floor 3', 'IDLE', true),
      ('b03_youtube', 'booth-03', 'youtube', 'Vintage Vibes Studio 3 Live', 'IDLE', true),
      ('b4_tiktok', 'booth-4', 'tiktok', '@workwear_dubai_b4', 'IDLE', true),
      ('b4_instagram', 'booth-4', 'instagram', '@workwear_dubai_b4_ig', 'IDLE', true),
      ('b4_facebook', 'booth-4', 'facebook', 'Vintage Vibes UAE - Floor 4', 'IDLE', true),
      ('b4_youtube', 'booth-4', 'youtube', 'Vintage Vibes Studio 4 Live', 'IDLE', true),
      ('b04_tiktok', 'booth-04', 'tiktok', '@workwear_dubai_b4', 'IDLE', true),
      ('b04_instagram', 'booth-04', 'instagram', '@workwear_dubai_b4_ig', 'IDLE', true),
      ('b04_facebook', 'booth-04', 'facebook', 'Vintage Vibes UAE - Floor 4', 'IDLE', true),
      ('b04_youtube', 'booth-04', 'youtube', 'Vintage Vibes Studio 4 Live', 'IDLE', true),
      ('b5_tiktok', 'booth-5', 'tiktok', '@vintage_kicks_b5', 'IDLE', true),
      ('b5_instagram', 'booth-5', 'instagram', '@vintage_kicks_b5_ig', 'IDLE', true),
      ('b5_facebook', 'booth-5', 'facebook', 'Vintage Vibes UAE - Floor 5', 'IDLE', true),
      ('b5_youtube', 'booth-5', 'youtube', 'Vintage Vibes Studio 5 Live', 'IDLE', true),
      ('b05_tiktok', 'booth-05', 'tiktok', '@vintage_kicks_b5', 'IDLE', true),
      ('b05_instagram', 'booth-05', 'instagram', '@vintage_kicks_b5_ig', 'IDLE', true),
      ('b05_facebook', 'booth-05', 'facebook', 'Vintage Vibes UAE - Floor 5', 'IDLE', true),
      ('b05_youtube', 'booth-05', 'youtube', 'Vintage Vibes Studio 5 Live', 'IDLE', true)
    ON CONFLICT (booth_id, platform) DO NOTHING;
  `;

  await client.query(ddl);
  console.log('[Migration] Table booth_social_channels created & seeded successfully.');

  const res = await client.query('SELECT count(*) FROM booth_social_channels');
  console.log(`[Migration] Total booth social channels rows: ${res.rows[0].count}`);

  await client.end();
}

runMigration().catch(err => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
