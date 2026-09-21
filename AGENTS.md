# Agent Guidelines & Workflow Rules

## Git Commit & Push Confirmation Rule
Whenever you complete any code changes, bug fixes, or backend updates and verify the build, ALWAYS ask the user for confirmation before ending the task:
"Work completed. Should I commit and push these changes to git now?"
Do not leave uncommitted changes without asking.

## Strict Code & Schema Freeze on Registry (Parties) Module 🔒
- Effective immediately, a strict **CODE & DATABASE SCHEMA FREEZE** is in effect for the Registry / Parties module:
  - **Code Freeze**: Treat all files related to Registry / Parties as **STRICTLY READ-ONLY** (e.g., `src/modules/parties/*`, `src/modules/registry/*`, `src/services/partiesService.ts`, `api/parties/*`, and related routes/controllers).
  - **Database Schema Freeze**: Absolutely **NO DDL operations** (such as `ALTER TABLE`, `DROP TABLE`, `CREATE TABLE`, column modifications, constraint alterations, or function/RPC replacements) are permitted on `public.parties`, `public.visiting_cards`, or related stored functions (e.g., `create_party_with_coa`).
- Reject any request to modify, add, or refactor code or schema in this module unless the user explicitly provides the exact authorization override phrase: `"AUTHORIZE UNLOCK REGISTRY"`.

## Strict Code & Schema Freeze on HR & Payroll Modules 🔒
- Effective immediately, a strict **CODE & DATABASE SCHEMA FREEZE** is in effect for all files and tables related to HR and Payroll:
  - **Code Freeze**: Treat all HR & Payroll files as **STRICTLY READ-ONLY** (e.g., `src/modules/hr/*`, `src/services/hrService.ts`, `src/services/payrollService.ts`, `api/hr/*`, `scripts/*payroll*`).
  - **Database Schema Freeze**: Absolutely **NO structural changes (DDL operations like ALTER TABLE, DROP TABLE, CREATE TABLE, or constraint alterations)** are allowed on:
    - `public.employees`
    - `public.employee_attendance`
    - `public.staff_attendance`
    - `public.hr_attendance_sheets`
    - `public.employee_payroll`
    - `public.hr_payroll_sheets`
- Reject any request to modify, add, or refactor logic, UI, or database schemas in these modules unless the user explicitly provides the exact authorization override phrase: `"AUTHORIZE UNLOCK HR"`.

## Strict Code & Schema Freeze on Access Control & RBAC Modules 🔒
- Effective immediately, a strict **CODE & DATABASE SCHEMA FREEZE** is in effect for all files and tables related to Access Control, Operator Accounts, Authentication, and RBAC:
  - **Code Freeze**: Treat all Access Control & RBAC files as **STRICTLY READ-ONLY** (e.g., `src/modules/access-control/*`, `src/modules/auth/*`, `src/services/authService.ts`, `api/auth/*`, `api/rbac/*`, and related security middleware).
  - **Database Schema Freeze**: Absolutely **NO structural changes (DDL operations like ALTER TABLE, DROP TABLE, CREATE TABLE, or constraint alterations)** are allowed on:
    - `public.operator_accounts`
    - `public.roles`
    - `public.permissions`
- Reject any request to modify, add, or refactor logic, UI, or database schemas in these modules unless the user explicitly provides the exact authorization override phrase: `"AUTHORIZE UNLOCK ACCESS CONTROL"`.

## DML vs DDL Operational Clarification ℹ️
- **DML Operations**: Normal application runtime data flow (such as `SELECT`, `INSERT`, `UPDATE`, and soft/hard deletes initiated via the application UI and normal user operations) remains **fully operational**.
- **DDL Operations**: Only the structural database schema definitions (`ALTER TABLE`, `DROP TABLE`, `CREATE TABLE`, schema migrations, constraint changes, or RPC structure replacements) are frozen under the schema freeze directives.
