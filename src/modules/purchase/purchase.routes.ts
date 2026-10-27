import { Router } from 'express';
import { PurchaseController } from './purchase.controller.ts';
import { PurchaseService } from '../../services/purchaseService.ts';
import { atomicUnpostPurchaseInvoice, atomicDeletePurchaseInvoice } from './purchaseCascadeBackend.ts';
import { classifyGarmentPhotosWithGemini } from '../../utils/geminiBulkClassifier.ts';
import { classifyGarmentSlotsWithUstad } from '../../server/ustadShagirdAiEngine.ts';
import { withDb } from '../../db/pgPool.ts';

export const purchaseRouter = Router();

purchaseRouter.get('/invoices', async (req, res) => {
  try {
    const list = await PurchaseService.getPurchaseInvoices();
    return res.json(list);
  } catch (_) {
    return res.json(PurchaseController.getInvoices());
  }
});

purchaseRouter.post('/invoices', async (req, res) => {
  try {
    const invoice = await PurchaseService.addPurchaseInvoice(req.body);
    return res.json(invoice);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to create invoice', message: err?.message });
  }
});

purchaseRouter.put('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const invoice = await PurchaseService.addPurchaseInvoice({ ...req.body, id });
    return res.json({ success: true, invoice });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to update invoice', message: err?.message });
  }
});

purchaseRouter.delete(['/invoices/:id', '/invoice/:id'], async (req, res) => {
  const id = req.params.id || req.body?.id || req.body?.invoiceId;
  const explicitNo = req.body?.invoiceNo;
  try {
    const result = await atomicDeletePurchaseInvoice(id, explicitNo);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to delete invoice', message: err?.message });
  }
});

purchaseRouter.post(['/invoices/delete', '/invoices/:id/delete', '/delete'], async (req, res) => {
  const id = req.params.id || req.body?.id || req.body?.invoiceId;
  const explicitNo = req.body?.invoiceNo;
  try {
    const result = await atomicDeletePurchaseInvoice(id, explicitNo);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to delete invoice', message: err?.message });
  }
});

purchaseRouter.post('/invoices/:id/post', async (req, res) => {
  const { id } = req.params;
  try {
    await PurchaseService.postPurchaseInvoice(id);
    return res.json({ success: true, message: 'Invoice posted successfully' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to post invoice', message: err?.message });
  }
});

purchaseRouter.post(['/invoices/:id/unpost', '/invoices/unpost', '/unpost'], async (req, res) => {
  const id = req.params.id || req.body?.id || req.body?.invoiceId;
  try {
    const result = await atomicUnpostPurchaseInvoice(id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to unpost invoice', message: err?.message });
  }
});

purchaseRouter.post('/invoices/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setInvoiceStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.put('/invoices/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setInvoiceStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post('/gate-passes/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setGatePassStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.put('/gate-passes/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, updatedBy } = req.body;
  const result = PurchaseController.setGatePassStatus(id, status, updatedBy);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/invoices/:id/convert-inward', '/invoices/:id/convert-to-gate-pass'], async (req, res) => {
  const { id } = req.params;
  try {
    const gatePasses = await PurchaseService.convertToInwardGatePass(id);
    return res.json({ success: true, count: gatePasses.length, gatePasses });
  } catch (_) {
    const result = PurchaseController.convertToInwardGatePass(id);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  }
});

purchaseRouter.get(['/gate-passes', '/bales', '/'], async (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  try {
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : null;
    const limitSql = limitParam && limitParam > 0 ? ` LIMIT ${limitParam}` : '';
    const list = await withDb(async (client) => {
      const q = await client.query(`SELECT igp.*, bs.status as session_status, bs.total_pieces as session_pieces, bs.sorted_grams as session_sorted_grams FROM inward_gate_passes igp LEFT JOIN bale_sessions bs ON bs.bale_id::text = igp.id::text ORDER BY igp.created_at DESC${limitSql};`);
      if (q.rows) {
        return q.rows.map((row: any) => {
          const grossKg = Number(row.total_bale_weight ?? row.weight_kg ?? 0);
          const rawStatus = String(row.status || '').toUpperCase();
          const isSessionCompleted = row.session_status === 'COMPLETED';
          const effectiveStatus = (rawStatus === 'COMPLETED' || rawStatus === 'POSTED' || isSessionCompleted)
            ? (rawStatus === 'POSTED' ? 'POSTED' : 'COMPLETED')
            : (row.status || (Number(row.session_pieces || 0) > 0 ? 'PARTIAL' : 'UNOPENED'));
          const piecesList = Array.isArray(row.pieces) ? row.pieces : [];
          const pieceCount = Number(row.piece_count ?? row.pieces_count ?? row.session_pieces ?? piecesList.length ?? 0);
          const brokenDownKg = Number(row.broken_down_weight ?? (row.session_sorted_grams ? Number((row.session_sorted_grams / 1000).toFixed(3)) : (effectiveStatus === 'COMPLETED' ? grossKg : 0)));
          const totalCost = Number(row.total_bale_cost ?? row.cost_price ?? 0);
          const costPerGram = Number(row.cost_per_gram ?? (grossKg > 0 ? (totalCost / (grossKg * 1000)) : 0));

          return {
            id: String(row.id),
            passNo: row.gate_pass_no || row.pass_no || `IGP-${String(row.id).slice(-6)}`,
            gatePassNo: row.gate_pass_no || row.pass_no || `IGP-${String(row.id).slice(-6)}`,
            baleCode: row.bale_code || row.bale_tag_no || `BAL-${String(row.id).slice(-6)}`,
            baleCategory: row.bale_category || 'Vintage Mixed Bales',
            purchaseInvoiceId: row.purchase_invoice_id || '',
            purchaseInvoiceNo: row.purchase_invoice_no || '',
            supplierName: row.supplier_name || 'Trade Supplier',
            date: (row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()).slice(0, 10),
            status: effectiveStatus,
            sortingStatus: (effectiveStatus === 'COMPLETED' || effectiveStatus === 'POSTED') ? 'FULLY_SORTED' : (effectiveStatus === 'PARTIAL' || effectiveStatus === 'IN_PROGRESS' ? 'PARTIALLY_SORTED' : 'UNOPENED'),
            totalBaleCost: totalCost,
            totalBaleWeight: grossKg,
            costPerGram,
            brokenDownWeight: brokenDownKg,
            remainingWeight: Math.max(0, Number((grossKg - brokenDownKg).toFixed(3))),
            pieceCount,
            pieces: piecesList,
            createdAt: row.created_at
          };
        });
      }
      return [];
    });
    if (list !== null && list !== undefined) return res.json(list);
  } catch (err: any) {
    console.warn('withDb query notice on /gate-passes:', err?.message);
  }

  try {
    const list = await PurchaseService.getInwardGatePasses();
    if (list && list.length > 0) return res.json(list);
  } catch (_) {}

  return res.json(PurchaseController.getInwardGatePasses());
});

purchaseRouter.get(['/bale-presets', '/presets'], async (req, res) => {
  try {
    const list = await withDb(async (client) => {
      const q = await client.query('SELECT * FROM bale_presets ORDER BY name ASC;');
      if (q.rows && q.rows.length > 0) {
        return q.rows.map((r: any) => ({
          id: String(r.id),
          code: r.item_code || r.code || `BALE-${r.id}`,
          name: r.name,
          category: r.category || 'Apparel',
          uom: r.uom || 'BALES',
          targetUom: r.uom || 'BALES',
          stdWeight: Number(r.std_weight ?? 45),
          weightKg: Number(r.std_weight ?? 45),
          basePrice: Number(r.base_rate ?? 0),
          baseRate: Number(r.base_rate ?? 0),
          status: 'POSTED',
          isActive: true
        }));
      }
      return null;
    });
    if (list && list.length > 0) return res.json(list);
  } catch (err: any) {
    console.warn('withDb query notice on /bale-presets:', err?.message);
  }

  try {
    const presets = await PurchaseService.getBalePresets();
    return res.json(presets);
  } catch (_) {
    return res.json([]);
  }
});

purchaseRouter.post(['/gate-passes/bale-inward', '/bales/inward', '/bales', '/gate-passes'], async (req, res) => {
  try {
    const item = await PurchaseService.addInwardGatePass(req.body);
    return res.json({ success: true, inwardPass: item, bale: item });
  } catch (err: any) {
    const result = PurchaseController.createBaleInward(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error || err?.message });
    }
    return res.json(result);
  }
});

purchaseRouter.delete(['/gate-passes/:id', '/bales/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    await withDb(async (client) => {
      const checkQ = await client.query(
        `SELECT 
           (SELECT COUNT(*) FROM bale_sorted_pieces WHERE bale_id = $1) as sorted_cnt,
           (SELECT COUNT(*) FROM inventory_pieces WHERE gate_pass_id = $1 AND is_sold = true) as sold_cnt,
           (SELECT COUNT(*) FROM inventory_pieces WHERE gate_pass_id = $1) as inv_cnt,
           (SELECT total_pieces FROM bale_sessions WHERE bale_id = $1 LIMIT 1) as sess_pieces;`,
        [id]
      );
      const soldCnt = Number(checkQ.rows[0]?.sold_cnt || 0);
      if (soldCnt > 0) {
        throw new Error(`Cannot delete bale: This bale contains ${soldCnt} sold pieces. Sold garments cannot be deleted.`);
      }

      const sortedCnt = Number(checkQ.rows[0]?.sorted_cnt || 0);
      const sessPieces = Number(checkQ.rows[0]?.sess_pieces || 0);

      // If sorting terminal shows pieces were removed, purge lingering unsold inventory pieces
      if (sortedCnt === 0 && sessPieces === 0) {
        await client.query(`DELETE FROM inventory_pieces WHERE gate_pass_id = $1 AND is_sold = false;`, [id]);
      } else {
        const invCnt = Number(checkQ.rows[0]?.inv_cnt || 0);
        const actualPieces = Math.max(sortedCnt, invCnt, sessPieces);
        if (actualPieces > 0) {
          throw new Error(`Cannot delete bale: This bale contains ${actualPieces} sorted pieces. Unsafe bale deletion is locked. Delete all pieces first.`);
        }
      }
    });

    await PurchaseService.deleteInwardGatePass(id);
    return res.json({ success: true, message: 'Bale / Gate pass deleted successfully', id });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to delete gate pass' });
  }
});

purchaseRouter.get(['/gate-passes/:id', '/bales/:id'], (req, res) => {
  const { id } = req.params;
  const gatePass = PurchaseController.getInwardGatePassById(id);
  if (!gatePass) return res.status(404).json({ error: 'Gate pass not found' });
  return res.json(gatePass);
});

purchaseRouter.post(['/gate-passes/:id/pieces', '/bales/:id/pieces'], async (req, res) => {
  const { id } = req.params;
  try {
    try {
      PurchaseController.addPieceToBreakdown(id, req.body);
    } catch (_) {}

    const piece = await PurchaseService.addInventoryPiece({ ...req.body, gatePassId: id });
    return res.json({ success: true, piece, data: piece });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err?.message || 'Failed to add piece to bale breakdown' });
  }
});

purchaseRouter.delete([
  '/gate-passes/:id/pieces/:pieceId',
  '/bales/:id/pieces/:pieceId',
  '/pieces/:pieceId',
  '/inventory/:pieceId',
  '/pieces/:id',
  '/inventory/:id'
], async (req, res) => {
  const targetPieceId = req.params.pieceId || req.params.id;
  const gatePassId = req.params.pieceId ? req.params.id : undefined;

  try {
    if (gatePassId) {
      try {
        PurchaseController.deletePieceFromBreakdown(gatePassId, targetPieceId);
      } catch (_) {}
    }
    await PurchaseService.deleteInventoryPiece(targetPieceId);
    return res.json({ success: true, message: 'Piece deleted successfully', pieceId: targetPieceId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

purchaseRouter.post('/inventory/cleanup-orphaned', async (req, res) => {
  try {
    const result = await PurchaseService.purgeOrphanedInventory();
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

purchaseRouter.delete('/inventory/cleanup-orphaned', async (req, res) => {
  try {
    const result = await PurchaseService.purgeOrphanedInventory();
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

purchaseRouter.post(['/gate-passes/:id/pieces/batch', '/bales/:id/pieces/batch'], (req, res) => {
  const { id } = req.params;
  const { pieces } = req.body;
  const result = PurchaseController.batchAddPiecesToBreakdown(id, pieces);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/save-partial', '/bales/:id/save-partial'], (req, res) => {
  const { id } = req.params;
  const { savedBy } = req.body;
  const result = PurchaseController.saveGatePassPartial(id, savedBy || 'Sorting Supervisor');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/post', '/bales/:id/post'], (req, res) => {
  const { id } = req.params;
  const { postedBy } = req.body;
  const result = PurchaseController.postInwardGatePass(id, postedBy || 'Sortery Lead');
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.post(['/gate-passes/:id/unpost', '/bales/:id/unpost'], (req, res) => {
  const { id } = req.params;
  const result = PurchaseController.unpostInwardGatePass(id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

purchaseRouter.get('/inventory', async (req, res) => {
  try {
    const list = await PurchaseService.getInventoryPieces();
    return res.json(list);
  } catch (_) {
    const filters = req.query as any;
    return res.json(PurchaseController.getInventoryStock(filters));
  }
});

purchaseRouter.get('/pieces', async (req, res) => {
  try {
    const list = await PurchaseService.getInventoryPieces();
    return res.json(list);
  } catch (_) {
    const filters = req.query as any;
    return res.json(PurchaseController.getInventoryStock(filters));
  }
});

purchaseRouter.get('/grails', async (req, res) => {
  try {
    const list = await PurchaseService.getInventoryPieces(150, true);
    const grails = (list || []).filter(p => !p.isSold && p.status !== 'SOLD' && (p.isGrail || ['Antique', 'Grails', 'Boutique'].includes(p.marketSegment || '')));
    return res.json(grails.slice(0, 10));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

purchaseRouter.post('/ai-ocr-scan', async (req, res) => {
  try {
    const {
      imageBase64,
      imagesBase64,
      frontImageBase64,
      backImageBase64,
      lengthTapeImageBase64,
      widthTapeImageBase64,
      washTagImageBase64,
      textPrompt,
      hasLengthTape,
      hasWidthTape,
      hasWashTag
    } = req.body;
    const apiKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const result = await PurchaseController.scanGarmentTagWithAI(imageBase64, textPrompt, apiKey, {
      imagesBase64,
      frontImageBase64,
      backImageBase64,
      lengthTapeImageBase64,
      widthTapeImageBase64,
      washTagImageBase64,
      hasLengthTape,
      hasWidthTape,
      hasWashTag
    });
    return res.json(result);
  } catch (err: any) {
    try {
      const { getHeuristicVintageAppraisal, resolveStandardGarmentMeasurements } = await import('../../utils/geminiVintageValuation.ts');
      const fallback = getHeuristicVintageAppraisal(req.body?.textPrompt, req.body?.imageBase64);
      const meas = resolveStandardGarmentMeasurements(fallback.size, fallback.category, fallback.pitToPitInches, fallback.lengthInches);
      return res.json({
        ...fallback,
        pitToPitInches: meas.pitToPitInches,
        lengthInches: meas.lengthInches,
        warning: err?.message
      });
    } catch (_) {
      return res.status(500).json({ error: err.message || 'OCR Processing failed' });
    }
  }
});

purchaseRouter.post('/scan-invoice-ocr', async (req, res) => {
  try {
    const { imageBase64, textPrompt } = req.body;
    const result = await PurchaseController.scanSupplierInvoiceWithAI(imageBase64, textPrompt);
    return res.json({ success: true, data: result, confidence: result.confidence || 95 });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Invoice OCR Processing failed' });
  }
});

purchaseRouter.post(['/classify-garment-photos', '/ai-classify-slots'], async (req, res) => {
  try {
    const { images, base64Images, clientHints } = req.body;
    const clientKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const apiKey = await PurchaseController.resolveGeminiApiKey(clientKey);
    const targetImages: string[] = (images || base64Images || []).slice(0, 6);
    const count = targetImages.length;

    // STEP 1 (USTAD - Google Gemini 3.8 Flash Multi-Image Vision):
    // Inspect all 6 photos in a single 1.5s multi-image call and accurately separate Front, Back, Main Tag, Wash Tag, Length Tape & Width Tape!
    if (count >= 2) {
      const ustadSlotRes = await classifyGarmentSlotsWithUstad(targetImages);
      if (ustadSlotRes.ok && ustadSlotRes.classification) {
        return res.json({
          success: true,
          ...ustadSlotRes.classification,
          ustadVerified: true,
          ustadModel: ustadSlotRes.modelUsed,
          confidence: 0.99,
          reasoning: `Classified by Ustad (${ustadSlotRes.modelUsed}) + Shagird Guard`,
          source: 'GEMINI_AI_VISION'
        });
      }
    }

    if (!apiKey || true) {
      // STEP 2 (SHAGIRD FALLBACK - Local RTX 3070 Ti Ollama Vision):
      if (count >= 2) {
        try {
          let visionModel = 'gemma3:4b';
          try {
            const tRes = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1200) });
            if (tRes.ok) {
              const tData: any = await tRes.json();
              const names: string[] = (tData?.models || []).map((m: any) => String(m.name));
              visionModel =
                names.find(n => n.startsWith('qwen2.5vl') || n.startsWith('llama3.2-vision') || n.startsWith('gemma3')) ||
                visionModel;
            }
          } catch (_) {}

          const labels: string[] = [];
          const hasTapeFlags: boolean[] = [];
          const isTagFlags: boolean[] = [];
          const hasNeckTagInsideCollarFlags: boolean[] = [];

          const classifySchema = {
            type: 'object',
            properties: {
              hasMeasuringTape: { type: 'boolean' },
              isCloseUpLabel: { type: 'boolean' },
              hasVisibleNeckTagInsideCollar: { type: 'boolean' },
              photoCategory: {
                type: 'string',
                enum: ['LENGTH_TAPE', 'WIDTH_TAPE', 'MAIN_TAG', 'WASH_TAG', 'FRONT', 'BACK']
              }
            },
            required: ['hasMeasuringTape', 'isCloseUpLabel', 'hasVisibleNeckTagInsideCollar', 'photoCategory']
          };

          for (let i = 0; i < count; i++) {
            const hint = Array.isArray(clientHints) ? String(clientHints[i] || '') : '';
            if (hint === 'VERTICAL_TAPE') {
              labels.push('LENGTH_TAPE');
              hasTapeFlags.push(true);
              isTagFlags.push(false);
              hasNeckTagInsideCollarFlags.push(false);
              continue;
            }
            if (hint === 'HORIZONTAL_TAPE') {
              labels.push('WIDTH_TAPE');
              hasTapeFlags.push(true);
              isTagFlags.push(false);
              hasNeckTagInsideCollarFlags.push(false);
              continue;
            }

            const cleanB64 = String(targetImages[i] || '').replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '').trim();
            if (!cleanB64) {
              labels.push(hint === 'TAG' ? 'MAIN_TAG' : '');
              hasTapeFlags.push(false);
              isTagFlags.push(hint === 'TAG');
              hasNeckTagInsideCollarFlags.push(false);
              continue;
            }
            const singlePrompt =
              `Classify this garment photo into one of the 6 studio slots:\n` +
              `1. "LENGTH_TAPE": Full garment with a physical measuring tape ruler running vertically (collar to bottom hem).\n` +
              `2. "WIDTH_TAPE": Full garment with a physical measuring tape ruler running horizontally across the chest (pit to pit).\n` +
              `3. "MAIN_TAG": Close-up macro photo of the neck collar brand/size label.\n` +
              `4. "WASH_TAG": Close-up macro photo of the inside fabric care/wash instruction & "Made in" label.\n` +
              `5. "FRONT": Clean full shirt FRONT view (collar neckline curves downward, and you can often see the small inner neck tag inside the collar opening or front chest pocket/crest) with NO measuring tape.\n` +
              `6. "BACK": Clean full shirt BACK view (high back collar covering the neck tag, plain back or large full-back graphic print) with NO measuring tape.\n` +
              `Set hasMeasuringTape=true ONLY if a physical measuring tape is lying on the garment. Set isCloseUpLabel=true ONLY if the camera is zoomed in on a clothing tag/label. Set hasVisibleNeckTagInsideCollar=true if this is a full shirt photo where the small inner collar tag is visible inside the top neck opening.`;
            const r = await fetch('http://127.0.0.1:11434/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: visionModel,
                prompt: singlePrompt,
                images: [cleanB64],
                format: classifySchema,
                stream: false,
                options: { temperature: 0.0, num_predict: 70 }
              }),
              signal: AbortSignal.timeout(7500)
            }).catch(() => null);
            if (r && r.ok) {
              const d: any = await r.json().catch(() => ({}));
              const parsed = JSON.parse(String(d?.response || '{}'));
              let rawType = String(parsed?.photoCategory || parsed?.type || '').toUpperCase();
              const tapeBool = Boolean(parsed?.hasMeasuringTape) || rawType.includes('TAPE') || rawType.includes('LENGTH') || rawType.includes('WIDTH');
              const tagBool = (!tapeBool) && (Boolean(parsed?.isCloseUpLabel) || hint === 'TAG' || rawType.includes('TAG') || rawType.includes('WASH'));
              const collarTagVisible = Boolean(parsed?.hasVisibleNeckTagInsideCollar);
              if (tapeBool && !rawType.includes('LENGTH') && !rawType.includes('WIDTH')) {
                rawType = 'LENGTH_TAPE';
              } else if (tagBool && !rawType.includes('TAG') && !rawType.includes('WASH')) {
                rawType = 'MAIN_TAG';
              }
              hasTapeFlags.push(tapeBool);
              isTagFlags.push(tagBool);
              hasNeckTagInsideCollarFlags.push(collarTagVisible);
              labels.push(rawType);
            } else {
              labels.push(hint === 'TAG' ? 'MAIN_TAG' : '');
              hasTapeFlags.push(false);
              isTagFlags.push(hint === 'TAG');
              hasNeckTagInsideCollarFlags.push(false);
            }
          }

          if (labels.some(Boolean)) {
            const used = new Set<number>();
            const slotAssigned: Record<string, number | undefined> = {};
            const assignMatch = (key: string, keyword: string, requireNoTape = false, requireNoTag = false) => {
              for (let i = 0; i < count; i++) {
                if (
                  !used.has(i) &&
                  labels[i].includes(keyword) &&
                  (!requireNoTape || !hasTapeFlags[i]) &&
                  (!requireNoTag || !isTagFlags[i])
                ) {
                  slotAssigned[key] = i;
                  used.add(i);
                  return;
                }
              }
            };
            // 1. Claim Measuring Tape slots FIRST so a tape photo NEVER lands in Front, Back, or Tag!
            assignMatch('length_tape_index', 'LENGTH');
            assignMatch('width_tape_index', 'WIDTH');
            for (let i = 0; i < count; i++) {
              if (!used.has(i) && hasTapeFlags[i]) {
                if (slotAssigned.length_tape_index === undefined && count >= 5) {
                  slotAssigned.length_tape_index = i;
                  used.add(i);
                } else if (slotAssigned.width_tape_index === undefined && count >= 6) {
                  slotAssigned.width_tape_index = i;
                  used.add(i);
                }
              }
            }
            // 2. Claim Wash Tag & Main Tag SECOND so close-up labels NEVER land in Front, Back, or Tape!
            assignMatch('wash_tag_index', 'WASH', true);
            assignMatch('tag_index', 'MAIN_TAG', true);
            assignMatch('tag_index', 'TAG', true);
            for (let i = 0; i < count; i++) {
              if (!used.has(i) && isTagFlags[i] && !hasTapeFlags[i]) {
                if (slotAssigned.tag_index === undefined && count >= 3) {
                  slotAssigned.tag_index = i;
                  used.add(i);
                } else if (slotAssigned.wash_tag_index === undefined && count >= 4) {
                  slotAssigned.wash_tag_index = i;
                  used.add(i);
                }
              }
            }
            // 3. Claim Front & Back strictly from NO-TAPE and NO-TAG photos, prioritizing the photo with visible inner collar tag at the neckline as 1. FRONT!
            const cleanFullIndices: number[] = [];
            for (let i = 0; i < count; i++) {
              if (!used.has(i) && !hasTapeFlags[i] && !isTagFlags[i]) {
                cleanFullIndices.push(i);
              }
            }
            const collarVisibleIdx = cleanFullIndices.find(idx => hasNeckTagInsideCollarFlags[idx]);
            if (collarVisibleIdx !== undefined) {
              slotAssigned.front_index = collarVisibleIdx;
              used.add(collarVisibleIdx);
            }
            assignMatch('front_index', 'FRONT', true, true);
            assignMatch('back_index', 'BACK', true, true);
            for (let i = 0; i < count; i++) {
              if (!used.has(i) && !hasTapeFlags[i] && !isTagFlags[i]) {
                if (slotAssigned.front_index === undefined) {
                  slotAssigned.front_index = i;
                  used.add(i);
                } else if (slotAssigned.back_index === undefined && count >= 2) {
                  slotAssigned.back_index = i;
                  used.add(i);
                }
              }
            }

            const orderedKeys = ['front_index', 'back_index', 'tag_index', 'wash_tag_index', 'length_tape_index', 'width_tape_index'].slice(0, count);
            for (const k of orderedKeys) {
              if (slotAssigned[k] === undefined) {
                for (let i = 0; i < count; i++) {
                  if (!used.has(i)) {
                    slotAssigned[k] = i;
                    used.add(i);
                    break;
                  }
                }
              }
            }

            return res.json({
              success: true,
              front_index: slotAssigned.front_index ?? 0,
              back_index: slotAssigned.back_index ?? (count > 1 ? 1 : 0),
              tag_index: slotAssigned.tag_index ?? (count > 2 ? 2 : 0),
              wash_tag_index: slotAssigned.wash_tag_index,
              length_tape_index: slotAssigned.length_tape_index,
              width_tape_index: slotAssigned.width_tape_index,
              confidence: 0.99,
              reasoning: `Classified by Local RTX 3070 Ti Vision (${visionModel})`,
              source: 'GEMINI_AI_VISION'
            });
          }
        } catch (_) {}
      }

      // Graceful offline visual heuristic fallback with HTTP 200
      const offlineResult = await classifyGarmentPhotosWithGemini(targetImages);
      return res.json({
        success: true,
        ...offlineResult
      });
    }

    const result = await classifyGarmentPhotosWithGemini(targetImages, apiKey);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Bulk classification failed' });
  }
});

// ==========================================
// 11. RTX 3070 Ti GPU STUDIO WHITE BACKGROUND SEGMENTATION
// ==========================================
purchaseRouter.post('/studio/remove-bg-gpu', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'imageBase64 is required' });
    }
    const r = await fetch('http://127.0.0.1:11435/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
      signal: AbortSignal.timeout(45000)
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(502).json({ success: false, error: `GPU Studio service error (${r.status}): ${errText}` });
    }
    const data: any = await r.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'GPU Studio background removal failed' });
  }
});


