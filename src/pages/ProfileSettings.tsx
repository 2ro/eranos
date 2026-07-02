import { useSeoMeta } from '@unhead/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, ChevronDown,
  Eye, EyeOff, Copy, Check, Download, KeyRound,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useNostrLogin } from '@nostrify/react/login';

import { saveNsec } from '@/lib/credentialManager';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';

import { ProfileCard } from '@/components/ProfileCard';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { PageHeader } from '@/components/PageHeader';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';

import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Form } from '@/components/ui/form';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ── Constants ─────────────────────────────────────────────────────────────────

const WALLET_TICKERS = [
  '$BTC', '$ETH', '$SOL', '$XMR', '$LTC', '$DOGE', '$ADA', '$DOT', '$XRP', '$MATIC',
] as const;

/** Bare tickers used only for detection (strips leading $). */
const BARE_TICKERS = WALLET_TICKERS.map((t) => t.slice(1));

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

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileSettings() {
  const { t } = useTranslation();
  const { user, metadata, event } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const [cropState, setCropState] = useState<CropState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

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
      website: '', nip05: '', bot: false, fields: [],
    },
  });

  useEffect(() => {
    if (metadata) {
      form.reset({
        name: metadata.name ?? '',
        about: metadata.about ?? '',
        picture: metadata.picture ?? '',
        banner: metadata.banner ?? '',
        website: metadata.website ?? '',
        nip05: metadata.nip05 ?? '',
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

      {/* Crop dialog */}
      {cropState && (
        <ImageCropDialog
          open
          imageSrc={cropState.imageSrc}
          aspect={cropState.aspect}
          showCircleGuide={cropState.field === 'picture'}
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
            onRemoveBanner={() => form.setValue('banner', '', { shouldDirty: true })}
            showBadges={false}
          />

          {isUploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('profileSettings.uploading')}
            </div>
          )}

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
              {/* Your Key — private-key backup. Rendered inside Advanced but is not part of the form. */}
              <div className="pt-2">
                <BackupKeySection />
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
