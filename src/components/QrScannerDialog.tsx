import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, X, ZapOff, Zap } from 'lucide-react';
import QrScanner from 'qr-scanner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface QrScannerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the decoded QR text the first time a code is read. */
  onScan: (value: string) => void;
  /** Override the dialog title (defaults to the localized "Scan QR code"). */
  title?: string;
}

/** How long to wait after `start()` resolves before declaring the camera dead. */
const VIDEO_READY_TIMEOUT_MS = 6000;

/**
 * Camera-based QR scanner dialog. Works in browsers, Capacitor's WKWebView
 * (iOS), and Android's WebView, all via `getUserMedia` + the `qr-scanner`
 * library (ZXing / BarcodeDetector under the hood).
 *
 * The dialog owns the camera lifecycle: it spins up the scanner when opened
 * and tears it down on close, so callers only need to manage `isOpen` and
 * react to `onScan`.
 *
 * Failure modes we explicitly surface (instead of a silent black screen):
 *   - Insecure context (HTTP) — getUserMedia is unavailable.
 *   - Camera permission denied.
 *   - No camera on the device.
 *   - `facingMode: 'environment'` not satisfiable (some laptops, some
 *     locked-down WebViews). We retry with the front camera.
 *   - `start()` resolves but the video never emits `loadedmetadata` within
 *     `VIDEO_READY_TIMEOUT_MS` — usually means the worker engine failed to
 *     initialize or another app is holding the camera.
 */
export function QrScannerDialog({ isOpen, onClose, onScan, title }: QrScannerDialogProps) {
  const { t } = useTranslation();
  // Callback ref so we know the moment the element is attached. Radix
  // Dialog mounts content lazily inside a Portal, so a plain `useRef` is
  // still null on the first effect tick after `isOpen` flips to true.
  // A state-backed ref re-runs the effect once the <video> actually
  // exists in the DOM.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  // Keep the latest onScan in a ref so the start effect doesn't tear down
  // the camera every time the parent passes a new callback identity.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [status, setStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (!video) return;

    // Secure-context guard — getUserMedia is only available on https / localhost.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setStatus('error');
      setError(t('qrScanner.errors.insecure'));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError(t('qrScanner.errors.unsupported'));
      return;
    }

    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus('starting');
    setError(null);

    const handleDecode = (result: QrScanner.ScanResult) => {
      if (cancelled) return;
      cancelled = true;
      scanner.stop();
      onScanRef.current(result.data);
    };

    let scanner: QrScanner;
    try {
      scanner = new QrScanner(
        video,
        handleDecode,
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: 'environment',
          maxScansPerSecond: 5,
        },
      );
    } catch (err) {
      setStatus('error');
      setError(humanizeCameraError(err, t));
      return;
    }

    scannerRef.current = scanner;

    /**
     * Watch the video element. If it never reaches `HAVE_METADATA` within the
     * timeout, the scanner is silently broken. Surface that instead of a
     * black screen.
     */
    const armReadyTimeout = () => {
      readyTimer = setTimeout(() => {
        if (cancelled) return;
        if (video.readyState < 1 /* HAVE_METADATA */) {
          cancelled = true;
          scanner.stop();
          setStatus('error');
          setError(t('qrScanner.errors.didntStart'));
        }
      }, VIDEO_READY_TIMEOUT_MS);
    };

    const clearReadyTimeout = () => {
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = undefined;
      }
    };

    const onLoadedMetadata = () => clearReadyTimeout();
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });

    /**
     * Some devices reject `facingMode: 'environment'` with OverconstrainedError
     * (laptops without a rear camera, some Android WebViews). Retry without a
     * camera preference so the browser picks any available device.
     */
    const startWithFallback = async () => {
      try {
        await scanner.start();
      } catch (err) {
        if (cancelled) return;
        if (isOverconstrainedError(err)) {
          try {
            await scanner.setCamera('user');
            return;
          } catch {
            // Fall through and report the original error.
          }
        }
        throw err;
      }
    };

    startWithFallback()
      .then(async () => {
        if (cancelled) return;
        clearReadyTimeout();
        setStatus('running');
        armReadyTimeout();
        try {
          const flashAvailable = await scanner.hasFlash();
          if (!cancelled) setHasFlash(flashAvailable);
        } catch {
          // Flash detection is best-effort; ignore.
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        clearReadyTimeout();
        setStatus('error');
        setError(humanizeCameraError(err, t));
      });

    // Arm an initial timeout in case `start()` neither resolves nor rejects
    // (e.g. the worker engine wedges on CSP-blocked blob creation, or the
    // OS permission dialog is dismissed without a callback firing).
    armReadyTimeout();

    return () => {
      cancelled = true;
      clearReadyTimeout();
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
      setHasFlash(false);
      setFlashOn(false);
    };
  }, [isOpen, video, t]);

  const toggleFlash = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      await scanner.toggleFlash();
      setFlashOn(scanner.isFlashOn());
    } catch {
      // Ignore — some devices report `hasFlash` true but error on toggle.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[min(380px,calc(100vw-2rem))] max-h-[calc(100svh-2rem)] rounded-2xl p-0 gap-0 border-border overflow-hidden flex flex-col [&>button]:hidden">
        <div className="flex items-center justify-between px-4 h-12 shrink-0">
          <DialogTitle className="text-base font-semibold flex items-center gap-1.5">
            {title ?? t('qrScanner.title')}
          </DialogTitle>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 motion-safe:transition-colors"
            aria-label={t('qrScanner.close')}
          >
            <X className="size-5" />
          </button>
        </div>

        <div
          className="relative w-full aspect-square bg-black overflow-hidden shrink-0"
          style={{ maxHeight: 'min(380px, calc(100vw - 2rem))' }}
        >
          <video
            ref={setVideo}
            className={cn(
              'absolute inset-0 w-full h-full object-cover',
              status !== 'running' && 'opacity-0',
            )}
            playsInline
            muted
          />

          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm">{t('qrScanner.starting')}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <Alert variant="destructive" className="bg-background">
                <Camera className="size-4" />
                <AlertDescription className="text-xs">
                  {error || t('qrScanner.errors.generic')}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {status === 'running' && hasFlash && (
            <button
              type="button"
              onClick={toggleFlash}
              aria-label={flashOn ? t('qrScanner.flashOff') : t('qrScanner.flashOn')}
              className="absolute bottom-3 right-3 size-10 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 motion-safe:transition-colors"
            >
              {flashOn ? <ZapOff className="size-5" /> : <Zap className="size-5" />}
            </button>
          )}
        </div>

        <div className="px-4 py-3 shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            {t('qrScanner.aim')}
          </p>
          {status === 'error' && (
            <Button onClick={onClose} variant="outline" className="w-full mt-3">
              {t('qrScanner.close')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isOverconstrainedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  if (name === 'OverconstrainedError') return true;
  const msg = err instanceof Error ? err.message : '';
  return /overconstrained|constraint/i.test(msg);
}

function humanizeCameraError(err: unknown, t: (key: string) => string): string {
  const name = (err && typeof err === 'object' ? (err as { name?: unknown }).name : undefined);
  const msg = err instanceof Error ? err.message : String(err);

  if (name === 'NotFoundError' || /no camera/i.test(msg) || /not found/i.test(msg)) {
    return t('qrScanner.errors.notFound');
  }
  if (name === 'NotAllowedError' || /permission/i.test(msg) || /denied/i.test(msg)) {
    return t('qrScanner.errors.denied');
  }
  if (name === 'NotReadableError' || /in use|busy|readable/i.test(msg)) {
    return t('qrScanner.errors.busy');
  }
  if (name === 'SecurityError' || /secure context/i.test(msg) || /https/i.test(msg)) {
    return t('qrScanner.errors.insecure');
  }
  if (name === 'OverconstrainedError' || /overconstrained|constraint/i.test(msg)) {
    return t('qrScanner.errors.overconstrained');
  }
  return msg || t('qrScanner.errors.generic');
}
