import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bitcoin,
  Download,
  Eye,
  EyeOff,
  HandCoins,
  Link2,
  Loader2,
  Megaphone,
  User,
  X,
} from 'lucide-react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

import { AgoraBoltIcon } from '@/components/icons/AgoraBoltIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useOnboarding, type OnboardingRole } from '@/contexts/onboardingContextDef';
import { useToast } from '@/hooks/useToast';
import { downloadTextFile } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';

/**
 * Step state machine for the captive signup flow.
 *
 * Order:
 *   keygen → secure → role
 *
 * Three screens total. The old flow had a separate "wallet-coupling explainer"
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
type Step = 'keygen' | 'secure' | 'role';

const SIGNUP_STEPS: Step[] = ['keygen', 'secure', 'role'];

/**
 * The captive onboarding gate. Render this as a sibling of `<AppRouter />`;
 * it renders nothing when inactive and a fullscreen `fixed inset-0 z-50`
 * overlay when `useOnboarding().active === true`.
 *
 * The flow guides a brand-new user through:
 *   1. Key generation
 *   2. Save the nsec (with inline wallet-coupling framing)
 *   3. Role pick — primary CTA navigates by intent: creator → /campaigns/new,
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

  // Decide the entry step.
  // - Already-authenticated users normally land on `role` directly.
  const initialStep: Step = useMemo(() => {
    if (user) return 'role';
    return 'keygen';
  }, [user]);

  const [step, setStep] = useState<Step>(initialStep);

  // Signup state
  const [nsec, setNsec] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Linear progress bar position. Every step in the machine counts toward
  // the bar.
  const currentProgressIndex = SIGNUP_STEPS.indexOf(step);
  const progress = currentProgressIndex < 0
    ? 0
    : ((currentProgressIndex + 1) / SIGNUP_STEPS.length) * 100;

  // Navigation helpers ------------------------------------------------------
  const goTo = useCallback((target: Step) => {
    setStep(target);
  }, []);

  const showBackButton = !(step === 'keygen' && isGenerating);
  const handleBack = useCallback(() => {
    if (step === 'keygen') {
      cancel();
    } else if (step === 'secure') {
      goTo('keygen');
    } else {
      if (user) cancel();
      else goTo('secure');
    }
  }, [step, user, cancel, goTo]);

  // Role pick is the final step for creator/donor. Picking a role both
  // records the choice (used by the role-pick CTA labels) and navigates to
  // the matching surface: creator → campaign-creation form, donor → full
  // campaign grid (`/campaigns`, not `/`, so they land on the
  // browse-everything view rather than the curated home with its own
  // marketing hero). The verifier role does not navigate away — it branches
  // into the captive verifier sub-flow (wired up in a later step); for now
  // it routes to the public /organizations onboarding tool.
  const handleRolePick = useCallback(
    (next: 'creator' | 'donor' | 'verifier') => {
      setContextRole(next);
      cancel();
      if (next === 'creator') {
        navigate('/campaigns/new');
      } else if (next === 'verifier') {
        navigate('/organizations');
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
      goTo('role');
    } catch {
      toast({
        title: t('onboarding.secure.downloadFailedTitle'),
        description: t('onboarding.secure.downloadFailedDescription'),
        variant: 'destructive',
      });
    }
  }, [nsec, login, goTo, toast, t]);

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
          />
        );
      case 'secure':
        return (
          <SecureStep
            nsec={nsec}
            showKey={showKey}
            onToggleShow={() => setShowKey((v) => !v)}
            onContinue={handleDownloadAndContinue}
          />
        );
      case 'role':
        // Final step. Picking a role navigates to the matching surface
        // (creator → /campaigns/new, donor → /); Back goes to secure if the
        // user signed up through the full flow, or cancels the overlay if
        // they were already-authenticated and landed here directly.
        return (
          <RoleStep
            role={contextRole}
            onPick={handleRolePick}
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

      {showBackButton && (
        <button
          type="button"
          onClick={handleBack}
          aria-label={t('common.back')}
          className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}

      {/* Top-right close. Lets users escape if they truly don't want to
          continue — but it's deliberately unobtrusive vs. a backdrop click
          so casual taps don't drop them out of the flow. */}
      <button
        type="button"
        onClick={cancel}
        aria-label={t('onboarding.close')}
        className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
  onPick: (role: 'creator' | 'donor' | 'verifier') => void;
}

/**
 * Two-card role picker, modeled on the Treasures CreateCacheLanding pattern.
 * Both cards use primary-tinted icon chips (both roles are first-class) and
 * the three-line "title / what you do / what the other side sees"
 * structure that makes the choice feel like a role rather than a feature
 * menu.
 */
function RoleStep({ role, onPick }: RoleStepProps) {
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
        <RoleCard
          icon={<BadgeCheck className="h-5 w-5 md:h-6 md:w-6 text-primary" />}
          title={t('onboarding.role.verifier.title')}
          description={t('onboarding.role.verifier.description')}
          finderNote={t('onboarding.role.verifier.finderNote')}
          selected={role === 'verifier'}
          onClick={() => onPick('verifier')}
        />
      </div>

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
}

/** Key generation step — a single CTA that fires off `generateSecretKey()`
 *  with a brief visible spinner for tactile feedback. */
function KeygenStep({ isGenerating, onGenerate }: KeygenStepProps) {
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
    </div>
  );
}

interface SecureStepProps {
  nsec: string;
  showKey: boolean;
  onToggleShow: () => void;
  onContinue: () => void;
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
function SecureStep({ nsec, showKey, onToggleShow, onContinue }: SecureStepProps) {
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
    </div>
  );
}
