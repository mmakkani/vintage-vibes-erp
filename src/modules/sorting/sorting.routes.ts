import { Router } from 'express';
import { SortingController } from './sorting.controller.ts';

export const sortingRouter = Router();

// GET /api/sorting or /api/sorting/batches - List all sorting batches
sortingRouter.get('/', async (req, res) => {
  try {
    const batches = await SortingController.getBatches();
    return res.json(batches);
  } catch (err: any) {
    console.error('[Sorting API Error - GET /]:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch sorting batches' });
  }
});

sortingRouter.get('/batches', async (req, res) => {
  try {
    const batches = await SortingController.getBatches();
    return res.json(batches);
  } catch (err: any) {
    console.error('[Sorting API Error - GET /batches]:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch sorting batches' });
  }
});

// GET /api/sorting/batches/:id - Get specific batch with finished items
sortingRouter.get('/batches/:id', async (req, res) => {
  try {
    const batch = await SortingController.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: `Sorting batch ${req.params.id} not found` });
    }
    return res.json(batch);
  } catch (err: any) {
    console.error(`[Sorting API Error - GET /batches/${req.params.id}]:`, err);
    return res.status(500).json({ error: err.message || 'Failed to fetch sorting batch' });
  }
});

// POST /api/sorting/batches - Create a new sorting batch
sortingRouter.post('/batches', async (req, res) => {
  try {
    const batch = await SortingController.createBatch(req.body);
    return res.status(201).json(batch);
  } catch (err: any) {
    console.error('[Sorting API Error - POST /batches]:', err);
    return res.status(400).json({ error: err.message || 'Failed to create sorting batch' });
  }
});

// POST /api/sorting/start - Start sorting batch and issue to WIP
sortingRouter.post('/start', async (req, res) => {
  const batchId = req.body.batchId || req.body.batch_id || req.body.p_batch_id;
  if (!batchId) {
    return res.status(400).json({ error: 'Missing required parameter: batchId' });
  }

  try {
    const result = await SortingController.startSorting(batchId);
    return res.json(result);
  } catch (err: any) {
    console.error(`[Sorting API Error - POST /start for ${batchId}]:`, err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to start sorting batch and post WIP voucher'
    });
  }
});

// POST /api/sorting/complete - Complete sorting batch and post Finished Goods
sortingRouter.post('/complete', async (req, res) => {
  const batchId = req.body.batchId || req.body.batch_id || req.body.p_batch_id;
  const finishedItems = req.body.finishedItems || req.body.finished_items || req.body.p_finished_items || [];

  if (!batchId) {
    return res.status(400).json({ error: 'Missing required parameter: batchId' });
  }
  if (!Array.isArray(finishedItems) || finishedItems.length === 0) {
    return res.status(400).json({ error: 'finishedItems must be a non-empty array' });
  }

  try {
    const result = await SortingController.completeSorting(batchId, finishedItems);
    return res.json(result);
  } catch (err: any) {
    console.error(`[Sorting API Error - POST /complete for ${batchId}]:`, err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Failed to complete sorting batch and post Finished Goods voucher'
    });
  }
});
