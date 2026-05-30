import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Bitcoin,
  Download,
  Eye,
  EyeOff,
  HandCoins,
  Link2,
  Loader2,
  Megaphone,
  Upload,
  User,
  X,
} from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

import { AgoraBoltIcon } from '@/components/icons/AgoraBoltIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useOnboarding, type OnboardingRole } from '@/contexts/onboardingContextDef';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { downloadTextFile } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

/**
 * Step state machine for the captive signup flow.
 *
 * Order:
 *   keygen → secure → profile → role
 *
 * Four screens total. The old flow had a separate "wallet-coupling explainer"
 * step and a separate "outro" celebration screen; both were folded in. The
 * coupling explainer was redundant with `secure` (both screens are about the
 * key), so the secure step now carries the "this key is your account AND
 * your wallet" framing inline. The outro was a glorified tap-to-continue —
 * the role step's primary button already navigates somewhere meaningful, so
 * the role pick *is* the outro.
 *
 * Login is handled by the existing `AuthDialog` modal — the captive flow is
 * only ever opened by an explicit `startSignup()` call (e.g. from
 * AuthDialog's "Create a new Nostr account" button), so the user has
 * already picked "signup" by the time we mount.
 */
type Step = 'keygen' | 'secure' | 'profile' | 'role';

const STEPS: Step[] = ['keygen', 'secure', 'profile', 'role'];

/**
 * The captive onboarding gate. Render this as a sibling of `<AppRouter />`;
 * it renders nothing when inactive and a fullscreen `fixed inset-0 z-50`
 * overlay when `useOnboarding().active === true`.
 *
 * The flow guides a brand-new user through:
 *   1. Key generation
 *   2. Save the nsec (with inline wallet-coupling framing)
 *   3. Optional profile metadata (kind 0)
 *   4. Role pick — primary CTA navigates by intent: creator → /campaigns/new,
 *      donor → / (campaign grid)
 *
 * The overlay sits above all app chrome and cannot be dismissed by clicking
 * outside; users must either complete the flow or use the explicit Close (X)
 * button in the top-right corner.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { active } = useOnboarding();

  return (
    <>
      {children}
      {active && <CaptiveOverlay />}
    </>
  );
}

/** Inner overlay component — only mounted while the flow is active so the
 *  per-flow state resets cleanly between sessions. */
function CaptiveOverlay() {
  const { t } = useTranslation();
  const { cancel, role: contextRole, setRole: setContextRole } = useOnboarding();
  const navigate = useNavigate();
  const { toast } = useToast();
  const login = useLoginActions();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending: isPublishingProfile } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploadingAvatar } = useUploadFile();

  // Decide the entry step. Already-authenticated users (e.g. a CTA called
  // startSignup() on a logged-in surface to walk them to the role picker)
  // skip keygen / secure / profile and land on `role` directly.
  const initialStep: Step = useMemo(() => {
    if (user) return 'role';
    return 'keygen';
  }, [user]);

  const [step, setStep] = useState<Step>(initialStep);

  // Signup state
  const [nsec, setNsec] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [profileData, setProfileData] = useState({ name: '', about: '', picture: '' });
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Linear progress bar position. Every step in the machine counts toward
  // the bar — there's no longer a non-funnel "welcome" step to skip.
  const currentProgressIndex = STEPS.indexOf(step);
  const progress = currentProgressIndex < 0
    ? 0
    : ((currentProgressIndex + 1) / STEPS.length) * 100;

  // Navigation helpers ------------------------------------------------------
  const goTo = useCallback((target: Step) => {
    setStep(target);
  }, []);

  // Role pick is the final step. Picking a role both records the choice
  // (used by the role-pick CTA labels) and navigates to the matching
  // surface: creator → campaign-creation form, donor → full campaign grid
  // (`/campaigns`, not `/`, so they land on the browse-everything view
  // rather than the curated home with its own marketing hero). No separate
  // outro / celebration screen.
  const handleRolePick = useCallback(
    (next: 'creator' | 'donor') => {
      setContextRole(next);
      cancel();
      if (next === 'creator') {
        navigate('/campaigns/new');
      } else {
        navigate('/campaigns');
      }
    },
    [setContextRole, cancel, navigate],
  );

  // Key generation ----------------------------------------------------------
  const handleGenerateKey = useCallback(() => {
    setIsGenerating(true);
    // Brief visible spinner — the generation itself is instantaneous, but
    // an instant transition feels too "did anything happen?" given the
    // weight of what just got created.
    setTimeout(() => {
      const sk = generateSecretKey();
      setNsec(nip19.nsecEncode(sk));
      setIsGenerating(false);
      goTo('secure');
    }, 700);
  }, [goTo]);

  // Download + install nsec into the login store ---------------------------
  const handleDownloadAndContinue = useCallback(async () => {
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
      const pubkey = getPublicKey(decoded.data);
      const npub = nip19.npubEncode(pubkey);
      const filename = `nostr-${location.hostname.replaceAll(/\./g, '-')}-${npub.slice(5, 9)}.nsec.txt`;
      await downloadTextFile(filename, nsec);
      login.nsec(nsec);
      goTo('profile');
    } catch {
      toast({
        title: t('onboarding.secure.downloadFailedTitle'),
        description: t('onboarding.secure.downloadFailedDescription'),
        variant: 'destructive',
      });
    }
  }, [nsec, login, goTo, toast, t]);

  // Avatar upload (profile step) -------------------------------------------
  const handleAvatarUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      if (!file.type.startsWith('image/')) {
        toast({ title: t('onboarding.profile.imageOnly'), variant: 'destructive' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: t('onboarding.profile.imageTooLarge'), variant: 'destructive' });
        return;
      }

      try {
        const tags = await uploadFile(file);
        const url = tags[0]?.[1];
        if (url) setProfileData((prev) => ({ ...prev, picture: url }));
      } catch {
        toast({ title: t('onboarding.profile.uploadFailed'), variant: 'destructive' });
      }
    },
    [uploadFile, toast, t],
  );

  // Profile publish ---------------------------------------------------------
  const finishProfile = useCallback(
    async (skip: boolean) => {
      try {
        if (!skip && (profileData.name || profileData.about || profileData.picture)) {
          const metadata: Record<string, string> = {};
          if (profileData.name) metadata.name = profileData.name;
          if (profileData.about) metadata.about = profileData.about;
          if (profileData.picture) metadata.picture = profileData.picture;
          await publishEvent({ kind: 0, content: JSON.stringify(metadata) });
        }
      } catch {
        toast({
          title: t('onboarding.profile.publishFailedTitle'),
          description: t('onboarding.profile.publishFailedDescription'),
          variant: 'destructive',
        });
      } finally {
        goTo('role');
      }
    },
    [profileData, publishEvent, toast, t, goTo],
  );

  // Step renderer -----------------------------------------------------------
  const stepBody = (() => {
    switch (step) {
      case 'keygen':
        // First step. Back closes the captive flow entirely — the user got
        // here from the AuthDialog and already chose "signup".
        return (
          <KeygenStep
            isGenerating={isGenerating}
            onGenerate={handleGenerateKey}
            onBack={cancel}
          />
        );
      case 'secure':
        return (
          <SecureStep
            nsec={nsec}
            showKey={showKey}
            onToggleShow={() => setShowKey((v) => !v)}
            onContinue={handleDownloadAndContinue}
            onBack={() => goTo('keygen')}
          />
        );
      case 'profile':
        return (
          <ProfileStep
            data={profileData}
            isPublishing={isPublishingProfile}
            isUploading={isUploadingAvatar}
            onChange={(patch) => setProfileData((prev) => ({ ...prev, ...patch }))}
            onUploadClick={() => avatarInputRef.current?.click()}
            avatarInputRef={avatarInputRef}
            onAvatarChange={handleAvatarUpload}
            onFinish={() => finishProfile(false)}
            onSkip={() => finishProfile(true)}
          />
        );
      case 'role':
        // Final step. Picking a role navigates to the matching surface
        // (creator → /campaigns/new, donor → /); Back goes to profile if
        // the user signed up through the full flow, or cancels the overlay
        // if they were already-authenticated and landed here directly.
        return (
          <RoleStep
            role={contextRole}
            onPick={handleRolePick}
            onBack={user ? cancel : () => goTo('profile')}
          />
        );
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.ariaLabel')}
    >
      {/* Progress bar — every step in the flow counts toward it. */}
      <div className="sticky top-0 z-10 h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Top-right close. Lets users escape if they truly don't want to
          continue — but it's deliberately unobtrusive vs. a backdrop click
          so casual taps don't drop them out of the flow. */}
      <button
        type="button"
        onClick={cancel}
        aria-label={t('onboarding.close')}
        className="absolute right-4 top-4 sm:right-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex-1 flex items-start sm:items-center justify-center px-6 pt-16 pb-12">
        <div
          key={step}
          className="w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          {stepBody}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Step components
// =============================================================================

interface RoleStepProps {
  role: OnboardingRole;
  onPick: (role: 'creator' | 'donor') => void;
  onBack: () => void;
}

/**
 * Two-card role picker, modeled on the Treasures CreateCacheLanding pattern.
 * Both cards use primary-tinted icon chips (both roles are first-class) and
 * the three-line "title / what you do / what the other side sees"
 * structure that makes the choice feel like a role rather than a feature
 * menu.
 */
function RoleStep({ role, onPick, onBack }: RoleStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('onboarding.role.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.role.subtitle')}</p>
      </div>

      <div className="space-y-3">
        <RoleCard
          icon={<Megaphone className="h-5 w-5 md:h-6 md:w-6 text-primary" />}
          title={t('onboarding.role.creator.title')}
          description={t('onboarding.role.creator.description')}
          finderNote={t('onboarding.role.creator.finderNote')}
          selected={role === 'creator'}
          onClick={() => onPick('creator')}
        />
        <RoleCard
          icon={<HandCoins className="h-5 w-5 md:h-6 md:w-6 text-primary" />}
          title={t('onboarding.role.donor.title')}
          description={t('onboarding.role.donor.description')}
          finderNote={t('onboarding.role.donor.finderNote')}
          selected={role === 'donor'}
          onClick={() => onPick('donor')}
        />
      </div>

      <BackButton onClick={onBack} />
    </div>
  );
}

interface RoleCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  finderNote: string;
  selected: boolean;
  onClick: () => void;
}

/** A single role card. Three text lines, primary-tinted icon chip, hover and
 *  selected states matching the Treasures pattern. */
function RoleCard({ icon, title, description, finderNote, selected, onClick }: RoleCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border bg-card p-5 md:p-6 transition-all',
        'hover:border-primary/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        selected && 'border-primary shadow-md ring-1 ring-primary',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm md:text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{description}</p>
          <p className="text-xs md:text-sm font-medium text-primary mt-1.5">{finderNote}</p>
        </div>
        <ArrowRight className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0 mt-1 rtl:rotate-180" />
      </div>
    </button>
  );
}

interface KeygenStepProps {
  isGenerating: boolean;
  onGenerate: () => void;
  onBack: () => void;
}

/** Key generation step — a single CTA that fires off `generateSecretKey()`
 *  with a brief visible spinner for tactile feedback. */
function KeygenStep({ isGenerating, onGenerate, onBack }: KeygenStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 text-center">
      <div className="relative w-24 h-24 mx-auto">
        {isGenerating ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-14 h-14 text-primary animate-spin" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <AgoraBoltIcon className="size-20 drop-shadow-md" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {isGenerating ? t('onboarding.keygen.generatingTitle') : t('onboarding.keygen.title')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isGenerating ? t('onboarding.keygen.generatingDescription') : t('onboarding.keygen.description')}
        </p>
      </div>
      {!isGenerating && (
        <Button onClick={onGenerate} className="w-full h-12 text-base rounded-full">
          {t('onboarding.keygen.button')}
        </Button>
      )}
      {!isGenerating && <BackButton onClick={onBack} />}
    </div>
  );
}

interface SecureStepProps {
  nsec: string;
  showKey: boolean;
  onToggleShow: () => void;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * Reveals + downloads the nsec, then installs it into the login store and
 * advances.
 *
 * Three stacked elements communicate the weight of saving the key:
 *   1. The key itself (revealable input + download button).
 *   2. A "your account and your wallet share this key" coupling callout —
 *      large linked icons make the relationship the visual centerpiece.
 *   3. A no-recovery emphasis block — calm, informational tone (not a red
 *      destructive alert) but typographically dominant so the user can't
 *      breeze past the "there is no way to get this back" point.
 *
 * This is the only captive-flow surface that explains the coupling and the
 * permanence to brand-new users, so it has to carry weight without scaring
 * them.
 */
function SecureStep({ nsec, showKey, onToggleShow, onContinue, onBack }: SecureStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('onboarding.secure.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.secure.subtitle')}</p>
      </div>

      <div className="relative">
        <Input
          type={showKey ? 'text' : 'password'}
          value={nsec}
          readOnly
          className="pr-10 font-mono text-sm"
          aria-label="Secret key"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={onToggleShow}
        >
          {showKey ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Single coupling+permanence card. The linked-icon visual at the
          top communicates "your account and your wallet share this key";
          the typographically heavier line below it makes the no-recovery
          point inescapable without resorting to red/warning iconography.
          Both messages live in one card so the user can't skim past
          either. */}
      <div className="rounded-xl bg-primary/10 border-2 border-primary/30 p-5 space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-background ring-2 ring-primary/30 flex items-center justify-center shadow-sm">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="w-14 h-14 rounded-full bg-background ring-2 ring-primary/30 flex items-center justify-center shadow-sm">
            <Bitcoin className="h-7 w-7 text-primary" />
          </div>
        </div>
        <p className="text-sm text-foreground text-center leading-relaxed">
          {t('onboarding.secure.couplingNote')}
        </p>
        <div className="border-t border-primary/20 pt-3 text-center">
          <p className="text-base font-bold tracking-tight text-foreground leading-snug">
            {t('onboarding.secure.permanenceHeadline')}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {t('onboarding.secure.permanenceBody')}
          </p>
        </div>
      </div>

      <Button onClick={onContinue} className="w-full h-12 text-base rounded-full">
        <Download className="w-4 h-4 mr-2" />
        {t('onboarding.secure.button')}
      </Button>
      <BackButton onClick={onBack} />
    </div>
  );
}

interface ProfileStepProps {
  data: { name: string; about: string; picture: string };
  isPublishing: boolean;
  isUploading: boolean;
  onChange: (patch: Partial<{ name: string; about: string; picture: string }>) => void;
  onUploadClick: () => void;
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFinish: () => void;
  onSkip: () => void;
}

/** Optional kind-0 metadata — same fields as the legacy AuthDialog profile
 *  step. Publishes only if at least one field is non-empty and the user
 *  doesn't choose to skip. */
function ProfileStep({
  data,
  isPublishing,
  isUploading,
  onChange,
  onUploadClick,
  avatarInputRef,
  onAvatarChange,
  onFinish,
  onSkip,
}: ProfileStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('onboarding.profile.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('onboarding.profile.subtitle')}</p>
      </div>

      <div className={cn('space-y-4', isPublishing && 'opacity-50 pointer-events-none')}>
        <div className="space-y-1.5">
          <label htmlFor="onb-profile-name" className="text-sm font-medium">
            {t('onboarding.profile.nameLabel')}
          </label>
          <Input
            id="onb-profile-name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('onboarding.profile.namePlaceholder')}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="onb-profile-about" className="text-sm font-medium">
            {t('onboarding.profile.aboutLabel')}
          </label>
          <Textarea
            id="onb-profile-about"
            value={data.about}
            onChange={(e) => onChange({ about: e.target.value })}
            placeholder={t('onboarding.profile.aboutPlaceholder')}
            className="resize-none"
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="onb-profile-picture" className="text-sm font-medium">
            {t('onboarding.profile.avatarLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              id="onb-profile-picture"
              value={data.picture}
              onChange={(e) => onChange({ picture: e.target.value })}
              placeholder="https://…"
              className="flex-1"
            />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={avatarInputRef}
              onChange={onAvatarChange}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onUploadClick}
              disabled={isUploading}
              title={t('onboarding.profile.uploadAvatar')}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Button onClick={onFinish} disabled={isPublishing} className="w-full h-12 rounded-full">
          {isPublishing ? t('onboarding.profile.saving') : t('onboarding.profile.finish')}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={isPublishing} className="w-full">
          {t('onboarding.profile.skip')}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Shared bits
// =============================================================================

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 py-2"
    >
      <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
      {t('onboarding.back')}
    </button>
  );
}
