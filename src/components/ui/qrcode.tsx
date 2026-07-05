import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

interface QRCodeCanvasProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  className?: string;
  /** Overlay the Goblin mark in the center (payment QRs only). Forces level H. */
  logo?: boolean;
}

export function QRCodeCanvas({ value, size = 256, level = 'M', className, logo = false }: QRCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // When the logo is shown, force the highest error-correction level so the
  // center overlay never breaks scanning.
  const effectiveLevel = logo ? 'H' : level;

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    QRCode.toCanvas(
      canvas,
      value,
      {
        width: size,
        margin: 1,
        errorCorrectionLevel: effectiveLevel,
      },
      (error) => {
        if (error) console.error('QR Code generation error:', error);
      }
    );

    // The qrcode library hard-codes inline `width`/`height` pixel styles on
    // the canvas, which override Tailwind sizing classes and cause the QR to
    // overflow its container on narrow viewports. Clear them so the caller's
    // className (e.g. `h-auto w-full`) controls the rendered size responsively.
    canvas.style.removeProperty('width');
    canvas.style.removeProperty('height');
  }, [value, size, effectiveLevel]);

  if (!logo) {
    return <canvas ref={canvasRef} className={className} />;
  }

  return (
    <div className={`relative inline-block ${className ?? ''}`}>
      <canvas ref={canvasRef} className="block h-auto w-full" />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: '24%',
          height: '24%',
          padding: '4%',
          borderRadius: '18%',
          background: '#fff',
          boxSizing: 'border-box',
        }}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }}>
          <path fill="#201d09" d="M20 22c0-3 3-5 6-4l6 3 6-3c3-1 6 1 6 4v10c0 8-6 14-12 14S20 40 20 32z" />
          <circle cx="26" cy="30" r="3" fill="#fff" />
          <circle cx="38" cy="30" r="3" fill="#fff" />
          <path fill="#fff" d="M28 40h8l-4 5z" />
        </svg>
      </div>
    </div>
  );
}
