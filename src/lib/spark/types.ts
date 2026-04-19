/**
 * Spark Wallet Types
 * TypeScript types for the Spark wallet integration
 */

import type { Payment, SdkEvent } from "@breeztech/breez-sdk-spark/web";

/** Nostr signer interface with NIP-44 support */
export interface NostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: unknown): Promise<unknown>;
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

/** Wallet connection state */
export interface SparkWalletState {
  isInitialized: boolean;
  isConnecting: boolean;
  balance: number;
  pendingBalance: number;
  sparkAddress: string | null;
  bitcoinAddress: string | null;
}

/** Auto-lock timeout options in minutes (0 = disabled) */
export type LockTimeoutMinutes = 0 | 1 | 5 | 15 | 30 | 60;

/** Wallet configuration stored locally */
export interface SparkWalletConfig {
  hasWallet?: boolean;
  isEnabled?: boolean;
  lastSynced?: number;
  cachedBalance?: number;
  network?: "mainnet" | "regtest";
  createdAt?: number;
  lud16?: string; // Lightning address if registered
  encryptionVersion?: string;
  /** Auto-lock timeout in minutes (0 = disabled) */
  lockTimeout?: LockTimeoutMinutes;
  /** Timestamp of last user activity (for auto-lock) */
  lastActivityAt?: number;
}

/** File backup data structure (v2 format - compatible with zapcooking/sparkihonne) */
export interface SparkBackupData {
  version: 2;
  type: "spark-wallet-backup";
  encryption: "nip44";
  pubkey: string;
  encryptedMnemonic: string;
  createdAt: number; // milliseconds
  createdBy: string;
}

/** Payment with additional UI metadata */
export interface SparkPayment extends Payment {
  formattedAmount?: string;
  formattedDate?: string;
}

/** Event listener callback type */
export type SparkEventCallback = (event: SdkEvent) => void;

/** Receive payment method options */
export type ReceiveMethod = "lightning" | "spark" | "bitcoin";

/** Send payment destination types */
export type SendDestination =
  | { type: "bolt11"; invoice: string }
  | { type: "lightningAddress"; address: string; amount: number }
  | { type: "spark"; address: string; amount: number }
  | { type: "bitcoin"; address: string; amount: number };

/** Wallet initialization options */
export interface WalletInitOptions {
  mnemonic: string;
  apiKey: string;
  network?: "mainnet" | "regtest";
}

/** Parse result types for input classification */
export type ParsedInputType =
  | "bolt11"
  | "lnurl"
  | "lightningAddress"
  | "sparkAddress"
  | "sparkInvoice"
  | "bitcoinAddress"
  | "unknown";

export interface ParsedInput {
  type: ParsedInputType;
  data: unknown;
  amount?: number;
  description?: string;
}
