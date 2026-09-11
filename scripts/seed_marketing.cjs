require('dotenv').config();
const { Client } = require('pg');

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to DB');

  await client.query(`
    INSERT INTO marketing_campaigns (campaign_name, channel, target_audience, message_template, status, sent_count, delivered_count)
    VALUES 
      ('UAE Weekend Vintage Drop - VIP Gold Alert', 'whatsapp', 'VIP Gold Buyers', 'Hello {customer_name}! 🌟 Exclusive vintage drop is now LIVE at Vintage Vibes Al Ain. Use code VIP20 for 20% off all rare selvedge denim and jackets this weekend! Shop now: https://vintagevibesgk.com', 'sent', 1420, 1398),
      ('Ramadan Flash Sale Announcement', 'whatsapp', 'All Registered Customers', 'Ramadan Kareem from Vintage Vibes! 🌙 Explore our new arrivals with free delivery on all orders over AED 350.', 'scheduled', 0, 0)
    ON CONFLICT DO NOTHING;

    INSERT INTO marketing_automations (automation_name, trigger_event, action_type, is_active)
    VALUES 
      ('Instant WhatsApp Order Confirmation & PDF Receipt', 'order_created', 'send_whatsapp_invoice', true),
      ('Abandoned Cart Recovery Reminder (2h Delay)', 'cart_abandoned', 'send_recovery_sms', true),
      ('Live Stream Claim Auto-Checkout Link', 'live_claim_created', 'send_whatsapp_claim_link', true)
    ON CONFLICT DO NOTHING;

    INSERT INTO coupons (coupon_code, discount_type, discount_value, min_order_amount, is_active)
    VALUES 
      ('WELCOME10', 'percentage', 10, 150, true),
      ('FREESHIP', 'fixed_amount', 25, 300, true),
      ('VIP20', 'percentage', 20, 500, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO marketing_audiences (segment_name, total_members, criteria)
    VALUES 
      ('VIP Gold Buyers (LTV > AED 2,000)', 184, '{"min_spend":2000, "frequency":"high"}'::jsonb),
      ('All Retail Storefront Customers', 2450, '{"channel":"ecommerce"}'::jsonb),
      ('B2B Wholesale Garment Buyers', 62, '{"type":"wholesale_bale"}'::jsonb)
    ON CONFLICT DO NOTHING;
  `);

  console.log('Marketing seed complete!');
  await client.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
