import { PresenceController } from '../../src/modules/presence/presence.controller.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') return PresenceController.heartbeat(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}
