import { nip57, type Event } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import type { NostrSigner } from '@nostrify/types';

interface CreateZapInvoiceArgs {
  /** Recipient profile event (kind 0), used to resolve the LNURL zap endpoint. */
  recipientEvent: NostrEvent;
  /** Recipient pubkey being zapped. */
  recipientPubkey: string;
  /** Optional event target. Omit for profile zaps. */
  target?: Event;
  /** Amount in sats. */
  amountSats: number;
  /** User comment to include in the zap request. */
  comment: string;
  /** Relays to include in the zap request. */
  relays: string[];
  /** Signer for the zap request. */
  signer: NostrSigner;
  /** Extra tags to append before signing, e.g. community A/K context. */
  extraTags?: string[][];
}

function parseZapCallbackResponse(text: string): { pr?: string; reason?: string } {
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    return {
      pr: typeof record.pr === 'string' ? record.pr : undefined,
      reason: typeof record.reason === 'string' ? record.reason : undefined,
    };
  } catch (error) {
    // Some LNURL providers return plain text/html for server errors.
    console.warn('Failed to parse zap callback response as JSON', error);
    return {};
  }
}

/**
 * Create a BOLT11 invoice for a NIP-57 zap.
 *
 * This signs the zap request locally, sends it to the recipient's LNURL zap
 * endpoint, and returns the invoice. The caller owns payment.
 */
export async function createZapInvoice({
  recipientEvent,
  recipientPubkey,
  target,
  amountSats,
  comment,
  relays,
  signer,
  extraTags = [],
}: CreateZapInvoiceArgs): Promise<string> {
  if (!Number.isFinite(amountSats) || amountSats <= 0) {
    throw new Error('Invalid zap amount.');
  }

  const zapEndpoint = await nip57.getZapEndpoint(recipientEvent);
  if (!zapEndpoint) {
    throw new Error('Could not find a zap endpoint for this user.');
  }

  const event = target
    ? target.kind >= 30000 && target.kind < 40000
      ? target
      : target.id
    : null;
  const zapAmount = amountSats * 1000;

  const zapRequest = nip57.makeZapRequest({
    profile: recipientPubkey,
    event,
    amount: zapAmount,
    relays,
    comment,
  });

  if (extraTags.length > 0) {
    zapRequest.tags.push(...extraTags);
  }

  const signedZapRequest = await signer.signEvent(zapRequest);
  const zapUrl = new URL(zapEndpoint);
  zapUrl.searchParams.set('amount', String(zapAmount));
  zapUrl.searchParams.set('nostr', JSON.stringify(signedZapRequest));

  const res = await fetch(zapUrl.toString());
  const responseText = await res.text();
  const responseData = parseZapCallbackResponse(responseText);

  if (!res.ok) {
    const fallbackReason = responseText.trim() || 'Unknown error';
    throw new Error(`HTTP ${res.status}: ${responseData.reason || fallbackReason}`);
  }

  if (!responseData.pr) {
    throw new Error('Lightning service did not return a valid invoice.');
  }

  return responseData.pr;
}
