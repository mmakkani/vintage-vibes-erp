import { Employee, AttendanceRecord, PayrollRecord, EmployeeLoan, LoanInstallmentSchedule } from '../modules/hr/hr.types.ts';

// Helper for formatting currency
const formatAed = (val: any): string => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Base stylesheet for all formal HR A4 documents
const getCommonA4Styles = (title: string): string => `
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 15mm 12mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    margin: 0;
    padding: 16px;
    font-size: 11px;
    line-height: 1.4;
  }
  .a4-wrapper {
    max-width: 820px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    padding: 24px;
  }
  @media print {
    body {
      padding: 0;
      background: #ffffff;
    }
    .a4-wrapper {
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      max-width: 100% !important;
    }
    .no-print {
      display: none !important;
    }
    .page-break-avoid {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }

  /* Formal Header */
  .company-header {
    text-align: center;
    border-bottom: 2.5px solid #0056b3;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .company-name {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.06em;
    color: #0f172a;
    text-transform: uppercase;
  }
  .company-sub {
    font-size: 9.5px;
    color: #475569;
    letter-spacing: 0.04em;
    margin-top: 3px;
    font-family: monospace;
  }
  .doc-badge {
    display: inline-block;
    background: #0056b3;
    color: #ffffff;
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 3px 14px;
    border-radius: 3px;
    margin-top: 8px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
    font-size: 10px;
  }
  th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    text-align: left;
  }
  td {
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    vertical-align: middle;
  }
  .table-summary-row {
    background: #f8fafc;
    font-weight: 800;
    border-top: 2px solid #0f172a;
  }

  /* Section Title */
  .section-title {
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0056b3;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 4px;
    margin: 14px 0 8px 0;
  }

  /* Remarks Section with Ruled Lines */
  .remarks-container {
    margin-top: 18px;
    border: 1px dashed #94a3b8;
    border-radius: 4px;
    padding: 10px 14px;
    background: #fafafa;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .remarks-title {
    font-weight: 800;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #334155;
    margin-bottom: 8px;
  }
  .ruled-line {
    border-bottom: 1px dotted #94a3b8;
    height: 18px;
    margin-bottom: 4px;
  }

  /* Authorized Signatures */
  .signatures-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 22px;
    padding-top: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sign-box {
    border-top: 1.5px solid #334155;
    padding-top: 6px;
    text-align: center;
  }
  .sign-role {
    font-weight: 800;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #0f172a;
  }
  .sign-sub {
    font-size: 9px;
    color: #64748b;
    margin-top: 2px;
  }
  .sign-space {
    height: 45px;
  }

  /* Floating Print Action Toolbar (Screen only) */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #0f172a;
    color: #ffffff;
    padding: 10px 18px;
    border-radius: 6px;
    margin-bottom: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .toolbar-btn {
    background: #0056b3;
    color: #ffffff;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
  }
  .toolbar-btn:hover {
    background: #004494;
  }
  .toolbar-btn-secondary {
    background: #334155;
    color: #ffffff;
    margin-left: 8px;
  }
  .toolbar-btn-secondary:hover {
    background: #475569;
  }
`;

/**
 * 1. EMPLOYEE PROFILE DOSSIER PRINT (A4)
 * Includes framed personal, compensation, legal identifiers and attached legal documents gallery.
 */
export function printEmployeeProfileA4(emp: Employee): Window | null {
  const printWin = window.open('', '_blank', 'width=950,height=1100,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the employee profile.');
    return null;
  }

  const fullName = emp.name || (emp as any).fullName || (emp as any).full_name || 'Staff Member';
  const nameArabic = emp.nameArabic || (emp as any).name_arabic || (emp as any).arabic_name || '';
  const empCode = emp.empCode || emp.code || (emp as any).employee_code || 'EMP-0786';
  const baseSalary = Number(emp.baseSalary || (emp as any).basic_salary || (emp as any).salary || 0);
  const housingAllow = Number(emp.housingAllow || (emp as any).housing_allowance || (emp as any).housing_allow || 0);
  const transportAllow = Number(emp.transportAllow || (emp as any).transport_allowance || (emp as any).transport_allow || 0);
  const totalPkg = Number(emp.totalPackage || (emp as any).gross_salary || (baseSalary + housingAllow + transportAllow));

  const idFront = emp.idFrontImageUrl || (emp as any).id_front_image_url || '';
  const idBack = emp.idBackImageUrl || (emp as any).id_back_image_url || '';
  const passDoc = emp.passportImageUrl || (emp as any).passport_image_url || '';
  const resDoc = emp.residencyImageUrl || (emp as any).residency_image_url || (emp as any).visa_image_url || '';
  const avatar = emp.photoUrl || (emp as any).photo_url || (emp as any).profile_picture || (emp as any).avatar_url || idFront || '';

  const renderDocCard = (label: string, docNo: string, expDate: string | undefined, imgUrl: string) => `
    <div class="doc-card page-break-avoid" style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; background: #ffffff; display: flex; flex-direction: column;">
      <div style="font-weight: 800; font-size: 10px; color: #0056b3; text-transform: uppercase; letter-spacing: 0.04em;">${label}</div>
      <div style="font-size: 9px; color: #475569; font-family: monospace; margin: 2px 0 6px 0;">
        ${docNo ? `No: <strong>${docNo}</strong>` : 'No: N/A'} ${expDate ? `• Exp: <strong>${expDate}</strong>` : ''}
      </div>
      <div style="flex: 1; min-height: 160px; max-height: 200px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 3px; overflow: hidden;">
        ${imgUrl ? `
          <img src="${imgUrl}" alt="${label}" style="max-width: 100%; max-height: 190px; object-fit: contain;" />
        ` : `
          <div style="font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; padding: 20px;">
            Document Not Attached<br><span style="font-size: 8px; font-weight: 400;">Pending Scan / Upload</span>
          </div>
        `}
      </div>
    </div>
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Employee Dossier - ${empCode} - ${fullName}</title>
  <style>
    ${getCommonA4Styles(`Employee Dossier - ${fullName}`)}
    .emp-summary-grid {
      display: grid;
      grid-template-columns: 90px 1fr 150px;
      gap: 16px;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 14px;
    }
    .emp-avatar {
      width: 80px;
      height: 90px;
      object-fit: cover;
      border: 1.5px solid #0056b3;
      border-radius: 4px;
      background: #e2e8f0;
    }
    .docs-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="a4-wrapper">
    <div class="no-print toolbar">
      <div>
        <strong>VINTAGE VIBES ERP</strong> • Employee Master Dossier (${empCode})
      </div>
      <div>
        <button class="toolbar-btn" onclick="window.print()">🖨️ Print Dossier</button>
        <button class="toolbar-btn toolbar-btn-secondary" onclick="window.close()">✕ Close</button>
      </div>
    </div>

    <!-- Company Header -->
    <div class="company-header">
      <div class="company-name">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</div>
      <div class="company-sub">TRN: 100523490100003 • Commercial License: 893421 • Dubai, United Arab Emirates</div>
      <div class="doc-badge">OFFICIAL EMPLOYEE DOSSIER & LEGAL CREDENTIAL REGISTRY</div>
    </div>

    <!-- Employee Summary Box -->
    <div class="emp-summary-grid">
      <div>
        ${avatar ? `<img src="${avatar}" alt="" class="emp-avatar" />` : `
          <div class="emp-avatar" style="display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:#0056b3;">
            ${(fullName.charAt(0) || 'S').toUpperCase()}
          </div>
        `}
      </div>
      <div>
        <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${fullName}</div>
        ${nameArabic ? `<div style="font-size: 13px; color: #475569; font-weight: 600; margin-top: 2px;" dir="rtl">${nameArabic}</div>` : ''}
        <div style="font-size: 11px; color: #0056b3; font-weight: 700; margin-top: 4px;">
          ${emp.designation || 'Staff'} • ${emp.department || 'Operations'}
        </div>
        <div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">
          Nationality: <strong>${emp.nationality || 'United Arab Emirates'}</strong> • Gender: <strong>${emp.gender || 'MALE'}</strong>
        </div>
      </div>
      <div style="text-align: right; font-family: monospace; font-size: 10px;">
        <div style="font-weight: 800; color: #0056b3; font-size: 12px;">CODE: ${empCode}</div>
        <div style="margin-top: 3px; color: #475569;">STATUS: <strong>${emp.status || 'POSTED'}</strong></div>
        <div style="margin-top: 3px; color: #475569;">JOINED: <strong>${emp.joiningDate || 'N/A'}</strong></div>
        <div style="margin-top: 3px; color: #475569;">DOB: <strong>${emp.dob || 'N/A'}</strong></div>
      </div>
    </div>

    <!-- 1. Compensation & Financial Package -->
    <div class="section-title">1. Financial Package & Compensation (AED)</div>
    <table>
      <thead>
        <tr>
          <th>Basic Salary</th>
          <th>Housing Allowance</th>
          <th>Transport Allowance</th>
          <th>Total Monthly Package</th>
          <th>Daily Rate (Base/30)</th>
          <th>Working Hours</th>
        </tr>
      </thead>
      <tbody>
        <tr style="font-weight: 600; font-family: monospace; font-size: 11px;">
          <td>AED ${formatAed(baseSalary)}</td>
          <td>AED ${formatAed(housingAllow)}</td>
          <td>AED ${formatAed(transportAllow)}</td>
          <td style="color: #0056b3; font-weight: 800; background: #f0fdf4;">AED ${formatAed(totalPkg)}</td>
          <td>AED ${formatAed(baseSalary / 30)}</td>
          <td>${emp.workingHoursPerDay || 8} hrs / day</td>
        </tr>
      </tbody>
    </table>

    <!-- 2. UAE Legal Identification Details -->
    <div class="section-title">2. UAE Statutory & Legal Identification Records</div>
    <table>
      <thead>
        <tr>
          <th>Document Type</th>
          <th>Identification / Card Number</th>
          <th>Issue Date</th>
          <th>Expiry Date</th>
          <th>Issuing Authority / Sponsor</th>
        </tr>
      </thead>
      <tbody style="font-family: monospace;">
        <tr>
          <td style="font-weight: 700; font-family: sans-serif;">1. Emirates ID</td>
          <td><strong>${emp.emiratesId || (emp as any).emirates_id || 'N/A'}</strong> (Card: ${emp.idCardNo || (emp as any).id_card_no || 'N/A'})</td>
          <td>—</td>
          <td style="font-weight: 700;">${emp.emiratesIdExpiry || (emp as any).emirates_id_expiry || 'N/A'}</td>
          <td>Federal Authority for Identity & Citizenship (ICP)</td>
        </tr>
        <tr>
          <td style="font-weight: 700; font-family: sans-serif;">2. Passport</td>
          <td><strong>${emp.passportNo || (emp as any).passport_no || 'N/A'}</strong></td>
          <td>${emp.passportIssueDate || (emp as any).passport_issue_date || 'N/A'}</td>
          <td style="font-weight: 700;">${emp.passportExpiry || (emp as any).passport_expiry || 'N/A'}</td>
          <td>${emp.passportCountry || (emp as any).passport_country || emp.nationality || 'UAE'}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; font-family: sans-serif;">3. Residency Visa & UID</td>
          <td>File: <strong>${emp.residencyCardNo || (emp as any).residency_card_no || 'N/A'}</strong> • UID: <strong>${emp.uidNo || (emp as any).uid_no || (emp as any).visa_uid || 'N/A'}</strong></td>
          <td>${emp.residencyIssueDate || (emp as any).residency_issue_date || 'N/A'}</td>
          <td style="font-weight: 700;">${emp.residencyExpiryDate || (emp as any).residency_expiry_date || 'N/A'}</td>
          <td>${emp.residencySponsor || (emp as any).residency_sponsor || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'}</td>
        </tr>
      </tbody>
    </table>

    <!-- 3. Attached Legal Documents (Front, Back, Passport, Visa) -->
    <div class="section-title">3. Attached Legal Document Scans (Verified Biometrics & ID Vault)</div>
    <div class="docs-grid">
      ${renderDocCard('Emirates ID (Front)', emp.emiratesId || '', emp.emiratesIdExpiry, idFront)}
      ${renderDocCard('Emirates ID (Back)', emp.idCardNo || '', emp.emiratesIdExpiry, idBack)}
      ${renderDocCard('International Passport (Bio Page)', emp.passportNo || '', emp.passportExpiry, passDoc)}
      ${renderDocCard('Residency Visa / Entry Permit', emp.residencyCardNo || emp.uidNo || '', emp.residencyExpiryDate, resDoc)}
    </div>

    <!-- Signatures Block -->
    <div class="signatures-grid">
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">Employee Signature</div>
        <div class="sign-sub">${fullName}</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">HR Operations Manager</div>
        <div class="sign-sub">Verified & Archived to Vault</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">Corporate Seal / Stamp</div>
        <div class="sign-sub">Vintage Vibes General Trading</div>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      // Small timeout to allow images to decode cleanly before printing
      setTimeout(() => {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}

/**
 * 2. MONTHLY ATTENDANCE SHEET PRINT (A4)
 * High-contrast formal tabular grid for all active employees for the month.
 */
export function printAttendanceSheetA4(options: {
  month: string;
  records: AttendanceRecord[];
  status?: string;
  totalStaff?: number;
}): Window | null {
  const { month, records, status = 'POSTED', totalStaff } = options;

  const printWin = window.open('', '_blank', 'width=950,height=1100,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the attendance sheet.');
    return null;
  }

  const staffCount = totalStaff ?? records.length;
  const totalDays = records.reduce((acc, r) => acc + (Number(r.daysWorked) || 0), 0);
  const totalOt = records.reduce((acc, r) => acc + (Number(r.overtimeHours) || 0), 0);

  const rowsHtml = records.map((r, idx) => `
    <tr>
      <td style="text-align: center; font-family: monospace; color: #64748b;">${idx + 1}</td>
      <td style="font-family: monospace; font-weight: 700; color: #0056b3;">${r.empCode}</td>
      <td style="font-weight: 600; color: #0f172a;">${r.employeeName}</td>
      <td style="text-align: center; font-family: monospace; font-weight: 700;">${r.daysWorked} / 30</td>
      <td style="text-align: center; font-family: monospace; font-weight: 700; color: #047857;">${r.overtimeHours} hrs</td>
      <td style="text-align: center; font-family: monospace; font-size: 9px; font-weight: 700;">
        <span style="padding: 2px 6px; border-radius: 3px; background: ${r.status === 'POSTED' ? '#dcfce7; color: #15803d;' : '#fef3c7; color: #b45309;'}">
          ${r.status || 'DRAFT'}
        </span>
      </td>
      <td style="text-align: center; color: #047857; font-size: 11px;">✓ Verified</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Attendance Register - ${month}</title>
  <style>
    ${getCommonA4Styles(`Attendance Register - ${month}`)}
  </style>
</head>
<body>
  <div class="a4-wrapper">
    <div class="no-print toolbar">
      <div>
        <strong>VINTAGE VIBES ERP</strong> • Monthly Attendance Register (${month})
      </div>
      <div>
        <button class="toolbar-btn" onclick="window.print()">🖨️ Print Sheet</button>
        <button class="toolbar-btn toolbar-btn-secondary" onclick="window.close()">✕ Close</button>
      </div>
    </div>

    <!-- Formal Company Header -->
    <div class="company-header">
      <div class="company-name">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</div>
      <div class="company-sub">TRN: 100523490100003 • Dubai, United Arab Emirates • HR & Workforce Operations</div>
      <div class="doc-badge">MONTHLY STAFF ATTENDANCE REGISTER • SALARY MONTH: ${month}</div>
    </div>

    <!-- Attendance KPI Summary Card -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; margin-bottom: 14px; text-align: center;">
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Salary Month</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0056b3; margin-top: 2px;">${month}</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Active Staff Count</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 2px;">${staffCount} Employees</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Present Days</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 2px;">${totalDays} Days</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Overtime</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #047857; margin-top: 2px;">${totalOt} Hours</div>
      </div>
    </div>

    <!-- Main Attendance Table -->
    <table>
      <thead>
        <tr>
          <th style="width: 35px; text-align: center;">#</th>
          <th style="width: 85px;">Emp Code</th>
          <th>Employee Full Name</th>
          <th style="width: 120px; text-align: center;">Days Worked (0-30)</th>
          <th style="width: 110px; text-align: center;">Overtime Hours</th>
          <th style="width: 90px; text-align: center;">Lock Status</th>
          <th style="width: 90px; text-align: center;">Audit Trail</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="table-summary-row">
          <td colspan="3" style="text-align: right; padding-right: 14px; text-transform: uppercase;">AGGREGATE TOTALS:</td>
          <td style="text-align: center; font-family: monospace; font-size: 11px;">${totalDays} Days</td>
          <td style="text-align: center; font-family: monospace; font-size: 11px; color: #047857;">${totalOt} Hours</td>
          <td colspan="2" style="text-align: center; font-size: 9px; text-transform: uppercase;">
            ${status === 'POSTED' ? 'LOCKED & POSTED TO PAYROLL' : 'DRAFT STATE'}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Remarks Box -->
    <div class="remarks-container">
      <div class="remarks-title">SUPERVISOR / TIMEKEEPER REMARKS & DISCREPANCY AUDIT:</div>
      <div class="ruled-line"></div>
      <div class="ruled-line"></div>
    </div>

    <!-- Authorized Signatures Block -->
    <div class="signatures-grid">
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ Prepared By ]</div>
        <div class="sign-sub">Timekeeper / Sortery Lead</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ HR Manager ]</div>
        <div class="sign-sub">Verified & Locked to Payroll</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ Operations Director ]</div>
        <div class="sign-sub">Workforce Approval</div>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}

/**
 * 3. MONTHLY PAYROLL REGISTER PRINT (A4)
 * Professional salary breakdown with Gross, Deductions, Net Pay, Remarks ruled lines, and 3 Authorized Signatures.
 */
export function printPayrollRegisterA4(options: {
  month: string;
  slips: PayrollRecord[];
  status?: string;
  totalNetPay?: number;
  totalGross?: number;
  totalDeductions?: number;
  companyName?: string;
  trnTaxNo?: string;
}): Window | null {
  const { month, slips, status = 'POSTED' } = options;

  const printWin = window.open('', '_blank', 'width=1000,height=1100,menubar=no,toolbar=no,location=no,status=no');
  if (!printWin) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print the payroll register.');
    return null;
  }

  const staffCount = slips.length;
  const sumBase = slips.reduce((acc, s) => acc + Number(s.baseSalary || 0), 0);
  const sumEarnedBasic = slips.reduce((acc, s) => acc + Number(s.earnedBasic || 0), 0);
  const sumAllowances = slips.reduce((acc, s) => acc + Number(s.allowances || 0), 0);
  const sumOtPay = slips.reduce((acc, s) => acc + Number(s.overtimePay || 0), 0);
  const sumGross = slips.reduce((acc, s) => acc + Number(s.grossPay || 0), 0);
  const sumAdvance = slips.reduce((acc, s) => acc + Number(s.advanceDeduction || 0), 0);
  const sumLoan = slips.reduce((acc, s) => acc + Number(s.loanEmiDeduction || 0), 0);
  const sumTotalDeductions = sumAdvance + sumLoan;
  const sumNetPay = slips.reduce((acc, s) => acc + Number(s.netPay || 0), 0);

  const rowsHtml = slips.map((s, idx) => `
    <tr>
      <td style="text-align: center; font-family: monospace; color: #64748b;">${idx + 1}</td>
      <td style="font-family: monospace; font-weight: 700; color: #0056b3;">${s.empCode}</td>
      <td style="font-weight: 600; color: #0f172a;">
        ${s.employeeName}
        <div style="font-size: 8.5px; color: #64748b; font-weight: normal;">${s.designation || 'Staff'}</div>
      </td>
      <td style="text-align: right; font-family: monospace;">${formatAed(s.baseSalary)}</td>
      <td style="text-align: center; font-family: monospace; font-weight: 700;">${s.daysWorked}</td>
      <td style="text-align: right; font-family: monospace;">${formatAed(s.earnedBasic)}</td>
      <td style="text-align: right; font-family: monospace; color: #475569;">${formatAed(s.allowances)}</td>
      <td style="text-align: right; font-family: monospace; color: #047857;">${formatAed(s.overtimePay)}</td>
      <td style="text-align: right; font-family: monospace; font-weight: 700;">${formatAed(s.grossPay)}</td>
      <td style="text-align: right; font-family: monospace; color: #b91c1c;">${Number(s.advanceDeduction || 0) > 0 ? `-${formatAed(s.advanceDeduction)}` : '—'}</td>
      <td style="text-align: right; font-family: monospace; color: #b91c1c;">${Number(s.loanEmiDeduction || 0) > 0 ? `-${formatAed(s.loanEmiDeduction)}` : '—'}</td>
      <td style="text-align: right; font-family: monospace; font-weight: 800; color: #047857; background: #f0fdf4;">${formatAed(s.netPay)}</td>
      <td style="text-align: center; font-size: 9px; color: #475569; font-style: italic;">_____________</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Payroll Register - ${month}</title>
  <style>
    ${getCommonA4Styles(`Payroll Register - ${month}`)}
    @page {
      size: A4 landscape;
      margin: 10mm 10mm 12mm 10mm;
    }
    .a4-wrapper {
      max-width: 1100px;
    }
  </style>
</head>
<body>
  <div class="a4-wrapper">
    <div class="no-print toolbar">
      <div>
        <strong>VINTAGE VIBES ERP</strong> • Monthly Payroll Register (${month})
      </div>
      <div>
        <button class="toolbar-btn" onclick="window.print()">🖨️ Print Payroll Register</button>
        <button class="toolbar-btn toolbar-btn-secondary" onclick="window.close()">✕ Close</button>
      </div>
    </div>

    <!-- Formal Header -->
    <div class="company-header">
      <div class="company-name">${options.companyName || 'VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C'}</div>
      <div class="company-sub">TRN: ${options.trnTaxNo || '100482910300003'} • Dubai, UAE • Ministry of Human Resources & Emiratisation (MOHRE) WPS Compliant</div>
      <div class="doc-badge">MONTHLY PAYROLL REGISTER & WAGE DISBURSAL LOG • SALARY MONTH: ${month}</div>
    </div>

    <!-- Payroll KPI Summary Banner -->
    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; margin-bottom: 14px; text-align: center;">
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Staff</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0056b3; margin-top: 2px;">${staffCount} Staff</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Gross Earnings</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 2px;">AED ${formatAed(sumGross)}</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #b91c1c;">Total Deductions</div>
        <div style="font-size: 13px; font-weight: 800; font-family: monospace; color: #b91c1c; margin-top: 2px;">AED ${formatAed(sumTotalDeductions)}</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #047857;">Net Disbursable</div>
        <div style="font-size: 14px; font-weight: 900; font-family: monospace; color: #047857; margin-top: 2px;">AED ${formatAed(sumNetPay)}</div>
      </div>
      <div>
        <div style="font-size: 9px; text-transform: uppercase; font-weight: 700; color: #64748b;">Disbursal Status</div>
        <div style="font-size: 11px; font-weight: 800; margin-top: 4px;">
          <span style="padding: 2px 8px; border-radius: 3px; background: ${status === 'POSTED' ? '#dcfce7; color: #15803d;' : '#fef3c7; color: #b45309;'}">
            ${status === 'POSTED' ? 'POSTED & LINKED TO GL' : 'DRAFT READY'}
          </span>
        </div>
      </div>
    </div>

    <!-- Main Payroll Breakdown Table -->
    <table>
      <thead>
        <tr>
          <th style="width: 25px; text-align: center;">#</th>
          <th style="width: 75px;">Emp Code</th>
          <th>Employee Name</th>
          <th style="text-align: right;">Base Salary</th>
          <th style="text-align: center; width: 45px;">Days</th>
          <th style="text-align: right;">Earned Basic</th>
          <th style="text-align: right;">Allowances</th>
          <th style="text-align: right;">OT Pay</th>
          <th style="text-align: right; font-weight: 800;">Gross Pay</th>
          <th style="text-align: right; color: #b91c1c;">Advance Cut</th>
          <th style="text-align: right; color: #b91c1c;">Loan EMI</th>
          <th style="text-align: right; color: #047857; font-weight: 800; background: #ecfdf5;">Net Pay (AED)</th>
          <th style="width: 100px; text-align: center;">Staff Signature</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="table-summary-row">
          <td colspan="3" style="text-align: right; padding-right: 12px; text-transform: uppercase;">REGISTER TOTALS:</td>
          <td style="text-align: right; font-family: monospace;">AED ${formatAed(sumBase)}</td>
          <td style="text-align: center; font-family: monospace;">—</td>
          <td style="text-align: right; font-family: monospace;">AED ${formatAed(sumEarnedBasic)}</td>
          <td style="text-align: right; font-family: monospace;">AED ${formatAed(sumAllowances)}</td>
          <td style="text-align: right; font-family: monospace; color: #047857;">AED ${formatAed(sumOtPay)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800;">AED ${formatAed(sumGross)}</td>
          <td style="text-align: right; font-family: monospace; color: #b91c1c;">AED ${formatAed(sumAdvance)}</td>
          <td style="text-align: right; font-family: monospace; color: #b91c1c;">AED ${formatAed(sumLoan)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 900; color: #047857; background: #dcfce7; font-size: 11px;">AED ${formatAed(sumNetPay)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <!-- Crucial: Remarks Section with ruled lines for handwriting -->
    <div class="remarks-container">
      <div class="remarks-title">REMARKS / AUDIT NOTES & DISBURSEMENT OBSERVATIONS:</div>
      <div class="ruled-line"></div>
      <div class="ruled-line"></div>
      <div class="ruled-line"></div>
    </div>

    <!-- Crucial: Authorized Signatures Block (Prepared By, HR Manager, Finance Director) -->
    <div class="signatures-grid">
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ Prepared By ]</div>
        <div class="sign-sub">HR Payroll Officer & Timekeeper</div>
        <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Date: ____/____/2026</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ HR Manager ]</div>
        <div class="sign-sub">Head of Human Resources</div>
        <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Date: ____/____/2026</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ Finance Director ]</div>
        <div class="sign-sub">Chief Financial Officer / Managing Director</div>
        <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Date: ____/____/2026</div>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}

export interface PrintEmployeeLoanA4Props {
  loan: EmployeeLoan;
  employee?: Employee;
  schedule?: LoanInstallmentSchedule[];
}

export function printEmployeeLoanA4({ loan, employee, schedule }: PrintEmployeeLoanA4Props): Window | null {
  const printWin = window.open('', '_blank', 'width=950,height=1000');
  if (!printWin) {
    alert('Please allow popups to print the loan agreement.');
    return null;
  }

  const vchMatch = (loan.notes || '').match(/\[Voucher:\s*([A-Z0-9-]+)\]/i);
  const voucherNo = loan.voucherNo || (vchMatch ? vchMatch[1] : 'AUTO-VOUCHER');
  const totalPrincipal = Number(loan.principalAmount || 0);
  const totalRemaining = Number(loan.remainingAmount || 0);
  const totalPaid = Math.max(0, totalPrincipal - totalRemaining);

  // Generate schedule if not provided
  let computedSchedule: LoanInstallmentSchedule[] = schedule && schedule.length > 0 ? schedule : [];
  if (computedSchedule.length === 0) {
    const months = Math.max(1, Number(loan.totalMonths || 1));
    const emi = Number(loan.emiAmount || (totalPrincipal / months).toFixed(2));
    const [startYearStr, startMonthStr] = (loan.startMonth || new Date().toISOString().slice(0, 7)).split('-');
    let currYear = parseInt(startYearStr, 10) || new Date().getFullYear();
    let currMonth = parseInt(startMonthStr, 10) || (new Date().getMonth() + 1);

    let accumPaid = totalPaid;
    for (let i = 1; i <= months; i++) {
      const monthStr = `${currYear}-${String(currMonth).padStart(2, '0')}`;
      const isPaid = accumPaid >= emi && emi > 0;
      const thisDeduction = isPaid ? emi : (accumPaid > 0 ? accumPaid : 0);
      accumPaid = Math.max(0, accumPaid - emi);

      computedSchedule.push({
        installmentNo: i,
        month: monthStr,
        emiAmount: emi,
        deductedAmount: thisDeduction,
        status: isPaid ? 'PAID' : 'PENDING',
        payrollRef: isPaid ? `JV-PAY-${monthStr}` : undefined,
        remainingBalance: Math.max(0, totalPrincipal - (i * emi))
      });

      currMonth++;
      if (currMonth > 12) {
        currMonth = 1;
        currYear++;
      }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Staff Loan & Advance Agreement - ${loan.employeeName} (${loan.empCode})</title>
  <style>
    ${getCommonA4Styles('Staff Loan & Advance Agreement')}
    .badge-paid {
      display: inline-block;
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
      font-weight: 800;
      font-size: 9px;
      padding: 2px 7px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .badge-pending {
      display: inline-block;
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
      font-weight: 700;
      font-size: 9px;
      padding: 2px 7px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .legal-clause {
      margin-top: 14px;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 9.5px;
      line-height: 1.45;
      color: #334155;
    }
  </style>
</head>
<body>
  <!-- Floating Print Toolbar -->
  <div class="toolbar no-print">
    <div>
      <strong style="text-transform: uppercase; letter-spacing: 0.05em;">Staff Advance & Loan Agreement (A4)</strong>
      <span style="font-size: 11px; opacity: 0.8; margin-left: 10px;">Employee: ${loan.employeeName} (${loan.empCode}) &bull; Ref: ${voucherNo}</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="toolbar-btn btn-print" onclick="window.print()">Print / Save PDF</button>
      <button class="toolbar-btn btn-close" onclick="window.close()">Close Window</button>
    </div>
  </div>

  <div class="a4-wrapper">
    <!-- Company Header with Official Logo -->
    <div class="company-header">
      <img src="/vintage_logo_gold_seal_a4.png" alt="Vintage Vibes Logo" style="height: 52px; margin-bottom: 6px; display: inline-block;" onerror="this.onerror=null; this.src='/vintage_logo.svg';" />
      <div class="company-name">VINTAGE VIBES GENERAL TRADING L.L.C - S.P.C</div>
      <div class="company-sub">Commercial License: 1049281 &bull; TRN (VAT): 100482910300003 &bull; Registered in Abu Dhabi & Dubai, UAE</div>
      <div class="company-sub">Downtown, Al Qaseedah District, 135 Khalifa Bin Zayed Street, Alain UAE</div>
      <div class="doc-badge">EMPLOYEE SALARY ADVANCE & LOAN DISBURSEMENT AGREEMENT</div>
    </div>

    <!-- Document Meta Bar -->
    <table style="margin-bottom: 12px;">
      <tbody>
        <tr style="background: #f8fafc;">
          <td style="width: 25%; font-weight: 700; text-transform: uppercase; color: #475569;">Document / Loan ID:</td>
          <td style="width: 25%; font-family: monospace; font-weight: 700;">${loan.id}</td>
          <td style="width: 25%; font-weight: 700; text-transform: uppercase; color: #475569;">Financial Voucher:</td>
          <td style="width: 25%; font-family: monospace; font-weight: 800; color: #0056b3;">${voucherNo}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; text-transform: uppercase; color: #475569;">Issue / Disburse Date:</td>
          <td>${new Date(loan.createdAt).toISOString().slice(0, 10)}</td>
          <td style="font-weight: 700; text-transform: uppercase; color: #475569;">Agreement Status:</td>
          <td>
            <span style="font-weight: 800; text-transform: uppercase; color: ${loan.status === 'PAID' ? '#15803d' : '#0056b3'};">
              ● ${loan.status === 'PAID' ? 'FULLY REPAID' : (loan.status === 'DRAFT' ? 'DRAFT AGREEMENT' : 'POSTED / ACTIVE RECOVERY')}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Employee Information -->
    <div class="section-title">1. Beneficiary Employee Particulars</div>
    <table>
      <tbody>
        <tr>
          <th style="width: 20%;">Employee Name</th>
          <td style="width: 30%; font-weight: 700;">${loan.employeeName}</td>
          <th style="width: 20%;">Employee Code</th>
          <td style="width: 30%; font-family: monospace; font-weight: 800; color: #0056b3;">${loan.empCode}</td>
        </tr>
        <tr>
          <th>Designation</th>
          <td>${employee?.designation || 'Staff'}</td>
          <th>Department</th>
          <td>${employee?.department || 'Operations'}</td>
        </tr>
        <tr>
          <th>Base Monthly Salary</th>
          <td style="font-family: monospace; font-weight: 700;">AED ${formatAed(employee?.basicSalary || employee?.baseSalary || 0)}</td>
          <th>Contact Mobile</th>
          <td style="font-family: monospace;">${employee?.phone || employee?.mobile || 'N/A'}</td>
        </tr>
      </tbody>
    </table>

    <!-- Loan Financial Terms -->
    <div class="section-title">2. Financial Advance / Loan Terms</div>
    <table>
      <tbody>
        <tr>
          <th style="width: 20%;">Advance / Loan Type</th>
          <td style="width: 30%; font-weight: 700;">
            ${loan.type === 'SALARY_ADVANCE' ? 'Salary Advance (Single Salary Cut)' : 'Installment Loan (EMI Repayment)'}
          </td>
          <th style="width: 20%;">Principal Amount</th>
          <td style="width: 30%; font-family: monospace; font-weight: 900; font-size: 11.5px; color: #0f172a;">
            AED ${formatAed(totalPrincipal)}
          </td>
        </tr>
        <tr>
          <th>Repayment Tenure</th>
          <td style="font-weight: 700;">${loan.totalMonths} Month(s)</td>
          <th>Monthly EMI Deduction</th>
          <td style="font-family: monospace; font-weight: 800; color: #047857;">AED ${formatAed(loan.emiAmount)} / month</td>
        </tr>
        <tr>
          <th>Disbursement Method</th>
          <td>${loan.disbursementMethod === 'CASH' ? 'Cash in Hand (Counter Payment)' : 'Bank Transfer (Direct Remittance)'}</td>
          <th>Disbursement Account</th>
          <td style="font-family: monospace;">${loan.disbursementAccount || (loan.disbursementMethod === 'CASH' ? '1110-01 Cash in Hand' : '1120-01 Bank')}</td>
        </tr>
        <tr style="background: #fef2f2;">
          <th style="color: #991b1b;">Total Repaid to Date</th>
          <td style="font-family: monospace; font-weight: 800; color: #15803d;">AED ${formatAed(totalPaid)}</td>
          <th style="color: #991b1b;">Remaining Outstanding</th>
          <td style="font-family: monospace; font-weight: 900; color: #b91c1c; font-size: 11.5px;">AED ${formatAed(totalRemaining)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Repayment Schedule -->
    <div class="section-title">3. Monthly Installment Repayment Schedule & Salary Deduction Status</div>
    <table>
      <thead>
        <tr>
          <th style="width: 6%; text-align: center;">#</th>
          <th style="width: 14%;">Payroll Month</th>
          <th style="width: 16%; text-align: right;">Scheduled EMI</th>
          <th style="width: 18%; text-align: right;">Deducted in Payroll</th>
          <th style="width: 14%; text-align: center;">Deduction Status</th>
          <th style="width: 18%;">Payroll Voucher Ref</th>
          <th style="width: 14%; text-align: right;">Balance After EMI</th>
        </tr>
      </thead>
      <tbody>
        ${computedSchedule.map(s => `
          <tr>
            <td style="text-align: center; font-family: monospace; font-weight: 700;">${s.installmentNo}</td>
            <td style="font-family: monospace; font-weight: 700;">${s.month}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700;">AED ${formatAed(s.emiAmount)}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: ${s.status === 'PAID' ? '#15803d' : '#64748b'};">
              AED ${formatAed(s.deductedAmount)}
            </td>
            <td style="text-align: center;">
              ${s.status === 'PAID'
                ? '<span class="badge-paid">● PAID</span>'
                : '<span class="badge-pending">○ PENDING</span>'
              }
            </td>
            <td style="font-family: monospace; font-size: 9.5px; color: #475569;">
              ${s.payrollRef || '-'}
            </td>
            <td style="text-align: right; font-family: monospace; font-weight: 700; color: #991b1b;">
              AED ${formatAed(s.remainingBalance)}
            </td>
          </tr>
        `).join('')}
        <tr class="table-summary-row">
          <td colspan="2" style="text-align: right; text-transform: uppercase;">Totals:</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800;">AED ${formatAed(totalPrincipal)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 900; color: #15803d;">AED ${formatAed(totalPaid)}</td>
          <td colspan="2" style="text-align: right; text-transform: uppercase; color: #b91c1c;">Net Outstanding:</td>
          <td style="text-align: right; font-family: monospace; font-weight: 900; color: #b91c1c; font-size: 11px;">AED ${formatAed(totalRemaining)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Legal Terms and Payroll Deduction Authorization -->
    <div class="legal-clause page-break-avoid">
      <strong>ACKNOWLEDGMENT & SALARY DEDUCTION AUTHORIZATION (UAE LABOR COMPLIANCE):</strong><br/>
      I, <strong>${loan.employeeName}</strong> (Emp Code: <strong>${loan.empCode}</strong>), hereby confirm that I have requested and received the advance / loan sum of <strong>AED ${formatAed(totalPrincipal)}</strong> from Vintage Vibes General Trading L.L.C - S.P.C via ${loan.disbursementMethod || 'BANK_TRANSFER'}. I unconditionally authorize the management to deduct the monthly installment of <strong>AED ${formatAed(loan.emiAmount)}</strong> directly from my monthly payroll starting from <strong>${loan.startMonth}</strong> until the balance is fully settled. In the event of resignation, termination, or separation of service prior to final liquidation, I authorize the company to deduct the full remaining outstanding balance from my end-of-service gratuity and final salary settlement.
    </div>

    <!-- Ruled Remarks -->
    <div class="remarks-container page-break-avoid" style="margin-top: 12px;">
      <div class="remarks-title">SPECIAL HR / FINANCE RECOVERY NOTES:</div>
      <div class="ruled-line">${loan.notes ? '<span style="font-family: monospace; font-size: 9px; color: #475569;">' + loan.notes + '</span>' : ''}</div>
      <div class="ruled-line"></div>
    </div>

    <!-- Authorized Signatures Grid -->
    <div class="signatures-grid page-break-avoid" style="margin-top: 20px;">
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ Employee Signature ]</div>
        <div class="sign-sub">${loan.employeeName}</div>
        <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Date: ____/____/2026</div>
      </div>
      <div class="sign-box">
        <div class="sign-space"></div>
        <div class="sign-role">[ HR & Payroll Officer ]</div>
        <div class="sign-sub">Verified & Scheduled for Payroll</div>
        <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Date: ____/____/2026</div>
      </div>
      <div class="sign-box" style="position: relative;">
        <div class="sign-space"></div>
        <div class="sign-role">[ Managing Director / CFO ]</div>
        <div class="sign-sub">Disbursement Approved & Posted</div>
        <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Date: ____/____/2026</div>
      </div>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  return printWin;
}
