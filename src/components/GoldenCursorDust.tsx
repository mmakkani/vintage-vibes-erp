import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  color: string;
  rotation: number;
  dRot: number;
}

const GOLD_PALETTE = [
  '#f59e0b', // amber-500
  '#fbbf24', // amber-400
  '#d97706', // amber-600
  '#fef08a', // yellow-200
  '#ffffff', // bright spark
  '#d4af37'  // metallic gold
];

export const GoldenCursorDust: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles: Particle[] = [];
    let lastX = -100;
    let lastY = -100;
    let animationFrameId: number;

    const spawnParticles = (x: number, y: number, count = 2) => {
      for (let i = 0; i < count; i++) {
        if (particles.length > 70) break;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 1.5 + 0.3;
        particles.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.4,
          size: Math.random() * 2.6 + 1.0,
          alpha: 1.0,
          decay: Math.random() * 0.025 + 0.02,
          color: GOLD_PALETTE[Math.floor(Math.random() * GOLD_PALETTE.length)],
          rotation: Math.random() * Math.PI,
          dRot: (Math.random() - 0.5) * 0.1
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      if (dist > 6) {
        spawnParticles(e.clientX, e.clientY, dist > 20 ? 3 : 2);
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };

    const handleClick = (e: MouseEvent) => {
      spawnParticles(e.clientX, e.clientY, 8);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('click', handleClick, { passive: true });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        p.rotation += p.dRot;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.alpha);

        ctx.fillStyle = p.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        const s = p.size;
        ctx.moveTo(0, -s * 1.5);
        ctx.lineTo(s * 0.4, -s * 0.4);
        ctx.lineTo(s * 1.5, 0);
        ctx.lineTo(s * 0.4, s * 0.4);
        ctx.lineTo(0, s * 1.5);
        ctx.lineTo(-s * 0.4, s * 0.4);
        ctx.lineTo(-s * 1.5, 0);
        ctx.lineTo(-s * 0.4, -s * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="golden-cursor-dust-canvas"
      className="pointer-events-none fixed inset-0 z-[9999] opacity-75"
      style={{ willChange: 'transform' }}
    />
  );
};
