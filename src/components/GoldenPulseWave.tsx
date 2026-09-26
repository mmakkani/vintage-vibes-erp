import React, { useEffect, useRef } from 'react';

interface GoldenPulseWaveProps {
  className?: string;
  velocityLabel?: string;
  intensity?: number;
}

export const GoldenPulseWave: React.FC<GoldenPulseWaveProps> = ({
  className = '',
  velocityLabel = '99.4% Settlement Velocity',
  intensity = 1.0
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 320);
    let height = (canvas.height = 24);

    let animationFrameId: number;
    let step = 0;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1000 / 24; // 24 FPS is silky smooth for waveforms while saving 60% CPU

    const render = (currentTime: number) => {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const elapsed = currentTime - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      lastFrameTime = currentTime - (elapsed % FRAME_INTERVAL);

      ctx.clearRect(0, 0, width, height);

      step += 0.045 * intensity;

      // Draw flowing golden sine waveform (clean, crisp, zero GPU blur lag)
      ctx.beginPath();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#f59e0b';

      for (let x = 0; x < width; x += 3) {
        // Multi-frequency harmonic wave with heartbeat pulse packets
        const pulseCenter = (width / 2) + Math.sin(step * 0.4) * (width * 0.35);
        const distFromCenter = Math.abs(x - pulseCenter);
        const packetEnvelope = Math.exp(-(distFromCenter * distFromCenter) / 2200);

        const baseWave = Math.sin(x * 0.05 + step) * 3;
        const fastWave = Math.sin(x * 0.12 - step * 1.5) * 2;
        const pulseSpike = Math.sin(x * 0.18 + step * 2) * 8 * packetEnvelope;

        const y = height / 2 + baseWave + fastWave + pulseSpike;

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Second soft ambient gold wave
      ctx.beginPath();
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';

      for (let x = 0; x < width; x += 4) {
        const y = height / 2 + Math.sin(x * 0.04 - step * 0.8) * 4;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = 24;
    };
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [intensity]);

  return (
    <div className={`flex items-center gap-2 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-400/30 overflow-hidden ${className}`}>
      <span className="text-[9px] uppercase font-mono font-bold text-amber-900 tracking-wider whitespace-nowrap">
        Financial Pulse:
      </span>
      <div className="relative flex-1 min-w-[90px] h-6 flex items-center">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
      <span className="text-[9px] font-mono font-black text-amber-900 tracking-tight whitespace-nowrap">
        {velocityLabel}
      </span>
    </div>
  );
};
