async function testRoutes() {
  console.log('--- 1. Testing Sync Phone Contacts ---');
  const syncRes = await fetch('http://localhost:3000/api/marketing/whatsapp/directory/sync-phone-contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'usr-admin-1' })
  });
  const syncData = await syncRes.json();
  console.log('Sync Result:', syncData.success, 'Added Count:', syncData.addedCount, 'Total Clients:', syncData.totalContacts);

  console.log('\n--- 2. Testing Channels List ---');
  const chanRes = await fetch('http://localhost:3000/api/marketing/whatsapp/channels');
  const chanData = await chanRes.json();
  console.log('Channels count:', chanData.channels?.length, chanData.channels);

  console.log('\n--- 3. Testing Social Connections ---');
  const socRes = await fetch('http://localhost:3000/api/marketing/social/connections');
  const socData = await socRes.json();
  console.log('Social platforms:', socData.accounts?.map(a => a.platformName));

  console.log('\n--- 4. Testing Auto-Invoice Settings ---');
  const invRes = await fetch('http://localhost:3000/api/marketing/auto-invoice/settings');
  const invData = await invRes.json();
  console.log('Auto Invoice Rules:', invData.rules);
}

testRoutes().catch(console.error);
