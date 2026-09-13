import { z } from 'zod';

// ============================================================================
// 1. FINANCE & VOUCHER VALIDATION SCHEMAS
// ============================================================================

export const VoucherLineSchema = z.object({
  accountId: z.string().min(1, 'Debit/Operating account selection is required'),
  creditAccId: z.string().optional().nullable(),
  debitAmount: z.number().min(0, 'Debit amount must be non-negative'),
  creditAmount: z.number().min(0, 'Credit amount must be non-negative'),
  foreignDebit: z.number().optional(),
  foreignCredit: z.number().optional(),
  memo: z.string().optional().nullable()
});

export const VoucherInputSchema = z.object({
  voucherNo: z.string().optional(),
  type: z.enum(['JV', 'BRV', 'BPV', 'CRV', 'CPV']),
  date: z.string().min(1, 'Voucher posting date is required'),
  narration: z.string().trim().min(3, 'Narration must be at least 3 characters long for audit compliance'),
  currency: z.string().min(2, 'Currency must be specified').default('AED'),
  exchangeRate: z.number().positive('Exchange rate must be strictly positive (> 0)').default(1.0),
  baseCurrency: z.string().optional().default('AED'),
  foreignTotalAmount: z.number().optional(),
  foreignTotalDebit: z.number().optional(),
  foreignTotalCredit: z.number().optional(),
  totalDebit: z.number().min(0, 'Total debit must be non-negative'),
  totalCredit: z.number().min(0, 'Total credit must be non-negative'),
  status: z.enum(['DRAFT', 'POSTED', 'UNPOSTED']).optional().default('DRAFT'),
  lines: z.array(VoucherLineSchema).min(1, 'A voucher must contain at least 1 transactional line entry')
}).refine(data => {
  // Dual-entry balancing rule: Total Debit must equal Total Credit
  const diff = Math.abs(data.totalDebit - data.totalCredit);
  return diff < 0.05;
}, {
  message: 'Dual-entry accounting rule violated: Total Debit must exactly equal Total Credit',
  path: ['totalCredit']
});

export const COAAccountInputSchema = z.object({
  code: z.string().regex(/^[0-9]{4}-[0-9]{2}(-[0-9]{3})?$/, 'Account code must follow 5-tier format (e.g., 1010-00 or 1010-01-001)'),
  name: z.string().trim().min(2, 'Account title must be at least 2 characters'),
  classification: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  tierLevel: z.number().int().min(1).max(5).default(3),
  parentCode: z.string().optional().nullable(),
  currency: z.enum(['AED', 'USD', 'PKR']).default('AED'),
  currentBalance: z.number().default(0)
});

// ============================================================================
// 2. PURCHASE & BALE INWARD VALIDATION SCHEMAS
// ============================================================================

export const PurchaseInvoiceItemInputSchema = z.object({
  itemId: z.string().min(1, 'Item classification is required'),
  packagingUom: z.enum(['BAGS', 'BALES', 'SACKS']).default('BALES'),
  packageCount: z.number().int().positive('Package count must be at least 1 bale/sack'),
  weightUom: z.enum(['KG', 'LBS']).default('KG'),
  totalWeight: z.number().positive('Bale gross weight must be greater than 0 kg'),
  ratePerWeight: z.number().min(0, 'Rate per kg must be non-negative'),
  lineTotal: z.number().min(0)
});

export const PurchaseInvoiceInputSchema = z.object({
  invoiceNo: z.string().optional(),
  supplierId: z.string().min(1, 'Supplier party selection is required'),
  date: z.string().min(1, 'Invoice date is required'),
  currency: z.enum(['AED', 'USD', 'PKR']).default('AED'),
  exchangeRate: z.number().positive().default(1.0),
  subTotal: z.number().min(0, 'Subtotal must be non-negative'),
  vatRatePercent: z.number().min(0).max(100).default(5.0),
  vatAmount: z.number().min(0).default(0),
  totalAmount: z.number().min(0),
  freightAmount: z.number().min(0).optional().default(0),
  customsDutyAmount: z.number().min(0).optional().default(0),
  terminalHandlingAmount: z.number().min(0).optional().default(0),
  notes: z.string().optional().nullable(),
  items: z.array(PurchaseInvoiceItemInputSchema).min(1, 'Purchase invoice must include at least one bale line item')
});

export const PieceBreakdownInputSchema = z.object({
  barcode: z.string().trim().min(3, 'Barcode must be at least 3 characters'),
  itemName: z.string().min(1, 'Garment item name is required'),
  brandName: z.string().optional().default('Unbranded Vintage'),
  labelGrade: z.string().optional().default('GRADE_A'),
  sizeScanned: z.string().optional().default('Standard'),
  weightKg: z.number().positive('Garment piece weight must be greater than 0 kg'),
  estimatedPrice: z.number().min(0, 'Estimated retail price must be non-negative')
});

// ============================================================================
// 3. SALES & DISPATCH VALIDATION SCHEMAS
// ============================================================================

export const SalesGatePassItemInputSchema = z.object({
  pieceId: z.string().min(1, 'Piece reference ID is required'),
  barcode: z.string().min(1, 'Barcode is required'),
  unitPrice: z.number().min(0, 'Unit price must be non-negative'),
  discountPercent: z.number().min(0).max(100).default(0),
  netPrice: z.number().min(0)
});

export const SalesGatePassInputSchema = z.object({
  customerId: z.string().min(1, 'Wholesale customer selection is required'),
  customerName: z.string().optional(),
  date: z.string().min(1, 'Dispatch date is required'),
  items: z.array(SalesGatePassItemInputSchema).min(1, 'Gate pass must contain at least 1 item for dispatch')
});

export const SalesInvoiceInputSchema = z.object({
  salesGatePassId: z.string().optional().nullable(),
  clientId: z.string().min(1, 'Client party is required'),
  date: z.string().min(1, 'Invoice date is required'),
  currency: z.enum(['AED', 'USD', 'PKR']).default('AED'),
  exchangeRate: z.number().positive().default(1.0),
  subTotal: z.number().min(0),
  discountAmount: z.number().min(0).default(0),
  vatRatePercent: z.number().min(0).default(5.0),
  vatAmount: z.number().min(0),
  grossAmount: z.number().min(0)
});

// ============================================================================
// 4. PARTIES KHATA VALIDATION SCHEMAS
// ============================================================================

export const PartyInputSchema = z.object({
  name: z.string().trim().min(2, 'Party name must be at least 2 characters'),
  type: z.enum(['CLIENT', 'SUPPLIER', 'AGENT']),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().trim().min(5, 'Valid contact phone number is required'),
  email: z.string().email('Invalid email address format').optional().or(z.literal('')),
  address: z.string().optional().nullable(),
  trnNo: z.string().optional().nullable(),
  creditLimit: z.number().min(0, 'Credit limit must be non-negative').default(50000),
  currency: z.enum(['AED', 'USD', 'PKR']).default('AED')
});

// ============================================================================
// 5. HR & PAYROLL VALIDATION SCHEMAS
// ============================================================================

export const EmployeeInputSchema = z.object({
  name: z.string().trim().min(2, 'Employee full name is required'),
  designation: z.string().trim().min(2, 'Designation is required'),
  department: z.string().optional().default('Warehouse & Sortery'),
  baseSalary: z.number().positive('Base monthly salary must be positive'),
  housingAllow: z.number().min(0).default(0),
  transportAllow: z.number().min(0).default(0),
  workingHoursPerDay: z.number().int().min(1).max(24).default(8)
});

export const AttendanceInputSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format (e.g., 2026-09)'),
  daysWorked: z.number().int().min(0).max(31, 'Days worked cannot exceed 31'),
  overtimeHours: z.number().min(0, 'Overtime hours must be non-negative').default(0)
});

// Helper for validating and parsing with formatted error output
export function validateWithZod<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string; details: any } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const formattedErrors = result.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
  return {
    success: false,
    error: `Validation Error: ${formattedErrors}`,
    details: result.error.flatten()
  };
}
