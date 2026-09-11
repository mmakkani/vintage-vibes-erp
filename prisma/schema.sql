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
