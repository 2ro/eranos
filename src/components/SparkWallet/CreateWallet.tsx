/**
 * Create Wallet Component
 * Handles new wallet creation flow with mnemonic backup and Lightning address setup
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Wallet,
  Shield,
  Download,
  CloudUpload,
  Zap,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MnemonicDisplay } from "./MnemonicDisplay";
import { WasmUnsupportedError } from "./WasmUnsupportedError";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { checkWasmSupport } from "@/lib/checkWasmSupport";

interface CreateWalletProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

type Step = "create" | "backup" | "confirm" | "lightning-address";

/** Get step configuration for progress indicator with translations */
function getSteps(t: (key: string) => string): { id: Step; label: string; shortLabel: string }[] {
  return [
    { id: "create", label: t('wallet2.createWallet'), shortLabel: t('auth.generateKey') },
    { id: "backup", label: t('walletSettings.backupTitle'), shortLabel: t('auth.downloadKey') },
    { id: "confirm", label: t('dialogs.confirmBackup'), shortLabel: t('common.confirm') },
    {
      id: "lightning-address",
      label: t('walletSettings.lightningTitle'),
      shortLabel: t('wallet.address'),
    },
  ];
}

/** Progress indicator component */
function StepIndicator({ currentStep, steps }: { currentStep: Step; steps: ReturnType<typeof getSteps> }) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="mb-6">
      {/* Mobile: Show current step text */}
      <div className="sm:hidden text-center mb-2">
        <span className="text-sm text-muted-foreground">
          Step {currentIndex + 1} of {steps.length}
        </span>
      </div>

      {/* Progress bar and steps */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;

          return (
            <div
              key={step.id}
              className="flex items-center flex-1 last:flex-none"
            >
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent &&
                      "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    isUpcoming && "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                {/* Step label - hidden on mobile */}
                <span
                  className={cn(
                    "hidden sm:block text-xs mt-1.5 text-center max-w-[70px]",
                    isCurrent
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2",
                    index < currentIndex ? "bg-primary" : "bg-muted",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CreateWallet({ onComplete, onCancel }: CreateWalletProps) {
  const { t } = useTranslation();
  const STEPS = getSteps(t);
  const [step, setStep] = useState<Step>("create");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [hasBackedUp, setHasBackedUp] = useState(false);
  const [syncToRelay, setSyncToRelay] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // WASM support check for iOS Lockdown Mode detection
  const [wasmSupported, setWasmSupported] = useState<boolean | null>(null);
  const [wasmError, setWasmError] = useState<string | null>(null);

  // Lightning address state
  const [lnUsername, setLnUsername] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [registeredAddress, setRegisteredAddress] = useState<string | null>(
    null,
  );

  const {
    createWallet,
    syncToRelays,
    exportBackup,
    checkLightningAddressAvailable,
    registerLightningAddress,
  } = useSparkWallet();

  // Check WASM support on mount
  useEffect(() => {
    checkWasmSupport().then((result) => {
      setWasmSupported(result.supported);
      if (!result.supported) {
        setWasmError(result.reason || "WebAssembly is not supported");
      }
    });
  }, []);
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const newMnemonic = await createWallet();
      setMnemonic(newMnemonic);
      setStep("backup");
    } catch (error) {
      console.error("Failed to create wallet:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportBackup = async () => {
    if (!mnemonic) return;
    try {
      await exportBackup(mnemonic);
    } catch (error) {
      console.error("Failed to export backup:", error);
    }
  };

  const handleConfirmComplete = async () => {
    if (syncToRelay && mnemonic && user) {
      setIsSyncing(true);
      try {
        await syncToRelays(mnemonic);
      } catch (error) {
        console.error("Failed to sync to relays:", error);
      } finally {
        setIsSyncing(false);
      }
    }

    // Proceed to Lightning address setup
    setStep("lightning-address");
  };

  const handleCheckUsername = async () => {
    if (!lnUsername.trim()) return;

    setIsCheckingUsername(true);
    setUsernameAvailable(null);

    try {
      const available = await checkLightningAddressAvailable(
        lnUsername.trim().toLowerCase(),
      );
      setUsernameAvailable(available);
    } catch (error) {
      console.error("Failed to check username:", error);
      setUsernameAvailable(null);
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const handleRegisterAddress = async () => {
    if (!lnUsername.trim() || !usernameAvailable) return;

    setIsRegistering(true);
    try {
      const address = await registerLightningAddress(
        lnUsername.trim().toLowerCase(),
      );
      setRegisteredAddress(address);

      // Optionally update user's Nostr profile with the new Lightning address
      if (user && metadata) {
        try {
          const updatedMetadata = { ...metadata, lud16: address };
          // Clean up empty values
          for (const key in updatedMetadata) {
            if (updatedMetadata[key] === "") {
              delete updatedMetadata[key];
            }
          }

          await publishEvent({
            kind: 0,
            content: JSON.stringify(updatedMetadata),
          });

          queryClient.invalidateQueries({ queryKey: ["author", user.pubkey] });

          toast({
            title: "Profile updated",
            description:
              "Your Lightning address has been added to your Nostr profile.",
          });
        } catch (error) {
          console.error("Failed to update profile:", error);
          // Don't fail the whole flow if profile update fails
        }
      }
    } catch (error) {
      console.error("Failed to register Lightning address:", error);
      toast({
        title: "Registration failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to register Lightning address",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleFinalComplete = () => {
    // Clear mnemonic from memory after completion
    setMnemonic("");
    onComplete?.();
  };

  if (step === "create") {
    // Show loading while checking WASM support
    if (wasmSupported === null) {
      return (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Checking device compatibility...
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Show error if WASM is not supported (iOS Lockdown Mode)
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
          <StepIndicator currentStep={step} steps={STEPS} />
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t('wallet2.createWallet')}</CardTitle>
          <CardDescription>
            Create a new self-custodial Lightning wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-foreground">{t('wallet2.selfCustodial')}</p>
                <p>{t('wallet2.selfCustodialDesc')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Wallet className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">{t('wallet2.instantPayments')}</p>
                <p>
                  Send and receive Lightning payments instantly with low fees.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancel
              </Button>
            )}
            <Button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('wallet2.createWallet')
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "backup") {
    return (
      <Card>
        <CardHeader className="text-center">
          <StepIndicator currentStep={step} steps={STEPS} />
          <CardTitle>Backup Your Wallet</CardTitle>
          <CardDescription>
            Save your 12-word recovery phrase. This is the only way to restore
            your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MnemonicDisplay mnemonic={mnemonic} showWarning={true} />

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExportBackup}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Backup
            </Button>
          </div>

          <Button onClick={() => setStep("confirm")} className="w-full">
            I've Saved My Recovery Phrase
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card>
        <CardHeader className="text-center">
          <StepIndicator currentStep={step} steps={STEPS} />
          <CardTitle>Confirm Backup</CardTitle>
          <CardDescription>
            Please confirm you have saved your recovery phrase securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="backed-up"
                checked={hasBackedUp}
                onCheckedChange={(checked) => setHasBackedUp(checked === true)}
              />
              <Label
                htmlFor="backed-up"
                className="text-sm leading-relaxed cursor-pointer"
              >
                I have written down my 12-word recovery phrase and stored it in
                a safe place. I understand that losing this phrase means losing
                access to my funds.
              </Label>
            </div>

            {user && (
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="sync-relay"
                  checked={syncToRelay}
                  onCheckedChange={(checked) =>
                    setSyncToRelay(checked === true)
                  }
                />
                <Label
                  htmlFor="sync-relay"
                  className="text-sm leading-relaxed cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <CloudUpload className="h-4 w-4" />
                    Encrypt and backup to Nostr relays
                  </div>
                  <p className="text-muted-foreground mt-1">
                    Your backup will be encrypted with your Nostr key and stored
                    on relays for easy recovery.
                  </p>
                </Label>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setStep("backup")}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleConfirmComplete}
              disabled={!hasBackedUp || isSyncing}
              className="flex-1"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Lightning Address step
  return (
    <Card>
      <CardHeader className="text-center">
        <StepIndicator currentStep={step} steps={STEPS} />
        <div className="mx-auto w-12 h-12 bg-yellow-500/10 rounded-full flex items-center justify-center mb-4">
          <Zap className="h-6 w-6 text-yellow-500" />
        </div>
        <CardTitle>Set Up Lightning Address</CardTitle>
        <CardDescription>
          Get a Lightning address so others can easily send you payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {registeredAddress ? (
          // Success state
          <div className="space-y-4">
            <Alert className="border-primary/50 bg-primary/10">
              <Check className="h-4 w-4 text-primary" />
              <AlertDescription className="text-primary">
                Your Lightning address is ready!
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
              <p className="text-sm text-muted-foreground mb-1">
                Your Lightning address
              </p>
              <p className="text-lg font-mono font-medium break-all">
                {registeredAddress}
              </p>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              This address has been automatically added to your Nostr profile.
              Anyone can now send you Lightning payments using this address.
            </p>

            <Button onClick={handleFinalComplete} className="w-full">
              <Check className="h-4 w-4 mr-2" />
              Complete Setup
            </Button>
          </div>
        ) : (
          // Registration form
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ln-username">Choose your username</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ln-username"
                    value={lnUsername}
                    onChange={(e) => {
                      setLnUsername(
                        e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""),
                      );
                      setUsernameAvailable(null);
                    }}
                    placeholder="satoshi"
                    className="pr-10"
                  />
                  {usernameAvailable !== null && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameAvailable ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCheckUsername}
                  disabled={!lnUsername.trim() || isCheckingUsername}
                >
                  {isCheckingUsername ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Check"
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Your address will be:{" "}
                <span className="font-mono">
                  {lnUsername || "username"}@breez.tips
                </span>
              </p>
              {usernameAvailable === false && (
                <p className="text-sm text-red-600">
                  This username is already taken. Please try another.
                </p>
              )}
              {usernameAvailable === true && (
                <p className="text-sm text-primary">
                  This username is available!
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={handleFinalComplete}
                className="flex-1"
              >
                Skip for now
              </Button>
              <Button
                onClick={handleRegisterAddress}
                disabled={!usernameAvailable || isRegistering}
                className="flex-1"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Get Address
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
