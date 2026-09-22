import { supabase } from '../supabaseClient.ts';

export class SequenceService {
  // In-memory sequence tracker to guarantee monotonicity across rapid concurrent creations
  private static _lastAssignedSequences: Map<string, number> = new Map();

  /**
   * Generates next enterprise date-based sequential document number:
   * Format: [PREFIX]-[MM]-[YYYY]-[SEQUENCE] padded to 4 digits (e.g. PUR-09-2026-0001, SAL-09-2026-0001)
   */
  public static async getNextNumber(
    prefix: string,
    dateInput?: string | Date
  ): Promise<string> {
    const cleanPrefix = String(prefix || 'DOC').trim().toUpperCase();
    const dateObj = dateInput ? new Date(dateInput) : new Date();
    const safeDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

    const mm = String(safeDate.getMonth() + 1).padStart(2, '0');
    const yyyy = String(safeDate.getFullYear());
    const prefixWithDate = `${cleanPrefix}-${mm}-${yyyy}`;

    let maxSeq = 0;

    try {
      if (cleanPrefix === 'PUR') {
        const { data } = await supabase
          .from('purchase_invoices')
          .select('invoice_no')
          .like('invoice_no', `${prefixWithDate}-%`);

        if (Array.isArray(data)) {
          for (const row of data) {
            const seq = SequenceService.extractSequence(row.invoice_no, prefixWithDate);
            if (seq > maxSeq) maxSeq = seq;
          }
        }
      } else if (cleanPrefix === 'SAL') {
        const { data } = await supabase
          .from('sales_invoices')
          .select('invoice_no')
          .like('invoice_no', `${prefixWithDate}-%`);

        if (Array.isArray(data)) {
          for (const row of data) {
            const seq = SequenceService.extractSequence(row.invoice_no, prefixWithDate);
            if (seq > maxSeq) maxSeq = seq;
          }
        }
      } else if (cleanPrefix === 'IGP') {
        const { data } = await supabase
          .from('inward_gate_passes')
          .select('gate_pass_no, pass_no')
          .or(`gate_pass_no.like.${prefixWithDate}-%,pass_no.like.${prefixWithDate}-%`);

        if (Array.isArray(data)) {
          for (const row of data) {
            const seq1 = SequenceService.extractSequence(row.gate_pass_no, prefixWithDate);
            const seq2 = SequenceService.extractSequence(row.pass_no, prefixWithDate);
            if (seq1 > maxSeq) maxSeq = seq1;
            if (seq2 > maxSeq) maxSeq = seq2;
          }
        }
      } else {
        // Financial Vouchers (JV, CRV, BRV, CPV, BPV, etc.)
        const { data } = await supabase
          .from('financial_vouchers')
          .select('voucher_no')
          .like('voucher_no', `${prefixWithDate}-%`);

        if (Array.isArray(data)) {
          for (const row of data) {
            const seq = SequenceService.extractSequence(row.voucher_no, prefixWithDate);
            if (seq > maxSeq) maxSeq = seq;
          }
        }

        // Also check vouchers fallback table
        const { data: vData } = await supabase
          .from('vouchers')
          .select('voucher_no')
          .like('voucher_no', `${prefixWithDate}-%`);

        if (Array.isArray(vData)) {
          for (const row of vData) {
            const seq = SequenceService.extractSequence(row.voucher_no, prefixWithDate);
            if (seq > maxSeq) maxSeq = seq;
          }
        }
      }
    } catch (err) {
      console.warn(`[SequenceService] Error fetching max sequence for ${prefixWithDate}:`, err);
    }

    // Atomic in-memory monotonicity lock
    const currentCached = SequenceService._lastAssignedSequences.get(prefixWithDate) || 0;
    const nextSeq = Math.max(maxSeq, currentCached) + 1;
    SequenceService._lastAssignedSequences.set(prefixWithDate, nextSeq);

    const paddedSeq = String(nextSeq).padStart(4, '0');
    return `${prefixWithDate}-${paddedSeq}`;
  }

  /**
   * Helper to extract numeric sequence from document reference like 'PUR-09-2026-0005'
   */
  private static extractSequence(docRef: string | null | undefined, prefixPattern: string): number {
    if (!docRef || typeof docRef !== 'string') return 0;
    const clean = docRef.trim();
    if (!clean.startsWith(`${prefixPattern}-`)) return 0;

    const suffix = clean.slice(prefixPattern.length + 1);
    const match = suffix.match(/^(\d+)/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      return !isNaN(num) ? num : 0;
    }
    return 0;
  }
}
