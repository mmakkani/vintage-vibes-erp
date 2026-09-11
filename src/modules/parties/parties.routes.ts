import { Router } from 'express';
import { PartiesController } from './parties.controller.ts';

export const partiesRouter = Router();

partiesRouter.get('/', (req, res) => {
  const { type } = req.query as { type?: string };
  return res.json(PartiesController.getParties(type));
});

partiesRouter.post('/', (req, res) => {
  const newParty = PartiesController.addParty(req.body);
  return res.json(newParty);
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
