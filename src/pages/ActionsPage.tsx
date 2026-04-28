import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link as RouterLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { useChallenges, type Challenge } from '@/hooks/useChallenges';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useOrganizers } from '@/hooks/useOrganizers';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from '@/hooks/useToast';
import { isAdmin } from '@/lib/admins';
import { createCountryIdentifier } from '@/lib/countryIdentifiers';
import { getAllCountries, getGeoDisplayName, countryCodeToFlag } from '@/lib/countries';
import { getDisplayName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger,
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
  Calendar, DollarSign, Globe, AlertTriangle,
} from 'lucide-react';

const CHALLENGE_ICONS = {
  photo: Camera,
  art: Palette,
  info: Info,
  action: Zap,
} as const;

function formatSats(sats: number): string {
  return sats.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons / Cards
// ─────────────────────────────────────────────────────────────────────────────

function ChallengeSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  );
}

function ChallengeShareMenu({ challenge }: { challenge: Challenge }) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOwner = user?.pubkey === challenge.pubkey;

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: challenge.pubkey,
    identifier: challenge.id,
  });

  const challengeUrl = `${window.location.origin}/${naddr}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(challengeUrl);
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
          ['e', challenge.event.id],
          ['a', `36639:${challenge.pubkey}:${challenge.id}`],
        ],
      });
      await queryClient.invalidateQueries({ queryKey: ['agora-challenges'] });
      await queryClient.invalidateQueries({ queryKey: ['agora-challenge'] });
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

function ChallengeCard({ challenge, isExpired }: { challenge: Challenge; isExpired?: boolean }) {
  const author = useAuthor(challenge.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const displayName = getDisplayName(metadata, challenge.pubkey);
  const Icon = CHALLENGE_ICONS[challenge.type];
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const naddr = nip19.naddrEncode({
    kind: 36639,
    pubkey: challenge.pubkey,
    identifier: challenge.id,
  });

  return (
    <RouterLink to={`/${naddr}`} className="block h-full">
      <Card
        className={cn(
          'relative overflow-hidden border-2 border-primary/30 transition-all duration-300 group cursor-pointer h-full flex flex-col',
          !isExpired && 'hover:border-primary/60 hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-1',
          isExpired && 'border-border/80 bg-muted/10',
        )}
      >
        {challenge.image && !imageLoadFailed && (
          <div className="relative w-full h-48 overflow-hidden">
            <img
              src={challenge.image}
              alt={challenge.title}
              className="w-full h-full object-cover"
              onError={() => setImageLoadFailed(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />
          </div>
        )}
        {!challenge.image && challenge.imageError && (
          <div className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              Cover image rejected
            </div>
            <p className="mt-1">{challenge.imageError}</p>
          </div>
        )}
        {challenge.image && imageLoadFailed && (
          <div className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              Cover image failed to load
            </div>
            <p className="mt-1 break-all">{challenge.image}</p>
          </div>
        )}

        <CardHeader className="pb-3 pt-5">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/20 border-2 border-primary/40 shadow-md',
                isExpired && 'grayscale',
              )}
            >
              <Icon className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className={cn(
                  'text-xl font-black line-clamp-2 transition-colors leading-tight',
                  !isExpired && 'group-hover:text-primary',
                  isExpired && 'text-muted-foreground',
                )}>
                  {challenge.title}
                </CardTitle>
                <ChallengeShareMenu challenge={challenge} />
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xl" title={getGeoDisplayName(challenge.countryCode)}>
                  {countryCodeToFlag(challenge.countryCode)}
                </span>
                {isExpired ? (
                  <div className="px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-semibold flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expired
                  </div>
                ) : challenge.deadline ? (
                  <div className="px-2 py-1 rounded-md bg-accent/10 border border-accent/30 text-accent text-xs font-semibold flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(challenge.deadline * 1000, 'MMM d, yyyy')}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col pb-4">
          <p className={cn(
            'text-sm line-clamp-4 mb-4 flex-1 leading-relaxed',
            isExpired ? 'text-muted-foreground/90' : 'text-foreground/80',
          )}>
            {challenge.description}
          </p>
          <div className={cn(
            'p-3 rounded-lg border-2 shadow-sm space-y-2',
            isExpired
              ? 'bg-muted/40 border-border/70'
              : 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/40',
          )}>
            <div className="flex items-center gap-2 min-w-0">
              <Bitcoin className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">{formatSats(challenge.bounty)}</span>
              <span className="text-xs text-muted-foreground">sats</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <Avatar className="h-6 w-6 border-2 border-background shrink-0">
                <AvatarImage src={metadata?.picture} />
                <AvatarFallback className="text-[10px] bg-muted">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{displayName}</span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="mt-auto pt-0">
          <Button className="w-full gap-2" variant={isExpired ? 'outline' : 'default'}>
            <Zap className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{isExpired ? 'View archived action' : 'View action'}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          </Button>
        </CardFooter>
      </Card>
    </RouterLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Action dialog (admin / organizer only)
// ─────────────────────────────────────────────────────────────────────────────

interface CreateFormState {
  title: string;
  description: string;
  type: Challenge['type'];
  bounty: string;
  startDate: string;
  startTime: string;
  deadline: string;
  time: string;
  coverImage: string;
  selectedCountry: string;
}

function CreateChallengeForm({
  formData, setFormData, isSubmitting, handleSubmit, onCancel,
  userIsAdmin, pageCountryCode,
}: {
  formData: CreateFormState;
  setFormData: (data: CreateFormState) => void;
  isSubmitting: boolean;
  handleSubmit: () => void;
  onCancel: () => void;
  userIsAdmin: boolean;
  pageCountryCode?: string;
}) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const allCountries = useMemo(() => getAllCountries(), []);

  const countryOptions = useMemo(() => {
    if (!userIsAdmin) {
      if (!formData.selectedCountry) return [];
      return [{
        value: formData.selectedCountry,
        label: getGeoDisplayName(formData.selectedCountry),
        flag: countryCodeToFlag(formData.selectedCountry),
      }];
    }

    const options: Array<{ value: string; label: string; flag: string }> = [];
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
  }, [userIsAdmin, formData.selectedCountry, pageCountryCode, allCountries]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const [[, url]] = await uploadFile(file);
      setFormData({ ...formData, coverImage: url });
    } catch (error) {
      console.error('Failed to upload cover image:', error);
    }
  };

  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  return (
    <>
      <div className="space-y-4 py-2 px-4 max-w-full overflow-hidden">
        {userIsAdmin && countryOptions.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
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
                    <span>Select country</span>
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
                            setFormData({ ...formData, selectedCountry: option.value });
                            setCountryPickerOpen(false);
                          }}
                          className="gap-2"
                        >
                          <span>{option.flag}</span>
                          <span className="flex-1">{option.label}</span>
                          <Check
                            className={cn(
                              'h-4 w-4',
                              formData.selectedCountry === option.value ? 'opacity-100' : 'opacity-0',
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
          <Label>Cover image (optional)</Label>
          {formData.coverImage && (
            <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
              <img
                src={formData.coverImage}
                alt="Cover preview"
                className="w-full h-full object-cover"
              />
            </div>
          )}
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
              <span className="text-sm">
                {formData.coverImage ? 'Replace cover' : 'Upload cover'}
              </span>
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
                setFormData({ ...formData, type: value as Challenge['type'] })
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
      </div>
      <div className="flex flex-col gap-2 p-4 pt-2">
        <Button
          onClick={handleSubmit}
          disabled={!formData.title || !formData.description || !formData.bounty || !formData.selectedCountry || isSubmitting}
          className="gap-2 w-full"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bitcoin className="h-4 w-4" />}
          Create action
        </Button>
        <Button variant="outline" onClick={onCancel} className="w-full">Cancel</Button>
      </div>
    </>
  );
}

function CreateChallengeDialog({
  countryCode, variant = 'inline',
}: { countryCode?: string; variant?: 'inline' | 'fab' }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { isOrganizer } = useOrganizers();
  const { toast } = useToast();

  const [formData, setFormData] = useState<CreateFormState>({
    title: '',
    description: '',
    type: 'photo',
    bounty: '',
    startDate: '',
    startTime: '',
    deadline: '',
    time: '',
    coverImage: '',
    selectedCountry: countryCode || '',
  });

  const userIsAdmin = user ? isAdmin(user.pubkey) : false;
  const userIsLocalOrganizer =
    user && countryCode ? isOrganizer(user.pubkey, countryCode) : false;
  // Admins can author for any country; non-admin organizers can only author for
  // a country they're appointed to. Outside a country context, only admins
  // can create.
  const canCreateChallenge = userIsAdmin || userIsLocalOrganizer;

  const handleSubmit = async () => {
    if (!user || !formData.selectedCountry) return;
    setIsSubmitting(true);
    try {
      const now = Date.now();
      const slug = formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const dTag = `${slug || 'action'}-${now}`;
      const countryUpper = formData.selectedCountry.toUpperCase();

      const tags: string[][] = [
        ['d', dTag],
        ['title', formData.title],
        ['challenge-type', formData.type],
        ['bounty', formData.bounty],
        ['i', createCountryIdentifier(countryUpper)],
        ['t', 'agora-action'],
        ['alt', `Agora activist action: ${formData.title}`],
      ];
      if (formData.coverImage) tags.push(['image', formData.coverImage]);

      if (formData.startDate) {
        const [year, month, day] = formData.startDate.split('-').map(Number);
        const [hours, minutes] = formData.startTime
          ? formData.startTime.split(':').map(Number)
          : [0, 0];
        const startDate = new Date(year, month - 1, day, hours, minutes, 0);
        tags.push(['start', String(Math.floor(startDate.getTime() / 1000))]);
      }
      if (formData.deadline) {
        const [year, month, day] = formData.deadline.split('-').map(Number);
        const [hours, minutes] = formData.time
          ? formData.time.split(':').map(Number)
          : [23, 59];
        const deadlineDate = new Date(year, month - 1, day, hours, minutes, 0);
        tags.push(['deadline', String(Math.floor(deadlineDate.getTime() / 1000))]);
      }

      await createEvent({
        kind: 36639,
        content: formData.description,
        tags,
      });

      await queryClient.invalidateQueries({ queryKey: ['agora-challenges'] });
      await queryClient.refetchQueries({ queryKey: ['agora-challenges'] });

      setOpen(false);
      setFormData({
        title: '', description: '', type: 'photo', bounty: '',
        startDate: '', startTime: '', deadline: '', time: '',
        coverImage: '', selectedCountry: countryCode || '',
      });
      toast({ title: 'Action created' });
    } catch (error) {
      console.error('Failed to create action:', error);
      toast({ title: 'Failed to create action', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || !canCreateChallenge) return null;

  const trigger = variant === 'fab'
    ? (
      <Button className="shadow-lg" aria-label="Create action">
        <Plus className="h-4 w-4 mr-2" />
        Create action
      </Button>
    )
    : (
      <Button className="gap-2">
        <Plus className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">Create action</span>
      </Button>
    );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="h-[85dvh] max-h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Create action
            </DrawerTitle>
            <DrawerDescription>
              {countryCode
                ? `New action for ${getGeoDisplayName(countryCode)}.`
                : 'New action — pick a country below.'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1 pb-safe">
            <CreateChallengeForm
              formData={formData}
              setFormData={setFormData}
              isSubmitting={isSubmitting}
              handleSubmit={handleSubmit}
              onCancel={() => setOpen(false)}
              userIsAdmin={userIsAdmin}
              pageCountryCode={countryCode}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md sm:max-w-lg md:max-w-2xl max-h-[85vh] w-[calc(100vw-2rem)] sm:w-full overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Create action
          </DialogTitle>
          <DialogDescription>
            {countryCode
              ? `New action for ${getGeoDisplayName(countryCode)}.`
              : 'New action — pick a country below.'}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          <CreateChallengeForm
            formData={formData}
            setFormData={setFormData}
            isSubmitting={isSubmitting}
            handleSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
            userIsAdmin={userIsAdmin}
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
  const { isOrganizer, isLoading: organizersLoading } = useOrganizers();

  const [selectedCountry, setSelectedCountry] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [headerCountryPickerOpen, setHeaderCountryPickerOpen] = useState(false);

  const { data: challenges, isLoading: challengesLoading } = useChallenges({
    countryCode: selectedCountry,
    limit: 300,
  });

  const userIsAdmin = user ? isAdmin(user.pubkey) : false;
  const userIsLocalOrganizer =
    user && selectedCountry ? isOrganizer(user.pubkey, selectedCountry) : false;
  const canCreateChallenge = userIsAdmin || userIsLocalOrganizer;

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

  const isLoading = organizersLoading || challengesLoading;

  // Section split (parser already returns: current → upcoming → past).
  // We re-derive here so that local sorting can be applied per section.
  const now = Date.now() / 1000;
  const currentUnsorted = challenges?.filter((c) => {
    const startTime = c.startTime ?? c.createdAt;
    return startTime <= now && (!c.deadline || c.deadline > now);
  }) ?? [];
  const upcomingUnsorted = challenges?.filter((c) => {
    const startTime = c.startTime ?? c.createdAt;
    return startTime > now;
  }) ?? [];
  const pastUnsorted = challenges?.filter((c) => c.deadline && c.deadline <= now) ?? [];

  const sortChallenges = (cs: Challenge[]) => {
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

  const currentChallenges = sortChallenges(currentUnsorted);
  const upcomingChallenges = sortChallenges(upcomingUnsorted);
  const pastChallenges = sortChallenges(pastUnsorted);

  const DEFAULT_VISIBLE = 4;
  const [showAllCurrent, setShowAllCurrent] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const visibleCurrent = showAllCurrent ? currentChallenges : currentChallenges.slice(0, DEFAULT_VISIBLE);
  const visibleUpcoming = showAllUpcoming ? upcomingChallenges : upcomingChallenges.slice(0, DEFAULT_VISIBLE);
  const visiblePast = showAllPast ? pastChallenges : pastChallenges.slice(0, DEFAULT_VISIBLE);
  const hasCurrent = currentChallenges.length > 0;
  const hasUpcoming = upcomingChallenges.length > 0;
  const isOnlyPastView = !hasCurrent && !hasUpcoming && pastChallenges.length > 0;
  const primarySectionTitle = hasCurrent
    ? 'Active actions'
    : hasUpcoming
      ? 'Upcoming actions'
      : pastChallenges.length > 0
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
    <main>
      <PageHeader title="Actions" icon={<Zap className="size-5 text-primary" />} />

      <div className="px-4 pb-24 max-w-5xl mx-auto">
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <ChallengeSkeleton key={i} />)}
          </div>
        ) : (challenges && challenges.length > 0) ? (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {primarySectionTitle}
              </h2>
              {headerControls}
            </div>

            {hasCurrent ? (
              <ChallengeSection
                items={visibleCurrent}
                total={currentChallenges.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllCurrent}
                onToggle={() => setShowAllCurrent(!showAllCurrent)}
                isExpired={false}
              />
            ) : hasUpcoming ? (
              <ChallengeSection
                items={visibleUpcoming}
                total={upcomingChallenges.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllUpcoming}
                onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                isExpired={false}
              />
            ) : pastChallenges.length > 0 ? (
              <ChallengeSection
                items={visiblePast}
                total={pastChallenges.length}
                visible={DEFAULT_VISIBLE}
                showAll={showAllPast}
                onToggle={() => setShowAllPast(!showAllPast)}
                isExpired
              />
            ) : null}

            {hasCurrent && hasUpcoming && (
              <SectionDivider title="Upcoming actions" icon={<Calendar className="h-5 w-5 text-primary" />}>
                <ChallengeSection
                  items={visibleUpcoming}
                  total={upcomingChallenges.length}
                  visible={DEFAULT_VISIBLE}
                  showAll={showAllUpcoming}
                  onToggle={() => setShowAllUpcoming(!showAllUpcoming)}
                  isExpired={false}
                />
              </SectionDivider>
            )}

            {pastChallenges.length > 0 && (hasCurrent || hasUpcoming) && (
              <SectionDivider title="Past actions" icon={<Clock className="h-5 w-5" />} muted>
                <ChallengeSection
                  items={visiblePast}
                  total={pastChallenges.length}
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
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Active actions
              </h2>
              {headerControls}
            </div>

            <Card className="border-dashed border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="py-12 px-6 text-center">
                <div className="relative mx-auto mb-6">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
                  </div>
                  <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary/20 flex items-center justify-center ring-4 ring-primary/10">
                    <Zap className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">No actions yet</h3>
                  <p className="text-muted-foreground">
                    Be the first to create an action for {selectedCountryName}.
                  </p>
                </div>
                <div className="hidden md:flex flex-col items-center gap-3 mt-6">
                  <CreateChallengeDialog countryCode={selectedCountry} />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {user && canCreateChallenge && (
        <div className="fixed bottom-safe-20 sm:bottom-24 right-4 z-30">
          <CreateChallengeDialog countryCode={selectedCountry} variant="fab" />
        </div>
      )}
    </main>
  );
}

function ChallengeSection({
  items, total, visible, showAll, onToggle, isExpired,
}: {
  items: Challenge[]; total: number; visible: number; showAll: boolean; onToggle: () => void; isExpired: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {items.map((challenge) => (
          <ChallengeCard
            key={`${challenge.pubkey}:${challenge.id}`}
            challenge={challenge}
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
  title, icon, muted, children,
}: { title: string; icon: React.ReactNode; muted?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-border/50" />
        <h2 className={cn('text-lg font-semibold flex items-center gap-2', muted && 'text-muted-foreground')}>
          {icon}
          {title}
        </h2>
        <div className="flex-1 border-t border-border/50" />
      </div>
      {children}
    </div>
  );
}
