import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link as RouterLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { useActions, type Action } from '@/hooks/useActions';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from '@/hooks/useToast';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { getAllCountries, getGeoDisplayName, countryCodeToFlag } from '@/lib/countries';
import { getDisplayName } from '@/lib/genUserName';
import { DEFAULT_ACTION_COVERS, DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';

import { PageHeader } from '@/components/PageHeader';
import { TimezoneSwitcher } from '@/components/TimezoneSwitcher';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  Camera, Palette, Info, Zap, Clock, Bitcoin, Plus, ChevronRight, Loader2,
  Link as LinkIcon, Check, MoreHorizontal, Trash2, Upload, ListFilter,
  Calendar, DollarSign, Globe, Megaphone,
} from 'lucide-react';

const ACTION_ICONS = {
  photo: Camera,
  art: Palette,
  info: Info,
  action: Zap,
} as const;

function formatSats(sats: number): string {
  return sats.toLocaleString();
}

/**
 * Convert a calendar date+time (interpreted in the given IANA timezone) to a
 * Unix timestamp in seconds.
 *
 * The trick: we ask `Intl.DateTimeFormat` to format a candidate UTC instant in
 * the target zone, see how far off the wall-clock fields are, and shift by
 * that delta. One iteration suffices because the zone offset is locally
 * constant (DST transitions don't move by more than an hour, well below the
 * day-granularity inputs we receive).
 */
function unixSecondsInTimezone(
  year: number, month: number, day: number,
  hours: number, minutes: number,
  timezone: string,
): number {
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
  const offsetMs = utcGuess - asWallClock;
  return Math.floor((utcGuess + offsetMs) / 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons / Cards
// ─────────────────────────────────────────────────────────────────────────────

function ActionSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-40 w-full rounded-none" />
      <CardContent className="space-y-3 pt-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionShareMenu({ action }: { action: Action }) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = user?.pubkey === action.pubkey;

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  const actionUrl = `${window.location.origin}/${naddr}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(actionUrl);
      setCopied(true);
      toast({ title: 'Link copied' });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !isOwner) return;

    const confirmed = window.confirm('Delete this action? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      // NIP-09 deletion. Include both 'e' and 'a' tags — some relays don't
      // honour a-tag-only deletions for addressable events.
      await createEvent({
        kind: 5,
        content: 'Deleted action',
        tags: [
          ['e', action.event.id],
          ['a', `36639:${action.pubkey}:${action.id}`],
        ],
      });
      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      await queryClient.invalidateQueries({ queryKey: ['agora-action'] });
      toast({ title: 'Action deleted' });
    } catch (error) {
      console.error('Failed to delete action:', error);
      toast({ title: 'Failed to delete action', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isOwner && (
          <>
            <DropdownMenuItem onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete action
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleCopyLink}>
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-primary" />
          ) : (
            <LinkIcon className="h-4 w-4 mr-2" />
          )}
          Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionCard({ action, isExpired }: { action: Action; isExpired?: boolean }) {
  const author = useAuthor(action.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, action.pubkey);
  const Icon = ACTION_ICONS[action.type];
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });

  // Always show a cover — fall back to the default if the author didn't set
  // one, or the URL failed to validate / load.
  const coverImage = (action.image && !imageLoadFailed)
    ? action.image
    : DEFAULT_COVER_IMAGE;

  return (
    <RouterLink to={`/${naddr}`} className="block group">
      <Card
        className={cn(
          'overflow-hidden transition-colors',
          'hover:bg-muted/30',
          isExpired && 'opacity-70',
        )}
      >
        {/* Cover image — full bleed, modest height */}
        <div className="relative w-full h-40 overflow-hidden bg-muted">
          <img
            src={coverImage}
            alt={action.title}
            className={cn(
              'w-full h-full object-cover transition-transform duration-300',
              !isExpired && 'group-hover:scale-[1.02]',
              isExpired && 'grayscale',
            )}
            onError={() => setImageLoadFailed(true)}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {/* Country flag — top-left, sitting on the image */}
          {action.countryCode && (
            <span
              className="absolute top-3 left-3 text-2xl drop-shadow-md"
              title={getGeoDisplayName(action.countryCode)}
            >
              {countryCodeToFlag(action.countryCode)}
            </span>
          )}

          {/* Deadline / expired pill — top-right */}
          {isExpired ? (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-background/90 text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Expired
            </div>
          ) : action.deadline ? (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-background/90 text-xs font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(action.deadline * 1000, 'MMM d')}
            </div>
          ) : null}
        </div>

        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-start gap-2">
            <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className={cn(
                'text-lg font-bold leading-tight line-clamp-2',
                !isExpired && 'group-hover:text-primary transition-colors',
              )}>
                {action.title}
              </h3>
            </div>
            <div onClick={(e) => e.preventDefault()}>
              <ActionShareMenu action={action} />
            </div>
          </div>

          <p className={cn(
            'text-sm line-clamp-3 leading-relaxed',
            isExpired ? 'text-muted-foreground' : 'text-muted-foreground',
          )}>
            {action.description}
          </p>

          {/* Meta row: bounty · author. No nested box. */}
          <div className="flex items-center gap-2 text-sm pt-1 min-w-0">
            <Bitcoin className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold">{formatSats(action.bounty)}</span>
            <span className="text-muted-foreground text-xs">sats</span>
            <span className="text-muted-foreground/50">·</span>
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={metadata?.picture} />
              <AvatarFallback className="text-[9px] bg-muted">
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground text-xs truncate">{displayName}</span>
          </div>
        </CardContent>
      </Card>
    </RouterLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Action dialog
// ─────────────────────────────────────────────────────────────────────────────

interface CreateFormState {
  title: string;
  description: string;
  type: Action['type'];
  bounty: string;
  startDate: string;
  startTime: string;
  deadline: string;
  time: string;
  coverImage: string;
  selectedCountry: string;
  /** IANA timezone used to interpret start/deadline date+time fields. */
  timezone: string;
}

function CreateActionForm({
  formData, setFormData, isSubmitting, handleSubmit, onCancel,
  pageCountryCode,
}: {
  formData: CreateFormState;
  setFormData: (data: CreateFormState) => void;
  isSubmitting: boolean;
  handleSubmit: () => void;
  onCancel: () => void;
  pageCountryCode?: string;
}) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
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
      setFormData({ ...formData, coverImage: url });
      setSelectedDefaultId(null);
    } catch (error) {
      console.error('Failed to upload cover image:', error);
    }
  };

  const handleDefaultCoverSelect = (coverId: string, coverUrl: string) => {
    setFormData({ ...formData, coverImage: coverUrl });
    setSelectedDefaultId(coverId);
  };

  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [selectedDefaultId, setSelectedDefaultId] = useState<string | null>(() => {
    const match = DEFAULT_ACTION_COVERS.find((c) => c.url === formData.coverImage);
    return match?.id ?? null;
  });

  return (
    <>
      <div className="space-y-4 py-2 px-4 max-w-full overflow-hidden">
        {countryOptions.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="country">Country (optional)</Label>
            <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={countryPickerOpen}
                  className="w-full justify-between"
                >
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
                          <Check
                            className={cn(
                              'h-4 w-4',
                              (formData.selectedCountry || 'none') === option.value ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="space-y-2">
          <Label>Cover image</Label>

          {/* Live preview */}
          <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
            <img
              src={formData.coverImage || DEFAULT_COVER_IMAGE}
              alt="Cover preview"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Default cover gallery — horizontal scroll */}
          <div className="relative w-full overflow-hidden">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {DEFAULT_ACTION_COVERS.map((cover) => {
                const isActive = selectedDefaultId === cover.id || formData.coverImage === cover.url;
                return (
                  <button
                    key={cover.id}
                    type="button"
                    onClick={() => handleDefaultCoverSelect(cover.id, cover.url)}
                    className={cn(
                      'relative h-20 w-28 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all',
                      isActive
                        ? 'border-primary ring-2 ring-primary/50'
                        : 'border-border hover:border-primary/50',
                    )}
                    title={cover.name}
                    aria-label={`Select ${cover.name} cover`}
                  >
                    <img src={cover.url} alt={cover.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom upload */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="cover-upload"
              className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-primary/10 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="text-sm">Upload custom</span>
            </Label>
            <input
              id="cover-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            placeholder="What needs to happen?"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Explain what submissions should look like, why this matters, and how the bounty will be paid out…"
            className="min-h-[80px]"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                setFormData({ ...formData, type: value as Action['type'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="photo">
                  <div className="flex items-center gap-2"><Camera className="h-4 w-4" /> Photo</div>
                </SelectItem>
                <SelectItem value="art">
                  <div className="flex items-center gap-2"><Palette className="h-4 w-4" /> Art</div>
                </SelectItem>
                <SelectItem value="info">
                  <div className="flex items-center gap-2"><Info className="h-4 w-4" /> Info</div>
                </SelectItem>
                <SelectItem value="action">
                  <div className="flex items-center gap-2"><Zap className="h-4 w-4" /> Action</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bounty">Bounty (sats)</Label>
            <Input
              id="bounty"
              type="number"
              placeholder="10000"
              value={formData.bounty}
              onChange={(e) => setFormData({ ...formData, bounty: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Start date (optional)</Label>
          <Input
            id="startDate"
            type="date"
            className="w-full min-w-0"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
          />
          {formData.startDate && (
            <Input
              id="startTime"
              type="time"
              className="w-full min-w-0"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {!formData.startDate && 'Defaults to now if not specified'}
            {formData.startDate && !formData.startTime && ' • Starts at midnight'}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deadline">Deadline (optional)</Label>
          <Input
            id="deadline"
            type="date"
            className="w-full min-w-0"
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
          />
          {formData.deadline && (
            <Input
              id="time"
              type="time"
              className="w-full min-w-0"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {!formData.deadline && 'Defaults to 48 hours after start'}
            {formData.deadline && !formData.time && ' • Ends at 23:59 local time'}
          </p>
        </div>

        {/* Timezone — auto-revealed once any date field is set, since the start /
            deadline times are interpreted in this zone. */}
        {(formData.startDate || formData.deadline) && (
          <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border/50 animate-in slide-in-from-top-2 duration-200">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timezone
            </Label>
            <TimezoneSwitcher
              value={formData.timezone}
              onChange={(timezone) => setFormData({ ...formData, timezone })}
            />
            <p className="text-xs text-muted-foreground">
              Start and deadline times will be interpreted in this timezone.
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4 pt-2">
        <Button
          onClick={handleSubmit}
          disabled={!formData.title || !formData.description || !formData.bounty || isSubmitting}
          className="gap-2 w-full"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create action
        </Button>
        <Button variant="outline" onClick={onCancel} className="w-full">Cancel</Button>
      </div>
    </>
  );
}

function CreateActionDialog({
  countryCode, open, onOpenChange,
}: {
  countryCode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [formData, setFormData] = useState<CreateFormState>({
    title: '',
    description: '',
    type: 'photo',
    bounty: '',
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
      const dTag = `${slug || 'action'}-${now}`;

      const tags: string[][] = [
        ['d', dTag],
        ['title', formData.title],
        ['challenge-type', formData.type],
        ['bounty', formData.bounty],
        ['t', 'agora-action'],
        ['alt', `Agora activist action: ${formData.title}`],
      ];
      if (formData.selectedCountry) {
        tags.push(['i', createCountryIdentifier(formData.selectedCountry.toUpperCase())]);
      }
      if (formData.coverImage) tags.push(['image', formData.coverImage]);

      if (formData.startDate) {
        const [year, month, day] = formData.startDate.split('-').map(Number);
        const [hours, minutes] = formData.startTime
          ? formData.startTime.split(':').map(Number)
          : [0, 0];
        const startSeconds = unixSecondsInTimezone(year, month, day, hours, minutes, formData.timezone);
        tags.push(['start', String(startSeconds)]);
      }
      if (formData.deadline) {
        const [year, month, day] = formData.deadline.split('-').map(Number);
        const [hours, minutes] = formData.time
          ? formData.time.split(':').map(Number)
          : [23, 59];
        const deadlineSeconds = unixSecondsInTimezone(year, month, day, hours, minutes, formData.timezone);
        tags.push(['deadline', String(deadlineSeconds)]);
      }

      await createEvent({
        kind: 36639,
        content: formData.description,
        tags,
      });

      await queryClient.invalidateQueries({ queryKey: ['agora-actions'] });
      await queryClient.refetchQueries({ queryKey: ['agora-actions'] });

      setFormData({
        title: '', description: '', type: 'photo', bounty: '',
        startDate: '', startTime: '', deadline: '', time: '',
        coverImage: DEFAULT_COVER_IMAGE,
        selectedCountry: countryCode || '',
        timezone: browserTimezone,
      });
      onOpenChange(false);
      toast({ title: 'Action created' });
    } catch (error) {
      console.error('Failed to create action:', error);
      toast({ title: 'Failed to create action', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85dvh] max-h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Create action
            </DrawerTitle>
            <DrawerDescription>
              {countryCode
                ? `New action for ${getGeoDisplayName(countryCode)}.`
                : 'New action. You can optionally choose a country below.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1 pb-safe">
            <CreateActionForm
              formData={formData}
              setFormData={setFormData}
              isSubmitting={isSubmitting}
              handleSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
              pageCountryCode={countryCode}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg md:max-w-2xl max-h-[85vh] w-[calc(100vw-2rem)] sm:w-full overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Create action
          </DialogTitle>
          <DialogDescription>
            {countryCode
              ? `New action for ${getGeoDisplayName(countryCode)}.`
              : 'New action. You can optionally choose a country below.'}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          <CreateActionForm
            formData={formData}
            setFormData={setFormData}
            isSubmitting={isSubmitting}
            handleSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            pageCountryCode={countryCode}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type SortOption = 'recent' | 'bounty' | 'deadline';

export default function ActionsPage() {
  const { user } = useCurrentUser();

  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [headerCountryPickerOpen, setHeaderCountryPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: actions, isLoading: actionsLoading } = useActions({
    countryCode: selectedCountry,
    limit: 300,
  });

  // Drive the global FAB from the canonical layout API so we get the same
  // circular Plus button every other page has.
  useLayoutOptions({
    showFAB: !!user,
    onFabClick: () => setCreateOpen(true),
  });

  const allCountries = useMemo(() => getAllCountries(), []);

  const countryOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; flag: string }> = [
      { value: 'global', label: 'Global', flag: '🌍' },
    ];
    allCountries.forEach((country) => {
      options.push({
        value: country.code,
        label: country.name,
        flag: countryCodeToFlag(country.code),
      });
    });
    return options;
  }, [allCountries]);

  const selectedCountryName = selectedCountry
    ? getGeoDisplayName(selectedCountry)
    : 'Global';

  useSeoMeta({
    title: `Actions${selectedCountry ? ` — ${selectedCountryName}` : ''} | Agora`,
    description: 'Complete activist actions and earn Bitcoin bounties. Take photos, create art, gather information, and take action for change.',
  });

  const isLoading = actionsLoading;

  // Section split (parser already returns: current → upcoming → past).
  // We re-derive here so that local sorting can be applied per section.
  const now = Date.now() / 1000;
  const currentUnsorted = actions?.filter((c) => {
    const startTime = c.startTime ?? c.createdAt;
    return startTime <= now && (!c.deadline || c.deadline > now);
  }) ?? [];
  const upcomingUnsorted = actions?.filter((c) => {
    const startTime = c.startTime ?? c.createdAt;
    return startTime > now;
  }) ?? [];
  const pastUnsorted = actions?.filter((c) => c.deadline && c.deadline <= now) ?? [];

  const sortActions = (cs: Action[]) => {
    const sorted = [...cs];
    const isPastOnlyList = sorted.length > 0 && sorted.every((c) => !!c.deadline && c.deadline <= now);
    switch (sortBy) {
      case 'recent':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'bounty':
        return sorted.sort((a, b) => b.bounty - a.bounty);
      case 'deadline':
        return sorted.sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          // Upcoming/current: soonest deadline first. Past: most recently ended first.
          return isPastOnlyList ? b.deadline - a.deadline : a.deadline - b.deadline;
        });
    }
  };

  const currentActions = sortActions(currentUnsorted);
  const upcomingActions = sortActions(upcomingUnsorted);
  const pastActions = sortActions(pastUnsorted);

  const DEFAULT_VISIBLE = 4;
  const [showAllCurrent, setShowAllCurrent] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const visibleCurrent = showAllCurrent ? currentActions : currentActions.slice(0, DEFAULT_VISIBLE);
  const visibleUpcoming = showAllUpcoming ? upcomingActions : upcomingActions.slice(0, DEFAULT_VISIBLE);
  const visiblePast = showAllPast ? pastActions : pastActions.slice(0, DEFAULT_VISIBLE);
  const hasCurrent = currentActions.length > 0;
  const hasUpcoming = upcomingActions.length > 0;
  const isOnlyPastView = !hasCurrent && !hasUpcoming && pastActions.length > 0;
  const primarySectionTitle = hasCurrent
    ? 'Active actions'
    : hasUpcoming
      ? 'Upcoming actions'
    : pastActions.length > 0
        ? 'Past actions'
        : 'Actions';
  const deadlineSortLabel = isOnlyPastView ? 'Recently ended' : 'Deadline soon';

  const headerControls = (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-auto p-2 hover:bg-muted/50 rounded-lg" aria-label="Sort">
            <ListFilter className="h-5 w-5 text-primary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sort by</div>
          <DropdownMenuItem onClick={() => setSortBy('recent')} className={sortBy === 'recent' ? 'bg-primary/10' : ''}>
            <Clock className="mr-2 h-4 w-4" /><span>Most recent</span>
            {sortBy === 'recent' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortBy('bounty')} className={sortBy === 'bounty' ? 'bg-primary/10' : ''}>
            <DollarSign className="mr-2 h-4 w-4" /><span>Highest bounty</span>
            {sortBy === 'bounty' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSortBy('deadline')} className={sortBy === 'deadline' ? 'bg-primary/10' : ''}>
            <Calendar className="mr-2 h-4 w-4" /><span>{deadlineSortLabel}</span>
            {sortBy === 'deadline' && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={headerCountryPickerOpen} onOpenChange={setHeaderCountryPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-auto p-2 hover:bg-muted/50 rounded-lg" aria-label="Filter by country">
            {selectedCountry ? (
              <span className="text-2xl">{countryCodeToFlag(selectedCountry)}</span>
            ) : (
              <Globe className="h-5 w-5 text-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="end">
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
                      setSelectedCountry(option.value === 'global' ? undefined : option.value);
                      setHeaderCountryPickerOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span>{option.flag}</span>
                    <span className="flex-1">{option.label}</span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        (selectedCountry || 'global') === option.value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader title="Actions" icon={<Megaphone className="size-5" />} />

      <div className="px-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => <ActionSkeleton key={i} />)}
          </div>
        ) : (actions && actions.length > 0) ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{primarySectionTitle}</h2>
              {headerControls}
            </div>

            {hasCurrent ? (
              <ActionSection
                items={visibleCurrent}
                total={currentActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllCurrent}
                onToggle={() => setShowAllCurrent(!showAllCurrent)}
                isExpired={false}
              />
            ) : hasUpcoming ? (
              <ActionSection
                items={visibleUpcoming}
                total={upcomingActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllUpcoming}
                onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                isExpired={false}
              />
            ) : pastActions.length > 0 ? (
              <ActionSection
                items={visiblePast}
                total={pastActions.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllPast}
                onToggle={() => setShowAllPast(!showAllPast)}
                isExpired
              />
            ) : null}

            {hasCurrent && hasUpcoming && (
              <SectionDivider title="Upcoming">
                <ActionSection
                  items={visibleUpcoming}
                  total={upcomingActions.length}
                  visible={DEFAULT_VISIBLE}
                  showAll={showAllUpcoming}
                  onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                  isExpired={false}
                />
              </SectionDivider>
            )}

            {pastActions.length > 0 && (hasCurrent || hasUpcoming) && (
              <SectionDivider title="Past">
                <ActionSection
                  items={visiblePast}
                  total={pastActions.length}
                  visible={DEFAULT_VISIBLE}
                  showAll={showAllPast}
                  onToggle={() => setShowAllPast(!showAllPast)}
                  isExpired
                />
              </SectionDivider>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Active actions</h2>
              {headerControls}
            </div>

            <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Megaphone className="size-8 text-primary" />
              </div>
              <div className="space-y-2 max-w-xs">
                <h3 className="text-xl font-bold">No actions yet</h3>
                <p className="text-muted-foreground text-sm">
                  {selectedCountry ? `Be the first to create an action for ${selectedCountryName}.` : 'Be the first to create an action.'}
                </p>
              </div>
              {user && (
                <Button onClick={() => setCreateOpen(true)} className="rounded-full">
                  <Plus className="size-4 mr-2" />
                  Create action
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <CreateActionDialog
        countryCode={selectedCountry}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </main>
  );
}

function ActionSection({
  items, total, visible, showAll, onToggle, isExpired,
}: {
  items: Action[]; total: number; visible: number; showAll: boolean; onToggle: () => void; isExpired: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {items.map((action) => (
          <ActionCard
            key={`${action.pubkey}:${action.id}`}
            action={action}
            isExpired={isExpired}
          />
        ))}
      </div>
      {total > visible && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onToggle} className="gap-2">
            {showAll ? (
              <>Show less <ChevronRight className="h-4 w-4 rotate-90" /></>
            ) : (
              <>Show more ({total - visible} more) <ChevronRight className="h-4 w-4 -rotate-90" /></>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function SectionDivider({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <div className="flex-1 border-t border-border/50" />
      </div>
      {children}
    </div>
  );
}
