import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAllLucideIcons } from '@/lib/lucideIconRegistry';
import { cn } from '@/lib/utils';

interface IconPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently-selected icon name, used to highlight the active cell. */
  value?: string;
  /** Called with the chosen icon's PascalCase name when the user picks one. */
  onSelect: (name: string) => void;
}

type IconEntry = {
  name: string;
  Component: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
};

/**
 * Searchable picker over every named Lucide icon.
 *
 * The icon set is loaded on demand via {@link getAllLucideIcons}, which
 * dynamically imports `lucide-react` once per session and emits the whole
 * library as a separate Vite chunk. Until the chunk resolves the dialog
 * shows a spinner; subsequent opens read from the cached promise and are
 * effectively instant.
 *
 * **Search semantics.** Case-insensitive substring match against the
 * icon's PascalCase name with the camel-case word boundaries flattened
 * into spaces — so `arrow up` matches `ArrowUp`. Empty query shows the
 * full registry.
 *
 * **Rendering.** A windowed grid via plain CSS — we render the filtered
 * results up to a soft cap (`MAX_VISIBLE`) so the DOM stays manageable
 * for unfiltered queries. With ~1500 icons total this caps the picker
 * at a few hundred initial cells; typing narrows the set quickly.
 */
const MAX_VISIBLE = 600;

export function IconPicker({ open, onOpenChange, value, onSelect }: IconPickerProps) {
  const { t } = useTranslation();
  const [icons, setIcons] = useState<IconEntry[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    if (icons) return;
    let cancelled = false;
    getAllLucideIcons()
      .then((all) => {
        if (cancelled) return;
        setIcons(all);
      })
      .catch(() => {
        if (cancelled) return;
        setIcons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, icons]);

  const filtered = useMemo<IconEntry[]>(() => {
    if (!icons) return [];
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return icons.slice(0, MAX_VISIBLE);
    const out: IconEntry[] = [];
    for (const entry of icons) {
      // Flatten name to lowercase for substring match.
      if (entry.name.toLowerCase().includes(q)) {
        out.push(entry);
        if (out.length >= MAX_VISIBLE) break;
      }
    }
    return out;
  }, [icons, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[80dvh] rounded-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle>{t('campaigns.lists.iconPicker.title')}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t('campaigns.lists.iconPicker.description')}
        </DialogDescription>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('campaigns.lists.iconPicker.search')}
            aria-label={t('campaigns.lists.iconPicker.search')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {icons === null ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t('campaigns.lists.iconPicker.empty')}
            </div>
          ) : (
            <div
              className="grid gap-1.5 py-2"
              style={{
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              }}
            >
              {filtered.map(({ name, Component }) => {
                const isSelected = name === value;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      onSelect(name);
                      onOpenChange(false);
                    }}
                    title={name}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 motion-safe:transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent hover:border-border hover:bg-accent text-foreground',
                    )}
                  >
                    <Component className="size-5" aria-hidden />
                    <span className="text-[10px] leading-tight text-muted-foreground truncate max-w-full">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
