import { Router } from 'express';
import { DevicesController } from './devices.controller.ts';

export const devicesRouter = Router();

devicesRouter.post('/register', (req, res) => DevicesController.registerDevice(req, res));
devicesRouter.get('/', (req, res) => DevicesController.listDevices(req, res));
devicesRouter.post('/toggle-status', (req, res) => DevicesController.toggleDeviceStatus(req, res));
devicesRouter.post('/update-limit', (req, res) => DevicesController.updateDeviceLimit(req, res));
devicesRouter.delete('/:id', (req, res) => DevicesController.deleteDevice(req, res));
