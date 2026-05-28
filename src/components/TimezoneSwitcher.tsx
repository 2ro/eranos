import { useState } from 'react';
import { Clock, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Curated list of timezones grouped by region. Offsets are standard-time
 * (without DST); the OS applies DST when interpreting the IANA zone.
 */
const TIMEZONES = [
  // Americas
  { value: 'America/New_York', label: 'Eastern Time (US)', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Chicago', label: 'Central Time (US)', region: 'Americas', offset: 'UTC-6' },
  { value: 'America/Denver', label: 'Mountain Time (US)', region: 'Americas', offset: 'UTC-7' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)', region: 'Americas', offset: 'UTC-8' },
  { value: 'America/Anchorage', label: 'Alaska Time', region: 'Americas', offset: 'UTC-9' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', region: 'Americas', offset: 'UTC-10' },
  { value: 'America/Toronto', label: 'Toronto', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Vancouver', label: 'Vancouver', region: 'Americas', offset: 'UTC-8' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas', offset: 'UTC-6' },
  { value: 'America/Sao_Paulo', label: 'São Paulo', region: 'Americas', offset: 'UTC-3' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires', region: 'Americas', offset: 'UTC-3' },
  { value: 'America/Lima', label: 'Lima', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Bogota', label: 'Bogotá', region: 'Americas', offset: 'UTC-5' },
  { value: 'America/Caracas', label: 'Caracas', region: 'Americas', offset: 'UTC-4' },
  { value: 'America/Santiago', label: 'Santiago', region: 'Americas', offset: 'UTC-3' },

  // Europe
  { value: 'Europe/London', label: 'London (GMT)', region: 'Europe', offset: 'UTC+0' },
  { value: 'Europe/Paris', label: 'Paris (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Rome', label: 'Rome (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Brussels', label: 'Brussels (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Vienna', label: 'Vienna (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Warsaw', label: 'Warsaw (CET)', region: 'Europe', offset: 'UTC+1' },
  { value: 'Europe/Athens', label: 'Athens (EET)', region: 'Europe', offset: 'UTC+2' },
  { value: 'Europe/Helsinki', label: 'Helsinki (EET)', region: 'Europe', offset: 'UTC+2' },
  { value: 'Europe/Istanbul', label: 'Istanbul (TRT)', region: 'Europe', offset: 'UTC+3' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)', region: 'Europe', offset: 'UTC+3' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET)', region: 'Europe', offset: 'UTC+0' },
  { value: 'Europe/Dublin', label: 'Dublin (GMT)', region: 'Europe', offset: 'UTC+0' },

  // Asia
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia', offset: 'UTC+4' },
  { value: 'Asia/Kolkata', label: 'India (IST)', region: 'Asia', offset: 'UTC+5:30' },
  { value: 'Asia/Bangkok', label: 'Bangkok', region: 'Asia', offset: 'UTC+7' },
  { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Shanghai', label: 'Shanghai', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia', offset: 'UTC+9' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia', offset: 'UTC+9' },
  { value: 'Asia/Jakarta', label: 'Jakarta', region: 'Asia', offset: 'UTC+7' },
  { value: 'Asia/Manila', label: 'Manila', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Taipei', label: 'Taipei', region: 'Asia', offset: 'UTC+8' },
  { value: 'Asia/Karachi', label: 'Karachi', region: 'Asia', offset: 'UTC+5' },
  { value: 'Asia/Tehran', label: 'Tehran', region: 'Asia', offset: 'UTC+3:30' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem', region: 'Asia', offset: 'UTC+2' },
  { value: 'Asia/Baghdad', label: 'Baghdad', region: 'Asia', offset: 'UTC+3' },

  // Oceania
  { value: 'Australia/Sydney', label: 'Sydney', region: 'Oceania', offset: 'UTC+10' },
  { value: 'Australia/Melbourne', label: 'Melbourne', region: 'Oceania', offset: 'UTC+10' },
  { value: 'Australia/Brisbane', label: 'Brisbane', region: 'Oceania', offset: 'UTC+10' },
  { value: 'Australia/Perth', label: 'Perth', region: 'Oceania', offset: 'UTC+8' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'Oceania', offset: 'UTC+12' },

  // Africa
  { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa', offset: 'UTC+2' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Africa', offset: 'UTC+2' },
  { value: 'Africa/Lagos', label: 'Lagos', region: 'Africa', offset: 'UTC+1' },
  { value: 'Africa/Nairobi', label: 'Nairobi', region: 'Africa', offset: 'UTC+3' },
  { value: 'Africa/Casablanca', label: 'Casablanca', region: 'Africa', offset: 'UTC+1' },
  { value: 'Africa/Algiers', label: 'Algiers', region: 'Africa', offset: 'UTC+1' },
] as const;

const GROUPED_TIMEZONES = TIMEZONES.reduce<Record<string, typeof TIMEZONES[number][]>>(
  (acc, tz) => {
    if (!acc[tz.region]) acc[tz.region] = [];
    acc[tz.region].push(tz);
    return acc;
  },
  {},
);

interface TimezoneSwitcherProps {
  /** Selected IANA timezone (e.g. "America/New_York"). */
  value: string;
  /** Called with the new IANA timezone when the user picks one. */
  onChange: (timezone: string) => void;
  className?: string;
}

/**
 * Controlled timezone picker. Accepts an IANA timezone string and emits the
 * selected zone via `onChange`. Used by the action creation form so the
 * author can declare which zone their start/deadline times are expressed in.
 */
export function TimezoneSwitcher({ value, onChange, className }: TimezoneSwitcherProps) {
  const [open, setOpen] = useState(false);

  const currentData = TIMEZONES.find((tz) => tz.value === value);
  const currentLabel = currentData?.label ?? value.replace(/_/g, ' ');
  const currentOffset = currentData?.offset ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select timezone"
          className={cn('w-full justify-between', className)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="text-sm truncate">
              {currentLabel}
              {currentOffset && (
                <span className="text-muted-foreground ml-2 font-normal">{currentOffset}</span>
              )}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start" sideOffset={4}>
        <Command>
          <CommandInput placeholder="Search timezones..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            {Object.entries(GROUPED_TIMEZONES).map(([region, zones]) => (
              <CommandGroup key={region} heading={region}>
                {zones.map((tz) => (
                  <CommandItem
                    key={tz.value}
                    value={`${tz.label} ${tz.value} ${tz.region} ${tz.offset}`}
                    onSelect={() => {
                      onChange(tz.value);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span className="flex-1">
                      {tz.label}
                      <span className="text-muted-foreground ml-2 font-normal">{tz.offset}</span>
                    </span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        value === tz.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
