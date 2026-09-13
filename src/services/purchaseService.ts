import { supabase } from '../supabaseClient.ts';
import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem } from '../modules/purchase/purchase.types.ts';
import { FinanceService } from './financeService.ts';
import { PartiesService } from './partiesService.ts';

export class PurchaseService {
  // --- Purchase Invoices ---
  public static async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    const [invResult, itemsResult] = await Promise.all([
      supabase
        .from('purchase_invoices')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_invoice_items')
        .select('*')
    ]);

    if (invResult.error) {
      console.error('Supabase error on purchase_invoices:', invResult.error);
      throw new Error(invResult.error.message || 'Database error occurred reading purchase invoices');
    }

    const itemsByInvoiceId = new Map<string, any[]>();
    (itemsResult.data || []).forEach((itemRow: any) => {
      const invId = String(itemRow.invoice_id);
      if (!itemsByInvoiceId.has(invId)) {
        itemsByInvoiceId.set(invId, []);
      }
      itemsByInvoiceId.get(invId)!.push({
        id: String(itemRow.id),
        itemId: itemRow.item_code || itemRow.id,
        itemCode: itemRow.item_code || 'VINT-01',
        itemName: itemRow.item_name || itemRow.description || 'Vintage Mix Bales',
        packagingUom: itemRow.packaging_uom || itemRow.packaging || 'BALES',
        packageCount: Number(itemRow.package_count ?? itemRow.quantity ?? 1),
        weightUom: 'KG',
        totalWeight: Number(itemRow.total_weight ?? itemRow.total_kg ?? 0),
        ratePerWeight: Number(itemRow.rate_per_weight ?? itemRow.rate ?? 0),
        lineTotal: Number(itemRow.line_total ?? 0)
      });
    });

    return (invResult.data || []).map((row: any) => {
      const rawDate = row.issue_date || row.invoice_date || row.created_at;
      let cleanDate = '';
      if (rawDate) {
        try {
          const d = new Date(rawDate);
          cleanDate = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
        } catch {
          cleanDate = String(rawDate).slice(0, 10);
        }
      }

      const totalWeightKg = Number(row.total_weight_kg ?? row.totalWeightKg ?? 0);
      const totalAmount = Number(row.total_amount ?? row.total_payable ?? row.totalAmount ?? 0);
      const loadedItems = itemsByInvoiceId.get(String(row.id)) || [];

      // If no items in database, provide a default breakdown item from invoice header
      const items = loadedItems.length > 0 ? loadedItems : [
        {
          id: `item-${row.id}-1`,
          itemId: 'VINT-BAL-01',
          itemCode: 'VINT-BAL-01',
          itemName: 'Vintage Mix Bales',
          packagingUom: 'BALES',
          packageCount: 1,
          weightUom: 'KG',
          totalWeight: totalWeightKg || 45,
          ratePerWeight: totalWeightKg > 0 ? Number((totalAmount / totalWeightKg).toFixed(2)) : 0,
          lineTotal: totalAmount
        }
      ];

      return {
        id: row.id,
        invoiceNo: row.invoice_no || row.invoiceNo,
        supplierId: row.supplier_id || row.supplierId,
        supplier_id: row.supplier_id || row.supplierId,
        supplierName: row.supplier_name || row.party_name || row.supplier || row.supplierName || '',
        supplier_name: row.supplier_name || row.party_name || row.supplier || row.supplierName || '',
        supplierTrn: row.supplier_trn || row.trn || '',
        date: cleanDate,
        invoiceDate: row.invoice_date || row.invoiceDate || cleanDate,
        issue_date: row.issue_date || row.invoice_date,
        currency: row.currency || 'AED',
        exchangeRate: Number(row.exchange_rate ?? row.exchangeRate ?? 1),
        subtotal: Number(row.subtotal || 0),
        subTotal: Number(row.subtotal || 0),
        taxAmount: Number(row.tax_amount ?? row.vat_amount ?? row.taxAmount ?? 0),
        vatAmount: Number(row.vat_amount ?? row.tax_amount ?? row.vatAmount ?? 0),
        totalAmount,
        totalWeightKg,
        status: row.status || 'RECEIVED',
        notes: row.notes || '',
        containerNo: row.container_no || row.containerNo || '',
        blAirwayBillNo: row.bl_no || row.bl_airway_bill_no || row.blAirwayBillNo || '',
        convertedToInward: Boolean(row.converted_to_inward || row.convertedToInward),
        items,
        totalBalesCount: items.reduce((acc: number, it: any) => acc + (Number(it.packageCount) || 1), 0),
        grossAmount: Number(row.gross_amount ?? row.subtotal ?? totalAmount),
        deductionAmount: Number(row.deduction_amount ?? row.discount_amount ?? 0),
        discountAmount: Number(row.discount_amount ?? row.deduction_amount ?? 0),
        netAmount: Number(row.net_amount ?? totalAmount),
        createdAt: row.created_at,
        created_at: row.created_at
      } as PurchaseInvoice;
    });
  }

  public static async unpostPurchaseInvoice(invoiceId: string): Promise<void> {
    const { error } = await supabase
      .from('purchase_invoices')
      .update({ status: 'DRAFT' })
      .eq('id', String(invoiceId));
    if (error) {
      console.error('Supabase error unposting purchase invoice:', error);
      throw new Error(error.message || 'Failed to unpost purchase invoice');
    }
  }

  public static async resolveSupplierCoaAccount(supplierId?: string | null, supplierName?: string, currency: string = 'AED'): Promise<{
    partyId: string;
    partyName: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    party: any;
  }> {
    let party: any = null;
    const cleanSuppId = (supplierId && String(supplierId).trim() !== '' && String(supplierId) !== 'undefined' && String(supplierId) !== 'null') ? String(supplierId).trim() : null;

    if (cleanSuppId) {
      const { data } = await supabase.from('parties').select('*').eq('id', cleanSuppId).maybeSingle();
      if (data) party = data;
    }

    if (!party && supplierName && supplierName.trim()) {
      const { data } = await supabase.from('parties').select('*').ilike('name', supplierName.trim()).maybeSingle();
      if (data) party = data;
    }

    // Auto-create supplier party if not found
    if (!party) {
      const pId = cleanSuppId || `pty-${Date.now()}`;
      const pCode = `P-${Date.now().toString().slice(-4)}`;
      const cleanCode = pCode.replace(/[^A-Za-z0-9]/g, '');
      const coaId = `acc-${pId}`;
      const coaCode = `2110-${cleanCode}`;
      const name = supplierName?.trim() || 'Trade Supplier';

      try {
        const { data: newP, error: pErr } = await supabase.from('parties').insert([{
          id: pId,
          code: pCode,
          name,
          type: 'SUPPLIER',
          currency: currency || 'AED',
          current_balance: 0,
          is_active: true,
          coa_account_id: coaId,
          account_map: {
            payableAccountId: coaCode,
            clearingAccountId: '1150-00'
          }
        }]).select().single();

        if (!pErr && newP) {
          party = newP;
        }
      } catch (err) {
        console.warn('Auto-create party notice:', err);
      }
    }

    const finalPartyId = party?.id || cleanSuppId || `pty-${Date.now()}`;
    const finalPartyName = party?.name || supplierName?.trim() || 'Trade Supplier';
    const partyCode = party?.code || `P-${finalPartyId.replace(/[^A-Za-z0-9]/g, '').slice(-4)}`;
    const cleanCode = partyCode.replace(/[^A-Za-z0-9]/g, '');
    const accountId = party?.coa_account_id || `acc-${finalPartyId}`;
    const accountCode = (party?.account_map?.payableAccountId && party.account_map.payableAccountId.startsWith('2110-') && party.account_map.payableAccountId !== '2110-00')
      ? party.account_map.payableAccountId
      : `2110-${cleanCode}`;
    const accountName = `${finalPartyName} (Supplier)`;

    // Ensure COA sub-account exists in coa_accounts
    try {
      await supabase.from('coa_accounts').upsert({
        id: accountId,
        code: accountCode,
        name: accountName,
        type: 'LIABILITY',
        sub_type: 'Accounts Payable - Trade',
        currency: party?.currency || currency || 'AED',
        current_balance: Number(party?.current_balance || 0),
        is_active: true,
        parent_id: 'acc-2110',
        parent_code: '2110-00',
        party_id: finalPartyId,
        tier_level: 3
      }, { onConflict: 'id' });
    } catch (coaUpsertErr) {
      console.warn('COA upsert notice:', coaUpsertErr);
    }

    return {
      partyId: finalPartyId,
      partyName: finalPartyName,
      accountId,
      accountCode,
      accountName,
      party
    };
  }

  public static async postPurchaseInvoice(invoiceId: string): Promise<void> {
    const { data: invRows, error: invError } = await supabase
      .from('purchase_invoices')
      .select('*')
      .eq('id', invoiceId)
      .limit(1);

    if (invError || !invRows || invRows.length === 0) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    const invoice = invRows[0];
    const currency = (invoice.currency || 'AED').toUpperCase();
    const exchangeRate = Number(invoice.exchange_rate) || (currency === 'USD' ? 3.6725 : 1);
    const invoiceTotalAmount = Number(invoice.total_amount || 0);
    const invoiceTotalAed = currency === 'AED' ? invoiceTotalAmount : Number((invoiceTotalAmount * exchangeRate).toFixed(2));
    const invoiceNo = invoice.invoice_no || `PUR-${Date.now().toString().slice(-6)}`;
    const supplierName = invoice.supplier_name || invoice.party_name || 'Trade Supplier';

    // 1. Mark status as POSTED
    await supabase
      .from('purchase_invoices')
      .update({ status: 'POSTED' })
      .eq('id', invoiceId);

    // 2. Check if voucher already created for this invoice
    const { data: existingVouchers } = await supabase
      .from('financial_vouchers')
      .select('id, voucher_no')
      .or(`reference.eq.PINV-${invoiceNo},reference.eq.INWARD-${invoiceNo},reference.eq.PUR-${invoiceNo}`)
      .limit(1);

    if (!existingVouchers || existingVouchers.length === 0) {
      const supplierCoa = await PurchaseService.resolveSupplierCoaAccount(
        invoice.supplier_id,
        supplierName,
        invoice.currency
      );

      // Post Journal Voucher: Dr 1140-00 (Warehouse Raw Bales Inventory) / Cr Supplier Liability Account
      await FinanceService.addVoucher({
        voucherNo: `JV-PUR-${invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
        date: invoice.invoice_date || invoice.issue_date || new Date().toISOString().slice(0, 10),
        type: 'JOURNAL',
        reference: `PINV-${invoiceNo}`,
        narration: `Commercial Purchase Invoice Posted: ${invoiceNo} (${supplierName}) - Gross: ${invoice.total_weight_kg || 0} KG`,
        totalDebit: invoiceTotalAed,
        totalCredit: invoiceTotalAed,
        status: 'POSTED',
        createdBy: 'System (Commercial Invoice)',
        lines: [
          {
            accountCode: '1140-00',
            accountName: 'Inventory - Raw Bales Warehouse Stock',
            debitAmount: invoiceTotalAed,
            creditAmount: 0,
            memo: `Commercial Purchase Invoice: ${invoiceNo}`
          },
          {
            accountId: supplierCoa.accountId,
            accountCode: supplierCoa.accountCode,
            accountName: supplierCoa.accountName,
            partyId: supplierCoa.partyId,
            partyName: supplierCoa.partyName,
            debitAmount: 0,
            creditAmount: invoiceTotalAed,
            memo: `Supplier Payable: ${supplierName} for ${invoiceNo}`
          }
        ]
      });

      // Update COA balances: 1140-00
      const { data: accInv } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1140-00').single();
      if (accInv) {
        const newBal = Number(accInv.current_balance || 0) + invoiceTotalAed;
        await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1140-00');
      }

      // Update COA balances: Parent AP 2110-00
      const { data: accParentAp } = await supabase.from('coa_accounts').select('current_balance').eq('code', '2110-00').single();
      if (accParentAp) {
        const newBal = Number(accParentAp.current_balance || 0) + invoiceTotalAed;
        await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '2110-00');
      }

      // Update COA balances: Supplier specific account
      const { data: accSupp } = await supabase.from('coa_accounts').select('current_balance').eq('id', supplierCoa.accountId).single();
      const prevSuppBal = Number(accSupp?.current_balance ?? supplierCoa.party?.current_balance ?? 0);
      const newSuppBal = prevSuppBal + invoiceTotalAed;
      await supabase.from('coa_accounts').update({ current_balance: newSuppBal }).eq('id', supplierCoa.accountId);

      // Update supplier balance in parties table
      if (supplierCoa.partyId) {
        const { data: ptyRow } = await supabase.from('parties').select('current_balance').eq('id', supplierCoa.partyId).maybeSingle();
        const currentPartyBal = Number(ptyRow?.current_balance ?? 0);
        const updatedPartyBal = currentPartyBal + invoiceTotalAed;

        await supabase.from('parties').update({
          current_balance: updatedPartyBal,
          coa_account_id: supplierCoa.accountId
        }).eq('id', supplierCoa.partyId);

        // Add entry in party_khata_logs
        await PartiesService.addKhataLog({
          partyId: supplierCoa.partyId,
          date: invoice.invoice_date || invoice.issue_date || new Date().toISOString().slice(0, 10),
          reference: invoiceNo,
          debit: 0,
          credit: invoiceTotalAed,
          runningBalance: updatedPartyBal,
          notes: `Purchase Commercial Invoice: ${invoiceNo}`
        });
      }
    }
  }

  public static async addPurchaseInvoice(inv: Partial<PurchaseInvoice>): Promise<PurchaseInvoice> {
    const id = inv.id || `pi-${Date.now()}`;
    const rawSupplierId = inv.supplierId || (inv as any).supplier_id;
    const cleanSupplierId = (rawSupplierId && String(rawSupplierId).trim() !== '' && String(rawSupplierId) !== 'undefined' && String(rawSupplierId) !== 'null') ? String(rawSupplierId) : null;
    const payload = {
      id,
      invoice_no: inv.invoiceNo || `PINV-${Date.now().toString().slice(-6)}`,
      supplier_id: cleanSupplierId,
      supplier_name: inv.supplierName || (inv as any).supplier_name || '',
      party_name: inv.supplierName || (inv as any).supplier_name || '',
      invoice_date: inv.invoiceDate || inv.date || new Date().toISOString().slice(0, 10),
      currency: inv.currency || 'AED',
      exchange_rate: Number(inv.exchangeRate || 1),
      subtotal: Number(inv.subtotal || (inv as any).subTotal || 0),
      gross_amount: Number(inv.grossAmount || (inv as any).subtotal || (inv as any).subTotal || inv.totalAmount || 0),
      deduction_amount: Number(inv.deductionAmount || inv.discountAmount || 0),
      discount_amount: Number(inv.discountAmount || inv.deductionAmount || 0),
      net_amount: Number(inv.netAmount || inv.totalAmount || 0),
      tax_amount: Number(inv.taxAmount || inv.vatAmount || 0),
      total_amount: Number(inv.totalAmount || 0),
      total_weight_kg: Number(inv.totalWeightKg || (inv as any).totalGrossWeightKg || 0),
      container_no: inv.containerNo || '',
      bl_no: inv.blAirwayBillNo || '',
      status: inv.status || 'RECEIVED',
      notes: inv.notes || ''
    };

    const { data, error } = await supabase
      .from('purchase_invoices')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on purchase_invoices:', error);
      throw new Error(error.message || 'Failed to create purchase invoice');
    }

    return {
      id: data.id,
      invoiceNo: data.invoice_no,
      supplierId: data.supplier_id,
      supplierName: data.supplier_name || inv.supplierName || '',
      date: data.invoice_date,
      invoiceDate: data.invoice_date,
      currency: data.currency,
      exchangeRate: Number(data.exchange_rate),
      subtotal: Number(data.subtotal),
      subTotal: Number(data.subtotal),
      grossAmount: Number(data.gross_amount ?? data.subtotal ?? data.total_amount),
      deductionAmount: Number(data.deduction_amount ?? data.discount_amount ?? 0),
      discountAmount: Number(data.discount_amount ?? data.deduction_amount ?? 0),
      netAmount: Number(data.net_amount ?? data.total_amount),
      taxAmount: Number(data.tax_amount),
      vatAmount: Number(data.tax_amount),
      totalAmount: Number(data.total_amount),
      totalWeightKg: Number(data.total_weight_kg),
      status: data.status,
      notes: data.notes,
      convertedToInward: false
    } as PurchaseInvoice;
  }

  public static async deletePurchaseInvoice(invoiceId: string): Promise<void> {
    // 0. Fetch invoice first to get invoice_no and supplier info
    const { data: invRow } = await supabase
      .from('purchase_invoices')
      .select('id, invoice_no, supplier_id, supplier_name')
      .eq('id', String(invoiceId))
      .maybeSingle();

    const invoiceNo = invRow?.invoice_no;

    // 1. Delete associated manifest line items
    const { error: itemsError } = await supabase
      .from('purchase_invoice_items')
      .delete()
      .eq('invoice_id', String(invoiceId));
    if (itemsError) console.warn("Items delete warning:", itemsError);

    // 2. Delete associated unopened inward gate pass bales
    await supabase
      .from('inward_gate_passes')
      .delete()
      .or(`purchase_invoice_id.eq.${String(invoiceId)}${invoiceNo ? `,purchase_invoice_no.eq.${invoiceNo}` : ''}`);

    // 3. Delete any auto-generated vouchers and general ledger entries tied to this invoice
    if (invoiceNo) {
      try {
        // Find matching vouchers in financial_vouchers
        const { data: matchedVouchers } = await supabase
          .from('financial_vouchers')
          .select('id, voucher_no')
          .or(`reference.eq.PINV-${invoiceNo},reference.eq.INWARD-${invoiceNo},reference.eq.PUR-${invoiceNo},reference.eq.${invoiceNo},narration.ilike.%${invoiceNo}%`);

        if (matchedVouchers && matchedVouchers.length > 0) {
          for (const mv of matchedVouchers) {
            await supabase.from('voucher_entries').delete().or(`voucher_id.eq.${mv.id},voucher_no.eq.${mv.voucher_no}`);
            await supabase.from('financial_voucher_lines').delete().or(`voucher_id.eq.${mv.id},voucher_no.eq.${mv.voucher_no}`);
            await supabase.from('general_ledger').delete().or(`voucher_id.eq.${mv.id},voucher_no.eq.${mv.voucher_no}`);
            await supabase.from('ledgers').delete().or(`voucher_id.eq.${mv.id},voucher_no.eq.${mv.voucher_no}`);
            await supabase.from('financial_vouchers').delete().eq('id', mv.id);
            await supabase.from('vouchers').delete().eq('id', mv.id);
          }
        }
      } catch (vErr) {
        console.warn('Warning deleting auto vouchers for invoice:', vErr);
      }

      // Delete party_khata_logs for this invoice
      try {
        await supabase
          .from('party_khata_logs')
          .delete()
          .or(`reference.eq.${invoiceNo},notes.ilike.%${invoiceNo}%`);
      } catch (kErr) {
        console.warn('Warning deleting party khata logs for invoice:', kErr);
      }
    }

    // 4. Delete the invoice record
    const { error: invoiceError } = await supabase
      .from('purchase_invoices')
      .delete()
      .eq('id', String(invoiceId));
    if (invoiceError) {
      console.error("Failed to delete invoice:", invoiceError);
      throw new Error(invoiceError.message || 'Failed to delete invoice');
    }

    // 5. Refresh COA and Party Live Balances in SQL
    try {
      FinanceService.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}
  }

  // --- Inward Gate Passes (Bales / Consignments) ---
  public static async getInwardGatePasses(): Promise<InwardGatePass[]> {
    let data: any[] | null = null;
    try {
      const res = await supabase
        .from('inward_gate_passes')
        .select('*')
        .order('created_at', { ascending: false });
      if (!res.error && res.data && res.data.length > 0) {
        data = res.data;
      }
    } catch (_) {}

    // If Supabase REST did not return bales (e.g. invalid anon key or offline), query server endpoint
    if (!data || data.length === 0) {
      try {
        const apiRes = await fetch('/api/purchase/gate-passes');
        if (apiRes.ok) {
          const apiList = await apiRes.json();
          if (Array.isArray(apiList) && apiList.length > 0) {
            return apiList;
          }
        }
      } catch (_) {}

      // Check localStorage cache
      try {
        const cached = localStorage.getItem('vintage_bales_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_) {}

      return [];
    }

    return (data || []).map((row: any) => {
      const grossKg = Number(row.total_bale_weight ?? row.weight_kg ?? 0);
      const brokenDownKg = Number(row.broken_down_weight ?? 0);
      const totalCost = Number(row.total_bale_cost ?? row.cost_price ?? 0);
      const costPerGram = Number(row.cost_per_gram ?? (grossKg > 0 ? (totalCost / (grossKg * 1000)) : 0));
      const piecesList = Array.isArray(row.pieces) ? row.pieces : [];
      const pieceCount = Number(row.piece_count ?? row.pieces_count ?? piecesList.length ?? 0);

      return {
        id: String(row.id),
        passNo: row.gate_pass_no || row.pass_no || `IGP-${String(row.id).slice(-6)}`,
        gatePassNo: row.gate_pass_no || row.pass_no || `IGP-${String(row.id).slice(-6)}`,
        baleCode: row.bale_code || row.bale_tag_no || `BAL-${String(row.id).slice(-6)}`,
        baleCategory: row.bale_category || 'Vintage Mixed Bales',
        purchaseInvoiceId: row.purchase_invoice_id || row.purchaseInvoiceId || '',
        purchaseInvoiceNo: row.purchase_invoice_no || row.purchaseInvoiceNo || '',
        supplierName: row.supplier_name || row.supplierName || 'Trade Supplier',
        date: (row.created_at || new Date().toISOString()).slice(0, 10),
        status: (row.status || 'UNOPENED') as any,
        sortingStatus: (row.status || 'UNOPENED') as any,
        totalBaleCost: totalCost,
        totalBaleWeight: grossKg,
        costPerGram,
        brokenDownWeight: brokenDownKg,
        remainingWeight: Math.max(0, grossKg - brokenDownKg),
        pieceCount,
        pieces: piecesList,
        createdAt: row.created_at
      } as InwardGatePass;
    });
  }

  public static async getGatePasses(): Promise<InwardGatePass[]> {
    return this.getInwardGatePasses();
  }

  public static async convertToInwardGatePass(invoiceId: string): Promise<InwardGatePass[]> {
    // 1. Fetch invoice and its line items
    const { data: invRows, error: invError } = await supabase
      .from('purchase_invoices')
      .select('*')
      .eq('id', invoiceId)
      .limit(1);

    if (invError || !invRows || invRows.length === 0) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    const invoice = invRows[0];
    const { data: itemRows } = await supabase
      .from('purchase_invoice_items')
      .select('*')
      .eq('invoice_id', invoiceId);

    const currency = (invoice.currency || 'AED').toUpperCase();
    const exchangeRate = Number(invoice.exchange_rate) || (currency === 'USD' ? 3.6725 : 1);
    const invoiceTotalAmount = Number(invoice.total_amount || 0);
    const invoiceTotalAed = currency === 'AED' ? invoiceTotalAmount : Number((invoiceTotalAmount * exchangeRate).toFixed(2));
    const invoiceNo = invoice.invoice_no || `PUR-${Date.now().toString().slice(-6)}`;
    const supplierName = invoice.supplier_name || invoice.party_name || 'Trade Supplier';

    // 2. Prepare manifest line items
    let lines = (itemRows && itemRows.length > 0) ? itemRows : [];
    if (lines.length === 0) {
      const weight = Number(invoice.total_weight_kg) || 25;
      const subtotal = Number(invoice.subtotal) || invoiceTotalAmount;
      const rate = weight > 0 ? Number((subtotal / weight).toFixed(2)) : 0;
      lines = [{
        item_name: 'Vintage Mix Bales',
        packaging_uom: 'BALES',
        package_count: 1,
        total_weight: weight,
        rate_per_weight: rate,
        line_total: subtotal
      }];
    }

    // 3. Generate inward gate pass records
    const createdPasses: InwardGatePass[] = [];
    let baleSeq = 1;

    for (const item of lines) {
      const packageCount = Math.max(1, Number(item.package_count || item.quantity || 1));
      const totalWeightKg = Number(item.total_weight || item.total_kg || 0) || (packageCount * 45);
      const lineTotal = Number(item.line_total || 0) || (totalWeightKg * Number(item.rate_per_weight || item.rate || 0));
      const lineTotalAed = currency === 'AED' ? lineTotal : Number((lineTotal * exchangeRate).toFixed(2));

      const weightPerBale = Number((totalWeightKg / packageCount).toFixed(2));
      const costPerBale = Number((lineTotalAed / packageCount).toFixed(2));
      const costPerGram = weightPerBale > 0 ? Number((costPerBale / (weightPerBale * 1000)).toFixed(6)) : 0;

      for (let p = 0; p < packageCount; p++) {
        const passSeqStr = String(baleSeq).padStart(2, '0');
        const baleSeqStr = String(baleSeq).padStart(3, '0');
        const passNo = `IGP-${invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-${passSeqStr}`;
        const baleCode = `BAL-${invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-${baleSeqStr}`;
        const baleId = `igp-${Date.now()}-${baleSeq}-${Math.random().toString(36).slice(2, 6)}`;

        const gatePassPayload = {
          id: baleId,
          pass_no: passNo,
          gate_pass_no: passNo,
          bale_code: baleCode,
          bale_tag_no: baleCode,
          purchase_invoice_id: invoice.id,
          purchase_invoice_no: invoiceNo,
          supplier_name: supplierName,
          bale_category: item.item_name || 'Vintage Mixed Bales',
          weight_kg: weightPerBale,
          total_bale_weight: weightPerBale,
          total_bale_cost: costPerBale,
          cost_per_gram: costPerGram,
          broken_down_weight: 0,
          piece_count: 0,
          status: 'UNOPENED',
          created_at: new Date().toISOString()
        };

        const { error: igpErr } = await supabase
          .from('inward_gate_passes')
          .insert([gatePassPayload]);

        if (igpErr) {
          console.error('Error inserting inward_gate_passes:', igpErr);
        }

        // Initialize session in bale_sessions
        try {
          await supabase.from('bale_sessions').insert([{
            bale_id: baleId,
            status: 'UNOPENED',
            total_weight_grams: Math.round(weightPerBale * 1000),
            remaining_grams: Math.round(weightPerBale * 1000),
            sorted_grams: 0,
            pieces_count: 0
          }]);
        } catch (sessErr) {
          console.warn('bale_sessions notice:', sessErr);
        }

        createdPasses.push({
          id: baleId,
          gatePassNo: passNo,
          baleCode: baleCode,
          baleCategory: item.item_name || 'Vintage Mixed Bales',
          purchaseInvoiceId: invoice.id,
          purchaseInvoiceNo: invoiceNo,
          supplierName: supplierName,
          date: new Date().toISOString().slice(0, 10),
          status: 'UNOPENED',
          totalBaleCost: costPerBale,
          totalBaleWeight: weightPerBale,
          costPerGram: costPerGram,
          brokenDownWeight: 0,
          remainingWeight: weightPerBale,
          pieceCount: 0,
          pieces: [],
          createdAt: new Date().toISOString()
        } as InwardGatePass);

        baleSeq++;
      }
    }

    // 4. POST TO COA (WIP INVENTORY & SUPPLIER AP)
    try {
      const supplierCoa = await PurchaseService.resolveSupplierCoaAccount(
        invoice.supplier_id,
        supplierName,
        invoice.currency
      );

      // Check if voucher already created for this invoice (e.g. if already posted earlier)
      const { data: existingVouchers } = await supabase
        .from('financial_vouchers')
        .select('id, voucher_no')
        .or(`reference.eq.INWARD-${invoiceNo},reference.eq.PINV-${invoiceNo},reference.eq.PUR-${invoiceNo}`)
        .limit(1);

      if (!existingVouchers || existingVouchers.length === 0) {
        // Post full Journal Entry: Dr 1150-00 (Sorting WIP Inventory) / Cr Supplier Liability Account
        await FinanceService.addVoucher({
          voucherNo: `JV-INW-${invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 10),
          type: 'JOURNAL',
          reference: `INWARD-${invoiceNo}`,
          narration: `Inward Consignment Bales Transferred to WIP Inventory: ${invoiceNo} (${supplierName}) - Gross: ${invoice.total_weight_kg || 0} KG`,
          totalDebit: invoiceTotalAed,
          totalCredit: invoiceTotalAed,
          status: 'POSTED',
          createdBy: 'System (Purchase Inward)',
          lines: [
            {
              accountCode: '1150-00',
              accountName: 'Inventory - Sorting Work-in-Progress (WIP Bales Under Grading)',
              debitAmount: invoiceTotalAed,
              creditAmount: 0,
              memo: `WIP Raw Bales Inward: ${invoiceNo} (${createdPasses.length} bales)`
            },
            {
              accountId: supplierCoa.accountId,
              accountCode: supplierCoa.accountCode,
              accountName: supplierCoa.accountName,
              partyId: supplierCoa.partyId,
              partyName: supplierCoa.partyName,
              debitAmount: 0,
              creditAmount: invoiceTotalAed,
              memo: `Supplier Payable: ${supplierName} for ${invoiceNo}`
            }
          ]
        });

        // Update COA balances: 1150-00 (WIP Inventory)
        const { data: accWip } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1150-00').single();
        if (accWip) {
          const newBal = Number(accWip.current_balance || 0) + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1150-00');
        }

        // Update COA balances: Parent AP 2110-00
        const { data: accParentAp } = await supabase.from('coa_accounts').select('current_balance').eq('code', '2110-00').single();
        if (accParentAp) {
          const newBal = Number(accParentAp.current_balance || 0) + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '2110-00');
        }

        // Update COA balances: Supplier specific account
        const { data: accSupp } = await supabase.from('coa_accounts').select('current_balance').eq('id', supplierCoa.accountId).single();
        const prevSuppBal = Number(accSupp?.current_balance ?? supplierCoa.party?.current_balance ?? 0);
        const newSuppBal = prevSuppBal + invoiceTotalAed;
        await supabase.from('coa_accounts').update({ current_balance: newSuppBal }).eq('id', supplierCoa.accountId);

        // Update supplier balance in parties table
        if (supplierCoa.partyId) {
          const { data: ptyRow } = await supabase.from('parties').select('current_balance').eq('id', supplierCoa.partyId).maybeSingle();
          const currentPartyBal = Number(ptyRow?.current_balance ?? 0);
          const updatedPartyBal = currentPartyBal + invoiceTotalAed;

          await supabase.from('parties').update({
            current_balance: updatedPartyBal,
            coa_account_id: supplierCoa.accountId
          }).eq('id', supplierCoa.partyId);

          // Add entry in party_khata_logs
          await PartiesService.addKhataLog({
            partyId: supplierCoa.partyId,
            date: invoice.invoice_date || invoice.issue_date || new Date().toISOString().slice(0, 10),
            reference: invoiceNo,
            debit: 0,
            credit: invoiceTotalAed,
            runningBalance: updatedPartyBal,
            notes: `Purchase Inward Consignment: ${invoiceNo} (${createdPasses.length} bales)`
          });
        }
      } else {
        // If invoice was already posted (PINV), transfer from Raw Bales Stock (1140-00) to Sorting WIP (1150-00)
        await FinanceService.addVoucher({
          voucherNo: `JV-INW-TRF-${invoiceNo.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 10),
          type: 'JOURNAL',
          reference: `INWARD-${invoiceNo}`,
          narration: `Consignment Bales Inward Transfer from Warehouse to Sorting WIP: ${invoiceNo} (${supplierName}) - Gross: ${invoice.total_weight_kg || 0} KG`,
          totalDebit: invoiceTotalAed,
          totalCredit: invoiceTotalAed,
          status: 'POSTED',
          createdBy: 'System (Purchase Inward)',
          lines: [
            {
              accountCode: '1150-00',
              accountName: 'Inventory - Sorting Work-in-Progress (WIP Bales Under Grading)',
              debitAmount: invoiceTotalAed,
              creditAmount: 0,
              memo: `WIP Raw Bales Inward: ${invoiceNo} (${createdPasses.length} bales)`
            },
            {
              accountCode: '1140-00',
              accountName: 'Inventory - Raw Bales Warehouse Stock',
              debitAmount: 0,
              creditAmount: invoiceTotalAed,
              memo: `Warehouse Stock Inward to WIP: ${invoiceNo}`
            }
          ]
        });

        // Update COA balances: 1150-00
        const { data: accWip } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1150-00').single();
        if (accWip) {
          const newBal = Number(accWip.current_balance || 0) + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1150-00');
        }
        // Update COA balances: 1140-00
        const { data: accInv } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1140-00').single();
        if (accInv) {
          const newBal = Math.max(0, Number(accInv.current_balance || 0) - invoiceTotalAed);
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1140-00');
        }
      }
    } catch (coaErr) {
      console.warn('Notice on COA voucher posting:', coaErr);
    }

    // 5. Update purchase_invoices converted_to_inward and status
    await supabase
      .from('purchase_invoices')
      .update({ converted_to_inward: true, status: 'POSTED' })
      .eq('id', invoiceId);

    return createdPasses;
  }

  public static async addInwardGatePass(igp: Partial<InwardGatePass>): Promise<InwardGatePass> {
    const id = igp.id || `igp-${Date.now()}`;
    const payload = {
      id,
      pass_no: igp.gatePassNo || igp.passNo || `IGP-${Date.now().toString().slice(-6)}`,
      gate_pass_no: igp.gatePassNo || igp.passNo || `IGP-${Date.now().toString().slice(-6)}`,
      bale_code: igp.baleCode || igp.baleTagNo || `BAL-${Date.now().toString().slice(-6)}`,
      bale_tag_no: igp.baleCode || igp.baleTagNo || `BAL-${Date.now().toString().slice(-6)}`,
      bale_category: igp.baleCategory || 'Vintage Mixed Bales',
      purchase_invoice_id: igp.purchaseInvoiceId,
      purchase_invoice_no: igp.purchaseInvoiceNo || '',
      supplier_name: igp.supplierName || '',
      weight_kg: Number(igp.totalBaleWeight || igp.weightKg || 0),
      total_bale_weight: Number(igp.totalBaleWeight || igp.weightKg || 0),
      total_bale_cost: Number(igp.totalBaleCost || 0),
      cost_per_gram: Number(igp.costPerGram || 0),
      status: igp.status || 'UNOPENED'
    };

    const { data, error } = await supabase
      .from('inward_gate_passes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on inward_gate_passes:', error);
      throw new Error(error.message || 'Failed to create inward gate pass');
    }

    return {
      id: data.id,
      passNo: data.gate_pass_no || data.pass_no,
      gatePassNo: data.gate_pass_no || data.pass_no,
      baleCode: data.bale_code || data.bale_tag_no,
      baleCategory: data.bale_category || 'Vintage Mixed Bales',
      purchaseInvoiceId: data.purchase_invoice_id,
      purchaseInvoiceNo: data.purchase_invoice_no,
      supplierName: data.supplier_name,
      totalBaleWeight: Number(data.total_bale_weight || data.weight_kg),
      weightKg: Number(data.total_bale_weight || data.weight_kg),
      totalBaleCost: Number(data.total_bale_cost || 0),
      costPerGram: Number(data.cost_per_gram || 0),
      status: data.status,
      createdAt: data.created_at
    } as InwardGatePass;
  }

  public static async updateInwardGatePass(id: string, updates: Partial<InwardGatePass>): Promise<void> {
    const payload: any = {};
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.weightKg !== undefined) payload.weight_kg = Number(updates.weightKg);
    if (updates.totalBaleWeight !== undefined) payload.total_bale_weight = Number(updates.totalBaleWeight);
    if (updates.baleTagNo !== undefined) payload.bale_tag_no = updates.baleTagNo;
    if (updates.baleCode !== undefined) payload.bale_code = updates.baleCode;
    if (updates.supplierName !== undefined) payload.supplier_name = updates.supplierName;

    const { error } = await supabase.from('inward_gate_passes').update(payload).eq('id', id);
    if (error) {
      console.error('Supabase error on inward_gate_passes:', error);
      throw new Error(error.message || 'Failed to update inward gate pass');
    }
  }

  // --- Individual Garment Pieces ---
  public static async getInventoryPieces(limit = 1000): Promise<PieceBreakdownItem[]> {
    const [invRes, sortedRes] = await Promise.all([
      supabase
        .from('inventory_pieces')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('bale_sorted_pieces')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
    ]);

    const mappedPieces: PieceBreakdownItem[] = [];
    const seenBarcodes = new Set<string>();

    (invRes.data || []).forEach((row: any) => {
      const barcode = row.barcode || row.piece_code || row.id;
      seenBarcodes.add(barcode);
      mappedPieces.push({
        id: row.id,
        gatePassId: row.gate_pass_id || row.gatePassId,
        barcode,
        itemName: row.item_name || row.itemName || 'Garment Piece',
        brandName: row.brand_name || row.brandName || '',
        brandTier: row.brand_tier || row.brandTier || 'Grail',
        labelGrade: row.label_grade || row.labelGrade || 'CREAM',
        shopLocation: row.shop_location || row.shopLocation || 'Central Warehouse (Al Quoz)',
        weightKg: Number(row.weight_kg ?? (Number(row.weight_grams || 0) / 1000)),
        weightGrams: Number(row.weight_grams ?? (Number(row.weight_kg || 0) * 1000)),
        costPrice: Number(row.cost_price ?? row.costPrice ?? 0),
        calculatedCostPrice: Number(row.cost_price ?? row.costPrice ?? 0),
        costPerGram: Number(row.cost_per_gram ?? (Number(row.weight_grams || 0) > 0 ? (Number(row.cost_price || 0) / Number(row.weight_grams)) : 0)),
        estimatedPrice: Number(row.estimated_price ?? row.retailPriceAed ?? 0),
        retailPriceAed: Number(row.retail_price_aed ?? row.retailPriceAed ?? row.estimated_price ?? 0),
        sizeScanned: row.size_scanned || row.sizeScanned || 'L',
        countryOfOrigin: row.country_of_origin || row.countryOfOrigin || '',
        style: row.style || '',
        frontImageUrl: row.front_image_url || row.frontImageUrl || '',
        backImageUrl: row.back_image_url || row.backImageUrl || '',
        tagImageUrl: row.tag_image_url || row.tagImageUrl || '',
        isSold: Boolean(row.is_sold ?? row.isSold),
        status: row.status || (row.is_sold ? 'SOLD' : 'AVAILABLE'),
        lockedByBuyer: row.locked_by_buyer || row.lockedByBuyer || '',
        lockedByBooth: row.locked_by_booth || row.lockedByBooth || '',
        lockExpiresAt: row.lock_expires_at || row.lockExpiresAt,
        reservedUntil: row.reserved_until || row.reservedUntil,
        createdAt: row.created_at
      });
    });

    (sortedRes.data || []).forEach((row: any) => {
      const barcode = row.piece_code || row.barcode || row.id;
      if (!seenBarcodes.has(barcode)) {
        seenBarcodes.add(barcode);
        const wGrams = Number(row.weight_grams || 0);
        const cPrice = Number(row.cost_price || 0);
        const sPrice = Number(row.selling_price || 0);
        mappedPieces.push({
          id: row.id,
          gatePassId: row.bale_id || '',
          barcode,
          itemName: row.category || 'Garment Piece',
          brandName: row.brand_title || '',
          brandTier: 'Vintage Curated',
          labelGrade: row.quality_grade || 'Grade A+',
          shopLocation: 'Central Warehouse (Al Quoz)',
          weightKg: wGrams > 0 ? Number((wGrams / 1000).toFixed(3)) : 0,
          weightGrams: wGrams,
          costPrice: cPrice,
          calculatedCostPrice: cPrice,
          costPerGram: wGrams > 0 ? Number((cPrice / wGrams).toFixed(6)) : 0,
          estimatedPrice: sPrice,
          retailPriceAed: sPrice,
          sizeScanned: row.size || 'L',
          countryOfOrigin: 'USA',
          style: row.brand_title || '',
          frontImageUrl: row.front_image || '',
          backImageUrl: row.back_image || '',
          tagImageUrl: row.tag_image || '',
          isSold: false,
          status: 'AVAILABLE',
          createdAt: row.created_at
        });
      }
    });

    return mappedPieces;
  }

  public static async finalizeBaleSession(baleId: string): Promise<void> {
    // 1. Update bale_sessions
    await supabase
      .from('bale_sessions')
      .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
      .eq('bale_id', baleId);

    // 2. Update inward_gate_passes
    await supabase
      .from('inward_gate_passes')
      .update({ status: 'COMPLETED' })
      .eq('id', baleId);

    // 3. Move/sync all pieces from bale_sorted_pieces into inventory_pieces
    const { data: sortedPieces } = await supabase
      .from('bale_sorted_pieces')
      .select('*')
      .eq('bale_id', baleId);

    if (sortedPieces && sortedPieces.length > 0) {
      const inventoryRows = sortedPieces.map((p: any) => ({
        id: p.id,
        gate_pass_id: baleId,
        barcode: p.piece_code || p.id,
        item_name: p.category || 'Vintage Garment',
        brand_name: p.brand_title || '',
        brand_tier: 'Grail',
        label_grade: p.quality_grade || 'CREAM',
        shop_location: 'Central Warehouse (Al Quoz)',
        weight_kg: Number(p.weight_grams ? (Number(p.weight_grams) / 1000) : 0),
        weight_grams: Number(p.weight_grams || 0),
        cost_price: Number(p.cost_price || 0),
        estimated_price: Number(p.selling_price || 0),
        retail_price_aed: Number(p.selling_price || 0),
        size_scanned: p.size || 'L',
        front_image_url: p.front_image || '',
        back_image_url: p.back_image || '',
        tag_image_url: p.tag_image || '',
        is_sold: false,
        status: 'AVAILABLE'
      }));

      await supabase
        .from('inventory_pieces')
        .upsert(inventoryRows, { onConflict: 'id' });
    }
  }

  public static async addInventoryPiece(piece: Partial<PieceBreakdownItem>): Promise<PieceBreakdownItem> {
    const id = piece.id || `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const barcode = piece.barcode || `VV-${Date.now().toString().slice(-6)}`;
    const payload = {
      id,
      barcode,
      gate_pass_id: piece.gatePassId,
      item_name: piece.itemName || 'Garment Piece',
      brand_name: piece.brandName || '',
      brand_tier: piece.brandTier || 'Grail',
      label_grade: piece.labelGrade || 'CREAM',
      shop_location: piece.shopLocation || 'Central Warehouse (Al Quoz)',
      weight_kg: Number(piece.weightKg || 0),
      weight_grams: Number(piece.weightGrams || (Number(piece.weightKg || 0) * 1000)),
      cost_price: Number(piece.costPrice || 0),
      estimated_price: Number(piece.estimatedPrice || piece.retailPriceAed || 0),
      retail_price_aed: Number(piece.retailPriceAed || piece.estimatedPrice || 0),
      size_scanned: piece.sizeScanned || 'L',
      country_of_origin: piece.countryOfOrigin || '',
      style: piece.style || '',
      front_image_url: piece.frontImageUrl || '',
      back_image_url: piece.backImageUrl || '',
      tag_image_url: piece.tagImageUrl || '',
      is_sold: Boolean(piece.isSold),
      status: piece.status || 'AVAILABLE'
    };

    const { data, error } = await supabase
      .from('inventory_pieces')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Failed to save inventory piece');
    }

    return {
      id: data.id,
      barcode: data.barcode,
      itemName: data.item_name,
      brandName: data.brand_name,
      brandTier: data.brand_tier,
      labelGrade: data.label_grade,
      shopLocation: data.shop_location,
      weightKg: Number(data.weight_kg),
      weightGrams: Number(data.weight_grams),
      costPrice: Number(data.cost_price),
      estimatedPrice: Number(data.estimated_price),
      retailPriceAed: Number(data.retail_price_aed),
      sizeScanned: data.size_scanned,
      countryOfOrigin: data.country_of_origin,
      style: data.style,
      frontImageUrl: data.front_image_url,
      backImageUrl: data.back_image_url,
      tagImageUrl: data.tag_image_url,
      isSold: data.is_sold,
      status: data.status,
      createdAt: data.created_at
    };
  }

  public static async updateInventoryPiece(id: string, updates: Partial<PieceBreakdownItem>): Promise<void> {
    const payload: any = {};
    if (updates.itemName !== undefined) payload.item_name = updates.itemName;
    if (updates.brandName !== undefined) payload.brand_name = updates.brandName;
    if (updates.brandTier !== undefined) payload.brand_tier = updates.brandTier;
    if (updates.labelGrade !== undefined) payload.label_grade = updates.labelGrade;
    if (updates.shopLocation !== undefined) payload.shop_location = updates.shopLocation;
    if (updates.retailPriceAed !== undefined) payload.retail_price_aed = Number(updates.retailPriceAed);
    if (updates.sizeScanned !== undefined) payload.size_scanned = updates.sizeScanned;
    if (updates.frontImageUrl !== undefined) payload.front_image_url = updates.frontImageUrl;
    if (updates.backImageUrl !== undefined) payload.back_image_url = updates.backImageUrl;
    if (updates.tagImageUrl !== undefined) payload.tag_image_url = updates.tagImageUrl;
    if (updates.isSold !== undefined) payload.is_sold = updates.isSold;
    if (updates.status !== undefined) payload.status = updates.status;

    const { error } = await supabase
      .from('inventory_pieces')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Failed to update inventory piece');
    }
  }

  public static async deleteInventoryPiece(id: string): Promise<void> {
    const { error } = await supabase.from('inventory_pieces').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on inventory_pieces:', error);
      throw new Error(error.message || 'Failed to delete inventory piece');
    }
  }

  // --- Bale Presets Catalog ---
  public static async getBalePresets(): Promise<any[]> {
    // 1. Query server endpoint directly connecting to PostgreSQL
    try {
      const apiRes = await fetch('/api/purchase/bale-presets');
      if (apiRes.ok) {
        const list = await apiRes.json();
        if (Array.isArray(list) && list.length > 0) {
          try {
            localStorage.setItem('vintage_bale_presets_cache', JSON.stringify(list));
          } catch {}
          return list;
        }
      }
    } catch (_) {}

    // 2. Fallback to Supabase REST
    try {
      const { data, error } = await supabase
        .from('bale_presets')
        .select('*')
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        const mapped = data.map((r: any) => ({
          id: r.id,
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

        try {
          localStorage.setItem('vintage_bale_presets_cache', JSON.stringify(mapped));
        } catch {}

        return mapped;
      }
    } catch (e) {
      console.warn('Failed to fetch bale presets via Supabase:', e);
    }

    // 3. Fallback to localStorage cache
    try {
      const cached = localStorage.getItem('vintage_bale_presets_cache');
      if (cached) return JSON.parse(cached);
    } catch {}

    return [];
  }
}
