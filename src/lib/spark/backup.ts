/**
 * Spark Wallet Backup - NIP-78 Implementation
 * Encrypted backup storage on Nostr relays with file export/import support
 *
 * Format is compatible with Zap Cooking and similar Spark wallet implementations.
 * Uses v2 format: Just the encrypted mnemonic in content (not JSON wrapped).
 */

import type { NostrEvent, NostrSigner } from "@nostrify/nostrify";
import type { SparkBackupData } from "./types";
import { logger } from "@/lib/logger";

/** NIP-78 kind for application-specific data */
const BACKUP_KIND = 30078;

/** Unique identifier for Spark wallet backups */
const BACKUP_D_TAG = "spark-wallet-backup";

/** Current backup format version */
const BACKUP_VERSION = 2;

/** Big relays that accept all event kinds (NIP-78) */
const FALLBACK_RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

/** Result of fetching backup with relay information */
export interface BackupFetchResult {
  event: NostrEvent;
  relays: string[];
}

/** Backup info including timestamp and relays */
export interface BackupInfo {
  exists: boolean;
  timestamp: number | null;
  relays: string[];
}

/**
 * Encrypt mnemonic using NIP-44
 */
async function encryptMnemonic(
  mnemonic: string,
  pubkey: string,
  signer: NostrSigner,
): Promise<string> {
  if (!signer.nip44) {
    throw new Error("Signer does not support NIP-44 encryption");
  }

  // Encrypt to self (same pubkey for sender and receiver)
  return await signer.nip44.encrypt(pubkey, mnemonic);
}

/**
 * Decrypt mnemonic using NIP-44
 */
async function decryptMnemonic(
  encrypted: string,
  pubkey: string,
  signer: NostrSigner,
): Promise<string> {
  if (!signer.nip44) {
    throw new Error("Signer does not support NIP-44 decryption");
  }

  return await signer.nip44.decrypt(pubkey, encrypted);
}

/**
 * Create a NIP-78 backup event for the wallet mnemonic (v2 format)
 * Compatible with Zap Cooking and similar
 */
export async function createBackupEvent(
  mnemonic: string,
  pubkey: string,
  signer: NostrSigner,
): Promise<NostrEvent> {
  logger.debug("[SparkBackup] Creating backup event (v2 format)...");

  // Encrypt the mnemonic directly (v2 format - just the encrypted mnemonic)
  const encryptedContent = await encryptMnemonic(mnemonic, pubkey, signer);
  logger.debug("[SparkBackup] Mnemonic encrypted with NIP-44");

  // Create unsigned event
  const unsignedEvent = {
    kind: BACKUP_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", BACKUP_D_TAG],
      ["title", "Spark Wallet Backup"],
      ["version", String(BACKUP_VERSION)],
      ["encryption", "nip44"],
    ],
    content: encryptedContent, // v2: Just the encrypted mnemonic, not JSON
  };

  // Sign the event
  const signedEvent = await signer.signEvent(unsignedEvent);
  logger.debug("[SparkBackup] Backup event created and signed");
  return signedEvent;
}

/**
 * Decrypt and extract mnemonic from a backup event
 * Supports v2 (plain mnemonic) and v1 (JSON with config) formats
 */
export async function decryptBackupEvent(
  event: NostrEvent,
  signer: NostrSigner,
): Promise<string | null> {
  // Verify this is a valid backup event
  if (event.kind !== BACKUP_KIND) {
    logger.warn("[SparkBackup] Event is not a backup event");
    return null;
  }

  const dTag = event.tags.find(([name]) => name === "d")?.[1];
  if (dTag !== BACKUP_D_TAG) {
    logger.warn("[SparkBackup] Event does not have correct d-tag");
    return null;
  }

  // Check if this is a deleted backup event
  const deletedTag = event.tags.find((t) => t[0] === "deleted");
  if (deletedTag && deletedTag[1] === "true") {
    logger.debug("[SparkBackup] Event is marked as deleted, skipping...");
    return null;
  }

  // Check if content is empty (deletion marker)
  if (!event.content || event.content.trim() === "") {
    logger.debug(
      "[SparkBackup] Event has empty content (deleted), skipping...",
    );
    return null;
  }

  // Detect version and encryption from tags
  const versionTag = event.tags.find((t) => t[0] === "version");
  const version = versionTag?.[1] || "1"; // Default to v1 for old backups
  const encryptionTag = event.tags.find((t) => t[0] === "encryption");
  const encryptionType = encryptionTag?.[1] || "nip44";

  logger.debug(
    `[SparkBackup] Detected version: ${version}, encryption: ${encryptionType}`,
  );

  if (encryptionType !== "nip44") {
    logger.warn("[SparkBackup] Unsupported encryption type:", encryptionType);
    return null;
  }

  try {
    // Decrypt the content
    const decrypted = await decryptMnemonic(
      event.content,
      event.pubkey,
      signer,
    );

    // v2 format: Plain mnemonic string
    const words = decrypted.trim().split(/\s+/);
    if (
      words.length >= 12 &&
      words.length <= 24 &&
      words.every((w) => /^[a-z]+$/.test(w))
    ) {
      logger.debug("[SparkBackup] Found v2 format backup (plain mnemonic)");
      return decrypted.trim();
    }

    // v1 format: JSON with config (legacy)
    try {
      const legacyData = JSON.parse(decrypted);
      if (legacyData.version && legacyData.mnemonic && legacyData.config) {
        logger.debug(
          "[SparkBackup] Found legacy v1 format backup (JSON with config)",
        );
        return legacyData.mnemonic;
      }
    } catch {
      // Not valid JSON, continue
    }

    logger.warn(
      "[SparkBackup] Invalid backup data - not v1, v2, or valid mnemonic format",
    );
    return null;
  } catch (error) {
    logger.error("[SparkBackup] Failed to decrypt backup:", error);
    return null;
  }
}

/**
 * Fetch backup from Nostr relays (including fallback relays)
 */
export async function fetchBackup(
  nostr: {
    query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    relay?: (url: string) => {
      query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    };
  },
  pubkey: string,
  signal?: AbortSignal,
): Promise<NostrEvent | null> {
  const result = await fetchBackupWithRelays(nostr, pubkey, signal);
  return result?.event ?? null;
}

/**
 * Fetch backup from Nostr relays with relay information
 */
export async function fetchBackupWithRelays(
  nostr: {
    query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    relay?: (url: string) => {
      query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    };
  },
  pubkey: string,
  signal?: AbortSignal,
): Promise<BackupFetchResult | null> {
  logger.debug("[SparkBackup] Fetching wallet backup from relays...");

  const relaysWithBackup: string[] = [];

  try {
    // First try the default relay pool
    const querySignal = signal ?? AbortSignal.timeout(5000);
    let events = await nostr.query(
      [
        {
          kinds: [BACKUP_KIND],
          authors: [pubkey],
          "#d": [BACKUP_D_TAG],
          limit: 5,
        },
      ],
      { signal: querySignal },
    );

    if (events.length > 0) {
      relaysWithBackup.push("default pool");
    }

    // Also check fallback relays
    if (nostr.relay) {
      if (events.length === 0) {
        logger.debug(
          "[SparkBackup] No backup found, trying fallback relays...",
        );
      }

      for (const relayUrl of FALLBACK_RELAY_URLS) {
        try {
          const relay = nostr.relay(relayUrl);
          const relayEvents = await relay.query(
            [
              {
                kinds: [BACKUP_KIND],
                authors: [pubkey],
                "#d": [BACKUP_D_TAG],
                limit: 1,
              },
            ],
            { signal: AbortSignal.timeout(5000) },
          );

          if (relayEvents.length > 0) {
            logger.debug(`[SparkBackup] Found backup on ${relayUrl}`);
            if (!relaysWithBackup.includes(relayUrl)) {
              relaysWithBackup.push(relayUrl);
            }
            events = [...events, ...relayEvents];
          }
        } catch (error) {
          logger.warn("[SparkBackup] Failed to query fallback relay:", error);
        }
      }
    }

    if (events.length === 0) {
      logger.debug("[SparkBackup] No backup found on relays");
      return null;
    }

    // Filter out deleted backups and get the most recent
    const validEvents = events.filter((e) => {
      const deletedTag = e.tags.find((t) => t[0] === "deleted");
      return !deletedTag && e.content && e.content.trim() !== "";
    });

    if (validEvents.length === 0) {
      logger.debug("[SparkBackup] All backups are deleted");
      return null;
    }

    // Return the most recent event
    const latest = validEvents.sort((a, b) => b.created_at - a.created_at)[0];
    logger.debug("[SparkBackup] Backup fetched successfully");
    return { event: latest, relays: relaysWithBackup };
  } catch (error) {
    logger.error("[SparkBackup] Failed to fetch backup:", error);
    return null;
  }
}

/**
 * Publish backup to Nostr relays
 */
export async function publishBackup(
  nostr: {
    event: (event: NostrEvent, options?: object) => Promise<void>;
    relay?: (url: string) => {
      event: (event: NostrEvent, options?: object) => Promise<void>;
    };
  },
  event: NostrEvent,
): Promise<void> {
  logger.debug("[SparkBackup] Publishing wallet backup to relays...");

  let successCount = 0;
  const errors: string[] = [];

  // Publish to default relay pool
  try {
    await nostr.event(event);
    successCount++;
    logger.debug("[SparkBackup] Published to default relay pool");
  } catch (error) {
    logger.warn("[SparkBackup] Failed to publish to default pool:", error);
    errors.push(`Default pool: ${error}`);
  }

  // Also publish to fallback relays for redundancy
  if (nostr.relay) {
    for (const relayUrl of FALLBACK_RELAY_URLS) {
      try {
        const relay = nostr.relay(relayUrl);
        await relay.event(event);
        successCount++;
        logger.debug("[SparkBackup] Published to fallback relay");
      } catch (error) {
        logger.warn(
          "[SparkBackup] Failed to publish to fallback relay:",
          error,
        );
        errors.push(`Fallback relay: ${error}`);
      }
    }
  }

  if (successCount === 0) {
    throw new Error(
      `Failed to publish backup to any relay. Errors: ${errors.slice(0, 3).join("; ")}`,
    );
  }

  logger.debug(`[SparkBackup] Backup published to ${successCount} relay(s)`);
}

/**
 * Delete backup from relays by publishing an empty replacement
 * (NIP-78 addressable events can be "deleted" by publishing a new version)
 */
export async function deleteBackup(
  nostr: {
    event: (event: NostrEvent, options?: object) => Promise<void>;
    relay?: (url: string) => {
      event: (event: NostrEvent, options?: object) => Promise<void>;
    };
  },
  pubkey: string,
  signer: NostrSigner,
): Promise<void> {
  logger.debug("[SparkBackup] Deleting wallet backup from relays...");

  // Create an "empty" backup event that replaces the existing one
  const unsignedEvent = {
    kind: BACKUP_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", BACKUP_D_TAG],
      ["deleted", "true"],
    ],
    content: "",
  };

  const signedEvent = await signer.signEvent(unsignedEvent);

  let successCount = 0;

  // Publish to default relay pool
  try {
    await nostr.event(signedEvent);
    successCount++;
  } catch (error) {
    logger.warn("[SparkBackup] Failed to delete from default pool:", error);
  }

  // Also publish to fallback relays
  if (nostr.relay) {
    for (const relayUrl of FALLBACK_RELAY_URLS) {
      try {
        const relay = nostr.relay(relayUrl);
        await relay.event(signedEvent);
        successCount++;
      } catch (error) {
        logger.warn(
          "[SparkBackup] Failed to delete from fallback relay:",
          error,
        );
      }
    }
  }

  logger.debug(
    `[SparkBackup] Deletion event published to ${successCount} relay(s)`,
  );
}

/**
 * Export backup to a downloadable JSON file
 * Returns a Blob that can be downloaded
 * Format is compatible with zapcooking and sparkihonne
 */
export async function exportToFile(
  mnemonic: string,
  pubkey: string,
  signer: NostrSigner,
): Promise<Blob> {
  const encryptedMnemonic = await encryptMnemonic(mnemonic, pubkey, signer);

  const backupData: SparkBackupData = {
    version: BACKUP_VERSION,
    type: "spark-wallet-backup",
    encryption: "nip44",
    pubkey,
    encryptedMnemonic,
    createdAt: Date.now(), // milliseconds like zapcooking/sparkihonne
    createdBy: "pathos",
  };

  const json = JSON.stringify(backupData, null, 2);
  return new Blob([json], { type: "application/json" });
}

/**
 * Import backup from a JSON file
 * Returns the decrypted mnemonic
 * Supports both new format (zapcooking/sparkihonne) and legacy pathos format
 */
export async function importFromFile(
  file: File,
  pubkey: string,
  signer: NostrSigner,
): Promise<string> {
  const text = await file.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let backupData: any;
  try {
    backupData = JSON.parse(text);
  } catch {
    throw new Error("Invalid backup file format");
  }

  // Validate type field if present
  if (backupData.type && backupData.type !== "spark-wallet-backup") {
    throw new Error("Invalid backup type");
  }

  // Support both v1 and v2 backups
  if (backupData.version !== 1 && backupData.version !== 2) {
    throw new Error(`Unsupported backup version: ${backupData.version}`);
  }

  // Support both field names: new format (encryptedMnemonic) and old pathos format (content)
  const encryptedContent = backupData.encryptedMnemonic || backupData.content;
  if (!encryptedContent) {
    throw new Error("Backup file is empty or corrupted");
  }

  // Check pubkey matches if present (NIP-44 will fail anyway if wrong key)
  if (backupData.pubkey && backupData.pubkey !== pubkey) {
    throw new Error("This backup belongs to a different Nostr account");
  }

  // Determine encryption method (default nip44 for v2)
  const encryption = backupData.encryption || "nip44";
  if (encryption !== "nip44") {
    throw new Error("Only NIP-44 encrypted backups are supported");
  }

  // Decrypt the mnemonic
  const mnemonic = await decryptMnemonic(encryptedContent, pubkey, signer);
  return mnemonic;
}

/**
 * Trigger a file download in the browser
 */
export function downloadBackupFile(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Use YYYY-MM-DD format like zapcooking/sparkihonne
  const date = new Date().toISOString().split("T")[0];
  a.download = filename ?? `spark-wallet-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Check if a backup exists on relays and get info about it
 */
export async function checkRelayBackupInfo(
  nostr: {
    query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    relay?: (url: string) => {
      query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    };
  },
  pubkey: string,
  signal?: AbortSignal,
): Promise<BackupInfo> {
  const result = await fetchBackupWithRelays(nostr, pubkey, signal);
  if (!result) {
    return { exists: false, timestamp: null, relays: [] };
  }
  return {
    exists: true,
    timestamp: result.event.created_at,
    relays: result.relays,
  };
}

/**
 * Check if a backup exists on relays
 */
export async function hasRelayBackup(
  nostr: {
    query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    relay?: (url: string) => {
      query: (filters: object[], options?: object) => Promise<NostrEvent[]>;
    };
  },
  pubkey: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const info = await checkRelayBackupInfo(nostr, pubkey, signal);
  return info.exists;
}
