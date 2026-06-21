import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { AgoraBoltIcon } from '@/components/icons/AgoraBoltIcon';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useLoginActions,
  generateNostrConnectParams,
  generateNostrConnectURI,
  type NostrConnectParams,
  type NostrConnectStatus,
} from '@/hooks/useLoginActions';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from '@/hooks/useToast';
import { useOnboarding } from '@/contexts/onboardingContextDef';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The dialog covers the three login paths only — nsec, NIP-07 extension, and
 * NIP-46 (nostrconnect QR + bunker URI). New-account signup is handled by
 * the captive `<OnboardingGate>` flow; the welcome step's "Create" button
 * closes this dialog and hands off to that flow.
 */
type Step = 'welcome' | 'login' | 'connect';

const validateNsec = (nsec: string) => /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
const validateBunkerUri = (uri: string) => uri.startsWith('bunker://');

/** Check if running on an actual mobile device (not just a small screen). */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('welcome');

  // Login state
  const [loginNsec, setLoginNsec] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Nostrconnect / bunker state
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  // Progress status for the nostrconnect handshake. `null` means the user
  // hasn't kicked off the handshake yet (or they canceled) — we show the QR
  // / "Open signer app" button. Once the handshake advances we swap in a
  // spinner with a live status line so the user knows something is working.
  const [connectStatus, setConnectStatus] = useState<NostrConnectStatus | null>(null);
  // Tracks whether the user has explicitly initiated the handshake from the
  // mobile UI. The listen subscription itself starts the moment params are
  // generated — without this flag we'd flip into the progress view as soon
  // as the user enters the Remote Signer step, before they've done anything.
  // Desktop doesn't need this: it stays on the QR until the handshake
  // advances past `awaiting-connect`.
  const [hasOpenedSigner, setHasOpenedSigner] = useState(false);
  const [showBunkerInput, setShowBunkerInput] = useState(false);
  const [bunkerUri, setBunkerUri] = useState('');

  const login = useLoginActions();
  const { config } = useAppContext();
  const { startSignup } = useOnboarding();
  const { toast } = useToast();
  const { t } = useTranslation();

  const connectStatusLabel = (status: NostrConnectStatus | null): string => {
    switch (status) {
      case 'awaiting-connect':
        return t('auth.waitingForSigner');
      case 'getting-public-key':
        return t('auth.gettingPublicKey');
      default:
        return '';
    }
  };
  // Stable refs so the nostrconnect listening effect below doesn't restart on
  // every parent render. Parents typically pass inline arrow functions for
  // onClose, and useLoginActions returns a fresh object each render — without
  // stable refs, an effect depending on them would tear down the in-flight
  // subscription on every render and cause approved logins to be swallowed.
  const loginRef = useRef(login);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    loginRef.current = login;
  }, [login]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();

  const hasExtension = typeof window !== 'undefined' && 'nostr' in window;

  // Reset state when the dialog closes.
  // This is the "reset state when a prop changes" pattern; the usual
  // React-preferred alternative is a `key` prop on the caller, but the
  // public API of this component is a simple open/close boolean, so we
  // reset here. The multiple setState calls are intentional.
  useEffect(() => {
    if (!isOpen) {
      setStep('welcome');
      setLoginNsec('');
      setIsLoggingIn(false);
      setLoginError('');
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setConnectError(null);
      setConnectStatus(null);
      setHasOpenedSigner(false);
      setShowBunkerInput(false);
      setBunkerUri('');
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [isOpen]);

  // Generate a nostrconnect session (QR code data).
  const generateConnectSession = useCallback(() => {
    const relayUrls = login.getRelayUrls();
    const params = generateNostrConnectParams(relayUrls);
    const uri = generateNostrConnectURI(params, {
      callback: isMobileDevice() ? `${window.location.origin}/remoteloginsuccess` : undefined,
    });
    setNostrConnectParams(params);
    setNostrConnectUri(uri);
    setConnectError(null);
  }, [login]);

  // Start listening for a nostrconnect response once params are set.
  //
  // Deps are intentionally limited to `nostrConnectParams` so that parent
  // re-renders (which produce fresh onClose closures and a fresh `login`
  // object from useLoginActions) do NOT tear down an in-flight
  // subscription. An earlier version used a `cancelled` flag flipped by
  // the effect's cleanup, which caused a successful nostrconnect response
  // to be silently swallowed after the signer approved — the subscription
  // was re-created mid-handshake and the first instance's success branch
  // saw `cancelled === true`.
  //
  // Cancellation is handled explicitly by the `isOpen` effect (on dialog
  // close) and by handleConnectRetry() (on user cancel/retry).
  useEffect(() => {
    if (!nostrConnectParams) return;

    const startListening = async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await loginRef.current.nostrconnect(
          nostrConnectParams,
          controller.signal,
          (status) => {
            if (controller.signal.aborted) return;
            setConnectStatus(status);
          },
        );
        // If the dialog was explicitly closed (handled by the isOpen
        // effect, which aborts the controller), don't try to re-close it.
        // Otherwise the user is logged in — close the dialog.
        if (controller.signal.aborted) return;
        onCloseRef.current();
      } catch (error) {
        // AbortError means we intentionally aborted (dialog closed or retry)
        if (error instanceof Error && error.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('Nostrconnect failed:', error);
        setConnectStatus(null);
        setConnectError(error instanceof Error ? error.message : String(error));
      }
    };

    startListening();

    // No cleanup here: we do NOT want a re-render-triggered effect teardown
    // to cancel the in-flight subscription.
  }, [nostrConnectParams]);

  const handleConnectRetry = useCallback(() => {
    abortControllerRef.current?.abort();
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setConnectError(null);
    setConnectStatus(null);
    setHasOpenedSigner(false);
    setTimeout(() => generateConnectSession(), 0);
  }, [generateConnectSession]);

  const handleOpenSignerApp = () => {
    if (!nostrConnectUri) return;
    // Flip into the progress view *synchronously* before navigating so that
    // when the user returns from the signer app, the dialog is already
    // showing "Waiting for signer connection…" — not the original button
    // they're worried they need to re-tap.
    setHasOpenedSigner(true);
    window.location.href = nostrConnectUri;
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim() || !validateBunkerUri(bunkerUri)) return;

    setIsLoggingIn(true);
    try {
      await login.bunker(bunkerUri);
      onClose();
    } catch {
      setConnectError(t('auth.errorBunkerConnect'));
      setIsLoggingIn(false);
    }
  };

  const goToConnect = () => {
    setStep('connect');
    if (!nostrConnectParams && !connectError) {
      generateConnectSession();
    }
  };

  /**
   * Hand off from this login-focused dialog to the captive signup flow.
   * Closes the dialog first so the captive overlay isn't competing with a
   * still-open dialog (the captive overlay's z-50 would visually win, but
   * leaving the dialog mounted means a stale "welcome" step would flash
   * when the captive flow finishes and the dialog re-opens for any reason).
   */
  const goToSignup = useCallback(() => {
    onClose();
    startSignup();
  }, [onClose, startSignup]);

  // Login: submit the entered nsec.
  const handleLogin = () => {
    if (!loginNsec.trim()) {
      setLoginError(t('auth.errorEnterSecretKey'));
      return;
    }
    if (!validateNsec(loginNsec)) {
      setLoginError(t('auth.errorInvalidSecretKey'));
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    // Timeout gives the UI a chance to repaint before the synchronous login.
    setTimeout(() => {
      try {
        login.nsec(loginNsec);
        onClose();
      } catch {
        setLoginError(t('auth.errorLoginFailed'));
        setIsLoggingIn(false);
      }
    }, 50);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && validateNsec(content.trim())) {
        setLoginNsec(content.trim());
      } else {
        setLoginError(t('auth.errorFileNoKey'));
      }
    };
    reader.onerror = () => setLoginError(t('auth.errorFileRead'));
    reader.readAsText(file);
  };

  const handleExtensionLogin = async () => {
    if (!hasExtension) return;
    setIsLoggingIn(true);
    try {
      await login.extension();
      onClose();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('auth.extensionErrorTitle'),
        description: e instanceof Error ? e.message : t('auth.errorExtensionFailed'),
      });
      setIsLoggingIn(false);
    }
  };

  const getTitle = () => {
    switch (step) {
      case 'login':
        return t('auth.loginTitle');
      case 'connect':
        return t('auth.connectSignerTitle');
      default:
        return '';
    }
  };

  // Decide whether to render the progress view in place of the QR/button.
  // Mobile: flip in as soon as the user taps "Open signer app" (tracked by
  // `hasOpenedSigner`) so they see feedback the moment they return from the
  // signer. Desktop: keep the QR visible through the `awaiting-connect`
  // phase (it's still actionable — they might scan with another device) and
  // only swap in once the signer has acknowledged and we're fetching the
  // pubkey.
  const showProgressView = connectStatus !== null && (
    connectStatus === 'getting-public-key' ||
    (isMobile && hasOpenedSigner)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-2xl overflow-y-auto">
        {step === 'welcome' ? (
          /* Welcome step — the unified entry point. The Agora logo and
             wordmark are the focal point (and double as the dialog's
             accessible title), so there's no separate header row or
             subtext — just the brand and the two paths in. */
          <div className="px-6 pb-8 pt-10 space-y-8 text-center">
            <div className="flex items-center justify-center">
              <AgoraBoltIcon className="size-20 drop-shadow-md" />
              <DialogTitle
                className="latin-display font-display font-normal tracking-wide leading-none uppercase text-6xl text-primary inline-block -ml-0.5"
                style={{
                  WebkitTextStroke: '0.022em currentColor',
                  transform: 'skewX(-6deg) scaleX(1.1)',
                  transformOrigin: '0 100%',
                }}
              >
                {config.appName}
              </DialogTitle>
            </div>

            <div className="space-y-2">
              <Button onClick={goToSignup} className="w-full h-12">
                {t('auth.createNewAccount')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('login')}
                className="w-full h-12"
              >
                {t('auth.loginExisting')}
              </Button>
            </div>
          </div>
        ) : (
        <>
        <div className="relative px-6 pt-6">
          <button
            type="button"
            onClick={() => setStep(step === 'connect' ? 'login' : 'welcome')}
            aria-label={t('auth.back')}
            className="absolute left-4 top-5 size-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </button>
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center px-9">
            {getTitle()}
          </DialogTitle>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-5">

          {/* Login step. The secret-key form is always visible and first,
              followed by the extension button (when available), then a
              text link out to the remote-signer (connect) step. */}
          {step === 'login' && (
            <div className="space-y-4">
              <NsecLoginForm
                loginNsec={loginNsec}
                setLoginNsec={setLoginNsec}
                loginError={loginError}
                setLoginError={setLoginError}
                isLoggingIn={isLoggingIn}
                onSubmit={handleLogin}
                onFileChange={handleFileUpload}
                fileInputRef={fileInputRef}
                t={t}
              />

              {hasExtension && (
                <Button
                  variant="outline"
                  onClick={handleExtensionLogin}
                  disabled={isLoggingIn}
                  className="w-full h-12"
                >
                  {isLoggingIn ? t('auth.loggingIn') : t('auth.loginWithExtension')}
                </Button>
              )}

              <button
                type="button"
                onClick={goToConnect}
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground motion-safe:transition-colors py-2"
              >
                <span>{t('auth.useRemoteSigner')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          )}

          {/* Connect step — nostrconnect QR + bunker URI fallback. */}
          {step === 'connect' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {connectError ? (
                  <div className="flex flex-col items-center space-y-3 py-4">
                    <p className="text-sm text-destructive text-center">{connectError}</p>
                    <Button variant="outline" onClick={handleConnectRetry}>
                      {t('auth.tryAgain')}
                    </Button>
                  </div>
                ) : showProgressView ? (
                  // Progress view — replaces the QR/button once the handshake
                  // is under way. Gives the user live feedback through each
                  // phase so a stuck signer is visibly stuck, not silently
                  // stuck.
                  <div className="flex flex-col items-center space-y-4 py-6 w-full">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground text-center min-h-[1.25rem]">
                      {connectStatusLabel(connectStatus)}
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectRetry}
                      className="text-sm text-primary hover:underline underline-offset-4 font-medium"
                    >
                      {t('auth.cancel')}
                    </button>
                  </div>
                ) : nostrConnectUri ? (
                  <>
                    {!isMobile && (
                      <div className="p-4 bg-white rounded-xl">
                        <QRCodeCanvas value={nostrConnectUri} size={180} level="M" />
                      </div>
                    )}

                    {isMobile && (
                      <Button onClick={handleOpenSignerApp} className="w-full h-12">
                        <ExternalLink className="w-5 h-5 mr-2" />
                        {t('auth.openSignerApp')}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[100px]">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Manual bunker URI fallback. */}
              <Collapsible open={showBunkerInput} onOpenChange={setShowBunkerInput}>
                <CollapsibleTrigger className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground py-2">
                  <span>{t('auth.enterBunkerManually')}</span>
                  {showBunkerInput ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <Input
                    value={bunkerUri}
                    onChange={(e) => setBunkerUri(e.target.value)}
                    placeholder={t('auth.bunkerPlaceholder')}
                    className="text-base md:text-sm"
                  />
                  {bunkerUri && !validateBunkerUri(bunkerUri) && (
                    <Alert variant="destructive">
                      <AlertDescription>{t('auth.invalidBunkerFormat')}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleBunkerLogin}
                    disabled={
                      isLoggingIn || !bunkerUri.trim() || !validateBunkerUri(bunkerUri)
                    }
                    className="w-full"
                  >
                    {isLoggingIn ? t('auth.connecting') : t('auth.connect')}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Shared nsec input + submit + file-upload block used in the login step. */
interface NsecLoginFormProps {
  loginNsec: string;
  setLoginNsec: (v: string) => void;
  loginError: string;
  setLoginError: (v: string) => void;
  isLoggingIn: boolean;
  onSubmit: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  t: (key: string) => string;
}

const NsecLoginForm: React.FC<NsecLoginFormProps> = ({
  loginNsec,
  setLoginNsec,
  loginError,
  setLoginError,
  isLoggingIn,
  onSubmit,
  onFileChange,
  fileInputRef,
  t,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
    className="space-y-3"
    data-nsec-allowed
  >
    <span className="block text-sm font-medium text-foreground">
      {t('auth.secretKeyLabel')}
    </span>

    {/* nsec input and the key-file upload icon share a row. */}
    <div className="flex gap-2">
      <Input
        type="password"
        value={loginNsec}
        onChange={(e) => {
          setLoginNsec(e.target.value);
          if (loginError) setLoginError('');
        }}
        placeholder={t('auth.nsecPlaceholder')}
        autoComplete="off"
        className={cn(
          'flex-1',
          loginError && 'border-destructive focus-visible:ring-destructive',
        )}
      />
      <input
        type="file"
        accept=".txt"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label={t('auth.uploadKeyFile')}
        title={t('auth.uploadKeyFile')}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-4 h-4" />
      </Button>
    </div>

    {loginError && <p className="text-sm text-destructive">{loginError}</p>}

    <Button
      type="submit"
      disabled={isLoggingIn || !loginNsec.trim()}
      className="w-full h-12"
    >
      {isLoggingIn ? t('auth.loggingIn') : t('auth.login')}
    </Button>
  </form>
);

export default AuthDialog;
