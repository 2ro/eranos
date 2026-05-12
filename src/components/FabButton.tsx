interface FabButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
}

/**
 * Reusable circular FAB.
 */
export function FabButton({ onClick, icon, disabled, className = '', title }: FabButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative size-16 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${className}`}
      style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--primary) / 0.25))' }}
    >
      <div className="absolute inset-0 bg-primary rounded-full" />
      <span className="absolute inset-0 flex items-center justify-center text-primary-foreground">
        {icon}
      </span>
    </button>
  );
}
