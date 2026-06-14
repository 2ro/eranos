import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NostrMetadata } from '@nostrify/nostrify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle2, Pencil, Plus, Trash2, ChevronDown, ImagePlus, X as XIcon, Link as LinkIcon } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { BioContent } from '@/components/BioContent';
import { cn } from '@/lib/utils';
import { getNip05Domain, formatNip05Display } from '@/lib/nip05';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { BadgeShowcaseGrid } from '@/components/BadgeShowcaseGrid';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { autoGrowTextarea } from '@/lib/autoGrowTextarea';

/** Shared classes for all editable fields — static muted bg when idle, border on hover/focus */
const editableBase = [
  'rounded-lg px-2',
  'border-2 border-transparent',
  'bg-muted/40',
  'hover:bg-muted/60 hover:border-border',
  'focus:bg-transparent focus:border-primary',
  'transition-colors duration-150',
  'placeholder:text-muted-foreground/40',
  'outline-none',
].join(' ');

function EditableInput({
  value,
  placeholder,
  onChange,
  maxLength,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  maxLength?: number;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={cn(editableBase, 'w-full min-w-0 py-0.5', className)}
    />
  );
}

function EditableTextarea({
  value,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        autoGrowTextarea(e.target);
      }}
      onFocus={(e) => {
        autoGrowTextarea(e.target);
      }}
      rows={1}
      className={cn(editableBase, 'w-full min-w-0 py-1 resize-none overflow-hidden text-base md:text-sm text-muted-foreground leading-relaxed', className)}
    />
  );
}

interface ProfileField {
  label: string;
  value: string;
}

/**
 * Shared dropdown of image actions used by both the avatar and the banner.
 * Wraps the provided trigger element and surfaces "Upload file", an optional
 * "Paste URL", and an optional "Remove" (only shown when the image exists and
 * a remove handler is wired). Deduplicating this between avatar and banner
 * keeps the two menus identical and the actions in one place.
 */
function ImageEditMenu({
  trigger,
  hasImage,
  onUpload,
  onPasteUrl,
  onRemove,
}: {
  trigger: React.ReactNode;
  hasImage: boolean;
  onUpload: () => void;
  onPasteUrl?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        <DropdownMenuItem onClick={onUpload}>
          <ImagePlus className="size-4 mr-2" />
          {t('profile.imageMenu.upload')}
        </DropdownMenuItem>
        {onPasteUrl && (
          <DropdownMenuItem onClick={onPasteUrl}>
            <LinkIcon className="size-4 mr-2" />
            {t('profile.imageMenu.pasteUrl')}
          </DropdownMenuItem>
        )}
        {hasImage && onRemove && (
          <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
            <XIcon className="size-4 mr-2" />
            {t('profile.imageMenu.remove')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ProfileCardProps {
  className?: string;
  pubkey?: string;
  metadata: Partial<NostrMetadata>;
  onChange?: (patch: Partial<NostrMetadata>) => void;
  onPickImage?: (field: 'picture' | 'banner') => void;
  /**
   * Called when the user chooses "Paste URL" for an image field. The handler
   * is expected to read the clipboard, validate the URL, and apply it. When
   * provided, the banner gains a dropdown menu (matching the avatar) so the
   * paste action is reachable for both images.
   */
  onPasteUrl?: (field: 'picture' | 'banner') => void;
  /** Called when user removes their avatar picture. */
  onRemoveAvatar?: () => void;
  /** Called when user removes their banner image. */
  onRemoveBanner?: () => void;
  /** Show the banner area (default true). When false, only the avatar shows. */
  showBanner?: boolean;
  /** Show the avatar area (default true). */
  showAvatar?: boolean;
  /** Placeholder for the editable name input. */
  namePlaceholder?: string;
  /** Maximum length for the editable name input. */
  nameMaxLength?: number;
  /** Show NIP-05 row (default true) */
  showNip05?: boolean;
  /** Show NIP-58 badge showcase row (default true). */
  showBadges?: boolean;
  /**
   * Which kind-0 field the editable text slot below the name edits.
   * - `'about'` (default): the bio textarea.
   * - `'website'`: a single-line website input, replacing the bio entirely.
   * - `'none'`: hide the slot entirely (just name).
   */
  bioField?: 'about' | 'website' | 'none';
  /** Placeholder for the bio textarea when `bioField` is `'about'`. */
  aboutPlaceholder?: string;
  /** When provided, render an editable profile fields section below bio */
  extraFields?: ProfileField[];
  onExtraFieldsChange?: (fields: ProfileField[]) => void;
}

export function ProfileCard({
  className,
  pubkey,
  metadata,
  onChange,
  onPickImage,
  onPasteUrl,
  onRemoveAvatar,
  onRemoveBanner,
  showBanner = true,
  showAvatar = true,
  namePlaceholder = 'Your name',
  nameMaxLength,
  showNip05 = true,
  showBadges = true,
  bioField = 'about',
  aboutPlaceholder = 'Write a short bio…',
  extraFields,
  onExtraFieldsChange,
}: ProfileCardProps) {
  const { t } = useTranslation();
  const editable = !!onChange;
  const [nip05Focused, setNip05Focused] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const { user } = useCurrentUser();
  const isOwnProfile = !!pubkey && !!user && pubkey === user.pubkey;
  const { refs: badgeRefs, isLoading: badgesLoading } = useProfileBadges(pubkey);
  const { badgeMap, isLoading: defsLoading } = useBadgeDefinitions(badgeRefs);

  const displayName = metadata.name || metadata.display_name || genUserName(pubkey);
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const patch = (key: keyof NostrMetadata) => (v: string) => onChange?.({ [key]: v });

  // Sanitize banner URL from untrusted metadata before CSS url() interpolation
  const bannerUrl = sanitizeUrl(metadata.banner);

  const nip05 = metadata.nip05;
  const nip05Domain = nip05 ? getNip05Domain(nip05) : undefined;

  const addField = () => onExtraFieldsChange?.([...(extraFields ?? []), { label: '', value: '' }]);
  const removeField = (i: number) => onExtraFieldsChange?.((extraFields ?? []).filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof ProfileField, val: string) =>
    onExtraFieldsChange?.((extraFields ?? []).map((f, idx) => idx === i ? { ...f, [key]: val } : f));

  return (
    <div className={cn('bg-card border rounded-xl overflow-hidden', className)}>

      {/* Banner */}
      {showBanner && (editable && (onPasteUrl || onRemoveBanner) ? (
        // When a paste or remove action exists, the banner opens the shared
        // image menu instead of going straight to the file picker.
        <ImageEditMenu
          hasImage={!!metadata.banner}
          onUpload={() => onPickImage?.('banner')}
          onPasteUrl={onPasteUrl ? () => onPasteUrl('banner') : undefined}
          onRemove={onRemoveBanner}
          trigger={
            <button
              type="button"
              className="relative block w-full h-36 bg-secondary cursor-pointer group outline-none"
              style={
                bannerUrl
                  ? { backgroundImage: `url("${bannerUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : undefined
              }
            >
              {!metadata.banner && <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />}
              {!metadata.banner && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Plus className="size-6 text-muted-foreground" strokeWidth={4} />
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-white text-xs font-medium bg-black/50 rounded-full px-3 py-1.5 backdrop-blur-sm">
                  <Pencil className="size-3.5" /> {metadata.banner ? 'Change banner' : 'Add banner'}
                </span>
              </div>
              {metadata.banner && (
                <div className="absolute bottom-2 right-2 size-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center transition-opacity">
                  <Pencil className="size-3.5 text-muted-foreground" />
                </div>
              )}
            </button>
          }
        />
      ) : (
        <div
          className={cn('relative h-36 bg-secondary', editable && 'cursor-pointer group')}
          style={
            bannerUrl
              ? { backgroundImage: `url("${bannerUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
          onClick={() => editable && onPickImage?.('banner')}
        >
          {!metadata.banner && <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />}
          {editable && !metadata.banner && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Plus className="size-6 text-muted-foreground" strokeWidth={4} />
            </div>
          )}
          {editable && (
            <>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-white text-xs font-medium bg-black/50 rounded-full px-3 py-1.5 backdrop-blur-sm">
                  <Pencil className="size-3.5" /> {metadata.banner ? 'Change banner' : 'Add banner'}
                </span>
              </div>
              {metadata.banner && (
                <div className="absolute bottom-2 right-2 size-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center transition-opacity">
                  <Pencil className="size-3.5 text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Profile info */}
      <div className={cn('px-4 pb-4', !showAvatar && (showBanner ? 'pt-3' : 'pt-4'))}>

        {/* Avatar */}
        {showAvatar && <div className={cn('flex justify-between items-start mb-3', showBanner ? '-mt-12' : 'mt-3')}>
          {editable ? (
            <ImageEditMenu
              hasImage={!!metadata.picture}
              onUpload={() => onPickImage?.('picture')}
              onPasteUrl={onPasteUrl ? () => onPasteUrl('picture') : undefined}
              onRemove={onRemoveAvatar}
              trigger={
                <button type="button" className="relative shrink-0 cursor-pointer group outline-none">
                  <Avatar className="shadow-sm size-24 border-4 border-background">
                    <AvatarImage src={metadata.picture} alt={displayName} className="object-cover" />
                    <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                      {metadata.picture ? initial : <Plus className="size-8 text-muted-foreground" strokeWidth={4} />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center rounded-full">
                    <Pencil className="size-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                  {metadata.picture && (
                    <div className="absolute bottom-0 right-0 size-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center transition-opacity">
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </div>
                  )}
                </button>
              }
            />
          ) : (
            <div className="relative shrink-0">
              <Avatar className="shadow-sm size-24 border-4 border-background">
                <AvatarImage src={metadata.picture} alt={displayName} className="object-cover" />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>}

        {/* Name */}
        {editable ? (
          <EditableInput
            value={metadata.name ?? ''}
            placeholder={namePlaceholder}
            maxLength={nameMaxLength}
            onChange={patch('name')}
            className="text-xl font-bold"
          />
        ) : (
          <h2 className="text-xl font-bold truncate">{displayName}</h2>
        )}

        {/* NIP-05 */}
        {showNip05 && (editable || nip05) && (
          <div className="flex items-center gap-1 mt-2 min-w-0 text-sm text-muted-foreground ml-2">
            <CheckCircle2 className="size-3.5 text-primary shrink-0" />
            {editable && nip05Focused ? (
              <input
                type="text"
                value={nip05 ?? ''}
                placeholder="you@domain.com"
                autoFocus
                onChange={(e) => patch('nip05')(e.target.value)}
                onBlur={() => setNip05Focused(false)}
                size={Math.max((nip05?.length ?? 0) + 1, 4)}
                className={cn(editableBase, 'py-0.5 h-6 text-base md:text-sm text-muted-foreground border-primary bg-transparent')}
              />
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-1 min-w-0',
                  editable && cn(editableBase, 'py-0.5 h-6 cursor-text'),
                )}
                onClick={() => editable && setNip05Focused(true)}
              >
                <span className="shrink min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {nip05 ? formatNip05Display(nip05) : editable ? 'you@domain.com' : ''}
                </span>
                {nip05Domain && (
                  <ExternalFavicon url={`https://${nip05Domain}`} size={14} className="shrink-0" />
                )}
              </span>
            )}
          </div>
        )}

        {/* Bio — or, when `bioField` is `'website'`, a website input that
            takes the bio's place entirely; `'none'` hides the slot. */}
        {bioField !== 'none' && (
        <div className="mt-2">
          {bioField === 'website' ? (
            editable ? (
              <EditableInput
                value={(metadata.website as string) ?? ''}
                placeholder={t('profile.websitePlaceholder')}
                onChange={patch('website')}
                className="text-sm"
              />
            ) : metadata.website ? (
              <p className="text-sm text-muted-foreground leading-relaxed truncate">
                {metadata.website}
              </p>
            ) : null
          ) : editable ? (
            <EditableTextarea
              value={metadata.about ?? ''}
              placeholder={aboutPlaceholder}
              onChange={patch('about')}
            />
          ) : metadata.about ? (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              <BioContent>{metadata.about}</BioContent>
            </p>
          ) : null}
        </div>
        )}

        {/* Extra profile fields — collapsible, only when prop provided */}
        {extraFields !== undefined && (
          <Collapsible open={fieldsOpen} onOpenChange={setFieldsOpen} className="mt-3">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent text-sm font-medium text-muted-foreground">
                  Profile Fields
                  <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="space-y-2 pt-2">
              {/* Website always first */}
              <div className="grid grid-cols-[1fr,2fr] gap-2 items-center">
                <span className="text-sm text-muted-foreground px-1">Website</span>
                <Input
                  placeholder="https://yourwebsite.com"
                  value={(metadata.website as string) ?? ''}
                  onChange={(e) => patch('website')(e.target.value)}
                   className="h-8 text-base md:text-sm"
                 />
               </div>

               {extraFields.map((field, i) => (
                 <div key={i} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
                   <Input
                     placeholder="Label"
                     value={field.label}
                     onChange={(e) => updateField(i, 'label', e.target.value)}
                     className="h-8 text-base md:text-sm"
                   />
                   <Input
                     placeholder="Value or URL"
                     value={field.value}
                     onChange={(e) => updateField(i, 'value', e.target.value)}
                     className="h-8 text-base md:text-sm"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeField(i)} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={addField} className="w-full h-8 text-xs">
                <Plus className="size-3 mr-1" strokeWidth={4} /> Add Field
              </Button>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Badge showcase */}
      {showBadges && (badgeRefs.length > 0 || badgesLoading) && (
        <div className="px-4 pb-3">
          <BadgeShowcaseGrid
            items={badgeRefs.map((ref) => ({
              aTag: ref.aTag,
              pubkey: ref.pubkey,
              identifier: ref.identifier,
              badge: badgeMap.get(ref.aTag),
            }))}
            maxVisible={8}
            thumbnailSize={44}
            showEditButton={isOwnProfile}
            isLoading={badgesLoading || defsLoading}
            gridCols="grid-cols-4 sm:grid-cols-5"
          />
        </div>
      )}
    </div>
  );
}
