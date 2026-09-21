import { supabase } from '../supabaseClient.ts';
import { PurchaseInvoice, InwardGatePass, PieceBreakdownItem } from '../modules/purchase/purchase.types.ts';
import { FinanceService } from './financeService.ts';
import { PartiesService } from './partiesService.ts';

export class PurchaseService {
  // --- Purchase Invoices ---
  public static async getPurchaseInvoices(): Promise<PurchaseInvoice[]> {
    // 1. Primary route: Query server endpoint connected directly to PostgreSQL
    if (typeof window !== 'undefined') {
      try {
        const rawFetch = (window as any).__originalFetch || window.fetch;
        const apiRes = await rawFetch('/api/purchase/invoices?_t=' + Date.now());
        if (apiRes && apiRes.ok) {
          const list = await apiRes.json();
          if (Array.isArray(list) && list.length > 0) {
            return list;
          }
        }
      } catch (_) {}
    }

    // 2. Universal fallback: Direct Supabase client query
    let invData: any[] = [];
    let itemsData: any[] = [];
    try {
      const invResult = await supabase
        .from('purchase_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!invResult.error && Array.isArray(invResult.data)) {
        invData = invResult.data;
        const invIds = invData.map((row: any) => String(row.id)).filter(Boolean);
        if (invIds.length > 0) {
          const itemsResult = await supabase
            .from('purchase_invoice_items')
            .select('*')
            .in('invoice_id', invIds);
          if (!itemsResult.error && Array.isArray(itemsResult.data)) {
            itemsData = itemsResult.data;
          }
        }
      } else if (invResult.error) {
        console.warn('Supabase query notice on purchase_invoices:', invResult.error.message);
      }
    } catch (err: any) {
      console.warn('Supabase fetch exception on purchase invoices:', err?.message);
    }

    const itemsByInvoiceId = new Map<string, any[]>();
    (itemsData || []).forEach((itemRow: any) => {
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

    return (invData || []).map((row: any) => {
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
        supplierTrn: row.supplier_trn || row.trn_no || '',
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
      const name = supplierName?.trim() || 'Trade Supplier';

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('create_party_with_coa', {
          p_name: name,
          p_type: 'SUPPLIER',
          p_phone: null,
          p_trn: null,
          p_credit_limit: 50000,
          p_inventory_account_id: null
        });

        if (!rpcErr && rpcData?.party_id) {
          const { data: fetchedP } = await supabase.from('parties').select('*').eq('id', rpcData.party_id).maybeSingle();
          if (fetchedP) {
            party = fetchedP;
          }
        }
      } catch (err) {
        console.warn('Auto-create party notice:', err);
      }
    }

    const finalPartyId = party?.id || cleanSuppId || `pty-${Date.now()}`;
    const finalPartyName = party?.name || supplierName?.trim() || 'Trade Supplier';
    const partyCode = party?.code || `P-${finalPartyId.replace(/[^A-Za-z0-9]/g, '').slice(-4)}`;
    const cleanCode = partyCode.replace(/[^A-Za-z0-9]/g, '');
    const rawAccountCode = (party?.account_map?.payableAccountId && party.account_map.payableAccountId.startsWith('2110-') && party.account_map.payableAccountId !== '2110-00')
      ? party.account_map.payableAccountId
      : (cleanCode ? `2110-${cleanCode}` : '2110-01');
    const accountCode = (rawAccountCode === '2110-00' || rawAccountCode.endsWith('-00'))
      ? '2110-01'
      : rawAccountCode;
    const accountName = accountCode === '2110-01' ? 'Accounts Payable - Trade Suppliers' : `${finalPartyName} (Supplier)`;

    // Properly declare accountId variable to prevent ReferenceError
    let accountId: string = party?.coa_account_id || `acc-${finalPartyId}`;

    // Check if account already exists by CODE in chart_of_accounts (UUID id)
    let resolvedChartUuid: string | null = null;
    try {
      const { data: chartAcc } = await supabase
        .from('chart_of_accounts')
        .select('id, code')
        .eq('code', accountCode)
        .maybeSingle();
      if (chartAcc?.id) {
        resolvedChartUuid = String(chartAcc.id);
        accountId = resolvedChartUuid;
      }
    } catch (_) {}

    // Check if account already exists by CODE in coa_accounts
    try {
      const { data: coaAcc } = await supabase
        .from('coa_accounts')
        .select('id, code')
        .eq('code', accountCode)
        .maybeSingle();
      if (coaAcc?.id && !resolvedChartUuid) {
        accountId = String(coaAcc.id);
      }
    } catch (_) {}

    // Ensure COA sub-account exists in coa_accounts with onConflict: 'code'
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
      }, { onConflict: 'code' });
    } catch (coaUpsertErr) {
      console.warn('COA upsert notice:', coaUpsertErr);
    }

    // Ensure COA sub-account exists in chart_of_accounts with onConflict: 'code'
    try {
      let parentUuid: string | null = null;
      try {
        const { data: pAcc } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('code', '2110-00')
          .maybeSingle();
        parentUuid = pAcc?.id || null;
      } catch (_) {}

      const { data: chartUpsertRes } = await supabase.from('chart_of_accounts').upsert({
        code: accountCode,
        name: accountName,
        account_type: 'LIABILITY',
        parent_id: parentUuid,
        current_balance: Number(party?.current_balance || 0)
      }, { onConflict: 'code' }).select('id').maybeSingle();

      if (chartUpsertRes?.id) {
        accountId = String(chartUpsertRes.id);
      }
    } catch (chartErr) {
      console.warn('chart_of_accounts upsert notice:', chartErr);
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

      // Look up dynamic UUID for Tier 3 Account 1140-01 (Raw Material Unsorted)
      let rawInvAccountId: string | undefined = undefined;
      try {
        const { data: rawChart } = await supabase
          .from('chart_of_accounts')
          .select('id, name')
          .eq('code', '1140-01')
          .maybeSingle();
        if (rawChart?.id) {
          rawInvAccountId = String(rawChart.id);
        } else {
          const { data: rawCoa } = await supabase
            .from('coa_accounts')
            .select('id, name')
            .eq('code', '1140-01')
            .maybeSingle();
          if (rawCoa?.id) rawInvAccountId = String(rawCoa.id);
        }
      } catch (_) {}

      // Ensure 1140-01 exists in coa_accounts if not yet created
      if (!rawInvAccountId) {
        try {
          const { data: upsertRaw } = await supabase.from('coa_accounts').upsert({
            id: 'acc-1140-01',
            code: '1140-01',
            name: 'Raw Material Unsorted',
            type: 'ASSET',
            sub_type: 'Inventory',
            parent_code: '1140-00',
            tier_level: 3,
            is_active: true
          }, { onConflict: 'code' }).select('id').maybeSingle();
          if (upsertRaw?.id) rawInvAccountId = String(upsertRaw.id);
        } catch (_) {}
      }

      const targetApCode = (supplierCoa.accountCode === '2110-00' || supplierCoa.accountCode.endsWith('-00'))
        ? '2110-01'
        : supplierCoa.accountCode;

      let finalApAccountId = supplierCoa.accountId;
      // Ensure 2110-01 exists in coa_accounts if targeting default AP account
      if (targetApCode === '2110-01') {
        try {
          const { data: apChart } = await supabase
            .from('chart_of_accounts')
            .select('id')
            .eq('code', '2110-01')
            .maybeSingle();
          if (apChart?.id) {
            finalApAccountId = String(apChart.id);
          } else {
            const { data: apCoa } = await supabase
              .from('coa_accounts')
              .select('id')
              .eq('code', '2110-01')
              .maybeSingle();
            if (apCoa?.id) finalApAccountId = String(apCoa.id);
          }
        } catch (_) {}

        try {
          await supabase.from('coa_accounts').upsert({
            id: 'acc-2110-01',
            code: '2110-01',
            name: 'Accounts Payable - Trade Suppliers',
            type: 'LIABILITY',
            sub_type: 'Accounts Payable - Trade',
            parent_code: '2110-00',
            tier_level: 3,
            is_active: true
          }, { onConflict: 'code' });
        } catch (_) {}
      }

      // Post Journal Voucher: Dr 1140-01 (Raw Material Unsorted) / Cr Supplier Liability Account (Tier 3)
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
            accountId: rawInvAccountId,
            accountCode: '1140-01',
            accountName: 'Raw Material Unsorted',
            debitAmount: invoiceTotalAed,
            creditAmount: 0,
            memo: `Commercial Purchase Invoice: ${invoiceNo}`
          },
          {
            accountId: finalApAccountId,
            accountCode: targetApCode,
            accountName: targetApCode === '2110-01' ? 'Accounts Payable - Trade Suppliers' : supplierCoa.accountName,
            partyId: supplierCoa.partyId,
            partyName: supplierCoa.partyName,
            debitAmount: 0,
            creditAmount: invoiceTotalAed,
            memo: `Supplier Payable: ${supplierName} for ${invoiceNo}`
          }
        ]
      });

      // Update COA balances: 1140-01 (Raw Material Unsorted)
      const { data: accInv } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1140-01').maybeSingle();
      if (accInv) {
        const newBal = Number(accInv.current_balance || 0) + invoiceTotalAed;
        await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1140-01');
        await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '1140-01');
      }

      // Update COA balances: Accounts Payable - Trade Suppliers 2110-01
      const { data: accParentAp } = await supabase.from('coa_accounts').select('current_balance').eq('code', '2110-01').maybeSingle();
      if (accParentAp) {
        const newBal = Number(accParentAp.current_balance || 0) + invoiceTotalAed;
        await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '2110-01');
        await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '2110-01');
      }

      // Update COA balances: Supplier specific Tier 3 sub-account
      if (targetApCode !== '2110-01') {
        const { data: accSupp } = await supabase.from('coa_accounts').select('current_balance').eq('code', targetApCode).maybeSingle();
        const prevSuppBal = Number(accSupp?.current_balance ?? supplierCoa.party?.current_balance ?? 0);
        const newSuppBal = prevSuppBal + invoiceTotalAed;
        await supabase.from('coa_accounts').update({ current_balance: newSuppBal }).eq('code', targetApCode);
        await supabase.from('chart_of_accounts').update({ current_balance: newSuppBal }).eq('code', targetApCode);
      }

      // Update supplier balance in parties table
      if (supplierCoa.partyId) {
        const { data: ptyRow } = await supabase.from('parties').select('current_balance').eq('id', supplierCoa.partyId).maybeSingle();
        const currentPartyBal = Number(ptyRow?.current_balance ?? 0);
        const updatedPartyBal = currentPartyBal + invoiceTotalAed;

        await supabase.from('parties').update({
          current_balance: updatedPartyBal,
          coa_account_id: supplierCoa.accountCode || supplierCoa.accountId
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
    const vesselName = (inv as any).vesselName || (inv as any).vessel_name || null;
    const portOfArrival = (inv as any).portOfArrival || (inv as any).portOfEntry || (inv as any).port_of_arrival || null;
    const payload = {
      id,
      invoice_no: inv.invoiceNo || (inv as any).invoice_no || `PINV-${Date.now().toString().slice(-6)}`,
      supplier_id: cleanSupplierId,
      supplier_name: inv.supplierName || (inv as any).supplier_name || '',
      invoice_date: inv.invoiceDate || inv.date || (inv as any).invoice_date || new Date().toISOString().slice(0, 10),
      status: inv.status || 'DRAFT',
      currency: (inv.currency || 'AED').toUpperCase(),
      exchange_rate: Number(inv.exchangeRate || (inv as any).exchange_rate || 1),
      subtotal: Number(inv.subtotal || (inv as any).subTotal || 0),
      gross_amount: Number(inv.grossAmount || (inv as any).gross_amount || inv.subtotal || (inv as any).subTotal || inv.totalAmount || 0),
      deduction_amount: Number(inv.deductionAmount || (inv as any).deduction_amount || inv.discountAmount || 0),
      discount_amount: Number(inv.discountAmount || (inv as any).discount_amount || inv.deductionAmount || 0),
      net_amount: Number(inv.netAmount || (inv as any).net_amount || inv.totalAmount || 0),
      tax_amount: Number(inv.taxAmount || (inv as any).tax_amount || inv.vatAmount || 0),
      total_amount: Number(inv.totalAmount || (inv as any).total_amount || 0),
      total_weight_kg: Number(inv.totalWeightKg || (inv as any).total_weight_kg || (inv as any).totalGrossWeightKg || 0),
      container_no: inv.containerNo || (inv as any).container_no || '',
      bl_no: inv.blAirwayBillNo || (inv as any).bl_no || '',
      vessel_name: vesselName ? String(vesselName) : null,
      port_of_arrival: portOfArrival ? String(portOfArrival) : null,
      notes: inv.notes || ''
    };

    const { data, error } = await supabase
      .from('purchase_invoices')
      .upsert(payload, { onConflict: 'invoice_no' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('purchase_invoices_invoice_no_key')) {
        throw new Error(`Invoice number "${payload.invoice_no}" already exists. Please use a unique invoice number.`);
      }
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

  public static async deleteInvoiceFinancialVouchers(invoiceNo: string): Promise<void> {
    if (!invoiceNo || !invoiceNo.trim()) return;
    const cleanInvNo = invoiceNo.replace(/[^a-zA-Z0-9]/g, '');

    try {
      // 1. Fetch matching vouchers from financial_vouchers
      const { data: fvList } = await supabase
        .from('financial_vouchers')
        .select('id, voucher_no, reference, narration');

      const matchedVouchers: { id: string; voucher_no: string }[] = [];
      if (fvList && fvList.length > 0) {
        for (const v of fvList) {
          const vRef = String(v.reference || '').toUpperCase();
          const vNo = String(v.voucher_no || '').toUpperCase();
          const vNarr = String(v.narration || '').toUpperCase();
          const target = invoiceNo.toUpperCase();
          const targetClean = cleanInvNo.toUpperCase();

          if (
            vRef.includes(target) ||
            vNarr.includes(target) ||
            (targetClean && vNo.includes(targetClean)) ||
            vRef === `PINV-${target}` ||
            vRef === `INWARD-${target}` ||
            vRef === `PUR-${target}`
          ) {
            matchedVouchers.push({ id: String(v.id), voucher_no: String(v.voucher_no) });
          }
        }
      }

      // 2. Also check table 'vouchers'
      try {
        const { data: vList } = await supabase
          .from('vouchers')
          .select('id, voucher_no, reference, narration');
        if (vList && vList.length > 0) {
          for (const v of vList) {
            const vRef = String(v.reference || '').toUpperCase();
            const vNo = String(v.voucher_no || '').toUpperCase();
            const vNarr = String(v.narration || '').toUpperCase();
            const target = invoiceNo.toUpperCase();
            const targetClean = cleanInvNo.toUpperCase();

            if (
              vRef.includes(target) ||
              vNarr.includes(target) ||
              (targetClean && vNo.includes(targetClean)) ||
              vRef === `PINV-${target}` ||
              vRef === `INWARD-${target}` ||
              vRef === `PUR-${target}`
            ) {
              if (!matchedVouchers.some(m => m.id === String(v.id))) {
                matchedVouchers.push({ id: String(v.id), voucher_no: String(v.voucher_no) });
              }
            }
          }
        }
      } catch (_) {}

      // 3. Cascade delete all entries and general ledger lines for each matched voucher
      for (const mv of matchedVouchers) {
        const cleanId = mv.id;
        const vNo = mv.voucher_no;

        // Strict UUID match for journal_entries (removes non-existent voucher_no column)
        const { error: jeErr } = await supabase.from('journal_entries').delete().eq('voucher_id', cleanId);
        if (jeErr) {
          console.error(`Failed to delete journal entries for voucher ${vNo || cleanId}:`, jeErr);
          throw new Error(`Failed to delete journal entries: ${jeErr.message}`);
        }

        try {
          await supabase.from('voucher_entries').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
        } catch (_) {}
        try {
          await supabase.from('general_ledger').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
        } catch (_) {}
        try {
          await supabase.from('ledgers').delete().or(`voucher_id.eq.${cleanId},voucher_no.eq.${vNo}`);
        } catch (_) {}
        try {
          await supabase.from('financial_vouchers').delete().eq('id', cleanId);
        } catch (_) {}
        try {
          await supabase.from('vouchers').delete().eq('id', cleanId);
        } catch (_) {}
      }

      // 4. Delete party_khata_logs for this invoice
      try {
        await supabase
          .from('party_khata_logs')
          .delete()
          .or(`reference.eq.${invoiceNo},notes.ilike.%${invoiceNo}%`);
      } catch (_) {}

      // 5. Reconcile COA in SQL
      try {
        FinanceService.clearCoaCache();
        await supabase.rpc('sync_coa_current_balances');
      } catch (_) {}

      // 6. If zero invoices and zero bales remain, reset stock & supplier COA accounts to 0
      try {
        const { count: invCount } = await supabase.from('purchase_invoices').select('id', { count: 'exact', head: true });
        const { count: baleCount } = await supabase.from('inward_gate_passes').select('id', { count: 'exact', head: true });
        if (Number(invCount || 0) === 0 && Number(baleCount || 0) === 0) {
          await supabase.from('coa_accounts').update({ current_balance: 0 }).in('code', ['1140-00', '1140-01', '1150-00', '1150-01', '2110-00', '2110-01']);
          await supabase.from('chart_of_accounts').update({ current_balance: 0 }).in('code', ['1140-00', '1140-01', '1150-00', '1150-01', '2110-00', '2110-01']);
        }
      } catch (_) {}
    } catch (err) {
      console.error('Error in deleteInvoiceFinancialVouchers:', err);
      throw err;
    }
  }

  public static async deletePurchaseInvoice(invoiceId: string, explicitInvoiceNo?: string): Promise<void> {
    const cleanInvId = String(invoiceId);

    // 0. Fetch invoice first to inspect status and metadata
    const { data: invRow, error: invFetchErr } = await supabase
      .from('purchase_invoices')
      .select('id, invoice_no, status, converted_to_inward')
      .eq('id', cleanInvId)
      .maybeSingle();

    if (invFetchErr) {
      throw new Error(`Failed to fetch invoice: ${invFetchErr.message}`);
    }

    if (!invRow) {
      throw new Error(`Purchase invoice ${cleanInvId} not found`);
    }

    const invoiceNo = invRow.invoice_no || explicitInvoiceNo || cleanInvId;

    // Rule A (Delete Constraint): An invoice CANNOT be deleted if its status is 'POSTED'. The user must explicitly "Unpost" it first.
    if (invRow.status === 'POSTED') {
      throw new Error(`Cannot delete purchase invoice "${invoiceNo}" because it is in POSTED status. You must explicitly Unpost it first.`);
    }

    // Rule B (Unpost/Delete Dependency): An invoice CANNOT be unposted or deleted if an "Inward Pass" or "Sorting Bale" has already been generated for it.
    const { data: existingPasses, error: passErr } = await supabase
      .from('inward_gate_passes')
      .select('id, gate_pass_no')
      .or(`purchase_invoice_id.eq.${cleanInvId}${invoiceNo ? `,purchase_invoice_no.eq.${invoiceNo}` : ''}`);

    if (passErr) {
      throw new Error(`Failed to verify related inward gate passes: ${passErr.message}`);
    }

    if ((existingPasses && existingPasses.length > 0) || invRow.converted_to_inward) {
      const baleCount = existingPasses?.length || 1;
      throw new Error(`Cannot delete invoice "${invoiceNo}" because ${baleCount} Inward Pass(es) / Sorting Bale(s) have already been generated for it. You must delete the Sorting Bales first.`);
    }

    // 1. Deletion targets ONLY purchase_invoices and its exact child table purchase_invoice_items
    try {
      await supabase
        .from('purchase_invoice_items')
        .delete()
        .eq('invoice_id', cleanInvId);
    } catch (itemsError: any) {
      console.warn("purchase_invoice_items delete notice:", itemsError?.message);
    }

    // 2. Delete parent record from purchase_invoices
    const { error: invoiceError } = await supabase
      .from('purchase_invoices')
      .delete()
      .eq('id', cleanInvId);

    if (invoiceError) {
      console.error("Failed to delete invoice:", invoiceError);
      throw new Error(invoiceError.message || 'Failed to delete invoice');
    }

    // 3. Purge local cache
    try {
      localStorage.removeItem('vv_cached_pieces');
      localStorage.removeItem('vintage_cached_pieces');
      localStorage.removeItem('vv_cached_purchases');
    } catch (_) {}
  }

  public static async unpostPurchaseInvoice(invoiceId: string): Promise<void> {
    const cleanInvId = String(invoiceId);

    // 0. Fetch invoice first
    const { data: invRow, error: invFetchErr } = await supabase
      .from('purchase_invoices')
      .select('id, invoice_no, status, total_amount, currency, exchange_rate, supplier_id, supplier_name, converted_to_inward')
      .eq('id', cleanInvId)
      .maybeSingle();

    if (invFetchErr || !invRow) {
      throw new Error(`Purchase invoice ${cleanInvId} not found`);
    }

    const invoiceNo = invRow.invoice_no || '';

    // Rule B (Unpost/Delete Dependency): An invoice CANNOT be unposted if an "Inward Pass" or "Sorting Bale" has already been generated for it.
    const { data: existingPasses, error: passErr } = await supabase
      .from('inward_gate_passes')
      .select('id, gate_pass_no')
      .or(`purchase_invoice_id.eq.${cleanInvId}${invoiceNo ? `,purchase_invoice_no.eq.${invoiceNo}` : ''}`);

    if (passErr) {
      throw new Error(`Failed to check inward gate passes: ${passErr.message}`);
    }

    if ((existingPasses && existingPasses.length > 0) || invRow.converted_to_inward) {
      const baleCount = existingPasses?.length || 1;
      throw new Error(`Cannot unpost invoice "${invoiceNo}" because ${baleCount} Inward Pass(es) / Sorting Bale(s) have already been generated for it. You must delete the Sorting Bales first.`);
    }

    // Status check
    if (invRow.status !== 'POSTED') {
      throw new Error(`Cannot unpost invoice "${invoiceNo}" because its status is "${invRow.status || 'DRAFT'}" (must be POSTED to unpost).`);
    }

    const currency = (invRow.currency || 'AED').toUpperCase();
    const exchangeRate = Number(invRow.exchange_rate) || (currency === 'USD' ? 3.6725 : 1);
    const invoiceTotalAmount = Number(invRow.total_amount || 0);
    const invoiceTotalAed = currency === 'AED' ? invoiceTotalAmount : Number((invoiceTotalAmount * exchangeRate).toFixed(2));
    const supplierName = invRow.supplier_name || 'Trade Supplier';

    // 1. Delete financial vouchers and reverse general ledger
    if (invoiceNo) {
      await this.deleteInvoiceFinancialVouchers(invoiceNo);
    }

    // 2. Reverse COA balances: 1140-01 (Raw Material Unsorted)
    try {
      const { data: accInv } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1140-01').maybeSingle();
      if (accInv) {
        const newBal = Math.max(0, Number(accInv.current_balance || 0) - invoiceTotalAed);
        await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1140-01');
        await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '1140-01');
      }
    } catch (_) {}

    // 3. Reverse COA balances: Accounts Payable - Trade Suppliers 2110-01
    try {
      const { data: accParentAp } = await supabase.from('coa_accounts').select('current_balance').eq('code', '2110-01').maybeSingle();
      if (accParentAp) {
        const newBal = Math.max(0, Number(accParentAp.current_balance || 0) - invoiceTotalAed);
        await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '2110-01');
        await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '2110-01');
      }
    } catch (_) {}

    // 4. Reverse COA balances: Supplier specific account & supplier party balance
    try {
      const supplierCoa = await PurchaseService.resolveSupplierCoaAccount(
        invRow.supplier_id,
        supplierName,
        invRow.currency
      );

      const targetSuppCode = (supplierCoa.accountCode === '2110-00' || supplierCoa.accountCode.endsWith('-00'))
        ? '2110-01'
        : supplierCoa.accountCode;

      if (targetSuppCode !== '2110-01') {
        const { data: accSupp } = await supabase.from('coa_accounts').select('current_balance').eq('code', targetSuppCode).maybeSingle();
        if (accSupp) {
          const newSuppBal = Math.max(0, Number(accSupp.current_balance || 0) - invoiceTotalAed);
          await supabase.from('coa_accounts').update({ current_balance: newSuppBal }).eq('code', targetSuppCode);
          await supabase.from('chart_of_accounts').update({ current_balance: newSuppBal }).eq('code', targetSuppCode);
        }
      }

      if (supplierCoa.partyId) {
        const { data: ptyRow } = await supabase.from('parties').select('current_balance').eq('id', supplierCoa.partyId).maybeSingle();
        const currentPartyBal = Number(ptyRow?.current_balance ?? 0);
        const updatedPartyBal = Math.max(0, currentPartyBal - invoiceTotalAed);

        await supabase.from('parties').update({
          current_balance: updatedPartyBal
        }).eq('id', supplierCoa.partyId);

        // Add reversal entry in party_khata_logs
        await PartiesService.addKhataLog({
          partyId: supplierCoa.partyId,
          date: new Date().toISOString().slice(0, 10),
          reference: `UNPOST-${invoiceNo}`,
          debit: invoiceTotalAed,
          credit: 0,
          runningBalance: updatedPartyBal,
          notes: `Reversal on unposting invoice ${invoiceNo}`
        });
      }
    } catch (coaRevErr) {
      console.warn('Notice on unpost COA reversal:', coaRevErr);
    }

    // 5. Update invoice status to 'DRAFT'
    const { error: updateErr } = await supabase
      .from('purchase_invoices')
      .update({ status: 'DRAFT' })
      .eq('id', cleanInvId);

    if (updateErr) {
      throw new Error(`Failed to update invoice status to DRAFT: ${updateErr.message}`);
    }

    // 6. Refresh COA cache and balances
    try {
      FinanceService.clearCoaCache();
      await supabase.rpc('sync_coa_current_balances');
    } catch (_) {}
  }

  public static async purgeOrphanedInventory(): Promise<{ deletedCount: number }> {
    try {
      // 1. Fetch valid invoice IDs and valid gate pass IDs
      const [invoicesRes, passesRes] = await Promise.all([
        supabase.from('purchase_invoices').select('id, invoice_no'),
        supabase.from('inward_gate_passes').select('id, gate_pass_no')
      ]);

      const validInvoiceIds = new Set((invoicesRes.data || []).map((r: any) => String(r.id)));
      const validPassIds = new Set((passesRes.data || []).map((r: any) => String(r.id)));

      // Find pieces with missing parent
      const { data: allPieces } = await supabase.from('inventory_pieces').select('id, gate_pass_id');
      const orphanedPieceIds: string[] = [];
      (allPieces || []).forEach((p: any) => {
        const gId = String(p.gate_pass_id || '');
        if (!gId || (!validPassIds.has(gId) && !validInvoiceIds.has(gId))) {
          orphanedPieceIds.push(p.id);
        }
      });

      const { data: allSorted } = await supabase.from('bale_sorted_pieces').select('id, bale_id');
      const orphanedSortedIds: string[] = [];
      (allSorted || []).forEach((s: any) => {
        const bId = String(s.bale_id || '');
        if (!bId || (!validPassIds.has(bId) && !validInvoiceIds.has(bId))) {
          orphanedSortedIds.push(s.id);
        }
      });

      if (orphanedPieceIds.length > 0) {
        await supabase.from('inventory_pieces').delete().in('id', orphanedPieceIds);
      }
      if (orphanedSortedIds.length > 0) {
        await supabase.from('bale_sorted_pieces').delete().in('id', orphanedSortedIds);
      }

      try {
        localStorage.removeItem('vv_cached_pieces');
        localStorage.removeItem('vintage_cached_pieces');
      } catch (_) {}

      return { deletedCount: orphanedPieceIds.length + orphanedSortedIds.length };
    } catch (err) {
      console.warn('purgeOrphanedInventory notice:', err);
      return { deletedCount: 0 };
    }
  }

  public static async deleteInwardGatePass(gatePassId: string): Promise<void> {
    const cleanId = String(gatePassId);
    let invoiceNo: string | undefined;
    let invoiceId: string | undefined;

    try {
      const { data: row } = await supabase
        .from('inward_gate_passes')
        .select('id, purchase_invoice_id, purchase_invoice_no')
        .eq('id', cleanId)
        .maybeSingle();

      if (row) {
        invoiceNo = row.purchase_invoice_no;
        invoiceId = row.purchase_invoice_id;
      }
    } catch (_) {}

    // 1. Delete pieces and sessions associated with this bale
    try {
      await supabase.from('bale_sorted_pieces').delete().eq('bale_id', cleanId);
    } catch (_) {}
    try {
      await supabase.from('bale_sessions').delete().eq('bale_id', cleanId);
    } catch (_) {}
    try {
      await supabase.from('inventory_pieces').delete().eq('gate_pass_id', cleanId);
    } catch (_) {}

    // 2. Delete the inward gate pass itself
    const { error: igpErr } = await supabase
      .from('inward_gate_passes')
      .delete()
      .eq('id', cleanId);

    if (igpErr) {
      console.error('Failed to delete inward gate pass:', igpErr);
      throw new Error(igpErr.message || 'Failed to delete inward gate pass');
    }

    // 3. If no more bales exist for this invoice, delete inward voucher and reset converted status
    if (invoiceNo || invoiceId) {
      try {
        const { count: remainingBales } = await supabase
          .from('inward_gate_passes')
          .select('id', { count: 'exact', head: true })
          .or(`purchase_invoice_id.eq.${invoiceId || 'none'}${invoiceNo ? `,purchase_invoice_no.eq.${invoiceNo}` : ''}`);

        if (Number(remainingBales || 0) === 0) {
          if (invoiceId) {
            await supabase.from('purchase_invoices').update({ converted_to_inward: false }).eq('id', invoiceId);
          }
          if (invoiceNo) {
            // Delete inward transfer vouchers specifically
            const { data: inwVchs } = await supabase
              .from('financial_vouchers')
              .select('id, voucher_no')
              .or(`reference.eq.INWARD-${invoiceNo},voucher_no.ilike.%JV-INW%`);

            if (inwVchs && inwVchs.length > 0) {
              for (const iv of inwVchs) {
                await supabase.from('voucher_entries').delete().or(`voucher_id.eq.${iv.id},voucher_no.eq.${iv.voucher_no}`);
                await supabase.from('general_ledger').delete().or(`voucher_id.eq.${iv.id},voucher_no.eq.${iv.voucher_no}`);
                await supabase.from('financial_vouchers').delete().eq('id', iv.id);
                await supabase.from('vouchers').delete().eq('id', iv.id);
              }
            }
          }
        }
      } catch (_) {}
    }

    // 4. Reconcile COA in SQL
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
      if (!res.error && Array.isArray(res.data)) {
        data = res.data;
      }
    } catch (_) {}

    // If Supabase REST errored, check server endpoint
    if (data === null) {
      try {
        const apiRes = await fetch('/api/purchase/gate-passes');
        if (apiRes.ok) {
          const apiList = await apiRes.json();
          if (Array.isArray(apiList)) {
            data = apiList;
          }
        }
      } catch (_) {}
    }

    // Always purge obsolete local storage cache key
    try {
      localStorage.removeItem('vintage_bales_cache');
    } catch (_) {}

    if (!data || data.length === 0) {
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
              accountCode: '1150-01',
              accountName: 'Inventory - Sorting Work-in-Progress (WIP Bales Under Grading)',
              debitAmount: invoiceTotalAed,
              creditAmount: 0,
              memo: `WIP Raw Bales Inward: ${invoiceNo} (${createdPasses.length} bales)`
            },
            {
              accountId: supplierCoa.accountId,
              accountCode: (supplierCoa.accountCode === '2110-00' || supplierCoa.accountCode.endsWith('-00')) ? '2110-01' : supplierCoa.accountCode,
              accountName: supplierCoa.accountName,
              partyId: supplierCoa.partyId,
              partyName: supplierCoa.partyName,
              debitAmount: 0,
              creditAmount: invoiceTotalAed,
              memo: `Supplier Payable: ${supplierName} for ${invoiceNo}`
            }
          ]
        });

        // Update COA balances: 1150-01 (WIP Inventory)
        const { data: accWip } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1150-01').maybeSingle();
        if (accWip) {
          const newBal = Number(accWip.current_balance || 0) + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1150-01');
          await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '1150-01');
        }

        // Update COA balances: Accounts Payable - Trade Suppliers 2110-01
        const { data: accParentAp } = await supabase.from('coa_accounts').select('current_balance').eq('code', '2110-01').maybeSingle();
        if (accParentAp) {
          const newBal = Number(accParentAp.current_balance || 0) + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '2110-01');
          await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '2110-01');
        }

        // Update COA balances: Supplier specific account
        const targetSuppCode = (supplierCoa.accountCode === '2110-00' || supplierCoa.accountCode.endsWith('-00')) ? '2110-01' : supplierCoa.accountCode;
        if (targetSuppCode !== '2110-01') {
          const { data: accSupp } = await supabase.from('coa_accounts').select('current_balance').eq('code', targetSuppCode).maybeSingle();
          const prevSuppBal = Number(accSupp?.current_balance ?? supplierCoa.party?.current_balance ?? 0);
          const newSuppBal = prevSuppBal + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newSuppBal }).eq('code', targetSuppCode);
          await supabase.from('chart_of_accounts').update({ current_balance: newSuppBal }).eq('code', targetSuppCode);
        }

        // Update supplier balance in parties table
        if (supplierCoa.partyId) {
          const { data: ptyRow } = await supabase.from('parties').select('current_balance').eq('id', supplierCoa.partyId).maybeSingle();
          const currentPartyBal = Number(ptyRow?.current_balance ?? 0);
          const updatedPartyBal = currentPartyBal + invoiceTotalAed;

          await supabase.from('parties').update({
            current_balance: updatedPartyBal,
            coa_account_id: supplierCoa.accountCode || supplierCoa.accountId
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
        // If invoice was already posted (PINV), transfer from Raw Bales Stock (1140-01) to Sorting WIP (1150-01)
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
              accountCode: '1150-01',
              accountName: 'Inventory - Sorting Work-in-Progress (WIP Bales Under Grading)',
              debitAmount: invoiceTotalAed,
              creditAmount: 0,
              memo: `WIP Raw Bales Inward: ${invoiceNo} (${createdPasses.length} bales)`
            },
            {
              accountCode: '1140-01',
              accountName: 'Raw Material Unsorted',
              debitAmount: 0,
              creditAmount: invoiceTotalAed,
              memo: `Warehouse Stock Inward to WIP: ${invoiceNo}`
            }
          ]
        });

        // Update COA balances: 1150-01
        const { data: accWip } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1150-01').maybeSingle();
        if (accWip) {
          const newBal = Number(accWip.current_balance || 0) + invoiceTotalAed;
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1150-01');
          await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '1150-01');
        }
        // Update COA balances: 1140-01
        const { data: accInv } = await supabase.from('coa_accounts').select('current_balance').eq('code', '1140-01').maybeSingle();
        if (accInv) {
          const newBal = Math.max(0, Number(accInv.current_balance || 0) - invoiceTotalAed);
          await supabase.from('coa_accounts').update({ current_balance: newBal }).eq('code', '1140-01');
          await supabase.from('chart_of_accounts').update({ current_balance: newBal }).eq('code', '1140-01');
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
  public static async getPieces(limit = 1000): Promise<PieceBreakdownItem[]> {
    return this.getInventoryPieces(limit);
  }

  public static readonly INVENTORY_PIECES_COLUMNS = 'id, gate_pass_id, barcode, item_name, brand_name, brand_tier, label_grade, shop_location, weight_kg, weight_grams, cost_per_gram, cost_price, estimated_price, retail_price_aed, size_scanned, country_of_origin, style, front_image_url, back_image_url, tag_image_url, is_sold, status, locked_by_buyer, locked_by_booth, lock_expires_at, reserved_until, created_at';
  public static readonly BALE_SORTED_PIECES_COLUMNS = 'id, bale_id, piece_code, weight_grams, cost_price, selling_price, brand_title, category, size, quality_grade, front_image, back_image, tag_image, created_at';
  public static readonly PIECES_GRID_COLUMNS = PurchaseService.INVENTORY_PIECES_COLUMNS;

  public static async getInventoryPieces(limit = 1000): Promise<PieceBreakdownItem[]> {
    try {
      const [invRes, sortedRes] = await Promise.all([
        supabase
          .from('inventory_pieces')
          .select(PurchaseService.INVENTORY_PIECES_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(limit)
          .then(res => {
            if (res.error) {
              console.error('[PurchaseService] Error fetching inventory_pieces:', res.error);
              return { data: [], error: res.error };
            }
            return res;
          })
          .catch(err => {
            console.error('[PurchaseService] Exception fetching inventory_pieces:', err);
            return { data: [], error: err };
          }),
        supabase
          .from('bale_sorted_pieces')
          .select(PurchaseService.BALE_SORTED_PIECES_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(limit)
          .then(res => {
            if (res.error) {
              console.error('[PurchaseService] Error fetching bale_sorted_pieces:', res.error);
              return { data: [], error: res.error };
            }
            return res;
          })
          .catch(err => {
            console.error('[PurchaseService] Exception fetching bale_sorted_pieces:', err);
            return { data: [], error: err };
          })
      ]);

      const mappedPieces: PieceBreakdownItem[] = [];
      const seenBarcodes = new Set<string>();

      (invRes.data || []).forEach((row: any) => {
        const barcode = row.barcode || row.piece_code || row.id;
        seenBarcodes.add(barcode);
        mappedPieces.push({
          id: row.id,
          gatePassId: row.gate_pass_id || row.gatePassId || '',
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
          estimatedPrice: Number(row.estimated_price ?? row.retail_price_aed ?? row.retailPriceAed ?? 0),
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
    } catch (err: any) {
      console.error('[PurchaseService] Fatal exception in getInventoryPieces:', err);
      return [];
    }
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
    try {
      await supabase.from('inventory_pieces').delete().eq('id', id);
    } catch (_) {}
    try {
      await supabase.from('bale_sorted_pieces').delete().eq('id', id);
    } catch (_) {}

    try {
      localStorage.removeItem('vv_cached_pieces');
    } catch (_) {}
  }

  // --- Bale Presets Catalog ---
  public static async getBalePresets(): Promise<any[]> {
    // Purge obsolete local storage cache
    try {
      localStorage.removeItem('vintage_bale_presets_cache');
    } catch {}

    // 1. Fallback to Supabase REST
    try {
      const { data, error } = await supabase
        .from('bale_presets')
        .select('*')
        .order('name', { ascending: true });

      if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
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
      }
    } catch (e) {
      console.warn('Failed to fetch bale presets via Supabase:', e);
    }

    // 2. Query server endpoint directly connecting to PostgreSQL if Supabase REST failed
    try {
      const apiRes = await fetch('/api/purchase/bale-presets');
      if (apiRes.ok) {
        const list = await apiRes.json();
        if (Array.isArray(list)) {
          return list;
        }
      }
    } catch (_) {}

    return [];
  }
}
