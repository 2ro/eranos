import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Clock, Loader2, Megaphone, Plus, Upload } from 'lucide-react';

import { TimezoneSwitcher } from '@/components/TimezoneSwitcher';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { countryCodeToFlag, getAllCountries, getGeoDisplayName } from '@/lib/countries';
import { DEFAULT_ACTION_COVERS, DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { usdToSats } from '@/lib/bitcoin';
import { cn } from '@/lib/utils';

interface CreateActionDialogProps {
  countryCode?: string;
  communityATag?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreateActionFormState {
  title: string;
  description: string;
  tagInput: string;
  pledgeUsd: string;
  startDate: string;
  startTime: string;
  deadline: string;
  time: string;
  coverImage: string;
  selectedCountry: string;
  timezone: string;
}

function unixSecondsInTimezone(year: number, month: number, day: number, hours: number, minutes: number, timezone: string): number {
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
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

function parseCommunityAuthor(communityATag: string): string | undefined {
  const [, pubkey] = communityATag.split(':');
  return pubkey || undefined;
}

function normalizePledgeTag(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

function parsePledgeTagInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(',')) {
    const tag = normalizePledgeTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function CreateActionForm({
  formData,
  setFormData,
  isSubmitting,
  handleSubmit,
  onCancel,
  pageCountryCode,
}: {
  formData: CreateActionFormState;
  setFormData: (data: CreateActionFormState) => void;
  isSubmitting: boolean;
  handleSubmit: () => void;
  onCancel: () => void;
  pageCountryCode?: string;
}) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { data: btcPrice } = useBtcPrice();
  const allCountries = useMemo(() => getAllCountries(), []);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [selectedDefaultId, setSelectedDefaultId] = useState<string | null>(() => {
    const match = DEFAULT_ACTION_COVERS.find((c) => c.url === formData.coverImage);
    return match?.id ?? null;
  });

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
        options.push({ value: country.code, label: country.name, flag: countryCodeToFlag(country.code) });
      }
    });
    return options;
  }, [pageCountryCode, allCountries]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const [[, url]] = await uploadFile(file);
      setFormData({ ...formData, coverImage: url });
      setSelectedDefaultId(null);
    } catch (error) {
      console.error('Failed to upload cover image:', error);
    }
  };

  return (
    <>
      <div className="space-y-4 py-2 px-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <Label htmlFor="country">Country (optional)</Label>
          <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={countryPickerOpen} className="w-full justify-between">
                {formData.selectedCountry ? (
                  <span className="flex items-center gap-2">
                    <span>{countryCodeToFlag(formData.selectedCountry)}</span>
                    <span>{getGeoDisplayName(formData.selectedCountry)}</span>
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
                          setFormData({ ...formData, selectedCountry: option.value === 'none' ? '' : option.value });
                          setCountryPickerOpen(false);
                        }}
                        className="gap-2"
                      >
                        <span>{option.flag}</span>
                        <span className="flex-1">{option.label}</span>
                        <Check className={cn('h-4 w-4', (formData.selectedCountry || 'none') === option.value ? 'opacity-100' : 'opacity-0')} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Cover image</Label>
          <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
            <img src={formData.coverImage || DEFAULT_COVER_IMAGE} alt="Cover preview" className="w-full h-full object-cover" />
          </div>
          <div className="relative w-full overflow-hidden">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {DEFAULT_ACTION_COVERS.map((cover) => {
                const isActive = selectedDefaultId === cover.id || formData.coverImage === cover.url;
                return (
                  <button
                    key={cover.id}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, coverImage: cover.url });
                      setSelectedDefaultId(cover.id);
                    }}
                    className={cn('relative h-20 w-28 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all', isActive ? 'border-primary ring-2 ring-primary/50' : 'border-border hover:border-primary/50')}
                    title={cover.name}
                    aria-label={`Select ${cover.name} cover`}
                  >
                    <img src={cover.url} alt={cover.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="cover-upload" className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-primary/10 transition-colors">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="text-sm">Upload custom</span>
            </Label>
            <input id="cover-upload" type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" placeholder="What needs to happen?" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Explain the action, evidence, or outcome you want to inspire and what submissions should include..."
            className="min-h-[80px]"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pledge-tags">Tags</Label>
            <Input id="pledge-tags" placeholder="beach-cleanup, legal-defense" value={formData.tagInput} onChange={(e) => setFormData({ ...formData, tagInput: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pledgeUsd">Pledge</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="pledgeUsd"
                type="text"
                inputMode="decimal"
                placeholder="100"
                value={formData.pledgeUsd}
                onChange={(e) => setFormData({ ...formData, pledgeUsd: e.target.value })}
                className="pl-7 pr-14"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                USD
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Start date (optional)</Label>
          <Input id="startDate" type="date" className="w-full min-w-0" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} />
          {formData.startDate && <Input id="startTime" type="time" className="w-full min-w-0" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} />}
          <p className="text-xs text-muted-foreground">
            {!formData.startDate && 'Defaults to now if not specified'}
            {formData.startDate && !formData.startTime && ' • Starts at midnight'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deadline">Deadline (optional)</Label>
          <Input id="deadline" type="date" className="w-full min-w-0" value={formData.deadline} onChange={(e) => setFormData({ ...formData, deadline: e.target.value })} />
          {formData.deadline && <Input id="time" type="time" className="w-full min-w-0" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />}
          <p className="text-xs text-muted-foreground">
            {!formData.deadline && 'Open-ended. Add a deadline if urgency matters.'}
            {formData.deadline && !formData.time && ' • Ends at 23:59 local time'}
          </p>
        </div>

        {(formData.startDate || formData.deadline) && (
          <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border/50 animate-in slide-in-from-top-2 duration-200">
            <Label className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Timezone</Label>
            <TimezoneSwitcher value={formData.timezone} onChange={(timezone) => setFormData({ ...formData, timezone })} />
            <p className="text-xs text-muted-foreground">Start and deadline times will be interpreted in this timezone.</p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4 pt-2">
        <Button onClick={handleSubmit} disabled={!formData.title || !formData.description || !formData.pledgeUsd || usdToSats(Number(formData.pledgeUsd.replace(/[, $]/g, '')), btcPrice) <= 0 || isSubmitting} className="gap-2 w-full">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create pledge
        </Button>
        <Button variant="outline" onClick={onCancel} className="w-full">Cancel</Button>
      </div>
    </>
  );
}

export function CreateActionDialog({ countryCode, communityATag, open, onOpenChange }: CreateActionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { data: btcPrice } = useBtcPrice();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [formData, setFormData] = useState<CreateActionFormState>({
    title: '',
    description: '',
    tagInput: '',
    pledgeUsd: '',
    startDate: '',
    startTime: '',
    deadline: '',
    time: '',
    coverImage: DEFAULT_COVER_IMAGE,
    selectedCountry: countryCode || '',
    timezone: browserTimezone,
  });

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const now = Date.now();
      const slug = formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const dTag = `${slug || 'pledge'}-${now}`;
      const pledgeSats = usdToSats(Number(formData.pledgeUsd.replace(/[, $]/g, '')), btcPrice);
      if (pledgeSats <= 0) throw new Error('Waiting for BTC/USD price to calculate the pledge amount.');
      const pledgeTags = parsePledgeTagInput(formData.tagInput);
      const tags: string[][] = [
        ['d', dTag],
        ['title', formData.title],
        ['bounty', String(pledgeSats)],
        ['t', 'agora-action'],
        ['alt', `Agora pledge: ${formData.title}`],
      ];
      for (const tag of pledgeTags) tags.push(['t', tag]);
      if (formData.selectedCountry) tags.push(['i', createCountryIdentifier(formData.selectedCountry.toUpperCase())]);
      if (communityATag) {
        const communityAuthor = parseCommunityAuthor(communityATag);
        tags.push(['A', communityATag], ['K', '34550']);
        if (communityAuthor) tags.push(['P', communityAuthor]);
      }
      if (formData.coverImage) tags.push(['image', formData.coverImage]);

      if (formData.startDate) {
        const [year, month, day] = formData.startDate.split('-').map(Number);
        const [hours, minutes] = formData.startTime ? formData.startTime.split(':').map(Number) : [0, 0];
        tags.push(['start', String(unixSecondsInTimezone(year, month, day, hours, minutes, formData.timezone))]);
      }
      if (formData.deadline) {
        const [year, month, day] = formData.deadline.split('-').map(Number);
        const [hours, minutes] = formData.time ? formData.time.split(':').map(Number) : [23, 59];
        tags.push(['deadline', String(unixSecondsInTimezone(year, month, day, hours, minutes, formData.timezone))]);
      }

      await createEvent({ kind: 36639, content: formData.description, tags });

      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      await queryClient.refetchQueries({ queryKey: ['agora-actions'] });
      if (communityATag) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['community-actions', communityATag] }),
          queryClient.invalidateQueries({
            predicate: (q) => {
              const [root, aTagsKey] = q.queryKey;
              return root === 'community-activity-feed'
                && typeof aTagsKey === 'string'
                && aTagsKey.split(',').includes(communityATag);
            },
          }),
        ]);
      }

      setFormData({
        title: '', description: '', tagInput: '', pledgeUsd: '',
        startDate: '', startTime: '', deadline: '', time: '',
        coverImage: DEFAULT_COVER_IMAGE,
        selectedCountry: countryCode || '',
        timezone: browserTimezone,
      });
      onOpenChange(false);
      toast({ title: 'Pledge created' });
    } catch (error) {
      console.error('Failed to create pledge:', error);
      toast({ title: 'Failed to create pledge', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  const description = communityATag
    ? 'New community pledge. You can optionally choose a country below.'
    : countryCode
    ? `New pledge for ${getGeoDisplayName(countryCode)}.`
    : 'New pledge. You can optionally choose a country below.';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85dvh] max-h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Create pledge</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1 pb-safe">
            <CreateActionForm formData={formData} setFormData={setFormData} isSubmitting={isSubmitting} handleSubmit={handleSubmit} onCancel={() => onOpenChange(false)} pageCountryCode={countryCode} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg md:max-w-2xl max-h-[85vh] w-[calc(100vw-2rem)] sm:w-full overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Create pledge</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          <CreateActionForm formData={formData} setFormData={setFormData} isSubmitting={isSubmitting} handleSubmit={handleSubmit} onCancel={() => onOpenChange(false)} pageCountryCode={countryCode} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
