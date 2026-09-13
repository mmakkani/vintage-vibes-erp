import { DevicesController } from '../../src/modules/devices/devices.controller.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return DevicesController.listDevices(req, res);
  }

  const url = req.url || '';
  if (req.method === 'POST') {
    if (url.includes('toggle-status')) return DevicesController.toggleDeviceStatus(req, res);
    if (url.includes('update-limit')) return DevicesController.updateDeviceLimit(req, res);
    if (url.includes('register')) return DevicesController.registerDevice(req, res);
  }

  if (req.method === 'DELETE') {
    const parts = url.split('/');
    req.params = { id: parts[parts.length - 1] };
    return DevicesController.deleteDevice(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
