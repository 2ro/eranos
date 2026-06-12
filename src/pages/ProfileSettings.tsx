import { useSeoMeta } from '@unhead/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, Plus, Trash2, ChevronDown,
  Wallet, Upload, Music, ImageIcon, Film, Mail, Link2, Pencil, Eye, EyeOff, Copy, Check, Download, KeyRound, AlertTriangle, CloudSun,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useNostrLogin } from '@nostrify/react/login';

import { saveNsec } from '@/lib/credentialManager';
import { Navigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';

import { ProfileCard } from '@/components/ProfileCard';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { PageHeader } from '@/components/PageHeader';
import { HelpTip } from '@/components/HelpTip';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { SortableList, SortableItem } from '@/components/SortableList';
import { WalletBackupMnemonic } from '@/components/WalletBackupMnemonic';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';

import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ── Constants ─────────────────────────────────────────────────────────────────

const WALLET_TICKERS = [
  '$BTC', '$ETH', '$SOL', '$XMR', '$LTC', '$DOGE', '$ADA', '$DOT', '$XRP', '$MATIC',
] as const;

/** Bare tickers used only for detection (strips leading $). */
const BARE_TICKERS = WALLET_TICKERS.map((t) => t.slice(1));

// ── Field preset templates ────────────────────────────────────────────────────

interface FieldPreset {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Default label to pre-fill when adding this field type. */
  defaultLabel: string;
  /** The form field type. */
  type: 'text' | 'wallet' | 'media';
  /** File accept attribute for the file picker (media types only). */
  accept?: string;
  /** Human-readable format list shown in tooltips. */
  formatHint?: string;
  /** Placeholder for the value input. */
  valuePlaceholder?: string;
}

/**
 * Untranslated preset skeletons — icon, type, accept and the static
 * (locale-independent) defaults live here. Labels, descriptions, and
 * placeholders are filled in per-render via `useFieldPresets()` so they
 * pick up the active language.
 */
interface FieldPresetSkeleton {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  type: 'text' | 'wallet' | 'media';
  accept?: string;
  formatHint?: string;
  /** Locale-independent default label (emoji or wallet ticker). */
  defaultLabel?: string;
  /** Translation key suffix in `profileSettings.presets`. */
  i18nKey: string;
  /** Whether the default label should come from t('...defaultLabel'). */
  hasI18nDefaultLabel?: boolean;
}

const FIELD_PRESET_SKELETONS: FieldPresetSkeleton[] = [
  { id: 'music', icon: Music, type: 'media', accept: 'audio/*', formatHint: 'MP3, OGG, WAV, FLAC, AAC, M4A, Opus', defaultLabel: '\u{1F3B6}', i18nKey: 'music' },
  { id: 'photo', icon: ImageIcon, type: 'media', accept: 'image/*', formatHint: 'JPG, PNG, GIF, WebP, SVG, AVIF', defaultLabel: '\u{1F4F8}', i18nKey: 'photo' },
  { id: 'video', icon: Film, type: 'media', accept: 'video/*', formatHint: 'MP4, WebM, MOV', defaultLabel: '\u{1F3AC}', i18nKey: 'video' },
  { id: 'email', icon: Mail, type: 'text', i18nKey: 'email', hasI18nDefaultLabel: true },
  { id: 'wallet', icon: Wallet, type: 'wallet', defaultLabel: '$BTC', i18nKey: 'wallet' },
  { id: 'link', icon: Link2, type: 'text', defaultLabel: '', i18nKey: 'link' },
  { id: 'weather', icon: CloudSun, type: 'text', i18nKey: 'weather', hasI18nDefaultLabel: true },
];

const CUSTOM_PRESET_SKELETON: FieldPresetSkeleton = {
  id: 'custom', icon: Pencil, type: 'text', defaultLabel: '', i18nKey: 'custom',
};

/** Hook that materializes the field presets in the active locale. */
function useFieldPresets(): { presets: FieldPreset[]; customPreset: FieldPreset } {
  const { t } = useTranslation();
  return useMemo(() => {
    const materialize = (skel: FieldPresetSkeleton): FieldPreset => ({
      id: skel.id,
      icon: skel.icon,
      type: skel.type,
      accept: skel.accept,
      formatHint: skel.formatHint,
      label: t(`profileSettings.presets.${skel.i18nKey}.label`),
      description: t(`profileSettings.presets.${skel.i18nKey}.description`),
      valuePlaceholder: t(`profileSettings.presets.${skel.i18nKey}.valuePlaceholder`),
      defaultLabel: skel.hasI18nDefaultLabel
        ? t(`profileSettings.presets.${skel.i18nKey}.defaultLabel`)
        : (skel.defaultLabel ?? ''),
    });
    return {
      presets: FIELD_PRESET_SKELETONS.map(materialize),
      customPreset: materialize(CUSTOM_PRESET_SKELETON),
    };
  }, [t]);
}

/** Find a preset skeleton's format hint from its accept filter. */
function getFormatHintForAccept(accept: string | undefined): string | undefined {
  if (!accept) return undefined;
  const skel = FIELD_PRESET_SKELETONS.find((p) => p.accept === accept);
  return skel?.formatHint;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Infer the field type from stored label/value when loading from existing data. */
function inferFieldType(label: string, value: string): 'text' | 'wallet' | 'media' {
  const bare = label.replace(/^\$/, '').toUpperCase();
  if (BARE_TICKERS.includes(bare)) return 'wallet';
  // Known media file extensions
  if (/^https?:\/\/.+\.(jpe?g|png|gif|webp|svg|avif|mp4|webm|mov|mp3|ogg|wav|flac)(\?.*)?$/i.test(value)) return 'media';
  // Blossom-style URLs: path is a long hex hash (SHA-256), optionally with an extension
  if (/^https?:\/\/.+\/[0-9a-f]{64}(\.\w+)?$/i.test(value)) return 'media';
  return 'text';
}

/** Extension patterns for each media accept category. */
const AUDIO_EXT = /\.(mp3|mpga|ogg|oga|wav|flac|aac|m4a|opus|weba|webm|spx|caf)(\?.*)?$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|qt)(\?.*)?$/i;

/**
 * Check whether a pasted URL matches the expected file type for a media field.
 * Returns a translation key (under `profileSettings.warnings`) if the URL looks
 * wrong, or undefined if it's fine. Only warns when the value looks like a URL —
 * empty/non-URL values return undefined.
 */
function getMediaMismatchWarningKey(value: string, accept: string | undefined): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Only check if it looks like a URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return undefined;

  // Blossom-style URLs (hex hash path) are always fine — type can't be determined from URL
  if (/^https?:\/\/.+\/[0-9a-f]{64}(\.\w+)?$/i.test(trimmed)) return undefined;

  // Check if URL has a recognizable file extension at all
  const hasAudioExt = AUDIO_EXT.test(trimmed);
  const hasImageExt = IMAGE_EXT.test(trimmed);
  const hasVideoExt = VIDEO_EXT.test(trimmed);
  const hasKnownExt = hasAudioExt || hasImageExt || hasVideoExt;

  if (accept === 'audio/*') {
    if (hasKnownExt && !hasAudioExt) return 'profileSettings.warnings.audioWrongType';
    if (!hasKnownExt) return 'profileSettings.warnings.audioUnknown';
  }

  if (accept === 'image/*') {
    if (hasKnownExt && !hasImageExt) return 'profileSettings.warnings.imageWrongType';
    if (!hasKnownExt) return 'profileSettings.warnings.imageUnknown';
  }

  if (accept === 'video/*') {
    if (hasKnownExt && !hasVideoExt) return 'profileSettings.warnings.videoWrongType';
    if (!hasKnownExt) return 'profileSettings.warnings.videoUnknown';
  }

  return undefined;
}

/** Infer a file-accept filter from an existing field's value URL. */
function inferAcceptFromValue(value: string): string | undefined {
  if (/\.(mp3|mpga|ogg|oga|wav|flac|aac|m4a|opus|weba|webm|spx|caf)(\?.*)?$/i.test(value)) return 'audio/*';
  if (/\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(value)) return 'image/*';
  if (/\.(mp4|webm|mov|qt)(\?.*)?$/i.test(value)) return 'video/*';
  return undefined;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const formSchema = n.metadata().extend({
  fields: z.array(z.object({
    label: z.string(),
    value: z.string(),
    type: z.enum(['text', 'wallet', 'media']),
    /** Client-side only — file accept filter for the file picker (not persisted). */
    accept: z.string().optional(),
    /** Client-side only — placeholder text for the value input (not persisted). */
    placeholder: z.string().optional(),
  })).optional(),
});

type FormValues = z.infer<typeof formSchema>;

type CropState = {
  imageSrc: string;
  aspect: number;
  field: 'picture' | 'banner';
  title: string;
};

// ── Sortable field row ─────────────────────────────────────────────────────

interface SortableFieldRowProps {
  id: string;
  index: number;
  type: 'text' | 'wallet' | 'media';
  accept?: string;
  valuePlaceholder?: string;
  isUploading?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  onRemove: () => void;
  onMediaPick: () => void;
  onTickerChange: (ticker: string) => void;
}

function SortableFieldRow({ id, index, type, accept, valuePlaceholder, isUploading: fieldUploading, control, onRemove, onMediaPick, onTickerChange }: SortableFieldRowProps) {
  const { t } = useTranslation();
  const formatHint = type === 'media' ? getFormatHintForAccept(accept) : undefined;

  return (
    <SortableItem id={id} className="items-start" gripClassName="w-6 h-9">
      <div className="grid grid-cols-[1fr,2fr,auto] gap-2 items-start">
      {/* Label column — varies by type */}
      {type === 'wallet' ? (
        <FormField
          control={control}
          name={`fields.${index}.label`}
          render={({ field }) => (
            <FormItem>
              <Select value={field.value} onValueChange={(v) => { field.onChange(v); onTickerChange(v); }}>
                <FormControl>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('profileSettings.fields.tickerPlaceholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {WALLET_TICKERS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={control}
          name={`fields.${index}.label`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder={t('profileSettings.fields.labelPlaceholder')} {...field} className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Value column — media gets upload button with tooltip, others get text input */}
      {type === 'media' ? (
        <FormField
          control={control}
          name={`fields.${index}.value`}
          render={({ field }) => {
            const warningKey = getMediaMismatchWarningKey(field.value, accept);
            return (
              <FormItem>
                <div className="flex gap-1.5">
                  <FormControl>
                    <Input placeholder={valuePlaceholder || t('profileSettings.fields.mediaPlaceholder')} {...field} className="h-9 flex-1 min-w-0" readOnly={false} />
                  </FormControl>
                  {fieldUploading ? (
                    <div className="flex items-center justify-center h-9 w-9 shrink-0">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={onMediaPick}
                        >
                          <Upload className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-52">
                        {formatHint ? (
                          <span>{t('profileSettings.fields.chooseFile')}<br /><span className="text-muted-foreground">{formatHint}</span></span>
                        ) : (
                          <span>{t('profileSettings.fields.chooseMediaFile')}</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {warningKey && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500 mt-1 leading-snug">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>{t(warningKey)}</span>
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />
      ) : (
        <FormField
          control={control}
          name={`fields.${index}.value`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder={type === 'wallet' ? t('profileSettings.fields.addressPlaceholder') : t('profileSettings.fields.valuePlaceholder')} {...field} className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Delete button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-9 w-9 text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
      </div>
    </SortableItem>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileSettings() {
  const { t } = useTranslation();
  const { user, metadata, event } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const { presets, customPreset } = useFieldPresets();

  const [cropState, setCropState] = useState<CropState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [uploadingFieldIndex, setUploadingFieldIndex] = useState<number>(-1);

  useSeoMeta({
    title: `${t('profileSettings.seoTitle')} | ${config.appName}`,
    description: t('profileSettings.seoDescription', { appName: config.appName }),
  });

  // Parse existing custom fields from raw event
  const parseFields = (): Array<{ label: string; value: string; type: 'text' | 'wallet' | 'media'; accept?: string }> => {
    if (!event) return [];
    try {
      const parsed = JSON.parse(event.content);
      if (Array.isArray(parsed.fields)) {
        return parsed.fields
          .filter((f: unknown) => Array.isArray(f) && f.length >= 2)
          .map((f: string[]) => {
            const type = inferFieldType(f[0], f[1]);
            // Ensure wallet labels carry the $ prefix so the Select value matches (e.g. "BTC" → "$BTC")
            const label = type === 'wallet' && !f[0].startsWith('$')
              ? `$${f[0].toUpperCase()}`
              : f[0];
            const accept = type === 'media' ? inferAcceptFromValue(f[1]) : undefined;
            return { label, value: f[1], type, accept };
          });
      }
    } catch { /* ignore */ }
    return [];
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', about: '', picture: '', banner: '',
      website: '', nip05: '', lud16: '', bot: false, fields: [],
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, append, remove, move } = useFieldArray({ control: form.control as any, name: 'fields' });

  const handleFieldReorder = useCallback((reordered: typeof fields) => {
    // Map reordered items back to move() calls by finding the first mismatch
    const oldIndex = fields.findIndex((f, i) => f.id !== reordered[i]?.id);
    if (oldIndex === -1) return;
    const newIndex = reordered.findIndex((f) => f.id === fields[oldIndex].id);
    if (newIndex === -1) return;
    move(oldIndex, newIndex);
  }, [fields, move]);

  // Media field upload — dynamic accept attribute per field
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaIndex = useRef<number>(-1);
  const handleMediaPick = (index: number) => {
    pendingMediaIndex.current = index;
    // Dynamically set the accept attribute based on the field's preset
    const fieldAccept = form.getValues(`fields.${index}.accept`);
    if (mediaInputRef.current) {
      mediaInputRef.current.accept = fieldAccept || 'image/*,video/*,audio/*';
    }
    mediaInputRef.current?.click();
  };
  const handleMediaFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const index = pendingMediaIndex.current;
    if (index < 0) return;
    setUploadingFieldIndex(index);
    try {
      const [[, url]] = await uploadFile(file);
      form.setValue(`fields.${index}.value`, url, { shouldDirty: true });
      toast({ title: t('profileSettings.toast.uploaded'), description: t('profileSettings.toast.mediaUploaded') });
    } catch {
      toast({ title: t('profileSettings.toast.uploadFailed'), description: t('profileSettings.toast.tryAgain'), variant: 'destructive' });
    } finally {
      setUploadingFieldIndex(-1);
    }
  };

  useEffect(() => {
    if (metadata) {
      form.reset({
        name: metadata.name ?? '',
        about: metadata.about ?? '',
        picture: metadata.picture ?? '',
        banner: metadata.banner ?? '',
        website: metadata.website ?? '',
        nip05: metadata.nip05 ?? '',
        lud16: metadata.lud16 ?? '',
        bot: metadata.bot ?? false,
        fields: parseFields(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, event]);

  // Live values for the card preview
  const watched = form.watch();
  const cardMetadata: Partial<NostrMetadata> = {
    name: watched.name,
    about: watched.about,
    picture: watched.picture,
    banner: watched.banner,
    website: watched.website,
    nip05: watched.nip05,
    lud16: watched.lud16,
    bot: watched.bot,
  };

  // Live sidebar preview fields — computed from watched form values
  const previewFields = useMemo(() => {
    const result: Array<{ label: string; value: string }> = [];
    // Add website if present
    if (watched.website?.trim()) {
      result.push({ label: t('profileSettings.fields.website'), value: watched.website.trim() });
    }
    // Add custom fields that have both label and value
    if (watched.fields) {
      for (const f of watched.fields) {
        if (f.label.trim() && f.value.trim()) {
          result.push({ label: f.label, value: f.value });
        }
      }
    }
    return result;
  }, [watched.website, watched.fields, t]);

  // Card onChange: patch individual fields
  const handleCardChange = (patch: Partial<NostrMetadata>) => {
    for (const [k, v] of Object.entries(patch)) {
      form.setValue(k as keyof FormValues, v as string, { shouldDirty: true });
    }
  };

  // Image pick: open crop dialog
  const pickInputRef = useRef<HTMLInputElement>(null);
  const pendingField = useRef<'picture' | 'banner'>('picture');

  const handlePickImage = (field: 'picture' | 'banner') => {
    pendingField.current = field;
    pickInputRef.current?.click();
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const field = pendingField.current;
    setCropState({
      imageSrc: URL.createObjectURL(file),
      aspect: field === 'picture' ? 1 : 3,
      field,
      title: field === 'picture' ? t('profileSettings.crop.profile') : t('profileSettings.crop.banner'),
    });
  };

  const handleCropConfirm = async (file: File) => {
    if (!cropState) return;
    const { field, imageSrc } = cropState;
    URL.revokeObjectURL(imageSrc);
    setCropState(null);
    try {
      const [[, url]] = await uploadFile(file);
      form.setValue(field, url, { shouldDirty: true });
      toast({ title: t('profileSettings.toast.uploaded'), description: field === 'picture' ? t('profileSettings.toast.profilePictureUpdated') : t('profileSettings.toast.bannerUpdated') });
    } catch {
      toast({ title: t('profileSettings.toast.uploadFailed'), description: t('profileSettings.toast.tryAgain'), variant: 'destructive' });
    }
  };

  const handleCropCancel = () => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  };

  // Handle adding a field from a preset
  const handleAddPreset = (preset: FieldPreset) => {
    append({
      label: preset.defaultLabel,
      value: '',
      type: preset.type,
      accept: preset.accept,
      placeholder: preset.valuePlaceholder,
    });
  };

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    try {
      const { fields: customFields, ...standardMetadata } = values;
      const data: Record<string, unknown> = { ...metadata, ...standardMetadata };

      // Strip any legacy avatar shape from old Ditto-style profiles
      delete data.shape;

      for (const key in data) {
        if (data[key] === '') delete data[key];
      }
      if (customFields && customFields.length > 0) {
        const nonEmpty = customFields.filter((f) => f.label.trim() && f.value.trim());
        if (nonEmpty.length > 0) data.fields = nonEmpty.map((f) => [f.label, f.value]);
      }
      await publishEvent({ kind: 0, content: JSON.stringify(data) });
      queryClient.invalidateQueries({ queryKey: ['logins'] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });
      toast({ title: t('profileSettings.toast.profileSaved') });
    } catch {
      toast({ title: t('common.error'), description: t('profileSettings.toast.saveFailed'), variant: 'destructive' });
    }
  };

  if (!user) return <Navigate to="/settings" replace />;

  const busy = isPending || isUploading;

  return (
    <main className="min-h-screen">
      {/* Hidden file input for avatar/banner */}
      <input
        ref={pickInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
      />
      {/* Hidden file input for media fields — accept is set dynamically */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={handleMediaFileChosen}
      />

      {/* Crop dialog */}
      {cropState && (
        <ImageCropDialog
          open
          imageSrc={cropState.imageSrc}
          aspect={cropState.aspect}
          title={cropState.title}
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
        />
      )}

      {/* Header */}
      <PageHeader
        title={t('profileSettings.header.title')}
        backTo="/settings"
        alwaysShowBack
        contentClassName="max-w-xl mx-auto w-full"
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight">{t('profileSettings.header.title')}</h1>
          </div>
        }
      >
        <Button type="submit" form="profile-settings-form" size="sm" className="shrink-0 rounded-full font-bold px-5" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : t('profileSettings.header.save')}
        </Button>
      </PageHeader>

      <Form {...form}>
        <form id="profile-settings-form" onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl mx-auto px-4 pt-4 pb-10 space-y-6">

          {/* Interactive profile card */}
          <ProfileCard
            pubkey={user.pubkey}
            metadata={cardMetadata}
            onChange={handleCardChange}
            onPickImage={handlePickImage}
            onRemoveAvatar={() => form.setValue('picture', '', { shouldDirty: true })}
            showBadges={false}
          />

          {isUploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('profileSettings.uploading')}
            </div>
          )}

          {/* Profile fields */}
          <div>
            <h2 className="text-sm font-medium py-2 flex items-center gap-1">
              {t('profileSettings.fields.heading')}
              <HelpTip faqId="profile-fields" iconSize="size-3.5" />
            </h2>

            <div className="space-y-3 pt-1">
              {/* Website — always first */}
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <div className="grid grid-cols-[auto,1fr,2fr,auto] gap-2 items-center">
                    <div className="w-6" />
                    <div className="flex items-center h-9 px-3 text-sm text-muted-foreground">
                      <span>{t('profileSettings.fields.website')}</span>
                    </div>
                    <Input placeholder={t('profileSettings.fields.websitePlaceholder')} {...field} className="h-9" />
                    <div className="size-9" />
                  </div>
                )}
              />

              {/* Lightning address */}
              <FormField
                control={form.control}
                name="lud16"
                render={({ field }) => (
                  <div className="grid grid-cols-[auto,1fr,2fr,auto] gap-2 items-center">
                    <div className="w-6" />
                    <div className="flex items-center h-9 px-3 text-sm text-muted-foreground gap-1">
                      <span>{t('profileSettings.fields.lightning')}</span>
                      <HelpTip faqId="what-are-zaps" iconSize="size-3.5" />
                    </div>
                    <Input placeholder={t('profileSettings.fields.lightningPlaceholder')} {...field} className="h-9" />
                    <div className="size-9" />
                  </div>
                )}
              />

              <SortableList
                items={fields}
                getItemId={(field) => field.id}
                onReorder={handleFieldReorder}
                className="space-y-3"
                renderItem={(field, index) => (
                  <SortableFieldRow
                    key={field.id}
                    id={field.id}
                    index={index}
                    type={form.watch(`fields.${index}.type`) ?? 'text'}
                    accept={form.watch(`fields.${index}.accept`)}
                    valuePlaceholder={form.watch(`fields.${index}.placeholder`)}
                    isUploading={uploadingFieldIndex === index}
                    control={form.control}
                    onRemove={() => remove(index)}
                    onMediaPick={() => handleMediaPick(index)}
                    onTickerChange={(ticker) => form.setValue(`fields.${index}.label`, ticker, { shouldDirty: true })}
                  />
                )}
              />

              {/* Add field — visible pill buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[...presets, customPreset].map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <Tooltip key={preset.id}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-3 text-xs gap-1.5"
                          onClick={() => handleAddPreset(preset)}
                        >
                          <Plus className="size-3 text-muted-foreground" />
                          <Icon className="size-3.5 text-muted-foreground" />
                          {preset.label}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {preset.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Mobile sidebar preview — visible only below widgets where the real sidebar is hidden */}
          <div className="lg:hidden">
            <Collapsible open={showMobilePreview} onOpenChange={setShowMobilePreview}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent hover:text-foreground">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Eye className="size-3.5" />
                    {t('profileSettings.mobilePreview')}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="rounded-xl border bg-card/50 overflow-hidden">
                  <ProfileRightSidebar
                    fields={previewFields}
                    className="relative w-full flex flex-col h-auto max-h-[60vh] overflow-y-auto"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Advanced */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent hover:text-foreground">
                <span className="text-sm font-medium">{t('profileSettings.advanced.heading')}</span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              <FormField
                control={form.control}
                name="bot"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-sm">{t('profileSettings.advanced.botLabel')}</FormLabel>
                      <FormDescription className="text-xs">{t('profileSettings.advanced.botDescription')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Your Key — private-key backup. Rendered inside Advanced but is not part of the form. */}
              <div className="pt-2">
                <BackupKeySection />
              </div>

              {/* Wallet seed phrase — same secret material reachable as a
                  BIP-39 mnemonic for importing the Bitcoin wallet into
                  other wallet apps. Only shown for nsec logins (the
                  component renders null otherwise). */}
              <div className="pt-4 border-t">
                <WalletBackupMnemonic />
              </div>
            </CollapsibleContent>
          </Collapsible>

        </form>
      </Form>
    </main>
  );
}

// ── Backup Key section ────────────────────────────────────────────────────────

function BackupKeySection() {
  const { t } = useTranslation();
  const { logins } = useNostrLogin();
  const { config } = useAppContext();
  const { toast } = useToast();
  const current = logins[0];

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const heading = (
    <div className="flex items-center gap-2 pb-1">
      <KeyRound className="size-4 text-primary" />
      <h2 className="text-sm font-semibold">{t('profileSettings.key.heading')}</h2>
    </div>
  );

  // Not applicable for extension / bunker logins — key isn't available in Ditto.
  if (!current) return null;

  if (current.type === 'extension') {
    return (
      <div>
        {heading}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('profileSettings.key.extensionBody')}
        </p>
      </div>
    );
  }

  if (current.type === 'bunker') {
    return (
      <div>
        {heading}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('profileSettings.key.bunkerBody', { appName: config.appName })}
        </p>
      </div>
    );
  }

  if (current.type !== 'nsec') {
    // Unknown future login type — don't guess.
    return null;
  }

  const nsec = current.data.nsec;
  const npub = nip19.npubEncode(current.pubkey);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(nsec);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: t('profileSettings.key.copyFailed'),
        description: t('profileSettings.key.copyFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleBackup = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveNsec(npub, nsec, config.appName);
      if (result === 'saved-to-file') {
        toast({
          title: t('profileSettings.key.saved'),
          description: t('profileSettings.key.savedToFile'),
        });
      } else if (result === 'saved') {
        toast({ title: t('profileSettings.key.saved') });
      }
      // 'dismissed' is a deliberate user choice — no toast.
    } catch {
      toast({
        title: t('profileSettings.key.saveFailed'),
        description: t('profileSettings.key.saveFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {heading}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t('profileSettings.key.explainer', { appName: config.appName })}
      </p>

      <div className="relative">
        <Input
          type={showKey ? 'text' : 'password'}
          value={nsec}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="pr-20 font-mono text-base md:text-sm"
          aria-label={t('profileSettings.key.aria')}
        />
        <div className="absolute right-0 top-0 h-full flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-full px-2 hover:bg-transparent"
            onClick={handleCopy}
            aria-label={t('profileSettings.key.copyAria')}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-full px-2 hover:bg-transparent"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? t('profileSettings.key.hideAria') : t('profileSettings.key.revealAria')}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      {showKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
            {t('profileSettings.key.warning')}
          </p>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full gap-2 rounded-full h-12"
        onClick={handleBackup}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> {t('profileSettings.key.saving')}
          </>
        ) : (
          <>
            <Download className="w-4 h-4" /> {t('profileSettings.key.backupButton')}
          </>
        )}
      </Button>
    </div>
  );
}
