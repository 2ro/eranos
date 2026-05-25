import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface DebouncedSearchInputProps {
  /** Current input value. Parent owns the state so it can debounce into a query. */
  value: string;
  /** Called on every keystroke. */
  onChange: (next: string) => void;
  /** Placeholder text. */
  placeholder: string;
  /** `aria-label` for the input. Required because there's no visible label. */
  ariaLabel: string;
  /** `aria-label` for the clear button. */
  clearLabel: string;
  /** Extra classes on the wrapper. */
  className?: string;
}

/**
 * Search input used on the discovery pages (Campaigns, Communities, Pledges)
 * for on-page NIP-50 search. Renders a shadcn `Input` with a left-aligned
 * lucide `Search` icon and a right-aligned clear button that appears once
 * the user has typed something.
 *
 * This component owns no state — the caller is expected to pair it with
 * `useDebounce` and feed the debounced value into a query hook. Keeping
 * it stateless means the same component can be reused for URL-synced
 * searches, in-memory searches, or anywhere else.
 */
export function DebouncedSearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel,
  className,
}: DebouncedSearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        inputMode="search"
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-9 h-11 rounded-lg"
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
