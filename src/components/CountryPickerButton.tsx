import { useMemo, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CountryFlag } from '@/components/CountryFlag';
import { countryCodeToFlag, getAllCountries } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface CountryPickerButtonProps {
  /**
   * Selected ISO 3166-1 alpha-2 country code (e.g. `"US"`), or `undefined`
   * for the global / no-filter state. The button renders a flag emoji
   * when a country is selected, otherwise a brand-orange Globe icon —
   * matching the affordance the pledges page introduced.
   */
  value: string | undefined;
  /** Called when the user picks a country, or `undefined` for Global. */
  onChange: (next: string | undefined) => void;
  /** Extra classes on the trigger button. */
  className?: string;
}

/**
 * Globe-icon country filter button shared by the discovery pages
 * (Campaigns, Communities, Pledges). Opens a searchable country list in
 * a popover; the first item is "Global" which clears the filter.
 *
 * The trigger collapses to the picked country's flag emoji when a
 * country is selected, so the active state reads without opening the
 * popover. Brand-orange `Globe` icon in the neutral state matches the
 * other filter icons in the cluster.
 *
 * Callers own the selected country (state lives on the page so it can
 * be threaded into NIP-50 queries or URL params).
 */
export function CountryPickerButton({ value, onChange, className }: CountryPickerButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const allCountries = useMemo(() => getAllCountries(), []);
  const countryOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; flag: string }> = [
      { value: 'global', label: t('common.countryGlobal'), flag: '🌍' },
    ];
    for (const country of allCountries) {
      options.push({
        value: country.code,
        label: country.name,
        flag: countryCodeToFlag(country.code),
      });
    }
    return options;
  }, [allCountries, t]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-auto p-2 hover:bg-muted/50 rounded-lg', className)}
          aria-label={t('common.countryFilterAriaLabel')}
        >
          {value ? (
            <CountryFlag
              code={value}
              emoji={countryCodeToFlag(value)}
              label={t('common.countryFilterAriaLabel')}
              className="text-2xl"
            />
          ) : (
            <Globe className="h-5 w-5 text-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="end">
        <Command>
          <CommandInput placeholder={t('common.countrySearchPlaceholder')} />
          <CommandList>
            <CommandEmpty>{t('common.countryNoResults')}</CommandEmpty>
            <CommandGroup>
              {countryOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value === 'global' ? undefined : option.value);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  {option.value === 'global' ? (
                    <span className="text-base leading-none">{option.flag}</span>
                  ) : (
                    <CountryFlag
                      code={option.value}
                      emoji={option.flag}
                      label={`Flag of ${option.label}`}
                      className="text-base"
                    />
                  )}
                  <span className="flex-1">{option.label}</span>
                  <Check
                    className={cn(
                      'h-4 w-4',
                      (value || 'global') === option.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
