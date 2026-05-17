/**
 * Breez SDK Wallet Service
 * Singleton wrapper around the Breez SDK - Nodeless (Spark Implementation)
 * Based on Primal's implementation for compatibility
 */

import { logger } from "@/lib/logger";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import initBreezSDK, {
  BreezSdk,
  connect,
  defaultConfig,
  ConnectRequest,
  Config,
  Network,
  Seed,
  GetInfoResponse,
  SendPaymentRequest,
  SendPaymentResponse,
  ReceivePaymentRequest,
  ReceivePaymentResponse,
  Payment,
  ListPaymentsRequest,
  ListPaymentsResponse,
  SdkEvent,
  EventListener,
  PrepareSendPaymentRequest,
  PrepareSendPaymentResponse,
  LightningAddressInfo,
  RegisterLightningAddressRequest,
  CheckLightningAddressRequest,
  ListUnclaimedDepositsRequest,
  ListUnclaimedDepositsResponse,
  ClaimDepositRequest,
  ClaimDepositResponse,
  RefundDepositRequest,
  RefundDepositResponse,
  RecommendedFees,
  DepositInfo,
  MaxFee,
  Fee,
  SendPaymentOptions,
  OnchainConfirmationSpeed,
} from "@breeztech/breez-sdk-spark/web";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const SYNC_TIMEOUT_MS = 60000;
const INFO_TIMEOUT_MS = 15000;
const encoder = new TextEncoder();

const isTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("timed out");

const getStorageDir = (mnemonic: string, network: Network): string => {
  const normalizedMnemonic = mnemonic.trim().replace(/\s+/g, " ");
  const fingerprint = bytesToHex(sha256(encoder.encode(normalizedMnemonic))).slice(
    0,
    24,
  );

  return `spark-wallet-${network}-${fingerprint}`;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

/**
 * Wallet state type
 */
export type BreezWalletState = {
  isInitialized: boolean;
  isConnected: boolean;
  balance: number; // Balance in sats
  tokenBalances: Map<string, unknown>; // Token balances if any
  lastSynced?: Date;
};

export type BreezWalletInfo = {
  identityPubkey: string;
  balanceSats: number;
};

/**
 * Payment info type
 */
export type BreezPaymentInfo = {
  id: string;
  amount: number; // Amount in sats (absolute value)
  fees: number; // Fee amount in sats
  paymentType: "send" | "receive"; // Payment direction
  status: "completed" | "pending" | "failed";
  timestamp: number;
  description?: string;
  invoice?: string;
  preimage?: string;
  paymentHash?: string;
};

type BreezEventHandler = (event: SdkEvent) => void;

/**
 * Unclaimed deposit info type (simplified from SDK)
 */
export type UnclaimedDepositInfo = {
  txid: string;
  vout: number;
  amountSats: number;
  claimError?: {
    type: "maxDepositClaimFeeExceeded" | "missingUtxo" | "generic";
    requiredFeeSats?: number;
    requiredFeeRateSatPerVbyte?: number;
    message?: string;
  };
};

/**
 * Recommended fees info type
 */
export type RecommendedFeesInfo = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
};

class BreezWalletService {
  private sdk: BreezSdk | null = null;
  private wasmInitialized: boolean = false;
  private eventListeners: Map<string, BreezEventHandler> = new Map();
  private state: BreezWalletState = {
    isInitialized: false,
    isConnected: false,
    balance: 0,
    tokenBalances: new Map(),
  };

  /**
   * Generate a new 12-word mnemonic
   */
  generateMnemonic(): string {
    return generateMnemonic(wordlist, 128); // 128 bits = 12 words
  }

  /**
   * Validate a mnemonic phrase
   */
  validateMnemonic(mnemonic: string): boolean {
    return validateMnemonic(mnemonic, wordlist);
  }

  /**
   * Initialize the WASM module (only needs to be done once)
   */
  private async initWasm(): Promise<void> {
    if (this.wasmInitialized) return;

    try {
      logger.debug("[BreezWallet] Initializing WASM module...");
      await initBreezSDK();
      this.wasmInitialized = true;
      logger.debug("[BreezWallet] WASM module initialized");
    } catch (error) {
      logger.error("[BreezWallet] Failed to initialize WASM:", error);
      throw new Error(`Failed to initialize Breez SDK WASM: ${error}`);
    }
  }

  /**
   * Connect to Breez SDK with the provided mnemonic
   * @param mnemonic - BIP39 mnemonic seed phrase
   * @param network - Bitcoin network (default: bitcoin mainnet)
   * @param apiKey - Breez API key (optional, from env by default)
   */
  async connect(
    mnemonic: string,
    network: Network = "mainnet",
    apiKey?: string,
  ): Promise<void> {
    try {
      // Initialize WASM first
      logger.debug("[BreezWallet] Step 1/4: Initializing WASM module...");
      await this.initWasm();

      logger.debug("[BreezWallet] Step 2/4: Connecting to Breez SDK...");

      // Get API key from environment or parameter
      const key = apiKey || import.meta.env.VITE_BREEZ_API_KEY;

      if (!key || key === "your-breez-api-key-here") {
        throw new Error(
          "Breez API key not configured. Please set VITE_BREEZ_API_KEY in .env",
        );
      }

      // Create default configuration
      const config: Config = defaultConfig(network);
      config.apiKey = key;

      // Create seed from mnemonic
      const seed: Seed = {
        type: "mnemonic",
        mnemonic: mnemonic,
      };

      // Storage directory for web (uses IndexedDB). It must be scoped per
      // mnemonic; otherwise a newly-created wallet can reuse stale SDK state
      // and generate invoices for a previous wallet.
      const storageDir = getStorageDir(mnemonic, network);

      // Connect to SDK
      const connectRequest: ConnectRequest = {
        config,
        seed,
        storageDir,
      };

      this.sdk = await connect(connectRequest);

      this.state.isConnected = true;
      this.state.isInitialized = true;

      logger.debug(
        "[BreezWallet] Step 3/4: Connected to SDK, setting up event listeners...",
      );

      // Set up default event listener for SDK events
      this.setupDefaultEventListener();

      // Get cached balance immediately (without waiting for full sync)
      try {
        const info: GetInfoResponse = await this.sdk.getInfo({
          ensureSynced: false,
        });
        this.state.balance = info.balanceSats;
        this.state.tokenBalances = info.tokenBalances;
        this.state.lastSynced = new Date();
        logger.debug("[BreezWallet] Initial balance loaded (cached)");
      } catch (e) {
        logger.warn("[BreezWallet] Could not get cached balance:", e);
      }

      logger.debug("[BreezWallet] Step 4/4: Starting background sync...");

      // Background sync - don't await, let it run async
      this.sdk
        .syncWallet({})
        .then(() => {
          this.syncBalance().catch(() => {});
          logger.debug("[BreezWallet] Background sync completed");
        })
        .catch(() => {
          logger.warn(
            "[BreezWallet] Background sync failed, will retry on next action",
          );
        });

      logger.debug("[BreezWallet] Wallet connected successfully");
    } catch (error) {
      logger.error("[BreezWallet] Connection failed:", error);
      this.state.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Breez SDK
   */
  async disconnect(): Promise<void> {
    if (!this.sdk) {
      logger.warn("[BreezWallet] No SDK instance to disconnect");
      return;
    }

    try {
      logger.debug("[BreezWallet] Disconnecting...");

      // Remove all event listeners
      for (const [id] of this.eventListeners) {
        await this.sdk.removeEventListener(id);
      }
      this.eventListeners.clear();

      // Disconnect SDK
      await this.sdk.disconnect();
      this.sdk = null;

      this.state.isConnected = false;
      this.state.balance = 0;
      this.state.tokenBalances.clear();

      logger.debug("[BreezWallet] Disconnected successfully");
    } catch (error) {
      logger.error("[BreezWallet] Disconnect failed:", error);
      throw error;
    }
  }

  /**
   * Get current wallet state
   */
  getState(): BreezWalletState {
    return { ...this.state };
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.state.isConnected && this.sdk !== null;
  }

  /**
   * Get current balance in sats
   */
  async getBalance(): Promise<number> {
    await this.ensureConnected();
    await this.syncBalance(false);
    return this.state.balance;
  }

  /**
   * Get current SDK wallet info without forcing a blocking initial sync.
   */
  async getInfo(): Promise<BreezWalletInfo> {
    await this.ensureConnected();

    const info: GetInfoResponse = await withTimeout(
      this.sdk!.getInfo({ ensureSynced: false }),
      INFO_TIMEOUT_MS,
      "[BreezWallet] getInfo",
    );
    this.state.balance = info.balanceSats;
    this.state.tokenBalances = info.tokenBalances;
    this.state.lastSynced = new Date();

    return {
      identityPubkey: info.identityPubkey,
      balanceSats: info.balanceSats,
    };
  }

  /**
   * Sync balance from SDK
   */
  private async syncBalance(ensureSynced: boolean = true): Promise<void> {
    await this.ensureConnected();

    try {
      const info: GetInfoResponse = await withTimeout(
        this.sdk!.getInfo({ ensureSynced }),
        INFO_TIMEOUT_MS,
        "[BreezWallet] getInfo",
      );
      this.state.balance = info.balanceSats;
      this.state.tokenBalances = info.tokenBalances;
      this.state.lastSynced = new Date();

      logger.debug("[BreezWallet] Balance synced");
    } catch (error) {
      if (ensureSynced && isTimeoutError(error)) {
        logger.warn("[BreezWallet] Balance sync timed out, using cached info");
        try {
          const info: GetInfoResponse = await withTimeout(
            this.sdk!.getInfo({ ensureSynced: false }),
            INFO_TIMEOUT_MS,
            "[BreezWallet] getInfo (cached)",
          );
          this.state.balance = info.balanceSats;
          this.state.tokenBalances = info.tokenBalances;
          this.state.lastSynced = new Date();
          return;
        } catch (fallbackError) {
          logger.error(
            "[BreezWallet] Failed to load cached balance after timeout:",
            fallbackError,
          );
          throw fallbackError;
        }
      }
      logger.error("[BreezWallet] Failed to sync balance:", error);
      throw error;
    }
  }

  /**
   * Send a Lightning payment
   * @param invoice - BOLT11 invoice string
   * @returns Payment response
   */
  async sendPayment(invoice: string): Promise<BreezPaymentInfo> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Sending payment...");

      // Prepare the payment first to validate and get details
      const prepareRequest: PrepareSendPaymentRequest = {
        paymentRequest: invoice,
      };

      const prepareResponse: PrepareSendPaymentResponse =
        await this.sdk!.prepareSendPayment(prepareRequest);

      // Execute the payment
      const sendRequest: SendPaymentRequest = {
        prepareResponse,
      };

      const response: SendPaymentResponse =
        await this.sdk!.sendPayment(sendRequest);

      logger.debug("[BreezWallet] Payment sent successfully");

      // Update balance after payment
      await this.syncBalance();

      return this.mapPaymentToInfo(response.payment);
    } catch (error) {
      logger.error("[BreezWallet] Payment failed:", error);
      throw error;
    }
  }

  /**
   * Prepare a Bitcoin on-chain payment
   * This validates the address and returns fee quotes for different confirmation speeds
   * @param address - Bitcoin address to send to
   * @param amountSats - Optional amount in satoshis (required for some addresses)
   * @returns Prepared payment response with fee quotes
   */
  async prepareBitcoinPayment(
    address: string,
    amountSats?: number,
  ): Promise<PrepareSendPaymentResponse> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Preparing Bitcoin on-chain payment...");

      const prepareRequest: PrepareSendPaymentRequest = {
        paymentRequest: address,
        amount: amountSats !== undefined ? BigInt(amountSats) : undefined,
      };

      const prepareResponse = await this.sdk!.prepareSendPayment(prepareRequest);
      logger.debug("[BreezWallet] Bitcoin payment prepared successfully");

      return prepareResponse;
    } catch (error) {
      logger.error("[BreezWallet] Failed to prepare Bitcoin payment:", error);
      throw error;
    }
  }

  /**
   * Send a Bitcoin on-chain payment
   * @param prepareResponse - Response from prepareBitcoinPayment
   * @param confirmationSpeed - Desired confirmation speed ('fast', 'medium', 'slow')
   * @returns Payment info
   */
  async sendBitcoinPayment(
    prepareResponse: PrepareSendPaymentResponse,
    confirmationSpeed: OnchainConfirmationSpeed = "medium",
  ): Promise<BreezPaymentInfo> {
    await this.ensureConnected();

    try {
      logger.debug(
        `[BreezWallet] Sending Bitcoin on-chain payment with ${confirmationSpeed} speed...`,
      );

      const options: SendPaymentOptions = {
        type: "bitcoinAddress",
        confirmationSpeed,
      };

      const sendRequest: SendPaymentRequest = {
        prepareResponse,
        options,
      };

      const response: SendPaymentResponse =
        await this.sdk!.sendPayment(sendRequest);

      logger.debug("[BreezWallet] Bitcoin payment sent successfully");

      // Update balance after payment
      await this.syncBalance();

      return this.mapPaymentToInfo(response.payment);
    } catch (error) {
      logger.error("[BreezWallet] Bitcoin payment failed:", error);
      throw error;
    }
  }

  /**
   * Create an invoice to receive payment
   * @param amountSats - Amount in satoshis
   * @param description - Invoice description
   * @returns Invoice string (BOLT11)
   */
  async createInvoice(
    amountSats: number,
    description?: string,
  ): Promise<string> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Creating invoice...");

      const request: ReceivePaymentRequest = {
        paymentMethod: {
          type: "bolt11Invoice",
          description: description || "",
          amountSats,
        },
      };

      const response: ReceivePaymentResponse =
        await this.sdk!.receivePayment(request);

      logger.debug("[BreezWallet] Invoice created");

      return response.paymentRequest;
    } catch (error) {
      logger.error("[BreezWallet] Failed to create invoice:", error);
      throw error;
    }
  }

  /**
   * Get Spark address for receiving
   */
  async getSparkAddress(): Promise<string> {
    await this.ensureConnected();

    try {
      const response = await this.sdk!.receivePayment({
        paymentMethod: { type: "sparkAddress" },
      });
      return response.paymentRequest;
    } catch (error) {
      logger.error("[BreezWallet] Failed to get Spark address:", error);
      throw error;
    }
  }

  /**
   * Get Bitcoin address for receiving
   */
  async getBitcoinAddress(): Promise<string> {
    await this.ensureConnected();

    try {
      const response = await this.sdk!.receivePayment({
        paymentMethod: { type: "bitcoinAddress" },
      });
      return response.paymentRequest;
    } catch (error) {
      logger.error("[BreezWallet] Failed to get Bitcoin address:", error);
      throw error;
    }
  }

  /**
   * Get payment history
   * @param requestOverrides - ListPaymentsRequest overrides
   * @returns Array of payment info
   */
  async getPaymentHistory(
    requestOverrides: Partial<ListPaymentsRequest> = {},
  ): Promise<BreezPaymentInfo[]> {
    await this.ensureConnected();

    try {
      const request: ListPaymentsRequest = {
        limit: 50,
        offset: 0,
        sortAscending: false,
        ...requestOverrides,
      };

      const response: ListPaymentsResponse =
        await this.sdk!.listPayments(request);

      return response.payments.map((payment) => this.mapPaymentToInfo(payment));
    } catch (error) {
      logger.error("[BreezWallet] Failed to get payment history:", error);
      throw error;
    }
  }

  /**
   * Add event listener for SDK events
   * @param handler - Event handler function
   * @returns Listener ID (for removal)
   */
  async addEventListener(handler: BreezEventHandler): Promise<string> {
    await this.ensureConnected();

    try {
      const listener: EventListener = {
        onEvent: (event: SdkEvent) => {
          handler(event);
        },
      };

      const id = await this.sdk!.addEventListener(listener);
      this.eventListeners.set(id, handler);

      logger.debug("[BreezWallet] Event listener added");
      return id;
    } catch (error) {
      logger.error("[BreezWallet] Failed to add event listener:", error);
      throw error;
    }
  }

  /**
   * Remove event listener
   * @param id - Listener ID
   */
  async removeEventListener(id: string): Promise<void> {
    await this.ensureConnected();

    try {
      await this.sdk!.removeEventListener(id);
      this.eventListeners.delete(id);
      logger.debug("[BreezWallet] Event listener removed");
    } catch (error) {
      logger.error("[BreezWallet] Failed to remove event listener:", error);
      throw error;
    }
  }

  /**
   * Set up default event listener for important events
   */
  private setupDefaultEventListener(): void {
    if (!this.sdk) return;

    this.addEventListener((event: SdkEvent) => {
      switch (event.type) {
        case "synced":
          logger.debug("[BreezWallet] Wallet synced");
          this.syncBalance();
          break;

        case "paymentSucceeded":
          logger.debug("[BreezWallet] Payment succeeded");
          this.syncBalance();
          break;

        case "paymentFailed":
          logger.warn("[BreezWallet] Payment failed");
          this.syncBalance();
          break;

        case "paymentPending":
          logger.debug("[BreezWallet] Payment pending");
          break;

        case "unclaimedDeposits":
          logger.debug("[BreezWallet] Unclaimed deposits detected");
          break;

        case "claimedDeposits":
          logger.debug("[BreezWallet] Claimed deposits detected");
          this.syncBalance();
          break;
      }
    }).catch((error) => {
      logger.error(
        "[BreezWallet] Failed to set up default event listener:",
        error,
      );
    });
  }

  /**
   * Sync wallet state
   */
  async syncWallet(): Promise<void> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Syncing wallet...");
      await withTimeout(
        this.sdk!.syncWallet({}),
        SYNC_TIMEOUT_MS,
        "[BreezWallet] syncWallet",
      );
      await this.syncBalance(false);
      logger.debug("[BreezWallet] Wallet synced");
    } catch (error) {
      logger.error("[BreezWallet] Wallet sync failed:", error);
      throw error;
    }
  }

  /**
   * Parse Lightning input (invoice, LNURL, Lightning address, etc.)
   * @param input - Input string to parse
   * @returns Parsed input type
   */
  async parseInput(input: string): Promise<unknown> {
    await this.ensureConnected();

    try {
      return await this.sdk!.parse(input);
    } catch (error) {
      logger.error("[BreezWallet] Failed to parse input:", error);
      throw error;
    }
  }

  /**
   * Prepare an LNURL pay request
   * @param amountSats - Amount in sats
   * @param payRequest - LNURL pay request details (from parseInput)
   * @param comment - Optional comment
   * @returns Prepared LNURL pay response
   */
  async prepareLnurlPay(
    amountSats: number,
    payRequest: unknown,
    comment?: string,
  ): Promise<unknown> {
    await this.ensureConnected();

    try {
      const request: Record<string, unknown> = {
        amountSats,
        payRequest,
        validateSuccessActionUrl: true,
      };

      // Only include comment if it's provided
      if (comment) {
        request.comment = comment;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await this.sdk!.prepareLnurlPay(request as any);
    } catch (error) {
      logger.error("[BreezWallet] Failed to prepare LNURL pay:", error);
      throw error;
    }
  }

  /**
   * Execute an LNURL pay request
   * @param prepareResponse - Response from prepareLnurlPay
   * @returns LNURL pay response with payment info
   */
  async lnurlPay(prepareResponse: unknown): Promise<unknown> {
    await this.ensureConnected();

    try {
      const request = {
        prepareResponse,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await this.sdk!.lnurlPay(request as any);
    } catch (error) {
      logger.error("[BreezWallet] Failed to execute LNURL pay:", error);
      throw error;
    }
  }

  /**
   * Get Lightning address for this wallet
   * @returns Lightning address info or undefined if not registered
   */
  async getLightningAddress(): Promise<LightningAddressInfo | undefined> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Getting Lightning address...");
      const address = await this.sdk!.getLightningAddress();
      if (address) {
        logger.debug("[BreezWallet] Lightning address found");
      } else {
        logger.debug("[BreezWallet] No Lightning address registered");
      }
      return address;
    } catch (error) {
      logger.error("[BreezWallet] Failed to get Lightning address:", error);
      throw error;
    }
  }

  /**
   * Check if a Lightning address username is available
   * @param username - Username to check (without domain)
   * @returns True if available, false if taken
   */
  async checkLightningAddressAvailable(username: string): Promise<boolean> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Checking Lightning address availability...");
      const request: CheckLightningAddressRequest = { username };
      const available = await this.sdk!.checkLightningAddressAvailable(request);
      logger.debug("[BreezWallet] Lightning address availability checked");
      return available;
    } catch (error) {
      logger.error(
        "[BreezWallet] Failed to check Lightning address availability:",
        error,
      );
      throw error;
    }
  }

  /**
   * Register a Lightning address for this wallet
   * @param username - Desired username (without domain)
   * @param description - Optional description
   * @returns Lightning address info
   */
  async registerLightningAddress(
    username: string,
    description?: string,
  ): Promise<LightningAddressInfo> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Registering Lightning address...");
      const request: RegisterLightningAddressRequest = {
        username,
        description,
      };
      const address = await this.sdk!.registerLightningAddress(request);
      logger.debug("[BreezWallet] Lightning address registered");
      return address;
    } catch (error) {
      logger.error(
        "[BreezWallet] Failed to register Lightning address:",
        error,
      );
      throw error;
    }
  }

  /**
   * Delete the Lightning address for this wallet
   */
  async deleteLightningAddress(): Promise<void> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Deleting Lightning address...");
      await this.sdk!.deleteLightningAddress();
      logger.debug("[BreezWallet] Lightning address deleted");
    } catch (error) {
      logger.error("[BreezWallet] Failed to delete Lightning address:", error);
      throw error;
    }
  }

  // ==================== ON-CHAIN DEPOSIT CLAIMING ====================

  /**
   * Get recommended Bitcoin network fees
   * @returns Recommended fees for different confirmation targets
   */
  async getRecommendedFees(): Promise<RecommendedFeesInfo> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Getting recommended fees...");
      const fees: RecommendedFees = await this.sdk!.recommendedFees();
      logger.debug("[BreezWallet] Recommended fees retrieved");
      return {
        fastestFee: fees.fastestFee,
        halfHourFee: fees.halfHourFee,
        hourFee: fees.hourFee,
        economyFee: fees.economyFee,
        minimumFee: fees.minimumFee,
      };
    } catch (error) {
      logger.error("[BreezWallet] Failed to get recommended fees:", error);
      throw error;
    }
  }

  /**
   * List unclaimed on-chain deposits
   * These are deposits that couldn't be automatically claimed due to fee limits
   * @returns Array of unclaimed deposit info
   */
  async listUnclaimedDeposits(): Promise<UnclaimedDepositInfo[]> {
    await this.ensureConnected();

    try {
      logger.debug("[BreezWallet] Listing unclaimed deposits...");
      const request: ListUnclaimedDepositsRequest = {};
      const response: ListUnclaimedDepositsResponse =
        await this.sdk!.listUnclaimedDeposits(request);

      const deposits = response.deposits.map((deposit: DepositInfo) =>
        this.mapDepositToInfo(deposit),
      );
      logger.debug(`[BreezWallet] Found ${deposits.length} unclaimed deposits`);
      return deposits;
    } catch (error) {
      logger.error("[BreezWallet] Failed to list unclaimed deposits:", error);
      throw error;
    }
  }

  /**
   * Manually claim an on-chain deposit with a specified max fee
   * Use this when automatic claiming failed due to fee limits
   * @param txid - Transaction ID of the deposit
   * @param vout - Output index of the deposit
   * @param maxFeeSats - Maximum fee in sats to pay for claiming
   * @returns Claim response
   */
  async claimDeposit(
    txid: string,
    vout: number,
    maxFeeSats: number,
  ): Promise<ClaimDepositResponse> {
    await this.ensureConnected();

    try {
      logger.debug(
        `[BreezWallet] Claiming deposit ${txid}:${vout} with max fee ${maxFeeSats} sats...`,
      );

      const maxFee: MaxFee = { type: "fixed", amount: maxFeeSats };
      const request: ClaimDepositRequest = {
        txid,
        vout,
        maxFee,
      };

      const response = await this.sdk!.claimDeposit(request);
      logger.debug("[BreezWallet] Deposit claimed successfully");

      // Sync balance after claiming
      await this.syncBalance();

      return response;
    } catch (error) {
      logger.error("[BreezWallet] Failed to claim deposit:", error);
      throw error;
    }
  }

  /**
   * Claim a deposit using the network recommended fee rate
   * @param txid - Transaction ID of the deposit
   * @param vout - Output index of the deposit
   * @param leewaySatPerVbyte - Additional sats/vbyte above recommended (default: 1)
   * @returns Claim response
   */
  async claimDepositWithNetworkFee(
    txid: string,
    vout: number,
    leewaySatPerVbyte: number = 1,
  ): Promise<ClaimDepositResponse> {
    await this.ensureConnected();

    try {
      logger.debug(
        `[BreezWallet] Claiming deposit ${txid}:${vout} with network fee + ${leewaySatPerVbyte} sats/vbyte...`,
      );

      const maxFee: MaxFee = { type: "networkRecommended", leewaySatPerVbyte };
      const request: ClaimDepositRequest = {
        txid,
        vout,
        maxFee,
      };

      const response = await this.sdk!.claimDeposit(request);
      logger.debug("[BreezWallet] Deposit claimed successfully");

      // Sync balance after claiming
      await this.syncBalance();

      return response;
    } catch (error) {
      logger.error("[BreezWallet] Failed to claim deposit:", error);
      throw error;
    }
  }

  /**
   * Refund an on-chain deposit to an external Bitcoin address
   * Use this when a deposit cannot be claimed and needs to be returned
   * @param txid - Transaction ID of the deposit
   * @param vout - Output index of the deposit
   * @param destinationAddress - Bitcoin address to refund to
   * @param feeSatPerVbyte - Fee rate in sats/vbyte
   * @returns Refund response with transaction details
   */
  async refundDeposit(
    txid: string,
    vout: number,
    destinationAddress: string,
    feeSatPerVbyte: number,
  ): Promise<RefundDepositResponse> {
    await this.ensureConnected();

    try {
      logger.debug(
        `[BreezWallet] Refunding deposit ${txid}:${vout} to ${destinationAddress}...`,
      );

      const fee: Fee = { type: "rate", satPerVbyte: feeSatPerVbyte };
      const request: RefundDepositRequest = {
        txid,
        vout,
        destinationAddress,
        fee,
      };

      const response = await this.sdk!.refundDeposit(request);
      logger.debug("[BreezWallet] Deposit refunded successfully");
      logger.debug(`[BreezWallet] Refund TX ID: ${response.txId}`);

      return response;
    } catch (error) {
      logger.error("[BreezWallet] Failed to refund deposit:", error);
      throw error;
    }
  }

  /**
   * Map SDK DepositInfo to simplified UnclaimedDepositInfo
   */
  private mapDepositToInfo(deposit: DepositInfo): UnclaimedDepositInfo {
    const info: UnclaimedDepositInfo = {
      txid: deposit.txid,
      vout: deposit.vout,
      amountSats: deposit.amountSats,
    };

    if (deposit.claimError) {
      if (deposit.claimError.type === "maxDepositClaimFeeExceeded") {
        info.claimError = {
          type: "maxDepositClaimFeeExceeded",
          requiredFeeSats: deposit.claimError.requiredFeeSats,
          requiredFeeRateSatPerVbyte:
            deposit.claimError.requiredFeeRateSatPerVbyte,
        };
      } else if (deposit.claimError.type === "missingUtxo") {
        info.claimError = {
          type: "missingUtxo",
        };
      } else if (deposit.claimError.type === "generic") {
        info.claimError = {
          type: "generic",
          message: deposit.claimError.message,
        };
      }
    }

    return info;
  }

  /**
   * Ensure SDK is connected, throw error if not
   */
  private async ensureConnected(): Promise<void> {
    if (!this.sdk || !this.state.isConnected) {
      throw new Error("Breez wallet not connected. Call connect() first.");
    }
  }

  /**
   * Map SDK Payment to simplified BreezPaymentInfo
   */
  private mapPaymentToInfo(payment: Payment): BreezPaymentInfo {
    const info: BreezPaymentInfo = {
      id: payment.id,
      amount: Number(payment.amount),
      fees: Number(payment.fees),
      paymentType: payment.paymentType as "send" | "receive",
      status: payment.status as "completed" | "pending" | "failed",
      timestamp: payment.timestamp,
    };

    // Extract additional details based on payment type
    if (payment.details) {
      if (payment.details.type === "lightning") {
        info.invoice = payment.details.invoice;
        info.description = payment.details.description;
        if (payment.details.htlcDetails) {
          info.preimage = payment.details.htlcDetails.preimage;
          info.paymentHash = payment.details.htlcDetails.paymentHash;
        }
      } else if (
        payment.details.type === "spark" &&
        payment.details.invoiceDetails
      ) {
        info.invoice = payment.details.invoiceDetails.invoice;
        info.description = payment.details.invoiceDetails.description;
      }
    }

    return info;
  }
}

// Export singleton instance
export const breezService = new BreezWalletService();
