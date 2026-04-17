/**
 * Wallet Settings Content Component
 * Manages wallet backup, export, and deletion
 * Used in Settings page as the wallet tab content
 *
 * SECURITY: Clipboard is auto-cleared after 30 seconds when copying mnemonic
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Download,
  CloudUpload,
  Trash2,
  AlertTriangle,
  Loader2,
  Shield,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  Zap,
  X,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MnemonicInput } from "@/components/SparkWallet/MnemonicInput";
import { LockTimeoutSettings } from "@/components/SparkWallet/LockTimeoutSettings";
import { useSparkWallet } from "@/hooks/useSparkWallet";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

/** Clipboard auto-clear timeout in milliseconds (30 seconds) */
const CLIPBOARD_CLEAR_TIMEOUT = 30000;

export function WalletSettingsContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const {
    hasWallet,
    hasBackup,
    backupTimestamp,
    backupRelays,
    syncToRelays,
    exportBackup,
    deleteRelayBackup,
    removeWallet,
    getMnemonic,
    lightningAddress,
    getLightningAddress,
    checkLightningAddressAvailable,
    registerLightningAddress,
    deleteLightningAddress,
    isInitialized,
    getSparkAddress,
  } = useSparkWallet();

  const [showMnemonicDialog, setShowMnemonicDialog] = useState(false);
  const [showViewMnemonicDialog, setShowViewMnemonicDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showLightningAddressDialog, setShowLightningAddressDialog] =
    useState(false);
  const [showDeleteLnAddressDialog, setShowDeleteLnAddressDialog] =
    useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [viewMnemonic, setViewMnemonic] = useState("");
  const [showWords, setShowWords] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clipboardCountdown, setClipboardCountdown] = useState(0);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [action, setAction] = useState<"sync" | "export" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Clipboard security refs
  const clipboardClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Lightning address state
  const [lnUsername, setLnUsername] = useState("");
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [isRegisteringLn, setIsRegisteringLn] = useState(false);
  const [isDeletingLn, setIsDeletingLn] = useState(false);
  const [isRefreshingLn, setIsRefreshingLn] = useState(false);
  const [showUpdateProfileDialog, setShowUpdateProfileDialog] = useState(false);
  const [newlyRegisteredAddress, setNewlyRegisteredAddress] = useState<
    string | null
  >(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Spark address state
  const [sparkAddress, setSparkAddress] = useState<string | null>(null);
  const [copiedSparkAddress, setCopiedSparkAddress] = useState(false);

  // Fetch Lightning address and Spark address on mount
  useEffect(() => {
    if (isInitialized) {
      if (!lightningAddress) {
        getLightningAddress();
      }
      // Fetch Spark address
      getSparkAddress().then(setSparkAddress).catch(console.error);
    }
  }, [isInitialized, lightningAddress, getLightningAddress, getSparkAddress]);

  // Cleanup clipboard timers on unmount
  useEffect(() => {
    return () => {
      if (clipboardClearTimeoutRef.current) {
        clearTimeout(clipboardClearTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  if (!hasWallet) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            {t("walletSettings.noWallet")}
          </p>
          <Link to="/wallet">
            <Button className="mt-4">{t("walletSettings.goToWallet")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Helper to perform action with mnemonic (auto-retrieves or falls back to dialog)
  const performActionWithMnemonic = async (actionType: "sync" | "export") => {
    setIsLoading(true);
    try {
      // First try to get mnemonic automatically
      const storedMnemonic = await getMnemonic();

      if (storedMnemonic) {
        // We have the mnemonic, perform the action directly
        if (actionType === "sync") {
          await syncToRelays(storedMnemonic);
        } else if (actionType === "export") {
          await exportBackup(storedMnemonic);
        }
      } else {
        // No mnemonic found, show dialog for manual entry
        setAction(actionType);
        setShowMnemonicDialog(true);
      }
    } catch (error) {
      logger.error("Failed to complete action:", error);
      toast({
        title: "Action failed",
        description:
          error instanceof Error ? error.message : "Failed to complete action",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncToRelays = () => {
    performActionWithMnemonic("sync");
  };

  const handleExportBackup = () => {
    performActionWithMnemonic("export");
  };

  const handleViewRecoveryPhrase = async () => {
    setIsLoading(true);
    try {
      const storedMnemonic = await getMnemonic();

      if (storedMnemonic) {
        setViewMnemonic(storedMnemonic);
        setShowViewMnemonicDialog(true);
      } else {
        toast({
          title: t("walletSettings.recoveryPhraseNotFound"),
          description: t("walletSettings.recoveryPhraseNotFoundDesc"),
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Failed to get mnemonic:", error);
      toast({
        title: t("walletSettings.error"),
        description: t("walletSettings.failedToRetrieve"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearClipboard = async () => {
    try {
      await navigator.clipboard.writeText("");
      logger.debug("[WalletSettings] Clipboard cleared");
      setCopied(false);
      setClipboardCountdown(0);
    } catch (error) {
      logger.warn("[WalletSettings] Failed to clear clipboard:", error);
    }
  };

  const handleCopyMnemonicConfirmed = async () => {
    try {
      await navigator.clipboard.writeText(viewMnemonic);
      setCopied(true);
      setShowCopyConfirm(false);

      // Start countdown
      const totalSeconds = CLIPBOARD_CLEAR_TIMEOUT / 1000;
      setClipboardCountdown(totalSeconds);

      // Update countdown every second
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      countdownIntervalRef.current = setInterval(() => {
        setClipboardCountdown((prev) => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast({
        title: t("walletSettings.copiedToClipboard"),
        description: `Recovery phrase copied. Clipboard will be cleared in ${totalSeconds} seconds.`,
      });

      // Schedule clipboard clear
      if (clipboardClearTimeoutRef.current) {
        clearTimeout(clipboardClearTimeoutRef.current);
      }
      clipboardClearTimeoutRef.current = setTimeout(async () => {
        await clearClipboard();
        toast({
          title: t("walletSettings.clipboardCleared"),
          description: t("walletSettings.clipboardClearedDesc"),
        });
      }, CLIPBOARD_CLEAR_TIMEOUT);
    } catch (error) {
      logger.error("[WalletSettings] Failed to copy:", error);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleCopyMnemonic = () => {
    if (copied && clipboardCountdown > 0) {
      toast({
        title: t("walletSettings.copied"),
        description: `Clipboard will be cleared in ${clipboardCountdown} seconds.`,
      });
      return;
    }
    setShowCopyConfirm(true);
  };

  const handleMnemonicSubmit = async () => {
    if (!mnemonic || mnemonic.split(/\s+/).filter((w) => w).length !== 12)
      return;

    setIsLoading(true);
    try {
      if (action === "sync") {
        await syncToRelays(mnemonic);
      } else if (action === "export") {
        await exportBackup(mnemonic);
      }
      setShowMnemonicDialog(false);
      setMnemonic("");
    } catch (error) {
      logger.error("Failed to complete action:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = async () => {
    setIsLoading(true);
    try {
      await deleteRelayBackup();
      setShowDeleteDialog(false);
    } catch (error) {
      logger.error("Failed to delete backup:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveWallet = async () => {
    if (deleteConfirmText !== "DELETE") return;

    setIsLoading(true);
    try {
      await removeWallet();
      navigate("/wallet");
    } catch (error) {
      logger.error("Failed to remove wallet:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Lightning address handlers
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
      logger.error("Failed to check username:", error);
      toast({
        title: t("walletSettings.actionFailed"),
        description: "Could not check username availability",
        variant: "destructive",
      });
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const handleRegisterLightningAddress = async () => {
    if (!lnUsername.trim() || !usernameAvailable) return;

    setIsRegisteringLn(true);
    try {
      const address = await registerLightningAddress(
        lnUsername.trim().toLowerCase(),
      );
      setShowLightningAddressDialog(false);
      setLnUsername("");
      setUsernameAvailable(null);

      // Ask user if they want to update their profile
      setNewlyRegisteredAddress(address);
      setShowUpdateProfileDialog(true);
    } catch (error) {
      logger.error("Failed to register Lightning address:", error);
      toast({
        title: t("walletSettings.registrationFailed"),
        description:
          error instanceof Error
            ? error.message
            : "Failed to register Lightning address",
        variant: "destructive",
      });
    } finally {
      setIsRegisteringLn(false);
    }
  };

  const handleUpdateProfile = async () => {
    const addressToSync = newlyRegisteredAddress || lightningAddress;
    if (!user || !addressToSync) return;

    setIsUpdatingProfile(true);
    try {
      const updatedMetadata = { ...metadata, lud16: addressToSync };

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
        title: t("walletSettings.profileUpdated"),
        description: t("walletSettings.profileUpdatedDesc"),
      });

      setShowUpdateProfileDialog(false);
      setNewlyRegisteredAddress(null);
    } catch (error) {
      logger.error("Failed to update profile:", error);
      toast({
        title: t("walletSettings.updateFailed"),
        description: t("walletSettings.updateFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleDeleteLightningAddress = async () => {
    setIsDeletingLn(true);
    try {
      await deleteLightningAddress();
      setShowDeleteLnAddressDialog(false);
    } catch (error) {
      logger.error("Failed to delete Lightning address:", error);
      toast({
        title: t("walletSettings.deletionFailed"),
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete Lightning address",
        variant: "destructive",
      });
    } finally {
      setIsDeletingLn(false);
    }
  };

  const handleRefreshLightningAddress = async () => {
    setIsRefreshingLn(true);
    try {
      await getLightningAddress();
    } catch (error) {
      logger.error("Failed to refresh Lightning address:", error);
    } finally {
      setIsRefreshingLn(false);
    }
  };

  const handleCopySparkAddress = async () => {
    if (!sparkAddress) return;
    try {
      await navigator.clipboard.writeText(sparkAddress);
      setCopiedSparkAddress(true);
      toast({ title: t("walletSettings.copiedToClipboard") });
      setTimeout(() => setCopiedSparkAddress(false), 2000);
    } catch (error) {
      logger.error("Failed to copy Spark address:", error);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Backup Section */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("walletSettings.backupTitle")}
          </CardTitle>
          <CardDescription>{t("walletSettings.backupDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasBackup ? (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription className="space-y-1">
                <div>{t("walletSettings.backedUp")}</div>
                {backupTimestamp && (
                  <div className="text-xs text-muted-foreground">
                    {t("walletSettings.lastBackup")}:{" "}
                    {new Date(backupTimestamp * 1000).toLocaleDateString()}
                    {backupRelays.length > 0 &&
                      ` · ${t("walletSettings.savedOnRelays", { count: backupRelays.length })}`}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("walletSettings.notBackedUp")}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3">
            <Button
              onClick={handleViewRecoveryPhrase}
              variant="outline"
              className="justify-start text-xs sm:text-sm"
              disabled={isLoading}
            >
              <Key className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {t("walletSettings.viewRecoveryPhrase")}
              </span>
            </Button>

            <Button
              onClick={handleSyncToRelays}
              variant="outline"
              className="justify-start text-xs sm:text-sm"
              disabled={isLoading}
            >
              <CloudUpload className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {hasBackup
                  ? t("walletSettings.updateRelayBackup")
                  : t("walletSettings.backupToRelays")}
              </span>
            </Button>

            <Button
              onClick={handleExportBackup}
              variant="outline"
              className="justify-start text-xs sm:text-sm"
              disabled={isLoading}
            >
              <Download className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {t("walletSettings.downloadBackup")}
              </span>
            </Button>

            {hasBackup && (
              <Button
                onClick={() => setShowDeleteDialog(true)}
                variant="ghost"
                className="justify-start text-destructive hover:text-destructive text-xs sm:text-sm"
              >
                <Trash2 className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">
                  {t("walletSettings.deleteRelayBackup")}
                </span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lightning Address Section */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            {t("walletSettings.lightningTitle")}
          </CardTitle>
          <CardDescription>{t("walletSettings.lightningDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lightningAddress ? (
            // Spark wallet has a registered Lightning address
            <>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  {t("walletSettings.yourLightningAddress")}
                </p>
                <p className="text-lg font-mono font-medium break-all">
                  {lightningAddress}
                </p>
              </div>

              {/* Profile sync status */}
              {metadata?.lud16?.toLowerCase().trim() ===
              lightningAddress.toLowerCase().trim() ? (
                // Profile matches wallet address
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="text-sm text-primary flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    {t("walletSettings.profileSynced")}
                  </div>
                </div>
              ) : metadata?.lud16 ? (
                // Profile has different address
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="text-sm">
                    <div className="flex items-center gap-2 mb-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">
                        {t("walletSettings.profileMismatch")}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground ml-6 break-all">
                      {metadata.lud16}
                    </p>
                  </div>
                </div>
              ) : (
                // No address in profile
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("walletSettings.noProfileAddress")}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {metadata?.lud16?.toLowerCase().trim() !==
                  lightningAddress.toLowerCase().trim() && (
                  <Button
                    variant="default"
                    onClick={handleUpdateProfile}
                    disabled={isUpdatingProfile}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    {isUpdatingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        {t("walletSettings.syncToProfile")}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleRefreshLightningAddress}
                  disabled={isRefreshingLn}
                  className={
                    metadata?.lud16?.toLowerCase().trim() ===
                    lightningAddress.toLowerCase().trim()
                      ? "flex-1"
                      : ""
                  }
                >
                  {isRefreshingLn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t("walletSettings.refresh")}
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteLnAddressDialog(true)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("walletSettings.removeAddress")}
                </Button>
              </div>
            </>
          ) : metadata?.lud16 ? (
            // User has a Lightning address in their Nostr profile (but not from Spark)
            <>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  {t("walletSettings.profileAddress")}
                </p>
                <p className="text-lg font-mono font-medium">
                  {metadata.lud16}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("walletSettings.profileAddressNote")}
              </p>
              <Button
                variant="outline"
                onClick={() => setShowLightningAddressDialog(true)}
                className="w-full text-xs sm:text-sm"
              >
                <Zap className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">
                  {t("walletSettings.registerSparkAddress")}
                </span>
              </Button>
            </>
          ) : (
            // No Lightning address at all
            <>
              <Alert>
                <Zap className="h-4 w-4" />
                <AlertDescription>
                  {t("walletSettings.noAddressYet")}
                </AlertDescription>
              </Alert>
              <Button
                onClick={() => setShowLightningAddressDialog(true)}
                className="w-full text-xs sm:text-sm"
              >
                <Zap className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">
                  {t("walletSettings.setupLightningAddress")}
                </span>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Spark Address Section */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {t("walletSettings.sparkAddressTitle")}
          </CardTitle>
          <CardDescription>
            {t("walletSettings.sparkAddressDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sparkAddress ? (
            <>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  {t("walletSettings.yourSparkAddress")}
                </p>
                <p className="text-sm font-mono font-medium break-all">
                  {sparkAddress}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleCopySparkAddress}
                className="w-full"
              >
                {copiedSparkAddress ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-primary" />
                    {t("walletSettings.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    {t("walletSettings.copyAddress")}
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                {t("walletSettings.loadingSparkAddress")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("walletSettings.securityTitle")}
          </CardTitle>
          <CardDescription>{t("walletSettings.securityDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LockTimeoutSettings />
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t("walletSettings.dangerZoneTitle")}
          </CardTitle>
          <CardDescription>
            {t("walletSettings.dangerZoneDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setShowRemoveDialog(true)}
            variant="destructive"
            className="w-full text-xs sm:text-sm"
          >
            <Trash2 className="h-4 w-4 mr-2 flex-shrink-0" />
            <span className="truncate">
              {t("walletSettings.removeWalletFromDevice")}
            </span>
          </Button>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {t("walletSettings.removeWalletNote")}
          </p>
        </CardContent>
      </Card>

      {/* View Recovery Phrase Dialog */}
      <Dialog
        open={showViewMnemonicDialog}
        onOpenChange={(open) => {
          setShowViewMnemonicDialog(open);
          if (!open) {
            setViewMnemonic("");
            setShowWords(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("walletSettings.recoveryPhraseTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("walletSettings.recoveryPhraseDesc")}
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("walletSettings.neverShare")}
            </AlertDescription>
          </Alert>

          <div className="relative">
            {showWords ? (
              <div className="grid grid-cols-3 gap-2 p-4 bg-muted rounded-lg">
                {viewMnemonic.split(" ").map((word, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-5">
                      {index + 1}.
                    </span>
                    <span className="font-mono">{word}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 bg-muted rounded-lg text-center">
                <p className="text-muted-foreground">
                  {t("walletSettings.revealWords")}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowWords(!showWords)}
            >
              {showWords ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  {t("walletSettings.hideWords")}
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  {t("walletSettings.showWords")}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCopyMnemonic}
              disabled={!showWords}
            >
              {copied && clipboardCountdown > 0 ? (
                <>
                  <Clock className="h-4 w-4 mr-2 text-amber-600" />
                  {t("walletSettings.clearsIn", {
                    seconds: clipboardCountdown,
                  })}
                </>
              ) : copied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-primary" />
                  {t("walletSettings.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  {t("walletSettings.copy")}
                </>
              )}
            </Button>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setShowViewMnemonicDialog(false);
                setViewMnemonic("");
                setShowWords(false);
              }}
            >
              {t("walletSettings.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Mnemonic Confirmation Dialog */}
      <AlertDialog open={showCopyConfirm} onOpenChange={setShowCopyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("walletSettings.copyPhraseTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left space-y-2">
                <p>{t("walletSettings.copyPhraseWarning")}</p>
                <p className="font-medium">
                  {t("walletSettings.copyPhraseSecurity")}
                </p>
                <p className="text-amber-600 dark:text-amber-400">
                  {t("walletSettings.copyPhraseNeverShare")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("walletSettings.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopyMnemonicConfirmed}>
              {t("walletSettings.copyToClipboard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mnemonic Entry Dialog (fallback when mnemonic not found in storage) */}
      <Dialog open={showMnemonicDialog} onOpenChange={setShowMnemonicDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t("walletSettings.enterRecoveryTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("walletSettings.enterRecoveryDesc", {
                action:
                  action === "sync"
                    ? t("walletSettings.backupAction")
                    : t("walletSettings.exportAction"),
              })}
            </DialogDescription>
          </DialogHeader>

          <MnemonicInput value={mnemonic} onChange={setMnemonic} />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMnemonicDialog(false)}
            >
              {t("walletSettings.cancel")}
            </Button>
            <Button
              onClick={handleMnemonicSubmit}
              disabled={
                isLoading ||
                mnemonic.split(/\s+/).filter((w) => w).length !== 12
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("walletSettings.processing")}
                </>
              ) : (
                t("walletSettings.continue")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Backup Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("walletSettings.deleteBackupTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("walletSettings.deleteBackupDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("walletSettings.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBackup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("walletSettings.deleting")}
                </>
              ) : (
                t("walletSettings.deleteBackup")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Wallet Confirmation */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("walletSettings.removeWalletTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>{t("walletSettings.removeWalletWarning")}</p>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {t("walletSettings.removeWalletPermanent")}
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="confirm">
                    {t("walletSettings.typeDeleteToConfirm")}
                  </Label>
                  <Input
                    id="confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
              {t("walletSettings.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveWallet}
              disabled={deleteConfirmText !== "DELETE" || isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("walletSettings.removing")}
                </>
              ) : (
                t("walletSettings.removeWallet")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Up Lightning Address Dialog */}
      <Dialog
        open={showLightningAddressDialog}
        onOpenChange={(open) => {
          setShowLightningAddressDialog(open);
          if (!open) {
            setLnUsername("");
            setUsernameAvailable(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              {t("walletSettings.setupAddressTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("walletSettings.setupAddressDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ln-username">
                {t("walletSettings.chooseUsername")}
              </Label>
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
                    placeholder={t("walletSettings.usernamePlaceholder")}
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
                    t("walletSettings.check")
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("walletSettings.yourAddressWillBe", {
                  address: `${lnUsername || "username"}@breez.tips`,
                })}
              </p>
              {usernameAvailable === false && (
                <p className="text-sm text-red-600">
                  {t("walletSettings.usernameTaken")}
                </p>
              )}
              {usernameAvailable === true && (
                <p className="text-sm text-primary">
                  {t("walletSettings.usernameAvailable")}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLightningAddressDialog(false)}
            >
              {t("walletSettings.cancel")}
            </Button>
            <Button
              onClick={handleRegisterLightningAddress}
              disabled={!usernameAvailable || isRegisteringLn}
            >
              {isRegisteringLn ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("walletSettings.registering")}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  {t("walletSettings.getAddress")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lightning Address Confirmation */}
      <AlertDialog
        open={showDeleteLnAddressDialog}
        onOpenChange={setShowDeleteLnAddressDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("walletSettings.removeAddressTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("walletSettings.removeAddressDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("walletSettings.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLightningAddress}
              disabled={isDeletingLn}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingLn ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("walletSettings.removing")}
                </>
              ) : (
                t("walletSettings.removeAddressButton")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Profile Dialog */}
      <Dialog
        open={showUpdateProfileDialog}
        onOpenChange={(open) => {
          if (!open && !isUpdatingProfile) {
            setShowUpdateProfileDialog(false);
            setNewlyRegisteredAddress(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              {t("walletSettings.addToProfileTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("walletSettings.addToProfileDesc")}
            </DialogDescription>
          </DialogHeader>

          {newlyRegisteredAddress && (
            <div className="p-4 bg-muted rounded-lg text-center overflow-hidden">
              <p className="text-sm text-muted-foreground mb-1">
                {t("walletSettings.yourNewAddress")}
              </p>
              <p className="text-lg font-mono font-medium break-all">
                {newlyRegisteredAddress}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowUpdateProfileDialog(false);
                setNewlyRegisteredAddress(null);
              }}
              disabled={isUpdatingProfile}
              className="sm:flex-1"
            >
              {t("walletSettings.skip")}
            </Button>
            <Button
              onClick={handleUpdateProfile}
              disabled={isUpdatingProfile}
              className="sm:flex-1"
            >
              {isUpdatingProfile ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("walletSettings.updating")}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t("walletSettings.addToProfile")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
