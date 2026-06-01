import { useEffect, useState } from 'react';
import { List as ListFallback } from 'lucide-react';

import { getLucideIcon } from '@/lib/lucideIconRegistry';
import { cn } from '@/lib/utils';

interface LucideIconProps {
  /** PascalCase Lucide icon name (e.g. `"Heart"`). */
  name: string;
  /** Optional className passed through to the rendered icon. */
  className?: string;
  /** Optional aria-label; defaults to hidden from assistive tech. */
  ariaLabel?: string;
}

/**
 * Renders a Lucide icon resolved by name at runtime. The icon registry is
 * loaded via a single shared dynamic import (see `lucideIconRegistry.ts`),
 * so the whole icon set lives in a separate Vite chunk and only pays its
 * bundle cost once per session.
 *
 * **Fallback.** While the registry resolves, and for any name that fails
 * to resolve (event published with an icon we don't recognize), the
 * generic `List` icon is rendered — already statically imported by other
 * parts of the app, so the fallback never causes a layout shift waiting
 * for a network round-trip.
 */
export function LucideIcon({ name, className, ariaLabel }: LucideIconProps) {
  // `Component` starts at `null` so the first paint always uses the
  // fallback. Once the dynamic import resolves, the matching component
  // takes over. We deliberately don't suspend on the import — the
  // fallback is a perfectly serviceable icon and suspending would force
  // every list pill to wait for the same chunk before anything renders.
  const [Component, setComponent] = useState<React.ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    'aria-label'?: string;
  }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    getLucideIcon(name)
      .then((c) => {
        if (cancelled) return;
        setComponent(() => c);
      })
      .catch(() => {
        // Network error loading the chunk — keep fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const Icon = Component ?? ListFallback;
  return (
    <Icon
      className={cn(className)}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
    />
  );
}
