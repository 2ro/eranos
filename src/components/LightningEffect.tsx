import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

export interface LightningTriggerOptions {
  /** Number of clustered strikes to fire. */
  strikes?: number;
}

export interface LightningEffectHandle {
  triggerLightning: (options?: LightningTriggerOptions) => void;
}

interface LightningEffectProps {
  /** Manual is one-shot only; weather auto-triggers intermittent strikes. */
  mode?: 'manual' | 'weather';
}

interface Point {
  x: number;
  y: number;
}

interface Segment {
  from: Point;
  to: Point;
}

interface Strike {
  startedAt: number;
  duration: number;
  segments: Segment[];
}

const MAX_SEGMENTS = 80;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function addDisplacedSegments(
  segments: Segment[],
  from: Point,
  to: Point,
  depth: number,
  offset: number,
): void {
  if (segments.length >= MAX_SEGMENTS) return;
  if (depth <= 0) {
    segments.push({ from, to });
    return;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const midpoint = {
    x: (from.x + to.x) / 2 + normalX * randomBetween(-offset, offset),
    y: (from.y + to.y) / 2 + normalY * randomBetween(-offset, offset),
  };

  addDisplacedSegments(segments, from, midpoint, depth - 1, offset * 0.52);
  addDisplacedSegments(segments, midpoint, to, depth - 1, offset * 0.52);

  if (segments.length < MAX_SEGMENTS && Math.random() < 0.36) {
    const angle = Math.atan2(dy, dx) + randomBetween(-0.95, 0.95);
    const branchLength = length * randomBetween(0.25, 0.55);
    const branchEnd = {
      x: midpoint.x + Math.cos(angle) * branchLength,
      y: midpoint.y + Math.sin(angle) * branchLength,
    };
    addDisplacedSegments(segments, midpoint, branchEnd, depth - 1, offset * 0.42);
  }
}

function createStrike(width: number, height: number): Strike {
  const start = {
    x: randomBetween(width * 0.08, width * 0.92),
    y: randomBetween(-height * 0.04, height * 0.14),
  };
  const end = {
    x: start.x + randomBetween(-width * 0.35, width * 0.35),
    y: randomBetween(height * 0.72, height * 1.05),
  };
  const segments: Segment[] = [];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  addDisplacedSegments(segments, start, end, 4, length * 0.15);

  return {
    startedAt: performance.now(),
    duration: randomBetween(320, 480),
    segments,
  };
}

function opacityFor(age: number, duration: number): number {
  if (age < 60) return age / 60;
  if (age < 140) return 1;
  return Math.max(0, 1 - (age - 140) / (duration - 140));
}

export const LightningEffect = forwardRef<LightningEffectHandle, LightningEffectProps>(
  function LightningEffect({ mode = 'manual' }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    const strikesRef = useRef<Strike[]>([]);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const weatherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resize = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }, []);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const now = performance.now();
      strikesRef.current = strikesRef.current.filter((strike) => now - strike.startedAt <= strike.duration);

      for (const strike of strikesRef.current) {
        const age = now - strike.startedAt;
        const opacity = opacityFor(age, strike.duration);

        if (age < 45) {
          ctx.fillStyle = `rgba(255,255,255,${0.03 * opacity})`;
          ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        }

        const passes = [
          { width: 8, alpha: 0.15, shadow: 0 },
          { width: 3, alpha: 0.4, shadow: 0 },
          { width: 1, alpha: 1, shadow: 12 },
        ];

        for (const pass of passes) {
          ctx.save();
          ctx.lineWidth = pass.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = pass.width === 1
            ? `rgba(255,255,255,${opacity})`
            : `rgba(192,232,255,${pass.alpha * opacity})`;
          ctx.shadowBlur = pass.shadow;
          ctx.shadowColor = '#88ccff';

          ctx.beginPath();
          for (const segment of strike.segments) {
            ctx.moveTo(segment.from.x, segment.from.y);
            ctx.lineTo(segment.to.x, segment.to.y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      if (strikesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = 0;
      }
    }, []);

    const startStrike = useCallback(() => {
      if (prefersReducedMotion()) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      strikesRef.current.push(createStrike(window.innerWidth, window.innerHeight));
      if (!rafRef.current) rafRef.current = requestAnimationFrame(draw);
    }, [draw]);

    const clearScheduledTimers = useCallback(() => {
      for (const timer of timersRef.current) clearTimeout(timer);
      timersRef.current = [];
    }, []);

    useImperativeHandle(ref, () => ({
      triggerLightning: (options) => {
        const count = Math.max(1, Math.min(options?.strikes ?? 1, 5));
        for (let i = 0; i < count; i++) {
          const timer = setTimeout(startStrike, i * randomBetween(70, 130));
          timersRef.current.push(timer);
        }
      },
    }), [startStrike]);

    useEffect(() => {
      resize();
      window.addEventListener('resize', resize);
      return () => {
        window.removeEventListener('resize', resize);
        cancelAnimationFrame(rafRef.current);
        clearScheduledTimers();
        if (weatherTimerRef.current) clearTimeout(weatherTimerRef.current);
      };
    }, [clearScheduledTimers, resize]);

    useEffect(() => {
      if (mode !== 'weather') return;

      const schedule = () => {
        weatherTimerRef.current = setTimeout(() => {
          startStrike();
          schedule();
        }, randomBetween(1500, 4000));
      };
      schedule();
      return () => {
        if (weatherTimerRef.current) clearTimeout(weatherTimerRef.current);
        weatherTimerRef.current = null;
      };
    }, [mode, startStrike]);

    return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[300]" aria-hidden="true" />;
  },
);
