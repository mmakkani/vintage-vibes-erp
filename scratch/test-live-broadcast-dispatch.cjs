async function testBroadcast() {
  console.log('--- Triggering Live Broadcast Drop to Channel ---');
  const startRes = await fetch('http://localhost:3000/api/marketing/broadcast-campaign/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Real Channel Test Drop',
      targetAudience: 'Vintage (Official Channel)',
      targetChatId: '120363431101986513@newsletter',
      pieceIds: ['VV-BAL-030-2-3'],
      voiceNoteEnabled: false,
      intervalSeconds: 3
    })
  });

  const camp = await startRes.json();
  console.log('Campaign Started:', camp.id, 'Status:', camp.status, 'Items:', camp.totalCount);

  // Poll status for 6 seconds to see it send
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch('http://localhost:3000/api/marketing/broadcast-campaign/status');
    const data = await statusRes.json();
    console.log(`Poll ${i + 1}: sentCount = ${data.current?.sentCount} / ${data.current?.totalCount}, status = ${data.current?.status}`);
  }
}

testBroadcast().catch(console.error);
