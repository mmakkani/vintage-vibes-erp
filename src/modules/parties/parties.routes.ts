import { Router } from 'express';
import { PartiesController } from './parties.controller.ts';
import { PartiesService } from '../../services/partiesService.ts';

export const partiesRouter = Router();

partiesRouter.get('/', async (req, res) => {
  const { type } = req.query as { type?: string };
  try {
    const list = await PartiesService.getParties();
    if (type) {
      return res.json(list.filter(p => p.type === type));
    }
    return res.json(list);
  } catch (_) {
    return res.json(PartiesController.getParties(type));
  }
});

partiesRouter.post('/', async (req, res) => {
  try {
    const newParty = PartiesController.addParty(req.body);
    try {
      await PartiesService.ensurePartyCoaAccount(newParty);
    } catch (_) {}
    return res.json(newParty);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

partiesRouter.get('/:id/khata', (req, res) => {
  const { id } = req.params;
  return res.json(PartiesController.getPartyKhata(id));
});

partiesRouter.post('/:id/transaction', (req, res) => {
  const { id } = req.params;
  const result = PartiesController.recordPaymentOrReceipt(id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});
