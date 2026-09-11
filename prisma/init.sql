-- ============================================================================
-- VINTAGE VIBES ENTERPRISE ERP - POSTGRESQL INITIALIZATION & SCHEMA DDL
-- Generated for PostgreSQL 13+ / Cloud SQL / Supabase / Neon / RDS
-- Compatible with prisma/schema.prisma
-- ============================================================================

-- Step 0: Ensure Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 1: ENUM TYPES (Created safely if not already present)
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'UNPOSTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "RoleType" AS ENUM ('ADMIN', 'MANAGER', 'ACCOUNTANT', 'INVENTORY_SUPERVISOR', 'SALES_EXECUTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ModuleType" AS ENUM ('AUTH', 'SETUP', 'FINANCE', 'PARTIES', 'HR', 'PURCHASE', 'INVENTORY', 'SALES', 'AUDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ActionType" AS ENUM ('CREATE', 'EDIT', 'DELETE', 'POST', 'UNPOST', 'VIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AccountClassification" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "VoucherType" AS ENUM ('JV', 'BRV', 'BPV', 'CRV', 'CPV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "PartyType" AS ENUM ('CLIENT', 'SUPPLIER', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "CurrencyCode" AS ENUM ('AED', 'USD', 'PKR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "PackagingUOM" AS ENUM ('BAGS', 'BALES', 'SACKS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "WeightUOM" AS ENUM ('KG', 'LBS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- STEP 2: MODULE 1 & 2 - USERS & ACCESS CONTROL
-- ============================================================================
CREATE TABLE IF NOT EXISTS "users" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "RoleType" NOT NULL DEFAULT 'ACCOUNTANT',
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "user_permissions" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" VARCHAR(64) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "module" "ModuleType" NOT NULL,
    "canCreate" BOOLEAN NOT NULL DEFAULT FALSE,
    "canEdit" BOOLEAN NOT NULL DEFAULT FALSE,
    "canDelete" BOOLEAN NOT NULL DEFAULT FALSE,
    "canPost" BOOLEAN NOT NULL DEFAULT FALSE,
    "canUnpost" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_permissions_user_module_uniq" UNIQUE ("userId", "module")
);

-- ============================================================================
-- STEP 3: MODULE 3 - GLOBAL SETUP & MASTER CATALOGUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "company_profile" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT 'default-company',
    "companyName" VARCHAR(255) NOT NULL DEFAULT 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    "addressLine1" VARCHAR(255) NOT NULL DEFAULT 'Plot 42, Industrial Zone 3, Al Quoz',
    "addressLine2" VARCHAR(255) NOT NULL DEFAULT 'Dubai Wholesale Garments Hub, UAE',
    "trnTaxNo" VARCHAR(64) NOT NULL DEFAULT 'TRN-100482910300003',
    "defaultCurrency" "CurrencyCode" NOT NULL DEFAULT 'AED',
    "logoUrl" TEXT NOT NULL DEFAULT '/vintage_vibes_seal.svg',
    "phone" VARCHAR(64) NOT NULL DEFAULT '+971 4 883 9120',
    "email" VARCHAR(255) NOT NULL DEFAULT 'contact@vintagevibe.ae',
    "vatRatePercent" NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "currency_master" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "code" "CurrencyCode" NOT NULL UNIQUE,
    "name" VARCHAR(64) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "exchangeRate" NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    "isBase" BOOLEAN NOT NULL DEFAULT FALSE,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "item_masters" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "basePrice" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "targetUom" "WeightUOM" NOT NULL DEFAULT 'KG',
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "label_grades" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "sortOrder" INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "brand_masters" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" VARCHAR(128) NOT NULL UNIQUE,
    "tier" VARCHAR(64) NOT NULL DEFAULT 'Premium Vintage',
    "origin" VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS "shop_masters" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "shopNo" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "managerName" VARCHAR(128),
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- STEP 4: MODULE 4 - 5-TIER CHART OF ACCOUNTS & DUAL-ENTRY LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS "coa_accounts" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "classification" "AccountClassification" NOT NULL,
    "tierLevel" INT NOT NULL DEFAULT 3,
    "parentCode" VARCHAR(64),
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AED',
    "currentBalance" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "vouchers" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "voucherNo" VARCHAR(64) NOT NULL UNIQUE,
    "type" "VoucherType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "narration" TEXT NOT NULL,
    "totalDebit" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "totalCredit" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AED',
    "exchangeRate" NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    "postedAt" TIMESTAMP(3),
    "postedBy" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_voucher_balance" CHECK (ABS("totalDebit" - "totalCredit") < 0.05 OR "status" = 'DRAFT')
);

CREATE TABLE IF NOT EXISTS "voucher_lines" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "voucherId" VARCHAR(64) NOT NULL REFERENCES "vouchers"("id") ON DELETE CASCADE,
    "accountId" VARCHAR(64) NOT NULL REFERENCES "coa_accounts"("id"),
    "creditAccId" VARCHAR(64) REFERENCES "coa_accounts"("id"),
    "debitAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "creditAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "memo" TEXT
);

-- ============================================================================
-- STEP 5: MODULE 5 - PARTIES KHATA (CRM, CUSTOMERS & VENDORS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "parties" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "code" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "type" "PartyType" NOT NULL,
    "contactPerson" VARCHAR(128),
    "phone" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255),
    "address" TEXT,
    "trnNo" VARCHAR(64),
    "creditLimit" NUMERIC(14, 2) NOT NULL DEFAULT 50000.00,
    "currentBalance" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AED',
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "party_account_maps" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "partyId" VARCHAR(64) NOT NULL UNIQUE REFERENCES "parties"("id") ON DELETE CASCADE,
    "receivableAccId" VARCHAR(64) UNIQUE REFERENCES "coa_accounts"("id"),
    "payableAccId" VARCHAR(64) REFERENCES "coa_accounts"("id"),
    "clearingAccId" VARCHAR(64),
    "revenueAccId" VARCHAR(64),
    "commissionAccId" VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS "party_khata_logs" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "partyId" VARCHAR(64) NOT NULL REFERENCES "parties"("id") ON DELETE CASCADE,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "docType" VARCHAR(64) NOT NULL,
    "docRef" VARCHAR(64) NOT NULL,
    "debit" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "credit" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "balance" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "description" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "ledger_entries" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "voucherId" VARCHAR(64) NOT NULL REFERENCES "vouchers"("id") ON DELETE CASCADE,
    "accountId" VARCHAR(64) NOT NULL REFERENCES "coa_accounts"("id"),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "debit" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "credit" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "runningBalance" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "documentRef" VARCHAR(64) NOT NULL,
    "partyId" VARCHAR(64) REFERENCES "parties"("id"),
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP 6: MODULE 6 - HR, ATTENDANCE & PAYROLL
-- ============================================================================
CREATE TABLE IF NOT EXISTS "employees" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "empCode" VARCHAR(64) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "designation" VARCHAR(128) NOT NULL,
    "department" VARCHAR(128) NOT NULL DEFAULT 'Warehouse & Sortery',
    "baseSalary" NUMERIC(12, 2) NOT NULL DEFAULT 3500.00,
    "housingAllow" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "transportAllow" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "workingHoursPerDay" INT NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "joiningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "employeeId" VARCHAR(64) NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "monthYear" VARCHAR(16) NOT NULL,
    "daysWorked" INT NOT NULL DEFAULT 30,
    "overtimeHours" NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_emp_month_uniq" UNIQUE ("employeeId", "monthYear")
);

CREATE TABLE IF NOT EXISTS "payroll_records" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "employeeId" VARCHAR(64) NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
    "monthYear" VARCHAR(16) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "baseSalary" NUMERIC(12, 2) NOT NULL,
    "allowances" NUMERIC(12, 2) NOT NULL,
    "dailyRate" NUMERIC(10, 2) NOT NULL,
    "hourlyRate" NUMERIC(10, 2) NOT NULL,
    "daysWorked" INT NOT NULL,
    "overtimeHours" NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    "earnedBasic" NUMERIC(12, 2) NOT NULL,
    "overtimePay" NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    "grossPay" NUMERIC(12, 2) NOT NULL,
    "netPay" NUMERIC(12, 2) NOT NULL,
    "disbursedDate" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_emp_month_uniq" UNIQUE ("employeeId", "monthYear")
);

-- ============================================================================
-- STEP 7: MODULE 7 - USED CLOTHING BALES PURCHASE & SACK OCR BREAKDOWN
-- ============================================================================
CREATE TABLE IF NOT EXISTS "purchase_invoices" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "invoiceNo" VARCHAR(64) NOT NULL UNIQUE,
    "supplierId" VARCHAR(64) NOT NULL REFERENCES "parties"("id"),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AED',
    "exchangeRate" NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    "subTotal" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "vatAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "totalAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "convertedToInward" BOOLEAN NOT NULL DEFAULT FALSE,
    "inwardGatePassId" VARCHAR(64) UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "purchase_invoice_items" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "invoiceId" VARCHAR(64) NOT NULL REFERENCES "purchase_invoices"("id") ON DELETE CASCADE,
    "itemId" VARCHAR(64) NOT NULL REFERENCES "item_masters"("id"),
    "packagingUom" "PackagingUOM" NOT NULL DEFAULT 'BALES',
    "packageCount" INT NOT NULL DEFAULT 1,
    "weightUom" "WeightUOM" NOT NULL DEFAULT 'KG',
    "totalWeight" NUMERIC(10, 2) NOT NULL,
    "ratePerWeight" NUMERIC(10, 2) NOT NULL,
    "lineTotal" NUMERIC(14, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "inward_gate_passes" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "gatePassNo" VARCHAR(64) NOT NULL UNIQUE,
    "purchaseInvoiceId" VARCHAR(64) NOT NULL UNIQUE REFERENCES "purchase_invoices"("id"),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "totalBaleWeight" NUMERIC(10, 2) NOT NULL,
    "brokenDownWeight" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "remainingWeight" NUMERIC(10, 2) NOT NULL,
    "pieceCount" INT NOT NULL DEFAULT 0,
    "vehicleNo" VARCHAR(64),
    "containerNo" VARCHAR(64),
    "receivedBy" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "inward_gate_pass_pieces" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "gatePassId" VARCHAR(64) NOT NULL REFERENCES "inward_gate_passes"("id") ON DELETE CASCADE,
    "barcode" VARCHAR(64) NOT NULL UNIQUE,
    "itemId" VARCHAR(64) NOT NULL REFERENCES "item_masters"("id"),
    "brandId" VARCHAR(64) REFERENCES "brand_masters"("id"),
    "labelGradeId" VARCHAR(64) REFERENCES "label_grades"("id"),
    "shopId" VARCHAR(64) REFERENCES "shop_masters"("id"),
    "brandScanned" VARCHAR(128),
    "sizeScanned" VARCHAR(64),
    "countryOfOrigin" VARCHAR(64),
    "style" VARCHAR(128),
    "tagImageUrl" TEXT,
    "ocrConfidence" NUMERIC(5, 2),
    "weightKg" NUMERIC(8, 3) NOT NULL,
    "estimatedPrice" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "isSold" BOOLEAN NOT NULL DEFAULT FALSE,
    "soldInvoiceId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP 8: MODULE 8 - SALES WORKFLOW (GATE PASS & TAX INVOICE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "sales_gate_passes" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "gatePassNo" VARCHAR(64) NOT NULL UNIQUE,
    "customerId" VARCHAR(64) NOT NULL REFERENCES "parties"("id"),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPieces" INT NOT NULL DEFAULT 0,
    "totalWeight" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "estimatedAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "isConverted" BOOLEAN NOT NULL DEFAULT FALSE,
    "salesInvoiceId" VARCHAR(64) UNIQUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sales_gate_pass_items" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "salesGatePassId" VARCHAR(64) NOT NULL REFERENCES "sales_gate_passes"("id") ON DELETE CASCADE,
    "pieceId" VARCHAR(64) NOT NULL REFERENCES "inward_gate_pass_pieces"("id"),
    "barcode" VARCHAR(64) NOT NULL,
    "unitPrice" NUMERIC(10, 2) NOT NULL,
    "discountPercent" NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    "netPrice" NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_invoices" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "invoiceNo" VARCHAR(64) NOT NULL UNIQUE,
    "salesGatePassId" VARCHAR(64) UNIQUE REFERENCES "sales_gate_passes"("id"),
    "customerId" VARCHAR(64) NOT NULL REFERENCES "parties"("id"),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'AED',
    "exchangeRate" NUMERIC(10, 4) NOT NULL DEFAULT 1.0000,
    "subTotal" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "discountAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "vatAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "totalAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    "postedAt" TIMESTAMP(3),
    "postedBy" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "sales_invoice_items" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "invoiceId" VARCHAR(64) NOT NULL REFERENCES "sales_invoices"("id") ON DELETE CASCADE,
    "barcode" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "weightKg" NUMERIC(8, 3) NOT NULL DEFAULT 0.500,
    "unitPrice" NUMERIC(10, 2) NOT NULL,
    "discount" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "finalAmount" NUMERIC(10, 2) NOT NULL
);

-- ============================================================================
-- STEP 9: MODULE 9 - ENTERPRISE AUDIT LOG & COMPLIANCE
-- ============================================================================
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "module" "ModuleType" NOT NULL,
    "action" "ActionType" NOT NULL,
    "documentRef" VARCHAR(64) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "userId" VARCHAR(64) REFERENCES "users"("id"),
    "userName" VARCHAR(128) NOT NULL DEFAULT 'System Admin',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(64),
    "details" TEXT NOT NULL,
    "metaPayload" TEXT
);

-- ============================================================================
-- STEP 10: HIGH-PERFORMANCE QUERY INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email");
CREATE INDEX IF NOT EXISTS "idx_vouchers_date_status" ON "vouchers"("date", "status");
CREATE INDEX IF NOT EXISTS "idx_voucher_lines_voucher" ON "voucher_lines"("voucherId");
CREATE INDEX IF NOT EXISTS "idx_voucher_lines_account" ON "voucher_lines"("accountId");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_acc_date" ON "ledger_entries"("accountId", "date");
CREATE INDEX IF NOT EXISTS "idx_ledger_entries_party" ON "ledger_entries"("partyId");
CREATE INDEX IF NOT EXISTS "idx_parties_code_type" ON "parties"("code", "type");
CREATE INDEX IF NOT EXISTS "idx_pieces_barcode" ON "inward_gate_pass_pieces"("barcode");
CREATE INDEX IF NOT EXISTS "idx_pieces_gatepass" ON "inward_gate_pass_pieces"("gatePassId");
CREATE INDEX IF NOT EXISTS "idx_pieces_isSold" ON "inward_gate_pass_pieces"("isSold");
CREATE INDEX IF NOT EXISTS "idx_purchase_inv_status" ON "purchase_invoices"("status");
CREATE INDEX IF NOT EXISTS "idx_sales_inv_status" ON "sales_invoices"("status");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_module_ref" ON "audit_logs"("module", "documentRef");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_timestamp" ON "audit_logs"("timestamp" DESC);

-- ============================================================================
-- STEP 11: SEED ESSENTIAL ENTERPRISE MASTER DATA
-- ============================================================================

-- 1. Default Company Profile
INSERT INTO "company_profile" ("id", "companyName", "addressLine1", "addressLine2", "trnTaxNo", "defaultCurrency", "phone", "email", "vatRatePercent")
VALUES (
    'default-company',
    'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C',
    'Plot 42, Industrial Zone 3, Al Quoz',
    'Dubai Wholesale Garments Hub, UAE',
    'TRN-100482910300003',
    'AED',
    '+971 4 883 9120',
    'contact@vintagevibe.ae',
    5.00
) ON CONFLICT ("id") DO NOTHING;

-- 2. Base Currencies
INSERT INTO "currency_master" ("id", "code", "name", "symbol", "exchangeRate", "isBase")
VALUES 
    ('cur-aed', 'AED', 'UAE Dirham', 'AED', 1.0000, TRUE),
    ('cur-usd', 'USD', 'US Dollar', '$', 3.6725, FALSE),
    ('cur-pkr', 'PKR', 'Pakistani Rupee', 'Rs', 0.0132, FALSE)
ON CONFLICT ("code") DO NOTHING;

-- 3. Label Grades
INSERT INTO "label_grades" ("id", "code", "name", "description", "sortOrder")
VALUES
    ('lg-1', 'GRADE_A_CREAM', 'Grade A+ (Cream Vintage)', 'Mint condition, high-brand retail items', 1),
    ('lg-2', 'GRADE_A', 'Grade A (Standard Vintage)', 'Excellent condition 90s vintage clothing', 2),
    ('lg-3', 'GRADE_B', 'Grade B (Thrift & Workwear)', 'Minor wear, highly popular distress fashion', 3),
    ('lg-4', 'REJECT_RAGS', 'Reject / Rags / Upcycle', 'Defective items for raw fabric recycling', 4)
ON CONFLICT ("code") DO NOTHING;

-- 4. Brands
INSERT INTO "brand_masters" ("id", "name", "tier", "origin")
VALUES
    ('br-1', 'Levi''s', 'Heritage American', 'USA'),
    ('br-2', 'Carhartt', 'Vintage Workwear', 'USA'),
    ('br-3', 'Ralph Lauren', 'Classic Premium', 'USA'),
    ('br-4', 'Tommy Hilfiger', '90s Pop Culture', 'USA'),
    ('br-5', 'Nike', 'Sportswear Vintage', 'USA'),
    ('br-6', 'Burberry', 'Luxury Heritage', 'UK')
ON CONFLICT ("name") DO NOTHING;

-- 5. Standard 5-Tier Chart of Accounts (COA)
INSERT INTO "coa_accounts" ("id", "code", "name", "classification", "tierLevel", "currency", "isSystem", "currentBalance")
VALUES
    -- ASSETS
    ('coa-1010', '1010-00', 'Cash on Hand (Al Quoz Vault)', 'ASSET', 3, 'AED', TRUE, 45000.00),
    ('coa-1020', '1020-00', 'Emirates NBD Corporate Account', 'ASSET', 3, 'AED', TRUE, 128500.00),
    ('coa-1110', '1110-00', 'Accounts Receivable (Trade Debtors)', 'ASSET', 3, 'AED', TRUE, 64200.00),
    ('coa-1210', '1210-00', 'Raw Bales Inventory (Unopened Stock)', 'ASSET', 3, 'AED', TRUE, 95000.00),
    ('coa-1220', '1220-00', 'Graded & OCR Barcoded Garment Stock', 'ASSET', 3, 'AED', TRUE, 142300.00),
    ('coa-1310', '1310-00', 'Input VAT Recoverable (5% FTA)', 'ASSET', 3, 'AED', TRUE, 7850.00),
    
    -- LIABILITIES
    ('coa-2110', '2110-00', 'Accounts Payable (Overseas Suppliers)', 'LIABILITY', 3, 'AED', TRUE, -52000.00),
    ('coa-2210', '2210-00', 'Output VAT Payable (5% FTA Box 1b)', 'LIABILITY', 3, 'AED', TRUE, -11450.00),
    ('coa-2310', '2310-00', 'Salaries & Wages Payable', 'LIABILITY', 3, 'AED', TRUE, -18500.00),
    ('coa-2410', '2410-00', 'UAE Corporate Tax Payable (9%)', 'LIABILITY', 3, 'AED', TRUE, 0.00),
    
    -- EQUITY
    ('coa-3010', '3010-00', 'Shareholder Paid-Up Capital', 'EQUITY', 3, 'AED', TRUE, -200000.00),
    ('coa-3020', '3020-00', 'Retained Earnings', 'EQUITY', 3, 'AED', TRUE, -198900.00),

    -- REVENUE
    ('coa-4010', '4010-00', 'Wholesale Graded Garments Sales', 'REVENUE', 3, 'AED', TRUE, 0.00),
    ('coa-4020', '4020-00', 'Bulk Unopened Bale Sales', 'REVENUE', 3, 'AED', TRUE, 0.00),
    ('coa-4030', '4030-00', 'Sorting & Grading Processing Fee', 'REVENUE', 3, 'AED', TRUE, 0.00),

    -- EXPENSES
    ('coa-5010', '5010-00', 'Cost of Goods Sold (Bale Inward)', 'EXPENSE', 3, 'AED', TRUE, 0.00),
    ('coa-5110', '5110-00', 'Sea Freight & Container Clearance', 'EXPENSE', 3, 'AED', TRUE, 0.00),
    ('coa-5120', '5120-00', 'Dubai Customs Duty (5%)', 'EXPENSE', 3, 'AED', TRUE, 0.00),
    ('coa-5210', '5210-00', 'Al Quoz Warehouse Lease & Rent', 'EXPENSE', 3, 'AED', TRUE, 0.00),
    ('coa-5310', '5310-00', 'Warehouse Staff Salaries & Labor', 'EXPENSE', 3, 'AED', TRUE, 0.00),
    ('coa-5410', '5410-00', 'Utilities & Electricity (DEWA)', 'EXPENSE', 3, 'AED', TRUE, 0.00),
    ('coa-5510', '5510-00', 'UAE Corporate Tax Expense (9%)', 'EXPENSE', 3, 'AED', TRUE, 0.00)
ON CONFLICT ("code") DO NOTHING;

-- 6. Initial Admin & Manager Users
INSERT INTO "users" ("id", "email", "name", "passwordHash", "role", "isActive")
VALUES
    ('usr-admin-01', 'admin@vintagevibe.ae', 'Tariq Al-Mansoor', 'scrypt:admin:2026', 'ADMIN', TRUE),
    ('usr-acct-01', 'accounts@vintagevibe.ae', 'Farooq Accountant', 'scrypt:finance:2026', 'ACCOUNTANT', TRUE),
    ('usr-inv-01', 'inventory@vintagevibe.ae', 'Bilal Bale Master', 'scrypt:wh:2026', 'INVENTORY_SUPERVISOR', TRUE)
ON CONFLICT ("email") DO NOTHING;

-- 7. Grant Full Admin Permissions
INSERT INTO "user_permissions" ("id", "userId", "module", "canCreate", "canEdit", "canDelete", "canPost", "canUnpost")
VALUES
    ('perm-adm-1', 'usr-admin-01', 'FINANCE', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('perm-adm-2', 'usr-admin-01', 'PURCHASE', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('perm-adm-3', 'usr-admin-01', 'SALES', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('perm-adm-4', 'usr-admin-01', 'PARTIES', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('perm-adm-5', 'usr-admin-01', 'HR', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('perm-adm-6', 'usr-admin-01', 'SETUP', TRUE, TRUE, TRUE, TRUE, TRUE),
    ('perm-adm-7', 'usr-admin-01', 'AUDIT', TRUE, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT ("userId", "module") DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
SELECT 'PostgreSQL Enterprise Schema Initialization Succeeded!' AS status,
       (SELECT COUNT(*) FROM "coa_accounts") AS coa_accounts_seeded,
       (SELECT COUNT(*) FROM "currency_master") AS currencies_seeded,
       (SELECT COUNT(*) FROM "users") AS users_seeded;
