import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import { ThermalEngineConfig, ThermalStyleId, THERMAL_DESIGN_STYLES } from './thermalTypes.ts';
import { renderLabelHtml } from './thermalTemplates.ts';

export function generateBarcodeSvgString(sku: string): string {
  try {
    const svgElem = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgElem, sku || 'VV-DEFAULT-001', {
      format: 'CODE128',
      width: 1.8,
      height: 38,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000'
    });
    return svgElem.outerHTML;
  } catch (err) {
    console.error('Failed to generate barcode SVG:', err);
    return `<svg width="120" height="32"><rect width="120" height="32" fill="#eee"/><text x="10" y="20" font-size="10" font-family="monospace">${sku || 'BARCODE'}</text></svg>`;
  }
}

export function generateQrCodeSvgString(content: string, size = 96): string {
  try {
    const qrElement = React.createElement(QRCodeSVG, {
      value: content || 'https://vintagevibes.ae',
      size: size,
      level: 'M',
      marginSize: 0
    });
    return renderToStaticMarkup(qrElement);
  } catch (err) {
    console.error('Failed to generate QR Code SVG:', err);
    return `<div style="width:${size}px;height:${size}px;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-size:8px;">QR</div>`;
  }
}

export function openThermalPrintPopup(config: ThermalEngineConfig, styleId: ThermalStyleId): Window | null {
  const widthMm = config.widthMm || 100;
  const heightMm = config.heightMm || 50;
  const styleDef = THERMAL_DESIGN_STYLES.find(s => s.id === styleId) || THERMAL_DESIGN_STYLES[0];

  // 1. Generate crisp vector SVGs with responsive inline scaling
  const rawBarcodeSvg = generateBarcodeSvgString(config.skuBarcode);
  const barcodeSvg = rawBarcodeSvg.replace('<svg ', '<svg style="max-width:100%;max-height:100%;width:auto;height:auto;display:block;margin:0 auto;" ');

  const qrPayload = JSON.stringify({
    sku: config.skuBarcode,
    item: config.itemName,
    price: config.priceAed,
    inv: config.invoiceNo,
    brand: config.brandName,
    company: config.companyName
  });
  const rawQrSvg = generateQrCodeSvgString(qrPayload, 80);
  const qrSvg = rawQrSvg.replace('<svg ', '<svg style="width:100%;height:100%;max-width:100%;max-height:100%;display:block;" ');

  // 2. Render inner template
  const labelInnerHtml = renderLabelHtml(styleId, {
    config,
    barcodeSvg,
    qrSvg
  });

  // 3. Open isolated dedicated popup window
  const popup = window.open('', '_blank', 'width=520,height=700,resizable=yes,scrollbars=yes');
  if (!popup) {
    alert('Thermal Label Print Popup blocked by browser! Please enable popups for this site in your browser address bar.');
    return null;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Thermal Label: ${styleDef.title} (${widthMm}x${heightMm}mm)</title>
  <style>
    /* Strict Monochrome Thermal Print CSS */
    @media print {
      @page {
        margin: 0;
        size: auto;
      }
      body {
        margin: 0;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        background: #ffffff !important;
      }
      .no-print {
        display: none !important;
      }
      .preview-viewport {
        padding: 0 !important;
        margin: 0 !important;
        background: #ffffff !important;
        min-height: auto !important;
      }
      .label-canvas {
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        page-break-after: avoid;
        page-break-inside: avoid;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background: #0f172a;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* Sticky Action & Navigation Bar */
    .no-print.sticky-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #f8fafc;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }

    .status-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .style-title {
      font-size: 13px;
      font-weight: 800;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .badge-pill {
      display: inline-block;
      font-size: 9px;
      font-family: monospace;
      padding: 1px 6px;
      border-radius: 4px;
      background: #334155;
      color: #94a3b8;
    }

    .meta-subtitle {
      font-size: 11px;
      color: #cbd5e1;
    }

    .button-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      appearance: none;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease-in-out;
    }

    .btn:active {
      transform: scale(0.97);
    }

    .btn-print {
      background: #0284c7;
      color: #ffffff;
      box-shadow: 0 2px 4px rgba(2, 132, 199, 0.4);
    }
    .btn-print:hover {
      background: #0369a1;
    }

    .btn-close {
      background: #475569;
      color: #f8fafc;
    }
    .btn-close:hover {
      background: #64748b;
    }

    /* Screen Preview Viewport */
    .preview-viewport {
      padding: 24px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 60px);
      background: radial-gradient(circle at top, #1e293b 0%, #0f172a 100%);
    }

    .screen-helper {
      margin-bottom: 12px;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
      font-family: monospace;
    }

    /* True Physical Size Label Canvas */
    .label-canvas {
      background: #ffffff;
      color: #000000;
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      min-height: ${heightMm}mm;
      max-height: ${heightMm}mm;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
      overflow: hidden;
      position: relative;
      box-sizing: border-box;
    }

    #thermal-autofit-content {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      transform-origin: top left;
    }

    #thermal-autofit-content .label-box {
      box-sizing: border-box !important;
    }

    /* Ensure SVGs inside fill properly */
    .label-canvas svg {
      max-width: 100%;
    }
  </style>
</head>
<body>
  <!-- Sticky Bar: Print & Close controls -->
  <div class="no-print sticky-bar">
    <div class="status-meta">
      <div class="style-title">
        <span>Style #${styleDef.styleNumber}: ${styleDef.title}</span>
        <span class="badge-pill">${config.widthIn}" x ${config.heightIn}" (${widthMm} x ${heightMm} mm)</span>
        <span class="badge-pill" id="scale-badge" style="background:#065f46; color:#6ee7b7; font-weight:bold;">Auto-Fit 100%</span>
      </div>
      <div class="meta-subtitle">
        SKU: <strong style="font-family:monospace; color:#fff;">${config.skuBarcode}</strong> &bull; AED ${Number(config.priceAed).toFixed(2)}
        ${config.autoPrint ? '&bull; <span style="color:#4ade80;">Auto-Print Active</span>' : ''}
      </div>
    </div>
    <div class="button-group">
      <span class="badge-pill" style="background:#0284c7; color:#fff; font-weight:bold; font-size:10px; padding:3px 8px;">↵ Press Enter to Print</span>
      <button class="btn btn-print" id="btnThermalPrint" onclick="fitToCanvas(); window.print()">
        🖨️ Print Now
      </button>
      <button class="btn btn-close" onclick="window.close()" title="Esc to close">
        ✕ Close (Esc)
      </button>
    </div>
  </div>

  <!-- Screen Preview Viewport -->
  <div class="preview-viewport">
    <div class="no-print screen-helper">
      Monochrome Thermal Head Simulation (${widthMm}mm &times; ${heightMm}mm) &bull; Press Ctrl+P or Click Print Now
    </div>

    <!-- Scaled Thermal Card with Guaranteed Auto-Fit Engine -->
    <div class="label-canvas" id="label-canvas">
      <div id="thermal-autofit-content">
        ${labelInnerHtml}
      </div>
    </div>
  </div>

  <!-- Dynamic Vector Auto-Fit Anti-Cut Engine -->
  <script>
    function fitToCanvas() {
      var canvas = document.getElementById('label-canvas');
      var wrapper = document.getElementById('thermal-autofit-content');
      var scaleBadge = document.getElementById('scale-badge');
      if (!canvas || !wrapper) return;

      // 1. Reset wrapper to measure natural dimensions required by content
      wrapper.style.transform = 'none';
      wrapper.style.width = canvas.clientWidth + 'px';
      wrapper.style.height = 'auto';

      // 2. Measure natural scroll size vs target canvas size
      var naturalWidth = wrapper.scrollWidth || wrapper.offsetWidth;
      var naturalHeight = wrapper.scrollHeight || wrapper.offsetHeight;
      var targetWidth = canvas.clientWidth;
      var targetHeight = canvas.clientHeight;

      if (targetWidth > 0 && targetHeight > 0 && (naturalHeight > targetHeight || naturalWidth > targetWidth)) {
        var scaleX = targetWidth / Math.max(1, naturalWidth);
        var scaleY = targetHeight / Math.max(1, naturalHeight);
        var scale = Math.min(scaleX, scaleY) * 0.97; // 3% margin protects against thermal roll edge clipping

        wrapper.style.width = Math.round(targetWidth / scale) + 'px';
        wrapper.style.height = Math.round(targetHeight / scale) + 'px';
        wrapper.style.transform = 'scale(' + scale.toFixed(4) + ')';
        wrapper.style.transformOrigin = 'top left';

        if (scaleBadge) {
          scaleBadge.style.display = 'inline-block';
          scaleBadge.style.background = '#065f46';
          scaleBadge.style.color = '#6ee7b7';
          scaleBadge.textContent = 'Auto-Scaled: ' + Math.round(scale * 100) + '% (Anti-Cut)';
        }
      } else {
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.transform = 'none';

        if (scaleBadge) {
          scaleBadge.style.display = 'inline-block';
          scaleBadge.style.background = '#1e3a8a';
          scaleBadge.style.color = '#93c5fd';
          scaleBadge.textContent = '1:1 True Fit';
        }
      }
    }

    (function() {
      // Execute immediately and upon all readiness checkpoints
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        fitToCanvas();
      } else {
        document.addEventListener('DOMContentLoaded', fitToCanvas);
      }
      window.addEventListener('load', fitToCanvas);
      window.addEventListener('resize', fitToCanvas);
      window.onbeforeprint = fitToCanvas;
      setTimeout(fitToCanvas, 60);
      setTimeout(fitToCanvas, 200);

      // Auto-focus print button & bind Enter key for 1-touch printing
      function bindKeysAndFocus() {
        var printBtn = document.getElementById('btnThermalPrint') || document.querySelector('.btn-print');
        if (printBtn) {
          try { printBtn.focus(); } catch(_) {}
        }
      }

      window.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          fitToCanvas();
          window.print();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          window.close();
        }
      });

      bindKeysAndFocus();
      setTimeout(bindKeysAndFocus, 100);

      var autoPrint = ${config.autoPrint ? 'true' : 'false'};
      if (autoPrint) {
        setTimeout(function() {
          fitToCanvas();
          window.print();
        }, 320);
      }
    })();
  </script>
</body>
</html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return popup;
}
