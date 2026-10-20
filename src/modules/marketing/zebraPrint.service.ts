import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ZebraGarmentLabelPayload {
  itemCode: string;
  description: string;
  category?: string;
  department?: string;
  subCategory?: string;
  season?: string;
  size?: string;
  brand?: string;
  grade?: string;
  retailPriceAed: number;
  batchNo?: string;
  date?: string;
  invoiceNo?: string;
  companyName?: string;
  trn?: string;
  weightKg?: number;
  weightGrams?: number;
  widthMm?: number;
  heightMm?: number;
  copies?: number;
}

export interface ZebraBaleTagPayload {
  baleCode: string;
  gatePassNo?: string;
  category: string;
  grossWeightKg: number;
  totalCostAed?: number;
  costPerGram?: number;
  purchaseInvoiceNo?: string;
  supplierName?: string;
  status?: string;
  index?: number;
  totalCount?: number;
  timestamp?: string;
  widthMm?: number;
  heightMm?: number;
}

export interface ZebraShippingWaybillPayload {
  waybillNo: string;
  courier: string;
  isCOD: boolean;
  totalAmount: number;
  shippingFee?: number;
  invoiceNo: string;
  customerName: string;
  buyerHandle?: string;
  customerPhone?: string;
  shippingAddress?: string;
  paymentStatus?: string;
  items?: Array<{ description: string; barcode?: string; finalAmount?: number; unitPrice?: number }>;
  widthMm?: number;
  heightMm?: number;
}

export interface ZebraReceiptPayload {
  invoiceNo: string;
  date?: string;
  customerName?: string;
  customerPhone?: string;
  cashierName?: string;
  paymentMethod?: string;
  companyName?: string;
  trn?: string;
  items?: Array<{
    description: string;
    barcode?: string;
    quantity?: number;
    unitPrice?: number;
    finalAmount?: number;
  }>;
  subTotal?: number;
  vatAmount?: number;
  totalAmount?: number;
  isGift?: boolean;
  giftMessage?: string;
  widthMm?: number;
  heightMm?: number;
}

export type ZebraPrintJobRequest = {
  jobType: 'GARMENT_LABEL' | 'BALE_TAG' | 'BATCH_BALE_TAGS' | 'SHIPPING_WAYBILL' | 'POS_RECEIPT' | 'GIFT_RECEIPT' | 'RAW_ZPL' | 'TEST_LABEL';
  printerName?: string;
  copies?: number;
  widthMm?: number;
  heightMm?: number;
  label?: ZebraGarmentLabelPayload;
  bale?: ZebraBaleTagPayload;
  bales?: ZebraBaleTagPayload[];
  waybill?: ZebraShippingWaybillPayload;
  receipt?: ZebraReceiptPayload;
  rawZpl?: string;
};

class ZebraPrintService {
  private defaultPrinterName = 'ZDesigner ZD220-203dpi ZPL';
  private cachedPrinterName: string | null = null;
  private lastPrinterCheckAt = 0;
  private printHistory: Array<{
    id: string;
    timestamp: string;
    jobType: string;
    title: string;
    printerName: string;
    copies: number;
    success: boolean;
    error?: string;
  }> = [];

  /**
   * Clean text for ZPL ^FD fields (strip control chars and ^ / ~ which are ZPL command prefixes)
   */
  private cleanZplText(input: any, maxLen = 60): string {
    const str = String(input ?? '')
      .replace(/[\^~\\]/g, '-')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return str.slice(0, maxLen);
  }

  /**
   * Ensure the reusable PowerShell WinSpool RAW ZPL sender script exists on disk
   */
  private getOrWriteSpoolerPs1Path(): string {
    const ps1Path = path.join(os.tmpdir(), 'vv_zebra_raw_spooler_v2.ps1');
    const scriptContent = `param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$ZplFilePath
)

$ErrorActionPreference = "Stop"

$csharp = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class VVRawZebraPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendRawBytes(string szPrinterName, byte[] bytes, out int win32Err) {
        win32Err = 0;
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Vintage Vibes ERP Thermal Label (ZPL)";
        di.pDataType = "RAW";
        bool bSuccess = false;

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    if (!bSuccess) win32Err = Marshal.GetLastWin32Error();
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                } else {
                    win32Err = Marshal.GetLastWin32Error();
                }
                EndDocPrinter(hPrinter);
            } else {
                win32Err = Marshal.GetLastWin32Error();
            }
            ClosePrinter(hPrinter);
        } else {
            win32Err = Marshal.GetLastWin32Error();
        }
        return bSuccess;
    }
}
'@

if (-not ("VVRawZebraPrinterHelper" -as [type])) {
    Add-Type -TypeDefinition $csharp
}

$bytes = [System.IO.File]::ReadAllBytes($ZplFilePath)
$errCode = 0
$sent = [VVRawZebraPrinterHelper]::SendRawBytes($PrinterName, $bytes, [ref]$errCode)
if ($sent) {
    Write-Output "SPOOL_OK:BYTES=$($bytes.Length):PRINTER=$PrinterName"
    exit 0
} else {
    Write-Error "SPOOL_ERR:CODE=$errCode:PRINTER=$PrinterName"
    exit 1
}
`;
    try {
      if (!fs.existsSync(ps1Path) || fs.readFileSync(ps1Path, 'utf8') !== scriptContent) {
        fs.writeFileSync(ps1Path, scriptContent, 'utf8');
      }
    } catch (_) {}
    return ps1Path;
  }

  /**
   * Discover installed Windows printers and auto-select Zebra / ZDesigner printer
   */
  public async getServerPrinterStatus(forceRefresh = false): Promise<{
    online: boolean;
    printerName: string;
    portName: string;
    workOffline: boolean;
    allPrinters: Array<{ name: string; driverName: string; portName: string; workOffline: boolean; isDefault: boolean }>;
    recentJobs: typeof this.printHistory;
  }> {
    if (process.platform !== 'win32') {
      return {
        online: false,
        printerName: this.defaultPrinterName,
        portName: 'USB001',
        workOffline: false,
        allPrinters: [],
        recentJobs: this.printHistory.slice(0, 15)
      };
    }

    try {
      const cmd = `Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,WorkOffline,Default | ConvertTo-Json -Compress`;
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', cmd], { timeout: 8000 });
      const rawJson = String(stdout || '').trim();
      const parsed = rawJson ? JSON.parse(rawJson) : [];
      const list = Array.isArray(parsed) ? parsed : [parsed];

      const allPrinters = list
        .filter(Boolean)
        .map((p: any) => ({
          name: String(p.Name || ''),
          driverName: String(p.DriverName || ''),
          portName: String(p.PortName || ''),
          workOffline: Boolean(p.WorkOffline),
          isDefault: Boolean(p.Default)
        }));

      const zebraPrinter =
        allPrinters.find(p => /ZD220|ZDesigner|Zebra|ZPL/i.test(p.name) || /ZD220|ZDesigner|Zebra|ZPL/i.test(p.driverName)) ||
        allPrinters.find(p => p.isDefault) ||
        allPrinters[0];

      if (zebraPrinter) {
        this.cachedPrinterName = zebraPrinter.name;
        this.lastPrinterCheckAt = Date.now();
        return {
          online: !zebraPrinter.workOffline,
          printerName: zebraPrinter.name,
          portName: zebraPrinter.portName || 'USB001',
          workOffline: zebraPrinter.workOffline,
          allPrinters,
          recentJobs: this.printHistory.slice(0, 15)
        };
      }
    } catch (err: any) {
      console.warn('[ZebraPrintService] Printer discovery notice:', err?.message);
    }

    return {
      online: true,
      printerName: this.cachedPrinterName || this.defaultPrinterName,
      portName: 'USB001',
      workOffline: false,
      allPrinters: [],
      recentJobs: this.printHistory.slice(0, 15)
    };
  }

  /**
   * Build 203dpi (8 dots/mm) Native ZPL II for a Garment Barcode Sticker (default 57mm x 37mm = 456 x 296 dots)
   */
  public buildGarmentLabelZpl(payload: ZebraGarmentLabelPayload, copies = 1): string {
    const widthMm = Math.max(35, Math.min(110, Number(payload.widthMm) || 57));
    const heightMm = Math.max(20, Math.min(160, Number(payload.heightMm) || 37));
    const widthDots = Math.round(widthMm * 8);   // 57mm -> 456 dots
    const heightDots = Math.round(heightMm * 8); // 37mm -> 296 dots
    const sx = widthDots / 456;
    const sy = heightDots / 296;
    const sc = Math.min(sx, sy);

    const X = (v: number) => Math.max(0, Math.round(v * sx));
    const Y = (v: number) => Math.max(0, Math.round(v * sy));
    const F = (v: number) => Math.max(12, Math.round(v * sc));

    const companyName = this.cleanZplText(payload.companyName || 'VINTAGE VIBES TRADING L.L.C', 38).toUpperCase();
    const trn = this.cleanZplText(payload.trn || '100482910300003', 24);
    const sku = this.cleanZplText(payload.itemCode || 'VV-ITEM-001', 28).replace(/\s*\[.*\]$/, '').trim();
    const desc = this.cleanZplText(payload.description || sku, 34).toUpperCase();
    const brandOrCat = this.cleanZplText(
      [payload.brand, payload.category || 'Apparel'].filter(Boolean).join(' - '),
      30
    ).toUpperCase();
    const size = this.cleanZplText(payload.size || 'L', 10).toUpperCase();
    const grade = this.cleanZplText(payload.grade || 'Grade A', 16).toUpperCase();
    const dept = this.cleanZplText(payload.department || 'VINTAGE', 14).toUpperCase();
    const weightGrams = payload.weightGrams
      ? Math.round(Number(payload.weightGrams))
      : payload.weightKg
        ? Math.round(Number(payload.weightKg) * 1000)
        : 340;
    const batchRef = this.cleanZplText(payload.invoiceNo || payload.batchNo || 'VV-2026', 18).toUpperCase();
    const dateStr = this.cleanZplText(payload.date || new Date().toISOString().slice(0, 10), 12);
    const priceVal = Number(payload.retailPriceAed || 0).toFixed(2);
    const totalCopies = Math.max(1, Math.min(50, Number(copies || payload.copies || 1)));

    // Choose module width 2 for normal SKUs (<=13 chars), 1 for longer SKUs so barcode never clips horizontally
    const barcodeModuleWidth = sku.length > 13 || widthMm < 50 ? 1 : 2;
    const barcodeHeight = Y(58);
    const innerWidth = widthDots - X(24);
    const leftColWidth = widthDots - X(148);
    const sizeBoxX = widthDots - X(128);
    const sizeBoxW = X(116);
    const sizeBoxH = Y(56);

    return [
      '^XA',
      '^CI28',
      `^PW${widthDots}`,
      `^LL${heightDots}`,
      '^LH0,0',
      '^MD12', // High contrast thermal darkness (+12) for crisp black print

      // 1. Header: Company Name & TRN
      `^FO${X(12)},${Y(8)}^A0N,${F(20)},${F(20)}^FB${innerWidth},1,0,C^FD${companyName}^FS`,
      `^FO${X(12)},${Y(30)}^A0N,${F(14)},${F(14)}^FB${innerWidth},1,0,C^FDTRN: ${trn} | ${dept}^FS`,
      `^FO${X(12)},${Y(47)}^GB${innerWidth},2,2^FS`,

      // 2. Item Description, Brand/Category, Weight & Inverted Black SIZE Box
      `^FO${X(14)},${Y(53)}^A0N,${F(21)},${F(19)}^FB${leftColWidth},1,0,L^FD${desc}^FS`,
      `^FO${X(14)},${Y(77)}^A0N,${F(16)},${F(15)}^FB${leftColWidth},1,0,L^FD${brandOrCat}^FS`,
      `^FO${X(14)},${Y(96)}^A0N,${F(14)},${F(14)}^FB${leftColWidth},1,0,L^FDWT: ${weightGrams}g | ${grade}^FS`,

      // Prominent Inverted Black SIZE Badge on Right
      `^FO${sizeBoxX},${Y(53)}^GB${sizeBoxW},${sizeBoxH},${sizeBoxH}^FS`,
      `^FO${sizeBoxX},${Y(57)}^FR^A0N,${F(13)},${F(13)}^FB${sizeBoxW},1,0,C^FDSIZE^FS`,
      `^FO${sizeBoxX},${Y(73)}^FR^A0N,${F(28)},${F(26)}^FB${sizeBoxW},1,0,C^FD${size}^FS`,

      `^FO${X(12)},${Y(114)}^GB${innerWidth},2,2^FS`,

      // 3. Barcode (Code 128) + QR Code
      `^BY${barcodeModuleWidth},2,${barcodeHeight}`,
      `^FO${X(18)},${Y(121)}^BCN,${barcodeHeight},N,N,N^FD${sku}^FS`,
      `^FO${X(14)},${Y(184)}^A0N,${F(19)},${F(19)}^FB${leftColWidth},1,0,C^FD${sku}^FS`,
      ...(widthMm >= 52
        ? [`^FO${widthDots - X(112)},${Y(118)}^BQN,2,3^FDQA,${sku}^FS`]
        : []),

      `^FO${X(12)},${Y(210)}^GB${innerWidth},2,2^FS`,

      // 4. Footer: Batch & Date on Left + Bold AED Price Box on Right
      `^FO${X(14)},${Y(218)}^A0N,${F(15)},${F(15)}^FDBATCH: ${batchRef}^FS`,
      `^FO${X(14)},${Y(237)}^A0N,${F(14)},${F(14)}^FDDATE: ${dateStr}^FS`,
      `^FO${X(14)},${Y(255)}^A0N,${F(13)},${F(13)}^FDVINTAGEVIBESGK.COM^FS`,

      // Price Box on Bottom Right
      `^FO${X(210)},${Y(216)}^GB${X(234)},${Y(58)},2^FS`,
      `^FO${X(216)},${Y(227)}^A0N,${F(36)},${F(32)}^FB${X(220)},1,0,R^FDAED ${priceVal}^FS`,

      `^PQ${totalCopies},0,1,Y`,
      '^XZ'
    ].join('\n');
  }

  /**
   * Build 203dpi Native ZPL II for an Inward Bale / Sack Thermal Tag (adapts to 57x37mm or 100x50mm)
   */
  public buildBaleTagZpl(bale: ZebraBaleTagPayload): string {
    const widthMm = Math.max(40, Math.min(110, Number(bale.widthMm) || 57));
    const heightMm = Math.max(25, Math.min(160, Number(bale.heightMm) || 37));
    const widthDots = Math.round(widthMm * 8);
    const heightDots = Math.round(heightMm * 8);
    const sx = widthDots / 456;
    const sy = heightDots / 296;
    const sc = Math.min(sx, sy);

    const X = (v: number) => Math.max(0, Math.round(v * sx));
    const Y = (v: number) => Math.max(0, Math.round(v * sy));
    const F = (v: number) => Math.max(12, Math.round(v * sc));

    const baleCode = this.cleanZplText(bale.baleCode || 'BALE-001', 26).toUpperCase();
    const category = this.cleanZplText(bale.category || 'MIXED VINTAGE', 28).toUpperCase();
    const supplier = this.cleanZplText(bale.supplierName || 'INTL TEXTILE SORTERS', 26).toUpperCase();
    const invRef = this.cleanZplText(bale.purchaseInvoiceNo || bale.gatePassNo || 'DIRECT IMPORT', 20).toUpperCase();
    const wtKg = Number(bale.grossWeightKg || 0).toFixed(1);
    const wtGrams = Math.round(Number(bale.grossWeightKg || 0) * 1000);
    const tagIndexStr = bale.index && bale.totalCount ? `TAG ${bale.index}/${bale.totalCount}` : 'INWARD BALE';
    const innerWidth = widthDots - X(24);
    const barcodeMod = baleCode.length > 13 || widthMm < 52 ? 1 : 2;

    return [
      '^XA',
      '^CI28',
      `^PW${widthDots}`,
      `^LL${heightDots}`,
      '^LH0,0',
      '^MD12',

      `^FO${X(12)},${Y(8)}^A0N,${F(19)},${F(19)}^FB${innerWidth},1,0,L^FDVINTAGE VIBES - ${tagIndexStr}^FS`,
      `^FO${X(12)},${Y(29)}^A0N,${F(14)},${F(14)}^FB${innerWidth},1,0,L^FDREF: ${invRef} | ${supplier}^FS`,
      `^FO${X(12)},${Y(46)}^GB${innerWidth},2,2^FS`,

      // Giant Bale Code + Inverted Category Pill
      `^FO${X(12)},${Y(53)}^A0N,${F(28)},${F(26)}^FB${innerWidth},1,0,C^FD${baleCode}^FS`,
      `^FO${X(36)},${Y(84)}^GB${innerWidth - X(48)},${Y(26)},${Y(26)}^FS`,
      `^FO${X(36)},${Y(88)}^FR^A0N,${F(18)},${F(18)}^FB${innerWidth - X(48)},1,0,C^FD${category}^FS`,

      // Barcode + QR
      `^BY${barcodeMod},2,${Y(54)}`,
      `^FO${X(20)},${Y(118)}^BCN,${Y(54)},N,N,N^FD${baleCode}^FS`,
      ...(widthMm >= 52
        ? [`^FO${widthDots - X(108)},${Y(114)}^BQN,2,3^FDQA,${baleCode}^FS`]
        : []),

      `^FO${X(12)},${Y(184)}^GB${innerWidth},2,2^FS`,

      // Weight & Grams Metrics Box
      `^FO${X(14)},${Y(194)}^A0N,${F(24)},${F(22)}^FDWT: ${wtKg} KG (${wtGrams}g)^FS`,
      `^FO${X(14)},${Y(224)}^A0N,${F(16)},${F(16)}^FDSTATUS: READY FOR SORTING^FS`,
      `^FO${X(14)},${Y(246)}^A0N,${F(14)},${F(14)}^FD${this.cleanZplText(bale.timestamp || new Date().toISOString().slice(0, 16), 24)}^FS`,

      '^PQ1,0,1,Y',
      '^XZ'
    ].join('\n');
  }

  /**
   * Build 203dpi Native ZPL II for a Courier Shipping Waybill
   */
  public buildShippingWaybillZpl(waybill: ZebraShippingWaybillPayload): string {
    const widthMm = Math.max(50, Math.min(110, Number(waybill.widthMm) || 57));
    const heightMm = Math.max(35, Math.min(160, Number(waybill.heightMm) || 37));
    const widthDots = Math.round(widthMm * 8);
    const heightDots = Math.round(heightMm * 8);
    const sx = widthDots / 456;
    const sy = heightDots / 296;
    const sc = Math.min(sx, sy);

    const X = (v: number) => Math.max(0, Math.round(v * sx));
    const Y = (v: number) => Math.max(0, Math.round(v * sy));
    const F = (v: number) => Math.max(12, Math.round(v * sc));

    const awb = this.cleanZplText(waybill.waybillNo || 'AWB-001', 24).toUpperCase();
    const courier = this.cleanZplText(waybill.courier || 'UAE EXPRESS', 20).toUpperCase();
    const customer = this.cleanZplText(waybill.customerName || waybill.buyerHandle || 'VALUED BUYER', 28).toUpperCase();
    const phone = this.cleanZplText(waybill.customerPhone || '+971', 20);
    const addr = this.cleanZplText(waybill.shippingAddress || 'DUBAI, UAE', 38);
    const codText = waybill.isCOD ? `COD: AED ${Number(waybill.totalAmount || 0).toFixed(2)}` : 'PREPAID (AED 0.00)';
    const innerWidth = widthDots - X(24);

    return [
      '^XA',
      '^CI28',
      `^PW${widthDots}`,
      `^LL${heightDots}`,
      '^LH0,0',
      '^MD12',

      `^FO${X(12)},${Y(8)}^GB${innerWidth},${Y(28)},${Y(28)}^FS`,
      `^FO${X(12)},${Y(12)}^FR^A0N,${F(20)},${F(20)}^FB${innerWidth},1,0,C^FD${courier} - WAYBILL^FS`,

      `^BY1,2,${Y(48)}`,
      `^FO${X(24)},${Y(42)}^BCN,${Y(48)},N,N,N^FD${awb}^FS`,
      `^FO${X(12)},${Y(94)}^A0N,${F(16)},${F(16)}^FB${innerWidth},1,0,C^FDAWB: ${awb} | INV: ${this.cleanZplText(waybill.invoiceNo, 14)}^FS`,
      `^FO${X(12)},${Y(112)}^GB${innerWidth},2,2^FS`,

      `^FO${X(14)},${Y(118)}^A0N,${F(19)},${F(19)}^FDTO: ${customer}^FS`,
      `^FO${X(14)},${Y(140)}^A0N,${F(17)},${F(17)}^FDTEL: ${phone}^FS`,
      `^FO${X(14)},${Y(160)}^A0N,${F(15)},${F(15)}^FB${innerWidth},2,0,L^FDADDR: ${addr}^FS`,

      `^FO${X(12)},${Y(204)}^GB${innerWidth},2,2^FS`,
      `^FO${X(14)},${Y(212)}^A0N,${F(14)},${F(14)}^FDFROM: VINTAGE VIBES UAE (+971554186086)^FS`,
      `^FO${X(12)},${Y(232)}^GB${innerWidth},${Y(44)},2^FS`,
      `^FO${X(18)},${Y(242)}^A0N,${F(26)},${F(24)}^FB${innerWidth - X(12)},1,0,C^FD${codText}^FS`,

      '^PQ1,0,1,Y',
      '^XZ'
    ].join('\n');
  }

  /**
   * Build 203dpi Native ZPL II for a POS Receipt / Gift Receipt summary label
   */
  public buildReceiptZpl(receipt: ZebraReceiptPayload): string {
    const widthMm = Math.max(50, Math.min(110, Number(receipt.widthMm) || 57));
    const heightMm = Math.max(35, Math.min(160, Number(receipt.heightMm) || 37));
    const widthDots = Math.round(widthMm * 8);
    const heightDots = Math.round(heightMm * 8);
    const sx = widthDots / 456;
    const sy = heightDots / 296;
    const sc = Math.min(sx, sy);

    const X = (v: number) => Math.max(0, Math.round(v * sx));
    const Y = (v: number) => Math.max(0, Math.round(v * sy));
    const F = (v: number) => Math.max(12, Math.round(v * sc));

    const inv = this.cleanZplText(receipt.invoiceNo || 'INV-POS', 22).toUpperCase();
    const cust = this.cleanZplText(receipt.customerName || 'WALK-IN CUSTOMER', 26).toUpperCase();
    const itemsCount = Array.isArray(receipt.items) ? receipt.items.length : 1;
    const total = Number(receipt.totalAmount || 0).toFixed(2);
    const headerTitle = receipt.isGift ? 'VINTAGE VIBES - GIFT SLIP' : 'VINTAGE VIBES - TAX RECEIPT';
    const innerWidth = widthDots - X(24);

    return [
      '^XA',
      '^CI28',
      `^PW${widthDots}`,
      `^LL${heightDots}`,
      '^LH0,0',
      '^MD12',

      `^FO${X(12)},${Y(10)}^A0N,${F(20)},${F(20)}^FB${innerWidth},1,0,C^FD${headerTitle}^FS`,
      `^FO${X(12)},${Y(32)}^A0N,${F(14)},${F(14)}^FB${innerWidth},1,0,C^FDTRN: 100482910300003 | TEL: +971554186086^FS`,
      `^FO${X(12)},${Y(50)}^GB${innerWidth},2,2^FS`,

      `^FO${X(14)},${Y(58)}^A0N,${F(18)},${F(18)}^FDINVOICE: ${inv}^FS`,
      `^FO${X(14)},${Y(80)}^A0N,${F(16)},${F(16)}^FDCUSTOMER: ${cust}^FS`,
      `^FO${X(14)},${Y(100)}^A0N,${F(16)},${F(16)}^FDITEMS: ${itemsCount} PCS | ${receipt.isGift ? 'GIFT EXCHANGE 14D' : `TOTAL: AED ${total}`}^FS`,

      `^BY1,2,${Y(52)}`,
      `^FO${X(24)},${Y(126)}^BCN,${Y(52)},N,N,N^FD${inv}^FS`,
      `^FO${X(12)},${Y(184)}^A0N,${F(16)},${F(16)}^FB${innerWidth},1,0,C^FD${inv}^FS`,

      `^FO${X(12)},${Y(212)}^GB${innerWidth},${Y(56)},2^FS`,
      `^FO${X(18)},${Y(226)}^A0N,${F(30)},${F(28)}^FB${innerWidth - X(12)},1,0,C^FD${receipt.isGift ? '*** GIFT RECEIPT ***' : `TOTAL: AED ${total}`}^FS`,

      '^PQ1,0,1,Y',
      '^XZ'
    ].join('\n');
  }

  /**
   * Dispatch a print job directly to the Windows Server Zebra ZPL Printer
   */
  public async dispatchPrintJob(req: ZebraPrintJobRequest): Promise<{
    success: boolean;
    printerName: string;
    jobType: string;
    bytesWritten?: number;
    labelsPrinted: number;
    message: string;
    zplPreview?: string;
    error?: string;
  }> {
    const status = await this.getServerPrinterStatus();
    const targetPrinter = (req.printerName || status.printerName || this.defaultPrinterName).trim();
    const copies = Math.max(1, Math.min(50, Number(req.copies || req.label?.copies || 1)));

    let zplPayload = '';
    let title = req.jobType;
    let labelsPrinted = copies;

    if (req.jobType === 'RAW_ZPL' && req.rawZpl) {
      zplPayload = req.rawZpl;
      title = 'Custom ZPL Label';
    } else if (req.jobType === 'BALE_TAG' && req.bale) {
      zplPayload = this.buildBaleTagZpl({
        ...req.bale,
        widthMm: req.widthMm || req.bale.widthMm,
        heightMm: req.heightMm || req.bale.heightMm
      });
      title = `Bale Tag ${req.bale.baleCode}`;
      labelsPrinted = 1;
    } else if (req.jobType === 'BATCH_BALE_TAGS' && Array.isArray(req.bales) && req.bales.length > 0) {
      zplPayload = req.bales
        .map(b =>
          this.buildBaleTagZpl({
            ...b,
            widthMm: req.widthMm || b.widthMm,
            heightMm: req.heightMm || b.heightMm
          })
        )
        .join('\n');
      title = `Batch Bale Tags (${req.bales.length} Bales)`;
      labelsPrinted = req.bales.length;
    } else if (req.jobType === 'SHIPPING_WAYBILL' && req.waybill) {
      zplPayload = this.buildShippingWaybillZpl({
        ...req.waybill,
        widthMm: req.widthMm || req.waybill.widthMm,
        heightMm: req.heightMm || req.waybill.heightMm
      });
      title = `Waybill ${req.waybill.waybillNo}`;
      labelsPrinted = 1;
    } else if ((req.jobType === 'POS_RECEIPT' || req.jobType === 'GIFT_RECEIPT') && req.receipt) {
      zplPayload = this.buildReceiptZpl({
        ...req.receipt,
        isGift: req.jobType === 'GIFT_RECEIPT' || req.receipt.isGift,
        widthMm: req.widthMm || req.receipt.widthMm,
        heightMm: req.heightMm || req.receipt.heightMm
      });
      title = `${req.jobType === 'GIFT_RECEIPT' ? 'Gift Receipt' : 'POS Receipt'} ${req.receipt.invoiceNo}`;
      labelsPrinted = 1;
    } else {
      const labelData: ZebraGarmentLabelPayload = req.label || {
        itemCode: 'VV-TEST-2026',
        description: 'VINTAGE VIBES TEST STICKER',
        brand: 'Vintage Vibes',
        category: 'Apparel',
        size: 'L',
        grade: 'Super Cream',
        retailPriceAed: 150,
        widthMm: req.widthMm || 57,
        heightMm: req.heightMm || 37
      };
      zplPayload = this.buildGarmentLabelZpl(
        {
          ...labelData,
          widthMm: req.widthMm || labelData.widthMm || 57,
          heightMm: req.heightMm || labelData.heightMm || 37
        },
        copies
      );
      title = `Sticker ${labelData.itemCode} (${labelData.size || 'L'})`;
    }

    const tmpZplFile = path.join(
      os.tmpdir(),
      `vv_zebra_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zpl`
    );

    try {
      fs.writeFileSync(tmpZplFile, zplPayload, 'utf8');
      const ps1Path = this.getOrWriteSpoolerPs1Path();

      const { stdout, stderr } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, '-PrinterName', targetPrinter, '-ZplFilePath', tmpZplFile],
        { timeout: 12000 }
      );

      const outStr = String(stdout || '').trim();
      const ok = outStr.includes('SPOOL_OK');

      this.printHistory.unshift({
        id: `PJ-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toLocaleTimeString('en-GB'),
        jobType: req.jobType,
        title,
        printerName: targetPrinter,
        copies: labelsPrinted,
        success: ok,
        error: ok ? undefined : String(stderr || outStr)
      });
      if (this.printHistory.length > 50) this.printHistory.pop();

      return {
        success: ok,
        printerName: targetPrinter,
        jobType: req.jobType,
        bytesWritten: Buffer.byteLength(zplPayload, 'utf8'),
        labelsPrinted,
        message: ok
          ? `Printed ${labelsPrinted} label(s) directly on Server Printer (${targetPrinter})`
          : `Printer spool warning: ${outStr || stderr}`,
        zplPreview: zplPayload
      };
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to spool ZPL to Windows printer';
      this.printHistory.unshift({
        id: `PJ-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toLocaleTimeString('en-GB'),
        jobType: req.jobType,
        title,
        printerName: targetPrinter,
        copies: labelsPrinted,
        success: false,
        error: errMsg
      });
      if (this.printHistory.length > 50) this.printHistory.pop();

      return {
        success: false,
        printerName: targetPrinter,
        jobType: req.jobType,
        labelsPrinted: 0,
        message: `Server Printer Error (${targetPrinter}): ${errMsg}`,
        error: errMsg,
        zplPreview: zplPayload
      };
    } finally {
      try {
        if (fs.existsSync(tmpZplFile)) fs.unlinkSync(tmpZplFile);
      } catch (_) {}
    }
  }
}

export const zebraPrintService = new ZebraPrintService();
