/**
 * Spark Wallet Context Provider
 * Manages wallet state and provides methods for wallet operations
 * Based on Primal's implementation for compatibility
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useNostr } from "@nostrify/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import {
  breezService,
  type BreezPaymentInfo,
  type UnclaimedDepositInfo,
  type RecommendedFeesInfo,
} from "@/lib/spark/breezService";
import type { SdkEvent } from "@breeztech/breez-sdk-spark/web";
import { logger } from "@/lib/logger";

/** Payment event handler type */
export type PaymentEventHandler = (event: SdkEvent) => void;
import {
  saveEncryptedSeed,
  loadEncryptedSeed,
  isSparkWalletConfigured,
  saveSparkConfig,
  loadSparkConfig,
  clearAllSparkData,
  storeMnemonicSession,
  getMnemonicSession,
  clearMnemonicSession,
  setLockTimeout as setLockTimeoutStorage,
  updateLastActivity,
  shouldAutoLock,
} from "@/lib/spark/store";
import type { LockTimeoutMinutes } from "@/lib/spark/types";
import {
  createBackupEvent,
  decryptBackupEvent,
  fetchBackup,
  publishBackup,
  deleteBackup,
  exportToFile,
  importFromFile,
  downloadBackupFile,
  checkRelayBackupInfo,
} from "@/lib/spark/backup";

export type SparkWalletDiagnostics = {
  identityPubkey: string | null;
  sdkBalance: number | null;
  cachedBalance: number;
  paymentCount: number;
  completedReceiveTotal: number;
  completedSendTotal: number;
  pendingReceiveTotal: number;
  latestPayment:
    | Pick<
        BreezPaymentInfo,
        "id" | "amount" | "paymentType" | "status" | "timestamp"
      >
    | null;
};

/** Context value type */
export interface SparkWalletContextValue {
  // State
  isInitialized: boolean;
  isConnecting: boolean;
  isEnabled: boolean;
  balance: number;
  hasWallet: boolean;
  hasBackup: boolean;
  isCheckingBackup: boolean;
  sparkAddress: string | null;
  bitcoinAddress: string | null;
  payments: BreezPaymentInfo[];
  isLoadingPayments: boolean;
  hasMorePayments: boolean;
  loadMorePayments: () => Promise<void>;

  // Wallet Management
  createWallet: () => Promise<string>;
  restoreFromMnemonic: (mnemonic: string) => Promise<void>;
  restoreFromRelay: () => Promise<void>;
  restoreFromFile: (file: File) => Promise<void>;
  disconnect: () => Promise<void>;
  removeWallet: () => Promise<void>;

  // Backup Management
  syncToRelays: (mnemonic: string) => Promise<void>;
  exportBackup: (mnemonic: string) => Promise<void>;
  deleteRelayBackup: () => Promise<void>;
  checkRelayBackup: () => Promise<boolean>;
  backupTimestamp: number | null;
  backupRelays: string[];

  // Payments
  payInvoice: (invoice: string) => Promise<BreezPaymentInfo>;
  payLightningAddress: (
    address: string,
    amountSat: number,
    comment?: string,
  ) => Promise<BreezPaymentInfo>;
  prepareBitcoinPayment: (
    address: string,
    amountSats?: number,
  ) => Promise<unknown>;
  payBitcoinAddress: (
    preparedPayment: unknown,
    confirmationSpeed?: "fast" | "medium" | "slow",
  ) => Promise<BreezPaymentInfo>;
  createInvoice: (amountSat: number, description?: string) => Promise<string>;
  getSparkAddress: () => Promise<string>;
  getBitcoinAddress: () => Promise<string>;

  // Lightning Address Management
  lightningAddress: string | null;
  getLightningAddress: () => Promise<string | null>;
  checkLightningAddressAvailable: (username: string) => Promise<boolean>;
  registerLightningAddress: (
    username: string,
    description?: string,
  ) => Promise<string>;
  deleteLightningAddress: () => Promise<void>;

  // Utility
  refreshBalance: () => Promise<void>;
  refreshPayments: () => Promise<void>;
  getDiagnostics: () => Promise<SparkWalletDiagnostics>;
  setEnabled: (enabled: boolean) => void;
  parseInput: (
    input: string,
  ) => Promise<{ type: string; data: unknown; amountSat?: number }>;

  // Get current mnemonic (from session or encrypted storage)
  getMnemonic: () => Promise<string | null>;

  // Event subscriptions - for listening to payment events
  subscribeToPaymentEvents: (handler: PaymentEventHandler) => () => void;

  // Last received payment (updated when a payment is received)
  lastReceivedPayment: BreezPaymentInfo | null;

  // Lock Management
  isLocked: boolean;
  lockTimeout: LockTimeoutMinutes;
  lockWallet: () => void;
  unlockWallet: () => Promise<void>;
  setLockTimeout: (timeout: LockTimeoutMinutes) => void;

  // On-chain Deposit Claiming
  unclaimedDeposits: UnclaimedDepositInfo[];
  isLoadingDeposits: boolean;
  isSyncing: boolean;
  syncWallet: () => Promise<void>;
  refreshUnclaimedDeposits: () => Promise<void>;
  getRecommendedFees: () => Promise<RecommendedFeesInfo>;
  claimDeposit: (
    txid: string,
    vout: number,
    maxFeeSats: number,
  ) => Promise<void>;
  claimDepositWithNetworkFee: (
    txid: string,
    vout: number,
    leewaySatPerVbyte?: number,
  ) => Promise<void>;
  refundDeposit: (
    txid: string,
    vout: number,
    destinationAddress: string,
    feeSatPerVbyte: number,
  ) => Promise<void>;
}

const SparkWalletContext = createContext<SparkWalletContextValue | null>(null);
const PAYMENTS_PAGE_SIZE = 30;
const getTimestampStats = (
  paymentList: BreezPaymentInfo[],
): { oldest: number; newest: number } | null => {
  const timestamps = paymentList
    .map((payment) => Number(payment.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length === 0) {
    return null;
  }

  return {
    oldest: Math.min(...timestamps),
    newest: Math.max(...timestamps),
  };
};

export function SparkWalletProvider({ children }: { children: ReactNode }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  // Local state
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isEnabled, setIsEnabledState] = useState(true);
  const [balance, setBalance] = useState(0);
  const [hasWallet, setHasWallet] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [isCheckingBackup, setIsCheckingBackup] = useState(false);
  const [backupTimestamp, setBackupTimestamp] = useState<number | null>(null);
  const [backupRelays, setBackupRelays] = useState<string[]>([]);
  const [sparkAddress, setSparkAddress] = useState<string | null>(null);
  const [bitcoinAddress, setBitcoinAddress] = useState<string | null>(null);
  const [payments, setPayments] = useState<BreezPaymentInfo[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [hasMorePayments, setHasMorePayments] = useState(true);
  const [oldestPaymentTimestamp, setOldestPaymentTimestamp] = useState<
    number | null
  >(null);
  const [lastReceivedPayment, setLastReceivedPayment] =
    useState<BreezPaymentInfo | null>(null);
  const [lightningAddress, setLightningAddress] = useState<string | null>(null);

  // Lock state
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState<LockTimeoutMinutes>(0);
  const autoLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unclaimed deposits state
  const [unclaimedDeposits, setUnclaimedDeposits] = useState<
    UnclaimedDepositInfo[]
  >([]);
  const [isLoadingDeposits, setIsLoadingDeposits] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Payment event subscribers
  const paymentEventHandlersRef = useRef<Set<PaymentEventHandler>>(new Set());
  const sdkListenerIdRef = useRef<string | null>(null);

  // Check if wallet is configured when user changes
  useEffect(() => {
    if (user?.pubkey) {
      const configured = isSparkWalletConfigured(user.pubkey);
      setHasWallet(configured);

      // Load cached config
      const config = loadSparkConfig(user.pubkey);
      if (config) {
        setBalance(config.cachedBalance || 0);
        setIsEnabledState(config.isEnabled !== false);
        setLockTimeoutState(config.lockTimeout ?? 0);
      }

      // Check if wallet should be locked due to inactivity
      if (configured && shouldAutoLock(user.pubkey)) {
        setIsLocked(true);
        clearMnemonicSession();
        logger.debug("[SparkWallet] Wallet auto-locked due to inactivity");
      }
    } else {
      setHasWallet(false);
      setIsInitialized(false);
      setIsLocked(false);
    }
  }, [user?.pubkey]);

  // Auto-connect when user logs in with existing wallet
  useEffect(() => {
    const autoConnect = async () => {
      if (
        !user?.pubkey ||
        !user?.signer ||
        !hasWallet ||
        isInitialized ||
        isConnecting ||
        isLocked
      ) {
        return;
      }

      // First try session mnemonic (encrypted with NIP-44)
      try {
        const sessionMnemonic = await getMnemonicSession(
          user.pubkey,
          user.signer,
        );
        if (sessionMnemonic) {
          try {
            setIsConnecting(true);
            await breezService.connect(sessionMnemonic, "mainnet");
            updateStateFromSDK();
            setIsInitialized(true);
            logger.debug("[SparkWallet] Auto-connected from session");

            // Load payment history after successful connect
            loadPaymentHistory();
            return;
          } catch (error) {
            logger.warn("[SparkWallet] Session auto-connect failed:", error);
            clearMnemonicSession();
          } finally {
            setIsConnecting(false);
          }
        }
      } catch (error) {
        logger.warn("[SparkWallet] Failed to read session mnemonic:", error);
      }

      // Then try encrypted local storage
      try {
        setIsConnecting(true);
        const mnemonic = await loadEncryptedSeed(user.pubkey, user.signer);
        if (mnemonic) {
          await breezService.connect(mnemonic, "mainnet");
          await storeMnemonicSession(mnemonic, user.pubkey, user.signer);
          updateStateFromSDK();
          setIsInitialized(true);
          logger.debug("[SparkWallet] Auto-connected from encrypted storage");

          // Load payment history after successful connect
          loadPaymentHistory();
        }
      } catch (error) {
        logger.warn(
          "[SparkWallet] Encrypted storage auto-connect failed:",
          error,
        );
      } finally {
        setIsConnecting(false);
      }
    };

    // Helper to load payment history (defined inline to avoid dependency issues)
    const loadPaymentHistory = async () => {
      if (!breezService.isConnected()) return;
      setIsLoadingPayments(true);
      try {
        const paymentList = await breezService.getPaymentHistory({
          limit: PAYMENTS_PAGE_SIZE,
          sortAscending: false,
        });
        const sorted = [...paymentList].sort(
          (a, b) => Number(b.timestamp) - Number(a.timestamp),
        );
        setPayments(sorted);
        setHasMorePayments(sorted.length > 0);

        if (sorted.length > 0) {
          const stats = getTimestampStats(sorted);
          setOldestPaymentTimestamp(stats ? stats.oldest : null);
          const latestReceive =
            sorted.find((payment) => payment.paymentType === "receive") ?? null;
          setLastReceivedPayment(latestReceive);
        } else {
          setOldestPaymentTimestamp(null);
          setLastReceivedPayment(null);
        }
      } catch (error) {
        logger.error("[SparkWallet] Failed to load payments:", error);
      } finally {
        setIsLoadingPayments(false);
      }
    };

    autoConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.pubkey,
    user?.signer,
    hasWallet,
    isInitialized,
    isConnecting,
    isLocked,
  ]);

  // Check for relay backup when user logs in (if no local wallet)
  useEffect(() => {
    if (user?.pubkey && !hasWallet && !isInitialized) {
      checkRelayBackup().catch((error) => {
        // Silently catch errors from relay backup check to prevent UI disruption
        // This is a background operation that shouldn't interrupt normal app usage
        logger.debug("[SparkWallet] Relay backup check failed (non-critical):", error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.pubkey, hasWallet, isInitialized]);

  // Update state from SDK
  const updateStateFromSDK = useCallback(() => {
    const state = breezService.getState();
    setBalance(state.balance);

    // Update cached config
    if (user?.pubkey) {
      saveSparkConfig(user.pubkey, {
        hasWallet: true,
        isEnabled: true,
        cachedBalance: state.balance,
        lastSynced: Date.now(),
      });
    }
  }, [user?.pubkey]);

  // Auto-lock timer and activity tracking
  useEffect(() => {
    // Clear any existing timer
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = null;
    }

    // If wallet is not initialized, locked, or no timeout set, don't start timer
    if (!isInitialized || isLocked || lockTimeout === 0 || !user?.pubkey) {
      return;
    }

    const timeoutMs = lockTimeout * 60 * 1000;

    // Start auto-lock timer
    const startTimer = () => {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
      }
      autoLockTimerRef.current = setTimeout(() => {
        logger.debug("[SparkWallet] Auto-locking wallet due to inactivity");
        setIsLocked(true);
        clearMnemonicSession();
        breezService.disconnect().catch(logger.error);
        setIsInitialized(false);
      }, timeoutMs);
    };

    // Reset timer on user activity
    const handleActivity = () => {
      if (user?.pubkey) {
        updateLastActivity(user.pubkey);
      }
      startTimer();
    };

    // Start initial timer
    startTimer();

    // Track user activity
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isInitialized, isLocked, lockTimeout, user?.pubkey]);

  // Lock wallet function
  const lockWallet = useCallback(() => {
    if (!isInitialized) return;

    logger.debug("[SparkWallet] Manually locking wallet");
    setIsLocked(true);
    clearMnemonicSession();
    breezService.disconnect().catch(logger.error);
    setIsInitialized(false);
    setSparkAddress(null);
    setBitcoinAddress(null);

    toast({
      title: "Wallet locked",
      description: "Your wallet has been locked for security.",
    });
  }, [isInitialized, toast]);

  // Unlock wallet function (re-authenticates with encrypted storage)
  const unlockWallet = useCallback(async () => {
    if (!isLocked || !user?.pubkey || !user?.signer) {
      return;
    }

    try {
      setIsConnecting(true);
      const mnemonic = await loadEncryptedSeed(user.pubkey, user.signer);
      if (!mnemonic) {
        throw new Error("No wallet found. Please restore your wallet.");
      }

      await breezService.connect(mnemonic, "mainnet");
      await storeMnemonicSession(mnemonic, user.pubkey, user.signer);
      updateLastActivity(user.pubkey);

      updateStateFromSDK();
      setIsInitialized(true);
      setIsLocked(false);

      logger.debug("[SparkWallet] Wallet unlocked");
      toast({
        title: "Wallet unlocked",
        description: "Your wallet is now accessible.",
      });
    } catch (error) {
      logger.error("[SparkWallet] Failed to unlock wallet:", error);
      toast({
        title: "Unlock failed",
        description:
          error instanceof Error ? error.message : "Failed to unlock wallet",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [isLocked, user?.pubkey, user?.signer, toast, updateStateFromSDK]);

  // Set lock timeout function
  const handleSetLockTimeout = useCallback(
    (timeout: LockTimeoutMinutes) => {
      setLockTimeoutState(timeout);
      if (user?.pubkey) {
        setLockTimeoutStorage(timeout, user.pubkey);
        updateLastActivity(user.pubkey);
      }
      logger.debug("[SparkWallet] Lock timeout set to", timeout, "minutes");
    },
    [user?.pubkey],
  );

  // Connect wallet with mnemonic
  const connectWallet = useCallback(
    async (mnemonic: string) => {
      if (isConnecting || isInitialized) return;

      setIsConnecting(true);
      try {
        await breezService.connect(mnemonic, "mainnet");

        // Store encrypted in localStorage and session if user is logged in
        if (user?.pubkey && user?.signer) {
          await saveEncryptedSeed(mnemonic, user.pubkey, user.signer);
          // Store in session for quick reconnect (also encrypted with NIP-44)
          await storeMnemonicSession(mnemonic, user.pubkey, user.signer);
        }

        // Update state
        updateStateFromSDK();
        setIsInitialized(true);

        // Load addresses and payment history
        try {
          const [spark, btc, lnAddress] = await Promise.all([
            breezService.getSparkAddress(),
            breezService.getBitcoinAddress(),
            breezService.getLightningAddress(),
          ]);
          setSparkAddress(spark);
          setBitcoinAddress(btc);
          setLightningAddress(lnAddress?.lightningAddress ?? null);
        } catch (error) {
          logger.warn("[SparkWallet] Failed to get addresses:", error);
        }

        refreshPayments();
      } catch (error) {
        logger.error("[SparkWallet] Failed to connect:", error);
        toast({
          title: "Connection failed",
          description:
            error instanceof Error ? error.message : "Failed to connect wallet",
          variant: "destructive",
        });
        throw error;
      } finally {
        setIsConnecting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshPayments is defined later but stable
    [
      isConnecting,
      isInitialized,
      user?.pubkey,
      user?.signer,
      toast,
      updateStateFromSDK,
    ],
  );

  // Create new wallet
  const createWallet = useCallback(async (): Promise<string> => {
    const mnemonic = breezService.generateMnemonic();

    await connectWallet(mnemonic);
    setHasWallet(true);

    // Note: Toast removed - the CreateWallet component now guides users
    // through a multi-step backup flow with visual progress indicator

    return mnemonic;
  }, [connectWallet]);

  // Restore from mnemonic
  const restoreFromMnemonic = useCallback(
    async (mnemonic: string) => {
      if (!breezService.validateMnemonic(mnemonic)) {
        throw new Error("Invalid recovery phrase");
      }

      await connectWallet(mnemonic);
      setHasWallet(true);

      toast({
        title: "Wallet restored",
        description: "Your Spark wallet has been restored successfully.",
      });
    },
    [connectWallet, toast],
  );

  // Restore from relay backup
  const restoreFromRelay = useCallback(async () => {
    if (!user?.pubkey || !user?.signer) {
      throw new Error("You must be logged in to restore from relay");
    }

    toast({
      title: "Searching for backup...",
      description: "Looking for your wallet backup on Nostr relays.",
    });

    const event = await fetchBackup(nostr, user.pubkey);
    if (!event) {
      throw new Error("No backup found on relays");
    }

    const mnemonic = await decryptBackupEvent(event, user.signer);
    if (!mnemonic) {
      throw new Error("Failed to decrypt backup");
    }

    await restoreFromMnemonic(mnemonic);
    setHasBackup(true);
  }, [user, nostr, restoreFromMnemonic, toast]);

  // Restore from file
  const restoreFromFile = useCallback(
    async (file: File) => {
      if (!user?.pubkey || !user?.signer) {
        throw new Error("You must be logged in to restore from file");
      }

      const mnemonic = await importFromFile(file, user.pubkey, user.signer);
      await restoreFromMnemonic(mnemonic);
    },
    [user, restoreFromMnemonic],
  );

  // Disconnect wallet (keep local data)
  const disconnect = useCallback(async () => {
    await breezService.disconnect();
    clearMnemonicSession();
    setIsInitialized(false);
    setSparkAddress(null);
    setBitcoinAddress(null);
    // Keep hasWallet, balance, etc. for quick reconnect
  }, []);

  // Remove wallet completely
  const removeWallet = useCallback(async () => {
    await breezService.disconnect();

    if (user?.pubkey) {
      clearAllSparkData(user.pubkey);
    }
    clearMnemonicSession();

    setIsInitialized(false);
    setHasWallet(false);
    setIsEnabledState(true);
    setBalance(0);
    setSparkAddress(null);
    setBitcoinAddress(null);
    setPayments([]);
    setHasBackup(false);

    toast({
      title: "Wallet removed",
      description: "Your wallet has been removed from this device.",
    });
  }, [user?.pubkey, toast]);

  // Sync backup to relays
  const syncToRelays = useCallback(
    async (mnemonic: string) => {
      if (!user?.pubkey || !user?.signer) {
        throw new Error("You must be logged in to backup to relays");
      }

      const event = await createBackupEvent(mnemonic, user.pubkey, user.signer);
      await publishBackup(nostr, event);
      setHasBackup(true);

      toast({
        title: "Backup saved",
        description:
          "Your wallet backup has been encrypted and saved to Nostr relays.",
      });
    },
    [user, nostr, toast],
  );

  // Export backup to file
  const exportBackup = useCallback(
    async (mnemonic: string) => {
      if (!user?.pubkey || !user?.signer) {
        throw new Error("You must be logged in to export backup");
      }

      const blob = await exportToFile(mnemonic, user.pubkey, user.signer);
      downloadBackupFile(blob);

      toast({
        title: "Backup exported",
        description: "Your encrypted backup file has been downloaded.",
      });
    },
    [user, toast],
  );

  // Delete relay backup
  const deleteRelayBackup = useCallback(async () => {
    if (!user?.pubkey || !user?.signer) {
      throw new Error("You must be logged in to delete backup");
    }

    await deleteBackup(nostr, user.pubkey, user.signer);
    setHasBackup(false);

    toast({
      title: "Backup deleted",
      description: "Your relay backup has been removed.",
    });
  }, [user, nostr, toast]);

  // Check for relay backup
  const checkRelayBackup = useCallback(async (): Promise<boolean> => {
    if (!user?.pubkey) return false;

    setIsCheckingBackup(true);
    try {
      const info = await checkRelayBackupInfo(nostr, user.pubkey);
      setHasBackup(info.exists);
      setBackupTimestamp(info.timestamp);
      setBackupRelays(info.relays);
      return info.exists;
    } catch (error) {
      logger.error("[SparkWallet] Failed to check relay backup:", error);
      return false;
    } finally {
      setIsCheckingBackup(false);
    }
  }, [user?.pubkey, nostr]);

  // Payment operations
  const payInvoice = useCallback(
    async (invoice: string): Promise<BreezPaymentInfo> => {
      const payment = await breezService.sendPayment(invoice);
      await refreshBalance();
      await refreshPayments();

      toast({
        title: "Payment sent",
        description: `Sent ${payment.amount} sats`,
      });

      return payment;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh functions are defined later but stable
    [toast],
  );

  const payLightningAddress = useCallback(
    async (
      address: string,
      amountSat: number,
      comment?: string,
    ): Promise<BreezPaymentInfo> => {
      // Parse the lightning address
      const parsed = (await breezService.parseInput(address)) as {
        type: string;
        payRequest?: unknown;
      };

      if (parsed.type !== "lnurlPay" && parsed.type !== "lightningAddress") {
        throw new Error("Invalid Lightning address");
      }

      // For Lightning addresses, the pay request data is nested in parsed.payRequest
      // For lnurlPay, the data is in parsed directly
      const payRequest =
        parsed.type === "lightningAddress" ? parsed.payRequest : parsed;

      if (!payRequest) {
        throw new Error("Could not resolve Lightning address");
      }

      // Prepare and execute LNURL pay
      const prepareResponse = await breezService.prepareLnurlPay(
        amountSat,
        payRequest,
        comment,
      );
      await breezService.lnurlPay(prepareResponse);

      await refreshBalance();
      await refreshPayments();

      toast({
        title: "Payment sent",
        description: `Sent ${amountSat} sats to ${address}`,
      });

      // Return a simplified payment info
      return {
        id: "lnurl-payment",
        amount: amountSat,
        fees: 0,
        paymentType: "send",
        status: "completed",
        timestamp: Math.floor(Date.now() / 1000),
        description: comment,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh functions are defined later but stable
    [toast],
  );

  // Prepare Bitcoin on-chain payment (validates address and gets fee quotes)
  const prepareBitcoinPayment = useCallback(
    async (address: string, amountSats?: number): Promise<unknown> => {
      return await breezService.prepareBitcoinPayment(address, amountSats);
    },
    [],
  );

  // Send Bitcoin on-chain payment
  const payBitcoinAddress = useCallback(
    async (
      preparedPayment: unknown,
      confirmationSpeed: "fast" | "medium" | "slow" = "medium",
    ): Promise<BreezPaymentInfo> => {
      const payment = await breezService.sendBitcoinPayment(
        preparedPayment as Parameters<typeof breezService.sendBitcoinPayment>[0],
        confirmationSpeed,
      );

      await refreshBalance();
      await refreshPayments();

      toast({
        title: "Bitcoin sent",
        description: `Sent ${payment.amount} sats on-chain`,
      });

      return payment;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh functions are defined later but stable
    [toast],
  );

  const createInvoice = useCallback(
    async (amountSat: number, description?: string): Promise<string> => {
      return await breezService.createInvoice(amountSat, description);
    },
    [],
  );

  const getSparkAddress = useCallback(async (): Promise<string> => {
    const address = await breezService.getSparkAddress();
    setSparkAddress(address);
    return address;
  }, []);

  const getBitcoinAddress = useCallback(async (): Promise<string> => {
    const address = await breezService.getBitcoinAddress();
    setBitcoinAddress(address);
    return address;
  }, []);

  // Lightning Address Management
  const getLightningAddress = useCallback(async (): Promise<string | null> => {
    if (!breezService.isConnected()) return null;

    try {
      const addressInfo = await breezService.getLightningAddress();
      const address = addressInfo?.lightningAddress ?? null;
      setLightningAddress(address);
      return address;
    } catch (error) {
      logger.error("[SparkWallet] Failed to get Lightning address:", error);
      return null;
    }
  }, []);

  const checkLightningAddressAvailable = useCallback(
    async (username: string): Promise<boolean> => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }
      return await breezService.checkLightningAddressAvailable(username);
    },
    [],
  );

  const registerLightningAddress = useCallback(
    async (username: string, description?: string): Promise<string> => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }

      const addressInfo = await breezService.registerLightningAddress(
        username,
        description,
      );
      const address = addressInfo.lightningAddress;
      setLightningAddress(address);

      toast({
        title: "Lightning address registered",
        description: `Your new address: ${address}`,
      });

      return address;
    },
    [toast],
  );

  const deleteLightningAddress = useCallback(async (): Promise<void> => {
    if (!breezService.isConnected()) {
      throw new Error("Wallet not connected");
    }

    await breezService.deleteLightningAddress();
    setLightningAddress(null);

    toast({
      title: "Lightning address deleted",
      description: "Your Lightning address has been removed.",
    });
  }, [toast]);

  // Refresh operations
  const refreshBalance = useCallback(async () => {
    if (!breezService.isConnected()) return;

    const newBalance = await breezService.getBalance();
    setBalance(newBalance);

    if (user?.pubkey) {
      const config = loadSparkConfig(user.pubkey) || {};
      saveSparkConfig(user.pubkey, {
        ...config,
        cachedBalance: newBalance,
        lastSynced: Date.now(),
      });
    }
  }, [user?.pubkey]);

  const getDiagnostics = useCallback(async (): Promise<SparkWalletDiagnostics> => {
    const emptyDiagnostics: SparkWalletDiagnostics = {
      identityPubkey: null,
      sdkBalance: null,
      cachedBalance: balance,
      paymentCount: payments.length,
      completedReceiveTotal: 0,
      completedSendTotal: 0,
      pendingReceiveTotal: 0,
      latestPayment: null,
    };

    if (!breezService.isConnected()) {
      return emptyDiagnostics;
    }

    await breezService.syncWallet();
    const [info, paymentList] = await Promise.all([
      breezService.getInfo(),
      breezService.getPaymentHistory({
        limit: PAYMENTS_PAGE_SIZE,
        sortAscending: false,
      }),
    ]);
    const sorted = [...paymentList].sort(
      (a, b) => Number(b.timestamp) - Number(a.timestamp),
    );

    const completedReceiveTotal = sorted
      .filter(
        (payment) =>
          payment.paymentType === "receive" && payment.status === "completed",
      )
      .reduce((total, payment) => total + payment.amount, 0);
    const completedSendTotal = sorted
      .filter(
        (payment) =>
          payment.paymentType === "send" && payment.status === "completed",
      )
      .reduce((total, payment) => total + payment.amount + payment.fees, 0);
    const pendingReceiveTotal = sorted
      .filter(
        (payment) =>
          payment.paymentType === "receive" && payment.status === "pending",
      )
      .reduce((total, payment) => total + payment.amount, 0);
    const latestPayment = sorted[0]
      ? {
          id: sorted[0].id,
          amount: sorted[0].amount,
          paymentType: sorted[0].paymentType,
          status: sorted[0].status,
          timestamp: sorted[0].timestamp,
        }
      : null;

    setBalance(info.balanceSats);
    setPayments(sorted);

    return {
      identityPubkey: info.identityPubkey,
      sdkBalance: info.balanceSats,
      cachedBalance: balance,
      paymentCount: sorted.length,
      completedReceiveTotal,
      completedSendTotal,
      pendingReceiveTotal,
      latestPayment,
    };
  }, [balance, payments.length]);

  const refreshPayments = useCallback(async () => {
    if (!breezService.isConnected()) return;

    setIsLoadingPayments(true);
    try {
      const paymentList = await breezService.getPaymentHistory({
        limit: PAYMENTS_PAGE_SIZE,
        sortAscending: false,
      });
      // Sort by timestamp descending (most recent first)
      const sorted = [...paymentList].sort(
        (a, b) => Number(b.timestamp) - Number(a.timestamp),
      );
      setPayments(sorted);
      setHasMorePayments(sorted.length > 0);

      if (sorted.length > 0) {
        const stats = getTimestampStats(sorted);
        setOldestPaymentTimestamp(stats ? stats.oldest : null);
        const latestReceive =
          sorted.find((payment) => payment.paymentType === "receive") ?? null;
        setLastReceivedPayment(latestReceive);
      } else {
        setOldestPaymentTimestamp(null);
        setLastReceivedPayment(null);
      }
    } catch (error) {
      logger.error("[SparkWallet] Failed to load payments:", error);
    } finally {
      setIsLoadingPayments(false);
    }
  }, []);

  const loadMorePayments = useCallback(async () => {
    if (!breezService.isConnected()) {
      return;
    }

    if (isLoadingPayments) {
      return;
    }

    if (!hasMorePayments) {
      return;
    }

    if (oldestPaymentTimestamp === null) {
      setHasMorePayments(false);
      return;
    }
    if (!Number.isFinite(oldestPaymentTimestamp)) {
      setOldestPaymentTimestamp(null);
      setHasMorePayments(false);
      return;
    }

    setIsLoadingPayments(true);
    try {
      const paymentList = await breezService.getPaymentHistory({
        limit: PAYMENTS_PAGE_SIZE,
        sortAscending: false,
        toTimestamp: oldestPaymentTimestamp - 1,
      });
      if (paymentList.length > 0) {
        // Sort new payments by timestamp descending and append
        const sorted = [...paymentList].sort(
          (a, b) => Number(b.timestamp) - Number(a.timestamp),
        );
        const existingIds = new Set(payments.map((payment) => payment.id));
        const deduped = sorted.filter(
          (payment) => !existingIds.has(payment.id),
        );
        if (deduped.length === 0) {
          setHasMorePayments(false);
          return;
        }
        const updatedPayments = [...payments, ...deduped];
        setPayments(updatedPayments);
        const stats = getTimestampStats(updatedPayments);
        setOldestPaymentTimestamp(stats ? stats.oldest : null);
        if (!stats) {
          setHasMorePayments(false);
          return;
        }
      } else {
        setHasMorePayments(false);
      }
      setHasMorePayments(paymentList.length > 0);
    } catch (error) {
      logger.error("[SparkWallet] Failed to load more payments:", error);
    } finally {
      setIsLoadingPayments(false);
    }
  }, [
    hasMorePayments,
    isLoadingPayments,
    oldestPaymentTimestamp,
    payments,
  ]);

  // Set enabled state
  const setEnabled = useCallback(
    (enabled: boolean) => {
      setIsEnabledState(enabled);

      if (user?.pubkey) {
        const config = loadSparkConfig(user.pubkey) || {};
        saveSparkConfig(user.pubkey, {
          ...config,
          isEnabled: enabled,
        });
      }

      if (!enabled && isInitialized) {
        disconnect();
      }
    },
    [user?.pubkey, isInitialized, disconnect],
  );

  // Parse input
  const parseInput = useCallback(
    async (
      input: string,
    ): Promise<{ type: string; data: unknown; amountSat?: number }> => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }
      const result = await breezService.parseInput(input);

      let amountSat: number | undefined;
      if (
        (result as { type: string; amountMsat?: number }).type ===
        "bolt11Invoice"
      ) {
        const bolt11 = result as { amountMsat?: number };
        if (bolt11.amountMsat) {
          amountSat = Math.floor(Number(bolt11.amountMsat) / 1000);
        }
      }

      return {
        type: (result as { type: string }).type,
        data: result,
        amountSat,
      };
    },
    [],
  );

  // Get mnemonic from session or encrypted storage
  const getMnemonic = useCallback(async (): Promise<string | null> => {
    if (!user?.pubkey || !user?.signer) {
      return null;
    }

    // First try session storage (fastest, encrypted with NIP-44)
    try {
      const sessionMnemonic = await getMnemonicSession(
        user.pubkey,
        user.signer,
      );
      if (sessionMnemonic) {
        return sessionMnemonic;
      }
    } catch (error) {
      logger.warn("[SparkWallet] Failed to read session mnemonic:", error);
    }

    // Then try encrypted localStorage
    try {
      const mnemonic = await loadEncryptedSeed(user.pubkey, user.signer);
      if (mnemonic) {
        // Store in session for faster access next time
        await storeMnemonicSession(mnemonic, user.pubkey, user.signer);
        return mnemonic;
      }
    } catch (error) {
      logger.error(
        "[SparkWallet] Failed to load mnemonic from storage:",
        error,
      );
    }

    return null;
  }, [user?.pubkey, user?.signer]);

  // On-chain Deposit Claiming Methods
  const refreshUnclaimedDeposits = useCallback(async () => {
    if (!breezService.isConnected()) return;

    setIsLoadingDeposits(true);
    try {
      const deposits = await breezService.listUnclaimedDeposits();
      setUnclaimedDeposits(deposits);
    } catch (error) {
      logger.error("[SparkWallet] Failed to list unclaimed deposits:", error);
    } finally {
      setIsLoadingDeposits(false);
    }
  }, []);

  const syncWallet = useCallback(async () => {
    if (!breezService.isConnected()) return;

    setIsSyncing(true);
    try {
      logger.debug("[SparkWallet] Manually syncing wallet...");
      await breezService.syncWallet();

      // Refresh everything after sync
      await Promise.all([
        refreshBalance(),
        refreshPayments(),
        refreshUnclaimedDeposits(),
      ]);

      logger.debug("[SparkWallet] Manual sync complete");
    } catch (error) {
      logger.error("[SparkWallet] Failed to sync wallet:", error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshBalance, refreshPayments, refreshUnclaimedDeposits]);

  const getRecommendedFees =
    useCallback(async (): Promise<RecommendedFeesInfo> => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }
      return await breezService.getRecommendedFees();
    }, []);

  const claimDeposit = useCallback(
    async (txid: string, vout: number, maxFeeSats: number) => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }

      await breezService.claimDeposit(txid, vout, maxFeeSats);

      toast({
        title: "Deposit claimed",
        description: "Your on-chain deposit has been claimed successfully.",
      });

      // Refresh balance and deposits list
      await refreshBalance();
      await refreshUnclaimedDeposits();
    },
    [toast, refreshBalance, refreshUnclaimedDeposits],
  );

  const claimDepositWithNetworkFee = useCallback(
    async (txid: string, vout: number, leewaySatPerVbyte: number = 1) => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }

      await breezService.claimDepositWithNetworkFee(
        txid,
        vout,
        leewaySatPerVbyte,
      );

      toast({
        title: "Deposit claimed",
        description: "Your on-chain deposit has been claimed successfully.",
      });

      // Refresh balance and deposits list
      await refreshBalance();
      await refreshUnclaimedDeposits();
    },
    [toast, refreshBalance, refreshUnclaimedDeposits],
  );

  const refundDeposit = useCallback(
    async (
      txid: string,
      vout: number,
      destinationAddress: string,
      feeSatPerVbyte: number,
    ) => {
      if (!breezService.isConnected()) {
        throw new Error("Wallet not connected");
      }

      const response = await breezService.refundDeposit(
        txid,
        vout,
        destinationAddress,
        feeSatPerVbyte,
      );

      toast({
        title: "Deposit refunded",
        description: `Refund transaction sent. TX ID: ${response.txId.slice(0, 8)}...`,
      });

      // Refresh deposits list
      await refreshUnclaimedDeposits();
    },
    [toast, refreshUnclaimedDeposits],
  );

  // Subscribe to payment events
  const subscribeToPaymentEvents = useCallback(
    (handler: PaymentEventHandler): (() => void) => {
      paymentEventHandlersRef.current.add(handler);

      // Return unsubscribe function
      return () => {
        paymentEventHandlersRef.current.delete(handler);
      };
    },
    [],
  );

  // Set up SDK event listener when wallet is initialized
  useEffect(() => {
    if (!isInitialized || !breezService.isConnected()) {
      return;
    }

    const setupListener = async () => {
      try {
        // Remove existing listener if any
        if (sdkListenerIdRef.current) {
          try {
            await breezService.removeEventListener(sdkListenerIdRef.current);
          } catch {
            // Ignore errors when removing old listener
          }
        }

        // Add new event listener
        const listenerId = await breezService.addEventListener(
          (event: SdkEvent) => {
            logger.debug("[SparkWallet] SDK Event:", event.type);

            // Notify all subscribers
            paymentEventHandlersRef.current.forEach((handler) => {
              try {
                handler(event);
              } catch (error) {
                logger.error(
                  "[SparkWallet] Error in payment event handler:",
                  error,
                );
              }
            });

            // Handle specific events
            switch (event.type) {
              case "paymentSucceeded":
                logger.debug("[SparkWallet] Payment succeeded, refreshing...");
                refreshBalance();
                refreshPayments();
                break;

              case "paymentFailed":
                logger.warn("[SparkWallet] Payment failed");
                refreshBalance();
                break;

              case "synced":
                logger.debug("[SparkWallet] Wallet synced");
                refreshBalance();
                refreshPayments();
                refreshUnclaimedDeposits();
                break;

              case "unclaimedDeposits":
                logger.debug(
                  "[SparkWallet] Unclaimed deposits detected:",
                  event.unclaimedDeposits,
                );
                refreshUnclaimedDeposits();
                break;

              case "claimedDeposits":
                logger.debug(
                  "[SparkWallet] Deposits claimed:",
                  event.claimedDeposits,
                );
                refreshBalance();
                refreshPayments();
                refreshUnclaimedDeposits();
                break;
            }
          },
        );

        sdkListenerIdRef.current = listenerId;
        logger.debug("[SparkWallet] Event listener set up");
      } catch (error) {
        logger.error("[SparkWallet] Failed to set up event listener:", error);
      }
    };

    setupListener();

    // Cleanup on unmount or when wallet disconnects
    return () => {
      if (sdkListenerIdRef.current && breezService.isConnected()) {
        breezService
          .removeEventListener(sdkListenerIdRef.current)
          .catch(logger.error);
        sdkListenerIdRef.current = null;
      }
    };
  }, [
    isInitialized,
    refreshBalance,
    refreshPayments,
    refreshUnclaimedDeposits,
  ]);

  // Memoize context value
  const value = useMemo<SparkWalletContextValue>(
    () => ({
      // State
      isInitialized,
      isConnecting,
      isEnabled,
      balance,
      hasWallet,
      hasBackup,
      isCheckingBackup,
      sparkAddress,
      bitcoinAddress,
      payments,
      isLoadingPayments,
      hasMorePayments,
      loadMorePayments,

      // Wallet Management
      createWallet,
      restoreFromMnemonic,
      restoreFromRelay,
      restoreFromFile,
      disconnect,
      removeWallet,

      // Backup Management
      syncToRelays,
      exportBackup,
      deleteRelayBackup,
      checkRelayBackup,
      backupTimestamp,
      backupRelays,

      // Payments
      payInvoice,
      payLightningAddress,
      prepareBitcoinPayment,
      payBitcoinAddress,
      createInvoice,
      getSparkAddress,
      getBitcoinAddress,

      // Lightning Address Management
      lightningAddress,
      getLightningAddress,
      checkLightningAddressAvailable,
      registerLightningAddress,
      deleteLightningAddress,

      // Utility
      refreshBalance,
      refreshPayments,
      getDiagnostics,
      setEnabled,
      parseInput,
      getMnemonic,

      // Event subscriptions
      subscribeToPaymentEvents,
      lastReceivedPayment,

      // Lock Management
      isLocked,
      lockTimeout,
      lockWallet,
      unlockWallet,
      setLockTimeout: handleSetLockTimeout,

      // On-chain Deposit Claiming
      unclaimedDeposits,
      isLoadingDeposits,
      isSyncing,
      syncWallet,
      refreshUnclaimedDeposits,
      getRecommendedFees,
      claimDeposit,
      claimDepositWithNetworkFee,
      refundDeposit,
    }),
    [
      isInitialized,
      isConnecting,
      isEnabled,
      balance,
      hasWallet,
      hasBackup,
      isCheckingBackup,
      sparkAddress,
      bitcoinAddress,
      payments,
      isLoadingPayments,
      hasMorePayments,
      loadMorePayments,
      createWallet,
      restoreFromMnemonic,
      restoreFromRelay,
      restoreFromFile,
      disconnect,
      removeWallet,
      syncToRelays,
      exportBackup,
      deleteRelayBackup,
      checkRelayBackup,
      backupTimestamp,
      backupRelays,
      payInvoice,
      payLightningAddress,
      prepareBitcoinPayment,
      payBitcoinAddress,
      createInvoice,
      getSparkAddress,
      getBitcoinAddress,
      lightningAddress,
      getLightningAddress,
      checkLightningAddressAvailable,
      registerLightningAddress,
      deleteLightningAddress,
      refreshBalance,
      refreshPayments,
      getDiagnostics,
      setEnabled,
      parseInput,
      getMnemonic,
      subscribeToPaymentEvents,
      lastReceivedPayment,
      isLocked,
      lockTimeout,
      lockWallet,
      unlockWallet,
      handleSetLockTimeout,
      unclaimedDeposits,
      isLoadingDeposits,
      isSyncing,
      syncWallet,
      refreshUnclaimedDeposits,
      getRecommendedFees,
      claimDeposit,
      claimDepositWithNetworkFee,
      refundDeposit,
    ],
  );

  return (
    <SparkWalletContext.Provider value={value}>
      {children}
    </SparkWalletContext.Provider>
  );
}

/** Hook to access Spark wallet context */
// eslint-disable-next-line react-refresh/only-export-components
export function useSparkWalletContext(): SparkWalletContextValue {
  const context = useContext(SparkWalletContext);
  if (!context) {
    throw new Error(
      "useSparkWalletContext must be used within SparkWalletProvider",
    );
  }
  return context;
}
