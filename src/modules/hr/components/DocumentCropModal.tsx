import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, Check, RotateCw, Sparkles, Magnet, Lock, Unlock, 
  Maximize2, ZoomIn, ZoomOut, AlertCircle, RefreshCw, Layers
} from 'lucide-react';
import { DOC_SPECS, getCardSnapAnchors, manualCropDocument, CardBounds } from '../../../utils/documentCropper.ts';

interface DocumentCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  docType?: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA';
  initialBounds?: { x: number; y: number; width: number; height: number };
  onApplyCrop: (croppedDataUrl: string, bounds: { x: number; y: number; width: number; height: number }) => void;
}

type DragMode = 
  | 'none' 
  | 'move' 
  | 'tl' | 'tr' | 'bl' | 'br' 
  | 't' | 'b' | 'l' | 'r';

export const DocumentCropModal: React.FC<DocumentCropModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  docType = 'EMIRATES_ID',
  initialBounds,
  onApplyCrop
}) => {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [imageRotation, setImageRotation] = useState<number>(0);

  // Crop rectangle in natural image coordinate space
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 100,
    height: 100
  });

  // AI-detected card magnetic snap anchors
  const [snapAnchors, setSnapAnchors] = useState<CardBounds | null>(null);
  const [isMagneticEnabled, setIsMagneticEnabled] = useState(true);
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);
  const [snappedEdges, setSnappedEdges] = useState<{ t?: boolean; b?: boolean; l?: boolean; r?: boolean }>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    initialCrop: { x: number; y: number; width: number; height: number };
  }>({ mode: 'none', startX: 0, startY: 0, initialCrop: { x: 0, y: 0, width: 0, height: 0 } });

  const targetSpec = DOC_SPECS[docType === 'PASSPORT' ? 'PASSPORT' : docType === 'RESIDENCY_VISA' ? 'RESIDENCY_VISA' : 'EMIRATES_ID'];
  const targetRatio = targetSpec.aspectRatio;

  // Load image and detect snap boundaries
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      if (!active) return;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setImageElement(img);
      setNaturalWidth(w);
      setNaturalHeight(h);
      setImageRotation(0);

      // 1. Detect magnetic anchors via card edge detection
      try {
        const anchors = await getCardSnapAnchors(imageUrl, docType);
        if (!active) return;
        setSnapAnchors(anchors);

        if (initialBounds && initialBounds.width > 50 && initialBounds.height > 50) {
          setCrop(initialBounds);
        } else if (anchors && anchors.width > 50 && anchors.height > 50) {
          setCrop({
            x: anchors.x,
            y: anchors.y,
            width: anchors.width,
            height: anchors.height
          });
        } else {
          // Default centered ID-1 box
          let cw = Math.round(w * 0.85);
          let ch = Math.round(cw / targetRatio);
          if (ch > h * 0.85) {
            ch = Math.round(h * 0.85);
            cw = Math.round(ch * targetRatio);
          }
          setCrop({
            x: Math.round((w - cw) / 2),
            y: Math.round((h - ch) / 2),
            width: cw,
            height: ch
          });
        }
      } catch (err) {
        let cw = Math.round(w * 0.85);
        let ch = Math.round(cw / targetRatio);
        setCrop({
          x: Math.round((w - cw) / 2),
          y: Math.round((h - ch) / 2),
          width: cw,
          height: ch
        });
      }
    };
    img.src = imageUrl;

    return () => {
      active = false;
    };
  }, [isOpen, imageUrl, docType, targetRatio]);

  // Compute displayed scale of image inside container
  const getContainerLayout = useCallback(() => {
    if (!containerRef.current || !naturalWidth || !naturalHeight) {
      return { displayW: 1, displayH: 1, offsetX: 0, offsetY: 0, scale: 1 };
    }
    const rect = containerRef.current.getBoundingClientRect();
    const contW = rect.width;
    const contH = rect.height;

    const scale = Math.min(contW / naturalWidth, contH / naturalHeight);
    const displayW = naturalWidth * scale;
    const displayH = naturalHeight * scale;
    const offsetX = (contW - displayW) / 2;
    const offsetY = (contH - displayH) / 2;

    return { displayW, displayH, offsetX, offsetY, scale, contRect: rect };
  }, [naturalWidth, naturalHeight]);

  // Convert mouse/touch event to natural image coordinates
  const clientToImageCoords = useCallback((clientX: number, clientY: number) => {
    const { scale, offsetX, offsetY, contRect } = getContainerLayout();
    if (!contRect) return { x: 0, y: 0 };
    const relX = clientX - contRect.left - offsetX;
    const relY = clientY - contRect.top - offsetY;
    return {
      x: Math.max(0, Math.min(naturalWidth, relX / scale)),
      y: Math.max(0, Math.min(naturalHeight, relY / scale))
    };
  }, [getContainerLayout, naturalWidth, naturalHeight]);

  // Start dragging a handle or the box
  const handlePointerDown = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const coords = clientToImageCoords(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      startX: coords.x,
      startY: coords.y,
      initialCrop: { ...crop }
    };
  };

  // Pointer move handler with magnetic edge-snapping
  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragRef.current.mode === 'none') return;
    e.preventDefault();

    const { mode, startX, startY, initialCrop } = dragRef.current;
    const current = clientToImageCoords(e.clientX, e.clientY);
    const dx = current.x - startX;
    const dy = current.y - startY;

    let newCrop = { ...initialCrop };
    const snapped: { t?: boolean; b?: boolean; l?: boolean; r?: boolean } = {};

    // Calculate magnetic snap threshold in image pixels (~20 screen pixels)
    const { scale } = getContainerLayout();
    const snapThreshold = scale > 0 ? 20 / scale : 20;

    // Helper to snap an edge to AI anchor or image boundary
    const snapValue = (val: number, anchorVal: number, edgeKey: 't' | 'b' | 'l' | 'r') => {
      if (!isMagneticEnabled) return val;
      if (Math.abs(val - anchorVal) <= snapThreshold) {
        snapped[edgeKey] = true;
        return anchorVal;
      }
      return val;
    };

    if (mode === 'move') {
      let nx = initialCrop.x + dx;
      let ny = initialCrop.y + dy;

      // Snap left or right
      if (snapAnchors) {
        nx = snapValue(nx, snapAnchors.x, 'l');
        if (snapValue(nx + initialCrop.width, snapAnchors.x + snapAnchors.width, 'r') !== nx + initialCrop.width) {
          nx = snapAnchors.x + snapAnchors.width - initialCrop.width;
          snapped.r = true;
        }
        ny = snapValue(ny, snapAnchors.y, 't');
        if (snapValue(ny + initialCrop.height, snapAnchors.y + snapAnchors.height, 'b') !== ny + initialCrop.height) {
          ny = snapAnchors.y + snapAnchors.height - initialCrop.height;
          snapped.b = true;
        }
      }

      nx = Math.max(0, Math.min(naturalWidth - initialCrop.width, nx));
      ny = Math.max(0, Math.min(naturalHeight - initialCrop.height, ny));

      newCrop.x = Math.round(nx);
      newCrop.y = Math.round(ny);
    } else {
      let l = initialCrop.x;
      let r = initialCrop.x + initialCrop.width;
      let t = initialCrop.y;
      let b = initialCrop.y + initialCrop.height;

      // Adjust raw edges based on handle
      if (mode.includes('l')) {
        l = Math.min(r - 40, Math.max(0, initialCrop.x + dx));
        if (snapAnchors) l = snapValue(l, snapAnchors.x, 'l');
      }
      if (mode.includes('r')) {
        r = Math.max(l + 40, Math.min(naturalWidth, initialCrop.x + initialCrop.width + dx));
        if (snapAnchors) r = snapValue(r, snapAnchors.x + snapAnchors.width, 'r');
      }
      if (mode.includes('t')) {
        t = Math.min(b - 40, Math.max(0, initialCrop.y + dy));
        if (snapAnchors) t = snapValue(t, snapAnchors.y, 't');
      }
      if (mode.includes('b')) {
        b = Math.max(t + 40, Math.min(naturalHeight, initialCrop.y + initialCrop.height + dy));
        if (snapAnchors) b = snapValue(b, snapAnchors.y + snapAnchors.height, 'b');
      }

      // Enforce aspect ratio if locked
      if (isAspectRatioLocked) {
        if (mode === 'tl' || mode === 'br' || mode === 'r' || mode === 'l') {
          const w = r - l;
          const desiredH = Math.round(w / targetRatio);
          if (mode.includes('t')) {
            t = Math.max(0, b - desiredH);
          } else {
            b = Math.min(naturalHeight, t + desiredH);
          }
        } else if (mode === 'tr' || mode === 'bl' || mode === 't' || mode === 'b') {
          const h = b - t;
          const desiredW = Math.round(h * targetRatio);
          if (mode.includes('l')) {
            l = Math.max(0, r - desiredW);
          } else {
            r = Math.min(naturalWidth, l + desiredW);
          }
        }
      }

      newCrop = {
        x: Math.round(l),
        y: Math.round(t),
        width: Math.round(Math.max(40, r - l)),
        height: Math.round(Math.max(40, b - t))
      };
    }

    // Gentle haptic feedback on snap
    if ((snapped.t || snapped.b || snapped.l || snapped.r) && 
        (!snappedEdges.t && !snappedEdges.b && !snappedEdges.l && !snappedEdges.r)) {
      try { navigator.vibrate?.(15); } catch (_) {}
    }

    setSnappedEdges(snapped);
    setCrop(newCrop);
  };

  const handlePointerUp = () => {
    dragRef.current.mode = 'none';
    setSnappedEdges({});
  };

  // Reset to AI detected card corners
  const handleSnapToAi = () => {
    if (snapAnchors) {
      setCrop({
        x: snapAnchors.x,
        y: snapAnchors.y,
        width: snapAnchors.width,
        height: snapAnchors.height
      });
      try { navigator.vibrate?.(30); } catch (_) {}
    }
  };

  // Rotate image 90 degrees
  const handleRotate = async () => {
    if (!imageElement || !naturalWidth || !naturalHeight) return;
    setIsProcessing(true);

    try {
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = naturalHeight;
      rotCanvas.height = naturalWidth;
      const ctx = rotCanvas.getContext('2d');
      if (!ctx) return;

      ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(imageElement, -naturalWidth / 2, -naturalHeight / 2);

      const rotatedDataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);
      const newImg = new Image();
      newImg.crossOrigin = 'anonymous';
      newImg.onload = async () => {
        setImageElement(newImg);
        setNaturalWidth(newImg.naturalWidth);
        setNaturalHeight(newImg.naturalHeight);
        setImageRotation(prev => (prev + 90) % 360);

        // Re-detect card anchors on rotated image
        const anchors = await getCardSnapAnchors(rotatedDataUrl, docType);
        setSnapAnchors(anchors);
        setCrop({
          x: anchors.x,
          y: anchors.y,
          width: anchors.width,
          height: anchors.height
        });
        setIsProcessing(false);
      };
      newImg.src = rotatedDataUrl;
    } catch (err) {
      console.warn('Rotation failed:', err);
      setIsProcessing(false);
    }
  };

  // Commit crop
  const handleApply = async () => {
    if (!imageElement || isProcessing) return;
    setIsProcessing(true);

    try {
      const croppedBase64 = await manualCropDocument(
        imageElement.src,
        crop,
        targetSpec.defaultWidth
      );
      onApplyCrop(croppedBase64, crop);
      onClose();
    } catch (err) {
      console.error('Failed to crop document:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const { displayW, displayH, offsetX, offsetY, scale } = getContainerLayout();

  // Screen pixel coordinates of the crop box
  const boxLeft = offsetX + crop.x * scale;
  const boxTop = offsetY + crop.y * scale;
  const boxWidth = crop.width * scale;
  const boxHeight = crop.height * scale;

  return (
    <div className="fixed inset-0 z-80 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="bg-slate-900 text-white rounded-2xl max-w-3xl w-full border border-slate-700 shadow-2xl overflow-hidden flex flex-col h-[92vh] max-h-[850px] relative">
        
        {/* Header */}
        <div className="p-3 sm:p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Precision Card Edge Cropper</span>
                <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded-full font-mono">
                  MAGNETIC SNAPPING
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">
                Drag handles to frame card. Edges snap magnetically to Emirates ID boundaries.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all font-bold"
          >
            ✕
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="bg-slate-900/90 px-3 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 z-20 text-xs">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Snap to AI Detected Card Corners */}
            <button
              type="button"
              onClick={handleSnapToAi}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow-xs text-xs"
              title="Snap crop box to AI-detected card borders"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Auto-Detected Box</span>
            </button>

            {/* Toggle Magnetic Snapping */}
            <button
              type="button"
              onClick={() => setIsMagneticEnabled(!isMagneticEnabled)}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs border ${
                isMagneticEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Magnetic snapping to card physical edges"
            >
              <Magnet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Magnet:</span>
              <span>{isMagneticEnabled ? 'ON' : 'OFF'}</span>
            </button>

            {/* Lock Aspect Ratio (1.586) */}
            <button
              type="button"
              onClick={() => setIsAspectRatioLocked(!isAspectRatioLocked)}
              className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs border ${
                isAspectRatioLocked
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Lock card aspect ratio (85.60 mm x 53.98 mm)"
            >
              {isAspectRatioLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">ID-1 Ratio (1.586)</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Rotate Button */}
            <button
              type="button"
              onClick={handleRotate}
              disabled={isProcessing}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold flex items-center gap-1 text-xs"
              title="Rotate image 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate 90°</span>
            </button>
          </div>
        </div>

        {/* Canvas / Viewport Area */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-2 select-none touch-none"
        >
          {/* Base Image */}
          {imageElement && (
            <img
              src={imageElement.src}
              alt="Source Document"
              style={{
                width: `${displayW}px`,
                height: `${displayH}px`,
                position: 'absolute',
                left: `${offsetX}px`,
                top: `${offsetY}px`,
                pointerEvents: 'none'
              }}
            />
          )}

          {/* Vignette / Dark Shroud Outside Crop Box */}
          {imageElement && (
            <div
              style={{
                position: 'absolute',
                left: `${boxLeft}px`,
                top: `${boxTop}px`,
                width: `${boxWidth}px`,
                height: `${boxHeight}px`,
                boxShadow: '0 0 0 9999px rgba(5, 10, 20, 0.72)',
                pointerEvents: 'none',
                borderRadius: '8px'
              }}
            />
          )}

          {/* Crop Rectangle & Handles */}
          {imageElement && (
            <div
              onPointerDown={(e) => handlePointerDown('move', e)}
              style={{
                position: 'absolute',
                left: `${boxLeft}px`,
                top: `${boxTop}px`,
                width: `${boxWidth}px`,
                height: `${boxHeight}px`,
                cursor: 'move'
              }}
              className={`border-2 rounded-lg transition-colors ${
                (snappedEdges.t || snappedEdges.b || snappedEdges.l || snappedEdges.r)
                  ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                  : 'border-blue-400/90 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
              }`}
            >
              {/* Inner Rule-of-Thirds Grid */}
              <div className="absolute inset-0 pointer-events-none opacity-25 grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-white"></div>
                <div className="border-r border-white"></div>
                <div></div>
              </div>

              {/* Status Tag Badge */}
              <div className="absolute top-2 left-2 pointer-events-none bg-slate-900/90 backdrop-blur-xs text-[9px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-300 flex items-center gap-1.5">
                <span>{Math.round(crop.width)} × {Math.round(crop.height)}px</span>
                <span className="text-blue-400">({(crop.width / (crop.height || 1)).toFixed(2)} : 1)</span>
                {(snappedEdges.t || snappedEdges.b || snappedEdges.l || snappedEdges.r) && (
                  <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                    <Magnet className="w-2.5 h-2.5 animate-pulse" /> Snapped
                  </span>
                )}
              </div>

              {/* 4 Corner Handles (Touch-friendly 24x24px) */}
              <div
                onPointerDown={(e) => handlePointerDown('tl', e)}
                className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-white border-3 border-blue-600 shadow-md cursor-nwse-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown('tr', e)}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-white border-3 border-blue-600 shadow-md cursor-nesw-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown('bl', e)}
                className="absolute -bottom-2.5 -left-2.5 w-6 h-6 rounded-full bg-white border-3 border-blue-600 shadow-md cursor-nesw-resize hover:scale-125 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown('br', e)}
                className="absolute -bottom-2.5 -right-2.5 w-6 h-6 rounded-full bg-white border-3 border-blue-600 shadow-md cursor-nwse-resize hover:scale-125 transition-transform"
              />

              {/* 4 Mid-Edge Handles */}
              <div
                onPointerDown={(e) => handlePointerDown('t', e)}
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full bg-blue-500 border border-white shadow-xs cursor-ns-resize hover:scale-110 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown('b', e)}
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full bg-blue-500 border border-white shadow-xs cursor-ns-resize hover:scale-110 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown('l', e)}
                className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-8 rounded-full bg-blue-500 border border-white shadow-xs cursor-ew-resize hover:scale-110 transition-transform"
              />
              <div
                onPointerDown={(e) => handlePointerDown('r', e)}
                className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-8 rounded-full bg-blue-500 border border-white shadow-xs cursor-ew-resize hover:scale-110 transition-transform"
              />
            </div>
          )}

          {/* Loading Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center z-30">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="text-xs font-semibold text-slate-300">Processing high-res crop...</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between z-20">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Target: {targetSpec.name} ({targetRatio.toFixed(2)} : 1)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-bold text-xs transition-all"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleApply}
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Save Crop</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
