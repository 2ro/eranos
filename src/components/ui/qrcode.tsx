import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

interface QRCodeCanvasProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  className?: string;
}

export function QRCodeCanvas({ value, size = 256, level = 'M', className }: QRCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    QRCode.toCanvas(
      canvas,
      value,
      {
        width: size,
        margin: 1,
        errorCorrectionLevel: level,
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
  }, [value, size, level]);

  return <canvas ref={canvasRef} className={className} />;
}
