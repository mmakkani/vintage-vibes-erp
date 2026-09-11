async function test() {
  console.log('--- 1. Testing WhatsApp Session ---');
  const sessRes = await fetch('http://localhost:3000/api/marketing/whatsapp/session?userId=usr-admin-1');
  const sess = await sessRes.json();
  console.log('Session Status:', sess.isConnected ? '🟢 CONNECTED' : '🔴 DISCONNECTED', 'Phone:', sess.phoneNumber);

  console.log('\n--- 2. Testing Channel Config ---');
  const cfgRes = await fetch('http://localhost:3000/api/marketing/whatsapp/config');
  const cfg = await cfgRes.json();
  console.log('Config Channel:', cfg.channelConfig);

  console.log('\n--- 3. Testing Channel Resolver ---');
  const resolveRes = await fetch('http://localhost:3000/api/marketing/whatsapp/channels/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteLink: 'https://whatsapp.com/channel/0029VbEAAML89indIXn39f00' })
  });
  const resolveData = await resolveRes.json();
  console.log('Resolve Result:', resolveData);

  console.log('\n--- 4. Testing Real User Groups ---');
  const groupsRes = await fetch('http://localhost:3000/api/marketing/whatsapp/groups');
  const groupsData = await groupsRes.json();
  console.log('Real Groups Count:', groupsData.groups?.length || 0);

  console.log('\n--- 5. Testing Real Test Post to Channel 120363431101986513@newsletter ---');
  const testPostRes = await fetch('http://localhost:3000/api/marketing/whatsapp/channels/test-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelJid: resolveData.meta?.id || '120363431101986513@newsletter',
      channelInviteLink: 'https://whatsapp.com/channel/0029VbEAAML89indIXn39f00'
    })
  });
  const testPostData = await testPostRes.json();
  console.log('Test Post Result:', testPostData);
}

test().catch(console.error);
