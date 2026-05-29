import { useId, useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { MapPin, X } from 'lucide-react';

import { CountryFlag } from '@/components/CountryFlag';
import { Input } from '@/components/ui/input';
import { getCountryInfo, searchCountries, type CountryEntry } from '@/lib/countries';
import { cn } from '@/lib/utils';

export interface CountrySelectProps {
  /** Current free-text query in the input. */
  query: string;
  /** Currently-selected ISO 3166 code (e.g. "US"). Empty string when none. */
  selectedCode: string;
  onQueryChange: (value: string) => void;
  onSelect: (country: CountryEntry) => void;
  onClear: () => void;
  /**
   * Explicit DOM `id` for the input. Optional — a stable `useId()`
   * value is generated when not provided. Callers that already wire
   * their own form labels (e.g. a `<label htmlFor={…}>` outside the
   * picker) should pass a known id; the wizard flows leave it
   * auto-generated.
   */
  id?: string;
  /** Override the localized "Search countries" placeholder. */
  placeholder?: string;
  /**
   * Hide the i18n hint that explains the `i: iso3166:<code>` tag
   * we publish. Default `false` — the creation flows show it; the
   * event-detail dialog hides it because the surrounding card already
   * documents the behavior.
   */
  hideHint?: boolean;
}

/**
 * Combobox-style country picker used across Agora's creation flows
 * (campaigns, groups, calendar events, …). Shows a `MapPin` icon, a
 * clear button when a value is present, and a dropdown of
 * `searchCountries(query)` results with full keyboard support
 * (ArrowUp/Down/Enter/Escape).
 *
 * The selection produces a country code (`onSelect(country.code)`)
 * that the parent serializes as `['i', 'iso3166:<CC>']` + `['k',
 * 'iso3166']` on its event.
 *
 * All i18n strings live under the shared `forms.*` namespace so the
 * picker drops into any flow without per-page key duplication.
 */
export function CountrySelect({
  query,
  selectedCode,
  onQueryChange,
  onSelect,
  onClear,
  id,
  placeholder,
  hideHint = false,
}: CountrySelectProps) {
  const { t } = useTranslation();
  // `useId` gives us a stable, unique pair of ids for the
  // combobox/listbox association without forcing the caller to pass
  // a name — important when the wizard mounts the picker multiple
  // times across step navigations.
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-results`;
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedCountry = selectedCode ? getCountryInfo(selectedCode) : undefined;
  const results = useMemo(() => searchCountries(query), [query]);
  const showResults = open && results.length > 0;

  const selectCountry = (country: CountryEntry) => {
    onSelect(country);
    setOpen(false);
    setSelectedIndex(0);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showResults) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex((prev) => (prev + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              selectCountry(results[selectedIndex]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="h-9 rounded-full border-0 bg-secondary pl-10 pr-10 text-base md:text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder={placeholder ?? t('forms.countrySearchPlaceholder')}
          autoComplete="off"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
        />
        {(query || selectedCode) && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 rounded-full p-1 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground motion-safe:transition-colors"
            aria-label={t('forms.countryClearAria')}
          >
            <X className="size-4" />
          </button>
        )}

        {showResults && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-2 max-h-[200px] w-full overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg"
          >
            {results.map((country, index) => (
              <button
                key={country.code}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCountry(country)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/60',
                  index === selectedIndex && 'bg-secondary/60',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary leading-none">
                  <CountryFlag
                    code={country.code}
                    emoji={country.flag}
                    label={t('forms.flagOfAria', { name: country.name })}
                    className="text-lg"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{country.name}</span>
                  <span className="block text-xs text-muted-foreground">{country.code}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedCountry && !hideHint && (
        <p className="text-xs text-muted-foreground">
          <Trans
            i18nKey="forms.countryHint"
            values={{ code: selectedCode }}
            components={{ 0: <span className="font-mono text-foreground" /> }}
          />
        </p>
      )}
    </div>
  );
}
