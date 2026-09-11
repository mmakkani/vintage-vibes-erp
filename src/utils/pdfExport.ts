/**
 * PDF & Executive Document Export Utility
 * Formats and prints or downloads the current view as an executive PDF document.
 */

export interface ExportPdfOptions {
  title: string;
  companyName?: string;
  trnTaxNo?: string;
  address?: string;
  operatorName?: string;
  customElementId?: string;
}

export function exportCurrentViewToPdf(options: ExportPdfOptions) {
  const {
    title,
    companyName = 'Vintage Vibe FZ-LLC',
    trnTaxNo = 'TRN-100482910300003',
    address = 'Warehouse 14, Al Quoz Industrial Area 4, Dubai, UAE',
    operatorName = 'Enterprise Operator',
    customElementId
  } = options;

  // Locate the target content to export
  let targetElement: HTMLElement | null = null;
  if (customElementId) {
    targetElement = document.getElementById(customElementId);
  }
  if (!targetElement) {
    targetElement = document.querySelector('main') as HTMLElement;
  }

  if (!targetElement) {
    window.print();
    return;
  }

  // Clone and sanitize content for clean print view
  const contentHtml = targetElement.innerHTML;
  const printWindow = window.open('', '_blank', 'width=1100,height=850');

  if (!printWindow) {
    // Fallback if popup blocker is active
    window.print();
    return;
  }

  const currentDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const fullDocumentHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - ${companyName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      font-size: 11px;
      line-height: 1.4;
    }
    .pdf-header {
      border-bottom: 2px solid #0056b3;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .pdf-brand h1 {
      margin: 0 0 4px 0;
      color: #0056b3;
      font-size: 20px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.5px;
    }
    .pdf-brand p {
      margin: 2px 0;
      color: #64748b;
      font-size: 10px;
    }
    .pdf-meta {
      text-align: right;
      font-size: 10px;
      color: #475569;
    }
    .pdf-title-banner {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pdf-title-banner h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
    }
    .pdf-content table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10px;
    }
    .pdf-content th {
      background: #f8fafc;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid #cbd5e1;
      text-transform: uppercase;
    }
    .pdf-content td {
      padding: 6px 8px;
      border-bottom: 1px solid #f1f5f9;
    }
    .pdf-content tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .pdf-footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
    /* Hide interactive UI buttons from printout */
    button, input, select, .no-print, [role="tablist"] {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="pdf-header">
    <div class="pdf-brand">
      <h1>${companyName}</h1>
      <p>${address}</p>
      <p><strong>TRN:</strong> ${trnTaxNo} | Relational SQL Enterprise ERP</p>
    </div>
    <div class="pdf-meta">
      <div><strong>Report Generated:</strong> ${currentDate} ${currentTime}</div>
      <div><strong>Authorized User:</strong> ${operatorName}</div>
      <div><strong>Status:</strong> Authenticated System Extract</div>
    </div>
  </div>

  <div class="pdf-title-banner">
    <h2>${title}</h2>
    <span style="font-family: monospace; font-size: 10px; color: #0056b3; font-weight: bold;">DOCUMENT ID: VVE-${Date.now().toString().slice(-8)}</span>
  </div>

  <div class="pdf-content">
    ${contentHtml}
  </div>

  <div class="pdf-footer">
    <div>CONFIDENTIAL - Strictly for internal and authorized audit purposes.</div>
    <div>Page 1 of 1 Extracts - Vintage Vibe ERP</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>
`;

  printWindow.document.open();
  printWindow.document.write(fullDocumentHtml);
  printWindow.document.close();
}
