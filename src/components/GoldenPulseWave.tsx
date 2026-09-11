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

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      step += 0.045 * intensity;

      // Draw flowing golden sine waveform
      ctx.beginPath();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#f59e0b';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';

      for (let x = 0; x < width; x += 2) {
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

      // Second soft ambient glow wave
      ctx.beginPath();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.6)';
      ctx.shadowBlur = 3;
      ctx.shadowColor = 'rgba(254, 240, 138, 0.5)';

      for (let x = 0; x < width; x += 3) {
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

    render();

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = 24;
    };
    window.addEventListener('resize', handleResize);

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
