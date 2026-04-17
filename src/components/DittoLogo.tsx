import { cn } from '@/lib/utils';

interface DittoLogoProps {
  className?: string;
  size?: number;
}

function LightningBolt({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
        fill="white"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Agora badge icon used across app chrome. */
export function DittoLogo({ className, size = 40 }: DittoLogoProps) {
  const boltSize = Math.max(12, Math.round(size * 0.56));

  return (
    <div
      role="img"
      aria-label="Agora"
      style={{
        width: size,
        height: size,
      }}
      className={cn(
        'relative rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-lg flex items-center justify-center',
        className,
      )}
    >
      <div className="absolute inset-0 rounded-full bg-primary/25 blur-md" aria-hidden />
      <div className="relative">
        <LightningBolt size={boltSize} />
      </div>
    </div>
  );
}
