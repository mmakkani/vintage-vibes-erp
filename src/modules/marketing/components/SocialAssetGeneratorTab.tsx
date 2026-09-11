import React, { useState, useEffect, useRef } from 'react';
import {
  Palette,
  Download,
  Package,
  Sparkles,
  Share2,
  CheckCircle2,
  SlidersHorizontal,
  RefreshCw,
  Search,
  Check,
  Layers,
  Archive,
  DollarSign,
  ArrowRight
} from 'lucide-react';
import JSZip from 'jszip';
import { PieceBreakdownItem, InwardGatePass } from '../../purchase/purchase.types.ts';
import { SocialCardSettings } from '../marketing.types.ts';

export const SocialAssetGeneratorTab: React.FC = () => {
  const [pieces, setPieces] = useState<PieceBreakdownItem[]>([]);
  const [bales, setBales] = useState<InwardGatePass[]>([]);
  const [selectedBaleId, setSelectedBaleId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPieceIds, setSelectedPieceIds] = useState<string[]>([]);
  const [activePreviewPiece, setActivePreviewPiece] = useState<PieceBreakdownItem | null>(null);

  // Settings
  const [settings, setSettings] = useState<SocialCardSettings>({
    aspectRatio: '1:1',
    theme: 'vintage-gold',
    showPriceAed: true,
    showPriceUsd: true,
    usdExchangeRate: 0.272,
    showAuthenticityBadge: true,
    showSizePill: true,
    showConditionGrade: true,
    showBarcodeTag: true,
    customBannerText: '🔥 1-OF-1 VAULT ARCHIVE • DUBAI'
  });

  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [pushedToDropsSuccess, setPushedToDropsSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchData = async () => {
    try {
      const [piecesRes, balesRes] = await Promise.all([
        fetch('/api/purchase/pieces'),
        fetch('/api/purchase/gate-passes')
      ]);
      if (piecesRes.ok) {
        const pData = await piecesRes.json();
        const inStock = (pData || []).filter((p: PieceBreakdownItem) => !p.isSold && p.status === 'IN_STOCK');
        setPieces(inStock);
        if (inStock.length > 0 && !activePreviewPiece) {
          setActivePreviewPiece(inStock[0]);
          setSelectedPieceIds(inStock.slice(0, 4).map((p: PieceBreakdownItem) => p.id));
        }
      }
      if (balesRes.ok) {
        setBales(await balesRes.json());
      }
    } catch (err) {
      console.warn('Error loading pieces for social asset maker:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered pieces based on bale and search
  const filteredPieces = pieces.filter(p => {
    if (selectedBaleId !== 'ALL' && p.gatePassId !== selectedBaleId && p.baleCode !== selectedBaleId) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.itemName.toLowerCase().includes(q) ||
        p.brandName.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.style || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Render Social Card on HTML5 Canvas
  const drawCardToCanvas = (
    canvas: HTMLCanvasElement,
    piece: PieceBreakdownItem,
    cfg: SocialCardSettings
  ): Promise<void> => {
    return new Promise(resolve => {
      const isSquare = cfg.aspectRatio === '1:1';
      const width = 1080;
      const height = isSquare ? 1080 : 1920;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve();

      // Background Luxury Theme Gradient
      const bgGradient = ctx.createLinearGradient(0, 0, width, height);
      if (cfg.theme === 'neon-street') {
        bgGradient.addColorStop(0, '#0F172A');
        bgGradient.addColorStop(1, '#020617');
      } else if (cfg.theme === 'minimal-lux') {
        bgGradient.addColorStop(0, '#FDFBF7');
        bgGradient.addColorStop(1, '#F3EDE2');
      } else {
        // vintage-gold
        bgGradient.addColorStop(0, '#1E1408');
        bgGradient.addColorStop(0.5, '#0C0A09');
        bgGradient.addColorStop(1, '#1A0E05');
      }
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Luxury Outer Gold Border
      ctx.strokeStyle = cfg.theme === 'minimal-lux' ? '#D4AF37' : '#EAB308';
      ctx.lineWidth = 14;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      // Inner subtle border
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(44, 44, width - 88, height - 88);

      // Brand Header & Seal
      ctx.fillStyle = '#EAB308';
      ctx.font = 'bold 32px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '6px';
      ctx.fillText('VINTAGE VIBES DUBAI', width / 2, isSquare ? 110 : 140);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '16px monospace';
      ctx.letterSpacing = '3px';
      ctx.fillText('CURATED VINTAGE & THRIFT ARCHIVE', width / 2, isSquare ? 142 : 175);

      // Custom Banner text if set
      if (cfg.customBannerText) {
        ctx.fillStyle = '#EAB308';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(cfg.customBannerText, width / 2, isSquare ? 175 : 215);
      }

      // Load and Draw Product Image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = piece.frontImageUrl || '/vintage_vibes_seal.svg';

      const renderImageAndOverlay = () => {
        // Image box coordinates
        const imgX = isSquare ? 100 : 90;
        const imgY = isSquare ? 210 : 270;
        const imgW = isSquare ? width - 200 : width - 180;
        const imgH = isSquare ? 540 : 1000;

        // Draw image rounded container
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(imgX, imgY, imgW, imgH, 24);
        ctx.clip();

        // Fill black backing
        ctx.fillStyle = '#000000';
        ctx.fillRect(imgX, imgY, imgW, imgH);

        // Aspect fit image
        const imgAspect = (img.width || 1) / (img.height || 1);
        const boxAspect = imgW / imgH;
        let dw = imgW;
        let dh = imgH;
        let dx = imgX;
        let dy = imgY;

        if (imgAspect > boxAspect) {
          dh = imgW / imgAspect;
          dy = imgY + (imgH - dh) / 2;
        } else {
          dw = imgH * imgAspect;
          dx = imgX + (imgW - dw) / 2;
        }

        try {
          ctx.drawImage(img, dx, dy, dw, dh);
        } catch (_) {
          // Fallback placeholder
          ctx.fillStyle = '#222';
          ctx.fillRect(imgX, imgY, imgW, imgH);
        }

        // Inner soft vignette
        const vignette = ctx.createLinearGradient(imgX, imgY + imgH - 120, imgX, imgY + imgH);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = vignette;
        ctx.fillRect(imgX, imgY + imgH - 120, imgW, 120);

        ctx.restore();

        // Image Frame Border
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.6)';
        ctx.lineWidth = 6;
        ctx.strokeRect(imgX, imgY, imgW, imgH);

        // Bottom Details Section
        const bottomY = isSquare ? 800 : 1330;

        // Brand & Item Title
        ctx.fillStyle = '#EAB308';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText((piece.brandName || 'VINTAGE').toUpperCase(), width / 2, bottomY);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 36px Georgia, serif';
        ctx.fillText(piece.itemName || 'Vintage Grail Piece', width / 2, bottomY + 45);

        // Size Pill & Authenticity Badge
        const badgesY = bottomY + 105;
        const priceAed = piece.retailPriceAed || piece.estimatedPrice || 120;
        const priceUsd = Math.round(priceAed * cfg.usdExchangeRate);

        // Draw Price Pill
        const priceText = `AED ${priceAed} / $${priceUsd}`;
        ctx.fillStyle = '#EAB308';
        ctx.beginPath();
        ctx.roundRect(width / 2 - 170, badgesY - 32, 340, 52, 14);
        ctx.fill();

        ctx.fillStyle = '#0F172A';
        ctx.font = 'black 28px monospace';
        ctx.fillText(priceText, width / 2, badgesY + 5);

        // Size & Grade Pills
        const subPillsY = badgesY + 60;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(`SIZE: ${piece.sizeScanned || 'L'}   •   GRADE: ${piece.labelGrade || 'A'}`, width / 2, subPillsY);

        // Barcode / SKU Tag for claiming
        ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`SKU / CLAIM: ${piece.barcode}`, width / 2, subPillsY + 38);

        // Authenticity Seal Footer
        if (cfg.showAuthenticityBadge) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = '14px monospace';
          ctx.fillText('100% CERTIFIED VINTAGE • INSPECTED & CERTIFIED IN AL QUOZ DUBAI', width / 2, isSquare ? 1025 : 1850);
        }

        resolve();
      };

      img.onload = renderImageAndOverlay;
      img.onerror = renderImageAndOverlay;
    });
  };

  // Re-render canvas preview whenever settings or active piece change
  useEffect(() => {
    if (canvasRef.current && activePreviewPiece) {
      drawCardToCanvas(canvasRef.current, activePreviewPiece, settings);
    }
  }, [activePreviewPiece, settings]);

  // Single PNG Download
  const handleDownloadSinglePng = () => {
    if (!canvasRef.current || !activePreviewPiece) return;
    const link = document.createElement('a');
    link.download = `VINTAGE_${activePreviewPiece.barcode}_${settings.aspectRatio.replace(':', 'x')}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Batch ZIP Download with JSZip
  const handleDownloadAllZip = async () => {
    const piecesToExport = pieces.filter(p => selectedPieceIds.includes(p.id));
    if (piecesToExport.length === 0) return;

    setIsGeneratingZip(true);
    setZipProgress(0);

    try {
      const zip = new JSZip();
      const squareFolder = zip.folder('1x1_Square_Instagram_Feed');
      const storyFolder = zip.folder('9x16_Story_TikTok_Reels');

      const offscreenCanvas = document.createElement('canvas');

      for (let i = 0; i < piecesToExport.length; i++) {
        const piece = piecesToExport[i];

        // 1. Generate 1:1
        await drawCardToCanvas(offscreenCanvas, piece, { ...settings, aspectRatio: '1:1' });
        const sqDataUrl = offscreenCanvas.toDataURL('image/png');
        const sqBase64 = sqDataUrl.replace(/^data:image\/png;base64,/, '');
        squareFolder?.file(`${piece.barcode}_1x1.png`, sqBase64, { base64: true });

        // 2. Generate 9:16
        await drawCardToCanvas(offscreenCanvas, piece, { ...settings, aspectRatio: '9:16' });
        const storyDataUrl = offscreenCanvas.toDataURL('image/png');
        const storyBase64 = storyDataUrl.replace(/^data:image\/png;base64,/, '');
        storyFolder?.file(`${piece.barcode}_9x16.png`, storyBase64, { base64: true });

        setZipProgress(Math.round(((i + 1) / piecesToExport.length) * 100));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VintageVibes_SocialAssets_${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('ZIP generation error:', err);
    } finally {
      setIsGeneratingZip(false);
      setZipProgress(0);
    }
  };

  // Push Selected Items to Storefront Featured Drops
  const handlePushToStorefrontDrops = async () => {
    if (selectedPieceIds.length === 0) return;
    try {
      const res = await fetch('/api/marketing/featured-drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds: selectedPieceIds })
      });
      if (res.ok) {
        setPushedToDropsSuccess(true);
        setTimeout(() => setPushedToDropsSuccess(false), 3000);
      }
    } catch (err) {
      console.warn('Error pushing to storefront:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border border-amber-500/40 rounded-xl p-5 text-amber-100 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shrink-0 text-amber-300">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-white">
              One-Click Product Social Card Maker
            </h3>
            <p className="text-xs text-amber-200/80 mt-1 max-w-2xl">
              Composite physical garment studio photos with official 3D logo, dual AED/USD price badges, size pills, and vintage authenticity seals into 1:1 Square & 9:16 Story formats.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={handleDownloadSinglePng}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PNG</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadAllZip}
            disabled={isGeneratingZip || selectedPieceIds.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <Package className="w-3.5 h-3.5" />
            <span>{isGeneratingZip ? `Packaging ${zipProgress}%...` : `Download ZIP (${selectedPieceIds.length})`}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Item Selector & Controls */}
        <div className="lg:col-span-6 space-y-4">
          {/* Filter Bar: Bale & Search */}
          <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Select Sorted Bale or Pieces
              </h4>
              <button
                type="button"
                onClick={() => {
                  if (selectedPieceIds.length === filteredPieces.length) {
                    setSelectedPieceIds([]);
                  } else {
                    setSelectedPieceIds(filteredPieces.map(p => p.id));
                  }
                }}
                className="text-xs text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
              >
                {selectedPieceIds.length === filteredPieces.length ? 'Deselect All' : 'Select All In-Stock'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={selectedBaleId}
                onChange={e => setSelectedBaleId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Inward Bales & Inventory</option>
                {bales.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.gatePassNo} ({b.baleCode || 'Bale'})
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter pieces..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Pieces Grid / List */}
            <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
              {filteredPieces.map(piece => {
                const isSelected = selectedPieceIds.includes(piece.id);
                const isPreview = activePreviewPiece?.id === piece.id;

                return (
                  <div
                    key={piece.id}
                    onClick={() => setActivePreviewPiece(piece)}
                    className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition ${
                      isPreview ? 'bg-amber-100/70 border-l-4 border-l-amber-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          e.stopPropagation();
                          if (isSelected) {
                            setSelectedPieceIds(prev => prev.filter(id => id !== piece.id));
                          } else {
                            setSelectedPieceIds(prev => [...prev, piece.id]);
                          }
                        }}
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      />
                      <img
                        src={piece.frontImageUrl || '/vintage_vibes_seal.svg'}
                        alt=""
                        className="w-8 h-8 rounded object-cover border border-slate-200 bg-white shrink-0"
                      />
                      <div>
                        <span className="font-mono font-bold text-slate-900 block">{piece.barcode}</span>
                        <span className="text-[11px] text-slate-600 truncate max-w-[200px] block">
                          {piece.itemName} ({piece.brandName})
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-700 block">
                        AED {piece.retailPriceAed || piece.estimatedPrice}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Size: {piece.sizeScanned}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <span className="text-[11px] text-slate-500 font-mono block">
              {selectedPieceIds.length} pieces selected for batch rendering
            </span>
          </div>

          {/* Social Card Customization Controls */}
          <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs space-y-3">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-700" />
              <span>Canvas Styling & Badges</span>
            </h4>

            {/* Format Switcher */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, aspectRatio: '1:1' }))}
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 border ${
                  settings.aspectRatio === '1:1'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>📱 1:1 Square (Feed)</span>
              </button>
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, aspectRatio: '9:16' }))}
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 border ${
                  settings.aspectRatio === '9:16'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>📲 9:16 Story (TikTok/Reels)</span>
              </button>
            </div>

            {/* Banner Text Customization */}
            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                Custom Banner Tagline
              </label>
              <input
                type="text"
                value={settings.customBannerText}
                onChange={e => setSettings(s => ({ ...s, customBannerText: e.target.value }))}
                placeholder="e.g. 🔥 1-OF-1 VAULT ARCHIVE • DUBAI"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPriceAed}
                  onChange={e => setSettings(s => ({ ...s, showPriceAed: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span className="text-slate-700">Show AED Price</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showPriceUsd}
                  onChange={e => setSettings(s => ({ ...s, showPriceUsd: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span className="text-slate-700">Show USD Price ($)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showAuthenticityBadge}
                  onChange={e => setSettings(s => ({ ...s, showAuthenticityBadge: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span className="text-slate-700">Authenticity Badge</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.showSizePill}
                  onChange={e => setSettings(s => ({ ...s, showSizePill: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span className="text-slate-700">Size & Grade Pill</span>
              </label>
            </div>

            {/* Push to Storefront Action */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handlePushToStorefrontDrops}
                disabled={selectedPieceIds.length === 0}
                className="w-full py-2 bg-slate-100 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Push Selected to Storefront Featured Drops</span>
              </button>
            </div>
            {pushedToDropsSuccess && (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Pushed to Storefront Featured Drops!
              </span>
            )}
          </div>
        </div>

        {/* Right Column: High Fidelity Live Canvas Preview */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col items-center w-full max-w-[420px]">
            <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400 font-mono">
              <span>{settings.aspectRatio === '1:1' ? '1080 x 1080 (Square)' : '1080 x 1920 (Story)'}</span>
              <span className="text-amber-400 font-bold">{activePreviewPiece?.barcode || 'No piece'}</span>
            </div>

            {/* Canvas Element with responsive scaling */}
            <div className="w-full rounded-xl overflow-hidden shadow-2xl border border-amber-400/40 bg-black flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className={`max-w-full h-auto object-contain ${
                  settings.aspectRatio === '1:1' ? 'aspect-square' : 'aspect-[9/16] max-h-[560px]'
                }`}
              />
            </div>

            <div className="w-full mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 font-mono">Instant Export Ready</span>
              <button
                type="button"
                onClick={handleDownloadSinglePng}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg shadow transition cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Save PNG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
