/**
 * Restore Wallet Component
 * Handles wallet restoration from mnemonic, relay backup, or file
 *
 * Security: Implements rate limiting with exponential backoff on failed
 * restore attempts to prevent brute-force attacks.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Loader2,
  Key,
  Cloud,
  FileUp,
  AlertCircle,
  Clock,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MnemonicInput } from "./MnemonicInput";
import { WasmUnsupportedError } from "./WasmUnsupportedError";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { checkWasmSupport } from "@/lib/checkWasmSupport";
import {
  checkRestoreRateLimit,
  recordFailedRestoreAttempt,
  recordSuccessfulRestore,
  formatLockoutTime,
} from "@/lib/spark/rateLimiter";

interface RestoreWalletProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function RestoreWallet({ onComplete, onCancel }: RestoreWalletProps) {
  const [activeTab, setActiveTab] = useState("relay");
  const [mnemonic, setMnemonic] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // WASM support check
  const [wasmSupported, setWasmSupported] = useState<boolean | null>(null);
  const [wasmError, setWasmError] = useState<string | null>(null);

  // Rate limiting state
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    restoreFromMnemonic,
    restoreFromRelay,
    restoreFromFile,
    hasBackup,
    backupTimestamp,
  } = useSparkWallet();
  const { user } = useCurrentUser();

  // Check WASM support on mount
  useEffect(() => {
    checkWasmSupport().then((result) => {
      setWasmSupported(result.supported);
      if (!result.supported) {
        setWasmError(result.reason || "WebAssembly is not supported");
      }
    });
  }, []);

  // Check rate limit on mount and update state
  const checkRateLimit = useCallback(() => {
    const {
      isLimited,
      remainingSeconds,
      failedAttempts: attempts,
    } = checkRestoreRateLimit();
    setIsRateLimited(isLimited);
    setRateLimitSeconds(remainingSeconds);
    setFailedAttempts(attempts);
    return isLimited;
  }, []);

  // Start countdown timer when rate limited
  useEffect(() => {
    // Check rate limit on mount
    checkRateLimit();

    // Clear any existing timer
    if (rateLimitTimerRef.current) {
      clearInterval(rateLimitTimerRef.current);
      rateLimitTimerRef.current = null;
    }

    if (isRateLimited && rateLimitSeconds > 0) {
      rateLimitTimerRef.current = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev <= 1) {
            // Timer expired, check rate limit again
            if (rateLimitTimerRef.current) {
              clearInterval(rateLimitTimerRef.current);
              rateLimitTimerRef.current = null;
            }
            setIsRateLimited(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
        rateLimitTimerRef.current = null;
      }
    };
    // rateLimitSeconds is intentionally excluded - we only want to start timer when isRateLimited changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRateLimited, checkRateLimit]);

  const handleRestoreFromMnemonic = async () => {
    if (!mnemonic) return;

    // Check rate limit before attempting
    if (checkRateLimit()) {
      return;
    }

    setIsRestoring(true);
    setError(null);

    try {
      await restoreFromMnemonic(mnemonic);
      // Success - clear rate limit state
      recordSuccessfulRestore();
      setMnemonic(""); // Clear from memory
      onComplete?.();
    } catch (err) {
      // Record failed attempt and apply rate limiting
      const {
        isLocked,
        lockoutSeconds,
        failedAttempts: attempts,
      } = recordFailedRestoreAttempt();
      setFailedAttempts(attempts);

      if (isLocked) {
        setIsRateLimited(true);
        setRateLimitSeconds(lockoutSeconds);
        setError(
          `Too many failed attempts. Please wait ${formatLockoutTime(lockoutSeconds)} before trying again.`,
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to restore wallet",
        );
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreFromRelay = async () => {
    if (!user) {
      setError("You must be logged in to restore from relay backup");
      return;
    }

    setIsRestoring(true);
    setError(null);

    try {
      await restoreFromRelay();
      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore from relay",
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      setError("You must be logged in to restore from file");
      return;
    }

    setIsRestoring(true);
    setError(null);

    try {
      await restoreFromFile(file);
      onComplete?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore from file",
      );
    } finally {
      setIsRestoring(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Show loading while checking WASM support
  if (wasmSupported === null) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Checking browser compatibility...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error if WASM is not supported
  if (wasmSupported === false) {
    return (
      <WasmUnsupportedError
        technicalDetails={wasmError ?? undefined}
        onBack={onCancel}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Restore Wallet</CardTitle>
        <CardDescription>
          Restore your existing Spark wallet using one of the methods below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="relay" className="text-xs" disabled={!user}>
              <Cloud className="h-3 w-3 mr-1" />
              Relay
            </TabsTrigger>
            <TabsTrigger value="file" className="text-xs" disabled={!user}>
              <FileUp className="h-3 w-3 mr-1" />
              File
            </TabsTrigger>
            <TabsTrigger value="mnemonic" className="text-xs">
              <Key className="h-3 w-3 mr-1" />
              Phrase
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mnemonic" className="space-y-4 mt-4">
            {/* Rate limit warning */}
            {isRateLimited && (
              <Alert variant="destructive">
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Too many failed attempts. Please wait{" "}
                  <span className="font-mono font-bold">
                    {formatLockoutTime(rateLimitSeconds)}
                  </span>{" "}
                  before trying again.
                </AlertDescription>
              </Alert>
            )}

            {/* Failed attempts warning (before lockout) */}
            {!isRateLimited && failedAttempts > 0 && failedAttempts < 3 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {failedAttempts} failed attempt{failedAttempts > 1 ? "s" : ""}
                  .
                  {failedAttempts === 2 &&
                    " One more failed attempt will trigger a temporary lockout."}
                </AlertDescription>
              </Alert>
            )}

            <MnemonicInput
              value={mnemonic}
              onChange={setMnemonic}
              error={
                activeTab === "mnemonic" && !isRateLimited
                  ? (error ?? undefined)
                  : undefined
              }
            />

            <Button
              onClick={handleRestoreFromMnemonic}
              disabled={
                isRestoring ||
                isRateLimited ||
                mnemonic.split(/\s+/).filter((w) => w).length !== 12
              }
              className="w-full"
            >
              {isRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : isRateLimited ? (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  Wait {formatLockoutTime(rateLimitSeconds)}
                </>
              ) : (
                "Restore Wallet"
              )}
            </Button>
          </TabsContent>

          <TabsContent value="relay" className="space-y-4 mt-4">
            {!user ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You must be logged in to restore from relay backup.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="text-center py-6">
                  <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    {hasBackup
                      ? "A backup was found on Nostr relays. Click below to restore."
                      : "Searching for encrypted backup on Nostr relays..."}
                  </p>
                  {hasBackup && backupTimestamp && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Backed up{" "}
                      {new Date(backupTimestamp * 1000).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {error && activeTab === "relay" && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleRestoreFromRelay}
                  disabled={isRestoring || !hasBackup}
                  className="w-full"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    "Restore from Relay"
                  )}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="file" className="space-y-4 mt-4">
            {!user ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You must be logged in to restore from file backup.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="text-center py-6">
                  <FileUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Select your encrypted backup file to restore.
                  </p>
                </div>

                {error && activeTab === "file" && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRestoring}
                  className="w-full"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4 mr-2" />
                      Select Backup File
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>

        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="w-full mt-4">
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
