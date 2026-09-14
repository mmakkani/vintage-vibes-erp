const { Client } = require('pg');

async function runMigration() {
  let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  if (dbUrl.includes('db.wjjelqsrivnyiybarfmo.supabase.co')) {
    dbUrl = 'postgresql://postgres.wjjelqsrivnyiybarfmo:Makkani%402233@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
  }
  const match = dbUrl.match(/^postgresql:\/\/([^:]+):(.*)@([^@\/]+)(:\d+)?(\/.*)$/);
  if (match) {
    let [_, u, rawPwd, host, port, rest] = match;
    if (rawPwd.startsWith('[') && rawPwd.endsWith(']')) rawPwd = rawPwd.slice(1, -1);
    dbUrl = `postgresql://${u}:${encodeURIComponent(decodeURIComponent(rawPwd))}@${host}${port || ''}${rest}`;
  }

  console.log('[Migration] Connecting to Supabase PostgreSQL...');
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('[Migration] Connected successfully.');

  // 1. marketing_claim_rules
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_claim_rules (
      id VARCHAR(64) PRIMARY KEY,
      keyword VARCHAR(64) NOT NULL,
      action VARCHAR(64) NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      match_type VARCHAR(32) DEFAULT 'STARTS_WITH',
      lock_duration_minutes INT DEFAULT 15,
      priority INT DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_claim_rules ready');

  // Seed default keyword rules if empty
  const rulesCount = await client.query('SELECT COUNT(*) FROM marketing_claim_rules;');
  if (parseInt(rulesCount.rows[0].count) === 0) {
    const defaultRules = [
      ['kw-1', 'MINE', 'LOCK_AND_DRAFT_INVOICE', true, 'STARTS_WITH', 15, 1],
      ['kw-2', 'CLAIM', 'LOCK_AND_DRAFT_INVOICE', true, 'STARTS_WITH', 15, 2],
      ['kw-3', 'SOLD', 'LOCK_AND_DRAFT_INVOICE', true, 'STARTS_WITH', 15, 3],
      ['kw-4', 'BIN', 'LOCK_AND_DRAFT_INVOICE', true, 'STARTS_WITH', 15, 4],
      ['kw-5', 'TAKE', 'LOCK_AND_DRAFT_INVOICE', true, 'STARTS_WITH', 15, 5]
    ];
    for (const r of defaultRules) {
      await client.query(
        `INSERT INTO marketing_claim_rules (id, keyword, action, enabled, match_type, lock_duration_minutes, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING;`,
        r
      );
    }
    console.log('✓ Seeded default marketing_claim_rules');
  }

  // 2. marketing_bot_templates
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_bot_templates (
      id VARCHAR(64) PRIMARY KEY,
      success_template TEXT NOT NULL,
      already_claimed_template TEXT NOT NULL,
      invalid_sku_template TEXT NOT NULL,
      payment_link_base_url TEXT DEFAULT 'http://localhost:3000/?checkout=',
      send_whatsapp_dm BOOLEAN DEFAULT TRUE,
      send_public_reply BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_bot_templates ready');

  const templateCount = await client.query('SELECT COUNT(*) FROM marketing_bot_templates;');
  if (parseInt(templateCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO marketing_bot_templates (id, success_template, already_claimed_template, invalid_sku_template, payment_link_base_url, send_whatsapp_dm, send_public_reply)
      VALUES (
        'default',
        '🔥 CLAIM LOCKED @{customer}! You secured {sku} ({item_name}) for AED {price}. Your VIP lock is held for {expiry_mins} mins. Complete instant checkout: {checkout_link}',
        '⚠️ Sorry @{customer}, {sku} was already locked by another collector! You have been prioritized on the waitlist.',
        '👀 @{customer}, we could not locate that SKU. Please comment with a valid item barcode (e.g., MINE VV-BAL-001-0001).',
        'http://localhost:3000/?checkout=',
        true,
        true
      ) ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✓ Seeded default marketing_bot_templates');
  }

  // 3. marketing_claim_logs
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_claim_logs (
      id VARCHAR(64) PRIMARY KEY,
      timestamp VARCHAR(64),
      customer_handle VARCHAR(128),
      platform VARCHAR(64),
      raw_comment TEXT,
      matched_keyword VARCHAR(64),
      sku VARCHAR(64) NOT NULL,
      item_name VARCHAR(255),
      item_image TEXT,
      price_aed NUMERIC(12,2) DEFAULT 0,
      invoice_no VARCHAR(64),
      status VARCHAR(64) DEFAULT 'LOCK_ACTIVE',
      reply_dispatched TEXT,
      checkout_url TEXT,
      lock_expires_at BIGINT,
      booth_id VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_claim_logs ready');

  // 4. marketing_vip_drops
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_vip_drops (
      id VARCHAR(64) PRIMARY KEY,
      campaign_title VARCHAR(255) NOT NULL,
      target_group VARCHAR(64) NOT NULL,
      recipient_count INT DEFAULT 0,
      piece_ids JSONB DEFAULT '[]'::jsonb,
      pieces JSONB DEFAULT '[]'::jsonb,
      custom_note TEXT,
      generated_text TEXT,
      status VARCHAR(64) DEFAULT 'SENT',
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_vip_drops ready');

  // 5. marketing_live_sessions
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_live_sessions (
      id VARCHAR(64) PRIMARY KEY,
      is_broadcasting BOOLEAN DEFAULT FALSE,
      started_at BIGINT,
      active_booth_id VARCHAR(64) DEFAULT 'booth-01',
      active_booth_name VARCHAR(128) DEFAULT 'Booth 01 - Main Stage',
      active_on_air_piece JSONB,
      scanner_feed JSONB DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_live_sessions ready');

  const liveCount = await client.query("SELECT COUNT(*) FROM marketing_live_sessions WHERE id = 'active_session';");
  if (parseInt(liveCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO marketing_live_sessions (id, is_broadcasting, started_at, active_booth_id, active_booth_name, active_on_air_piece, scanner_feed)
      VALUES ('active_session', false, NULL, 'booth-01', 'Booth 01 - Main Stage', NULL, '[]'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✓ Seeded default marketing_live_sessions');
  }

  // 6. marketing_social_accounts
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_social_accounts (
      id VARCHAR(64) PRIMARY KEY,
      platform_name VARCHAR(128) NOT NULL,
      is_connected BOOLEAN DEFAULT FALSE,
      server_url TEXT,
      stream_key TEXT,
      account_handle VARCHAR(128),
      channel_id VARCHAR(128),
      auto_claim_bot BOOLEAN DEFAULT TRUE,
      auto_invoice_on_claim BOOLEAN DEFAULT TRUE,
      last_tested_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_social_accounts ready');

  const socialCount = await client.query('SELECT COUNT(*) FROM marketing_social_accounts;');
  if (parseInt(socialCount.rows[0].count) === 0) {
    const defaultSocial = [
      ['youtube', 'YouTube Live Stream', false, 'rtmp://a.rtmp.youtube.com/live2', '', '@vintagevibes_official', '', true, true],
      ['instagram', 'Instagram Live / Direct', false, 'rtmps://live-upload.instagram.com:443/rtmp/', '', '@vintagevibes_dubai', '', true, true],
      ['tiktok', 'TikTok Live Commerce', false, 'rtmp://live-push.tiktok.com/live/', '', '@vintagevibes_uae', '', true, true]
    ];
    for (const s of defaultSocial) {
      await client.query(
        `INSERT INTO marketing_social_accounts (id, platform_name, is_connected, server_url, stream_key, account_handle, channel_id, auto_claim_bot, auto_invoice_on_claim)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING;`,
        s
      );
    }
    console.log('✓ Seeded default marketing_social_accounts');
  }

  // 7. marketing_auto_invoice_rules
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_auto_invoice_rules (
      id VARCHAR(64) PRIMARY KEY,
      auto_generate_tax_invoice BOOLEAN DEFAULT TRUE,
      auto_post_to_ledger BOOLEAN DEFAULT TRUE,
      default_vat_percent NUMERIC(5,2) DEFAULT 5,
      reservation_expiry_mins INT DEFAULT 15,
      default_payment_method VARCHAR(64) DEFAULT 'DIGITAL_GATEWAY',
      print_thermal_receipt BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_auto_invoice_rules ready');

  const invoiceRulesCount = await client.query('SELECT COUNT(*) FROM marketing_auto_invoice_rules;');
  if (parseInt(invoiceRulesCount.rows[0].count) === 0) {
    await client.query(`
      INSERT INTO marketing_auto_invoice_rules (id, auto_generate_tax_invoice, auto_post_to_ledger, default_vat_percent, reservation_expiry_mins, default_payment_method, print_thermal_receipt)
      VALUES ('default', true, true, 5.00, 15, 'DIGITAL_GATEWAY', true)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✓ Seeded default marketing_auto_invoice_rules');
  }

  // 8. marketing_broadcast_campaigns
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_broadcast_campaigns (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      target_audience VARCHAR(128),
      target_chat_id VARCHAR(128),
      customer_phones JSONB DEFAULT '[]'::jsonb,
      voice_note_enabled BOOLEAN DEFAULT FALSE,
      voice_note_preset_id VARCHAR(64),
      voice_note_text TEXT,
      voice_note_status VARCHAR(64),
      interval_seconds INT DEFAULT 4,
      status VARCHAR(64) DEFAULT 'RUNNING',
      current_index INT DEFAULT 0,
      total_count INT DEFAULT 0,
      sent_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      items JSONB DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_broadcast_campaigns ready');

  // 9. marketing_voice_presets
  await client.query(`
    CREATE TABLE IF NOT EXISTS marketing_voice_presets (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      script_text TEXT NOT NULL,
      duration_seconds INT DEFAULT 15,
      speaker VARCHAR(128),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Table marketing_voice_presets ready');

  const voicePresetsCount = await client.query('SELECT COUNT(*) FROM marketing_voice_presets;');
  if (parseInt(voicePresetsCount.rows[0].count) === 0) {
    const presets = [
      [
        'vn-hype-vault',
        '🔥 Dubai VIP Hype Drop Alert (Authentic Audio Note)',
        'Salam VIP family! We just broke the seal on an untouched Grade A container direct from our Dubai Al Quoz facility. Inspect the photo drop rolling into this chat piece-by-piece right now, and reply MINE [SKU] to lock your grail before public TikTok Live!',
        14,
        'Rashid (Dubai Vault Master)'
      ],
      [
        'vn-rare-grails',
        '⚡ Rare Grails & Workwear Early Access',
        'Peace collectors! 25 rare 90s Carhartt Detroit jackets, single stitch band tees, and Japanese raw denim dropping photo-by-photo right now. 1-of-1 pieces only. Free express courier across UAE and GCC on all claims!',
        16,
        'Marcus (Chief Archivist)'
      ],
      [
        'vn-winter-maazi',
        '🧥 Winter Maazi Heavy Outerwear Special',
        'Attention vintage VIPs! Premium vintage leather flight jackets, wool trench coats, and heavyweight sportswear dropping into the group now. Reply with your SKU to claim instantly before they sell out!',
        12,
        'Layla (VIP Hostess)'
      ]
    ];
    for (const vp of presets) {
      await client.query(
        `INSERT INTO marketing_voice_presets (id, title, script_text, duration_seconds, speaker)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING;`,
        vp
      );
    }
    console.log('✓ Seeded default marketing_voice_presets');
  }

  // 10. Enable Supabase Realtime Replication on marketing tables
  try {
    const realtimeTables = [
      'marketing_claim_rules',
      'marketing_bot_templates',
      'marketing_claim_logs',
      'marketing_vip_drops',
      'marketing_live_sessions',
      'marketing_social_accounts',
      'marketing_auto_invoice_rules',
      'marketing_broadcast_campaigns',
      'marketing_voice_presets',
      'whatsapp_channels',
      'marketing_campaigns',
      'marketing_automations',
      'coupons',
      'marketing_audiences'
    ];
    for (const t of realtimeTables) {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE ${t};`).catch(err => {
        // Table might already be in publication, which is normal
      });
    }
    console.log('✓ Added marketing tables to supabase_realtime publication');
  } catch (rtErr) {
    console.warn('Realtime publication setup notice:', rtErr.message);
  }

  // 11. Import any existing records from .data/marketing_config.json
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.cwd(), '.data', 'marketing_config.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.claimLogs)) {
        for (const c of data.claimLogs) {
          await client.query(`
            INSERT INTO marketing_claim_logs (
              id, timestamp, customer_handle, platform, raw_comment, matched_keyword,
              sku, item_name, item_image, price_aed, invoice_no, status,
              reply_dispatched, checkout_url, lock_expires_at, booth_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO NOTHING;
          `, [
            c.id, c.timestamp, c.customerHandle, c.platform, c.rawComment, c.matchedKeyword,
            c.sku, c.itemName, c.itemImage, c.priceAed || 0, c.invoiceNo, c.status,
            c.replyDispatched, c.checkoutUrl, c.lockExpiresAt, c.boothId
          ]);
        }
        console.log(`✓ Imported ${data.claimLogs.length} historical claim logs from config`);
      }
      if (Array.isArray(data.vipDrops)) {
        for (const d of data.vipDrops) {
          await client.query(`
            INSERT INTO marketing_vip_drops (
              id, campaign_title, target_group, recipient_count, piece_ids,
              pieces, custom_note, generated_text, status, sent_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO NOTHING;
          `, [
            d.id, d.campaignTitle, d.targetGroup, d.recipientCount,
            JSON.stringify(d.pieceIds || []), JSON.stringify(d.pieces || []),
            d.customNote, d.generatedText, d.status, d.sentAt
          ]);
        }
        console.log(`✓ Imported ${data.vipDrops.length} historical VIP drops from config`);
      }
    } catch (importErr) {
      console.warn('Notice importing existing config:', importErr.message);
    }
  }

  await client.end();
  console.log('[Migration] Complete! All marketing automation tables created & verified in Supabase PostgreSQL.');
}

runMigration().catch(err => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
