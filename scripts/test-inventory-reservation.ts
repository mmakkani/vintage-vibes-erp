// Integration test for Global Inventory Reservation & 3-State Lifecycle
import { relationalStore } from '../src/db/relationalStore';
import type { PieceBreakdownItem } from '../src/types';

console.log('Testing Relational Store 3-State Inventory Reservation...');

// 1. Setup a test piece
const testBarcode = 'TEST-RESERV-' + Date.now();
const testPiece: PieceBreakdownItem = {
  id: 'pc-test-' + Date.now(),
  barcode: testBarcode,
  itemName: 'Vintage Test Silk Jacket',
  brandName: 'Test Brand',
  brandTier: 'Grail',
  labelGrade: 'CREAM',
  costPrice: 50,
  retailPriceAed: 150,
  status: 'IN_STOCK',
  isSold: false
};

// Add test piece to relational store
relationalStore.getInventoryPieces().push(testPiece);
console.log(`Added test piece: ${testBarcode} with status: ${testPiece.status}`);

// 2. Query available stock (should include test piece)
const availableBefore = relationalStore.queryInventoryStock({ soldStatus: 'IN_STOCK' });
const foundInStock = availableBefore.some(p => p.barcode === testBarcode);
console.log(`[PASS 1] Piece present in available stock: ${foundInStock}`);
if (!foundInStock) {
  console.error('FAILED: Piece not found in IN_STOCK query');
  process.exit(1);
}

// 3. Create a draft sales invoice using draftLiveClaimInvoice
const draftRes = relationalStore.draftLiveClaimInvoice({
  barcode: testBarcode,
  buyerHandle: '@testbuyer',
  boothId: 'booth-1',
  offeredPrice: 150
});

if (!draftRes.success || !draftRes.draftInvoice) {
  console.error('FAILED to create draft invoice:', draftRes.error);
  process.exit(1);
}

const pieceAfterDraft = relationalStore.getInventoryPieces().find(p => p.barcode === testBarcode);
console.log(`[PASS 2] Piece status after Draft Invoice: ${pieceAfterDraft?.status} (isSold: ${pieceAfterDraft?.isSold})`);
if (!pieceAfterDraft || pieceAfterDraft.status !== 'RESERVED' || pieceAfterDraft.isSold !== false) {
  console.error('FAILED: Piece did not transition to RESERVED / isSold=false');
  process.exit(1);
}

// 4. Verify piece is hidden from available stock
const availableDuringDraft = relationalStore.queryInventoryStock({ soldStatus: 'IN_STOCK' });
const foundDuringDraft = availableDuringDraft.some(p => p.barcode === testBarcode);
console.log(`[PASS 3] Piece hidden from IN_STOCK query while RESERVED: ${!foundDuringDraft}`);
if (foundDuringDraft) {
  console.error('FAILED: Piece still appears in IN_STOCK query while RESERVED');
  process.exit(1);
}

// 5. Post the sales invoice
const postResult = relationalStore.postSalesInvoice(draftRes.draftInvoice.id, 'Test Auditor');
if (!postResult.success) {
  console.error('FAILED to post invoice:', postResult.error);
  process.exit(1);
}
const pieceAfterPost = relationalStore.getInventoryPieces().find(p => p.barcode === testBarcode);
console.log(`[PASS 4] Piece status after POST: ${pieceAfterPost?.status} (isSold: ${pieceAfterPost?.isSold})`);
if (!pieceAfterPost || pieceAfterPost.status !== 'SOLD' || pieceAfterPost.isSold !== true) {
  console.error('FAILED: Piece did not transition to SOLD / isSold=true');
  process.exit(1);
}

// 6. Unpost the sales invoice
const unpostResult = relationalStore.unpostCustomB2BSaleInvoice(draftRes.draftInvoice.id);
if (!unpostResult.success) {
  console.error('FAILED to unpost invoice:', unpostResult.error);
  process.exit(1);
}
const pieceAfterUnpost = relationalStore.getInventoryPieces().find(p => p.barcode === testBarcode);
console.log(`[PASS 5] Piece status after UNPOST: ${pieceAfterUnpost?.status} (isSold: ${pieceAfterUnpost?.isSold})`);
if (!pieceAfterUnpost || pieceAfterUnpost.status !== 'IN_STOCK' || pieceAfterUnpost.isSold !== false) {
  console.error('FAILED: Piece did not restore to IN_STOCK / isSold=false');
  process.exit(1);
}

// 7. Verify piece is again in available stock
const availableAfterUnpost = relationalStore.queryInventoryStock({ soldStatus: 'IN_STOCK' });
const foundAfterUnpost = availableAfterUnpost.some(p => p.barcode === testBarcode);
console.log(`[PASS 6] Piece restored in IN_STOCK query: ${foundAfterUnpost}`);
if (!foundAfterUnpost) {
  console.error('FAILED: Piece not found in IN_STOCK query after unpost');
  process.exit(1);
}

console.log('\n>>> ALL 6 INVENTORY RESERVATION CHECKS PASSED PERFECTLY! <<<');
