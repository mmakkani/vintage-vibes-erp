import { Router } from 'express';
import { PresenceController } from './presence.controller.ts';

export const presenceRouter = Router();

presenceRouter.post('/heartbeat', async (req, res) => {
  try {
    await PresenceController.heartbeat(req, res);
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      degraded: true,
      onlineCount: 1,
      users: []
    });
  }
});

presenceRouter.get('/', async (req, res) => {
  try {
    await PresenceController.getOnlineUsers(req, res);
  } catch (err: any) {
    return res.status(200).json({
      success: true,
      degraded: true,
      onlineCount: 1,
      users: []
    });
  }
});

presenceRouter.post('/logout', async (req, res) => {
  try {
    await PresenceController.logout(req, res);
  } catch (err: any) {
    return res.status(200).json({ success: true });
  }
});
