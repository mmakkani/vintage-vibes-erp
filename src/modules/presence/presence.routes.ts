import { Router } from 'express';
import { PresenceController } from './presence.controller.ts';

export const presenceRouter = Router();

presenceRouter.post('/heartbeat', (req, res) => PresenceController.heartbeat(req, res));
presenceRouter.get('/', (req, res) => PresenceController.getOnlineUsers(req, res));
presenceRouter.post('/logout', (req, res) => PresenceController.logout(req, res));
