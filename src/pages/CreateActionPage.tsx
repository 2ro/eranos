import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Megaphone,
  Palette,
  Plus,
  Upload,
} from 'lucide-react';

import { TimezoneSwitcher } from '@/components/TimezoneSwitcher';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import type { Action } from '@/hooks/useActions';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { countryCodeToFlag, getAllCountries, getGeoDisplayName } from '@/lib/countries';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { DEFAULT_ACTION_COVERS, DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { cn } from '@/lib/utils';

/**
 * Convert a wall-clock (Y, M, D, h, m) in an arbitrary IANA timezone to a
 * unix-seconds timestamp. Matches the helper in CreateActionDialog so the
 * page emits identical `start` / `deadline` tags.
 */
function unixSecondsInTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string,
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]),
  );
  const asWallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.floor((utcGuess + (utcGuess - asWallClock)) / 1000);
}

export function CreateActionPage() {
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  // ?country=XX lets entry points (the Actions hero CTA, the FAB, and the
  // empty-state button) pre-select whichever country the actions index is
  // currently filtered to — same behavior as the old modal's `countryCode`
  // prop.
  const pageCountryCode = searchParams.get('country') || '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Action['type']>('photo');
  const [bounty, setBounty] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [coverImage, setCoverImage] = useState<string>(DEFAULT_COVER_IMAGE);
  const [selectedCountry, setSelectedCountry] = useState(pageCountryCode);
  const [timezone, setTimezone] = useState(browserTimezone);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [selectedDefaultId, setSelectedDefaultId] = useState<string | null>(
    () => DEFAULT_ACTION_COVERS.find((c) => c.url === DEFAULT_COVER_IMAGE)?.id ?? null,
  );
  const [formError, setFormError] = useState('');

  useSeoMeta({
    title: 'Create action | Agora',
    description: 'Create an activist action and offer a Bitcoin bounty on Agora.',
  });

  const allCountries = useMemo(() => getAllCountries(), []);

  const countryOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; flag: string }> = [
      { value: 'none', label: 'No country', flag: '🌍' },
    ];
    if (pageCountryCode) {
      options.push({
        value: pageCountryCode,
        label: getGeoDisplayName(pageCountryCode),
        flag: countryCodeToFlag(pageCountryCode),
      });
    }
    allCountries.forEach((country) => {
      if (country.code !== pageCountryCode) {
        options.push({
          value: country.code,
          label: country.name,
          flag: countryCodeToFlag(country.code),
        });
      }
    });
    return options;
  }, [pageCountryCode, allCountries]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const [[, url]] = await uploadFile(file);
      setCoverImage(url);
      setSelectedDefaultId(null);
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in to create an action.');

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();

      if (!trimmedTitle) throw new Error('Title is required.');
      if (!trimmedDescription) throw new Error('Description is required.');
      if (!bounty.trim()) throw new Error('Bounty is required.');

      const bountyNum = Number(bounty);
      if (!Number.isFinite(bountyNum) || bountyNum <= 0) {
        throw new Error('Bounty must be a positive number of sats.');
      }

      const now = Date.now();
      const slug = trimmedTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const dTag = `${slug || 'action'}-${now}`;

      const tags: string[][] = [
        ['d', dTag],
        ['title', trimmedTitle],
        ['challenge-type', type],
        ['bounty', String(bountyNum)],
        ['t', 'agora-action'],
        ['alt', `Agora activist action: ${trimmedTitle}`],
      ];

      if (selectedCountry) {
        tags.push(['i', createCountryIdentifier(selectedCountry.toUpperCase())]);
      }

      if (coverImage) {
        tags.push(['image', coverImage]);
      }

      if (startDate) {
        const [year, month, day] = startDate.split('-').map(Number);
        const [hours, minutes] = startTime
          ? startTime.split(':').map(Number)
          : [0, 0];
        tags.push([
          'start',
          String(unixSecondsInTimezone(year, month, day, hours, minutes, timezone)),
        ]);
      }

      if (deadline) {
        const [year, month, day] = deadline.split('-').map(Number);
        const [hours, minutes] = deadlineTime
          ? deadlineTime.split(':').map(Number)
          : [23, 59];
        tags.push([
          'deadline',
          String(unixSecondsInTimezone(year, month, day, hours, minutes, timezone)),
        ]);
      }

      await createEvent({ kind: 36639, content: trimmedDescription, tags });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      await queryClient.refetchQueries({ queryKey: ['agora-actions'] });
      toast({ title: 'Action created' });
      navigate('/actions');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      setFormError(msg);
      toast({
        title: 'Could not create action',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  if (!user) {
    return (
      <main className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <Card>
            <CardContent className="py-12 px-8 text-center space-y-4">
              <Megaphone className="size-10 text-muted-foreground/60 mx-auto" />
              <h2 className="text-xl font-semibold">Log in to create an action</h2>
              <p className="text-muted-foreground">
                Actions are signed Nostr events. You need a Nostr login to publish one.
              </p>
              <Button asChild>
                <Link to="/actions">Back to actions</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    bounty.trim().length > 0 &&
    !submitMutation.isPending;

  return (
    <main className="min-h-screen pb-16">
      <form
        className="max-w-3xl mx-auto px-4 sm:px-6 py-8 lg:py-10 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError('');
          submitMutation.mutate();
        }}
      >
        <div>
          <div className="flex items-center gap-2 -ml-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-secondary motion-safe:transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Create action
            </h1>
          </div>
        </div>

        <div className="rounded-2xl bg-card/50 p-2">
          {/* Country */}
          <FormSection title="Country" requirement="Optional">
            <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={countryPickerOpen}
                  className="w-full justify-between"
                >
                  {selectedCountry ? (
                    <span className="flex items-center gap-2">
                      <span>{countryCodeToFlag(selectedCountry)}</span>
                      <span>{getGeoDisplayName(selectedCountry)}</span>
                    </span>
                  ) : (
                    <span>No country</span>
                  )}
                  <ChevronRight className="ml-2 h-4 w-4 shrink-0 opacity-50 rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start" sideOffset={4}>
                <Command>
                  <CommandInput placeholder="Search..." />
                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup>
                      {countryOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={`${option.label} ${option.value}`}
                          onSelect={() => {
                            setSelectedCountry(option.value === 'none' ? '' : option.value);
                            setCountryPickerOpen(false);
                          }}
                          className="gap-2"
                        >
                          <span>{option.flag}</span>
                          <span className="flex-1">{option.label}</span>
                          <Check
                            className={cn(
                              'h-4 w-4',
                              (selectedCountry || 'none') === option.value
                                ? 'opacity-100'
                                : 'opacity-0',
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </FormSection>

          {/* Cover image */}
          <FormSection title="Cover image" requirement="Optional">
            <div className="relative w-full h-40 sm:h-48 rounded-xl overflow-hidden border border-border">
              <img
                src={coverImage || DEFAULT_COVER_IMAGE}
                alt="Cover preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="relative w-full overflow-hidden">
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {DEFAULT_ACTION_COVERS.map((cover) => {
                  const isActive =
                    selectedDefaultId === cover.id || coverImage === cover.url;
                  return (
                    <button
                      key={cover.id}
                      type="button"
                      onClick={() => {
                        setCoverImage(cover.url);
                        setSelectedDefaultId(cover.id);
                      }}
                      className={cn(
                        'relative h-20 w-28 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all',
                        isActive
                          ? 'border-primary ring-2 ring-primary/50'
                          : 'border-border hover:border-primary/50',
                      )}
                      title={cover.name}
                      aria-label={`Select ${cover.name} cover`}
                    >
                      <img
                        src={cover.url}
                        alt={cover.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="cover-upload"
                className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-primary/10 transition-colors"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span className="text-sm">Upload custom</span>
              </label>
              <input
                id="cover-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </div>
          </FormSection>

          {/* Title */}
          <FormSection title="Title" requirement="Required">
            <Input
              placeholder="What needs to happen?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </FormSection>

          {/* Description */}
          <FormSection title="Description" requirement="Required">
            <Textarea
              placeholder="Explain what submissions should look like, why this matters, and how the bounty will be paid out..."
              className="min-h-[120px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormSection>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Type */}
            <FormSection title="Type" requirement="Required">
              <Select
                value={type}
                onValueChange={(value) => setType(value as Action['type'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="photo">
                    <div className="flex items-center gap-2">
                      <Camera className="h-4 w-4" /> Photo
                    </div>
                  </SelectItem>
                  <SelectItem value="art">
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4" /> Art
                    </div>
                  </SelectItem>
                  <SelectItem value="info">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4" /> Info
                    </div>
                  </SelectItem>
                  <SelectItem value="action">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4" /> Action
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormSection>

            {/* Bounty */}
            <FormSection title="Bounty (sats)" requirement="Required">
              <Input
                type="number"
                placeholder="10000"
                value={bounty}
                onChange={(e) => setBounty(e.target.value)}
                min={1}
              />
            </FormSection>
          </div>

          {/* Start date */}
          <FormSection title="Start date" requirement="Optional">
            <Input
              type="date"
              className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {startDate && (
              <Input
                type="time"
                className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {!startDate && 'Defaults to now if not specified'}
              {startDate && !startTime && 'Starts at midnight'}
            </p>
          </FormSection>

          {/* Deadline */}
          <FormSection title="Deadline" requirement="Optional">
            <Input
              type="date"
              className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            {deadline && (
              <Input
                type="time"
                className="w-full min-w-0 [color-scheme:light] dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {!deadline && 'Defaults to 48 hours after start'}
              {deadline && !deadlineTime && 'Ends at 23:59 local time'}
            </p>
          </FormSection>

          {(startDate || deadline) && (
            <FormSection title="Timezone" requirement="Required">
              <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-2 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" /> Timezone
                </div>
                <TimezoneSwitcher value={timezone} onChange={setTimezone} />
                <p className="text-xs text-muted-foreground">
                  Start and deadline times will be interpreted in this timezone.
                </p>
              </div>
            </FormSection>
          )}
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="pt-1">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Publishing…
              </>
            ) : (
              <>
                <Plus className="size-4 mr-2" />
                Create action
              </>
            )}
          </Button>
        </div>
      </form>
    </main>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

function FormSection({
  title,
  requirement,
  children,
}: {
  title: string;
  requirement: 'Required' | 'Recommended' | 'Optional';
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-xl p-3 sm:p-4">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {title}
          <span className="text-xs font-medium text-muted-foreground">
            {requirement}
          </span>
        </h2>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export default CreateActionPage;
